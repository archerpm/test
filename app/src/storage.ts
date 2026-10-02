import type { Answers } from "./types";

export interface Saved {
  v: 1;
  answers: Answers;
  /** Отметки «сделано»/«собрано»: ключи вида plan:a4, doc:passport, mdoc:a3:текст */
  progress: Record<string, boolean>;
  savedAt: string;
}

export const STORE_KEY = "posobie-helper:v2";

export function serialize(answers: Answers, progress: Record<string, boolean>, now = new Date()): string {
  const s: Saved = { v: 1, answers, progress, savedAt: now.toISOString() };
  return JSON.stringify(s);
}

/** Разбирает сохранённый текст; при любой ошибке формата возвращает null. */
export function parseSaved(text: string): Saved | null {
  try {
    const o = JSON.parse(text.trim());
    if (!o || o.v !== 1 || typeof o.answers !== "object" || o.answers === null || Array.isArray(o.answers)) return null;
    const answers: Answers = {};
    for (const [k, v] of Object.entries(o.answers)) {
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") answers[k] = v;
    }
    const progress: Record<string, boolean> = {};
    if (o.progress && typeof o.progress === "object") {
      for (const [k, v] of Object.entries(o.progress)) if (typeof v === "boolean") progress[k] = v;
    }
    return { v: 1, answers, progress, savedAt: typeof o.savedAt === "string" ? o.savedAt : "" };
  } catch {
    return null;
  }
}

export function loadStored(): Saved | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? parseSaved(raw) : null;
  } catch {
    return null;
  }
}

export function persist(answers: Answers, progress: Record<string, boolean>): void {
  try {
    localStorage.setItem(STORE_KEY, serialize(answers, progress));
  } catch {
    /* без сохранения всё работает */
  }
}

/** Скачивает ответы и отметки файлом на устройство. */
export function downloadSaved(answers: Answers, progress: Record<string, boolean>): void {
  const url = URL.createObjectURL(new Blob([serialize(answers, progress)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `progress-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
