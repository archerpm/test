import type { Answers, Condition, DocCatalogItem, Factor, Measure, MeasureResult, PlanItem, Question, Rule, Suggestion, Verdict } from "./types";
import { UNKNOWN } from "./types";

/** Условие: «?» (не знаю) здесь не встречается — оно раскрывается перебором в evaluateMeasure. */
export function evalCondition(c: Condition, a: Answers): boolean {
  if ("all" in c) return c.all.every((x) => evalCondition(x, a));
  if ("any" in c) return c.any.some((x) => evalCondition(x, a));
  if ("not" in c) return !evalCondition(c.not, a);
  const v = a[c.q];
  if (v === undefined || v === UNKNOWN) return false;
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

export function conditionQuestions(c: Condition, out = new Set<string>()): Set<string> {
  if ("all" in c) c.all.forEach((x) => conditionQuestions(x, out));
  else if ("any" in c) c.any.forEach((x) => conditionQuestions(x, out));
  else if ("not" in c) conditionQuestions(c.not, out);
  else out.add(c.q);
  return out;
}

export function visibleQuestions(questions: Question[], a: Answers): Question[] {
  return questions.filter((q) => !q.showIf || evalCondition(q.showIf, a));
}

/** Скрытые вопросы типа bool считаются «нет», чтобы правила не зависели от ветвления опроса. «Не знаю» сохраняется. */
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

function fmtAnswer(q: Question, v: Answers[string]): string {
  if (v === UNKNOWN) return "не знаю";
  if (q.type === "bool") return v === true ? "да" : "нет";
  if (q.type === "choice") return q.options?.find(([k]) => k === v)?.[1] ?? String(v);
  return String(v);
}

function measureQuestions(m: Measure): Set<string> {
  const s = new Set<string>();
  for (const r of m.eligibility) if (r.when) conditionQuestions(r.when, s);
  for (const d of m.documents.conditional) conditionQuestions(d.if, s);
  return s;
}

function pick(m: Measure, a: Answers): { rule: Rule; index: number } {
  const index = m.eligibility.findIndex((r) => !r.when || evalCondition(r.when, a));
  if (index >= 0) return { rule: m.eligibility[index], index };
  return { rule: { result: "maybe", reason: "Не удалось определить — уточните в органе, принимающем заявление." }, index: m.eligibility.length - 1 };
}

function docsFor(m: Measure, a: Answers, verdict: Verdict): string[] {
  if (verdict === "no") return [];
  return [...m.documents.required, ...m.documents.conditional.filter((d) => evalCondition(d.if, a)).map((d) => d.doc)];
}

function domain(q: Question): (string | boolean)[] {
  return q.type === "bool" ? [true, false] : (q.options ?? []).map(([k]) => k);
}

/** Один вердикт для заданных ответов (без «Не знаю»). */
function verdictOnly(m: Measure, questions: Question[], answers: Answers): Verdict {
  return pick(m, normalize(questions, answers)).rule.result;
}

function whatIf(m: Measure, questions: Question[], answers: Answers, current: Verdict): Suggestion[] {
  if (current === "yes") return [];
  const refs = measureQuestions(m);
  const out: Suggestion[] = [];
  for (const q of visibleQuestions(questions, answers)) {
    if (q.type === "number" || !refs.has(q.id)) continue;
    for (const v of domain(q)) {
      if (answers[q.id] === v) continue;
      if (verdictOnly(m, questions, { ...answers, [q.id]: v }) === "yes") out.push({ question: q.short ?? q.text, answer: fmtAnswer(q, v) });
    }
  }
  return out.slice(0, 3);
}

export function evaluateMeasure(m: Measure, questions: Question[], answers: Answers, today = new Date()): MeasureResult {
  const a = normalize(questions, answers);
  const byId = new Map(questions.map((q) => [q.id, q]));
  const refs = measureQuestions(m);
  const unknownIds = [...refs].filter((id) => a[id] === UNKNOWN);

  let verdict: Verdict;
  let reason: string;
  let documents: string[];
  let matchedIndex: number;

  if (unknownIds.length === 0) {
    const { rule, index } = pick(m, a);
    verdict = rule.result;
    reason = rule.reason;
    matchedIndex = index;
    documents = docsFor(m, a, verdict);
  } else {
    // Перебираем все варианты ответа на «не знаю» и смотрим, меняется ли вывод.
    let combos: Answers[] = [a];
    for (const id of unknownIds) {
      const q = byId.get(id)!;
      combos = combos.flatMap((c) => domain(q).map((v) => ({ ...c, [id]: v })));
      if (combos.length > 64) break;
    }
    const picked = combos.map((c) => ({ c, ...pick(m, c) }));
    const verdicts = new Set(picked.map((p) => p.rule.result));
    const names = unknownIds.map((id) => `«${byId.get(id)!.short ?? id}»`).join(", ");
    if (verdicts.size === 1) {
      verdict = [...verdicts][0];
      reason = picked[0].rule.reason;
      matchedIndex = picked[0].index;
    } else {
      verdict = "maybe";
      reason = `Вывод зависит от ответа, который вы пропустили: ${names}. Уточните этот пункт.`;
      matchedIndex = m.eligibility.length - 1;
    }
    const docs = new Set<string>();
    for (const p of picked) docsFor(m, p.c, p.rule.result).forEach((d) => docs.add(d));
    documents = verdict === "no" ? [] : [...docs];
  }

  // факторы: ответы на вопросы из условий правил до выбранного включительно
  const factorIds = new Set<string>();
  m.eligibility.slice(0, matchedIndex + 1).forEach((r) => r.when && conditionQuestions(r.when, factorIds));
  const factors: Factor[] = [];
  for (const id of factorIds) {
    const q = byId.get(id);
    const v = answers[id] ?? a[id];
    if (!q || v === undefined || v === UNKNOWN) continue;
    // скрытые вопросы с подставленным «нет» пользователю не показываем
    if (!visibleQuestions(questions, answers).some((x) => x.id === id)) continue;
    factors.push({ question: q.short ?? q.text, answer: fmtAnswer(q, v) });
  }

  const res: MeasureResult = {
    measure: m,
    verdict,
    reason,
    documents,
    factors,
    unknowns: unknownIds.map((id) => byId.get(id)!.short ?? id),
    whatIf: unknownIds.length ? [] : whatIf(m, questions, answers, verdict),
  };
  if (m.annual) res.nextDate = { date: nextAnnual(today, m.annual.month, m.annual.day), label: m.annual.label };
  return res;
}

export function evaluate(measures: Measure[], questions: Question[], answers: Answers, today = new Date()): MeasureResult[] {
  return measures.map((m) => evaluateMeasure(m, questions, answers, today));
}

export function groupByVerdict(results: MeasureResult[]) {
  return {
    yes: results.filter((r) => r.verdict === "yes"),
    maybe: results.filter((r) => r.verdict === "maybe"),
    later: results.filter((r) => r.verdict === "later"),
    no: results.filter((r) => r.verdict === "no"),
  };
}

/* ---------- общий список документов ---------- */

export interface AggregatedDoc {
  item: DocCatalogItem;
  measures: string[];
}

export function aggregateDocuments(results: MeasureResult[], catalog: DocCatalogItem[]) {
  const shared = new Map<string, AggregatedDoc>();
  const other: { measure: string; doc: string }[] = [];
  for (const r of results.filter((x) => x.verdict === "yes" || x.verdict === "maybe")) {
    for (const d of r.documents) {
      const low = d.toLowerCase();
      const hits = catalog.filter((c) => c.match.some((m) => low.includes(m)));
      if (hits.length === 0) {
        other.push({ measure: r.measure.title, doc: d });
        continue;
      }
      for (const h of hits) {
        const e = shared.get(h.id) ?? { item: h, measures: [] };
        if (!e.measures.includes(r.measure.id)) e.measures.push(r.measure.id);
        shared.set(h.id, e);
      }
    }
  }
  const ordered = catalog.map((c) => shared.get(c.id)).filter((x): x is AggregatedDoc => !!x);
  return { shared: ordered, other };
}

/* ---------- план действий ---------- */

const dayMs = 86400000;

function parseRu(d: string): Date {
  const [dd, mm, yy] = d.split(".").map(Number);
  return new Date(yy, mm - 1, dd);
}

export function buildPlan(results: MeasureResult[], today = new Date()): PlanItem[] {
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const items: PlanItem[] = [];
  for (const r of results) {
    if (!r.measure.plan || (r.verdict !== "yes" && r.verdict !== "maybe")) continue;
    let priority = r.measure.plan.priority;
    let date: string | undefined;
    if (r.nextDate) {
      const left = Math.round((parseRu(r.nextDate.date).getTime() - t0.getTime()) / dayMs);
      date = r.nextDate.date;
      if (left <= 45) priority = 1;
      else if (left <= 120 && priority > 2) priority = 2;
    }
    items.push({ measureId: r.measure.id, title: r.measure.title, priority, action: r.measure.plan.action, why: r.measure.plan.why, date });
  }
  return items.sort((x, y) => x.priority - y.priority);
}

/* ---------- свежесть данных ---------- */

export function staleness(measures: Measure[], today = new Date()) {
  const dates = measures.map((m) => new Date(m.checkedAt + "T00:00:00"));
  const oldest = new Date(Math.min(...dates.map((d) => d.getTime())));
  const days = Math.floor((today.getTime() - oldest.getTime()) / dayMs);
  return { oldest, days };
}

/** Оставляет только ответы на известные вопросы с допустимыми значениями (файлы и коды можно править руками). */
export function sanitizeAnswers(questions: Question[], a: Answers): Answers {
  const out: Answers = {};
  for (const q of questions) {
    const v = a[q.id];
    if (v === undefined) continue;
    if (v === UNKNOWN) { if (q.type !== "number" && !q.noUnknown) out[q.id] = v; continue; }
    if (q.type === "bool" && typeof v === "boolean") out[q.id] = v;
    else if (q.type === "choice" && typeof v === "string" && q.options!.some(([o]) => o === v)) out[q.id] = v;
    else if (q.type === "number" && typeof v === "number" && Number.isFinite(v) && v >= (q.min ?? 0) && v <= (q.max ?? 120)) out[q.id] = v;
  }
  return out;
}
