"use client";
import "./guide.css";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { GUIDE_CHAPTERS, type GuideChapter } from "@/lib/guide";
import { EraLegend } from "../ui/EraBadge";
import { GuideLottie } from "./GuideLottie";
import { Illustration } from "./Illustrations";

function Art({ chapter }: { chapter: GuideChapter }) {
  const a = chapter.art;
  if (a.kind === "lottie") return <GuideLottie src={a.src} still={a.still} />;
  if (a.kind === "illustration") return <Illustration id={a.id} />;
  // the era badges themselves, live: Compose's chips and the Booth's four bars
  return (
    <div className="flex w-full flex-col items-center gap-3" data-testid="guide-era">
      <EraLegend className="justify-center" />
      <EraLegend look="bars" brief className="w-full max-w-[180px]" />
    </div>
  );
}

/** a chapter rises in as it scrolls into view (guide.css: CSS only, so it renders the same on the server and stays put
 * under reduced motion) */
function Chapter({ chapter }: { chapter: GuideChapter }) {
  return (
    <section
      id={`tour-${chapter.id}`}
      className="group-inset guide-chapter mt-4 scroll-mt-24"
      data-testid={`tour-${chapter.id}`}
      aria-labelledby={`tour-${chapter.id}-title`}
    >
      <div className="guide-art">
        <Art chapter={chapter} />
      </div>
      <div className="flex min-w-0 flex-col gap-2 p-4">
        <p className="text-caption1 font-semibold uppercase tracking-wide text-[var(--tint)]">
          {chapter.eyebrow}
        </p>
        <h3 id={`tour-${chapter.id}-title`} className="text-title3">
          {chapter.title}
        </h3>
        <p className="text-body text-[var(--label-2)]">{chapter.text}</p>
        {chapter.points?.map((p) => (
          <div key={p.title} className="guide-point" data-testid="tour-point">
            <p className="text-headline">{p.title}</p>
            <p className="text-subhead text-[var(--label-2)]">{p.text}</p>
          </div>
        ))}
        {chapter.where && (
          <Link
            href={chapter.where.href}
            className="text-[var(--tint)] -mx-1 mt-1 inline-flex min-h-11 items-center gap-1 self-start rounded-lg px-1"
          >
            {chapter.where.label}
            <ChevronRight size={16} strokeWidth={2.25} aria-hidden />
          </Link>
        )}
      </div>
    </section>
  );
}

/** The tour of what T-DJ does, one chapter per thing a DJ does, with a jump list at the top. */
export function GuideTour() {
  return (
    <div className="mt-6" data-testid="guide-tour">
      <h2 className="text-title3 px-4">What you can do</h2>
      <p className="text-subhead mt-1 px-4 text-[var(--label-2)]">
        From the first idea of a night to its last tanda.
      </p>
      <nav aria-label="Chapters" className="guide-jump mt-3 flex flex-wrap gap-2 px-4 pb-1">
        {GUIDE_CHAPTERS.map((c) => (
          <a
            key={c.id}
            href={`#tour-${c.id}`}
            className="chip inline-flex min-h-11 shrink-0 items-center"
            data-testid="tour-jump"
          >
            {c.short}
          </a>
        ))}
      </nav>
      {GUIDE_CHAPTERS.map((c) => (
        <Chapter key={c.id} chapter={c} />
      ))}
    </div>
  );
}
