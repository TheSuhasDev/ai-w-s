import mongoose from "mongoose";
import Product from "../models/Product.js";
import Order from "../models/Order.js";
import StockMovement from "../models/StockMovement.js";
import { createPendingAction } from "./pendingActions.js";

/**
 * Tool definitions conforming to Gemini / OpenAPI Schema specifications
 */
export const READ_TOOL_DECLARATIONS = [
  {
    name: "getStock",
    description: "Check current real-time stock on hand, price, minimum storage buffer, and bay location for a specific product by name.",
    parameters: {
      type: "OBJECT",
      properties: {
        productName: {
          type: "STRING",
          description: "Name of the product (e.g. 'Hammer', 'Cordless Drill', 'Pliers')",
        },
      },
      required: ["productName"],
    },
  },
  {
    name: "listLowStock",
    description: "List all tools and products currently at or below their safety minimum stock threshold that need replenishment.",
    parameters: {
      type: "OBJECT",
      properties: {},
    },
  },
  {
    name: "getReorderSuggestions",
    description: "Retrieve automated 30-day stock burn-rate intelligence and replenishment suggestions (critical and warning items).",
    parameters: {
      type: "OBJECT",
      properties: {
        days: {
          type: "INTEGER",
          description: "Rolling analysis window in days (default: 30)",
        },
      },
    },
  },
  {
    name: "getOrderStatus",
    description: "Look up order progress, client info, order items, payment status, and balance due by order number or client name.",
    parameters: {
      type: "OBJECT",
      properties: {
        query: {
          type: "STRING",
          description: "Order number (e.g. 'ORD-1792167157615-4408') or client name to search for",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "listOverduePayments",
    description: "List PACKED orders that have an outstanding pending balance beyond the 3-day grace period.",
    parameters: {
      type: "OBJECT",
      properties: {},
    },
  },
  {
    name: "getDispatchSummary",
    description: "Get summary metrics of stock dispatched, completed orders, and movement counts over the last N days (default: 7).",
    parameters: {
      type: "OBJECT",
      properties: {
        days: {
          type: "INTEGER",
          description: "Number of rolling days to summarize (default: 7)",
        },
      },
    },
  },
  {
    name: "searchProducts",
    description: "Search products in the catalog by name, SKU, or bay storage location.",
    parameters: {
      type: "OBJECT",
      properties: {
        query: {
          type: "STRING",
          description: "Search keyword for tool name, SKU or location",
        },
      },
      required: ["query"],
    },
  },
];

export const ACTION_TOOL_DECLARATIONS = [
  {
    name: "recordPayment",
    description: "Record an inward commercial payment against an order. Creates a pending action that requires administrator confirmation.",
    parameters: {
      type: "OBJECT",
      properties: {
        orderId: {
          type: "STRING",
          description: "The order ID or order number (e.g. 'ORD-1234')",
        },
        amount: {
          type: "NUMBER",
          description: "Payment amount in INR (must be positive)",
        },
        method: {
          type: "STRING",
          description: "Payment method: 'UPI', 'CASH', 'CARD', 'BANK_TRANSFER', or 'OTHER' (default: 'UPI')",
        },
        type: {
          type: "STRING",
          description: "Payment type: 'ADVANCE', 'PARTIAL', or 'FULL' (default: 'PARTIAL')",
        },
        notes: {
          type: "STRING",
          description: "Optional reference note for the payment receipt",
        },
      },
      required: ["orderId", "amount"],
    },
  },
];

/**
 * Returns available tool declarations based on user role
 */
export const getToolsForUser = (userRole) => {
  if (userRole === "ADMIN") {
    return [...READ_TOOL_DECLARATIONS, ...ACTION_TOOL_DECLARATIONS];
  }
  return [...READ_TOOL_DECLARATIONS];
};

/**
 * Executes a tool call against the live database
 */
export const executeTool = async (name, args = {}, user) => {
  const cleanName = (name || "").replace(/^[a-zA-Z0-9_]+:/, "");
  switch (cleanName) {
    case "getStock": {
      const q = String(args.productName || "").trim();
      if (!q) return { found: false, message: "Please specify a product name." };

      const product = await Product.findOne({
        name: { $regex: new RegExp(q, "i") },
      });

      if (!product) {
        const matches = await Product.find({
          $or: [
            { name: { $regex: new RegExp(q.split(" ")[0], "i") } },
            { sku: { $regex: new RegExp(q, "i") } },
          ],
        }).limit(5);

        if (matches.length > 0) {
          return {
            found: false,
            message: `Product '${q}' not found. Did you mean one of these: ${matches.map((m) => m.name).join(", ")}?`,
          };
        }
        return { found: false, message: `No product found matching '${q}'.` };
      }

      return {
        found: true,
        name: product.name,
        sku: product.sku,
        stock: product.stock,
        minimumStock: product.minimumStock,
        sellingPriceINR: product.sellingPrice,
        location: product.location || "Bay General",
        isLowStock: product.stock <= product.minimumStock,
      };
    }

    case "listLowStock": {
      const products = await Product.find({
        $expr: { $lte: ["$stock", "$minimumStock"] },
      }).sort({ stock: 1 });

      return {
        count: products.length,
        items: products.map((p) => ({
          name: p.name,
          sku: p.sku,
          stock: p.stock,
          minimumStock: p.minimumStock,
          deficit: Math.max(0, p.minimumStock - p.stock),
          location: p.location || "Bay General",
        })),
      };
    }

    case "getReorderSuggestions": {
      const days = Number(args.days) || 30;
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const dispatches = await StockMovement.aggregate([
        { $match: { type: "DISPATCH", createdAt: { $gte: since } } },
        { $group: { _id: "$product", totalDispatched: { $sum: "$quantity" } } },
      ]);

      const dispatchMap = new Map(
        dispatches.map((d) => [String(d._id), d.totalDispatched])
      );

      const products = await Product.find().lean();
      const suggestions = products
        .map((p) => {
          const totalDispatched = dispatchMap.get(String(p._id)) || 0;
          const avgDailyUsage = Math.round((totalDispatched / days) * 10) / 10;
          const daysLeft =
            avgDailyUsage > 0 ? Math.round((p.stock / avgDailyUsage) * 10) / 10 : null;
          const suggestedReorder = Math.max(
            0,
            Math.ceil(avgDailyUsage * 30) + p.minimumStock - p.stock
          );

          let urgency = "OK";
          if (p.stock <= p.minimumStock || (daysLeft !== null && daysLeft <= 3)) {
            urgency = "CRITICAL";
          } else if (daysLeft !== null && daysLeft <= 7) {
            urgency = "WARNING";
          } else if (totalDispatched === 0) {
            urgency = "NO_DATA";
          }

          return {
            name: p.name,
            sku: p.sku,
            stock: p.stock,
            minimumStock: p.minimumStock,
            avgDailyUsage,
            daysLeft,
            suggestedReorder,
            urgency,
          };
        })
        .filter((s) => s.urgency === "CRITICAL" || s.urgency === "WARNING")
        .sort((a, b) => (a.daysLeft ?? 999) - (b.daysLeft ?? 999));

      return {
        analysisWindowDays: days,
        itemsNeedingReorder: suggestions,
      };
    }

    case "getOrderStatus": {
      const q = String(args.query || "").trim();
      if (!q) return { found: false, message: "Please provide an order number or client name." };

      const isMongoId = mongoose.isValidObjectId(q);
      const orders = await Order.find({
        $or: [
          ...(isMongoId ? [{ _id: q }] : []),
          { orderNumber: { $regex: new RegExp(q, "i") } },
          { "client.name": { $regex: new RegExp(q, "i") } },
        ],
      })
        .sort({ createdAt: -1 })
        .limit(5);

      if (!orders.length) {
        return { found: false, message: `No orders found matching '${q}'.` };
      }

      return {
        found: true,
        count: orders.length,
        orders: orders.map((o) => ({
          orderId: o._id,
          orderNumber: o.orderNumber,
          client: o.client.name,
          phone: o.client.phone,
          status: o.status,
          paymentStatus: o.paymentStatus,
          totalAmountINR: o.totalAmount,
          totalPaidINR: o.totalPaid,
          balanceAmountINR: o.balanceAmount,
          advanceRequiredINR: o.advanceRequired,
          items: o.items.map((i) => `${i.name} (qty: ${i.quantity})`),
          packedAt: o.packedAt || null,
        })),
      };
    }

    case "listOverduePayments": {
      const thresholdDays = Number(process.env.REMINDER_AFTER_DAYS) || 3;
      const cutoffDate = new Date(Date.now() - thresholdDays * 24 * 60 * 60 * 1000);

      const orders = await Order.find({
        status: "PACKED",
        balanceAmount: { $gt: 0 },
        $or: [
          { packedAt: { $lte: cutoffDate } },
          { packedAt: { $exists: false }, updatedAt: { $lte: cutoffDate } },
        ],
      }).sort({ packedAt: 1, createdAt: 1 });

      return {
        thresholdDays,
        overdueCount: orders.length,
        orders: orders.map((o) => {
          const effectiveDate = o.packedAt || o.updatedAt || o.createdAt;
          const daysPending = Math.max(
            0,
            Math.floor((Date.now() - new Date(effectiveDate).getTime()) / (24 * 60 * 60 * 1000))
          );
          return {
            orderId: o._id,
            orderNumber: o.orderNumber,
            clientName: o.client.name,
            phone: o.client.phone,
            balanceAmountINR: o.balanceAmount,
            totalAmountINR: o.totalAmount,
            daysPending,
            lastReminderAt: o.lastReminderAt || null,
          };
        }),
      };
    }

    case "getDispatchSummary": {
      const days = Math.min(90, Math.max(1, Number(args.days) || 7));
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const movements = await StockMovement.find({
        type: "DISPATCH",
        createdAt: { $gte: since },
      });

      const totalUnits = movements.reduce((sum, m) => sum + m.quantity, 0);
      const dispatchedOrdersCount = await Order.countDocuments({
        status: "DISPATCHED",
        dispatchedAt: { $gte: since },
      });

      return {
        periodDays: days,
        dispatchesLogged: movements.length,
        totalUnitsDispatched: totalUnits,
        dispatchedOrdersCompleted: dispatchedOrdersCount,
      };
    }

    case "searchProducts": {
      const q = String(args.query || "").trim();
      const products = await Product.find({
        $or: [
          { name: { $regex: new RegExp(q, "i") } },
          { sku: { $regex: new RegExp(q, "i") } },
          { location: { $regex: new RegExp(q, "i") } },
        ],
      }).limit(8);

      return {
        count: products.length,
        products: products.map((p) => ({
          name: p.name,
          sku: p.sku,
          stock: p.stock,
          minimumStock: p.minimumStock,
          sellingPriceINR: p.sellingPrice,
          location: p.location || "Bay General",
        })),
      };
    }

    case "recordPayment": {
      if (user.role !== "ADMIN") {
        return {
          error: "Unauthorized: Only administrators are permitted to record commercial payments.",
        };
      }

      const orderLookup = String(args.orderId || "").trim();
      const isMongoId = mongoose.isValidObjectId(orderLookup);
      const order = await Order.findOne({
        $or: [
          ...(isMongoId ? [{ _id: orderLookup }] : []),
          { orderNumber: orderLookup },
        ],
      });

      if (!order) {
        return { error: `Order '${orderLookup}' was not found in the database.` };
      }

      if (["DISPATCHED", "CANCELLED"].includes(order.status)) {
        return { error: `Payments cannot be recorded for ${order.status} orders.` };
      }

      const amount = Number(args.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return { error: "Payment amount must be a positive number greater than 0." };
      }

      if (order.totalPaid + amount > order.totalAmount) {
        return {
          error: `Payment of ₹${amount} exceeds the remaining order balance of ₹${order.balanceAmount}.`,
        };
      }

      const method = ["CASH", "CARD", "UPI", "BANK_TRANSFER", "OTHER"].includes(args.method)
        ? args.method
        : "UPI";
      const type = ["ADVANCE", "FULL", "PARTIAL"].includes(args.type)
        ? args.type
        : "PARTIAL";
      const notes = args.notes || "Recorded via AI Assistant";

      const newBalance = Math.max(0, order.balanceAmount - amount);
      const summary = `Record payment of ₹${amount.toLocaleString("en-IN")} via ${method} (${type}) for Order #${order.orderNumber} (${order.client?.name}). Remaining balance will be ₹${newBalance.toLocaleString("en-IN")}.`;

      const pendingAction = createPendingAction({
        userId: user._id,
        tool: "recordPayment",
        args: {
          orderId: String(order._id),
          amount,
          method,
          type,
          notes,
        },
        summary,
        metadata: {
          orderNumber: order.orderNumber,
          clientName: order.client?.name,
          currentBalance: order.balanceAmount,
          newBalance,
          amount,
        },
      });

      return {
        status: "PENDING_CONFIRMATION",
        pendingActionId: pendingAction.id,
        summary: pendingAction.summary,
        notice: "The payment has been staged. Please present the confirmation card to the administrator.",
      };
    }

    default:
      return { error: `Unknown tool '${name}' requested.` };
  }
};
