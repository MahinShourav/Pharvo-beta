import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Bell,
  CheckCheck,
  Check,
  AlertTriangle,
  ShieldAlert,
  Info,
  Clock,
  X,
  PackageCheck,
  Ban,
  ClipboardList,
  Building2,
  Users,
} from "lucide-react";
import {
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "../../services/notifications";
import { fetchInteractions, fetchProducts } from "../../services/medicine";
import { fetchReminders } from "../../services/crm";
import { ApiError } from "../../services/api";
import { SUPPLIER_ORDERS_STORAGE_KEY } from "../orders/SupplierOrdersView";
import { Card, CardHeader, StatusBadge, LoadingState, EmptyState } from "../../components/ui/Blocks";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
];

const SECTION_HEADER = "px-5 pt-4 pb-2 first:pt-5 text-[11px] font-semibold uppercase tracking-wider text-slate-400";

function severityMeta(severity) {
  const map = {
    critical: { icon: ShieldAlert, tone: "bg-red-50 text-red-600", label: "Critical" },
    warning: { icon: AlertTriangle, tone: "bg-amber-50 text-amber-600", label: "Warning" },
    info: { icon: Info, tone: "bg-blue-50 text-blue-600", label: "Info" },
  };
  return map[severity] || map.info;
}

function interactionMeta(level) {
  const map = {
    contraindicated: { icon: ShieldAlert, tone: "bg-red-50 text-red-600", label: "Contraindicated" },
    high_risk: { icon: ShieldAlert, tone: "bg-red-50 text-red-600", label: "High risk" },
    avoid: { icon: ShieldAlert, tone: "bg-red-50 text-red-600", label: "Avoid" },
    caution: { icon: AlertTriangle, tone: "bg-amber-50 text-amber-600", label: "Caution" },
    beneficial: { icon: Info, tone: "bg-blue-50 text-blue-600", label: "Beneficial" },
  };
  return map[level] || { icon: Info, tone: "bg-blue-50 text-blue-600", label: level || "Interaction" };
}

const ORDER_STATUS_PILL = {
  draft: "bg-slate-100 text-slate-500 border-slate-200",
  requested: "bg-amber-50 text-amber-700 border-amber-200",
  received: "bg-emerald-50 text-emerald-700 border-emerald-200",
  cancelled: "bg-red-50 text-red-700 border-red-200",
};

const ORDER_STATUS_DOT = {
  draft: "bg-slate-400",
  requested: "bg-amber-500",
  received: "bg-emerald-500",
  cancelled: "bg-red-500",
};

function orderStatusPill(status) {
  return ORDER_STATUS_PILL[status] || ORDER_STATUS_PILL.draft;
}

function orderStatusMeta(status) {
  const map = {
    draft: { icon: ClipboardList, tone: "bg-slate-100 text-slate-500", label: "Draft" },
    requested: { icon: Clock, tone: "bg-amber-50 text-amber-600", label: "Requested" },
    received: { icon: PackageCheck, tone: "bg-emerald-50 text-emerald-600", label: "Received" },
    cancelled: { icon: Ban, tone: "bg-red-50 text-red-600", label: "Cancelled" },
  };
  return map[status] || map.draft;
}

function statusLabel(status) {
  return String(status || "—").charAt(0).toUpperCase() + String(status || "").slice(1);
}

