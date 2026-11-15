/**
 * "Clip": a raw capture from `pnpm media` (apps/web/scripts/media/recorder.ts) dressed the way Screen Studio does
 * it: the brand background, a rounded window (or an iPad / iPhone body) with a soft shadow, a smooth cursor with
 * click ripples, and a camera that eases in on what is being used and back out. Waits recorded with `fast()` play
 * back compressed. Input: public/raw/<name>.{mp4,json} (+ the pair's files for two DJs side by side).
 */
import { useMemo } from "react";
import {
  AbsoluteFill,
  type CalculateMetadataFunction,
  OffthreadVideo,
  Sequence,
  staticFile,
  useCurrentFrame,
} from "remotion";

export const FPS = 60;
export const W = 1600;
export const H = 1000;

type Track = {
  name: string;
  kind: "desktop" | "tablet" | "phone";
  pointer: "mouse" | "touch";
  width: number;
  height: number;
  durationMs: number;
  cursor: Array<{ t: number; x: number; y: number }>;
  clicks: Array<{ t: number; x: number; y: number }>;
  focus: Array<{ t: number; x: number; y: number; zoom: number }>;
  cuts: Array<{ from: number; to: number; keep: number }>;
  pair?: string;
};
export type ClipProps = { name: string; tracks?: Track[] };

/** source ms ↔ clip ms through the compressed waits */
type Piece = { src0: number; src1: number; out0: number; out1: number };
function pieces(t: Track): Piece[] {
  const out: Piece[] = [];
  let src = 0;
  let o = 0;
  for (const c of [...t.cuts].sort((a, b) => a.from - b.from)) {
    if (c.from > src) {
      out.push({ src0: src, src1: c.from, out0: o, out1: o + (c.from - src) });
      o += c.from - src;
    }
    out.push({ src0: c.from, src1: c.to, out0: o, out1: o + c.keep });
    o += c.keep;
    src = c.to;
  }
  out.push({ src0: src, src1: t.durationMs, out0: o, out1: o + (t.durationMs - src) });
  return out.filter((p) => p.out1 > p.out0);
}
const toSrc = (ps: Piece[], ms: number) => {
  const p = ps.find((q) => ms < q.out1) ?? ps[ps.length - 1]!;
  return p.src0 + ((Math.min(ms, p.out1) - p.out0) / (p.out1 - p.out0)) * (p.src1 - p.src0);
};
const outLength = (t: Track) => {
  const ps = pieces(t);
  return ps[ps.length - 1]!.out1;
};

export const calculateClipMetadata: CalculateMetadataFunction<ClipProps> = async ({ props }) => {
  const load = async (n: string) => (await fetch(staticFile(`raw/${n}.json`))).json() as Promise<Track>;
  const main = await load(props.name);
  const tracks = [main, ...(main.pair ? [await load(main.pair)] : [])];
  return {
    durationInFrames: Math.ceil((outLength(main) / 1000) * FPS),
    props: { ...props, tracks },
  };
};

/** where a device's screen sits on the 1600 × 1000 stage */
type Place = { x: number; y: number; s: number; w: number; h: number; kind: Track["kind"] };
function places(tracks: Track[]): Place[] {
  const at = (t: Track, cx: number, cy: number, maxW: number, maxH: number): Place => {
    const chrome = t.kind === "desktop" ? 40 : t.kind === "tablet" ? 52 : 40;
    const s = Math.min((maxW - chrome) / t.width, (maxH - chrome) / t.height);
    const w = t.width * s;
    const h = t.height * s;
    const top = t.kind === "desktop" ? 18 : 0; // the title bar sits above the content
    return { x: cx - w / 2, y: cy - h / 2 + top, s, w, h, kind: t.kind };
  };
  if (tracks.length === 2) return [at(tracks[0]!, 600, 500, 1060, 820), at(tracks[1]!, 1335, 500, 420, 900)];
  const t = tracks[0]!;
  return [at(t, W / 2, H / 2, t.kind === "phone" ? 520 : 1440, t.kind === "phone" ? 940 : 920)];
}

const BG =
  "radial-gradient(1100px 700px at 12% 8%, #f07aa0 0%, transparent 60%), radial-gradient(900px 800px at 92% 96%, #5b2a86 0%, transparent 62%), linear-gradient(135deg, #b0305e 0%, #7a2350 52%, #3b1840 100%)";

