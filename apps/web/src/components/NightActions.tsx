"use client";
import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { cancelPlayAsk, confirmPlayAsk, renameNight, usePlayAsk, useRenameAsk } from "@/lib/nightActions";
import { useStore } from "@/lib/store";
import { Group } from "./Form";
import { Sheet } from "./Sheet";

/**
 * 2026-11 — the two sheets every place shares for a night (lib/nightActions.ts), mounted once in the layout:
 * - "Another night is playing" before Play in the Booth replaces it (Replace / Cancel; never silently);
 * - Rename (the sidebar's Recent nights and History's menus): the History entry and the night open in Compose and
 *   the Booth take the new name, with an Undo.
 */
export function NightActions() {
  return (
    <>
      <PlayAskSheet />
      <RenameSheet />
    </>
  );
}

function PlayAskSheet() {
  const ask = usePlayAsk((s) => s.ask);
  return (
    <Sheet
      open={!!ask}
      onClose={cancelPlayAsk}
      title={t("nights.play_ask_title")}
      detents={["medium"]}
      testId="play-in-booth-ask"
      hideCancel
    >
      {ask && (
        <Group
          footer={t("nights.play_ask_footer", {
            playing: ask.playing,
            name: ask.playlist.name || t("booth.load.untitled"),
          })}
        >
          <button
            type="button"
            className="cell cell-tap w-full justify-center font-semibold"
            data-autofocus
            onClick={cancelPlayAsk}
            data-testid="play-in-booth-cancel"
          >
            {t("nights.play_ask_cancel")}
          </button>
          <button
            type="button"
            className="cell cell-tap w-full justify-center font-semibold text-[var(--destructive)]"
            onClick={() => void confirmPlayAsk()}
            data-testid="play-in-booth-replace"
          >
            {t("nights.play_ask_replace")}
          </button>
        </Group>
      )}
    </Sheet>
  );
}

function RenameSheet() {
  const id = useRenameAsk((s) => s.id);
  const entry = useStore((s) => (id ? s.history.find((h) => h.id === id) : undefined));
  const [draft, setDraft] = useState("");
  useEffect(() => {
    if (entry) setDraft(entry.title);
  }, [entry]);
  const close = () => useRenameAsk.setState({ id: null });
  const save = () => {
    if (id) renameNight(id, draft);
    close();
  };
  return (
    <Sheet
      open={!!id && !!entry}
      onClose={close}
      title={t("history.rename")}
      trailing={t("history.save")}
      onTrailing={save}
      detents={["medium"]}
      testId="rename-night"
    >
      <Group footer={t("nights.rename_footer")}>
        <label htmlFor="rename-night-field" className="cell">
          <span className="sr-only">{t("history.name")}</span>
          <input
            id="rename-night-field"
            className="field"
            data-autofocus
            data-testid="rename-night-field"
            value={draft}
            maxLength={80}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                save();
              }
            }}
            autoComplete="off"
          />
        </label>
      </Group>
    </Sheet>
  );
}
