/**
 * "Hero": the README's opening animation, staged like a product page. The laptop (three.js, three/Laptop3D.tsx)
 * sits shut, seen from a three-quarter top view; the camera orbits slowly while the lid opens on its hinge (with
 * camera motion blur), the panel wakes with a glow on the capture's first frame, and the camera eases round to
 * straight on. The app recording (public/raw/hero.{mp4,json}, from `pnpm media:hero`) then plays on the screen
 * with the cursor and clicks drawn over it, the camera still (a GIF pays for every pixel that moves). Then the
 * camera pulls back, the panel dims, the lid shuts, and the last frame is the first: the GIF loops without a jump.
 *
 * While the app plays the 3D scene is a still (public/raw/hero-rest.png, rendered once by the pipeline with
 * `mode: "rest"`) and the video sits on the screen's projected rectangle: the camera is square to the screen, so
 * that rectangle is exact, and the render costs a 2D frame instead of a WebGL one.
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
import { BG, outLength, Pointer, pieces, type Track, toSrc } from "./Clip";
import { Laptop3D, useTextures } from "./three/Laptop3D";
import { lidMatrix, OPEN_DEG, PANEL_W, panelCentreLocal, screenCorners, screenFrame } from "./three/laptop";

export const HERO_FPS = 30;
export const HERO_W = 1920;
export const HERO_H = 1200;
export const INTRO = 4.2;
export const OUTRO = 2.8;
const FOV = 26;

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

type Pose = { pos: THREE.Vector3; target: THREE.Vector3; up: THREE.Vector3 };
const TARGET = new THREE.Vector3(0, 4.5, -1);
/** a point on a sphere around the laptop: azimuth from the front (− = from the left), elevation, distance */
function orbit(az: number, el: number, r: number, target = TARGET): Pose {
  const a = (az * Math.PI) / 180;
  const e = (el * Math.PI) / 180;
  return {
    pos: new THREE.Vector3(Math.sin(a) * Math.cos(e) * r, Math.sin(e) * r, Math.cos(a) * Math.cos(e) * r).add(
      target,
    ),
    target: target.clone(),
    up: new THREE.Vector3(0, 1, 0),
  };
}
/** square to the open screen, the panel ~80% of the frame's width */
function restPose(): Pose {
  const { normal } = screenFrame(OPEN_DEG);
  const m = lidMatrix(OPEN_DEG);
  const up = new THREE.Vector3(0, 0, 1).applyMatrix4(new THREE.Matrix4().extractRotation(m)).normalize();
  const centre = panelCentreLocal.clone().applyMatrix4(m).addScaledVector(up, -0.6);
  const halfW = Math.tan(((FOV / 2) * Math.PI) / 180) * (HERO_W / HERO_H);
  const d = PANEL_W / 0.8 / (2 * halfW);
  return { pos: centre.clone().addScaledVector(normal, d), target: centre, up };
}
const START = orbit(-36, 33, 96);
const SWING = orbit(-20, 20, 104);
const mix = (a: Pose, b: Pose, k: number): Pose => ({
  pos: a.pos.clone().lerp(b.pos, k),
  target: a.target.clone().lerp(b.target, k),
  up: a.up.clone().lerp(b.up, k).normalize(),
});

