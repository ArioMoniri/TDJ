/**
 * App Store app previews (store creative v2, `pnpm store:creative`): 15–30 s of the app's own screens, captured
 * from the bundled app UI (apps/desktop/store/creative/capture.ts), one chapter per feature with a few words on a
 * brand-coloured card, an original synthesised bed under it (audio.ts; no copyrighted music). One composition, sized
 * by its props: iPhone 886 × 1920, iPad 1200 × 1600, Mac 1920 × 1080. The files it reads are copied into
 * public/store-creative/ by apps/desktop/store/creative/preview.ts before the render.
 */
import type { CalculateMetadataFunction } from "remotion";
import {
  AbsoluteFill,
  Audio,
  Img,
  interpolate,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export type StorePreviewProps = {
  width: number;
  height: number;
  fps: number;
  /** "phone" | "tablet" | "mac": draws a status bar on iPhone and iPad */
  kind: "phone" | "tablet" | "mac";
  /** CSS px of the capture's top safe area, scaled to the video (where the status bar goes) */
  statusTop: number;
  lang: string;
  intro: number;
  outro: number;
  outroWords: string;
  chapters: Array<{ src: string; full?: string; words: string; frames: number; dark: boolean }>;
  audio?: string;
};

export const STORE_PREVIEW_DEFAULTS: StorePreviewProps = {
  width: 886,
  height: 1920,
  fps: 30,
  kind: "phone",
  statusTop: 124,
  lang: "en",
  intro: 36,
  outro: 60,
  outroWords: "Tango DJ",
  chapters: [],
};

export const calculateStorePreview: CalculateMetadataFunction<StorePreviewProps> = ({ props }) => ({
  width: props.width,
  height: props.height,
  fps: props.fps,
  durationInFrames: props.intro + props.outro + props.chapters.reduce((n, c) => n + c.frames, 0),
});

const C = { ink: "#0B0A10", teal: "#4FD1C5", pink: "#EE7C9E", coral: "#F4906A", rose: "#E0557A" };
const SKY = `linear-gradient(110deg, ${C.teal} 0%, ${C.pink} 48%, ${C.coral} 100%)`;
const FONTS = `
@font-face{font-family:"Fraunces";font-weight:400;src:url(${staticFile("store-creative/fonts/fraunces-400.woff2")}) format("woff2")}
@font-face{font-family:"Fraunces";font-weight:400;src:url(${staticFile("store-creative/fonts/fraunces-ext-400.woff2")}) format("woff2");unicode-range:U+0100-024F}
@font-face{font-family:"Fraunces";font-weight:800;src:url(${staticFile("store-creative/fonts/fraunces-800.woff2")}) format("woff2")}
@font-face{font-family:"Fraunces";font-weight:800;src:url(${staticFile("store-creative/fonts/fraunces-ext-800.woff2")}) format("woff2");unicode-range:U+0100-024F}
@font-face{font-family:"Inter";font-weight:700;src:url(${staticFile("store-creative/fonts/inter-700.woff2")}) format("woff2")}
`;

/** `Compose a *milonga*` → the starred word bold */
const Words = ({ text }: { text: string }) => (
  <>
    {text.split(/(\*[^*]+\*)/).map((p, i) =>
      p.startsWith("*") ? (
        <b key={i} style={{ fontWeight: 800 }}>
          {p.slice(1, -1)}
        </b>
      ) : (
        <span key={i}>{p}</span>
      ),
    )}
  </>
);

const Status = ({ kind, top, dark }: { kind: StorePreviewProps["kind"]; top: number; dark: boolean }) => {
  const { width } = useVideoConfig();
  if (kind === "mac" || !top) return null;
  const c = dark ? "#fff" : "#000";
  const fs = top * (kind === "phone" ? 0.3 : 0.55);
  return (
    <div
      style={{
        position: "absolute",
        inset: "0 0 auto 0",
        height: top,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: `0 ${width * (kind === "phone" ? 0.1 : 0.03)}px`,
        color: c,
        font: `700 ${fs}px/1 Inter, sans-serif`,
      }}
    >
      <span>9:41</span>
      <span
        style={{
          width: fs * 1.7,
          height: fs * 0.8,
          border: `${fs * 0.09}px solid ${c}`,
          borderRadius: fs * 0.22,
          boxSizing: "border-box",
          padding: fs * 0.08,
          display: "block",
        }}
      >
        <span
          style={{ display: "block", width: "100%", height: "100%", background: c, borderRadius: fs * 0.1 }}
        />
      </span>
    </div>
  );
};

const Chapter = ({
  c,
  kind,
  statusTop,
}: {
  c: StorePreviewProps["chapters"][number];
  kind: StorePreviewProps["kind"];
  statusTop: number;
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 12 });
  const zoom = interpolate(frame, [0, c.frames], [1, 1.035]);
  // a long page pans down; a screen zooms in a little
  const pan = c.full
    ? interpolate(frame, [fps * 0.6, c.frames - fps * 0.3], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 0;
  const card = spring({ frame: frame - 6, fps, config: { damping: 18, mass: 0.7 } });
  const portrait = height > width;
  return (
    <AbsoluteFill
      style={{
        background: c.dark ? "#000" : "#f2f0ec",
        transform: `translateX(${(1 - enter) * width * 0.08}px)`,
        opacity: enter,
      }}
    >
      <AbsoluteFill style={{ overflow: "hidden" }}>
        {c.full ? (
          <Img
            src={staticFile(c.full)}
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: "100%",
              transform: `translateY(calc(${-pan} * (100% - ${height}px)))`,
            }}
          />
        ) : (
          <Img
            src={staticFile(c.src)}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "top center",
              transform: `scale(${zoom})`,
              transformOrigin: "50% 30%",
            }}
          />
        )}
      </AbsoluteFill>
      {c.full && kind !== "mac" ? (
        // a page panning under the status bar gets the bar's own band, as iOS draws it over a scrolled page
        <div
          style={{
            position: "absolute",
            inset: "0 0 auto 0",
            height: statusTop,
            background: c.dark ? "rgba(0,0,0,.92)" : "rgba(242,240,236,.94)",
          }}
        />
      ) : null}
      <Status kind={kind} top={statusTop} dark={c.dark} />
      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: portrait ? height * 0.085 : height * 0.07,
          transform: `translateX(-50%) translateY(${(1 - card) * 40}px) scale(${0.92 + 0.08 * card})`,
          opacity: card,
          background: SKY,
          color: C.ink,
          borderRadius: 999,
          padding: portrait
            ? `${width * 0.03}px ${width * 0.06}px`
            : `${height * 0.025}px ${height * 0.06}px`,
          font: `400 ${portrait ? width * 0.062 : height * 0.058}px/1.1 Fraunces, Georgia, serif`,
          letterSpacing: "-0.02em",
          whiteSpace: "nowrap",
          boxShadow: "0 18px 50px rgba(11,10,16,.35)",
        }}
      >
        <Words text={c.words} />
      </div>
    </AbsoluteFill>
  );
};

