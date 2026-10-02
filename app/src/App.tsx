import { useEffect, useMemo, useRef, useState } from "react";
import { AMOUNTS, CATALOG, GLOSSARY, MEASURES, QUESTIONS } from "./data";
import { aggregateDocuments, buildPlan, evaluate, groupByVerdict, staleness, visibleQuestions } from "./engine";
import Form516n from "./forms/Form516n";
import Gloss from "./Gloss";
import Memo from "./forms/Memo";
import { downloadSaved, loadStored, parseSaved, persist, serialize } from "./storage";
import { Calendar, Check, Chevron, Clock, Doc, External, Help, Info, Link, Lock, Minus, Shield } from "./Icons";
import { UNKNOWN, type Answers, type Measure, type MeasureResult, type Verdict } from "./types";

import { EMBED } from "./env";
import { buildReport, type Table } from "./report";

type Progress = Record<string, boolean>;
type View = "measures" | "plan" | "docs";

type Stage = "intro" | "ask" | "result" | "form516n" | "memo";

const VERDICT_TITLE: Record<Verdict, string> = {
  yes: "Вам положено",
  maybe: "Нужно уточнить",
  later: "Станет доступно позже",
  no: "Не подходит по вашим ответам",
};
const TAB_TITLE: Record<Verdict, string> = { yes: "Положено", maybe: "Уточнить", later: "Позже", no: "Не подходит" };
const GROUP_TITLE: Record<Measure["group"], string> = {
  money: "Выплаты",
  benefits: "Льготы и услуги",
  parents: "Льготы родителям и налоги",
  excluded: "Не положено",
};
const GROUP_ORDER: Measure["group"][] = ["money", "benefits", "parents", "excluded"];
const VERDICT_ICON: Record<Verdict, () => JSX.Element> = { yes: () => <Check size={18} />, maybe: () => <Help size={18} />, later: () => <Clock size={18} />, no: () => <Minus size={18} /> };

export default function App() {
  const [stage, setStage] = useState<Stage>("intro");
  const [answers, setAnswers] = useState<Answers>({});
  const [progress, setProgress] = useState<Progress>({});
  const [save, setSave] = useState(false);
  const [big, setBig] = useState(false);
  const [contrast, setContrast] = useState(false);
  const [memoId, setMemoId] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle("big", big);
    document.documentElement.classList.toggle("contrast", contrast);
  }, [big, contrast]);

  useEffect(() => {
    if (save) persist(answers, progress);
  }, [save, answers, progress]);

  // при печати раскрываем все карточки, чтобы в PDF попали документы и сроки
  useEffect(() => {
    const open = () => document.querySelectorAll("details").forEach((d) => d.setAttribute("open", ""));
    window.addEventListener("beforeprint", open);
    return () => window.removeEventListener("beforeprint", open);
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [stage]);

  const saved = useMemo(loadStored, []);
  const toggleProgress = (key: string, value: boolean) => setProgress((p) => ({ ...p, [key]: value }));

  return (
    <div className="app">
      <header className="bar no-print">
        <div className="brand">
          <span className="mark"><Shield size={22} /></span>
          <div>
            <strong>Помощник по мерам поддержки</strong>
            <small>семья с ребёнком-инвалидом · Москва</small>
          </div>
        </div>
        <div className="tools" role="group" aria-label="Настройки отображения">
          <button className="toggle" aria-pressed={big} onClick={() => setBig(!big)}>Крупный шрифт</button>
          <button className="toggle" aria-pressed={contrast} onClick={() => setContrast(!contrast)}>Контраст</button>
        </div>
      </header>
      <main>
        {stage === "intro" && (
          <Intro
            hasSaved={!!saved}
            save={save}
            setSave={setSave}
            onStart={() => { setAnswers({}); setProgress({}); setStage("ask"); }}
            onResume={() => { setAnswers(saved?.answers ?? {}); setProgress(saved?.progress ?? {}); setSave(true); setStage("ask"); }}
            onLoadFile={(a, pr) => {
              setAnswers(a); setProgress(pr);
              // все вопросы отвечены — сразу к результату, иначе продолжаем опрос
              setStage(visibleQuestions(QUESTIONS, a).every((q) => a[q.id] !== undefined) ? "result" : "ask");
            }}
          />
        )}
        {stage === "ask" && <Ask answers={answers} progress={progress} setAnswers={setAnswers} onDone={() => setStage("result")} onCancel={() => setStage("intro")} />}
        {stage === "result" && (
          <Result
            answers={answers}
            progress={progress}
            toggleProgress={toggleProgress}
            onImport={(a, p) => { setAnswers(a); setProgress(p); }}
            onBack={() => setStage("ask")}
            onRestart={() => { setAnswers({}); setProgress({}); setStage("intro"); }}
            onOpenForm={(kind, id) => { setMemoId(id); setStage(kind === "form516n" ? "form516n" : "memo"); }}
          />
        )}
        {stage === "form516n" && <Form516n onBack={() => setStage("result")} />}
        {stage === "memo" && memoId && <Memo measure={MEASURES.find((m) => m.id === memoId)!} onBack={() => setStage("result")} />}
      </main>
      <footer className="foot">
        Информационный помощник: не юридическая консультация и не орган власти. Данные остаются в вашем браузере и никуда не отправляются.
        Сведения сверены с источниками 02.10.2026.
        <Glossary />
      </footer>
    </div>
  );
}

