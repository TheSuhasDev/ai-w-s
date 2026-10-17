import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  IconSparkles,
  IconCopy,
  IconCheck,
  IconRefresh,
  IconAlertTriangle,
  IconChevronDown,
  IconChevronUp,
  IconShieldCheck,
} from "@tabler/icons-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export interface ReorderItem {
  productId: string;
  name: string;
  sku: string;
  stock: number;
  minimumStock: number;
  totalDispatched: number;
  avgDailyUsage: number;
  daysLeft: number | null;
  suggestedReorder: number;
  urgency: "CRITICAL" | "WARNING" | "OK" | "NO_DATA";
  message: string;
  reason?: string;
}

export interface ReorderData {
  days: number;
  coverDays: number;
  generatedAt: string;
  items: ReorderItem[];
}

interface SmartReorderCardProps {
  refreshKey: number;
  onDataLoaded?: (data: ReorderData) => void;
}

export function SmartReorderCard({ refreshKey, onDataLoaded }: SmartReorderCardProps) {
  const [data, setData] = useState<ReorderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(null);
    api<ReorderData>("/products/reorder-suggestions")
      .then((res) => {
        setData(res);
        if (onDataLoaded) {
          onDataLoaded(res);
        }
      })
      .catch((err) => {
        setError(err.message || "Failed to load reorder suggestions");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [onDataLoaded]);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshKey]);

  const copyReorderList = () => {
    if (!data?.items) return;
    const reorderItems = data.items.filter((item) => item.suggestedReorder > 0);
    const textToCopy = reorderItems.length
      ? reorderItems
          .map((item) => `${item.name} - ${item.suggestedReorder} units`)
          .join("\n")
      : "All stock levels healthy - no reorders required.";

    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const getUrgencyBadge = (urgency: ReorderItem["urgency"]) => {
    switch (urgency) {
      case "CRITICAL":
        return (
          <span className="inline-flex items-center gap-1 rounded-md border border-rose-500/30 bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold tracking-wider text-rose-400 uppercase">
            <span className="size-1.5 rounded-full bg-rose-500 animate-pulse" />
            CRITICAL
          </span>
        );
      case "WARNING":
        return (
          <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold tracking-wider text-amber-400 uppercase">
            <span className="size-1.5 rounded-full bg-amber-500" />
            WARNING
          </span>
        );
      case "OK":
        return (
          <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold tracking-wider text-emerald-400 uppercase">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            OK
          </span>
        );
      case "NO_DATA":
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-md border border-slate-700/50 bg-slate-800/60 px-2 py-0.5 text-[10px] font-bold tracking-wider text-slate-400 uppercase">
            NO_DATA
          </span>
        );
    }
  };

  const getProgressColor = (urgency: ReorderItem["urgency"]) => {
    switch (urgency) {
      case "CRITICAL":
        return "bg-rose-500";
      case "WARNING":
        return "bg-amber-500";
      case "OK":
        return "bg-emerald-500";
      default:
        return "bg-slate-600";
    }
  };

  const priorityItems = data?.items?.filter(
    (item) => item.urgency === "CRITICAL" || item.urgency === "WARNING"
  ) || [];

  const otherItems = data?.items?.filter(
    (item) => item.urgency !== "CRITICAL" && item.urgency !== "WARNING"
  ) || [];

  const visibleItems = showAll
    ? data?.items || []
    : priorityItems.length > 0
    ? priorityItems
    : data?.items || [];

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.07,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 12 },
    show: { opacity: 1, y: 0, transition: { duration: 0.22 } },
  };

  return (
    <section className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70 p-6 backdrop-blur-md shadow-xl transition-all">
      {/* Glow decorative accent */}
      <div className="pointer-events-none absolute -top-16 -right-16 size-48 rounded-full bg-indigo-500/10 blur-3xl" />

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-slate-800/80 mb-5">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl border border-indigo-500/30 bg-indigo-500/10 text-indigo-400 shadow-inner">
            <IconSparkles className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white font-heading">
                Smart Reorder Telemetry
              </h2>
              <span className="rounded-md border border-indigo-500/20 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-bold text-indigo-300 uppercase tracking-wider">
                30-Day Predictive Model
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Automated stock burn-rate intelligence and replenishment suggestions
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Refresh button */}
          <button
            type="button"
            onClick={() => fetchData()}
            disabled={loading}
            title="Refresh reorder telemetry"
            className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 px-2.5 py-1.5 text-xs font-semibold text-slate-300 hover:border-slate-600 hover:bg-slate-750 transition-all disabled:opacity-50"
          >
            <IconRefresh className={cn("size-3.5 text-slate-400", loading && "animate-spin")} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          {/* Copy reorder list button */}
          <button
            type="button"
            onClick={copyReorderList}
            disabled={loading || !data?.items?.length}
            className={cn(
              "flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all",
              copied
                ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                : "border-slate-700 bg-slate-800/80 text-slate-200 hover:border-slate-600 hover:bg-slate-700"
            )}
          >
            {copied ? (
              <>
                <IconCheck className="size-3.5 text-emerald-400" />
                <span>Copied to Clipboard!</span>
              </>
            ) : (
              <>
                <IconCopy className="size-3.5 text-slate-400" />
                <span>Copy Reorder List</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Loading Skeleton */}
      {loading && !data && (
        <div className="space-y-3.5 py-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-4 rounded-xl border border-slate-800/60 bg-slate-950/40 p-4 animate-pulse"
            >
              <div className="flex-1 space-y-2">
                <div className="h-4 w-32 rounded bg-slate-800" />
                <div className="h-3 w-48 rounded bg-slate-800/60" />
              </div>
              <div className="h-2 w-32 rounded bg-slate-800 hidden md:block" />
              <div className="h-6 w-20 rounded bg-slate-800" />
            </div>
          ))}
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-rose-500/20 bg-rose-500/5 p-8 text-center">
          <IconAlertTriangle className="size-8 text-rose-400 mb-2" />
          <p className="text-sm font-semibold text-rose-200">{error}</p>
          <button
            type="button"
            onClick={fetchData}
            className="mt-3.5 flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3.5 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/20 transition-colors"
          >
            <IconRefresh className="size-3.5" />
            <span>Retry Calculation</span>
          </button>
        </div>
      )}

      {/* Empty State: All stock levels healthy */}
      {!loading && !error && data && priorityItems.length === 0 && !showAll && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/5 py-8 px-4 text-center">
          <div className="flex size-11 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-2.5">
            <IconShieldCheck className="size-6" />
          </div>
          <strong className="text-sm font-bold text-slate-100">
            All stock levels healthy
          </strong>
          <p className="max-w-md text-xs text-slate-400 mt-1">
            No items currently breach safety thresholds or face depletion within the next 7 days.
          </p>
          {otherItems.length > 0 && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="mt-4 flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition-colors"
            >
              <span>View all {data.items.length} products</span>
              <IconChevronDown className="size-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Staggered Rows */}
      {!loading && !error && data && visibleItems.length > 0 && (
        <div className="space-y-2.5">
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="show"
            className="space-y-2.5"
          >
            <AnimatePresence>
              {visibleItems.map((item) => {
                const maxScale = Math.max(item.minimumStock * 3, item.stock, 1);
                const progressPct = Math.min(
                  100,
                  Math.round((item.stock / maxScale) * 100)
                );

                return (
                  <motion.div
                    key={item.productId}
                    variants={itemVariants}
                    layout
                    className="flex flex-col gap-3 rounded-xl border border-slate-800/80 bg-slate-950/50 p-4 transition-all hover:border-slate-750 sm:flex-row sm:items-center sm:justify-between"
                  >
                    {/* Left: Product Info & Sentence */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <strong className="text-sm font-bold text-slate-100">
                          {item.name}
                        </strong>
                        <span className="font-mono text-[11px] text-slate-500">
                          {item.sku}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs font-medium text-slate-300">
                        {item.message}
                      </p>
                      {item.reason && (
                        <p className="mt-1 text-[11px] text-slate-400 leading-relaxed">
                          <span className="font-semibold text-indigo-400">Why: </span>
                          {item.reason}
                        </p>
                      )}
                    </div>

                    {/* Middle: Current stock vs Minimum stock progress */}
                    <div className="w-full sm:w-48 shrink-0 space-y-1">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-slate-400">
                          Stock: <strong className="text-slate-200">{item.stock}</strong>
                        </span>
                        <span className="text-slate-500">
                          Min: <strong className="text-slate-400">{item.minimumStock}</strong>
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                        <div
                          className={cn("h-full rounded-full transition-all duration-500", getProgressColor(item.urgency))}
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                    </div>

                    {/* Right: Suggested reorder & Urgency badge */}
                    <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t border-slate-800/60 sm:border-0">
                      <span className="text-xs font-bold text-indigo-300 tabular-nums">
                        Suggested reorder:{" "}
                        <span className="text-white font-black">{item.suggestedReorder}</span>
                      </span>
                      {getUrgencyBadge(item.urgency)}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </motion.div>

          {/* Expander button if there are non-priority items */}
          {otherItems.length > 0 && priorityItems.length > 0 && (
            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={() => setShowAll(!showAll)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900/90 px-4 py-2 text-xs font-semibold text-slate-300 hover:border-slate-700 hover:bg-slate-800 transition-colors"
              >
                {showAll ? (
                  <>
                    <span>Show priority items only</span>
                    <IconChevronUp className="size-3.5 text-slate-400" />
                  </>
                ) : (
                  <>
                    <span>Show all products ({otherItems.length} more)</span>
                    <IconChevronDown className="size-3.5 text-slate-400" />
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default SmartReorderCard;
