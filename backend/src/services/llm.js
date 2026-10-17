import { GoogleGenAI } from "@google/genai";

let cachedClient = null;

/**
 * Gets or initializes the Google GenAI client
 */
const getClient = () => {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === "your_gemini_api_key_here") {
    const error = new Error(
      "Gemini API key is not configured. Please add GEMINI_API_KEY to your backend .env file (get a free key at aistudio.google.com)."
    );
    error.status = 503;
    error.code = "API_KEY_MISSING";
    throw error;
  }
  if (!cachedClient || cachedClient.apiKey !== apiKey) {
    cachedClient = new GoogleGenAI({ apiKey });
  }
  return cachedClient;
};

/**
 * Formats standardized messages into Gemini contents format
 */
const formatContents = (messages = []) => {
  const contents = [];

  for (const msg of messages) {
    if (msg.role === "user") {
      contents.push({
        role: "user",
        parts: [{ text: String(msg.content || "") }],
      });
    } else if (msg.role === "assistant" || msg.role === "model") {
      if (msg.rawContent) {
        // Use the exact Content object returned by Gemini (preserves thought signatures, parts, and IDs)
        contents.push(msg.rawContent);
      } else {
        const parts = [];
        if (msg.content) {
          parts.push({ text: String(msg.content) });
        }
        if (Array.isArray(msg.functionCalls)) {
          for (const call of msg.functionCalls) {
            const part = {
              functionCall: {
                name: call.name,
                args: call.args || {},
              },
            };
            if (call.id) part.functionCall.id = call.id;
            if (call.thoughtSignature) part.thoughtSignature = call.thoughtSignature;
            parts.push(part);
          }
        }
        contents.push({
          role: "model",
          parts: parts.length > 0 ? parts : [{ text: "" }],
        });
      }
    } else if (msg.role === "tool_response" || msg.role === "tool" || msg.role === "function") {
      const responses = Array.isArray(msg.toolResponses)
        ? msg.toolResponses
        : [{ name: msg.name, output: msg.content }];

      const parts = responses.map((r) => ({
        functionResponse: {
          name: r.name,
          response: {
            output: typeof r.output === "object" && r.output !== null ? r.output : { result: r.output },
          },
        },
      }));

      // In Gemini API, all functionResponses for the preceding model turn must reside in a single user turn
      const lastContent = contents[contents.length - 1];
      if (lastContent && lastContent.role === "user") {
        lastContent.parts.push(...parts);
      } else {
        contents.push({
          role: "user",
          parts,
        });
      }
    }
  }

  return contents;
};

/**
 * Single provider interface for generating assistant completions
 * Can be swapped for Groq or other providers in the future.
 */
export const generate = async ({ systemPrompt, messages = [], tools = [] }) => {
  const ai = getClient();
  const model = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";

  const contents = formatContents(messages);

  const config = {};
  if (systemPrompt) {
    config.systemInstruction = systemPrompt;
  }
  if (Array.isArray(tools) && tools.length > 0) {
    config.tools = [
      {
        functionDeclarations: tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        })),
      },
    ];
  }

  try {
    const response = await ai.models.generateContent({
      model,
      contents,
      config,
    });

    const candidate = response.candidates?.[0];
    const candidateParts = candidate?.content?.parts || [];

    // Safely extract text parts without triggering the SDK's warning on functionCall responses
    const textParts = candidateParts
      .filter((p) => typeof p.text === "string" && !p.thought)
      .map((p) => p.text);
    const text = textParts.join("") || "";

    // Extract function calls with their metadata (id, thoughtSignature) preserved
    const functionCalls = [];
    for (const part of candidateParts) {
      if (part.functionCall) {
        functionCalls.push({
          name: part.functionCall.name,
          args: part.functionCall.args || {},
          id: part.functionCall.id,
          thoughtSignature: part.thoughtSignature || part.functionCall.thoughtSignature,
        });
      }
    }

    return {
      text,
      functionCalls,
      rawContent: candidate?.content,
    };
  } catch (error) {
    // Log technical detail server-side only
    console.error("[LLM Service Error]:", error?.message || error);

    const errStatus = error.status || error.statusCode || 500;
    const errMessage = String(error.message || "");

    if (
      errStatus === 429 ||
      errMessage.includes("429") ||
      errMessage.toLowerCase().includes("quota") ||
      errMessage.toLowerCase().includes("resource_exhausted")
    ) {
      const friendlyError = new Error(
        "Gemini API quota exceeded (free tier rate limit reached). Please wait a moment before trying again."
      );
      friendlyError.status = 429;
      throw friendlyError;
    }

    if (
      errStatus === 400 &&
      (errMessage.includes("API key not valid") || errMessage.includes("API_KEY_INVALID"))
    ) {
      const friendlyError = new Error(
        "Invalid Gemini API key. Please check your GEMINI_API_KEY in backend .env."
      );
      friendlyError.status = 401;
      throw friendlyError;
    }

    if (error.name === "AbortError" || errMessage.toLowerCase().includes("timeout")) {
      const friendlyError = new Error(
        "The AI assistant service timed out. Please try your question again."
      );
      friendlyError.status = 504;
      throw friendlyError;
    }

    const friendlyError = new Error(
      "The assistant encountered an issue contacting the AI service. Please try again in a few moments."
    );
    friendlyError.status = errStatus >= 400 && errStatus < 600 ? errStatus : 500;
    throw friendlyError;
  }
};
