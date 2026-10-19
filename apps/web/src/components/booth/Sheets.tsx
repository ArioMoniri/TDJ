"use client";
import { useRef, useState } from "react";
import { useBooth } from "@/lib/booth/store";
import { ActionRow, Group, Row } from "../Form";
import { Sheet } from "../Sheet";

const KEYS: Array<[string, string]> = [
  ["space", "Hold / play (never a cut)"],
  ["→", "Next at gap: the queued item is skipped"],
  ["esc (hold 600 ms)", "Emergency stop: everything fades out in 1 s"],
  ["↑ / ↓", "Cortina fader ± 5 %"],
  ["c", "Cue the cortina: end the tanda after this song"],
  ["b", "Birthday vals"],
  ["m", "Master mute"],
  ["?", "This sheet"],
];

export function ShortcutsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Keyboard" trailing="Done" testId="booth-shortcuts">
      <Group footer="Shortcuts are ignored while a text field has focus. Every key calls the same engine method the buttons do.">
        {KEYS.map(([k, d]) => (
          <Row
            key={k}
            label={d}
            value={<kbd className="text-footnote rounded bg-[var(--fill-3)] px-1.5 py-0.5">{k}</kbd>}
          />
        ))}
      </Group>
    </Sheet>
  );
}

export function BreakSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const startBreak = useBooth((s) => s.startBreak);
  const [min, setMin] = useState(10);
  return (
    <Sheet open={open} onClose={onClose} title="Break" testId="booth-break-sheet">
      <Group footer="The booth holds after the current song and counts down; Play (or End break) resumes with the next item.">
        {[5, 10, 15, 20, 30].map((m) => (
          <Row key={m} label={`${m} minutes`} onClick={() => setMin(m)} value={min === m ? "✓" : undefined} />
        ))}
        <ActionRow
          label={`Break for ${min} min after this song`}
          onClick={() => {
            startBreak(min);
            onClose();
          }}
        />
      </Group>
    </Sheet>
  );
}

/** "Find…" for an item without a source: the three closest files, or any file from the disk (remembered as manual). */
export function FindFileSheet({
  item,
  onClose,
}: {
  item: { id: string; title: string } | null;
  onClose: () => void;
}) {
  const suggestions = useBooth((s) => (item ? s.suggestions[item.id] : undefined)) ?? [];
  const pickFile = useBooth((s) => s.pickFile);
  const input = useRef<HTMLInputElement>(null);
  return (
    <Sheet open={!!item} onClose={onClose} title="Pick file" trailing="Done" testId="booth-find-sheet">
      {item && (
        <>
          <p className="section-foot mt-2">{item.title}</p>
          <Group
            header={suggestions.length ? "Closest files in your folder" : "No close file name in your folder"}
            footer="A file picked by hand is remembered for this recording and never overwritten by a re-index."
          >
            {suggestions.map((s) => (
              <Row
                key={s.path}
                label={s.name}
                sub={s.path}
                onClick={() => {
                  void pickFile(item.id, { path: s.path });
                  onClose();
                }}
              />
            ))}
            <ActionRow label="Pick file…" onClick={() => input.current?.click()} />
          </Group>
          <input
            ref={input}
            type="file"
            accept="audio/*"
            className="sr-only"
            data-testid="booth-pick-file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                void pickFile(item.id, f);
                onClose();
              }
            }}
          />
        </>
      )}
    </Sheet>
  );
}

export function ResumeSheet() {
  const offer = useBooth((s) => s.resumeOffer);
  const resume = useBooth((s) => s.resume);
  const plan = useBooth((s) => s.plan);
  const it = offer && plan ? plan.items[offer.planIndex] : null;
  const k =
    it && plan
      ? plan.items.filter((x) => x.tanda === it.tanda && x.kind === "track").findIndex((x) => x.n === it.n) +
        1
      : 0;
  return (
    <Sheet
      open={!!offer}
      onClose={() => void resume(false)}
      title="Resume the night?"
      hideCancel
      detents={["medium"]}
      testId="booth-resume"
    >
      <Group footer="The audio cannot survive a reload; the position and the log do.">
        <ActionRow
          label={
            it ? `Resume at tanda ${it.tanda}, ${it.kind === "cortina" ? "cortina" : `track ${k}`}` : "Resume"
          }
          onClick={() => void resume(true)}
          id="booth-resume-yes"
        />
        <ActionRow label="Start from the beginning" destructive onClick={() => void resume(false)} />
      </Group>
    </Sheet>
  );
}
