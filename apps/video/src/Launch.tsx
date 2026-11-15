/**
 * The launch video (`pnpm video` → media/video/launch.mp4): the logo, then the README clips one after another, each
 * with one line of caption, then where to get it. The clips are the real captures from `pnpm media`
 * (media/readme/*.mp4), copied into public/clips by scripts/sync-clips.mjs before the render.
 */
import {
  AbsoluteFill,
  Img,
  interpolate,
  OffthreadVideo,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export const LAUNCH_FPS = 30;
const INTRO = 75;
const OUTRO = 105;

/** clip, caption, seconds of the clip to show (from its start) */
export const SCENES: Array<[string, string, number]> = [
  ["compose", "One tap composes the night: tandas, cortinas, the arc.", 7],
  ["booth", "The Booth plays it. Pre-listen in your headphones.", 7],
  ["ai-edit", "“Make tanda 7 calmer.” A checked change, with Undo.", 6],
  ["rooms", "Two DJs, one night, every edit on both sides.", 7],
  ["share", "Share a night with a QR code.", 5],
  ["ipad", "On the iPad,", 5],
  ["dark", "and in the dark booth.", 5],
];
export const LAUNCH_FRAMES = INTRO + OUTRO + SCENES.reduce((n, s) => n + s[2] * LAUNCH_FPS, 0);

const BG =
  "radial-gradient(1300px 800px at 12% 8%, #f07aa0 0%, transparent 60%), radial-gradient(1100px 900px at 92% 96%, #5b2a86 0%, transparent 62%), linear-gradient(135deg, #b0305e 0%, #7a2350 52%, #3b1840 100%)";

const Rise = ({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 200 } });
  return <div style={{ opacity: s, transform: `translateY(${(1 - s) * 24}px)` }}>{children}</div>;
};

const Scene = ({ clip, caption, frames }: { clip: string; caption: string; frames: number }) => {
  const frame = useCurrentFrame();
  const fade = interpolate(frame, [0, 8, frames - 8, frames], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill style={{ opacity: fade }}>
      <OffthreadVideo
        src={staticFile(`clips/${clip}.mp4`)}
        muted
        style={{
          position: "absolute",
          left: 240,
          top: 120,
          width: 1440,
          height: 900,
          borderRadius: 28,
          boxShadow: "0 40px 90px -30px rgba(30,6,24,.6)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 36,
          width: "100%",
          textAlign: "center",
          color: "#fff",
          fontSize: 46,
          fontWeight: 600,
          letterSpacing: -0.5,
          textShadow: "0 2px 18px rgba(40,0,30,.35)",
        }}
      >
        <Rise>{caption}</Rise>
      </div>
    </AbsoluteFill>
  );
};

export const Launch = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const logo = spring({ frame, fps, config: { damping: 14 } });
  let at = INTRO;
  return (
    <AbsoluteFill style={{ background: BG, fontFamily: "-apple-system, Inter, system-ui, sans-serif" }}>
      <Sequence durationInFrames={INTRO}>
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 28, color: "#fff" }}>
          <Img
            src={staticFile("logo-reversed.svg")}
            style={{
              width: 200,
              transform: `scale(${logo}) rotate(${(1 - logo) * -40}deg)`,
              filter: "drop-shadow(0 10px 30px rgba(0,0,0,.3))",
            }}
          />
          <Rise delay={8}>
            <div style={{ fontSize: 110, fontWeight: 700, letterSpacing: -3 }}>T-DJ</div>
          </Rise>
          <Rise delay={16}>
            <div style={{ fontSize: 38, opacity: 0.9 }}>A milonga, built the way a tango DJ builds one.</div>
          </Rise>
        </AbsoluteFill>
      </Sequence>
      {SCENES.map(([clip, caption, secs]) => {
        const from = at;
        const frames = secs * LAUNCH_FPS;
        at += frames;
        return (
          <Sequence key={clip} from={from} durationInFrames={frames}>
            <Scene clip={clip} caption={caption} frames={frames} />
          </Sequence>
        );
      })}
      <Sequence from={LAUNCH_FRAMES - OUTRO}>
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 26, color: "#fff" }}>
          <Img src={staticFile("logo-reversed.svg")} style={{ width: 130 }} />
          <Rise>
            <div style={{ fontSize: 64, fontWeight: 700, letterSpacing: -1.5 }}>Mac, iPad and the web</div>
          </Rise>
          <Rise delay={8}>
            <div style={{ fontSize: 34, opacity: 0.9 }}>github.com/ArioMoniri/TDJ</div>
          </Rise>
        </AbsoluteFill>
      </Sequence>
    </AbsoluteFill>
  );
};
