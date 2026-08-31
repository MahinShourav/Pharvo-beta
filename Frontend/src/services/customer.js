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