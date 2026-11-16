/**
 * "HandheldStill": one handheld (three/handheld.ts, three/Handheld3D.tsx) as a still for the App Store pictures and
 * previews (apps/desktop/store/creative): square on through a long lens, `scale` px per point on the screen's plane,
 * the screen centred in a picture just larger than the device, on a transparent ground, the screen a transparent
 * hole. The store pipeline lays the capture under the hole in 2D (pixel-sharp) and the picture on its black stage.
 */
import { useThree } from "@react-three/fiber";
import { ThreeCanvas } from "@remotion/three";
import { AbsoluteFill, type CalculateMetadataFunction } from "remotion";
import * as THREE from "three";
import { Handheld3D } from "./three/Handheld3D";
import { HANDHELD, HANDHELD_FOV, type HandheldKind, stillSize } from "./three/handheld";

export type HandheldStillProps = { kind: HandheldKind; scale: number };

export const HANDHELD_DEFAULTS: HandheldStillProps = { kind: "phone", scale: 2.3 };

export const calculateHandheld: CalculateMetadataFunction<HandheldStillProps> = ({ props }) => ({
  ...stillSize(props.kind, props.scale),
  durationInFrames: 1,
});

function Aim({ p, H }: { p: HandheldStillProps; H: number }) {
  const cam = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  // the screen's plane at `scale` px per point: f / distance = scale
  const f = H / 2 / Math.tan((HANDHELD_FOV * Math.PI) / 360);
  const z = HANDHELD[p.kind].t + 0.1 + f / p.scale;
  cam.fov = HANDHELD_FOV;
  // a tight depth range: the glass sits a hair over the body, far from the lens
  cam.near = Math.max(1, z - 300);
  cam.far = z + 300;
  cam.position.set(0, 0, z);
  cam.up.set(0, 1, 0);
  cam.lookAt(0, 0, 0);
  cam.updateProjectionMatrix();
  return null;
}

export const HandheldStill = (p: HandheldStillProps) => {
  const { width, height } = stillSize(p.kind, p.scale);
  return (
    <AbsoluteFill style={{ background: "transparent" }}>
      <ThreeCanvas
        width={width}
        height={height}
        gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true, premultipliedAlpha: false }}
        onCreated={({ gl, scene }) => {
          gl.setClearColor(0x000000, 0);
          scene.background = null;
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1;
          gl.outputColorSpace = THREE.SRGBColorSpace;
        }}
      >
        <Aim p={p} H={height} />
        <Handheld3D kind={p.kind} />
      </ThreeCanvas>
    </AbsoluteFill>
  );
};
