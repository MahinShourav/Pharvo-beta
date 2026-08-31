/**
 * Reports API service.
 *
 * Wraps the Django `reports` app endpoints under /api/reports/.
 */

import { request } from "./api";

function query(params = {}) {
  const qs = new URLSearchParams(
    Object.fromEntries(
      Object.entries(params).filter(
        ([, v]) => v !== "" && v !== null && v !== undefined
      )
    )
  ).toString();
  return qs ? `?${qs}` : "";
}

/**
 * Fetch the sales report for a date range (daily summary + top products).
 * @param {object} params - { start_date, end_date } (YYYY-MM-DD)
 * @returns {Promise<object>}
 */
export async function fetchSalesReport(params = {}) {
  return request(`/reports/sales/${query(params)}`);
}

/**
 * Fetch the profit report (revenue, cost, profit, margin).
 * @param {object} params - { start_date, end_date }
 * @returns {Promise<object>}
 */
export async function fetchProfitReport(params = {}) {
  return request(`/reports/profit/${query(params)}`);
}

/**
 * Fetch the stock report (inventory health summary).
 * @returns {Promise<object>}
 */
export async function fetchStockReport() {
  return request("/reports/stock/");
}

/**
 * Fetch the purchases report.
 * @param {object} params - { start_date, end_date }
 * @returns {Promise<object>}
 */
export async function fetchPurchasesReport(params = {}) {
  return request(`/reports/purchases/${query(params)}`);
}