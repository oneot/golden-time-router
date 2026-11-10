"use strict";
// 파이프라인: 워크플로 단계를 평균 소요 시간 기준으로 보여 줍니다(예상 진행).
const Pipe = (() => {
  const li = $$("#stages li"), elapsed = $("#elapsed"), note = $("#pipeNote");
  const T = [0, 3200, 6200, 10800, 14800];
  let t0 = 0, k = 1, timer = 0, cur = -1, onStage = () => { };
  function set(s) { li.forEach((x, j) => { x.className = j < s ? "done" : j === s ? "on" : ""; x.querySelector("em").textContent = j < s ? "완료" : j === s ? "진행 중" : ""; }); }
  function tick() {
    const e = now() - t0; elapsed.textContent = "T+" + fmtT(e);
    let s = 0; T.forEach((v, j) => { if (e >= v * k) s = j; });
    if (s !== cur) { cur = s; set(s); onStage(s + 1); }
    if (s === 4 && e > 25000 * k) note.textContent = "에이전트가 후보의 병상·수용 제한·이동 시간을 비교하는 중이에요. 보통 30~50초 걸립니다.";
  }
  function start(demo) { t0 = now(); k = demo ? .4 : 1; cur = -1; note.textContent = "워크플로가 모은 실시간 데이터로 AI가 순위를 정하고 있습니다."; clearInterval(timer); tick(); timer = setInterval(tick, 200); }
  function finish(ok, msg) {
    clearInterval(timer); timer = 0; const e = now() - t0; elapsed.textContent = "T+" + fmtT(e);
    if (ok) { set(5); note.textContent = msg || "총 " + Math.round(e / 1000) + "초 · 워크플로가 모은 실시간 데이터로 판단했어요."; }
    else { set(-1); note.textContent = msg || "워크플로가 모은 실시간 데이터로 AI가 순위를 정하고 있습니다."; }
  }
  return { start, finish, onStage: f => { onStage = f; } };
})();

const Ticker = (() => {
  const el = $("#tick");
  function fill(items) {
    el.replaceChildren();
    for (let r = 0; r < 2; r++) items.forEach(([k, v]) => { const s = h("span"); s.append(h("b", null, k), document.createTextNode(v)); el.append(s); });
    const len = items.reduce((n, it) => n + it.join(" ").length, 0);
    el.style.setProperty("--dur", Math.max(28, len * .3) + "s");
  }
  return {
    idle: () => fill([["STANDBY", "장소와 환자 상황을 보내면 주변 응급실 10곳을 분석합니다"], ["DATA", "국립중앙의료원 응급의료정보 · 카카오 로컬 · 카카오모빌리티 길찾기"], ["AGENT", "Copilot Studio 에이전트 · 워크플로 도구로 실시간 데이터 수집"], ["LINK", "agent-seal 봉인 · Direct Line · GitHub Pages"]]),
    scan: t => fill([["REQUEST", t], ["FLOW", "장소 좌표 → 후보 응급실 10곳 → 실시간 병상·수용 제한 → 도로 이동 시간 → AI 판단"], ["NOTE", "답이 오기까지 보통 30~50초 걸립니다"]]),
    result: d => fill(d.hs.slice().sort((a, b) => (a.min ?? 999) - (b.min ?? 999)).map(x => [x.short, [x.min != null ? x.min + "분" : null, x.beds != null ? "병상 " + x.beds : null, x.time ? x.time + " 갱신" : null, ST_TXT[x.st]].filter(Boolean).join(" · ")]))
  };
})();

