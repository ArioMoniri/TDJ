/**
 * "DeviceFrame": one device (devices.ts) rendered straight on, the screen a transparent hole, for
 * public/frames/<kind>.png (`pnpm media:frames`). Same studio light and materials as the hero laptop.
 */

import { useThree } from "@react-three/fiber";
import { ThreeCanvas } from "@remotion/three";
import { useMemo } from "react";
import { AbsoluteFill, type CalculateMetadataFunction } from "remotion";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { FRAMES, type FrameKind, PHONE, TABLET } from "./devices";
import { Laptop3D } from "./Laptop3D";
import { rrShape } from "./laptop";

export type DeviceFrameProps = { kind: FrameKind };
export const calculateDeviceFrameMetadata: CalculateMetadataFunction<DeviceFrameProps> = ({ props }) => ({
  width: FRAMES[props.kind].w,
  height: FRAMES[props.kind].h,
  durationInFrames: 1,
});

/** a shape extruded toward the camera (+z), rounded on its edges */
function body(w: number, h: number, r: number, t: number, b: number) {
  const g = new THREE.ExtrudeGeometry(rrShape(w - 2 * b, h - 2 * b, Math.max(0.5, r - b)), {
    depth: t - 2 * b,
    bevelEnabled: true,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: 8,
    curveSegments: 48,
  });
  g.translate(0, 0, b);
  return g;
}

/** square on to the device: R3F aims a new camera at the origin, the laptop's centre is above it */
function Aim({ x, y }: { x: number; y: number }) {
  const cam = useThree((s) => s.camera);
  cam.position.set(x, y, 300);
  cam.lookAt(x, y, 0);
  cam.updateProjectionMatrix();
  return null;
}

function Env() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useMemo(() => {
    const pm = new THREE.PMREMGenerator(gl);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.03).texture;
    scene.environmentIntensity = 0.95;
    pm.dispose();
  }, [gl, scene]);
  return null;
}

const holeMat = () =>
  new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, blending: THREE.NoBlending });

function Handheld({ kind }: { kind: "phone" | "tablet" }) {
  const d = kind === "phone" ? PHONE : TABLET;
  const bw = d.sw + 2 * (d.border + d.band);
  const bh = d.sh + 2 * (d.border + d.band);
  const br = d.sr + d.border + d.band;
  const m = useMemo(() => {
    const metal = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(kind === "phone" ? "#8d8a84" : "#c3c5c9"),
      metalness: 1,
      roughness: kind === "phone" ? 0.3 : 0.26,
      clearcoat: 0.2,
      clearcoatRoughness: 0.3,
    });
    const glass = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color("#030304"),
      roughness: 0.05,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.03,
    });
    const lens = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color("#121a2e"),
      roughness: 0.05,
      clearcoat: 1,
    });
    return { metal, glass, lens, hole: holeMat() };
  }, [kind]);
  const g = useMemo(() => {
    const flat = (w: number, h: number, r: number) => new THREE.ShapeGeometry(rrShape(w, h, r), 64);
    const buttons: Array<{ x: number; y: number; h: number }> = [];
    if (kind === "phone") {
      // from the body's top edge: the action button and the volume keys on the left, the side key on the right
      const top = bh / 2;
      for (const [y0, len] of [
        [128, 30],
        [190, 58],
        [262, 58],
      ] as const)
        buttons.push({ x: -bw / 2 - 0.7, y: top - y0 - len / 2, h: len });
      buttons.push({ x: bw / 2 + 0.7, y: top - 214 - 46, h: 92 });
    } else {
      // landscape: the top button on the top edge's right, volume on the right edge's top
      buttons.push({ x: bw / 2 + 0.6, y: bh / 2 - 120, h: 50 });
      buttons.push({ x: bw / 2 + 0.6, y: bh / 2 - 180, h: 50 });
    }
    return {
      body: body(bw, bh, br, d.t, Math.min(2.6, d.t / 2.6)),
      glass: flat(bw - 2 * d.band, bh - 2 * d.band, br - d.band),
      hole: flat(d.sw, d.sh, d.sr),
      island: flat(126, 37, 18.5),
      lens: new THREE.CircleGeometry(kind === "phone" ? 5.8 : 2.4, 32),
      button: (h: number) => body(3.2, h, 1.6, d.t * 0.55, 1.2),
      buttons,
    };
  }, [kind, bw, bh, br, d]);
  const z = d.t;
  return (
    <group>
      <mesh geometry={g.body} material={m.metal} />
      {g.buttons.map((b) => (
        <mesh
          key={`${b.x},${b.y}`}
          geometry={g.button(b.h)}
          material={m.metal}
          position={[b.x, b.y, d.t * 0.22]}
        />
      ))}
      <mesh geometry={g.glass} material={m.glass} position={[0, 0, z + 0.02]} />
      <mesh geometry={g.hole} material={m.hole} position={[0, 0, z + 0.04]} />
      {kind === "phone" ? (
        <>
          <mesh geometry={g.island} material={m.glass} position={[0, d.sh / 2 - 11 - 18.5, z + 0.06]} />
          <mesh geometry={g.lens} material={m.lens} position={[63 - 18.5, d.sh / 2 - 11 - 18.5, z + 0.08]} />
        </>
      ) : (
        <mesh geometry={g.lens} material={m.lens} position={[0, d.sh / 2 + d.border / 2, z + 0.06]} />
      )}
    </group>
  );
}

export const DeviceFrame = ({ kind }: DeviceFrameProps) => {
  const f = FRAMES[kind];
  return (
    <AbsoluteFill style={{ background: "transparent" }}>
      <ThreeCanvas
        width={f.w}
        height={f.h}
        orthographic
        camera={{ position: [f.centre.x, f.centre.y, 300], zoom: f.scale, near: 0.1, far: 2000 }}
        gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true, premultipliedAlpha: false }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0);
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
          gl.outputColorSpace = THREE.SRGBColorSpace;
        }}
      >
        <Aim x={f.centre.x} y={f.centre.y} />
        <Env />
        <ambientLight intensity={0.15} />
        <directionalLight position={[-40, 80, 120]} intensity={1.4} />
        <directionalLight position={[60, -20, 60]} intensity={0.5} />
        {kind === "desktop" ? (
          <Laptop3D lid={90} glow={1} screen={null} strip="#141416" hole />
        ) : (
          <Handheld kind={kind} />
        )}
      </ThreeCanvas>
    </AbsoluteFill>
  );
};
