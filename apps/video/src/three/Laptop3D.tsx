/**
 * The laptop in three.js (geometry in laptop.ts), lit like a product film on a black stage: space-black anodised
 * aluminium (a dark metal under a thin clear oxide layer, a fine brushed grain in its roughness), reflecting a dark
 * studio (studioEnvironment: one soft box overhead and behind, two tall strips at the sides, nothing in front), so
 * the only bright lines are the lid's top edge, its rounded corners and the base's edges. The screen is unlit
 * (`toneMapped: false`: the app's colours as captured) and is also a light: a rectangular area light the size of the
 * panel, in the average colour of what it shows, washes the keyboard and the deck, which fall off into the dark.
 * Black glass bezel, an even 0.5 cm border, rounded display corners at the top, the camera notch, the hinge.
 */
import { useThree } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";
import { continueRender, delayRender } from "remotion";
import * as THREE from "three";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import {
  APP_H,
  appCentreLocal,
  BASE_D,
  BASE_H,
  BASE_W,
  KEY_COLS_U,
  KEY_ROWS_U,
  keyLayout,
  LID_D,
  LID_T,
  lidMatrix,
  PANEL_H,
  PANEL_W,
  panelCentreLocal,
  rrShape,
  STRIP_H,
  slab,
} from "./laptop";

const canvasTex = (w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, srgb = true) => {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  draw(cv.getContext("2d")!);
  const t = new THREE.CanvasTexture(cv);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
};

/** a flat rounded rectangle lying in XZ (facing +y) */
function flatRR(w: number, d: number, r: number) {
  const g = new THREE.ShapeGeometry(rrShape(w, d, r), 16);
  g.rotateX(-Math.PI / 2);
  return g;
}

/** a rectangle w × h with only its top corners rounded (the display's), in XY, centred */
function topRounded(w: number, h: number, r: number) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, -h / 2);
  s.lineTo(w / 2, -h / 2);
  s.lineTo(w / 2, h / 2 - r);
  s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  s.lineTo(-w / 2 + r, h / 2);
  s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  s.closePath();
  return s;
}

/**
 * The studio the metal reflects, as an environment map: black, with a long narrow soft box overhead (the lid's top
 * edge and its rounded corners catch it as a fine line), two tall strips behind at the sides (the corners and the
 * base's sides), a dim wall far behind (a soft sheen on the shut lid) and a soft box high in front (the lid's back as
 * it rises). The deck, the keys and the bezel glass take little of the room: they live in the screen's light.
 */
export function studioEnvironment(): THREE.Scene {
  const s = new THREE.Scene();
  s.background = new THREE.Color(0x000000);
  const box = (w: number, h: number, v: number, at: [number, number, number]) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(v, v, v), side: THREE.DoubleSide }),
    );
    m.position.set(...at);
    m.lookAt(0, 0, 0);
    s.add(m);
  };
  box(30, 2.2, 10, [0, 14, -2]); // overhead, a little behind: a long narrow soft box
  box(2.2, 10, 5, [-13, 3, -9]); // left strip, behind
  box(2.2, 10, 5, [13, 3, -9]); // right strip
  box(44, 10, 0.9, [0, 5, -16]); // a dim wide wall far behind: a soft sheen across the broad surfaces
  // high in front, over the camera: the lid's back shows as it rises (the bezel glass takes little of it)
  box(30, 8, 3, [0, 10, 14]);
  return s;
}

let areaLightsReady = false;

/**
 * The panel's pictures, loaded before the canvas mounts (the canvas draws once per frame: a texture that arrived
 * later would miss the frame). Renders nothing until they are in.
 */
export function useTextures(srcs: string[]): Record<string, THREE.Texture> | null {
  const [tex, setTex] = useState<Record<string, THREE.Texture> | null>(null);
  const [handle] = useState(() => delayRender(`screen ${srcs.join(", ")}`));
  const key = srcs.join("|");
  useEffect(() => {
    let alive = true;
    Promise.all(
      key.split("|").map(
        (src) =>
          new Promise<[string, THREE.Texture]>((ok, ko) =>
            new THREE.TextureLoader().load(
              src,
              (t) => {
                t.colorSpace = THREE.SRGBColorSpace;
                t.anisotropy = 8;
                t.minFilter = THREE.LinearMipmapLinearFilter;
                ok([src, t]);
              },
              undefined,
              ko,
            ),
          ),
      ),
    )
      .then((all) => alive && setTex(Object.fromEntries(all)))
      .finally(() => continueRender(handle));
    return () => {
      alive = false;
    };
  }, [key, handle]);
  return tex;
}

