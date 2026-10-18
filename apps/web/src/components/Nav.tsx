"use client";
import { BookOpenText, Disc3, Settings2, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./Logo";

const items = [
  { href: "/", label: "Compose", icon: Sparkles },
  { href: "/library", label: "Library", icon: Disc3 },
  { href: "/guide", label: "Guide", icon: BookOpenText },
  { href: "/settings", label: "Settings", icon: Settings2 },
];

export function Nav() {
  const path = usePathname();
  return (
    <>
      <header className="sticky top-0 z-40 px-3 pt-3 sm:px-6">
        <div className="glass glass-pill mx-auto flex max-w-6xl items-center justify-between px-3 py-2 sm:px-5">
          <Link href="/" className="flex items-center gap-2.5" aria-label="TDJ home">
            <Logo size={30} />
            <span className="font-semibold tracking-tight">TDJ</span>
            <span className="text-muted hidden text-xs sm:inline">tango dj composer</span>
          </Link>
          <nav className="hidden items-center gap-1 sm:flex" aria-label="Primary">
            {items.map((it) => (
              <Link key={it.href} href={it.href} className={`chip ${path === it.href ? "chip-on" : ""}`}>
                <it.icon size={15} /> {it.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      {/* Mobile tab bar */}
      <nav
        className="glass glass-strong safe-b fixed inset-x-3 bottom-3 z-40 flex items-center justify-around px-1 pt-1 sm:hidden"
        aria-label="Primary mobile"
      >
        {items.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            className={`flex min-w-16 flex-col items-center gap-0.5 rounded-2xl px-2 py-1.5 text-[11px] ${path === it.href ? "font-semibold" : "text-muted"}`}
            aria-current={path === it.href ? "page" : undefined}
          >
            <it.icon size={20} strokeWidth={path === it.href ? 2.4 : 1.8} />
            {it.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
