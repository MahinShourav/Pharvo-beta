import React, { useState, useEffect, useCallback } from "react";
import {
  Package,
  FileEdit,
  Send,
  PackageCheck,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { fetchDashboard } from "../../services/dashboard";
import { ROLES } from "../../services/auth";
import { ApiError } from "../../services/api";
import { StatCard } from "../../components/ui/Blocks";
import SupplierOrdersView, {
  SUPPLIER_ORDERS_STORAGE_KEY,
} from "../orders/SupplierOrdersView";
import SuppliersPage from "./SuppliersPage";
import ReorderPanel from "./ReorderPanel";
import { ORDERS_CHANGED_EVENT } from "../../utils/reorder.mjs";

/**
 * Admin "Supplier & Orders" hub.
 *
 * Composition only — no new tables, endpoints, or stock logic:
 * - Overview cards read real data: low-stock + received totals come from the
 *   existing dashboard API (`GET /api/dashboard/`); pending/sent counts come
 *   from the existing manual-order store (`SupplierOrdersView` localStorage).
 * - The Orders tab reuses `SupplierOrdersView` (search/filter by supplier,
 *   status, date; manual creation; order details). Creating an order request
 *   only writes localStorage — stock increases solely on Receive via the
 *   existing `POST /api/purchases/` receiving flow.
 * - The Suppliers tab reuses `SuppliersPage` (list + details access).
 * - The Reorders tab monitors live stock and creates drafts only for
 *   approval in the Orders tab (never auto-sent). */
function readManualOrders() {
  try {
    return JSON.parse(
      localStorage.getItem(SUPPLIER_ORDERS_STORAGE_KEY) || "[]"
    );
  } catch (err) {
    return [];
  }
}

export default function SupplierOrdersDashboard({ role = ROLES.ADMIN } = {}) {
  const [tab, setTab] = useState("orders");
  const [dash, setDash] = useState(null);
  const [dashLoading, setDashLoading] = useState(true);
  const [dashError, setDashError] = useState("");
  const [manualOrders, setManualOrders] = useState(readManualOrders);

  const refreshManual = useCallback(() => {
    setManualOrders(readManualOrders());
  }, []);

  const loadDash = useCallback(async () => {
    setDashLoading(true);
    setDashError("");
    try {
      setDash(await fetchDashboard(30));
    } catch (err) {
      setDashError(
        err instanceof ApiError ? err.message : "Unable to load dashboard data."
      );
    } finally {
      setDashLoading(false);
    }
  }, []);

  const refreshAll = useCallback(() => {
    refreshManual();
    loadDash();
  }, [refreshManual, loadDash]);

  useEffect(() => {
    loadDash();
    refreshManual();
    const onStorage = (e) => {
      if (!e.key || e.key === SUPPLIER_ORDERS_STORAGE_KEY) refreshManual();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", refreshManual);
    window.addEventListener(ORDERS_CHANGED_EVENT, refreshManual);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", refreshManual);
      window.removeEventListener(ORDERS_CHANGED_EVENT, refreshManual);
    };
  }, [loadDash, refreshManual]);

  const pendingCount = manualOrders.filter((o) => o.status === "draft").length;
  const sentCount = manualOrders.filter(
    (o) => o.status === "requested" || o.status === "partially_received"
  ).length;
  const lowStock = dashLoading ? "…" : Number(dash?.low_stock_count || 0);
  const received = dashLoading ? "…" : Number(dash?.total_purchases || 0);

  function switchTab(next) {
    setTab(next);
    refreshManual();
  }

  return (
    <div className="flex flex-col gap-4">
      {dashError && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
          <AlertTriangle size={14} className="shrink-0" />
          <span>{dashError}</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Low-Stock Medicines"
          value={lowStock.toLocaleString?.() ?? lowStock}
          sub="Backend stock report (live)"
          icon={Package}
          tone="amber"
        />
        <StatCard
          label="Pending Orders"
          value={pendingCount.toLocaleString()}
          sub="Draft requests, not yet sent"
          icon={FileEdit}
          tone="slate"
        />
        <StatCard
          label="Sent Orders"
          value={sentCount.toLocaleString()}
          sub="Awaiting supplier delivery"
          icon={Send}
          tone="blue"
        />
        <StatCard
          label="Received Orders"
          value={received.toLocaleString?.() ?? received}
          sub="Purchase records (backend)"
          icon={PackageCheck}
          tone="green"
        />
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex rounded-lg border border-slate-200 p-0.5 bg-white">
          <button
            type="button"
            onClick={() => switchTab("orders")}
            className={`px-4 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer ${
              tab === "orders"
                ? "bg-blue-600 text-white shadow-2xs font-semibold"
                : "text-slate-500 hover:text-slate-900"
            }`}
          >
            Orders
          </button>
          <button
            type="button"
            onClick={() => switchTab("suppliers")}
            className={`px-4 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer ${
              tab === "suppliers"
                ? "bg-blue-600 text-white shadow-2xs font-semibold"
                : "text-slate-500 hover:text-slate-900"
            }`}
          >
            Suppliers
          </button>
          <button
            type="button"
            onClick={() => switchTab("reorders")}
            className={`px-4 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer ${
              tab === "reorders"
                ? "bg-blue-600 text-white shadow-2xs font-semibold"
                : "text-slate-500 hover:text-slate-900"
            }`}
          >
            Reorders
          </button>
        </div>
        <button
          type="button"
          onClick={refreshAll}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors cursor-pointer"
        >
          <RefreshCw size={13} />
          Refresh counts
        </button>
      </div>

      {tab === "orders" ? (
        <SupplierOrdersView />
      ) : tab === "suppliers" ? (
        <SuppliersPage role={role} />
      ) : (
        <ReorderPanel role={role} />
      )}
    </div>
  );
}
