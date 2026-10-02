import { useEffect, useMemo, useState } from "react";
import measuresData from "./data/measures.json";
import questionsData from "./data/questions.json";
import { evaluate, groupByVerdict, visibleQuestions } from "./engine";
import Form516n from "./forms/Form516n";
import Memo from "./forms/Memo";
import type { Answers, Measure, MeasureResult, Question, Verdict } from "./types";

const MEASURES = measuresData as unknown as Measure[];
const QUESTIONS = questionsData as unknown as Question[];
const STORE_KEY = "posobie-helper:v1";

type Stage = "intro" | "ask" | "result" | "form516n" | "memo";

const VERDICT_TITLE: Record<Verdict, string> = {
  yes: "Вам положено",
  maybe: "Нужно уточнить",
  later: "Станет доступно позже",
  no: "Не подходит по вашим ответам",
};
const GROUP_TITLE: Record<Measure["group"], string> = {
  money: "Выплаты",
  benefits: "Льготы и услуги",
  parents: "Льготы родителям и налоги",
  excluded: "Не положено",
};

function loadSaved(): Answers | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as Answers) : null;
  } catch {
    return null;
  }
}

export default function App() {
  const [stage, setStage] = useState<Stage>("intro");
  const [answers, setAnswers] = useState<Answers>({});
  const [save, setSave] = useState(false);
  const [big, setBig] = useState(false);
  const [contrast, setContrast] = useState(false);
  const [memoId, setMemoId] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle("big", big);
    document.documentElement.classList.toggle("contrast", contrast);
  }, [big, contrast]);

  useEffect(() => {
    if (!save) return;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(answers));
    } catch {
      /* без сохранения всё работает */
    }
  }, [save, answers]);

  // при печати раскрываем все карточки, чтобы в PDF попали документы и сроки
  useEffect(() => {
    const open = () => document.querySelectorAll("details").forEach((d) => d.setAttribute("open", ""));
    window.addEventListener("beforeprint", open);
    return () => window.removeEventListener("beforeprint", open);
  }, []);

  const saved = useMemo(loadSaved, []);

  return (
    <div className="app">
      <header className="top no-print">
        <h1>Помощник по мерам поддержки семьи с ребёнком-инвалидом (Москва)</h1>
        <div className="tools" role="group" aria-label="Настройки отображения">
          <button className="chip" aria-pressed={big} onClick={() => setBig(!big)}>Крупный шрифт</button>
          <button className="chip" aria-pressed={contrast} onClick={() => setContrast(!contrast)}>Высокий контраст</button>
        </div>
      </header>
      <main>
        {stage === "intro" && (
          <Intro
            hasSaved={!!saved}
            save={save}
            setSave={setSave}
            onStart={() => { setAnswers({}); setStage("ask"); }}
            onResume={() => { setAnswers(saved ?? {}); setSave(true); setStage("ask"); }}
          />
        )}
        {stage === "ask" && <Ask answers={answers} setAnswers={setAnswers} onDone={() => setStage("result")} onCancel={() => setStage("intro")} />}
        {stage === "result" && (
          <Result
            answers={answers}
            onBack={() => setStage("ask")}
            onRestart={() => { setAnswers({}); setStage("intro"); }}
            onOpenForm={(kind, id) => { setMemoId(id); setStage(kind === "form516n" ? "form516n" : "memo"); }}
          />
        )}
        {stage === "form516n" && <Form516n onBack={() => setStage("result")} />}
        {stage === "memo" && memoId && <Memo measure={MEASURES.find((m) => m.id === memoId)!} onBack={() => setStage("result")} />}
      </main>
      <footer className="foot">
        Информационный помощник, не юридическая консультация и не орган власти. Данные остаются в вашем браузере и никуда не отправляются.
      </footer>
    </div>
  );
}

function Intro(p: { hasSaved: boolean; save: boolean; setSave: (v: boolean) => void; onStart: () => void; onResume: () => void }) {
  return (
    <section className="card">
      <h2>Что делает сервис</h2>
      <p>Вы отвечаете на несколько вопросов — сервис показывает, какие выплаты и льготы вам, вероятно, положены, какие документы собрать, куда подавать, и даёт прямые ссылки на оформление.</p>
      <ul>
        <li>Все расчёты — прямо в браузере. Ответы не отправляются на сервер.</li>
        <li>Сведения сверены с первоисточниками на 02.10.2026. Пункты с пометкой «уточнить» подтверждайте в СФР или соцзащите.</li>
        <li>Сервис ничего не подаёт за вас.</li>
      </ul>
      <label className="check">
        <input type="checkbox" checked={p.save} onChange={(e) => p.setSave(e.target.checked)} />
        Запомнить ответы на этом устройстве (по умолчанию не сохраняются)
      </label>
      <div className="row">
        <button className="primary" onClick={p.onStart}>Начать</button>
        {p.hasSaved && <button onClick={p.onResume}>Продолжить с сохранёнными ответами</button>}
      </div>
    </section>
  );
}

