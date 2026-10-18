/** TDJ mark: a vinyl groove ring broken into a rising three-step "tanda arc" — see brand/logo.svg */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" role="img" aria-label="TDJ logo">
      <defs>
        <linearGradient id="tdj-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ff8aa6" /><stop offset="1" stopColor="#c13b62" /></linearGradient>
      </defs>
      <circle cx="128" cy="128" r="112" fill="url(#tdj-g)" />
      <path d="M128 48a80 80 0 1 1-80 80" fill="none" stroke="#fff" strokeOpacity=".9" strokeWidth="14" strokeLinecap="round" />
      <path d="M72 168h28v-32h28v-32h28v-32" fill="none" stroke="#fff" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="128" cy="128" r="14" fill="#fff" />
    </svg>
  );
}
