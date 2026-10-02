import { describe, expect, it } from "vitest";
import { applyAmounts } from "./amounts";
import { AMOUNTS, CATALOG, GLOSSARY, MEASURES as M, QUESTIONS as Q } from "./data";
import { aggregateDocuments, buildPlan, evaluate, evaluateMeasure, staleness } from "./engine";
import { UNKNOWN, type Answers } from "./types";

const base: Answers = {
  age: 8, moreDisabled: false, moscow: true, tinao: false, role: "parent", work: "none", ownBenefits: false, solo: false, divorced: false,
  manyKids: false, housing: "owner", regYears10: true, lowIncome: false, car: false, childOwns: false, parentSex: "f", parentAge: 38, canSwim: false,
};
const get = (a: Answers, id: string, today = new Date(2026, 9, 2)) => evaluateMeasure(M.find((m) => m.id === id)!, Q, a, today);

describe("суммы", () => {
  it("все {{токены}} подставлены, неизвестный ключ вызывает ошибку", () => {
    expect(JSON.stringify(M)).not.toMatch(/\{\{/);
    expect(JSON.stringify(Q)).not.toMatch(/\{\{/);
    expect(() => applyAmounts({ x: "{{no_such_key}}" }, AMOUNTS)).toThrow();
  });
  it("суммы попадают в названия мер", () => {
    expect(M.find((m) => m.id === "a1")!.title).toContain(AMOUNTS.soc_pension && (AMOUNTS.soc_pension as { value: string }).value);
  });
  it("есть дата следующей проверки сумм", () => {
    expect(AMOUNTS._meta.nextReview).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("«Не знаю»", () => {
  it("если вывод не зависит от пропущенного ответа — он сохраняется", () => {
    // работает на полном дне: выплата по уходу «нет» при любом ownBenefits
    const r = get({ ...base, work: "full", ownBenefits: UNKNOWN }, "a3");
    expect(r.verdict).toBe("no");
    expect(r.unknowns).toEqual(["Вы получаете пенсию или пособие по безработице"]);
  });
  it("если зависит — «уточнить» с названием вопроса", () => {
    const r = get({ ...base, ownBenefits: UNKNOWN }, "a3");
    expect(r.verdict).toBe("maybe");
    expect(r.reason).toMatch(/Вы получаете пенсию/);
    expect(r.whatIf).toEqual([]);
  });
  it("для вопросов с несколькими вариантами перебираются все", () => {
    const r = get({ ...base, housing: UNKNOWN }, "b4");
    expect(r.verdict).toBe("maybe");
    expect(get({ ...base, housing: UNKNOWN }, "b3").verdict).toBe("yes");
  });
  it("несколько неизвестных сразу не ломают расчёт", () => {
    const r = evaluate(M, Q, { ...base, ownBenefits: UNKNOWN, solo: UNKNOWN, divorced: UNKNOWN, manyKids: UNKNOWN, lowIncome: UNKNOWN, childOwns: UNKNOWN, canSwim: UNKNOWN });
    expect(r).toHaveLength(M.length);
    const a6 = r.find((x) => x.measure.id === "a6")!;
    expect(["maybe", "no"]).toContain(a6.verdict);
  });
  it("вопросы-ветвления не допускают «Не знаю»", () => {
    for (const id of ["age", "moscow", "role", "work", "car"]) expect(Q.find((q) => q.id === id)!.noUnknown, id).toBe(true);
  });
});

describe("почему так и что если", () => {
  it("фактор содержит названия и ответы пользователя", () => {
    const r = get({ ...base, work: "full" }, "a3");
    expect(r.factors.some((f) => f.question === "Ваш трудовой статус" && /полный/.test(f.answer))).toBe(true);
  });
  it("для «нет» предлагается, что изменить", () => {
    const r = get({ ...base, work: "full" }, "a3");
    expect(r.verdict).toBe("no");
    expect(r.whatIf.some((s) => s.question === "Ваш трудовой статус" && /Не работаю|неполный/.test(s.answer))).toBe(true);
  });
  it("для «положено» подсказок нет", () => {
    expect(get(base, "a3").whatIf).toEqual([]);
  });
  it("неплавающему ребёнку предлагается условие «умеет плавать»", () => {
    const r = get(base, "b12");
    expect(r.whatIf.some((s) => /плавать/.test(s.question) && s.answer === "да")).toBe(true);
  });
});

describe("общий список документов", () => {
  const res = evaluate(M, Q, base);
  const agg = aggregateDocuments(res, CATALOG);
  it("паспорт, СНИЛС и свидетельство о рождении собраны в один пункт и указывают на несколько мер", () => {
    for (const id of ["passport", "snils", "birth"]) {
      const e = agg.shared.find((s) => s.item.id === id);
      expect(e, id).toBeTruthy();
      expect(e!.measures.length, id).toBeGreaterThan(3);
    }
  });
  it("документы мер со статусом «нет» не попадают в список", () => {
    expect(agg.shared.some((s) => s.measures.includes("c1"))).toBe(false);
  });
  it("нераспознанные документы остаются отдельным списком с названием меры", () => {
    expect(agg.other.length).toBeGreaterThan(0);
    expect(agg.other[0]).toHaveProperty("measure");
  });
  it("у каждого элемента каталога есть подсказка, где получить", () => {
    for (const c of CATALOG) expect(c.where.length, c.id).toBeGreaterThan(20);
  });
});

describe("план действий", () => {
  const today = new Date(2026, 9, 2);
  const plan = buildPlan(evaluate(M, Q, base, today), today);
  it("срочные шаги — выплаты по уходу — идут первыми", () => {
    expect(plan[0].priority).toBe(1);
    expect(plan.slice(0, 2).map((p) => p.measureId).sort()).toEqual(["a3", "a4"]);
  });
  it("отсортирован по приоритету", () => {
    for (let i = 1; i < plan.length; i++) expect(plan[i].priority).toBeGreaterThanOrEqual(plan[i - 1].priority);
  });
  it("близкая дата поднимает шаг до срочного", () => {
    const d = new Date(2026, 8, 20);
    const p = buildPlan(evaluate(M, Q, base, d), d).find((x) => x.measureId === "a2")!;
    expect(p.priority).toBe(1);
    expect(p.date).toBe("01.10.2026");
  });
  it("отдых в ноябре — срочно за 45 дней", () => {
    expect(plan.find((p) => p.measureId === "b11")!.priority).toBe(1);
  });
  it("меры «нет» в план не попадают", () => {
    expect(plan.some((p) => p.measureId === "c1")).toBe(false);
  });
});

describe("свежесть данных", () => {
  it("считает возраст самой старой проверки", () => {
    const s = staleness(M, new Date(2027, 0, 15));
    expect(s.days).toBeGreaterThan(90);
    expect(staleness(M, new Date(2026, 9, 3)).days).toBeLessThan(5);
  });
});

describe("глоссарий", () => {
  it("содержит ключевые сокращения", () => {
    for (const t of ["ИПРА", "МСЭ", "ТСР", "НСУ", "СФР", "МФЦ", "ЦПМПК"]) expect(GLOSSARY[t], t).toBeTruthy();
  });
});

import { splitTerms } from "./Gloss";
import { parseSaved, serialize } from "./storage";

describe("словарик в тексте", () => {
  it("находит сокращения и не трогает части слов", () => {
    const p = splitTerms("Нужна справка МСЭ и ИПРА, но не МСЭКС и не ИПРАВ.");
    expect(p.filter((x) => x.term).map((x) => x.term)).toEqual(["МСЭ", "ИПРА"]);
  });
  it("распознаёт сокращения с цифрами и дефисом", () => {
    expect(splitTerms("справка 2-НДФЛ").some((x) => x.term === "2-НДФЛ")).toBe(true);
  });
  it("текст без сокращений остаётся цельным", () => {
    expect(splitTerms("обычный текст")).toEqual([{ text: "обычный текст" }]);
  });
});

describe("сохранение", () => {
  it("круг: сохранённое читается обратно", () => {
    const s = parseSaved(serialize({ age: 8, moscow: true, role: "parent" }, { "plan:a4": true }, new Date("2026-10-02T10:00:00Z")));
    expect(s?.answers).toEqual({ age: 8, moscow: true, role: "parent" });
    expect(s?.progress).toEqual({ "plan:a4": true });
    expect(s?.savedAt).toBe("2026-10-02T10:00:00.000Z");
  });
  it("мусор и чужой формат отклоняются", () => {
    expect(parseSaved("не json")).toBeNull();
    expect(parseSaved('{"v":2,"answers":{}}')).toBeNull();
    expect(parseSaved('{"v":1,"answers":[1,2]}')).toBeNull();
    expect(parseSaved("null")).toBeNull();
  });
  it("лишние и опасные значения отбрасываются", () => {
    const s = parseSaved('{"v":1,"answers":{"age":8,"x":{"a":1},"y":[1]},"progress":{"a":true,"b":"yes"}}');
    expect(s?.answers).toEqual({ age: 8 });
    expect(s?.progress).toEqual({ a: true });
  });
});

import { sanitizeAnswers } from "./engine";
import { QUESTIONS as QS } from "./data";
describe("sanitizeAnswers", () => {
  it("отбрасывает неизвестные ключи и недопустимые значения", () => {
    const num = QS.find((q) => q.type === "number")!, ch = QS.find((q) => q.type === "choice")!, bo = QS.find((q) => q.type === "bool")!;
    const out = sanitizeAnswers(QS, { [num.id]: "x", [ch.id]: "нет-такого", [bo.id]: "да", evil: true, __proto__: 1 } as never);
    expect(out).toEqual({});
    const good = sanitizeAnswers(QS, { [num.id]: 8, [ch.id]: ch.options![0][0], [bo.id]: true });
    expect(Object.keys(good).length).toBe(3);
  });
});

describe("безопасность данных", () => {
  it("все ссылки в мерах — https (нет javascript:, http:, data:)", () => {
    for (const m of M) {
      for (const l of m.apply) expect(l.url, m.id).toMatch(/^https:\/\//);
      if (m.form) expect(m.form.url, m.id).toMatch(/^https:\/\//);
    }
  });
});
