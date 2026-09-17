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
 * List medicine groups (read-only master data).
 * @returns {Promise<object[]>}
 */
export async function fetchGroups() {
  return request("/inventory/groups/");
}

/**
 * List suppliers. Supports the backend `search` filter.
 * @param {object} params - query parameters (any of the backend filters)
 * @returns {Promise<object[]>}
 */
export async function fetchSuppliers(params = {}) {
  const query = new URLSearchParams(
    Object.fromEntries(
      Object.entries(params).filter(([, v]) => v !== "" && v !== null && v !== undefined)
    )
  ).toString();
  return request(`/inventory/suppliers/${query ? `?${query}` : ""}`);
}

/**
 * Fetch a single product (full detail, including group name and sensitive flag).
 * @param {number} id
 * @returns {Promise<object>}
 */
export async function fetchProduct(id) {
  return request(`/inventory/products/${id}/`);
}

/**
 * List medicines that belong to the same group as `productId`
 * (read-only related products).
 * @param {number} productId
 * @returns {Promise<object[]>}
 */
export async function fetchRelatedProducts(productId) {
  return request(`/inventory/products/${productId}/related/`);
}

/**
 * List known drug interactions (read-only master data). Supports the backend
 * filters: active, level, search.
 * @param {object} params - query parameters (any of the backend filters)
 * @returns {Promise<object[]>}
 */
export async function fetchInteractions(params = {}) {
  const query = new URLSearchParams(
    Object.fromEntries(
      Object.entries(params).filter(([, v]) => v !== "" && v !== null && v !== undefined)
    )
  ).toString();
  return request(`/inventory/interactions/${query ? `?${query}` : ""}`);
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