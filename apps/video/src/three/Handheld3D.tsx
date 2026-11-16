/**
 * The handhelds (handheld.ts) in three.js, in the laptop's space black and in its studio (Laptop3D.tsx →
 * studioEnvironment, plus two tall strips just in front at the sides, so the band's rounded edge reads as a fine
 * bright line all round): a dark titanium-like band with a fine grain, black glass with a faint clear coat, the
 * screen a transparent hole (the capture is laid under it in 2D, pixel-sharp), the island, the keys, the hinge.
 * Units are the device's points; the body faces +z, centred on its screen.
 */
import { useThree } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";
import { bodyOf, HANDHELD, type HandheldKind } from "./handheld";
import { studioEnvironment } from "./Laptop3D";
import { rrShape } from "./laptop";

/** the laptop's studio and two strips in front at the sides (the band's edge catches them) */
function handheldStudio(): THREE.Scene {
  const s = studioEnvironment();
  const box = (w: number, h: number, v: number, at: [number, number, number]) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(v, v, v), side: THREE.DoubleSide }),
    );
    m.position.set(...at);
    m.lookAt(0, 0, 0);
    s.add(m);
  };
  // tall strips in front at the sides (the band's side edges), a low one in front below (its bottom edge)
  box(2.6, 20, 4.5, [-14, 1, 6]);
  box(2.6, 20, 3.4, [14, 1, 6]);
  box(24, 2.4, 1.8, [0, -13, 6]);
  // a broad, dim box straight in front, behind the camera: the band's face reads as brushed metal, not a hole
  box(18, 12, 0.6, [0, 1, 18]);
  // a broad, faint box over the camera's left shoulder: a soft sheen across the black glass
  const sheen = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 10),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 0.5, 0.5), side: THREE.DoubleSide }),
  );
  sheen.position.set(-8, 9, 14);
  sheen.lookAt(0, 0, 0);
  s.add(sheen);
  return s;
}

/** a rounded rectangle w × h (radius r) extruded toward the camera by t, its edges rounded by b; back face at z = 0 */
function roundedBody(w: number, h: number, r: number, t: number, b: number) {
  const g = new THREE.ExtrudeGeometry(rrShape(w - 2 * b, h - 2 * b, Math.max(0.5, r - b)), {
    depth: Math.max(0.01, t - 2 * b),
    bevelEnabled: true,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: 10,
    curveSegments: 64,
  });
  g.translate(0, 0, b);
  g.computeVertexNormals();
  return g;
}

