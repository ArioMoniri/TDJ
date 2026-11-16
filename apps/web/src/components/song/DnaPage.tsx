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
      <DnaBack />
      <DnaView target={{ kind, id }} />
    </>
  );
}
