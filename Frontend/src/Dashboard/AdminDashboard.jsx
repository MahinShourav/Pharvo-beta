import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  AlertTriangle,
  Download,
  Package,
  Receipt,
  ShieldAlert,
  ShoppingCart,
  TrendingUp,
  Users,
} from "lucide-react";
import { fetchDashboard } from "../services/dashboard";
import { fetchProducts } from "../services/medicine";
import { fetchSales } from "../services/pos";
import { fetchCustomers } from "../services/customer";
import { ApiError } from "../services/api";
import {
  ErrorBanner,
  GreetingHeader,
  KpiCard,
  LoadingState,
  Panel,
  SkeletonCards,
  ViewAllButton,
  daysUntil,
  formatMoney,
  shortDate,
  stockSeverity,
} from "./widgets";
import { StaffBanner, StaffCard, StaffEmptyState, StaffSegmented, StaffTableRow } from "./StaffBlocks";

const RANGE_OPTIONS = [
  { value: 7, label: "7D" },
  { value: 30, label: "30D" },
  { value: 90, label: "3M" },
];

function isoDay(date) {
  return date.toISOString().slice(0, 10);
}

function pctChange(current, previous) {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

/* Stacked-bar palette: teal / indigo / neutral, by rank. */
const TIER_BAR = [
  "bg-[var(--pharvo-accent)]",
  "bg-[var(--pharvo-accent-2)]",
  "bg-[var(--pharvo-line-strong)]",
  "bg-[var(--pharvo-line)]",
];

const HEALTH_BAR = {
  Healthy: "bg-[var(--pharvo-accent)]",
  Low: "bg-[var(--pharvo-warning)]",
  Out: "bg-[var(--pharvo-danger)]",
};

export function AdminDashboard({ user, onPageChange }) {
  const [days, setDays] = useState(7);
  const [data, setData] = useState(null);
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [dash, prods, salesList, customerList] = await Promise.all([
        fetchDashboard(),
        fetchProducts({ is_active: "true" }),
        fetchSales(),
        fetchCustomers().catch(() => []),
      ]);
      setData(dash);
      setProducts(prods || []);
      setSales(salesList || []);
      setCustomers(customerList || []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load dashboard data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const costMap = useMemo(() => {
    const map = {};
    (products || []).forEach((p) => {
      map[p.id] = Number(p.cost_price) || 0;
    });
    return map;
  }, [products]);

  const saleCost = useCallback(
    (s) =>
      (s.items || []).reduce(
        (sum, it) => sum + Number(it.quantity || 0) * (costMap[it.product?.id ?? it.product] || 0),
        0
      ),
    [costMap]
  );

  const todayISO = isoDay(new Date());
  const yesterdayISO = isoDay(new Date(Date.now() - 86400000));

  const todayStats = useMemo(() => {
    let todayRev = 0,
      todayCost = 0,
      yestRev = 0,
      yestCost = 0,
      todayCount = 0;
    (sales || []).forEach((s) => {
      const d = (s.sale_date || s.created_at || "").slice(0, 10);
      const rev = Number(s.payable_amount || 0);
      const cost = saleCost(s);
      if (d === todayISO) {
        todayRev += rev;
        todayCost += cost;
        todayCount += 1;
      } else if (d === yesterdayISO) {
        yestRev += rev;
        yestCost += cost;
      }
    });
    return { todayRev, todayProfit: todayRev - todayCost, yestRev, yestProfit: yestRev - yestCost, todayCount };
  }, [sales, saleCost, todayISO, yesterdayISO]);

  const chartSeries = useMemo(() => {
    const start = new Date();
    start.setDate(start.getDate() - (days - 1));
    start.setHours(0, 0, 0, 0);
    const buckets = {};
    (sales || []).forEach((s) => {
      const d = new Date(s.sale_date || s.created_at);
      if (Number.isNaN(d.getTime()) || d < start) return;
      let key, label;
      if (days === 7) {
        key = isoDay(d);
        label = d.toLocaleDateString("en-US", { weekday: "short" });
      } else if (days === 30) {
        const diff = Math.floor((d - start) / 86400000);
        const week = Math.min(Math.floor(diff / 7), 4);
        key = `w${week}`;
        label = `W${week + 1}`;
      } else {
        key = isoDay(d).slice(0, 7);
        label = d.toLocaleDateString("en-US", { month: "short" });
      }
      buckets[key] = buckets[key] || { _k: key, day: label, Sales: 0, Profit: 0 };
      buckets[key].Sales += Number(s.payable_amount || 0);
      buckets[key].Profit += Number(s.payable_amount || 0) - saleCost(s);
    });
    return Object.values(buckets)
      .sort((a, b) => (a._k < b._k ? -1 : 1))
      .map(({ _k, ...rest }) => rest);
  }, [sales, saleCost, days]);

  const lowStockProducts = useMemo(
    () => (products || []).filter((p) => Number(p.stock_quantity) <= Number(p.reorder_level)),
    [products]
  );
  const outOfStockCount = useMemo(
    () => (products || []).filter((p) => Number(p.stock_quantity) <= 0).length,
    [products]
  );
  const nearExpiryProducts = useMemo(
    () =>
      (products || [])
        .filter((p) => {
          const left = daysUntil(p.expiry_date);
          return left !== null && left >= 0 && left <= 30;
        })
        .sort((a, b) => new Date(a.expiry_date) - new Date(b.expiry_date)),
    [products]
  );
  const sensitiveCount = useMemo(
    () => (products || []).filter((p) => p.is_sensitive).length,
    [products]
  );

  const topMedicines = useMemo(() => {
    const agg = {};
    (sales || []).forEach((s) => {
      (s.items || []).forEach((it) => {
        const pid = it.product?.id ?? it.product;
        const rec = (agg[pid] = agg[pid] || { id: pid, units: 0, revenue: 0, name: it.product?.name || "Unknown" });
        rec.units += Number(it.quantity || 0);
        rec.revenue += Number(it.subtotal || 0);
      });
    });
    return Object.values(agg)
      .sort((a, b) => b.units - a.units)
      .slice(0, 5);
  }, [sales]);

  const recentSales = useMemo(
    () =>
      (sales || [])
        .slice()
        .sort((a, b) => new Date(b.created_at || b.sale_date) - new Date(a.created_at || a.sale_date))
        .slice(0, 5),
    [sales]
  );

  const recentCustomers = useMemo(() => {
    const seen = new Map();
    recentSales.forEach((s) => {
      const c = s.customer;
      const id = c?.id ?? s.customer_id;
      if (!id || seen.has(id)) return;
      seen.set(id, {
        id,
        name: c?.name || s.customer_name || "Walk-in",
        lastPurchase: s.created_at || s.sale_date,
        amount: s.payable_amount,
      });
    });
    return Array.from(seen.values()).slice(0, 5);
  }, [recentSales]);

  const salesPct = pctChange(todayStats.todayRev, todayStats.yestRev);
  const profitPct = pctChange(todayStats.todayProfit, todayStats.yestProfit);
  const marginPct = todayStats.todayRev > 0 ? (todayStats.todayProfit / todayStats.todayRev) * 100 : null;
  const crmCustomerCount = data?.total_customers ?? customers.length;

  const highMarginItems = useMemo(() => {
    const agg = {};
    (sales || []).forEach((s) => {
      (s.items || []).forEach((it) => {
        const pid = it.product?.id ?? it.product;
        const rec = (agg[pid] = agg[pid] || { id: pid, units: 0, revenue: 0, cost: 0, name: it.product?.name || "Unknown" });
        rec.units += Number(it.quantity || 0);
        rec.revenue += Number(it.subtotal || 0);
        rec.cost += Number(it.quantity || 0) * (costMap[pid] || 0);
      });
    });
    return Object.values(agg)
      .map((m) => ({ ...m, profit: m.revenue - m.cost, margin: m.revenue > 0 ? ((m.revenue - m.cost) / m.revenue) * 100 : 0 }))
      .sort((a, b) => b.margin - a.margin)
      .slice(0, 4);
  }, [sales, costMap]);

  const tierSnapshot = useMemo(() => {
    const counts = {};
    (customers || []).forEach((c) => {
      const t = String(c.membership_tier || "regular").toLowerCase();
      counts[t] = (counts[t] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);
  }, [customers]);

  const healthSegments = useMemo(() => {
    const total = products.length || 1;
    const out = products.filter((p) => Number(p.stock_quantity) <= 0).length;
    const low = lowStockProducts.length - out;
    const ok = products.length - lowStockProducts.length;
    return [
      { label: "Healthy", value: ok, total },
      { label: "Low", value: low, total },
      { label: "Out", value: out, total },
    ];
  }, [products, lowStockProducts]);

  const activityLog = useMemo(() => {
    const events = (sales || []).slice(0, 12).map((s) => ({
      key: `sale-${s.id}`,
      when: s.created_at || s.sale_date,
      title: `Sale ${s.invoice_number || ""}`.trim(),
      detail: `${s.customer?.name || s.customer_name || "Walk-in"} · ${formatMoney(s.payable_amount ?? s.total_amount)}`,
    }));
    (customers || []).slice(0, 6).forEach((c) => {
      if (!c.created_at) return;
      events.push({
        key: `cust-${c.id}`,
        when: c.created_at,
        title: `New customer ${c.name || ""}`.trim(),
        detail: `Joined${c.membership_tier ? ` · ${c.membership_tier}` : ""}`,
      });
    });
    return events
      .filter((e) => e.when && !Number.isNaN(new Date(e.when).getTime()))
      .sort((a, b) => new Date(b.when) - new Date(a.when))
      .slice(0, 8);
  }, [sales, customers]);

  const go = (page) => () => onPageChange && onPageChange(page);

  /* Export uses the browser print dialog (no export service exists). */
  const handleExport = () => window.print();

  if (loading) {
    return (
      <div className="flex flex-col gap-5 w-full max-w-[1440px] mx-auto">
        <SkeletonCards count={4} />
        <StaffCard className="p-5">
          <LoadingState label="Loading dashboard data..." />
        </StaffCard>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 w-full max-w-[1440px] mx-auto">
      {/* ── Restricted-medicine banner (pinned top) ── */}
      {sensitiveCount > 0 && (
        <StaffBanner tone="warning" icon={ShieldAlert} onClick={go("medicines-inventory")}>
          <span className="text-sm">
            <strong className="font-bold text-[var(--pharvo-ink)]">{sensitiveCount} restricted medicine{sensitiveCount === 1 ? "" : "s"}</strong>
            {" flagged for compliance review →"}
          </span>
        </StaffBanner>
      )}

      {/* ── Greeting row ── */}
      <GreetingHeader
        user={user}
        subtitle="Here's how Pharvo is doing today."
        right={
          <>
            <StaffSegmented options={RANGE_OPTIONS} value={days} onChange={setDays} label="Date range" />
            <button
              type="button"
              onClick={handleExport}
              className="staff-focus inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--pharvo-surface)] border border-[var(--pharvo-line)] hover:border-[var(--pharvo-line-strong)] text-[var(--pharvo-ink)] text-[13px] font-semibold transition-all duration-200 cursor-pointer min-h-[44px]"
            >
              <Download size={15} strokeWidth={1.75} />
              Export
            </button>
          </>
        }
      />
      <ErrorBanner message={error} onRetry={load} />

      {/* ── KPI row ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          label="Revenue"
          value={formatMoney(todayStats.todayRev)}
          hint="vs yesterday"
          trend={salesPct}
          icon={ShoppingCart}
          tone="blue"
        />
        <KpiCard
          label="Margin %"
          value={marginPct === null ? "—" : `${marginPct.toFixed(1)}%`}
          hint={formatMoney(todayStats.todayProfit) + " profit today"}
          trend={profitPct}
          icon={TrendingUp}
          tone="green"
        />
        <KpiCard
          label="CRM Customers"
          value={crmCustomerCount.toLocaleString()}
          hint="registered customers"
          icon={Users}
          tone="blue"
        />
        <KpiCard
          label="Out-of-Stock"
          value={outOfStockCount}
          hint={outOfStockCount > 0 ? "critical — restock required" : "all items available"}
          icon={Package}
          tone={outOfStockCount > 0 ? "red" : "slate"}
        />
      </div>

      {/* ── Alert strip ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <button
          type="button"
          onClick={go("medicines-inventory")}
          className="staff-focus staff-card staff-card-hover h-16 px-4 flex items-center gap-3 text-left cursor-pointer"
        >
          <span className="staff-icon-square staff-icon-warning" aria-hidden="true">
            <Package size={18} strokeWidth={1.75} />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-bold text-[var(--pharvo-ink)] truncate">
              {outOfStockCount > 0 ? `${outOfStockCount} out of stock` : `${lowStockProducts.length} low stock`}
            </span>
            <span className="block text-[11px] text-[var(--pharvo-ink-subtle)] font-normal">Critical — restock required</span>
          </span>
          <span className="staff-pill staff-pill-warning shrink-0 tabular-nums">{outOfStockCount || lowStockProducts.length}</span>
        </button>
        <button
          type="button"
          onClick={go("medicines-inventory")}
          className="staff-focus staff-card staff-card-hover h-16 px-4 flex items-center gap-3 text-left cursor-pointer"
        >
          <span className="staff-icon-square staff-icon-danger" aria-hidden="true">
            <AlertTriangle size={18} strokeWidth={1.75} />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-bold text-[var(--pharvo-ink)] truncate">
              {nearExpiryProducts.length} nearing expiry
            </span>
            <span className="block text-[11px] text-[var(--pharvo-ink-subtle)] font-normal">Review within 30 days</span>
          </span>
          <span className="staff-pill staff-pill-danger shrink-0 tabular-nums">{nearExpiryProducts.length}</span>
        </button>
        <button
          type="button"
          onClick={go("orders")}
          className="staff-focus staff-card staff-card-hover h-16 px-4 flex items-center gap-3 text-left cursor-pointer"
        >
          <span className="staff-icon-square staff-icon-accent-2" aria-hidden="true">
            <Receipt size={18} strokeWidth={1.75} />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-bold text-[var(--pharvo-ink)] truncate">
              {todayStats.todayCount} sales today
            </span>
            <span className="block text-[11px] text-[var(--pharvo-ink-subtle)] font-normal">{formatMoney(todayStats.todayRev)} revenue</span>
          </span>
          <span className="staff-pill staff-pill-accent-2 shrink-0 tabular-nums">{todayStats.todayCount}</span>
        </button>
      </div>

      {/* ── Chart row (7 + 5) ── */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <Panel
          className="xl:col-span-7"
          title="Sales & Profit"
          subtitle="Revenue and margin trend"
          action={<StaffSegmented options={RANGE_OPTIONS} value={days} onChange={setDays} label="Chart range" />}
        >
          <div className="flex items-center gap-4 mb-3">
            <span className="flex items-center gap-1.5 text-xs text-[var(--pharvo-ink-muted)]">
              <span className="w-2.5 h-2.5 rounded-full bg-[var(--pharvo-accent)] inline-block" /> Sales
            </span>
            <span className="flex items-center gap-1.5 text-xs text-[var(--pharvo-ink-muted)]">
              <span className="w-2.5 h-2.5 rounded-full bg-[var(--pharvo-accent-2)] inline-block" /> Profit
            </span>
          </div>
          {chartSeries.length === 0 ? (
            <StaffEmptyState icon={TrendingUp} title="No sales in this period yet" subtitle="Complete a sale from the POS to see the trend." />
          ) : (
            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartSeries} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="staffSales" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0EA5A4" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#0EA5A4" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="staffProfit" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366F1" stopOpacity={0.18} />
                      <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#EEF1F5" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#94A3B8" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => (v === 0 ? "৳0" : `৳${v / 1000}k`)}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: "12px", border: "1px solid #EEF1F5", boxShadow: "0 1px 2px rgb(16 24 40 / 0.04), 0 8px 24px rgb(16 24 40 / 0.06)", fontFamily: "Inter, sans-serif" }}
                    formatter={(value, name) => [formatMoney(value), name]}
                  />
                  <Area type="monotone" dataKey="Sales" stroke="#0EA5A4" strokeWidth={2} fillOpacity={1} fill="url(#staffSales)" />
                  <Area type="monotone" dataKey="Profit" stroke="#6366F1" strokeWidth={2} fillOpacity={1} fill="url(#staffProfit)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <Panel className="xl:col-span-5" title="Inventory Health" subtitle="Catalogue by stock status">
          {products.length === 0 ? (
            <StaffEmptyState icon={Package} title="No inventory data" />
          ) : (
            <div>
              <div className="flex h-2.5 rounded-full overflow-hidden bg-[var(--pharvo-line)]" role="img" aria-label="Inventory stock health">
                {healthSegments.map((s) => (
                  <div
                    key={s.label}
                    className={HEALTH_BAR[s.label] || "bg-[var(--pharvo-line-strong)]"}
                    style={{ width: `${Math.max(0, (s.value / s.total) * 100)}%` }}
                    title={`${s.label}: ${s.value}`}
                  />
                ))}
              </div>
              <ul className="mt-3 flex flex-col gap-1.5">
                {healthSegments.map((s) => (
                  <li key={s.label} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2 text-[var(--pharvo-ink-muted)]">
                      <span className={`w-2 h-2 rounded-full ${HEALTH_BAR[s.label] || "bg-[var(--pharvo-line-strong)]"}`} />
                      {s.label}
                    </span>
                    <span className="font-bold text-[var(--pharvo-ink)] tabular-nums">{s.value.toLocaleString()}</span>
                  </li>
                ))}
              </ul>
              {highMarginItems.length > 0 && (
                <>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--pharvo-ink-subtle)] mt-5 mb-1">High margin</p>
                  <ul className="flex flex-col divide-y divide-[var(--pharvo-line)]">
                    {highMarginItems.map((m) => (
                      <li key={m.id} className="flex items-center gap-3 h-10">
                        <span className="flex-1 min-w-0 text-[13px] font-semibold text-[var(--pharvo-ink)] truncate">{m.name}</span>
                        <span className="text-xs font-bold text-[var(--pharvo-success)] tabular-nums whitespace-nowrap">
                          {m.margin.toFixed(1)}%
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </Panel>
      </div>

      {/* ── Middle row (4 + 4 + 4) ── */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <Panel className="xl:col-span-4" title="Customer Tiers" subtitle="Active CRM membership mix" action={customers.length > 0 ? <ViewAllButton onClick={go("customers")} /> : null}>
          {tierSnapshot.length === 0 ? (
            <StaffEmptyState icon={Users} title="No customers yet" />
          ) : (
            <div>
              <div className="flex h-2.5 rounded-full overflow-hidden bg-[var(--pharvo-line)]" role="img" aria-label="Customer tier mix">
                {tierSnapshot.map(([tier, count], i) => {
                  const total = tierSnapshot.reduce((n, [, c]) => n + c, 0) || 1;
                  return (
                    <div
                      key={tier}
                      className={TIER_BAR[i % TIER_BAR.length]}
                      style={{ width: `${Math.max(0, (count / total) * 100)}%` }}
                      title={`${tier}: ${count}`}
                    />
                  );
                })}
              </div>
              <ul className="mt-3 flex flex-col divide-y divide-[var(--pharvo-line)]">
                {tierSnapshot.map(([tier, count], i) => (
                  <li key={tier} className="flex items-center justify-between h-10">
                    <span className="flex items-center gap-2 text-sm font-semibold text-[var(--pharvo-ink)] capitalize">
                      <span className={`w-2 h-2 rounded-full ${TIER_BAR[i % TIER_BAR.length]}`} />
                      {tier}
                    </span>
                    <span className="text-sm font-bold text-[var(--pharvo-ink)] tabular-nums">{count.toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>

        <Panel className="xl:col-span-4" title="Top Sellers" subtitle="By units sold" action={topMedicines.length > 0 ? <ViewAllButton onClick={go("reports")} /> : null}>
          {topMedicines.length === 0 ? (
            <StaffEmptyState icon={Package} title="No sales recorded yet" />
          ) : (
            <ul className="flex flex-col divide-y divide-[var(--pharvo-line)]">
              {topMedicines.map((m, i) => (
                <li key={m.id} className="flex items-center gap-3 h-10">
                  <span className="staff-pill staff-pill-accent-2 shrink-0 !px-2 tabular-nums">{i + 1}</span>
                  <span className="flex-1 min-w-0 text-[13px] font-semibold text-[var(--pharvo-ink)] truncate">{m.name}</span>
                  <span className="text-[11px] text-[var(--pharvo-ink-subtle)] whitespace-nowrap tabular-nums">{m.units.toLocaleString()}u</span>
                  <span className="text-[13px] font-bold text-[var(--pharvo-ink)] whitespace-nowrap tabular-nums">{formatMoney(m.revenue)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel className="xl:col-span-4" title="Low Stock" subtitle="Below reorder threshold" action={lowStockProducts.length > 0 ? <ViewAllButton onClick={go("medicines-inventory")} /> : null}>
          {lowStockProducts.length === 0 ? (
            <StaffEmptyState icon={Package} title="No low-stock medicines" subtitle="Inventory is above all reorder thresholds." />
          ) : (
            <ul className="flex flex-col divide-y divide-[var(--pharvo-line)]">
              {lowStockProducts.slice(0, 5).map((p) => {
                const sev = stockSeverity(p);
                return (
                  <li key={p.id} className="flex items-center gap-2.5 h-11">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${sev === "critical" ? "bg-[var(--pharvo-danger)]" : "bg-[var(--pharvo-warning)]"}`} aria-hidden="true" />
                    <span className="flex-1 min-w-0 text-[13px] font-semibold text-[var(--pharvo-ink)] truncate">{p.name}</span>
                    <span className="staff-pill staff-pill-neutral shrink-0 tabular-nums !py-1">{Number(p.stock_quantity).toLocaleString()}</span>
                    <button
                      type="button"
                      onClick={go("medicines-inventory")}
                      className="staff-focus shrink-0 text-xs font-semibold text-[var(--pharvo-accent)] hover:opacity-80 transition-opacity cursor-pointer rounded min-h-[44px] px-1"
                    >
                      Restock
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      {/* ── Bottom row (6 + 6) ── */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <Panel className="xl:col-span-6" title="Recent Sales" subtitle="Latest transactions" action={recentSales.length > 0 ? <ViewAllButton onClick={go("orders")} /> : null}>
          {recentSales.length === 0 ? (
            <StaffEmptyState icon={Receipt} title="No sales yet" subtitle="Complete a sale from the POS to see it here." />
          ) : (
            <div className="overflow-x-auto -mx-5 px-5">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[var(--pharvo-line)]">
                    <th className="text-[12px] font-semibold uppercase tracking-wide text-[var(--pharvo-ink-subtle)] font-normal py-2 pr-3">Invoice</th>
                    <th className="text-[12px] font-semibold uppercase tracking-wide text-[var(--pharvo-ink-subtle)] font-normal py-2 pr-3">Customer</th>
                    <th className="text-[12px] font-semibold uppercase tracking-wide text-[var(--pharvo-ink-subtle)] font-normal py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {recentSales.map((s) => (
                    <StaffTableRow key={s.id}>
                      <td className="py-2.5 pr-3 min-w-0">
                        <span className="block text-[13px] font-semibold text-[var(--pharvo-ink)] truncate">{s.invoice_number || "Sale"}</span>
                        <span className="block text-[11px] text-[var(--pharvo-ink-subtle)]">{shortDate(s.created_at || s.sale_date)}</span>
                      </td>
                      <td className="py-2.5 pr-3 text-[13px] font-medium text-[var(--pharvo-ink-muted)] max-w-[140px] truncate">
                        {s.customer?.name || s.customer_name || "Walk-in"}
                      </td>
                      <td className="py-2.5 text-[13px] font-bold text-[var(--pharvo-ink)] tabular-nums text-right whitespace-nowrap">
                        {formatMoney(s.payable_amount ?? s.total_amount)}
                      </td>
                    </StaffTableRow>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel className="xl:col-span-6" title="Recent Customers" subtitle="Latest buyers" action={recentCustomers.length > 0 ? <ViewAllButton onClick={go("customers")} /> : null}>
          {recentCustomers.length === 0 ? (
            <StaffEmptyState icon={Users} title="No customers yet" subtitle="Customers from recorded sales will appear here." />
          ) : (
            <ul className="flex flex-col divide-y divide-[var(--pharvo-line)]">
              {recentCustomers.map((c) => (
                <li key={c.id} className="flex items-center gap-3 h-[52px]">
                  <span className="w-8 h-8 rounded-full staff-grad-bg text-white text-[11px] font-bold inline-flex items-center justify-center shrink-0" aria-hidden="true">
                    {String(c.name || "W").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-semibold text-[var(--pharvo-ink)] truncate">{c.name}</span>
                    <span className="block text-[11px] text-[var(--pharvo-ink-subtle)]">Last purchase {shortDate(c.lastPurchase)}</span>
                  </span>
                  <span className="text-[13px] font-bold text-[var(--pharvo-ink)] whitespace-nowrap tabular-nums">{formatMoney(c.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* ── Activity log (full width) ── */}
      <Panel title="Operational Activity" subtitle="Recent transactions and customer events" action={activityLog.length > 0 ? <ViewAllButton onClick={go("orders")} /> : null}>
        {activityLog.length === 0 ? (
          <StaffEmptyState icon={Receipt} title="No recent activity" />
        ) : (
          <ul className="flex flex-col divide-y divide-[var(--pharvo-line)]">
            {activityLog.map((e) => (
              <li key={e.key} className="flex items-center gap-3 h-11 min-w-0">
                <span className="w-2 h-2 rounded-full bg-[var(--pharvo-accent)] shrink-0" aria-hidden="true" />
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] font-semibold text-[var(--pharvo-ink)] truncate">{e.title}</span>
                  <span className="block text-[11px] text-[var(--pharvo-ink-subtle)] truncate">{e.detail}</span>
                </span>
                <span className="text-[11px] text-[var(--pharvo-ink-subtle)] whitespace-nowrap tabular-nums">{shortDate(e.when)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

export default AdminDashboard;
