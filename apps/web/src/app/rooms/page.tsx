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
  ListMusic,
  Lock,
  LockOpen,
  LogOut,
  Pencil,
  QrCode as QrIcon,
  SkipForward,
  Smartphone,
  TriangleAlert,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ActionRow, FieldRow, Group, RhythmTile, SwitchRow, Tile } from "@/components/Form";
import { PageHeader } from "@/components/PageHeader";
import { QrCode } from "@/components/QrCode";
import { Sheet } from "@/components/Sheet";
import { TipRow } from "@/components/TipRow";
import { Segmented } from "@/components/ui";
import { Tip } from "@/components/ui/Tip";
import { haptic } from "@/lib/haptics";
import { type RoomRef, roomShareLink, useRooms } from "@/lib/rooms";
import { copyText } from "@/lib/share";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import type { Playlist } from "@/lib/types";

const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
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
  if (!items.length) return <p className="section-foot">Nothing has happened in this room yet.</p>;
  return (
    <Group data-testid="room-log">
      {items.map((e, i) => (
        <div key={`${e.rev}-${i}`} className="cell items-start" data-kind={e.kind}>
          {e.kind === "conflict" ? (
            <Tip text="Two DJs changed the same thing; the later change was kept" className="mt-0.5 shrink-0">
              <TriangleAlert size={18} className="text-[var(--warning,#ff9500)]" aria-label="Conflict" />
            </Tip>
          ) : (
            <span
              className="mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-[var(--fill-3)] text-[10px] font-semibold"
              aria-hidden
            >
              {e.by.slice(0, 1).toUpperCase()}
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block">
              <b className="font-semibold">{e.by === me ? "You" : e.by}</b> {e.text}
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

  useEffect(() => {
    r.boot();
    const q = new URLSearchParams(location.search);
    const join = normalizeRoomCode(q.get("join"));
    if (join) setCode(join);
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
    if (!useRooms.getState().user) return toast("Choose your name first");
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
    if (!useRooms.getState().user) return toast("Choose your name first");
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

  return (
    <div className="mx-auto max-w-[720px] lg:max-w-[980px]" data-rooms-page>
      <PageHeader
        title={info ? info.name : "Rooms"}
        subtitle={
          info
            ? `Room ${formatRoomCode(info.code)} · ${
                others.length ? `with ${others.join(", ")}` : "only you here right now"
              }${r.status === "offline" ? " · reconnecting…" : ""}`
            : "Edit one night with other DJs, live."
        }
        trailing={
          info ? (
            <Tip text={"Show the room's code and links"}>
              <button
                type="button"
                className="btn btn-plain min-h-11"
                onClick={() => setQrOpen(true)}
                aria-label="Invite"
              >
                <Users size={18} aria-hidden /> Invite
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

      {!inRoom && (
        <>
          <Group
            header="You"
            footer={
              <span data-testid="room-user-note" aria-live="polite">
                {nameSaved ? "Name saved. " : ""}Other DJs see this name next to your edits. No account
                needed.
              </span>
            }
          >
            <FieldRow label="Your name" id="room-user">
              <input
                id="room-user"
                className="field min-w-0 flex-1 text-right"
                placeholder="DJ name"
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
              header="Invitation"
              footer={`This room is kept by ${host(remote)}. Joining connects to that site while you are in the room.`}
            >
              <ActionRow
                label={`Join room ${formatRoomCode(code)} on ${host(remote)}`}
                onClick={() => join(code, remote)}
                busy={busy}
              />
            </Group>
          )}

          <Group header="Join a room" footer="Ask the DJ who made the room for its six-character code.">
            <form
              className="cell gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void join(code, remote);
              }}
            >
              <input
                className="field min-w-0 flex-1 font-mono uppercase tracking-[0.2em]"
                placeholder="ABC 234"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                maxLength={8}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                aria-label="Room code"
                data-testid="room-code-input"
              />
              <Tip text={"Join this room and load its night"}>
                <button
                  type="submit"
                  className="btn btn-primary min-h-[44px]"
                  disabled={!normalizeRoomCode(code) || busy}
                  data-testid="room-join"
                >
                  Join
                </button>
              </Tip>
            </form>
          </Group>

          <Group
            header="New room"
            footer={
              playlist
                ? "Everyone in the room edits this night together: swaps, locks, order and settings."
                : "Compose a night first, or start empty and share one later."
            }
          >
            <FieldRow label="Room name" id="room-name">
              <input
                id="room-name"
                className="field min-w-0 flex-1 text-right"
                placeholder={r.user ? `${r.user}’s room` : "Saturday milonga"}
                maxLength={ROOM_NAME_MAX}
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                data-testid="room-name"
              />
            </FieldRow>
            <SwitchRow
              label="Start with my current night"
              sub={playlist ? playlist.name : "No night composed yet"}
              checked={withNight && !!playlist}
              onChange={setWithNight}
              disabled={!playlist}
            />
            <ActionRow label="Create room" onClick={create} busy={busy} id="room-create" />
          </Group>
        </>
      )}

      {info && (
        <>
          <div className="mb-3 px-1">
            <Segmented
              size="large"
              label="Room view"
              value={tab}
              items={[
                ["night", "Night"],
                ["log", `Log${r.log.length ? ` · ${r.log.length}` : ""}`],
              ]}
              onChange={setTab}
            />
          </div>

          {tab === "night" && (
            <>
              {r.waitingForNight && (
                <Group footer="The room has no night yet. The next night anyone composes or shares lands here.">
                  {playlist ? (
                    <ActionRow
                      label={`Share “${playlist.name}” with the room`}
                      onClick={() => void r.shareNight()}
                    />
                  ) : (
                    <TipRow label="Compose a night" chevron onClick={() => location.assign("/")} />
                  )}
                </Group>
              )}
              {playlist && !r.waitingForNight && (
                <>
                  <Group
                    header={`Tandas · ${playlist.tandas.length}`}
                    footer="Swap songs in Compose: every DJ in the room sees the change and the log says who made it."
                    data-testid="room-tandas"
                  >
                    {playlist.tandas.map((t, i) => (
                      <div
                        key={`${i}-${t.songs[0]?.id}`}
                        className="cell gap-1 pr-1"
                        data-leading="art"
                        data-testid={`room-tanda-${i + 1}`}
                      >
                        <RhythmTile rhythm={t.rhythm} />
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
                              ? `Unlock tanda ${i + 1}`
                              : `Lock tanda ${i + 1} (keeps it when the night is recomposed)`
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
                              ? `Play tanda ${i + 1} tonight`
                              : `Skip tanda ${i + 1} tonight (stays in exports)`
                          }
                          on={!!t.bypass}
                          onClick={() => toggle(i, "bypass")}
                          testId={`room-skip-${i + 1}`}
                        >
                          <SkipForward size={18} aria-hidden />
                        </IconButton>
                        <IconButton
                          label={`Move tanda ${i + 1} earlier`}
                          onClick={() => move(i, -1)}
                          disabled={i === 0}
                          testId={`room-up-${i + 1}`}
                        >
                          <ArrowUp size={18} aria-hidden />
                        </IconButton>
                        <IconButton
                          label={`Move tanda ${i + 1} later`}
                          onClick={() => move(i, 1)}
                          disabled={i === playlist.tandas.length - 1}
                          testId={`room-down-${i + 1}`}
                        >
                          <ArrowDown size={18} aria-hidden />
                        </IconButton>
                      </div>
                    ))}
                  </Group>
                  <Group header="Night settings" footer="A change here reaches every DJ in the room.">
                    <FieldRow label="Night name" id="room-night-name">
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
                      label="Last 4 tandas tango only"
                      sub="Skips any vals or milonga among the last four"
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
                      title="Swap songs and tandas in the composer"
                    >
                      <Tile color="#007aff">
                        <ListMusic size={16} strokeWidth={2} />
                      </Tile>
                      <span className="min-w-0 flex-1">Open in Compose</span>
                    </Link>
                  </Group>
                  {r.missing.length > 0 && (
                    <Group
                      header="Not in this catalogue"
                      footer="Shared by another DJ; they stay in their tandas."
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
              label="Rename room"
              value={info.name}
              chevron
              onClick={() => {
                setRenameDraft(info.name);
                setRenaming(true);
              }}
              tip="Give the room a new name for everyone"
              data-testid="room-rename"
            />
            <ActionRow label="Leave room" destructive onClick={r.leave} id="room-leave" />
          </Group>
        </>
      )}

      {previous.length > 0 && (
        <Group header="Previous rooms" footer="Rooms you were in on this device. Open one to read its log.">
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
              tip="Read what happened in this room"
              data-testid={`room-past-${p.code}`}
            />
          ))}
        </Group>
      )}

      <Sheet
        open={qrOpen}
        onClose={() => setQrOpen(false)}
        title="Invite DJs"
        trailing="Done"
        testId="room-invite"
      >
        {info && (
          <>
            <div className="flex flex-col items-center gap-3 px-4 pb-4">
              <span className="text-footnote text-[var(--label-2)]">Room code</span>
              <span className="font-mono text-[34px] font-semibold tracking-[0.18em]" data-testid="room-code">
                {formatRoomCode(info.code)}
              </span>
              <QrCode value={link} label={`Code to join ${info.name}`} size={200} />
            </div>
            <Group footer="The code works in T-DJ on this site; the app link opens the room in T-DJ on Mac and iPad.">
              <TipRow
                tile={
                  <Tile color="#007aff">
                    <Copy size={16} strokeWidth={2} />
                  </Tile>
                }
                label="Copy link"
                onClick={async () =>
                  toast((await copyText(link)) ? "Room link copied" : "Copying was blocked")
                }
                tip="Copies a link that opens this room"
              />
              <TipRow
                tile={
                  <Tile color="#5856d6">
                    <Smartphone size={16} strokeWidth={2} />
                  </Tile>
                }
                label="Copy link for the app"
                onClick={async () =>
                  toast((await copyText(appLink)) ? "App link copied" : "Copying was blocked")
                }
                tip="Copies a tdj:// link that opens this room in the T-DJ app"
              />
              <TipRow
                tile={
                  <Tile color="#636366">
                    <QrIcon size={16} strokeWidth={2} />
                  </Tile>
                }
                label="Copy code"
                value={info.code}
                onClick={async () =>
                  toast((await copyText(info.code)) ? "Code copied" : "Copying was blocked")
                }
                tip="Copies the six-character code"
              />
            </Group>
          </>
        )}
      </Sheet>

      <Sheet
        open={renaming}
        onClose={() => setRenaming(false)}
        title="Rename room"
        trailing="Save"
        onTrailing={() => {
          if (renameDraft.trim()) void r.rename(renameDraft);
          setRenaming(false);
        }}
        detents={["medium"]}
      >
        <Group footer="Everyone in the room sees the new name.">
          <FieldRow label="Name" id="room-rename-field">
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
              <p className="text-subhead py-8 text-center text-[var(--label-2)]">Loading the log…</p>
            ) : past.log.length ? (
              <LogList log={past.log} me={r.user} />
            ) : (
              <p className="section-foot">This room's log is no longer kept by its server.</p>
            )}
            <Group>
              <ActionRow
                label="Rejoin this room"
                onClick={() => {
                  const ref = past.ref;
                  setPast(null);
                  if (r.active) r.leave();
                  void join(ref.code, ref.server);
                }}
              />
              <ActionRow
                label="Remove from this list"
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
          Connecting to the room…
        </p>
      )}
    </div>
  );
}
