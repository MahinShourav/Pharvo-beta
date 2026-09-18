import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Search,
  ClipboardList,
  Clock,
  PackageCheck,
  Plus,
  X,
  Trash2,
  Eye,
  Building2,
  Send,
  Truck,
  Ban,
  AlertTriangle,
} from "lucide-react";
import { fetchSuppliers, fetchProducts } from "../../services/medicine";
import { createPurchase } from "../../services/purchases";
import { sendWhatsAppOrder } from "../../services/notifications";
import { ApiError } from "../../services/api";
import {
  trackingStatus,
  trackingLabel,
  matchesTrackingFilter,
  isOverdue,
  buildTimeline,
} from "../../utils/tracking.mjs";
import {
  orderUnit,
  pcsPerOrderUnit,
  unitNoun,
  itemUnit,
  itemPcsPerUnit,
  lineCost,
  orderTotalCost,
  unitDisplayPrice,
  normalizeWaRecipient,
} from "../../utils/orderUnits.mjs";
import { Card, CardHeader, StatCard, EmptyState, LoadingState } from "../../components/ui/Blocks";

export const SUPPLIER_ORDERS_STORAGE_KEY = "pharvo_supplier_orders";

const STATUS_FILTERS = [
  { key: "all", label: "All Statuses" },
  { key: "draft", label: "Draft" },
  { key: "pending_approval", label: "Pending Approval" },
  { key: "sent", label: "Sent" },
  { key: "confirmed", label: "Confirmed" },
  { key: "partially_received", label: "Partially Received" },
  { key: "received", label: "Received" },
  { key: "cancelled", label: "Cancelled" },
];

const DATE_FILTERS = [
  { key: "all", label: "All Dates" },
  { key: "today", label: "Today" },
  { key: "week", label: "Last 7 Days" },
  { key: "month", label: "Last 30 Days" },
];

/* Stored-status transitions. Must stay identical to TRANSITIONS in
   utils/tracking.mjs (verified by tracking.check.mjs). */
const NEXT_STATUS = {
  draft: ["requested", "cancelled"],
  requested: ["received", "cancelled"],
  partially_received: ["received", "cancelled"],
  received: [],
  cancelled: [],
};

const STATUS_BADGE = {
  draft: "bg-slate-100 text-slate-500 border-slate-200",
  pending_approval: "bg-violet-50 text-violet-700 border-violet-200",
  sent: "bg-amber-50 text-amber-700 border-amber-200",
  confirmed: "bg-teal-50 text-teal-700 border-teal-200",
  partially_received: "bg-blue-50 text-blue-700 border-blue-200",
  received: "bg-emerald-50 text-emerald-700 border-emerald-200",
  cancelled: "bg-red-50 text-red-700 border-red-200",
};

const STATUS_DOT = {
  draft: "bg-slate-400",
  pending_approval: "bg-violet-500",
  sent: "bg-amber-500",
  confirmed: "bg-teal-500",
  partially_received: "bg-blue-500",
  received: "bg-emerald-500",
  cancelled: "bg-red-500",
};

function money(value) {
  return `৳${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function fmtDate(iso) {
  return iso ? iso.slice(0, 10) : "—";
}

function OrderBadge({ order, status }) {
  const key = order ? trackingStatus(order) : status;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border whitespace-nowrap ${
        STATUS_BADGE[key] || STATUS_BADGE.draft
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[key] || "bg-slate-400"}`} />
      {trackingLabel(key)}
    </span>
  );
}

