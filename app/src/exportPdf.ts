import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { Table } from "./report";
import latinRegular from "@fontsource/onest/files/onest-latin-400-normal.woff?url";
import latinBold from "@fontsource/onest/files/onest-latin-700-normal.woff?url";
import cyrRegular from "@fontsource/onest/files/onest-cyrillic-400-normal.woff?url";
import cyrBold from "@fontsource/onest/files/onest-cyrillic-700-normal.woff?url";

interface Face { latin: PDFFont; cyr: PDFFont }

const W = 595.28, H = 841.89, M = 42; // A4, поля
const INK = rgb(0.13, 0.15, 0.2), MUTED = rgb(0.4, 0.43, 0.5), LINE = rgb(0.85, 0.87, 0.9);

const isCyr = (ch: string) => /[Ѐ-ӿ№]/.test(ch);

/** Широкая строка из двух шрифтов (латиница и кириллица лежат в разных файлах). */
function runs(text: string, f: Face): { font: PDFFont; s: string }[] {
  const out: { font: PDFFont; s: string }[] = [];
  for (const ch of text) {
    const font = isCyr(ch) ? f.cyr : f.latin;
    const last = out[out.length - 1];
    if (last && last.font === font) last.s += ch; else out.push({ font, s: ch });
  }
  return out;
}
const safe = (font: PDFFont, s: string) => [...s].filter((c) => { try { font.encodeText(c); return true; } catch { return false; } }).join("");
function width(text: string, f: Face, size: number): number {
  return runs(text, f).reduce((a, r) => a + r.font.widthOfTextAtSize(safe(r.font, r.s), size), 0);
}
function wrap(text: string, f: Face, size: number, max: number): string[] {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    let cur = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = cur ? `${cur} ${word}` : word;
      if (width(next, f, size) <= max) { cur = next; continue; }
      if (cur) lines.push(cur);
      // слово длиннее строки (адрес): режем по символам
      cur = "";
      for (const ch of word) {
        if (width(cur + ch, f, size) > max && cur) { lines.push(cur); cur = ch; } else cur += ch;
      }
    }
    lines.push(cur);
  }
  return lines.length ? lines : [""];
}
function draw(page: PDFPage, text: string, x: number, y: number, f: Face, size: number, color = INK) {
  let cx = x;
  for (const r of runs(text, f)) {
    const s = safe(r.font, r.s);
    if (!s) continue;
    page.drawText(s, { x: cx, y, size, font: r.font, color });
    cx += r.font.widthOfTextAtSize(s, size);
  }
}

async function load(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Шрифт не загрузился: ${url}`);
  return res.arrayBuffer();
}

/** PDF: заголовок, затем по таблице на раздел; каждая строка таблицы — карточка «поле: значение». */
export async function buildPdf(tables: Table[], dateLabel: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle("Помощник по мерам поддержки: результат");
  doc.setCreator("Помощник по мерам поддержки");
  const [lr, lb, cr, cb] = await Promise.all([latinRegular, latinBold, cyrRegular, cyrBold].map(load));
  const embed = (b: ArrayBuffer) => doc.embedFont(b, { subset: true });
  const reg: Face = { latin: await embed(lr), cyr: await embed(cr) };
  const bold: Face = { latin: await embed(lb), cyr: await embed(cb) };

  let page = doc.addPage([W, H]);
  let y = H - M;
  const ensure = (need: number) => { if (y - need < M + 14) { page = doc.addPage([W, H]); y = H - M; } };
  const line = (text: string, f: Face, size: number, color = INK, indent = 0, gap = 3) => {
    for (const l of wrap(text, f, size, W - 2 * M - indent)) {
      ensure(size + gap);
      y -= size + gap;
      draw(page, l, M + indent, y, f, size, color);
    }
  };

  line("Помощник по мерам поддержки", bold, 20, INK, 0, 6);
  line(`Результат на ${dateLabel}. Справочная информация, не юридическая консультация: проверяйте условия на официальных страницах.`, reg, 9.5, MUTED, 0, 4);
  y -= 8;

  for (const t of tables) {
    ensure(60);
    y -= 10;
    line(t.title, bold, 14, INK, 0, 5);
    if (!t.rows.length) { line("Нет записей.", reg, 10, MUTED); continue; }
    for (const row of t.rows) {
      const cells = t.columns.map((c, i) => ({ head: c.head, v: row[i] ?? "" })).filter((c) => c.v);
      const first = cells.find((c) => c.head === t.columns[t.titleCol].head) ?? cells[0];
      ensure(40);
      y -= 4;
      page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: LINE });
      y -= 2;
      line(first.v, bold, 11, INK, 0, 3);
      for (const c of cells) {
        if (c === first) continue;
        line(`${c.head}: ${c.v}`, reg, 9.5, c.head === "Результат" || c.head === "Когда" ? INK : MUTED, 8, 2);
      }
    }
  }
  const pages = doc.getPages();
  pages.forEach((p, i) => draw(p, `${i + 1} / ${pages.length}`, W - M - 30, M - 18, reg, 8, MUTED));
  return doc.save();
}
