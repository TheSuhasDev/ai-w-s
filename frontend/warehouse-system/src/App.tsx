"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Sidebar,
  SidebarFooter,
  SidebarHeader,
  SidebarItem,
  SidebarNav,
  SidebarSection,
  SidebarToggle,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  IconLayoutDashboard,
  IconArrowDownCircle,
  IconArrowUpCircle,
  IconReceipt2,
  IconHistory,
  IconCamera,
  IconCheck,
  IconAlertTriangle,
  IconClock,
  IconSparkles,
  IconPrinter,
  IconX,
  IconSearch,
  IconBuildingWarehouse,
  IconShieldCheck,
  IconTrendingUp,
  IconChevronRight,
  IconTruckDelivery,
  IconLogout,
  IconVolume,
  IconVolumeOff,
  IconBrandWhatsapp,
  IconPhoneCall,
  IconCopy,
  IconSend,
  IconAlertCircle,
} from "@tabler/icons-react";
import { Boxes } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { speak, warmUpVoice } from "@/lib/voice";
import { useVoiceSettings } from "@/hooks/useVoiceSettings";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { SmartReorderCard } from "@/components/SmartReorderCard";
import { PaymentAlertsCard } from "@/components/PaymentAlertsCard";
import {
  formatINR,
  formatDaysAgo,
  normalizeIndianPhone,
  buildPaymentReminderMessage,
} from "@/lib/format";
import { normalizePhone, buildInvoiceMessage, openWhatsApp } from "@/lib/whatsapp";
import { WhatsAppPhoneModal } from "@/components/WhatsAppPhoneModal";
import { WarehouseAssistant } from "@/components/WarehouseAssistant";

/* ─── API & Global Constants ────────────────────────────────── */

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
const AI_API_URL =
  import.meta.env.VITE_AI_API_URL ||
  import.meta.env.VITE_AI_URL ||
  "http://127.0.0.1:8001";

const INVOICE_SELLER_DETAILS = {
  name: "DENIKA AND TEAM SOLUTIONS",
  address: "Bangalore, Karnataka, India",
  phone: "+91 98765 43210",
  email: "info@denikabusiness.com",
  gstin: "29ABCDE1234F1Z5",
};

const PRODUCT_CLASSES: Record<string, string> = {
  drill: "DRL001",
  hammer: "HAM001",
  pliers: "PLR001",
  screwdriver: "SCR001",
  wrench: "WRC001",
};

const AI_CONFIDENCE_THRESHOLD = 0.7;
const AI_STABLE_FRAMES = 3;

const currency = (value: number | string) =>
  `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

const invoiceCurrency = (value: number | string) =>
  `₹${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const numberWords = [
  "Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];
const tensWords = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function wordsBelowThousand(value: number): string {
  if (value < 20) return numberWords[value];
  if (value < 100)
    return `${tensWords[Math.floor(value / 10)]}${value % 10 ? ` ${numberWords[value % 10]}` : ""}`;
  return `${numberWords[Math.floor(value / 100)]} Hundred${value % 100 ? ` ${wordsBelowThousand(value % 100)}` : ""}`;
}

function amountInWords(value: number | string): string {
  const amount = Math.round(Number(value) || 0);
  if (!amount) return "Rupees Zero Only";
  const parts: string[] = [];
  const crore = Math.floor(amount / 10000000);
  const lakh = Math.floor((amount % 10000000) / 100000);
  const thousand = Math.floor((amount % 100000) / 1000);
  const remainder = amount % 1000;
  if (crore) parts.push(`${wordsBelowThousand(crore)} Crore`);
  if (lakh) parts.push(`${wordsBelowThousand(lakh)} Lakh`);
  if (thousand) parts.push(`${wordsBelowThousand(thousand)} Thousand`);
  if (remainder) parts.push(wordsBelowThousand(remainder));
  return `Rupees ${parts.join(" ")} Only`;
}


async function predictImage(blob: Blob, signal?: AbortSignal) {
  const form = new FormData();
  form.append("file", blob, "warehouse-frame.jpg");
  let response: Response;
  try {
    response = await fetch(`${AI_API_URL}/predict`, {
      method: "POST",
      body: form,
      signal,
    });
  } catch (error: any) {
    if (error.name === "AbortError") throw error;
    console.error("Vision prediction network error", {
      endpoint: `${AI_API_URL}/predict`,
      errorName: error.name,
    });
    throw new Error("Vision service unavailable. Make sure the backend server is running.", {
      cause: error,
    });
  }

  const result = await response.json().catch(() => null);
  if (!response.ok) {
    console.error("Prediction HTTP error:", response.status, result);
    throw new Error(result?.detail || "Prediction request failed.");
  }
  if (!result || !Array.isArray(result.detections)) {
    console.error("Prediction invalid response:", result);
    throw new Error("Vision service returned an invalid prediction response.");
  }
  return result;
}

function buildInvoice(order: any) {
  const source = order.order || order;
  return {
    number: source.orderNumber,
    date: new Date(source.createdAt),
    client: source.client,
    items: source.items.map((item: any) => ({
      ...item,
      sellingPrice: item.unitPrice,
    })),
    total: source.totalAmount,
    paymentStatus: source.paymentStatus,
    totalPaid: source.totalPaid,
    balanceAmount: source.balanceAmount,
    advancePercentage: source.advancePercentage,
    advanceRequired: source.advanceRequired,
  };
}

const statusLabel = (status: string) => status?.replaceAll("_", " ") || "—";

/* ─── Product Icons ─────────────────────────────────────────── */

function ProductIcon({ name }: { name?: string }) {
  const normalized = (name || "").toLowerCase();
  if (normalized.includes("drill")) {
    return (
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
        <IconSparkles className="size-4" />
      </div>
    );
  }
  if (normalized.includes("hammer")) {
    return (
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
        <IconBuildingWarehouse className="size-4" />
      </div>
    );
  }
  if (normalized.includes("pliers")) {
    return (
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
        <Boxes className="size-4" />
      </div>
    );
  }
  if (normalized.includes("screwdriver")) {
    return (
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
        <IconTrendingUp className="size-4" />
      </div>
    );
  }
  return (
    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-slate-300 border border-slate-700">
      <Boxes className="size-4" />
    </div>
  );
}

function StatusBadge({ product }: { product: any }) {
  if (product.stock === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
        <span className="size-1.5 rounded-full bg-rose-500" />
        OUT OF STOCK
      </span>
    );
  }
  if (product.stock <= product.minimumStock) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
        <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" />
        LOW STOCK
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
      <span className="size-1.5 rounded-full bg-emerald-500" />
      IN STOCK
    </span>
  );
}

/* ─── Brand Workspace Header & Footer ───────────────────────── */

function WorkspaceBrand() {
  const { collapsed } = useSidebar();
  return (
    <div className="flex min-w-0 items-center gap-2">
      <img
        src="/logo1.png"
        alt="DENIKA & TEAM SOLUTIONS"
        className="size-8 shrink-0 object-contain"
      />
      {!collapsed && (
        <span
          className="whitespace-nowrap text-[11px] font-black tracking-tight text-white uppercase font-heading"
          title="DENIKA & TEAM SOLUTIONS"
        >
          DENIKA & TEAM SOLUTIONS
        </span>
      )}
    </div>
  );
}

function UserSidebarFooter() {
  const { user, logout } = useAuth();
  const { collapsed } = useSidebar();

  if (!user) return null;

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-2">
        <div
          title={`${user.name} (${user.role})`}
          className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-300 font-bold text-xs border border-indigo-500/30 cursor-default"
        >
          {user.name.charAt(0).toUpperCase()}
        </div>
        <button
          type="button"
          onClick={logout}
          title="Sign Out"
          aria-label="Sign Out"
          className="flex size-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-rose-400 transition-colors"
        >
          <IconLogout className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex w-full items-center justify-between gap-2.5">
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-300 font-bold text-xs border border-indigo-500/30">
          {user.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-xs font-semibold text-slate-200" title={user.name}>
            {user.name}
          </span>
          <span
            className={cn(
              "inline-flex w-fit items-center rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wider uppercase border mt-0.5",
              user.role === "ADMIN"
                ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                : "bg-blue-500/15 text-blue-300 border-blue-500/30"
            )}
          >
            {user.role}
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={logout}
        title="Sign Out"
        aria-label="Sign Out"
        className="flex size-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-rose-400 transition-colors"
      >
        <IconLogout className="size-4" />
      </button>
    </div>
  );
}

/* ─── Main Workspace Component ──────────────────────────────── */

