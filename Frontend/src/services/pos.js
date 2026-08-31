/**
 * POS / sales API service.
 *
 * Wraps the Django `pos` and `sales` endpoints.
 */

import { request } from "./api";

/**
 * Create a sale via the POS checkout endpoint.
 *
 * The backend may respond in one of two ways:
 *   - 201 with the receipt when the sale is completed, or
 *   - 200 with `{ requires_approval: true, sensitive_items: [...] }` when the
 *     cart contains sensitive medicines and `approve_sensitive` was not sent.
 *
 * @param {object} payload - { items:[{product,quantity,unit_price}], customer,
 *                            discount, payments:[{method,amount}], invoice_number,
 *                            sale_date, approve_sensitive }
 * @returns {Promise<object>}
 */
export async function checkout(payload) {
  return request("/pos/checkout/", { method: "POST", body: payload });
}

/**
 * Check a set of cart items for known drug interactions.
 *
 * Uses the same `items` shape as `checkout`. The backend returns the detected
 * interactions (severity, description, medicines involved and a recommended
 * action). Beneficial combinations are excluded so normal prescriptions are
 * not interrupted.
 *
 * @param {Array<{product:number, quantity?:number}>} items
 * @returns {Promise<{interactions: Array<object>, count: number}>}
 */
export async function checkInteractions(items) {
  return request("/interactions/check/", { method: "POST", body: { items } });
}

/**
 * List sales (optional search/customer/payment_method filters).
 * @param {object} params
 * @returns {Promise<object[]>}
 */
export async function fetchSales(params = {}) {
  const query = new URLSearchParams(
    Object.fromEntries(
      Object.entries(params).filter(([, v]) => v !== "" && v !== null && v !== undefined)
    )
  ).toString();
  return request(`/sales/${query ? `?${query}` : ""}`);
}