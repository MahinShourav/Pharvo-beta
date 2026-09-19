import { useEffect, useState } from "react";
import Logo from "../../components/Logo";
import { AlertIcon, LogoutIcon, RoleBadgeIcon } from "../../components/Icons";
import { clearStoredTokens, fetchMe, roleHomePath } from "../../services/auth";
import { fetchMyCustomer } from "../../services/customer";
import "../../styles/dashboard.css";

const DIABETES_LABELS = { yes: "Yes", no: "No", unknown: "Unknown" };
const DIABETES_TYPE_LABELS = {
  type1: "Type 1",
  type2: "Type 2",
  other: "Other",
  unknown: "Unknown",
};

function healthValue(present, text) {
  return present ? text : "Not recorded";
}

export default function CustomerPortal() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [profileMissing, setProfileMissing] = useState(false);
  const [error, setError] = useState("");

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
        // Load the latest staff-recorded health information from the backend
        // every time the portal opens. The profile is resolved server-side
        // from the account link, so this customer only ever sees their own.
        return fetchMyCustomer().catch((err) => {
          if (cancelled) {
            return null;
          }
          if (err?.status === 404) {
            setProfileMissing(true);
            return null;
          }
          throw err;
        });
      })
      .then((mine) => {
        if (!cancelled && mine) {
          setProfile(mine);
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
          Customer
        </span>
        <button type="button" className="btn btn--ghost" onClick={handleLogout}>
          <LogoutIcon className="btn__icon" />
          Sign out
        </button>
      </header>

      <main className="dashboard__content">
        <div className="dashboard__titlebar">
          <h1 className="dashboard__title">Customer Portal</h1>
          <p className="dashboard__subtitle">
            {user?.full_name || user?.email
              ? `Welcome, ${user.full_name || user.email}`
              : "Welcome"}
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
              Your purchase history and customer profile will appear here. Only
              Customer accounts can access this portal.
            </p>
          </div>
        )}

        {/* Health Information — staff-recorded, read-only in the portal */}
        <section className="portal-card" aria-label="Health Information">
          <h2 className="portal-card__title">Health Information</h2>
          <p className="portal-card__subtitle">
            Recorded by pharmacy staff for safe dispensing. This is not a
            medical record.
          </p>
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
              {/* Diabetes History */}
              {profile.diabetes_records && profile.diabetes_records.length > 0 ? (
                <div className="portal-health__row">
                  <dt>Diabetes History</dt>
                  <dd>
                    <ul>
                      {profile.diabetes_records.map((record, idx) => (
                        <li key={record.id}>
                          <span>{new Date(record.recorded_date).toLocaleDateString()}: {DIABETES_LABELS[record.diabetes_status]}</span>
                        </li>
                      ))}
                    </ul>
                  </dd>
                </div>
              ) : null}
              {/* Blood Pressure History */}
              {profile.blood_pressure_records && profile.blood_pressure_records.length > 0 ? (
                <div className="portal-health__row">
                  <dt>Blood Pressure History</dt>
                  <dd>
                    <ul>
                      {profile.blood_pressure_records.map((record, idx) => (
                        <li key={record.id}>
                          <span>{record.systolic}/{record.diastolic} on {new Date(record.recorded_date).toLocaleDateString()}</span>
                        </li>
                      ))}
                    </ul>
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : (
            <p className="portal-card__empty">
              {profileMissing
                ? "No customer profile is linked to this account yet — health information will show as “Not recorded”. Please ask the pharmacy to link your profile."
                : "Not recorded"}
            </p>
          )}
        </section>
      </main>
    </div>
  );
}