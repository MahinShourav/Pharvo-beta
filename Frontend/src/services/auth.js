/**
 * Authentication service.
 *
 * Talks to the PHARVO Django backend. Authenticated requests carry a JWT
 * access token; the authenticated user (including role) is cached so the
 * frontend can route users without decoding tokens locally.
 *
 * The HTTP plumbing, token storage and base URL live in `services/api.js`;
 * this module only defines the auth endpoints and routing helpers.
 */

import {
  ApiError,
  clearStoredTokens,
  getAccessToken,
  getRefreshToken,
  getStoredRole,
  getStoredUser,
  persistSession,
  request,
} from "./api";

export { ApiError, clearStoredTokens, getAccessToken, getRefreshToken, getStoredRole, getStoredUser };

export const ROLES = {
  ADMIN: "admin",
  PHARMACIST: "pharmacist",
  CUSTOMER: "customer",
};

/**
 * The home path for a given role (used for role-based redirects).
 */
export function roleHomePath(role) {
  switch (role) {
    case ROLES.ADMIN:
      return "/admin/dashboard";
    case ROLES.PHARMACIST:
      return "/pharmacist/dashboard";
    case ROLES.CUSTOMER:
      return "/customer/portal";
    default:
      return "/";
  }
}

/**
 * Authenticate with email/username and password.
 *
 * @param {{ username: string, password: string }} credentials
 * @returns {Promise<{ access: string, refresh: string, user: object }>}
 */
export async function loginUser({ username, password }) {
  const data = await request("/auth/login/", {
    method: "POST",
    body: { username, password },
    auth: false,
  });
  persistSession(data);
  return data;
}

/**
 * Create a pharmacist or customer account (admin is never allowed publicly).
 *
 * @param {{ full_name: string, email: string, password: string,
 *           confirm_password: string, role: string }} details
 * @returns {Promise<{ access: string, refresh: string, user: object }>}
 */
export async function signupUser(details) {
  const data = await request("/auth/signup/", {
    method: "POST",
    body: details,
    auth: false,
  });
  persistSession(data);
  return data;
}

/**
 * Fetch the current user from the backend (server-side role source).
 *
 * @throws {ApiError} with status 401 when the session is invalid.
 */
export async function fetchMe() {
  return request("/auth/me/");
}

/**
 * Exchange the stored refresh token for a fresh access token.
 *
 * @returns {Promise<{ access: string }>}
 */
export async function refreshSession() {
  const refresh = getRefreshToken();
  if (!refresh) {
    throw new ApiError("No refresh token available. Please sign in again.", 401);
  }
  try {
    const data = await request(
      "/auth/refresh/",
      { method: "POST", body: { refresh }, auth: false }
    );
    persistSession(data);
    return data;
  } catch (err) {
    if (err.status === 401) {
      clearStoredTokens();
    }
    throw err;
  }
}