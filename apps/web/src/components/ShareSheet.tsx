"use client";
import { FileDown, FolderOpen, Link2, QrCode as QrIcon, Share2, Smartphone, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { fileCheckLine } from "@/lib/exportCheckView";
import { verifyFile } from "@/lib/fileVerify";
import { haptic } from "@/lib/haptics";
import { t as tx } from "@/lib/i18n";
import { nightMusicSec } from "@/lib/lengths";
import { nightSub, nightTitle } from "@/lib/nightName";
import {
  copyText,
  type NightShare,
  QR_MAX_CHARS,
  saveNightFile,
  shareNight,
  shortNightLink,
} from "@/lib/share";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import type { Playlist } from "@/lib/types";
import { Group, Tile } from "./Form";
import { NightCover } from "./NightCover";
import { QrCode } from "./QrCode";
import { Sheet } from "./Sheet";
import { TipRow } from "./TipRow";

/** The Export sheet's entry point: one row that opens the share sheet. */
export function ShareNightEntry({ playlist }: { playlist: Playlist | null }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Group footer={tx("shareSheet.another_dj_another_device_or_the")}>
        <TipRow
          tile={
            <Tile color="#007aff">
              <Share2 size={16} strokeWidth={2} />
            </Tile>
          }
          label={tx("shareSheet.share_this_night")}
          sub={tx("shareSheet.link_file_or_a_code_to")}
          chevron
          onClick={() => setOpen(true)}
          tip={tx("shareSheet.send_the_whole_night_to_another")}
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
    toast(
      (await copyText(text))
        ? tx("shareSheet.copied", { what })
        : tx("shareSheet.copying_was_blocked_by_the_browser"),
    );
  };
  const showCode = async () => {
    if (!share) return;
    setQrBusy(true);
    const short = await shortNightLink(share.night);
    setQrBusy(false);
    if (short) setQr(short);
    else if (share.link && share.link.length <= QR_MAX_CHARS) setQr(share.link);
    else setQrNote(tx("shareSheet.this_night_is_too_long_for"));
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={tx("shareSheet.share_this_night")}
      detents={["large"]}
      testId="share-sheet"
      trailing={tx("shareSheet.done")}
    >
      {/* wave 4: the night's cover, as the link's preview and the .tdjnight file show it */}
      <div className="flex justify-center px-4 pb-3">
        <NightCover
          night={playlist}
          size={640}
          display={168}
          testId="share-cover"
          alt={tx("cover.alt", { title: nightTitle(playlist) })}
          className="shadow-md"
        />
      </div>
      <p className="px-4 pb-3 text-footnote text-[var(--label-2)]">
        {tx("shareSheet.tandas_songs_score_anyone_you_send", {
          playlist: nightTitle(playlist),
          playlist1: nightSub(playlist, nightMusicSec(playlist, useStore.getState().settings)),
          tandas,
          sides,
          p1: " ",
          total: playlist.score.total,
        })}
      </p>
      <Group footer={share?.linkError ?? tx("shareSheet.the_link_carries_the_whole_night")}>
        <TipRow
          tile={
            <Tile color="#007aff">
              <Link2 size={16} strokeWidth={2} />
            </Tile>
          }
          label={tx("shareSheet.copy_link")}
          sub={tx("shareSheet.opens_on_any_t_dj_site")}
          onClick={() => copy(share?.link, "Link")}
          disabled={!share?.link}
          busy={!share}
          tip={tx("shareSheet.copies_a_link_that_opens_this")}
          data-testid="share-copy-link"
        />
        <TipRow
          tile={
            <Tile color="#5856d6">
              <Smartphone size={16} strokeWidth={2} />
            </Tile>
          }
          label={tx("shareSheet.copy_link_for_the_app")}
          sub={tx("shareSheet.opens_straight_in_t_dj_on")}
          onClick={() => copy(share?.appLink, tx("shareSheet.app_link"))}
          disabled={!share?.appLink}
          tip={tx("shareSheet.copies_a_tdj_link_that_opens")}
          data-testid="share-copy-app-link"
        />
        {canShare && share?.link && (
          <TipRow
            tile={
              <Tile color="#34c759">
                <Share2 size={16} strokeWidth={2} />
              </Tile>
            }
            label={tx("shareSheet.share")}
            sub={tx("shareSheet.messages_mail_airdrop")}
            onClick={() => navigator.share({ title: playlist.name, url: share.link! }).catch(() => {})}
            tip={tx("shareSheet.opens_the_system_share_sheet_with")}
          />
        )}
        <TipRow
          tile={
            <Tile color="#ff9500">
              <FileDown size={16} strokeWidth={2} />
            </Tile>
          }
          label={tx("shareSheet.save_as_a_file")}
          sub={tx("shareSheet.tdjnight_open_it_in_t_dj")}
          onClick={() => {
            if (!share) return;
            // the file read back: the night's rows, in order, with their names and letters intact
            const text = saveNightFile(share.night);
            toast(
              fileCheckLine(
                tx("exportCheck.file_label", { label: "T-DJ" }),
                verifyFile("tdjnight", text, playlist),
              ),
            );
          }}
          disabled={!share}
          tip={tx("shareSheet.saves_the_night_as_a_tdjnight")}
          data-testid="share-save-file"
        />
      </Group>

      <Group header={tx("shareSheet.scan_with_a_phone_or_ipad")}>
        {qr ? (
          <div className="cell flex-col items-center gap-3 py-5">
            <QrCode value={qr} label={tx("shareSheet.code_for", { name: playlist.name })} />
            <span className="text-footnote text-center text-[var(--label-2)]">
              {tx("shareSheet.point_the_camera_at_the_code")}
            </span>
          </div>
        ) : (
          <TipRow
            tile={
              <Tile color="#636366">
                <QrIcon size={16} strokeWidth={2} />
              </Tile>
            }
            label={tx("shareSheet.show_a_code")}
            sub={qrNote ?? tx("shareSheet.hold_it_up_to_a_phone")}
            onClick={showCode}
            busy={qrBusy}
            disabled={!share || !!qrNote}
            tip={tx("shareSheet.shows_a_qr_code_that_opens")}
            data-testid="share-show-code"
          />
        )}
      </Group>

      <Group header={tx("shareSheet.more")}>
        <Link
          href="/rooms"
          className="cell cell-tap"
          data-leading="tile"
          onClick={onClose}
          title={tx("shareSheet.several_djs_edit_one_night_live")}
        >
          <Tile color="#af52de">
            <Users size={16} strokeWidth={2} />
          </Tile>
          <span className="min-w-0 flex-1">
            <span className="block truncate">{tx("shareSheet.edit_together_in_a_room")}</span>
            <span className="text-footnote block truncate text-[var(--label-2)]">
              {tx("shareSheet.share_a_code_every_dj_sees")}
            </span>
          </span>
        </Link>
        <Link
          href="/night"
          className="cell cell-tap"
          data-leading="tile"
          onClick={onClose}
          title={tx("shareSheet.open_a_night_someone_sent_you")}
        >
          <Tile color="#8e8e93">
            <FolderOpen size={16} strokeWidth={2} />
          </Tile>
          <span className="min-w-0 flex-1">
            <span className="block truncate">{tx("shareSheet.open_a_night_file_or_link")}</span>
            <span className="text-footnote block truncate text-[var(--label-2)]">
              {tx("shareSheet.from_another_dj_or_another_device")}
            </span>
          </span>
        </Link>
      </Group>
    </Sheet>
  );
}
