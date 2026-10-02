// Свежесть данных: даты проверки мер и дата пересмотра сумм.
// STRICT=1 — считать просрочку ошибкой (для еженедельной проверки).
import { readFileSync } from "node:fs";

// В GitHub Actions — аннотации; на сервере и в консоли — обычный текст.
function emit(level, title, msg) {
  if (process.env.GITHUB_ACTIONS) console.log(`::${level} title=${title}::${msg}`);
  else console.log(`${level === "error" ? "ОШИБКА" : "Предупреждение"} [${title}] ${msg}`);
}

const read = (f) => JSON.parse(readFileSync(new URL(`../src/data/${f}`, import.meta.url), "utf8"));
const measures = read("measures.json");
const amounts = read("amounts.json");
const today = new Date();
const DAY = 86400000;
const WARN_DAYS = Number(process.env.WARN_DAYS ?? 90);
const FAIL_DAYS = Number(process.env.FAIL_DAYS ?? 180);

let failed = false;
for (const m of measures) {
  const age = Math.floor((today - new Date(m.checkedAt + "T00:00:00")) / DAY);
  if (age > FAIL_DAYS) { emit("error", "Данные устарели", `${m.id} «${m.title}» проверено ${age} дн. назад`); failed = true; }
  else if (age > WARN_DAYS) emit("warning", "Пора перепроверить", `${m.id} «${m.title}» проверено ${age} дн. назад`);
}
const review = new Date(amounts._meta.nextReview + "T00:00:00");
if (today >= review) {
  emit("warning", "Пересмотр сумм", `Дата пересмотра сумм (${amounts._meta.nextReview}) наступила. Проверьте индексацию 1 февраля и постановление Москвы о размерах выплат.`);
  if (process.env.STRICT === "1") failed = true;
}
console.log(failed ? "Есть устаревшие данные" : "Свежесть данных в порядке");
process.exit(failed && process.env.STRICT === "1" ? 1 : 0);
