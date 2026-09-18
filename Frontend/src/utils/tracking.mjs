/**
 * Order tracking logic (pure, no I/O).
 *
 * There is no backend order-request or audit table, so tracking is derived
 * from actually stored data only:
 * - stored `status`: draft / requested / partially_received / received /
 *   cancelled (existing store shape)
 * - `auto`: reorder-generated drafts still awaiting admin review
 * - `whatsapp.status`: unsent / sent / failed (send ≠ confirmation)
 * - `confirmedAt`: explicit human-recorded supplier confirmation
 * - timestamps: createdAt / requestedAt / receivedAt / cancelledAt
 * - `receipts[]`: one entry per successful backend Purchase (invoice + date)
 * - `expectedDate`: admin-entered delivery date (YYYY-MM-DD) or null
 *
 * Derived tracking states: draft, pending_approval, sent, confirmed,
 * partially_received, received, cancelled.
 */

export const TRACKING_KEYS = [
  "draft",
  "pending_approval",
  "sent",
  "confirmed",
  "partially_received",
  "received",
  "cancelled",
];

/** Stored-status transitions (single source of truth for the UI). */
export const TRANSITIONS = {
  draft: ["requested", "cancelled"],
  requested: ["received", "cancelled"],
  partially_received: ["received", "cancelled"],
  received: [],
  cancelled: [],
};

export function canTransition(from, to) {
  return (TRANSITIONS[from] || []).includes(to);
}

/** Display tracking state derived from stored fields. */
export function trackingStatus(order) {
  if (!order) return "draft";
  if (order.status === "cancelled") return "cancelled";
  if (order.status === "received") return "received";
  if (order.status === "partially_received") return "partially_received";
  if (order.status === "requested") {
    return order.confirmedAt ? "confirmed" : "sent";
  }
  return order.auto ? "pending_approval" : "draft";
}

export function trackingLabel(key) {
  const text = String(key || "—").replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Filter predicate for the tracking filter keys. */
export function matchesTrackingFilter(order, filter) {
  switch (filter) {
    case "all":
      return true;
    case "draft":
      return order.status === "draft" && !order.auto;
    case "pending_approval":
      return order.status === "draft" && !!order.auto;
    case "sent":
      return order.status === "requested";
    case "confirmed":
      return !!order.confirmedAt;
    case "partially_received":
      return order.status === "partially_received";
    case "received":
      return order.status === "received";
    case "cancelled":
      return order.status === "cancelled";
    default:
      return true;
  }
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Overdue only for orders still awaiting delivery whose admin-entered
 * expected date has passed. Drafts (not yet sent) and terminal orders are
 * never overdue. No ETA is ever invented: without expectedDate there is no
 * overdue flag.
 */
export function isOverdue(order, today) {
  const day = today || todayIso();
  if (!order || !order.expectedDate) return false;
  if (order.expectedDate >= day) return false;
  return order.status === "requested" || order.status === "partially_received";
}

/**
 * Chronological timeline built exclusively from stored events. Every entry is
 * { key, label, date }. No event is synthesized: entries appear only when
 * their backing timestamp/record exists.
 */
export function buildTimeline(order) {
  if (!order) return [];
  const events = [];
  const wa = order.whatsapp || {};
  events.push({
    key: "created",
    label: order.auto ? "Draft created automatically (reorder)" : "Draft created",
    date: order.createdAt || null,
  });
  if (order.requestedAt) {
    events.push({
      key: "approved",
      label:
        wa.status === "sent"
          ? "Approved & sent via WhatsApp"
          : "Submitted to supplier",
      date: order.requestedAt,
    });
  }
  if (wa.status === "sent" && wa.sentAt) {
    // NOTE: this records Meta's acceptance (wamid issued), NOT handset
    // delivery. The Cloud API exposes no per-message status lookup; true
    // delivery state only arrives via status webhooks, which PHARVO does
    // not currently receive.
    events.push({
      key: "whatsapp",
      label: `WhatsApp accepted by Meta${wa.messageId ? ` (${wa.messageId})` : ""} — handset delivery unknown`,
      date: wa.sentAt,
    });
  }
  if (order.confirmedAt) {
    events.push({
      key: "confirmed",
      label: "Supplier confirmed",
      date: order.confirmedAt,
    });
  }
  for (const receipt of order.receipts || []) {
    // Lines carry their order unit (Box/PC); legacy lines default to PC.
    const parts = (receipt.lines || []).map((l) => {
      const unit = l.unit === "box" ? "box" : "pc";
      const qty = Number(l.quantity || 0);
      const noun = unit === "box" ? (qty === 1 ? "Box" : "Boxes") : "PC";
      return `${l.name || "item"}: ${qty} ${noun}`;
    });
    events.push({
      key: "receipt",
      label: `Partial receipt — ${parts.join(" · ") || "no lines"} via ${receipt.invoiceNumber || "purchase"}`,
      date: receipt.date || null,
    });
  }
  if (order.status === "received" && order.receivedAt) {
    events.push({
      key: "received",
      label: "Fully received — stock added",
      date: order.receivedAt,
    });
  }
  if (order.status === "cancelled" && order.cancelledAt) {
    events.push({
      key: "cancelled",
      label: "Order cancelled",
      date: order.cancelledAt,
    });
  }
  return events;
}
