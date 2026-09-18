/**
 * Supplier-order quantity units (pure logic, no I/O).
 *
 * No schema change: the unit is derived from the medicine's existing
 * type/form signals (medicine group, category, product name):
 * - Cream / Syrup forms -> ordered, displayed and messaged in PC
 * - All other normal medicines -> ordered, displayed and messaged in Box
 *
 * Stock accounting stays in PCs everywhere: 1 Box = product.pcs_per_box PCs.
 * Every order line snapshots pcsPerBox at creation so historical orders stay
 * correct even if pack sizes change later. Legacy lines without a unit are
 * treated as PC (that was the only unit before this change).
 */

export const ORDER_UNITS = ["box", "pc"];

// Dosage forms that are counted per piece, matched against
// "<name> <group> <category>" (case-insensitive).
const PC_FORM_RE = /(cream|ointment|gel|lotion|syrup|suspension|drops|solution)/i;

/** "box" for normal medicines, "pc" for Cream/Syrup forms. */
export function orderUnit(product) {
  const group = String(product?.group_name ?? "");
  const category = String(product?.category_name ?? "");
  const hay = `${product?.name ?? ""} ${group} ${category}`;
  if (group.trim().toLowerCase() === "syrup" || PC_FORM_RE.test(hay)) {
    return "pc";
  }
  return "box";
}

/** How many PCs one order unit of `unit` contains for this product. */
export function pcsPerOrderUnit(product, unit) {
  if (unit !== "box") return 1;
  const n = Number(product?.pcs_per_box);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}

/** Display noun: "Box"/"Boxes"/"PC" (never bare "pc" for box medicines). */
export function unitNoun(unit, qty) {
  if (unit === "box") return Number(qty) === 1 ? "Box" : "Boxes";
  return "PC";
}

/** Stored line unit, defaulting legacy lines (no unit) to "pc". */
export function itemUnit(item) {
  return item?.unit === "box" ? "box" : "pc";
}

/** PCs per order unit for a stored line (snapshot, fallback 1). */
export function itemPcsPerUnit(item) {
  if (itemUnit(item) !== "box") return 1;
  const n = Number(item?.pcsPerBox);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}

/** PC-equivalent of a stored line (what stock/purchases account). */
export function itemPcs(item) {
  return Number(item?.quantity || 0) * itemPcsPerUnit(item);
}

/** Supplier cost of a stored line: PCs x per-PC cost price. */
export function lineCost(item) {
  return itemPcs(item) * Number(item?.costPrice || 0);
}

/** Supplier cost of a whole order. */
export function orderTotalCost(order) {
  return (order?.items || []).reduce((sum, it) => sum + lineCost(it), 0);
}

/**
 * Display price for one order unit, derived from the inventory per-PC cost
 * price (never typed in by the user).
 */
export function unitDisplayPrice(product, unit) {
  return Number(product?.cost_price || 0) * pcsPerOrderUnit(product, unit);
}

/** Convert a PC quantity into order units (whole units, minimum 1). */
export function toOrderQty(pcsQty, unit, pcsPerBox) {
  const pcs = Number(pcsQty || 0);
  if (unit !== "box") return Math.max(Math.ceil(pcs), 1);
  const per = Number(pcsPerBox) > 0 ? Math.floor(Number(pcsPerBox)) : 1;
  return Math.max(Math.ceil(pcs / per), 1);
}

/**
 * Normalize a WhatsApp recipient to digits-only E.164 (no leading '+'),
 * mirroring Backend/notifications/whatsapp.py::normalize_recipient:
 * Bangladesh local mobiles (01XXXXXXXXX) gain the 880 country code, e.g.
 * 01601969980 -> 8801601969980. Returns null when unusable.
 */
export function normalizeWaRecipient(phone) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  let out = digits;
  if (/^01[3-9]\d{8}$/.test(out)) out = "880" + out.slice(1);
  return /^\d{7,15}$/.test(out) ? out : null;
}
