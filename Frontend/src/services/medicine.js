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

/**
 * Update a product's supplier association (admin; Django staff write).
 *
 * Reuses the existing Product endpoint — `supplier` is the single FK on
 * `inventory.Product` (nullable). Pass `null` to unassign.
 *
 * @param {number} productId
 * @param {number|null} supplierId
 * @returns {Promise<object>}
 */
export async function updateProductSupplier(productId, supplierId) {
  return request(`/inventory/products/${productId}/`, {
    method: "PATCH",
    body: { supplier: supplierId },
  });
}

/**
 * Create a supplier (admin; reuses existing Supplier table/API).
 * @param {object} data - { name, company, contact_person, phone, is_active }
 * @returns {Promise<object>}
 */
export async function createSupplier(data) {
  return request("/inventory/suppliers/", { method: "POST", body: data });
}

/**
 * Update a supplier (admin; reuses existing Supplier table/API).
 * @param {number} id
 * @param {object} data
 * @returns {Promise<object>}
 */
export async function updateSupplier(id, data) {
  return request(`/inventory/suppliers/${id}/`, { method: "PATCH", body: data });
}

/**
 * Delete a supplier (admin; backend PROTECTs suppliers with purchases).
 * Prefer deactivation (`is_active: false`) over deletion.
 * @param {number} id
 * @returns {Promise<void>}
 */
export async function deleteSupplier(id) {
  return request(`/inventory/suppliers/${id}/`, { method: "DELETE" });
}

/**
 * List medicines supplied by one supplier.
 * Reuses `GET /api/inventory/suppliers/{id}/products/`.
 * @param {number} supplierId
 * @returns {Promise<object[]>}
 */
export async function fetchSupplierProducts(supplierId) {
  return request(`/inventory/suppliers/${supplierId}/products/`);
}

/**
 * Fetch a supplier's purchase/stock summary.
 * Reuses `GET /api/inventory/suppliers/{id}/summary/`.
 * @param {number} supplierId
 * @returns {Promise<object>}
 */
export async function fetchSupplierSummary(supplierId) {
  return request(`/inventory/suppliers/${supplierId}/summary/`);
}

/**
 * List received purchase records for one supplier (order history).
 * Reuses `GET /api/inventory/suppliers/{id}/purchases/` — each purchase
 * carries items with the unit price paid, which doubles as the supplier
 * price history per medicine.
 * @param {number} supplierId
 * @returns {Promise<object[]>}
 */
export async function fetchSupplierPurchases(supplierId) {
  return request(`/inventory/suppliers/${supplierId}/purchases/`);
}

/**
 * Fetch the low-stock / restock list for a supplier.
 * Reuses `GET /api/inventory/suppliers/{id}/restock-list/`.
 * Each entry tracks a product that has reached its configured
 * low-stock threshold.
 * @param {number} supplierId
 * @returns {Promise<object[]>}
 */
export async function fetchSupplierRestockList(supplierId) {
  return request(`/inventory/suppliers/${supplierId}/restock-list/`);
}