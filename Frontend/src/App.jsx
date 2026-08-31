import { useEffect } from "react";
import Login from "./pages/auth/Login";
import Signup from "./pages/auth/Signup";
import StaffApp from "./components/StaffApp";
import CustomerPortal from "./pages/Dashboard/CustomerPortal";
import {
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

  // Staff (admin/pharmacist) share the same app shell with the copied modules.
  if (path === "/admin/dashboard" || path === "/pharmacist/dashboard") {
    return <StaffApp />;
  }

  if (path === "/customer/portal" && role === "customer") {
    return <CustomerPortal />;
  }

  // Unknown path for an authenticated user: send them to their home.
  return <RedirectTo to={home} />;
}