/**
 * English: the source text of every word on T-DJ's screens, under flat keys (lib/i18n/index.ts). A new string goes
 * here first, then into tr.ts (the vitest dictionary test fails until it does).
 */
export const en = {
  "i18n.test.hello": "Hello {name}",
  "i18n.test.songs.one": "{count} song",
  "i18n.test.songs.other": "{count} songs",
} as const;

export type MsgKey = keyof typeof en;