const Brand = ({ words, lockup }: { words?: string; lockup: string }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 14 });
  const m = Math.min(width, height);
  return (
    <AbsoluteFill style={{ background: SKY, alignItems: "center", justifyContent: "center", gap: m * 0.05 }}>
      <Img
        src={staticFile(lockup)}
        style={{ width: m * 0.5, opacity: s, transform: `translateY(${(1 - s) * 20}px)` }}
      />
      {words ? (
        <div style={{ font: `400 ${m * 0.06}px/1.1 Fraunces, Georgia, serif`, color: C.ink, opacity: s }}>
          <Words text={words} />
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

export const StorePreview = (p: StorePreviewProps) => {
  let at = p.intro;
  return (
    <AbsoluteFill style={{ background: C.ink }} lang={p.lang}>
      <style>{FONTS}</style>
      {p.audio ? <Audio src={staticFile(p.audio)} /> : null}
      <Sequence durationInFrames={p.intro + 8}>
        <Brand lockup="store-creative/lockup.svg" />
      </Sequence>
      {p.chapters.map((c, i) => {
        const from = at;
        at += c.frames;
        return (
          <Sequence
            key={`${c.src}-${i}`}
            from={from}
            durationInFrames={c.frames + (i < p.chapters.length - 1 ? 10 : 0)}
          >
            <Chapter c={c} kind={p.kind} statusTop={p.statusTop} />
          </Sequence>
        );
      })}
      <Sequence from={at} durationInFrames={p.outro}>
        <Brand lockup="store-creative/lockup.svg" words={p.outroWords} />
      </Sequence>
    </AbsoluteFill>
  );
};
