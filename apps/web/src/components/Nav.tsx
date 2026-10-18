"use client";
import { BookOpenText, Database, Disc3, ListMusic, Settings2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./Logo";

const items = [
  { href: "/", label: "Compose", icon: ListMusic },
  { href: "/library", label: "Library", icon: Disc3 },
  { href: "/database", label: "Database", icon: Database },
  { href: "/guide", label: "Guide", icon: BookOpenText },
  { href: "/settings", label: "Settings", icon: Settings2 },
];

export function Nav() {
  const path = usePathname();
  return (
    <>
      {/* Desktop header pill (glass control layer). Hidden on phones: the tab bar carries navigation there. */}
      <header className="sticky top-0 z-40 hidden px-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:block sm:px-6">
        <div className="glass glass-pill mx-auto flex max-w-6xl items-center justify-between px-3 py-2 sm:px-5">
          <Link href="/" className="flex items-center gap-2.5" aria-label="TDJ home">
            <Logo size={30} />
            <span className="font-semibold tracking-tight">TDJ</span>
            <span className="text-muted hidden text-xs md:inline">Tango DJ composer</span>
          </Link>
          <nav className="flex items-center gap-1" aria-label="Primary">
            {items.map((it) => (
              <Link
                key={it.href}
                href={it.href}
                aria-current={path === it.href ? "page" : undefined}
                className={`chip ${path === it.href ? "chip-on" : ""}`}
              >
                <it.icon size={15} /> {it.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      {/* Mobile tab bar */}
      <nav
        className="glass fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 flex items-center justify-around p-1 sm:hidden"
        aria-label="Primary mobile"
      >
        {items.map((it) => {
          const on = path === it.href;
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`flex min-h-12 min-w-[60px] flex-col items-center justify-center gap-0.5 rounded-full px-3 text-xs ${on ? "bg-[rgb(var(--text)/.08)] font-semibold" : "text-muted"}`}
              aria-current={on ? "page" : undefined}
            >
              <it.icon size={20} strokeWidth={on ? 2.4 : 1.8} />
              {it.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
