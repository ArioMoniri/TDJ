/**
 * 2026-11 (the owner: "the slider and the song playing are not always synced") — the position of a track an external
 * player plays (Spotify Connect, the Web Playback SDK, YouTube): a local clock that runs on its own between the
 * device's reports and is reconciled with each of them. A report is stamped at the moment its position was true (the
 * middle of the request's round trip, or the SDK's own timestamp), so the network's latency is not shown as lag.
 * An error under DEADBAND is noise and ignored; up to SNAP it is slewed out over SLEW_MS (the slider never jumps);
 * beyond, or when the device paused, the clock snaps to the device. Reading it is pure arithmetic on the clock, so
 * a throttled or hidden tab reads the right second on its return.
 */
export const DEADBAND_SEC = 0.1;
export const SNAP_SEC = 1.5;
export const SLEW_MS = 1000;

export class TrackClock {
  private pos = 0;
  private at = 0;
  playing = false;
  /** an error being slewed out: `err` seconds over SLEW_MS from `from` */
  private slew: { err: number; from: number } | null = null;

  constructor(private now: () => number) {}

  /** hard set (a start, a seek, a resume) */
  set(posSec: number, playing: boolean) {
    this.pos = posSec;
    this.at = this.now();
    this.playing = playing;
    this.slew = null;
  }

  /** the seconds into the track now */
  read(): number {
    const t = this.now();
    let v = this.pos + (this.playing ? (t - this.at) / 1000 : 0);
    if (this.slew) {
      const k = Math.min(1, Math.max(0, (t - this.slew.from) / SLEW_MS));
      v += this.slew.err * k;
      if (k >= 1) {
        // folded in: the clock carries it from here
        this.pos = v;
        this.at = t;
        this.slew = null;
      }
    }
    return Math.max(0, v);
  }

  /**
   * A device report: it was at `posSec` at `atMs` (this clock's time), playing or not. Returns the error it found
   * (device − clock, seconds).
   */
  report(posSec: number, playing: boolean, atMs: number): number {
    const t = this.now();
    const device = posSec + (playing ? (t - atMs) / 1000 : 0);
    const shown = this.read();
    const err = device - shown;
    if (!playing || !this.playing || Math.abs(err) > SNAP_SEC) {
      this.set(device, playing);
      return err;
    }
    if (Math.abs(err) <= DEADBAND_SEC) return err;
    // slew from what is shown now (any slew in progress is folded in first)
    this.pos = shown;
    this.at = t;
    this.slew = { err, from: t };
    return err;
  }
}