function WarehouseWorkspace() {
  const [activePage, setActivePage] = useState("dashboard");
  const [refreshKey, setRefreshKey] = useState(0);
  const [invoicePreview, setInvoicePreview] = useState<any>(null);

  const refresh = () => setRefreshKey((key) => key + 1);

  useEffect(() => {
    const navigate = (event: any) => setActivePage(event.detail);
    const showInvoice = (event: any) => setInvoicePreview(event.detail);
    window.addEventListener("wms-navigate", navigate);
    window.addEventListener("wms-show-invoice", showInvoice);
    return () => {
      window.removeEventListener("wms-navigate", navigate);
      window.removeEventListener("wms-show-invoice", showInvoice);
    };
  }, []);

  const pageTitles: Record<string, [string, string]> = {
    dashboard: ["Operational Dashboard", "Real-time inventory intelligence & movement telemetry"],
    reorder: ["Smart Reorder & Replenishment", "Burn-rate velocity, depletion timelines, and automated order recommendations"],
    receive: ["Vision Receiving Station", "Zero-touch incoming tool scanning with camera detection"],
    dispatch: ["Stock Dispatch & Billing", "Assemble client orders, verify stock allocations, and print tax invoices"],
    orders: ["Commercial Orders Register", "Monitor client orders, milestones, balances, and fulfillment stages"],
    inventory: ["Catalogue & Storage Registry", "Live tool inventory, threshold tracking, and bay allocations"],
    history: ["Auditable Stock Ledger", "Chronological audit trail of receive scans and fulfilled dispatches"],
  };

  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: <IconLayoutDashboard className="size-[18px]" /> },
    { id: "receive", label: "Receive Stock", icon: <IconArrowDownCircle className="size-[18px]" /> },
    { id: "dispatch", label: "Dispatch Stock", icon: <IconArrowUpCircle className="size-[18px]" /> },
    { id: "orders", label: "Orders", icon: <IconReceipt2 className="size-[18px]" /> },
    { id: "inventory", label: "Inventory", icon: <Boxes className="size-[18px]" /> },
    { id: "history", label: "Stock History", icon: <IconHistory className="size-[18px]" /> },
  ];

  return (
    <ProtectedRoute
      currentPage={activePage}
      onLoginSuccess={(intended) => setActivePage(intended || "dashboard")}
    >
      <div className="flex h-screen w-screen overflow-hidden bg-[#090d16] text-slate-100 antialiased selection:bg-indigo-500/30 selection:text-indigo-200">
        {/* ─── Supplied Wensity Sidebar ─── */}
        <Sidebar
          variant="collapsible"
          width={268}
          collapsedWidth={64}
          aria-label="Main Navigation"
          className="border-r border-slate-800/80 bg-[#0d1322] backdrop-blur-md"
        >
          <SidebarHeader className="border-b border-slate-800/60 px-3">
            <WorkspaceBrand />
            <SidebarToggle className="ml-auto text-slate-400 hover:text-slate-100 hover:bg-slate-800/70" />
          </SidebarHeader>

          <SidebarNav className="px-2">
            <SidebarSection label="Warehouse Operations">
              {navItems.map((item) => (
                <SidebarItem
                  key={item.id}
                  icon={item.icon}
                  active={activePage === item.id}
                  onClick={() => setActivePage(item.id)}
                  className="hover:bg-slate-800/60"
                >
                  {item.label}
                </SidebarItem>
              ))}
            </SidebarSection>

            <SidebarSection label="Predictive Intelligence">
              <SidebarItem
                icon={<IconSparkles className="size-[18px]" />}
                active={activePage === "reorder"}
                onClick={() => setActivePage("reorder")}
                className="hover:bg-slate-800/60"
              >
                Smart Reorder
              </SidebarItem>
            </SidebarSection>
          </SidebarNav>

          <SidebarFooter>
            <UserSidebarFooter />
          </SidebarFooter>
        </Sidebar>

        {/* ─── Main Content Canvas ─── */}
        <div className="flex flex-1 flex-col min-w-0 overflow-hidden bg-gradient-to-b from-[#090d16] to-[#0b101c]">
          {/* Top Header Bar */}
          <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-800/70 bg-[#0d1322]/80 px-6 backdrop-blur-md">
            <div className="flex flex-col justify-center">
              <p className="text-xs text-slate-400">
                {pageTitles[activePage]?.[1]}
              </p>
            </div>

            <div className="flex items-center gap-3">
              {/* Date chip */}
              <div className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-1 text-xs font-medium text-slate-300">
                <IconClock className="size-3.5 text-slate-400" />
                <span>
                  {new Date().toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              </div>
            </div>
          </header>

          {/* Dynamic Page Router */}
          <main className="flex-1 overflow-y-auto p-6 md:p-8">
            <div className="mx-auto max-w-7xl">
              {activePage === "dashboard" && (
                <Dashboard refreshKey={refreshKey} onChanged={refresh} />
              )}
              {activePage === "reorder" && (
                <div className="space-y-6">
                  <SmartReorderCard refreshKey={refreshKey} />
                </div>
              )}
              {activePage === "receive" && <Receive onChanged={refresh} />}
              {activePage === "dispatch" && <Dispatch onChanged={refresh} />}
              {activePage === "orders" && <Orders refreshKey={refreshKey} onChanged={refresh} />}
              {activePage === "inventory" && <Inventory refreshKey={refreshKey} />}
              {activePage === "history" && <History refreshKey={refreshKey} />}
            </div>
          </main>
        </div>

        {/* Invoice Modal Overlay */}
        {invoicePreview && (
          <Invoice invoice={invoicePreview} onClose={() => setInvoicePreview(null)} />
        )}

        {/* In-app Warehouse AI Assistant */}
        <WarehouseAssistant />
      </div>
    </ProtectedRoute>
  );
}

export function App() {
  return (
    <AuthProvider>
      <WarehouseWorkspace />
    </AuthProvider>
  );
}

/* ─── Data State Helper ─────────────────────────────────────── */

function DataState({
  error,
  loading,
  children,
}: {
  error?: string;
  loading?: boolean;
  children?: React.ReactNode;
}) {
  if (loading) {
    return (
      <div className="flex min-h-[300px] flex-col items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/40 p-8 text-center text-slate-400 backdrop-blur-sm">
        <div className="size-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent mb-3" />
        <p className="text-sm font-medium">Synchronizing warehouse telemetry…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex min-h-[240px] flex-col items-center justify-center rounded-2xl border border-rose-500/20 bg-rose-500/10 p-8 text-center text-rose-300">
        <IconAlertTriangle className="size-8 mb-2 text-rose-400" />
        <p className="text-sm font-semibold">{error}</p>
      </div>
    );
  }
  return <>{children}</>;
}

/* ─── Metric Card with smooth CountUp ───────────────────────── */

function MetricCard({
  label,
  value,
  hint,
  icon,
  tone = "indigo",
}: {
  label: string;
  value: number | string;
  hint: string;
  icon: React.ReactNode;
  tone?: "indigo" | "emerald" | "amber" | "cyan" | "rose";
}) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const target = Number(value) || 0;
    const start = performance.now();
    let frame: number;
    const animate = (now: number) => {
      const progress = Math.min((now - start) / 450, 1);
      setDisplayValue(Math.round(target * (1 - (1 - progress) ** 3)));
      if (progress < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  const toneConfig = {
    indigo: "border-indigo-500/20 bg-indigo-500/5 text-indigo-400 shadow-indigo-500/5",
    emerald: "border-emerald-500/20 bg-emerald-500/5 text-emerald-400 shadow-emerald-500/5",
    amber: "border-amber-500/20 bg-amber-500/5 text-amber-400 shadow-amber-500/5",
    cyan: "border-cyan-500/20 bg-cyan-500/5 text-cyan-400 shadow-cyan-500/5",
    rose: "border-rose-500/20 bg-rose-500/5 text-rose-400 shadow-rose-500/5",
  }[tone];

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-md shadow-lg transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-700">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          {label}
        </span>
        <div className={cn("flex size-9 items-center justify-center rounded-xl border", toneConfig)}>
          {icon}
        </div>
      </div>
      <div className="mt-4 flex items-baseline gap-2">
        <span className="text-3xl font-extrabold tracking-tight text-white font-heading">
          {displayValue}
        </span>
      </div>
      <p className="mt-1 text-xs text-slate-400">{hint}</p>
    </div>
  );
}

/* ─── Dashboard Page ────────────────────────────────────────── */

function Dashboard({
  refreshKey,
  onChanged,
}: {
  refreshKey: number;
  onChanged?: () => void;
}) {
  const [data, setData] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api("/products/dashboard"), api("/products")])
      .then(([dashboard, inventory]) => {
        setData(dashboard);
        setProducts(inventory);
      })
      .catch((err) => setError(err.message));
  }, [refreshKey]);

  if (error) return <DataState error={error} />;
  if (!data) return <DataState loading />;

  const lowStock = products.filter((p) => p.stock <= p.minimumStock);

  return (
    <div className="space-y-6">
      {/* 4 Quick Stat Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Total Catalog SKUs"
          value={data.totalProducts}
          hint="Tracked tool items in catalog"
          icon={<Boxes className="size-5" />}
          tone="indigo"
        />
        <MetricCard
          label="Units In Stock"
          value={data.totalStock}
          hint="Total physical stock across bays"
          icon={<IconBuildingWarehouse className="size-5" />}
          tone="emerald"
        />
        <MetricCard
          label="Low Stock Alerts"
          value={data.lowStockProducts}
          hint="Items below threshold mark"
          icon={<IconAlertTriangle className="size-5" />}
          tone="amber"
        />
        <MetricCard
          label="Today's Dispatches"
          value={data.todayDispatchCount}
          hint="Completed orders dispatched"
          icon={<IconTruckDelivery className="size-5" />}
          tone="cyan"
        />
      </div>

      {/* Middle Grid: Movement Stream + Low Stock Sentinel */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Recent Activity */}
        <section className="lg:col-span-7 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-md shadow-lg">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800/80">
            <div>
              <h2 className="text-base font-bold text-white font-heading">
                Recent Stock Movements
              </h2>
              <p className="text-xs text-slate-400">Live auditable stock transaction stream</p>
            </div>
            <span className="rounded-full bg-slate-800/80 px-2.5 py-1 text-[11px] font-semibold text-slate-300">
              Real-time Ledger
            </span>
          </div>

          <div className="mt-4 divide-y divide-slate-800/60">
            {data.recentMovements?.length ? (
              data.recentMovements.map((movement: any) => {
                const isReceive = movement.type === "RECEIVE";
                return (
                  <div key={movement._id} className="flex items-center justify-between py-3.5 first:pt-0 last:pb-0">
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "flex size-9 items-center justify-center rounded-xl border text-xs font-bold",
                          isReceive
                            ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                            : "border-rose-500/20 bg-rose-500/10 text-rose-400",
                        )}
                      >
                        {isReceive ? (
                          <IconArrowDownCircle className="size-5" />
                        ) : (
                          <IconArrowUpCircle className="size-5" />
                        )}
                      </div>
                      <div>
                        <strong className="block text-sm font-semibold text-slate-100">
                          {movement.product?.name || "Unlisted Product"}
                        </strong>
                        <span className="block text-xs text-slate-400">
                          {movement.type} · {new Date(movement.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} · {new Date(movement.createdAt).toLocaleDateString("en-IN")}
                        </span>
                      </div>
                    </div>
                    <span
                      className={cn(
                        "text-sm font-bold tabular-nums",
                        isReceive ? "text-emerald-400" : "text-rose-400",
                      )}
                    >
                      {isReceive ? "+" : "-"}{movement.quantity}
                    </span>
                  </div>
                );
              })
            ) : (
              <div className="py-12 text-center text-sm text-slate-500">
                No recent stock movements recorded yet.
              </div>
            )}
          </div>
        </section>

        {/* Low Stock Watchlist */}
        <section className="lg:col-span-5 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-md shadow-lg">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800/80">
            <div>
              <h2 className="text-base font-bold text-white font-heading">
                Low Stock Sentinel
              </h2>
              <p className="text-xs text-slate-400">Replenishment candidates</p>
            </div>
            <span className="rounded-full bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 text-[11px] font-semibold text-amber-400">
              {lowStock.length} Alerts
            </span>
          </div>

          <div className="mt-4 divide-y divide-slate-800/60">
            {lowStock.length ? (
              lowStock.map((product) => (
                <div key={product._id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-3">
                    <ProductIcon name={product.name} />
                    <div>
                      <strong className="block text-sm font-semibold text-slate-200">
                        {product.name}
                      </strong>
                      <span className="block text-xs text-slate-400">
                        Location: {product.location || "Bay General"}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="block text-sm font-bold text-amber-400 tabular-nums">
                      {product.stock} / {product.minimumStock}
                    </span>
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider">
                      Critical Level
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="flex size-10 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-2">
                  <IconShieldCheck className="size-5" />
                </div>
                <strong className="text-sm font-semibold text-slate-200">
                  All Inventory Healthy
                </strong>
                <p className="text-xs text-slate-400 mt-0.5">
                  Every tracked tool exceeds minimum storage thresholds.
                </p>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Inventory Quick Overview Table */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-md shadow-lg">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800/80 mb-4">
          <div>
            <h2 className="text-base font-bold text-white font-heading">
              Inventory Status Table
            </h2>
            <p className="text-xs text-slate-400">Current levels & warehouse allocation</p>
          </div>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("wms-navigate", { detail: "inventory" }))}
            className="flex items-center gap-1 text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            <span>View Full Catalog</span>
            <IconChevronRight className="size-3.5" />
          </button>
        </div>
        <ProductTable products={products} compact />
      </section>

      {/* Payment Alerts Card (At bottom of dashboard) */}
      <PaymentAlertsCard
        refreshKey={refreshKey}
        onOrderClick={(orderId) => {
          window.dispatchEvent(new CustomEvent("wms-navigate", { detail: "orders" }));
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent("wms-open-order", { detail: orderId }));
          }, 60);
        }}
        onChanged={onChanged}
      />
    </div>
  );
}

