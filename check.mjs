#!/usr/bin/env node
/* 배포 전 검사. 의존성 없이 Node 내장만 쓴다 (이 저장소엔 package.json 이 없다).
 *
 *   node check.mjs                 8개 항목 전부
 *   node check.mjs --only seo,색인  일부만
 *   node check.mjs --sample 120    지역 페이지 표본 수 (기본 40)
 *   node check.mjs -v              통과 항목까지 전부 출력
 *
 * 워커의 fetch() 를 직접 구동해서 실제로 배포될 응답을 본다.
 * 함수 하나하나를 부르지 않는 건, 라우팅까지 지나온 결과여야 의미가 있기 때문이다.
 * 종료 코드 0 = 통과, 1 = 실패 (GitHub Actions 에서 그대로 게이트로 쓴다). */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const argOf = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const VERBOSE = argv.includes("-v") || argv.includes("--verbose");
const SAMPLE = Number(argOf("--sample", 40));
const WORKER = path.resolve(HERE, argOf("--file", "24payshop.js"));
const ONLY = (argOf("--only", "") || "").split(",").map(x => x.trim()).filter(Boolean);

/* ── 결과 수집 ───────────────────────────────────────────────── */
const groups = [];
let cur = null;
const group = (id, title) => { cur = { id, title, pass: 0, fails: [], skipped: false }; groups.push(cur); };
const ok = msg => { cur.pass++; if (VERBOSE) console.log(`    ✓ ${msg}`); };
/* where 는 어디서 틀렸는지 (경로·지역명). 같은 원인이 수백 건 나와도 앞 3건만 보여준다. */
const fail = (msg, where = "") => cur.fails.push(where ? `${msg}  [${where}]` : msg);
const check = (cond, msg, where) => cond ? ok(msg) : fail(msg, where);

const wanted = id => !ONLY.length || ONLY.some(o => id.includes(o) || o.includes(id));

/* ── 워커 로드 ───────────────────────────────────────────────── */
if (!fs.existsSync(WORKER)) { console.error(`워커 파일이 없습니다: ${WORKER}`); process.exit(1); }

let worker = null, loadErr = null;
const tmp = path.join(os.tmpdir(), `24ps-check-${process.pid}.mjs`);
try {
  fs.writeFileSync(tmp, fs.readFileSync(WORKER, "utf8"));
  worker = (await import("file://" + tmp)).default;
} catch (e) { loadErr = e; }
finally { try { fs.unlinkSync(tmp); } catch {} }

/* env 스텁. 텔레그램 토큰을 비워두면 워커가 스스로 빠져나가므로 알림은 나가지 않는다.
   DB 는 prepare().bind().run() 만 흉내 내서, 워커가 무엇을 적으려 했는지만 모아둔다.
   실제 D1 에는 한 줄도 쓰지 않는다. */
let writes = [];
const DB = {
  prepare(sql) {
    const row = { sql, args: [] };
    return {
      bind(...args) { row.args = args; return this; },
      run() { writes.push(row); return Promise.resolve({ success: true, meta: {} }); },
      first() { writes.push(row); return Promise.resolve(null); },
      all() { writes.push(row); return Promise.resolve({ results: [] }); },
    };
  },
};
const insertsTo = t => writes.filter(w => new RegExp(`INSERT INTO ${t}\\b`, "i").test(w.sql));
const fresh = () => { writes = []; };

let waits = [];
const ENV = { DB };
const CTX = { waitUntil(p) { waits.push(Promise.resolve(p).catch(() => {})); } };
const GET = async (p, init = {}) => {
  const { ua, ...rest } = init;
  const headers = Object.assign({}, rest.headers, ua ? { "user-agent": ua } : {});
  const r = new Request(p.startsWith("http") ? p : "https://24payshop.com" + p, { ...rest, headers, redirect: "manual" });
  const res = await worker.fetch(r, ENV, CTX);
  await Promise.all(waits); waits = [];
  return res;
};
const body = async (p, init) => { const r = await GET(p, init); return { r, t: await r.text() }; };

/* ── 유틸 ────────────────────────────────────────────────────── */
const text = h => h.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const attr = (h, re) => { const m = h.match(re); return m ? m[1] : null; };
const ldBlocks = h => [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => m[1]);
/* 종성 유무. 워커의 hasJong 과 같은 규칙이어야 조사 검사가 맞는다. */
const hasJong = w => { const c = String(w).trim().slice(-1).charCodeAt(0);
  return c >= 0xac00 && c <= 0xd7a3 ? (c - 0xac00) % 28 !== 0 : /[1360-8lmnr]$/i.test(String(w).trim()); };

/* ── 상품별 검사 규칙 ────────────────────────────────────────
   상품을 추가하면 여기 한 줄만 늘리면 된다. secs 는 본문 섹션 수(제목 div/h2
   개수는 여기에 process·check·faq 3개가 더 붙는다), h2 는 그 상품의 시그니처
   h2 섹션 제목에 반드시 들어가야 하는 낱말이다. */
const PRODS = {
  "card-terminal": { name: "카드단말기", secs: 10, h2: "토스단말기", h2len: [400, 600],
                     faqMin: 8, extraFaq: { word: "토스", min: 2, max: 3 }, lead: "토스단말기" },
  "pos":           { name: "포스기",     secs: 10, h2: "토스단말기", h2len: [400, 600],
                     faqMin: 8, extraFaq: { word: "토스", min: 2, max: 3 }, lead: "토스단말기" },
  "kiosk":         { name: "키오스크",   secs:  9, h2: "메뉴",       h2len: [400, 800],
                     faqMin: 8, extraFaq: null,                              lead: "키오스크" },
  "table-order":   { name: "테이블오더", secs:  8, h2: "포스",       h2len: [380, 800],
                     faqMin: 8, extraFaq: null,                              lead: "테이블오더" },
  "vending":       { name: "자동판매기", secs:  9, h2: "재고",       h2len: [380, 800],
                     faqMin: 8, extraFaq: null,                              lead: "자동판매기" },
};
const PATHS = Object.keys(PRODS);
const PROD_RE = new RegExp(`^/(${PATHS.join("|")})/[^/]+$`);
const prodOf = p => PRODS[p.split("/")[1]];
const reEsc = x => String(x).replace(/[.*+?^${}()|[\]\\]/g, m => "\\" + m);
/* 제목 핵심어 검사용 지역명({R}).
   워커가 푸터에 "＝＝＝ 24PAYSHOP · {시도 구군} {동} ＝＝＝" 를 찍으므로 거기서 마지막
   토큰을 가져온다. 못 뽑으면 절대 안 맞는 토큰을 줘서 조용히 통과하지 않게 한다. */
