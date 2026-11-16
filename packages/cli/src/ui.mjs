// Terminal output: colours (off with NO_COLOR, --no-color or a non-TTY), the banner, prompts.
import { createInterface } from "node:readline/promises";

/** @param {{ color?: boolean }} [o] */
export function palette({ color = true } = {}) {
  /** @param {string} code */
  const wrap = (code) => (/** @type {string} */ s) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
  return {
    rose: wrap("38;5;204"),
    violet: wrap("38;5;141"),
    cream: wrap("38;5;230"),
    green: wrap("32"),
    yellow: wrap("33"),
    red: wrap("31"),
    dim: wrap("2"),
    bold: wrap("1"),
  };
}

/** @param {NodeJS.ProcessEnv} env @param {boolean} isTTY @param {boolean} flag */
export const useColor = (env, isTTY, flag) => flag !== false && !env.NO_COLOR && env.TERM !== "dumb" && isTTY;

export const CREDIT = "Developed by Ariorad Moniri";

/** Pure-ASCII stand-ins for the banner's box and block characters (TERM=dumb, non-UTF-8 terminals). */
const ASCII = /** @type {Record<string, string>} */ ({
  "█": "#",
  "╱": "/",
  "╲": "\\",
  "│": "|",
  "─": "-",
  "┌": "+",
  "┐": "+",
  "└": "+",
  "┘": "+",
  "●": "o",
  "·": "-",
});

/** True when the terminal may not draw Unicode box characters. @param {NodeJS.ProcessEnv} env */
export function asciiOnly(env) {
  if (env.TERM === "dumb" || env.TDJ_ASCII === "1") return true;
  const locale = env.LC_ALL || env.LC_CTYPE || env.LANG || "";
  return locale !== "" && locale !== "C.UTF-8" && !/utf-?8/i.test(locale);
}

/**
 * A bandoneon (two button boards, the bellows between them) over the T-DJ wordmark, under 50 columns so it fits
 * any terminal. Plain when colour is off; pure ASCII with `ascii`.
 * @param {ReturnType<typeof palette>} c @param {{ ascii?: boolean }} [o]
 */
export function banner(c, { ascii = false } = {}) {
  const b = c.cream;
  const f = c.rose;
  const w = (/** @type {string} */ s) => c.bold(c.violet(s));
  const lines = [
    `   ${b("┌───────┐")}${f("╱╲╱╲╱╲╱╲╱╲╱╲╱")}${b("┌───────┐")}`,
    `   ${b("│ ● ● ● │")}${f(" │ │ │ │ │ │ ")}${b("│ ● ● ● │")}`,
    `   ${b("│● ● ● ●│")}${f(" │ │ │ │ │ │ ")}${b("│● ● ● ●│")}`,
    `   ${b("│ ● ● ● │")}${f(" │ │ │ │ │ │ ")}${b("│ ● ● ● │")}`,
    `   ${b("└───────┘")}${f("╲╱╲╱╲╱╲╱╲╱╲╱╲")}${b("└───────┘")}`,
    "",
    `   ${w("████████         ██████         ██")}`,
    `   ${w("   ██            ██   ██        ██")}`,
    `   ${w("   ██   ██████   ██   ██        ██")}`,
    `   ${w("   ██            ██   ██  ██    ██")}`,
    `   ${w("   ██            ██████    █████")}`,
    "",
    `   ${c.dim("tandas · cortinas · one night")}`,
    `   ${c.dim(CREDIT)}`,
  ];
  const out = lines.join("\n");
  return ascii ? [...out].map((ch) => ASCII[ch] ?? ch).join("") : out;
}

/**
 * Prompts; `answers` (tests, --yes) short-circuit the terminal.
 * @param {{ input?: NodeJS.ReadableStream, output?: NodeJS.WritableStream, answers?: Record<string,string>, yes?: boolean }} o
 */
export function prompter({ input = process.stdin, output = process.stdout, answers, yes = false } = {}) {
  /** @param {string} id @param {string} question @param {{ default?: string, secret?: boolean, validate?: (v: string) => string | null }} [o] */
  async function ask(id, question, o = {}) {
    if (answers && id in answers) return answers[id] ?? "";
    if (yes) {
      if (o.default !== undefined) return o.default;
      throw new Error(`--yes: no value for "${id}" (pass it as a flag)`);
    }
    const rl = createInterface({ input, output, terminal: true });
    try {
      for (;;) {
        const hint = o.default ? ` (${o.default})` : "";
        let v;
        if (o.secret) {
          // muted echo: what is typed never appears on screen or in scrollback
          const out = /** @type {any} */ (output);
          const write = out.write.bind(out);
          out.write = (/** @type {string} */ s) => (s.includes(question) ? write(s) : true);
          v = await rl.question(`${question}${hint}: `);
          out.write = write;
          write("\n");
        } else {
          v = await rl.question(`${question}${hint}: `);
        }
        v = v.trim() || o.default || "";
        const err = o.validate ? o.validate(v) : null;
        if (!err) return v;
        output.write(`  ${err}\n`);
      }
    } finally {
      rl.close();
    }
  }
  /** @param {string} id @param {string} question @param {boolean} [def] */
  async function confirm(id, question, def = true) {
    const v = await ask(id, `${question} ${def ? "[Y/n]" : "[y/N]"}`, { default: def ? "y" : "n" });
    return /^y(es)?$/i.test(v);
  }
  /** @param {string} id @param {string} question @param {string[]} choices @param {string} def */
  async function choose(id, question, choices, def) {
    return ask(id, `${question} [${choices.join("/")}]`, {
      default: def,
      validate: (v) => (choices.includes(v) ? null : `Choose one of: ${choices.join(", ")}`),
    });
  }
  return { ask, confirm, choose };
}
