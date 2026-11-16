/**
 * "Hero": the README's opening animation. A laptop (drawn in Laptop.tsx) sits shut on the brand background; the
 * lid opens on its hinge, the panel lights up, the camera comes down and in until the screen fills the frame, and
 * the app recording (public/raw/hero.{mp4,json}, from `pnpm media:hero`) plays on it with the cursor and clicks
 * drawn over it and the camera easing toward what is being used. Then the camera pulls back, the panel dims and the
 * lid shuts, so the last frame is the first one and the GIF loops without a jump.
 *
 * A README cannot run scripts, so Apple's scroll-linked version is out; this is the closest a GIF can do.
 */
import { useMemo } from "react";
import {
  AbsoluteFill,
  type CalculateMetadataFunction,
  Easing,
  Freeze,
  interpolate,
  OffthreadVideo,
  Sequence,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { BG, outLength, Pointer, pieces, type Track, toSrc } from "./Clip";
import { Laptop, LID_H, SCREEN_H, SCREEN_W } from "./Laptop";

export const HERO_FPS = 30;
export const HERO_W = 1600;
export const HERO_H = 1000;
const INTRO = 2.9;
const OUTRO = 2.1;
/** the hinge's place on the stage */
const HX = 800;
const HY = 700;
const SCREEN_TOP = HY - 3 - LID_H + 16;
const SCREEN_LEFT = HX - SCREEN_W / 2;
const SCREEN_CY = SCREEN_TOP + SCREEN_H / 2;
/** the camera while the recording plays: the screen's content fills ~97% of the width, the bezel just in view */
const Z_REC = 1.42;
const SHUT = -90;
const OPEN = 4;
const E_HIGH = -34;
const E_LOW = -5;

/**
 * `follow`: the camera eases toward the clip's focus points while it plays (the MP4 can afford it). Off by default:
 * a GIF pays for every pixel that changes, and a camera in motion changes all of them (~120 KB a frame at 960 px),
 * so the README's GIF keeps the camera still on the screen and only the app moves.
 */
export type HeroProps = { name: string; track?: Track; follow?: boolean };

export const calculateHeroMetadata: CalculateMetadataFunction<HeroProps> = async ({ props }) => {
  const track = (await (await fetch(staticFile(`raw/${props.name}.json`))).json()) as Track;
  return {
    durationInFrames: Math.ceil((INTRO + outLength(track) / 1000 + OUTRO) * HERO_FPS),
    props: { ...props, track },
  };
};

const io = Easing.bezier(0.65, 0, 0.35, 1);
const out = Easing.bezier(0.16, 1, 0.3, 1);
const ramp = (t: number, a: number, b: number, from: number, to: number, ease = io) =>
  interpolate(t, [a, b], [from, to], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });

type Cam = { x: number; y: number; z: number };
/** the shut laptop, seen from above */
const WIDE: Cam = { x: HX, y: HY + 150, z: 0.98 };
const REC: Cam = { x: HX, y: SCREEN_CY, z: Z_REC };

/** the camera through the recording: a critically damped follow of the clip's focus points (deterministic) */
function recCamera(t: Track, frames: number, follow: boolean): Cam[] {
  if (!follow) return Array.from({ length: frames }, () => REC);
  const ps = pieces(t);
  const s = SCREEN_W / t.width;
  const res: Cam[] = [];
  let { x, y, z } = REC;
  let vx = 0;
  let vy = 0;
  let vz = 0;
  const k = 30;
  const d = 2 * Math.sqrt(k);
  const dt = 1 / HERO_FPS;
  for (let f = 0; f < frames; f++) {
    const src = toSrc(ps, (f / HERO_FPS) * 1000);
    const fo = [...t.focus].reverse().find((p) => p.t <= src) ?? t.focus[0]!;
    const tz = Z_REC * (1 + (fo.zoom - 1) * 0.6);
    let tx = SCREEN_LEFT + fo.x * s;
    let ty = SCREEN_TOP + fo.y * s;
    // keep the view on the screen: never past its edges by more than the bezel
    const hw = HERO_W / (2 * tz);
    const hh = HERO_H / (2 * tz);
    const clampTo = (v: number, lo: number, hi: number) =>
      lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v));
    tx = clampTo(tx, SCREEN_LEFT - 20 + hw, SCREEN_LEFT + SCREEN_W + 20 - hw);
    ty = clampTo(ty, SCREEN_TOP - 24 + hh, SCREEN_TOP + SCREEN_H + 30 - hh);
    for (let i = 0; i < 4; i++) {
      const h = dt / 4;
      vx += (k * (tx - x) - d * vx) * h;
      vy += (k * (ty - y) - d * vy) * h;
      vz += (k * (tz - z) - d * vz) * h;
      x += vx * h;
      y += vy * h;
      z += vz * h;
    }
    res.push({ x, y, z });
  }
  return res;
}

