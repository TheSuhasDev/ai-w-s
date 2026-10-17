import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
const AI_API_URL = import.meta.env.VITE_AI_API_URL || import.meta.env.VITE_AI_URL || "http://127.0.0.1:8001";
// Replace these prototype values with verified seller details before commercial use.
const INVOICE_SELLER_DETAILS = {
  name: "DENIKA AND TEAM SOLUTIONS",
  address: "Bangalore, Karnataka, India",
  phone: "+91 98765 43210",
  email: "info@denikabusiness.com",
  gstin: "29ABCDE1234F1Z5",
};
const PRODUCT_CLASSES = {
  drill: "DRL001",
  hammer: "HAM001",
  pliers: "PLR001",
  screwdriver: "SCR001",
  wrench: "WRC001",
};
const AI_CONFIDENCE_THRESHOLD = 0.7;
const AI_STABLE_FRAMES = 3;
const currency = (value) =>
  `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const invoiceCurrency = (value) =>
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

function wordsBelowThousand(value) {
  if (value < 20) return numberWords[value];
  if (value < 100) return `${tensWords[Math.floor(value / 10)]}${value % 10 ? ` ${numberWords[value % 10]}` : ""}`;
  return `${numberWords[Math.floor(value / 100)]} Hundred${value % 100 ? ` ${wordsBelowThousand(value % 100)}` : ""}`;
}

function amountInWords(value) {
  const amount = Math.round(Number(value) || 0);
  if (!amount) return "Rupees Zero Only";
  const parts = [];
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

async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options,
    });

  } catch (error) {
    throw new Error("Unable to reach the warehouse server. Check that the Express backend is running.", { cause: error });
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const serverMessage = typeof data.message === "string" ? data.message : "";
    throw new Error(serverMessage || "Warehouse request failed");
  }
  return data;
}

async function predictImage(blob, signal) {
  const form = new FormData();
  form.append("file", blob, "warehouse-frame.jpg");
  let response;
  try {
    response = await fetch(`${AI_API_URL}/predict`, { method: "POST", body: form, signal });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    console.error("Vision prediction network error", {
      endpoint: `${AI_API_URL}/predict`,
      errorName: error.name,
    });
    throw new Error("Vision service unavailable. Make sure the backend server is running.", { cause: error });
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

function App() {
  const [activePage, setActivePage] = useState("dashboard");
  const [refreshKey, setRefreshKey] = useState(0);
  const [invoicePreview, setInvoicePreview] = useState(null);
  const refresh = () => setRefreshKey((key) => key + 1);
  useEffect(() => {
    const navigate = (event) => setActivePage(event.detail);
    const showInvoice = (event) => setInvoicePreview(event.detail);
    window.addEventListener("wms-navigate", navigate);
    window.addEventListener("wms-show-invoice", showInvoice);
    return () => { window.removeEventListener("wms-navigate", navigate); window.removeEventListener("wms-show-invoice", showInvoice); };
  }, []);

  const pageTitles = {
    dashboard: ["Dashboard", "Operational overview and warehouse activity"],
    receive: ["Receive stock", "Use vision camera to count incoming tools"],
    dispatch: ["Dispatch stock", "Build an order, verify inventory, and create an invoice"],
    orders: ["Orders", "Track payment, packing, and dispatch lifecycle"],
    inventory: ["Inventory", "Current stock levels and storage locations"],
    history: ["Stock history", "Auditable receive and dispatch movements"],
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <img className="sidebar-logo" src="/logo1.png" alt="Denika and Team Solutions" />
        </div>
        <nav>
          {[
            ["dashboard", "Dashboard", "▦"],
            ["receive", "Receive", "↓"],
            ["dispatch", "Dispatch", "↑"],
            ["orders", "Orders", "◫"],
            ["inventory", "Inventory", "▤"],
            ["history", "Stock history", "◷"],
          ].map(([page, label, icon]) => (
            <button className={activePage === page ? "active" : ""} key={page} onClick={() => setActivePage(page)}>
              <span className="nav-icon">{icon}</span>{label}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer"><span className="status-dot" /> Systems online</div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div><p className="eyebrow">WAREHOUSE CONTROL CENTER</p><h1>{pageTitles[activePage][0]}</h1><p>{pageTitles[activePage][1]}</p></div>
          <div className="header-tools">
            <div className="date-chip">{new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</div>
          </div>
        </header>
        {activePage === "dashboard" && <Dashboard refreshKey={refreshKey} />}
        {activePage === "receive" && <Receive onChanged={refresh} />}
        {activePage === "dispatch" && <Dispatch onChanged={refresh} />}
        {activePage === "orders" && <Orders refreshKey={refreshKey} />}
        {activePage === "inventory" && <Inventory refreshKey={refreshKey} />}
        {activePage === "history" && <History refreshKey={refreshKey} />}
      </main>
      {invoicePreview && <Invoice invoice={invoicePreview} onClose={() => setInvoicePreview(null)} />}
    </div>
  );
}

function DataState({ error, loading, children }) {
  if (loading) return <div className="panel state">Loading warehouse data…</div>;
  if (error) return <div className="panel state error-state">{error}</div>;
  return children;
}

function Dashboard({ refreshKey }) {
  const [data, setData] = useState(null);
  const [products, setProducts] = useState([]);
  const [error, setError] = useState("");
  useEffect(() => {
    Promise.all([api("/products/dashboard"), api("/products")])
      .then(([dashboard, inventory]) => { setData(dashboard); setProducts(inventory); })
      .catch((err) => setError(err.message));
  }, [refreshKey]);
  if (error) return <div className="panel state error-state">{error}</div>;
  if (!data) return <div className="panel state">Loading warehouse data…</div>;
  return (
    <DataState>
      <div className="metric-grid">
        <Metric label="Total products" value={data.totalProducts} hint="SKUs in catalogue" icon="▤" />
        <Metric label="Units in stock" value={data.totalStock} hint="Across all locations" icon="▦" />
        <Metric label="Low stock alerts" value={data.lowStockProducts} hint="Needs replenishment" icon="!" tone="warning" />
        <Metric label="Today's dispatch" value={data.todayDispatchCount} hint="Completed movements" icon="↑" />
      </div>
      <div className="dashboard-grid">
        <section className="panel">
          <SectionHeader title="Recent activity" action="Live movement ledger" />
          <MovementList movements={data.recentMovements} />
        </section>
        <section className="panel">
          <SectionHeader title="Low stock items" action="Needs attention" />
          {products.filter((product) => product.stock <= product.minimumStock).length ? (
            <div className="low-stock-list">{products.filter((product) => product.stock <= product.minimumStock).map((product) => <div className="low-stock-row" key={product._id}><ProductIcon name={product.name} /><div><strong>{product.name}</strong><small>{product.location}</small></div><span>{product.stock} / {product.minimumStock}</span></div>)}</div>
          ) : <div className="empty compact-empty"><span className="empty-icon">✓</span><strong>All stock levels healthy</strong><small>No replenishment action required.</small></div>}
        </section>
      </div>
      <section className="panel inventory-overview">
        <SectionHeader title="Inventory overview" action="View all inventory →" />
        <ProductTable products={products} compact />
      </section>
    </DataState>
  );
}

function Metric({ label, value, hint, icon, tone = "" }) {
  const [displayValue, setDisplayValue] = useState(0);
  useEffect(() => {
    const target = Number(value) || 0;
    const start = performance.now();
    let frame;
    const animate = (now) => {
      const progress = Math.min((now - start) / 450, 1);
      setDisplayValue(Math.round(target * (1 - ((1 - progress) ** 3))));
      if (progress < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return <div className={`metric ${tone}`}><span className="metric-icon">{icon}</span><div><span>{label}</span><strong>{displayValue}</strong><small>{hint}</small></div></div>;
}

function SectionHeader({ title, action }) {
  return <div className="section-header"><h2>{title}</h2><span>{action}</span></div>;
}

function MovementList({ movements = [] }) {
  if (!movements.length) return <div className="empty">No stock movements recorded yet.</div>;
  return <div className="movement-list">{movements.map((movement) => <div className="movement" key={movement._id}><span className={`movement-icon ${movement.type.toLowerCase()}`}>{movement.type === "RECEIVE" ? "↓" : "↑"}</span><div><strong>{movement.product?.name || "Deleted product"}</strong><small>{movement.type} · {new Date(movement.createdAt).toLocaleString()}</small></div><b className={movement.type === "RECEIVE" ? "positive" : "negative"}>{movement.type === "RECEIVE" ? "+" : "-"}{movement.quantity}</b></div>)}</div>;
}

function ProductIcon({ name }) {
  const icons = { Drill: "╱", Hammer: "⌁", Pliers: "⌘", Screwdriver: "⌕", Wrench: "∿" };
  return <span className="product-icon" aria-hidden="true">{icons[name] || "•"}</span>;
}

function StatusBadge({ product }) {
  const status = product.stock === 0 ? "OUT OF STOCK" : product.stock <= product.minimumStock ? "LOW STOCK" : "IN STOCK";
  return <span className={`badge ${status.toLowerCase().replaceAll(" ", "-")}`}>{status}</span>;
}

function CameraScanner({ onDetections, active, onError }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const requestRef = useRef(null);
  const busyRef = useRef(false);
  const stabilityRef = useRef({ product: null, count: 0, detection: null });
  const [status, setStatus] = useState("Camera is off");
  const [detections, setDetections] = useState([]);

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
    setStatus("Camera is off");
  }, []);

  const scan = useCallback(async () => {
    if (!videoRef.current || busyRef.current || videoRef.current.readyState < 2) return;
    busyRef.current = true;
    const controller = new AbortController();
    requestRef.current = controller;
    try {
      const video = videoRef.current;
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      canvas.getContext("2d").drawImage(video, 0, 0);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.78));
      if (!blob || controller.signal.aborted) return;
      const result = await predictImage(blob, controller.signal);
      const next = (result.detections || []).filter((item) => item.confidence >= AI_CONFIDENCE_THRESHOLD);
      const candidate = next.sort((left, right) => right.confidence - left.confidence)[0];
      const state = stabilityRef.current;
      if (!candidate) {
        stabilityRef.current = { product: null, count: 0, detection: null };
        setDetections([]);
        onDetections([]);
        setStatus("NO VALID PRODUCT DETECTED");
      } else if (state.product === candidate.product) {
        state.count += 1;
        state.detection = candidate;
        const stable = state.count >= AI_STABLE_FRAMES ? [candidate] : [];
        setDetections(stable);
        onDetections(stable);
        setStatus(state.count >= AI_STABLE_FRAMES
          ? `${candidate.product.toUpperCase()} · ${(candidate.confidence * 100).toFixed(0)}% · VALID DETECTION`
          : `Stabilizing ${candidate.product} (${state.count}/${AI_STABLE_FRAMES})`);
      } else {
        stabilityRef.current = { product: candidate.product, count: 1, detection: candidate };
        setDetections([]);
        onDetections([]);
        setStatus(`Stabilizing ${candidate.product} (1/${AI_STABLE_FRAMES})`);
      }
    } catch (error) {
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
        const stream = await navigator.mediaDevices?.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (!stream) throw new Error("Camera is not available.");
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setStatus("Camera ready");
        timerRef.current = setInterval(scan, 1200);
      } catch (error) {
        if (!cancelled) onError?.(error.message || "Camera permission was denied or no camera is available.");
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

  return <div className="camera-wrap"><div className="camera-frame"><video ref={videoRef} autoPlay playsInline muted /><div className="scan-region" />{detections.map((d, index) => <span className="detection-tag" key={`${d.product}-${index}`} style={{ left: `${(d.box?.x1 || 0) / 6}%`, top: `${(d.box?.y1 || 0) / 5}%` }}>{d.product} {(d.confidence * 100).toFixed(0)}%</span>)}</div><div className="camera-status"><span className="status-dot" />{status}</div></div>;
}

function Receive({ onChanged }) {
  const [active, setActive] = useState(false);
  const [products, setProducts] = useState([]);
  const locks = useRef([]);
  const [lastResult, setLastResult] = useState(null);
  const [message, setMessage] = useState("");
  useEffect(() => { api("/products").then(setProducts).catch((err) => setMessage(err.message)); }, [lastResult]);

  const handleDetections = useCallback(async (detections) => {
    const nextLocks = [];
    for (const detection of detections) {
      const center = { x: ((detection.box?.x1 || 0) + (detection.box?.x2 || 0)) / 2, y: ((detection.box?.y1 || 0) + (detection.box?.y2 || 0)) / 2 };
      const existing = locks.current.find((lock) => lock.product === detection.product && Math.hypot(lock.x - center.x, lock.y - center.y) < 100);
      if (existing) { nextLocks.push({ ...existing, x: center.x, y: center.y }); continue; }
      nextLocks.push({ product: detection.product, x: center.x, y: center.y });
      const product = products.find((item) => item.sku === PRODUCT_CLASSES[detection.product]);
      if (!product) continue;
      try {
        const result = await api(`/products/${product._id}/receive`, { method: "PATCH", body: JSON.stringify({ quantity: 1 }) });
        setLastResult({ name: product.name, confidence: detection.confidence, stock: result.product.stock });
        onChanged();
      } catch (error) { setMessage(error.message); }
    }
    locks.current = nextLocks;
  }, [onChanged, products]);

  return <div className="scanner-layout"><section className="panel scanner-panel"><SectionHeader title="Receiving station" action="Confidence threshold 70% · 3 stable frames" />{!active ? <div className="camera-placeholder"><div className="camera-symbol">◉</div><h2>Camera Scanner</h2><p>Point the camera at a warehouse product. Stable detections are counted once until the product leaves the frame.</p><button className="button primary" onClick={() => { setMessage(""); setActive(true); }}>Start camera</button></div> : <><CameraScanner active={active} onDetections={handleDetections} onError={setMessage} /><button className="button secondary" onClick={() => setActive(false)}>Stop camera</button></>}</section><section className="panel result-panel"><p className="eyebrow">LATEST RECEIVE</p>{lastResult ? <><div className="detection-card"><ProductIcon name={lastResult.name} /><div><span>Detected product</span><h2>{lastResult.name}</h2><small>SKU {PRODUCT_CLASSES[lastResult.name.toLowerCase()] || "—"}</small></div><span className="result-check">✓</span></div><div className="confidence-row"><span>Confidence</span><strong>{(lastResult.confidence * 100).toFixed(1)}%</strong></div><div className="stock-result"><span>+1 stock added · Updated stock</span><strong>{lastResult.stock} units</strong></div></> : <div className="empty"><span className="empty-icon">◉</span><strong>NO VALID PRODUCT DETECTED</strong><small>Hold one supported tool inside the scan area for three stable frames.</small></div>}{message && <div className="inline-error">{message}</div>}</section></div>;
}

function Dispatch({ onChanged }) {
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [active, setActive] = useState(false);
  const [client, setClient] = useState({ name: "", phone: "", address: "", gstin: "" });
  const [message, setMessage] = useState("");
  const [recentOrders, setRecentOrders] = useState([]);
  const locks = useRef([]);
  useEffect(() => { api("/products").then(setProducts).catch((err) => setMessage(err.message)); }, []);
  useEffect(() => { api("/orders").then((data) => setRecentOrders(Array.isArray(data) ? data.slice(0, 5) : data.orders?.slice(0, 5) || [])).catch(() => {}); }, [onChanged]);
  const addDetection = useCallback((detections) => {
    const nextLocks = [];
    detections.forEach((detection) => {
      const x = ((detection.box?.x1 || 0) + (detection.box?.x2 || 0)) / 2;
      const y = ((detection.box?.y1 || 0) + (detection.box?.y2 || 0)) / 2;
      const existing = locks.current.find((lock) => lock.product === detection.product && Math.hypot(lock.x - x, lock.y - y) < 100);
      nextLocks.push({ product: detection.product, x, y });
      if (existing) return;
      const product = products.find((item) => item.sku === PRODUCT_CLASSES[detection.product]);
      if (!product) return;
      setCart((current) => { const found = current.find((item) => item._id === product._id); return found ? current.map((item) => item._id === product._id ? { ...item, quantity: item.quantity + 1 } : item) : [...current, { ...product, quantity: 1 }]; });
    });
    locks.current = nextLocks;
  }, [products]);
  const updateQuantity = (id, value) => setCart((current) => current.map((item) => item._id === id ? { ...item, quantity: Math.max(1, Number(value) || 1) } : item));
  const total = cart.reduce((sum, item) => sum + item.quantity * item.sellingPrice, 0);
  const createOrder = async () => {
    if (!client.name.trim() || !client.phone.trim() || !client.address.trim()) return setMessage("Enter client name, phone, and address before confirming.");
    if (!cart.length) return setMessage("Add at least one product to the order cart.");
    try {
      const created = await api("/orders", { method: "POST", body: JSON.stringify({ client, items: cart.map((item) => ({ productId: item._id, quantity: item.quantity })) }) });
      window.dispatchEvent(new CustomEvent("wms-show-invoice", { detail: buildInvoice(created.order || created) }));
      setCart([]); setClient({ name: "", phone: "", address: "", gstin: "" }); onChanged(); setMessage("");
      window.dispatchEvent(new CustomEvent("wms-navigate", { detail: "orders" }));
    } catch (error) { setMessage(error.message); }
  };
  return <div className="dispatch-layout"><section className="panel scanner-panel"><SectionHeader title="Dispatch scanner" action="Order creation does not reduce stock" />{!active ? <div className="camera-placeholder compact"><div className="camera-symbol">◉</div><h2>Camera Scanner</h2><p>Identify tools and add them to the temporary order cart.</p><button className="button primary" onClick={() => { setMessage(""); setActive(true); }}>Start camera</button></div> : <><CameraScanner active={active} onDetections={addDetection} onError={setMessage} /><button className="button secondary" onClick={() => setActive(false)}>Stop camera</button></>}</section><section className="panel cart-panel"><SectionHeader title="New order cart" action={`${cart.reduce((sum, item) => sum + item.quantity, 0)} units`} />{cart.length ? <div className="cart-items">{cart.map((item) => <div className="cart-item" key={item._id}><div><strong>{item.name}</strong><small>{item.sku} · {currency(item.sellingPrice)} each · stock {item.stock}</small></div><input type="number" min="1" value={item.quantity} onChange={(event) => updateQuantity(item._id, event.target.value)} /><button className="icon-button" onClick={() => setCart((current) => current.filter((entry) => entry._id !== item._id))}>×</button></div>)}</div> : <div className="empty">Your cart is empty. Use the camera or add a product manually below.</div>}<select className="field" value="" onChange={(event) => { const product = products.find((item) => item._id === event.target.value); if (product) setCart((current) => [...current, { ...product, quantity: 1 }]); }}><option value="">+ Add product manually</option>{products.map((product) => <option key={product._id} value={product._id}>{product.name} · {product.stock} in stock</option>)}</select>{cart.length > 0 && <><div className="total-row"><span>Order total</span><strong>{currency(total)}</strong></div><div className="client-form"><p className="eyebrow">CLIENT DETAILS</p><input className="field" placeholder="Client / company name *" value={client.name} onChange={(e) => setClient({ ...client, name: e.target.value })} /><input className="field" placeholder="Phone number *" value={client.phone} onChange={(e) => setClient({ ...client, phone: e.target.value })} /><textarea className="field" placeholder="Delivery address *" value={client.address} onChange={(e) => setClient({ ...client, address: e.target.value })} /><input className="field" placeholder="GSTIN (optional)" value={client.gstin} onChange={(e) => setClient({ ...client, gstin: e.target.value })} /><button className="button primary" onClick={createOrder}>Create order</button></div></>}</section><section className="panel"><SectionHeader title="Recent orders" action="Invoice access" />{recentOrders.map((order) => <div className="recent-order-row" key={order._id}><div><strong>{order.orderNumber}</strong><small>{order.client.name} · {statusLabel(order.status)}</small></div><button className="link-button" onClick={() => window.dispatchEvent(new CustomEvent("wms-show-invoice", { detail: buildInvoice(order) }))}>View invoice</button></div>)}</section>{message && <div className="toast error-state">{message}</div>}</div>;
}

function buildInvoice(order) {
  const source = order.order || order;
  return { number: source.orderNumber, date: new Date(source.createdAt), client: source.client, items: source.items.map((item) => ({ ...item, sellingPrice: item.unitPrice })), total: source.totalAmount, paymentStatus: source.paymentStatus, totalPaid: source.totalPaid, balanceAmount: source.balanceAmount, advancePercentage: source.advancePercentage, advanceRequired: source.advanceRequired };
}

function Invoice({ invoice, onClose }) {
  const subtotal = invoice.items.reduce((sum, item) => sum + item.quantity * item.sellingPrice, 0);
  const formattedDate = invoice.date.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });
  return (
    <div className="invoice-overlay">
      <article className="invoice print-invoice" aria-label="Tax invoice">
        <div className="invoice-actions">
          <button className="button secondary" onClick={onClose}>Close</button>
          <button className="button primary" onClick={() => window.print()}>Print invoice</button>
        </div>
        <header className="invoice-header">
          <div>
            <img className="invoice-logo" src="/logo2.png" alt="Denika and Team Solutions" />
            <p className="invoice-company">DENIKA AND TEAM SOLUTIONS</p>
            <p className="invoice-document-title">TAX INVOICE</p>
          </div>
          <dl className="invoice-meta">
            <div><dt>Invoice No</dt><dd>{invoice.number}</dd></div>
            <div><dt>Invoice Date</dt><dd>{formattedDate}</dd></div>
          </dl>
        </header>

        <div className="invoice-rule" />
        <section className="invoice-parties">
          <div className="invoice-party">
            <h3>SELLER DETAILS</h3>
            <strong>{INVOICE_SELLER_DETAILS.name}</strong>
            <span>{INVOICE_SELLER_DETAILS.address}</span>
            <span>Phone: {INVOICE_SELLER_DETAILS.phone}</span>
            <span>Email: {INVOICE_SELLER_DETAILS.email}</span>
            <span>GSTIN: {INVOICE_SELLER_DETAILS.gstin}</span>
          </div>
          <div className="invoice-party">
            <h3>BILL TO</h3>
            <strong>{invoice.client.name}</strong>
            <span>Phone: {invoice.client.phone}</span>
            <span>{invoice.client.address}</span>
            {invoice.client.gstin && <span>GSTIN: {invoice.client.gstin}</span>}
          </div>
        </section>

        <table className="invoice-table">
          <thead><tr><th>Sl. No.</th><th>Product Description</th><th>SKU</th><th>Qty</th><th>Unit Price</th><th>Amount</th></tr></thead>
          <tbody>{invoice.items.map((item, index) => (
            <tr key={item._id || item.sku}>
              <td>{index + 1}</td><td className="invoice-product">{item.name}</td><td>{item.sku}</td><td>{item.quantity}</td>
              <td>{invoiceCurrency(item.sellingPrice)}</td><td>{invoiceCurrency(item.quantity * item.sellingPrice)}</td>
            </tr>
          ))}</tbody>
        </table>

        <div className="invoice-summary">
          <div className="amount-words"><span>Amount in Words:</span><strong>{amountInWords(invoice.total)}</strong></div>
          <dl className="invoice-totals">
            <div><dt>Subtotal</dt><dd>{invoiceCurrency(subtotal)}</dd></div>
            <div><dt>Discount</dt><dd>{invoiceCurrency(0)}</dd></div>
            <div><dt>Taxable Amount</dt><dd>{invoiceCurrency(subtotal)}</dd></div>
            <div><dt>GST</dt><dd>{invoiceCurrency(0)}</dd></div>
            <div className="grand-total"><dt>GRAND TOTAL</dt><dd>{invoiceCurrency(invoice.total)}</dd></div>
          </dl>
        </div>

        <section className="invoice-terms">
          <div><strong>Advance:</strong> <span>{invoice.advancePercentage || 30}% · {invoiceCurrency(invoice.advanceRequired || 0)}</span></div>
          <div><strong>Payment Terms:</strong> <span>Full payment before dispatch</span></div>
          <div><strong>Payment Status:</strong> <span>{statusLabel(invoice.paymentStatus)}</span></div>
          <div><strong>Total Paid:</strong> <span>{invoiceCurrency(invoice.totalPaid || 0)}</span></div>
          <div><strong>Balance Due:</strong> <span>{invoiceCurrency(invoice.balanceAmount || 0)}</span></div>
        </section>
        <footer className="invoice-footer">
          <p>Thank you for your business.</p>
          <div><strong>For Denika and Team Solutions</strong><span className="sample-signature" aria-label="Sample digital signature">Denika and Team Solutions</span><span>Authorized Signatory</span></div>
        </footer>
      </article>
    </div>
  );
}

const statusLabel = (status) => status?.replaceAll("_", " ") || "—";

function Orders({ refreshKey }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState("");
  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api("/orders");
      setOrders(Array.isArray(data) ? data : data.orders || []);
    } catch (err) {
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
    const openOrder = (event) => setSelected(event.detail);
    window.addEventListener("wms-open-order", openOrder);
    return () => window.removeEventListener("wms-open-order", openOrder);
  }, []);
  return <DataState loading={loading} error={error}>{!orders.length ? <div className="panel state">No orders have been created yet.</div> : <section className="panel"><SectionHeader title="Order register" action={`${orders.length} orders`} /><div className="table-scroll"><table className="data-table orders-table"><thead><tr><th>Order</th><th>Client</th><th>Total</th><th>Payment</th><th>Order status</th><th>Created</th><th>Actions</th></tr></thead><tbody>{orders.map((order) => <tr key={order._id}><td><strong>{order.orderNumber}</strong></td><td>{order.client.name}<small className="table-subtext">{order.client.phone}</small></td><td>{currency(order.totalAmount)}</td><td><span className="badge payment-badge">{statusLabel(order.paymentStatus)}</span><small className="table-subtext">Due {currency(order.balanceAmount)}</small></td><td><span className={`badge order-${order.status.toLowerCase()}`}>{statusLabel(order.status)}</span></td><td>{new Date(order.createdAt).toLocaleDateString("en-IN")}</td><td className="row-actions"><button className="link-button" onClick={() => setSelected(order._id)}>View details</button><button className="link-button" onClick={() => window.dispatchEvent(new CustomEvent("wms-show-invoice", { detail: buildInvoice(order) }))}>View invoice</button></td></tr>)}</tbody></table></div></section>}{selected && <OrderDetails orderId={selected} onClose={() => setSelected(null)} onChanged={loadOrders} />}</DataState>;
}

function OrderDetails({ orderId, onClose, onChanged }) {
  const [order, setOrder] = useState(null);
  const [payment, setPayment] = useState({ amount: "", method: "UPI", paymentType: "ADVANCE", reference: "", notes: "" });
  const [showPayment, setShowPayment] = useState(false);
  const [message, setMessage] = useState("");
  const load = useCallback(() => api(`/orders/${orderId}`).then(setOrder).catch((err) => setMessage(err.message)), [orderId]);
  useEffect(() => { load(); }, [load]);
  const action = async (path) => {
    try { await api(`/orders/${orderId}/${path}`, { method: "PATCH" }); await load(); onChanged(); }
    catch (error) { setMessage(error.message); }
  };
  const recordPayment = async () => {
    try {
      await api(`/orders/${orderId}/payments`, { method: "POST", body: JSON.stringify(payment) });
      setPayment({ amount: "", method: "UPI", paymentType: "PARTIAL", reference: "", notes: "" }); setShowPayment(false); await load(); onChanged();
    } catch (error) { setMessage(error.message); }
  };
  if (!order) return <div className="modal-overlay"><div className="panel order-modal">Loading order…</div></div>;
  const steps = ["PROCESSING", "ADVANCE_RECEIVED", "PACKED", "DISPATCHED"];
  const currentIndex = steps.indexOf(order.status);
  const invoice = buildInvoice(order);
  const openPayment = () => {
    const amount = order.totalPaid < order.advanceRequired ? order.advanceRequired - order.totalPaid : order.balanceAmount;
    setPayment((current) => ({ ...current, amount: amount.toFixed(2), paymentType: order.totalPaid < order.advanceRequired ? "ADVANCE" : "FULL" }));
    setShowPayment(true);
  };
  return <div className="modal-overlay"><div className="panel order-modal"><div className="modal-header"><div><p className="eyebrow">ORDER DETAILS</p><h2>{order.orderNumber}</h2><span className={`badge order-${order.status.toLowerCase()}`}>{statusLabel(order.status)}</span></div><button className="icon-button" onClick={onClose}>×</button></div><div className="order-client-summary"><strong>{order.client.name}</strong><span>{order.client.phone}</span><span>{order.client.address}</span></div><section className="order-detail-section"><h3>Items</h3><table className="data-table"><thead><tr><th>Product</th><th>SKU</th><th>Qty</th><th>Unit price</th><th>Amount</th></tr></thead><tbody>{order.items.map((item) => <tr key={item.sku}><td>{item.name}</td><td>{item.sku}</td><td>{item.quantity}</td><td>{currency(item.unitPrice)}</td><td>{currency(item.quantity * item.unitPrice)}</td></tr>)}</tbody></table></section><section className="order-detail-grid"><div className="order-detail-section"><h3>Payment summary</h3><div className="summary-line"><span>Order total</span><strong>{currency(order.totalAmount)}</strong></div><div className="summary-line"><span>Advance required ({order.advancePercentage}%)</span><strong>{currency(order.advanceRequired)}</strong></div><div className="summary-line"><span>Total paid</span><strong>{currency(order.totalPaid)}</strong></div><div className="summary-line"><span>Balance due</span><strong>{currency(order.balanceAmount)}</strong></div><div className="summary-line"><span>Status</span><span className="badge payment-badge">{statusLabel(order.paymentStatus)}</span></div></div><div className="order-detail-section"><h3>Payment history</h3>{order.payments?.length ? order.payments.map((item) => <div className="payment-history-row" key={item._id}><span>{new Date(item.createdAt).toLocaleDateString("en-IN")} · {item.paymentType}</span><strong>{currency(item.amount)}</strong><small>{item.method}{item.reference ? ` · ${item.reference}` : ""}</small></div>) : <div className="empty compact-empty">No payments recorded.</div>}</div></section><section className="order-detail-section"><h3>Order timeline</h3><div className="order-timeline">{steps.map((step, index) => <div className={`timeline-step ${index <= currentIndex ? "complete" : ""} ${step === order.status ? "current" : ""}`} key={step}><span>{index <= currentIndex ? "✓" : index + 1}</span><small>{statusLabel(step)}</small></div>)}</div></section><div className="order-actions">{order.status !== "DISPATCHED" && order.status !== "CANCELLED" && <><button className="button secondary" onClick={openPayment}>Record payment</button>{order.status === "ADVANCE_RECEIVED" && <button className="button primary" onClick={() => action("pack")}>Pack order</button>}{order.status === "PACKED" && order.paymentStatus === "FULLY_PAID" && <button className="button primary" onClick={() => action("dispatch")}>Dispatch order</button>}<button className="button danger-button" onClick={() => action("cancel")}>Cancel order</button></>}{<button className="button secondary" onClick={() => window.dispatchEvent(new CustomEvent("wms-show-invoice", { detail: invoice }))}>View invoice</button>}{order.status === "CANCELLED" && <button className="button primary" onClick={onClose}>Close</button>}</div>{message && <div className="inline-error">{message}</div>}{showPayment && <div className="payment-form"><h3>Record payment</h3><input className="field" type="number" min="0.01" step="0.01" placeholder="Amount" value={payment.amount} onChange={(event) => setPayment({ ...payment, amount: event.target.value })} /><select className="field" value={payment.paymentType} onChange={(event) => setPayment({ ...payment, paymentType: event.target.value })}><option value="ADVANCE">Advance</option><option value="PARTIAL">Partial</option><option value="FULL">Full</option></select><select className="field" value={payment.method} onChange={(event) => setPayment({ ...payment, method: event.target.value })}><option value="UPI">UPI</option><option value="CASH">Cash</option><option value="BANK_TRANSFER">Bank transfer</option><option value="CARD">Card</option><option value="OTHER">Other</option></select><input className="field" placeholder="Reference number (optional)" value={payment.reference} onChange={(event) => setPayment({ ...payment, reference: event.target.value })} /><button className="button primary" onClick={recordPayment}>Save payment</button></div>}</div></div>;
}

function Inventory({ refreshKey }) {
  const [products, setProducts] = useState([]); const [query, setQuery] = useState(""); const [error, setError] = useState("");
  useEffect(() => { api("/products").then(setProducts).catch((err) => setError(err.message)); }, [refreshKey]);
  const filtered = products.filter((product) => `${product.name} ${product.sku} ${product.location}`.toLowerCase().includes(query.toLowerCase()));
  return <DataState loading={!products.length && !error} error={error}><section className="panel"><SectionHeader title="Inventory register" action={`${filtered.length} products`} /><input className="search field" placeholder="Search product, SKU, or location…" value={query} onChange={(event) => setQuery(event.target.value)} /><ProductTable products={filtered} /></section></DataState>;
}

function ProductTable({ products, compact = false }) {
  return <div className="table-scroll"><table className="data-table"><thead><tr><th>Product</th><th>SKU</th><th>Stock</th><th>Minimum</th><th>Location</th>{!compact && <th>Price</th>}<th>Status</th></tr></thead><tbody>{products.map((product) => <tr key={product._id}><td><div className="product-name"><ProductIcon name={product.name} /><strong>{product.name}</strong></div></td><td className="muted">{product.sku}</td><td><strong>{product.stock}</strong></td><td>{product.minimumStock}</td><td>{product.location}</td>{!compact && <td>{currency(product.sellingPrice)}</td>}<td><StatusBadge product={product} /></td></tr>)}</tbody></table></div>;
}

function History({ refreshKey }) {
  const [movements, setMovements] = useState([]); const [error, setError] = useState("");
  const [orders, setOrders] = useState([]);
  useEffect(() => { api("/products/movements/history").then(setMovements).catch((err) => setError(err.message)); }, [refreshKey]);
  useEffect(() => { api("/orders").then((data) => setOrders((Array.isArray(data) ? data : data.orders || []).filter((order) => order.status === "DISPATCHED"))).catch(() => {}); }, [refreshKey]);
  return <DataState loading={!movements.length && !error} error={error}><section className="panel"><SectionHeader title="Movement ledger" action="Newest first" /><div className="table-scroll"><table className="data-table"><thead><tr><th>Product</th><th>SKU</th><th>Type</th><th>Quantity</th><th>Date and time</th></tr></thead><tbody>{movements.map((movement) => <tr key={movement._id}><td><strong>{movement.product?.name || "Deleted product"}</strong></td><td className="muted">{movement.product?.sku || "—"}</td><td><span className={`badge ${movement.type.toLowerCase()}`}>{movement.type}</span></td><td>{movement.quantity}</td><td>{new Date(movement.createdAt).toLocaleString()}</td></tr>)}</tbody></table></div></section><section className="panel"><SectionHeader title="Dispatch history" action={`${orders.length} orders`} /><div className="table-scroll"><table className="data-table"><thead><tr><th>Order</th><th>Client</th><th>Items</th><th>Total</th><th>Payment</th><th>Dispatched</th><th>Actions</th></tr></thead><tbody>{orders.map((order) => <tr key={order._id}><td><strong>{order.orderNumber}</strong></td><td>{order.client.name}</td><td>{order.items.reduce((sum, item) => sum + item.quantity, 0)} units</td><td>{currency(order.totalAmount)}</td><td><span className="badge payment-badge">{statusLabel(order.paymentStatus)}</span></td><td>{new Date(order.dispatchedAt || order.createdAt).toLocaleDateString("en-IN")}</td><td className="row-actions">  <button className="link-button" onClick={() => { window.dispatchEvent(new CustomEvent("wms-navigate", { detail: "orders" })); window.setTimeout(() => window.dispatchEvent(new CustomEvent("wms-open-order", { detail: order._id })), 0); }}>View details</button><button className="link-button" onClick={() => window.dispatchEvent(new CustomEvent("wms-show-invoice", { detail: buildInvoice(order) }))}>View invoice</button></td></tr>)}</tbody></table></div></section></DataState>;
}

export default App;
