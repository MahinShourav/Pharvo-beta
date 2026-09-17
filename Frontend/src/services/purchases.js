/**
 * Purchase / receiving service.
 *
 * Wraps the Django `purchases` app endpoint at /api/purchases/. A purchase is
 * the receiving flow: creating one records the goods received from a supplier
 * and increases medicine stock through the backend stock service.
 */

import { request } from "./api";

/**
 * Create a purchase (receiving goods from a supplier).
 *
 * @param {object} data - { invoice_number, supplier, items, discount, purchase_date }
 *   where items = [{ product, quantity, unit_price, ... }]
 * @returns {Promise<object>} the created purchase
 */
export async function createPurchase(data) {
  return request("/purchases/", { method: "POST", body: data });
}