import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Search,
  Building2,
  Plus,
  X,
  Pencil,
  Trash2,
  AlertTriangle,
  Pill,
  Phone,
  MessageCircle,
  Receipt,
  History,
} from "lucide-react";
import {
  fetchSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  fetchSupplierProducts,
  fetchSupplierSummary,
  fetchSupplierPurchases,
  fetchProducts,
  updateProductSupplier,
} from "../../services/medicine";
import { ROLES } from "../../services/auth";
import { ApiError } from "../../services/api";
import {
  Card,
  CardHeader,
  StatCard,
  StatusBadge,
  LoadingState,
  EmptyState,
} from "../../components/ui/Blocks";

const EMPTY_FORM = {
  name: "",
  company: "",
  contact_person: "",
  phone: "",
  is_active: true,
};

/** WhatsApp is not a schema column — derive wa.me link from `phone`. */
function whatsappLink(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}` : null;
}

function toForm(supplier) {
  return {
    name: supplier?.name || "",
    company: supplier?.company || "",
    contact_person: supplier?.contact_person || "",
    phone: supplier?.phone || "",
    is_active:
      supplier?.is_active === undefined ? true : Boolean(supplier.is_active),
  };
}

export default function SuppliersPage({ role = ROLES.ADMIN } = {}) {
  const isAdmin = role === ROLES.ADMIN;
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [detailProducts, setDetailProducts] = useState([]);
  const [detailSummary, setDetailSummary] = useState(null);
  const [detailPurchases, setDetailPurchases] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [assignId, setAssignId] = useState("");
  const [assigning, setAssigning] = useState(false);

  const load = useCallback(async (q = "", status = "all") => {
    setLoading(true);
    setError("");
    try {
      const params = {};
      if (q) params.search = q;
      if (status === "active") params.is_active = "true";
      if (status === "inactive") params.is_active = "false";
      const [supplierList, productList] = await Promise.all([
        fetchSuppliers(params),
        fetchProducts({}),
      ]);
      setSuppliers(supplierList || []);
      setProducts(productList || []);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Unable to load suppliers."
      );
      setSuppliers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(search, statusFilter), 350);
    return () => clearTimeout(t);
  }, [search, statusFilter, load]);

  const productCountBySupplier = useMemo(() => {
    const map = {};
    (products || []).forEach((p) => {
      if (p.supplier != null) map[p.supplier] = (map[p.supplier] || 0) + 1;
    });
    return map;
  }, [products]);

  const stats = useMemo(() => {
    const active = suppliers.filter((s) => s.is_active).length;
    const linked = suppliers.filter(
      (s) => (productCountBySupplier[s.id] || 0) > 0
    ).length;
    return {
      total: suppliers.length,
      active,
      inactive: suppliers.length - active,
      linked,
    };
  }, [suppliers, productCountBySupplier]);

  const detailSupplier =
    suppliers.find((s) => Number(s.id) === Number(detailId)) || null;

  const loadDetail = useCallback(async (id) => {
    setDetailLoading(true);
    setDetailError("");
    try {
      const [items, summary, purchases] = await Promise.all([
        fetchSupplierProducts(id),
        fetchSupplierSummary(id),
        fetchSupplierPurchases(id),
      ]);
      setDetailProducts(items || []);
      setDetailSummary(summary || null);
      setDetailPurchases(purchases || []);
    } catch (err) {
      setDetailError(
        err instanceof ApiError
          ? err.message
          : "Unable to load supplier details."
      );
      setDetailProducts([]);
      setDetailSummary(null);
      setDetailPurchases([]);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (detailId) {
      setAssignId("");
      loadDetail(detailId);
    } else {
      setDetailProducts([]);
      setDetailSummary(null);
      setDetailPurchases([]);
    }
  }, [detailId, loadDetail]);

  function openAdd() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setModalOpen(true);
  }

  function openEdit(supplier) {
    setEditing(supplier);
    setForm(toForm(supplier));
    setFormError("");
    setModalOpen(true);
  }

  async function submitForm() {
    if (!form.name.trim()) {
      setFormError("Supplier / company name is required.");
      return;
    }
    setSaving(true);
    setFormError("");
    // NOTE: no `whatsapp_number` column exists on inventory_supplier.
    // WhatsApp contact reuses `phone` via a wa.me link.
    const payload = {
      name: form.name.trim(),
      company: form.company,
      contact_person: form.contact_person,
      phone: form.phone,
      is_active: form.is_active,
    };
    try {
      if (editing) {
        await updateSupplier(editing.id, payload);
      } else {
        await createSupplier(payload);
      }
      setModalOpen(false);
      await load(search, statusFilter);
      if (detailId) await loadDetail(detailId);
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : "Could not save supplier."
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(supplier) {
    try {
      await updateSupplier(supplier.id, { is_active: !supplier.is_active });
      await load(search, statusFilter);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not update status."
      );
    }
  }

  async function removeSupplier(supplier) {
    if (
      !window.confirm(
        `Delete supplier "${supplier.name}"? Suppliers with purchases are protected — deactivate instead.`
      )
    )
      return;
    try {
      await deleteSupplier(supplier.id);
      if (Number(detailId) === Number(supplier.id)) setDetailId(null);
      await load(search, statusFilter);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `${err.message} — deactivate the supplier instead of deleting.`
          : "Could not delete supplier."
      );
    }
  }

  async function assignMedicine() {
    if (!assignId || !detailSupplier) return;
    setAssigning(true);
    setDetailError("");
    try {
      await updateProductSupplier(Number(assignId), Number(detailSupplier.id));
      setAssignId("");
      await Promise.all([loadDetail(detailSupplier.id), load(search, statusFilter)]);
    } catch (err) {
      setDetailError(
        err instanceof ApiError ? err.message : "Could not assign medicine."
      );
    } finally {
      setAssigning(false);
    }
  }

  async function unassignMedicine(product) {
    try {
      await updateProductSupplier(product.id, null);
      await Promise.all([loadDetail(detailSupplier.id), load(search, statusFilter)]);
    } catch (err) {
      setDetailError(
        err instanceof ApiError ? err.message : "Could not unassign medicine."
      );
    }
  }

  const assignable = useMemo(
    () =>
      (products || []).filter(
        (p) => Number(p.supplier) !== Number(detailId)
      ),
    [products, detailId]
  );

  /** Per-medicine price history derived from received purchase records. */
  const priceHistory = useMemo(() => {
    const map = {};
    (detailPurchases || []).forEach((p) => {
      (p.items || []).forEach((it) => {
        const key = it.product;
        if (!map[key]) {
          map[key] = {
            product: key,
            name: it.product_name || `Product #${key}`,
            entries: [],
          };
        }
        map[key].entries.push({
          date: p.purchase_date || "",
          invoice: p.invoice_number || "—",
          price: Number(it.unit_price || 0),
          quantity: Number(it.quantity || 0),
        });
      });
    });
    return Object.values(map)
      .map((g) => ({
        ...g,
        entries: g.entries.sort((a, b) => (a.date < b.date ? 1 : -1)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [detailPurchases]);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <StatCard label="Suppliers" value={stats.total.toLocaleString()} sub="Company records" icon={Building2} tone="blue" />
        <StatCard label="Active" value={stats.active.toLocaleString()} sub="Available for ordering" icon={Building2} tone="green" />
        <StatCard label="Inactive" value={stats.inactive.toLocaleString()} sub="Deactivated records" icon={Building2} tone="slate" />
        <StatCard label="With Medicines" value={stats.linked.toLocaleString()} sub="Have linked products" icon={Pill} tone="violet" />
      </div>

      <Card>
        <CardHeader
          title="Suppliers"
          subtitle="Staff-only company directory — contact details are never shown to customers"
          action={
            isAdmin ? (
              <button
                onClick={openAdd}
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-[#2563EB] text-white text-xs font-medium hover:bg-[#1d4ed8] transition-colors cursor-pointer"
              >
                <Plus size={14} />
                Add Supplier
              </button>
            ) : null
          }
        />

        <div className="px-5 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or phone..."
              className="w-44 sm:w-60 pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 outline-none focus:border-blue-400 bg-white"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 bg-white text-slate-700 outline-none cursor-pointer"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        {error && (
          <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border-b border-red-200 text-xs text-red-700 font-medium">
            <AlertTriangle size={13} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <LoadingState label="Loading suppliers..." />
        ) : suppliers.length === 0 ? (
          <EmptyState icon={Building2} title="No suppliers found" subtitle="Add a supplier company to start linking medicines." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50/70 border-b border-slate-100 text-[11px] text-slate-400 font-semibold uppercase tracking-wider">
                  <th className="px-4 py-2.5">Company</th>
                  <th className="px-3 py-2.5">Contact Person</th>
                  <th className="px-3 py-2.5">Phone / WhatsApp</th>
                  <th className="px-3 py-2.5 text-center">Medicines</th>
                  <th className="px-3 py-2.5">Status</th>
                  {isAdmin && <th className="px-4 py-2.5 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-xs">
                {suppliers.map((s) => {
                  const wa = whatsappLink(s.phone);
                  return (
                    <tr
                      key={s.id}
                      onClick={() => setDetailId(s.id)}
                      className="hover:bg-slate-50/60 transition-colors cursor-pointer"
                    >
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-800">{s.name}</div>
                        {s.email && (
                          <div className="text-[11px] text-slate-400">{s.email}</div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-slate-600">{s.contact_person || "—"}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2 text-slate-600">
                          <span>{s.phone || "—"}</span>
                          {wa && (
                            <a
                              href={wa}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              title="Chat on WhatsApp (uses phone number)"
                              className="inline-flex items-center gap-1 text-emerald-600 hover:text-emerald-700 font-medium"
                            >
                              <MessageCircle size={13} />
                              WhatsApp
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center text-slate-600">
                        {productCountBySupplier[s.id] || 0}
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge status={s.is_active ? "Active" : "Inactive"} />
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openEdit(s);
                            }}
                            className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-blue-600 mr-3 cursor-pointer"
                          >
                            <Pencil size={13} /> Edit
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleActive(s);
                            }}
                            className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-amber-600 mr-3 cursor-pointer"
                          >
                            {s.is_active ? "Deactivate" : "Activate"}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeSupplier(s);
                            }}
                            className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-red-600 cursor-pointer"
                          >
                            <Trash2 size={13} /> Delete
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setModalOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-[560px] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-semibold text-slate-800 text-sm">
                {editing ? "Edit Supplier" : "Add Supplier"}
              </h3>
              <button onClick={() => setModalOpen(false)} className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer">
                <X size={15} />
              </button>
            </div>
            <div className="p-6 flex flex-col gap-3">
              {formError && (
                <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
                  <AlertTriangle size={13} className="shrink-0" />
                  <span>{formError}</span>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Company / supplier name *</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. MediSource Ltd." className="w-full h-9 px-3 rounded-lg border border-slate-200 text-xs outline-none focus:border-blue-600" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Pharmacy / company they work for</label>
                <input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="e.g. Square Pharmaceuticals Ltd." className="w-full h-9 px-3 rounded-lg border border-slate-200 text-xs outline-none focus:border-blue-600" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Contact person</label>
                  <input value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} placeholder="e.g. Rahim Uddin" className="w-full h-9 px-3 rounded-lg border border-slate-200 text-xs outline-none focus:border-blue-600" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Phone</label>
                  <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="e.g. 01711-234567" className="w-full h-9 px-3 rounded-lg border border-slate-200 text-xs outline-none focus:border-blue-600" />
                </div>
              </div>
              <div className="px-3 py-2 rounded-lg bg-emerald-50/60 border border-emerald-100 text-[11px] text-emerald-700 flex items-center gap-1.5">
                <MessageCircle size={12} className="shrink-0" />
                <span>WhatsApp uses the phone number above (no separate WhatsApp column exists in the supplier table) — a chat link appears automatically once a phone is saved.</span>
              </div>
              <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="w-4 h-4 accent-blue-600" />
                Active supplier
              </label>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2 bg-slate-50/50">
              <button onClick={() => setModalOpen(false)} className="h-9 px-4 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-100 cursor-pointer">Cancel</button>
              <button onClick={submitForm} disabled={saving} className="h-9 px-4 rounded-lg bg-[#2563EB] text-white text-xs font-medium hover:bg-[#1d4ed8] disabled:opacity-60 cursor-pointer">
                {saving ? "Saving..." : editing ? "Save Changes" : "Add Supplier"}
              </button>
            </div>
          </div>
        </div>
      )}

      {detailSupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setDetailId(null)}>
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-[640px] max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white">
              <div className="flex items-center gap-2.5">
                <h3 className="font-semibold text-slate-800 text-sm">{detailSupplier.name}</h3>
                <StatusBadge status={detailSupplier.is_active ? "Active" : "Inactive"} />
              </div>
              <button onClick={() => setDetailId(null)} className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer">
                <X size={15} />
              </button>
            </div>
            <div className="p-6 flex flex-col gap-4">
              <div className="rounded-xl border border-slate-100 overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-50/70 border-b border-slate-100 flex items-center gap-2">
                  <Building2 size={14} className="text-slate-400" />
                  <span className="text-xs font-semibold text-slate-700">Contact (staff-only)</span>
                </div>
                <div className="px-4 py-3 text-xs text-slate-600 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="sm:col-span-2"><span className="text-slate-400">Pharmacy / company they work for: </span><span className="font-medium text-slate-700">{detailSupplier.company || "—"}</span></div>
                  <div><span className="text-slate-400">Contact person: </span>{detailSupplier.contact_person || "—"}</div>
                  <div className="flex items-center gap-2">
                    <Phone size={12} className="text-slate-400" />
                    <span>{detailSupplier.phone || "—"}</span>
                    {whatsappLink(detailSupplier.phone) && (
                      <a href={whatsappLink(detailSupplier.phone)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-emerald-600 hover:text-emerald-700 font-medium">
                        <MessageCircle size={12} /> WhatsApp
                      </a>
                    )}
                  </div>
                  <div><span className="text-slate-400">Email: </span>{detailSupplier.email || "—"}</div>
                  <div><span className="text-slate-400">Address: </span>{detailSupplier.address || "—"}</div>
                  {detailSummary && (
                    <div className="sm:col-span-2 text-[11px] text-slate-400">
                      {detailSummary.purchase_count || 0} purchases · {detailSummary.total_quantity_purchased || 0} units · {detailSummary.product_count || 0} linked medicines
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-slate-100 overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-50/70 border-b border-slate-100 flex items-center gap-2">
                  <Pill size={14} className="text-slate-400" />
                  <span className="text-xs font-semibold text-slate-700">Medicines supplied</span>
                </div>
                {detailLoading ? (
                  <LoadingState label="Loading medicines..." />
                ) : detailError ? (
                  <div className="px-4 py-3 text-xs text-red-700 bg-red-50">{detailError}</div>
                ) : detailProducts.length === 0 ? (
                  <div className="px-4 py-6 text-center text-xs text-slate-400">No medicines linked to this supplier yet.</div>
                ) : (
                  <div className="divide-y divide-slate-50">
                    {detailProducts.map((p) => (
                      <div key={p.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                        <div>
                          <div className="text-xs font-medium text-slate-700">{p.name}</div>
                          <div className="text-[11px] text-slate-400">{p.barcode} · stock {p.stock_quantity}</div>
                        </div>
                        {isAdmin && (
                          <button onClick={() => unassignMedicine(p)} className="text-[11px] font-medium text-slate-400 hover:text-red-600 cursor-pointer">
                            Unassign
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {isAdmin && (
                <div className="flex items-center gap-2">
                  <select value={assignId} onChange={(e) => setAssignId(e.target.value)} className="flex-1 h-9 px-3 rounded-lg border border-slate-200 text-xs bg-white outline-none focus:border-blue-600 cursor-pointer">
                    <option value="">Assign a medicine to this supplier...</option>
                    {assignable.map((p) => (
                      <option key={p.id} value={String(p.id)}>
                        {p.name} ({p.barcode})
                      </option>
                    ))}
                  </select>
                  <button onClick={assignMedicine} disabled={!assignId || assigning} className="h-9 px-4 rounded-lg bg-[#2563EB] text-white text-xs font-medium hover:bg-[#1d4ed8] disabled:opacity-60 cursor-pointer">
                    {assigning ? "Assigning..." : "Assign"}
                  </button>
                </div>
              )}

              <div className="rounded-xl border border-slate-100 overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-50/70 border-b border-slate-100 flex items-center gap-2">
                  <Receipt size={14} className="text-slate-400" />
                  <span className="text-xs font-semibold text-slate-700">Order history (received purchases)</span>
                </div>
                {detailLoading ? (
                  <LoadingState label="Loading history..." />
                ) : detailPurchases.length === 0 ? (
                  <div className="px-4 py-6 text-center text-xs text-slate-400">No received purchases recorded for this supplier yet.</div>
                ) : (
                  <div className="divide-y divide-slate-50">
                    {detailPurchases.map((p) => (
                      <div key={p.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                        <div>
                          <div className="text-xs font-medium text-slate-700 font-mono">{p.invoice_number}</div>
                          <div className="text-[11px] text-slate-400 font-normal">
                            {(p.purchase_date || "").slice(0, 10)} · {(p.items || []).length} line(s)
                          </div>
                        </div>
                        <span className="text-xs font-semibold text-slate-800 whitespace-nowrap">
                          ৳{Number(p.payable_amount || 0).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-slate-100 overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-50/70 border-b border-slate-100 flex items-center gap-2">
                  <History size={14} className="text-slate-400" />
                  <span className="text-xs font-semibold text-slate-700">Supplier price history</span>
                </div>
                {detailLoading ? (
                  <LoadingState label="Loading prices..." />
                ) : priceHistory.length === 0 ? (
                  <div className="px-4 py-6 text-center text-xs text-slate-400">No supplier prices recorded yet — prices appear after the first received purchase.</div>
                ) : (
                  <div className="divide-y divide-slate-50">
                    {priceHistory.map((g) => (
                      <div key={g.product} className="px-4 py-2.5">
                        <div className="text-xs font-medium text-slate-700">{g.name}</div>
                        <div className="mt-1 flex flex-col gap-1">
                          {g.entries.map((e, i) => (
                            <div key={`${e.invoice}-${i}`} className="flex items-center justify-between gap-3 text-[11px] font-normal">
                              <span className="text-slate-400">
                                {(e.date || "").slice(0, 10)} · <span className="font-mono">{e.invoice}</span> · {e.quantity} pc
                              </span>
                              <span className={i === 0 ? "font-semibold text-slate-800" : "text-slate-500"}>
                                ৳{e.price.toLocaleString()}{i === 0 ? " (latest)" : ""}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <p className="text-[11px] text-slate-400">
                One medicine links to one supplier (single `supplier` FK). Multiple-supplier / preferred-supplier mapping is not supported by the current schema.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
