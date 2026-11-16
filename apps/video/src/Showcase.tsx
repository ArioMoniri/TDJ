/**
 * "Showcase": the hero's space-black laptop as a still for the Mac App Store pictures and the Mac app preview
 * (apps/desktop/store/creative): lid open, the camera square to the screen (laptop.ts → squarePose) so the app area
 * lands exactly on `appRect(width, height, place)`, on an opaque black stage with the app area a transparent hole.
 * The store pipeline lays each capture under the hole in 2D (pixel-sharp at App Store size) and sets the headline
 * above. The screen's light on the deck comes from `spill`, the average colour of the captures it will hold (one
 * still for the light screens, one for the dark ones).
 */
import { useThree } from "@react-three/fiber";
import { ThreeCanvas } from "@remotion/three";
import { useMemo } from "react";
import { AbsoluteFill, type CalculateMetadataFunction } from "remotion";
import * as THREE from "three";
import { Laptop3D } from "./three/Laptop3D";
import { OPEN_DEG, squarePose } from "./three/laptop";
import { PLACE, type Placement, SHOWCASE_FOV } from "./three/showcase";

export type ShowcaseProps = {
  width: number;
  height: number;
  place: Placement;
  /** the screen's light on the deck (the captures' average colour) */
  spill: string;
  /** the menu-bar strip around the notch (the captures' top colour) */
  strip: string;
  /** a transparent ground instead of the black stage (the header images lay several devices on one stage) */
  transparent?: boolean;
};

export const SHOWCASE_DEFAULTS: ShowcaseProps = {
  width: 2880,
  height: 1800,
  place: PLACE.storeMac,
  spill: "#e9e5de",
  strip: "#f4f2ee",
};

export const calculateShowcase: CalculateMetadataFunction<ShowcaseProps> = ({ props }) => ({
  width: props.width,
  height: props.height,
  durationInFrames: 1,
});

function Rig({ p }: { p: ShowcaseProps }) {
  const cam = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const scene = useThree((s) => s.scene);
  const fov = p.place.fov ?? SHOWCASE_FOV;
  const pose = useMemo(() => squarePose(p.width, p.height, p.place, fov, p.place.deg ?? OPEN_DEG), [p, fov]);
  // an opaque black stage: the only transparent pixels are the app area's hole (or a transparent ground)
  scene.background = p.transparent ? null : new THREE.Color(0x000000);
  cam.fov = fov;
  cam.near = 1;
  cam.far = 1000;
  cam.up.copy(pose.up);
  cam.position.copy(pose.pos);
  cam.lookAt(pose.target);
  cam.updateProjectionMatrix();
  return null;
}

export const Showcase = (p: ShowcaseProps) => (
  <AbsoluteFill style={{ background: "transparent" }}>
    <ThreeCanvas
      width={p.width}
      height={p.height}
      gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true, premultipliedAlpha: false }}
      onCreated={({ gl }) => {
        gl.setClearColor(0x000000, 0);
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1;
        gl.outputColorSpace = THREE.SRGBColorSpace;
      }}
    >
      <Rig p={p} />
      <Laptop3D
        lid={p.place.deg ?? OPEN_DEG}
        glow={1}
        screen={null}
        spill={p.spill}
        strip={p.strip}
        hole
        deckSheen={(p.place.deg ?? OPEN_DEG) < 100 ? 0.3 : 1}
      />
    </ThreeCanvas>
  </AbsoluteFill>
);
