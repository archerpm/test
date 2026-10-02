// e2e: страница не нарушает политику безопасности (CSP) сервера и не обращается к сторонним доменам.
// Запускать против сайта, отданного настоящим nginx:  URL=http://localhost:8080/ node e2e/csp.mjs
import { chromium } from "playwright";
const url = process.env.URL ?? "http://localhost:8080/";
const exe = process.env.CHROME;
const b = await chromium.launch(exe ? { executablePath: exe } : {});
const ctx = await b.newContext({ viewport: { width: 420, height: 900 } });
const p = await ctx.newPage();
const problems = [];
const origin = new URL(url).origin;
p.on("console", (m) => { if (/Content Security Policy|Refused to/.test(m.text())) problems.push("CSP: " + m.text()); });
p.on("pageerror", (e) => problems.push("Ошибка страницы: " + e));
p.on("request", (r) => { if (!r.url().startsWith(origin) && !r.url().startsWith("data:") && !r.url().startsWith("blob:")) problems.push("Сторонний запрос: " + r.url()); });
await p.addInitScript(() => document.addEventListener("securitypolicyviolation", (e) => console.error("Refused to: " + e.violatedDirective + " " + e.blockedURI)));
await p.goto(url);
await p.getByRole("button", { name: "Пройти опрос" }).click();
const next = () => p.getByRole("button", { name: /Далее|Показать результат/ }).click();
const ans = async (t) => { await p.getByRole("button", { name: t, exact: true }).click(); await next(); };
await p.getByRole("spinbutton").fill("8"); await next();
await ans("Нет"); await ans("Да"); await ans("Нет"); await ans("Родитель или усыновитель"); await ans("Работаю неполный день или неделю (в т. ч. дистанционно)");
await ans("Нет"); await ans("Нет"); await ans("Нет"); await ans("Нет");
await ans("В квартире в собственности (моей, семьи, ребёнка)");
await ans("Да"); await ans("Нет"); await ans("Нет"); await ans("Нет"); await ans("Нет");
await ans("Женский"); await p.getByRole("spinbutton").fill("38"); await next();
await p.getByRole("button", { name: "Нет", exact: true }).click(); await p.getByRole("button", { name: "Показать результат" }).click();
await p.waitForSelector("text=Результат на");
await p.locator("details.measure summary").first().click();
await p.getByRole("button", { name: /План действий/ }).click();
await p.getByRole("button", { name: /Все документы/ }).click();
// шрифты должны загрузиться со своего сервера
const fonts = await p.evaluate(async () => { await document.fonts.ready; return [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family); });
if (!fonts.some((f) => /Onest/.test(f))) problems.push("Шрифт Onest не загрузился: " + JSON.stringify(fonts));
await b.close();
if (problems.length) { console.log(problems.join("\n")); process.exit(1); }
console.log("OK: нарушений CSP нет, сторонних запросов нет, шрифты свои:", [...new Set(fonts)].join(", "));
