import express from "express";
import mongoose from "mongoose";
import { requireAuth } from "../middleware/auth.js";
import { generate } from "../services/llm.js";
import { getToolsForUser, executeTool } from "../services/assistantTools.js";
import {
  getPendingAction,
  removePendingAction,
} from "../services/pendingActions.js";
import Order from "../models/Order.js";
import Payment from "../models/Payment.js";

const router = express.Router();

// All assistant routes require authentication
router.use(requireAuth);

const userRateLimits = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 25; // 25 requests per minute

const checkRateLimit = (userId) => {
  const now = Date.now();
  const entry = userRateLimits.get(userId) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
  if (now > entry.resetAt) {
    entry.count = 1;
    entry.resetAt = now + RATE_LIMIT_WINDOW_MS;
    userRateLimits.set(userId, entry);
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }
  entry.count += 1;
  userRateLimits.set(userId, entry);
  return true;
};

const SYSTEM_PROMPT = `You are an intelligent, concise, and friendly AI Warehouse Assistant for Denika & Team Solutions.
Your role is to help warehouse staff and administrators monitor inventory, check order fulfillment, inspect payment statuses, review reorder suggestions, and record payments (for administrators).

Strict Operating Guidelines:
1. Grounding: Answer strictly using facts returned from your tool results. Never invent product names, stock quantities, or financial details.
2. Clarification: If a user's query is ambiguous (e.g. "order 12" when multiple exist or "drill" when multiple SKUs match), ask a brief clarifying question or list the matches.
3. Currency: Always format Indian Rupees as ₹ (e.g., ₹2,500).
4. Tone & Brevity: Keep answers concise, actionable, and friendly. Avoid fluffy filler. Use clean bullet points for lists.
5. Actions & Security: You can view live warehouse data anytime. You can record payments ONLY when requested by an administrator; when you initiate a payment, explain that a confirmation card has been generated and the payment will only take effect once they click Confirm.`;

// POST /api/assistant/chat
router.post("/chat", async (req, res) => {
  try {
    const userId = String(req.user._id);
    if (!checkRateLimit(userId)) {
      return res.status(429).json({
        success: false,
        message: "You have exceeded the chat rate limit (max 25 requests/min). Please wait a moment.",
      });
    }

    const { messages } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Request must include an array of messages.",
      });
    }

    // Trim history to last 10 messages & cap length of each message to 1000 characters
    const trimmedMessages = messages.slice(-10).map((m) => ({
      role: m.role === "assistant" || m.role === "model" ? "assistant" : "user",
      content: String(m.content || "").slice(0, 1000),
    }));

    const tools = getToolsForUser(req.user.role);
    let workingMessages = [...trimmedMessages];
    let pendingAction = null;
    let finalReply = "";
    let rounds = 0;
    const MAX_ROUNDS = 5;

    while (rounds < MAX_ROUNDS) {
      rounds += 1;
      const llmResult = await generate({
        systemPrompt: SYSTEM_PROMPT,
        messages: workingMessages,
        tools,
      });

      const functionCalls = llmResult.functionCalls || [];

      if (!functionCalls.length) {
        finalReply = llmResult.text;
        break;
      }

      // Record the assistant's turn with tool calls and full raw content (for thought signatures)
      workingMessages.push({
        role: "assistant",
        content: llmResult.text || "",
        functionCalls,
        rawContent: llmResult.rawContent,
      });

      // Execute each tool and collect responses
      const toolResponses = [];
      for (const call of functionCalls) {
        let toolOutput;
        try {
          toolOutput = await executeTool(call.name, call.args, req.user);
          if (toolOutput?.status === "PENDING_CONFIRMATION" && toolOutput.pendingActionId) {
            const stagedAction = getPendingAction(toolOutput.pendingActionId);
            if (stagedAction) {
              pendingAction = stagedAction;
            }
          }
        } catch (err) {
          toolOutput = { error: `Failed to execute ${call.name}: ${err.message}` };
        }

        toolResponses.push({
          name: call.name,
          output: toolOutput,
        });
      }

      workingMessages.push({
        role: "tool_response",
        toolResponses,
      });
    }

    if (!finalReply) {
      finalReply = "I have processed your request. Please review the details.";
    }

    return res.json({
      success: true,
      reply: finalReply,
      pendingAction: pendingAction
        ? {
            id: pendingAction.id,
            tool: pendingAction.tool,
            summary: pendingAction.summary,
            expiresAt: pendingAction.expiresAt,
          }
        : null,
    });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({
      success: false,
      message: error.message || "An error occurred in the warehouse assistant.",
    });
  }
});