function Glossary() {
  return (
    <details className="glossary no-print">
      <summary>Словарик сокращений</summary>
      <dl>{Object.entries(GLOSSARY).map(([k, v]) => (<div key={k}><dt>{k}</dt><dd>{v}</dd></div>))}</dl>
    </details>
  );
}

function Intro(p: { hasSaved: boolean; save: boolean; setSave: (v: boolean) => void; onStart: () => void; onResume: () => void; onLoadFile: (a: Answers, pr: Progress) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState("");
  const loadFile = async (f: File) => {
    const s = parseSaved(await f.text());
    if (!s) { setErr("Не удалось прочитать файл: это не сохранённый прогресс сервиса."); return; }
    p.onLoadFile(s.answers, s.progress);
  };
  return (
    <section className="hero">
      <p className="eyebrow">Москва · ребёнок до 18 лет с инвалидностью</p>
      <h1>Что положено вашей семье и как это оформить</h1>
      <p className="lead">Ответьте на 15–20 коротких вопросов. Сервис покажет выплаты, льготы и налоговые вычеты, которые вам подходят, составит план действий и общий список документов, даст прямые ссылки на оформление.</p>
      <div className="row">
        <button className="btn primary big-btn" onClick={p.onStart}>Пройти опрос</button>
        {p.hasSaved && <button className="btn" onClick={p.onResume}>Продолжить с сохранёнными ответами</button>}
        {!EMBED && (
          <>
            <button className="btn" onClick={() => fileRef.current?.click()}>Загрузить прогресс из файла</button>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) await loadFile(f); e.target.value = ""; }} />
          </>
        )}
      </div>
      {err && <p className="help" role="alert">{err}</p>}
      <label className="check">
        <input type="checkbox" checked={p.save} onChange={(e) => p.setSave(e.target.checked)} />
        <span>Запомнить ответы и отметки на этом устройстве. По умолчанию ничего не сохраняется.</span>
      </label>
      <ul className="facts">
        <li><span className="fi"><Doc /></span><div><b>{MEASURES.filter((m) => m.group !== "excluded").length} мер поддержки</b><span>выплаты, льготы, налоги, отдых и лечение</span></div></li>
        <li><span className="fi"><Link /></span><div><b>План и документы</b><span>что подавать сначала и какие бумаги собрать один раз</span></div></li>
        <li><span className="fi"><Lock /></span><div><b>Ответы остаются у вас</b><span>расчёт идёт в браузере, на сервер ничего не отправляется</span></div></li>
      </ul>
    </section>
  );
}

