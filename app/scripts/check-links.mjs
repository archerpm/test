// Проверка ссылок из measures.json. Падает только на «мёртвых» адресах (404/410).
// Госсайты часто закрыты для зарубежных адресов и требуют вход — это предупреждения, а не ошибки.
import { readFileSync } from "node:fs";

// В GitHub Actions — аннотации; на сервере и в консоли — обычный текст.
function emit(level, title, msg) {
  if (process.env.GITHUB_ACTIONS) console.log(`::${level} title=${title}::${msg}`);
  else console.log(`${level === "error" ? "ОШИБКА" : "Предупреждение"} [${title}] ${msg}`);
}

const measures = JSON.parse(readFileSync(new URL("../src/data/measures.json", import.meta.url), "utf8"));
const urls = new Map();
for (const m of measures) {
  for (const l of m.apply ?? []) urls.set(l.url, [...(urls.get(l.url) ?? []), m.id]);
  if (m.form?.url) urls.set(m.form.url, [...(urls.get(m.form.url) ?? []), m.id]);
}

const AUTH_HOSTS = /esia|lk\.gosuslugi|login|auth/i;
async function check(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 25000);
  try {
    const res = await fetch(url, { redirect: "follow", signal: ctl.signal, headers: { "user-agent": "Mozilla/5.0 (compatible; link-check)" } });
    if (res.status === 404 || res.status === 410) return { kind: "dead", note: String(res.status) };
    if (res.status >= 500) return { kind: "warn", note: `сервер ответил ${res.status}` };
    if (res.status === 401 || res.status === 403 || res.status === 429) return { kind: "warn", note: `нужен вход или доступ ограничен (${res.status})` };
    if (AUTH_HOSTS.test(new URL(res.url).host + new URL(res.url).pathname)) return { kind: "warn", note: "перенаправляет на вход" };
    return { kind: "ok", note: String(res.status) };
  } catch (e) {
    return { kind: "warn", note: `не открылась (${e.name === "AbortError" ? "таймаут" : /CERT|SELF_SIGNED|LEAF/.test(e.cause?.code ?? "") ? `${e.cause.code}: сертификат российского УЦ, см. deploy/README.md` : [e.cause?.code, e.cause?.message].filter(Boolean).join(" ") || e.message})` };
  } finally {
    clearTimeout(t);
  }
}

const rows = [];
const queue = [...urls.keys()];
await Promise.all(Array.from({ length: 6 }, async () => {
  while (queue.length) {
    const u = queue.shift();
    rows.push({ url: u, ...(await check(u)) });
  }
}));

const dead = rows.filter((r) => r.kind === "dead");
const warn = rows.filter((r) => r.kind === "warn");
console.log(`Проверено ссылок: ${rows.length}. Работают: ${rows.filter((r) => r.kind === "ok").length}, предупреждений: ${warn.length}, нерабочих: ${dead.length}`);
for (const r of warn) emit("warning", "Ссылка", `${r.url} — ${r.note} (меры: ${[...new Set(urls.get(r.url))].join(", ")})`);
for (const r of dead) emit("error", "Мёртвая ссылка", `${r.url} — ${r.note} (меры: ${[...new Set(urls.get(r.url))].join(", ")})`);
process.exit(dead.length ? 1 : 0);
