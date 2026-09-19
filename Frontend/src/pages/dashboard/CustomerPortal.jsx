import { useEffect, useRef, useState } from "react";
import {
  Activity,
  Award,
  Bell,
  ChevronDown,
  LogOut,
  Menu,
  Receipt,
  ShoppingBag,
  User,
  X,
} from "lucide-react";
import {
  EmptyState,
  LoadingState,
  PageTitle,
  StatusBadge,
} from "../../components/ui/Blocks";
import { clearStoredTokens, fetchMe, roleHomePath } from "../../services/auth";
import {
  fetchMyCustomer,
  fetchMyPurchases,
  fetchMyReminders,
  fetchMySummary,
} from "../../services/customer";
import "../../styles/dashboard.css";

const DIABETES_LABELS = { yes: "Yes", no: "No", unknown: "Unknown" };
const DIABETES_TYPE_LABELS = {
  type1: "Type 1",
  type2: "Type 2",
  other: "Other",
  unknown: "Unknown",
};

const NAV_ITEMS = [
  { id: "profile", label: "Profile" },
  { id: "membership", label: "Membership" },
  { id: "purchases", label: "Purchases" },
  { id: "reminders", label: "Reminders" },
  { id: "health", label: "Health" },
];

function healthValue(present, text) {
  return present ? text : "Not recorded";
}

