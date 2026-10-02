// e2e: работающий родитель → заявление 516н → PDF; памятка подачи
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
const url = process.env.URL ?? "http://localhost:4173/";
const exe = process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const out = process.env.OUT ?? "/tmp/claude-0";
const b = await chromium.launch({ executablePath: exe });
const p = await b.newPage({ viewport: { width: 900, height: 1000 } });
const errs = []; p.on("pageerror", (e) => errs.push(String(e)));
await p.goto(url);
await p.getByRole("button", { name: "Пройти опрос" }).click();
const next = () => p.getByRole("button", { name: /Далее|Показать результат/ }).click();
const ans = async (t) => { await p.getByRole("button", { name: t, exact: true }).click(); await next(); };
await p.getByRole("spinbutton").fill("8"); await next();
await ans("Да"); await ans("Нет"); await ans("Родитель или усыновитель");
await ans("Работаю неполный день или неделю (в т. ч. дистанционно)");
await ans("Нет"); await ans("Нет"); await ans("Нет"); await ans("Нет");
await ans("В квартире в собственности (моей, семьи, ребёнка)");
await ans("Да"); await ans("Нет"); await ans("Нет"); await ans("Нет"); await ans("Нет");
await ans("Женский"); await p.getByRole("spinbutton").fill("38"); await next();
await p.getByRole("button", { name: "Да", exact: true }).click(); // умеет плавать
await p.getByRole("button", { name: "Показать результат" }).click();
await p.waitForSelector("text=Вам положено");
// памятка подачи по федеральной выплате
const fed = p.locator("details.measure", { hasText: "Федеральная выплата по уходу" }).first();
await fed.locator("summary").click();
await fed.getByRole("button", { name: "Памятка подачи" }).click();
await p.waitForSelector("text=Памятка подачи: Федеральная выплата");
const memo = await p.innerText("article.memo");
if (!memo.includes("gosuslugi.ru/620286") || !memo.includes("Шаги формы")) throw new Error("памятка неполная");
await p.getByRole("button", { name: /К результату/ }).click();
// заявление 516н
const wk = p.locator("details.measure", { hasText: "4 дополнительных оплачиваемых" }).first();
await wk.locator("summary").click();
await wk.getByRole("button", { name: /форма 516н/ }).click();
await p.getByLabel(/Кому/).fill("Директор ООО «Ромашка» Иванов И. И.");
await p.getByLabel(/От кого/).fill("Бухгалтер Петрова А. А.");
await p.getByLabel(/Даты предоставления/).fill("5, 12, 19, 26 октября 2026 г.");
await p.getByLabel(/Всего дней/).fill("4");
await p.getByLabel(/Сведения о втором родителе/).fill("второй родитель не работает");
await p.getByLabel(/Количество листов/).fill("3");
const paper = await p.innerText("article.paper");
for (const need of ["ЗАЯВЛЕНИЕ", "статьей 262", "☒ дополнительные оплачиваемые выходные дни для ухода за ребенком-инвалидом в календарном месяце", "в количестве 4 дней", "на 3 листах прилагаю", "516н"])
  if (!paper.includes(need)) throw new Error("в заявлении нет: " + need);
await p.emulateMedia({ media: "print" });
await p.pdf({ path: `${out}/zayavlenie_516n.pdf`, format: "A4", printBackground: true });
if (errs.length) throw new Error(errs.join("; "));
console.log("OK");
await b.close();
