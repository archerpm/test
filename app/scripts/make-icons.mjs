import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const svg = readFileSync("public/icon.svg", "utf8");
const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
for (const s of [192, 512]) {
  const p = await b.newPage({ viewport: { width: s, height: s } });
  await p.setContent(`<body style="margin:0;background:transparent">${svg.replace("<svg ", `<svg width="${s}" height="${s}" `)}</body>`);
  await p.screenshot({ path: `public/icon-${s}.png`, omitBackground: true });
}
await b.close();
