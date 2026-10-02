import { useEffect, useMemo, useState } from "react";
import measuresData from "./data/measures.json";
import questionsData from "./data/questions.json";
import { evaluate, groupByVerdict, visibleQuestions } from "./engine";
import Form516n from "./forms/Form516n";
import Memo from "./forms/Memo";
import { Calendar, Check, Chevron, Clock, Doc, External, Help, Info, Link, Lock, Minus, Shield } from "./Icons";
import type { Answers, Measure, MeasureResult, Question, Verdict } from "./types";

const MEASURES = measuresData as unknown as Measure[];
const QUESTIONS = questionsData as unknown as Question[];
import { EMBED } from "./env";

const STORE_KEY = "posobie-helper:v1";

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

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [stage]);

  const saved = useMemo(loadSaved, []);

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
        Информационный помощник: не юридическая консультация и не орган власти. Данные остаются в вашем браузере и никуда не отправляются. Сведения сверены с источниками 02.10.2026.
      </footer>
    </div>
  );
}

function Intro(p: { hasSaved: boolean; save: boolean; setSave: (v: boolean) => void; onStart: () => void; onResume: () => void }) {
  return (
    <section className="hero">
      <p className="eyebrow">Москва · ребёнок до 18 лет с инвалидностью</p>
      <h1>Что положено вашей семье и как это оформить</h1>
      <p className="lead">Ответьте на 15–20 коротких вопросов. Сервис покажет выплаты, льготы и налоговые вычеты, которые вам подходят, какие документы собрать, куда подавать и даст прямые ссылки на оформление.</p>
      <div className="row">
        <button className="btn primary big-btn" onClick={p.onStart}>Пройти опрос</button>
        {p.hasSaved && <button className="btn" onClick={p.onResume}>Продолжить с сохранёнными ответами</button>}
      </div>
      <label className="check">
        <input type="checkbox" checked={p.save} onChange={(e) => p.setSave(e.target.checked)} />
        <span>Запомнить ответы на этом устройстве. По умолчанию ничего не сохраняется.</span>
      </label>
      <ul className="facts">
        <li><span className="fi"><Doc /></span><div><b>29 мер поддержки</b><span>выплаты, льготы, налоги, отдых и лечение</span></div></li>
        <li><span className="fi"><Link /></span><div><b>Ссылки на подачу</b><span>онлайн-формы mos.ru, Госуслуг и ФНС или описание процедуры</span></div></li>
        <li><span className="fi"><Lock /></span><div><b>Ответы остаются у вас</b><span>расчёт идёт в браузере, на сервер ничего не отправляется</span></div></li>
      </ul>
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
  const pct = Math.round(((idx + 1) / visible.length) * 100);

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
          <div>{q.help.split("\n").map((para) => <p key={para}>{para}</p>)}</div>
        </aside>
      )}
      <div className="actions">
        <button className="btn" onClick={prev}>Назад</button>
        <button className="btn primary" disabled={!answered} onClick={next}>{isLast ? "Показать результат" : "Далее"}</button>
      </div>
    </section>
  );
}

type OpenForm = (kind: "form516n" | "memo", id: string) => void;

