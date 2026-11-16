/**
 * A generic modern laptop, drawn here (no product images, no logos): a thin even bezel with a camera notch, a
 * rounded lid, an aluminium deck with a keyboard well and a trackpad, a front lip with a finger groove, and a soft
 * contact shadow. Built from CSS 3D planes so the lid can open on its hinge.
 *
 * Coordinates: the hinge's centre is the origin of the 3D group. The lid stands above it (rotateX(lid) about the
 * hinge: 0 = upright, −90 = closed onto the deck); the deck lies in the floor plane, reaching toward the viewer.
 * `elevation` tilts the whole laptop toward the camera (degrees; negative looks down onto the deck).
 */
import type { ReactNode } from "react";

/** the screen's content area (the recording's 16:10) and the lid around it, in stage px */
export const SCREEN_W = 1088;
export const SCREEN_H = 680;
const SIDE = 14;
const TOP = 16;
const CHIN = 24;
export const LID_W = SCREEN_W + SIDE * 2;
export const LID_H = SCREEN_H + TOP + CHIN;
const DECK_D = SCREEN_H + TOP + CHIN + 2;
const LIP = 13;

const ALU_TOP = "linear-gradient(180deg, #d9dade 0%, #cfd0d5 40%, #c3c4c9 100%)";
const ALU_BACK = "radial-gradient(120% 90% at 50% 30%, #dcdde1 0%, #c9cacf 55%, #b4b5bb 100%)";

