"use client";
import { Star } from "lucide-react";
import Link from "next/link";
import { FEATURED } from "@/lib/featured";

/** The built-in night as one row card: a deep link into the composer's result view (`/?featured=<id>`). */
export function FeaturedCard({ className = "" }: { className?: string }) {
  const f = FEATURED[0];
  return (
    <Link
      href={`/?featured=${f.id}`}
      className={`cell cell-tap group-inset w-full max-w-[420px] text-left ${className}`}
      data-leading="tile"
      data-testid="featured-card"
    >
      <span className="tile" style={{ background: "var(--system-gold)" }} aria-hidden>
        <Star size={16} strokeWidth={2} fill="currentColor" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate">{f.title}</span>
        <span className="text-footnote block truncate text-[var(--label-2)]">{f.sub}</span>
      </span>
      <span className="cell-value text-body">Open</span>
    </Link>
  );
}
