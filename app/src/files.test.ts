import { readdirSync, statSync } from "node:fs";
import { extname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// На Windows и macOS файловая система не различает регистр букв: `Form.tsx` и `form.ts` там конфликтуют при импорте.
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n: string) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe("имена файлов", () => {
  it("в src нет файлов, совпадающих без учёта регистра и расширения", () => {
    const seen = new Map<string, string>();
    const clash: string[] = [];
    for (const f of walk(fileURLToPath(new URL("./", import.meta.url)))) {
      const key = join(f.slice(0, f.length - extname(f).length)).toLowerCase();
      if (/\.(json|css|d\.ts)$/.test(f) && !/\.(ts|tsx)$/.test(basename(f))) continue;
      const prev = seen.get(key);
      if (prev && prev !== f) clash.push(`${prev} ↔ ${f}`);
      seen.set(key, f);
    }
    expect(clash).toEqual([]);
  });
});
