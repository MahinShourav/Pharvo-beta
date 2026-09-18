/** Focused checks for orderUnits.mjs. Run: node src/utils/orderUnits.check.mjs */
import {
  orderUnit,
  pcsPerOrderUnit,
  unitNoun,
  itemUnit,
  itemPcsPerUnit,
  itemPcs,
  lineCost,
  orderTotalCost,
  unitDisplayPrice,
  toOrderQty,
  normalizeWaRecipient,
} from "./orderUnits.mjs";

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

const tablet = { name: "Napa 500mg", group_name: "Tablet", category_name: "Analgesic", pcs_per_box: 30, cost_price: 2 };
const syrupByGroup = { name: "Paracetamol 120mg/5ml", group_name: "Syrup", pcs_per_box: null, cost_price: 1.5 };
const syrupByName = { name: "Cetirizine Syrup", group_name: "Tablet", cost_price: 1 };
const cream = { name: "Hydrocortisone Cream 1%", group_name: null, category_name: null, cost_price: 120 };
const ointment = { name: "Betnovate Ointment", cost_price: 90 };
const bare = { name: "Mystery Med" };

// --- unit rule: normal -> Box, Cream/Syrup -> PC ---
check("tablet is box", orderUnit(tablet), "box");
check("no signals is box", orderUnit(bare), "box");
check("syrup group is pc", orderUnit(syrupByGroup), "pc");
check("syrup name is pc", orderUnit(syrupByName), "pc");
check("cream name is pc", orderUnit(cream), "pc");
check("ointment is pc", orderUnit(ointment), "pc");
check("group match is case-insensitive", orderUnit({ name: "X", group_name: "syrup" }), "pc");

// --- pcs conversion uses existing pack sizes ---
check("box of 30", pcsPerOrderUnit(tablet, "box"), 30);
check("pc is 1", pcsPerOrderUnit(tablet, "pc"), 1);
check("box without pack size falls back to 1", pcsPerOrderUnit(bare, "box"), 1);

// --- display nouns never show PC for box medicines ---
check("1 box singular", unitNoun("box", 1), "Box");
check("5 boxes plural", unitNoun("box", 5), "Boxes");
check("3 PC", unitNoun("pc", 3), "PC");
check("1 PC stays PC", unitNoun("pc", 1), "PC");

// --- legacy lines (no unit) keep PC math ---
check("legacy line unit defaults pc", itemUnit({ quantity: 5, costPrice: 2 }), "pc");
check("legacy line pcs", itemPcs({ quantity: 5, costPrice: 2 }), 5);
check("legacy line cost", lineCost({ quantity: 5, costPrice: 2 }), 10);

// --- box lines convert through the snapshot ---
const boxLine = { quantity: 5, unit: "box", pcsPerBox: 30, costPrice: 2 };
check("box line unit", itemUnit(boxLine), "box");
check("5 boxes of 30 = 150 pcs", itemPcs(boxLine), 150);
check("5 boxes x 30 x 2 = 300", lineCost(boxLine), 300);
check("box without snapshot falls back to 1:1", itemPcs({ quantity: 5, unit: "box", costPrice: 2 }), 5);

// --- mixed order totals ---
const mixed = { items: [boxLine, { quantity: 3, unit: "pc", costPrice: 120 }] };
check("mixed order total 300 + 360", orderTotalCost(mixed), 660);
check("empty order totals 0", orderTotalCost({ items: [] }), 0);

// --- derived display prices (never user-typed) ---
check("per-box display price", unitDisplayPrice(tablet, "box"), 60);
check("per-pc display price", unitDisplayPrice(cream, "pc"), 120);

// --- pcs suggestions convert into order units ---
check("60 pcs box-30 -> 2 boxes", toOrderQty(60, "box", 30), 2);
check("61 pcs box-30 rounds up", toOrderQty(61, "box", 30), 3);
check("pcs stay pcs", toOrderQty(7, "pc", null), 7);
check("minimum 1", toOrderQty(0, "box", 30), 1);

// --- recipient normalization mirrors the backend (digits-only E.164) ---
check("bd local gains 880", normalizeWaRecipient("01601969980"), "8801601969980");
check("already-coded passes through", normalizeWaRecipient("8801601969980"), "8801601969980");
check("formatting stripped", normalizeWaRecipient("+880 160-1969980"), "8801601969980");
check("other international kept", normalizeWaRecipient("+1 415 555 2671"), "14155552671");
check("too short rejected", normalizeWaRecipient("123"), null);
check("non-numeric rejected", normalizeWaRecipient("no-number"), null);
check("empty rejected", normalizeWaRecipient(""), null);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