function Result({ answers, onBack, onRestart, onOpenForm }: { answers: Answers; onBack: () => void; onRestart: () => void; onOpenForm: OpenForm }) {
  const results = useMemo(() => evaluate(MEASURES, QUESTIONS, answers), [answers]);
  const g = groupByVerdict(results);
  const order: Verdict[] = ["yes", "maybe", "later", "no"];
  const first = order.find((v) => g[v].length) ?? "yes";
  const [tab, setTab] = useState<Verdict>(first);
  const list = g[tab];
  const upcoming = results.filter((r) => r.nextDate && r.verdict !== "no");

  const toggleAll = (open: boolean) =>
    document.querySelectorAll<HTMLDetailsElement>("#list details.measure").forEach((d) => { d.open = open; });

  return (
    <section>
      <div className="res-head">
        <div>
          <p className="eyebrow">Результат на {new Date().toLocaleDateString("ru-RU")}</p>
          <h1>Что положено вашей семье</h1>
        </div>
        <div className="row no-print">
          <button className="btn" onClick={onBack}>Изменить ответы</button>
          {!EMBED && <button className="btn primary" onClick={() => window.print()}>Печать / PDF</button>}
          <button className="btn" onClick={onRestart}>Заново</button>
        </div>
      </div>
      {EMBED && <p className="demo no-print">Пробная версия: печать отключена. В полной версии (запуск на компьютере) результат сохраняется в PDF через «Печать».</p>}

      {upcoming.length > 0 && (
        <div className="deadlines">
          <h2><Calendar size={20} /> Ближайшие сроки</h2>
          <ul>{upcoming.map((r) => (
            <li key={r.measure.id}><time className="date">{r.nextDate!.date}</time><span>{r.nextDate!.label}<small>{r.measure.title}</small></span></li>
          ))}</ul>
        </div>
      )}

      <div className="tabs no-print" role="tablist" aria-label="Фильтр по результату">
        {order.map((v) => (
          <button key={v} role="tab" id={`tab-${v}`} aria-selected={tab === v} aria-controls="list" className={`tab ${v}`} onClick={() => setTab(v)} disabled={!g[v].length}>
            <span className="tab-ico">{VERDICT_ICON[v]()}</span>
            <span className="tab-name">{TAB_TITLE[v]}</span>
            <span className="tab-n">{g[v].length}</span>
          </button>
        ))}
      </div>

      <div id="list" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        <div className="list-head">
          <h2 className={`verdict ${tab}`}>{VERDICT_TITLE[tab]}</h2>
          {tab !== "no" && list.length > 0 && (
            <span className="no-print">
              <button className="link-btn" onClick={() => toggleAll(true)}>Раскрыть все</button>
              <button className="link-btn" onClick={() => toggleAll(false)}>Свернуть</button>
            </span>
          )}
        </div>
        {tab === "no" ? (
          <ul className="no-list">{list.map((r) => <li key={r.measure.id}><b>{r.measure.title}</b><span>{r.reason}</span></li>)}</ul>
        ) : (
          GROUP_ORDER.map((grp) => {
            const items = list.filter((r) => r.measure.group === grp);
            return items.length ? (
              <div key={grp} className="group">
                <h3 className="group-title">{GROUP_TITLE[grp]}</h3>
                {items.map((r) => <MeasureCard key={r.measure.id} r={r} onOpenForm={onOpenForm} />)}
              </div>
            ) : null;
          })
        )}
        {list.length === 0 && <p className="empty">В этой группе мер нет.</p>}
      </div>
    </section>
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

function MeasureCard({ r, onOpenForm }: { r: MeasureResult; onOpenForm: OpenForm }) {
  const m = r.measure;
  return (
    <details className={`measure ${r.verdict}`}>
      <summary>
        <span className="status">{VERDICT_ICON[r.verdict]()}</span>
        <span className="sum">
          <span className="mtitle">{m.title}{m.status === "check" && <span className="badge" title="Часть условий не подтверждена первоисточником">уточнить</span>}</span>
          <span className="reason">{r.reason}</span>
        </span>
        <span className="chev"><Chevron size={20} /></span>
      </summary>
      <div className="mbody">
        <p>{m.summary}</p>
        <p className="who"><b>Куда обращаться:</b> {m.authority}</p>
        <Links links={m.apply} />
        {m.forms && (
          <div className="btns no-print">
            {m.forms.map((f) => <button key={f.kind} className="btn sm" onClick={() => onOpenForm(f.kind, m.id)}>{f.label}</button>)}
          </div>
        )}
        {r.documents.length > 0 && (
          <div className="sect">
            <h4>Документы</h4>
            <ul className="docs">{r.documents.map((d) => <li key={d}><label><input type="checkbox" /><span>{d}</span></label></li>)}</ul>
          </div>
        )}
        {m.documents.auto.length > 0 && (<div className="sect"><h4>Запрашивают сами</h4><ul className="plain">{m.documents.auto.map((d) => <li key={d}>{d}</li>)}</ul></div>)}
        {m.deadlines.length > 0 && (<div className="sect"><h4>Сроки</h4><ul className="plain">{m.deadlines.map((d) => <li key={d}>{d}</li>)}</ul></div>)}
        {m.tips.length > 0 && (<div className="callout"><h4>Важно</h4><ul className="plain">{m.tips.map((d) => <li key={d}>{d}</li>)}</ul></div>)}
        <p className="src">Основание: {m.basis}. Проверено {m.checkedAt.split("-").reverse().join(".")}.</p>
      </div>
    </details>
  );
}
