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