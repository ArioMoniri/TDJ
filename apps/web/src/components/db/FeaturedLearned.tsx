"use client";
import {
  applyRepoOverrides,
  type LearnedPreferences,
  type LearnedRule,
  nightExceptions,
  type RepoLearnedOverrides,
} from "@tdj/core";
import { useEffect, useMemo, useState } from "react";
import type { DraftSong } from "@/lib/build";
import {
  featuredNightLines,
  featuredOn,
  featuredRuleList,
  forgetFeatured,
  restoreFeatured,
  setFeaturedOn,
  weighFeatured,
} from "@/lib/featuredLearned";
import { t } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import type { Meta } from "@/lib/types";
import { ActionRow, Group, Row, SwitchRow } from "../Form";
import { RuleRow } from "./LearnedRules";
import { PraiseRows } from "./PraiseRows";

const SIDES_SHOWN = 30;

/**
 * "Learned from your edits to the featured night": the repo-level store (data/knowledge/dj_preferences.json) every
 * night composes with, as rules the DJ can weigh, delete or switch off. Changes are overrides kept in the DJ's memory
 * (`repoLearned`) and sent with every request; the store itself never changes. Shown in Database → Memory and
 * Settings.
 */
export function FeaturedLearned() {
  const { memory, updateMemory } = useStore();
  const repo = memory.repoLearned;
  const [store, setStore] = useState<LearnedPreferences | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [songs, setSongs] = useState<Record<string, DraftSong>>({});
  useEffect(() => {
    fetch("/api/meta")
      .then((r) => (r.ok ? r.json() : null))
      .then((m: Meta | null) => {
        if (!m) return;
        setNames(Object.fromEntries(m.orchestras.map((o) => [o.id, o.name])));
        setStore(m.featuredLearned ?? null);
      })
      .catch(() => {});
  }, []);
  const nameOf = (id: string) => names[id] ?? id.replace(/-/g, " ");
  const all = featuredRuleList(store, repo, nameOf, (id) => songs[id]);
  const sideIds = useMemo(
    () =>
      all
        .filter((r) => r.kind === "side")
        .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
        .slice(0, SIDES_SHOWN)
        .map((r) => r.id.slice(5)),
    [all],
  );
  // the DJ's praise of the featured night's tandas (deleted ones gone): their sides name the order
  const praise = useMemo(
    () => applyRepoOverrides(store, { ...(repo ?? {}), off: false })?.praise ?? [],
    [store, repo],
  );
  const want = [...new Set([...sideIds, ...praise.flatMap((p) => p.songIds)])]
    .filter((id) => !songs[id])
    .join(",");
  useEffect(() => {
    if (!want) return;
    fetch("/api/build", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lookup: want.split(",") }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { songs?: DraftSong[] } | null) => {
        if (j?.songs) setSongs((x) => ({ ...x, ...Object.fromEntries(j.songs!.map((s) => [s.id, s])) }));
      })
      .catch(() => {});
  }, [want]);
  if (!store) return null;
  const on = featuredOn(repo);
  const edit = (fn: (r: RepoLearnedOverrides | undefined) => RepoLearnedOverrides) =>
    updateMemory((m) => ({ ...m, repoLearned: fn(m.repoLearned), updatedAt: new Date().toISOString() }));
  const rows = (rs: LearnedRule[]) =>
    rs.map((r) => (
      <RuleRow
        key={r.id}
        r={r}
        onWeight={(w) => edit((x) => weighFeatured(x, r.id, w))}
        onForget={() => edit((x) => forgetFeatured(x, r.id))}
      />
    ));
  const fams = all.filter((r) => r.kind === "family");
  const sides = all.filter((r) => r.kind === "side" && sideIds.includes(r.id.slice(5)));
  const temps = all.filter((r) => r.kind === "template");
  const nightLines = featuredNightLines(store.night, nameOf);
  const exceptions = nightExceptions(store);
  const changed = !!(repo?.deleted?.length || Object.keys(repo?.weights ?? {}).length);

  return (
    // its groups flow as Settings' own groups do: in two columns each one stays whole (globals.css .settings-flow)
    <div className="settings-flow" data-testid="featured-learned">
      <Group
        header={t("featuredLearned.header")}
        footer={on ? t("featuredLearned.footer") : t("featuredLearned.off_footer")}
      >
        <SwitchRow
          label={t("featuredLearned.use")}
          tip={t("featuredLearned.use_tip")}
          checked={on}
          onChange={(v) => edit((x) => setFeaturedOn(x, v))}
        />
      </Group>
      {on && fams.length > 0 && <Group header={t("db.learnedRules.families")}>{rows(fams)}</Group>}
      {on && sides.length > 0 && (
        <Group
          header={t("db.learnedRules.sides")}
          footer={
            all.filter((r) => r.kind === "side").length > SIDES_SHOWN
              ? t("db.learnedRules.the_strongest_of", {
                  SIDES_SHOWN,
                  length: all.filter((r) => r.kind === "side").length,
                })
              : undefined
          }
        >
          {rows(sides)}
        </Group>
      )}
      {on && temps.length > 0 && <Group header={t("db.learnedRules.your_tandas")}>{rows(temps)}</Group>}
      {on && (
        <PraiseRows
          praise={praise}
          nameOf={nameOf}
          titleOf={(id) => songs[id]?.title}
          onForget={(id) => edit((x) => forgetFeatured(x, `praise:${id}`))}
          testId="featured-praise"
        />
      )}
      {on && nightLines.length > 0 && (
        <Group header={t("featuredLearned.night_header")} footer={t("featuredLearned.night_footer")}>
          {nightLines.map((l) => (
            <Row key={l} label={l} />
          ))}
        </Group>
      )}
      {/* the DJ's approvals of mixed tandas: one-time, for the featured night only — not learned rules, no weight */}
      {exceptions.length > 0 && (
        <Group
          header={t("featuredLearned.exceptions_header")}
          footer={t("featuredLearned.exceptions_footer")}
          data-testid="featured-exceptions"
        >
          {exceptions.map((x) => (
            <Row
              key={x.tandaId ?? x.name ?? x.reason}
              label={x.reason}
              sub={`${t("featuredLearned.exception_only")} · ${x.name ?? ""}`}
            />
          ))}
        </Group>
      )}
      {on && changed && (
        <Group>
          <ActionRow label={t("featuredLearned.restore")} onClick={() => edit(restoreFeatured)} />
        </Group>
      )}
    </div>
  );
}
