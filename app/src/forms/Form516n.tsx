import { useState } from "react";
import { build516n, type Form516nValues } from "./form516n";
import { EMBED } from "../env";
import { docToText } from "./form516n";

const today = () => new Date().toLocaleDateString("ru-RU");

export default function Form516n({ onBack }: { onBack: () => void }) {
  const [v, setV] = useState<Form516nValues>({
    employerAddressee: "", employee: "", mode: "months", dates: "", days: "", secondParent: "", sheets: "", date: today(),
  });
  const set = <K extends keyof Form516nValues>(k: K, val: Form516nValues[K]) => setV({ ...v, [k]: val });
  const d = build516n(v);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const text = docToText(d);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const sel = window.getSelection();
      const el = document.querySelector("article.paper");
      if (sel && el) { sel.removeAllRanges(); const r = document.createRange(); r.selectNodeContents(el); sel.addRange(r); }
    }
  };

  return (
    <section>
      <div className="no-print">
        <button onClick={onBack}>← К результату</button>
        <h2>Заявление о допвыходных (форма 516н)</h2>
        <p className="help">
          Заполните поля — справа/ниже получится готовое заявление работодателю. Данные остаются в браузере. Для сохранения в PDF нажмите «Печать» и выберите «Сохранить как PDF».
        </p>
        <div className="card fields">
          <label>Кому (должность руководителя, организация, ФИО руководителя)<textarea value={v.employerAddressee} onChange={(e) => set("employerAddressee", e.target.value)} rows={2} /></label>
          <label>От кого (должность, подразделение, ваши ФИО)<textarea value={v.employee} onChange={(e) => set("employee", e.target.value)} rows={2} /></label>
          <fieldset>
            <legend>Что просите</legend>
            <label className="check"><input type="radio" name="mode" checked={v.mode === "months"} onChange={() => set("mode", "months")} /> Дни в календарном месяце (месяцах)</label>
            <label className="check"><input type="radio" name="mode" checked={v.mode === "inRow"} onChange={() => set("mode", "inRow")} /> Подряд — накопленные неиспользованные дни в текущем году (до 24)</label>
          </fieldset>
          <label>Даты предоставления (например: 5, 12, 19, 26 октября 2026 г.)<input value={v.dates} onChange={(e) => set("dates", e.target.value)} /></label>
          <label>Всего дней<input inputMode="numeric" value={v.days} onChange={(e) => set("days", e.target.value)} /></label>
          <label>
            Сведения о втором родителе (опекуне, попечителе), из-за которых справка с его места работы не нужна
            <textarea value={v.secondParent} onChange={(e) => set("secondParent", e.target.value)} rows={3} placeholder="Например: второй родитель не работает; либо: второй родитель отсутствует (умер / сведения об отце в свидетельстве о рождении записаны со слов матери)" />
          </label>
          <p className="help">Если справка с места работы второго родителя прилагается, напишите об этом здесь. Формулировку при необходимости уточните в бухгалтерии/кадрах.</p>
          <label>Количество листов приложений<input inputMode="numeric" value={v.sheets} onChange={(e) => set("sheets", e.target.value)} /></label>
          <label>Дата заявления<input value={v.date} onChange={(e) => set("date", e.target.value)} /></label>
        </div>
        <div className="row">
          {!EMBED && <button className="primary" onClick={() => window.print()}>Печать / сохранить в PDF</button>}
          <button className={EMBED ? "primary" : ""} onClick={copy}>{copied ? "Скопировано" : "Скопировать текст заявления"}</button>
        </div>
        {EMBED && <p className="help">В пробной версии печать отключена: скопируйте текст и вставьте в документ. В полной версии заявление сохраняется в PDF.</p>}
      </div>

      <article className="paper" aria-label="Заявление по форме 516н">
        <p className="addr">{d.addressee}</p>
        <p className="addr">от {d.from}</p>
        <h3 className="center">{d.title[0]}</h3>
        <p className="center">{d.title[1]}</p>
        <p>{d.intro}</p>
        {d.options.map((o) => (
          <p key={o.label} className="opt516"><span className="box" aria-hidden="true">{o.checked ? "☒" : "☐"}</span> {o.label}</p>
        ))}
        <p>{d.dates}</p>
        <p className="cap">(дата (даты) предоставления дополнительных оплачиваемых выходных дней)</p>
        <p>{d.daysLine}</p>
        <p>{d.secondParentLead} {d.secondParent}</p>
        <p className="cap">(сведения, сообщаемые работником о втором родителе (опекуне, попечителе) ребенка-инвалида, в связи с которыми справка с места работы другого родителя (опекуна, попечителя) не требуется)</p>
        <p>{d.attachments}</p>
        <p>{d.confirm}</p>
        <p className="sign"><span>{d.date}</span><span>____________________</span></p>
        <p className="cap sign"><span>(дата заполнения заявления)</span><span>(подпись)</span></p>
        <p className="src">{d.source}</p>
      </article>
    </section>
  );
}