function makeRef(orders) {
  const maxNum = orders.reduce((max, o) => {
    const m = /^SO-(\d+)$/.exec(o.ref || "");
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);
  return `SO-${String(maxNum + 1).padStart(4, "0")}`;
}

function orderTotal(order) {
  // Supplier cost with Box quantities converted to PCs via each line's
  // pcsPerBox snapshot. Legacy lines (no unit) count as PC, as before.
  return orderTotalCost(order);
}

/** WhatsApp send state for an order (kept apart from supplier confirmation). */
function waState(order) {
  const w = order.whatsapp || {};
  return {
    status: w.status || "unsent",
    messageId: w.messageId || null,
    sentAt: w.sentAt || null,
    error: w.error || "",
    attempts: Number(w.attempts || 0),
  };
}

const FRESH_WA = {
  status: "unsent",
  messageId: null,
  sentAt: null,
  error: "",
  attempts: 0,
};

/** Quantity already received for a line (0 for legacy orders). */
function receivedQty(item) {
  return Number(item.received || 0);
}

/** Quantity still outstanding for a line (in the line's order unit). */
function remainingQty(item) {
  return Math.max(Number(item.quantity || 0) - receivedQty(item), 0);
}

export default function SupplierOrdersView() {
  const [orders, setOrders] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(SUPPLIER_ORDERS_STORAGE_KEY) || "[]");
    } catch (err) {
      return [];
    }
  });
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [composerOpen, setComposerOpen] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [receivingId, setReceivingId] = useState(null);
  const [receiveId, setReceiveId] = useState(null);
  const [receiveRows, setReceiveRows] = useState([]);
  const [receiveError, setReceiveError] = useState("");
  const [sendingId, setSendingId] = useState(null);
  const [sendError, setSendError] = useState("");
  const [deliveryNote, setDeliveryNote] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [waTo, setWaTo] = useState("");
  const [rows, setRows] = useState([{ productId: "", quantity: 1 }]);
  const [composerError, setComposerError] = useState("");
  const [composerSaving, setComposerSaving] = useState(false);
  const seqRef = useRef(0);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [supplierList, productList] = await Promise.all([
          fetchSuppliers({ is_active: "true" }),
          fetchProducts({ is_active: "true" }),
        ]);
        if (!mounted) return;
        setSuppliers(supplierList || []);
        setProducts(productList || []);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof ApiError ? err.message : "Unable to load suppliers and medicines.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(SUPPLIER_ORDERS_STORAGE_KEY, JSON.stringify(orders));
  }, [orders]);

  useEffect(() => {
    // Drafts created elsewhere (e.g. automatic reorder drafts) share the same
    // localStorage store — reload so the list never shows stale orders.
    const reload = () => {
      try {
        setOrders(JSON.parse(localStorage.getItem(SUPPLIER_ORDERS_STORAGE_KEY) || "[]"));
      } catch (err) {
        /* keep current orders on corrupt storage */
      }
    };
    window.addEventListener("pharvo:supplier-orders-changed", reload);
    return () =>
      window.removeEventListener("pharvo:supplier-orders-changed", reload);
  }, []);

  const updateOrder = (id, patch) =>
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)));

  const selectedSupplier = suppliers.find((s) => Number(s.id) === Number(supplierId));
  const supplierProducts = useMemo(
    () => products.filter((p) => selectedSupplier && Number(p.supplier) === Number(selectedSupplier.id)),
    [products, selectedSupplier]
  );

  const composerTotal = useMemo(
    () =>
      rows.reduce((sum, row) => {
        const product = supplierProducts.find((p) => Number(p.id) === Number(row.productId));
        if (!product) return sum;
        // Box quantities convert to PCs via the product's pack size.
        const unit = orderUnit(product);
        return sum + Number(row.quantity || 0) * pcsPerOrderUnit(product, unit) * Number(product.cost_price || 0);
      }, 0),
    [rows, supplierProducts]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const today = new Date().toISOString().slice(0, 10);
    let cutoff = null;
    if (dateFilter === "today") {
      cutoff = new Date(today);
    } else if (dateFilter === "week" || dateFilter === "month") {
      cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - (dateFilter === "week" ? 7 : 30));
    }
    return [...orders]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .filter((o) => {
        if (!matchesTrackingFilter(o, statusFilter)) return false;
        if (supplierFilter !== "all" && String(o.supplierId) !== supplierFilter) return false;
        if (q && !(o.ref.toLowerCase().includes(q) || (o.supplierName || "").toLowerCase().includes(q)))
          return false;
        if (cutoff) {
          const created = new Date(o.createdAt || 0);
          if (dateFilter === "today") {
            if (created.toISOString().slice(0, 10) !== today) return false;
          } else if (created < cutoff) {
            return false;
          }
        }
        return true;
      });
  }, [orders, search, supplierFilter, statusFilter, dateFilter]);

  const statAwaiting = orders.filter(
    (o) => o.status === "requested" || o.status === "partially_received"
  ).length;
  const statOverdue = orders.filter((o) => isOverdue(o)).length;
  const statReceived = orders.filter((o) => o.status === "received").length;
  const pendingSpend = orders
    .filter((o) => o.status === "draft" || o.status === "requested")
    .reduce((sum, o) => sum + orderTotal(o), 0);

  function openComposer() {
    setSupplierId("");
    setWaTo("");
    setRows([{ productId: "", quantity: 1 }]);
    setComposerError("");
    setComposerOpen(true);
  }

  function updateRow(index, patch) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  /**
   * Send (or retry) the WhatsApp order notification for an already-saved
   * order. Sends ONLY the notification: it never creates an order, receipt,
   * or stock update. Allowed only while nothing is recorded as sent, so one
   * order can never be messaged twice by accident.
   */
  async function sendOrderNotification(order) {
    const wa = waState(order);
    if (wa.status === "sent" || sendingId) return false;
    setSendingId(order.id);
    setSendError("");
    const attempts = wa.attempts + 1;
    try {
      const res = await sendWhatsAppOrder({
        order_ref: order.ref,
        supplier_name: order.supplierName,
        supplier_phone: order.whatsappTo || order.supplierPhone,
        items: (order.items || []).map((item) => ({
          name: item.name,
          quantity: Number(item.quantity),
          unit: itemUnit(item),
        })),
        estimated_total: orderTotal(order).toFixed(2),
        order_date: (order.createdAt || "").slice(0, 10),
        delivery_note: "",
        client_ref: `${order.id}:${attempts}`,
      });
      updateOrder(order.id, {
        whatsapp: {
          status: "sent",
          messageId: res.message_id || null,
          sentAt: new Date().toISOString(),
          error: "",
          attempts,
        },
      });
      return true;
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Could not send the order.";
      const hint =
        err instanceof ApiError && err.status === 503
          ? " WhatsApp is not configured on the server (WHATSAPP_*). The order is saved — retry after configuration."
          : " Nothing was marked as sent — safe to retry.";
      updateOrder(order.id, {
        whatsapp: { ...wa, status: "failed", error: message, attempts },
      });
      setSendError(message + hint);
      return false;
    } finally {
      setSendingId(null);
    }
  }

  async function submitComposer(status) {
    if (!selectedSupplier) {
      setComposerError("Select a supplier for the order request.");
      return;
    }
    const recipient = normalizeWaRecipient(waTo);
    if (!recipient) {
      setComposerError(
        "Enter a valid WhatsApp recipient number (e.g. 01601969980) — the order notification is messaged automatically on save."
      );
      return;
    }
    if (rows.length === 0) {
      setComposerError("Add at least one medicine to the order request.");
      return;
    }
    for (const row of rows) {
      if (!row.productId) {
        setComposerError("Every line needs a medicine selected.");
        return;
      }
      if (!Number(row.quantity) || Number(row.quantity) < 1) {
        setComposerError("Every line needs a quantity of at least 1.");
        return;
      }
    }
    const now = new Date();
    const orderId = `${Date.now()}-${seqRef.current++}`;
    setComposerSaving(true);
    const order = {
      id: orderId,
      ref: makeRef(orders),
      supplierId: Number(selectedSupplier.id),
      supplierName: selectedSupplier.name,
      supplierPhone: selectedSupplier.phone || "",
      supplierEmail: selectedSupplier.email || "",
      items: rows.map((row) => {
        const product = supplierProducts.find((p) => Number(p.id) === Number(row.productId));
        // Order unit comes from the medicine's form (Box, or PC for
        // Cream/Syrup); pcsPerBox is snapshotted so later pack-size edits
        // cannot rewrite history. Price is never typed in — it always comes
        // from the inventory cost price.
        const unit = orderUnit(product);
        return {
          productId: Number(product.id),
          name: product.name,
          quantity: Number(row.quantity),
          unit,
          pcsPerBox: pcsPerOrderUnit(product, unit),
          costPrice: Number(product.cost_price || 0),
          received: 0,
        };
      }),
      status,
      createdAt: now.toISOString(),
      requestedAt: status === "requested" ? now.toISOString() : null,
      receivedAt: null,
      cancelledAt: null,
      invoiceNumber: null,
      receipts: [],
      whatsapp: { ...FRESH_WA },
      whatsappTo: waTo.trim(),
      confirmedAt: null,
      expectedDate: null,
    };
    setOrders((prev) => [...prev, order]);
    // The order is saved first; the WhatsApp notification follows
    // automatically. A send failure keeps the saved order and records a
    // retryable failure — it never blocks or duplicates the order itself.
    try {
      await sendOrderNotification({ ...order });
    } finally {
      setComposerSaving(false);
      setComposerOpen(false);
    }
  }

  function openReceive(order) {
    setReceiveError("");
    setReceiveId(order.id);
    setReceiveRows(
      (order.items || []).map((item) => ({
        productId: item.productId,
        qty: String(remainingQty(item)),
      }))
    );
  }

  async function submitReceive() {
    const order = orders.find((o) => o.id === receiveId);
    if (!order || receivingId) return;
    const lines = [];
    for (const item of order.items || []) {
      const row = receiveRows.find(
        (r) => Number(r.productId) === Number(item.productId)
      );
      const raw = String(row ? row.qty : "0").trim();
      if (raw === "" || !/^\d+$/.test(raw)) {
        setReceiveError(
          `Enter a whole number (0–${remainingQty(item)}) for "${item.name}".`
        );
        return;
      }
      const qty = Number(raw);
      if (qty > remainingQty(item)) {
        const u = itemUnit(item);
        setReceiveError(
          `Cannot receive more than the remaining ${remainingQty(item)} ${unitNoun(u, remainingQty(item))} of "${item.name}". Over-receiving is not supported.`
        );
        return;
      }
      if (qty > 0) lines.push({ item, qty });
    }
    if (lines.length === 0) {
      setReceiveError("Enter a received quantity of at least 1 for one medicine.");
      return;
    }
    setReceivingId(order.id);
    setReceiveError("");
    try {
      // Backend-authorized receipt: exactly one Purchase per receiving event.
      // Order quantities convert to stock PCs here (Boxes x pcsPerBox); the
      // backend/stock layer only ever sees PCs, exactly as before.
      const purchase = await createPurchase({
        invoice_number: `RCV-${Date.now()}`,
        supplier: order.supplierId,
        items: lines.map(({ item, qty }) => ({
          product: item.productId,
          quantity: qty * itemPcsPerUnit(item),
          unit_price: item.costPrice,
        })),
        discount: "0.00",
        purchase_date: new Date().toISOString().slice(0, 10),
      });
      const receipt = {
        invoiceNumber: purchase.invoice_number || null,
        date: new Date().toISOString(),
        lines: lines.map(({ item, qty }) => ({
          productId: item.productId,
          name: item.name,
          quantity: qty,
          unit: itemUnit(item),
          unitPrice: item.costPrice,
        })),
      };
      setOrders((prev) =>
        prev.map((o) => {
          if (o.id !== order.id) return o;
          const items = (o.items || []).map((it) => {
            const line = lines.find(
              (l) => Number(l.item.productId) === Number(it.productId)
            );
            return line ? { ...it, received: receivedQty(it) + line.qty } : it;
          });
          const done =
            items.length > 0 && items.every((it) => remainingQty(it) === 0);
          return {
            ...o,
            items,
            receipts: [...(o.receipts || []), receipt],
            status: done ? "received" : "partially_received",
            receivedAt: done ? new Date().toISOString() : o.receivedAt,
            invoiceNumber: receipt.invoiceNumber,
          };
        })
      );
      setReceiveId(null);
    } catch (err) {
      // Local receipt tracking is only updated after a successful POST, so a
      // failed or retried submission cannot add the same stock twice: every
      // recorded receipt maps to exactly one backend Purchase invoice.
      setReceiveError(
        err instanceof ApiError
          ? err.message
          : "Could not record the received goods. Stock was not changed."
      );
    } finally {
      setReceivingId(null);
    }
  }

  function cancelOrder(order) {
    updateOrder(order.id, { status: "cancelled", cancelledAt: new Date().toISOString() });
  }

  function submitRequest(order) {
    updateOrder(order.id, {
      status: "requested",
      requestedAt: new Date().toISOString(),
    });
  }

  /**
   * Approve a draft and send it over WhatsApp (server-side send).
   * The order becomes "requested" ONLY after the provider accepts it.
   * Failures (incl. 503 not-configured) keep the draft and record the
   * error — never a false "sent". Retry is allowed only while nothing was
   * recorded as sent, so one order can never be sent twice by accident.
   */
  async function approveAndSend(order) {
    const wa = waState(order);
    if (order.status !== "draft" || wa.status === "sent" || sendingId) return;
    setSendingId(order.id);
    setSendError("");
    const attempts = wa.attempts + 1;
    try {
      const res = await sendWhatsAppOrder({
        order_ref: order.ref,
        supplier_name: order.supplierName,
        supplier_phone: order.whatsappTo || order.supplierPhone,
        items: (order.items || []).map((item) => ({
          name: item.name,
          quantity: Number(item.quantity),
          unit: itemUnit(item),
        })),
        estimated_total: orderTotal(order).toFixed(2),
        order_date: (order.createdAt || "").slice(0, 10),
        delivery_note: deliveryNote.trim(),
        client_ref: `${order.id}:${attempts}`,
      });
      updateOrder(order.id, {
        status: "requested",
        requestedAt: new Date().toISOString(),
        whatsapp: {
          status: "sent",
          messageId: res.message_id || null,
          sentAt: new Date().toISOString(),
          error: "",
          attempts,
        },
      });
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Could not send the order.";
      const hint =
        err instanceof ApiError && err.status === 503
          ? " WhatsApp is not configured on the server (WHATSAPP_*). The draft was NOT sent and is still awaiting approval."
          : " Nothing was marked as sent — safe to retry.";
      updateOrder(order.id, {
        whatsapp: { ...wa, status: "failed", error: message, attempts },
      });
      setSendError(message + hint);
    } finally {
      setSendingId(null);
    }
  }

  /**
   * Explicit supplier confirmation, recorded separately from "message sent".
   * Set only by a human when the supplier actually confirms.
   */
  function markConfirmed(order) {
    if (order.confirmedAt) return;
    updateOrder(order.id, { confirmedAt: new Date().toISOString() });
  }

  const detailOrder = orders.find((o) => o.id === detailId) || null;
  const detailWa = detailOrder ? waState(detailOrder) : null;
  useEffect(() => {
    setDeliveryNote("");
    setSendError("");
  }, [detailId]);

  const receiveTarget = orders.find((o) => o.id === receiveId) || null;
  const receiveTotal = (receiveTarget?.items || []).reduce((sum, item) => {
    const row = receiveRows.find(
      (r) => Number(r.productId) === Number(item.productId)
    );
    const qty = Number(row ? row.qty : 0);
    if (!Number.isFinite(qty) || qty <= 0) return sum;
    return sum + qty * itemPcsPerUnit(item) * Number(item.costPrice || 0);
  }, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Order Requests" value={orders.length.toLocaleString()} sub="Supplier order requests" icon={ClipboardList} tone="blue" />
        <StatCard label="Awaiting Delivery" value={statAwaiting.toLocaleString()} sub={statOverdue > 0 ? `${statOverdue} overdue — past expected date` : "Submitted to suppliers"} icon={Clock} tone={statOverdue > 0 ? "red" : "amber"} />
        <StatCard label="Received" value={statReceived.toLocaleString()} sub={`${money(pendingSpend)} pending spend`} icon={PackageCheck} tone="green" />
      </div>

      <Card>
        <CardHeader
          title="Supplier Orders"
          subtitle="Order requests do not change stock — stock increases only when goods are received"
          action={
            <button
              onClick={openComposer}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-[#2563EB] text-white text-xs font-medium hover:bg-[#1d4ed8] shadow-2xs transition-colors cursor-pointer"
            >
              <Plus size={14} />
              New Order Request
            </button>
          }
        />

        <div className="px-5 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Order ref or supplier..."
              className="w-44 sm:w-60 pl-9 pr-3 py-2 text-xs font-normal rounded-lg border border-slate-200 outline-none focus:border-blue-400 bg-white"
            />
          </div>
          <select
            value={supplierFilter}
            onChange={(e) => setSupplierFilter(e.target.value)}
            className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 bg-white text-slate-700 outline-none cursor-pointer"
          >
            <option value="all">All Suppliers</option>
            {suppliers.map((s) => (
              <option key={s.id} value={String(s.id)}>{s.name}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 bg-white text-slate-700 outline-none cursor-pointer"
          >
            {STATUS_FILTERS.map((f) => (
              <option key={f.key} value={f.key}>{f.label}</option>
            ))}
          </select>
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 bg-white text-slate-700 outline-none cursor-pointer"
          >
            {DATE_FILTERS.map((f) => (
              <option key={f.key} value={f.key}>{f.label}</option>
            ))}
          </select>
        </div>

        {error && (
          <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border-b border-red-200 text-xs text-red-700 font-medium">
            <AlertTriangle size={13} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <LoadingState label="Loading suppliers and medicines..." />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="No supplier orders found"
            subtitle={
              orders.length === 0
                ? "Create an order request to restock from a supplier."
                : "No supplier orders match your search and filter criteria."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50/70 border-b border-slate-100 text-[11px] text-slate-400 font-semibold uppercase tracking-wider">
                  <th className="px-4 py-2.5">Order</th>
                  <th className="px-3 py-2.5">Supplier</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5 text-center">Items</th>
                  <th className="px-3 py-2.5">Requested</th>
                  <th className="px-3 py-2.5 text-right">Est. Total</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-xs">
                {filtered.map((o) => (
                  <tr
                    key={o.id}
                    onClick={() => setDetailId(o.id)}
                    className="hover:bg-slate-50/60 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3 font-mono text-[11px] text-blue-600 font-semibold">{o.ref}</td>
                    <td className="px-3 py-3">
                      <div className="font-medium text-slate-800">{o.supplierName}</div>
                      {o.supplierPhone && <div className="text-[11px] text-slate-400 font-normal">{o.supplierPhone}</div>}
                    </td>
                    <td className="px-3 py-3"><OrderBadge order={o} /></td>
                    <td className="px-3 py-3 text-center text-slate-500">{o.items?.length ?? 0}</td>
                    <td className="px-3 py-3 text-slate-500 font-normal whitespace-nowrap">
                      {fmtDate(o.requestedAt || o.createdAt)}
                      {o.expectedDate && (
                        <div className="text-[11px] text-slate-400 font-normal">Exp: {o.expectedDate}</div>
                      )}
                      {isOverdue(o) && (
                        <div className="mt-0.5 inline-flex items-center px-1.5 py-0.5 rounded bg-red-50 border border-red-200 text-[11px] font-semibold text-red-600">Overdue</div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold text-slate-900 whitespace-nowrap">{money(orderTotal(o))}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDetailId(o.id);
                        }}
                        className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-blue-600 transition-colors cursor-pointer"
                      >
                        <Eye size={13} />
                        Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {composerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[1px]"
          onClick={() => setComposerOpen(false)}
        >
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-[640px] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-semibold text-slate-800 text-sm">New Supplier Order Request</h3>
              <button onClick={() => setComposerOpen(false)} className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"><X size={15} /></button>
            </div>
            <div className="p-6 flex flex-col gap-4">
              {composerError && (
                <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
                  <AlertTriangle size={13} className="shrink-0" />
                  <span>{composerError}</span>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Supplier</label>
                <select
                  value={supplierId}
                  onChange={(e) => {
                    setSupplierId(e.target.value);
                    const picked = suppliers.find((s) => String(s.id) === e.target.value);
                    setWaTo(picked?.phone || "");
                    setRows([{ productId: "", quantity: 1 }]);
                  }}
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 text-xs text-slate-800 bg-white outline-none focus:border-blue-600 cursor-pointer"
                >
                  <option value="">Select a supplier...</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={String(s.id)}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  WhatsApp recipient number
                </label>
                <input
                  value={waTo}
                  onChange={(e) => setWaTo(e.target.value)}
                  placeholder="e.g. 01601969980"
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 text-xs text-slate-800 outline-none focus:border-blue-600 bg-white"
                />
                <p className="mt-1 text-[11px] text-slate-400 font-normal">
                  {normalizeWaRecipient(waTo)
                    ? `Order details will be WhatsApp-messaged to ${normalizeWaRecipient(waTo)} automatically once the order is saved.`
                    : "Enter the destination WhatsApp number — Bangladesh mobiles gain the 880 country code automatically."}
                </p>
              </div>
                {selectedSupplier && (
                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400 font-normal">
                    <span className="inline-flex items-center gap-1"><Building2 size={11} /> {selectedSupplier.name}</span>
                    {selectedSupplier.phone && <span>{selectedSupplier.phone}</span>}
                    {selectedSupplier.email && <span>{selectedSupplier.email}</span>}
                    {selectedSupplier.address && <span>{selectedSupplier.address}</span>}
                  </div>
                )}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">Medicines</label>
                {selectedSupplier && supplierProducts.length === 0 && (
                  <div className="mb-2 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700 font-medium">
                    <AlertTriangle size={13} className="shrink-0" />
                    <span>No medicines are linked to {selectedSupplier.name} yet. Assign medicines to this supplier in Suppliers, then return here to order.</span>
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  {rows.map((row, index) => {
                    const product = supplierProducts.find((p) => Number(p.id) === Number(row.productId));
                    const rowUnit = product ? orderUnit(product) : null;
                    return (
                      <div key={index} className="grid grid-cols-[1fr_92px_130px_32px] gap-2 items-center">
                        <select
                          value={row.productId}
                          onChange={(e) => updateRow(index, { productId: e.target.value })}
                          disabled={supplierProducts.length === 0}
                          className="h-9 px-3 rounded-lg border border-slate-200 text-xs text-slate-800 bg-white outline-none focus:border-blue-600 cursor-pointer disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
                          title={rowUnit ? `Ordered in ${unitNoun(rowUnit, 2)}` : undefined}
                        >
                          <option value="">
                            {selectedSupplier
                              ? supplierProducts.length === 0
                                ? "No medicines linked to this supplier"
                                : "Select medicine..."
                              : "Select a supplier first..."}
                          </option>
                          {supplierProducts.map((p) => {
                            const u = orderUnit(p);
                            return (
                              <option key={p.id} value={String(p.id)}>
                                {p.name} ({u === "box" ? "Box" : "PC"}){p.is_sensitive ? " • Sensitive" : ""}
                              </option>
                            );
                          })}
                        </select>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={row.quantity}
                          onChange={(e) => updateRow(index, { quantity: e.target.value })}
                          className="h-9 px-3 rounded-lg border border-slate-200 text-xs text-slate-800 outline-none focus:border-blue-600 bg-white text-center"
                          placeholder={rowUnit ? `Qty (${unitNoun(rowUnit, 2)})` : "Qty"}
                        />
                        <div className="text-xs text-slate-500 font-normal text-right whitespace-nowrap">
                          {product && Number(product.cost_price) > 0 ? (
                            <span>{money(unitDisplayPrice(product, rowUnit))} <span className="text-slate-300">/ {rowUnit === "box" ? "Box" : "PC"}</span></span>
                          ) : (
                            <span className="text-slate-300">Supplier price —</span>
                          )}
                        </div>
                        <button
                          onClick={() => {
                            if (rows.length > 1) {
                              setRows((prev) => prev.filter((_, i) => i !== index));
                            } else {
                              setRows([{ productId: "", quantity: 1 }]);
                            }
                          }}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                          title="Remove line"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    );
                  })}
                </div>
                {selectedSupplier && supplierProducts.length > 0 && (
                  <button
                    onClick={() => setRows((prev) => [...prev, { productId: "", quantity: 1 }])}
                    className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors cursor-pointer"
                  >
                    <Plus size={13} />
                    Add medicine
                  </button>
                )}
              </div>
              <div className="flex items-center justify-between px-4 py-3 rounded-lg bg-slate-50/80 border border-slate-100">
                <span className="text-xs font-medium text-slate-500">Estimated total (supplier price)</span>
                <span className="text-sm font-semibold text-slate-900">{money(composerTotal)}</span>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2 bg-slate-50/50">
              <button
                type="button"
                onClick={() => setComposerOpen(false)}
                className="h-9 px-4 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => submitComposer("draft")}
                disabled={composerSaving}
                className="h-9 px-4 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-60"
              >
                Save Draft
              </button>
              <button
                type="button"
                onClick={() => submitComposer("requested")}
                disabled={composerSaving}
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-[#2563EB] text-white text-xs font-medium hover:bg-[#1d4ed8] shadow-2xs transition-colors cursor-pointer disabled:opacity-60"
              >
                <Send size={13} />
                Submit Request
              </button>
            </div>
          </div>
        </div>
      )}

      {detailOrder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[1px]"
          onClick={() => setDetailId(null)}
        >
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-[560px] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <h3 className="font-semibold text-slate-800 text-sm">Order Details</h3>
                <span className="text-slate-400 font-mono text-xs font-normal">{detailOrder.ref}</span>
                <OrderBadge order={detailOrder} />
              </div>
              <button onClick={() => setDetailId(null)} className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"><X size={15} /></button>
            </div>
            <div className="p-6 flex flex-col gap-4">
              <div className="rounded-xl border border-slate-100 overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-50/70 border-b border-slate-100 flex items-center gap-2">
                  <Building2 size={14} className="text-slate-400" />
                  <span className="text-xs font-semibold text-slate-700">Supplier</span>
                </div>
                <div className="px-4 py-3 text-xs text-slate-600 font-normal">
                  <div className="font-semibold text-slate-800">{detailOrder.supplierName}</div>
                  {(detailOrder.supplierPhone || detailOrder.supplierEmail) && (
                    <div className="mt-0.5 text-slate-400">
                      {[detailOrder.supplierPhone, detailOrder.supplierEmail].filter(Boolean).join(" · ")}
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400">
                    <span>Requested: {fmtDate(detailOrder.requestedAt || detailOrder.createdAt)}</span>
                    {detailOrder.receivedAt && <span>Received: {fmtDate(detailOrder.receivedAt)}</span>}
                    {detailOrder.cancelledAt && <span>Cancelled: {fmtDate(detailOrder.cancelledAt)}</span>}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-100 overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-50/70 border-b border-slate-100 flex items-center gap-2">
                  <Clock size={14} className="text-slate-400" />
                  <span className="text-xs font-semibold text-slate-700">Tracking timeline</span>
                </div>
                <div className="px-4 py-3 flex flex-col gap-0">
                  {buildTimeline(detailOrder).map((event, i, all) => (
                    <div key={`${event.key}-${i}`} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <span className="w-2 h-2 rounded-full bg-blue-500 mt-1 shrink-0" />
                        {i < all.length - 1 && <span className="w-px flex-1 bg-slate-200" />}
                      </div>
                      <div className="pb-3">
                        <div className="text-xs font-medium text-slate-700">{event.label}</div>
                        <div className="text-[11px] text-slate-400 font-normal">{fmtDate(event.date)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {["draft", "requested", "partially_received"].includes(detailOrder.status) && (
                <div className="rounded-xl border border-slate-100 overflow-hidden">
                  <div className="px-4 py-2.5 bg-slate-50/70 border-b border-slate-100 flex items-center gap-2">
                    <Truck size={14} className="text-slate-400" />
                    <span className="text-xs font-semibold text-slate-700">Expected delivery</span>
                  </div>
                  <div className="px-4 py-3 flex flex-col gap-2">
                    <input
                      type="date"
                      value={detailOrder.expectedDate || ""}
                      onChange={(e) =>
                        updateOrder(detailOrder.id, {
                          expectedDate: e.target.value || null,
                        })
                      }
                      className="h-9 px-3 rounded-lg border border-slate-200 text-xs text-slate-800 outline-none focus:border-blue-600 bg-white"
                    />
                    {isOverdue(detailOrder) ? (
                      <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
                        <AlertTriangle size={13} className="shrink-0" />
                        <span>Overdue — expected {detailOrder.expectedDate} and still awaiting delivery.</span>
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-400 font-normal">
                        {detailOrder.expectedDate
                          ? `Expected ${detailOrder.expectedDate}. Overdue is flagged only for sent orders past this date.`
                          : "No date set — overdue is never assumed without one."}
                      </p>
                    )}
                  </div>
                </div>
              )}

              <div className="rounded-xl border border-slate-100 overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-50/70 border-b border-slate-100 flex items-center gap-2">
                  <Send size={14} className="text-slate-400" />
                  <span className="text-xs font-semibold text-slate-700">WhatsApp notification</span>
                </div>
                <div className="px-4 py-3 flex flex-col gap-2">
                  <div className="text-[11px] text-slate-400 font-normal">
                    Recipient: <span className="font-medium text-slate-600">{detailOrder.whatsappTo || detailOrder.supplierPhone || "—"}</span>
                    {normalizeWaRecipient(detailOrder.whatsappTo || detailOrder.supplierPhone) && (
                      <span> → {normalizeWaRecipient(detailOrder.whatsappTo || detailOrder.supplierPhone)}</span>
                    )}
                  </div>
                  {detailWa.status === "sent" ? (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 font-medium">
                      <Send size={13} className="shrink-0" />
                      <span>
                        Order message accepted by Meta {fmtDate(detailWa.sentAt)}
                        {detailWa.messageId && (
                          <span className="font-mono"> · {detailWa.messageId}</span>
                        )}
                        . Handset delivery is unknown — acceptance is not delivery or supplier confirmation.
                      </span>
                    </div>
                  ) : detailOrder.status === "draft" ? (
                    <>
                      <label className="block text-xs font-medium text-slate-700">
                        Delivery request (sent with the order)
                      </label>
                      <input
                        value={deliveryNote}
                        onChange={(e) => setDeliveryNote(e.target.value)}
                        placeholder="e.g. Please deliver by Friday; call on arrival"
                        disabled={sendingId === detailOrder.id}
                        className="w-full h-9 px-3 rounded-lg border border-slate-200 text-xs outline-none focus:border-blue-600 disabled:bg-slate-50"
                      />
                      {sendError && (
                        <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
                          <AlertTriangle size={13} className="shrink-0" />
                          <span>{sendError}</span>
                        </div>
                      )}
                      {!sendError && detailWa.status === "failed" && detailWa.error && (
                        <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
                          <AlertTriangle size={13} className="shrink-0" />
                          <span>Last attempt failed: {detailWa.error} Safe to retry.</span>
                        </div>
                      )}
                      <div>
                        <button
                          type="button"
                          onClick={() => approveAndSend(detailOrder)}
                          disabled={sendingId === detailOrder.id}
                          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-[#2563EB] text-white text-xs font-medium hover:bg-[#1d4ed8] shadow-2xs transition-colors cursor-pointer disabled:opacity-60"
                        >
                          <Send size={13} />
                          {sendingId === detailOrder.id
                            ? "Sending..."
                            : detailWa.status === "failed"
                              ? "Retry WhatsApp Send"
                              : "Approve & Send via WhatsApp"}
                        </button>
                      </div>
                      <p className="text-[11px] text-slate-400 font-normal">
                        The draft is approved only after the provider accepts the
                        message. A sent message is not a supplier confirmation.
                      </p>
                    </>
                  ) : (
                    <>
                      {(sendError || detailWa.error) && (
                        <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
                          <AlertTriangle size={13} className="shrink-0" />
                          <span>{sendError || `Last attempt failed: ${detailWa.error} Safe to retry.`}</span>
                        </div>
                      )}
                      {detailOrder.status !== "cancelled" && (
                        <div>
                          <button
                            type="button"
                            onClick={() => sendOrderNotification(detailOrder)}
                            disabled={sendingId === detailOrder.id}
                            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-60"
                          >
                            <Send size={13} />
                            {sendingId === detailOrder.id ? "Sending..." : "Retry WhatsApp notification"}
                          </button>
                        </div>
                      )}
                      <p className="text-[11px] text-slate-400 font-normal">
                        Retrying sends only the notification — never another order, receipt, or stock update. Message acceptance is not handset delivery or supplier confirmation.
                      </p>
                    </>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-slate-100 overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-50/70 border-b border-slate-100 flex items-center gap-2">
                  <ClipboardList size={14} className="text-slate-400" />
                  <span className="text-xs font-semibold text-slate-700">Medicines</span>
                </div>
                <div className="divide-y divide-slate-50">
                  {detailOrder.items.map((item) => (
                    <div key={item.productId} className="px-4 py-2.5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-slate-700">{item.name}</div>
                        <div className="text-[11px] text-slate-400 font-normal">
                          Ordered {item.quantity} {unitNoun(itemUnit(item), item.quantity)} · Received {receivedQty(item)} {unitNoun(itemUnit(item), receivedQty(item))} · Remaining {remainingQty(item)} {unitNoun(itemUnit(item), remainingQty(item))}
                        </div>
                      </div>
                      <span className="text-xs text-slate-500 font-normal whitespace-nowrap">
                        {item.quantity} {unitNoun(itemUnit(item), item.quantity)} × {money(itemPcsPerUnit(item) * Number(item.costPrice || 0))} = <span className="text-slate-800 font-semibold">{money(lineCost(item))}</span>
                      </span>
                    </div>
                  ))}
                  <div className="px-4 py-3 flex items-center justify-between gap-3 bg-slate-50/70">
                    <span className="text-xs font-semibold text-slate-500">Estimated total</span>
                    <span className="text-sm font-semibold text-slate-900">{money(orderTotal(detailOrder))}</span>
                  </div>
                </div>
              </div>

              {(detailOrder.receipts || []).length > 0 && (
                <div className="rounded-xl border border-slate-100 overflow-hidden">
                  <div className="px-4 py-2.5 bg-slate-50/70 border-b border-slate-100 flex items-center gap-2">
                    <Truck size={14} className="text-slate-400" />
                    <span className="text-xs font-semibold text-slate-700">Receipts (purchase records)</span>
                  </div>
                  <div className="divide-y divide-slate-50">
                    {(detailOrder.receipts || []).map((r, i) => (
                      <div key={`${r.invoiceNumber}-${i}`} className="px-4 py-2.5 text-xs text-slate-600">
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-mono text-[11px] text-slate-700">{r.invoiceNumber || "—"}</span>
                          <span className="text-[11px] text-slate-400">{fmtDate(r.date)}</span>
                        </div>
                        <div className="mt-0.5 text-[11px] text-slate-500 font-normal">
                          {(r.lines || []).map((l) => `${l.name}: ${l.quantity} ${unitNoun(itemUnit(l), l.quantity)}`).join(" · ")}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {detailOrder.status === "received" && detailOrder.invoiceNumber && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 font-medium">
                  <PackageCheck size={13} className="shrink-0" />
                  <span>Fully received on <span className="font-mono">{detailOrder.invoiceNumber}</span> — stock has been added.</span>
                </div>
              )}

              {detailOrder.status === "partially_received" && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-700 font-medium">
                  <Truck size={13} className="shrink-0" />
                  <span>Partially received — stock was added only for received quantities. Remaining amounts are listed per medicine above.</span>
                </div>
              )}

              {detailOrder.confirmedAt ? (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-violet-50 border border-violet-200 text-xs text-violet-700 font-medium">
                  <PackageCheck size={13} className="shrink-0" />
                  <span>Supplier confirmed on {fmtDate(detailOrder.confirmedAt)} — recorded separately from message delivery.</span>
                </div>
              ) : (
                ["requested", "partially_received", "received"].includes(detailOrder.status) && (
                  <button
                    type="button"
                    onClick={() => markConfirmed(detailOrder)}
                    className="self-start inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-violet-200 text-violet-700 text-xs font-medium hover:bg-violet-50 transition-colors cursor-pointer"
                  >
                    <PackageCheck size={13} />
                    Mark supplier confirmed
                  </button>
                )
              )}

              {receiveError && (
                <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
                  <AlertTriangle size={13} className="shrink-0" />
                  <span>{receiveError}</span>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-2 bg-slate-50/50">
              <div className="text-[11px] text-slate-400 font-normal">
                {NEXT_STATUS[detailOrder.status]?.length === 0
                  ? "This order can no longer be changed."
                  : "Receiving records a backend purchase for the quantities actually received."}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDetailId(null)}
                  className="h-9 px-4 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Close
                </button>
                {NEXT_STATUS[detailOrder.status]?.includes("requested") && (
                  <button
                    type="button"
                    onClick={() => submitRequest(detailOrder)}
                    className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-[#2563EB] text-white text-xs font-medium hover:bg-[#1d4ed8] shadow-2xs transition-colors cursor-pointer"
                  >
                    <Send size={13} />
                    Submit Request
                  </button>
                )}
                {NEXT_STATUS[detailOrder.status]?.includes("received") && (
                  <button
                    type="button"
                    onClick={() => openReceive(detailOrder)}
                    disabled={receivingId === detailOrder.id}
                    className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 shadow-2xs transition-colors cursor-pointer disabled:opacity-60"
                  >
                    <Truck size={13} />
                    {receivingId === detailOrder.id ? "Receiving..." : "Receive Goods"}
                  </button>
                )}
                {NEXT_STATUS[detailOrder.status]?.includes("cancelled") && (
                  <button
                    type="button"
                    onClick={() => cancelOrder(detailOrder)}
                    disabled={receivingId === detailOrder.id}
                    className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg border border-red-200 text-red-600 text-xs font-medium hover:bg-red-50 transition-colors cursor-pointer disabled:opacity-60"
                  >
                    <Ban size={13} />
                    Cancel Request
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {receiveTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[1px]"
          onClick={() => (receivingId ? null : setReceiveId(null))}
        >
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-[560px] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <h3 className="font-semibold text-slate-800 text-sm">Receive Goods</h3>
                <span className="text-slate-400 font-mono text-xs font-normal">{receiveTarget.ref}</span>
                <OrderBadge order={receiveTarget} />
              </div>
              <button onClick={() => setReceiveId(null)} disabled={Boolean(receivingId)} className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-60"><X size={15} /></button>
            </div>
            <div className="p-6 flex flex-col gap-4">
              <p className="text-xs text-slate-500 font-normal">
                Enter the quantities that actually arrived from <span className="font-semibold text-slate-700">{receiveTarget.supplierName}</span>.
                A single backend purchase is recorded and stock increases only for these quantities.
              </p>
              {receiveError && (
                <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
                  <AlertTriangle size={13} className="shrink-0" />
                  <span>{receiveError}</span>
                </div>
              )}
              <div className="rounded-xl border border-slate-100 overflow-hidden">
                <div className="divide-y divide-slate-50">
                  {(receiveTarget.items || []).map((item) => {
                    const row = receiveRows.find(
                      (r) => Number(r.productId) === Number(item.productId)
                    );
                    return (
                      <div key={item.productId} className="px-4 py-2.5 grid grid-cols-[1fr_110px] gap-3 items-center">
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-slate-700">{item.name}</div>
                          <div className="text-[11px] text-slate-400 font-normal">
                            Ordered {item.quantity} {unitNoun(itemUnit(item), item.quantity)} · Received {receivedQty(item)} {unitNoun(itemUnit(item), receivedQty(item))} · Remaining {remainingQty(item)} {unitNoun(itemUnit(item), remainingQty(item))}
                          </div>
                        </div>
                        <input
                          type="number"
                          min="0"
                          max={remainingQty(item)}
                          step="1"
                          value={row ? row.qty : "0"}
                          disabled={remainingQty(item) === 0 || Boolean(receivingId)}
                          onChange={(e) =>
                            setReceiveRows((prev) =>
                              prev.map((r) =>
                                Number(r.productId) === Number(item.productId)
                                  ? { ...r, qty: e.target.value }
                                  : r
                              )
                            )
                          }
                          className="h-9 px-3 rounded-lg border border-slate-200 text-xs text-slate-800 outline-none focus:border-emerald-600 bg-white text-center disabled:bg-slate-50 disabled:text-slate-400"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="flex items-center justify-between px-4 py-3 rounded-lg bg-slate-50/80 border border-slate-100">
                <span className="text-xs font-medium text-slate-500">Receiving now (supplier price)</span>
                <span className="text-sm font-semibold text-slate-900">{money(receiveTotal)}</span>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2 bg-slate-50/50">
              <button
                type="button"
                onClick={() => setReceiveId(null)}
                disabled={Boolean(receivingId)}
                className="h-9 px-4 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitReceive}
                disabled={Boolean(receivingId)}
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 shadow-2xs transition-colors cursor-pointer disabled:opacity-60"
              >
                <Truck size={13} />
                {receivingId ? "Receiving..." : "Confirm Receipt"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}