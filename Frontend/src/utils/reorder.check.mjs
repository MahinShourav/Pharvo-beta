/** Focused checks for reorder.mjs. Run: node src/utils/reorder.check.mjs */
import {
  thresholdFor,
  isLowStock,
  detectLowStock,
  suggestQty,
  activeCoverage,
  planDrafts,
  buildDraftOrders,
  defaultSettings,
  loadSettings,
} from "./reorder.mjs";

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

// --- threshold detection (absolute rule, warnPct=100) ---
const s100 = { enabled: true, warnPct: 100, coverMult: 2 };
check("at reorder level flags", isLowStock({ stock_quantity: 10, reorder_level: 10 }, s100), true);
check("below flags", isLowStock({ stock_quantity: 4, reorder_level: 10 }, s100), true);
check("above does not flag", isLowStock({ stock_quantity: 11, reorder_level: 10 }, s100), false);
check("out-of-stock flags", isLowStock({ stock_quantity: 0, reorder_level: 10 }, s100), true);
check("zero stock + zero reorder flags", isLowStock({ stock_quantity: 0, reorder_level: 0 }, s100), true);
check("positive stock + zero reorder does not flag", isLowStock({ stock_quantity: 1, reorder_level: 0 }, s100), false);

// --- percentage semantics: % of reorder level REMAINING ---
const s150 = { enabled: true, warnPct: 150, coverMult: 2 };
check("threshold = reorder * pct", thresholdFor({ reorder_level: 100 }, s150), 150);
check("150% warns early (120 of 100)", isLowStock({ stock_quantity: 120, reorder_level: 100 }, s150), true);
check("100% does not warn early (120 of 100)", isLowStock({ stock_quantity: 120, reorder_level: 100 }, s100), false);
const s50 = { enabled: true, warnPct: 50, coverMult: 2 };
check("50% is stricter (60 of 100 ok)", isLowStock({ stock_quantity: 60, reorder_level: 100 }, s50), false);
check("50% flags at half (50 of 100)", isLowStock({ stock_quantity: 50, reorder_level: 100 }, s50), true);

// --- suggested quantity: top up to coverMult x reorder, min 1, integer ---
check("top-up formula", suggestQty({ stock_quantity: 10, reorder_level: 10 }, s100), 10);
check("out-of-stock suggests full cover", suggestQty({ stock_quantity: 0, reorder_level: 25 }, s100), 50);
check("minimum 1 when overstocked", suggestQty({ stock_quantity: 99, reorder_level: 10 }, s100), 1);
check("whole number", Number.isInteger(suggestQty({ stock_quantity: 3, reorder_level: 7 }, { enabled: true, warnPct: 100, coverMult: 1.5 })), true);

// --- supplier mapping: single FK; unmapped cannot draft ---
const products = [
  { id: 1, name: "A", stock_quantity: 2, reorder_level: 10, cost_price: 5, supplier: 9 },
  { id: 2, name: "B", stock_quantity: 0, reorder_level: 5, cost_price: 8, supplier: null },
  { id: 3, name: "C", stock_quantity: 99, reorder_level: 10, cost_price: 8, supplier: 9 },
  { id: 4, name: "D", stock_quantity: 1, reorder_level: 10, cost_price: 8, supplier: 77 },
];
const suppliers = [{ id: 9, name: "S9", phone: "01", email: "" }];
const detected = detectLowStock(products, s100).map((p) => p.id);
check("detects low only", detected, [1, 2, 4]);
const plan = planDrafts({ products, suppliers, orders: [], settings: s100 });
check("mapped suggestion supplier", plan.suggestions[0].supplier.id, 9);
check("unknown supplier treated as unmapped", plan.unmapped.map((p) => p.id), [2, 4]);

// --- duplicate-draft prevention ---
const active = [
  { id: "x", ref: "SO-0001", supplierId: 9, status: "requested", items: [{ productId: 1 }] },
];
const cov = activeCoverage(active);
check("active draft covers pair", cov.get("9:1"), "SO-0001");
const plan2 = planDrafts({ products, suppliers, orders: active, settings: s100 });
check("covered suggestion flagged", plan2.suggestions[0].alreadyCovered, true);
check("covering ref reported", plan2.suggestions[0].coveringRef, "SO-0001");
const inactive = [
  { id: "y", ref: "SO-0002", supplierId: 9, status: "cancelled", items: [{ productId: 1 }] },
  { id: "z", ref: "SO-0003", supplierId: 9, status: "received", items: [{ productId: 1 }] },
];
check("cancelled/received do not block", activeCoverage(inactive).size, 0);
check("different supplier does not block", activeCoverage([{ id: "w", ref: "SO-9", supplierId: 8, status: "draft", items: [{ productId: 1 }] }]).has("9:1"), false);

// --- draft building: grouped per supplier, drafts only, sequenced refs ---
const sug = [
  { product: products[0], supplier: suppliers[0], qty: 18, alreadyCovered: false },
  { product: { id: 5, name: "E", cost_price: 2 }, supplier: suppliers[0], qty: 4, alreadyCovered: false },
  { product: products[0], supplier: suppliers[0], qty: 3, alreadyCovered: true },
  { product: products[0], supplier: suppliers[0], qty: 0, alreadyCovered: false },
];
const drafts = buildDraftOrders({ suggestions: sug, orders: [{ ref: "SO-0007" }], nowIso: "2026-01-01T00:00:00.000Z" });
check("one draft per supplier", drafts.length, 1);
check("only uncovered qty>=1 lines", drafts[0].items.map((i) => i.quantity), [18, 4]);
check("draft status never sent", drafts[0].status, "draft");
check("ref sequenced", drafts[0].ref, "SO-0008");
check("lines start unreceived", drafts[0].items.every((i) => i.received === 0), true);

// --- order units: Cream/Syrup draft in PC, normal medicines in Box ---
const syrupProd = { id: 11, name: "Cough Syrup", group_name: "Syrup", stock_quantity: 0, reorder_level: 5, cost_price: 8, supplier: 9, pcs_per_box: null };
const boxProd = { id: 12, name: "Napa 500mg", group_name: "Tablet", stock_quantity: 0, reorder_level: 100, cost_price: 2, supplier: 9, pcs_per_box: 30 };
const unitPlan = planDrafts({ products: [syrupProd, boxProd], suppliers, orders: [], settings: s100 });
check("syrup suggestion unit pc", unitPlan.suggestions[0].unit, "pc");
check("syrup suggestion qty stays pcs", unitPlan.suggestions[0].qty, 10);
check("box suggestion unit box", unitPlan.suggestions[1].unit, "box");
check("box suggestion converts pcs to boxes", unitPlan.suggestions[1].qty, 7);
check("box suggestion snapshots pcsPerBox", unitPlan.suggestions[1].pcsPerBox, 30);
const unitDrafts = buildDraftOrders({ suggestions: unitPlan.suggestions, orders: [], nowIso: "2026-01-01T00:00:00.000Z" });
const syrupLine = unitDrafts[0].items.find((i) => i.productId === 11);
const boxLine = unitDrafts[0].items.find((i) => i.productId === 12);
check("draft syrup line unit", syrupLine.unit, "pc");
check("draft box line unit + snapshot", [boxLine.unit, boxLine.pcsPerBox, boxLine.quantity], ["box", 30, 7]);

// --- settings defaults are safe (drafts only, standard rule) ---
check("defaults", defaultSettings(), { enabled: true, warnPct: 100, coverMult: 2 });
check("loadSettings without storage", loadSettings(), { enabled: true, warnPct: 100, coverMult: 2 });

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
