"use client";
import { Star } from "lucide-react";
import Link from "next/link";
import { FEATURED } from "@/lib/featured";
import { t as tx } from "@/lib/i18n";
import { useTip } from "./ui/Tip";

/** The built-in night as one row card (a definite width: inside a shrink-to-fit empty state its truncated text
 * used to size it, 8 px past an iPhone's edge, wave 2): a deep link into the composer's result view (`/?featured=<id>`). */
export function FeaturedCard({ className = "" }: { className?: string }) {
  const f = FEATURED[0];
  const t = useTip<HTMLAnchorElement>(tx("featuredCard.open_a_night_a_dj_built"));
  return (
    <Link
      {...t.props}
      href={`/?featured=${f.id}`}
      className={`cell cell-tap group-inset w-[min(420px,calc(100vw-2rem))] max-w-full text-left ${className}`}
      data-leading="tile"
      data-testid="featured-card"
    >
      {t.tag}
      <span className="tile" style={{ background: "var(--system-gold)" }} aria-hidden>
        <Star size={16} strokeWidth={2} fill="currentColor" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate">{f.title}</span>
        <span className="text-footnote block truncate text-[var(--label-2)]">{f.sub}</span>
      </span>
      <span className="cell-value text-body">{tx("featuredCard.open")}</span>
    </Link>
  );
}
