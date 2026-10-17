import React, { useState, useEffect } from "react";
import {
  IconBrandWhatsapp,
  IconCopy,
  IconCheck,
  IconX,
  IconAlertCircle,
} from "@tabler/icons-react";
import { normalizePhone } from "@/lib/whatsapp";

interface WhatsAppPhoneModalProps {
  isOpen: boolean;
  initialPhone?: string;
  clientName?: string;
  orderNumber?: string;
  onSend: (normalizedPhone: string) => void;
  onCopy: () => void;
  onClose: () => void;
  copied?: boolean;
}

export function WhatsAppPhoneModal({
  isOpen,
  initialPhone = "",
  clientName = "Client",
  orderNumber = "",
  onSend,
  onCopy,
  onClose,
  copied = false,
}: WhatsAppPhoneModalProps) {
  const [phone, setPhone] = useState(initialPhone);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPhone(initialPhone || "");
    setError(null);
  }, [initialPhone, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = normalizePhone(phone);
    if (!normalized) {
      setError("Please enter a valid 10-digit mobile number (e.g. 9876543210).");
      return;
    }
    setError(null);
    onSend(normalized);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-md rounded-2xl border border-slate-800 bg-[#0d1322] p-6 shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/15 text-emerald-400">
              <IconBrandWhatsapp className="size-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white font-heading">
                Send on WhatsApp
              </h3>
              <p className="text-xs text-slate-400">
                {clientName} {orderNumber ? `· #${orderNumber}` : ""}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <IconX className="size-4" />
          </button>
        </div>

        <p className="text-xs text-slate-300">
          The client's phone number is missing or invalid. Please verify the 10-digit number to launch WhatsApp with the pre-filled invoice:
        </p>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Mobile Number
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-xs font-semibold text-slate-500">
                +91
              </span>
              <input
                type="tel"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="9876543210"
                autoFocus
                className="w-full rounded-xl border border-slate-700 bg-slate-800/90 py-2.5 pl-12 pr-4 text-xs font-semibold text-white placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            {error && (
              <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-rose-400">
                <IconAlertCircle className="size-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-2 pt-2">
            <button
              type="submit"
              className="w-full sm:flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500 transition-all shadow-md shadow-emerald-600/20"
            >
              <IconBrandWhatsapp className="size-4" />
              <span>Open in WhatsApp</span>
            </button>

            <button
              type="button"
              onClick={onCopy}
              className="w-full sm:w-auto flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition-all"
            >
              {copied ? (
                <>
                  <IconCheck className="size-3.5 text-emerald-400" />
                  <span className="text-emerald-300">Copied!</span>
                </>
              ) : (
                <>
                  <IconCopy className="size-3.5 text-slate-400" />
                  <span>Copy Message</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
