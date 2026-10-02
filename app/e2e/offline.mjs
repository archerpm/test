// e2e: после первого открытия приложение работает без сети
import { chromium } from "playwright";
const url = process.env.URL ?? "http://localhost:4173/";
const exe = process.env.CHROME;
const b = await chromium.launch(exe ? { executablePath: exe } : {});
const ctx = await b.newContext();
const p = await ctx.newPage();
await p.goto(url);
await p.evaluate(async () => { await navigator.serviceWorker.ready; });
await p.reload(); // страница уже под контролем воркера: ресурсы попадают в кэш
await p.waitForSelector("text=Пройти опрос");
await ctx.setOffline(true);
await p.reload();
await p.waitForSelector("text=Пройти опрос", { timeout: 10000 });
await p.getByRole("button", { name: "Пройти опрос" }).click();
await p.waitForSelector("text=Вопрос 1 из");
console.log("OK: работает офлайн");
await b.close();
