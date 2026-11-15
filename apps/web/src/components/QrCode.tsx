"use client";
import { useMemo } from "react";
import { qrMatrix, qrPath } from "@/lib/qr";

/** A QR code drawn as one SVG path, dark on white whatever the theme (cameras read that best). */
export function QrCode({ value, size = 220, label }: { value: string; size?: number; label: string }) {
  const m = useMemo(() => {
    try {
      return qrMatrix(value, "M");
    } catch {
      return null;
    }
  }, [value]);
  if (!m) return null;
  const n = m.length + 8;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${n} ${n}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
      className="rounded-[12px]"
      data-testid="qr-code"
      data-modules={m.length}
    >
      <rect width={n} height={n} fill="#fff" />
      <path d={qrPath(m)} fill="#000" />
    </svg>
  );
}
