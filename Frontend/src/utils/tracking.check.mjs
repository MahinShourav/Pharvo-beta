/** Focused checks for tracking.mjs. Run: node src/utils/tracking.check.mjs */
import {
  TRACKING_KEYS,
  TRANSITIONS,
  canTransition,
  trackingStatus,
  trackingLabel,
  matchesTrackingFilter,
  isOverdue,
  buildTimeline,
} from "./tracking.mjs";

let passed = 0;
let failed = 0;

function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed += 1;
    console.log(`ok - ${name}`);
  } else {
    failed += 1;
    console.log(
      `FAIL - ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

const base = {
  id: "1",
  ref: "SO-0001",
  status: "draft",
  items: [],
  createdAt: "2026-01-01T00:00:00.000Z",
};

// --- all seven tracking states from stored data ---
check("manual draft", trackingStatus({ ...base }), "draft");
check("auto draft needs approval", trackingStatus({ ...base, auto: true }), "pending_approval");
check("requested is sent", trackingStatus({ ...base, status: "requested" }), "sent");
check("sent + human confirmation", trackingStatus({ ...base, status: "requested", confirmedAt: "2026-01-02" }), "confirmed");
check("partial", trackingStatus({ ...base, status: "partially_received" }), "partially_received");
check("received", trackingStatus({ ...base, status: "received" }), "received");
check("cancelled", trackingStatus({ ...base, status: "cancelled" }), "cancelled");
check("received stays received even if confirmed", trackingStatus({ ...base, status: "received", confirmedAt: "x" }), "received");
check("seven keys", TRACKING_KEYS, ["draft", "pending_approval", "sent", "confirmed", "partially_received", "received", "cancelled"]);
check("label underscores", trackingLabel("partially_received"), "Partially received");

// --- transitions stay closed ---
check("draft->requested allowed", canTransition("draft", "requested"), true);
check("draft->received blocked", canTransition("draft", "received"), false);
check("requested->received allowed", canTransition("requested", "received"), true);
check("received terminal", canTransition("received", "requested"), false);
check("cancelled terminal", canTransition("cancelled", "draft"), false);
check("unknown from blocked", canTransition("nope", "requested"), false);
check("table unchanged", TRANSITIONS, {
  draft: ["requested", "cancelled"],
  requested: ["received", "cancelled"],
  partially_received: ["received", "cancelled"],
  received: [],
  cancelled: [],
});

// --- filters map to stored predicates ---
check("filter draft skips auto", matchesTrackingFilter({ status: "draft", auto: true }, "draft"), false);
check("filter pending_approval", matchesTrackingFilter({ status: "draft", auto: true }, "pending_approval"), true);
check("filter sent", matchesTrackingFilter({ status: "requested" }, "sent"), true);
check("filter confirmed needs stamp", matchesTrackingFilter({ status: "requested" }, "confirmed"), false);
check("filter confirmed with stamp", matchesTrackingFilter({ status: "requested", confirmedAt: "x" }, "confirmed"), true);

// --- overdue: admin-entered ETA only, pending orders only ---
const T = "2026-02-10";
check("overdue requested", isOverdue({ status: "requested", expectedDate: "2026-02-09" }, T), true);
check("overdue partial", isOverdue({ status: "partially_received", expectedDate: "2026-02-09" }, T), true);
check("today not overdue", isOverdue({ status: "requested", expectedDate: T }, T), false);
check("future not overdue", isOverdue({ status: "requested", expectedDate: "2026-02-11" }, T), false);
check("no ETA never overdue", isOverdue({ status: "requested" }, T), false);
check("draft never overdue", isOverdue({ status: "draft", expectedDate: "2026-02-09" }, T), false);
check("received never overdue", isOverdue({ status: "received", expectedDate: "2026-02-09" }, T), false);
check("cancelled never overdue", isOverdue({ status: "cancelled", expectedDate: "2026-02-09" }, T), false);

// --- timeline: only stored events, nothing synthesized ---
const full = {
  ...base,
  auto: true,
  status: "partially_received",
  requestedAt: "2026-01-02T00:00:00.000Z",
  whatsapp: { status: "sent", messageId: "wamid.1", sentAt: "2026-01-02T01:00:00.000Z" },
  confirmedAt: "2026-01-03T00:00:00.000Z",
  receipts: [{ invoiceNumber: "RCV-1", date: "2026-01-04T00:00:00.000Z", lines: [{ quantity: 3 }] }],
};
const keys = buildTimeline(full).map((e) => e.key);
check("timeline keys", keys, ["created", "approved", "whatsapp", "confirmed", "receipt", ]);
check("auto noted on creation", buildTimeline(full)[0].label.includes("automatically"), true);
const waLabel = buildTimeline(full).find((e) => e.key === "whatsapp").label;
check("acceptance wording names Meta", waLabel.includes("accepted by Meta"), true);
check("acceptance wording admits unknown delivery", waLabel.includes("unknown"), true);
check("acceptance wording never claims delivery", !/delivered/i.test(waLabel.replace("delivery unknown", "")), true);
const manual = buildTimeline({ ...base, status: "requested", requestedAt: "2026-01-02T00:00:00.000Z", whatsapp: { status: "unsent" } }).map((e) => e.key);
check("manual submit labelled, no whatsapp event", manual, ["created", "approved"]);
const empty = buildTimeline({ ...base });
check("draft has creation only", empty.map((e) => e.key), ["created"]);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
