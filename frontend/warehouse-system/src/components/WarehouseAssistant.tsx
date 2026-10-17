import React, { useState, useEffect, useRef } from "react";
import {
  IconSparkles,
  IconX,
  IconSend,
  IconMicrophone,
  IconMicrophoneOff,
  IconTrash,
  IconCheck,
  IconAlertTriangle,
  IconShieldCheck,
  IconRefresh,
  IconRobot,
} from "@tabler/icons-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

interface PendingActionData {
  id: string;
  tool: string;
  summary: string;
  expiresAt: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  pendingAction?: PendingActionData | null;
  actionResult?: {
    status: "confirmed" | "cancelled" | "error";
    message: string;
  };
  timestamp: Date;
}

const SUGGESTION_CHIPS = [
  "Which items are low on stock?",
  "Any overdue payments?",
  "How many hammers do we have?",
  "What should I reorder?",
];

// Lightweight markdown-like text formatter for bold, code, bullets, and linebreaks
function FormattedAssistantText({ content }: { content: string }) {
  const paragraphs = content.split(/\n\n+/);

  return (
    <div className="space-y-2 text-sm leading-relaxed">
      {paragraphs.map((p, pIdx) => {
        const lines = p.split("\n");
        const isList = lines.every((line) => line.trim().startsWith("- ") || line.trim().startsWith("* ") || /^\d+\.\s/.test(line.trim()));

        if (isList) {
          return (
            <ul key={pIdx} className="space-y-1 list-disc list-inside text-slate-300">
              {lines.map((line, lIdx) => {
                const clean = line.trim().replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, "");
                return (
                  <li key={lIdx} className="text-slate-200">
                    {renderInline(clean)}
                  </li>
                );
              })}
            </ul>
          );
        }

        return (
          <p key={pIdx} className="text-slate-200">
            {lines.map((line, lIdx) => (
              <React.Fragment key={lIdx}>
                {lIdx > 0 && <br />}
                {renderInline(line)}
              </React.Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

function renderInline(text: string): React.ReactNode {
  // Replace **bold** with <strong> and `code` with <code>
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith("**") && token.endsWith("**")) {
      parts.push(
        <strong key={match.index} className="font-semibold text-white">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith("`") && token.endsWith("`")) {
      parts.push(
        <code
          key={match.index}
          className="rounded bg-slate-800 px-1 py-0.5 font-mono text-xs text-indigo-300"
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}

export function WarehouseAssistant() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Speech Recognition state
  const [isListening, setIsListening] = useState(false);
  const [isSpeechSupported, setIsSpeechSupported] = useState(false);
  const recognitionRef = useRef<any>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Check speech recognition support
  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition =
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition;

      if (SpeechRecognition) {
        setIsSpeechSupported(true);
        try {
          const recognition = new SpeechRecognition();
          recognition.continuous = false;
          recognition.interimResults = false;
          recognition.lang = "en-IN";

          recognition.onresult = (event: any) => {
            const transcript = event.results[0][0].transcript;
            if (transcript) {
              setInputValue((prev) => (prev ? `${prev} ${transcript}` : transcript));
            }
          };

          recognition.onerror = () => {
            setIsListening(false);
          };

          recognition.onend = () => {
            setIsListening(false);
          };

          recognitionRef.current = recognition;
        } catch {
          setIsSpeechSupported(false);
        }
      }
    }
  }, []);

  const toggleListening = () => {
    if (!recognitionRef.current) return;
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch {
        setIsListening(false);
      }
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen, messages, isLoading]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend ?? inputValue).trim();
    if (!text || isLoading) return;

    const userMessage: ChatMessage = {
      id: "usr-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
      role: "user",
      content: text,
      timestamp: new Date(),
    };

    const newHistory = [...messages, userMessage];
    setMessages(newHistory);
    setInputValue("");
    setIsLoading(true);

    try {
      // Backend expects last 10 messages: [{ role, content }]
      const trimmedPayload = newHistory.slice(-10).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await api<{
        reply: string;
        pendingAction?: PendingActionData | null;
      }>("/assistant/chat", {
        method: "POST",
        body: JSON.stringify({ messages: trimmedPayload }),
      });

      const assistantMessage: ChatMessage = {
        id: "ast-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
        role: "assistant",
        content: res.reply || "No reply generated.",
        pendingAction: res.pendingAction || null,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: any) {
      const errorMsg =
        err?.message ||
        "I encountered an issue connecting to the assistant. Please verify your GEMINI_API_KEY in backend/.env.";

      setMessages((prev) => [
        ...prev,
        {
          id: "err-" + Date.now(),
          role: "assistant",
          content: `⚠️ ${errorMsg}`,
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmAction = async (messageId: string, actionId: string) => {
    setActionLoadingId(actionId);
    try {
      const res = await api<{
        success: boolean;
        message: string;
        result?: any;
      }>("/assistant/confirm", {
        method: "POST",
        body: JSON.stringify({ actionId }),
      });

      setMessages((prev) =>
        prev.map((m) => {
          if (m.id === messageId) {
            return {
              ...m,
              actionResult: {
                status: "confirmed",
                message: res.message || "Action confirmed and executed successfully.",
              },
            };
          }
          return m;
        })
      );
    } catch (err: any) {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id === messageId) {
            return {
              ...m,
              actionResult: {
                status: "error",
                message: err?.message || "Failed to confirm action.",
              },
            };
          }
          return m;
        })
      );
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleCancelAction = async (messageId: string, actionId: string) => {
    setActionLoadingId(actionId);
    try {
      const res = await api<{ success: boolean; message: string }>(
        "/assistant/cancel",
        {
          method: "POST",
          body: JSON.stringify({ actionId }),
        }
      );

      setMessages((prev) =>
        prev.map((m) => {
          if (m.id === messageId) {
            return {
              ...m,
              actionResult: {
                status: "cancelled",
                message: res.message || "Action cancelled.",
              },
            };
          }
          return m;
        })
      );
    } catch (err: any) {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id === messageId) {
            return {
              ...m,
              actionResult: {
                status: "error",
                message: err?.message || "Failed to cancel action.",
              },
            };
          }
          return m;
        })
      );
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleClearChat = () => {
    setMessages([]);
  };

  if (!user) return null;

  return (
    <>
      {/* Floating Toggle Button */}
      {!isOpen && (
        <button
          id="assistant-toggle-button"
          type="button"
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2.5 rounded-full bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-xl shadow-indigo-500/25 transition-all duration-200 hover:scale-105 hover:shadow-indigo-500/40 active:scale-95 border border-indigo-400/30"
          title="Open Warehouse AI Assistant"
        >
          <span className="relative flex size-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
            <span className="relative inline-flex size-2.5 rounded-full bg-cyan-300" />
          </span>
          <IconSparkles className="size-5" />
          <span>Warehouse AI</span>
        </button>
      )}

      {/* Floating Chat Panel */}
      {isOpen && (
        <div
          id="assistant-chat-panel"
          className="fixed bottom-4 sm:bottom-6 right-4 sm:right-6 z-50 flex h-[min(580px,calc(100vh-2rem))] max-h-[90vh] w-[calc(100vw-2rem)] sm:w-[420px] flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/95 shadow-2xl backdrop-blur-xl transition-all duration-200 animate-in fade-in zoom-in-95"
        >
          {/* Header */}
          <header className="flex shrink-0 items-center justify-between border-b border-slate-800/80 bg-slate-900/80 px-4 py-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 text-white shadow-md shadow-indigo-500/20">
                <IconRobot className="size-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="truncate text-sm font-bold text-white">Warehouse Assistant</h3>
                  <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-300 border border-indigo-500/30">
                    Gemini Flash
                  </span>
                </div>
                <p className="truncate text-xs text-slate-400">Live warehouse data & verified actions</p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearChat}
                  title="Clear chat history"
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
                >
                  <IconTrash className="size-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                title="Close assistant"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
              >
                <IconX className="size-4" />
              </button>
            </div>
          </header>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <div className="flex size-14 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 mb-3 shadow-inner">
                  <IconSparkles className="size-7" />
                </div>
                <h4 className="text-sm font-semibold text-slate-200">Hello, {user.name} 👋</h4>
                <p className="mt-1 max-w-[280px] text-xs text-slate-400">
                  I can check stock levels, list low-stock items, summarize dispatches, find overdue client payments, and reorder alerts.
                </p>

                <div className="mt-6 w-full space-y-2">
                  <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Try asking:
                  </span>
                  <div className="flex flex-col gap-1.5">
                    {SUGGESTION_CHIPS.map((chip, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleSendMessage(chip)}
                        className="rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2 text-left text-xs text-slate-300 hover:border-indigo-500/40 hover:bg-slate-800/80 hover:text-white transition-all duration-150"
                      >
                        💡 {chip}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <>
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`flex flex-col ${
                      m.role === "user" ? "items-end" : "items-start"
                    }`}
                  >
                    {/* Role header / timestamp */}
                    <span className="mb-1 text-[10px] text-slate-500 px-1">
                      {m.role === "user" ? "You" : "Warehouse AI"} ·{" "}
                      {new Date(m.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>

                    {/* Bubble */}
                    <div
                      className={`rounded-2xl px-3.5 py-2.5 max-w-[90%] text-sm shadow-sm ${
                        m.role === "user"
                          ? "bg-indigo-600 text-white rounded-tr-none font-medium"
                          : "bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-none"
                      }`}
                    >
                      {m.role === "user" ? (
                        <p className="whitespace-pre-wrap">{m.content}</p>
                      ) : (
                        <FormattedAssistantText content={m.content} />
                      )}

                      {/* Pending Action Card */}
                      {m.pendingAction && (
                        <div className="mt-3 overflow-hidden rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-slate-200">
                          <div className="flex items-center gap-1.5 font-semibold text-amber-300">
                            <IconShieldCheck className="size-4 shrink-0 text-amber-400" />
                            <span>Action Confirmation Required</span>
                          </div>

                          <p className="mt-2 text-slate-300 leading-relaxed font-medium">
                            {m.pendingAction.summary}
                          </p>

                          <div className="mt-1 text-[10px] text-slate-400 italic">
                            Expires in 5 minutes. No data is changed until confirmed.
                          </div>

                          {m.actionResult ? (
                            <div
                              className={`mt-3 rounded-lg p-2 text-xs font-medium border ${
                                m.actionResult.status === "confirmed"
                                  ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
                                  : m.actionResult.status === "cancelled"
                                  ? "bg-slate-800 border-slate-700 text-slate-300"
                                  : "bg-rose-500/15 border-rose-500/30 text-rose-300"
                              }`}
                            >
                              {m.actionResult.status === "confirmed" && "✓ "}
                              {m.actionResult.status === "cancelled" && "✕ "}
                              {m.actionResult.status === "error" && "⚠️ "}
                              {m.actionResult.message}
                            </div>
                          ) : (
                            <div className="mt-3 flex items-center gap-2">
                              <button
                                type="button"
                                disabled={actionLoadingId === m.pendingAction.id}
                                onClick={() =>
                                  handleConfirmAction(m.id, m.pendingAction!.id)
                                }
                                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 font-semibold text-white shadow hover:bg-emerald-500 disabled:opacity-50 transition-colors"
                              >
                                {actionLoadingId === m.pendingAction.id ? (
                                  <span className="size-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                ) : (
                                  <IconCheck className="size-3.5" />
                                )}
                                Confirm
                              </button>
                              <button
                                type="button"
                                disabled={actionLoadingId === m.pendingAction.id}
                                onClick={() =>
                                  handleCancelAction(m.id, m.pendingAction!.id)
                                }
                                className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 font-semibold text-slate-300 hover:bg-slate-700 hover:text-white disabled:opacity-50 transition-colors"
                              >
                                <IconX className="size-3.5" />
                                Cancel
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {/* Loading indicator */}
                {isLoading && (
                  <div className="flex flex-col items-start">
                    <span className="mb-1 text-[10px] text-slate-500 px-1">
                      Warehouse AI is thinking...
                    </span>
                    <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-none border border-slate-800 bg-slate-900 px-4 py-3 text-slate-400">
                      <span className="size-2 animate-bounce rounded-full bg-indigo-400" />
                      <span
                        className="size-2 animate-bounce rounded-full bg-indigo-400"
                        style={{ animationDelay: "150ms" }}
                      />
                      <span
                        className="size-2 animate-bounce rounded-full bg-indigo-400"
                        style={{ animationDelay: "300ms" }}
                      />
                    </div>
                  </div>
                )}
              </>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick suggestion chips (if messages exist) */}
          {messages.length > 0 && (
            <div className="flex shrink-0 gap-1.5 overflow-x-auto px-4 py-1.5 border-t border-slate-800/60 bg-slate-950/60 scrollbar-none">
              {SUGGESTION_CHIPS.map((chip, idx) => (
                <button
                  key={idx}
                  type="button"
                  disabled={isLoading}
                  onClick={() => handleSendMessage(chip)}
                  className="shrink-0 rounded-full border border-slate-800 bg-slate-900/80 px-2.5 py-1 text-[11px] text-slate-400 hover:border-slate-700 hover:text-slate-200 transition-colors disabled:opacity-50"
                >
                  {chip}
                </button>
              ))}
            </div>
          )}

          {/* Input Footer */}
          <footer className="shrink-0 border-t border-slate-800/80 bg-slate-900/60 p-3">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex items-center gap-2"
            >
              {isSpeechSupported && (
                <button
                  type="button"
                  onClick={toggleListening}
                  title={isListening ? "Stop listening" : "Speak question (en-IN)"}
                  className={`flex size-9 shrink-0 items-center justify-center rounded-xl border transition-all ${
                    isListening
                      ? "animate-pulse border-rose-500/60 bg-rose-500/20 text-rose-400"
                      : "border-slate-800 bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                  }`}
                >
                  {isListening ? (
                    <IconMicrophoneOff className="size-4 text-rose-400" />
                  ) : (
                    <IconMicrophone className="size-4" />
                  )}
                </button>
              )}

              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={
                  isListening
                    ? "Listening (speak now)..."
                    : "Ask about inventory, orders, payments..."
                }
                disabled={isLoading}
                maxLength={1000}
                className="flex-1 rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-60"
              />

              <button
                type="submit"
                disabled={!inputValue.trim() || isLoading}
                className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md hover:bg-indigo-500 active:scale-95 disabled:pointer-events-none disabled:opacity-40 transition-all"
                title="Send message"
              >
                <IconSend className="size-4" />
              </button>
            </form>
          </footer>
        </div>
      )}
    </>
  );
}

export default WarehouseAssistant;
