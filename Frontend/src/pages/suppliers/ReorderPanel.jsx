import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  AlertTriangle,
  Building2,
  ClipboardList,
  Pill,
  Plus,
  RefreshCw,
} from "lucide-react";
import { fetchProducts, fetchSuppliers } from "../../services/medicine";
import { ROLES } from "../../services/auth";
import { ApiError } from "../../services/api";
import {
  Card,
  CardHeader,
  StatCard,
  LoadingState,
  EmptyState,
} from "../../components/ui/Blocks";
import { formatBreakdownShort } from "../../utils/units";
import {
  ORDERS_CHANGED_EVENT,
  loadSettings,
  saveSettings,
  planDrafts,
  buildDraftOrders,
  thresholdFor,
} from "../../utils/reorder.mjs";
import { SUPPLIER_ORDERS_STORAGE_KEY } from "../orders/SupplierOrdersView";

function readOrders() {
  try {
    return JSON.parse(
      localStorage.getItem(SUPPLIER_ORDERS_STORAGE_KEY) || "[]"
    );
  } catch (err) {
    return [];
  }
}

function writeOrders(next) {
  localStorage.setItem(SUPPLIER_ORDERS_STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(ORDERS_CHANGED_EVENT));
}

/**
 * Admin reorder monitor.
 *
 * - Detects low-stock medicines from LIVE inventory (`stock_quantity` vs
 *   `reorder_level`, plus the configured % of reorder level remaining).
 * - Matches each medicine to its mapped supplier (single FK). Unmapped
 *   medicines are listed for assignment — never auto-drafted.
 * - Creates DRAFTS only (grouped per supplier, skipping anything already in
 *   an active draft). Admin reviews/edits quantities here, then approves via
 *   Submit Request in the Orders tab. Manual creation is untouched.
 */
