// 24payshop.js — Cloudflare Worker
// 24페이샵 카드단말기 설치 메인페이지를 서빙합니다.
// 배포: GitHub에 푸시 → Actions가 wrangler로 자동 배포
//
// [채워야 할 곳]
//  · 전화번호: HTML 안의 1588-0000(표시용) / tel:15880000(링크용)
//  · 푸터: 대표 OOO / 사업자등록번호 000-00-00000 / 주소 OO시…
//  · 이용약관·개인정보처리방침 링크(href="#")

const HTML = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>24페이샵 · 카드단말기 설치</title>
<meta name="description" content="카드단말기 설치 전문 24페이샵. 전화 한 통이면 오늘 설치. 무료 설치·당일 개통·우대수수료 심사·전 업종·평생 A/S.">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css">
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500;700;800&display=swap" rel="stylesheet">
<style>
  :root{
    --paper:#F7F3E8; --ink:#231D16; --dim:#7a746a; --bar:74px;
    --red:#E5484D; --red-t:#FBE4E4;
    --green:#249B53; --green-t:#E0F3E7;
    --blue:#3B7DF6; --blue-t:#E4EDFE;
    --amber:#EC8A0A; --amber-t:#FCEEDA;
    --purple:#875CF8; --purple-t:#EEE8FE;
    --sans:'Pretendard',-apple-system,system-ui,sans-serif; --mono:'JetBrains Mono',ui-monospace,monospace;
  }
  *{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
  body{font-family:var(--sans);background:#000;display:flex;justify-content:center;line-height:1.55}
  .app{width:100%;max-width:440px;min-height:100vh;position:relative;overflow:hidden;
    background:radial-gradient(130% 30% at 50% 0,#272520,#121110 70%);
    padding:26px 14px calc(var(--bar) + env(safe-area-inset-bottom) + 28px)}
  .flash{position:fixed;inset:0;max-width:440px;left:50%;transform:translateX(-50%);background:#fff;opacity:0;z-index:60;pointer-events:none;animation:flash .5s 1.15s both}

  .printer{position:relative;max-width:368px;margin:8px auto 0;height:58px;border-radius:14px 14px 6px 6px;
    background:linear-gradient(180deg,#2a2823,#16140f);box-shadow:0 14px 30px -12px rgba(0,0,0,.7);
    display:flex;align-items:center;justify-content:space-between;padding:0 18px;z-index:3}
  .printer .pl{font-family:var(--mono);font-size:10px;letter-spacing:.16em;color:#8a8478}
  .printer .rec{display:flex;align-items:center;gap:6px;font-family:var(--mono);font-size:10px;letter-spacing:.1em;color:#cf8a82}
  .printer .rec i{width:7px;height:7px;border-radius:50%;background:var(--red);box-shadow:0 0 8px var(--red);animation:blink 1.3s steps(1) infinite}
  .printer .slot{position:absolute;left:50%;bottom:-3px;transform:translateX(-50%);width:312px;height:6px;border-radius:4px;background:#050403;box-shadow:inset 0 2px 3px #000}

  .receipt{position:relative;max-width:352px;margin:0 auto;background:var(--paper);color:var(--ink);padding:24px 20px 30px;
    box-shadow:0 30px 60px -22px rgba(0,0,0,.7);animation:print 1.1s .15s cubic-bezier(.2,.8,.2,1) both;transform-origin:top}
  .receipt::after{content:"";position:absolute;left:0;right:0;bottom:-11px;height:12px;
    background:linear-gradient(45deg,transparent 50%,var(--paper) 51%) 0 0/14px 12px repeat-x,
              linear-gradient(-45deg,transparent 50%,var(--paper) 51%) 0 0/14px 12px repeat-x;transform:scaleY(-1)}
  .eq{font-family:var(--mono);text-align:center;letter-spacing:.05em;color:#c0b69e;font-size:12px;overflow:hidden;white-space:nowrap}
  .logo{text-align:center;font-weight:800;font-size:33px;letter-spacing:.04em;line-height:1.1;margin:10px 0 4px}
  .logo .em{font-size:26px;vertical-align:-2px;margin-right:4px}
  .logo small{display:block;font-size:12px;font-weight:600;color:#4a443a;margin-top:7px;letter-spacing:0}
  .no{font-family:var(--mono);text-align:center;color:var(--dim);font-size:11px;margin:8px 0}

  /* section header pill */
  .sh{text-align:center;margin:26px 0 14px}
  .sh span{display:inline-flex;align-items:center;gap:7px;padding:8px 15px;border-radius:999px;font-weight:800;font-size:14.5px}
  .sh.green span{background:var(--green-t);color:var(--green)}
  .sh.blue span{background:var(--blue-t);color:var(--blue)}
  .sh.amber span{background:var(--amber-t);color:var(--amber)}
  .sh.purple span{background:var(--purple-t);color:var(--purple)}
  .sh.red span{background:var(--red-t);color:var(--red)}

  /* benefit rows */
  .brow{display:flex;align-items:center;gap:11px;padding:13px;border-radius:13px;margin:9px 0;background:#fff;border:1.5px solid #ece3d1}
  .brow .em{font-size:23px;flex:0 0 auto}
  .brow .l{flex:1;font-weight:700;font-size:15.5px}
  .brow .l small{display:block;font-weight:500;font-size:12px;color:var(--dim);margin-top:1px}
  .brow .v{font-weight:800;white-space:nowrap}
  .brow .v.free{color:var(--red);font-size:20px}
  .brow .v.ok{font-size:20px}

  /* dark callout with arrow */
  .callout{background:var(--ink);color:var(--paper);border-radius:15px;padding:17px;margin:18px 0;text-align:center;
    font-weight:800;font-size:19px;display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap}
  .callout .ar{color:#ffd33a}

  /* comparison */
  .vsbox{border-radius:14px;padding:14px 15px;margin:8px 0}
  .vsbox.old{background:var(--red-t);border:1.5px solid #f3cccc}
  .vsbox.new{background:var(--green-t);border:1.5px solid #c2e6cf}
  .vsbox .vt{font-weight:800;font-size:14px;margin-bottom:9px;display:flex;align-items:center;gap:7px}
  .vsbox.old .vt{color:var(--red)} .vsbox.new .vt{color:var(--green)}
  .vsbox .it{display:flex;gap:8px;align-items:flex-start;font-size:13.5px;font-weight:600;padding:4px 0}
  .vsarrow{text-align:center;font-size:22px;margin:2px 0;color:var(--green)}

  /* device rows */
  .drow{display:flex;align-items:center;gap:12px;padding:13px;border-radius:13px;margin:8px 0;background:#fff;border:1.5px solid #ece3d1}
  .drow .em{font-size:24px}
  .drow .dt{font-weight:800;font-size:16px}
  .drow .dt b{font-family:var(--mono);font-size:10px;color:#a89e85;font-weight:500;margin-left:7px;letter-spacing:.08em}
  .drow .dd{font-size:12.5px;color:var(--dim);margin-top:2px}

  /* chips */
  .chips{display:flex;flex-wrap:wrap;gap:8px;justify-content:center}
  .chips span{background:#fff;border:1.5px solid #e7dccb;border-radius:999px;padding:8px 13px;font-size:13.5px;font-weight:700;display:inline-flex;gap:5px;align-items:center}

  /* steps */
  .steps{margin-top:6px}
  .step{display:flex;gap:14px;align-items:flex-start;padding:4px 0}
  .step .c{flex:0 0 44px;width:44px;height:44px;border-radius:50%;display:grid;place-items:center;font-weight:800;font-size:19px;color:#fff;box-shadow:0 6px 14px -6px rgba(0,0,0,.3)}
  .step.s1 .c{background:var(--blue)} .step.s2 .c{background:var(--amber)} .step.s3 .c{background:var(--green)}
  .step .x{padding-top:5px}
  .step h4{font-weight:800;font-size:16px}
  .step p{font-size:13px;color:var(--dim);margin-top:2px}
  .stepar{font-size:20px;color:#cbc1aa;margin:0 0 0 16px;line-height:1}

  /* trust */
  .trust .r{display:flex;gap:9px;align-items:center;font-weight:600;font-size:14.5px;padding:7px 0;border-bottom:1px dashed #ddd3bc}
  .trust .r:last-child{border-bottom:0}
  .trust .r .em{font-size:18px}

  /* faq */
  .faq .q{font-weight:800;font-size:14.5px;margin-top:14px;display:flex;gap:7px}
  .faq .q:first-child{margin-top:0}
  .faq .a{font-size:13px;color:var(--dim);margin-top:5px;display:flex;gap:7px;line-height:1.55}

  .rule{border:0;border-top:1.5px dashed #cfc5ad;margin:16px 0}
  .fine{background:#fff;border:1.5px dashed #ddd3bc;border-radius:12px;padding:14px;font-size:12px;color:var(--dim);line-height:1.7}
  .fine b{color:var(--ink)}

  .total{display:flex;justify-content:space-between;align-items:baseline;font-weight:800;margin:4px 0}
  .total .b{font-size:24px}.total .a{font-size:18px;color:var(--red)}
  .order{display:flex;align-items:center;gap:9px;justify-content:center;margin:16px 0 0;padding:19px;border-radius:14px;
    background:var(--green);color:#fff;text-decoration:none;font-weight:800;font-size:18px;box-shadow:0 14px 26px -10px var(--green)}
  .order .ar{font-size:20px}
  .order:active{transform:translateY(2px)}
  .barcode{height:46px;margin:20px auto 6px;max-width:230px;
    background:repeating-linear-gradient(90deg,var(--ink) 0 2px,transparent 2px 4px,var(--ink) 4px 5px,transparent 5px 9px,var(--ink) 9px 12px,transparent 12px 14px)}
  .bc{font-family:var(--mono);text-align:center;color:var(--dim);font-size:11px;letter-spacing:.22em}
  .thx{text-align:center;font-size:13px;margin-top:10px;font-weight:700}

  .stamp{position:absolute;top:148px;right:2px;color:var(--red);border:3.5px double var(--red);border-radius:8px;
    padding:6px 12px;font-family:var(--mono);font-weight:800;letter-spacing:.1em;font-size:22px;opacity:.86;transform:rotate(-13deg);
    animation:slam .5s 1.15s cubic-bezier(.3,1.7,.5,1) both;z-index:2}
  .beeptag{position:absolute;top:120px;right:88px;font-weight:800;font-size:16px;color:var(--red);
    transform:rotate(-8deg) scale(0);animation:pop .4s 1.35s cubic-bezier(.3,1.7,.5,1) both;z-index:2}

  .foot{max-width:352px;margin:30px auto 4px;text-align:center;font-family:var(--mono);font-size:11.5px;line-height:1.95;color:#8d877c;letter-spacing:.02em}
  .foot .fbrand{font-family:var(--sans);font-weight:800;font-size:16px;color:#e8e4da;letter-spacing:.05em;margin-bottom:9px}
  .foot a{color:#b3a98f;text-decoration:none}
  .foot .flinks{margin-top:9px}
  .foot .flinks a{color:#c4ba9f}
  .foot .fcopy{margin-top:11px;color:#5f5b52;font-size:10.5px;letter-spacing:.03em}

  .callbar{position:fixed;left:50%;bottom:0;transform:translateX(-50%);width:100%;max-width:440px;z-index:40;
    background:var(--ink);padding:10px 14px calc(10px + env(safe-area-inset-bottom))}
  .callbar a{display:flex;align-items:center;gap:9px;justify-content:center;height:54px;border-radius:13px;background:var(--green);color:#fff;text-decoration:none;font-weight:800;font-size:17px;box-shadow:0 0 0 0 rgba(36,155,83,.5);animation:pulse 2.4s infinite}
  .callbar a svg{width:18px;height:18px;fill:#fff}
  .callbar .ph{font-family:var(--mono);font-weight:700;font-size:14px}

  @keyframes print{from{clip-path:inset(0 0 100% 0);transform:translateY(-8px)}to{clip-path:inset(0 0 0 0);transform:none}}
  @keyframes slam{0%{transform:rotate(-30deg) scale(1.9);opacity:0}55%{opacity:.92}100%{transform:rotate(-13deg) scale(1);opacity:.86}}
  @keyframes pop{0%{transform:rotate(-8deg) scale(0)}70%{transform:rotate(-8deg) scale(1.25)}100%{transform:rotate(-8deg) scale(1)}}
  @keyframes flash{0%{opacity:0}35%{opacity:.5}100%{opacity:0}}
  @keyframes blink{0%,55%{opacity:1}56%,100%{opacity:.25}}
  @keyframes pulse{0%{box-shadow:0 0 0 0 rgba(36,155,83,.5)}70%{box-shadow:0 0 0 12px rgba(36,155,83,0)}100%{box-shadow:0 0 0 0 rgba(36,155,83,0)}}
  @media (prefers-reduced-motion:reduce){
    .receipt,.stamp,.beeptag,.flash,.printer .rec i,.callbar a{animation:none!important}
    .receipt{clip-path:none;transform:none}.stamp{transform:rotate(-13deg)}.beeptag{transform:rotate(-8deg) scale(1)}
  }
  a:focus-visible{outline:3px solid var(--green);outline-offset:2px}
</style>
</head>
<body>
<div class="app">
  <div class="flash"></div>

  <div class="printer">
    <span class="pl">THERMAL · 24PAYSHOP</span>
    <span class="rec"><i></i>PRINTING</span>
    <span class="slot"></span>
  </div>

  <div class="receipt">
    <div class="beeptag">삑!</div>
    <div class="stamp">APPROVED</div>

    <div class="eq">＝＝＝＝＝＝＝＝＝＝＝＝</div>
    <div class="logo"><span class="em">🧾</span>24 PAYSHOP<small>카드단말기 설치 전문</small></div>
    <div class="no">NO. 20260615 · 전국 출장 · 09–21시</div>
    <div class="eq">＝＝＝＝＝＝＝＝＝＝＝＝</div>

    <!-- 혜택 -->
    <div class="sh green"><span>🎁 이 가격에 다 됩니다</span></div>
    <div class="brow"><span class="em">💳</span><span class="l">무료 설치<small>단말기 · 설치비</small></span><span class="v free">₩0</span></div>
    <div class="brow"><span class="em">⚡</span><span class="l">당일 개통<small>신청 즉시 방문</small></span><span class="v ok">✅</span></div>
    <div class="brow"><span class="em">💰</span><span class="l">우대수수료 심사<small>영세·중소가맹점</small></span><span class="v ok">✅</span></div>
    <div class="brow"><span class="em">🏪</span><span class="l">전 업종 설치<small>어떤 매장이든</small></span><span class="v ok">✅</span></div>
    <div class="brow"><span class="em">🔧</span><span class="l">평생 무상 A/S<small>24시간 대응</small></span><span class="v ok">✅</span></div>

    <div class="callout">📞 전화 한 통 <span class="ar">→</span> ⚡ 오늘 설치</div>

    <!-- 비교 -->
    <div class="sh red"><span>🆚 이렇게 달라져요</span></div>
    <div class="vsbox old">
      <div class="vt">😩 그냥 두면…</div>
      <div class="it">❌ 매달 높은 카드 수수료</div>
      <div class="it">❌ 설치까지 며칠씩 기다림</div>
      <div class="it">❌ 고장 나면 연락처도 막막</div>
    </div>
    <div class="vsarrow">⬇️</div>
    <div class="vsbox new">
      <div class="vt">😎 24페이샵으로 바꾸면</div>
      <div class="it">✅ 우대수수료 심사로 절감</div>
      <div class="it">✅ 신청하면 당일 방문 설치</div>
      <div class="it">✅ 24시간 평생 A/S</div>
    </div>

    <!-- 왜 -->
    <div class="sh amber"><span>⭐ 왜 24페이샵?</span></div>
    <div class="brow"><span class="em">💰</span><span class="l">매달 수수료 절감<small>우대수수료 심사를 대신 챙겨드려요</small></span></div>
    <div class="brow"><span class="em">🚀</span><span class="l">신청하면 당일 설치<small>가까운 기사님이 바로 방문·개통</small></span></div>
    <div class="brow"><span class="em">🎯</span><span class="l">매장 맞춤 추천<small>업종·동선에 딱 맞는 단말기로</small></span></div>
    <div class="brow"><span class="em">🛡️</span><span class="l">설치 후에도 끝까지<small>고장·교체·문의 24시간 책임</small></span></div>

    <!-- 단말기 -->
    <div class="sh blue"><span>🖥️ 단말기 라인업</span></div>
    <div class="drow"><span class="em">📱</span><div><div class="dt">무선 <b>WIRELESS</b></div><div class="dd">들고 다니며 결제 · 이동 많은 매장·배달</div></div></div>
    <div class="drow"><span class="em">🖨️</span><div><div class="dt">유선 <b>WIRED</b></div><div class="dd">고정 카운터에 가장 안정적 · 영수증 출력</div></div></div>
    <div class="drow"><span class="em">💻</span><div><div class="dt">포스 <b>POS</b></div><div class="dd">주문·매출·재고까지 한 화면에 통합</div></div></div>
    <div class="drow"><span class="em">📲</span><div><div class="dt">모바일·QR <b>MOBILE</b></div><div class="dd">휴대폰만 있으면 시작 · 1인 매장에 딱</div></div></div>

    <!-- 업종 -->
    <div class="sh purple"><span>🏪 이런 매장에 설치해요</span></div>
    <div class="chips">
      <span>☕ 카페</span><span>🍽️ 음식점</span><span>🥩 고깃집</span><span>🍗 치킨집</span><span>🍕 피자</span>
      <span>🍣 일식·횟집</span><span>🍢 분식</span><span>🥐 베이커리</span><span>🍦 디저트</span><span>🍺 호프·술집</span>
      <span>🏪 편의점</span><span>🛒 마트·슈퍼</span><span>✂️ 미용실</span><span>💅 네일샵</span><span>💆 마사지·스파</span>
      <span>👕 의류매장</span><span>👟 신발가게</span><span>👓 안경원</span><span>📚 학원</span><span>📖 스터디카페</span>
      <span>💊 약국</span><span>🏥 병원·의원</span><span>🦷 치과</span><span>🐶 동물병원</span><span>🏋️ 헬스장</span>
      <span>🧘 요가·필라테스</span><span>🎤 노래방</span><span>🧺 세탁소</span><span>🔧 카센터</span><span>📷 사진관</span>
      <span>🧸 키즈카페</span><span>⛽ 주유소</span><span>🏨 펜션·숙박</span><span>🤖 무인매장</span><span>🚚 푸드트럭</span>
      <span>💐 꽃집</span>
    </div>

    <!-- 절차 -->
    <div class="sh green"><span>📋 신청은 이렇게</span></div>
    <div class="steps">
      <div class="step s1"><div class="c">1</div><div class="x"><h4>📞 전화 상담</h4><p>업종·매장 환경만 알려주세요. 1분이면 끝.</p></div></div>
      <div class="stepar">↓</div>
      <div class="step s2"><div class="c">2</div><div class="x"><h4>📝 맞춤 견적</h4><p>단말기·수수료 안내, 서류는 간단히.</p></div></div>
      <div class="stepar">↓</div>
      <div class="step s3"><div class="c">3</div><div class="x"><h4>🔧 당일 설치</h4><p>방문 설치·개통, 바로 카드결제 시작.</p></div></div>
    </div>

    <!-- 안심 -->
    <div class="sh green"><span>🛡️ 안심하세요</span></div>
    <div class="trust">
      <div class="r"><span class="em">✅</span>정품 단말기만 설치합니다</div>
      <div class="r"><span class="em">✅</span>설치비·숨은 비용 0원</div>
      <div class="r"><span class="em">✅</span>전국 어디든 출장 설치</div>
      <div class="r"><span class="em">✅</span>계약 전 충분히 상담드려요</div>
    </div>

    <!-- FAQ -->
    <div class="sh purple"><span>❓ 자주 묻는 질문</span></div>
    <div class="faq">
      <div class="q"><span>❓</span>설치비가 정말 0원인가요?</div>
      <div class="a"><span>💬</span>네, 단말기 비용과 설치비 모두 무료로 진행합니다.</div>
      <div class="q"><span>❓</span>얼마나 빨리 설치되나요?</div>
      <div class="a"><span>💬</span>접수 즉시 일정을 잡고, 빠르면 당일 방문·개통합니다.</div>
      <div class="q"><span>❓</span>기존 단말기도 교체되나요?</div>
      <div class="a"><span>💬</span>네, 교체·이전 설치 모두 가능합니다. 현재 상황만 알려주세요.</div>
      <div class="q"><span>❓</span>고장 나면 A/S는 어떻게 받나요?</div>
      <div class="a"><span>💬</span>전화 한 통이면 24시간 대응합니다. 설치 후에도 끝까지 관리해요.</div>
    </div>

    <div class="sh amber"><span>📌 안내</span></div>
    <div class="fine">
      · <b>우대수수료</b>는 가맹점 심사 결과에 따라 적용됩니다.<br>
      · 상담 <b>09–21시 연중무휴</b> · 전국 출장 설치<br>
      · 설치 가능 여부는 전화로 빠르게 확인해 드려요.
    </div>

    <div class="eq" style="margin-top:18px">＝＝＝＝＝＝＝＝＝＝＝＝</div>
    <div class="total"><span class="b">합계</span><span class="a">📞 전화 한 통</span></div>
    <div class="eq">＝＝＝＝＝＝＝＝＝＝＝＝</div>

    <a class="order" href="tel:15880000"><svg viewBox="0 0 24 24" style="width:20px;height:20px;fill:#fff"><path d="M6.6 10.8a15.6 15.6 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.2.2 2.4.6 3.6.1.4 0 .8-.3 1z"/></svg>전화로 주문하기 <span class="ar">▶</span></a>
    <div style="text-align:center;font-family:var(--mono);font-weight:700;font-size:15px;margin-top:10px;color:var(--ink)">📞 1588-0000</div>

    <div class="barcode"></div>
    <div class="bc">2 4 P A Y S H O P</div>
    <div class="thx">🙏 감사합니다 · 또 찾아주세요</div>
  </div>

  <footer class="foot">
    <div class="fbrand">🧾 24PAYSHOP</div>
    <div>카드단말기 설치 전문 · 전국 출장 설치</div>
    <div>상호 24페이샵 &nbsp;|&nbsp; 대표 OOO</div>
    <div>사업자등록번호 000-00-00000</div>
    <div>주소 OO시 OO구 OO로 00, 0층</div>
    <div>대표전화 <a href="tel:15880000">1588-0000</a> &nbsp;|&nbsp; 09–21시 연중무휴</div>
    <div class="flinks"><a href="#">이용약관</a> · <a href="#">개인정보처리방침</a></div>
    <div class="fcopy">© 2026 24PAYSHOP. All rights reserved.</div>
  </footer>
</div>

<div class="callbar"><a href="tel:15880000"><svg viewBox="0 0 24 24"><path d="M6.6 10.8a15.6 15.6 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.2.2 2.4.6 3.6.1.4 0 .8-.3 1z"/></svg>📞 전화 상담 <span class="ph">1588-0000</span></a></div>
</body>
</html>
`;

export default {
  async fetch(request) {
    return new Response(HTML, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=300",
      },
    });
  },
};
