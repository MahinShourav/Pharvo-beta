/**
 * Customer API service.
 *
 * Wraps the Django `customers` app endpoints under /api/customers/.
 */

import { request } from "./api";

/**
 * List customers (optional search by name/phone/email).
 * @param {string} [search]
 * @returns {Promise<object[]>}
 */
export async function fetchCustomers(search = "") {
  return request(`/customers/${search ? `?search=${encodeURIComponent(search)}` : ""}`);
}

/**
 * Fetch a single customer.
 * @param {number|string} id
 * @returns {Promise<object>}
 */
export async function fetchCustomer(id) {
  return request(`/customers/${id}/`);
}

/**
 * Create a customer.
 * @param {object} data - name, phone, email, address, date_of_birth,
 *                        membership_tier, notes, loyalty_points
 * @returns {Promise<object>}
 */
export async function createCustomer(data) {
  return request("/customers/", { method: "POST", body: data });
}

/**
 * Update a customer.
 * @param {number|string} id
 * @param {object} data
 * @returns {Promise<object>}
 */
export async function updateCustomer(id, data) {
  return request(`/customers/${id}/`, { method: "PUT", body: data });
}

/**
 * Partially update a customer (e.g. staff-recorded health information).
 * @param {number|string} id
 * @param {object} data
 * @returns {Promise<object>}
 */
export async function patchCustomer(id, data) {
  return request(`/customers/${id}/`, { method: "PATCH", body: data });
}

/**
 * Fetch the logged-in customer's own profile for the Customer Portal.
 * Resolved server-side from the account link — never by client-supplied ID.
 * @returns {Promise<object>}
 */
export async function fetchMyCustomer() {
  return request("/customers/me/");
}

/**
 * Fetch the logged-in customer's own membership tier and purchase totals.
 * Resolved server-side from the account link.
 * @returns {Promise<object>}
 */
export async function fetchMySummary() {
  return request("/customers/me/summary/");
}

/**
 * Fetch the logged-in customer's own purchase history (newest first).
 * Resolved server-side from the account link.
 * @returns {Promise<object[]>}
 */
export async function fetchMyPurchases() {
  return request("/customers/me/purchases/");
}

/**
 * Fetch the logged-in customer's own medicine reminders.
 * Resolved server-side from the account link.
 * @returns {Promise<object[]>}
 */
export async function fetchMyReminders() {
  return request("/customers/me/reminders/");
}

/**
 * Staff: search customer profiles by email for portal-account linking.
 * Returns matches with phone/address plus current link state so staff can
 * confirm the right profile. Matching is by email only — never by name.
 * @param {string} email
 * @returns {Promise<{count: number, matches: object[]}>}
 */
export async function searchCustomersForLink(email) {
  return request(`/customers/link-search/?email=${encodeURIComponent(email || "")}`);
}

/**
 * Staff: link a confirmed customer profile to a customer portal account.
 * The target is an explicitly identified portal account (username or email);
 * the link is never assigned to the staff session account.
 * Re-linking an already-linked profile requires `{ confirm: true }`.
 * @param {object} data - customer_id, target_username and/or target_email, confirm
 * @returns {Promise<object>}
 */
export async function linkCustomerProfile(data) {
  return request("/customers/link/", { method: "POST", body: data });
}