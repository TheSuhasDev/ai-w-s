import { formatINR } from "./format";

/**
 * Normalizes phone numbers for WhatsApp:
 * - Keeps digits only
 * - Removes a leading 0
 * - Prefixes 91 for 10-digit numbers
 * - Returns null when the result is not a valid number (10 digits, or 12 digits starting with 91)
 */
export function normalizePhone(rawPhone?: string | null): string | null {
  if (!rawPhone) return null;
  let digits = String(rawPhone).replace(/\D/g, "");
  if (digits.startsWith("0")) {
    digits = digits.slice(1);
  }
  if (digits.length === 10) {
    return `91${digits}`;
  }
  if (digits.length === 12 && digits.startsWith("91")) {
    return digits;
  }
  return null;
}

/**
 * Builds a clean, professional invoice message for WhatsApp
 */
export function buildInvoiceMessage(order: any): string {
  const sellerName = "DENIKA AND TEAM SOLUTIONS";
  const clientName = order.client?.name || order.clientName || "Valued Customer";
  const orderNumber = order.orderNumber || order.number || "—";

  const rawDate = order.date || order.createdAt;
  const dateObj = rawDate ? new Date(rawDate) : new Date();
  const formattedDate = !isNaN(dateObj.getTime())
    ? dateObj.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : new Date().toLocaleDateString("en-IN");

  const items: any[] = Array.isArray(order.items) ? order.items : [];
  const itemsText = items.length > 0
    ? items
        .map((item: any) => {
          const name = item.name || "Item";
          const qty = item.quantity || 1;
          const unitPrice = item.sellingPrice ?? item.unitPrice ?? 0;
          const amount = qty * unitPrice;
          return `• ${name} x ${qty} - ${formatINR(amount)}`;
        })
        .join("\n")
    : "• Items as agreed";

  const total = order.totalAmount ?? order.total ?? 0;
  const totalPaid = order.totalPaid ?? 0;
  const balanceDue = order.balanceAmount ?? Math.max(0, total - totalPaid);
  const paymentStatus = (order.paymentStatus || "PENDING").replaceAll("_", " ");

  return `*${sellerName}*
*Tax Invoice Summary*

Hello ${clientName},

Here are the commercial invoice details for your order:
*Invoice / Order:* #${orderNumber}
*Date:* ${formattedDate}

*Items:*
${itemsText}

*Total Amount:* ${formatINR(total)}
*Amount Paid:* ${formatINR(totalPaid)}
*Balance Due:* ${formatINR(balanceDue)}
*Payment Status:* ${paymentStatus}

Thank you for doing business with us!`;
}

/**
 * Opens WhatsApp in a new tab with the prefilled message
 */
export function openWhatsApp(phone: string, message: string): void {
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}
