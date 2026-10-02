import type { Measure } from "../types";

export default function Memo({ measure, onBack }: { measure: Measure; onBack: () => void }) {
  const f = measure.form!;
  return (
    <section>
      <div className="no-print row">
        <button onClick={onBack}>← К результату</button>
        <button className="primary" onClick={() => window.print()}>Печать / сохранить в PDF</button>
      </div>
      <article className="paper memo">
        <h2>Памятка подачи: {measure.title}</h2>
        <p><b>Где подавать:</b> {f.title}<br /><a href={f.url} target="_blank" rel="noreferrer noopener">{f.url}</a></p>
        <h3>Подготовьте данные для ввода</h3>
        <ul>{f.prepare.map((x) => <li key={x}>☐ {x}</li>)}</ul>
        <h3>Шаги формы</h3>
        <ol>{f.steps.map((x) => <li key={x}>{x}</li>)}</ol>
        <h3>Вложения</h3>
        <ul>{f.attachments.map((x) => <li key={x}>{x}</li>)}</ul>
        <h3>Важно</h3>
        <ul>{f.notes.map((x) => <li key={x}>{x}</li>)}</ul>
        <p className="src">Составлено по чтению формы {measure.checkedAt.split("-").reverse().join(".")}; формы и сроки могут измениться — сверяйтесь с экраном подачи. Заявление за вас сервис не подаёт. Основание: {measure.basis}.</p>
      </article>
    </section>
  );
}
