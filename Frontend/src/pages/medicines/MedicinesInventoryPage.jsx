import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Search, Package, Pill, AlertTriangle, PackageX, Clock, X, Building2, Layers, Boxes } from "lucide-react";
import { fetchProducts, fetchCategories, fetchGroups, fetchSuppliers, fetchRelatedProducts } from "../../services/medicine";
import { ROLES } from "../../services/auth";
import { ApiError } from "../../services/api";
import { formatBreakdown, formatEquivalents, formatBreakdownShort } from "../../utils/units";
import { Card, CardHeader, StatCard, StatusBadge, LoadingState, EmptyState } from "../../components/ui/Blocks";

const STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "low", label: "Low Stock" },
  { key: "out", label: "Out of Stock" },
  { key: "expired", label: "Expired" },
  { key: "near", label: "Near Expiry" },
];

function daysUntil(iso) {
  if (!iso) return null;
  return Math.ceil((new Date(iso) - new Date()) / (1000 * 60 * 60 * 24));
}

function inventoryStatus(p) {
  const stock = Number(p.stock_quantity);
  const today = new Date().toISOString().slice(0, 10);
  if (stock <= 0) return "out";
  if (p.expiry_date && p.expiry_date < today) return "expired";
  if (stock <= Number(p.reorder_level)) return "low";
  return "ok";
}

const STATUS_BADGE = {
  out: "Out of stock",
  low: "Low",
  expired: "Expired",
  ok: "In stock",
};

function DetailTile({ label, value, sub }) {
  return (
    <div className="p-3.5 rounded-lg border border-slate-100 bg-slate-50/70">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</div>
      <div className="text-sm font-semibold text-slate-900 mt-1">{value}</div>
      {sub && <div className="text-[11px] text-slate-400 font-normal mt-0.5">{sub}</div>}
    </div>
  );
}

function DetailSection({ icon: Icon, title, children }) {
  return (
    <div className="rounded-xl border border-slate-100 overflow-hidden">
      <div className="px-4 py-2.5 bg-slate-50/70 border-b border-slate-100 flex items-center gap-2">
        <Icon size={14} className="text-slate-400" />
        <span className="text-xs font-semibold text-slate-700">{title}</span>
      </div>
      <div className="px-4 py-3">{children}</div>
    </div>
  );
}