function formatMoney(value) {
  const num = Number(value || 0);
  if (Number.isNaN(num)) return value || "—";
  return `৳${num.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString();
}

function formatDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function initials(name) {
  return name
    ? name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "C";
}

function BrandMark() {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center text-white flex-shrink-0 shadow-2xs">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m10.5 20.5 9-9a4.5 4.5 0 0 0-6.4-6.4l-9 9a4.5 4.5 0 0 0 6.4 6.4Z" />
          <path d="m8.5 10.5 5 5" />
        </svg>
      </div>
      <div className="min-w-0">
        <span className="text-lg font-bold text-slate-900 tracking-tight block leading-none">PHARVO</span>
        <span className="text-[11px] text-slate-400 font-medium mt-1 hidden sm:block leading-none">
          Pharmacy Management
        </span>
      </div>
    </div>
  );
}

function SectionHead({ icon: Icon, title, subtitle, count }) {
  return (
    <div className="portal-card__head">
      <span className="portal-card__icon">
        <Icon size={19} />
      </span>
      <div className="portal-card__headings">
        <h2 className="portal-card__title">{title}</h2>
        <p className="portal-card__subtitle">{subtitle}</p>
      </div>
      {count != null && <span className="portal-count">{count}</span>}
    </div>
  );
}

export default function CustomerPortal() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [profileMissing, setProfileMissing] = useState(false);
  const [summary, setSummary] = useState(null);
  const [purchases, setPurchases] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const userMenuRef = useRef(null);
  const mobileMenuRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    fetchMe()
      .then((me) => {
        if (cancelled) {
          return null;
        }
        if (me.role !== "customer") {
          window.location.assign(roleHomePath(me.role));
          return null;
        }
        setUser(me);
        // Load the customer's own data from the backend every time the
        // portal opens. Everything is resolved server-side from the account
        // link, so this customer only ever sees their own records.
        // A 404 means no profile is linked yet — show empty states, not an
        // error, for the dependent sections.
        const swallow404 = (promise, fallback) =>
          promise.catch((err) => {
            if (cancelled) {
              return fallback;
            }
            if (err?.status === 404) {
              return fallback;
            }
            throw err;
          });
        return Promise.all([
          fetchMyCustomer().catch((err) => {
            if (cancelled) {
              return null;
            }
            if (err?.status === 404) {
              setProfileMissing(true);
              return null;
            }
            throw err;
          }),
          swallow404(fetchMySummary(), null),
          swallow404(fetchMyPurchases(), []),
          swallow404(fetchMyReminders(), []),
        ]);
      })
      .then((result) => {
        if (cancelled || !result) {
          return;
        }
        const [mine, mySummary, myPurchases, myReminders] = result;
        if (mine) {
          setProfile(mine);
        }
        if (mySummary) {
          setSummary(mySummary);
        }
        if (Array.isArray(myPurchases)) {
          setPurchases(myPurchases);
        }
        if (Array.isArray(myReminders)) {
          setReminders(myReminders);
        }
      })
      .catch((err) => {
        if (cancelled) {
          return;
        }
        if (err?.status === 401 || err?.status === 403) {
          clearStoredTokens();
          window.location.assign("/");
          return;
        }
        setError(err?.message || "Unable to load your account.");
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setShowUserMenu(false);
      }
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(e.target)) {
        setMobileOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function handleLogout() {
    clearStoredTokens();
    window.location.assign("/");
  }

  const displayName =
    profile?.name || user?.full_name || user?.username || user?.email || "Customer";
  const firstName = displayName.split(" ")[0];

  return (
    <div className="customer-portal min-h-screen bg-slate-50 font-sans text-slate-800 flex flex-col">
      {/* Top navigation bar — mirrors the staff AppShell header */}
      <header className="h-[76px] flex-shrink-0 bg-white border-b border-slate-100 z-20 sticky top-0">
        <div className="h-full max-w-[1280px] mx-auto px-4 sm:px-8 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              className="lg:hidden p-2 -ml-1 text-slate-500 hover:text-slate-800 hover:bg-slate-50 rounded-lg cursor-pointer"
              aria-label="Open menu"
            >
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <BrandMark />
          </div>

          {/* Section navigation (desktop) */}
          <nav className="hidden lg:flex items-center gap-1" aria-label="Portal sections">
            {NAV_ITEMS.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className="px-3.5 py-2 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-colors duration-100"
              >
                {item.label}
              </a>
            ))}
          </nav>

          {/* Account menu */}
          <div ref={userMenuRef} className="relative flex-shrink-0">
            <button
              type="button"
              onClick={() => setShowUserMenu((v) => !v)}
              className="flex items-center gap-2.5 px-2.5 py-1.5 border border-slate-200 hover:border-slate-300 hover:bg-slate-50/50 rounded-lg bg-white cursor-pointer select-none transition-all duration-100"
            >
              <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-semibold text-[13px]">
                {initials(displayName)}
              </div>
              <div className="text-left hidden md:block">
                <span className="text-[13px] font-semibold text-slate-800 block leading-tight max-w-[140px] truncate">
                  {displayName}
                </span>
                <span className="text-[11px] text-slate-400 font-normal block leading-none mt-0.5">
                  Customer
                </span>
              </div>
              <ChevronDown size={14} className="text-slate-400 ml-0.5" />
            </button>

            {showUserMenu && (
              <div className="absolute top-full right-0 mt-2 w-56 bg-white border border-slate-100 rounded-lg shadow-lg z-50 overflow-hidden">
                <div className="p-3.5 border-b border-slate-50 bg-slate-50/50">
                  <span className="text-xs font-semibold text-slate-800 block truncate">
                    {displayName}
                  </span>
                  <span className="text-[11px] text-slate-400 font-normal block mt-0.5 truncate">
                    {user?.email || profile?.email || "Customer account"}
                  </span>
                </div>
                <div className="border-t border-slate-100 py-1">
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full text-left px-3.5 py-2 hover:bg-red-50 text-xs text-red-600 font-medium flex items-center gap-2.5 cursor-pointer"
                  >
                    <LogOut size={14} className="text-red-500" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Section navigation (mobile dropdown panel) */}
        {mobileOpen && (
          <div
            ref={mobileMenuRef}
            className="lg:hidden absolute inset-x-0 top-full bg-white border-b border-slate-100 shadow-lg z-50"
          >
            <nav className="px-4 py-3 flex flex-col gap-1" aria-label="Portal sections">
              {NAV_ITEMS.map((item) => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  onClick={() => setMobileOpen(false)}
                  className="px-3.5 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors duration-100"
                >
                  {item.label}
                </a>
              ))}
              <button
                type="button"
                onClick={handleLogout}
                className="mt-1 w-full text-left px-3.5 py-2.5 rounded-lg bg-rose-50/50 hover:bg-rose-100/50 text-red-600 text-[13px] font-semibold flex items-center gap-2 transition-all duration-100 cursor-pointer"
              >
                <LogOut size={15} />
                <span>Sign Out</span>
              </button>
            </nav>
          </div>
        )}
      </header>

      {/* Workspace */}
      <main className="flex-1 w-full">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-8 py-7">
          <PageTitle
            title={`Welcome, ${firstName}`}
            subtitle="Your pharmacy account at a glance."
            right={
              summary ? (
                <StatusBadge status={summary.membership_tier_display || "Non-member"} />
              ) : null
            }
          />

          {error && (
            <div className="state-panel state-panel--error" role="alert">
              <Activity size={20} />
              <p>{error}</p>
            </div>
          )}

          {loading && !error && <LoadingState label="Loading your portal..." />}

          {!loading && !error && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              {/* My Profile — own contact details, read-only in the portal */}
              <section id="profile" className="portal-card lg:col-span-2" aria-label="My Profile">
                <SectionHead
                  icon={User}
                  title="My Profile"
                  subtitle="Your contact details as recorded by the pharmacy."
                />
                <div className="portal-card__body">
                  {profile ? (
                    <dl className="portal-health">
                      <div className="portal-health__row">
                        <dt>Name</dt>
                        <dd>{profile.name || "—"}</dd>
                      </div>
                      <div className="portal-health__row">
                        <dt>Phone</dt>
                        <dd>{profile.phone || "—"}</dd>
                      </div>
                      <div className="portal-health__row">
                        <dt>Email</dt>
                        <dd>{profile.email || "—"}</dd>
                      </div>
                      <div className="portal-health__row">
                        <dt>Address</dt>
                        <dd>{profile.address || "—"}</dd>
                      </div>
                      <div className="portal-health__row">
                        <dt>Date of Birth</dt>
                        <dd>{healthValue(!!profile.date_of_birth, formatDate(profile.date_of_birth))}</dd>
                      </div>
                      <div className="portal-health__row">
                        <dt>Member Since</dt>
                        <dd>{healthValue(!!profile.member_since, formatDate(profile.member_since))}</dd>
                      </div>
                    </dl>
                  ) : (
                    <EmptyState
                      icon={User}
                      title={
                        profileMissing
                          ? "No customer profile is linked to this account yet"
                          : "Not recorded"
                      }
                      subtitle={
                        profileMissing
                          ? "Please ask the pharmacy to link your profile."
                          : undefined
                      }
                    />
                  )}
                </div>
              </section>

              {/* Membership — own tier and purchase totals */}
              <section id="membership" className="portal-card" aria-label="Membership">
                <SectionHead
                  icon={Award}
                  title="Membership"
                  subtitle="Tier and lifetime totals."
                />
                <div className="portal-card__body">
                  {summary ? (
                    <div className="summary-grid portal-stats">
                      <div className="summary-card">
                        <span className="summary-card__icon">
                          <Award size={21} />
                        </span>
                        <p className="summary-card__label">Tier</p>
                        <p className="summary-card__value summary-card__value--sm">
                          {summary.membership_tier_display || "Non-member"}
                        </p>
                      </div>
                      <div className="summary-card">
                        <span className="summary-card__icon">
                          <ShoppingBag size={21} />
                        </span>
                        <p className="summary-card__label">Total Purchases</p>
                        <p className="summary-card__value">
                          {Number(summary.total_purchases || 0).toLocaleString()}
                        </p>
                      </div>
                      <div className="summary-card">
                        <span className="summary-card__icon">
                          <Receipt size={21} />
                        </span>
                        <p className="summary-card__label">Total Spending</p>
                        <p className="summary-card__value">
                          {formatMoney(summary.total_spending)}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <EmptyState
                      icon={Award}
                      title={profileMissing ? "Profile not linked yet" : "Not recorded"}
                      subtitle={
                        profileMissing
                          ? "Membership details will appear once your profile is linked."
                          : undefined
                      }
                    />
                  )}
                </div>
              </section>

              {/* Purchase History — own receipts, newest first */}
              <section id="purchases" className="portal-card lg:col-span-2" aria-label="Purchase History">
                <SectionHead
                  icon={ShoppingBag}
                  title="Purchase History"
                  subtitle="Your recent purchases at the pharmacy."
                  count={purchases.length > 0 ? purchases.length : null}
                />
                <div className="portal-card__body">
                  {purchases.length > 0 ? (
                    <ul className="portal-list">
                      {purchases.map((sale) => (
                        <li key={sale.id} className="portal-list__item">
                          <div className="portal-list__head">
                            <span className="portal-list__id">{sale.invoice_number}</span>
                            <span className="portal-list__date">{formatDate(sale.sale_date)}</span>
                            <span className="portal-list__amount">{formatMoney(sale.payable_amount)}</span>
                          </div>
                          {Array.isArray(sale.items) && sale.items.length > 0 && (
                            <ul className="portal-list__sub">
                              {sale.items.map((item, i) => (
                                <li key={item.id ?? i}>
                                  {item.product_name} × {item.quantity} — {formatMoney(item.subtotal)}
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyState
                      icon={ShoppingBag}
                      title="No purchases yet"
                      subtitle="Your receipts will appear here after your first purchase."
                    />
                  )}
                </div>
              </section>

              {/* Medicine Reminders — set by pharmacy staff */}
              <section id="reminders" className="portal-card" aria-label="Medicine Reminders">
                <SectionHead
                  icon={Bell}
                  title="Medicine Reminders"
                  subtitle="Set for you by pharmacy staff."
                  count={reminders.length > 0 ? reminders.length : null}
                />
                <div className="portal-card__body">
                  {reminders.length > 0 ? (
                    <ul className="portal-list">
                      {reminders.map((reminder) => (
                        <li key={reminder.id} className="portal-list__item">
                          <div className="portal-list__head">
                            <span className="portal-list__id">{reminder.title}</span>
                            <StatusBadge status={reminder.is_active ? "Active" : "Inactive"} />
                          </div>
                          <div className="portal-list__meta">
                            {reminder.product_name || "Medicine"} • {formatDateTime(reminder.reminder_time)}
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyState
                      icon={Bell}
                      title="No reminders"
                      subtitle="The pharmacy will add medicine reminders for you here."
                    />
                  )}
                </div>
              </section>

              {/* Health Information — staff-recorded, read-only in the portal */}
              <section id="health" className="portal-card lg:col-span-3" aria-label="Health Information">
                <SectionHead
                  icon={Activity}
                  title="Health Information"
                  subtitle="Recorded by pharmacy staff for safe dispensing. This is not a medical record."
                />
                <div className="portal-card__body">
                  {profile ? (
                    <dl className="portal-health">
                      <div className="portal-health__row">
                        <dt>Diabetes</dt>
                        <dd>
                          {profile.diabetes_status && profile.diabetes_status !== "unknown"
                            ? DIABETES_LABELS[profile.diabetes_status] || "Not recorded"
                            : "Not recorded"}
                        </dd>
                      </div>
                      <div className="portal-health__row">
                        <dt>Diabetes Type</dt>
                        <dd>
                          {profile.diabetes_type
                            ? DIABETES_TYPE_LABELS[profile.diabetes_type] || profile.diabetes_type
                            : "Not recorded"}
                        </dd>
                      </div>
                      <div className="portal-health__row">
                        <dt>Blood Pressure</dt>
                        <dd>
                          {healthValue(
                            profile.bp_systolic != null && profile.bp_diastolic != null,
                            `${profile.bp_systolic}/${profile.bp_diastolic}`
                          )}
                        </dd>
                      </div>
                      <div className="portal-health__row">
                        <dt>Recorded Date</dt>
                        <dd>{healthValue(!!profile.bp_recorded_date, profile.bp_recorded_date)}</dd>
                      </div>
                      <div className="portal-health__row">
                        <dt>Notes</dt>
                        <dd>{healthValue(!!profile.health_notes, profile.health_notes)}</dd>
                      </div>
                      {profile.diabetes_records && profile.diabetes_records.length > 0 ? (
                        <div className="portal-health__row portal-health__row--wide">
                          <dt>Diabetes History</dt>
                          <dd>
                            <ul className="portal-history">
                              {profile.diabetes_records.map((record) => (
                                <li key={record.id}>
                                  <strong>{formatDate(record.recorded_date)}</strong>
                                  <span>{DIABETES_LABELS[record.diabetes_status] || record.diabetes_status}</span>
                                </li>
                              ))}
                            </ul>
                          </dd>
                        </div>
                      ) : null}
                      {profile.blood_pressure_records && profile.blood_pressure_records.length > 0 ? (
                        <div className="portal-health__row portal-health__row--wide">
                          <dt>Blood Pressure History</dt>
                          <dd>
                            <ul className="portal-history">
                              {profile.blood_pressure_records.map((record) => (
                                <li key={record.id}>
                                  <strong>{record.systolic}/{record.diastolic}</strong>
                                  <span>{formatDate(record.recorded_date)}</span>
                                </li>
                              ))}
                            </ul>
                          </dd>
                        </div>
                      ) : null}
                    </dl>
                  ) : (
                    <EmptyState
                      icon={Activity}
                      title={
                        profileMissing
                          ? "No customer profile is linked to this account yet"
                          : "Not recorded"
                      }
                      subtitle={
                        profileMissing
                          ? "Health information will appear here once the pharmacy links your profile."
                          : undefined
                      }
                    />
                  )}
                </div>
              </section>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
