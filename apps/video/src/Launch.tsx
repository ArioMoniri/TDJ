import {
  AbsoluteFill,
  Img,
  interpolate,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

const Glass = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => (
  <div
    style={{
      background: "rgba(24,22,34,.55)",
      border: "1px solid rgba(255,255,255,.3)",
      borderRadius: 32,
      boxShadow: "0 20px 60px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.4)",
      backdropFilter: "blur(20px)",
      ...style,
    }}
  >
    {children}
  </div>
);

const Bg = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(1200px 800px at ${10 + f * 0.05}% 10%, #3a1a4a, transparent 60%), radial-gradient(1000px 700px at 90% ${20 + f * 0.04}%, #0f2a52, transparent 60%), radial-gradient(900px 900px at 50% 100%, #4a1626, transparent 60%), #0b0a10`,
      }}
    />
  );
};

const Title = ({ text, sub, delay = 0 }: { text: string; sub?: string; delay?: number }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 200 } });
  return (
    <div
      style={{
        opacity: s,
        transform: `translateY(${(1 - s) * 30}px)`,
        color: "#f6f1e8",
        fontFamily: "Georgia, 'New York', serif",
      }}
    >
      <div style={{ fontSize: 96, fontWeight: 600, letterSpacing: -2, lineHeight: 1.05 }}>{text}</div>
      {sub && (
        <div
          style={{
            fontSize: 34,
            marginTop: 18,
            opacity: 0.75,
            fontFamily: "-apple-system, Inter, system-ui, sans-serif",
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
};

const Shot = ({
  src,
  delay = 0,
  w = 1500,
  tilt = -4,
}: {
  src: string;
  delay?: number;
  w?: number;
  tilt?: number;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 18, stiffness: 90 } });
  return (
    <Img
      src={staticFile(src)}
      style={{
        width: w,
        borderRadius: 28,
        boxShadow: "0 40px 120px rgba(0,0,0,.5)",
        opacity: s,
        transform: `perspective(1600px) rotateY(${tilt}deg) translateY(${(1 - s) * 80}px) scale(${0.96 + s * 0.04})`,
        border: "1px solid rgba(255,255,255,.2)",
      }}
    />
  );
};

const Arc = () => {
  const frame = useCurrentFrame();
  const pts = [44, 42, 50, 54, 58, 64, 70, 76, 74, 80, 84, 78, 72, 76, 82, 88, 86, 80, 70, 60, 52, 46];
  const W = 1500,
    H = 420;
  const x = (i: number) => 40 + (i / (pts.length - 1)) * (W - 80),
    y = (e: number) => H - 30 - (e / 100) * (H - 60);
  const n = Math.min(
    pts.length,
    Math.floor(interpolate(frame, [0, 60], [0, pts.length], { extrapolateRight: "clamp" })),
  );
  const d = pts
    .slice(0, Math.max(2, n))
    .map((e, i) => `${i ? "L" : "M"}${x(i)},${y(e)}`)
    .join(" ");
  return (
    <svg width={W} height={H}>
      <path d={d} fill="none" stroke="#e0557a" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
      {pts.slice(0, n).map((e, i) => (
        <circle
          key={i}
          cx={x(i)}
          cy={y(e)}
          r="13"
          fill={i % 6 === 2 ? "#4fd1c5" : i % 6 === 5 ? "#8b7cf6" : "#e0557a"}
          stroke="#fff"
          strokeWidth="4"
        />
      ))}
      {["warm-up", "build", "peak", "second peak", "cool-down", "La Cumparsita"].map((t, i) => (
        <text
          key={t}
          x={x(Math.round((i / 5) * (pts.length - 1)))}
          y={H - 4}
          fill="#fff"
          opacity=".6"
          fontSize="22"
          textAnchor="middle"
          fontFamily="Inter, system-ui"
        >
          {t}
        </text>
      ))}
    </svg>
  );
};

export const Launch = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const logoS = spring({ frame, fps, config: { damping: 14 } });
  return (
    <AbsoluteFill style={{ fontFamily: "-apple-system, Inter, system-ui, sans-serif" }}>
      <Bg />
      <Sequence from={0} durationInFrames={120}>
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 40 }}>
          <Img
            src={staticFile("logo.svg")}
            style={{ width: 220, transform: `scale(${logoS}) rotate(${(1 - logoS) * -40}deg)` }}
          />
          <Title text="TDJ" sub="Compose a milonga, tanda by tanda." delay={10} />
        </AbsoluteFill>
      </Sequence>
      <Sequence from={120} durationInFrames={150}>
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 30 }}>
          <Title
            text="A night-long energy arc"
            sub="Warm-up, two peaks, cool-down. Every tanda placed where the floor wants it."
          />
          <Glass style={{ padding: 30 }}>
            <Arc />
          </Glass>
        </AbsoluteFill>
      </Sequence>
      <Sequence from={270} durationInFrames={150}>
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 30 }}>
          <Title
            text="Coherent tandas, matched cortinas"
            sub="One orchestra, one singer, four years max. Cortinas tuned to what plays next."
          />
          <Shot src="03-tandas.png" />
        </AbsoluteFill>
      </Sequence>
      <Sequence from={420} durationInFrames={150}>
        <AbsoluteFill
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 60 }}
        >
          <Shot src="09-mobile-result.png" w={420} tilt={6} />
          <div style={{ maxWidth: 800 }}>
            <Title
              text="Golden age or any era"
              sub="21,932 recordings indexed in the repo. 1 to 8 hours. Turkish, Greek, Persian, Balkan or trend cortinas."
            />
          </div>
        </AbsoluteFill>
      </Sequence>
      <Sequence from={570} durationInFrames={150}>
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 30 }}>
          <Title
            text="Export anywhere"
            sub="Spotify · Rekordbox · Traktor · Serato · M3U8 · XSPF · CSV · JSON"
          />
          <Shot src="04-export.png" w={1300} tilt={3} />
        </AbsoluteFill>
      </Sequence>
    </AbsoluteFill>
  );
};