/** the whole choreography as a function of time (s) and the recording's length (s) */
function stage(t: number, rec: number) {
  const REST = restPose();
  const tr = t - INTRO - rec;
  if (t < INTRO) {
    const k1 = ramp(t, 0, 2.4, 0, 1, Easing.bezier(0.33, 0, 0.67, 1));
    const k2 = ramp(t, 2.2, INTRO, 0, 1);
    const glowUp = ramp(t, 2.0, 2.9, 0, 1.18, Easing.out(Easing.cubic));
    const settle = ramp(t, 2.9, 3.6, 0, 0.18);
    return {
      pose: mix(mix(START, SWING, k1), REST, k2),
      lid: ramp(t, 0.5, 2.5, 0, OPEN_DEG),
      glow: glowUp - settle,
      moving: t > 0.5 && t < 2.5,
    };
  }
  if (tr < 0) return { pose: REST, lid: OPEN_DEG, glow: 1, moving: false };
  const k = ramp(tr, 0, 1.6, 0, 1);
  const back = ramp(tr, 1.2, OUTRO, 0, 1);
  return {
    pose: mix(mix(REST, SWING, k), START, back),
    lid: ramp(tr, 0.9, 2.5, OPEN_DEG, 0),
    glow: ramp(tr, 0.3, 1.1, 1, 0),
    moving: tr > 0.9 && tr < 2.5,
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

function Lights() {
  return (
    <>
      <ambientLight intensity={0.15} />
      <directionalLight
        position={[-30, 60, 40]}
        intensity={1.6}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
        shadow-bias={-0.0004}
        shadow-radius={6}
      />
      <directionalLight position={[40, 20, -30]} intensity={0.6} />
    </>
  );
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
  const s =
    mode === "rest"
      ? { pose: restPose(), lid: OPEN_DEG, glow: 1, moving: false }
      : stage(frame / HERO_FPS, rec);
  const outro = frame / HERO_FPS > INTRO + rec;
  return (
    <ThreeCanvas
      width={HERO_W}
      height={HERO_H}
      gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
      shadows
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
        gl.outputColorSpace = THREE.SRGBColorSpace;
        gl.shadowMap.type = THREE.PCFSoftShadowMap;
      }}
    >
      <Rig pose={s.pose} />
      <Lights />
      <Laptop3D
        key={mode === "rest" ? "rest" : outro ? "last" : "first"}
        lid={s.lid}
        glow={s.glow}
        screen={
          mode === "rest" ? null : (tex[staticFile(`raw/${name}-${outro ? "last" : "first"}.jpg`)] ?? null)
        }
        strip={strip}
      />
    </ThreeCanvas>
  );
}

/** the app's rectangle on the 1920 × 1200 frame at the resting pose */
function restRect() {
  const p = restPose();
  const cam = new THREE.PerspectiveCamera(FOV, HERO_W / HERO_H, 1, 1000);
  cam.up.copy(p.up);
  cam.position.copy(p.pos);
  cam.lookAt(p.target);
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  const px = screenCorners(OPEN_DEG).map((v) => {
    const n = v.clone().project(cam);
    return { x: ((n.x + 1) / 2) * HERO_W, y: ((1 - n.y) / 2) * HERO_H };
  });
  const xs = px.map((q) => q.x);
  const ys = px.map((q) => q.y);
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    w: Math.max(...xs) - Math.min(...xs),
    h: Math.max(...ys) - Math.min(...ys),
  };
}

export const Hero = ({ name, track, mode = "full", rest = false, blur = 0 }: HeroProps) => {
  const frame = useCurrentFrame();
  const recMs = track ? outLength(track) : 0;
  const rec = recMs / 1000;
  const ps = useMemo(() => (track ? pieces(track) : []), [track]);
  const R = useMemo(restRect, []);
  const tex = useTextures([staticFile(`raw/${name}-first.jpg`), staticFile(`raw/${name}-last.jpg`)]);
  if (!track) return <AbsoluteFill style={{ background: BG }} />;
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
      <AbsoluteFill style={{ background: BG, overflow: "hidden" }}>
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
          {/* the cover glass: a faint sweep of the room across the panel */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(112deg, rgba(255,255,255,.07) 0%, rgba(255,255,255,.02) 30%, rgba(255,255,255,0) 46%)",
            }}
          />
        </div>
      </AbsoluteFill>
    );
  }

  if (!tex) return <AbsoluteFill style={{ background: BG }} />;
  const scene = <Scene name={name} rec={rec} mode={mode} strip={strip} tex={tex} />;
  return (
    <AbsoluteFill style={{ background: BG, overflow: "hidden" }}>
      {s?.moving && blur > 1 ? (
        <CameraMotionBlur samples={blur} shutterAngle={180}>
          {scene}
        </CameraMotionBlur>
      ) : (
        scene
      )}
    </AbsoluteFill>
  );
};
