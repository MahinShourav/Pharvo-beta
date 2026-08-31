/**
 * Medicine / inventory API service.
 *
 * Wraps the Django `inventory` app endpoints under /api/inventory/.
 */

import { request } from "./api";

/**
 * List products. Supports the backend filters: search, category, supplier,
 * group, is_active, expiry_status.
 *
 * @param {object} params - query parameters (any of the backend filters)
 * @returns {Promise<object[]>}
 */
export async function fetchProducts(params = {}) {
  const query = new URLSearchParams(
    Object.fromEntries(
      Object.entries(params).filter(([, v]) => v !== "" && v !== null && v !== undefined)
    )
  ).toString();
  return request(`/inventory/products/${query ? `?${query}` : ""}`);
}

/**
 * List medicine categories.
 * @returns {Promise<object[]>}
 */
export async function fetchCategories() {
  return request("/inventory/categories/");
}

/**
 * Fetch drug interactions for a product (used for safe dispensing checks).
 * @param {number} productId
 * @returns {Promise<object[]>}
 */
export async function fetchProductInteractions(productId) {
  return request(`/inventory/products/${productId}/interactions/`);
}

/**
 * Create a new product (staff only).
 * @param {object} data
 * @returns {Promise<object>}
 */
export async function createProduct(data) {
  return request("/inventory/products/", { method: "POST", body: data });
}