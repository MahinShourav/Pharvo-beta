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
import { ApiError } from "../../services/api";
import { Card, CardHeader, StatCard, EmptyState, LoadingState } from "../../components/ui/Blocks";

export const SUPPLIER_ORDERS_STORAGE_KEY = "pharvo_supplier_orders";

const STATUS_FILTERS = [
  { key: "all", label: "All Statuses" },
  { key: "draft", label: "Draft" },
  { key: "requested", label: "Requested" },
  { key: "received", label: "Received" },
  { key: "cancelled", label: "Cancelled" },
];

const DATE_FILTERS = [
  { key: "all", label: "All Dates" },
  { key: "today", label: "Today" },
  { key: "week", label: "Last 7 Days" },
  { key: "month", label: "Last 30 Days" },
];

const NEXT_STATUS = {
  draft: ["requested", "cancelled"],
  requested: ["received", "cancelled"],
  received: [],
  cancelled: [],
};

const STATUS_BADGE = {
  draft: "bg-slate-100 text-slate-500 border-slate-200",
  requested: "bg-amber-50 text-amber-700 border-amber-200",
  received: "bg-emerald-50 text-emerald-700 border-emerald-200",
  cancelled: "bg-red-50 text-red-700 border-red-200",
};

const STATUS_DOT = {
  draft: "bg-slate-400",
  requested: "bg-amber-500",
  received: "bg-emerald-500",
  cancelled: "bg-red-500",
};

function statusLabel(status) {
  return String(status || "—").charAt(0).toUpperCase() + String(status || "").slice(1);
}