export default function MedicinesInventoryPage({ role = ROLES.PHARMACIST } = {}) {
  const isPharmacist = role === ROLES.PHARMACIST;
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [supplier, setSupplier] = useState("All");
  const [group, setGroup] = useState("All");
  const [status, setStatus] = useState("all");
  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detailProduct, setDetailProduct] = useState(null);
  const [related, setRelated] = useState([]);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const timer = useRef(null);
  const productsReqSeq = useRef(0);
  const categoriesRef = useRef([]);
  const suppliersRef = useRef([]);
  const groupsRef = useRef([]);
  const initialSearchRun = useRef(true);

  const loadProducts = useCallback(async (q = "", cat = "All", sup = "All", grp = "All") => {
    const seq = ++productsReqSeq.current;
    setLoading(true);
    setError("");
    try {
      const params = { search: q || undefined, is_active: "" };
      if (cat !== "All") {
        const match = categoriesRef.current.find((c) => c.name === cat);
        if (match) params.category = match.id;
      }
      if (sup !== "All") {
        const match = suppliersRef.current.find((s) => s.name === sup);
        if (match) params.supplier = match.id;
      }
      if (grp !== "All") {
        const match = groupsRef.current.find((g) => g.name === grp);
        if (match) params.group = match.id;
      }
      const data = await fetchProducts(params);
      if (seq !== productsReqSeq.current) return;
      setProducts(data || []);
    } catch (err) {
      if (seq !== productsReqSeq.current) return;
      setError(err instanceof ApiError ? err.message : "Unable to load medicines.");
      setProducts([]);
    } finally {
      if (seq === productsReqSeq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    categoriesRef.current = categories;
  }, [categories]);

  useEffect(() => {
    suppliersRef.current = suppliers;
  }, [suppliers]);

  useEffect(() => {
    groupsRef.current = groups;
  }, [groups]);

  const openDetail = useCallback(async (p) => {
    setDetailProduct(p);
    setRelated([]);
    setRelatedLoading(true);
    try {
      const data = await fetchRelatedProducts(p.id);
      setRelated(data || []);
    } catch (err) {
      setRelated([]);
    } finally {
      setRelatedLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCategories()
      .then((data) => setCategories(data || []))
      .catch(() => setCategories([]));
    if (isPharmacist) {
      fetchGroups()
        .then((data) => setGroups(data || []))
        .catch(() => setGroups([]));
      fetchSuppliers()
        .then((data) => setSuppliers(data || []))
        .catch(() => setSuppliers([]));
    }
    loadProducts();
  }, [loadProducts, isPharmacist]);

  useEffect(() => {
    if (initialSearchRun.current) {
      initialSearchRun.current = false;
      return;
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => loadProducts(search, category, supplier, group), 350);
    return () => clearTimeout(timer.current);
  }, [search, category, supplier, group, loadProducts]);

  const categoryOptions = useMemo(
    () => ["All", ...categories.map((c) => c.name)],
    [categories]
  );

  const supplierOptions = useMemo(
    () => ["All", ...suppliers.map((s) => s.name)],
    [suppliers]
  );

  const groupOptions = useMemo(
    () => ["All", ...groups.map((g) => g.name)],
    [groups]
  );

  const supplierMap = useMemo(() => {
    const map = {};
    suppliers.forEach((s) => {
      map[s.id] = s;
    });
    return map;
  }, [suppliers]);

  const groupMap = useMemo(() => {
    const map = {};
    groups.forEach((g) => {
      map[g.id] = g;
    });
    return map;
  }, [groups]);

  const statusOf = useMemo(() => {
    const map = {};
    products.forEach((p) => {
      map[p.id] = inventoryStatus(p);
    });
    return map;
  }, [products]);

  const filtered = useMemo(
    () =>
      products.filter((p) => {
        if (status === "all") return true;
        return statusOf[p.id] === status;
      }),
    [products, status, statusOf]
  );

  const counts = useMemo(() => {
    const active = products.filter((p) => p.is_active).length;
    const low = products.filter((p) => statusOf[p.id] === "low").length;
    const out = products.filter((p) => statusOf[p.id] === "out").length;
    const expired = products.filter((p) => statusOf[p.id] === "expired").length;
    const near = products.filter((p) => {
      const d = daysUntil(p.expiry_date);
      return d != null && d >= 0 && d <= 30;
    }).length;
    return { total: products.length, active, low, out, expired, near };
  }, [products, statusOf]);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard label="Total Medicines" value={counts.total.toLocaleString()} sub="In catalogue" icon={Pill} tone="blue" />
        <StatCard label="Active" value={counts.active.toLocaleString()} sub="Currently sellable" icon={Package} tone="green" />
        <StatCard label="Low Stock" value={counts.low.toLocaleString()} sub="Below reorder level" icon={AlertTriangle} tone="amber" />
        <StatCard label="Out of Stock" value={counts.out.toLocaleString()} sub="Zero quantity" icon={PackageX} tone="red" />
        <StatCard label="Expired / Near" value={(counts.expired + counts.near).toLocaleString()} sub={`${counts.expired} expired · ${counts.near} near`} icon={Clock} tone="violet" />
      </div>

      <Card>
        <CardHeader
          title="Medicine Catalogue"
          subtitle="Search, filter and review stock, pricing and expiry"
          action={
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name, brand or barcode..."
                  className="w-48 sm:w-64 pl-9 pr-3 py-2 text-xs font-normal rounded-lg border border-slate-200 outline-none focus:border-blue-400 bg-white"
                />
              </div>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 bg-white text-slate-700 outline-none cursor-pointer"
              >
                {categoryOptions.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              {isPharmacist && (
                <>
                  <select
                    value={group}
                    onChange={(e) => setGroup(e.target.value)}
                    className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 bg-white text-slate-700 outline-none cursor-pointer"
                  >
                    {groupOptions.map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                  <select
                    value={supplier}
                    onChange={(e) => setSupplier(e.target.value)}
                    className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 bg-white text-slate-700 outline-none cursor-pointer"
                  >
                    {supplierOptions.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </>
              )}
            </div>
          }
        />

        <div className="px-4 sm:px-5 py-3 border-b border-slate-100 flex items-center gap-1.5 overflow-x-auto">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setStatus(f.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                status === f.key
                  ? "bg-blue-600 text-white shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border-b border-red-200 text-xs text-red-700 font-medium">
            <AlertTriangle size={14} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <LoadingState label="Loading medicines..." />
        ) : filtered.length === 0 ? (
          <EmptyState icon={PackageX} title="No medicines found" subtitle="Try adjusting the search, category or stock status." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50/70 border-b border-slate-100 text-[11px] text-slate-400 font-semibold uppercase tracking-wider">
                  <th className="px-4 py-2.5">Medicine</th>
                  <th className="px-3 py-2.5">Category</th>
                  {isPharmacist && <th className="px-3 py-2.5">Group</th>}
                  {isPharmacist && <th className="px-3 py-2.5">Supplier</th>}
                  <th className="px-3 py-2.5 text-right">Price</th>
                  <th className="px-3 py-2.5">Stock Level</th>
                  <th className="px-3 py-2.5 text-right">Reorder Level</th>
                  <th className="px-3 py-2.5">Expiry</th>
                  <th className="px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-xs">
                {filtered.map((p) => {
                  const stock = Number(p.stock_quantity);
                  const reorder = Number(p.reorder_level);
                  const st = statusOf[p.id];
                  const expiryDays = daysUntil(p.expiry_date);
                  return (
                    <tr
                      key={p.id}
                      onClick={isPharmacist ? () => openDetail(p) : undefined}
                      className={`transition-colors ${
                        isPharmacist ? "hover:bg-blue-50/40 cursor-pointer" : "hover:bg-slate-50/60"
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-[13px] text-slate-900 leading-snug">{p.name}</span>
                          {p.is_sensitive && (
                            <span className="text-[11px] font-medium bg-red-100 text-red-600 px-1.5 py-0.5 rounded tracking-wide">RESTRICTED</span>
                          )}
                        </div>
                        <div className="text-[12px] text-slate-400 font-normal mt-0.5">{p.brand || p.barcode}</div>
                      </td>
                      <td className="px-3 py-3 text-slate-500 font-normal whitespace-nowrap">{p.category_name || "—"}</td>
                      {isPharmacist && (
                        <td className="px-3 py-3 text-slate-500 font-normal whitespace-nowrap">
                          {p.group_name || "—"}
                        </td>
                      )}
                      {isPharmacist && (
                        <td className="px-3 py-3 text-slate-500 font-normal whitespace-nowrap">
                          {p.supplier_name || "—"}
                        </td>
                      )}
                      <td className="px-3 py-3 text-right font-semibold text-slate-800 whitespace-nowrap">৳{Number(p.unit_price).toLocaleString()}</td>
                      <td className="px-3 py-3 min-w-[150px]">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-semibold whitespace-nowrap ${st === "out" ? "text-red-600" : st === "low" ? "text-amber-600" : "text-slate-700"}`}>
                            {formatBreakdown(stock, p)}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 font-normal mt-0.5">
                          ≡ {formatEquivalents(stock, p)}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right text-slate-500 font-normal whitespace-nowrap">{reorder.toLocaleString()}</td>
                      <td className="px-3 py-3 text-slate-500 font-normal whitespace-nowrap">
                        {p.expiry_date || "—"}
                        {expiryDays != null && expiryDays >= 0 && expiryDays <= 30 && (
                          <span className="ml-1.5 text-[11px] text-amber-600 font-semibold">({expiryDays}d)</span>
                        )}
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={STATUS_BADGE[st]} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {isPharmacist && detailProduct && (() => {
        const p = detailProduct;
        const stock = Number(p.stock_quantity);
        const reorder = Number(p.reorder_level);
        const st = statusOf[p.id];
        const expiryDays = daysUntil(p.expiry_date);
        const supplierInfo = p.supplier ? supplierMap[p.supplier] : null;
        const groupInfo = p.group ? groupMap[p.group] : null;
        const pack = {
          pcsPerStrip: Number(p.pcs_per_strip) || null,
          stripsPerBox: Number(p.strips_per_box) || null,
          pcsPerBox: Number(p.pcs_per_box) || null,
          stripPrice: p.strip_price == null ? null : Number(p.strip_price),
          boxPrice: p.box_price == null ? null : Number(p.box_price),
        };
        return (
          <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
              <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3 flex-shrink-0">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-semibold text-slate-900">{p.name}</h3>
                    {p.is_sensitive && (
                      <span className="text-[11px] font-medium bg-red-100 text-red-600 px-1.5 py-0.5 rounded tracking-wide">RESTRICTED</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 font-normal mt-1">{p.brand || p.barcode}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setDetailProduct(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 cursor-pointer flex-shrink-0"
                  aria-label="Close"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <DetailTile
                    label="Stock"
                    value={formatBreakdown(stock, p)}
                    sub={`≡ ${formatEquivalents(stock, p)}`}
                  />
                  <DetailTile label="Reorder Level" value={reorder.toLocaleString()} sub={stock <= reorder ? "At or below minimum" : "Above minimum"} />
                  <DetailTile
                    label="Expiry"
                    value={p.expiry_date || "—"}
                    sub={expiryDays != null && expiryDays >= 0 ? `${expiryDays}d remaining` : undefined}
                  />
                  <DetailTile label="Status" value={<StatusBadge status={STATUS_BADGE[st]} />} />
                </div>

                <DetailSection icon={Package} title="Pricing (per unit)">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <DetailTile label="PC" value={`৳${Number(p.unit_price).toLocaleString()}`} />
                    <DetailTile
                      label="Strip"
                      value={pack.stripPrice != null ? `৳${pack.stripPrice.toLocaleString()}` : "—"}
                      sub={pack.pcsPerStrip ? `${pack.pcsPerStrip} PCs / strip` : undefined}
                    />
                    <DetailTile
                      label="Box"
                      value={pack.boxPrice != null ? `৳${pack.boxPrice.toLocaleString()}` : "—"}
                      sub={pack.pcsPerBox ? `${pack.pcsPerBox} PCs / box` : undefined}
                    />
                  </div>
                  {(pack.pcsPerStrip || pack.stripsPerBox) && (
                    <div className="mt-3 text-[11px] text-slate-400 font-normal">
                      Pack: {pack.pcsPerStrip ? `${pack.pcsPerStrip} PCs per strip` : "—"}
                      {pack.stripsPerBox ? ` · ${pack.stripsPerBox} strips per box` : ""}
                      {pack.pcsPerBox ? ` · ${pack.pcsPerBox} PCs per box` : ""}
                    </div>
                  )}
                </DetailSection>

                <DetailSection icon={Building2} title="Supplier Information">
                  <div className="flex flex-col gap-1.5 text-xs text-slate-600 font-normal">
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-400">Supplier</span>
                      <span className="font-medium text-slate-800 text-right">{p.supplier_name || "—"}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-400">Contact Person</span>
                      <span className="font-medium text-slate-800 text-right">{supplierInfo?.contact_person || "—"}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-400">Phone</span>
                      <span className="font-medium text-slate-800 text-right">{supplierInfo?.phone || "—"}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-400">Email</span>
                      <span className="font-medium text-slate-800 text-right">{supplierInfo?.email || "—"}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-400">Address</span>
                      <span className="font-medium text-slate-800 text-right">{supplierInfo?.address || "—"}</span>
                    </div>
                  </div>
                </DetailSection>

                <DetailSection icon={Layers} title="Medicine Group">
                  <div className="flex flex-col gap-1.5 text-xs text-slate-600 font-normal">
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-400">Group</span>
                      <span className="font-medium text-slate-800 text-right">{p.group_name || "—"}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-400">Members</span>
                      <span className="font-medium text-slate-800 text-right">
                        {groupInfo?.product_count != null ? `${groupInfo.product_count} medicine(s)` : "—"}
                      </span>
                    </div>
                    {groupInfo?.description && (
                      <div className="flex justify-between gap-3">
                        <span className="text-slate-400">Description</span>
                        <span className="font-medium text-slate-800 text-right">{groupInfo.description}</span>
                      </div>
                    )}
                  </div>
                </DetailSection>

                <DetailSection icon={Boxes} title="Related Medicines (same group)">
                  {relatedLoading ? (
                    <LoadingState label="Loading related medicines..." />
                  ) : related.length === 0 ? (
                    <div className="text-xs text-slate-400 font-normal">No related medicines or ungrouped.</div>
                  ) : (
                    <div className="flex flex-col divide-y divide-slate-50">
                      {related.map((r) => {
                        const rStock = Number(r.stock_quantity);
                        const rStatus = inventoryStatus(r);
                        return (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => openDetail(r)}
                            className="w-full text-left flex items-center justify-between gap-3 py-2.5 cursor-pointer hover:bg-slate-50/60 rounded-lg px-1 transition-colors"
                          >
                            <div className="min-w-0">
                              <div className="text-xs font-semibold text-slate-800 truncate">{r.name}</div>
                              <div className="text-[11px] text-slate-400 font-normal mt-0.5">
                                {r.supplier_name || r.brand || r.barcode}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-[11px] text-slate-500 font-medium whitespace-nowrap">
                                {formatBreakdownShort(rStock, r)}
                              </span>
                              <StatusBadge status={STATUS_BADGE[rStatus]} />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </DetailSection>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
