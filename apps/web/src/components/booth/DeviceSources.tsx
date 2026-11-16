"use client";
import { useEffect, useState } from "react";
import { bestSource, deviceSources, platformOf } from "@/lib/booth/deviceSources";
import { inNativeApp, isAppleMobile, isPhone, sdkPlayable } from "@/lib/booth/sources/spotify";
import { useBooth } from "@/lib/booth/store";
import { t } from "@/lib/i18n";
import { loadMatches } from "@/lib/youtubeMatches";
import { Group, Row } from "../Form";

/**
 * 2026-11 — "On this device": every source that could play the night here, with one line on how (or why not) and
 * the one that plays when the Source is left on Automatic (lib/booth/deviceSources.ts). In the Booth's Source sheet
 * and under Settings → Booth.
 */
export function DeviceSourcesGroup() {
  const availability = useBooth((s) => s.availability);
  const folder = useBooth((s) => s.folder);
  const check = useBooth((s) => s.checkAvailability);
  const [sdk, setSdk] = useState<boolean | null>(null);
  const [env, setEnv] = useState<{ app: boolean; appleMobile: boolean; phone: boolean } | null>(null);
  const [matched, setMatched] = useState(0);
  useEffect(() => {
    const e = { app: inNativeApp(), appleMobile: isAppleMobile(), phone: isPhone() };
    setEnv(e);
    setMatched(Object.keys(loadMatches()).length);
    if (!e.appleMobile && !e.phone) void sdkPlayable().then(setSdk);
    else setSdk(false);
    if (!availability.spotify.checked) void check();
  }, [availability.spotify.checked, check]);
  if (!env) return null;
  const list = deviceSources({
    platform: platformOf(env),
    spotify: availability.spotify,
    sdk,
    youtube: availability.youtube ?? { ok: false },
    youtubeMatched: matched,
    folderName: folder.name,
    folderMatched: folder.matched,
  });
  const best = bestSource(list);
  const label = {
    file: t("deviceSources.files"),
    spotify: t("deviceSources.spotify"),
    youtube: t("deviceSources.youtube"),
    preview: t("deviceSources.clips"),
  } as const;
  return (
    <Group
      header={t("deviceSources.header")}
      footer={t("deviceSources.footer", { best: label[best] })}
      data-testid="booth-device-sources"
    >
      {list.map((s) => (
        <Row
          key={s.kind}
          label={label[s.kind]}
          sub={s.line}
          value={s.ok ? t("deviceSources.ready") : t("deviceSources.not_here")}
          data-testid="booth-device-source"
          data-kind={s.kind}
          data-ok={s.ok ? "1" : "0"}
        />
      ))}
    </Group>
  );
}
