/**
 * CRM API service.
 *
 * Wraps the Django `crm` app endpoints under /api/crm/.
 */

import { request } from "./api";

/**
 * List CRM customers (CustomerSerializer shape).
 * @returns {Promise<object[]>}
 */
export async function fetchCrmCustomers() {
  return request("/crm/customers/");
}

/**
 * Fetch a single CRM customer profile (includes total_purchases/spending).
 * @param {number|string} id
 * @returns {Promise<object>}
 */
export async function fetchCrmCustomer(id) {
  return request(`/crm/customers/${id}/`);
}

/**
 * Fetch the CRM summary for a customer: total purchases/spending, recent
 * purchases and frequently purchased products.
 * @param {number|string} id
 * @returns {Promise<object>}
 */
export async function fetchCustomerSummary(id) {
  return request(`/crm/customers/${id}/summary/`);
}

/**
 * Fetch the purchase history for a customer.
 * @param {number|string} id
 * @returns {Promise<object[]>}
 */
export async function fetchCustomerPurchases(id) {
  return request(`/crm/customers/${id}/purchases/`);
}

/**
 * List medicine reminders (optional filter by customer or active flag).
 * @param {object} params - { customer, active }
 * @returns {Promise<object[]>}
 */
export async function fetchReminders(params = {}) {
  const query = new URLSearchParams(
    Object.fromEntries(
      Object.entries(params).filter(([, v]) => v !== "" && v !== null && v !== undefined)
    )
  ).toString();
  return request(`/crm/reminders/${query ? `?${query}` : ""}`);
}

/**
 * Create a medicine reminder.
 * @param {object} data - customer, product, title, reminder_time, is_active
 * @returns {Promise<object>}
 */
export async function createReminder(data) {
  return request("/crm/reminders/", { method: "POST", body: data });
}

/**
 * Update a medicine reminder.
 * @param {number|string} id
 * @param {object} data
 * @returns {Promise<object>}
 */
export async function updateReminder(id, data) {
  return request(`/crm/reminders/${id}/`, { method: "PATCH", body: data });
}