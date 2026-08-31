import { useEffect, useState } from "react";
import Logo from "../components/Logo";
import {
  AlertIcon,
  AlertTriangleIcon,
  CalendarIcon,
  CashIcon,
  ClockIcon,
  LogoutIcon,
  ProductsIcon,
  ReceiptIcon,
  RefreshIcon,
  TruckIcon,
  UsersIcon,
} from "../components/Icons";
import { clearStoredTokens, getAccessToken, getStoredRole, roleHomePath } from "../services/auth";
import { fetchDashboard } from "../services/dashboard";
import "../styles/dashboard.css";

const PERIODS = [7, 30, 90];

const CARD_CONFIG = [
  { key: "total_products", label: "Total Products", icon: ProductsIcon },
  { key: "total_customers", label: "Total Customers", icon: UsersIcon },
  { key: "total_suppliers", label: "Total Suppliers", icon: TruckIcon },
  { key: "total_sales", label: "Total Sales", icon: ReceiptIcon },
  { key: "total_revenue", label: "Total Revenue", icon: CashIcon, currency: true },
  { key: "low_stock_count", label: "Low Stock", icon: AlertTriangleIcon },
  { key: "expired_count", label: "Expired", icon: CalendarIcon },
  { key: "near_expiry_count", label: "Near Expiry", icon: ClockIcon },
];

function formatCurrency(value) {
  return Number(value ?? 0).toLocaleString(undefined, {
    style: "currency",
    currency: "BDT",
    minimumFractionDigits: 2,
  });
}

function formatNumber(value) {
  return Number(value ?? 0).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });
}

function titleCase(value) {
  const text = String(value ?? "");
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "—";
}

export default function Dashboard() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!getAccessToken()) {
      clearStoredTokens();
      window.location.assign("/");
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");

    fetchDashboard(days)
      .then((result) => {
        if (!cancelled) {
          setData(result);
        }
      })
      .catch((err) => {
        if (cancelled) {
          return;
        }
        if (err?.status === 401 || err?.status === 403) {
          clearStoredTokens();
          window.location.assign(roleHomePath(getStoredRole()));
          return;
        }
        setError(err?.message || "Unable to load dashboard data.");
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [days, refreshKey]);

  function handleLogout() {
    clearStoredTokens();
    window.location.assign("/");
  }

  function handleRetry() {
    setRefreshKey((key) => key + 1);
  }

  const isEmpty = data && data.total_sales === 0 && data.total_products === 0;

  return (
    <div className="dashboard">
      <header className="dashboard__header">
        <Logo />
        <button type="button" className="btn btn--ghost" onClick={handleLogout}>
          <LogoutIcon className="btn__icon" />
          Sign out
        </button>
      </header>

      <main className="dashboard__content">
        <div className="dashboard__titlebar">
          <h1 className="dashboard__title">Dashboard</h1>
          <p className="dashboard__subtitle">Pharmacy overview and performance</p>
        </div>

        {loading && (
          <div className="state-panel" role="status">
            <span className="spinner" />
            <p>Loading dashboard…</p>
          </div>
        )}

        {!loading && error && (
          <div className="state-panel state-panel--error" role="alert">
            <AlertIcon />
            <p>{error}</p>
            <button type="button" className="btn btn--secondary" onClick={handleRetry}>
              <RefreshIcon className="btn__icon" />
              Try again
            </button>
          </div>
        )}

        {!loading && !error && data && (
          <>
            {isEmpty && (
              <div className="empty-banner" role="status">
                <AlertIcon />
                <p>
                  No pharmacy data yet. Add products and record sales to see your
                  dashboard.
                </p>
              </div>
            )}

            <section className="summary-grid" aria-label="Summary">
              {CARD_CONFIG.map(({ key, label, icon: Icon, currency }) => (
                <article className="summary-card" key={key}>
                  <span className="summary-card__icon">
                    <Icon />
                  </span>
                  <p className="summary-card__label">{label}</p>
                  <p className="summary-card__value">
                    {currency ? formatCurrency(data[key]) : formatNumber(data[key])}
                  </p>
                </article>
              ))}
            </section>

            <section className="panel">
              <div className="panel__head">
                <div>
                  <h2 className="panel__title">Sales Summary</h2>
                  <p className="panel__subtitle">
                    {data.sales_summary.start_date} → {data.sales_summary.end_date}
                  </p>
                </div>
                <div className="period-switcher" role="group" aria-label="Reporting period">
                  {PERIODS.map((period) => (
                    <button
                      type="button"
                      key={period}
                      className={`period-switcher__btn${
                        days === period ? " is-active" : ""
                      }`}
                      onClick={() => setDays(period)}
                    >
                      {period} days
                    </button>
                  ))}
                </div>
              </div>
              <div className="summary-stats">
                <div className="summary-stat">
                  <span className="summary-stat__label">Sales</span>
                  <span className="summary-stat__value">
                    {formatNumber(data.sales_summary.sales_count)}
                  </span>
                </div>
                <div className="summary-stat">
                  <span className="summary-stat__label">Revenue</span>
                  <span className="summary-stat__value">
                    {formatCurrency(data.sales_summary.revenue)}
                  </span>
                </div>
                <div className="summary-stat">
                  <span className="summary-stat__label">Items Sold</span>
                  <span className="summary-stat__value">
                    {formatNumber(data.sales_summary.items_sold)}
                  </span>
                </div>
              </div>
            </section>

            <div className="dashboard-grid">
              <section className="panel">
                <h2 className="panel__title">Recent Sales</h2>
                {data.recent_sales.length === 0 ? (
                  <p className="panel__empty">No recent sales in this period.</p>
                ) : (
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Invoice</th>
                          <th>Customer</th>
                          <th>Date</th>
                          <th>Method</th>
                          <th className="table__num">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.recent_sales.map((sale) => (
                          <tr key={sale.id}>
                            <td>{sale.invoice_number}</td>
                            <td>{sale.customer_name || "Walk-in"}</td>
                            <td>{sale.sale_date}</td>
                            <td>
                              <span className="badge">{titleCase(sale.payment_method)}</span>
                            </td>
                            <td className="table__num">
                              {formatCurrency(sale.payable_amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className="panel">
                <h2 className="panel__title">Top Selling Products</h2>
                {data.top_selling_products.length === 0 ? (
                  <p className="panel__empty">No product sales data yet.</p>
                ) : (
                  <ol className="top-products">
                    {data.top_selling_products.map((item, index) => (
                      <li className="top-product" key={item.product}>
                        <span className="top-product__rank">{index + 1}</span>
                        <span className="top-product__body">
                          <span className="top-product__name">{item.product_name}</span>
                          <span className="top-product__barcode">
                            {item.product_barcode}
                          </span>
                        </span>
                        <span className="top-product__qty">
                          {formatNumber(item.total_quantity)} sold
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </div>
          </>
        )}
      </main>
    </div>
  );
}