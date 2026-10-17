/**
 * Currency and date formatting utilities for Warehouse Control Center
 */

export const formatINR = (amount: number | string | undefined | null): string => {
  const num = typeof amount === "string" ? parseFloat(amount) : Number(amount || 0);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(num) ? num : 0);
};

export const formatDaysAgo = (dateStr?: string | Date | null): string => {
  if (!dateStr) return "Not reminded yet";
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return "Not reminded yet";
  const diffHours = (Date.now() - date.getTime()) / (1000 * 60 * 60);
  if (diffHours < 1) return "Just now";
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays <= 0) return "Earlier today";
  if (diffDays === 1) return "1 day ago";
  return `${diffDays} days ago`;
};

export const normalizeIndianPhone = (rawPhone?: string): { valid: boolean; phone: string; error?: string } => {
  if (!rawPhone) return { valid: false, phone: "", error: "Phone number is missing" };
  const digits = rawPhone.replace(/\D/g, "");
  if (!digits) return { valid: false, phone: "", error: "No numeric digits found in phone number" };

  if (digits.length === 10) {
    return { valid: true, phone: `91${digits}` };
  } else if (digits.length === 12 && digits.startsWith("91")) {
    return { valid: true, phone: digits };
  } else if (digits.length > 10 && digits.length <= 15) {
    return { valid: true, phone: digits };
  } else {
    return { valid: false, phone: digits, error: "Invalid phone number format (must be 10 digits or include country code)" };
  }
};

export const buildPaymentReminderMessage = (clientName: string, orderNumber: string, balance: number): string => {
  const formattedBalance = formatINR(balance);
  return `Hello ${clientName || "Valued Customer"}, your order ${orderNumber} is packed and ready for dispatch. Balance pending: ${formattedBalance}. Please complete the payment so we can dispatch it. Thank you.`;
};
