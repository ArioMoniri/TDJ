"use client";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import { BookOpenText, Database, Disc3, ListMusic, Settings2 } from "lucide-react";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { spring } from "@/lib/motion";
import { Logo } from "./Logo";

const items = [
  { href: "/", label: "Compose", icon: ListMusic },
  { href: "/library", label: "Library", icon: Disc3 },
  { href: "/database", label: "Database", icon: Database },
  { href: "/guide", label: "Guide", icon: BookOpenText },
  { href: "/settings", label: "Settings", icon: Settings2 },
];

/** iOS-style tab: one shared pill slides between tabs; icon weight cross-fades; a glow plays once when the pill lands. */
function MobileTab({ it, on }: { it: (typeof items)[number]; on: boolean }) {
  const reduced = useReducedMotion();
  const [landed, setLanded] = useState(false);
  return (
    <Link
      href={it.href}
      aria-current={on ? "page" : undefined}
      className={`relative flex min-h-12 min-w-[60px] flex-col items-center justify-center gap-0.5 rounded-full px-3 text-xs ${on ? "font-semibold" : "text-muted"}`}
      style={{ transition: "color var(--dur-xs) var(--ease-settle)" }}
    >
      {on && (
        <motion.span
          layoutId="tab-pill"
          className="absolute inset-0 rounded-full bg-[rgb(var(--text)/.08)]"
          transition={spring.thumb}
          onLayoutAnimationComplete={() => setLanded(true)}
          aria-hidden
        />
      )}
      {on && landed && !reduced && (
        <span className="pointer-events-none absolute left-1/2 top-1 h-10 w-10 -translate-x-1/2" aria-hidden>
          <DotLottieReact
            src="/anim/tab-glow.json"
            autoplay
            loop={false}
            onComplete={() => setLanded(false)}
            style={{ width: "100%", height: "100%" }}
          />
        </span>
      )}
      <span className="relative grid h-5 w-5 place-items-center">
        {/* two stacked weights, cross-faded: stroke-width is not animatable via CSS on SVG in all engines */}
        <it.icon
          size={20}
          strokeWidth={1.8}
          className="col-start-1 row-start-1"
          style={{ opacity: on ? 0 : 1, transition: "opacity var(--dur-xs)" }}
          aria-hidden
        />
        <it.icon
          size={20}
          strokeWidth={2.4}
          className="col-start-1 row-start-1"
          style={{ opacity: on ? 1 : 0, transition: "opacity var(--dur-xs)" }}
          aria-hidden
        />
      </span>
      <span className="relative">{it.label}</span>
    </Link>
  );
}

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
            <LayoutGroup id="desktop-nav">
              {items.map((it) => {
                const on = path === it.href;
                return (
                  <Link
                    key={it.href}
                    href={it.href}
                    aria-current={on ? "page" : undefined}
                    className={`chip nav-chip relative isolate ${on ? "chip-on" : ""}`}
                    style={{ transition: "color var(--dur-xs) var(--ease-settle) 60ms" }}
                  >
                    {on && (
                      <motion.span
                        layoutId="nav-pill"
                        transition={spring.thumb}
                        className="absolute inset-0 -z-10 rounded-full bg-[rgb(var(--text)/.9)]"
                        aria-hidden
                      />
                    )}
                    <it.icon size={15} /> {it.label}
                  </Link>
                );
              })}
            </LayoutGroup>
          </nav>
        </div>
      </header>
      {/* Mobile tab bar */}
      <LayoutGroup id="mobile-nav">
        <nav
          className="glass fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 flex items-center justify-around p-1 sm:hidden"
          aria-label="Primary mobile"
        >
          {items.map((it) => (
            <MobileTab key={it.href} it={it} on={path === it.href} />
          ))}
        </nav>
      </LayoutGroup>
    </>
  );
}
