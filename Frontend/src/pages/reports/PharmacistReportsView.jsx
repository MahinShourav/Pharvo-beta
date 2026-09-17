import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  TrendingUp, Receipt, Package, Wallet, AlertTriangle, BarChart3,
  ClipboardList, Users, Building2, Truck,
} from "lucide-react";
import {
  fetchSalesReport,
  fetchProfitReport,
  fetchStockReport,
  fetchPurchasesReport,
  fetchCustomersReport,
} from "../../services/reports";
import { ApiError } from "../../services/api";
import { Card, CardHeader, StatCard, LoadingState, EmptyState } from "../../components/ui/Blocks";
import { SUPPLIER_ORDERS_STORAGE_KEY } from "../orders/SupplierOrdersView";

const PERIODS = [
  { value: 7, label: "7 Days" },
  { value: 30, label: "30 Days" },
  { value: 90, label: "3 Months" },
];

const SECTION_HEADER = "text-[11px] font-semibold uppercase tracking-wider text-slate-400";

function formatMoney(value) {
  return `৳${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function shortDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function orderTotal(order) {
  return (order.items || []).reduce(
    (sum, item) => sum + Number(item.costPrice || 0) * Number(item.quantity || 0),
    0
  );
}

const ORDER_STATUS_TONE = {
  draft: "text-slate-500",
  requested: "text-amber-600",
  received: "text-emerald-600",
  cancelled: "text-red-600",
};

export default function PharmacistReportsView() {
  const [days, setDays] = useState(30);
  const [salesReport, setSalesReport] = useState(null);
  const [profitReport, setProfitReport] = useState(null);
  const [stockReport, setStockReport] = useState(null);
  const [purchasesReport, setPurchasesReport] = useState(null);
  const [customersReport, setCustomersReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [supplierOrders, setSupplierOrders] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(SUPPLIER_ORDERS_STORAGE_KEY) || "[]");
    } catch (err) {
      return [];
    }
  });

  const loadReports = useCallback(async (period) => {
    setLoading(true);
    setError("");
    try {
      const today = new Date();
      const start = new Date(today);
      start.setDate(start.getDate() - (period - 1));
      const params = {
        start_date: start.toISOString().slice(0, 10),
        end_date: today.toISOString().slice(0, 10),
      };
      const [sales, profit, stock, purchases, customers] = await Promise.all([
        fetchSalesReport(params),
        fetchProfitReport(params),
        fetchStockReport(),
        fetchPurchasesReport(params),
        fetchCustomersReport(),
      ]);
      setSalesReport(sales);
      setProfitReport(profit);
      setStockReport(stock);
      setPurchasesReport(purchases);
      setCustomersReport(customers);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load reports.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReports(days);
  }, [days, loadReports]);

  const chartData = useMemo(
    () =>
      (salesReport?.daily_sales_summary || []).map((d) => ({
        label: shortDate(d.sale_date),
        revenue: Number(d.revenue || 0),
        sales: d.sales_count,
      })),
    [salesReport]
  );

  const topProducts = salesReport?.top_selling_products || [];
  const supplierSummary = purchasesReport?.supplier_wise_summary || [];
  const supplierStatus = useMemo(() => {
    const count = (s) => supplierOrders.filter((o) => o.status === s).length;
    return {
      draft: count("draft"),
      requested: count("requested"),
      received: count("received"),
      cancelled: count("cancelled"),
    };
  }, [supplierOrders]);
  const awaitingOrders = useMemo(
    () =>
      [...supplierOrders]
        .filter((o) => o.status === "requested")
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 5),
    [supplierOrders]
  );

  const topSpenders = customersReport?.top_customers_by_spending || [];
  const topBuyers = customersReport?.top_customers_by_purchase_count || [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-slate-500">
          {salesReport
            ? `${salesReport.start_date} → ${salesReport.end_date}`
            : "Select a reporting period"}
        </div>
        <div className="inline-flex gap-1 p-1 bg-blue-50 border border-blue-100 rounded-lg">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setDays(p.value)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                days === p.value
                  ? "bg-blue-600 text-white shadow-xs"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading && <LoadingState label="Loading reports..." />}

      {!loading && error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
          <AlertTriangle size={14} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!loading && !error && salesReport && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard label="Revenue" value={formatMoney(salesReport.total_revenue)} sub="Total in period" icon={Wallet} tone="blue" />
            <StatCard label="Sales" value={String(salesReport.total_sales)} sub="Invoices in period" icon={Receipt} tone="green" />
            <StatCard label="Items Sold" value={String(salesReport.items_sold)} sub="Units in period" icon={Package} tone="violet" />
            <StatCard
              label="Profit"
              value={formatMoney(profitReport?.profit)}
              sub={`${Number(profitReport?.profit_margin || 0).toFixed(1)}% margin`}
              icon={TrendingUp}
              tone="amber"
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
            <Card className="xl:col-span-2">
              <CardHeader title="Daily Sales Trend" subtitle="Revenue per day in the period" />
              <div className="p-4">
                {chartData.length === 0 ? (
                  <EmptyState icon={BarChart3} title="No sales in this period" />
                ) : (
                  <div className="h-[260px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="pharmacistReportRevenue" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#2563EB" stopOpacity={0.28} />
                            <stop offset="100%" stopColor="#2563EB" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EEF2F7" />
                        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#94A3B8" }} minTickGap={24} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#94A3B8" }} width={38} tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)} />
                        <Tooltip
                          contentStyle={{ borderRadius: 10, fontSize: 12, border: "1px solid #E2E8F0" }}
                          formatter={(value, name) => [formatMoney(value), name === "revenue" ? "Revenue" : "Sales"]}
                        />
                        <Area type="monotone" dataKey="revenue" stroke="#2563EB" strokeWidth={2} fill="url(#pharmacistReportRevenue)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </Card>

            <Card>
              <CardHeader title="Stock Report" subtitle="Inventory health summary" />
              <div className="p-4 flex flex-col gap-3">
                {[
                  { label: "Active Products", value: String(stockReport?.active_products ?? 0), tone: "text-slate-900" },
                  { label: "Low Stock", value: String(stockReport?.low_stock_products ?? 0), tone: "text-amber-600" },
                  { label: "Out of Stock", value: String(stockReport?.out_of_stock_products ?? 0), tone: "text-red-600" },
                  { label: "Expired", value: String(stockReport?.expired_products ?? 0), tone: "text-red-600" },
                  { label: "Near Expiry", value: String(stockReport?.near_expiry_products ?? 0), tone: "text-violet-600" },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between">
                    <span className="text-xs text-slate-500 font-normal">{row.label}</span>
                    <span className={`text-sm font-bold ${row.tone}`}>{row.value}</span>
                  </div>
                ))}
                <div className="pt-3 border-t border-slate-100">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500 font-normal">Stock Value (retail)</span>
                    <span className="text-sm font-bold text-slate-900">{formatMoney(stockReport?.stock_value?.retail)}</span>
                  </div>
                </div>
              </div>
            </Card>
          </div>

          <div className="flex items-center gap-2">
            <span className={SECTION_HEADER}>Purchases & Orders</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard label="Purchases" value={String(purchasesReport?.total_purchases ?? 0)} sub="Invoices in period" icon={ClipboardList} tone="blue" />
            <StatCard label="Purchase Value" value={formatMoney(purchasesReport?.total_purchase_amount)} sub="Gross in period" icon={Wallet} tone="green" />
            <StatCard label="Payable" value={formatMoney(purchasesReport?.total_payable_amount)} sub="After discount" icon={Receipt} tone="amber" />
            <StatCard label="Units Purchased" value={String(purchasesReport?.quantity_purchased ?? 0)} sub="In period" icon={Package} tone="violet" />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
            <Card className="xl:col-span-2">
              <CardHeader title="Purchases by Supplier" subtitle="Supplier-wise totals in the period" />
              {supplierSummary.length === 0 ? (
                <EmptyState icon={Building2} title="No purchases in this period" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-50/70 border-b border-slate-100 text-[11px] text-slate-400 font-semibold uppercase tracking-wider">
                        <th className="px-4 py-2.5">Supplier</th>
                        <th className="px-3 py-2.5 text-right">Purchases</th>
                        <th className="px-3 py-2.5 text-right">Units</th>
                        <th className="px-3 py-2.5 text-right">Amount</th>
                        <th className="px-4 py-2.5 text-right">Payable</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 text-xs">
                      {supplierSummary.map((row) => (
                        <tr key={row.supplier} className="hover:bg-slate-50/60 transition-colors">
                          <td className="px-4 py-2.5 font-medium text-slate-800">{row.supplier_name}</td>
                          <td className="px-3 py-2.5 text-right text-slate-500">{row.purchase_count}</td>
                          <td className="px-3 py-2.5 text-right text-slate-500">{row.total_quantity}</td>
                          <td className="px-3 py-2.5 text-right font-semibold text-slate-900">{formatMoney(row.total_amount)}</td>
                          <td className="px-4 py-2.5 text-right font-semibold text-slate-900">{formatMoney(row.payable_amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <Card>
              <CardHeader title="Supplier Order Status" subtitle="Current open order requests" />
              <div className="p-4 flex flex-col gap-3">
                {[
                  { label: "Requested", value: supplierStatus.requested, tone: "text-amber-600", icon: Truck },
                  { label: "Received", value: supplierStatus.received, tone: "text-emerald-600", icon: Receipt },
                  { label: "Draft", value: supplierStatus.draft, tone: "text-slate-500", icon: ClipboardList },
                  { label: "Cancelled", value: supplierStatus.cancelled, tone: "text-red-600", icon: AlertTriangle },
                ].map((row) => {
                  const Icon = row.icon;
                  return (
                    <div key={row.label} className="flex items-center justify-between">
                      <span className="text-xs text-slate-500 font-normal inline-flex items-center gap-2">
                        <Icon size={13} className="text-slate-400" />
                        {row.label}
                      </span>
                      <span className={`text-sm font-bold ${row.tone}`}>{row.value}</span>
                    </div>
                  );
                })}
                {awaitingOrders.length > 0 && (
                  <div className="pt-3 border-t border-slate-100 flex flex-col gap-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Awaiting delivery</div>
                    {awaitingOrders.map((o) => (
                      <div key={o.id} className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-slate-700">{o.ref}</span>
                        <span className="text-[11px] text-slate-400 font-normal whitespace-nowrap">{o.supplierName}</span>
                        <span className={`text-xs font-semibold whitespace-nowrap ${ORDER_STATUS_TONE.requested}`}>{formatMoney(orderTotal(o))}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          </div>

          <div className="flex items-center gap-2">
            <span className={SECTION_HEADER}>Customers</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-2 gap-4">
            <StatCard label="Total Customers" value={String(customersReport?.total_customers ?? 0)} sub="Registered customers" icon={Users} tone="blue" />
            <StatCard label="Customers with Purchases" value={String(customersReport?.customers_with_purchases ?? 0)} sub="Have at least one sale" icon={Users} tone="green" />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
            <Card>
              <CardHeader title="Top Customers by Spending" subtitle="Highest total spend" />
              {topSpenders.length === 0 ? (
                <EmptyState icon={Users} title="No customer data yet" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-50/70 border-b border-slate-100 text-[11px] text-slate-400 font-semibold uppercase tracking-wider">
                        <th className="px-4 py-2.5">#</th>
                        <th className="px-3 py-2.5">Customer</th>
                        <th className="px-3 py-2.5">Phone</th>
                        <th className="px-4 py-2.5 text-right">Total Spend</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 text-xs">
                      {topSpenders.map((c, i) => (
                        <tr key={c.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="px-4 py-2.5">
                            <span className="w-6 h-6 rounded-md bg-blue-600 text-white text-[11px] font-bold inline-flex items-center justify-center">
                              {i + 1}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 font-medium text-slate-800">{c.name}</td>
                          <td className="px-3 py-2.5 font-normal text-slate-400">{c.phone || "—"}</td>
                          <td className="px-4 py-2.5 text-right font-semibold text-slate-900">{formatMoney(c.total_spend)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <Card>
              <CardHeader title="Top Customers by Purchases" subtitle="Highest number of purchases" />
              {topBuyers.length === 0 ? (
                <EmptyState icon={Users} title="No customer data yet" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-50/70 border-b border-slate-100 text-[11px] text-slate-400 font-semibold uppercase tracking-wider">
                        <th className="px-4 py-2.5">#</th>
                        <th className="px-3 py-2.5">Customer</th>
                        <th className="px-3 py-2.5">Phone</th>
                        <th className="px-4 py-2.5 text-right">Purchases</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 text-xs">
                      {topBuyers.map((c, i) => (
                        <tr key={c.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="px-4 py-2.5">
                            <span className="w-6 h-6 rounded-md bg-blue-600 text-white text-[11px] font-bold inline-flex items-center justify-center">
                              {i + 1}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 font-medium text-slate-800">{c.name}</td>
                          <td className="px-3 py-2.5 font-normal text-slate-400">{c.phone || "—"}</td>
                          <td className="px-4 py-2.5 text-right font-semibold text-slate-900">{c.purchase_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>

          <Card>
            <CardHeader title="Top Selling Products" subtitle="By units sold in the period" />
            {topProducts.length === 0 ? (
              <EmptyState icon={Package} title="No product sales in this period" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50/70 border-b border-slate-100 text-[11px] text-slate-400 font-semibold uppercase tracking-wider">
                      <th className="px-4 py-2.5">#</th>
                      <th className="px-3 py-2.5">Product</th>
                      <th className="px-3 py-2.5">Barcode</th>
                      <th className="px-3 py-2.5 text-right">Units Sold</th>
                      <th className="px-4 py-2.5 text-right">Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-xs">
                    {topProducts.map((p, i) => (
                      <tr key={p.product} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-4 py-2.5">
                          <span className="w-6 h-6 rounded-md bg-blue-600 text-white text-[11px] font-bold inline-flex items-center justify-center">
                            {i + 1}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-medium text-slate-800">{p.product_name}</td>
                        <td className="px-3 py-2.5 font-mono text-[11px] text-slate-400">{p.product_barcode}</td>
                        <td className="px-3 py-2.5 text-right font-semibold text-slate-900">{p.total_quantity}</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-slate-900">{formatMoney(p.total_revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}