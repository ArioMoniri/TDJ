"use client";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { t } from "@/lib/i18n";
import type { DnaTarget } from "@/lib/songOpen";
import { DnaBack } from "./DnaBack";
import { DnaView } from "./DnaViews";

/** /song?id=…, /orchestra?id=…, /singer?id=… (a query string: the apps ship a static export) */
export function DnaPage({ kind }: { kind: DnaTarget["kind"] }) {
  return (
    <Suspense>
      <Inner kind={kind} />
    </Suspense>
  );
}

function Inner({ kind }: { kind: DnaTarget["kind"] }) {
  const id = useSearchParams().get("id") ?? "";
  if (!id)
    return <p className="text-body mt-8 text-center text-[var(--label-2)]">{t("song.dna_not_found")}</p>;
  return (
    <>
      {/* 2026-11 (iPhone: the page ran under the status bar and the Dynamic Island, Back scrolled away): the back
          button sits in a glass bar pinned under the top safe area (`--chrome-top`), the page starts below it */}
      <div className="dna-page-bar" data-testid="dna-page-bar">
        <DnaBack />
      </div>
      <DnaView target={{ kind, id }} />
    </>
  );
}
