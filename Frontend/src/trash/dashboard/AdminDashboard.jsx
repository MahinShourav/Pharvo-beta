import { useEffect, useState } from "react";
import Logo from "../../components/Logo";
import { AlertIcon, LogoutIcon, RoleBadgeIcon } from "../../components/Icons";
import { clearStoredTokens, fetchMe, getStoredRole, roleHomePath } from "../../services/auth";
import "../../styles/dashboard.css";

export default function AdminDashboard() {
  const [user, setUser] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    fetchMe()
      .then((me) => {
        if (cancelled) {
          return;
        }
        if (me.role !== "admin") {
          window.location.assign(roleHomePath(me.role));
          return;
        }
        setUser(me);
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
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function handleLogout() {
    clearStoredTokens();
    window.location.assign("/");
  }

  return (
    <div className="dashboard">
      <header className="dashboard__header">
        <Logo />
        <span className="role-badge">
          <RoleBadgeIcon />
          Admin
        </span>
        <button type="button" className="btn btn--ghost" onClick={handleLogout}>
          <LogoutIcon className="btn__icon" />
          Sign out
        </button>
      </header>

      <main className="dashboard__content">
        <div className="dashboard__titlebar">
          <h1 className="dashboard__title">Admin Dashboard</h1>
          <p className="dashboard__subtitle">
            {user?.full_name || user?.email ? `Welcome, ${user.full_name || user.email}` : "Welcome"}
          </p>
        </div>

        {error && (
          <div className="state-panel state-panel--error" role="alert">
            <AlertIcon />
            <p>{error}</p>
          </div>
        )}

        {!error && (
          <div className="empty-banner" role="status">
            <AlertIcon />
            <p>
              System administration and organisation-wide analytics will appear
              here. Only Admin accounts can access this dashboard.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}