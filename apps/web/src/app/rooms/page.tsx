"use client";
import {
  appRoomLink,
  formatRoomCode,
  normalizeRoomCode,
  ROOM_NAME_MAX,
  ROOM_USER_MAX,
  type RoomLogEntry,
} from "@tdj/core";
import {
  Copy,
  DoorOpen,
  Heart,
  ListMusic,
  LogOut,
  Pencil,
  Play,
  QrCode as QrIcon,
  Replace,
  Server,
  Smartphone,
  Trash2,
  TriangleAlert,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { DancerHeart } from "@/components/DancerHeart";
import { ActionRow, FieldRow, Group, PickerRow, Row, SwitchRow, Tile } from "@/components/Form";
import { NightCover } from "@/components/NightCover";
import { NightEditor } from "@/components/NightEditor";
import { NightPicker } from "@/components/NightPicker";
import { PageHeader } from "@/components/PageHeader";
import { QrCode } from "@/components/QrCode";
import { Sheet } from "@/components/Sheet";
import { SwipeRow } from "@/components/SwipeRow";
import { TipRow } from "@/components/TipRow";
import { Segmented } from "@/components/ui";
import { Tip } from "@/components/ui/Tip";
import { nativeInfo } from "@/lib/app/native";
import { APP } from "@/lib/app/target";
import { haptic } from "@/lib/haptics";
import { makeSnapshot } from "@/lib/history";
import { fmtDate, fmtTime, t as tx, upper } from "@/lib/i18n";
import { expiresInDays, type RoomRef, roomShareLink, useRooms } from "@/lib/rooms";
import { copyText } from "@/lib/share";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import type { Playlist } from "@/lib/types";

const hhmm = (iso: string) => fmtTime(iso, { hour: "2-digit", minute: "2-digit" });
const day = (iso: string) => fmtDate(iso, { day: "numeric", month: "short" });
const host = (server: string) => {
  try {
    return new URL(server).host;
  } catch {
    return server;
  }
};

function LogList({ log, me }: { log: RoomLogEntry[]; me: string }) {
  const items = [...log].reverse();
  if (!items.length) return <p className="section-foot">{tx("rooms.nothing_has_happened_in_this_room")}</p>;
  return (
    <Group data-testid="room-log">
      {items.map((e, i) => (
        <div key={`${e.rev}-${i}`} className="cell items-start" data-kind={e.kind}>
          {e.kind === "conflict" ? (
            <Tip text={tx("rooms.two_djs_changed_the_same_thing")} className="mt-0.5 shrink-0">
              <TriangleAlert
                size={18}
                className="text-[var(--warning,#ff9500)]"
                aria-label={tx("rooms.conflict")}
              />
            </Tip>
          ) : (
            <span
              className="mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-[var(--fill-3)] text-[10px] font-semibold"
              aria-hidden
            >
              {upper(e.by.slice(0, 1))}
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block">
              <b className="font-semibold">{e.by === me ? tx("rooms.you") : e.by}</b> {e.text}
            </span>
            <span className="text-footnote block text-[var(--label-2)]">
              {day(e.at)}, {hhmm(e.at)}
            </span>
          </span>
        </div>
      ))}
    </Group>
  );
}

export default function RoomsPage() {
  const r = useRooms();
  const { playlist, setPlaylist } = useStore();
  const [tab, setTab] = useState<"night" | "log">("night");
  const [nameDraft, setNameDraft] = useState("");
  const [roomName, setRoomName] = useState("");
  const [withNight, setWithNight] = useState(true);
  const [code, setCode] = useState("");
  const [remote, setRemote] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const [past, setPast] = useState<{ ref: RoomRef; log: RoomLogEntry[] | null; name: string } | null>(null);
  // 2026-11: choose the night (a new room's, or the owner's switch), the confirmations, the list's edit mode
  const [picking, setPicking] = useState<"create" | "switch" | null>(null);
  const [chosen, setChosen] = useState<Playlist | null>(null);
  const [switchTo, setSwitchTo] = useState<Playlist | null>(null);
  const [closing, setClosing] = useState<RoomRef | { code: string; server: string; name: string } | null>(
    null,
  );
  const [editing, setEditing] = useState(false);
  const [oldOpen, setOldOpen] = useState(false);
  const [oldDays, setOldDays] = useState(30);
  // 2026-11: `?dance=<code>` is a dancer's page: the playing song and one heart (no name, no joining)
  const [dance, setDance] = useState<{ code: string; server: string } | null>(null);
  const router = useRouter();
  // the apps keep rooms on a T-DJ server the DJ linked (Settings → Connections); without one they cannot open one
  const [linked, setLinked] = useState<boolean | null>(APP ? null : true);
  useEffect(() => {
    if (!APP) return;
    nativeInfo()
      .then((i) => setLinked(!!i.linkedServer))
      .catch(() => setLinked(false));
  }, []);
  const needsServer = APP && linked === false;

  useEffect(() => {
    r.boot();
    const q = new URLSearchParams(location.search);
    const join = normalizeRoomCode(q.get("join"));
    if (join) setCode(join);
    const dancing = normalizeRoomCode(q.get("dance"));
    const ds = q.get("server");
    if (dancing)
      setDance({
        code: dancing,
        server:
          ds && /^https?:\/\//i.test(ds) && new URL(ds).origin !== location.origin ? new URL(ds).origin : "",
      });
    const server = q.get("server");
    if (server && /^https?:\/\//i.test(server) && new URL(server).origin !== location.origin)
      setRemote(new URL(server).origin);
  }, [r.boot]);
  useEffect(() => setNameDraft(r.user), [r.user]);
  const [nameSaved, setNameSaved] = useState(false);

  const info = r.info;
  const inRoom = !!r.active;
  const link = info ? roomShareLink(info.code, info.server) : "";
  const appLink = info
    ? appRoomLink(info.server || (typeof location !== "undefined" ? location.origin : ""), info.code)
    : "";
  const others = (info?.presence ?? []).filter((n) => n !== r.user);

  const edit = (fn: (p: Playlist) => Playlist) => {
    const p = useStore.getState().playlist;
    if (p) setPlaylist(fn(p));
  };
  const owner = !!info && info.createdBy === r.user;
  /** a night becomes the one on screen (the composer's own is kept in History first) */
  const adoptNight = (p: Playlist) => {
    const st = useStore.getState();
    const cur = st.playlist;
    if (cur && cur.id !== p.id && !st.history.some((h) => h.playlist.id === cur.id))
      st.addSnapshot(makeSnapshot(cur, cur.options, "compose"));
    if (cur?.id !== p.id) setPlaylist(p);
  };
  const night = chosen ?? playlist;

  const saveUser = () => {
    if (nameDraft.trim() && nameDraft.trim() !== r.user) {
      r.setUser(nameDraft);
      // said in the group's footer: a toast covered the row buttons on iPad (wave 2)
      setNameSaved(true);
    }
  };
  const create = async () => {
    saveUser();
    if (!useRooms.getState().user) return toast(tx("rooms.choose_your_name_first"));
    setBusy(true);
    // 2026-11: the chosen night goes in (the current one unless the DJ picked another)
    if (withNight && chosen) adoptNight(chosen);
    const ok = await r.create(roomName, withNight && !!night);
    setBusy(false);
    if (ok) setChosen(null);
    if (ok) {
      haptic(10);
      setRoomName("");
    }
  };
  const join = async (c = code, server = remote) => {
    saveUser();
    if (!useRooms.getState().user) return toast(tx("rooms.choose_your_name_first"));
    setBusy(true);
    const ok = await r.join(c, server);
    setBusy(false);
    if (ok) {
      haptic(10);
      setCode("");
      setRemote("");
      history.replaceState(null, "", "/rooms");
    }
  };
  const openPast = async (ref: RoomRef) => {
    setPast({ ref, log: null, name: ref.name });
    const got = await r.fetchLog(ref);
    setPast((cur) => (cur?.ref === ref ? { ref, log: got?.log ?? [], name: got?.name ?? ref.name } : cur));
  };
  const previous = useMemo(
    () => r.rooms.filter((x) => !(r.active && x.code === r.active.code && x.server === r.active.server)),
    [r.rooms, r.active],
  );

  if (dance) return <DancerHeart code={dance.code} server={dance.server} />;

  return (
    <div className="mx-auto max-w-[720px] lg:max-w-[980px]" data-rooms-page>
      <PageHeader
        title={info ? info.name : tx("rooms.rooms")}
        subtitle={
          info
            ? tx("rooms.room", {
                code: formatRoomCode(info.code),
                p1: others.length
                  ? tx("rooms.with", { others: others.join(", ") })
                  : tx("rooms.only_you_here_right_now"),
                p2: r.status === "offline" ? tx("rooms.reconnecting") : "",
              })
            : tx("rooms.edit_one_night_with_other_djs")
        }
        trailing={
          info ? (
            <Tip text={tx("rooms.show_the_room_s_code_and")}>
              <button
                type="button"
                className="btn btn-plain min-h-11"
                onClick={() => setQrOpen(true)}
                aria-label={tx("rooms.invite")}
              >
                <Users size={18} aria-hidden /> {tx("rooms.invite")}
              </button>
            </Tip>
          ) : undefined
        }
      />

      {r.error && (
        <Group>
          <div className="cell" role="alert" data-testid="rooms-error">
            <TriangleAlert size={18} className="shrink-0 text-[var(--destructive)]" aria-hidden />
            <span className="min-w-0 flex-1">{r.error}</span>
          </div>
        </Group>
      )}

      {needsServer && !inRoom && (
        <Group header={tx("rooms.needs_a_linked_server")} data-testid="rooms-needs-server">
          <div className="cell">
            <Server size={18} className="shrink-0 text-[var(--label-2)]" aria-hidden />
            <span className="min-w-0 flex-1">{tx("rooms.rooms_need_a_linked_server")}</span>
          </div>
          <ActionRow
            label={tx("rooms.open_settings_connections")}
            onClick={() => router.push("/settings#app-connections")}
            id="rooms-open-connections"
          />
        </Group>
      )}

      {!inRoom && !needsServer && (
        <>
          <Group
            header={tx("rooms.you")}
            footer={
              <span data-testid="room-user-note" aria-live="polite">
                {nameSaved ? tx("rooms.name_saved") : ""}
                {tx("rooms.other_djs_see_this_name_next")}
              </span>
            }
          >
            <FieldRow label={tx("rooms.your_name")} id="room-user">
              <input
                id="room-user"
                className="field min-w-0 flex-1 text-right"
                placeholder={tx("rooms.dj_name")}
                maxLength={ROOM_USER_MAX}
                value={nameDraft}
                onChange={(e) => {
                  setNameDraft(e.target.value);
                  setNameSaved(false);
                }}
                onBlur={saveUser}
                autoComplete="nickname"
                data-testid="room-user"
              />
            </FieldRow>
          </Group>

          {remote && code && (
            <Group
              header={tx("rooms.invitation")}
              footer={tx("rooms.this_room_is_kept_by_joining", { p1: host(remote) })}
            >
              <ActionRow
                label={tx("rooms.join_room_on", { code: formatRoomCode(code), p1: host(remote) })}
                onClick={() => join(code, remote)}
                busy={busy}
              />
            </Group>
          )}

          <Group header={tx("rooms.join_a_room")} footer={tx("rooms.ask_the_dj_who_made_the")}>
            <form
              className="cell gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void join(code, remote);
              }}
            >
              <input
                className="field min-w-0 flex-1 font-mono uppercase tracking-[0.2em]"
                placeholder={tx("rooms.abc_234")}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                maxLength={8}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                aria-label={tx("rooms.room_code")}
                data-testid="room-code-input"
              />
              <Tip text={tx("rooms.join_this_room_and_load_its")}>
                <button
                  type="submit"
                  className="btn btn-primary min-h-[44px]"
                  disabled={!normalizeRoomCode(code) || busy}
                  data-testid="room-join"
                >
                  {tx("rooms.join")}
                </button>
              </Tip>
            </form>
          </Group>

          <Group
            header={tx("rooms.new_room")}
            footer={
              night ? tx("rooms.everyone_in_the_room_edits_this") : tx("rooms.compose_a_night_first_or_start")
            }
          >
            <FieldRow label={tx("rooms.room_name")} id="room-name">
              <input
                id="room-name"
                className="field min-w-0 flex-1 text-right"
                placeholder={r.user ? tx("rooms.s_room", { user: r.user }) : tx("rooms.saturday_milonga")}
                maxLength={ROOM_NAME_MAX}
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                data-testid="room-name"
              />
            </FieldRow>
            <SwitchRow label={tx("rooms.start_with_a_night")} checked={withNight} onChange={setWithNight} />
            {withNight && (
              <Row
                tile={
                  night ? (
                    <NightCover night={night} size={44} className="rounded-[8px]" />
                  ) : (
                    <Tile color="#8e8e93">
                      <ListMusic size={16} strokeWidth={2} />
                    </Tile>
                  )
                }
                label={night ? night.name : tx("rooms.no_night_composed_yet")}
                sub={
                  night
                    ? tx("rooms.night_facts", { n: night.tandas.length, date: day(night.createdAt) })
                    : tx("rooms.choose_a_night_sub")
                }
                value={tx("rooms.choose")}
                chevron
                onClick={() => setPicking("create")}
                data-testid="room-choose-night"
              />
            )}
            <ActionRow label={tx("rooms.create_room")} onClick={create} busy={busy} id="room-create" />
          </Group>
          {/* 2026-11: start a room from a Spotify / YouTube playlist or a file (app/import → "Start a room") */}
          <Group>
            <TipRow
              label={tx("import.entry")}
              sub={tx("import.entry_sub")}
              chevron
              onClick={() => router.push("/import")}
            />
          </Group>
        </>
      )}

      {info && (
        <>
          <div className="mb-3 px-1">
            <Segmented
              size="large"
              label={tx("rooms.room_view")}
              value={tab}
              items={[
                ["night", tx("rooms.tab_night")],
                ["log", r.log.length ? tx("rooms.tab_log_n", { n: r.log.length }) : tx("rooms.tab_log")],
              ]}
              onChange={setTab}
            />
          </div>

          {tab === "night" && (
            <>
              {r.waitingForNight && (
                <Group footer={tx("rooms.the_room_has_no_night_yet")}>
                  {playlist ? (
                    <ActionRow
                      label={tx("rooms.share_with_the_room", { name: playlist.name })}
                      onClick={() => void r.shareNight()}
                    />
                  ) : (
                    <TipRow
                      label={tx("rooms.compose_a_night")}
                      chevron
                      onClick={() => location.assign("/")}
                    />
                  )}
                </Group>
              )}
              {playlist && !r.waitingForNight && (
                <>
                  {/* 2026-11 (the owner: "not all functions available in other editors are available in the
                      rooms"): the whole night with Compose's editing — every change reaches the other DJs */}
                  <NightEditor
                    idPrefix="room"
                    testId="room-tandas"
                    onMovedTanda={(from) => {
                      const slot = info?.slots[from];
                      if (slot) r.moveHint(slot);
                    }}
                  />
                  <Group
                    header={tx("rooms.night_settings")}
                    footer={tx("rooms.a_change_here_reaches_every_dj")}
                  >
                    <FieldRow label={tx("rooms.night_name")} id="room-night-name">
                      <input
                        id="room-night-name"
                        key={playlist.name}
                        className="field min-w-0 flex-1 text-right"
                        defaultValue={playlist.name}
                        maxLength={200}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v && v !== playlist.name) edit((p) => ({ ...p, name: v }));
                        }}
                        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                        data-testid="room-night-name"
                      />
                    </FieldRow>
                    <SwitchRow
                      label={tx("rooms.last_4_tandas_tango_only")}
                      sub={tx("rooms.skips_any_vals_or_milonga_among")}
                      checked={!!playlist.options.rules?.lastFourTango}
                      onChange={(v) =>
                        edit((p) => ({
                          ...p,
                          options: {
                            ...p.options,
                            rules: { ...(p.options.rules ?? {}), lastFourTango: v || undefined },
                          },
                        }))
                      }
                    />
                    <Link
                      href="/#result"
                      className="cell cell-tap"
                      data-leading="tile"
                      title={tx("rooms.swap_songs_and_tandas_in_the")}
                      data-testid="room-open-compose"
                    >
                      <Tile color="#007aff">
                        <ListMusic size={16} strokeWidth={2} />
                      </Tile>
                      <span className="min-w-0 flex-1">{tx("rooms.load_in_compose")}</span>
                    </Link>
                    <Link
                      href="/booth"
                      className="cell cell-tap"
                      data-leading="tile"
                      title={tx("rooms.load_in_booth_tip")}
                      data-testid="room-open-booth"
                    >
                      <Tile color="#af2c5a">
                        <Play size={16} strokeWidth={2} />
                      </Tile>
                      <span className="min-w-0 flex-1">{tx("rooms.load_in_booth")}</span>
                    </Link>
                    {owner && (
                      <TipRow
                        tile={
                          <Tile color="#5856d6">
                            <Replace size={16} strokeWidth={2} />
                          </Tile>
                        }
                        label={tx("rooms.switch_night")}
                        chevron
                        onClick={() => setPicking("switch")}
                        tip={tx("rooms.switch_night_tip")}
                        data-testid="room-switch-night"
                      />
                    )}
                  </Group>
                  {r.missing.length > 0 && (
                    <Group
                      header={tx("rooms.not_in_this_catalogue")}
                      footer={tx("rooms.shared_by_another_dj_they_stay")}
                    >
                      {r.missing.map((m) => (
                        <TipRow key={`${m.where}-${m.title}`} label={m.title} sub={`${m.where} · ${m.by}`} />
                      ))}
                    </Group>
                  )}
                </>
              )}
            </>
          )}

          {tab === "log" && <LogList log={r.log} me={r.user} />}

          <Group>
            <TipRow
              tile={
                <Tile color="#8e8e93">
                  <Pencil size={16} strokeWidth={2} />
                </Tile>
              }
              label={tx("rooms.rename_room")}
              value={info.name}
              chevron
              onClick={() => {
                setRenameDraft(info.name);
                setRenaming(true);
              }}
              tip={tx("rooms.give_the_room_a_new_name")}
              data-testid="room-rename"
            />
            <ActionRow label={tx("rooms.leave_room")} destructive onClick={r.leave} id="room-leave" />
            {owner && (
              <ActionRow
                label={tx("rooms.close_room")}
                destructive
                onClick={() => setClosing({ code: info.code, server: info.server, name: info.name })}
                id="room-close"
              />
            )}
          </Group>
        </>
      )}

      {previous.length > 0 && (
        <Group
          header={
            <span className="flex items-center justify-between gap-2">
              <span>{tx("rooms.previous_rooms")}</span>
              <button
                type="button"
                className="btn-plain min-h-11 text-[length:var(--text-subhead)] normal-case"
                onClick={() => setEditing((v) => !v)}
                aria-pressed={editing}
                data-testid="rooms-edit"
              >
                {editing ? tx("rooms.done") : tx("rooms.edit")}
              </button>
            </span>
          }
          footer={tx("rooms.rooms_you_were_in_expire", { days: 30 })}
          data-testid="rooms-previous"
        >
          {previous.map((p) => {
            const left = expiresInDays(p.lastSeen);
            const sub = `${formatRoomCode(p.code)}${p.server ? ` · ${host(p.server)}` : ""} · ${day(p.lastSeen)} · ${
              left > 0 ? tx("rooms.expires_in", { n: left }) : tx("rooms.expired")
            }`;
            const remove = () => {
              if (p.owner) return setClosing(p);
              r.forget(p.code);
              toast(tx("rooms.removed_from_list", { name: p.name }));
            };
            const row = (
              <TipRow
                tile={
                  <Tile color="#af52de">
                    <DoorOpen size={16} strokeWidth={2} />
                  </Tile>
                }
                label={`${p.name}${p.owner ? ` · ${tx("rooms.yours")}` : ""}`}
                sub={sub}
                chevron={!editing}
                onClick={() => void openPast(p)}
                tip={tx("rooms.read_what_happened_in_this_room")}
                data-testid={`room-past-${p.code}`}
              />
            );
            return (
              <div key={`${p.server}-${p.code}`} className="flex items-center" data-testid="room-past-row">
                <div className="min-w-0 flex-1">
                  <SwipeRow
                    actions={[
                      {
                        kind: "destructive",
                        label: p.owner ? tx("rooms.delete_room") : tx("rooms.remove"),
                        icon: Trash2,
                        onClick: remove,
                      },
                    ]}
                  >
                    {row}
                  </SwipeRow>
                </div>
                {editing && (
                  <button
                    type="button"
                    className="icon-btn icon-btn-bare h-11 w-11 shrink-0 text-[var(--destructive)]"
                    aria-label={
                      p.owner
                        ? tx("rooms.delete_room_named", { name: p.name })
                        : tx("rooms.remove_named", { name: p.name })
                    }
                    onClick={remove}
                    data-testid={`room-delete-${p.code}`}
                  >
                    <Trash2 size={18} aria-hidden />
                  </button>
                )}
              </div>
            );
          })}
          <ActionRow
            label={tx("rooms.delete_old")}
            destructive
            onClick={() => setOldOpen(true)}
            id="rooms-delete-old"
          />
        </Group>
      )}

      <Sheet
        open={qrOpen}
        onClose={() => setQrOpen(false)}
        title={tx("rooms.invite_djs")}
        trailing={tx("rooms.done")}
        testId="room-invite"
        initialFocus="title"
      >
        {info && (
          <>
            <div className="flex flex-col items-center gap-3 px-4 pb-4">
              <span className="text-footnote text-[var(--label-2)]">{tx("rooms.room_code")}</span>
              <span className="font-mono text-[34px] font-semibold tracking-[0.18em]" data-testid="room-code">
                {formatRoomCode(info.code)}
              </span>
              <QrCode value={link} label={tx("rooms.code_to_join", { name: info.name })} size={200} />
            </div>
            <Group footer={tx("rooms.the_code_works_in_t_dj")}>
              <TipRow
                tile={
                  <Tile color="#007aff">
                    <Copy size={16} strokeWidth={2} />
                  </Tile>
                }
                label={tx("rooms.copy_link")}
                onClick={async () =>
                  toast(
                    (await copyText(link)) ? tx("rooms.room_link_copied") : tx("rooms.copying_was_blocked"),
                  )
                }
                tip={tx("rooms.copies_a_link_that_opens_this")}
              />
              <TipRow
                tile={
                  <Tile color="#5856d6">
                    <Smartphone size={16} strokeWidth={2} />
                  </Tile>
                }
                label={tx("rooms.copy_link_for_the_app")}
                onClick={async () =>
                  toast(
                    (await copyText(appLink)) ? tx("rooms.app_link_copied") : tx("rooms.copying_was_blocked"),
                  )
                }
                tip={tx("rooms.copies_a_tdj_link_that_opens")}
              />
              <TipRow
                tile={
                  <Tile color="#636366">
                    <QrIcon size={16} strokeWidth={2} />
                  </Tile>
                }
                label={tx("rooms.copy_code")}
                value={info.code}
                onClick={async () =>
                  toast(
                    (await copyText(info.code)) ? tx("rooms.code_copied") : tx("rooms.copying_was_blocked"),
                  )
                }
                tip={tx("rooms.copies_the_six_character_code")}
              />
              {/* 2026-11: dancers heart the playing song (anonymous counts into the DJ's dancer favourites) */}
              <TipRow
                tile={
                  <Tile color="#c9426a">
                    <Heart size={16} strokeWidth={2} />
                  </Tile>
                }
                label={tx("fav.dancer_link")}
                onClick={async () => {
                  const origin = info.server || location.origin;
                  const url = `${origin}/rooms?dance=${info.code}${info.server ? `&server=${encodeURIComponent(info.server)}` : ""}`;
                  toast(
                    (await copyText(url)) ? tx("fav.dancer_link_copied") : tx("rooms.copying_was_blocked"),
                  );
                }}
                tip={tx("fav.dancer_link_tip")}
              />
            </Group>
          </>
        )}
      </Sheet>

      <Sheet
        open={renaming}
        onClose={() => setRenaming(false)}
        title={tx("rooms.rename_room")}
        trailing={tx("rooms.save")}
        onTrailing={() => {
          if (renameDraft.trim()) void r.rename(renameDraft);
          setRenaming(false);
        }}
        detents={["medium"]}
      >
        <Group footer={tx("rooms.everyone_in_the_room_sees_the")}>
          <FieldRow label={tx("rooms.name")} id="room-rename-field">
            <input
              id="room-rename-field"
              className="field min-w-0 flex-1 text-right"
              value={renameDraft}
              maxLength={ROOM_NAME_MAX}
              onChange={(e) => setRenameDraft(e.target.value)}
              data-testid="room-rename-field"
            />
          </FieldRow>
        </Group>
      </Sheet>

      <NightPicker
        open={picking !== null}
        onClose={() => setPicking(null)}
        title={picking === "switch" ? tx("rooms.switch_night") : tx("rooms.choose_a_night")}
        action={picking === "switch" ? tx("rooms.switch_to_this_night") : tx("rooms.use_this_night")}
        onUse={(p) => {
          if (picking === "switch") setSwitchTo(p);
          else setChosen(p);
        }}
      />
      <Sheet
        open={!!switchTo}
        onClose={() => setSwitchTo(null)}
        title={tx("rooms.switch_night")}
        detents={["medium"]}
        testId="room-switch-confirm"
      >
        {switchTo && (
          <Group footer={tx("rooms.switch_night_footer")}>
            <Row
              tile={<NightCover night={switchTo} size={44} className="rounded-[8px]" />}
              label={switchTo.name}
              sub={tx("rooms.night_facts", { n: switchTo.tandas.length, date: day(switchTo.createdAt) })}
            />
            <ActionRow
              label={tx("rooms.switch_for_everyone")}
              onClick={async () => {
                const p = switchTo;
                setSwitchTo(null);
                adoptNight(p);
                if (await r.switchNight(p)) toast(tx("rooms.switched", { name: p.name }));
              }}
              id="room-switch-yes"
            />
          </Group>
        )}
      </Sheet>
      <Sheet
        open={!!closing}
        onClose={() => setClosing(null)}
        title={tx("rooms.close_room")}
        detents={["medium"]}
        testId="room-close-confirm"
      >
        {closing && (
          <Group footer={tx("rooms.close_room_footer")}>
            <Row label={closing.name} sub={formatRoomCode(closing.code)} />
            <ActionRow
              label={tx("rooms.close_for_everyone")}
              destructive
              onClick={async () => {
                const c = closing;
                setClosing(null);
                if (await r.close({ code: c.code, server: c.server }))
                  toast(tx("rooms.closed", { name: c.name }));
              }}
              id="room-close-yes"
            />
          </Group>
        )}
      </Sheet>
      <Sheet
        open={oldOpen}
        onClose={() => setOldOpen(false)}
        title={tx("rooms.delete_old")}
        detents={["medium"]}
        testId="rooms-delete-old-sheet"
      >
        <Group footer={tx("rooms.delete_old_footer")}>
          <PickerRow
            label={tx("rooms.idle_for")}
            value={String(oldDays)}
            items={[
              ["7", tx("rooms.days", { n: 7 })],
              ["14", tx("rooms.days", { n: 14 })],
              ["30", tx("rooms.days", { n: 30 })],
            ]}
            onChange={(v) => v && setOldDays(Number(v))}
          />
          <ActionRow
            label={tx("rooms.delete_old_n", {
              n: previous.filter((p) => Date.parse(p.lastSeen) < Date.now() - oldDays * 864e5).length,
            })}
            destructive
            onClick={async () => {
              setOldOpen(false);
              const n = await r.forgetOld(oldDays);
              toast(tx("rooms.deleted_old", { n }));
            }}
            id="rooms-delete-old-yes"
          />
        </Group>
      </Sheet>
      <Sheet
        open={!!past}
        onClose={() => setPast(null)}
        title={past?.name ?? ""}
        detents={["large"]}
        testId="room-past"
      >
        {past && (
          <>
            {past.log === null ? (
              <p className="text-subhead py-8 text-center text-[var(--label-2)]">
                {tx("rooms.loading_the_log")}
              </p>
            ) : past.log.length ? (
              <LogList log={past.log} me={r.user} />
            ) : (
              <p className="section-foot">{tx("rooms.this_room_s_log_is_no")}</p>
            )}
            <Group>
              <ActionRow
                label={tx("rooms.rejoin_this_room")}
                onClick={() => {
                  const ref = past.ref;
                  setPast(null);
                  if (r.active) r.leave();
                  void join(ref.code, ref.server);
                }}
              />
              <ActionRow
                label={tx("rooms.remove_from_this_list")}
                destructive
                onClick={() => {
                  r.forget(past.ref.code);
                  setPast(null);
                }}
              />
            </Group>
          </>
        )}
      </Sheet>
      {inRoom && !info && (
        <p className="text-subhead py-8 text-center text-[var(--label-2)]" role="status">
          <LogOut size={16} className="mr-1 inline" aria-hidden />

          {tx("rooms.connecting_to_the_room")}
        </p>
      )}
    </div>
  );
}
