import type { Answers, Condition, Measure, MeasureResult, Question } from "./types";

export function evalCondition(c: Condition, a: Answers): boolean {
  if ("all" in c) return c.all.every((x) => evalCondition(x, a));
  if ("any" in c) return c.any.some((x) => evalCondition(x, a));
  if ("not" in c) return !evalCondition(c.not, a);
  const v = a[c.q];
  if (v === undefined) return false;
  if (c.eq !== undefined && v !== c.eq) return false;
  if (c.in !== undefined && !c.in.includes(v as string | number)) return false;
  if (typeof v === "number") {
    if (c.gte !== undefined && !(v >= c.gte)) return false;
    if (c.gt !== undefined && !(v > c.gt)) return false;
    if (c.lte !== undefined && !(v <= c.lte)) return false;
    if (c.lt !== undefined && !(v < c.lt)) return false;
  } else if (c.gte !== undefined || c.gt !== undefined || c.lte !== undefined || c.lt !== undefined) {
    return false;
  }
  return true;
}

export function visibleQuestions(questions: Question[], a: Answers): Question[] {
  return questions.filter((q) => !q.showIf || evalCondition(q.showIf, a));
}

/** Скрытые вопросы типа bool считаются «нет», чтобы правила не зависели от ветвления опроса. */
export function normalize(questions: Question[], a: Answers): Answers {
  const out: Answers = { ...a };
  const visible = new Set(visibleQuestions(questions, a).map((q) => q.id));
  for (const q of questions) {
    if (!visible.has(q.id)) {
      delete out[q.id];
      if (q.type === "bool") out[q.id] = false;
    }
  }
  return out;
}

/** Ближайшая ежегодная дата не раньше today. */
export function nextAnnual(today: Date, month: number, day: number): string {
  const y = today.getFullYear();
  let d = new Date(y, month - 1, day);
  const t0 = new Date(y, today.getMonth(), today.getDate());
  if (d < t0) d = new Date(y + 1, month - 1, day);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getFullYear()}`;
}

export function evaluate(measures: Measure[], questions: Question[], answers: Answers, today = new Date()): MeasureResult[] {
  const a = normalize(questions, answers);
  return measures.map((measure) => {
    const rule = measure.eligibility.find((r) => !r.when || evalCondition(r.when, a)) ?? {
      result: "maybe" as const,
      reason: "Не удалось определить — уточните в органе, принимающем заявление.",
    };
    const documents =
      rule.result === "no"
        ? []
        : [...measure.documents.required, ...measure.documents.conditional.filter((d) => evalCondition(d.if, a)).map((d) => d.doc)];
    const res: MeasureResult = { measure, verdict: rule.result, reason: rule.reason, documents };
    if (measure.annual) res.nextDate = { date: nextAnnual(today, measure.annual.month, measure.annual.day), label: measure.annual.label };
    return res;
  });
}

export function groupByVerdict(results: MeasureResult[]) {
  return {
    yes: results.filter((r) => r.verdict === "yes"),
    maybe: results.filter((r) => r.verdict === "maybe"),
    later: results.filter((r) => r.verdict === "later"),
    no: results.filter((r) => r.verdict === "no"),
  };
}