/** a picture's average colour (what its light looks like from a metre away) */
function averageColour(t: THREE.Texture | null): THREE.Color | null {
  const img = t?.image as CanvasImageSource | undefined;
  if (!img) return null;
  const cv = document.createElement("canvas");
  cv.width = 8;
  cv.height = 8;
  const c = cv.getContext("2d", { willReadFrequently: true })!;
  c.drawImage(img, 0, 0, 8, 8);
  const d = c.getImageData(0, 0, 8, 8).data;
  let r = 0;
  let g = 0;
  let b = 0;
  for (let i = 0; i < d.length; i += 4) {
    r += d[i]!;
    g += d[i + 1]!;
    b += d[i + 2]!;
  }
  const n = (d.length / 4) * 255;
  return new THREE.Color().setRGB(r / n, g / n, b / n, THREE.SRGBColorSpace);
}

export type LaptopProps = {
  /** degrees, 0 shut, OPEN_DEG open */
  lid: number;
  /** the panel's brightness: 0 off, 1 as captured (a little over 1 while it wakes) */
  glow: number;
  /** what the panel shows (the capture's first or last frame); null: black */
  screen: THREE.Texture | null;
  /** the menu-bar strip around the notch (the app's top colour) */
  strip: string;
  /** the app area is a transparent hole (the captures' pixels show through it, laid on in 2D) */
  hole?: boolean;
  /**
   * the screen's light on the deck: a picture (its average colour) or a colour; by default the screen's own
   * picture, else a warm white
   */
  spill?: THREE.Texture | string | null;
  /** the screen's light, × (1: a bright app in a dark room) */
  spillIntensity?: number;
  /** the environment's strength (the highlights on the metal) */
  envIntensity?: number;
  /**
   * the studio on the deck, the keys and the trackpad, × (1: the hero's view from above; seen almost level, the
   * deck catches the studio at a grazing angle and reads silver, so the store shot turns it down)
   */
  deckSheen?: number;
};

