import { Fragment, useMemo, useState } from "react";
import { GLOSSARY } from "./data";

const keys = Object.keys(GLOSSARY).sort((a, b) => b.length - a.length);
const re = new RegExp(keys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "g");
const isWord = (ch: string | undefined) => !!ch && /[0-9A-Za-zА-Яа-яЁё]/.test(ch);

/** Режет текст на куски: обычный текст и найденные сокращения (границы слов проверяются вручную). */
export function splitTerms(text: string): { text: string; term?: string }[] {
  const out: { text: string; term?: string }[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    const i = m.index ?? 0;
    const end = i + m[0].length;
    if (isWord(text[i - 1]) || isWord(text[end])) continue;
    if (i > last) out.push({ text: text.slice(last, i) });
    out.push({ text: m[0], term: m[0] });
    last = end;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

function Term({ term, label }: { term: string; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="term" aria-expanded={open} onClick={() => setOpen(!open)} onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>{label}</button>
      {open && <span className="gdef" role="note"><b>{term}</b> — {GLOSSARY[term]}</span>}
    </>
  );
}

/** Текст, в котором сокращения (ИПРА, МСЭ, СФР…) раскрываются по нажатию. */
export default function GlossText({ text }: { text: string }) {
  const parts = useMemo(() => splitTerms(text), [text]);
  return (
    <>
      {parts.map((p, i) => (
        <Fragment key={i}>{p.term ? <Term term={p.term} label={p.text} /> : p.text}</Fragment>
      ))}
    </>
  );
}