export default function ReorderPanel({ role = ROLES.ADMIN } = {}) {
  const isAdmin = role === ROLES.ADMIN;
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [settings, setSettings] = useState(loadSettings);
  const [ordersSnap, setOrdersSnap] = useState(readOrders);
  const [qtyEdit, setQtyEdit] = useState({});
  const [result, setResult] = useState("");
  const [working, setWorking] = useState(false);
  const autoRan = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [productList, supplierList] = await Promise.all([
        fetchProducts({}),
        fetchSuppliers({}),
      ]);
      setProducts(productList || []);
      setSuppliers(supplierList || []);
      setOrdersSnap(readOrders());
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Unable to load inventory."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const refresh = () => setOrdersSnap(readOrders());
    const onStorage = (e) => {
      if (!e.key || e.key === SUPPLIER_ORDERS_STORAGE_KEY) refresh();
    };
    window.addEventListener(ORDERS_CHANGED_EVENT, refresh);
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener(ORDERS_CHANGED_EVENT, refresh);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  function updateSettings(patch) {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }

  const plan = planDrafts({ products, suppliers, orders: ordersSnap, settings });
  const openCount = plan.suggestions.filter((s) => !s.alreadyCovered).length;

  const createDrafts = useCallback(
    (overrides, auto) => {
      const fresh = readOrders();
      const live = planDrafts({
        products,
        suppliers,
        orders: fresh,
        settings,
      });
      const withQty = live.suggestions.map((s) => {
        const raw = overrides ? overrides[s.product.id] : undefined;
        if (raw === undefined) return s;
        const qty = Number(String(raw).trim());
        return {
          ...s,
          qty: Number.isFinite(qty) ? Math.max(Math.floor(qty), 0) : s.qty,
        };
      });
      const drafts = buildDraftOrders({
        suggestions: withQty,
        orders: fresh,
      });
      if (drafts.length === 0) {
        setResult(
          "Nothing new to draft — every low-stock medicine is already covered by an active draft or has no mapped supplier."
        );
        return 0;
      }
      writeOrders([...fresh, ...drafts]);
      setOrdersSnap([...fresh, ...drafts]);
      setResult(
        `${auto ? "Automatic check" : "Created"} ${drafts.length} reorder draft${drafts.length === 1 ? "" : "s"} ` +
          `(${drafts.map((d) => d.ref).join(", ")}). Review quantities, then approve via Submit Request in the Orders tab. Nothing was sent and no money was spent.`
      );
      return drafts.length;
    },
    [products, suppliers, settings]
  );

  // Safety default: automatic run creates drafts only, once per page load.
  useEffect(() => {
    if (loading || autoRan.current || !isAdmin) return;
    autoRan.current = true;
    if (settings.enabled) {
      setWorking(true);
      try {
        createDrafts(null, true);
      } finally {
        setWorking(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Low-Stock Medicines"
          value={(plan.suggestions.length + plan.unmapped.length).toLocaleString()}
          sub={`At or below ${settings.warnPct}% of reorder level`}
          icon={Pill}
          tone="amber"
        />
        <StatCard
          label="Ready to Draft"
          value={openCount.toLocaleString()}
          sub="Mapped supplier, no active draft"
          icon={ClipboardList}
          tone="blue"
        />
        <StatCard
          label="Needs Supplier"
          value={plan.unmapped.length.toLocaleString()}
          sub="Low stock, no mapped supplier"
          icon={Building2}
          tone="red"
        />
      </div>

      <Card>
        <CardHeader
          title="Reorder Settings"
          subtitle="Drafts only — orders are never sent automatically"
          action={
            isAdmin ? (
              <button
                onClick={() => createDrafts(qtyEdit, false)}
                disabled={working || loading}
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-[#2563EB] text-white text-xs font-medium hover:bg-[#1d4ed8] transition-colors cursor-pointer disabled:opacity-60"
              >
                <Plus size={14} />
                Create Drafts Now
              </button>
            ) : null
          }
        />
        <div className="px-5 py-4 flex flex-col gap-3">
          <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(e) => updateSettings({ enabled: e.target.checked })}
              className="w-4 h-4 accent-blue-600"
            />
            Automatically create reorder drafts when a threshold is reached (drafts only)
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Reorder threshold (% of reorder level REMAINING)
              </label>
              <input
                type="number"
                min="1"
                step="1"
                value={settings.warnPct}
                onChange={(e) => updateSettings({ warnPct: e.target.value })}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 text-xs outline-none focus:border-blue-600"
              />
              <p className="mt-1 text-[11px] text-slate-400 font-normal">
                100% = draft at or below the reorder level (out-of-stock always
                included). Higher = earlier warning. This is stock remaining,
                not stock depleted.
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Suggested quantity (top up to × reorder level)
              </label>
              <input
                type="number"
                min="1"
                step="0.5"
                value={settings.coverMult}
                onChange={(e) => updateSettings({ coverMult: e.target.value })}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 text-xs outline-none focus:border-blue-600"
              />
              <p className="mt-1 text-[11px] text-slate-400 font-normal">
                No per-medicine reorder quantity exists in the schema, so one
                global default applies: order up to this multiple of the
                reorder level (minimum 1 Box, or 1 PC for Cream/Syrup). Edit per row before creating.
              </p>
            </div>
          </div>
          {result && (
            <div className="px-3 py-2 rounded-lg bg-blue-50/60 border border-blue-100 text-[11px] text-blue-700 font-normal">
              {result}
            </div>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Suggested Reorders"
          subtitle="Review and edit quantities, then create drafts for approval"
          action={
            <button
              onClick={load}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-slate-900 cursor-pointer"
            >
              <RefreshCw size={13} />
              Reload inventory
            </button>
          }
        />
        {error && (
          <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border-b border-red-200 text-xs text-red-700 font-medium">
            <AlertTriangle size={13} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {loading ? (
          <LoadingState label="Checking stock levels..." />
        ) : plan.suggestions.length === 0 && plan.unmapped.length === 0 ? (
          <EmptyState icon={Pill} title="Stock levels healthy" subtitle="No medicine is at or below its reorder threshold." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50/70 border-b border-slate-100 text-[11px] text-slate-400 font-semibold uppercase tracking-wider">
                  <th className="px-4 py-2.5">Medicine</th>
                  <th className="px-3 py-2.5">Stock / Reorder</th>
                  <th className="px-3 py-2.5">Supplier</th>
                  <th className="px-3 py-2.5 text-center">Suggested qty</th>
                  <th className="px-4 py-2.5 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-xs">
                {plan.suggestions.map((s) => {
                  const qty =
                    qtyEdit[s.product.id] !== undefined
                      ? qtyEdit[s.product.id]
                      : String(s.qty);
                  const unitLabel = s.unit === "box" ? "Box" : "PC";
                  const pcsEq = Number(qty) > 0 && s.unit === "box" ? Number(qty) * Number(s.pcsPerBox || 1) : null;
                  return (
                    <tr key={s.product.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-800">{s.product.name}</div>
                        <div className="text-[11px] text-slate-400">
                          {unitLabel}{pcsEq ? ` · ≈ ${formatBreakdownShort(pcsEq, s.product)}` : ""}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-slate-600 whitespace-nowrap">
                        {Number(s.product.stock_quantity)} / {Number(s.product.reorder_level)}
                        <span className="text-slate-400"> (≤ {thresholdFor(s.product, settings)})</span>
                      </td>
                      <td className="px-3 py-3 text-slate-600">{s.supplier.name}</td>
                      <td className="px-3 py-3 text-center">
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={qty}
                          disabled={s.alreadyCovered}
                          onChange={(e) =>
                            setQtyEdit((prev) => ({
                              ...prev,
                              [s.product.id]: e.target.value,
                            }))
                          }
                          className="w-20 h-8 px-2 rounded-lg border border-slate-200 text-xs text-center outline-none focus:border-blue-600 disabled:bg-slate-50 disabled:text-slate-400"
                        />
                      </td>
                      <td className="px-4 py-3 text-right">
                        {s.alreadyCovered ? (
                          <span className="text-[11px] text-slate-400 font-medium">
                            In {s.coveringRef}
                          </span>
                        ) : (
                          <span className="text-[11px] text-blue-600 font-semibold">Ready</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {plan.unmapped.length > 0 && (
        <Card>
          <CardHeader
            title="Needs Supplier Mapping"
            subtitle="Low stock but no mapped supplier — assign one in Suppliers before a draft can be created"
          />
          <div className="divide-y divide-slate-50">
            {plan.unmapped.map((p) => (
              <div key={p.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                <span className="text-xs font-medium text-slate-700">{p.name}</span>
                <span className="text-[11px] text-slate-400 font-normal">
                  Stock {Number(p.stock_quantity)} / reorder {Number(p.reorder_level)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
