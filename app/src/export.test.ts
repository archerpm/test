import { describe, expect, it } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { AMOUNTS, CATALOG, MEASURES, QUESTIONS } from "./data";
import { aggregateDocuments, buildPlan, evaluate } from "./engine";
import { buildReport } from "./report";
import { buildXlsx } from "./exportXlsx";

const answers = Object.fromEntries(QUESTIONS.map((q) => [q.id, q.options?.[0]?.[0] ?? ""]));

describe("экспорт", () => {
  const today = new Date(2026, 9, 2);
  const results = evaluate(MEASURES, QUESTIONS, answers as never, today);
  const tables = buildReport(results, buildPlan(results, today), aggregateDocuments(results, CATALOG), {});
  it("таблицы не пустые и строки совпадают по ширине", () => {
    expect(tables.map((t) => t.name)).toEqual(["Меры", "План", "Документы"]);
    expect(tables[0].rows.length).toBe(MEASURES.length);
    for (const t of tables) for (const r of t.rows) expect(r.length).toBe(t.columns.length);
    expect(AMOUNTS).toBeTruthy();
  });
  it("xlsx — корректный zip с листами и экранированием", () => {
    const bad = [{ ...tables[0], rows: [["<&>\"", ...tables[0].rows[0].slice(1)]] }];
    const files = unzipSync(buildXlsx(bad));
    expect(Object.keys(files)).toContain("xl/worksheets/sheet1.xml");
    expect(strFromU8(files["xl/worksheets/sheet1.xml"])).toContain("&lt;&amp;&gt;&quot;");
    expect(strFromU8(files["xl/workbook.xml"])).toContain('name="Меры"');
  });
});

describe("«Уже получено»", () => {
  it("помечается отдельно и идёт после активных мер", () => {
    const today = new Date(2026, 9, 2);
    const results = evaluate(MEASURES, QUESTIONS, answers as never, today);
    const id = results.find((r) => r.verdict === "yes")!.measure.id;
    const t = buildReport(results, [], aggregateDocuments([], CATALOG), { [`got:${id}`]: true });
    const col = t[0].rows.map((r) => r[0]);
    expect(col.filter((v) => v === "Уже получено").length).toBe(1);
    expect(col.indexOf("Уже получено")).toBeGreaterThan(col.lastIndexOf("Положено"));
    expect(col.indexOf("Уже получено")).toBeLessThan(col.indexOf("Не подходит"));
  });
});
