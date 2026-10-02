// e2e: экспорт результата в xlsx и pdf
import { chromium } from "playwright";
const url = process.env.URL ?? "http://localhost:4173/";
const exe = process.env.CHROME; // не задан — Playwright использует свой Chromium (npx playwright install chromium)
const b = await chromium.launch(exe ? { executablePath: exe } : {});
const ctx = await b.newContext({ viewport: { width: 420, height: 900 } });
await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(url).origin }).catch(() => {});
const p = await ctx.newPage();
const errs = []; p.on("pageerror", (e) => errs.push(String(e)));
const ok = (c, m) => { if (!c) throw new Error("FAIL: " + m); };
await p.goto(url);
await p.getByRole("button", { name: "Пройти опрос" }).click();
const next = () => p.getByRole("button", { name: /Далее|Показать результат/ }).click();
const ans = async (t) => { await p.getByRole("button", { name: t, exact: true }).click(); await next(); };
await p.getByRole("spinbutton").fill("8"); await next();
await ans("Нет");                           // ещё дети
await ans("Да"); await ans("Нет");          // Москва, ТиНАО
await ans("Родитель или усыновитель");
await ans("Не работаю");
// пенсия/пособие — «Не знаю»
await ans("Не знаю, уточню позже");
await ans("Нет"); await ans("Нет"); await ans("Нет");           // единств., развод, многодетная
await ans("В квартире в собственности (моей, семьи, ребёнка)");
await ans("Да"); await ans("Нет"); await ans("Нет"); await ans("Нет");  // 10 лет, доход, авто, недвижимость ребёнка
await ans("Женский"); await p.getByRole("spinbutton").fill("38"); await next();
await p.getByRole("button", { name: "Нет", exact: true }).click(); await p.getByRole("button", { name: "Показать результат" }).click();
await p.waitForSelector("text=Результат на");
import { writeFileSync, readFileSync } from "node:fs";
const dir = process.env.OUT ?? ".";
const grab = async (name) => {
  const [dl] = await Promise.all([p.waitForEvent("download", { timeout: 30000 }), p.getByRole("button", { name }).click()]);
  const f = `${dir}/${dl.suggestedFilename()}`; await dl.saveAs(f); return f;
};
const x = await grab(/Скачать Excel/);
const pd = await grab(/Скачать PDF/);
ok(readFileSync(x).subarray(0, 2).toString() === "PK", "xlsx — zip");
ok(readFileSync(pd).subarray(0, 4).toString() === "%PDF", "pdf");
ok(x.endsWith(".xlsx") && pd.endsWith(".pdf"), "расширения");
// ---- прогресс: сохранить → открыть заново → загрузить → сразу результат
const js = await grab(/Сохранить прогресс \(JSON\)/);
ok(js.endsWith(".json") && JSON.parse(readFileSync(js, "utf8")).v === 1, "json прогресса");
await p.goto(url);
await p.evaluate(() => localStorage.clear());
await p.reload();
await p.locator('input[type=file]').setInputFiles(js);
await p.waitForSelector("text=Результат на");
ok((await p.innerText("body")).includes("Положено"), "результат после загрузки");
// битый файл
await p.goto(url);
writeFileSync(`${dir}/bad.json`, "{не json");
await p.locator('input[type=file]').setInputFiles(`${dir}/bad.json`);
ok(await p.getByRole("alert").isVisible(), "сообщение о битом файле");
ok(!errs.length, "ошибки страницы: " + errs.join("; "));
console.log("export OK", x, pd);
await b.close();