/* ─── Camera Scanner HUD (YOLO Video Inference) ─────────────── */

function CameraScanner({
  onDetections,
  active,
  onError,
}: {
  onDetections: (detections: any[]) => void;
  active: boolean;
  onError?: (err: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<any>(null);
  const requestRef = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const stabilityRef = useRef<{ product: string | null; count: number; detection: any }>({
    product: null,
    count: 0,
    detection: null,
  });
  const [status, setStatus] = useState("Camera offline");
  const [detections, setDetections] = useState<any[]>([]);

  const stopCamera = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    requestRef.current?.abort();
    requestRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    busyRef.current = false;
    stabilityRef.current = { product: null, count: 0, detection: null };

    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
    setDetections([]);
    setStatus("Camera offline");
  }, []);

  const scan = useCallback(async () => {
    if (!videoRef.current || busyRef.current || videoRef.current.readyState < 2) return;
    busyRef.current = true;
    const controller = new AbortController();
    requestRef.current = controller;
    try {
      const video = videoRef.current;
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d")?.drawImage(video, 0, 0);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.78),
      );
      if (!blob || controller.signal.aborted) return;
      const result = await predictImage(blob, controller.signal);
      const next = (result.detections || []).filter(
        (item: any) => item.confidence >= AI_CONFIDENCE_THRESHOLD,
      );
      const candidate = next.sort((a: any, b: any) => b.confidence - a.confidence)[0];
      const state = stabilityRef.current;
      if (!candidate) {
        stabilityRef.current = { product: null, count: 0, detection: null };
        setDetections([]);
        onDetections([]);
        setStatus("SCANNING BAY · NO TOOL DETECTED");
      } else if (state.product === candidate.product) {
        state.count += 1;
        state.detection = candidate;
        const stable = state.count >= AI_STABLE_FRAMES ? [candidate] : [];
        setDetections(stable);
        onDetections(stable);
        setStatus(
          state.count >= AI_STABLE_FRAMES
            ? `${candidate.product.toUpperCase()} · ${(candidate.confidence * 100).toFixed(0)}% · VERIFIED STABLE`
            : `Stabilizing ${candidate.product} (${state.count}/${AI_STABLE_FRAMES})`,
        );
      } else {
        stabilityRef.current = {
          product: candidate.product,
          count: 1,
          detection: candidate,
        };
        setDetections([]);
        onDetections([]);
        setStatus(`Stabilizing ${candidate.product} (1/${AI_STABLE_FRAMES})`);
      }
    } catch (error: any) {
      if (error.name !== "AbortError") {
        setStatus(error.message);
        onError?.(error.message);
      }
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
      busyRef.current = false;
    }
  }, [onDetections, onError]);

  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices?.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (!stream) throw new Error("Camera device unavailable.");
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setStatus("Camera active · awaiting object");
        timerRef.current = setInterval(scan, 1200);
      } catch (error: any) {
        if (!cancelled)
          onError?.(error.message || "Camera permission denied or camera device missing.");
      }
    };
    startCamera();
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [active, onError, scan, stopCamera]);

  useEffect(() => {
    const handlePageHide = () => stopCamera();
    window.addEventListener("pagehide", handlePageHide);
    return () => window.removeEventListener("pagehide", handlePageHide);
  }, [stopCamera]);

  return (
    <div className="relative flex flex-col gap-3">
      {/* Viewfinder frame */}
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl border-2 border-indigo-500/40 bg-slate-950 shadow-2xl">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full object-cover"
        />

        {/* Cyber HUD Overlays */}
        <div className="pointer-events-none absolute inset-0 border border-indigo-500/20">
          {/* Corner brackets */}
          <div className="absolute left-3 top-3 size-6 border-l-2 border-t-2 border-indigo-400" />
          <div className="absolute right-3 top-3 size-6 border-r-2 border-t-2 border-indigo-400" />
          <div className="absolute bottom-3 left-3 size-6 border-l-2 border-b-2 border-indigo-400" />
          <div className="absolute bottom-3 right-3 size-6 border-r-2 border-b-2 border-indigo-400" />

          {/* Central Target Reticle */}
          <div className="absolute inset-[18%] rounded-xl border-2 border-dashed border-indigo-400/50 bg-indigo-500/5 shadow-[0_0_0_9999px_rgba(9,13,22,0.4)]" />

          {/* Animated Laser Scanline */}
          <div className="absolute left-0 right-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_12px_#38bdf8] animate-scanline" />
        </div>

        {/* Live Detected Tags */}
        {detections.map((d, index) => (
          <div
            key={`${d.product}-${index}`}
            className="absolute rounded-lg border border-cyan-400 bg-cyan-950/90 px-3 py-1 text-xs font-bold text-cyan-300 shadow-xl backdrop-blur-md"
            style={{
              left: `${Math.min(80, Math.max(10, (d.box?.x1 || 0) / 6))}%`,
              top: `${Math.min(80, Math.max(10, (d.box?.y1 || 0) / 5))}%`,
            }}
          >
            <span className="uppercase">{d.product}</span> · {(d.confidence * 100).toFixed(0)}%
          </div>
        ))}
      </div>

      {/* Camera Status Bar */}
      <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/80 px-4 py-2.5 text-xs">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-indigo-400 animate-pulse" />
          <span className="font-semibold text-slate-300">{status}</span>
        </div>
        <span className="text-[11px] text-slate-500 font-mono">1.2s cadence</span>
      </div>
    </div>
  );
}

/* ─── Receive Stock Page ────────────────────────────────────── */

