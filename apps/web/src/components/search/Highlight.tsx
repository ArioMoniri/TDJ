import "./search.css";
import { Fragment } from "react";

/** a text with the spans the search matched marked (spans in the text's own offsets, from core `searchSongs`) */
export function Highlight({
  text,
  spans,
}: {
  text: string | null | undefined;
  spans?: Array<[number, number]>;
}) {
  if (!text) return null;
  if (!spans?.length) return <>{text}</>;
  const out: React.ReactNode[] = [];
  let at = 0;
  const sorted = [...spans].sort((a, b) => a[0] - b[0]);
  sorted.forEach(([s, e], k) => {
    if (s < at || e <= s || e > text.length) return;
    if (s > at) out.push(<Fragment key={`t${k}`}>{text.slice(at, s)}</Fragment>);
    out.push(
      <mark key={`m${k}`} className="search-hit">
        {text.slice(s, e)}
      </mark>,
    );
    at = e;
  });
  if (at < text.length) out.push(<Fragment key="end">{text.slice(at)}</Fragment>);
  return <>{out}</>;
}