function Ask(p: { answers: Answers; progress: Progress; setAnswers: (a: Answers) => void; onDone: () => void; onCancel: () => void }) {
  const visible = visibleQuestions(QUESTIONS, p.answers);
  const [idx, setIdx] = useState(0);
  const q = visible[Math.min(idx, visible.length - 1)];
  const value = p.answers[q.id];
  const set = (v: string | number | boolean | undefined) => p.setAnswers({ ...p.answers, [q.id]: v });
  const num = q.type === "number" ? (value as number | undefined) : undefined;
  const invalid = q.type === "number" && (num === undefined || Number.isNaN(num) || num < (q.min ?? 0) || num > (q.max ?? 120));
  const answered = q.type === "number" ? !invalid : value !== undefined;
  const isLast = idx >= visible.length - 1;

  const next = () => {
    // после ответа список вопросов мог измениться — индекс остаётся тем же
    if (isLast) p.onDone();
    else setIdx(idx + 1);
  };
  const prev = () => (idx === 0 ? p.onCancel() : setIdx(idx - 1));
  const pct = Math.round(((idx + 1) / visible.length) * 100);
  const canUnknown = q.type !== "number" && !q.noUnknown;

  return (
    <section className="ask" aria-live="polite">
      <div className="steps">
        <span>Вопрос {idx + 1} из {visible.length}</span>
        <div className="track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Ход опроса"><i style={{ width: `${pct}%` }} /></div>
      </div>
      <h2 id="qtitle">{q.text}</h2>
      <div role="group" aria-labelledby="qtitle" className="options">
        {q.type === "bool" && (
          <>
            <button className={value === true ? "opt sel" : "opt"} aria-pressed={value === true} onClick={() => set(true)}><span className="dot" />Да</button>
            <button className={value === false ? "opt sel" : "opt"} aria-pressed={value === false} onClick={() => set(false)}><span className="dot" />Нет</button>
          </>
        )}
        {q.type === "choice" &&
          q.options!.map(([v, label]) => (
            <button key={v} className={value === v ? "opt sel" : "opt"} aria-pressed={value === v} onClick={() => set(v)}><span className="dot" />{label}</button>
          ))}
        {canUnknown && (
          <button className={value === UNKNOWN ? "opt sel unknown" : "opt unknown"} aria-pressed={value === UNKNOWN} onClick={() => set(UNKNOWN)}><span className="dot" />Не знаю, уточню позже</button>
        )}
        {q.type === "number" && (
          <input
            className="num"
            type="number"
            inputMode="numeric"
            min={q.min}
            max={q.max}
            value={value === undefined ? "" : String(value)}
            aria-label={q.text}
            onChange={(e) => set(e.target.value === "" ? undefined : Number(e.target.value))}
          />
        )}
      </div>
      {q.help && (
        <aside className="hint">
          <span className="hi"><Info size={20} /></span>
          <div>{q.help.split("\n").map((para) => <p key={para}><Gloss text={para} /></p>)}</div>
        </aside>
      )}
      <div className="actions">
        <button className="btn" onClick={prev}>Назад</button>
        <button className="btn primary" disabled={!answered} onClick={next}>{isLast ? "Показать результат" : "Далее"}</button>
      </div>
      {!EMBED && <p className="savehint"><button className="link-btn" onClick={() => downloadSaved(p.answers, p.progress)}>Сохранить прогресс в файл</button> — чтобы продолжить позже на этом или другом устройстве</p>}
    </section>
  );
}

type OpenForm = (kind: "form516n" | "memo", id: string) => void;

