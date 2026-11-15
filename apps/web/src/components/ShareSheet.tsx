"use client";
import { FileDown, FolderOpen, Link2, QrCode as QrIcon, Share2, Smartphone, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { haptic } from "@/lib/haptics";
import {
  copyText,
  type NightShare,
  QR_MAX_CHARS,
  saveNightFile,
  shareNight,
  shortNightLink,
} from "@/lib/share";
import { toast } from "@/lib/toast";
import type { Playlist } from "@/lib/types";
import { Group, Tile } from "./Form";
import { QrCode } from "./QrCode";
import { Sheet } from "./Sheet";
import { TipRow } from "./TipRow";

/** The Export sheet's entry point: one row that opens the share sheet. */
export function ShareNightEntry({ playlist }: { playlist: Playlist | null }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Group footer="Another DJ, another device or the T-DJ app opens it as you made it.">
        <TipRow
          tile={
            <Tile color="#007aff">
              <Share2 size={16} strokeWidth={2} />
            </Tile>
          }
          label="Share this night"
          sub="Link, file or a code to scan"
          chevron
          onClick={() => setOpen(true)}
          tip="Send the whole night to another DJ or device"
          id="export-share"
        />
      </Group>
      <ShareSheet open={open} onClose={() => setOpen(false)} playlist={playlist} />
    </>
  );
}

/**
 * Share a composed night (ROADMAP §13): a link that carries the whole night in its fragment (nothing is uploaded),
 * the same link for the Mac and iPad apps, a `.tdjnight` file, and a code to scan from a phone. The code holds a
 * short link this site keeps when it can, else the full link when it is short enough.
 */
export function ShareSheet({
  open,
  onClose,
  playlist,
}: {
  open: boolean;
  onClose: () => void;
  playlist: Playlist | null;
}) {
  const [share, setShare] = useState<NightShare | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [qrBusy, setQrBusy] = useState(false);
  const [qrNote, setQrNote] = useState<string | null>(null);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  useEffect(() => {
    if (!open || !playlist) return;
    let alive = true;
    setShare(null);
    setQr(null);
    setQrNote(null);
    void shareNight(playlist).then((s) => alive && setShare(s));
    return () => {
      alive = false;
    };
  }, [open, playlist]);

  if (!playlist) return null;
  const tandas = playlist.tandas.length;
  const sides = playlist.tandas.reduce((a, t) => a + t.songs.length, 0);

  const copy = async (text: string | null | undefined, what: string) => {
    if (!text) return;
    haptic(6);
    toast((await copyText(text)) ? `${what} copied` : "Copying was blocked by the browser");
  };
  const showCode = async () => {
    if (!share) return;
    setQrBusy(true);
    const short = await shortNightLink(share.night);
    setQrBusy(false);
    if (short) setQr(short);
    else if (share.link && share.link.length <= QR_MAX_CHARS) setQr(share.link);
    else setQrNote("This night is too long for a code. Send the link or the file instead.");
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Share this night"
      detents={["large"]}
      testId="share-sheet"
      trailing="Done"
    >
      <p className="px-4 pb-3 text-footnote text-[var(--label-2)]">
        “{playlist.name}” · {tandas} tandas · {sides} songs · score {playlist.score.total}. Anyone you send it
        to can open it in T-DJ, play it and export it to Spotify. Keys and accounts never travel with it.
      </p>
      <Group
        footer={share?.linkError ?? "The link carries the whole night, so nothing is uploaded to share it."}
      >
        <TipRow
          tile={
            <Tile color="#007aff">
              <Link2 size={16} strokeWidth={2} />
            </Tile>
          }
          label="Copy link"
          sub="Opens on any T-DJ site"
          onClick={() => copy(share?.link, "Link")}
          disabled={!share?.link}
          busy={!share}
          tip="Copies a link that opens this night on any T-DJ site"
          data-testid="share-copy-link"
        />
        <TipRow
          tile={
            <Tile color="#5856d6">
              <Smartphone size={16} strokeWidth={2} />
            </Tile>
          }
          label="Copy link for the app"
          sub="Opens straight in T-DJ on Mac and iPad"
          onClick={() => copy(share?.appLink, "App link")}
          disabled={!share?.appLink}
          tip="Copies a tdj:// link that opens this night in the installed T-DJ app"
          data-testid="share-copy-app-link"
        />
        {canShare && share?.link && (
          <TipRow
            tile={
              <Tile color="#34c759">
                <Share2 size={16} strokeWidth={2} />
              </Tile>
            }
            label="Share…"
            sub="Messages, Mail, AirDrop"
            onClick={() => navigator.share({ title: playlist.name, url: share.link! }).catch(() => {})}
            tip="Opens the system share sheet with the link"
          />
        )}
        <TipRow
          tile={
            <Tile color="#ff9500">
              <FileDown size={16} strokeWidth={2} />
            </Tile>
          }
          label="Save as a file"
          sub=".tdjnight · open it in T-DJ anywhere"
          onClick={() => share && saveNightFile(share.night)}
          disabled={!share}
          tip="Saves the night as a .tdjnight file you can AirDrop, mail or keep"
          data-testid="share-save-file"
        />
      </Group>

      <Group header="Scan with a phone or iPad">
        {qr ? (
          <div className="cell flex-col items-center gap-3 py-5">
            <QrCode value={qr} label={`Code for ${playlist.name}`} />
            <span className="text-footnote text-center text-[var(--label-2)]">
              Point the camera at the code to open this night.
            </span>
          </div>
        ) : (
          <TipRow
            tile={
              <Tile color="#636366">
                <QrIcon size={16} strokeWidth={2} />
              </Tile>
            }
            label="Show a code"
            sub={qrNote ?? "Hold it up to a phone or an iPad"}
            onClick={showCode}
            busy={qrBusy}
            disabled={!share || !!qrNote}
            tip="Shows a QR code that opens this night on another device"
            data-testid="share-show-code"
          />
        )}
      </Group>

      <Group header="More">
        <Link
          href="/rooms"
          className="cell cell-tap"
          data-leading="tile"
          onClick={onClose}
          title="Several DJs edit one night live"
        >
          <Tile color="#af52de">
            <Users size={16} strokeWidth={2} />
          </Tile>
          <span className="min-w-0 flex-1">
            <span className="block truncate">Edit together in a room</span>
            <span className="text-footnote block truncate text-[var(--label-2)]">
              Share a code, every DJ sees each edit
            </span>
          </span>
        </Link>
        <Link
          href="/night"
          className="cell cell-tap"
          data-leading="tile"
          onClick={onClose}
          title="Open a night someone sent you"
        >
          <Tile color="#8e8e93">
            <FolderOpen size={16} strokeWidth={2} />
          </Tile>
          <span className="min-w-0 flex-1">
            <span className="block truncate">Open a night file or link</span>
            <span className="text-footnote block truncate text-[var(--label-2)]">
              From another DJ or another device
            </span>
          </span>
        </Link>
      </Group>
    </Sheet>
  );
}
