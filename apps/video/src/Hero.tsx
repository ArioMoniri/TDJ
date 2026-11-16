/**
 * "Hero": the README's opening animation, staged like a product film on a black stage. A space-black laptop
 * (three.js, three/Laptop3D.tsx) sits shut, low in the frame, seen from the front and a little above, under a
 * headline. The lid opens on its hinge, the panel wakes on the capture's first frame and its light spills onto the
 * keyboard, then the headline lifts away and the camera pushes in, square to the screen, until the screen is as wide
 * as the laptop allows (the app has to stay readable at the README's 840 px). The app recording
 * (public/raw/hero.{mp4,json}, from `pnpm media:hero`) then plays on the screen with the cursor and clicks drawn
 * over it, the camera still (a GIF pays for every pixel that moves). Then the camera pulls back, the headline
 * returns, the panel dims and the lid shuts: the last frame is the first, so the GIF loops without a jump.
 *
 * While the app plays the 3D scene is a still (public/raw/hero-rest.png, rendered once by the pipeline with
 * `mode: "rest"`) and the video sits on the screen's projected rectangle: the camera is square to the screen
 * (laptop.ts → squarePose), so that rectangle is exact (showcase.ts → appRect), and the render costs a 2D frame
 * instead of a WebGL one.
 */

import { useThree } from "@react-three/fiber";
import { CameraMotionBlur } from "@remotion/motion-blur";
import { ThreeCanvas } from "@remotion/three";
import { useMemo } from "react";
import {
  AbsoluteFill,
  type CalculateMetadataFunction,
  Easing,
  Img,
  interpolate,
  OffthreadVideo,
  Sequence,
  staticFile,
  useCurrentFrame,
} from "remotion";
import * as THREE from "three";
import { outLength, Pointer, pieces, type Track, toSrc } from "./Clip";
import { Laptop3D, useTextures } from "./three/Laptop3D";
import { OPEN_DEG, type Pose, squarePose } from "./three/laptop";
import { Headline, STAGE, Vignette } from "./three/Stage";
import { appRect, PLACE, SHOWCASE_FOV } from "./three/showcase";

export const HERO_FPS = 30;
export const HERO_W = 1920;
export const HERO_H = 1200;
export const INTRO = 4.2;
export const OUTRO = 2.8;
const FOV = SHOWCASE_FOV;
/** the opening shot's words (ours): a small product line over one headline */
const KICKER = "T-DJ";
const HEADLINE = "A tango night, composed.";

export type HeroProps = {
  name: string;
  track?: Track;
  /** "rest": only the laptop at the resting pose, the app area black (the pipeline's still) */
  mode?: "full" | "rest";
  /** the pipeline rendered public/raw/hero-rest.png: the app part uses it instead of WebGL */
  rest?: boolean;
  /**
   * camera motion blur while the lid moves: that many sub-frames (each a full WebGL render, so N× the cost of those
   * frames; 0 = off). Off by default: in software GL a 4-sample frame outlasts Remotion's timeout on a shared
   * machine, and a 2-second hinge move barely smears at 30 fps. `pnpm media:hero --blur=4` turns it on.
   */
  blur?: number;
};

export const calculateHeroMetadata: CalculateMetadataFunction<HeroProps> = async ({ props }) => {
  const track = (await (await fetch(staticFile(`raw/${props.name}.json`))).json()) as Track;
  return {
    durationInFrames:
      props.mode === "rest" ? 1 : Math.ceil((INTRO + outLength(track) / 1000 + OUTRO) * HERO_FPS),
    props: { ...props, track },
  };
};

const io = Easing.bezier(0.65, 0, 0.35, 1);
const ramp = (t: number, a: number, b: number, from: number, to: number, ease = io) =>
  interpolate(t, [a, b], [from, to], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });

const REST = squarePose(HERO_W, HERO_H, PLACE.heroRest, FOV);
const WIDE = squarePose(HERO_W, HERO_H, PLACE.heroWide, FOV);
const mix = (a: Pose, b: Pose, k: number): Pose => ({
  pos: a.pos.clone().lerp(b.pos, k),
  target: a.target.clone().lerp(b.target, k),
  up: a.up.clone().lerp(b.up, k).normalize(),
});

type Beat = { pose: Pose; lid: number; glow: number; words: number; moving: boolean };

/** the whole choreography as a function of time (s) and the recording's length (s); `words`: the headline's opacity */
export function stage(t: number, rec: number): Beat {
  const tr = t - INTRO - rec;
  if (t < INTRO) {
    const glowUp = ramp(t, 1.7, 2.6, 0, 1.15, Easing.out(Easing.cubic));
    const settle = ramp(t, 2.6, 3.3, 0, 0.15);
    return {
      pose: mix(WIDE, REST, ramp(t, 2.5, INTRO, 0, 1, Easing.bezier(0.45, 0, 0.2, 1))),
      lid: ramp(t, 0.35, 2.45, 0, OPEN_DEG, Easing.bezier(0.5, 0, 0.25, 1)),
      glow: glowUp - settle,
      words: ramp(t, 2.45, 3.15, 1, 0),
      moving: t > 0.35 && t < 2.45,
    };
  }
  if (tr < 0) return { pose: REST, lid: OPEN_DEG, glow: 1, words: 0, moving: false };
  return {
    pose: mix(REST, WIDE, ramp(tr, 0, 1.3, 0, 1)),
    lid: ramp(tr, 1.0, 2.6, OPEN_DEG, 0),
    glow: ramp(tr, 0.6, 1.5, 1, 0),
    words: ramp(tr, 0.9, 1.6, 0, 1),
    moving: tr > 1.0 && tr < 2.6,
  };
}