export const Hero = ({ name, track, follow = false }: HeroProps) => {
  const frame = useCurrentFrame();
  const recMs = track ? outLength(track) : 0;
  const recFrames = Math.ceil((recMs / 1000) * HERO_FPS);
  const intro = Math.round(INTRO * HERO_FPS);
  const cam = useMemo(() => (track ? recCamera(track, recFrames, follow) : []), [track, recFrames, follow]);
  const ps = useMemo(() => (track ? pieces(track) : []), [track]);
  if (!track) return <AbsoluteFill style={{ background: BG }} />;

  const t = frame / HERO_FPS;
  const tr = t - INTRO - recMs / 1000; // seconds into the outro
  let lid: number;
  let elevation: number;
  let glow: number;
  let c: Cam;
  if (t < INTRO) {
    lid = ramp(t, 0.35, 1.85, SHUT, OPEN);
    elevation = ramp(t, 0.2, 2.75, E_HIGH, E_LOW);
    glow = ramp(t, 1.25, 2.05, 0, 1, out);
    // down onto the opening lid, then in to the screen
    const k1 = ramp(t, 0.2, 1.7, 0, 1);
    const k2 = ramp(t, 1.45, INTRO, 0, 1);
    const mid: Cam = { x: HX, y: HY - 210, z: 0.84 };
    const a = {
      x: WIDE.x + (mid.x - WIDE.x) * k1,
      y: WIDE.y + (mid.y - WIDE.y) * k1,
      z: WIDE.z + (mid.z - WIDE.z) * k1,
    };
    c = { x: a.x + (REC.x - a.x) * k2, y: a.y + (REC.y - a.y) * k2, z: a.z + (REC.z - a.z) * k2 };
  } else if (tr < 0) {
    lid = OPEN;
    elevation = E_LOW;
    glow = 1;
    c = cam[Math.min(cam.length - 1, frame - intro)] ?? REC;
  } else {
    const last = cam[cam.length - 1] ?? REC;
    lid = ramp(tr, 0.75, 1.9, OPEN, SHUT);
    elevation = ramp(tr, 0.2, 1.95, E_LOW, E_HIGH);
    glow = ramp(tr, 0.45, 1.05, 1, 0);
    const k = ramp(tr, 0, 1.95, 0, 1);
    c = {
      x: last.x + (WIDE.x - last.x) * k,
      y: last.y + (WIDE.y - last.y) * k,
      z: last.z + (WIDE.z - last.z) * k,
    };
  }

  const s = SCREEN_W / track.width;
  const video = staticFile(`raw/${name}.mp4`);
  const lastSrcFrame = Math.max(0, Math.floor((track.durationMs / 1000) * HERO_FPS) - 2);
  const msIn = Math.max(0, Math.min(recMs, (t - INTRO) * 1000));
  const vstyle = { width: SCREEN_W, height: SCREEN_H, display: "block" } as const;

  return (
    <AbsoluteFill style={{ background: BG, overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          transformOrigin: "0 0",
          transform: `translate(${HERO_W / 2}px, ${HERO_H / 2}px) scale(${c.z}) translate(${-c.x}px, ${-c.y}px)`,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            perspective: 3200,
            perspectiveOrigin: `${HX}px ${HY - 300}px`,
          }}
        >
          <div style={{ position: "absolute", left: HX, top: HY, transformStyle: "preserve-3d" }}>
            <Laptop lid={lid} elevation={elevation} glow={glow}>
              {/* before and after the recording: its first and last frames, held */}
              {t < INTRO && (
                <Freeze frame={0}>
                  <OffthreadVideo src={video} muted style={vstyle} />
                </Freeze>
              )}
              {tr >= 0 && (
                <Freeze frame={0}>
                  <OffthreadVideo src={video} trimBefore={lastSrcFrame} muted style={vstyle} />
                </Freeze>
              )}
              {ps.map((p) => {
                const from = intro + Math.round((p.out0 / 1000) * HERO_FPS);
                const dur = Math.max(
                  1,
                  Math.round((p.out1 / 1000) * HERO_FPS) - Math.round((p.out0 / 1000) * HERO_FPS),
                );
                const rate = (p.src1 - p.src0) / (p.out1 - p.out0);
                return (
                  <Sequence key={p.out0} from={from} durationInFrames={dur} layout="none">
                    <OffthreadVideo
                      src={video}
                      trimBefore={Math.round((p.src0 / 1000) * HERO_FPS)}
                      playbackRate={rate}
                      muted
                      style={vstyle}
                    />
                  </Sequence>
                );
              })}
              {t >= INTRO && tr < 0 && (
                <div style={{ position: "absolute", inset: 0 }}>
                  <Pointer
                    t={track}
                    place={{ x: 0, y: 0, s, w: SCREEN_W, h: SCREEN_H, kind: "desktop" }}
                    src={toSrc(ps, msIn)}
                  />
                </div>
              )}
            </Laptop>
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
