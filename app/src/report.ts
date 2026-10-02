import type { MeasureResult, PlanItem, Verdict } from "./types";
import type { aggregateDocuments } from "./engine";

/** Табличная модель результата: из неё строятся и xlsx, и pdf. */
export interface Table {
  name: string;
  title: string;
  /** Столбец, который служит заголовком карточки в PDF. */
  titleCol: number;
  columns: { head: string; width: number }[];
  rows: string[][];
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  yes: "Положено",
  maybe: "Нужно уточнить",
  later: "Станет доступно позже",
  no: "Не подходит",
};
const PRIORITY_LABEL = { 1: "Сначала", 2: "В ближайший месяц", 3: "Когда будет время" } as const;
const ORDER: Verdict[] = ["yes", "maybe", "later", "no"];

export function buildReport(
  results: MeasureResult[],
  plan: PlanItem[],
  docs: ReturnType<typeof aggregateDocuments>,
  progress: Record<string, boolean>,
): Table[] {
  const mark = (v: boolean) => (v ? "да" : "нет");
  const got = (r: MeasureResult) => r.verdict !== "no" && !!progress[`got:${r.measure.id}`];
  const sorted = [
    ...ORDER.slice(0, 3).flatMap((v) => results.filter((r) => r.verdict === v && !got(r))),
    ...results.filter(got),
    ...results.filter((r) => r.verdict === "no"),
  ];
  const measures = sorted.map((r) => {
    const link = r.measure.apply.find((l) => l.kind === "apply") ?? r.measure.apply[0];
    return [
      got(r) ? "Уже получено" : VERDICT_LABEL[r.verdict],
      r.measure.title,
      r.measure.authority,
      r.reason,
      r.nextDate ? `${r.nextDate.date}: ${r.nextDate.label}` : "",
      link ? link.url : "",
      r.measure.basis,
    ];
  });
  const planRows = [...plan]
    .sort((a, b) => a.priority - b.priority)
    .map((i) => [PRIORITY_LABEL[i.priority], i.action, i.date ?? "", i.why, mark(!!progress[`plan:${i.measureId}`])]);
  const titleOf = (id: string) => results.find((r) => r.measure.id === id)?.measure.title.replace(/\s*\(.*$/, "") ?? id;
  const docRows = [
    ...docs.shared.map((d) => [d.item.title, d.item.where, d.measures.map(titleOf).join("; "), mark(!!progress[`doc:${d.item.id}`])]),
    ...docs.other.map((o) => [o.doc, "", o.measure.replace(/\s*\(.*$/, ""), ""]),
  ];
  return [
    {
      name: "Меры",
      title: "Меры поддержки",
      titleCol: 1,
      columns: [
        { head: "Результат", width: 18 },
        { head: "Мера", width: 38 },
        { head: "Куда обращаться", width: 26 },
        { head: "Почему", width: 50 },
        { head: "Ближайший срок", width: 28 },
        { head: "Ссылка для подачи", width: 44 },
        { head: "Основание", width: 34 },
      ],
      rows: measures,
    },
    {
      name: "План",
      title: "План действий",
      titleCol: 1,
      columns: [
        { head: "Когда", width: 20 },
        { head: "Шаг", width: 46 },
        { head: "Срок", width: 12 },
        { head: "Зачем", width: 54 },
        { head: "Сделано", width: 10 },
      ],
      rows: planRows,
    },
    {
      name: "Документы",
      title: "Общий список документов",
      titleCol: 0,
      columns: [
        { head: "Документ", width: 40 },
        { head: "Где взять", width: 46 },
        { head: "Для каких мер", width: 60 },
        { head: "Есть", width: 8 },
      ],
      rows: docRows,
    },
  ];
}
