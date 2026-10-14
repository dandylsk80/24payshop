/* data/guides.json → 워커의 GUIDES2 상수. 실행(저장소 루트): node tools/guides-inject.mjs <워커 파일> */
import fs from "node:fs";
const file = process.argv[2]; if (!file) { console.error("usage: node tools/guides-inject.mjs <worker.js>"); process.exit(1); }
const G = JSON.parse(fs.readFileSync("data/guides.json", "utf8"));
const slugs = new Set(); for (const g of G) { if (!g.slug || slugs.has(g.slug)) throw new Error("slug 중복/누락: " + g.slug); slugs.add(g.slug); if (!Array.isArray(g.faq) || g.faq.length !== 4) throw new Error(g.slug + " faq 4개 아님"); }
let s = fs.readFileSync(file, "utf8");
const re = /\/\*GUIDES2_START\*\/[\s\S]*?\/\*GUIDES2_END\*\//;
if (!re.test(s)) throw new Error("GUIDES2 마커 없음");
/* 끝을 "] ;" 로 띄운다 — 공용 check.mjs 의 REGIONS 추출 정규식(\[.*?\}\];)이 "}];" 를 만나면 여기까지 잡아 JSON 파싱이 깨진다 */
  s = s.replace(re, "/*GUIDES2_START*/const GUIDES2=" + JSON.stringify(G) + " ;/*GUIDES2_END*/");
fs.writeFileSync(file, s);
console.log("GUIDES2 주입:", G.length, "편 →", file);
