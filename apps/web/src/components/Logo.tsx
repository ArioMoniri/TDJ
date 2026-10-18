/** TDJ mark: the night as a record groove, opened where the tanda line rises (slow → up → settle). Source: brand/logo.svg */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" role="img" aria-label="TDJ logo">
      <defs>
        <linearGradient id="tdj-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff8aa6" />
          <stop offset="1" stopColor="#c13b62" />
        </linearGradient>
      </defs>
      <circle cx="128" cy="128" r="120" fill="url(#tdj-g)" />
      <path
        d="M128 48 A80 80 0 1 1 48 128"
        fill="none"
        stroke="#fff"
        strokeWidth="22"
        strokeLinecap="round"
      />
      <path
        d="M66 172 H110 V128 H154 V84 H190"
        fill="none"
        stroke="#fff"
        strokeWidth="22"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
