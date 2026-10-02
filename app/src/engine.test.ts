import { describe, expect, it } from "vitest";
import measures from "./data/measures.json";
import questions from "./data/questions.json";
import { evaluate, groupByVerdict, nextAnnual, normalize, visibleQuestions } from "./engine";
import type { Answers, Measure, Question } from "./types";

const M = measures as unknown as Measure[];
const Q = questions as unknown as Question[];

const run = (a: Answers, today = new Date(2026, 9, 2)) => {
  const r = evaluate(M, Q, a, today);
  return Object.fromEntries(r.map((x) => [x.measure.id, x]));
};

// Эталонная семья из CHECKLIST.md: ребёнок 8 лет, мать не работает, вдвоём с мужем, квартира в собственности, ЮЗАО
const base: Answers = {
  age: 8, moscow: true, tinao: false, role: "parent", work: "none", ownBenefits: false, solo: false, divorced: false,
  manyKids: false, housing: "owner", regYears10: true, lowIncome: false, car: false, childOwns: false,
  parentSex: "f", parentAge: 38, canSwim: false,
};

describe("данные", () => {
  it("у каждой меры есть правила, источник и дата проверки", () => {
    for (const m of M) {
      expect(m.eligibility.length, m.id).toBeGreaterThan(0);
      expect(m.basis, m.id).toBeTruthy();
      expect(m.checkedAt, m.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
  it("id мер и вопросов уникальны, ссылки https", () => {
    expect(new Set(M.map((m) => m.id)).size).toBe(M.length);
    expect(new Set(Q.map((q) => q.id)).size).toBe(Q.length);
    for (const m of M) for (const l of m.apply) expect(l.url, m.id).toMatch(/^https:\/\//);
  });
  it("последнее правило каждой меры — без условия (запасное)", () => {
    for (const m of M) expect(m.eligibility[m.eligibility.length - 1].when, m.id).toBeUndefined();
  });
});

describe("опрос", () => {
  it("скрытые вопросы не отображаются, скрытые bool = false", () => {
    const a: Answers = { moscow: false, role: "guardian" };
    const ids = visibleQuestions(Q, a).map((q) => q.id);
    expect(ids).not.toContain("tinao");
    expect(ids).not.toContain("solo");
    expect(normalize(Q, a).solo).toBe(false);
  });
});

describe("эталонная семья: неработающая мать, ребёнок 8 лет", () => {
  const r = run(base);
  it("федеральная и московская выплаты по уходу положены", () => {
    expect(r.a3.verdict).toBe("yes");
    expect(r.a4.verdict).toBe("yes");
  });
  it("ЖКУ, карта москвича, питание, такси — положены", () => {
    for (const id of ["b1", "b2", "b3", "b5", "b6"]) expect(r[id].verdict, id).toBe("yes");
  });
  it("не положено: нужда, авто, вычеты без дохода, продукты и кормилец", () => {
    for (const id of ["a6", "b7", "c1", "c2", "c4", "c5", "c6", "d1", "d2"]) expect(r[id].verdict, id).toBe("no");
  });
  it("неплавающему ребёнку бассейн — «уточнить»", () => {
    expect(r.b12.verdict).toBe("maybe");
  });
  it("досрочная пенсия — позже (мать 38 лет)", () => {
    expect(r.c7.verdict).toBe("later");
  });
  it("для отказа не показываются документы", () => {
    expect(r.c1.documents).toEqual([]);
  });
});

describe("работающий родитель", () => {
  it("на полном дне: федеральная выплата — нет, московская — нет, допвыходные и вычет — да", () => {
    const r = run({ ...base, work: "full", incomeOver450: false, parentAge: 38 });
    expect(r.a3.verdict).toBe("no");
    expect(r.a4.verdict).toBe("no");
    expect(r.c1.verdict).toBe("yes");
    expect(r.c2.verdict).toBe("yes");
  });
  it("на неполном дне и одинокий: обе выплаты положены; вычет удваивается, нужна справка ЗАГС", () => {
    const r = run({ ...base, work: "part", solo: true, incomeOver450: false });
    expect(r.a3.verdict).toBe("yes");
    expect(r.a4.verdict).toBe("yes");
    expect(r.c2.reason).toMatch(/удваивается/);
    expect(r.c2.documents.join(" ")).toMatch(/ф\. 2/);
    expect(r.a3.documents.join(" ")).toMatch(/неполном рабочем времени/);
  });
  it("многодетная работающая мать: московская выплата положена, федеральная — нет при полном дне", () => {
    const r = run({ ...base, work: "full", manyKids: true });
    expect(r.a4.verdict).toBe("yes");
    expect(r.a3.verdict).toBe("no");
  });
  it("получатель пенсии не получает федеральную выплату по уходу", () => {
    expect(run({ ...base, ownBenefits: true }).a3.verdict).toBe("no");
  });
  it("доход выше 450 000 — вычет «позже»", () => {
    expect(run({ ...base, work: "full", incomeOver450: true }).c2.verdict).toBe("later");
  });
});

describe("опекун и иное лицо", () => {
  it("опекун: пенсия только на номинальный счёт, московская — через МФЦ", () => {
    const r = run({ ...base, role: "guardian" });
    expect(r.a1.documents.join(" ")).toMatch(/номинальн/);
    expect(r.a5.documents.join(" ")).toMatch(/МФЦ/);
  });
  it("иное лицо: выплата только при отсутствии работы, с обязательством 14 часов", () => {
    const r = run({ ...base, role: "other" });
    expect(r.a3.verdict).toBe("maybe");
    expect(r.a3.documents.join(" ")).toMatch(/14 ч/);
    expect(run({ ...base, role: "other", work: "part" }).a3.verdict).toBe("no");
  });
});

describe("жильё, регион, авто", () => {
  it("наниматель госжилфонда: капремонт — нет; ТиНАО — компенсация", () => {
    expect(run({ ...base, housing: "state" }).b4.verdict).toBe("no");
    expect(run({ ...base, tinao: true }).b3.reason).toMatch(/ТиНАО|компенсаци/);
  });
  it("не москвичи: московские меры «нет», федеральные остаются", () => {
    const r = run({ ...base, moscow: false });
    expect(r.a4.verdict).toBe("no");
    expect(r.b3.verdict).toBe("no");
    expect(r.a3.verdict).toBe("yes");
    expect(r.a1.verdict).toBe("yes");
  });
  it("автомобиль: ИПРА → ОСАГО; ≤200 л. с. → транспортный налог; > 200 — нет", () => {
    const r = run({ ...base, car: true, carHp200: false, carIpra: true });
    expect(r.c6.verdict).toBe("yes");
    expect(r.c4.verdict).toBe("yes");
    expect(r.b7.verdict).toBe("yes");
    expect(run({ ...base, car: true, carHp200: true, carIpra: false }).c4.verdict).toBe("no");
  });
  it("малообеспеченная семья: пособие 553-ПП и адресная помощь возможны", () => {
    const r = run({ ...base, lowIncome: true });
    expect(r.a6.verdict).toBe("yes");
    expect(r.b14.verdict).toBe("maybe");
  });
  it("ребёнок вне 4–17 лет: отдых — нет; до 6 лет питание «позже»", () => {
    expect(run({ ...base, age: 2 }).b11.verdict).toBe("no");
    expect(run({ ...base, age: 2 }).b5.verdict).toBe("later");
    expect(run({ ...base, age: 5 }).b11.verdict).toBe("yes");
  });
  it("умеющий плавать ребёнок — секции «положено»", () => {
    expect(run({ ...base, canSwim: true }).b12.verdict).toBe("yes");
  });
  it("досрочная пенсия: возраст достигнут", () => {
    expect(run({ ...base, parentSex: "f", parentAge: 51 }).c7.verdict).toBe("yes");
    expect(run({ ...base, parentSex: "m", parentAge: 54 }).c7.verdict).toBe("later");
  });
});

describe("сроки", () => {
  it("отказ от НСУ: после 1 октября — следующий срок в 2027", () => {
    expect(nextAnnual(new Date(2026, 9, 2), 10, 1)).toBe("01.10.2027");
    expect(nextAnnual(new Date(2026, 8, 30), 10, 1)).toBe("01.10.2026");
    expect(nextAnnual(new Date(2026, 9, 1), 10, 1)).toBe("01.10.2026");
  });
  it("в результатах НСУ показана ближайшая дата", () => {
    expect(run(base).a2.nextDate?.date).toBe("01.10.2027");
  });
  it("группировка не теряет меры", () => {
    const g = groupByVerdict(evaluate(M, Q, base));
    expect(g.yes.length + g.maybe.length + g.later.length + g.no.length).toBe(M.length);
  });
});
