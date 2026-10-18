import { readFileSync } from "node:fs";
import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const p = await b.newPage({ viewport: { width: 1000, height: 220 } });
const svg = readFileSync("/home/user/TDJ/brand/logo-animated.svg", "utf8");
await p.setContent(`<body style="margin:10px;background:#fff">${svg}</body>`);
const el = p.locator("svg");
for (const t of [0.6, 1.5, 2.4, 3.3, 4.5]) { await el.evaluate((e, t) => { e.pauseAnimations(); e.setCurrentTime(t); }, t); await p.screenshot({ path: `/tmp/claude-0/-home-user-TDJ/73d2c9cf-6bc0-5f5f-b08c-fd038ddd8f72/scratchpad/r/anim_${t}.png`, clip: { x: 0, y: 0, width: 200, height: 200 } }); }
await b.close();
