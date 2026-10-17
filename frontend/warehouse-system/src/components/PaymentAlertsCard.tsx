import React, { useState, useEffect, useCallback } from "react";
import {
  IconAlertCircle,
  IconBrandWhatsapp,
  IconCopy,
  IconCheck,
  IconPhoneCall,
  IconShieldCheck,
  IconClock,
  IconExternalLink,
  IconRefresh,
} from "@tabler/icons-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  formatINR,
  formatDaysAgo,
  normalizeIndianPhone,
  buildPaymentReminderMessage,
} from "@/lib/format";

export interface OverdueOrder {
  _id: string;
  orderId: string;
  orderNumber: string;
  clientName: string;
  phone: string;
  balance: number;
  total: number;
  daysPending: number;
  packedAt?: string;
  lastReminderAt?: string | null;
  reminderCount: number;
}

interface OverdueResponse {
  success: boolean;
  thresholdDays: number;
  count: number;
  orders: OverdueOrder[];
}

interface PaymentAlertsCardProps {
  refreshKey: number;
  onOrderClick?: (orderId: string) => void;
  onChanged?: () => void;
}

export function PaymentAlertsCard({
  refreshKey,
  onOrderClick,
  onChanged,
}: PaymentAlertsCardProps) {
  const [orders, setOrders] = useState<OverdueOrder[]>([]);
  const [thresholdDays, setThresholdDays] = useState(3);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeActionOrderId, setActiveActionOrderId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ [orderId: string]: string }>({});
  const [phoneErrors, setPhoneErrors] = useState<{ [orderId: string]: string }>({});

  const fetchOverdueOrders = useCallback(() => {
    setLoading(true);
    setError(null);
    api<OverdueResponse>("/orders/overdue-payments")
      .then((res) => {
        setOrders(res.orders || []);
        if (res.thresholdDays) setThresholdDays(res.thresholdDays);
      })
      .catch((err) => {
        setError(err.message || "Unable to load overdue payment alerts");
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    fetchOverdueOrders();
  }, [fetchOverdueOrders, refreshKey]);

  const showToast = (orderId: string, text: string) => {
    setFeedback((prev) => ({ ...prev, [orderId]: text }));
    setTimeout(() => {
      setFeedback((prev) => {
        const next = { ...prev };
        delete next[orderId];
        return next;
      });
    }, 3500);
  };

  const handleSendWhatsApp = async (order: OverdueOrder) => {
    setPhoneErrors((prev) => {
      const next = { ...prev };
      delete next[order._id];
      return next;
    });

    const phoneCheck = normalizeIndianPhone(order.phone);
    const message = buildPaymentReminderMessage(
      order.clientName,
      order.orderNumber,
      order.balance
    );

    if (!phoneCheck.valid) {
      setPhoneErrors((prev) => ({
        ...prev,
        [order._id]: phoneCheck.error || "Invalid or missing phone number.",
      }));
      return;
    }

    // Open WhatsApp in new tab
    const whatsappUrl = `https://wa.me/${phoneCheck.phone}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, "_blank", "noopener,noreferrer");

    // Log reminder to backend
    try {
      await api(`/orders/${order._id}/reminders`, {
        method: "POST",
        body: JSON.stringify({ channel: "WHATSAPP", note: "Sent WhatsApp payment reminder" }),
      });
      showToast(order._id, "WhatsApp opened & reminder logged!");
      fetchOverdueOrders();
      onChanged?.();
    } catch (err: any) {
      showToast(order._id, `WhatsApp opened, but failed to log: ${err.message}`);
    }
  };

  const handleCopyMessage = (order: OverdueOrder) => {
    const message = buildPaymentReminderMessage(
      order.clientName,
      order.orderNumber,
      order.balance
    );
    navigator.clipboard.writeText(message).then(() => {
      showToast(order._id, "Reminder message copied to clipboard!");
    });
  };

  const handleLogCall = async (order: OverdueOrder) => {
    try {
      await api(`/orders/${order._id}/reminders`, {
        method: "POST",
        body: JSON.stringify({ channel: "CALL", note: "Phone call reminder logged" }),
      });
      showToast(order._id, "Call reminder logged successfully!");
      fetchOverdueOrders();
      onChanged?.();
    } catch (err: any) {
      showToast(order._id, `Failed to log call: ${err.message}`);
    }
  };

  return (
    <section className="relative overflow-hidden rounded-2xl border border-rose-950/60 bg-gradient-to-br from-slate-900/90 via-slate-900/70 to-rose-950/20 p-6 backdrop-blur-md shadow-xl transition-all">
      {/* Decorative background glow */}
      <div className="pointer-events-none absolute -top-16 -right-16 size-48 rounded-full bg-rose-500/10 blur-3xl" />

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-slate-800/80 mb-5">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl border border-rose-500/30 bg-rose-500/15 text-rose-400 shadow-inner">
            <IconAlertCircle className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white font-heading">
                Payment Alerts
              </h2>
              {orders.length > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/40 bg-rose-500/20 px-2.5 py-0.5 text-[11px] font-bold text-rose-300">
                  <span className="size-1.5 rounded-full bg-rose-500 animate-pulse" />
                  {orders.length} Overdue
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold text-emerald-300">
                  <span className="size-1.5 rounded-full bg-emerald-400" />
                  Healthy
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Packed orders with pending settlement older than {thresholdDays} days
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={fetchOverdueOrders}
          disabled={loading}
          title="Refresh payment alerts"
          className="self-start sm:self-auto flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 px-2.5 py-1.5 text-xs font-semibold text-slate-300 hover:border-slate-600 hover:bg-slate-750 transition-all disabled:opacity-50"
        >
          <IconRefresh className={cn("size-3.5 text-slate-400", loading && "animate-spin")} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>

      {/* Loading Skeleton */}
      {loading && !orders.length && (
        <div className="space-y-3 py-2">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-xl border border-slate-800/80 bg-slate-800/40"
            />
          ))}
        </div>
      )}

      {/* Error Notice */}
      {error && !loading && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs text-rose-300">
          {error}
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && orders.length === 0 && (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <div className="flex size-11 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-2.5">
            <IconShieldCheck className="size-6" />
          </div>
          <strong className="text-sm font-semibold text-slate-200">
            No overdue payments
          </strong>
          <p className="text-xs text-slate-400 mt-1 max-w-sm">
            All packed orders have payments fully collected or are within the {thresholdDays}-day grace period.
          </p>
        </div>
      )}

      {/* Overdue Orders List */}
      {!loading && orders.length > 0 && (
        <div className="space-y-3">
          {orders.map((order) => {
            const hasPhoneError = !!phoneErrors[order._id];
            const toastMessage = feedback[order._id];

            return (
              <div
                key={order._id}
                className="group relative rounded-xl border border-slate-800/90 bg-slate-950/60 p-4 transition-all hover:border-rose-500/30 hover:bg-slate-900/80"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  {/* Order & Client Info */}
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onOrderClick?.(order._id)}
                        className="text-sm font-bold text-white hover:text-indigo-400 transition-colors font-mono underline-offset-2 hover:underline"
                        title="View order details"
                      >
                        {order.orderNumber}
                      </button>
                      <span className="rounded-md border border-rose-500/30 bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold tracking-wider text-rose-300 uppercase">
                        {order.daysPending} days pending
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                      <span className="font-semibold text-slate-200">
                        {order.clientName}
                      </span>
                      <span>·</span>
                      <span className="text-slate-400">
                        {order.phone || "No phone listed"}
                      </span>
                      <span>·</span>
                      <span className="flex items-center gap-1 text-[11px] text-slate-400">
                        <IconClock className="size-3 text-slate-500" />
                        {order.lastReminderAt
                          ? `Last reminded ${formatDaysAgo(order.lastReminderAt)}`
                          : "Not reminded yet"}
                      </span>
                    </div>
                  </div>

                  {/* Financial & Action Buttons */}
                  <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                    <div className="text-left sm:text-right">
                      <div className="text-xs text-slate-400">Balance Pending</div>
                      <div className="text-base font-extrabold text-rose-400 tabular-nums">
                        {formatINR(order.balance)}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {/* WhatsApp Reminder Button */}
                      <button
                        type="button"
                        onClick={() => handleSendWhatsApp(order)}
                        className="flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:border-emerald-500/60 hover:bg-emerald-500/25 transition-all shadow-sm"
                        title="Send WhatsApp payment reminder"
                      >
                        <IconBrandWhatsapp className="size-4 text-emerald-400" />
                        <span>Send Reminder</span>
                      </button>

                      {/* Fallback & Other channels dropdown trigger / secondary buttons */}
                      <button
                        type="button"
                        onClick={() => handleCopyMessage(order)}
                        className="rounded-xl border border-slate-700 bg-slate-800/80 p-2 text-slate-300 hover:border-slate-600 hover:bg-slate-700 hover:text-white transition-all"
                        title="Copy reminder message"
                      >
                        <IconCopy className="size-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleLogCall(order)}
                        className="rounded-xl border border-slate-700 bg-slate-800/80 p-2 text-slate-300 hover:border-slate-600 hover:bg-slate-700 hover:text-white transition-all"
                        title="Log phone call reminder"
                      >
                        <IconPhoneCall className="size-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Toast feedback notification */}
                {toastMessage && (
                  <div className="mt-2.5 flex items-center gap-2 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-1.5 text-xs text-indigo-300 animate-fadeIn">
                    <IconCheck className="size-3.5 text-indigo-400 shrink-0" />
                    <span>{toastMessage}</span>
                  </div>
                )}

                {/* Phone validation error + Fallback copy prompt */}
                {hasPhoneError && (
                  <div className="mt-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-lg border border-rose-500/30 bg-rose-500/15 px-3 py-2 text-xs text-rose-300 animate-fadeIn">
                    <div className="flex items-center gap-2">
                      <IconAlertCircle className="size-4 text-rose-400 shrink-0" />
                      <span>{phoneErrors[order._id]} Cannot launch WhatsApp directly.</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopyMessage(order)}
                      className="self-start sm:self-auto flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/20 px-2.5 py-1 text-[11px] font-bold text-rose-200 hover:bg-rose-500/30 transition-all"
                    >
                      <IconCopy className="size-3" />
                      Copy Message Instead
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
