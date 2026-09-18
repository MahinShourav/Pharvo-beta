/**
 * Reorder detection + automatic draft planning (pure logic, no I/O).
 *
 * Schema facts this module respects (see Backend/inventory/models.py):
 * - Stock is stored in PCs: `stock_quantity` (int).
 * - The only per-medicine threshold column is `reorder_level` (int). There is
 *   NO per-medicine reorder-quantity / max-stock column, so the suggested
 *   quantity is a configurable global top-up formula, editable per row.
 * - A product links to at most ONE supplier (`supplier` FK, nullable). There
 *   is no multi-supplier / preferred-supplier structure, so each medicine maps
 *   to its single mapped supplier; unmapped medicines cannot be auto-drafted.
 * - Draft orders reuse the existing manual-order store shape
 *   (see SupplierOrdersView): draft/requested/partially_received are "active".
 *
 * Percentage semantics (labeled clearly wherever shown):
 * - `warnPct` is a percentage of the REORDER LEVEL that must REMAIN, i.e. a
 *   draft is suggested when stock <= reorder_level * warnPct / 100.
 * - 100% = the built-in rule (at or below reorder level, out-of-stock
 *   included). 150% = earlier warning. This is "% stock remaining vs the
 *   reorder level", never "% depleted".
 */
import { orderUnit, pcsPerOrderUnit, toOrderQty } from "./orderUnits.mjs";

export const REORDER_SETTINGS_KEY = "pharvo_reorder_settings";

/** In-app event fired after drafts are written to the order store. */
export const ORDERS_CHANGED_EVENT = "pharvo:supplier-orders-changed";
/** Order statuses that block a new draft for the same medicine+supplier. */
export const ACTIVE_DRAFT_STATUSES = [
  "draft",
  "requested",
  "partially_received",
];

export function defaultSettings() {  return { enabled: true, warnPct: 100, coverMult: 2 };
}

export function loadSettings() {
  try {
    if (typeof localStorage === "undefined") return defaultSettings();
    const raw = JSON.parse(
      localStorage.getItem(REORDER_SETTINGS_KEY) || "null"
    );
    const base = defaultSettings();
    if (!raw || typeof raw !== "object") return base;
    return {
      enabled: raw.enabled !== false,
      warnPct:
        Number.isFinite(Number(raw.warnPct)) && Number(raw.warnPct) > 0
          ? Number(raw.warnPct)
          : base.warnPct,
      coverMult:
        Number.isFinite(Number(raw.coverMult)) && Number(raw.coverMult) > 0
          ? Number(raw.coverMult)
          : base.coverMult,
    };
  } catch (err) {
    return defaultSettings();
  }
}

export function saveSettings(settings) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(REORDER_SETTINGS_KEY, JSON.stringify(settings));
  } catch (err) {
    /* storage unavailable: settings apply for this session only */
  }
}

/** Absolute PC threshold for a product under the given settings. */
export function thresholdFor(product, settings) {
  const reorder = Number(product?.reorder_level || 0);
  const pct = Number(settings?.warnPct ?? 100);
  return reorder * (Number.isFinite(pct) && pct > 0 ? pct : 100) / 100;
}

/** True when stock is at/below threshold (out-of-stock always included). */
export function isLowStock(product, settings) {
  return Number(product?.stock_quantity || 0) <= thresholdFor(product, settings);
}

export function detectLowStock(products, settings) {
  return (products || []).filter((p) => isLowStock(p, settings));
}

/**
 * Suggested order quantity (PCs): top stock up to coverMult x reorder level.
 * Minimum 1; always a whole number. Pack breakdowns are display-only —
 * stock accounting stays in PCs.
 */
export function suggestQty(product, settings) {
  const stock = Number(product?.stock_quantity || 0);
  const reorder = Number(product?.reorder_level || 0);
  const mult = Number(settings?.coverMult ?? 2);
  const safeMult = Number.isFinite(mult) && mult > 0 ? mult : 2;
  return Math.max(Math.ceil(reorder * safeMult - stock), 1);
}

