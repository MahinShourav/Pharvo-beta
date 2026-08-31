import React from "react";
import { X } from "lucide-react";
import { C, SP, SZ, TX, R, TIER } from "../../utils/ds";

const initials = (name) =>
  name ? name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() : "CU";

export function Initials({ name, size = 40, bg = C.blueMid, color = C.blue }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: bg,
        color,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: TX.semi,
        fontSize: TX.sm,
        flexShrink: 0,
      }}
    >
      {initials(name)}
    </div>
  );
}

export function TierBadge({ tier }) {
  const key = tier || "Non-member";
  const meta = TIER[key] || TIER["Non-member"];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        borderRadius: R.sm,
        fontSize: TX.xs,
        fontWeight: TX.semi,
        color: meta.color,
        background: meta.bg,
        border: `1px solid ${meta.border}`,
        whiteSpace: "nowrap",
      }}
    >
      <span aria-hidden>{meta.icon}</span>
      <span>{key}</span>
    </span>
  );
}

export function PageHeader({ title, subtitle, right }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: SP[3] }}>
      <div>
        <h1 style={{ margin: 0, fontSize: TX.xxl, fontWeight: TX.bold, color: C.gray900 }}>
          {title}
        </h1>
        {subtitle && (
          <p style={{ margin: `${SP[1]}px 0 0`, fontSize: TX.base, color: C.subtle }}>{subtitle}</p>
        )}
      </div>
      {right && <div style={{ display: "flex", gap: SP[2], flexShrink: 0 }}>{right}</div>}
    </div>
  );
}

export function StatGrid({ children }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
        gap: SP[3],
      }}
    >
      {children}
    </div>
  );
}

export function StatCard({ label, value, icon: Icon, iconBg = C.blueMid, iconColor = C.blue }) {
  return (
    <div
      style={{
        background: C.cardBg,
        border: `1px solid ${C.border}`,
        borderRadius: R.lg,
        padding: `${SP[3]}px ${SP[3]}px`,
      }}
    >
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: R.sm,
          background: iconBg,
          color: iconColor,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {Icon ? <Icon size={SZ.iconSm} /> : null}
      </div>
      <div style={{ fontSize: TX.xl, fontWeight: TX.bold, color: C.gray900, marginTop: SP[2] }}>{value}</div>
      <div style={{ fontSize: TX.sm, color: C.subtle, marginTop: 2 }}>{label}</div>
    </div>
  );
}

export function SearchBar({ value, onChange, placeholder }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: "100%",
        padding: `${SP[2]}px ${SP[3]}px`,
        fontSize: TX.base,
        color: C.gray900,
        background: C.cardBg,
        border: `1px solid ${C.border}`,
        borderRadius: R.md,
        outline: "none",
      }}
    />
  );
}

export function PrimaryBtn({ children, onClick, style, icon: Icon, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        height: SZ.btnMdH,
        padding: `0 ${SP[3]}px`,
        display: "inline-flex",
        alignItems: "center",
        gap: SP[2],
        background: C.blue,
        color: "#fff",
        border: "none",
        borderRadius: R.md,
        fontSize: TX.base,
        fontWeight: TX.semi,
        cursor: "pointer",
        ...style,
      }}
    >
      {Icon ? <Icon size={SZ.iconSm} /> : null}
      {children}
    </button>
  );
}

export function OutlineBtn({ children, onClick, style, icon: Icon, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        height: SZ.btnMdH,
        padding: `0 ${SP[3]}px`,
        display: "inline-flex",
        alignItems: "center",
        gap: SP[2],
        background: "transparent",
        color: C.gray700,
        border: `1px solid ${C.border}`,
        borderRadius: R.md,
        fontSize: TX.base,
        fontWeight: TX.medium,
        cursor: "pointer",
        ...style,
      }}
    >
      {Icon ? <Icon size={SZ.iconSm} /> : null}
      {children}
    </button>
  );
}

export function ItemCardList({ children }) {
  return <div style={{ display: "flex", flexDirection: "column", gap: SP[2] }}>{children}</div>;
}

export function InfoGrid({ children }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
        gap: `${SP[3]}px ${SP[3]}px`,
      }}
    >
      {children}
    </div>
  );
}

export function InfoRow({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: TX.xs, fontWeight: TX.semi, textTransform: "uppercase", letterSpacing: 0.04, color: C.subtle }}>
        {label}
      </div>
      <div style={{ fontSize: TX.base, color: C.gray900, marginTop: 2 }}>{value || "—"}</div>
    </div>
  );
}

export function FormField({ label, required, children }) {
  return (
    <div>
      <div style={{ fontSize: TX.base, fontWeight: TX.medium, color: C.gray700, marginBottom: SP[2] }}>
        {label}
        {required && <span style={{ color: C.red }}> *</span>}
      </div>
      {children}
    </div>
  );
}

const inputStyle = {
  width: "100%",
  padding: `${SP[2]}px ${SP[3]}px`,
  fontSize: TX.base,
  color: C.gray900,
  background: C.cardBg,
  border: `1px solid ${C.border}`,
  borderRadius: R.md,
  outline: "none",
};

export function TextInput(props) {
  return <input {...props} style={{ ...inputStyle, ...props.style }} />;
}

export function SelectInput(props) {
  return <select {...props} style={{ ...inputStyle, ...props.style }} />;
}

export function BottomSheet({ title, onClose, footer, children }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        background: "rgba(15, 23, 42, 0.45)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 520,
          background: C.cardBg,
          borderRadius: `${R.xl}px ${R.xl}px 0 0`,
          maxHeight: "92vh",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: `${SP[3]}px ${SP[4]}px`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderBottom: `1px solid ${C.border}`,
          }}
        >
          <h3 style={{ margin: 0, fontSize: TX.md, fontWeight: TX.semi, color: C.gray900 }}>{title}</h3>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: C.subtle }}
            aria-label="Close"
          >
            <X size={SZ.iconMd} />
          </button>
        </div>
        <div style={{ padding: `${SP[4]}px`, display: "flex", flexDirection: "column", gap: SP[3] }}>
          {children}
        </div>
        {footer && (
          <div
            style={{
              padding: `${SP[3]}px ${SP[4]}px`,
              borderTop: `1px solid ${C.border}`,
              display: "flex",
              justifyContent: "flex-end",
              gap: SP[2],
              background: C.gray100,
              borderRadius: `0 0 ${R.xl}px ${R.xl}px`,
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function ModalActions({ onCancel, onSubmit, submitLabel, cancelLabel = "Cancel", submitting = false }) {
  return (
    <>
      <OutlineBtn onClick={onCancel}>{cancelLabel}</OutlineBtn>
      <PrimaryBtn onClick={onSubmit} disabled={submitting}>
        {submitting ? "Saving..." : submitLabel}
      </PrimaryBtn>
    </>
  );
}