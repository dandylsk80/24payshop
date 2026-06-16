// 24payshop.js — Cloudflare Worker
// 24페이샵 카드단말기 설치 메인페이지를 서빙합니다.
// 배포: GitHub에 푸시 → Actions가 wrangler로 자동 배포
// 전화번호 바꾸려면 아래 HTML 안의 1588-0000 / tel:15880000 을 찾아 교체하세요.

const HTML = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>24페이샵 · 카드단말기 설치</title>
<meta name="description" content="카드단말기 설치 전문 24페이샵. 전화 한 통이면 오늘 설치. 무료 설치·당일 개통·우대수수료 심사·전 업종·평생 A/S. 무선·유선·포스·모바일 단말기.">
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css">
<style>
  :root{
    --bg:#121110; --paper:#F7F3E8; --ink:#191712; --dim:#7c766a; --line:#cabfa6; --red:#CB382B; --bar:74px;
    --mono:'JetBrains Mono',ui-monospace,monospace; --sans:'Pretendard',system-ui,sans-serif;
  }
  *{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
  body{font-family:var(--mono);background:#000;display:flex;justify-content:center;line-height:1.6}
  .app{width:100%;max-width:440px;min-height:100vh;position:relative;overflow:hidden;
    background:radial-gradient(130% 40% at 50% 0,#272520,#121110 70%);
    padding:26px 16px calc(var(--bar) + env(safe-area-inset-bottom) + 28px)}
  .flash{position:fixed;inset:0;max-width:440px;left:50%;transform:translateX(-50%);background:#fff;opacity:0;z-index:60;pointer-events:none;animation:flash .5s 1.15s both}

  .printer{position:relative;max-width:356px;margin:8px auto 0;height:60px;border-radius:14px 14px 6px 6px;
    background:linear-gradient(180deg,#2a2823,#16140f);box-shadow:0 14px 30px -12px rgba(0,0,0,.7),inset 0 1px 0 rgba(255,255,255,.06);
    display:flex;align-items:center;justify-content:space-between;padding:0 18px;z-index:3}
  .printer .pl{font-size:10px;letter-spacing:.18em;color:#8a8478}
  .printer .rec{display:flex;align-items:center;gap:6px;font-size:10px;letter-spacing:.12em;color:#cf8a82}
  .printer .rec i{width:7px;height:7px;border-radius:50%;background:var(--red);box-shadow:0 0 8px var(--red);animation:blink 1.3s steps(1) infinite}
  .printer .slot{position:absolute;left:50%;bottom:-3px;transform:translateX(-50%);width:300px;height:6px;border-radius:4px;background:#050403;box-shadow:inset 0 2px 3px #000}

  .receipt{position:relative;max-width:340px;margin:0 auto;background:var(--paper);color:var(--ink);padding:26px 24px 32px;font-size:14px;
    box-shadow:0 30px 60px -22px rgba(0,0,0,.7);animation:print 1.1s .15s cubic-bezier(.2,.8,.2,1) both;transform-origin:top}
  .receipt::after{content:"";position:absolute;left:0;right:0;bottom:-11px;height:12px;
    background:linear-gradient(45deg,transparent 50%,var(--paper) 51%) 0 0/14px 12px repeat-x,
              linear-gradient(-45deg,transparent 50%,var(--paper) 51%) 0 0/14px 12px repeat-x;transform:scaleY(-1)}
  .eq{text-align:center;letter-spacing:.08em;color:#b6ad97;font-size:12px;overflow:hidden}
  .logo{text-align:center;font-weight:800;font-size:32px;letter-spacing:.06em;line-height:1.1;margin:8px 0 4px}
  .logo small{display:block;font-size:11px;font-weight:500;letter-spacing:.04em;color:#3c382e;margin-top:6px}
  .no{text-align:center;color:var(--dim);font-size:11px;margin:8px 0}
  .rule{border:0;border-top:1.5px dashed var(--line);margin:15px 0}
  .head{text-align:center;font-weight:700;letter-spacing:.18em;font-size:12px;color:#3c382e;margin:4px 0 12px}

  .li{display:flex;align-items:flex-end;gap:6px;margin:11px 0;font-size:14.5px}
  .li .l{font-weight:600}
  .li .l small{display:block;font-weight:500;font-size:11px;color:var(--dim);letter-spacing:0;margin-top:1px}
  .li .dot{flex:1;border-bottom:2px dotted var(--line);transform:translateY(-3px);min-width:14px}
  .li .v{font-weight:700;white-space:nowrap}
  .li .v.free{color:var(--red);font-size:17px;font-weight:800}

  .band{background:var(--ink);color:var(--paper);text-align:center;font-weight:800;font-size:17px;letter-spacing:-.01em;padding:13px;margin:16px -4px;border-radius:3px}

  .why .w{padding:13px 0;border-top:1px dashed var(--line)}
  .why .w:first-child{border-top:0}
  .why .wk{font-size:11px;color:#a89e85;font-weight:700;letter-spacing:.1em}
  .why .wt{font-weight:800;font-size:16px;margin-top:3px}
  .why .wd{font-size:12.5px;color:var(--dim);margin-top:4px;line-height:1.55}

  .dl .d{padding:12px 0;border-top:1px dashed var(--line)}
  .dl .d:first-child{border-top:0}
  .dl .nm{font-weight:800;font-size:17px}
  .dl .nm span{font-size:10px;color:#a89e85;margin-left:8px;letter-spacing:.1em;font-weight:500}
  .dl .ds{font-size:12.5px;color:var(--dim);margin-top:3px}

  .tags{display:flex;flex-wrap:wrap;gap:7px;justify-content:center;margin-top:4px}
  .tags span{border:1px solid var(--line);border-radius:5px;padding:6px 10px;font-size:12px;font-weight:600}

  .proc{display:flex;justify-content:space-between;text-align:center;gap:10px}
  .proc div{flex:1}
  .proc .n{font-weight:800;font-size:24px}
  .proc .t{font-size:12px;color:#3c382e;font-weight:700;margin-top:3px}
  .proc .p{font-size:10.5px;color:var(--dim);margin-top:3px;line-height:1.35}

  .faq{font-size:13px}
  .faq .q{font-weight:700;margin-top:14px}
  .faq .q::before{content:"Q. ";color:var(--red);font-weight:800}
  .faq .q:first-child{margin-top:0}
  .faq .a{font-size:12.5px;color:var(--dim);margin-top:4px;line-height:1.55}
  .faq .a::before{content:"A. ";font-weight:700;color:var(--ink)}

  .fine{font-size:11px;color:var(--dim);line-height:1.75;text-align:center}

  .total{display:flex;justify-content:space-between;align-items:baseline;font-weight:800;margin:4px 0}
  .total .b{font-size:24px}.total .a{font-size:18px}
  .order{display:flex;align-items:center;gap:10px;justify-content:center;margin:16px 0 0;padding:18px;background:var(--ink);color:var(--paper);text-decoration:none;font-weight:800;font-size:17px;letter-spacing:-.01em}
  .order svg{width:19px;height:19px;fill:var(--paper)}
  .barcode{height:48px;margin:20px auto 6px;max-width:230px;
    background:repeating-linear-gradient(90deg,var(--ink) 0 2px,transparent 2px 4px,var(--ink) 4px 5px,transparent 5px 9px,var(--ink) 9px 12px,transparent 12px 14px)}
  .bc{text-align:center;color:var(--dim);font-size:11px;letter-spacing:.24em}
  .thx{text-align:center;font-size:12px;margin-top:10px;font-weight:600}

  .stamp{position:absolute;top:150px;right:6px;color:var(--red);border:3.5px double var(--red);border-radius:8px;
    padding:7px 13px;font-weight:800;letter-spacing:.12em;font-size:24px;opacity:.85;transform:rotate(-13deg);
    box-shadow:0 0 0 1px rgba(203,56,43,.2) inset;animation:slam .5s 1.15s cubic-bezier(.3,1.7,.5,1) both;z-index:2}
  .beeptag{position:absolute;top:122px;right:92px;font-family:var(--sans);font-weight:800;font-size:15px;color:var(--red);
    transform:rotate(-8deg) scale(0);animation:pop .4s 1.35s cubic-bezier(.3,1.7,.5,1) both;z-index:2}

  .callbar{position:fixed;left:50%;bottom:0;transform:translateX(-50%);width:100%;max-width:440px;z-index:40;
    background:var(--ink);padding:10px 14px calc(10px + env(safe-area-inset-bottom))}
  .callbar a{display:flex;align-items:center;gap:9px;justify-content:center;height:52px;background:var(--paper);color:var(--ink);text-decoration:none;font-weight:800;font-size:16px}
  .callbar a svg{width:18px;height:18px;fill:var(--ink)}
  .callbar .ph{font-weight:700}

  @keyframes print{from{clip-path:inset(0 0 100% 0);transform:translateY(-8px)}to{clip-path:inset(0 0 0 0);transform:none}}
  @keyframes slam{0%{transform:rotate(-30deg) scale(1.9);opacity:0}55%{opacity:.92}100%{transform:rotate(-13deg) scale(1);opacity:.85}}
  @keyframes pop{0%{transform:rotate(-8deg) scale(0)}70%{transform:rotate(-8deg) scale(1.25)}100%{transform:rotate(-8deg) scale(1)}}
  @keyframes flash{0%{opacity:0}35%{opacity:.5}100%{opacity:0}}
  @keyframes blink{0%,55%{opacity:1}56%,100%{opacity:.25}}
  @media (prefers-reduced-motion:reduce){
    .receipt,.stamp,.beeptag,.flash,.printer .rec i{animation:none!important}
    .receipt{clip-path:none;transform:none}.stamp{transform:rotate(-13deg)}.beeptag{transform:rotate(-8deg) scale(1)}
  }
  a:focus-visible{outline:2px solid var(--paper);outline-offset:3px}
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

    <div class="eq">＝＝＝＝＝＝＝＝＝＝＝＝＝＝</div>
    <div class="logo">24 PAYSHOP<small>카드단말기 설치 전문</small></div>
    <div class="no">NO. 20260615 · 전국 출장 설치 · 09–21시</div>
    <div class="eq">＝＝＝＝＝＝＝＝＝＝＝＝＝＝</div>

    <!-- 혜택 -->
    <div class="head" style="margin-top:14px">설 치 내 역</div>
    <div class="li"><span class="l">무료 설치<small>단말기·설치비 0원</small></span><span class="dot"></span><span class="v free">₩0</span></div>
    <div class="li"><span class="l">당일 개통<small>신청 즉시 방문</small></span><span class="dot"></span><span class="v">✓</span></div>
    <div class="li"><span class="l">우대수수료 심사<small>영세·중소가맹점</small></span><span class="dot"></span><span class="v">✓</span></div>
    <div class="li"><span class="l">전 업종 설치<small>어떤 매장이든</small></span><span class="dot"></span><span class="v">✓</span></div>
    <div class="li"><span class="l">평생 무상 A/S<small>24시간 대응</small></span><span class="dot"></span><span class="v">✓</span></div>

    <div class="band">오늘 신청 → 오늘 설치</div>

    <!-- 왜 -->
    <div class="head">왜 24페이샵?</div>
    <div class="why">
      <div class="w"><div class="wk">01 · 수수료</div><div class="wt">매달 새던 카드 수수료 절감</div><div class="wd">영세·중소가맹점 우대수수료 심사를 대신 챙겨드려요. 적용되면 매달 빠지던 금액이 줄어듭니다.</div></div>
      <div class="w"><div class="wk">02 · 속도</div><div class="wt">신청하면 당일 설치</div><div class="wd">접수 즉시 일정을 확정하고, 가까운 기사님이 방문해 설치·개통까지 한 번에 끝냅니다.</div></div>
      <div class="w"><div class="wk">03 · 맞춤</div><div class="wt">내 매장에 맞는 단말기</div><div class="wd">업종과 카운터 동선을 보고 무선·유선·포스·모바일 중 딱 맞는 기기를 골라 추천합니다.</div></div>
      <div class="w"><div class="wk">04 · A/S</div><div class="wt">설치 후에도 끝까지</div><div class="wd">고장·교체·사용 문의 24시간 대응. 한 번 설치로 끝이 아니라 계속 관리합니다.</div></div>
    </div>

    <hr class="rule">
    <!-- 단말기 -->
    <div class="head">단말기 라인업</div>
    <div class="dl">
      <div class="d"><div class="nm">무선 <span>WIRELESS</span></div><div class="ds">들고 다니며 결제. 이동 많은 매장·배달·푸드트럭에.</div></div>
      <div class="d"><div class="nm">유선 <span>WIRED</span></div><div class="ds">고정 카운터에 가장 안정적. 영수증 출력까지 깔끔.</div></div>
      <div class="d"><div class="nm">포스 <span>POS</span></div><div class="ds">주문·매출·재고 관리까지 한 화면. 매장 운영 통합.</div></div>
      <div class="d"><div class="nm">모바일·QR <span>MOBILE</span></div><div class="ds">휴대폰만 있으면 시작. 소규모·1인 매장에 딱.</div></div>
    </div>

    <hr class="rule">
    <!-- 업종 -->
    <div class="head">이런 매장에 설치해요</div>
    <div class="tags">
      <span>카페</span><span>음식점</span><span>미용실</span><span>편의점</span><span>학원</span><span>병원·약국</span><span>무인매장</span><span>푸드트럭</span><span>꽃집</span><span>네일샵</span>
    </div>

    <hr class="rule">
    <!-- 절차 -->
    <div class="head">신청 절차 · 하루면 충분</div>
    <div class="proc">
      <div><div class="n">1</div><div class="t">전화상담</div><div class="p">업종·환경 확인 1분</div></div>
      <div><div class="n">2</div><div class="t">맞춤견적</div><div class="p">단말기·수수료 안내</div></div>
      <div><div class="n">3</div><div class="t">당일설치</div><div class="p">방문 설치·개통</div></div>
    </div>

    <hr class="rule">
    <!-- FAQ -->
    <div class="head">자주 묻는 질문</div>
    <div class="faq">
      <div class="q">설치비가 정말 0원인가요?</div>
      <div class="a">네. 단말기 비용과 설치비 모두 무료로 진행합니다.</div>
      <div class="q">얼마나 빨리 설치되나요?</div>
      <div class="a">접수 즉시 일정을 잡고, 빠르면 당일 방문해 개통합니다.</div>
      <div class="q">기존에 쓰던 단말기도 교체되나요?</div>
      <div class="a">네. 교체·이전 설치 모두 가능하니 현재 상황만 알려주세요.</div>
      <div class="q">고장 나면 A/S는 어떻게 받나요?</div>
      <div class="a">전화 한 통이면 24시간 대응합니다. 설치 후에도 끝까지 관리해요.</div>
    </div>

    <hr class="rule">
    <div class="fine">
      · 우대수수료는 가맹점 심사 결과에 따라 적용됩니다.<br>
      · 상담 09–21시 연중무휴 · 전국 출장 설치<br>
      · 설치 가능 여부는 전화로 빠르게 확인해 드려요.
    </div>

    <div class="eq" style="margin-top:16px">＝＝＝＝＝＝＝＝＝＝＝＝＝＝</div>
    <div class="total"><span class="b">합계</span><span class="a">전화 한 통</span></div>
    <div class="eq">＝＝＝＝＝＝＝＝＝＝＝＝＝＝</div>

    <a class="order" href="tel:15880000"><svg viewBox="0 0 24 24"><path d="M6.6 10.8a15.6 15.6 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.2.2 2.4.6 3.6.1.4 0 .8-.3 1z"/></svg>전화로 주문 · 1588-0000</a>

    <div class="barcode"></div>
    <div class="bc">2 4 P A Y S H O P</div>
    <div class="thx">감사합니다 · 또 찾아주세요</div>
  </div>
</div>

<div class="callbar"><a href="tel:15880000"><svg viewBox="0 0 24 24"><path d="M6.6 10.8a15.6 15.6 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.2.2 2.4.6 3.6.1.4 0 .8-.3 1z"/></svg>전화 상담 <span class="ph">1588-0000</span></a></div>
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
