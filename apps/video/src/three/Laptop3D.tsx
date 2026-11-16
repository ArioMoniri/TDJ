/**
 * The laptop in three.js (geometry in laptop.ts): silver anodised aluminium (metal, fine anisotropic brushing),
 * a studio environment for soft reflections (three's RoomEnvironment, generated: no HDRI download), the black-glass
 * bezel with the notch and its camera, a real keyboard, a large trackpad with a bevelled edge, perforated speaker
 * grilles, the hinge barrel, rubber feet and a soft contact shadow. The screen is unlit (`toneMapped: false`), so
 * the app's colours come out as captured.
 */
import { useThree } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";
import { continueRender, delayRender } from "remotion";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
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

export type LaptopProps = {
  /** degrees, 0 shut, OPEN_DEG open */
  lid: number;
  /** the panel's brightness: 0 off, 1 as captured (a little over 1 while it wakes) */
  glow: number;
  /** what the panel shows (the capture's first or last frame); null: black */
  screen: THREE.Texture | null;
  /** the menu-bar strip around the notch (the app's top colour) */
  strip: string;
  /** the app area is a transparent hole (DeviceFrame: the clips' pixels show through it) */
  hole?: boolean;
};

export function Laptop3D({ lid, glow, screen, strip, hole = false }: LaptopProps) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  // the studio: soft boxes in a room, prefiltered for PBR
  useMemo(() => {
    const pm = new THREE.PMREMGenerator(gl);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.03).texture;
    scene.environmentIntensity = 0.95;
    pm.dispose();
  }, [gl, scene]);

  const m = useMemo(() => {
    // the brushing: a fine horizontal grain in the roughness, so highlights stretch like real anodised metal
    const grain = canvasTex(
      512,
      512,
      (c) => {
        c.fillStyle = "rgb(150,150,150)";
        c.fillRect(0, 0, 512, 512);
        for (let i = 0; i < 2400; i++) {
          const v = 130 + Math.random() * 50;
          c.fillStyle = `rgba(${v},${v},${v},0.5)`;
          c.fillRect(Math.random() * 512, Math.random() * 512, 30 + Math.random() * 160, 1);
        }
      },
      false,
    );
    grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
    grain.repeat.set(3, 3);
    const alu = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color("#bfc1c5"),
      metalness: 1,
      roughness: 0.21,
      roughnessMap: grain,
      anisotropy: 0.35,
      clearcoat: 0.12,
      clearcoatRoughness: 0.4,
    });
    const aluDark = alu.clone();
    aluDark.color = new THREE.Color("#a9abb0");
    aluDark.roughness = 0.5;
    const glass = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color("#050506"),
      metalness: 0,
      roughness: 0.06,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
      reflectivity: 0.5,
    });
    const key = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#060607"),
      roughness: 0.9,
      metalness: 0,
      envMapIntensity: 0.12,
    });
    const well = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#2a2b2f"),
      roughness: 0.7,
      metalness: 0.4,
    });
    const pad = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color("#b9bbbf"),
      metalness: 0.9,
      roughness: 0.42,
      clearcoat: 0,
    });
    const hinge = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#2b2c30"),
      metalness: 0.8,
      roughness: 0.35,
    });
    const rubber = new THREE.MeshStandardMaterial({ color: new THREE.Color("#1b1b1d"), roughness: 0.9 });
    const black = new THREE.MeshBasicMaterial({ color: new THREE.Color("#000000") });
    const lens = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color("#141a2c"),
      roughness: 0.05,
      clearcoat: 1,
      metalness: 0.2,
    });
    const grille = canvasTex(256, 1024, (c) => {
      c.clearRect(0, 0, 256, 1024);
      c.fillStyle = "rgba(20,20,24,0.92)";
      for (let y = 6; y < 1024; y += 11)
        for (let x = 6 + ((y / 11) % 2) * 5.5; x < 256; x += 11) {
          c.beginPath();
          c.arc(x, y, 2.6, 0, Math.PI * 2);
          c.fill();
        }
    });
    const shadow = canvasTex(512, 512, (c) => {
      const g = c.createRadialGradient(256, 256, 30, 256, 256, 256);
      g.addColorStop(0, "rgba(20,4,16,0.75)");
      g.addColorStop(0.55, "rgba(20,4,16,0.35)");
      g.addColorStop(1, "rgba(20,4,16,0)");
      c.fillStyle = g;
      c.fillRect(0, 0, 512, 512);
    });
    return { alu, aluDark, glass, key, well, pad, hinge, rubber, black, lens, grille, shadow };
  }, []);

  const geo = useMemo(() => {
    const base = slab(BASE_W, BASE_D, BASE_H, 1.05, 0.16, 4);
    const lidG = slab(BASE_W, LID_D, LID_T, 1.05, 0.14, 4);
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
    const bezelG = (() => {
      const g = new THREE.ShapeGeometry(rrShape(BASE_W - 0.34, LID_D - 0.3, 0.9), 16);
      g.rotateX(Math.PI / 2); // facing −y
      return g;
    })();
    const plane = (w: number, h: number) => {
      const g = new THREE.PlaneGeometry(w, h);
      g.rotateX(Math.PI / 2); // facing −y, the texture's top toward +z (the screen's top)
      return g;
    };
    const notch = (() => {
      const s = new THREE.Shape();
      const w = 3.1;
      const h = STRIP_H;
      const r = 0.32;
      s.moveTo(-w / 2, h / 2);
      s.lineTo(w / 2, h / 2);
      s.lineTo(w / 2, -h / 2 + r);
      s.quadraticCurveTo(w / 2, -h / 2, w / 2 - r, -h / 2);
      s.lineTo(-w / 2 + r, -h / 2);
      s.quadraticCurveTo(-w / 2, -h / 2, -w / 2, -h / 2 + r);
      s.closePath();
      const g = new THREE.ShapeGeometry(s, 8);
      g.rotateX(Math.PI / 2);
      return g;
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
      strip: plane(PANEL_W, STRIP_H),
      cover: plane(PANEL_W, PANEL_H),
      notch,
      lens: new THREE.CircleGeometry(0.11, 24).rotateX(Math.PI / 2),
      hingeG: new THREE.CylinderGeometry(0.42, 0.42, BASE_W - 6.4, 32).rotateZ(Math.PI / 2),
      foot: new THREE.CylinderGeometry(0.75, 0.8, 0.12, 32),
      shadowG: new THREE.PlaneGeometry(BASE_W * 1.7, BASE_D * 1.9).rotateX(-Math.PI / 2),
    };
  }, []);

  const tex = screen;
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
  appMat.map = tex;
  appMat.color.setScalar(tex ? glow : 0);
  appMat.needsUpdate = true;
  const stripMat = useMemo(() => new THREE.MeshBasicMaterial({ toneMapped: false }), []);
  stripMat.color.set(strip).multiplyScalar(Math.min(1, glow));

  const lidM = lidMatrix(lid);
  const panelZ = panelCentreLocal.z;
  const stripZ = appCentreLocal.z + APP_H / 2 + STRIP_H / 2;

  return (
    <group>
      {/* the contact shadow and the feet */}
      <mesh geometry={geo.shadowG} position={[0, -0.13, 0.4]} renderOrder={-1}>
        <meshBasicMaterial map={m.shadow} transparent depthWrite={false} toneMapped={false} />
      </mesh>
      {[
        [-BASE_W / 2 + 2.2, -BASE_D / 2 + 2.2],
        [BASE_W / 2 - 2.2, -BASE_D / 2 + 2.2],
        [-BASE_W / 2 + 2.2, BASE_D / 2 - 2.2],
        [BASE_W / 2 - 2.2, BASE_D / 2 - 2.2],
      ].map(([x, z]) => (
        <mesh key={`${x},${z}`} geometry={geo.foot} material={m.rubber} position={[x!, -0.06, z!]} />
      ))}
      {/* the base */}
      <mesh geometry={geo.base} material={m.alu} castShadow receiveShadow />
      <mesh geometry={geo.wellG} material={m.well} position={[0, BASE_H + 0.002, geo.kbZ]} receiveShadow />
      {geo.keys.map((k) => (
        <mesh
          key={`${k.x.toFixed(2)},${k.z.toFixed(2)}`}
          geometry={k.g}
          material={m.key}
          position={[k.x, BASE_H - 0.065, k.z]}
          castShadow
          receiveShadow
        />
      ))}
      {[-1, 1].map((s) => (
        <mesh key={s} geometry={geo.grilleG} position={[s * geo.grilleX, BASE_H + 0.003, geo.kbZ]}>
          <meshBasicMaterial map={m.grille} transparent toneMapped={false} depthWrite={false} />
        </mesh>
      ))}
      <mesh geometry={geo.padG} material={m.pad} position={[0, BASE_H - 0.012, geo.padZ]} receiveShadow />
      {/* the hinge barrel at the back */}
      <mesh geometry={geo.hingeG} material={m.hinge} position={[0, BASE_H - 0.12, -BASE_D / 2 + 0.3]} />
      {/* the lid */}
      <group matrixAutoUpdate={false} matrix={lidM}>
        <mesh geometry={geo.lidG} material={m.alu} castShadow receiveShadow position={[0, 0, LID_D / 2]} />
        <mesh geometry={geo.bezelG} material={m.glass} position={[0, -0.004, LID_D / 2]} />
        <mesh geometry={geo.app} material={appMat} position={[0, appCentreLocal.y, appCentreLocal.z]} />
        <mesh geometry={geo.strip} material={stripMat} position={[0, appCentreLocal.y, stripZ]} />
        <mesh geometry={geo.notch} material={m.black} position={[0, appCentreLocal.y - 0.002, stripZ]} />
        <mesh geometry={geo.lens} material={m.lens} position={[0, appCentreLocal.y - 0.004, stripZ + 0.05]} />
        {/* a faint second surface over the panel: the cover glass catching the room */}
        <mesh geometry={geo.cover} position={[0, -0.02, panelZ]}>
          <meshPhysicalMaterial
            color="#000000"
            roughness={0.04}
            metalness={0}
            transparent
            opacity={0.07}
            clearcoat={1}
            depthWrite={false}
          />
        </mesh>
      </group>
    </group>
  );
}

export { PANEL_H };