function Receive({ onChanged }: { onChanged: () => void }) {
  const { voiceEnabled, toggleVoice } = useVoiceSettings();
  const [active, setActive] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const locks = useRef<any[]>([]);
  const [lastResult, setLastResult] = useState<any>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    api("/products")
      .then(setProducts)
      .catch((err) => setMessage(err.message));
  }, [lastResult]);

  const handleDetections = useCallback(
    async (detections: any[]) => {
      const nextLocks: any[] = [];
      for (const detection of detections) {
        const center = {
          x: ((detection.box?.x1 || 0) + (detection.box?.x2 || 0)) / 2,
          y: ((detection.box?.y1 || 0) + (detection.box?.y2 || 0)) / 2,
        };
        const existing = locks.current.find(
          (lock) =>
            lock.product === detection.product &&
            Math.hypot(lock.x - center.x, lock.y - center.y) < 100,
        );
        if (existing) {
          nextLocks.push({ ...existing, x: center.x, y: center.y });
          continue;
        }
        nextLocks.push({ product: detection.product, x: center.x, y: center.y });
        const product = products.find(
          (item) => item.sku === PRODUCT_CLASSES[detection.product],
        );
        if (!product) continue;
        try {
          const result = await api(`/products/${product._id}/receive`, {
            method: "PATCH",
            body: JSON.stringify({ quantity: 1 }),
          });
          setLastResult({
            name: product.name,
            confidence: detection.confidence,
            stock: result.product.stock,
          });
          speak(
            `${product.name}, added, ${result.product.stock} in stock.`,
            `receive:${product.name}`
          );
          onChanged();
        } catch (error: any) {
          setMessage(error.message);
        }
      }
      locks.current = nextLocks;
    },
    [onChanged, products],
  );

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      {/* Camera Station Panel */}
      <section className="lg:col-span-7 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-md shadow-lg">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800/80 mb-5">
          <div>
            <h2 className="text-base font-bold text-white font-heading">
              Vision Receiving Bay
            </h2>
            <p className="text-xs text-slate-400">
              Threshold 70% · 3 consecutive stable frames
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={toggleVoice}
              title={voiceEnabled ? "Mute voice feedback" : "Enable voice feedback"}
              aria-label={voiceEnabled ? "Mute voice feedback" : "Enable voice feedback"}
              className={cn(
                "flex size-8 items-center justify-center rounded-xl border transition-all",
                voiceEnabled
                  ? "border-indigo-500/30 bg-indigo-500/15 text-indigo-300 hover:bg-indigo-500/25"
                  : "border-slate-800 bg-slate-900/80 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              )}
            >
              {voiceEnabled ? (
                <IconVolume className="size-4" />
              ) : (
                <IconVolumeOff className="size-4" />
              )}
            </button>
            <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 text-xs font-semibold text-emerald-400">
              Auto-Increment
            </span>
          </div>
        </div>

        {!active ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-800 bg-slate-950/40 p-12 text-center">
            <div className="flex size-16 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 mb-4 shadow-inner">
              <IconCamera className="size-8" />
            </div>
            <h3 className="text-base font-bold text-slate-100 font-heading">
              Activate Camera Feed
            </h3>
            <p className="max-w-md text-xs text-slate-400 mt-1 mb-6 leading-relaxed">
              Position incoming warehouse packages under the scanner. Verified tool items will be recognized and immediately logged to inventory.
            </p>
            <button
              onClick={() => {
                warmUpVoice();
                setMessage("");
                setActive(true);
              }}
              className="flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 transition-all hover:bg-indigo-500 hover:shadow-indigo-600/50"
            >
              <IconCamera className="size-4" />
              <span>Launch Live Camera</span>
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <CameraScanner
              active={active}
              onDetections={handleDetections}
              onError={setMessage}
            />
            <button
              onClick={() => setActive(false)}
              className="w-full rounded-xl border border-slate-700 bg-slate-800/60 py-2.5 text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-800"
            >
              Disconnect Camera
            </button>
          </div>
        )}
      </section>

      {/* Latest Receipt Card */}
      <section className="lg:col-span-5 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-md shadow-lg flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between pb-4 border-b border-slate-800/80 mb-5">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">
                TELEMETRY FEED
              </span>
              <h2 className="text-base font-bold text-white font-heading">
                Latest Receive Event
              </h2>
            </div>
          </div>

          {lastResult ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3.5 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                <ProductIcon name={lastResult.name} />
                <div className="flex-1 min-w-0">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-400">
                    Recognized Item
                  </span>
                  <h3 className="text-lg font-bold text-white truncate">
                    {lastResult.name}
                  </h3>
                  <p className="text-xs text-slate-400">
                    SKU {PRODUCT_CLASSES[lastResult.name.toLowerCase()] || "—"}
                  </p>
                </div>
                <div className="flex size-9 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                  <IconCheck className="size-5" />
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Confidence Score:</span>
                  <strong className="font-bold text-emerald-400 font-mono">
                    {(lastResult.confidence * 100).toFixed(1)}%
                  </strong>
                </div>
                <div className="flex justify-between border-t border-slate-800/80 pt-2">
                  <span className="text-slate-400">Stock Updated:</span>
                  <strong className="font-bold text-white font-mono">
                    {lastResult.stock} Units
                  </strong>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-xl border border-slate-800/80 bg-slate-950/30 p-10 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-slate-800 text-slate-400 mb-3">
                <IconCamera className="size-6" />
              </div>
              <strong className="text-sm font-semibold text-slate-200">
                Awaiting Product Detection
              </strong>
              <p className="text-xs text-slate-400 max-w-xs mt-1">
                Hold a supported warehouse tool in the scan viewfinder until the confidence bar confirms receipt.
              </p>
            </div>
          )}

          {message && (
            <div className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-300">
              {message}
            </div>
          )}
        </div>

        {/* Informational Guidance */}
        <div className="mt-6 rounded-xl border border-indigo-500/10 bg-indigo-500/5 p-4 text-[11px] text-slate-400 leading-relaxed">
          <strong className="text-indigo-300 block mb-1">
            Supported Tool Classes:
          </strong>
          Drill (DRL001) · Hammer (HAM001) · Pliers (PLR001) · Screwdriver (SCR001) · Wrench (WRC001)
        </div>
      </section>
    </div>
  );
}

/* ─── Dispatch Stock Page ───────────────────────────────────── */

