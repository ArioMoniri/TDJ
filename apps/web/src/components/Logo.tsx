/**
 * TDJ mark — "Tanda arc": a record whose groove rises as a tanda (slow → up → settle) and leaves the disc.
 * Geometry is the master in brand/logo.svg (256 grid, 24-unit stroke, overpass knockout where the line crosses the ring).
 * The record uses `currentColor` so it follows the surrounding text colour (cream on the dark UI, ink on light);
 * the tanda line is always rose.
 */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" role="img" aria-label="TDJ logo">
      {/* record: full ring, cut where the settle tread passes over it */}
      <path fill="currentColor" d="M217.98 108 A100 100 0 1 1 200 68 L166.65 68 A76 76 0 1 0 193.32 108 Z" />
      {/* tanda line: grows out of the ring's inner edge, rises through the centre, exits right */}
      <path fill="#E0557A" d="M49.99 156 H132 V76 H244 V100 H108 V180 H65.4 A75.4 75.4 0 0 1 49.99 156 Z" />
    </svg>
  );
}
