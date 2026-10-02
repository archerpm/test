export interface Amount {
  value: string;
  validFrom: string;
  source: string;
}
export type AmountsFile = Record<string, Amount | { nextReview: string; note: string }> & { _meta: { nextReview: string; note: string } };

/** Подставляет {{ключ}} из amounts.json во все строки структуры. Неизвестный ключ — ошибка (ловится тестом). */
export function applyAmounts<T>(data: T, amounts: AmountsFile): T {
  const text = (s: string) =>
    s.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
      const a = amounts[key] as Amount | undefined;
      if (!a || key === "_meta") throw new Error(`Нет суммы «${key}» в amounts.json`);
      return a.value;
    });
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") return text(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(data) as T;
}