export function Laptop({
  lid,
  elevation,
  glow,
  children,
}: {
  /** degrees about the hinge: 0 upright, −90 shut */
  lid: number;
  elevation: number;
  /** 0..1: the panel lit (0 = black glass) */
  glow: number;
  children: ReactNode;
}) {
  const plane = { position: "absolute" as const, transformStyle: "preserve-3d" as const };
  return (
    <div style={{ ...plane, left: 0, top: 0, transform: `rotateX(${elevation}deg)` }}>
      {/* the contact shadow, on the floor just under the deck */}
      <div
        style={{
          position: "absolute",
          left: -LID_W * 0.66,
          top: -60,
          width: LID_W * 1.32,
          height: DECK_D + 220,
          transformOrigin: "50% 60px",
          transform: `translateY(${LIP + 2}px) rotateX(90deg)`,
          background:
            "radial-gradient(50% 50% at 50% 48%, rgba(25,4,20,.6), rgba(25,4,20,.3) 62%, transparent 100%)",
          filter: "blur(22px)",
        }}
      />
      {/* the deck: aluminium, the keyboard well, the trackpad; its front lip hangs from the near edge */}
      <div
        style={{
          ...plane,
          left: -LID_W / 2,
          top: 0,
          width: LID_W,
          height: DECK_D,
          transformOrigin: "50% 0",
          transform: "rotateX(90deg)",
          borderRadius: "6px 6px 26px 26px",
          background: ALU_TOP,
          boxShadow: "inset 0 0 0 1px rgba(255,255,255,.55), inset 0 -2px 0 rgba(0,0,0,.08)",
        }}
      >
        {/* hinge shadow on the deck */}
        <div
          style={{
            position: "absolute",
            left: 40,
            right: 40,
            top: 0,
            height: 26,
            background: "linear-gradient(180deg, rgba(0,0,0,.28), transparent)",
          }}
        />
        {/* speaker grilles */}
        {[18, LID_W - 18 - 70].map((x) => (
          <div
            key={x}
            style={{
              position: "absolute",
              left: x,
              top: 44,
              width: 70,
              height: 300,
              borderRadius: 8,
              backgroundImage: "radial-gradient(circle, rgba(40,40,46,.45) 1.1px, transparent 1.6px)",
              backgroundSize: "7px 7px",
            }}
          />
        ))}
        {/* keyboard well */}
        <div
          style={{
            position: "absolute",
            left: 100,
            top: 40,
            width: LID_W - 200,
            height: 318,
            borderRadius: 10,
            background: "#24252a",
            boxShadow: "inset 0 1px 3px rgba(0,0,0,.6)",
            padding: 8,
            display: "grid",
            gridTemplateColumns: "repeat(14, 1fr)",
            gridAutoRows: "1fr",
            gap: 6,
          }}
        >
          {Array.from({ length: 14 * 6 }, (_, i) => (
            <div
              key={i}
              style={{
                borderRadius: 5,
                background: "linear-gradient(180deg, #1a1b1f, #111215)",
                boxShadow: "0 1px 0 rgba(255,255,255,.06), inset 0 0 0 1px rgba(255,255,255,.04)",
              }}
            />
          ))}
        </div>
        {/* trackpad */}
        <div
          style={{
            position: "absolute",
            left: LID_W / 2 - 230,
            top: 392,
            width: 460,
            height: 280,
            borderRadius: 16,
            background: "linear-gradient(180deg, #d3d4d9, #c8c9ce)",
            boxShadow: "inset 0 0 0 1.5px rgba(0,0,0,.09), inset 0 1px 0 rgba(255,255,255,.5)",
          }}
        />
        {/* the front lip, hanging down from the near edge, with a finger groove */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: DECK_D,
            width: LID_W,
            height: LIP,
            transformOrigin: "50% 0",
            transform: "rotateX(-90deg)",
            borderRadius: "0 0 14px 14px",
            background: "linear-gradient(180deg, #b9bac0 0%, #9fa0a7 70%, #8b8c93 100%)",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: LID_W / 2 - 80,
              top: 0,
              width: 160,
              height: 6,
              borderRadius: "0 0 8px 8px",
              background: "linear-gradient(180deg, #8e8f96, #a6a7ad)",
            }}
          />
        </div>
      </div>
      {/* the lid, standing on the hinge */}
      <div
        style={{
          ...plane,
          left: -LID_W / 2,
          top: -LID_H - 3,
          width: LID_W,
          height: LID_H,
          transformOrigin: "50% 100%",
          transform: `rotateX(${lid}deg)`,
        }}
      >
        {/* front: black glass, the notch, the panel */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "22px 22px 8px 8px",
            background: "#0b0b0d",
            boxShadow: "0 0 0 1.5px #a9aab0, 0 0 0 3px #7d7e85",
            backfaceVisibility: "hidden",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: SIDE,
              top: TOP,
              width: SCREEN_W,
              height: SCREEN_H,
              borderRadius: "10px 10px 2px 2px",
              overflow: "hidden",
              background: "#000",
            }}
          >
            <div style={{ position: "absolute", inset: 0, opacity: glow }}>{children}</div>
            {/* glass: a faint diagonal reflection, stronger while the panel is dark */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: `linear-gradient(115deg, rgba(255,255,255,${0.1 - glow * 0.06}) 0%, rgba(255,255,255,0) 38%, rgba(255,255,255,0) 100%)`,
                pointerEvents: "none",
              }}
            />
          </div>
          {/* the camera notch */}
          <div
            style={{
              position: "absolute",
              left: LID_W / 2 - 64,
              top: TOP - 1,
              width: 128,
              height: 22,
              borderRadius: "0 0 11px 11px",
              background: "#0b0b0d",
            }}
          >
            <div
              style={{
                position: "absolute",
                left: 59,
                top: 6,
                width: 9,
                height: 9,
                borderRadius: 5,
                background: "radial-gradient(circle at 35% 35%, #3a4660, #0d1018 70%)",
              }}
            />
          </div>
        </div>
        {/* back: brushed aluminium, plain */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "22px 22px 8px 8px",
            background: ALU_BACK,
            transform: "rotateY(180deg)",
            backfaceVisibility: "hidden",
            boxShadow: "inset 0 0 0 1.5px rgba(255,255,255,.5)",
          }}
        />
      </div>
    </div>
  );
}