/** "supplierId:productId" pairs already covered by an active order. */
export function activeCoverage(orders) {
  const covered = new Map();
  for (const order of orders || []) {
    if (!ACTIVE_DRAFT_STATUSES.includes(order.status)) continue;
    for (const item of order.items || []) {
      const key = `${order.supplierId}:${item.productId}`;
      if (!covered.has(key)) covered.set(key, order.ref || order.id);
    }
  }
  return covered;
}

function supplierOf(suppliers, id) {
  return (suppliers || []).find((s) => Number(s.id) === Number(id)) || null;
}

/**
 * Plan reorder work from live data.
 * Returns { suggestions: [...], unmapped: [...] } where each suggestion is
 * { product, supplier, qty, alreadyCovered, coveringRef } and unmapped holds
 * low-stock products with no mapped supplier.
 */
export function planDrafts({ products, suppliers, orders, settings }) {
  const covered = activeCoverage(orders);
  const suggestions = [];
  const unmapped = [];
  for (const product of detectLowStock(products, settings)) {
    if (product.supplier == null) {
      unmapped.push(product);
      continue;
    }
    const supplier = supplierOf(suppliers, product.supplier);
    if (!supplier) {
      unmapped.push(product);
      continue;
    }
    const key = `${supplier.id}:${product.id}`;
    // Suggested PCs convert into the line's order unit (Box for normal
    // medicines, PC for Cream/Syrup); pcsPerBox is snapshotted for receiving.
    const unit = orderUnit(product);
    const per = pcsPerOrderUnit(product, unit);
    suggestions.push({
      product,
      supplier,
      qty: toOrderQty(suggestQty(product, settings), unit, per),
      unit,
      pcsPerBox: per,
      alreadyCovered: covered.has(key),
      coveringRef: covered.get(key) || null,
    });
  }
  return { suggestions, unmapped };
}

function nextRef(orders) {
  const maxNum = (orders || []).reduce((max, o) => {
    const m = /^SO-(\d+)$/.exec(o.ref || "");
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);
  return `SO-${String(maxNum + 1).padStart(4, "0")}`;
}

/**
 * Build draft orders (existing store shape) grouped by supplier for every
 * uncovered suggestion with qty >= 1. Drafts only — never "requested".
 */
export function buildDraftOrders({ suggestions, orders, nowIso }) {
  const pending = (suggestions || []).filter(
    (s) => !s.alreadyCovered && Number(s.qty) >= 1 && s.supplier && s.product
  );
  const bySupplier = new Map();
  for (const s of pending) {
    if (!bySupplier.has(s.supplier.id))
      bySupplier.set(s.supplier.id, { supplier: s.supplier, lines: [] });
    bySupplier.get(s.supplier.id).lines.push(s);
  }
  const now = nowIso || new Date().toISOString();
  const drafts = [];
  const seqBase = Date.now();
  let seq = 0;
  for (const { supplier, lines } of bySupplier.values()) {
    const ref = nextRef([...(orders || []), ...drafts]);
    drafts.push({
      id: `${seqBase}-${seq++}`,
      ref,
      supplierId: Number(supplier.id),
      supplierName: supplier.name,
      supplierPhone: supplier.phone || "",
      supplierEmail: supplier.email || "",
      items: lines.map((s) => {
        const unit = s.unit === "box" || s.unit === "pc" ? s.unit : orderUnit(s.product);
        const per = Number(s.pcsPerBox) > 0 ? Math.floor(Number(s.pcsPerBox)) : pcsPerOrderUnit(s.product, unit);
        return {
          productId: Number(s.product.id),
          name: s.product.name,
          quantity: Number(s.qty),
          unit,
          pcsPerBox: per,
          costPrice: Number(s.product.cost_price || 0),
          received: 0,
        };
      }),
      status: "draft",
      createdAt: now,
      requestedAt: null,
      receivedAt: null,
      cancelledAt: null,
      invoiceNumber: null,
      receipts: [],
      auto: true,
    });
  }
  return drafts;
}
