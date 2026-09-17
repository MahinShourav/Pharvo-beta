import { useEffect } from "react";
import Login from "./pages/auth/Login";
import Signup from "./pages/auth/Signup";
import StaffApp from "./components/StaffApp";
import CustomerPortal from "./pages/Dashboard/CustomerPortal";
import {
  ROLES,
  clearStoredTokens,
  getAccessToken,
  getStoredRole,
  roleHomePath,
} from "./services/auth";

function RedirectTo({ to }) {
  useEffect(() => {
    window.location.assign(to);
  }, [to]);
  return null;
}

export default function App() {
  const path = window.location.pathname;
  const authenticated = Boolean(getAccessToken());
  const role = getStoredRole();

  if (authenticated && !role) {
    // Token without a cached user: treat as an invalid session.
    clearStoredTokens();
    return path === "/signup" ? <Signup /> : <Login />;
  }

  if (!authenticated) {
    return path === "/signup" ? <Signup /> : <Login />;
  }

  const home = roleHomePath(role);

  if (path === "/" || path === "/signup") {
    return <RedirectTo to={home} />;
  }

  // Staff portals are bound to their own role. The admin portal URL only
  // renders for admins and the pharmacist portal only for pharmacists, so a
  // role can never reach another role's portal by typing its URL directly.
  if (role === ROLES.ADMIN && path === "/admin/dashboard") {
    return <StaffApp />;
  }

  if (role === ROLES.PHARMACIST && path === "/pharmacist/dashboard") {
    return <StaffApp />;
  }

  if (role === ROLES.CUSTOMER && path === "/customer/portal") {
    return <CustomerPortal />;
  }

  // Unknown path for an authenticated user: send them to their home.
  return <RedirectTo to={home} />;
}