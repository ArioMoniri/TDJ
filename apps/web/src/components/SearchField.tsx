"use client";
import { CircleX, LoaderCircle, Search } from "lucide-react";
import { useState } from "react";
import { useMediaQuery } from "@/lib/hooks";
import { lower, t as tx } from "@/lib/i18n";
import { Tip, useTip } from "./ui/Tip";

/** UISearchBar: 36 pt field, magnifier, clear glyph, Cancel on focus (phone). 17 pt text so iOS never zooms. */
export function SearchField({
  id,
  value,
  onChange,
  placeholder,
  label,
  busy = false,
  className = "",
  onFocusChange,
  tip,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  /** accessible name */
  label: string;
  busy?: boolean;
  className?: string;
  onFocusChange?: (focused: boolean) => void;
  /** the field's help tag; defaults to its placeholder, which says what it searches */
  tip?: string;
}) {
  const [focused, setFocused] = useState(false);
  const t = useTip<HTMLLabelElement>(tip ?? tx("searchField.search_by", { placeholder: lower(placeholder) }));
  const isPhone = useMediaQuery("(max-width: 639px)");
  const showCancel = isPhone && (focused || value.length > 0);
  const focus = (f: boolean) => {
    setFocused(f);
    onFocusChange?.(f);
  };
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <label htmlFor={id} className="search-field min-w-0 flex-1" {...t.props}>
        {t.tag}
        {busy ? (
          <LoaderCircle size={16} strokeWidth={2} className="animate-spin" aria-hidden />
        ) : (
          <Search size={16} strokeWidth={2} aria-hidden />
        )}
        <span className="sr-only">{label}</span>
        <input
          id={id}
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => focus(true)}
          onBlur={() => focus(false)}
          placeholder={placeholder}
          enterKeyHint="search"
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
        />
        {value && (
          <Tip text={tx("searchField.clear_the_search")}>
            <button
              type="button"
              className="-my-1 grid h-11 w-10 shrink-0 place-items-center"
              aria-label={tx("searchField.clear_search")}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => onChange("")}
            >
              <CircleX size={18} strokeWidth={2} fill="currentColor" stroke="rgb(var(--bg-cell))" />
            </button>
          </Tip>
        )}
      </label>
      {showCancel && (
        <button
          type="button"
          className="btn-plain"
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => {
            onChange("");
            (document.getElementById(id) as HTMLInputElement | null)?.blur();
            focus(false);
          }}
        >
          {tx("searchField.cancel")}
        </button>
      )}
    </div>
  );
}
