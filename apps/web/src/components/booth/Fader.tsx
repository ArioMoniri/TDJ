"use client";

/**
 * A fader: a range input, vertical on desktop (drag down = less), horizontal on phones. Transform-free, 44 px
 * thick, keyboard arrows move it in `step`s. The cortina fader (0…1) and the master (−30…+6 dB) share it.
 */
export function Fader({
  label,
  value,
  min,
  max,
  step,
  onChange,
  vertical = false,
  display,
  testId,
  className = "",
  hint,
  disabled,
}: {
  /** round 21: one line under the label saying what the fader does */
  hint?: string;
  /** 2026-11: the room's device has no such control (say why in `hint`) */
  disabled?: boolean;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  vertical?: boolean;
  display?: string;
  testId?: string;
  className?: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <label
      className={`booth-fader ${vertical ? "booth-fader-v" : ""} ${className}`}
      data-testid={testId}
      data-disabled={disabled || undefined}
    >
      <span className="booth-fader-label">
        <span className="text-caption2 font-medium text-[var(--label-2)]">{label}</span>
        {hint && (
          <span
            className="booth-fader-hint text-caption2 text-[var(--label-3)]"
            data-testid={testId ? `${testId}-hint` : undefined}
          >
            {hint}
          </span>
        )}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        aria-description={hint}
        aria-valuetext={display}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ ["--pct" as string]: `${pct}%` }}
      />
      {display && <span className="text-caption2 tabular-nums text-[var(--label-2)]">{display}</span>}
    </label>
  );
}
