import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const [, , inp, out, w] = process.argv;
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const p = await b.newPage({ viewport: { width: Number(w || 1600), height: 900 }, deviceScaleFactor: 1 });
await p.setContent(
  `<html><body style="margin:0;background:#fff">${readFileSync(inp, "utf8").replace(/<\?xml[^>]*>/, "")}</body></html>`,
);
const svg = p.locator("svg").first();
await svg.evaluate(
  (e, w) => {
    e.setAttribute("width", w);
    e.removeAttribute("height");
  },
  String(w || 1600),
);
await svg.screenshot({ path: out });
await b.close();
console.log("ok", out);
