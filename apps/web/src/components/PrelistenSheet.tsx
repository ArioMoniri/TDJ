"use client";
import { Headphones, Laptop, Smartphone } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { headphoneChoices, speakerFor } from "@/lib/booth/prelistenRoute";
import type { useBooth as UseBooth } from "@/lib/booth/store";
import { t } from "@/lib/i18n";
import { boothPrelistenRoute } from "@/lib/playback";
import { appleMobile, chooseSpeaker, closePrelistenAsk, usePrelistenAsk } from "@/lib/prelisten";
import { ActionRow, Group } from "./Form";
import { Sheet } from "./Sheet";

type BoothStore = typeof UseBooth;
type Outputs = ReturnType<BoothStore["getState"]>["outputs"];
const boothStore = (): BoothStore | null =>
  typeof window === "undefined"
    ? null
    : ((window as unknown as { __tdjBooth?: BoothStore }).__tdjBooth ?? null);

/** the Booth's outputs, live (the store lives on the Booth page's module; read through `window`) */
function useOutputs(on: boolean): Outputs | null {
  const [o, setO] = useState<Outputs | null>(null);
  useEffect(() => {
    if (!on) return;
    const st = boothStore();
    if (!st) return;
    setO(st.getState().outputs);
    return st.subscribe((s, p) => {
      if (s.outputs !== p.outputs) setO(s.outputs);
    });
  }, [on]);
  return on ? o : null;
}

/**
 * 2026-11 (the owner: "can't play these songs when even there is another device connected") — a tap on any song
 * while the Booth plays a night, with no output a pre-listen can use. One question, said plainly, with the fixes:
 * - Choose headphones: the outputs other than the room's, one tap each; the song then plays there at once;
 * - Play on this device's speaker anyway: only when that speaker is not the room's output (never offered otherwise);
 * - where a web page has one output (Safari, iPhone, iPad): a second device — T-DJ on a phone with headphones,
 *   with the night shared through Rooms: a tap there plays on that phone only.
 * The room keeps playing throughout: nothing here pauses, ducks or fades it.
 */
export function PrelistenSheet() {
  const ask = usePrelistenAsk((s) => s.ask);
  const outputs = useOutputs(!!ask);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  // a pick that makes the headphones usable plays the asked song there at once
  useEffect(() => {
    if (!ask || !outputs) return;
    if (boothPrelistenRoute().kind === "headphones") {
      setBusy(true);
      void ask.retry().finally(() => setBusy(false));
    }
  }, [ask, outputs]);
  if (!ask) return null;
  const o = outputs ?? {
    devices: [],
    room: "default",
    cue: null,
    cueSupported: false,
    roomSupported: false,
    named: false,
  };
  const apple = appleMobile();
  const oneOutput = ask.why === "unsupported";
  const choices = oneOutput ? [] : headphoneChoices(o);
  const speaker = oneOutput ? null : speakerFor(o);
  const why =
    ask.why === "unsupported"
      ? apple
        ? t("prelisten.why_apple")
        : t("prelisten.why_unsupported")
      : ask.why === "same"
        ? t("prelisten.why_same")
        : ask.why === "pair-closed"
          ? t("prelisten.why_pair")
          : t("prelisten.why_none");
  return (
    <Sheet
      open
      onClose={closePrelistenAsk}
      title={t("prelisten.title")}
      testId="prelisten-sheet"
      initialFocus="title"
      detents={["large"]}
    >
      <p className="text-subhead px-4 pb-1" data-testid="prelisten-lead">
        {t("prelisten.lead", { title: ask.title })}
      </p>
      <p
        className="text-footnote px-4 pb-3 text-[var(--label-2)]"
        data-testid="prelisten-why"
        data-why={ask.why}
      >
        {why}
      </p>
      {!oneOutput && (
        <Group
          header={t("prelisten.choose_headphones")}
          footer={t("prelisten.choose_headphones_footer")}
          data-testid="prelisten-outputs"
        >
          {choices.map((d) => (
            <button
              key={d.id}
              type="button"
              className="cell cell-tap w-full text-left"
              data-testid="prelisten-output"
              data-device={d.id}
              disabled={busy}
              onClick={() => boothStore()?.getState().setCueOutput(d.id)}
            >
              <Headphones size={18} strokeWidth={2} className="text-[var(--label-2)]" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{d.label}</span>
            </button>
          ))}
          {!o.named && (
            <ActionRow
              label={t("booth.playerToolbar.show_device_names")}
              onClick={() => void boothStore()?.getState().refreshOutputs(true)}
            />
          )}
        </Group>
      )}
      {!oneOutput && (
        <Group
          footer={speaker ? t("prelisten.speaker_footer") : t("prelisten.speaker_is_room_footer")}
          data-testid="prelisten-speaker-group"
        >
          {speaker && (
            <button
              type="button"
              className="cell cell-tap w-full text-left"
              data-testid="prelisten-speaker"
              data-device={speaker.id}
              disabled={busy}
              onClick={() => {
                chooseSpeaker(true);
                setBusy(true);
                void ask.retry({ speaker: true }).finally(() => setBusy(false));
              }}
            >
              <Laptop size={18} strokeWidth={2} className="text-[var(--label-2)]" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-[var(--tint)]">{t("prelisten.speaker_anyway")}</span>
                <span className="text-footnote block truncate text-[var(--label-2)]">
                  {t("prelisten.speaker_not_room", { name: speaker.label })}
                </span>
              </span>
            </button>
          )}
        </Group>
      )}
      <Group
        header={t("prelisten.second_device")}
        footer={t("prelisten.second_device_footer")}
        data-testid="prelisten-second-device"
      >
        <button
          type="button"
          className="cell cell-tap w-full text-left"
          data-testid="prelisten-rooms"
          onClick={() => {
            closePrelistenAsk();
            router.push("/rooms");
          }}
        >
          <Smartphone size={18} strokeWidth={2} className="text-[var(--label-2)]" aria-hidden />
          <span className="min-w-0 flex-1 text-[var(--tint)]">{t("prelisten.open_rooms")}</span>
        </button>
      </Group>
    </Sheet>
  );
}
