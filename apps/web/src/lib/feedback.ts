import type { Feedback } from "@tdj/core";

export const FEEDBACK_VALUES: Feedback[] = [
  "more-energetic",
  "calmer",
  "more-vals",
  "more-milongas",
  "fewer-milongas",
  "earlier-peak",
  "later-peak",
  "more-vocal",
  "more-instrumental",
  "warmer-start",
  "stronger-finish",
  "fewer-repeats",
  "more-variety",
  "shorter-cortinas",
  "longer-cortinas",
  "more-romantic",
  "more-playful",
  "more-dramatic",
];

/** The chips shown under a finished set, in display order. */
export const FEEDBACK_CHIPS: Array<[Feedback, string]> = [
  ["more-energetic", "More energetic"],
  ["calmer", "Calmer"],
  ["warmer-start", "Warmer start"],
  ["stronger-finish", "Stronger finish"],
  ["more-vals", "More vals"],
  ["more-milongas", "More milongas"],
  ["fewer-repeats", "Fewer repeats"],
  ["more-romantic", "More romantic"],
  ["more-playful", "More playful"],
  ["shorter-cortinas", "Shorter cortinas"],
];

const KEYWORDS: Array<[RegExp, Feedback]> = [
  [/\b(more )?(energ|lively|faster|punch|drive|up-?tempo)/i, "more-energetic"],
  [/\b(calm|softer|slower|gentler|quieter|relax|tone (it )?down)/i, "calmer"],
  [/\b(warm(er)? start|gentle (start|opening)|ease in|slow start)/i, "warmer-start"],
  [/\b(strong(er)? (finish|ending|close)|big ending|end strong)/i, "stronger-finish"],
  [/\b(more vals|more waltz|extra vals)/i, "more-vals"],
  [/\b(more milonga)/i, "more-milongas"],
  [/\b(fewer milonga|less milonga|no milonga)/i, "fewer-milongas"],
  [/\b(fewer repeat|less repeat|too (much|many) (of the )?same|repeat)/i, "fewer-repeats"],
  [/\b(more variety|more orchestras|mix it up|diverse)/i, "more-variety"],
  [/\b(short(er)? cortina)/i, "shorter-cortinas"],
  [/\b(long(er)? cortina)/i, "longer-cortinas"],
  [/\b(romantic|tender|lyrical|sweet)/i, "more-romantic"],
  [/\b(playful|fun|cheeky|light)/i, "more-playful"],
  [/\b(dramatic|intense|pugliese)/i, "more-dramatic"],
  [/\b(more vocal|more singers|sung)/i, "more-vocal"],
  [/\b(instrumental)/i, "more-instrumental"],
  [/\b(earl(y|ier) peak|peak sooner)/i, "earlier-peak"],
  [/\b(late(r)? peak|peak later)/i, "later-peak"],
];

/** Free text → feedback values by keyword, for when no model is available or its answer does not parse. */
export function feedbackFromText(text: string): Feedback[] {
  const out: Feedback[] = [];
  for (const [re, f] of KEYWORDS) if (re.test(text) && !out.includes(f)) out.push(f);
  return out;
}