// 순위판: 상위 3곳 카드 + 후보 전체 도착 시간 비교
const Rank = (() => {
  const top3 = $("#top3"), bars = $("#bars"), needEl = $("#need"), insight = $("#insight"), rankTime = $("#rankTime"), reqEl = $("#req");
  const ICON = {
    tel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>',
    route: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M8 7h9v9"/></svg>'
  };
  let pickCb = () => { }, hoverCb = () => { };
  function empty() {
    reqEl.hidden = true; needEl.hidden = true; insight.hidden = true; rankTime.textContent = "";
    top3.replaceChildren(h("div", "empty", "장소와 환자 상황을 보내면 응급실 상위 3곳이 여기에 나타나요."));
    bars.replaceChildren(h("li", "bar-empty", "후보 응급실의 도착 시간을 한눈에 비교합니다."));
  }
  function scanning() {
    needEl.hidden = true; insight.hidden = true; rankTime.textContent = "ANALYZING";
    top3.replaceChildren(...[1, 2, 3].map(k => { const s = h("div", "skel"); s.style.setProperty("--d", k * 120 + "ms"); s.append(h("span", "skel-no", String(k)), h("span", "skel-l")); return s; }));
    bars.replaceChildren(...Array.from({ length: 6 }, (_, k) => { const x = h("li", "skel-bar"); x.style.setProperty("--d", k * 90 + "ms"); return x; }));
  }
  function request(t) { reqEl.hidden = !t; if (t) reqEl.replaceChildren(h("b", null, "REQUEST"), h("span", null, t)); }
  function metric(cls, key, v, unit, cap) {
    const m = h("div", "m" + (cls ? " " + cls : "")), b = h("b", null, v == null ? "–" : "0"); m.append(h("span", "k", key));
    if (v != null) b.dataset.to = v; m.append(b); if (unit && v != null) m.append(h("small", null, unit)); m.append(h("em", null, cap)); return m;
  }
  function countUp(root, delay) {
    $$("b[data-to]", root).forEach(b => {
      const to = parseFloat(b.dataset.to), dec = (String(b.dataset.to).split(".")[1] || "").length, t0 = now() + delay;
      if (REDUCED) { b.textContent = to.toFixed(dec); return; }
      const step = t => { const p = clamp((t - t0) / 900, 0, 1); b.textContent = (to * E.out(p)).toFixed(dec); if (p < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    });
  }
  function bind(el, i) { el.addEventListener("click", e => { if (e.target.closest("a")) return; pickCb(i); }); el.addEventListener("keydown", e => { if (e.key === "Enter") pickCb(i); }); el.addEventListener("mouseenter", () => hoverCb(i)); el.addEventListener("mouseleave", () => hoverCb(-1)); }
  function render(d, delay) {
    const recs = d.hs.filter(x => x.rank).sort((a, b) => a.rank - b.rank), D = Math.max(0, delay * .55);
    const times = d.hs.map(x => x.time).filter(Boolean).sort(); rankTime.textContent = times.length ? times[times.length - 1] + " 기준" : "";
    if (d.need) { needEl.replaceChildren(h("b", null, "필요한 치료 · "), document.createTextNode(d.need)); needEl.hidden = false; } else needEl.hidden = true;
    top3.replaceChildren();
    if (!recs.length) top3.append(h("div", "empty", "조건에 맞는 병원을 찾지 못했어요. 브리핑의 보류·제외 이유를 확인하세요."));
    const maxBeds = Math.max(1, ...d.hs.map(x => x.beds || 0));
    recs.forEach((x, k) => {
      const c = h("article", "card r" + x.rank); c.style.setProperty("--d", D + k * 140 + "ms"); c.dataset.i = x.i; c.tabIndex = 0;
      const left = h("div", "card-rank"); left.append(h("span", "no", String(x.rank)), h("span", "lbl", "RANK"));
      const main = h("div", "card-main"); main.append(h("h3", null, x.name));
      const mt = h("div", "metrics");
      mt.append(metric("eta", "ETA", x.min, "분", "실시간 교통"), metric("", "BEDS", x.beds, "", x.time ? x.time + " 기준" : "가용 병상"), metric("", x.road != null ? "ROAD" : "DIST", x.road ?? x.km, "km", x.road != null && x.km != null ? "직선 " + x.km + "km" : "직선 거리"));
      main.append(mt);
      const bb = h("div", "bedbar"), bi = h("i"); bi.style.setProperty("--w", Math.round((x.beds || 0) / maxBeds * 100) + "%"); bb.append(bi); main.append(bb);
      if (x.note) main.append(h("p", "note", x.note));
      const act = h("div", "act");
      if (x.tel) { const a = h("a", "abtn"); a.href = "tel:" + x.tel.replace(/[^0-9+]/g, ""); a.innerHTML = ICON.tel; a.append(document.createTextNode(x.tel)); act.append(a); }
      if (x.lat != null && x.lng != null) { const a = h("a", "abtn"); a.href = "https://map.kakao.com/link/to/" + encodeURIComponent(x.name) + "," + x.lat + "," + x.lng; a.target = "_blank"; a.rel = "noopener"; a.innerHTML = ICON.route; a.append(document.createTextNode("카카오맵 길안내")); act.append(a); }
      if (act.children.length) main.append(act);
      c.append(left, main); top3.append(c); bind(c, x.i);
    });
    countUp(top3, D + 200);
    const best = recs[0], near = d.hs.filter(x => x.km != null && x.st !== "out").sort((a, b) => a.km - b.km)[0];
    if (best && near && near !== best && near.min != null && best.min != null) {
      const diff = near.min - best.min, jo = hasJong(near.short) ? "은" : "는";
      insight.replaceChildren(h("b", null, "직선 최단 ≠ 최단 시간"), h("br"), document.createTextNode(near.short + jo + " 직선 " + near.km + "km로 가장 가깝지만 도로로 " + (near.road != null ? near.road + "km · " : "") + near.min + "분 걸려요. " + (diff > 0 ? "1순위 " + best.short + "보다 " + diff + "분 늦습니다." : "도착 시간은 비슷하지만 병상·수용 조건에서 순위가 갈렸어요.")));
      insight.hidden = false;
    } else insight.hidden = true;
    bars.replaceChildren();
    const order = d.hs.slice().sort((a, b) => (a.rank || 99) - (b.rank || 99) || ST_ORDER[a.st] - ST_ORDER[b.st] || (a.min ?? 999) - (b.min ?? 999));
    const maxMin = Math.max(1, ...d.hs.map(x => x.min || 0));
    order.forEach((x, k) => {
      const li = h("li", "bar st-" + x.st); li.dataset.i = x.i; li.tabIndex = 0; li.style.setProperty("--d", D + 300 + k * 70 + "ms");
      const nm = h("span", "nm", x.short); if (x.rank) nm.prepend(h("span", "rk", String(x.rank))); if (near && x === near && x !== best) nm.append(h("small", null, "직선 최단"));
      const tr = h("span", "track"), bi = h("i"); bi.style.setProperty("--w", x.min != null ? Math.max(4, x.min / maxMin * 100) + "%" : "0%"); tr.append(bi);
      const sub = [ST_TXT[x.st], x.beds != null ? "병상 " + x.beds : null, x.km != null ? "직선 " + x.km + "km" : null, x.note || null].filter(Boolean).join(" · ");
      li.append(h("span", "dot"), nm, tr, h("span", "v", x.min != null ? x.min + "분" : "–"), h("span", "sub", sub)); li.title = x.name + " — " + sub;
      bars.append(li); bind(li, x.i);
    });
  }
  function select(i, scroll) {
    $$(".card, .bar", $("#rank")).forEach(e => e.classList.toggle("is-sel", Number(e.dataset.i) === i && i >= 0));
    if (scroll && i >= 0 && !MOBILE()) { const e = $('.card[data-i="' + i + '"]', $("#rank")) || $('.bar[data-i="' + i + '"]', $("#rank")); if (e) e.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
  }
  return { empty, scanning, render, select, request, onPick: f => { pickCb = f; }, onHover: f => { hoverCb = f; } };
})();