function Device({ place, children, dark }: { place: Place; children: React.ReactNode; dark?: boolean }) {
  const { x, y, w, h, kind } = place;
  if (kind === "desktop")
    return (
      <div
        style={{
          position: "absolute",
          left: x,
          top: y - 36,
          width: w,
          height: h + 36,
          borderRadius: 14,
          overflow: "hidden",
          background: dark ? "#1c1c1e" : "#ecebe8",
          boxShadow:
            "0 50px 100px -20px rgba(30,6,24,.55), 0 30px 60px -30px rgba(0,0,0,.45), 0 0 0 1px rgba(255,255,255,.18)",
        }}
      >
        <div style={{ height: 36, display: "flex", alignItems: "center", gap: 8, paddingLeft: 16 }}>
          {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
            <div key={c} style={{ width: 12, height: 12, borderRadius: 6, background: c }} />
          ))}
        </div>
        <div style={{ position: "absolute", left: 0, top: 36, width: w, height: h }}>{children}</div>
      </div>
    );
  const bezel = kind === "tablet" ? 22 : 14;
  const r = kind === "tablet" ? 40 : 56;
  return (
    <div
      style={{
        position: "absolute",
        left: x - bezel,
        top: y - bezel,
        width: w + bezel * 2,
        height: h + bezel * 2,
        borderRadius: r + bezel,
        background: "#0d0d10",
        boxShadow:
          "0 50px 100px -20px rgba(30,6,24,.6), 0 0 0 2px #3a3a40, inset 0 0 0 1px rgba(255,255,255,.08)",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: bezel,
          top: bezel,
          width: w,
          height: h,
          borderRadius: r - 6,
          overflow: "hidden",
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** the eased path between cursor samples */
function cursorAt(t: Track, ms: number) {
  const c = t.cursor;
  if (!c.length) return { x: t.width / 2, y: t.height / 2 };
  const i = c.findIndex((p) => p.t > ms);
  if (i === -1) return c[c.length - 1]!;
  if (i === 0) return c[0]!;
  const a = c[i - 1]!;
  const b = c[i]!;
  const k = b.t === a.t ? 1 : (ms - a.t) / (b.t - a.t);
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
}

function Arrow({ press }: { press: number }) {
  return (
    <svg
      width="30"
      height="30"
      viewBox="0 0 24 24"
      style={{
        position: "absolute",
        left: -5,
        top: -3,
        transform: `scale(${1 - press * 0.18})`,
        transformOrigin: "5px 3px",
        filter: "drop-shadow(0 2px 3px rgba(0,0,0,.35))",
      }}
    >
      <path
        d="M5 3l14 8.2-6.1 1.3 3.7 7.1-2.6 1.3-3.6-7.1L5 18.6z"
        fill="#111"
        stroke="#fff"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** the camera: a critically damped follow of the focus points, frame by frame (deterministic) */
function camera(t: Track, place: Place, ps: Piece[], frames: number) {
  const out: Array<{ x: number; y: number; z: number }> = [];
  let x = W / 2;
  let y = H / 2;
  let z = 1;
  let vx = 0;
  let vy = 0;
  let vz = 0;
  const k = 34; // stiffness: ~0.7 s to settle
  const d = 2 * Math.sqrt(k);
  const dt = 1 / FPS;
  for (let f = 0; f < frames; f++) {
    const src = toSrc(ps, (f / FPS) * 1000);
    const fo = [...t.focus].reverse().find((p) => p.t <= src) ?? t.focus[0]!;
    const tz = fo.zoom;
    let tx = place.x + fo.x * place.s;
    let ty = place.y + fo.y * place.s;
    // keep the stage edges outside the frame
    const hw = W / (2 * Math.max(1, tz));
    const hh = H / (2 * Math.max(1, tz));
    tx = Math.min(W - hw, Math.max(hw, tx));
    ty = Math.min(H - hh, Math.max(hh, ty));
    for (let s = 0; s < 4; s++) {
      const h = dt / 4;
      vx += (k * (tx - x) - d * vx) * h;
      vy += (k * (ty - y) - d * vy) * h;
      vz += (k * (tz - z) - d * vz) * h;
      x += vx * h;
      y += vy * h;
      z += vz * h;
    }
    out.push({ x, y, z });
  }
  return out;
}

function Pointer({ t, place, src }: { t: Track; place: Place; src: number }) {
  const p = cursorAt(t, src);
  const x = place.x + p.x * place.s;
  const y = place.y + p.y * place.s;
  let press = 0;
  const ripples: React.ReactNode[] = [];
  for (const c of t.clicks) {
    const dtm = src - c.t;
    if (dtm > -140 && dtm < 0) press = Math.max(press, 1 + dtm / 140);
    if (dtm >= 0 && dtm < 180) press = Math.max(press, 1 - dtm / 180);
    if (dtm >= 0 && dtm < 600) {
      const k = dtm / 600;
      const e = 1 - (1 - k) ** 3;
      const r = 8 + e * (t.pointer === "touch" ? 46 : 38);
      ripples.push(
        <div
          key={c.t}
          style={{
            position: "absolute",
            left: place.x + c.x * place.s - r,
            top: place.y + c.y * place.s - r,
            width: r * 2,
            height: r * 2,
            borderRadius: r,
            border: "3px solid rgba(240,122,160,.95)",
            background: "rgba(240,122,160,.18)",
            opacity: 1 - k,
          }}
        />,
      );
    }
  }
  if (t.pointer === "touch") {
    // a finger shows only around a tap
    const near = t.clicks.map((c) => src - c.t).find((d) => d > -260 && d < 320);
    const o = near === undefined ? 0 : near < 0 ? 1 + near / 260 : 1 - near / 320;
    return (
      <>
        {ripples}
        <div
          style={{
            position: "absolute",
            left: x - 22,
            top: y - 22,
            width: 44,
            height: 44,
            borderRadius: 22,
            background: "rgba(255,255,255,.55)",
            border: "2px solid rgba(0,0,0,.25)",
            opacity: Math.max(0, o),
            transform: `scale(${1 - press * 0.15})`,
          }}
        />
      </>
    );
  }
  return (
    <>
      {ripples}
      <div style={{ position: "absolute", left: x, top: y }}>
        <Arrow press={press} />
      </div>
    </>
  );
}

export const Clip = ({ name, tracks }: ClipProps) => {
  const frame = useCurrentFrame();
  const ts = tracks ?? [];
  const main = ts[0];
  const pl = useMemo(() => places(ts), [ts]);
  const pss = useMemo(() => ts.map(pieces), [ts]);
  const total = main ? Math.ceil((outLength(main) / 1000) * FPS) : 1;
  const cam = useMemo(() => (main ? camera(main, pl[0]!, pss[0]!, total) : []), [main, pl, pss, total]);
  if (!main) return <AbsoluteFill style={{ background: BG }} />;
  const c = cam[Math.min(frame, cam.length - 1)] ?? { x: W / 2, y: H / 2, z: 1 };
  const ms = (frame / FPS) * 1000;
  const dark = name.includes("dark");
  return (
    <AbsoluteFill style={{ background: BG, overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          transformOrigin: "0 0",
          transform: `translate(${W / 2}px, ${H / 2}px) scale(${c.z}) translate(${-c.x}px, ${-c.y}px)`,
        }}
      >
        {ts.map((t, i) => (
          <Device key={t.name} place={pl[i]!} dark={dark}>
            {pss[i]!.map((p) => {
              const from = Math.round((p.out0 / 1000) * FPS);
              const dur = Math.max(1, Math.round((p.out1 / 1000) * FPS) - from);
              const rate = (p.src1 - p.src0) / (p.out1 - p.out0);
              return (
                <Sequence key={p.out0} from={from} durationInFrames={dur} layout="none">
                  <OffthreadVideo
                    src={staticFile(`raw/${t.name}.mp4`)}
                    trimBefore={Math.round((p.src0 / 1000) * FPS)}
                    playbackRate={rate}
                    muted
                    style={{ width: pl[i]!.w, height: pl[i]!.h, display: "block" }}
                  />
                </Sequence>
              );
            })}
          </Device>
        ))}
        {ts.map((t, i) => (
          <Pointer key={t.name} t={t} place={pl[i]!} src={toSrc(pss[i]!, ms)} />
        ))}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