const regionOfHtml = h => {
  const m = h.match(/24PAYSHOP · ([^＝<]+?)\s*＝/);
  if (!m) return "\u0000";
  const t = m[1].trim().split(/\s+/);
  return t[t.length - 1] || "\u0000";
};

/* ── 표본 수집: 사이트맵에서 실제 URL 을 가져온다 ───────────── */
let SM = "", urls = [], regionPaths = [];
if (worker) {
  SM = (await body("/sitemap.xml")).t;
  urls = [...SM.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  /* 상품마다 같은 수씩 뽑는다. 한 상품이 표본을 독차지하면 나머지가 안 걸린다. */
  const per = Math.max(1, Math.floor(SAMPLE / PATHS.length));
  for (const pth of PATHS) {
    const all = urls.map(u => new URL(u).pathname)
      .filter(p => p.startsWith(`/${pth}/`) && PROD_RE.test(p) && !p.endsWith("/sido"));
    const step = Math.max(1, Math.floor(all.length / per));
    let n = 0;
    for (let i = 0; i < all.length && n < per; i += step) { regionPaths.push(all[i]); n++; }
  }
}
/* 사이트맵이 죽으면 이후 검사가 전부 무의미해진다. 조용히 0건 통과로
   지나가지 않도록 여기서 끊는다. */
if (worker && !regionPaths.length) {
  group("표본", "0. 표본 수집");
  fail("사이트맵에서 지역 페이지 URL 을 얻지 못함", `/sitemap.xml → ${urls.length} URL`);
}

/* 지역 페이지를 한 번만 받아서 4~8번 항목이 같이 쓴다 */
const pages = [];
for (const p of regionPaths) { const { r, t } = await body(p); pages.push({ p, status: r.status, html: t }); }

/* ══ 1. 문법 ═══════════════════════════════════════════════════ */
if (wanted("문법")) {
  group("문법", "1. 문법");
  const { stderr } = await promisify(execFile)("node", ["--check", WORKER]).catch(e => e);
  check(!stderr, `node --check ${path.basename(WORKER)}`, stderr && String(stderr).split("\n")[0]);
  check(!loadErr, "ES 모듈로 로드", loadErr && loadErr.message);
  if (worker) {
    check(typeof worker.fetch === "function", "export default.fetch 존재");
    check(typeof worker.scheduled === "function", "export default.scheduled 존재 (cron)");
  }
  /* wrangler.toml 의 main 이 실제 파일을 가리키는지 */
  const wt = path.join(HERE, "wrangler.toml");
  if (fs.existsSync(wt)) {
    const s = fs.readFileSync(wt, "utf8");
    const main = attr(s, /^\s*main\s*=\s*"([^"]+)"/m);
    check(main && fs.existsSync(path.join(HERE, main)), `wrangler.toml main 파일 존재 (${main})`);
  }
}

/* ══ 2. 라우트 ═════════════════════════════════════════════════ */
if (wanted("라우트") && worker) {
  group("라우트", "2. 라우트");
  const must = [
    ["/", "text/html"], ["/list", "text/html"], ["/regions", "text/html"],
    ...PATHS.map(p => [`/${p}`, "text/html"]),
    ["/robots.txt", "text/plain"], ["/llms.txt", "text/plain"],
    ["/sitemap.xml", "xml"], ["/rss.xml", "xml"], ["/rss", "xml"], ["/feed", "xml"],
    ["/atom.xml", "xml"], ["/atom", "xml"],
    ["/favicon.ico", "image/x-icon"], ["/favicon.svg", "image/svg"],
    ["/apple-touch-icon.png", "image/png"], ["/og.svg", "image/svg"],
    ...PATHS.map(p => [`/${p}/sido/seoul`, "text/html"]),
  ];
  for (const [p, ct] of must) {
    const r = await GET(p);
    if (r.status !== 200) { fail(`200 응답`, `${p} → ${r.status}`); continue; }
    const got = r.headers.get("content-type") || "";
    check(got.includes(ct), `200 + content-type`, got.includes(ct) ? "" : `${p} → ${got}`);
  }
  for (const { p, status } of pages) if (status !== 200) fail("지역 페이지 200", `${p} → ${status}`);
  if (pages.every(x => x.status === 200)) ok(`지역 페이지 ${pages.length}개 전부 200`);

  const thumb = await GET("/thumb/kiosk/" + (regionPaths[0] || "/x/seoul").split("/").pop() + ".svg");
  check(thumb.status === 200, "/thumb/:type/:slug.svg 200", `→ ${thumb.status}`);

  const nf = await GET("/이런건-없다");
  check(nf.status === 404, "없는 경로 404", `→ ${nf.status}`);
  const slash = await GET(regionPaths[0] + "/");
  check(slash.status === 200, "끝 슬래시 정규화", `→ ${slash.status}`);
  const ins = await GET("/indexnow-submit");
  check(ins.status === 403, "/indexnow-submit 키 없이 403", `→ ${ins.status}`);
  /* 목록 → 상세 링크가 죽어 있지 않은지 (시·도 색인에서 뽑아 확인) */
  for (const pth of PATHS) {
    const sido = (await body(`/${pth}/sido/seoul`)).t;
    const links = [...sido.matchAll(new RegExp(`href="(/${pth}/[^"#]+)"`, "g"))].map(m => m[1]).slice(0, 6);
    let dead = 0;
    for (const l of links) if ((await GET(l)).status !== 200) { dead++; fail("색인 링크가 404", l); }
    if (!dead && links.length) ok(`/${pth} 시·도 색인 내부 링크 ${links.length}개 정상`);
  }
}

