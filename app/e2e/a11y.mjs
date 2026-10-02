// Автоматическая проверка доступности (axe-core, WCAG 2.1 A/AA) на основных экранах в трёх темах.
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const url = process.env.URL ?? "http://localhost:4173/";
const exe = process.env.CHROME; // не задан — Playwright использует свой Chromium (npx playwright install chromium)
const axeSrc = readFileSync(new URL("../node_modules/axe-core/axe.min.js", import.meta.url), "utf8");
const b = await chromium.launch(exe ? { executablePath: exe } : {});
let total = 0;

async function check(p, label) {
  await p.evaluate(axeSrc);
  const r = await p.evaluate(async () => await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } }));
  for (const v of r.violations) {
    total += v.nodes.length;
    console.log(`✗ [${label}] ${v.id} (${v.impact}): ${v.help} — ${v.nodes.length} шт.`);
    for (const n of v.nodes.slice(0, 3)) console.log("    ", n.target.join(" "), "|", (n.failureSummary || "").split("\n")[1] ?? "");
  }
}

async function flow(scheme, mode) {
  const ctx = await b.newContext({ viewport: { width: 420, height: 900 }, colorScheme: scheme });
  const p = await ctx.newPage();
  await p.goto(url);
  if (mode === "contrast") await p.getByRole("button", { name: "Контраст" }).click();
  if (mode === "big") await p.getByRole("button", { name: "Крупный шрифт" }).click();
  const tag = `${scheme}${mode ? "/" + mode : ""}`;
  await check(p, tag + " старт");
  await p.getByRole("button", { name: "Пройти опрос" }).click();
  await check(p, tag + " вопрос");
  const next = () => p.getByRole("button", { name: /Далее|Показать результат/ }).click();
  const ans = async (t) => { await p.getByRole("button", { name: t, exact: true }).click(); await next(); };
  await p.getByRole("spinbutton").fill("8"); await next();
  await ans("Нет"); await ans("Да"); await ans("Нет"); await ans("Родитель или усыновитель"); await ans("Не работаю");
  await ans("Не знаю, уточню позже"); await ans("Нет"); await ans("Нет"); await ans("Нет");
  await ans("В квартире в собственности (моей, семьи, ребёнка)");
  await ans("Да"); await ans("Нет"); await ans("Нет"); await ans("Нет");
  await ans("Женский"); await p.getByRole("spinbutton").fill("38"); await next();
  await p.getByRole("button", { name: "Нет", exact: true }).click(); await p.getByRole("button", { name: "Показать результат" }).click();
  await p.waitForSelector("text=Результат на");
  await p.locator("details.measure summary").first().click();
  await p.locator("button.term").first().click().catch(() => {});
  await check(p, tag + " результат");
  await p.getByRole("button", { name: /План действий/ }).click();
  await check(p, tag + " план");
  await p.getByRole("button", { name: /Все документы/ }).click();
  await check(p, tag + " документы");
  await ctx.close();
}
await flow("light"); await flow("dark"); await flow("light", "contrast"); await flow("light", "big");
console.log(total ? `Нарушений: ${total}` : "OK: нарушений WCAG A/AA не найдено");
await b.close();
process.exit(total ? 1 : 0);
