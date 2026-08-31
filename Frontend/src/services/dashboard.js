/**
 * Dashboard API service.
 *
 * Fetches the PHARVO dashboard summary using the shared API client
 * (`services/api.js`).
 */

import { request } from "./api";

/**
 * Fetch the dashboard summary for a given lookback period.
 *
 * @param {number} days - lookback window, e.g. 7, 30 or 90
 * @returns {Promise<object>} dashboard payload from GET /api/dashboard/
 * @throws {ApiError} on failure; status 401 means the session expired
 */
export async function fetchDashboard(days = 30) {
  return request(`/dashboard/?days=${days}`);
}