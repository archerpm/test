// Дымовой e2e: проходит опрос эталонной семьи и проверяет результат. Запуск: npm run preview, затем node e2e/smoke.mjs
import { chromium } from "playwright";
const url = process.env.URL ?? "http://localhost:4173/";
const exe = process.env.CHROME; // не задан — Playwright использует свой Chromium (npx playwright install chromium)
const b = await chromium.launch(exe ? { executablePath: exe } : {});
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
const errs = [];
p.on("pageerror", (e) => errs.push(String(e)));
await p.goto(url);
await p.getByRole("button", { name: "Пройти опрос" }).click();
const answer = async (text) => { await p.getByRole("button", { name: text, exact: true }).click(); await p.getByRole("button", { name: /Далее|Показать результат/ }).click(); };
await p.getByRole("spinbutton").fill("8");
await p.getByRole("button", { name: "Далее" }).click();
await answer("Нет");                      // есть ли ещё дети-инвалиды
await answer("Да");                       // Москва
await answer("Нет");                      // ТиНАО
await answer("Родитель или усыновитель");
await answer("Не работаю");
await answer("Нет");                      // пенсия/пособие
await answer("Нет");                      // единственный родитель
await answer("Нет");                      // развод/отцовство
await answer("Нет");                      // многодетная
await answer("В квартире в собственности (моей, семьи, ребёнка)");
await answer("Да");                       // 10 лет
await answer("Нет");                      // доход
await answer("Нет");                      // авто
await answer("Нет");                      // недвижимость ребёнка
await answer("Женский");
await p.getByRole("spinbutton").fill("38");
await p.getByRole("button", { name: "Далее" }).click();
await p.getByRole("button", { name: "Нет", exact: true }).click(); // плавает
await p.getByRole("button", { name: "Показать результат" }).click();
await p.waitForSelector("text=Вам положено");
const body = await p.innerText("body");
for (const need of ["Вам положено", "Федеральная выплата по уходу", "Московская выплата по уходу", "Ближайшие сроки", "01.10.2027"])
  if (!body.includes(need)) throw new Error("нет текста: " + need);
await p.screenshot({ path: process.env.SHOT ?? "/tmp/claude-0/shot.png" });
if (errs.length) throw new Error("ошибки страницы: " + errs.join("; "));
console.log("OK");
await b.close();