// POST /api/assistant/confirm
router.post("/confirm", async (req, res) => {
  const { actionId } = req.body;
  if (!actionId) {
    return res.status(400).json({ success: false, message: "actionId is required." });
  }

  const action = getPendingAction(actionId);
  if (!action) {
    return res.status(400).json({
      success: false,
      message: "Action has expired (5-minute limit) or does not exist.",
    });
  }

  // Ensure action can only be confirmed by the user who created it
  if (action.userId !== String(req.user._id)) {
    return res.status(403).json({
      success: false,
      message: "Unauthorized: A pending action can only be confirmed by the user who created it.",
    });
  }

  // Role validation
  if (action.tool === "recordPayment" && req.user.role !== "ADMIN") {
    return res.status(403).json({
      success: false,
      message: "Unauthorized: Only administrators can confirm payments.",
    });
  }

  if (action.tool === "recordPayment") {
    const session = await mongoose.startSession();
    try {
      let createdPayment;
      await session.withTransaction(async () => {
        const order = await Order.findById(action.args.orderId).session(session);
        if (!order) throw new Error("Order not found");
        if (["DISPATCHED", "CANCELLED"].includes(order.status)) {
          throw new Error(`Payments cannot be recorded for ${order.status} orders.`);
        }

        const paymentAmount = Number(action.args.amount);
        if (order.totalPaid + paymentAmount > order.totalAmount) {
          throw new Error("Payment exceeds remaining order balance.");
        }

        const paymentData = {
          order: order._id,
          amount: paymentAmount,
          method: action.args.method || "UPI",
          paymentType: action.args.type || "PARTIAL",
          notes: action.args.notes || "Recorded via AI Assistant",
        };

        const [payment] = await Payment.create([paymentData], { session });
        order.totalPaid += paymentAmount;
        order.advanceAmount = Math.min(order.advanceRequired, order.totalPaid);
        if (order.status === "PROCESSING" && order.totalPaid >= order.advanceRequired) {
          order.status = "ADVANCE_RECEIVED";
        }
        await order.save({ session });
        createdPayment = payment;
      });

      // Remove from pending actions once confirmed and executed
      removePendingAction(actionId);

      return res.json({
        success: true,
        message: `Payment of ₹${action.args.amount.toLocaleString("en-IN")} recorded successfully for Order #${action.metadata.orderNumber || ""}.`,
        payment: createdPayment,
      });
    } catch (err) {
      return res.status(400).json({ success: false, message: err.message });
    } finally {
      await session.endSession();
    }
  }

  return res.status(400).json({ success: false, message: "Unknown action tool." });
});

// POST /api/assistant/cancel
router.post("/cancel", async (req, res) => {
  const { actionId } = req.body;
  if (!actionId) {
    return res.status(400).json({ success: false, message: "actionId is required." });
  }

  const action = getPendingAction(actionId);
  if (!action) {
    return res.status(400).json({
      success: false,
      message: "Action has already expired or does not exist.",
    });
  }

  if (action.userId !== String(req.user._id)) {
    return res.status(403).json({
      success: false,
      message: "Unauthorized: A pending action can only be cancelled by the user who created it.",
    });
  }

  removePendingAction(actionId);
  return res.json({ success: true, message: "Pending action was cancelled." });
});

export default router;