/* ══ 3. 한국어 ═════════════════════════════════════════════════ */
if (wanted("한국어") && pages.length) {
  group("한국어", "3. 한국어");
  const PH = /\{(?:R|LOC|P|PE)\}|NEWDOMAIN|undefined|NaN/;
  const JOSA = [["은", "는"], ["이", "가"], ["을", "를"], ["과", "와"], ["으로", "로"]];
  let ph = 0, broken = 0, dbl = 0, josaBad = 0, tailBad = 0;
  for (const { p, html } of pages) {
    const t = text(html);
    if (PH.test(t)) { if (++ph <= 3) fail("미치환 플레이스홀더/undefined", `${p} … ${t.match(PH)[0]}`); }
    if (t.includes("�")) { if (++broken <= 3) fail("깨진 문자(U+FFFD)", p); }
    if (/ {2,}/.test(html.replace(/\n/g, ""))) { /* HTML 정렬 공백은 무해하므로 본문만 본다 */ }
    if (/\s[.,!?]|[가-힣] {2,}[가-힣]/.test(t)) { if (++dbl <= 3) fail("공백/구두점 이상", p); }

    /* 조사: 워커가 fixJosa 로 붙이는 지점만 본다. 지역명·상품명 뒤 조사가
       앞 음절 종성과 맞는지 확인한다. 뒤에 한글이 이어지면 단어 일부일 수
       있으므로 건너뛴다 (예: "가경동로터리"). */
    const ld = ldBlocks(html).map(b => { try { return JSON.parse(b); } catch { return null; } }).filter(Boolean);
    const g = ld.flatMap(x => x["@graph"] || [x]);
    const bc = g.find(x => x["@type"] === "BreadcrumbList");
    const svc = g.find(x => x["@type"] === "Service");
    const names = [svc?.areaServed, bc?.itemListElement?.at(-1)?.name].filter(Boolean);
    for (const nm of names) for (const [withJ, without] of JOSA) {
      const want = hasJong(nm) ? withJ : without, wrong = hasJong(nm) ? without : withJ;
      const re = new RegExp(nm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + wrong + "(?![가-힣])", "g");
      const hit = t.match(re);
      if (hit) { if (++josaBad <= 3) fail(`조사 오류 (…${nm}${wrong} → ${nm}${want})`, p); }
    }
    /* 문단이 문장으로 끝나는지 */
    const ps = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map(m => text(m[1])).filter(x => x.length > 20);
    if (ps.some(x => !/[.!?…”"]$/.test(x))) { if (++tailBad <= 3) fail("문단이 문장부호로 끝나지 않음", p); }
  }
  if (!ph) ok(`미치환 플레이스홀더 없음 (${pages.length}p)`);
  if (!broken) ok("깨진 문자 없음");
  if (!dbl) ok("공백·구두점 정상");
  if (!josaBad) ok("지역명·상품명 뒤 조사 정상");
  if (!tailBad) ok("문단 끝 문장부호 정상");
}

/* ══ 4. 콘텐츠 ═════════════════════════════════════════════════ */
if (wanted("콘텐츠") && pages.length) {
  group("콘텐츠", "4. 콘텐츠");
  let thin = [], secBad = [], tossBad = [], faqBad = [], dupBad = [], linkBad = [];
  for (const { p, html } of pages) {
    const D = prodOf(p);
    const len = text(html).length;
    if (len < 2500) thin.push(`${p} ${len}자`);

    const heads = (html.match(/class="sh (?:green|blue|amber|purple|red)"/g) || []).length;
    if (heads < D.secs + 6) secBad.push(`${p} 섹션 ${heads}개 (${D.secs + 6}개 필요)`);   /* +fit +unfit +costvar +process +faq +check */

    /* 섹션 제목은 전부 h2 다(8단계). 개수·질문형·핵심어를 같이 본다.
       시그니처 섹션은 그중 D.h2 낱말이 든 하나이며 본문 길이 범위가 따로 있다. */
    const blocks = html.split(/(?=<h2 class="sh)/).filter(x => x.startsWith('<h2 class="sh'));
    const h2 = blocks.map(b => { const m = b.match(/^<h2 class="sh[^"]*"><span>([\s\S]*?)<\/span><\/h2>/); return m ? text(m[1]) : ""; });
    /* 고정 섹션 6개: fit · unfit · costvar · process · faq · check (9단계) */
    if (h2.length !== D.secs + 6)
      tossBad.push(`${p} h2 ${h2.length}개 (${D.secs + 6}개 필요)`);
    const notQ = h2.filter(x => !/[?？]/.test(x));
    if (notQ.length) tossBad.push(`${p} 비질문형 제목 ${notQ.length}개 "${notQ[0]}"`);
    const RG = regionOfHtml(html);
    const noKw = h2.filter(x => !new RegExp(`${reEsc(D.name)}|${reEsc(RG)}`).test(x));
    if (noKw.length) tossBad.push(`${p} 핵심어 없는 제목 ${noKw.length}개 "${noKw[0]}"`);
    const sigIdx = h2.findIndex(x => x.includes(D.h2));
    let tlen = 0;
    if (sigIdx >= 0) {
      const after = blocks[sigIdx].replace(/^<h2[\s\S]*?<\/h2>/, "");
      const pm = after.match(/^((?:<p>[\s\S]*?<\/p>)+)/);
      tlen = pm ? text(pm[1]).length : 0;
    }
    if (sigIdx < 0 || tlen < D.h2len[0] || tlen > D.h2len[1])
      tossBad.push(`${p} 시그니처 "${D.h2}" ${sigIdx < 0 ? "없음" : "본문 " + tlen + "자"}`);

    const qs = [...html.matchAll(/<div class="q">[\s\S]*?<\/div>/g)].map(m => text(m[0]));
    if (qs.length < D.faqMin) faqBad.push(`${p} FAQ ${qs.length}개 (${D.faqMin}개 필요)`);
    if (D.extraFaq) {
      const tq = qs.filter(q => q.includes(D.extraFaq.word)).length;
      if (tq < D.extraFaq.min || tq > D.extraFaq.max) faqBad.push(`${p} ${D.extraFaq.word} 문답 ${tq}개`);
    }

    /* 같은 페이지에서 문단이 그대로 반복되면 풀 추출이 깨진 것이다 */
    const ps = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map(m => text(m[1])).filter(x => x.length > 40);
    if (new Set(ps).size !== ps.length) dupBad.push(p);

    const rl = (html.match(new RegExp(`<a href="/(?:${PATHS.join("|")})/[^"]+"`, "g")) || []).length;
    if (rl < 12) linkBad.push(`${p} 내부링크 ${rl}개`);
  }
  const rep = (arr, msg) => arr.length ? arr.slice(0, 3).forEach(w => fail(msg, w)) : ok(`${msg} (${pages.length}p)`);
  rep(thin, "본문 2,500자 이상");
  rep(secBad, "상품별 섹션 수 충족");
  rep(tossBad, "시그니처 h2 1개 + 본문 길이");
  rep(faqBad, "상품별 FAQ 개수 충족");
  rep(dupBad, "페이지 내 문단 중복 없음");
  rep(linkBad, "지역 내부링크 12개 이상");
}

/* ══ 5. SEO ════════════════════════════════════════════════════ */
if (wanted("seo") || wanted("SEO")) {
  group("SEO", "5. SEO");
  const titles = new Map();
  let tl = [], dl = [], can = [], h1 = [], og = [], lang = [], vp = [], toss = [], tossD = [], tossH = [], tossB = [];
  for (const { p, html } of pages) {
    const t = attr(html, /<title>([\s\S]*?)<\/title>/);
    const d = attr(html, /<meta name="description" content="([^"]*)"/);
    const c = attr(html, /<link rel="canonical" href="([^"]*)"/);
    if (!t || t.length < 15 || t.length > 70) tl.push(`${p} ${t ? t.length + "자" : "없음"}`);
    if (!d || d.length < 50 || d.length > 160) dl.push(`${p} ${d ? d.length + "자" : "없음"}`);
    if (c !== "https://24payshop.com" + p) can.push(`${p} → ${c}`);
    if ((html.match(/<h1[\s>]/g) || []).length !== 1) h1.push(p);
    for (const k of ["og:title", "og:description", "og:image", "og:url", "og:site_name"])
      if (!html.includes(`property="${k}"`)) og.push(`${p} ${k}`);
    if (!html.includes('name="twitter:card"')) og.push(`${p} twitter:card`);
    if (!/<html lang="ko">/.test(html)) lang.push(p);
    if (!/name="viewport"/.test(html)) vp.push(p);
    /* 그냥 "포함" 만 보면 상품명 뒤로 밀려도 통과한다. 지역명 바로 뒤에
       와야 하므로 시작 문자열로 확인한다. LOC 은 브레드크럼 마지막 항목. */
    const g2 = ldBlocks(html).flatMap(b => { try { const j = JSON.parse(b); return j["@graph"] || [j]; } catch { return []; } });
    const LOC = g2.find(x => x["@type"] === "BreadcrumbList")?.itemListElement?.at(-1)?.name;
    if (!LOC) toss.push(`${p} 브레드크럼에서 지역명을 못 얻음`);
    else {
      const LEAD = prodOf(p).lead;
      if (!t || !t.startsWith(`${LOC} ${LEAD}`)) toss.push(`${p} title="${t?.slice(0, 40)}…"`);
      if (!d || !d.startsWith(`${LOC} ${LEAD}`)) tossD.push(`${p} desc="${d?.slice(0, 40)}…"`);
      /* 화면 큰 제목과 히어로 배지. title 만 고치고 화면을 안 고치는 실수가
         쉬워서 따로 본다. h1 안엔 <br> 이 있으니 태그를 벗겨 비교한다. */
      const h1t = text(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] || "");
      if (!h1t.startsWith(`${LOC} ${LEAD}`)) tossH.push(`${p} h1="${h1t.slice(0, 40)}…"`);
      const badge = text(html.match(/<span class="tag">([\s\S]*?)<\/span>/)?.[1] || "");
      if (!badge.includes(LEAD)) tossB.push(`${p} badge="${badge.slice(0, 40)}…"`);
    }
    if (t) titles.set(t, (titles.get(t) || 0) + 1);
  }
  const rep = (arr, msg) => arr.length ? arr.slice(0, 3).forEach(w => fail(msg, w)) : ok(`${msg} (${pages.length}p)`);
  rep(tl, "title 15~70자");
  rep(dl, "meta description 50~160자");
  rep(can, "canonical 이 자기 경로와 일치");
  rep(h1, "h1 정확히 1개");
  rep(og, "og:* + twitter:card 완비");
  rep(lang, 'html lang="ko"');
  rep(vp, "viewport 메타");
  rep(toss, "title 이 '지역명 + 상품 대표어' 로 시작");
  rep(tossD, "meta description 이 '지역명 + 상품 대표어' 로 시작");
  rep(tossH, "h1 이 '지역명 + 상품 대표어' 로 시작");
  rep(tossB, "히어로 배지에 상품 대표어 포함");
  const dup = [...titles].filter(([, n]) => n > 1);
  dup.length ? dup.slice(0, 3).forEach(([t, n]) => fail("title 중복", `${n}회 "${t}"`)) : ok("title 표본 내 중복 없음");
}

/* ══ 6. 구조화데이터 ═══════════════════════════════════════════ */
if (wanted("구조화데이터") && pages.length) {
  group("구조화데이터", "6. 구조화데이터");
  let bad = [], miss = [], faqMis = [], empty = [];
  for (const { p, html } of pages) {
    const blocks = ldBlocks(html);
    if (!blocks.length) { miss.push(`${p} ld+json 없음`); continue; }
    let g = [];
    for (const b of blocks) {
      try { const j = JSON.parse(b); if (!j["@context"]) bad.push(`${p} @context 없음`); g = g.concat(j["@graph"] || [j]); }
      catch (e) { bad.push(`${p} JSON 파싱 실패: ${e.message.slice(0, 40)}`); }
    }
    for (const ty of ["BreadcrumbList", "Service", "FAQPage"])
      if (!g.some(x => x["@type"] === ty)) miss.push(`${p} ${ty}`);
    const f = g.find(x => x["@type"] === "FAQPage");
    if (f) {
      const n = (f.mainEntity || []).length;
      const shown = [...html.matchAll(/<div class="q">/g)].length;
      if (n !== shown) faqMis.push(`${p} JSON-LD ${n}개 vs 화면 ${shown}개`);
      if ((f.mainEntity || []).some(q => !q.name?.trim() || !q.acceptedAnswer?.text?.trim())) empty.push(p);
      const X = prodOf(p).extraFaq;
      if (X && !(f.mainEntity || []).some(q => q.name?.includes(X.word)))
        miss.push(`${p} FAQPage 에 ${X.word} 문답 없음`);
    }
    const bcl = g.find(x => x["@type"] === "BreadcrumbList");
    if (bcl && (bcl.itemListElement || []).some((it, i) => it.position !== i + 1))
      bad.push(`${p} BreadcrumbList position 순서`);
  }
  const rep = (arr, msg) => arr.length ? arr.slice(0, 3).forEach(w => fail(msg, w)) : ok(`${msg} (${pages.length}p)`);
  rep(bad, "JSON-LD 파싱·형식 정상");
  rep(miss, "BreadcrumbList·Service·FAQPage 존재");
  rep(faqMis, "FAQPage 개수 = 화면 FAQ 개수");
  rep(empty, "FAQ 질문·답변 비어있지 않음");
  /* 홈 */
  const home = (await body("/")).t;
  const hg = ldBlocks(home).flatMap(b => { try { const j = JSON.parse(b); return j["@graph"] || [j]; } catch { return []; } });
  for (const ty of ["Organization", "WebSite"])
    check(hg.some(x => x["@type"] === ty), `홈 ${ty} 스키마`);
}

/* ══ 7. 색인 ═══════════════════════════════════════════════════ */
if (wanted("색인") && worker) {
  group("색인", "7. 색인");
  const robots = (await body("/robots.txt")).t;
  check(/^Sitemap:\s*https?:\/\/\S+/mi.test(robots), "robots.txt 에 Sitemap 줄");
  /* Disallow: / 자체는 문제가 아니다 — SemrushBot·AhrefsBot 같은 SEO 크롤러는
     일부러 막아두고 있다. 검색엔진 블록에만 걸리면 사고다. */
  const blocks = new Map();          /* user-agent(소문자) → 지시문 배열 */
  let uas = [];
  for (const line of robots.split(/\r?\n/)) {
    const ua = line.match(/^\s*User-agent:\s*(\S+)/i);
    const di = line.match(/^\s*(Disallow|Allow):\s*(\S*)/i);
    if (ua) { const v = ua[1].toLowerCase(); if (!blocks.has(v)) blocks.set(v, []); uas.push(v); }
    else if (di && uas.length) { for (const u of uas) blocks.get(u).push(`${di[1].toLowerCase()} ${di[2]}`); }
    else if (!line.trim()) uas = [];
  }
  const SEARCH = ["*", "googlebot", "bingbot", "yeti", "daumoa"];
  const blocked = SEARCH.filter(u => (blocks.get(u) || []).includes("disallow /"));
  check(!blocked.length, "검색엔진이 차단되지 않음", blocked.join(", "));
  check((blocks.get("*") || []).some(d => d.startsWith("allow")), "robots.txt User-agent:* Allow 존재");
  const scrapers = [...blocks].filter(([, d]) => d.includes("disallow /")).map(([u]) => u);
  ok(`SEO 크롤러 ${scrapers.length}종 차단 (의도된 설정)`);

  check(urls.length > 0, `사이트맵 URL ${urls.length}개`);
  check(urls.every(u => u.startsWith("https://24payshop.com/")), "사이트맵 loc 전부 절대 URL");
  check(new Set(urls).size === urls.length, "사이트맵 URL 중복 없음");
  check(!/&(?!amp;|lt;|gt;|quot;|apos;|#)/.test(SM), "사이트맵 & 이스케이프");
  check(/<lastmod>/.test(SM), "사이트맵 lastmod 존재");
  /* 사이트맵에 올린 URL 이 실제로 200 인지 (표본) */
  let dead = 0;
  for (const u of urls.filter((_, i) => i % Math.ceil(urls.length / 25) === 0)) {
    if ((await GET(new URL(u).pathname)).status !== 200) { dead++; fail("사이트맵 URL 이 200 아님", u); }
  }
  if (!dead) ok("사이트맵 표본 URL 전부 200");

  let noidx = pages.filter(x => /noindex/i.test(x.html));
  check(!noidx.length, "지역 페이지에 noindex 없음", noidx[0]?.p);
  check(!/noindex/i.test((await body("/")).t), "홈에 noindex 없음");

  const llms = (await body("/llms.txt")).t;
  check(llms.length > 300 && llms.includes("24payshop"), `llms.txt 내용 존재 (${llms.length}자)`);
  for (const f of ["/rss.xml", "/atom.xml"]) {
    const x = (await body(f)).t;
    check(/^<\?xml/.test(x.trim()), `${f} XML 선언`);
    check(!/&(?!amp;|lt;|gt;|quot;|apos;|#)/.test(x), `${f} & 이스케이프`);
    check((x.match(/<item[\s>]|<entry[\s>]/g) || []).length > 0, `${f} 항목 존재`);
  }
}

/* ══ 8. 전환추적 ═══════════════════════════════════════════════ */
if (wanted("전환추적") && worker) {
  group("전환추적", "8. 전환추적");
  const src = fs.readFileSync(WORKER, "utf8");
  const TELRAW = attr(src, /const TELRAW\s*=\s*"([^"]+)"/);
  const TEL = attr(src, /const TEL\s*=\s*"([^"]+)"/);
  check(!!TELRAW && !!TEL, `전화번호 상수 (${TEL} / ${TELRAW})`);
  check(TEL && TELRAW === TEL.replace(/-/g, ""), "TEL 과 TELRAW 표기 일치");

  let telBad = [], smsBad = [], beacon = [], bar = [];
  for (const { p, html } of pages) {
    /* includes 로 "하나라도 있으면 통과" 하면 안 된다. 링크가 여러 개인데
       그중 하나만 다른 번호로 새면 그쪽 전환이 통째로 안 잡힌다. */
    const hrefs = [...html.matchAll(/href="(tel|sms):([^"]*)"/g)];
    const tels = hrefs.filter(m => m[1] === "tel"), smss = hrefs.filter(m => m[1] === "sms");
    if (!tels.length) telBad.push(`${p} tel: 링크 없음`);
    else { const w = tels.find(m => m[2] !== TELRAW); if (w) telBad.push(`${p} tel:${w[2]}`); }
    if (!smss.length) smsBad.push(`${p} sms: 링크 없음`);
    else { const w = smss.find(m => m[2] !== TELRAW); if (w) smsBad.push(`${p} sms:${w[2]}`); }
    if (!html.includes('"/api/track"')) beacon.push(p);
    if (!html.includes('class="callbar"')) bar.push(p);
    /* 화면에 보이는 번호가 상수와 다르면 추적이 어긋난다 */
    const shown = [...text(html).matchAll(/01[016-9][-\s]?\d{3,4}[-\s]?\d{4}/g)].map(m => m[0].replace(/[-\s]/g, ""));
    if (shown.some(n => n !== TELRAW)) telBad.push(`${p} 다른 번호 노출: ${shown.find(n => n !== TELRAW)}`);
  }
  const rep = (arr, msg) => arr.length ? arr.slice(0, 3).forEach(w => fail(msg, w)) : ok(`${msg} (${pages.length}p)`);
  rep(telBad, "tel: 링크 + 번호 일치");
  rep(smsBad, "sms: 링크 존재");
  rep(beacon, "/api/track 비컨 스크립트 삽입");
  rep(bar, "하단 통화바(callbar) 존재");

  /* 엔드포인트가 실제로 받는지. env 에 DB 가 없으니 기록은 건너뛰고 ok 만 돌려준다. */
  for (const ty of ["view", "tel", "sms", "contact"]) {
    const { r, t } = await body("/api/track", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: ty, page: regionPaths[0] || "/", ref: "", b: "테스트" }),
    });
    let j = null; try { j = JSON.parse(t); } catch {}
    check(r.status === 200 && j?.ok === true, `POST /api/track type=${ty}`, `→ ${r.status} ${t.slice(0, 40)}`);
  }
  /* 홈은 shell() 이 아니라 HOME_HTML 이라 비컨·전화번호가 별도 사본이다.
     지역 페이지만 보면 홈이 깨진 걸 놓친다. */
  const homeH = (await body("/")).t;
  check(homeH.includes('"/api/track"'), "홈 /api/track 비컨 삽입");
  const hh = [...homeH.matchAll(/href="(tel|sms):([^"]*)"/g)];
  check(hh.length > 0, "홈 tel:/sms: 링크 존재");
  const hw = hh.find(m => m[2] !== TELRAW);
  check(!hw, "홈 전화번호 일치", hw && `${hw[1]}:${hw[2]}`);

  const pre = await GET("/api/track", { method: "OPTIONS" });
  check(pre.headers.get("access-control-allow-origin") === "*", "OPTIONS /api/track CORS 허용");
  check((pre.headers.get("access-control-allow-methods") || "").includes("POST"), "CORS POST 허용");
}

/* ══ 9. 슬러그 ═════════════════════════════════════════════════ */
if (wanted("슬러그") && worker) {
  group("슬러그", "9. 슬러그·URL");
  const src = fs.readFileSync(WORKER, "utf8");

  /* 사이트맵과 내부 링크에 한글이 남아 있으면 색인이 갈린다 */
  const nonAscii = urls.filter(u => /[^\x00-\x7F]/.test(u));
  check(!nonAscii.length, "사이트맵 URL 전부 ASCII", nonAscii.slice(0, 2).join(", "));
  let koLink = [];
  for (const { p, html } of pages) {
    const hrefs = [...html.matchAll(/href="(\/[^"#]*)"/g)].map(m => m[1]);
    const ko = hrefs.filter(h => /[\uac00-\ud7a3]/.test(h));
    if (ko.length) koLink.push(`${p} → ${ko[0]}`);
  }
  check(!koLink.length, `내부 링크에 한글 경로 없음 (${pages.length}p)`, koLink.slice(0, 2).join(", "));
  const koCanon = pages.filter(x => /[\uac00-\ud7a3]/.test(attr(x.html, /<link rel="canonical" href="([^"]*)"/) || ""));
  check(!koCanon.length, "canonical 전부 ASCII", koCanon[0]?.p);

  /* 슬러그 중복 0건. 지역 하나가 다른 지역 슬러그에 먹히면 그 페이지가 통째로 사라진다.
     제품마다 같은 슬러그 집합이 나와야 하고, 그 안에 중복이 없어야 한다. */
  const sets = {};
  for (const pth of PATHS) {
    sets[pth] = urls.map(u => new URL(u).pathname)
      .filter(p => new RegExp(`^/${pth}/[^/]+$`).test(p) && !p.endsWith("/sido"))
      .map(p => p.split("/").pop());
  }
  let dupTotal = 0;
  for (const pth of PATHS) {
    const a = sets[pth], uniq = new Set(a);
    const dups = a.filter((x, i) => a.indexOf(x) !== i);
    dupTotal += dups.length;
    if (dups.length) fail("슬러그 중복", `/${pth} → ${[...new Set(dups)].slice(0, 3).join(", ")}`);
    else ok(`/${pth} 슬러그 ${uniq.size.toLocaleString()}개 중복 0건`);
  }
  const base = new Set(sets[PATHS[0]]);
  for (const pth of PATHS.slice(1))
    check(sets[pth].length === base.size && sets[pth].every(s => base.has(s)),
      `/${pth} 슬러그 집합이 /${PATHS[0]} 과 동일`, `${sets[pth].length} vs ${base.size}`);

  /* 슬러그 충돌로 사라진 지역이 없는지: REGIONS 개수와 맞춘다 */
  const rd = src.match(/const REGIONS = \[([\s\S]*?)\];/);
  const regionN = rd ? (rd[1].match(/\["[^"]+",/g) || []).length : 0;
  check(regionN > 0 && regionN === base.size,
    `REGIONS ${regionN.toLocaleString()}개 = 슬러그 ${base.size.toLocaleString()}개 (유실 없음)`,
    regionN === base.size ? "" : `${regionN} vs ${base.size}`);

  /* 한글 주소는 404 가 아니라 301 로 같은 페이지의 영문 주소를 가리켜야 한다 */
  const sampleKo = [...(src.match(/const REGIONS = \[\["([^"]+)"/) || [])][1];
  const koCases = [];
  for (const pth of PATHS) koCases.push([`/${pth}/${sampleKo}`, `/${pth}/`]);
  koCases.push(["/card-terminal/sido/서울", "/card-terminal/sido/seoul"]);
  koCases.push(["/kiosk/sido/서울/강남구", "/kiosk/sido/seoul/gangnamgu"]);
  koCases.push(["/regions/sido/서울", "/regions/sido/seoul"]);
  for (const [from, wantPrefix] of koCases) {
    const r = await GET(from);
    const loc = r.headers.get("location") || "";
    const okStatus = r.status === 301;
    const okLoc = loc.startsWith("https://24payshop.com" + wantPrefix) && !/[^\x00-\x7F]/.test(loc);
    check(okStatus && okLoc, `한글 주소 301 → 영문`, okStatus && okLoc ? "" : `${from} → ${r.status} ${loc}`);
    if (okStatus && okLoc) {
      const t = await GET(new URL(loc).pathname);
      check(t.status === 200, "리다이렉트 도착지 200", t.status === 200 ? "" : `${loc} → ${t.status}`);
    }
  }
  /* 없는 한글 이름까지 넘겨주면 안 된다 */
  const nf = await GET("/kiosk/없는동네이름");
  check(nf.status === 404, "존재하지 않는 한글 이름은 404", `→ ${nf.status}`);
}

/* ══ 10. 홈·색인 ═══════════════════════════════════════════════
   홈은 shell() 이 아니라 HOME_HTML 이고, 목록·시도 페이지는 listShell 이라
   지역 페이지용 검사(5번)가 한 번도 닿지 않던 구간이다. h1·canonical·og 가
   통째로 빠져 있어도 아무도 못 잡았다. */
if (wanted("홈") && worker) {
  group("홈·색인", "10. 홈·색인 페이지");
  const OG = ["og:type", "og:title", "og:description", "og:url", "og:image", "og:site_name"];

  /* 홈 */
  const { r: hr, t: home } = await body("/");
  check(hr.status === 200, "홈 200", `→ ${hr.status}`);
  const hh1 = [...home.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)];
  check(hh1.length === 1, "홈 h1 정확히 1개", `→ ${hh1.length}개`);
  check(hh1.length === 1 && text(hh1[0][1]).length >= 4, "홈 h1 내용 존재", hh1[0] && text(hh1[0][1]));
  check(attr(home, /<link rel="canonical" href="([^"]*)"/) === "https://24payshop.com/",
    "홈 canonical", attr(home, /<link rel="canonical" href="([^"]*)"/));
  for (const k of OG) check(home.includes(`property="${k}"`), `홈 ${k}`);
  check(home.includes('name="twitter:card"'), "홈 twitter:card");
  check(/<html lang="ko">/.test(home), '홈 html lang="ko"');
  check(/name="viewport"/.test(home), "홈 viewport");
  check(home.includes("naver-site-verification"), "홈 네이버 소유확인 메타");
  check(!/noindex/i.test(home), "홈 noindex 없음");
  check(!!attr(home, /<title>([\s\S]*?)<\/title>/), "홈 title");
  check(!!attr(home, /<meta name="description" content="([^"]*)"/), "홈 meta description");

  /* 사이트맵의 색인성 페이지 전부 (동네 상세 제외). 일부만 고치고 지나가는 걸 막는다. */
  const idxPaths = urls.map(u => new URL(u).pathname).filter(p => p !== "/" && !PROD_RE.test(p));
  const noH1 = [], multiH1 = [], badCan = [], noOg = [], noIdx = [], emptyH1 = [], badStatus = [];
  for (const p of idxPaths) {
    const { r, t } = await body(p);
    if (r.status !== 200) { badStatus.push(`${p} → ${r.status}`); continue; }
    const hs = [...t.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)];
    if (!hs.length) noH1.push(p);
    else if (hs.length > 1) multiH1.push(`${p} ${hs.length}개`);
    else if (text(hs[0][1]).length < 2) emptyH1.push(p);
    const c = attr(t, /<link rel="canonical" href="([^"]*)"/);
    if (c !== "https://24payshop.com" + p) badCan.push(`${p} → ${c}`);
    for (const k of OG) if (!t.includes(`property="${k}"`)) { noOg.push(`${p} ${k}`); break; }
    if (/noindex/i.test(t)) noIdx.push(p);
  }
  const rep = (arr, msg) => arr.length ? arr.slice(0, 3).forEach(w => fail(msg, w)) : ok(`${msg} (${idxPaths.length}p)`);
  rep(badStatus, "색인 페이지 200");
  rep(noH1, "색인 페이지 h1 존재");
  rep(multiH1, "색인 페이지 h1 1개");
  rep(emptyH1, "색인 페이지 h1 내용 존재");
  rep(badCan, "색인 페이지 canonical 이 자기 경로와 일치");
  rep(noOg, "색인 페이지 og:* 완비");
  rep(noIdx, "색인 페이지 noindex 없음");
  fresh();
}

/* ══ 11. 크롤러기록 ════════════════════════════════════════════ */
if (wanted("크롤러기록") && worker) {
  group("크롤러기록", "11. 크롤러 기록");
  const target = regionPaths[0] || "/list";
  const CASES = [
    ["Mozilla/5.0 (compatible; Yeti/1.1; +http://naver.me/spd)", "Yeti"],
    ["Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", "Googlebot"],
    ["Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)", "bingbot"],
    ["Mozilla/5.0 (compatible; Daum/4.1; +http://cs.daum.net/faq/15/4118.html)", "Daum"],
    ["Mozilla/5.0 (compatible; Daumoa/4.1)", "Daum"],
    ["Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)", "YandexBot"],
    ["Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)", "ClaudeBot"],
    ["Mozilla/5.0 (compatible; Claude-SearchBot/1.0; +https://www.anthropic.com/claude-searchbot)", "Claude-SearchBot"],
    ["Mozilla/5.0 (compatible; Claude-User/1.0; +Claude-User@anthropic.com)", "Claude-User"],
    ["Scrapy/2.11 (+https://scrapy.org)", "기타봇"],
  ];
  for (const [ua, wantBot] of CASES) {
    fresh();
    await GET(target, { ua });
    const ins = insertsTo("crawl_hits");
    if (ins.length !== 1) { fail("봇 요청 1건 기록", `${wantBot} → ${ins.length}건`); continue; }
    const [site, bot, gotUa, host, pth, status] = ins[0].args;
    check(site === "24payshop" && bot === wantBot && pth === target && status === 200 && host === "24payshop.com",
      `${wantBot} 분류·경로·상태 기록`, `→ site=${site} bot=${bot} path=${pth} status=${status}`);
    check(gotUa === ua.slice(0, 250), `${wantBot} UA 원문 보존`);
  }
  /* 사람은 기록하지 않는다. events 와 역할이 겹치고 양만 수백 배가 된다. */
  for (const ua of [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile Safari/604.1",
  ]) {
    fresh();
    await GET(target, { ua });
    check(insertsTo("crawl_hits").length === 0, "사람 트래픽은 기록하지 않음", ua.slice(0, 40));
  }
  const YETI = "Mozilla/5.0 (compatible; Yeti/1.1; +http://naver.me/spd)";
  /* 404·301 도 남아야 "크롤러가 헛도는지"를 볼 수 있다 */
  fresh();
  await GET("/이런건-없다", { ua: YETI });
  const nf = insertsTo("crawl_hits")[0];
  check(nf && nf.args[5] === 404, "404 응답도 기록", nf ? `→ ${nf.args[5]}` : "기록 없음");
  fresh();
  await GET("/card-terminal/강남동", { ua: YETI });
  const rd = insertsTo("crawl_hits")[0];
  check(rd && rd.args[5] === 301, "한글 주소 301 도 기록", rd ? `→ ${rd.args[5]}` : "기록 없음");
  /* sitemap.xml 요청이 잡혀야 "네이버가 사이트맵을 읽는지"를 답할 수 있다 */
  fresh();
  await GET("/sitemap.xml", { ua: YETI });
  const sm2 = insertsTo("crawl_hits")[0];
  check(sm2 && sm2.args[4] === "/sitemap.xml", "sitemap.xml 요청 기록", sm2 ? `→ ${sm2.args[4]}` : "기록 없음");
  /* 키가 로그 테이블에 평문으로 박히면 안 된다 */
  fresh();
  await GET("/indexnow-submit?key=secret123", { ua: YETI });
  const kr = insertsTo("crawl_hits")[0];
  check(kr && !kr.args[4].includes("secret123") && kr.args[4].includes("key=***"),
    "기록된 경로에서 key 마스킹", kr && kr.args[4]);
  /* D1 바인딩이 없는 환경(로컬 dev)에서도 죽지 않아야 한다 */
  const noDb = await worker.fetch(new Request("https://24payshop.com" + target,
    { headers: { "user-agent": YETI } }), {}, CTX);
  check(noDb.status === 200, "DB 바인딩 없어도 응답 정상", `→ ${noDb.status}`);
  fresh();
}

/* ── 출력 ────────────────────────────────────────────────────── */
console.log("");
let failed = 0;
for (const g of groups) {
  const n = g.fails.length;
  failed += n;
  console.log(`${n ? "❌" : "✅"} ${g.title.padEnd(18)} 통과 ${String(g.pass).padStart(3)}${n ? ` · 실패 ${n}` : ""}`);
  g.fails.slice(0, 3).forEach(f => console.log(`      ↳ ${f}`));
  if (n > 3) console.log(`      ↳ … 외 ${n - 3}건`);
}
const total = groups.reduce((s, g) => s + g.pass, 0);
console.log("");
console.log(`검사 대상: ${path.basename(WORKER)} · 지역 페이지 표본 ${pages.length}개 · 사이트맵 ${urls.length} URL`);
console.log(failed ? `실패 ${failed}건 — 배포 중단` : `전체 통과 (${total}개 항목) — 배포 가능`);
process.exit(failed ? 1 : 0);
