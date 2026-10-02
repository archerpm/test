/**
 * Заявление о предоставлении дополнительных оплачиваемых выходных дней одному из родителей
 * (опекуну, попечителю) для ухода за детьми-инвалидами.
 * Форма утверждена приказом Минтруда России от 19.06.2023 № 516н (рег. Минюста № 74825 от 17.08.2023;
 * действует с 01.09.2023 до 01.09.2029). Формулировки совпадают с текстом приказа.
 */
export interface Form516nValues {
  employerAddressee: string; // должность руководителя, наименование организации, ФИО руководителя
  employee: string; // должность, подразделение, ФИО работника
  mode: "months" | "inRow";
  dates: string; // дата (даты) предоставления
  days: string; // общее число дней
  secondParent: string; // сведения о втором родителе
  sheets: string; // количество листов приложений
  date: string; // дата заполнения
}

export const FORM516N_SOURCE = "Форма утверждена приказом Минтруда России от 19.06.2023 № 516н (действует до 01.09.2029).";

export const MODE_LABEL: Record<Form516nValues["mode"], string> = {
  months: "дополнительные оплачиваемые выходные дни для ухода за ребенком-инвалидом в календарном месяце (календарных месяцах)",
  inRow:
    "дополнительные оплачиваемые выходные дни для ухода за ребенком-инвалидом подряд в пределах общего количества неиспользованных дополнительных оплачиваемых выходных дней в текущем календарном году",
};

export interface Form516nDoc {
  addressee: string;
  from: string;
  title: string[];
  intro: string;
  options: { label: string; checked: boolean }[];
  dates: string;
  daysLine: string;
  secondParentLead: string;
  secondParent: string;
  attachments: string;
  confirm: string;
  date: string;
  source: string;
}

const blank = (v: string, n = 24) => (v.trim() ? v.trim() : "_".repeat(n));

export function build516n(v: Form516nValues): Form516nDoc {
  return {
    addressee: blank(v.employerAddressee, 40),
    from: blank(v.employee, 40),
    title: ["ЗАЯВЛЕНИЕ", "о предоставлении дополнительных оплачиваемых выходных дней одному из родителей (опекуну, попечителю) для ухода за детьми-инвалидами"],
    intro: "В соответствии со статьей 262 Трудового кодекса Российской Федерации прошу предоставить мне (сделать отметку в соответствующем квадрате):",
    options: (Object.keys(MODE_LABEL) as Form516nValues["mode"][]).map((k) => ({ label: MODE_LABEL[k], checked: v.mode === k })),
    dates: blank(v.dates, 30),
    daysLine: `в количестве ${blank(v.days, 4)} дней.`,
    secondParentLead: "Сообщаю, что",
    secondParent: blank(v.secondParent, 40),
    attachments: `Документы (копии документов), предусмотренные законодательством Российской Федерации для предоставления дополнительных оплачиваемых выходных дней для ухода за детьми-инвалидами, на ${blank(v.sheets, 4)} листах прилагаю.`,
    confirm: "Достоверность представленных мною сведений подтверждаю.",
    date: blank(v.date, 12),
    source: FORM516N_SOURCE,
  };
}

/** Текст заявления для копирования (без разметки). */
export function docToText(d: Form516nDoc): string {
  return [
    d.addressee,
    `от ${d.from}`,
    "",
    d.title[0],
    d.title[1],
    "",
    d.intro,
    ...d.options.map((o) => `${o.checked ? "[x]" : "[ ]"} ${o.label}`),
    d.dates,
    "(дата (даты) предоставления дополнительных оплачиваемых выходных дней)",
    d.daysLine,
    `${d.secondParentLead} ${d.secondParent}`,
    d.attachments,
    d.confirm,
    "",
    `${d.date}    ____________________`,
    "(дата заполнения заявления)    (подпись)",
  ].join("\n");
}
