// e2e: «Не знаю», план, общий список документов, сохранение/перенос, словарик
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
const url = process.env.URL ?? "http://localhost:4173/";
const exe = process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const b = await chromium.launch({ executablePath: exe });
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
let body = await p.innerText("body");
ok(body.includes("Вы пропустили часть вопросов"), "уведомление о «Не знаю»");
// федеральная выплата по уходу должна уйти в «Уточнить»
await p.getByRole("tab", { name: /Уточнить/ }).click();
body = await p.innerText("#list");
ok(body.includes("Федеральная выплата по уходу"), "федеральная выплата в «Уточнить»");
ok(/Вы получаете пенсию/.test(body), "причина с названием вопроса");

// ---- план
await p.getByRole("button", { name: /План действий/ }).click();
body = await p.innerText("body");
await p.getByRole("checkbox", { name: /Сделано: Подать заявление на московскую выплату/ }).check();
ok(/1\/\d+/.test(await p.getByRole("button", { name: /План действий/ }).innerText()), "счётчик плана");

// ---- общий список документов
await p.getByRole("button", { name: /Все документы/ }).click();
body = await p.innerText("body");
ok(body.includes("Паспорт заявителя") && body.includes("СНИЛС родителя и ребёнка") && body.includes("Нужен для"), "общий список документов");
await p.getByRole("checkbox", { name: /Паспорт заявителя/ }).check();
// переход к мере из списка документов
await p.locator(".needfor .chip-btn").first().click();
await p.waitForSelector("details.measure[open]");

// ---- словарик
await p.locator("button.term", { hasText: "ИПРА" }).first().scrollIntoViewIfNeeded().catch(() => {});
const termBtn = p.locator("button.term").first();
if (await termBtn.count()) { await termBtn.click(); ok(await p.locator(".gdef").count() > 0, "расшифровка сокращения"); }

// ---- экспорт / перенос: новый сеанс, ответы грузим по коду
await p.reload();
await p.getByRole("button", { name: "Пройти опрос" }).click();
const code = JSON.stringify({ v: 1, answers: { age: 9, moreDisabled: false, moscow: true, tinao: false, role: "parent", work: "part", ownBenefits: false, solo: true, divorced: false, manyKids: false, housing: "owner", regYears10: true, lowIncome: false, car: false, childOwns: false, parentSex: "m", parentAge: 56, canSwim: true, incomeOver450: false }, progress: { "plan:a4": true }, savedAt: "2026-10-02T00:00:00.000Z" });
// быстрый путь к результату: проходим опрос так же, как выше
await p.getByRole("spinbutton").fill("9"); await next();
await ans("Нет"); await ans("Да"); await ans("Нет"); await ans("Родитель или усыновитель"); await ans("Не работаю");
await ans("Нет"); await ans("Нет"); await ans("Нет"); await ans("Нет");
await ans("В квартире в собственности (моей, семьи, ребёнка)");
await ans("Да"); await ans("Нет"); await ans("Нет"); await ans("Нет");
await ans("Женский"); await p.getByRole("spinbutton").fill("38"); await next();
await p.getByRole("button", { name: "Нет", exact: true }).click(); await p.getByRole("button", { name: "Показать результат" }).click();
await p.locator("details.exportbox summary").click();
await p.locator("#import-code").fill(code);
await p.getByRole("button", { name: "Загрузить", exact: true }).click();
ok((await p.innerText("body")).includes("Ответы и отметки загружены"), "импорт принят");
await p.locator("#import-code").fill("мусор");
await p.getByRole("button", { name: "Загрузить", exact: true }).click();
ok((await p.innerText("body")).includes("Не удалось прочитать"), "мусор отклонён");
// после импорта: одинокий отец, 56 лет, неполный день → досрочная пенсия положена
await p.getByRole("button", { name: /Все документы/ }).click();
await p.getByRole("button", { name: /Меры/ }).click();
body = await p.innerText("#list");
ok(body.includes("Досрочная пенсия"), "импортированные ответы применились");
ok(errs.length === 0, "ошибки страницы: " + errs.join("; "));
console.log("OK");
await b.close();
