#!/usr/bin/env node
/* 지역 페이지 유사도 측정. 의존성 없이 Node 내장만 쓴다.
 *
 *   node sim.mjs                    전 상품 · 표본 40개씩
 *   node sim.mjs --sample 80        표본 수
 *   node sim.mjs --only kiosk       한 상품만 (교차는 그대로 전부)
 *   node sim.mjs --scope full       본문 대신 페이지 전체로 측정
 *
 * 지표: 한글 6-gram Dice 계수. 두 페이지에서 6글자 조각을 전부 뽑아
 * 겹치는 비율을 본다. 값이 낮을수록 서로 다른 글이다.
 * 측정 범위(기본 body)는 브레드크럼부터 푸터 직전까지 — 헤더·CSS·푸터 같은
 * 공용 껍데기를 빼고 실제로 쓴 문장만 비교한다. */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const argOf = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const SAMPLE = Number(argOf("--sample", 40));
const SCOPE = argOf("--scope", "body");          /* body | full | paras */
const ONLY = (argOf("--only", "") || "").split(",").map(x => x.trim()).filter(Boolean);
const LIMIT = Number(argOf("--limit", 20));      /* 경고선 (%) */
const WORKER = path.resolve(HERE, argOf("--file", "24payshop.js"));

const tmp = path.join(os.tmpdir(), `24ps-sim-${process.pid}.mjs`);
fs.writeFileSync(tmp, fs.readFileSync(WORKER, "utf8"));
const worker = (await import("file://" + tmp)).default;
fs.unlinkSync(tmp);

const ENV = {}, CTX = { waitUntil() {} };
const GET = async p => (await worker.fetch(new Request("https://24payshop.com" + p), ENV, CTX)).text();

const strip = h => h.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
/* body = 브레드크럼 ~ 푸터 직전. 공용 껍데기를 빼야 문장 차이가 그대로 보인다. */
const extract = {
  full:  h => strip(h),
  body:  h => { const b = h.split("<footer")[0]; const i = b.indexOf('<nav class="bc">'); return strip(i < 0 ? b : b.slice(i)); },
  paras: h => strip([...h.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map(m => m[1]).join(" ")),
}[SCOPE];
if (!extract) { console.error(`--scope 는 body|full|paras 중 하나여야 합니다 (받은 값: ${SCOPE})`); process.exit(1); }

/* 6-gram Dice. 공백을 지우고 6글자씩 밀며 잘라 집합으로 만든 뒤 겹침 비율을 본다. */
const N = 6;
const grams = s => { const x = s.replace(/\s+/g, ""); const S = new Set();
  for (let i = 0; i + N <= x.length; i++) S.add(x.slice(i, i + N)); return S; };
const dice = (A, B) => { let i = 0; for (const g of A) if (B.has(g)) i++; return 2 * i / (A.size + B.size); };

/* ── 표본 ─────────────────────────────────────────────────── */
const SM = await GET("/sitemap.xml");
const urls = [...SM.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => new URL(m[1]).pathname);
const paths = [...new Set(urls.map(p => p.split("/")[1]))]
  .filter(p => urls.some(u => new RegExp(`^/${p}/[^/]+$`).test(u)) && p !== "regions" && p !== "thumb");

const sets = {};
for (const pth of paths) {
  const all = urls.filter(u => new RegExp(`^/${pth}/[^/]+$`).test(u));
  const step = Math.max(1, Math.floor(all.length / SAMPLE));
  const take = [];
  for (let i = 0; i < all.length && take.length < SAMPLE; i += step) take.push(all[i]);
  sets[pth] = [];
  for (const p of take) sets[pth].push(grams(extract(await GET(p))));
}

const within = A => { let s = 0, n = 0;
  for (let i = 0; i < A.length; i++) for (let j = i + 1; j < A.length; j++) { s += dice(A[i], A[j]); n++; }
  return n ? s / n : 0; };
const across = (A, B) => { let s = 0, n = 0;
  for (const a of A) for (const b of B) { s += dice(a, b); n++; }
  return n ? s / n : 0; };

const pct = v => (v * 100).toFixed(1);
const rows = [];
for (const p of paths) if (!ONLY.length || ONLY.includes(p)) rows.push([`${p} 끼리`, within(sets[p])]);
for (let i = 0; i < paths.length; i++) for (let j = i + 1; j < paths.length; j++) {
  if (ONLY.length && !ONLY.includes(paths[i]) && !ONLY.includes(paths[j])) continue;
  rows.push([`${paths[i]} × ${paths[j]}`, across(sets[paths[i]], sets[paths[j]])]);
}

console.log("");
console.log(`유사도 — 한글 ${N}-gram Dice · 측정 범위 ${SCOPE} · 상품별 표본 ${Object.values(sets)[0].length}개`);
console.log("");
let over = 0;
for (const [label, v] of rows.sort((a, b) => b[1] - a[1])) {
  const bad = v * 100 > LIMIT; if (bad) over++;
  console.log(`  ${bad ? "⚠️" : "✅"} ${label.padEnd(34)} ${pct(v).padStart(5)} %`);
}
console.log("");
console.log(over ? `⚠️ ${LIMIT}% 초과 ${over}건 — 배포 전 확인 필요` : `전부 ${LIMIT}% 미만`);
process.exit(over ? 1 : 0);
