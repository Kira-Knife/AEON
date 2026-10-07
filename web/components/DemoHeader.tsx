"use client";

import Image from "next/image";
import Link from "next/link";

export function DemoHeader() {
  return (
    <header style={{
      background: "#ffffff",
      borderBottom: "1px solid var(--border)",
      padding: "0 24px",
      height: 52,
      display: "flex",
      alignItems: "center",
      gap: 12,
      boxShadow: "0 1px 3px rgba(15,17,23,0.06)",
    }}>
      {/* Logo + name */}
      <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
        <Image
          src="/logo-credit-card.png"
          alt="AEON"
          width={28}
          height={28}
          style={{ objectFit: "contain" }}
        />
        <span style={{
          fontSize: 16,
          fontWeight: 700,
          color: "var(--text-primary)",
          letterSpacing: "-0.02em",
        }}>
          AEON
        </span>
      </Link>

      {/* Divider */}
      <div style={{ width: 1, height: 20, background: "var(--border)" }} />

      {/* Subtitle */}
      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
        Capital-in-the-Loop
      </span>

      <div style={{ flex: 1 }} />

      {/* Network badge */}
      <span style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        padding: "4px 10px", borderRadius: 9999,
        fontSize: 11, fontWeight: 600,
        background: "var(--blue-dim)",
        color: "var(--blue)",
        border: "1px solid var(--blue-mid)",
      }}>
        <span style={{
          width: 5, height: 5, borderRadius: "50%",
          background: "var(--blue)", display: "inline-block",
        }} />
        Base Sepolia
      </span>
    </header>
  );
}