function money(value) {
  return `৳${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function fmtDate(iso) {
  return iso ? iso.slice(0, 10) : "—";
}

function OrderBadge({ status }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border whitespace-nowrap ${
        STATUS_BADGE[status] || STATUS_BADGE.draft
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[status] || "bg-slate-400"}`} />
      {statusLabel(status)}
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
  return (order.items || []).reduce(
    (sum, item) => sum + Number(item.costPrice || 0) * Number(item.quantity || 0),
    0
  );
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
  const [receiveError, setReceiveError] = useState("");
  const [supplierId, setSupplierId] = useState("");
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
        return sum + (product ? Number(product.cost_price || 0) * Number(row.quantity || 0) : 0);
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
        if (statusFilter !== "all" && o.status !== statusFilter) return false;
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

  const statAwaiting = orders.filter((o) => o.status === "requested").length;
  const statReceived = orders.filter((o) => o.status === "received").length;
  const pendingSpend = orders
    .filter((o) => o.status === "draft" || o.status === "requested")
    .reduce((sum, o) => sum + orderTotal(o), 0);

  function openComposer() {
    setSupplierId("");
    setRows([{ productId: "", quantity: 1 }]);
    setComposerError("");
    setComposerOpen(true);
  }

  function updateRow(index, patch) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function submitComposer(status) {
    if (!selectedSupplier) {
      setComposerError("Select a supplier for the order request.");
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
        return {
          productId: Number(product.id),
          name: product.name,
          quantity: Number(row.quantity),
          costPrice: Number(product.cost_price || 0),
        };
      }),
      status,
      createdAt: now.toISOString(),
      requestedAt: status === "requested" ? now.toISOString() : null,
      receivedAt: null,
      cancelledAt: null,
      invoiceNumber: null,
    };
    setOrders((prev) => [...prev, order]);
    setComposerSaving(false);
    setComposerOpen(false);
  }

  async function receiveOrder(order) {
    setReceivingId(order.id);
    setReceiveError("");
    try {
      const purchase = await createPurchase({
        invoice_number: `RCV-${Date.now()}`,
        supplier: order.supplierId,
        items: order.items.map((item) => ({
          product: item.productId,
          quantity: item.quantity,
          unit_price: item.costPrice,
        })),
        discount: "0.00",
        purchase_date: new Date().toISOString().slice(0, 10),
      });
      updateOrder(order.id, {
        status: "received",
        receivedAt: new Date().toISOString(),
        invoiceNumber: purchase.invoice_number || null,
      });
    } catch (err) {
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

  const detailOrder = orders.find((o) => o.id === detailId) || null;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Order Requests" value={orders.length.toLocaleString()} sub="Supplier order requests" icon={ClipboardList} tone="blue" />
        <StatCard label="Awaiting Delivery" value={statAwaiting.toLocaleString()} sub="Submitted to suppliers" icon={Clock} tone="amber" />
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
                    <td className="px-3 py-3"><OrderBadge status={o.status} /></td>
                    <td className="px-3 py-3 text-center text-slate-500">{o.items?.length ?? 0}</td>
                    <td className="px-3 py-3 text-slate-500 font-normal whitespace-nowrap">{fmtDate(o.requestedAt || o.createdAt)}</td>
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
                    setRows([{ productId: "", quantity: 1 }]);
                  }}
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 text-xs text-slate-800 bg-white outline-none focus:border-blue-600 cursor-pointer"
                >
                  <option value="">Select a supplier...</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={String(s.id)}>{s.name}</option>
                  ))}
                </select>
                {selectedSupplier && (
                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400 font-normal">
                    <span className="inline-flex items-center gap-1"><Building2 size={11} /> {selectedSupplier.name}</span>
                    {selectedSupplier.phone && <span>{selectedSupplier.phone}</span>}
                    {selectedSupplier.email && <span>{selectedSupplier.email}</span>}
                    {selectedSupplier.address && <span>{selectedSupplier.address}</span>}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">Medicines</label>
                <div className="flex flex-col gap-2">
                  {rows.map((row, index) => {
                    const product = supplierProducts.find((p) => Number(p.id) === Number(row.productId));
                    return (
                      <div key={index} className="grid grid-cols-[1fr_92px_130px_32px] gap-2 items-center">
                        <select
                          value={row.productId}
                          onChange={(e) => updateRow(index, { productId: e.target.value })}
                          className="h-9 px-3 rounded-lg border border-slate-200 text-xs text-slate-800 bg-white outline-none focus:border-blue-600 cursor-pointer"
                        >
                          <option value="">Select medicine...</option>
                          {supplierProducts.map((p) => (
                            <option key={p.id} value={String(p.id)}>
                              {p.name}{p.is_sensitive ? " • Sensitive" : ""}
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={row.quantity}
                          onChange={(e) => updateRow(index, { quantity: e.target.value })}
                          className="h-9 px-3 rounded-lg border border-slate-200 text-xs text-slate-800 outline-none focus:border-blue-600 bg-white text-center"
                          placeholder="Qty"
                        />
                        <div className="text-xs text-slate-500 font-normal text-right whitespace-nowrap">
                          {product && Number(product.cost_price) > 0 ? (
                            <span>{money(product.cost_price)} <span className="text-slate-300">/ pc</span></span>
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
                <OrderBadge status={detailOrder.status} />
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
                  <ClipboardList size={14} className="text-slate-400" />
                  <span className="text-xs font-semibold text-slate-700">Medicines</span>
                </div>
                <div className="divide-y divide-slate-50">
                  {detailOrder.items.map((item) => (
                    <div key={item.productId} className="px-4 py-2.5 flex items-center justify-between gap-3">
                      <span className="text-xs font-medium text-slate-700">{item.name}</span>
                      <span className="text-xs text-slate-500 font-normal whitespace-nowrap">
                        {item.quantity} pc × {money(item.costPrice)} = <span className="text-slate-800 font-semibold">{money(item.quantity * item.costPrice)}</span>
                      </span>
                    </div>
                  ))}
                  <div className="px-4 py-3 flex items-center justify-between gap-3 bg-slate-50/70">
                    <span className="text-xs font-semibold text-slate-500">Estimated total</span>
                    <span className="text-sm font-semibold text-slate-900">{money(orderTotal(detailOrder))}</span>
                  </div>
                </div>
              </div>

              {detailOrder.invoiceNumber && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 font-medium">
                  <PackageCheck size={13} className="shrink-0" />
                  <span>Received on <span className="font-mono">{detailOrder.invoiceNumber}</span> — stock has been added.</span>
                </div>
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
                  : "Receiving stock records a purchase through the receiving flow."}
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
                    onClick={() => receiveOrder(detailOrder)}
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
    </div>
  );
}