function Rig({ pose }: { pose: Pose }) {
  const cam = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  cam.fov = FOV;
  cam.near = 1;
  cam.far = 1000;
  cam.up.copy(pose.up);
  cam.position.copy(pose.pos);
  cam.lookAt(pose.target);
  cam.updateProjectionMatrix();
  return null;
}

function Scene({
  name,
  rec,
  mode,
  strip,
  tex,
}: {
  name: string;
  rec: number;
  mode: "full" | "rest";
  strip: string;
  tex: Record<string, THREE.Texture>;
}) {
  const frame = useCurrentFrame();
  const s = mode === "rest" ? { pose: REST, lid: OPEN_DEG, glow: 1 } : stage(frame / HERO_FPS, rec);
  const outro = frame / HERO_FPS > INTRO + rec;
  const pic = tex[staticFile(`raw/${name}-${outro ? "last" : "first"}.jpg`)] ?? null;
  return (
    <ThreeCanvas
      width={HERO_W}
      height={HERO_H}
      gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1;
        gl.outputColorSpace = THREE.SRGBColorSpace;
      }}
    >
      <Rig pose={s.pose} />
      <Laptop3D
        key={mode === "rest" ? "rest" : outro ? "last" : "first"}
        lid={s.lid}
        glow={s.glow}
        screen={mode === "rest" ? null : pic}
        spill={pic}
        strip={strip}
      />
    </ThreeCanvas>
  );
}

const Words = ({ o }: { o: number }) =>
  o > 0 ? (
    <Headline
      kicker={KICKER}
      text={HEADLINE}
      width={HERO_W}
      top={HERO_H * 0.065}
      size={HERO_H * 0.068}
      style={{ opacity: o, transform: `translateY(${(1 - o) * -HERO_H * 0.03}px)` }}
    />
  ) : null;

export const Hero = ({ name, track, mode = "full", rest = false, blur = 0 }: HeroProps) => {
  const frame = useCurrentFrame();
  const recMs = track ? outLength(track) : 0;
  const rec = recMs / 1000;
  const ps = useMemo(() => (track ? pieces(track) : []), [track]);
  const R = useMemo(() => appRect(HERO_W, HERO_H, PLACE.heroRest), []);
  const tex = useTextures([staticFile(`raw/${name}-first.jpg`), staticFile(`raw/${name}-last.jpg`)]);
  if (!track) return <AbsoluteFill style={{ background: STAGE }} />;
  const strip = track.bg ?? "#f2efe9";
  const t = frame / HERO_FPS;
  const playing = mode === "full" && t >= INTRO && t < INTRO + rec;
  const intro = Math.round(INTRO * HERO_FPS);
  const video = staticFile(`raw/${name}.mp4`);
  const s = mode === "full" ? stage(t, rec) : null;

  if (playing && rest) {
    const msIn = (t - INTRO) * 1000;
    const vs = { width: R.w, height: R.h, display: "block" } as const;
    return (
      <AbsoluteFill style={{ background: STAGE, overflow: "hidden" }}>
        <Img src={staticFile(`raw/${name}-rest.png`)} style={{ width: HERO_W, height: HERO_H }} />
        <div
          style={{ position: "absolute", left: R.x, top: R.y, width: R.w, height: R.h, overflow: "hidden" }}
        >
          {ps.map((p) => {
            const from = intro + Math.round((p.out0 / 1000) * HERO_FPS);
            const dur = Math.max(
              1,
              Math.round((p.out1 / 1000) * HERO_FPS) - Math.round((p.out0 / 1000) * HERO_FPS),
            );
            return (
              <Sequence key={p.out0} from={from} durationInFrames={dur} layout="none">
                <OffthreadVideo
                  src={video}
                  trimBefore={Math.round((p.src0 / 1000) * HERO_FPS)}
                  playbackRate={(p.src1 - p.src0) / (p.out1 - p.out0)}
                  muted
                  style={vs}
                />
              </Sequence>
            );
          })}
          <Pointer
            t={track}
            place={{ x: 0, y: 0, s: R.w / track.width, w: R.w, h: R.h, kind: "desktop" }}
            src={toSrc(ps, msIn)}
          />
        </div>
        <Vignette />
      </AbsoluteFill>
    );
  }

  if (!tex) return <AbsoluteFill style={{ background: STAGE }} />;
  const scene = <Scene name={name} rec={rec} mode={mode} strip={strip} tex={tex} />;
  return (
    <AbsoluteFill style={{ background: STAGE, overflow: "hidden" }}>
      {s?.moving && blur > 1 ? (
        <CameraMotionBlur samples={blur} shutterAngle={180}>
          {scene}
        </CameraMotionBlur>
      ) : (
        scene
      )}
      {/* the rest still is the laptop alone: the 2D phase lays the same vignette over it */}
      {mode === "full" ? (
        <>
          <Words o={s?.words ?? 0} />
          <Vignette />
        </>
      ) : null}
    </AbsoluteFill>
  );
};