function money(value) {
  return `৳${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function fmtDate(iso) {
  return iso ? iso.slice(0, 10) : "—";
}

function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function timeAgo(iso) {
  if (!iso) return "—";
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function orderTotal(order) {
  return (order.items || []).reduce(
    (sum, item) => sum + Number(item.costPrice || 0) * Number(item.quantity || 0),
    0
  );
}

export default function PharmacistNotificationsView({ onChanged }) {
  const [filter, setFilter] = useState("all");
  const [notifications, setNotifications] = useState([]);
  const [interactions, setInteractions] = useState([]);
  const [sensitive, setSensitive] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [marking, setMarking] = useState(false);
  const [detailItem, setDetailItem] = useState(null);
  const [supplierOrders, setSupplierOrders] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(SUPPLIER_ORDERS_STORAGE_KEY) || "[]");
    } catch (err) {
      return [];
    }
  });

  useEffect(() => {
    let alive = true;
    const unreadOnly = filter === "unread";
    setLoading(true);
    setError("");
    fetchNotifications(unreadOnly ? { is_read: "false" } : {})
      .then((data) => {
        if (alive) setNotifications(data || []);
      })
      .catch((err) => {
        if (alive) {
          setError(err instanceof ApiError ? err.message : "Unable to load notifications.");
          setNotifications([]);
        }
      });
    if (unreadOnly) {
      setLoading(false);
      return () => {
        alive = false;
      };
    }
    Promise.allSettled([
      fetchInteractions({ active: "true" }),
      fetchProducts({ is_active: "true" }),
      fetchReminders({ active: "true" }),
    ]).then(([interactionRes, productRes, reminderRes]) => {
      if (!alive) return;
      if (interactionRes.status === "fulfilled") setInteractions(interactionRes.value || []);
      if (productRes.status === "fulfilled")
        setSensitive((productRes.value || []).filter((p) => p.is_sensitive));
      if (reminderRes.status === "fulfilled") setReminders(reminderRes.value || []);
      setLoading(false);
    });
    setSupplierOrders(() => {
      try {
        return JSON.parse(localStorage.getItem(SUPPLIER_ORDERS_STORAGE_KEY) || "[]");
      } catch (err) {
        return [];
      }
    });
    return () => {
      alive = false;
    };
  }, [filter]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.is_read).length,
    [notifications]
  );

  const handleMarkRead = async (id) => {
    try {
      await markNotificationRead(id);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
      onChanged?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to update notification.");
    }
  };

  const handleMarkAll = async () => {
    setMarking(true);
    setError("");
    try {
      await markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      onChanged?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to update notifications.");
    } finally {
      setMarking(false);
    }
  };

  const stockItems = notifications.map((n) => {
    const meta = severityMeta(n.severity);
    return { kind: "stock", id: n.id, read: n.is_read, meta, n };
  });

  const interactionItems = interactions
    .filter((i) => i.interaction_level !== "beneficial")
    .map((i) => {
      const meta = interactionMeta(i.interaction_level);
      return { kind: "interaction", id: i.id, read: true, meta, i };
    });

  const sensitiveItems = sensitive.map((p) => ({
    kind: "sensitive",
    id: p.id,
    read: true,
    meta: { icon: ShieldAlert, tone: "bg-amber-50 text-amber-600", label: "Sensitive" },
    p,
  }));

  const supplierItems = supplierOrders.map((o) => {
    const meta = orderStatusMeta(o.status);
    return { kind: "supplier", id: o.id, read: true, meta, o };
  });

  const reminderItems = reminders.map((r) => ({
    kind: "reminder",
    id: r.id,
    read: true,
    meta: { icon: Clock, tone: "bg-blue-50 text-blue-600", label: "Reminder" },
    r,
  }));

  const allItems = [
    { label: "Stock & Expiry", items: stockItems, key: "stock" },
    ...(interactionItems.length > 0
      ? [{ label: "Drug Interactions", items: interactionItems, key: "interaction" }]
      : []),
    ...(sensitiveItems.length > 0
      ? [{ label: "Sensitive Medicines", items: sensitiveItems, key: "sensitive" }]
      : []),
    ...(supplierItems.length > 0
      ? [{ label: "Supplier Orders", items: supplierItems, key: "supplier" }]
      : []),
    ...(reminderItems.length > 0
      ? [{ label: "CRM Reminders", items: reminderItems, key: "reminder" }]
      : []),
  ];

  const allCount = allItems.reduce((sum, section) => sum + section.items.length, 0);

  function renderRow(item) {
    if (item.kind === "stock") {
      const { n, meta } = item;
      const Icon = meta.icon;
      return (
        <div
          key={`stock-${n.id}`}
          onClick={() => setDetailItem(item)}
          className={`flex items-start gap-4 px-5 py-5 transition-colors cursor-pointer ${
            n.is_read ? "bg-white" : "bg-blue-50/40"
          }`}
        >
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${meta.tone}`}>
            <Icon size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[15px] font-semibold text-slate-900">{n.title}</span>
              {!n.is_read && <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0" title="Unread" />}
            </div>
            {n.message && <p className="text-[13px] text-slate-500 font-normal mt-1 leading-relaxed">{n.message}</p>}
            <div className="flex items-center gap-2.5 mt-2.5 flex-wrap">
              {n.product_name && (
                <span className="text-[11px] px-2 py-1 rounded bg-slate-100 text-slate-500 border border-slate-200 font-medium">
                  {n.product_name}
                </span>
              )}
              <StatusBadge status={meta.label} />
              <span className="text-[11px] text-slate-400 flex items-center gap-1">
                <Clock size={12} />
                {timeAgo(n.created_at)}
              </span>
            </div>
          </div>
          {!n.is_read && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleMarkRead(n.id);
              }}
              title="Mark as read"
              className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg cursor-pointer shrink-0 transition-colors"
            >
              <Check size={16} />
            </button>
          )}
        </div>
      );
    }

    if (item.kind === "interaction") {
      const { i, meta } = item;
      const Icon = meta.icon;
      return (
        <div
          key={`interaction-${i.id}`}
          onClick={() => setDetailItem(item)}
          className="flex items-start gap-4 px-5 py-5 transition-colors bg-white hover:bg-slate-50/60 cursor-pointer"
        >
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${meta.tone}`}>
            <Icon size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[15px] font-semibold text-slate-900">{i.drug_a} + {i.drug_b}</span>
            </div>
            {i.description && (
              <p className="text-[13px] text-slate-500 font-normal mt-1 leading-relaxed">{i.description}</p>
            )}
            <div className="flex items-center gap-2.5 mt-2.5 flex-wrap">
              <StatusBadge status={meta.label} />
              <span className="text-[11px] text-slate-400 flex items-center gap-1">
                <Clock size={12} />
                {i.created_at ? timeAgo(i.created_at) : "—"}
              </span>
            </div>
          </div>
        </div>
      );
    }

    if (item.kind === "sensitive") {
      const { p, meta } = item;
      const Icon = meta.icon;
      return (
        <div
          key={`sensitive-${p.id}`}
          onClick={() => setDetailItem(item)}
          className="flex items-start gap-4 px-5 py-5 transition-colors bg-white hover:bg-slate-50/60 cursor-pointer"
        >
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${meta.tone}`}>
            <Icon size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[15px] font-semibold text-slate-900">{p.name}</span>
            </div>
            <p className="text-[13px] text-slate-500 font-normal mt-1 leading-relaxed">
              Sensitive medicine — pharmacist approval required at POS checkout.
            </p>
            <div className="flex items-center gap-2.5 mt-2.5 flex-wrap">
              {p.brand && (
                <span className="text-[11px] px-2 py-1 rounded bg-slate-100 text-slate-500 border border-slate-200 font-medium">
                  {p.brand}
                </span>
              )}
              <StatusBadge status="Sensitive" />
              <span className="text-[11px] text-slate-400 flex items-center gap-1">
                {Number(p.stock_quantity)} in stock
              </span>
            </div>
          </div>
        </div>
      );
    }

    if (item.kind === "supplier") {
      const { o, meta } = item;
      const Icon = meta.icon;
      return (
        <div
          key={`supplier-${o.id}`}
          onClick={() => setDetailItem(item)}
          className="flex items-start gap-4 px-5 py-5 transition-colors bg-white hover:bg-slate-50/60 cursor-pointer"
        >
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${meta.tone}`}>
            <Icon size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[15px] font-semibold text-slate-900">{o.ref}</span>
              {o.supplierName && <span className="text-[13px] text-slate-500 font-normal">{o.supplierName}</span>}
            </div>
            <p className="text-[13px] text-slate-500 font-normal mt-1 leading-relaxed">
              {o.status === "received"
                ? `Goods received${o.invoiceNumber ? ` · ${o.invoiceNumber}` : ""} — stock added.`
                : o.status === "cancelled"
                ? "Order request cancelled."
                : o.status === "requested"
                ? "Awaiting delivery from the supplier."
                : "Order request saved as a draft."}
            </p>
            <div className="flex items-center gap-2.5 mt-2.5 flex-wrap">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border whitespace-nowrap ${orderStatusPill(o.status)}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${ORDER_STATUS_DOT[o.status] || "bg-slate-400"}`} />
                {statusLabel(o.status)}
              </span>
              <span className="text-[11px] px-2 py-1 rounded bg-slate-100 text-slate-500 border border-slate-200 font-medium">
                {money(orderTotal(o))}
              </span>
              <span className="text-[11px] text-slate-400 flex items-center gap-1">
                <Clock size={12} />
                {fmtDate(o.requestedAt || o.receivedAt || o.createdAt)}
              </span>
            </div>
          </div>
        </div>
      );
    }

    const { r, meta } = item;
    const Icon = meta.icon;
    return (
      <div
        key={`reminder-${r.id}`}
        onClick={() => setDetailItem(item)}
        className="flex items-start gap-4 px-5 py-5 transition-colors bg-white hover:bg-slate-50/60 cursor-pointer"
      >
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${meta.tone}`}>
          <Icon size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[15px] font-semibold text-slate-900">{r.title}</span>
          </div>
          <p className="text-[13px] text-slate-500 font-normal mt-1 leading-relaxed">
            {[r.customer_name, r.product_name].filter(Boolean).join(" · ")}
          </p>
          <div className="flex items-center gap-2.5 mt-2.5 flex-wrap">
            <StatusBadge status="Reminder" />
            <span className="text-[11px] text-slate-400 flex items-center gap-1">
              <Clock size={12} />
              {r.reminder_time ? timeAgo(r.reminder_time) : "—"}
            </span>
          </div>
        </div>
      </div>
    );
  }

  function renderDetail(item) {
    if (!item) return null;
    const meta = item.meta;
    const Icon = meta.icon;
    return (
      <div className="p-6 flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${meta.tone}`}>
            <Icon size={18} />
          </div>
          <div className="min-w-0">
            <div className="text-[15px] font-semibold text-slate-900">
              {item.kind === "stock" && <span>{item.n.title}</span>}
              {item.kind === "interaction" && <span>{item.i.drug_a} + {item.i.drug_b}</span>}
              {item.kind === "sensitive" && <span>{item.p.name}</span>}
              {item.kind === "supplier" && <span>{item.o.ref} · {item.o.supplierName}</span>}
              {item.kind === "reminder" && <span>{item.r.title}</span>}
            </div>
            <div className="mt-1 text-[11px] text-slate-400 font-normal">{meta.label}</div>
          </div>
        </div>

        {item.kind === "stock" && (
          <div className="rounded-xl border border-slate-100 overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50/70 border-b border-slate-100 flex items-center gap-2">
              <Bell size={14} className="text-slate-400" />
              <span className="text-xs font-semibold text-slate-700">Alert</span>
            </div>
            <div className="px-4 py-3 flex flex-col gap-1 text-xs text-slate-600 font-normal">
              <DetailRow label="Type" value={item.n.type?.replace(/_/g, " ")} />
              {item.n.product_name && <DetailRow label="Medicine" value={item.n.product_name} />}
              <DetailRow label="Message" value={item.n.message || "—"} />
              <DetailRow label="Severity" value={meta.label} />
              <DetailRow label="Created" value={fmtDateTime(item.n.created_at)} />
              <DetailRow label="Status" value={item.n.is_read ? "Read" : "Unread"} />
            </div>
          </div>
        )}

        {item.kind === "interaction" && (
          <div className="rounded-xl border border-slate-100 overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50/70 border-b border-slate-100 flex items-center gap-2">
              <ShieldAlert size={14} className="text-slate-400" />
              <span className="text-xs font-semibold text-slate-700">Drug interaction</span>
            </div>
            <div className="px-4 py-3 flex flex-col gap-1 text-xs text-slate-600 font-normal">
              <DetailRow label="Drug A" value={item.i.drug_a} />
              <DetailRow label="Drug B" value={item.i.drug_b} />
              <DetailRow label="Level" value={meta.label} />
              {item.i.description && <DetailRow label="Description" value={item.i.description} />}
              {item.i.created_at && <DetailRow label="Recorded" value={fmtDateTime(item.i.created_at)} />}
            </div>
          </div>
        )}

        {item.kind === "sensitive" && (
          <div className="rounded-xl border border-slate-100 overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50/70 border-b border-slate-100 flex items-center gap-2">
              <ShieldAlert size={14} className="text-slate-400" />
              <span className="text-xs font-semibold text-slate-700">Sensitive medicine</span>
            </div>
            <div className="px-4 py-3 flex flex-col gap-1 text-xs text-slate-600 font-normal">
              <DetailRow label="Medicine" value={item.p.name} />
              {item.p.brand && <DetailRow label="Brand" value={item.p.brand} />}
              {item.p.supplier_name && <DetailRow label="Supplier" value={item.p.supplier_name} />}
              <DetailRow label="Stock" value={`${item.p.stock_quantity} pc(s)`} />
              {item.p.reorder_level != null && <DetailRow label="Reorder level" value={String(item.p.reorder_level)} />}
              <DetailRow label="Approval note" value="Requires pharmacist approval at POS checkout." />
            </div>
          </div>
        )}

        {item.kind === "supplier" && (
          <div className="flex flex-col gap-3">
            <div className="rounded-xl border border-slate-100 overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50/70 border-b border-slate-100 flex items-center gap-2">
                <Building2 size={14} className="text-slate-400" />
                <span className="text-xs font-semibold text-slate-700">Supplier</span>
              </div>
              <div className="px-4 py-3 flex flex-col gap-1 text-xs text-slate-600 font-normal">
                <DetailRow label="Order" value={item.o.ref} />
                <DetailRow label="Supplier" value={item.o.supplierName} />
                {(item.o.supplierPhone || item.o.supplierEmail) && (
                  <DetailRow
                    label="Contact"
                    value={[item.o.supplierPhone, item.o.supplierEmail].filter(Boolean).join(" · ")}
                  />
                )}
                <DetailRow label="Status" value={statusLabel(item.o.status)} />
                <DetailRow label="Requested" value={fmtDateTime(item.o.requestedAt || item.o.createdAt)} />
                {item.o.receivedAt && <DetailRow label="Received" value={fmtDateTime(item.o.receivedAt)} />}
                {item.o.cancelledAt && <DetailRow label="Cancelled" value={fmtDateTime(item.o.cancelledAt)} />}
                {item.o.invoiceNumber && <DetailRow label="Invoice" value={item.o.invoiceNumber} />}
                <DetailRow label="Estimated total" value={money(orderTotal(item.o))} />
              </div>
            </div>
            <div className="rounded-xl border border-slate-100 overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50/70 border-b border-slate-100 flex items-center gap-2">
                <ClipboardList size={14} className="text-slate-400" />
                <span className="text-xs font-semibold text-slate-700">Medicines</span>
              </div>
              <div className="divide-y divide-slate-50">
                {item.o.items.map((it) => (
                  <div key={it.productId} className="px-4 py-2.5 flex items-center justify-between gap-3">
                    <span className="text-xs font-medium text-slate-700">{it.name}</span>
                    <span className="text-xs text-slate-500 font-normal whitespace-nowrap">
                      {it.quantity} pc × {money(it.costPrice)} = <span className="text-slate-800 font-semibold">{money(it.quantity * it.costPrice)}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {item.kind === "reminder" && (
          <div className="rounded-xl border border-slate-100 overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50/70 border-b border-slate-100 flex items-center gap-2">
              <Users size={14} className="text-slate-400" />
              <span className="text-xs font-semibold text-slate-700">CRM reminder</span>
            </div>
            <div className="px-4 py-3 flex flex-col gap-1 text-xs text-slate-600 font-normal">
              <DetailRow label="Reminder" value={item.r.title} />
              {item.r.customer_name && <DetailRow label="Customer" value={item.r.customer_name} />}
              {item.r.product_name && <DetailRow label="Medicine" value={item.r.product_name} />}
              <DetailRow label="Scheduled" value={fmtDateTime(item.r.reminder_time)} />
              <DetailRow label="Status" value={item.r.is_active ? "Active" : "Inactive"} />
              {item.r.created_at && <DetailRow label="Created" value={fmtDateTime(item.r.created_at)} />}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 w-full">
      <Card>
        <CardHeader
          title="Notifications"
          subtitle={unreadCount > 0 ? `${unreadCount} unread` : "You're all caught up"}
          action={
            <div className="flex items-center gap-2">
              <div className="inline-flex gap-1 p-1 bg-slate-100 rounded-lg">
                {FILTERS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setFilter(f.key)}
                    className={`px-3.5 py-2 rounded-md text-[13px] font-medium transition-colors cursor-pointer ${
                      filter === f.key
                        ? "bg-white text-slate-900 shadow-xs"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={handleMarkAll}
                disabled={marking || unreadCount === 0}
                className="px-4 py-2 rounded-lg text-[13px] font-medium text-blue-600 bg-blue-50 border border-blue-100 hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1.5"
              >
                <CheckCheck size={16} />
                {marking ? "Marking..." : "Mark all read"}
              </button>
            </div>
          }
        />

        {error && (
          <div className="flex items-center gap-2 px-5 py-3.5 bg-red-50 border-b border-red-200 text-sm text-red-700 font-medium">
            <AlertTriangle size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <LoadingState label="Loading notifications..." />
        ) : allCount === 0 ? (
          <EmptyState icon={Bell} title="No notifications" subtitle="Stock, expiry, interaction and operational alerts will appear here." />
        ) : (
          <div className="divide-y divide-slate-50">
            {allItems.map((section) =>
              section.items.length > 0 ? (
                <div key={section.key} className="py-0.5">
                  <div className={SECTION_HEADER}>{section.label}</div>
                  <div className="divide-y divide-slate-50">
                    {section.items.map((item) => renderRow(item))}
                  </div>
                </div>
              ) : null
            )}
          </div>
        )}
      </Card>

      {detailItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[1px]"
          onClick={() => setDetailItem(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-[560px] overflow-hidden max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
              <h3 className="font-semibold text-slate-800 text-sm">Notification Details</h3>
              <button
                onClick={() => setDetailItem(null)}
                className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X size={15} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1">{renderDetail(detailItem)}</div>
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2 bg-slate-50/50 flex-shrink-0">
              <button
                type="button"
                onClick={() => setDetailItem(null)}
                className="h-9 px-4 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4 py-0.5">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 shrink-0 w-24">{label}</span>
      <span className="text-right text-slate-700">{value}</span>
    </div>
  );
}