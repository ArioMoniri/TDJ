"use client";
import {
  appRoomLink,
  formatRoomCode,
  normalizeRoomCode,
  ROOM_NAME_MAX,
  ROOM_USER_MAX,
  type RoomLogEntry,
  renight,
} from "@tdj/core";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  DoorOpen,
  Heart,
  ListMusic,
  Lock,
  LockOpen,
  LogOut,
  Pencil,
  QrCode as QrIcon,
  Server,
  SkipForward,
  Smartphone,
  TriangleAlert,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { DancerHeart } from "@/components/DancerHeart";
import { ActionRow, FieldRow, Group, RhythmTile, SwitchRow, Tile } from "@/components/Form";
import { PageHeader } from "@/components/PageHeader";
import { QrCode } from "@/components/QrCode";
import { Sheet } from "@/components/Sheet";
import { TipRow } from "@/components/TipRow";
import { Segmented } from "@/components/ui";
import { TandaPlayCover } from "@/components/ui/TandaPlay";
import { Tip } from "@/components/ui/Tip";
import { nativeInfo } from "@/lib/app/native";
import { APP } from "@/lib/app/target";
import { haptic } from "@/lib/haptics";
import { fmtDate, fmtTime, t as tx, upper } from "@/lib/i18n";
import { type RoomRef, roomShareLink, useRooms } from "@/lib/rooms";
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

/** a 44 pt icon button with its one-line explanation on hover */
function IconButton({
  label,
  onClick,
  disabled,
  on,
  children,
  testId,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  on?: boolean;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <Tip text={label}>
      <button
        type="button"
        className={`grid h-11 w-11 shrink-0 place-items-center rounded-full disabled:opacity-30 ${on ? "bg-[var(--fill-3)] text-[var(--tint)]" : "text-[var(--label-2)]"}`}
        onClick={(e) => {
          e.stopPropagation();
          haptic(4);
          onClick();
        }}
        disabled={disabled}
        aria-label={label}
        aria-pressed={on}
        data-testid={testId}
      >
        {children}
      </button>
    </Tip>
  );
}

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
  const move = (i: number, d: -1 | 1) =>
    edit((p) => {
      const j = i + d;
      if (j < 0 || j >= p.tandas.length) return p;
      const slot = info?.slots[i];
      if (slot) r.moveHint(slot);
      const t = [...p.tandas];
      [t[i], t[j]] = [t[j]!, t[i]!];
      return renight(
        p,
        t.map((x, k) => ({ ...x, index: k })),
      );
    });
  const toggle = (i: number, key: "locked" | "bypass") =>
    edit((p) => ({
      ...p,
      tandas: p.tandas.map((t, k) => (k === i ? { ...t, [key]: t[key] ? undefined : true } : t)),
    }));

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
    const ok = await r.create(roomName, withNight && !!playlist);
    setBusy(false);
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
              playlist
                ? tx("rooms.everyone_in_the_room_edits_this")
                : tx("rooms.compose_a_night_first_or_start")
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
            <SwitchRow
              label={tx("rooms.start_with_my_current_night")}
              sub={playlist ? playlist.name : tx("rooms.no_night_composed_yet")}
              checked={withNight && !!playlist}
              onChange={setWithNight}
              disabled={!playlist}
            />
            <ActionRow label={tx("rooms.create_room")} onClick={create} busy={busy} id="room-create" />
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
                  <Group
                    header={tx("rooms.tandas", { length: playlist.tandas.length })}
                    footer={tx("rooms.swap_songs_in_compose_every_dj")}
                    data-testid="room-tandas"
                  >
                    {playlist.tandas.map((t, i) => (
                      <div
                        key={`${i}-${t.songs[0]?.id}`}
                        className="cell gap-1 pr-1"
                        data-leading="art"
                        data-testid={`room-tanda-${i + 1}`}
                      >
                        <TandaPlayCover tanda={i} night={playlist}>
                          <RhythmTile rhythm={t.rhythm} />
                        </TandaPlayCover>
                        <span className="min-w-0 flex-1">
                          <span
                            className={`block truncate ${t.bypass ? "text-[var(--label-3)] line-through" : ""}`}
                          >
                            {i + 1}. {t.orchestra}
                            {t.singer ? ` · ${t.singer}` : ""}
                          </span>
                          <span className="text-footnote block truncate text-[var(--label-2)]">
                            {t.songs.map((s) => s.title).join(" · ")}
                          </span>
                        </span>
                        <IconButton
                          label={
                            t.locked
                              ? tx("rooms.unlock_tanda", { p1: i + 1 })
                              : tx("rooms.lock_tanda_keeps_it_when_the", { p1: i + 1 })
                          }
                          on={!!t.locked}
                          onClick={() => toggle(i, "locked")}
                          testId={`room-lock-${i + 1}`}
                        >
                          {t.locked ? <Lock size={18} aria-hidden /> : <LockOpen size={18} aria-hidden />}
                        </IconButton>
                        <IconButton
                          label={
                            t.bypass
                              ? tx("rooms.play_tanda_tonight", { p1: i + 1 })
                              : tx("rooms.skip_tanda_tonight_stays_in_exports", { p1: i + 1 })
                          }
                          on={!!t.bypass}
                          onClick={() => toggle(i, "bypass")}
                          testId={`room-skip-${i + 1}`}
                        >
                          <SkipForward size={18} aria-hidden />
                        </IconButton>
                        <IconButton
                          label={tx("rooms.move_tanda_earlier", { p1: i + 1 })}
                          onClick={() => move(i, -1)}
                          disabled={i === 0}
                          testId={`room-up-${i + 1}`}
                        >
                          <ArrowUp size={18} aria-hidden />
                        </IconButton>
                        <IconButton
                          label={tx("rooms.move_tanda_later", { p1: i + 1 })}
                          onClick={() => move(i, 1)}
                          disabled={i === playlist.tandas.length - 1}
                          testId={`room-down-${i + 1}`}
                        >
                          <ArrowDown size={18} aria-hidden />
                        </IconButton>
                      </div>
                    ))}
                  </Group>
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
                    >
                      <Tile color="#007aff">
                        <ListMusic size={16} strokeWidth={2} />
                      </Tile>
                      <span className="min-w-0 flex-1">{tx("rooms.open_in_compose")}</span>
                    </Link>
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
          </Group>
        </>
      )}

      {previous.length > 0 && (
        <Group header={tx("rooms.previous_rooms")} footer={tx("rooms.rooms_you_were_in_on_this")}>
          {previous.map((p) => (
            <TipRow
              key={`${p.server}-${p.code}`}
              tile={
                <Tile color="#af52de">
                  <DoorOpen size={16} strokeWidth={2} />
                </Tile>
              }
              label={p.name}
              sub={`${formatRoomCode(p.code)}${p.server ? ` · ${host(p.server)}` : ""} · ${day(p.lastSeen)}`}
              chevron
              onClick={() => void openPast(p)}
              tip={tx("rooms.read_what_happened_in_this_room")}
              data-testid={`room-past-${p.code}`}
            />
          ))}
        </Group>
      )}

      <Sheet
        open={qrOpen}
        onClose={() => setQrOpen(false)}
        title={tx("rooms.invite_djs")}
        trailing={tx("rooms.done")}
        testId="room-invite"
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