export function Laptop3D({
  lid,
  glow,
  screen,
  strip,
  hole = false,
  spill,
  spillIntensity = 1,
  envIntensity = 1,
  deckSheen = 1,
}: LaptopProps) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useMemo(() => {
    if (!areaLightsReady) {
      RectAreaLightUniformsLib.init();
      areaLightsReady = true;
    }
    const pm = new THREE.PMREMGenerator(gl);
    scene.environment = pm.fromScene(studioEnvironment(), 0.02).texture;
    pm.dispose();
  }, [gl, scene]);
  scene.environmentIntensity = envIntensity;

  const m = useMemo(() => {
    // the brushing: a fine horizontal grain in the roughness, so highlights stretch a little, like real anodising
    const grain = canvasTex(
      512,
      512,
      (c) => {
        c.fillStyle = "rgb(118,118,118)";
        c.fillRect(0, 0, 512, 512);
        for (let i = 0; i < 2400; i++) {
          const v = 100 + Math.random() * 40;
          c.fillStyle = `rgba(${v},${v},${v},0.5)`;
          c.fillRect(Math.random() * 512, Math.random() * 512, 30 + Math.random() * 160, 1);
        }
      },
      false,
    );
    grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
    grain.repeat.set(3, 3);
    // space black: a dark, slightly cool metal under a clear oxide layer that gives the white edge highlights
    const alu = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color("#2e3034"),
      metalness: 1,
      roughness: 0.7, // × the grain (≈ 0.46): ≈ 0.32
      roughnessMap: grain,
      clearcoat: 0.35,
      clearcoatRoughness: 0.18,
    });
    const deck = alu.clone();
    deck.roughness = 0.9;
    deck.envMapIntensity = 0.3; // the deck lives in the screen's light; the studio barely reaches it
    const glass = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color("#000000"),
      metalness: 0,
      roughness: 0.08,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      envMapIntensity: 0.2, // black glass: the room shows in it only faintly
    });
    const key = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#09090a"),
      roughness: 0.55,
      metalness: 0,
      envMapIntensity: 0.3,
    });
    const well = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#050506"),
      roughness: 0.8,
      metalness: 0,
    });
    const pad = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color("#222326"),
      metalness: 0.9,
      roughness: 0.3,
      clearcoat: 0.6,
      clearcoatRoughness: 0.15,
      envMapIntensity: 0.25,
    });
    const hinge = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#0a0a0b"),
      metalness: 0.6,
      roughness: 0.45,
    });
    const black = new THREE.MeshBasicMaterial({ color: new THREE.Color("#000000") });
    const lens = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color("#0b0f1c"),
      roughness: 0.05,
      clearcoat: 1,
      metalness: 0.2,
    });
    const grille = canvasTex(256, 1024, (c) => {
      c.clearRect(0, 0, 256, 1024);
      c.fillStyle = "rgba(0,0,0,0.9)";
      for (let y = 6; y < 1024; y += 11)
        for (let x = 6 + ((y / 11) % 2) * 5.5; x < 256; x += 11) {
          c.beginPath();
          c.arc(x, y, 2.6, 0, Math.PI * 2);
          c.fill();
        }
    });
    return { alu, deck, glass, key, well, pad, hinge, black, lens, grille };
  }, []);
  // a material's envMapIntensity only counts with its own envMap (the scene's environment takes the scene's
  // intensity), so the turned-down deck gets the studio as its own map
  for (const x of [m.deck, m.key, m.pad]) {
    const own = deckSheen !== 1 ? scene.environment : null;
    if (x.envMap !== own) {
      x.envMap = own;
      x.needsUpdate = true;
    }
    x.envMapIntensity = deckSheen;
  }
  m.deck.clearcoat = 0.35 * deckSheen;
  m.pad.clearcoat = 0.6 * deckSheen;

  const geo = useMemo(() => {
    const base = slab(BASE_W, BASE_D, BASE_H, 1.05, 0.16, 5);
    const lidG = slab(BASE_W, LID_D, LID_T, 1.05, 0.16, 6);
    const unit = 1.88; // key pitch, cm
    const gap = 0.17;
    const kbW = KEY_COLS_U * unit;
    const kbD = KEY_ROWS_U * unit;
    const kbZ0 = -BASE_D / 2 + 1.35; // the keyboard's back edge
    const keyGeos = new Map<string, THREE.BufferGeometry>();
    const keys = keyLayout().map((k) => {
      const w = k.w * unit - gap;
      const d = k.h * unit - gap;
      const id = `${w.toFixed(2)}x${d.toFixed(2)}`;
      if (!keyGeos.has(id)) keyGeos.set(id, slab(w, d, 0.09, 0.18, 0.035, 2));
      return {
        g: keyGeos.get(id)!,
        x: -kbW / 2 + k.x * unit + (k.w * unit) / 2,
        z: kbZ0 + k.y * unit + (k.h * unit) / 2,
      };
    });
    const wellG = flatRR(kbW + 0.5, kbD + 0.5, 0.45);
    const padW = 14.6;
    const padD = 8.7;
    const padZ = kbZ0 + kbD + 0.95 + padD / 2;
    const padG = slab(padW, padD, 0.03, 0.55, 0.012, 2);
    const grilleW = (BASE_W - kbW) / 2 - 0.9;
    const grilleG = flatRR(grilleW, kbD - 0.2, 0.2);
    const facingDown = (g: THREE.BufferGeometry) => g.rotateX(Math.PI / 2); // facing −y, shape +y → +z (up the screen)
    const bezelG = facingDown(new THREE.ShapeGeometry(rrShape(BASE_W - 0.3, LID_D - 0.3, 0.86), 24));
    const plane = (w: number, h: number) => facingDown(new THREE.PlaneGeometry(w, h));
    // the strip over the app (the menu bar's band): the display's rounded top corners
    const stripG = facingDown(new THREE.ShapeGeometry(topRounded(PANEL_W, STRIP_H, 0.55), 12));
    const notch = (() => {
      const s = new THREE.Shape();
      const w = 2.5;
      const h = STRIP_H + 0.02;
      const r = 0.3;
      s.moveTo(-w / 2 - 0.12, h / 2);
      s.lineTo(w / 2 + 0.12, h / 2);
      s.quadraticCurveTo(w / 2, h / 2, w / 2, h / 2 - 0.12);
      s.lineTo(w / 2, -h / 2 + r);
      s.quadraticCurveTo(w / 2, -h / 2, w / 2 - r, -h / 2);
      s.lineTo(-w / 2 + r, -h / 2);
      s.quadraticCurveTo(-w / 2, -h / 2, -w / 2, -h / 2 + r);
      s.lineTo(-w / 2, h / 2 - 0.12);
      s.quadraticCurveTo(-w / 2, h / 2, -w / 2 - 0.12, h / 2);
      s.closePath();
      return facingDown(new THREE.ShapeGeometry(s, 8));
    })();
    return {
      base,
      lidG,
      keys,
      wellG,
      kbZ: kbZ0 + kbD / 2,
      padG,
      padZ,
      grilleG,
      grilleX: kbW / 2 + 0.45 + grilleW / 2,
      bezelG,
      app: plane(PANEL_W, APP_H),
      strip: stripG,
      cover: plane(PANEL_W, PANEL_H),
      notch,
      lens: new THREE.CircleGeometry(0.09, 24).rotateX(Math.PI / 2),
      // the hinge: a barrel across most of the width, the lid's chin turning round it
      hingeG: new THREE.CylinderGeometry(0.5, 0.5, BASE_W - 5.2, 40).rotateZ(Math.PI / 2),
    };
  }, []);

  const appMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: new THREE.Color(0, 0, 0), toneMapped: false }),
    [],
  );
  if (hole) {
    // writes (0, 0, 0, 0): a hole in the picture, whatever is behind it
    appMat.transparent = true;
    appMat.opacity = 0;
    appMat.blending = THREE.NoBlending;
  }
  appMat.map = screen;
  appMat.color.setScalar(screen ? glow : 0);
  appMat.needsUpdate = true;
  const stripMat = useMemo(() => new THREE.MeshBasicMaterial({ toneMapped: false }), []);
  stripMat.color.set(strip).multiplyScalar(Math.min(1, glow));

  // the screen's light
  const spillSrc = spill === undefined ? screen : spill;
  const spillColour = useMemo(() => {
    if (typeof spillSrc === "string") return new THREE.Color(spillSrc);
    return averageColour(spillSrc ?? null) ?? new THREE.Color("#e9e4dc");
  }, [spillSrc]);
  const light = useMemo(() => {
    const l = new THREE.RectAreaLight(0xffffff, 1, PANEL_W, PANEL_H);
    // in the lid's space: on the panel, facing out of it (−y)
    l.position.copy(panelCentreLocal).add(new THREE.Vector3(0, -0.05, 0));
    l.lookAt(new THREE.Vector3(panelCentreLocal.x, -10, panelCentreLocal.z));
    return l;
  }, []);
  light.color.copy(spillColour);
  // a dark app lights the room less; a shut lid puts the light out
  const lum = 0.2126 * spillColour.r + 0.7152 * spillColour.g + 0.0722 * spillColour.b;
  light.intensity = 1.3 * spillIntensity * Math.max(0, glow) * (0.35 + 0.65 * Math.min(1, lum * 1.4));

  const lidM = lidMatrix(lid);
  const panelZ = panelCentreLocal.z;
  const stripZ = appCentreLocal.z + APP_H / 2 + STRIP_H / 2;

  return (
    <group>
      {/* the base */}
      <mesh geometry={geo.base} material={m.deck} />
      <mesh geometry={geo.wellG} material={m.well} position={[0, BASE_H + 0.002, geo.kbZ]} />
      {geo.keys.map((k) => (
        <mesh
          key={`${k.x.toFixed(2)},${k.z.toFixed(2)}`}
          geometry={k.g}
          material={m.key}
          position={[k.x, BASE_H - 0.065, k.z]}
        />
      ))}
      {[-1, 1].map((s) => (
        <mesh key={s} geometry={geo.grilleG} position={[s * geo.grilleX, BASE_H + 0.003, geo.kbZ]}>
          <meshBasicMaterial map={m.grille} transparent depthWrite={false} />
        </mesh>
      ))}
      <mesh geometry={geo.padG} material={m.pad} position={[0, BASE_H - 0.012, geo.padZ]} />
      {/* the hinge barrel at the back */}
      <mesh geometry={geo.hingeG} material={m.hinge} position={[0, BASE_H - 0.05, -BASE_D / 2 + 0.36]} />
      {/* the lid */}
      <group matrixAutoUpdate={false} matrix={lidM}>
        <mesh geometry={geo.lidG} material={m.alu} position={[0, 0, LID_D / 2]} />
        <mesh geometry={geo.bezelG} material={m.glass} position={[0, -0.004, LID_D / 2]} />
        <mesh geometry={geo.app} material={appMat} position={[0, appCentreLocal.y, appCentreLocal.z]} />
        <mesh geometry={geo.strip} material={stripMat} position={[0, appCentreLocal.y, stripZ]} />
        <mesh geometry={geo.notch} material={m.black} position={[0, appCentreLocal.y - 0.002, stripZ]} />
        <mesh geometry={geo.lens} material={m.lens} position={[0, appCentreLocal.y - 0.004, stripZ + 0.04]} />
        {/* a faint second surface over the panel: the cover glass */}
        <mesh geometry={geo.cover} position={[0, -0.02, panelZ]}>
          <meshPhysicalMaterial
            color="#000000"
            roughness={0.04}
            metalness={0}
            transparent
            opacity={0.05}
            clearcoat={1}
            depthWrite={false}
          />
        </mesh>
        <primitive object={light} />
      </group>
    </group>
  );
}

export { PANEL_H };