export function Handheld3D({ kind }: { kind: HandheldKind }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useMemo(() => {
    const pm = new THREE.PMREMGenerator(gl);
    scene.environment = pm.fromScene(handheldStudio(), 0.02).texture;
    scene.environmentIntensity = 1;
    pm.dispose();
  }, [gl, scene]);

  const d = HANDHELD[kind];
  const b = bodyOf(kind);
  const m = useMemo(() => {
    const grain = (() => {
      const cv = document.createElement("canvas");
      cv.width = 512;
      cv.height = 512;
      const c = cv.getContext("2d")!;
      c.fillStyle = "rgb(120,120,120)";
      c.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 2600; i++) {
        const v = 100 + Math.random() * 44;
        c.fillStyle = `rgba(${v},${v},${v},0.5)`;
        c.fillRect(Math.random() * 512, Math.random() * 512, 1, 20 + Math.random() * 120);
      }
      const t = new THREE.CanvasTexture(cv);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      return t;
    })();
    // space black: a dark, cool metal under a thin clear layer (the bright edge lines)
    const band = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color("#45464c"),
      metalness: 1,
      roughness: 0.5,
      roughnessMap: grain,
      clearcoat: 0.45,
      clearcoatRoughness: 0.14,
    });
    const glass = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color("#010102"),
      metalness: 0,
      roughness: 0.12,
      clearcoat: 0,
      clearcoatRoughness: 0.04,
      envMapIntensity: 0.1,
    });
    // the island: a cut in the panel, pure black
    const black = new THREE.MeshBasicMaterial({ color: new THREE.Color("#000000") });
    const lens = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color("#0a1020"),
      roughness: 0.05,
      clearcoat: 1,
      metalness: 0.2,
    });
    // writes (0, 0, 0, 0): the capture shows through
    const hole = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0,
      blending: THREE.NoBlending,
    });
    const gap = new THREE.MeshBasicMaterial({ color: new THREE.Color("#050506") });
    return { band, glass, black, lens, hole, gap };
  }, []);

  const g = useMemo(() => {
    const flat = (w: number, h: number, r: number) => new THREE.ShapeGeometry(rrShape(w, h, r), 96);
    const key = (len: number, flush?: boolean) =>
      roundedBody(flush ? 2.4 : 3.6, len, flush ? 1.2 : 1.8, d.t * 0.42, flush ? 0.9 : 1.4);
    return {
      body: roundedBody(b.w, b.h, b.r, d.t, d.bevel),
      glass: flat(b.w - 2 * d.band, b.h - 2 * d.band, b.r - d.band),
      hole: flat(d.sw, d.sh, d.sr),
      island: d.island ? flat(d.island.w, d.island.h, d.island.h / 2) : null,
      lens: new THREE.CircleGeometry(d.lens?.r ?? 5.4, 40),
      keys: d.keys.map((k) => ({ ...k, g: key(k.len, k.flush) })),
      // the hinge: a capsule along the left edge, its ends rounded into the corners
      spine: d.spine ? new THREE.CapsuleGeometry(d.t / 2, b.h - d.t - 2 * b.r * 0.7, 16, 64) : null,
    };
  }, [d, b]);

  const z = d.t;
  return (
    <group>
      <mesh geometry={g.body} material={m.band} />
      {g.keys.map((k) => {
        const out = k.flush ? 0.3 : 1.1;
        if (k.side === 0)
          return (
            <mesh
              key={`t${k.at}`}
              geometry={k.g}
              material={m.band}
              rotation={[0, 0, Math.PI / 2]}
              position={[b.w / 2 - k.at - k.len / 2, b.h / 2 + out, d.t * 0.29]}
            />
          );
        return (
          <mesh
            key={`${k.side}${k.at}`}
            geometry={k.g}
            material={m.band}
            position={[k.side * (b.w / 2 + out), b.h / 2 - k.at - k.len / 2, d.t * 0.29]}
          />
        );
      })}
      {g.spine ? (
        <mesh geometry={g.spine} material={m.band} position={[-b.w / 2 + d.t * 0.5 - d.margin, 0, d.t / 2]} />
      ) : null}
      <mesh geometry={g.glass} material={m.glass} position={[0, 0, z + 0.05]} />
      <mesh geometry={g.hole} material={m.hole} position={[0, 0, z + 0.1]} />
      {d.island && g.island ? (
        <>
          <mesh
            geometry={g.island}
            material={m.black}
            position={[0, d.sh / 2 - d.island.top - d.island.h / 2, z + 0.16]}
          />
          <mesh
            geometry={g.lens}
            material={m.lens}
            position={[d.island.w / 2 - d.island.h / 2, d.sh / 2 - d.island.top - d.island.h / 2, z + 0.2]}
          />
        </>
      ) : null}
      {d.lens ? <mesh geometry={g.lens} material={m.lens} position={[d.lens.x, d.lens.y, z + 0.16]} /> : null}
      {d.fold
        ? [-1, 1].map((s) => (
            // the hinge between the halves: a dark gap through the band, top and bottom
            <mesh key={s} material={m.gap} position={[0, s * (b.h / 2 - d.band / 2), z * 0.5]}>
              <boxGeometry args={[1.6, d.band * 1.6, z * 1.02]} />
            </mesh>
          ))
        : null}
    </group>
  );
}
