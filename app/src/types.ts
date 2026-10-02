export type Answers = Record<string, string | number | boolean | undefined>;

/** Условие правила. Неотвеченный вопрос даёт false (кроме bool — он по умолчанию false). */
export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | { q: string; eq?: string | number | boolean; in?: (string | number)[]; gte?: number; gt?: number; lte?: number; lt?: number };

export interface Question {
  id: string;
  type: "bool" | "number" | "choice";
  text: string;
  help?: string;
  min?: number;
  max?: number;
  options?: [string, string][];
  showIf?: Condition;
}

export type Verdict = "yes" | "maybe" | "later" | "no";

export interface Rule {
  when?: Condition;
  result: Verdict;
  reason: string;
}

export interface ConditionalDoc {
  if: Condition;
  doc: string;
}

export interface Measure {
  id: string;
  group: "money" | "benefits" | "parents" | "excluded";
  title: string;
  authority: string;
  apply: { label: string; url: string }[];
  /** confirmed — подтверждено первоисточником; check — есть пункты, которые нужно уточнить */
  status: "confirmed" | "check";
  summary: string;
  eligibility: Rule[];
  documents: { required: string[]; conditional: ConditionalDoc[]; auto: string[] };
  deadlines: string[];
  tips: string[];
  basis: string;
  checkedAt: string;
  /** Ежегодная дата, ближайшую можно посчитать по "сегодня" */
  annual?: { month: number; day: number; label: string };
}

export interface MeasureResult {
  measure: Measure;
  verdict: Verdict;
  reason: string;
  documents: string[];
  nextDate?: { date: string; label: string };
}
