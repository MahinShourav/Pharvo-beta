/**
 * Notifications API service.
 *
 * Wraps the Django `notifications` app endpoints under /api/notifications/.
 */

import { request } from "./api";

/**
 * List notifications. Optional filters: is_read, severity, type.
 * @param {object} params
 * @returns {Promise<object[]>}
 */
export async function fetchNotifications(params = {}) {
  const qs = new URLSearchParams(
    Object.fromEntries(
      Object.entries(params).filter(
        ([, v]) => v !== "" && v !== null && v !== undefined
      )
    )
  ).toString();
  return request(`/notifications/${qs ? `?${qs}` : ""}`);
}

/**
 * Fetch the number of unread notifications.
 * @returns {Promise<{ unread_count: number }>}
 */
export async function fetchUnreadCount() {
  return request("/notifications/unread-count/");
}

/**
 * Mark a single notification as read.
 * @param {number|string} id
 * @returns {Promise<object>}
 */
export async function markNotificationRead(id) {
  return request(`/notifications/${id}/read/`, { method: "PATCH" });
}

/**
 * Mark every notification as read.
 * @returns {Promise<{ marked_read: number }>}
 */
export async function markAllNotificationsRead() {
  return request("/notifications/mark-all-read/", { method: "POST" });
}

/**
 * Approve-and-send a supplier order over WhatsApp (staff only).
 *
 * The server composes and sends the message; the client only supplies order
 * data. Resolves with { status: "sent", message_id, to, client_ref }.
 * Rejects with ApiError: 503 when WhatsApp is not configured server-side
 * (nothing was sent), 502 on provider failure, 400 on invalid payload.
 *
 * @param {object} data - { order_ref, supplier_name, supplier_phone, items, estimated_total, order_date, delivery_note, client_ref }
 *   supplier_phone is the per-order WhatsApp recipient; items carry unit ("box"/"pc").
 * @returns {Promise<object>}
 */
export async function sendWhatsAppOrder(data) {
  return request("/notifications/whatsapp/send-order/", {
    method: "POST",
    body: data,
  });
}