function Dispatch({ onChanged }: { onChanged: () => void }) {
  const { voiceEnabled, toggleVoice } = useVoiceSettings();
  const [products, setProducts] = useState<any[]>([]);
  const [cart, setCart] = useState<any[]>([]);
  const cartRef = useRef<any[]>(cart);
  const [active, setActive] = useState(false);
  const [client, setClient] = useState({ name: "", phone: "", address: "", gstin: "" });
  const [message, setMessage] = useState("");
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const locks = useRef<any[]>([]);

  useEffect(() => {
    cartRef.current = cart;
  }, [cart]);

  useEffect(() => {
    api("/products")
      .then(setProducts)
      .catch((err) => setMessage(err.message));
  }, []);

  useEffect(() => {
    api("/orders")
      .then((data) =>
        setRecentOrders(Array.isArray(data) ? data.slice(0, 5) : data.orders?.slice(0, 5) || []),
      )
      .catch(() => {});
  }, [onChanged]);

  const addDetection = useCallback(
    (detections: any[]) => {
      const nextLocks: any[] = [];
      detections.forEach((detection) => {
        const x = ((detection.box?.x1 || 0) + (detection.box?.x2 || 0)) / 2;
        const y = ((detection.box?.y1 || 0) + (detection.box?.y2 || 0)) / 2;
        const existing = locks.current.find(
          (lock) =>
            lock.product === detection.product &&
            Math.hypot(lock.x - x, lock.y - y) < 100,
        );
        nextLocks.push({ product: detection.product, x, y });
        if (existing) return;
        const product = products.find(
          (item) => item.sku === PRODUCT_CLASSES[detection.product],
        );
        if (!product) return;
        setCart((current) => {
          const found = current.find((item) => item._id === product._id);
          const nextQty = found ? found.quantity + 1 : 1;
          speak(
            `${product.name}, added to order, quantity ${nextQty}.`,
            `dispatch:${product.name}`
          );
          const nextCart = found
            ? current.map((item) =>
                item._id === product._id
                  ? { ...item, quantity: item.quantity + 1 }
                  : item,
              )
            : [...current, { ...product, quantity: 1 }];
          cartRef.current = nextCart;
          return nextCart;
        });
      });
      locks.current = nextLocks;
    },
    [products],
  );

  const updateQuantity = (id: string, value: string) =>
    setCart((current) =>
      current.map((item) =>
        item._id === id ? { ...item, quantity: Math.max(1, Number(value) || 1) } : item,
      ),
    );

  const total = cart.reduce((sum, item) => sum + item.quantity * item.sellingPrice, 0);

  const createOrder = async () => {
    if (!client.name.trim() || !client.phone.trim() || !client.address.trim()) {
      return setMessage("Enter client name, contact phone, and dispatch address before confirming.");
    }
    if (!cart.length) {
      return setMessage("Add at least one product item to the order cart.");
    }
    try {
      const created = await api("/orders", {
        method: "POST",
        body: JSON.stringify({
          client,
          items: cart.map((item) => ({ productId: item._id, quantity: item.quantity })),
        }),
      });
      window.dispatchEvent(
        new CustomEvent("wms-show-invoice", {
          detail: buildInvoice(created.order || created),
        }),
      );
      setCart([]);
      setClient({ name: "", phone: "", address: "", gstin: "" });
      onChanged();
      setMessage("");
      window.dispatchEvent(new CustomEvent("wms-navigate", { detail: "orders" }));
    } catch (error: any) {
      setMessage(error.message);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      {/* Left: Camera scanner */}
      <section className="lg:col-span-5 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-md shadow-lg space-y-4">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800/80">
          <div>
            <h2 className="text-base font-bold text-white font-heading">
              Dispatch Scanner
            </h2>
            <p className="text-xs text-slate-400">
              Identify tools to append to cart
            </p>
          </div>
          <button
            type="button"
            onClick={toggleVoice}
            title={voiceEnabled ? "Mute voice feedback" : "Enable voice feedback"}
            aria-label={voiceEnabled ? "Mute voice feedback" : "Enable voice feedback"}
            className={cn(
              "flex size-8 items-center justify-center rounded-xl border transition-all",
              voiceEnabled
                ? "border-indigo-500/30 bg-indigo-500/15 text-indigo-300 hover:bg-indigo-500/25"
                : "border-slate-800 bg-slate-900/80 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            )}
          >
            {voiceEnabled ? (
              <IconVolume className="size-4" />
            ) : (
              <IconVolumeOff className="size-4" />
            )}
          </button>
        </div>

        {!active ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-800 bg-slate-950/40 p-8 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 mb-3 shadow-inner">
              <IconCamera className="size-7" />
            </div>
            <h3 className="text-sm font-bold text-slate-100 font-heading">
              Camera Scanner Standby
            </h3>
            <p className="text-xs text-slate-400 mt-1 mb-4">
              Detect packaged goods for automated order dispatch.
            </p>
            <button
              onClick={() => {
                warmUpVoice();
                setMessage("");
                setActive(true);
              }}
              className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white shadow-md shadow-indigo-600/30 transition-all hover:bg-indigo-500"
            >
              Start Camera
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <CameraScanner active={active} onDetections={addDetection} onError={setMessage} />
            <button
              onClick={() => setActive(false)}
              className="w-full rounded-xl border border-slate-700 bg-slate-800/60 py-2.5 text-xs font-semibold text-slate-200 hover:bg-slate-800"
            >
              Stop Camera
            </button>
          </div>
        )}

        {/* Recent orders shortcut list */}
        <div className="pt-4 border-t border-slate-800/80">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
            Recent Order Invoices
          </h3>
          <div className="divide-y divide-slate-800/60">
            {recentOrders.map((order) => (
              <div key={order._id} className="flex items-center justify-between py-2 text-xs">
                <div>
                  <strong className="block text-slate-200">{order.orderNumber}</strong>
                  <span className="text-[11px] text-slate-400">
                    {order.client?.name} · {statusLabel(order.status)}
                  </span>
                </div>
                <button
                  onClick={() =>
                    window.dispatchEvent(
                      new CustomEvent("wms-show-invoice", {
                        detail: buildInvoice(order),
                      }),
                    )
                  }
                  className="text-xs font-semibold text-indigo-400 hover:text-indigo-300"
                >
                  View Invoice
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Right: Cart & Order Generator */}
      <section className="lg:col-span-7 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-md shadow-lg space-y-5">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800/80">
          <div>
            <h2 className="text-base font-bold text-white font-heading">
              New Dispatch Order Cart
            </h2>
            <p className="text-xs text-slate-400">
              Configure items and generate official commercial invoice
            </p>
          </div>
          <span className="rounded-full bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-1 text-xs font-semibold text-indigo-300">
            {cart.reduce((sum, item) => sum + item.quantity, 0)} Units
          </span>
        </div>

        {/* Cart Item Rows */}
        {cart.length ? (
          <div className="divide-y divide-slate-800/60 rounded-xl border border-slate-800 bg-slate-950/40 p-3">
            {cart.map((item) => (
              <div key={item._id} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                <div className="flex items-center gap-3">
                  <ProductIcon name={item.name} />
                  <div>
                    <strong className="block text-sm font-semibold text-slate-100">
                      {item.name}
                    </strong>
                    <span className="text-xs text-slate-400">
                      {item.sku} · {currency(item.sellingPrice)} ea · Stock {item.stock}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="1"
                    value={item.quantity}
                    onChange={(e) => updateQuantity(item._id, e.target.value)}
                    className="w-16 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-center text-xs font-bold text-white focus:border-indigo-500 focus:outline-none"
                  />
                  <button
                    onClick={() =>
                      setCart((current) => current.filter((entry) => entry._id !== item._id))
                    }
                    className="rounded-lg p-1 text-slate-400 hover:bg-rose-500/20 hover:text-rose-400 transition-colors"
                  >
                    <IconX className="size-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-8 text-center text-xs text-slate-400">
            Cart is empty. Scan an item with camera or pick from the manual catalogue selector below.
          </div>
        )}

        {/* Manual picker */}
        <div>
          <select
            value=""
            onChange={(e) => {
              const product = products.find((item) => item._id === e.target.value);
              if (product) setCart((current) => [...current, { ...product, quantity: 1 }]);
            }}
            className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2.5 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
          >
            <option value="">+ Manually add product from catalog…</option>
            {products.map((product) => (
              <option key={product._id} value={product._id}>
                {product.name} ({product.sku}) · {product.stock} available · {currency(product.sellingPrice)}
              </option>
            ))}
          </select>
        </div>

        {/* Order total & Client Form */}
        {cart.length > 0 && (
          <div className="space-y-4 pt-4 border-t border-slate-800/80">
            <div className="flex items-center justify-between rounded-xl bg-indigo-500/10 border border-indigo-500/20 p-4">
              <span className="text-xs font-semibold text-slate-300">
                Order Grand Total
              </span>
              <strong className="text-xl font-extrabold text-indigo-300 font-heading">
                {currency(total)}
              </strong>
            </div>

            <div className="space-y-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                CLIENT & BILLING DETAILS
              </span>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <input
                  placeholder="Client / Company Name *"
                  value={client.name}
                  onChange={(e) => setClient({ ...client, name: e.target.value })}
                  className="rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
                />
                <input
                  placeholder="Contact Phone *"
                  value={client.phone}
                  onChange={(e) => setClient({ ...client, phone: e.target.value })}
                  className="rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <textarea
                placeholder="Delivery Destination Address *"
                value={client.address}
                onChange={(e) => setClient({ ...client, address: e.target.value })}
                rows={2}
                className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
              />
              <input
                placeholder="GSTIN (Optional)"
                value={client.gstin}
                onChange={(e) => setClient({ ...client, gstin: e.target.value })}
                className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
              />
              <button
                onClick={createOrder}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 transition-all hover:bg-indigo-500"
              >
                <IconReceipt2 className="size-4" />
                <span>Create Commercial Order & Print Tax Invoice</span>
              </button>
            </div>
          </div>
        )}

        {message && (
          <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-300">
            {message}
          </div>
        )}
      </section>
    </div>
  );
}

/* ─── Orders Page ───────────────────────────────────────────── */

function Orders({
  refreshKey,
  onChanged,
}: {
  refreshKey: number;
  onChanged?: () => void;
}) {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState("");

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api("/orders");
      setOrders(Array.isArray(data) ? data : data.orders || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(loadOrders, 0);
    return () => window.clearTimeout(timer);
  }, [loadOrders, refreshKey]);

  useEffect(() => {
    const openOrder = (event: any) => setSelected(event.detail);
    window.addEventListener("wms-open-order", openOrder);
    return () => window.removeEventListener("wms-open-order", openOrder);
  }, []);

  return (
    <DataState loading={loading} error={error}>
      {!orders.length ? (
        <div className="flex min-h-[300px] flex-col items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/60 p-8 text-center text-slate-400">
          <IconReceipt2 className="size-10 mb-2 text-slate-500" />
          <p className="text-sm font-semibold text-slate-300">No Orders Created Yet</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Create your first dispatch order from the Dispatch tab.
          </p>
        </div>
      ) : (
        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-md shadow-lg space-y-4">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800/80">
            <div>
              <h2 className="text-base font-bold text-white font-heading">
                Orders Register
              </h2>
              <p className="text-xs text-slate-400">
                Manage commercial transactions, status transitions, and payments
              </p>
            </div>
            <span className="rounded-full bg-slate-800 border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-300">
              {orders.length} Total Orders
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-400 font-semibold bg-slate-950/40">
                <tr>
                  <th className="py-3 px-4">Order ID</th>
                  <th className="py-3 px-4">Client</th>
                  <th className="py-3 px-4">Grand Total</th>
                  <th className="py-3 px-4">Payment Status</th>
                  <th className="py-3 px-4">Order Stage</th>
                  <th className="py-3 px-4">Created Date</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {orders.map((order) => (
                  <tr key={order._id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-white font-mono">
                      {order.orderNumber}
                    </td>
                    <td className="py-3.5 px-4">
                      <strong className="block text-slate-200">{order.client?.name}</strong>
                      <span className="text-[11px] text-slate-500">{order.client?.phone}</span>
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-200">
                      {currency(order.totalAmount)}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-500/15 text-indigo-300 border border-indigo-500/25">
                        {statusLabel(order.paymentStatus)}
                      </span>
                      <small className="block text-[10px] text-slate-400 mt-0.5">
                        Due {currency(order.balanceAmount)}
                      </small>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex flex-col gap-1 items-start">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold",
                            order.status === "DISPATCHED"
                              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25"
                              : order.status === "CANCELLED"
                              ? "bg-rose-500/15 text-rose-400 border border-rose-500/25"
                              : "bg-amber-500/15 text-amber-400 border border-amber-500/25",
                          )}
                        >
                          <span className="size-1.5 rounded-full bg-current" />
                          {statusLabel(order.status)}
                        </span>
                        {(order.isOverdue || (order.status === "PACKED" && order.balanceAmount > 0 && (order.daysPending ?? 0) >= 3)) && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/40 bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold text-rose-300 uppercase tracking-wider">
                            <span className="size-1 rounded-full bg-rose-500 animate-pulse" />
                            Overdue ({order.daysPending || 0}d)
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-slate-400">
                      {new Date(order.createdAt).toLocaleDateString("en-IN")}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setSelected(order._id)}
                          className="rounded-lg bg-indigo-600/20 border border-indigo-500/30 px-2.5 py-1 text-xs font-semibold text-indigo-300 hover:bg-indigo-600/40 transition-colors"
                        >
                          Details
                        </button>
                        <button
                          onClick={() =>
                            window.dispatchEvent(
                              new CustomEvent("wms-show-invoice", {
                                detail: buildInvoice(order),
                              }),
                            )
                          }
                          className="rounded-lg bg-slate-800 border border-slate-700 px-2.5 py-1 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition-colors"
                        >
                          Invoice
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {selected && (
        <OrderDetails
          orderId={selected}
          onClose={() => setSelected(null)}
          onChanged={() => {
            loadOrders();
            onChanged?.();
          }}
        />
      )}
    </DataState>
  );
}

/* ─── Order Details Drawer/Modal ────────────────────────────── */

function OrderDetails({
  orderId,
  onClose,
  onChanged,
}: {
  orderId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { isAdmin } = useAuth();
  const [order, setOrder] = useState<any>(null);
  const [payment, setPayment] = useState({
    amount: "",
    method: "UPI",
    paymentType: "ADVANCE",
    reference: "",
    notes: "",
  });
  const [showPayment, setShowPayment] = useState(false);
  const [message, setMessage] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [showInvoicePhoneModal, setShowInvoicePhoneModal] = useState(false);
  const [copiedInvoice, setCopiedInvoice] = useState(false);

  const load = useCallback(
    () =>
      api(`/orders/${orderId}`)
        .then(setOrder)
        .catch((err) => setMessage(err.message)),
    [orderId],
  );

  useEffect(() => {
    load();
  }, [load]);

  const action = async (path: string) => {
    try {
      await api(`/orders/${orderId}/${path}`, { method: "PATCH" });
      await load();
      onChanged();
    } catch (error: any) {
      setMessage(error.message);
    }
  };

  const recordPayment = async () => {
    try {
      await api(`/orders/${orderId}/payments`, {
        method: "POST",
        body: JSON.stringify(payment),
      });
      setPayment({
        amount: "",
        method: "UPI",
        paymentType: "PARTIAL",
        reference: "",
        notes: "",
      });
      setShowPayment(false);
      await load();
      onChanged();
    } catch (error: any) {
      setMessage(error.message);
    }
  };

  const handleSendWhatsApp = async () => {
    setPhoneError("");
    setFeedback("");
    const phoneCheck = normalizeIndianPhone(order.client?.phone);
    const msg = buildPaymentReminderMessage(
      order.client?.name,
      order.orderNumber,
      order.balanceAmount
    );

    if (!phoneCheck.valid) {
      setPhoneError(phoneCheck.error || "Invalid or missing phone number.");
      navigator.clipboard.writeText(msg).then(() => {
        setFeedback("Phone invalid: reminder message copied to clipboard!");
      });
      return;
    }

    const whatsappUrl = `https://wa.me/${phoneCheck.phone}?text=${encodeURIComponent(msg)}`;
    window.open(whatsappUrl, "_blank", "noopener,noreferrer");

    try {
      await api(`/orders/${orderId}/reminders`, {
        method: "POST",
        body: JSON.stringify({ channel: "WHATSAPP", note: "Sent WhatsApp payment reminder" }),
      });
      setFeedback("WhatsApp opened & reminder recorded in history!");
      await load();
      onChanged();
    } catch (err: any) {
      setFeedback(`WhatsApp launched, failed to log: ${err.message}`);
    }
  };

  const handleCopyMessage = () => {
    const msg = buildPaymentReminderMessage(
      order.client?.name,
      order.orderNumber,
      order.balanceAmount
    );
    navigator.clipboard.writeText(msg).then(() => {
      setFeedback("Reminder message copied to clipboard!");
    });
  };

  const handleLogCall = async () => {
    try {
      await api(`/orders/${orderId}/reminders`, {
        method: "POST",
        body: JSON.stringify({ channel: "CALL", note: "Phone call reminder" }),
      });
      setFeedback("Call reminder logged to history!");
      await load();
      onChanged();
    } catch (err: any) {
      setFeedback(`Failed to log call: ${err.message}`);
    }
  };

  const handleSendInvoiceWhatsApp = () => {
    const normalized = normalizePhone(order.client?.phone);
    const msg = buildInvoiceMessage(order);
    if (normalized) {
      openWhatsApp(normalized, msg);
    } else {
      setShowInvoicePhoneModal(true);
    }
  };

  const handleCopyInvoiceMessage = () => {
    const msg = buildInvoiceMessage(order);
    navigator.clipboard.writeText(msg).then(() => {
      setCopiedInvoice(true);
      setFeedback("Invoice details copied to clipboard!");
      setTimeout(() => setCopiedInvoice(false), 2500);
    });
  };

  if (!order) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center text-slate-300">
          Loading order details…
        </div>
      </div>
    );
  }

  const steps = ["PROCESSING", "ADVANCE_RECEIVED", "PACKED", "DISPATCHED"];
  const currentIndex = steps.indexOf(order.status);
  const invoice = buildInvoice(order);

  const openPayment = () => {
    const amount =
      order.totalPaid < order.advanceRequired
        ? order.advanceRequired - order.totalPaid
        : order.balanceAmount;
    setPayment((current) => ({
      ...current,
      amount: amount.toFixed(2),
      paymentType: order.totalPaid < order.advanceRequired ? "ADVANCE" : "FULL",
    }));
    setShowPayment(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-3xl rounded-2xl border border-slate-800 bg-[#0d1322] p-6 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-slate-800">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">
              ORDER LIFECYCLE
            </span>
            <h2 className="text-xl font-extrabold text-white font-heading">
              {order.orderNumber}
            </h2>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 mt-1">
              {statusLabel(order.status)}
            </span>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <IconX className="size-5" />
          </button>
        </div>

        {/* Client brief */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-xs space-y-1">
          <strong className="block text-sm text-slate-100">{order.client?.name}</strong>
          <p className="text-slate-400">Phone: {order.client?.phone}</p>
          <p className="text-slate-400">Address: {order.client?.address}</p>
        </div>

        {/* Items Table */}
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
            Order Items
          </h3>
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/50 text-[11px] uppercase tracking-wider text-slate-400 font-semibold border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-3">Product</th>
                  <th className="py-2.5 px-3">SKU</th>
                  <th className="py-2.5 px-3">Qty</th>
                  <th className="py-2.5 px-3">Unit Price</th>
                  <th className="py-2.5 px-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {order.items.map((item: any) => (
                  <tr key={item.sku}>
                    <td className="py-2.5 px-3 font-semibold text-slate-200">{item.name}</td>
                    <td className="py-2.5 px-3 text-slate-400">{item.sku}</td>
                    <td className="py-2.5 px-3 font-bold text-white">{item.quantity}</td>
                    <td className="py-2.5 px-3 text-slate-300">{currency(item.unitPrice)}</td>
                    <td className="py-2.5 px-3 text-right font-bold text-slate-200">
                      {currency(item.quantity * item.unitPrice)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Payment Summary, Payment Receipts & Reminder History */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 text-xs space-y-2">
            <h3 className="font-bold text-slate-300 uppercase tracking-wider text-[11px]">
              Financial Summary
            </h3>
            <div className="flex justify-between text-slate-400">
              <span>Order Total:</span>
              <strong className="text-slate-100">{currency(order.totalAmount)}</strong>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Advance ({order.advancePercentage}%):</span>
              <strong className="text-slate-100">{currency(order.advanceRequired)}</strong>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Total Paid:</span>
              <strong className="text-emerald-400">{currency(order.totalPaid)}</strong>
            </div>
            <div className="flex justify-between text-slate-400 border-t border-slate-800 pt-1">
              <span>Balance Due:</span>
              <strong className="text-amber-400">{currency(order.balanceAmount)}</strong>
            </div>
            {order.status === "PACKED" && (order.daysPending ?? 0) > 0 && (
              <div className="mt-2 rounded-lg border border-rose-500/20 bg-rose-500/10 p-2 text-[11px] text-rose-300">
                Packed {order.daysPending} days ago
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 text-xs space-y-2">
            <h3 className="font-bold text-slate-300 uppercase tracking-wider text-[11px]">
              Payment Receipts
            </h3>
            {order.payments?.length ? (
              <div className="space-y-1.5 divide-y divide-slate-800/60 max-h-44 overflow-y-auto">
                {order.payments.map((p: any) => (
                  <div key={p._id} className="pt-1.5 first:pt-0">
                    <div className="flex justify-between font-semibold text-slate-200">
                      <span>{p.paymentType} · {p.method}</span>
                      <span className="text-emerald-400 font-bold">{currency(p.amount)}</span>
                    </div>
                    <span className="text-[10px] text-slate-500">
                      {new Date(p.createdAt).toLocaleDateString("en-IN")} {p.reference ? `· ${p.reference}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-500">No payment receipts logged yet.</p>
            )}
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 text-xs space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-300 uppercase tracking-wider text-[11px]">
                Reminder History
              </h3>
              {order.lastReminderAt && (
                <span className="text-[10px] text-slate-400">
                  {formatDaysAgo(order.lastReminderAt)}
                </span>
              )}
            </div>
            {order.reminders?.length ? (
              <div className="space-y-1.5 divide-y divide-slate-800/60 max-h-44 overflow-y-auto">
                {order.reminders.map((r: any, idx: number) => (
                  <div key={idx} className="pt-1.5 first:pt-0 text-[11px]">
                    <div className="flex justify-between items-center text-slate-200">
                      <span className="font-semibold inline-flex items-center gap-1">
                        {r.channel === "WHATSAPP" && <IconBrandWhatsapp className="size-3 text-emerald-400" />}
                        {r.channel === "CALL" && <IconPhoneCall className="size-3 text-blue-400" />}
                        {r.channel === "EMAIL" && <IconSend className="size-3 text-amber-400" />}
                        {r.channel === "MANUAL" && <IconClock className="size-3 text-purple-400" />}
                        {r.channel}
                      </span>
                      <span className="text-[10px] text-slate-400 font-normal">
                        by {r.sentBy || "Staff"}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-[10px] text-slate-500 mt-0.5">
                      <span>{new Date(r.sentAt).toLocaleDateString("en-IN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                      {r.note && <span className="italic truncate max-w-[120px]">{r.note}</span>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-500">No payment reminders recorded yet.</p>
            )}
          </div>
        </div>

        {/* Fulfillment Pipeline Timeline */}
        <div className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Fulfillment Stage
          </h3>
          <div className="flex items-center justify-between gap-2">
            {steps.map((step, idx) => {
              const isPast = idx <= currentIndex;
              const isCurrent = step === order.status;
              return (
                <div key={step} className="flex-1 text-center">
                  <div
                    className={cn(
                      "mx-auto flex size-7 items-center justify-center rounded-full text-xs font-bold transition-all",
                      isPast
                        ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                        : "bg-slate-800 text-slate-500",
                      isCurrent && "ring-2 ring-indigo-400 ring-offset-2 ring-offset-slate-900",
                    )}
                  >
                    {isPast ? "✓" : idx + 1}
                  </div>
                  <span
                    className={cn(
                      "mt-1.5 block text-[10px] font-semibold uppercase tracking-wider",
                      isPast ? "text-indigo-300" : "text-slate-500",
                    )}
                  >
                    {statusLabel(step)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 pt-4 border-t border-slate-800">
          {order.status !== "DISPATCHED" && order.status !== "CANCELLED" && (
            <>
              <button
                onClick={openPayment}
                className="rounded-xl bg-slate-800 border border-slate-700 px-4 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700"
              >
                Record Payment
              </button>

              {order.status === "PACKED" && order.balanceAmount > 0 && (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={handleSendWhatsApp}
                    className="flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3.5 py-2 text-xs font-bold text-emerald-300 hover:border-emerald-500/60 hover:bg-emerald-500/25 transition-all shadow-sm"
                    title="Send WhatsApp payment reminder"
                  >
                    <IconBrandWhatsapp className="size-4 text-emerald-400" />
                    Send Reminder
                  </button>
                  <button
                    onClick={handleCopyMessage}
                    className="rounded-xl border border-slate-700 bg-slate-800 px-2.5 py-2 text-xs font-bold text-slate-300 hover:bg-slate-700 transition-all"
                    title="Copy reminder message"
                  >
                    <IconCopy className="size-3.5" />
                  </button>
                  <button
                    onClick={handleLogCall}
                    className="rounded-xl border border-slate-700 bg-slate-800 px-2.5 py-2 text-xs font-bold text-slate-300 hover:bg-slate-700 transition-all"
                    title="Log phone call reminder"
                  >
                    <IconPhoneCall className="size-3.5" />
                  </button>
                </div>
              )}

              {isAdmin && order.status === "PROCESSING" && (
                <button
                  onClick={() => action("confirm-payment")}
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-500 shadow-md shadow-indigo-600/30"
                >
                  Confirm Payment
                </button>
              )}

              {isAdmin && order.status === "ADVANCE_RECEIVED" && (
                <button
                  onClick={() => action("pack")}
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-500 shadow-md shadow-indigo-600/30"
                >
                  Pack Order
                </button>
              )}

              {isAdmin && order.status === "PACKED" && order.paymentStatus === "FULLY_PAID" && (
                <button
                  onClick={() => action("dispatch")}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500 shadow-md shadow-emerald-600/30"
                >
                  Dispatch Order
                </button>
              )}

              {isAdmin && (
                <button
                  onClick={() => action("cancel")}
                  className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-xs font-bold text-rose-400 hover:bg-rose-500/20"
                >
                  Cancel Order
                </button>
              )}
            </>
          )}

          <button
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent("wms-show-invoice", { detail: invoice }),
              )
            }
            className="rounded-xl bg-slate-800 border border-slate-700 px-4 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700"
          >
            View Tax Invoice
          </button>

          <button
            onClick={handleSendInvoiceWhatsApp}
            className="flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500 transition-all shadow-md shadow-emerald-600/20"
            title="Send invoice details on WhatsApp"
          >
            <IconBrandWhatsapp className="size-4" />
            <span>Send on WhatsApp</span>
          </button>

          <button
            onClick={handleCopyInvoiceMessage}
            className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition-all"
            title="Copy invoice message"
          >
            {copiedInvoice ? (
              <span className="flex items-center gap-1 text-emerald-400 font-bold">
                <IconCheck className="size-3.5" />
                Copied!
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <IconCopy className="size-3.5 text-slate-400" />
                Copy Invoice
              </span>
            )}
          </button>
        </div>

        {/* Feedback / Notification alerts */}
        {feedback && (
          <div className="flex items-center gap-2 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-3.5 py-2 text-xs text-indigo-300">
            <IconCheck className="size-4 text-indigo-400 shrink-0" />
            <span>{feedback}</span>
          </div>
        )}

        {phoneError && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2 text-xs text-rose-300">
            <div className="flex items-center gap-2">
              <IconAlertCircle className="size-4 text-rose-400 shrink-0" />
              <span>{phoneError} Cannot launch WhatsApp directly.</span>
            </div>
            <button
              onClick={handleCopyMessage}
              className="self-start sm:self-auto flex items-center gap-1 rounded-lg border border-rose-500/40 bg-rose-500/20 px-2.5 py-1 text-[11px] font-bold text-rose-200 hover:bg-rose-500/30 transition-all"
            >
              <IconCopy className="size-3" />
              Copy Message Instead
            </button>
          </div>
        )}

        {/* Record payment drawer inline */}
        {showPayment && (
          <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-4 space-y-3">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">
              Record Inward Payment
            </h4>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <input
                type="number"
                min="0.01"
                step="0.01"
                placeholder="Amount"
                value={payment.amount}
                onChange={(e) => setPayment({ ...payment, amount: e.target.value })}
                className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
              />
              <select
                value={payment.paymentType}
                onChange={(e) => setPayment({ ...payment, paymentType: e.target.value })}
                className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
              >
                <option value="ADVANCE">Advance</option>
                <option value="PARTIAL">Partial</option>
                <option value="FULL">Full</option>
              </select>
              <select
                value={payment.method}
                onChange={(e) => setPayment({ ...payment, method: e.target.value })}
                className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
              >
                <option value="UPI">UPI</option>
                <option value="CASH">Cash</option>
                <option value="BANK_TRANSFER">Bank transfer</option>
                <option value="CARD">Card</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <input
              placeholder="Reference / Transaction ID (Optional)"
              value={payment.reference}
              onChange={(e) => setPayment({ ...payment, reference: e.target.value })}
              className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
            />
            <button
              onClick={recordPayment}
              className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-500 shadow-md shadow-emerald-600/30"
            >
              Confirm Payment Receipt
            </button>
          </div>
        )}

        {message && (
          <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-300">
            {message}
          </div>
        )}

        <WhatsAppPhoneModal
          isOpen={showInvoicePhoneModal}
          initialPhone={order.client?.phone || ""}
          clientName={order.client?.name || "Client"}
          orderNumber={order.orderNumber}
          onSend={(validPhone) => {
            setShowInvoicePhoneModal(false);
            openWhatsApp(validPhone, buildInvoiceMessage(order));
          }}
          onCopy={handleCopyInvoiceMessage}
          onClose={() => setShowInvoicePhoneModal(false)}
          copied={copiedInvoice}
        />
      </div>
    </div>
  );
}

/* ─── Inventory Catalog Page ────────────────────────────────── */

function Inventory({ refreshKey }: { refreshKey: number }) {
  const [products, setProducts] = useState<any[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api("/products")
      .then(setProducts)
      .catch((err) => setError(err.message));
  }, [refreshKey]);

  const filtered = products.filter((product) =>
    `${product.name} ${product.sku} ${product.location}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );

  return (
    <DataState loading={!products.length && !error} error={error}>
      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-md shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-800/80">
          <div>
            <h2 className="text-base font-bold text-white font-heading">
              Inventory Registry
            </h2>
            <p className="text-xs text-slate-400">
              Live storage locations, current quantities, and replenishments
            </p>
          </div>

          <div className="relative w-full sm:w-72">
            <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
            <input
              placeholder="Search product, SKU, or bay…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-800/90 pl-9 pr-3 py-2 text-xs text-slate-100 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none"
            />
          </div>
        </div>

        <ProductTable products={filtered} />
      </section>
    </DataState>
  );
}

/* ─── Shared Product Table ──────────────────────────────────── */

function ProductTable({
  products,
  compact = false,
}: {
  products: any[];
  compact?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="bg-slate-950/40 text-[11px] uppercase tracking-wider text-slate-400 font-semibold border-b border-slate-800">
          <tr>
            <th className="py-3 px-4">Product Name</th>
            <th className="py-3 px-4">SKU Code</th>
            <th className="py-3 px-4">Physical Stock</th>
            <th className="py-3 px-4">Safety Minimum</th>
            <th className="py-3 px-4">Storage Bay</th>
            {!compact && <th className="py-3 px-4">Unit Selling Price</th>}
            <th className="py-3 px-4">Availability</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/60">
          {products.map((product) => (
            <tr key={product._id} className="hover:bg-slate-800/30 transition-colors">
              <td className="py-3 px-4">
                <div className="flex items-center gap-2.5">
                  <ProductIcon name={product.name} />
                  <strong className="text-sm font-semibold text-slate-200">
                    {product.name}
                  </strong>
                </div>
              </td>
              <td className="py-3 px-4 font-mono text-slate-400">{product.sku}</td>
              <td className="py-3 px-4 font-bold text-white text-sm tabular-nums">
                {product.stock}
              </td>
              <td className="py-3 px-4 text-slate-400 tabular-nums">{product.minimumStock}</td>
              <td className="py-3 px-4 text-slate-300">{product.location || "General Bay"}</td>
              {!compact && (
                <td className="py-3 px-4 font-semibold text-slate-200">
                  {currency(product.sellingPrice)}
                </td>
              )}
              <td className="py-3 px-4">
                <StatusBadge product={product} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Stock History Page ────────────────────────────────────── */

function History({ refreshKey }: { refreshKey: number }) {
  const [movements, setMovements] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [orders, setOrders] = useState<any[]>([]);

  useEffect(() => {
    api("/products/movements/history")
      .then(setMovements)
      .catch((err) => setError(err.message));
  }, [refreshKey]);

  useEffect(() => {
    api("/orders")
      .then((data) =>
        setOrders(
          (Array.isArray(data) ? data : data.orders || []).filter(
            (order: any) => order.status === "DISPATCHED",
          ),
        ),
      )
      .catch(() => {});
  }, [refreshKey]);

  return (
    <DataState loading={!movements.length && !error} error={error}>
      <div className="space-y-6">
        {/* Movements Ledger */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-md shadow-lg space-y-4">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800/80">
            <div>
              <h2 className="text-base font-bold text-white font-heading">
                Movement Audit Trail
              </h2>
              <p className="text-xs text-slate-400">
                Audited stock additions and deductions in chronological order
              </p>
            </div>
            <span className="rounded-full bg-slate-800 border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-300">
              {movements.length} Records
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/40 text-[11px] uppercase tracking-wider text-slate-400 font-semibold border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Product</th>
                  <th className="py-3 px-4">SKU</th>
                  <th className="py-3 px-4">Movement Type</th>
                  <th className="py-3 px-4">Quantity Units</th>
                  <th className="py-3 px-4">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {movements.map((movement) => (
                  <tr key={movement._id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 px-4 font-semibold text-slate-200">
                      {movement.product?.name || "Deleted Product"}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-400">
                      {movement.product?.sku || "—"}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold",
                          movement.type === "RECEIVE"
                            ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                            : "bg-rose-500/15 text-rose-400 border border-rose-500/30",
                        )}
                      >
                        {movement.type === "RECEIVE" ? "+" : "-"} {movement.type}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-bold text-white tabular-nums">
                      {movement.quantity}
                    </td>
                    <td className="py-3 px-4 text-slate-400">
                      {new Date(movement.createdAt).toLocaleString("en-IN")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Dispatch History Ledger */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-md shadow-lg space-y-4">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800/80">
            <div>
              <h2 className="text-base font-bold text-white font-heading">
                Fulfilled Dispatches Ledger
              </h2>
              <p className="text-xs text-slate-400">
                Orders successfully processed, packed, and handed to logistics
              </p>
            </div>
            <span className="rounded-full bg-slate-800 border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-300">
              {orders.length} Dispatched
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/40 text-[11px] uppercase tracking-wider text-slate-400 font-semibold border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Order ID</th>
                  <th className="py-3 px-4">Client Name</th>
                  <th className="py-3 px-4">Dispatched Units</th>
                  <th className="py-3 px-4">Commercial Value</th>
                  <th className="py-3 px-4">Payment</th>
                  <th className="py-3 px-4">Dispatched Date</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {orders.map((order) => (
                  <tr key={order._id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 px-4 font-bold text-white font-mono">
                      {order.orderNumber}
                    </td>
                    <td className="py-3 px-4 text-slate-200">{order.client?.name}</td>
                    <td className="py-3 px-4 font-semibold text-white">
                      {order.items.reduce((sum: number, item: any) => sum + item.quantity, 0)} units
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-200">
                      {currency(order.totalAmount)}
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                        {statusLabel(order.paymentStatus)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-400">
                      {new Date(order.dispatchedAt || order.createdAt).toLocaleDateString("en-IN")}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => {
                            window.dispatchEvent(
                              new CustomEvent("wms-navigate", { detail: "orders" }),
                            );
                            window.setTimeout(
                              () =>
                                window.dispatchEvent(
                                  new CustomEvent("wms-open-order", {
                                    detail: order._id,
                                  }),
                                ),
                              0,
                            );
                          }}
                          className="rounded-lg bg-indigo-600/20 border border-indigo-500/30 px-2.5 py-1 text-xs font-semibold text-indigo-300 hover:bg-indigo-600/40"
                        >
                          Details
                        </button>
                        <button
                          onClick={() =>
                            window.dispatchEvent(
                              new CustomEvent("wms-show-invoice", {
                                detail: buildInvoice(order),
                              }),
                            )
                          }
                          className="rounded-lg bg-slate-800 border border-slate-700 px-2.5 py-1 text-xs font-semibold text-slate-300 hover:bg-slate-700"
                        >
                          Invoice
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </DataState>
  );
}

/* ─── High-Fidelity Tax Invoice Print Modal ─────────────────── */

function Invoice({ invoice, onClose }: { invoice: any; onClose: () => void }) {
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [copied, setCopied] = useState(false);

  const subtotal = invoice.items.reduce(
    (sum: number, item: any) => sum + item.quantity * item.sellingPrice,
    0,
  );
  const formattedDate = invoice.date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  const handleSendWhatsApp = () => {
    const normalized = normalizePhone(invoice.client?.phone);
    const msg = buildInvoiceMessage(invoice);
    if (normalized) {
      openWhatsApp(normalized, msg);
    } else {
      setShowPhoneModal(true);
    }
  };

  const handleCopyInvoice = () => {
    const msg = buildInvoiceMessage(invoice);
    navigator.clipboard.writeText(msg).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm overflow-y-auto print-wrap">
      <article
        className="print-invoice-area relative w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 sm:p-7 text-slate-900 shadow-2xl max-h-[95vh] overflow-y-auto"
        aria-label="Tax invoice"
      >
        {/* Non-print control actions */}
        <div className="no-print mb-4 flex flex-wrap items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-xl border border-slate-300 bg-slate-100 px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 transition-colors"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handleCopyInvoice}
            className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 transition-colors"
            title="Copy invoice message"
          >
            {copied ? (
              <>
                <IconCheck className="size-3.5 text-emerald-600" />
                <span className="text-emerald-700 font-bold">Copied!</span>
              </>
            ) : (
              <>
                <IconCopy className="size-3.5 text-slate-600" />
                <span>Copy Message</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={handleSendWhatsApp}
            className="flex items-center gap-1.5 rounded-xl border border-emerald-600 bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-md hover:bg-emerald-500 transition-colors"
            title="Send invoice details to client on WhatsApp"
          >
            <IconBrandWhatsapp className="size-4" />
            <span>Send on WhatsApp</span>
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-md hover:bg-indigo-500 transition-colors"
          >
            <IconPrinter className="size-4" />
            <span>Print Tax Invoice</span>
          </button>
        </div>

        {/* Invoice Header */}
        <header className="flex items-start justify-between gap-4 border-b-2 border-slate-900 pb-3">
          <div className="flex items-center gap-3.5">
            <img
              src="/logo2.png"
              alt="Denika and Team Solutions"
              className="h-14 w-auto object-contain"
            />
            <div>
              <h1 className="text-lg font-black tracking-tight text-slate-950 font-heading">
                DENIKA AND TEAM SOLUTIONS
              </h1>
              <p className="text-[10px] font-bold tracking-widest text-slate-600 uppercase">
                OFFICIAL TAX INVOICE
              </p>
            </div>
          </div>

          <div className="text-right text-xs">
            <div className="font-mono text-sm font-black text-indigo-950">
              #{invoice.number}
            </div>
            <div className="text-slate-600 mt-0.5">Date: {formattedDate}</div>
            <div className="mt-1.5 inline-block rounded bg-slate-100 px-2 py-0.5 text-[9px] font-bold text-slate-800 border border-slate-200">
              GST REGISTERED
            </div>
          </div>
        </header>

        {/* Seller & Buyer Party Cards */}
        <section className="grid grid-cols-2 gap-4 py-3 text-xs border-b border-slate-200">
          <div className="rounded-lg bg-slate-50 p-2.5 border border-slate-200 space-y-0.5">
            <h3 className="text-[9px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
              SELLER / CONSIGNOR
            </h3>
            <strong className="block text-xs font-bold text-slate-900">
              {INVOICE_SELLER_DETAILS.name}
            </strong>
            <p className="text-[11px] text-slate-600">{INVOICE_SELLER_DETAILS.address}</p>
            <p className="text-[11px] text-slate-600">Phone: {INVOICE_SELLER_DETAILS.phone}</p>
            <p className="text-[11px] text-slate-600">Email: {INVOICE_SELLER_DETAILS.email}</p>
            <p className="text-[11px] font-semibold text-slate-800">
              GSTIN: {INVOICE_SELLER_DETAILS.gstin}
            </p>
          </div>

          <div className="rounded-lg bg-slate-50 p-2.5 border border-slate-200 space-y-0.5">
            <h3 className="text-[9px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
              BILL TO / CONSIGNEE
            </h3>
            <strong className="block text-xs font-bold text-slate-900">
              {invoice.client?.name}
            </strong>
            <p className="text-[11px] text-slate-600">Phone: {invoice.client?.phone}</p>
            <p className="text-[11px] text-slate-600">{invoice.client?.address}</p>
            {invoice.client?.gstin && (
              <p className="text-[11px] font-semibold text-slate-800">
                GSTIN: {invoice.client?.gstin}
              </p>
            )}
          </div>
        </section>

        {/* Line Items Table */}
        <section className="py-3">
          <table className="w-full text-left text-xs border border-slate-200">
            <thead className="bg-slate-100 text-[10px] uppercase font-bold text-slate-700 tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-1.5 px-3 w-10 text-center">#</th>
                <th className="py-1.5 px-3">Product Description</th>
                <th className="py-1.5 px-3">SKU</th>
                <th className="py-1.5 px-3 text-center">Qty</th>
                <th className="py-1.5 px-3 text-right">Unit Price</th>
                <th className="py-1.5 px-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {invoice.items.map((item: any, index: number) => (
                <tr key={item._id || item.sku}>
                  <td className="py-1.5 px-3 text-center text-slate-500">{index + 1}</td>
                  <td className="py-1.5 px-3 font-semibold text-slate-900">{item.name}</td>
                  <td className="py-1.5 px-3 text-slate-600 font-mono">{item.sku}</td>
                  <td className="py-1.5 px-3 text-center font-bold text-slate-900">{item.quantity}</td>
                  <td className="py-1.5 px-3 text-right font-mono">{invoiceCurrency(item.sellingPrice)}</td>
                  <td className="py-1.5 px-3 text-right font-bold text-slate-900 font-mono">
                    {invoiceCurrency(item.quantity * item.sellingPrice)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Invoice Summary Block */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 pt-2 border-t border-slate-200 text-xs">
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-2.5 space-y-0.5">
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">
              AMOUNT IN WORDS
            </span>
            <strong className="block text-xs text-slate-900 leading-snug">
              {amountInWords(invoice.total)}
            </strong>
          </div>

          <div className="space-y-1 text-right">
            <div className="flex justify-between text-slate-600 text-xs">
              <span>Subtotal:</span>
              <span className="font-mono">{invoiceCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between text-slate-600 text-xs">
              <span>Discount:</span>
              <span className="font-mono">{invoiceCurrency(0)}</span>
            </div>
            <div className="flex justify-between text-slate-600 text-xs">
              <span>Taxable Amount:</span>
              <span className="font-mono">{invoiceCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between text-slate-600 text-xs">
              <span>GST:</span>
              <span className="font-mono">{invoiceCurrency(0)}</span>
            </div>
            <div className="flex justify-between text-sm font-black text-slate-950 border-t-2 border-slate-900 pt-1.5">
              <span>GRAND TOTAL:</span>
              <span className="font-mono">{invoiceCurrency(invoice.total)}</span>
            </div>
          </div>
        </section>

        {/* Terms & Payment Conditions */}
        <section className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-[10px] grid grid-cols-2 sm:grid-cols-4 gap-2 text-slate-700">
          <div>
            <span className="block text-[9px] text-slate-500 uppercase font-bold">Advance</span>
            <strong className="text-slate-900">{invoice.advancePercentage || 30}% · {invoiceCurrency(invoice.advanceRequired || 0)}</strong>
          </div>
          <div>
            <span className="block text-[9px] text-slate-500 uppercase font-bold">Payment Status</span>
            <strong className="text-indigo-900">{statusLabel(invoice.paymentStatus)}</strong>
          </div>
          <div>
            <span className="block text-[9px] text-slate-500 uppercase font-bold">Total Paid</span>
            <strong className="text-emerald-800">{invoiceCurrency(invoice.totalPaid || 0)}</strong>
          </div>
          <div>
            <span className="block text-[9px] text-slate-500 uppercase font-bold">Balance Due</span>
            <strong className="text-rose-800">{invoiceCurrency(invoice.balanceAmount || 0)}</strong>
          </div>
        </section>

        {/* Signatures */}
        <footer className="mt-4 pt-3 border-t border-slate-200 flex items-end justify-between text-xs text-slate-600">
          <div>
            <p className="italic text-[11px]">Thank you for your business.</p>
            <p className="text-[9px] text-slate-400 mt-0.5">Computer-generated commercial invoice.</p>
          </div>
          <div className="text-right">
            <span className="text-[10px] font-bold text-slate-900">For Denika and Team Solutions</span>
            <div className="my-1 font-serif text-base italic text-slate-800">
              Denika and Team Solutions
            </div>
            <span className="text-[9px] text-slate-500">Authorized Signatory</span>
          </div>
        </footer>
      </article>

      <WhatsAppPhoneModal
        isOpen={showPhoneModal}
        initialPhone={invoice.client?.phone || ""}
        clientName={invoice.client?.name || "Client"}
        orderNumber={invoice.number}
        onSend={(validPhone) => {
          setShowPhoneModal(false);
          openWhatsApp(validPhone, buildInvoiceMessage(invoice));
        }}
        onCopy={handleCopyInvoice}
        onClose={() => setShowPhoneModal(false)}
        copied={copied}
      />
    </div>
  );
}

export default App;
