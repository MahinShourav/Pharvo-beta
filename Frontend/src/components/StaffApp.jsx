import { useCallback, useEffect, useState } from "react";
import { getStoredUser, clearStoredTokens, ROLES } from "../services/auth";
import { fetchUnreadCount } from "../services/notifications";
import AppShell from "./AppShell";
import { AdminDashboard } from "../pages/Dashboard/AdminDashboard";
import PharmacistDashboard from "../pages/Dashboard/PharmacistDashboard";
import { SalesModule } from "../pages/pos/Sales";
import CustomersPage from "../pages/customers/CustomersPage";
import CRMModule from "../pages/crm/CRMModule";
import MedicinesInventoryPage from "../pages/medicines/MedicinesInventoryPage";
import OrdersPage from "../pages/orders/OrdersPage";
import ReportsPage from "../pages/reports/ReportsPage";
import NotificationsPage from "../pages/notifications/NotificationsPage";
import SettingsPage from "../pages/settings/SettingsPage";

const PAGE_META = {
  dashboard: { title: "Dashboard", subtitle: "Overview of your pharmacy operations today" },
  pos: { title: "POS / Sales", subtitle: "Point of sale and transaction history" },
  "medicines-inventory": { title: "Medicines & Inventory", subtitle: "Manage medicines, stock levels, pricing and expiry status" },
  customers: { title: "Customer Management", subtitle: "Customer profiles, membership & purchase history" },
  crm: { title: "CRM", subtitle: "Customer relationship management" },
  orders: { title: "Orders", subtitle: "All recorded sales and invoices" },
  reports: { title: "Reports", subtitle: "Sales, profit and performance reports" },
  notifications: { title: "Notifications", subtitle: "Alerts, expiry and stock notifications" },
  settings: { title: "Settings", subtitle: "Manage your personal settings" },
};

export default function StaffApp() {
  const [activeModule, setActiveModule] = useState("dashboard");
  const [unreadCount, setUnreadCount] = useState(0);
  const user = getStoredUser();

  const loadUnread = useCallback(() => {
    fetchUnreadCount()
      .then((data) => setUnreadCount(Number(data?.unread_count) || 0))
      .catch(() => setUnreadCount(0));
  }, []);

  useEffect(() => {
    loadUnread();
  }, [loadUnread]);

  useEffect(() => {
    if (activeModule === "notifications") {
      loadUnread();
    }
  }, [activeModule, loadUnread]);

  function handlePageChange(page) {
    setActiveModule(page);
  }

  function handleLogout() {
    clearStoredTokens();
    window.location.assign("/");
  }

  const meta = PAGE_META[activeModule] || PAGE_META.dashboard;

  return (
    <AppShell
      active={activeModule}
      title={meta.title}
      subtitle={meta.subtitle}
      user={user || {}}
      unreadCount={unreadCount}
      onNavigate={handlePageChange}
      onLogout={handleLogout}
    >
      {activeModule === "dashboard" && user?.role === ROLES.ADMIN && (
        <AdminDashboard
          user={user || {}}
          onPageChange={handlePageChange}
          onRefreshNotifications={loadUnread}
        />
      )}
      {activeModule === "dashboard" && user?.role !== ROLES.ADMIN && (
        <PharmacistDashboard
          user={user || {}}
          onPageChange={handlePageChange}
          onRefreshNotifications={loadUnread}
        />
      )}
      {activeModule === "pos" && <SalesModule role={user?.role} />}
      {activeModule === "medicines-inventory" && <MedicinesInventoryPage role={user?.role} />}
      {activeModule === "customers" && <CustomersPage role={user?.role} />}
      {activeModule === "crm" && <CRMModule role={user?.role} onNavigate={handlePageChange} />}
      {activeModule === "orders" && <OrdersPage role={user?.role} />}
      {activeModule === "reports" && <ReportsPage />}
      {activeModule === "notifications" && <NotificationsPage role={user?.role} onChanged={loadUnread} />}
      {activeModule === "settings" && <SettingsPage user={user || {}} role={user?.role} onLogout={handleLogout} />}
    </AppShell>
  );
}

export { ROLES };