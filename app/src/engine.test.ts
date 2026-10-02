import { describe, expect, it } from "vitest";
import { MEASURES as M, QUESTIONS as Q } from "./data";
import { evaluate, groupByVerdict, nextAnnual, normalize, visibleQuestions } from "./engine";
import type { Answers } from "./types";

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
  it("у каждой меры (кроме «не положено») есть ссылка на подачу или описание процедуры", () => {
    for (const m of M.filter((x) => x.group !== "excluded")) {
      expect(m.apply.length, m.id).toBeGreaterThan(0);
      for (const l of m.apply) expect(["apply", "info"], m.id).toContain(l.kind);
      // если онлайн-подачи нет — должна быть ссылка с описанием
      if (!m.apply.some((l) => l.kind === "apply")) expect(m.apply.some((l) => l.kind === "info"), m.id).toBe(true);
    }
  });
  it("ссылки не повторяются внутри меры и нет устаревшего адреса СФР по ОСАГО", () => {
    for (const m of M) expect(new Set(m.apply.map((l) => l.url)).size, m.id).toBe(m.apply.length);
    expect(JSON.stringify(M)).not.toContain("soc_vip_inv");
  });
  it("последнее правило каждой меры — без условия (запасное)", () => {
    for (const m of M) expect(m.eligibility[m.eligibility.length - 1].when, m.id).toBeUndefined();
  });
});

describe("опрос", () => {
  it("у каждого вопроса есть подробное пояснение", () => {
    for (const q of Q) expect((q.help ?? "").length, q.id).toBeGreaterThan(60);
  });
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
  it("свой автомобиль в Москве: ИПРА → ОСАГО; ≤200 л. с. → транспортный налог; парковка", () => {
    const own = { ...base, car: true, carOwner: "self", carMoscow: true, carInsured: true, carHp200: false, carIpra: true };
    const r = run(own);
    expect(r.c6.verdict).toBe("yes");
    expect(r.c4.verdict).toBe("yes");
    expect(r.b7.verdict).toBe("yes");
    expect(run({ ...own, carHp200: true }).c4.verdict).toBe("no");
  });
  it("автомобиль бывшего супруга на учёте не в Москве: налог — не ваш, ОСАГО — только страхователю, парковка — возможна", () => {
    const ex = { ...base, car: true, carOwner: "other", carMoscow: false, carInsured: false, carHp200: false, carIpra: true };
    const r = run(ex);
    expect(r.c4.verdict).toBe("no");
    expect(r.c4.reason).toMatch(/собственник/);
    expect(r.c6.verdict).toBe("maybe");
    expect(r.c6.reason).toMatch(/страхователь/);
    expect(r.b7.verdict).toBe("yes");
    expect(r.b7.documents.join(" ")).toMatch(/не ваш/);
  });
  it("свой автомобиль на учёте не в Москве: московская льгота — «уточнить»", () => {
    const r = run({ ...base, car: true, carOwner: "self", carMoscow: false, carInsured: true, carHp200: false, carIpra: true });
    expect(r.c4.verdict).toBe("maybe");
    expect(r.c6.verdict).toBe("yes");
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

import { build516n, FORM516N_SOURCE, MODE_LABEL } from "./forms/doc516n";

describe("формы", () => {
  const v = { employerAddressee: "Директор ООО «Ромашка» Иванов И. И.", employee: "Бухгалтер Петрова А. А.", mode: "months" as const, dates: "5, 12 октября 2026 г.", days: "2", secondParent: "второй родитель не работает", sheets: "2", date: "02.10.2026" };
  it("заявление 516н повторяет формулировки приказа", () => {
    const d = build516n(v);
    expect(d.title[0]).toBe("ЗАЯВЛЕНИЕ");
    expect(d.intro).toContain("В соответствии со статьей 262 Трудового кодекса Российской Федерации прошу предоставить мне");
    expect(d.options).toHaveLength(2);
    expect(d.options[0].label).toBe(MODE_LABEL.months);
    expect(d.options.map((o) => o.checked)).toEqual([true, false]);
    expect(d.confirm).toBe("Достоверность представленных мною сведений подтверждаю.");
    expect(d.attachments).toContain("на 2 листах прилагаю");
    expect(d.source).toBe(FORM516N_SOURCE);
    expect(d.source).toContain("516н");
  });
  it("пустые поля заменяются прочерками для рукописного заполнения", () => {
    const d = build516n({ ...v, dates: "", days: "", secondParent: "" });
    expect(d.dates).toMatch(/^_+$/);
    expect(d.daysLine).toMatch(/в количестве _+ дней\./);
  });
  it("режим «подряд» отмечает второй вариант", () => {
    expect(build516n({ ...v, mode: "inRow" }).options.map((o) => o.checked)).toEqual([false, true]);
  });
  it("у мер с памяткой есть данные формы, у допвыходных — форма 516н", () => {
    for (const m of M.filter((x) => x.forms?.some((f) => f.kind === "memo"))) {
      expect(m.form, m.id).toBeTruthy();
      expect(m.form!.url, m.id).toMatch(/^https:\/\//);
      expect(m.form!.steps.length, m.id).toBeGreaterThan(0);
    }
    expect(M.find((m) => m.id === "c1")!.forms![0].kind).toBe("form516n");
  });
});
