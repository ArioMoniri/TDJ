/**
 * 2026-11 (Part A: "if the Spotify app is interrupted the Booth must notice and offer Resume rather than drift"). A
 * Spotify item the Booth did not pause, reported paused in the middle of the song for a moment: a call, Siri, an
 * alarm, another app taking the audio, or someone pressing pause on the device. The night's clock would otherwise
 * run on and start the next song over the silence. The watch says so once per stop; a natural end (at 0 or the last
 * seconds) is the item's end, not an interruption.
 */
export class PauseWatch {
  private since: number | null = null;
  private fired = false;
  constructor(
    /** how long a mid-song pause must last (ms): Spotify reports a brief pause while it buffers or seeks */
    private holdMs = 2500,
  ) {}

  /** `true` once when the item has been paused mid-song for `holdMs` */
  observe(s: { playing: boolean; positionSec: number; durationSec: number }, nowMs: number): boolean {
    const mid = s.positionSec > 1 && (s.durationSec <= 0 || s.positionSec < s.durationSec - 3);
    if (s.playing || !mid) {
      this.since = null;
      this.fired = false;
      return false;
    }
    if (this.fired) return false;
    if (this.since === null) this.since = nowMs;
    if (nowMs - this.since < this.holdMs) return false;
    this.fired = true;
    return true;
  }
  reset() {
    this.since = null;
    this.fired = false;
  }
}
