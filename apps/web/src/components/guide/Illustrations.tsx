/**
 * The Guide's drawn pictures: small inline SVGs on the theme's colours (they follow light and dark), with a gentle
 * CSS loop that stops under reduced motion (guide.css). Decorative: the chapter's words carry the meaning.
 */
export type IllustrationId = "chat" | "hand" | "closing" | "share" | "versions";

function Chat() {
  return (
    <>
      <g className="gi-rise" style={{ animationDelay: "0s" }}>
        <rect x="58" y="14" width="88" height="34" rx="12" className="gi-tint" />
        <rect x="70" y="25" width="56" height="5" rx="2.5" className="gi-on-tint" />
        <rect x="70" y="34" width="38" height="5" rx="2.5" className="gi-on-tint" />
      </g>
      <g className="gi-rise" style={{ animationDelay: "0.6s" }}>
        <rect x="14" y="58" width="96" height="44" rx="12" className="gi-soft" />
        <circle cx="31" cy="73" r="7" className="gi-green" />
        <path d="M27.5 73l2.5 2.5 4.5-5" className="gi-check" />
        <rect x="44" y="69" width="54" height="5" rx="2.5" className="gi-line" />
        <circle cx="31" cy="90" r="7" className="gi-soft-2" />
        <rect x="44" y="86" width="40" height="5" rx="2.5" className="gi-line" />
      </g>
    </>
  );
}

function Hand() {
  return (
    <>
      {[0, 1, 3].map((i) => (
        <rect key={i} x={18 + i * 32} y="62" width="26" height="36" rx="6" className="gi-tint" />
      ))}
      <rect x="82" y="62" width="26" height="36" rx="6" className="gi-slot" />
      <g className="gi-drop">
        <rect x="82" y="62" width="26" height="36" rx="6" className="gi-amber" />
        <path
          d="M95 56 v-22 a4 4 0 0 1 8 0 v14 l10 3 a5 5 0 0 1 3.5 6 l-3 12 h-15 l-6-8"
          className="gi-hand"
        />
      </g>
      <rect x="14" y="104" width="132" height="3" rx="1.5" className="gi-soft" />
    </>
  );
}

function Closing() {
  const tiles: Array<[string, boolean]> = [
    ["T", true],
    ["V", false],
    ["T", true],
    ["M", false],
  ];
  return (
    <>
      {tiles.map(([g, on], i) => (
        <g key={i} opacity={on ? 1 : 0.4}>
          <rect
            x={10 + i * 30}
            y="48"
            width="24"
            height="30"
            rx="6"
            className={on ? "gi-tint" : "gi-soft-2"}
          />
          <text x={22 + i * 30} y="68" textAnchor="middle" className={on ? "gi-label-on" : "gi-label"}>
            {g}
          </text>
          {!on && <path d={`M${12 + i * 30} 76 L${32 + i * 30} 50`} className="gi-strike" />}
        </g>
      ))}
      <g className="gi-flag">
        <path d="M134 34 v52" className="gi-pole" />
        <path d="M135 35 h18 l-5 7 l5 7 h-18 z" className="gi-amber" />
      </g>
      <rect x="10" y="92" width="140" height="3" rx="1.5" className="gi-soft" />
    </>
  );
}

function Share() {
  // the night (centre) goes out three ways: a link, a file, a QR code
  const ends = [
    [24, 30],
    [24, 92],
    [136, 62],
  ] as const;
  return (
    <>
      {ends.map(([x, y], i) => (
        <g key={i}>
          <path d={`M80 62 L${x} ${y}`} className="gi-wire" />
          <circle
            cx={(80 + x) / 2}
            cy={(62 + y) / 2}
            r="3"
            className="gi-amber gi-travel"
            style={{ animationDelay: `${i * 0.5}s` }}
          />
        </g>
      ))}
      <rect x="62" y="40" width="36" height="44" rx="7" className="gi-tint" />
      <rect x="70" y="50" width="20" height="4" rx="2" className="gi-on-tint" />
      <rect x="70" y="58" width="14" height="4" rx="2" className="gi-on-tint" />
      {/* link: two chain links */}
      <g transform="translate(10 18)">
        <rect width="28" height="24" rx="6" className="gi-soft" />
        <rect x="5" y="9" width="11" height="6" rx="3" className="gi-ink" />
        <rect x="12" y="9" width="11" height="6" rx="3" className="gi-ink" />
      </g>
      {/* file */}
      <g transform="translate(10 80)">
        <rect width="28" height="24" rx="6" className="gi-soft" />
        <path d="M9 5h7l4 4v10H9z M16 5v4h4" className="gi-ink" />
      </g>
      {/* QR */}
      <g transform="translate(122 48)">
        <rect width="28" height="28" rx="6" className="gi-soft" />
        {[
          [5, 5],
          [17, 5],
          [5, 17],
          [12, 12],
          [17, 17],
        ].map(([x, y], i) => (
          <rect key={i} x={x} y={y} width="6" height="6" rx="1" className="gi-ink-fill" />
        ))}
      </g>
    </>
  );
}

function Versions() {
  const years = ["1938", "1941", "1956"];
  return (
    <>
      {years.map((y, i) => (
        <g key={y} className={i === 1 ? "gi-pick" : undefined}>
          <rect
            x="20"
            y={18 + i * 30}
            width="120"
            height="24"
            rx="7"
            className={i === 1 ? "gi-tint-soft" : "gi-soft"}
          />
          <circle cx="36" cy={30 + i * 30} r="8" className="gi-disc" />
          <circle cx="36" cy={30 + i * 30} r="2.5" className={i === 1 ? "gi-tint" : "gi-soft-2"} />
          <rect x="52" y={25 + i * 30} width="44" height="4" rx="2" className="gi-line" />
          <text x="132" y={34 + i * 30} textAnchor="end" className="gi-year">
            {y}
          </text>
        </g>
      ))}
    </>
  );
}

const ART: Record<IllustrationId, () => React.JSX.Element> = {
  chat: Chat,
  hand: Hand,
  closing: Closing,
  share: Share,
  versions: Versions,
};

export function Illustration({ id }: { id: IllustrationId }) {
  const Art = ART[id];
  return (
    <svg
      viewBox="0 0 160 120"
      className="guide-illustration"
      data-testid="guide-illustration"
      data-art={id}
      aria-hidden
      focusable="false"
    >
      <Art />
    </svg>
  );
}