function Ask(p: { answers: Answers; setAnswers: (a: Answers) => void; onDone: () => void; onCancel: () => void }) {
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

  return (
    <section className="card" aria-live="polite">
      <p className="progress">Вопрос {idx + 1} из {visible.length}</p>
      <progress max={visible.length} value={idx + 1} aria-hidden="true" />
      <h2 id="qtitle">{q.text}</h2>
      {q.help && <p className="help">{q.help}</p>}
      <div role="group" aria-labelledby="qtitle" className="options">
        {q.type === "bool" && (
          <>
            <button className={value === true ? "opt sel" : "opt"} aria-pressed={value === true} onClick={() => set(true)}>Да</button>
            <button className={value === false ? "opt sel" : "opt"} aria-pressed={value === false} onClick={() => set(false)}>Нет</button>
          </>
        )}
        {q.type === "choice" &&
          q.options!.map(([v, label]) => (
            <button key={v} className={value === v ? "opt sel" : "opt"} aria-pressed={value === v} onClick={() => set(v)}>{label}</button>
          ))}
        {q.type === "number" && (
          <input
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
      <div className="row">
        <button onClick={prev}>Назад</button>
        <button className="primary" disabled={!answered} onClick={next}>{isLast ? "Показать результат" : "Далее"}</button>
      </div>
    </section>
  );
}

type OpenForm = (kind: "form516n" | "memo", id: string) => void;

function Result({ answers, onBack, onRestart, onOpenForm }: { answers: Answers; onBack: () => void; onRestart: () => void; onOpenForm: OpenForm }) {
  const results = useMemo(() => evaluate(MEASURES, QUESTIONS, answers), [answers]);
  const g = groupByVerdict(results);
  const upcoming = results.filter((r) => r.nextDate && r.verdict !== "no");
  return (
    <section>
      <div className="row no-print">
        <button onClick={onBack}>Изменить ответы</button>
        <button className="primary" onClick={() => window.print()}>Печать / сохранить в PDF</button>
        <button onClick={onRestart}>Начать заново</button>
      </div>
      <p className="help">Дата подготовки: {new Date().toLocaleDateString("ru-RU")}. Сведения сверены с источниками 02.10.2026.</p>
      {upcoming.length > 0 && (
        <div className="card note">
          <h2>Ближайшие сроки</h2>
          <ul>{upcoming.map((r) => <li key={r.measure.id}><b>{r.nextDate!.date}</b> — {r.nextDate!.label} ({r.measure.title})</li>)}</ul>
        </div>
      )}
      {(["yes", "maybe", "later"] as Verdict[]).map((v) =>
        g[v].length ? (
          <div key={v}>
            <h2 className={`verdict ${v}`}>{VERDICT_TITLE[v]} ({g[v].length})</h2>
            {g[v].map((r) => <MeasureCard key={r.measure.id} r={r} open={v === "yes"} onOpenForm={onOpenForm} />)}
          </div>
        ) : null,
      )}
      {g.no.length > 0 && (
        <details className="card">
          <summary><h2 className="verdict no">{VERDICT_TITLE.no} ({g.no.length})</h2></summary>
          <ul>{g.no.map((r) => <li key={r.measure.id}><b>{r.measure.title}</b> — {r.reason}</li>)}</ul>
        </details>
      )}
    </section>
  );
}

function MeasureCard({ r, open, onOpenForm }: { r: MeasureResult; open: boolean; onOpenForm: OpenForm }) {
  const m = r.measure;
  const [grp] = [GROUP_TITLE[m.group]];
  return (
    <details className="card measure" open={open}>
      <summary>
        <span className="mtitle">{m.title}</span>
        <span className="grp">{grp}</span>
        {m.status === "check" && <span className="badge" title="Часть условий не подтверждена первоисточником">уточнить</span>}
      </summary>
      <p className="reason">{r.reason}</p>
      <p>{m.summary}</p>
      <p><b>Куда обращаться:</b> {m.authority}</p>
      {m.apply.length > 0 && (
        <ul className="links">{m.apply.map((l) => <li key={l.url}><a href={l.url} target="_blank" rel="noreferrer noopener">{l.label}</a></li>)}</ul>
      )}
      {m.forms && (
        <div className="row no-print">
          {m.forms.map((f) => <button key={f.kind} onClick={() => onOpenForm(f.kind, m.id)}>{f.label}</button>)}
        </div>
      )}
      {r.documents.length > 0 && (
        <>
          <h3>Документы</h3>
          <ul className="docs">{r.documents.map((d) => <li key={d}><label><input type="checkbox" /> {d}</label></li>)}</ul>
        </>
      )}
      {m.documents.auto.length > 0 && (<><h3>Запрашивают сами</h3><ul>{m.documents.auto.map((d) => <li key={d}>{d}</li>)}</ul></>)}
      {m.deadlines.length > 0 && (<><h3>Сроки</h3><ul>{m.deadlines.map((d) => <li key={d}>{d}</li>)}</ul></>)}
      {m.tips.length > 0 && (<><h3>Важно</h3><ul>{m.tips.map((d) => <li key={d}>{d}</li>)}</ul></>)}
      <p className="src">Основание: {m.basis}. Проверено {m.checkedAt.split("-").reverse().join(".")}.</p>
    </details>
  );
}
