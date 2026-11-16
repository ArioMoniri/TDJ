"use client";
import { Keyboard } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import {
  ACTIONS,
  type ActionDef,
  type ActionId,
  bindingsOf,
  comboOf,
  conflictsOf,
  formatCombo,
  normalizeCombo,
  resetAllBindings,
  resetBinding,
  setBinding,
  useKeymap,
} from "@/lib/keymap";
import { toast } from "@/lib/toast";
import { ActionRow, Group, Row, Tile } from "./Form";
import { Sheet } from "./Sheet";

const Keys = ({ combos }: { combos: string[] }) =>
  combos.length ? (
    <span className="inline-flex flex-wrap justify-end gap-1" data-testid="key-binding">
      {combos.map((c) => (
        <kbd key={c} className="text-footnote rounded bg-[var(--fill-3)] px-1.5 py-0.5">
          {formatCombo(c)}
        </kbd>
      ))}
    </span>
  ) : (
    <span data-testid="key-binding">{t("keys.none")}</span>
  );

/**
 * 2026-11 — Settings → Keyboard: every shortcut (lib/keymap.ts) with its keys on this device. A row opens the
 * recorder: press the new combo, a combo another action holds is named first ("Use it anyway" takes it from there),
 * Reset puts the default back; "Reset all keys" puts every default back. Kept in this browser only.
 */
export function KeyboardSettings() {
  const custom = useKeymap((s) => s.custom);
  // (the DJ's keys are this browser's: the list renders after mount, so the server's page and the first render match)
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const [editing, setEditing] = useState<ActionDef | null>(null);
  const changed = Object.keys(custom).length > 0;
  const group = (g: ActionDef["group"], header: string) => (
    <Group header={header} data-testid={`keyboard-${g}`}>
      {ACTIONS.filter((a) => a.group === g).map((a) => (
        <Row
          key={a.id}
          label={t(a.label)}
          value={ready ? <Keys combos={bindingsOf(a.id, custom)} /> : undefined}
          chevron
          onClick={() => setEditing(a)}
          data-testid={`key-row-${a.id}`}
        />
      ))}
    </Group>
  );
  return (
    <section id="settings-keyboard" className="scroll-mt-24" data-testid="settings-keyboard">
      <Group header={t("keys.header")} footer={t("keys.footer")}>
        <Row
          tile={
            <Tile color="#636366">
              <Keyboard size={16} strokeWidth={2} />
            </Tile>
          }
          label={t("keys.intro")}
          sub={t("keys.intro_sub")}
        />
      </Group>
      {group("edit", t("keys.group_edit"))}
      {group("booth", t("keys.group_booth"))}
      <Group>
        <ActionRow
          label={t("keys.reset_all")}
          destructive
          disabled={!ready || !changed}
          onClick={() => {
            resetAllBindings();
            toast(t("keys.reset_all_done"));
          }}
          id="keys-reset-all"
        />
      </Group>
      <KeySheet action={editing} onClose={() => setEditing(null)} />
    </section>
  );
}

function KeySheet({ action, onClose }: { action: ActionDef | null; onClose: () => void }) {
  const custom = useKeymap((s) => s.custom);
  const [combo, setCombo] = useState<string | null>(null);
  const [mode, setMode] = useState<"replace" | "add">("replace");
  const box = useRef<HTMLButtonElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new action starts a new recording
  useEffect(() => {
    setCombo(null);
    setMode("replace");
  }, [action?.id]);
  if (!action)
    return (
      <Sheet open={false} onClose={onClose} title="">
        {null}
      </Sheet>
    );
  const current = bindingsOf(action.id, custom);
  const conflicts = combo ? conflictsOf(combo, action.id, custom) : [];
  const nameOf = (id: ActionId) => t(ACTIONS.find((a) => a.id === id)!.label);
  const save = () => {
    if (!combo) return;
    const next = mode === "add" ? [...current, combo] : [combo];
    setBinding(action.id, next, { takeFrom: conflicts.length > 0 });
    toast(t("keys.saved", { action: t(action.label), key: formatCombo(combo) }));
    onClose();
  };
  return (
    <Sheet
      open={!!action}
      onClose={onClose}
      title={t(action.label)}
      trailing={t("keys.save")}
      onTrailing={combo ? save : onClose}
      testId="key-sheet"
      detents={["large"]}
    >
      <Group header={t("keys.now")}>
        <Row label={t("keys.keys_now")} value={<Keys combos={current} />} />
      </Group>
      <Group
        header={t("keys.record_header")}
        footer={
          conflicts.length ? (
            <span className="text-[var(--destructive)]" data-testid="key-conflict" role="alert">
              {t("keys.conflict", { key: formatCombo(combo!), actions: conflicts.map(nameOf).join(", ") })}
            </span>
          ) : (
            t("keys.record_footer")
          )
        }
      >
        <div className="cell">
          <button
            ref={box}
            type="button"
            className="key-recorder min-h-11 w-full rounded-[var(--radius-xs)] border border-dashed border-[var(--separator)] px-3 py-2 text-center"
            data-key-recorder
            data-testid="key-recorder"
            aria-label={t("keys.record_aria", { action: t(action.label) })}
            onKeyDown={(e) => {
              // Tab and Escape keep their jobs (leave the field, close the sheet)
              if (e.key === "Tab" || e.key === "Escape") return;
              const c = comboOf(e.nativeEvent);
              e.preventDefault();
              e.stopPropagation();
              if (c) setCombo(normalizeCombo(c));
            }}
          >
            {combo ? (
              <kbd className="text-title3 rounded bg-[var(--fill-3)] px-2 py-0.5" data-testid="key-recorded">
                {formatCombo(combo)}
              </kbd>
            ) : (
              <span className="text-[var(--label-2)]">{t("keys.press_keys")}</span>
            )}
          </button>
        </div>
        <Row
          label={t("keys.mode_replace")}
          value={mode === "replace" ? "✓" : undefined}
          onClick={() => setMode("replace")}
        />
        <Row
          label={t("keys.mode_add")}
          value={mode === "add" ? "✓" : undefined}
          onClick={() => setMode("add")}
          data-testid="key-mode-add"
        />
      </Group>
      <Group>
        {combo && (
          <ActionRow
            label={conflicts.length ? t("keys.use_anyway") : t("keys.save")}
            onClick={save}
            id="key-save"
          />
        )}
        <ActionRow
          label={t("keys.reset_one", { keys: action.defaults.map((c) => formatCombo(c)).join(", ") })}
          onClick={() => {
            resetBinding(action.id);
            toast(t("keys.reset_done", { action: t(action.label) }));
            onClose();
          }}
          id="key-reset"
        />
        <ActionRow
          label={t("keys.clear")}
          destructive
          disabled={!current.length}
          onClick={() => {
            setBinding(action.id, []);
            onClose();
          }}
          id="key-clear"
        />
      </Group>
    </Sheet>
  );
}
