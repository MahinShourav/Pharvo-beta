/**
 * AI assistant API service.
 *
 * Wraps the Django `ai` app decision-support endpoint:
 *   POST /api/ai/query/  - classify a customer complaint (Bangla, English,
 *                          or Banglish) and return matching in-stock products.
 *
 * The response is decision support only: it carries a health-problem
 * category, candidate generics, and available pharmacy stock, always with
 * `requires_pharmacist_review: true`. It is never a diagnosis and never an
 * automatic prescription.
 */

import { request } from "./api";

/**
 * Send a customer complaint to the AI assistant.
 * @param {string} text - raw complaint text
 * @returns {Promise<object>} classification + inventory_matches
 */
export async function sendAiQuery(text) {
  return request("/ai/query/", { method: "POST", body: { text } });
}
