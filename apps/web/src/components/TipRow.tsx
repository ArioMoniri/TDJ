"use client";
import { ChevronRight, LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";

/**
 * A settings-style row (the same cell markup as Form's Row) that also carries the one-line "what it does" shown
 * on hover: the rooms and share screens explain every action this way.
 */
export function TipRow({
  tile,
  label,
  sub,
  value,
  chevron,
  onClick,
  busy,
  disabled,
  title,
  id,
  "data-testid": testId,
}: {
  tile?: ReactNode;
  label: ReactNode;
  sub?: ReactNode;
  value?: ReactNode;
  chevron?: boolean;
  onClick?: () => void;
  busy?: boolean;
  disabled?: boolean;
  title?: string;
  id?: string;
  "data-testid"?: string;
}) {
  const body = (
    <>
      {tile}
      <span className="min-w-0 flex-1">
        <span className="block truncate">{label}</span>
        {sub && <span className="text-footnote block truncate text-[var(--label-2)]">{sub}</span>}
      </span>
      {value !== undefined && <span className="cell-value text-body">{value}</span>}
      {busy ? (
        <LoaderCircle size={16} className="cell-chevron animate-spin" aria-hidden />
      ) : (
        chevron && <ChevronRight size={16} strokeWidth={2.5} className="cell-chevron" aria-hidden />
      )}
    </>
  );
  const lead = tile ? "tile" : undefined;
  if (!onClick)
    return (
      <div className="cell w-full text-left" data-leading={lead} id={id} title={title} data-testid={testId}>
        {body}
      </div>
    );
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className="cell cell-tap w-full text-left"
      data-leading={lead}
      id={id}
      title={title}
      data-testid={testId}
    >
      {body}
    </button>
  );
}