const shortTitle = (t: string) => t.replace(/\s*\(.*$/, "");

function Notices({ answers, results }: { answers: Answers; results: MeasureResult[] }) {
  const items: string[] = [];
  const age = answers.age as number;
  if (age >= 14) items.push("Ребёнку 14 лет и больше: вместо свидетельства о рождении нужен паспорт ребёнка. До 14 лет карту москвича оформляет только законный представитель.");
  if (answers.moreDisabled === true) items.push("В семье несколько детей с инвалидностью. Выплаты по уходу и заявления оформляются на каждого ребёнка отдельно; сервис посчитал меры для одного. Пройдите опрос ещё раз для другого ребёнка: документы родителя общие.");
  const unknown = results.filter((r) => r.unknowns.length).length;
  if (unknown) items.push(`Вы пропустили часть вопросов («Не знаю»). Из-за этого мер, где нужно уточнить: ${unknown}. Нажмите «Изменить ответы», когда узнаете.`);
  if (!items.length) return null;
  return <div className="notices">{items.map((n) => <p key={n}><Info size={18} /><span>{n}</span></p>)}</div>;
}

function Freshness() {
  const today = new Date();
  const s = staleness(MEASURES, today);
  const review = new Date(AMOUNTS._meta.nextReview + "T00:00:00");
  const msgs: string[] = [];
  if (s.days > 90) msgs.push(`Сведения проверялись ${s.oldest.toLocaleDateString("ru-RU")} (${s.days} дн. назад) и могли устареть. Сверьтесь на официальных страницах по ссылкам.`);
  if (today >= review) msgs.push("Суммы выплат ежегодно индексируют (1 февраля и в течение года). Они могли измениться, проверьте актуальные размеры.");
  if (!msgs.length) return null;
  return <div className="stale no-print">{msgs.map((m) => <p key={m}>{m}</p>)}</div>;
}

function Result(p: {
  answers: Answers;
  progress: Progress;
  toggleProgress: (k: string, v: boolean) => void;
  onImport: (a: Answers, pr: Progress) => void;
  onBack: () => void;
  onRestart: () => void;
  onOpenForm: OpenForm;
}) {
  const { answers, progress, toggleProgress } = p;
  const today = useMemo(() => new Date(), []);
  const results = useMemo(() => evaluate(MEASURES, QUESTIONS, answers, today), [answers, today]);
  // отмеченные «уже получено» уходят в свой раздел и не попадают в план и общий список документов
  const isGot = (r: MeasureResult) => r.verdict !== "no" && !!progress[`got:${r.measure.id}`];
  const gotList = results.filter(isGot);
  const active = results.filter((r) => !isGot(r));
  const g = groupByVerdict(active);
  const order: Verdict[] = ["yes", "maybe", "later", "no"];
  const first = order.find((v) => g[v].length) ?? (gotList.length ? "got" : "yes");
  const [tab, setTab] = useState<Verdict | "got">(first);
  const [note, setNote] = useState("");
  const [view, setView] = useState<View>("measures");
  const [pending, setPending] = useState<string | null>(null);
  const list = tab === "got" ? gotList : g[tab];
  const upcoming = active.filter((r) => r.nextDate && r.verdict !== "no");
  const plan = useMemo(() => buildPlan(active, today), [results, progress, today]);
  const docs = useMemo(() => aggregateDocuments(active, CATALOG), [results, progress]);

  // переход к карточке меры из плана или списка документов
  const goMeasure = (id: string) => {
    const r = results.find((x) => x.measure.id === id);
    if (!r) return;
    setView("measures");
    setTab(isGot(r) ? "got" : r.verdict);
    setPending(id);
  };
  useEffect(() => {
    if (!pending) return;
    const el = document.getElementById(`m-${pending}`) as HTMLDetailsElement | null;
    if (el) {
      el.open = true;
      el.scrollIntoView({ block: "start" });
    }
    setPending(null);
  }, [pending, view, tab]);

  const toggleAll = (open: boolean) =>
    document.querySelectorAll<HTMLDetailsElement>("#list details.measure").forEach((d) => { d.open = open; });

  const planDone = plan.filter((i) => progress[`plan:${i.measureId}`]).length;

  return (
    <section>
      <div className="res-head">
        <div>
          <p className="eyebrow">Результат на {today.toLocaleDateString("ru-RU")}</p>
          <h1>Что положено вашей семье</h1>
        </div>
        <div className="row no-print">
          <button className="btn" onClick={p.onBack}>Изменить ответы</button>
          {!EMBED && <button className="btn primary" onClick={() => window.print()}>Печать / PDF</button>}
          <button className="btn" onClick={p.onRestart}>Заново</button>
        </div>
      </div>
      {EMBED && <p className="demo no-print">Пробная версия: печать отключена. В полной версии (запуск на компьютере) результат сохраняется в PDF через «Печать».</p>}
      <Freshness />
      <Notices answers={answers} results={results} />

      <nav className="views no-print" aria-label="Разделы результата">
        <button aria-current={view === "measures"} onClick={() => setView("measures")}>Меры <span>{results.filter((r) => r.verdict !== "no").length}</span></button>
        <button aria-current={view === "plan"} onClick={() => setView("plan")}>План действий <span>{planDone}/{plan.length}</span></button>
        <button aria-current={view === "docs"} onClick={() => setView("docs")}>Все документы <span>{docs.shared.length}</span></button>
      </nav>

      {view === "plan" && <PlanView plan={plan} progress={progress} toggle={toggleProgress} goMeasure={goMeasure} />}
      {view === "docs" && <DocsView docs={docs} results={results} progress={progress} toggle={toggleProgress} goMeasure={goMeasure} />}

      {view === "measures" && (
        <>
          {upcoming.length > 0 && (
            <div className="deadlines">
              <h2><Calendar size={20} /> Ближайшие сроки</h2>
              <ul>{upcoming.map((r) => (
                <li key={r.measure.id}><time className="date">{r.nextDate!.date}</time><span>{r.nextDate!.label}<small>{shortTitle(r.measure.title)}</small></span></li>
              ))}</ul>
            </div>
          )}

          <div className="tabs no-print" role="tablist" aria-label="Фильтр по результату">
            {[...order, "got" as const].map((v) => v === "got" ? (
              <button key={v} role="tab" id="tab-got" aria-selected={tab === "got"} aria-controls="list" className="tab got" onClick={() => setTab("got")} disabled={!gotList.length}>
                <span className="tab-ico"><Check size={18} /></span>
                <span className="tab-name">Получено</span>
                <span className="tab-n">{gotList.length}</span>
              </button>
            ) : (
              <button key={v} role="tab" id={`tab-${v}`} aria-selected={tab === v} aria-controls="list" className={`tab ${v}`} onClick={() => setTab(v)} disabled={!g[v].length}>
                <span className="tab-ico">{VERDICT_ICON[v]()}</span>
                <span className="tab-name">{TAB_TITLE[v]}</span>
                <span className="tab-n">{g[v].length}</span>
              </button>
            ))}
          </div>

          <div id="list" role="tabpanel" aria-labelledby={`tab-${tab}`}>
            <div className="list-head">
              <h2 className={`verdict ${tab}`}>{tab === "got" ? "Уже получено" : VERDICT_TITLE[tab]}</h2>
              {tab !== "no" && list.length > 0 && (
                <span className="no-print">
                  <button className="link-btn" onClick={() => toggleAll(true)}>Раскрыть все</button>
                  <button className="link-btn" onClick={() => toggleAll(false)}>Свернуть</button>
                </span>
              )}
            </div>
            {tab === "no" ? (
              <ul className="no-list">{list.map((r) => (
                <li key={r.measure.id}>
                  <b>{shortTitle(r.measure.title)}</b>
                  <span>{r.reason}</span>
                  {r.whatIf.length > 0 && <small>Подошла бы, если: {r.whatIf.map((w) => `«${w.question}» — ${w.answer}`).join("; ")}.</small>}
                </li>
              ))}</ul>
            ) : (
              GROUP_ORDER.map((grp) => {
                const items = list.filter((r) => r.measure.group === grp);
                return items.length ? (
                  <div key={grp} className="group">
                    <h3 className="group-title">{GROUP_TITLE[grp]}</h3>
                    {items.map((r) => <MeasureCard key={r.measure.id} r={r} progress={progress} toggle={(k, v) => { toggleProgress(k, v); if (k.startsWith("got:")) setNote(v ? "Мера перенесена в раздел «Уже получено»." : "Мера возвращена в список."); }} onOpenForm={p.onOpenForm} />)}
                  </div>
                ) : null;
              })
            )}
            {list.length === 0 && <p className="empty">В этой группе мер нет.</p>}
            <p className="help" role="status" aria-live="polite">{note}</p>
          </div>
        </>
      )}

      <ExportPanel answers={answers} progress={progress} onImport={p.onImport} getTables={() => buildReport(results, plan, docs, progress)} />
    </section>
  );
}

function PlanView(p: { plan: ReturnType<typeof buildPlan>; progress: Progress; toggle: (k: string, v: boolean) => void; goMeasure: (id: string) => void }) {
  const groups: { pr: 1 | 2 | 3; title: string; hint: string }[] = [
    { pr: 1, title: "Сначала", hint: "срочно: от срока зависят деньги или право" },
    { pr: 2, title: "В ближайший месяц", hint: "основные льготы и заявления" },
    { pr: 3, title: "Когда будет время", hint: "по необходимости и по мере появления потребности" },
  ];
  return (
    <div className="plan">
      <p className="help">Шаги отсортированы по срочности. Отмечайте сделанное: отметки сохраняются, если вы включили запоминание.</p>
      {groups.map((gr) => {
        const items = p.plan.filter((i) => i.priority === gr.pr);
        if (!items.length) return null;
        return (
          <div key={gr.pr} className="group">
            <h3 className="group-title">{gr.title} <small>· {gr.hint}</small></h3>
            <ol className="steps-list">
              {items.map((i) => {
                const key = `plan:${i.measureId}`;
                const done = !!p.progress[key];
                return (
                  <li key={i.measureId} className={done ? "step done" : "step"}>
                    <label className="stepcheck">
                      <input type="checkbox" checked={done} onChange={(e) => p.toggle(key, e.target.checked)} aria-label={`Сделано: ${i.action}`} />
                    </label>
                    <div className="stepbody">
                      <b>{i.action}</b>
                      <span className="why-line"><Gloss text={i.why} /></span>
                      <div className="stepmeta">
                        {i.date && <time className="date sm">до {i.date}</time>}
                        <button className="link-btn" onClick={() => p.goMeasure(i.measureId)}>Открыть меру</button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        );
      })}
      {p.plan.length === 0 && <p className="empty">По вашим ответам нет мер, которые нужно оформлять.</p>}
    </div>
  );
}

function DocsView(p: {
  docs: ReturnType<typeof aggregateDocuments>;
  results: MeasureResult[];
  progress: Progress;
  toggle: (k: string, v: boolean) => void;
  goMeasure: (id: string) => void;
}) {
  const title = (id: string) => shortTitle(p.results.find((r) => r.measure.id === id)!.measure.title);
  const otherBy = p.docs.other.reduce<Record<string, string[]>>((acc, o) => { (acc[o.measure] ||= []).push(o.doc); return acc; }, {});
  const have = p.docs.shared.filter((d) => p.progress[`doc:${d.item.id}`]).length;
  return (
    <div className="docsview">
      <p className="help">Общие документы нужны для нескольких мер сразу: соберите их один раз. Собрано: {have} из {p.docs.shared.length}.</p>
      <ul className="shared">
        {p.docs.shared.map((d) => {
          const key = `doc:${d.item.id}`;
          return (
            <li key={d.item.id} className={p.progress[key] ? "shared-item done" : "shared-item"}>
              <label>
                <input type="checkbox" checked={!!p.progress[key]} onChange={(e) => p.toggle(key, e.target.checked)} />
                <span><b>{d.item.title}</b><span className="where"><Gloss text={d.item.where} /></span></span>
              </label>
              <div className="needfor no-print">
                <small>Нужен для: ({d.measures.length})</small>
                {d.measures.map((id) => <button key={id} className="chip-btn" onClick={() => p.goMeasure(id)}>{title(id)}</button>)}
              </div>
              <p className="print-only">Нужен для: {d.measures.map(title).join(", ")}</p>
            </li>
          );
        })}
      </ul>
      {Object.keys(otherBy).length > 0 && (
        <>
          <h3 className="group-title">Документы для отдельных мер</h3>
          {Object.entries(otherBy).map(([m, ds]) => (
            <div key={m} className="otherdocs">
              <h4>{shortTitle(m)}</h4>
              <ul className="docs">
                {ds.map((d) => {
                  const mid = p.results.find((r) => r.measure.title === m)!.measure.id;
                  const key = `mdoc:${mid}:${d}`;
                  return (<li key={d}><label><input type="checkbox" checked={!!p.progress[key]} onChange={(e) => p.toggle(key, e.target.checked)} /><span><Gloss text={d} /></span></label></li>);
                })}
              </ul>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function ExportPanel(p: { answers: Answers; progress: Progress; onImport: (a: Answers, pr: Progress) => void; getTables: () => Table[] }) {
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  const [exMsg, setExMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const code = useMemo(() => serialize(p.answers, p.progress), [p.answers, p.progress]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setMsg("Скопировано. Вставьте код в заметки или сообщение себе.");
    } catch {
      setMsg("Не удалось скопировать автоматически: выделите код ниже и скопируйте вручную.");
    }
  };
  const load = (src: string) => {
    const s = parseSaved(src);
    if (!s) { setMsg("Не удалось прочитать: это не сохранённые ответы сервиса."); return; }
    p.onImport(s.answers, s.progress);
    setMsg("Ответы и отметки загружены.");
    setText("");
  };
  const download = () => downloadSaved(p.answers, p.progress);
  const save = (data: Uint8Array, name: string, type: string) => {
    const url = URL.createObjectURL(new Blob([data as BlobPart], { type }));
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const stamp = new Date().toISOString().slice(0, 10);
  const exportAs = async (kind: "xlsx" | "pdf") => {
    setBusy(kind); setExMsg("");
    try {
      const tables = p.getTables();
      if (kind === "xlsx") save((await import("./exportXlsx")).buildXlsx(tables), `rezultat-${stamp}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      else save(await (await import("./exportPdf")).buildPdf(tables, new Date().toLocaleDateString("ru-RU")), `rezultat-${stamp}.pdf`, "application/pdf");
      setExMsg("Файл сохранён.");
    } catch { setExMsg("Не удалось создать файл. Попробуйте ещё раз или воспользуйтесь печатью."); }
    setBusy("");
  };
  return (
    <>
    {!EMBED && (
      <div className="exportbox no-print">
        <h3 className="group-title">Сохранить результат</h3>
        <p className="help">Таблица для Excel и документ PDF: меры, план действий и список документов. Файл прогресса (JSON) позволит продолжить позже: на первом экране нажмите «Загрузить прогресс из файла».</p>
        <div className="row">
          <button className="btn sm" disabled={!!busy} onClick={() => exportAs("xlsx")}>{busy === "xlsx" ? "Готовлю…" : "Скачать Excel (xlsx)"}</button>
          <button className="btn sm" disabled={!!busy} onClick={() => exportAs("pdf")}>{busy === "pdf" ? "Готовлю…" : "Скачать PDF"}</button>
          <button className="btn sm" onClick={() => downloadSaved(p.answers, p.progress)}>Сохранить прогресс (JSON)</button>
        </div>
        {exMsg && <p className="help" role="status">{exMsg}</p>}
      </div>
    )}
    <details className="exportbox no-print">
      <summary>Сохранить или перенести ответы</summary>
      <p className="help">Ответы нигде не хранятся, кроме вашего браузера. Чтобы продолжить на другом устройстве, скопируйте код и вставьте его там в поле ниже.</p>
      <label className="lab" htmlFor="export-code">Ваш код</label>
      <textarea id="export-code" readOnly value={code} rows={3} onFocus={(e) => e.currentTarget.select()} />
      <div className="row">
        <button className="btn sm" onClick={copy}>Скопировать код</button>
        {!EMBED && <button className="btn sm" onClick={download}>Скачать файл</button>}
        {!EMBED && (
          <>
            <button className="btn sm" onClick={() => fileRef.current?.click()}>Загрузить из файла</button>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) load(await f.text()); e.target.value = ""; }} />
          </>
        )}
      </div>
      <label className="lab" htmlFor="import-code">Загрузить по коду</label>
      <textarea id="import-code" value={text} rows={3} onChange={(e) => setText(e.target.value)} placeholder="Вставьте сюда ранее сохранённый код" />
      <div className="row"><button className="btn sm" disabled={!text.trim()} onClick={() => load(text)}>Загрузить</button></div>
      {msg && <p className="help" role="status">{msg}</p>}
    </details>
    </>
  );
}

function Links({ links }: { links: Measure["apply"] }) {
  const apply = links.filter((l) => l.kind === "apply");
  const info = links.filter((l) => l.kind === "info");
  if (links.length === 0) return null;
  return (
    <div className="sect">
      {apply.length > 0 ? (
        <>
          <h4>Подать заявление онлайн</h4>
          <div className="btns">{apply.map((l) => (
            <a key={l.url} className="btn primary sm" href={l.url} target="_blank" rel="noreferrer noopener">{l.label}<External size={16} /></a>
          ))}</div>
        </>
      ) : (
        <p className="no-online"><b>Онлайн-подача не подтверждена.</b> Процедура описана на страницах ниже: обычно подают лично, через работодателя, врача или МФЦ.</p>
      )}
      {info.length > 0 && (
        <>
          <h4>Описание процедуры</h4>
          <ul className="info-links">{info.map((l) => (
            <li key={l.url}><a href={l.url} target="_blank" rel="noreferrer noopener">{l.label}<External size={14} /></a></li>
          ))}</ul>
        </>
      )}
    </div>
  );
}

function Why({ r }: { r: MeasureResult }) {
  if (!r.factors.length && !r.whatIf.length && !r.unknowns.length) return null;
  return (
    <details className="why">
      <summary>Почему такой вывод</summary>
      {r.factors.length > 0 && (
        <>
          <p className="help">Учтены ваши ответы:</p>
          <ul className="plain">{r.factors.map((f) => <li key={f.question}>{f.question}: <b>{f.answer}</b></li>)}</ul>
        </>
      )}
      {r.unknowns.length > 0 && <p className="help">Не знаю: {r.unknowns.join(", ")}. Ответьте на эти вопросы, чтобы получить точный вывод.</p>}
      {r.whatIf.length > 0 && (
        <>
          <p className="help">Мера подошла бы, если бы:</p>
          <ul className="plain">{r.whatIf.map((w) => <li key={w.question + w.answer}>«{w.question}» — <b>{w.answer}</b></li>)}</ul>
        </>
      )}
    </details>
  );
}

function MeasureCard({ r, progress, toggle, onOpenForm }: { r: MeasureResult; progress: Progress; toggle: (k: string, v: boolean) => void; onOpenForm: OpenForm }) {
  const m = r.measure;
  return (
    <details id={`m-${m.id}`} className={`measure ${r.verdict}`}>
      <summary>
        <span className="status">{VERDICT_ICON[r.verdict]()}</span>
        <span className="sum">
          <span className="mtitle">{m.title}{m.status === "check" && <span className="badge" title="Часть условий не подтверждена первоисточником">уточнить</span>}</span>
          <span className="reason">{r.reason}</span>
        </span>
        <span className="chev"><Chevron size={20} /></span>
      </summary>
      <div className="mbody">
        <p><Gloss text={m.summary} /></p>
        {r.verdict !== "no" && (
          <label className="gotmark no-print">
            <input type="checkbox" checked={!!progress[`got:${m.id}`]} onChange={(e) => toggle(`got:${m.id}`, e.target.checked)} />
            <span>{progress[`got:${m.id}`] ? "Уже получаю или оформлено (снимите, чтобы вернуть в список)" : "Уже получаю или оформлено — перенести в «Уже получено»"}</span>
          </label>
        )}
        <p className="who"><b>Куда обращаться:</b> <Gloss text={m.authority} /></p>
        <Links links={m.apply} />
        {m.forms && (
          <div className="btns no-print">
            {m.forms.map((f) => <button key={f.kind} className="btn sm" onClick={() => onOpenForm(f.kind, m.id)}>{f.label}</button>)}
          </div>
        )}
        {r.documents.length > 0 && (
          <div className="sect">
            <h4>Документы</h4>
            <ul className="docs">{r.documents.map((d) => {
              const key = `mdoc:${m.id}:${d}`;
              return <li key={d}><label><input type="checkbox" checked={!!progress[key]} onChange={(e) => toggle(key, e.target.checked)} /><span><Gloss text={d} /></span></label></li>;
            })}</ul>
          </div>
        )}
        {m.documents.auto.length > 0 && (<div className="sect"><h4>Запрашивают сами</h4><ul className="plain">{m.documents.auto.map((d) => <li key={d}><Gloss text={d} /></li>)}</ul></div>)}
        {m.deadlines.length > 0 && (<div className="sect"><h4>Сроки</h4><ul className="plain">{m.deadlines.map((d) => <li key={d}><Gloss text={d} /></li>)}</ul></div>)}
        {m.tips.length > 0 && (<div className="callout"><h4>Важно</h4><ul className="plain">{m.tips.map((d) => <li key={d}><Gloss text={d} /></li>)}</ul></div>)}
        <Why r={r} />
        <p className="src">Основание: {m.basis}. Проверено {m.checkedAt.split("-").reverse().join(".")}.</p>
      </div>
    </details>
  );
}
