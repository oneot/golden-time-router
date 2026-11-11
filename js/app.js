"use strict";
// ── 화면 흐름 ────────────────────────────────────────────────
// 질문 → 분석 연출(지도·단계·순위판 뼈대) → 결과(지도·순위판·브리핑), 샘플 시연, 연결 안내

const EXAMPLES = ["보라매공원, 50대 다리골절 노인", "강남역, 60대 남성 갑작스러운 가슴 통증", "잠실 롯데월드, 7살 아이 열성 경련", "광화문광장, 70대 여성 한쪽 팔다리 마비"];
const STAGE_HUD = [null, ["위치 확인", "카카오 장소 검색으로 좌표를 찾고 있어요"], ["응급실 후보 탐색", "주변 응급실 10곳을 찾고 있어요"], ["실시간 병상 확인", "가용 병상·중증질환 수용·제한 메시지를 확인하고 있어요"], ["도로 이동 시간 계산", "실시간 교통으로 이동 시간을 계산하고 있어요"], ["AI 판단", "에이전트가 순위를 판단하고 있어요"]];
const GREET = /^Hello! I'm (.+?)\. How can I help you today\?$/;
const App = { store: null, connected: false, heard: false, turn: null, data: null, demo: false, timer: 0, pt: 0, quiet: 0, di: 0, swapT: 0 };
const q = $("#q"), sendBtn = $("#send"), chipsEl = $("#chips"), noticeEl = $("#notice");
const IDLE_META = "전국 응급실 " + Geo.ER.length + "곳 · 국립중앙의료원";
// 결과 박자마다 지도 위 상태 문구: 에이전트의 판단 순서(필요한 치료 → 병상·수용 제한 → 도착 시간 → 순위)
const BEAT_HUD = {
  1: i => ["치료 가능 여부", i.out ? "필요한 치료를 할 수 없는 " + i.out + "곳을 뺐어요" : "후보 모두 필요한 치료를 할 수 있어요"],
  2: i => ["병상·수용 제한", i.chk ? "병상이 없거나 수용 제한이 있는 " + i.chk + "곳은 전화 확인이 필요해요" : "병상과 수용 제한에 걸린 곳이 없어요"],
  3: i => ["도착 시간", i.racers ? "남은 " + i.racers + "곳으로 동시에 출발 · 실제 소요 시간 1분 = " + (+(i.rate / 1000).toFixed(2)) + "초" : "실제 소요 시간으로 비교해요"],
  4: i => { const b = i.best; return [b ? "추천 경로" : "추천 없음", b ? "1순위 " + b.name + (b.min != null ? " · 예상 " + b.min + "분" : "") + (b.chk ? " · 전화 확인 필요" : "") : "조건에 맞는 병원이 없어요"]; }
};

// 처음 화면: 패널이 차례로 떠오르고 지구본의 점이 모여듭니다.
requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.remove("is-loading")));
Holo.intro();

function setHud(state, sub) { $("#hudState").textContent = state; if (sub != null) $("#hudSub").textContent = sub; }
function setCoord(o) { const c = $("#hudCoord"); if (!o || o.lat == null || o.lng == null) { c.replaceChildren(); return; } c.replaceChildren(h("span", null, o.web ? "출발지 · 지도 검색" : o.est ? "출발지 · 추정" : "출발지"), h("b", null, (o.est ? "≈ " : "") + o.lat.toFixed(4) + "°N  " + o.lng.toFixed(4) + "°E")); }
function setMeta(t) { $("#hudMeta").textContent = t; }
function setLink(state, text) { document.body.classList.toggle("is-connected", state === "on"); document.body.classList.toggle("is-error", state === "err"); $("#linkText").textContent = text; }
function busy() { return !!(App.turn && !App.turn.paused); }
function refresh() { sendBtn.disabled = !q.value.trim() || !App.connected || busy(); $$(".chip", chipsEl).forEach(c => { c.disabled = busy(); }); $("#demoBtn").disabled = busy(); }
function autosize() { q.style.height = "auto"; q.style.height = Math.min(q.scrollHeight, 132) + "px"; }
function scrollToEl(el) { window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 10, behavior: REDUCED ? "auto" : "smooth" }); }
function showChat(demo) { $("#webchat").hidden = demo; $("#demoBrief").hidden = !demo; }

function renderChips() {
  chipsEl.replaceChildren(...EXAMPLES.map(t => { const b = h("button", "chip", t); b.type = "button"; b.addEventListener("click", () => { if (App.connected) submit(t); else { q.value = t; autosize(); refresh(); q.focus(); } }); return b; }));
}
function renderSuggested(list) {
  $$(".chip.sa", chipsEl).forEach(x => x.remove());
  (list || []).slice(0, 4).reverse().forEach(a => { const b = h("button", "chip sa", a.title || a.value || ""); b.type = "button"; b.addEventListener("click", () => { if (a.type === "openUrl" && a.value) window.open(a.value, "_blank", "noopener"); else submit(String(a.value || a.title || "")); }); chipsEl.prepend(b); });
}

// 연결 안내: 상황마다 원인과 해결을 알려 줍니다.
const NOTICE = {
  local: ["이 페이지는 내 github.io 주소에서만 에이전트와 연결돼요.", "내 컴퓨터나 미리보기에서 연결되지 않는 것은 정상이에요. 샘플 시연으로 화면을 먼저 볼 수 있어요."],
  "config-missing": ["config.js를 찾지 못했어요.", "저장소 맨 위(index.html 옆)에 config.js가 있는지 확인하세요."],
  "config-invalid": ["config.js 내용이 올바르지 않아요.", "agent-seal의 config.js 탭에서 복사한 두 줄로 파일 전체를 바꾸세요."],
  "seal-other": ["이 SEALED는 다른 GitHub 주소용이에요.", "agent-seal에서 내 웹 채널 보안 암호와 내 GitHub 아이디로 봉인한 두 줄로 config.js를 바꾸세요. 템플릿에 들어 있던 값 그대로면 이 안내가 정상이에요."],
  "seal-broken": ["SEALED 값이 잘렸거나 바뀌었어요.", "agent-seal에서 config.js 두 줄을 다시 복사해 파일 전체를 바꾸세요."],
  net: ["지금은 에이전트와 연결할 수 없어요.", "잠시 뒤 다시 시도하거나 샘플 시연으로 화면을 확인하세요."],
  silent: ["연결은 됐지만 에이전트가 답하지 않아요.", "Copilot Studio에서 에이전트를 게시했는지, 설정 → 안전 및 액세스가 '인증 없음'인지 확인하세요."]
};
function errorKind(e) {
  if (e && e.kind) return e.kind;
  if (!/\.github\.io$/.test(location.hostname)) return "local";
  const m = String((e && e.message) || e || "");
  if (/github\.io 페이지에서만/.test(m)) return "seal-other";
  if (/봉인 값이 올바르지/.test(m)) return "seal-broken";
  return "net";
}
function showNotice(kind, raw) {
  const [title, body] = NOTICE[kind] || NOTICE.net;
  const row = h("div", "row"), b1 = h("button", "abtn", "샘플 시연 보기"); b1.type = "button"; b1.addEventListener("click", runDemo); row.append(b1);
  if (kind !== "local") { const b2 = h("button", "abtn", "다시 시도"); b2.type = "button"; b2.addEventListener("click", () => location.reload()); row.append(b2); }
  noticeEl.replaceChildren(h("b", null, title), document.createTextNode(" " + body));
  if (raw) noticeEl.append(h("code", null, String(raw)));
  noticeEl.append(row); noticeEl.dataset.kind = kind; noticeEl.hidden = false;
}

function submit(text) {
  text = String(text == null ? q.value : text).trim();
  if (!text || busy()) return;
  if (!App.connected || !App.store) { say("아직 에이전트와 연결되지 않았어요"); return; }
  if (App.demo) { App.demo = false; showChat(false); }
  App.store.dispatch({ type: "WEB_CHAT/SEND_MESSAGE", payload: { text } });
  q.value = ""; autosize(); renderSuggested([]); beginTurn(text, false);
}
// 모바일 패널 순서: 분석하는 동안은 지도 바로 밑에 분석 단계, AI 판단이 끝나면 추천 순위가 올라와 분석 단계와 자리를 바꿉니다.
// 화면 순서만 CSS로 바꾸고(body.rank-up), 패널은 바뀐 자리로 미끄러지듯 옮깁니다. 멀리 가는 패널은 제자리에서 흐려졌다가 새 자리에서 나타납니다.
const SWAP_AT = 800, RISE_AT = 900;
function reorder(up, change) {
  const B = document.body, els = [$(".pipe"), $("#rank"), $(".brief"), $(".foot")];
  const anim = MOBILE() && !REDUCED && B.classList.contains("rank-up") !== up;
  const y0 = anim ? els.map(e => e.getBoundingClientRect().top) : null;
  if (change) change();
  B.classList.toggle("rank-up", up);
  if (!anim) return;
  const far = innerHeight * .6, ease = "cubic-bezier(.22, .8, .2, 1)";
  els.forEach((e, i) => {
    if (e._swap) e._swap.cancel();
    const dy = y0[i] - e.getBoundingClientRect().top; if (Math.abs(dy) < 2) return;
    const s = dy < 0 ? 1 : -1;
    const a = e._swap = Math.abs(dy) <= far
      ? e.animate([{ transform: "translateY(" + dy + "px)" }, { transform: "none" }], { duration: 760, easing: ease })
      : e.animate([
        { transform: "translateY(" + dy + "px)", opacity: 1, easing: "cubic-bezier(.4, 0, 1, 1)" },
        { transform: "translateY(" + (dy + s * 28) + "px)", opacity: 0, offset: .3 },
        { transform: "translateY(" + -s * 28 + "px)", opacity: 0, offset: .34, easing: ease },
        { transform: "none", opacity: 1 }], { duration: 900 });
    // 움직이는 동안만 바탕을 불투명하게 해, 겹쳐 지나가는 패널의 글자가 비치지 않게 합니다.
    e.classList.add("is-swapping");
    a.onfinish = a.oncancel = () => { if (e._swap === a) { e._swap = null; e.classList.remove("is-swapping"); } };
  });
}
function beginTurn(text, demo, sample) {
  const t = App.turn = { text, demo, paused: false, at: sample ? sample.at : null }; App.data = null; clearTimeout(App.swapT);
  reorder(false, () => {
    document.body.classList.add("is-working"); document.body.classList.remove("is-result");
    Holo.locate(); Pipe.start(demo); Rank.scanning(); Rank.request(text); setCoord(null); $("#partial").hidden = true;
  });
  clearTimeout(App.pt);
  setMeta(demo ? "샘플 시연 · 기록 재생" : "실시간 수집 중");
  clearTimeout(App.timer); if (!demo) App.timer = setTimeout(() => endTurn(), 180000);
  findOrigin(t, sample);
  refresh(); if (MOBILE()) scrollToEl($("#holoPanel"));
  say("분석을 시작했어요. " + text);
}
// 기다리는 동안 지도를 실제 위치로: 질문의 장소 이름만 OpenStreetMap에서 찾고, 전국 응급실 목록에서 가까운 10곳을 고릅니다(샘플은 기록된 출발지).
function findOrigin(t, sample) {
  const put = o => {
    if (!o || App.turn !== t || t.paused) return;
    const c = Geo.nearest(o.lat, o.lng, 10), sido = c[0] && c[0].sido;
    Holo.origin(o, c, { sido, count: sido ? Geo.inSido(sido) : 0 }); setCoord({ lat: o.lat, lng: o.lng, web: true });
  };
  if (sample) { const d = readAnswer(sample.answer).data, o = d && d.origin; if (o && o.lat != null) setTimeout(() => put({ lat: o.lat, lng: o.lng, name: Geo.place(t.text) || o.name }), REDUCED ? 0 : 1600); return; }
  Geo.find(t.text).then(put, () => { });
}
function pauseTurn() {
  const t = App.turn; if (!t || t.paused) return;
  t.paused = true; clearTimeout(App.timer);
  document.body.classList.remove("is-working");
  Pipe.finish(false, "에이전트가 먼저 답했어요. 질문이 있다면 브리핑을 보고 답해 주세요.");
  Holo.reset(); Rank.empty(); setMeta(IDLE_META); setCoord(null);
  setHud("답변 확인", "에이전트의 답을 브리핑에서 확인하세요"); refresh();
  setTimeout(scrollBriefToLatest, 300);
  say("에이전트가 답했어요. 브리핑을 확인하세요.");
}
function resumeTurn() {
  const t = App.turn; if (!t || !t.paused) return;
  t.paused = false; document.body.classList.add("is-working");
  Holo.locate(); Pipe.start(t.demo); Rank.scanning(); Rank.request(t.text); refresh();
  clearTimeout(App.timer); App.timer = setTimeout(() => endTurn(), 180000);
  findOrigin(t);
}
function endTurn() {
  if (!App.turn) return; App.turn = null; clearTimeout(App.timer);
  document.body.classList.remove("is-working");
  Pipe.finish(false, "응답이 없어요. 새 대화를 눌러 다시 시도해 주세요."); Holo.reset(); Rank.empty(); setMeta(IDLE_META); setCoord(null);
  setHud("응답 없음", "응답이 너무 늦어요. 새 대화로 다시 시도해 주세요."); refresh();
}
// 결과가 나오면 브리핑을 그 답의 첫 줄로 옮겨, 순위판과 같은 답을 보게 합니다.
function scrollBriefToLatest() {
  const sc = $("#webchat .webchat__basic-transcript__scrollable"); if (!sc) return;
  const acts = $$("#webchat .webchat__basic-transcript__activity").filter(a => !a.querySelector(".webchat__stacked-layout--from-user") && a.textContent.trim());
  const last = acts[acts.length - 1]; if (!last) return;
  sc.scrollTop += last.getBoundingClientRect().top - sc.getBoundingClientRect().top - 6;
}
function showResult(d) {
  const t = App.turn; clearTimeout(App.timer); clearTimeout(App.pt); App.turn = null; App.data = d;
  document.body.classList.remove("is-working"); document.body.classList.add("is-result");
  setHud("AI 판단 결과", "에이전트의 판단 순서대로 지도에 보여 드려요");
  Holo.setData(d);
  // 모바일: 분석 단계가 모두 완료된 것을 잠깐 보여 준 뒤 추천 순위가 올라오고, 카드는 그때 맞춰 떠오릅니다.
  const phone = MOBILE() && !REDUCED; clearTimeout(App.swapT);
  Pipe.finish(true, t && t.demo ? "샘플 시연 · " + t.at : null); Rank.render(d, phone ? RISE_AT : 0); if (d.origin.lat != null) setCoord(d.origin);
  if (phone) App.swapT = setTimeout(() => reorder(true), SWAP_AT); else reorder(true);
  const recs = d.hs.filter(x => x.rank).sort((a, b) => a.rank - b.rank), best = recs[0];
  setMeta("후보 " + d.hs.filter(x => x.lat != null && x.lng != null).length + " · 추천 " + recs.length + (t && t.demo ? " · 샘플" : " · 실시간"));
  const pn = $("#partial"); pn.hidden = !d.partial;
  if (d.partial) pn.replaceChildren(h("b", null, "요약 모드 · "), document.createTextNode("에이전트 답에 지도 데이터(JSON)가 없어 상위 3곳과 보류·제외만 보여요" + (d.origin.est ? "(출발지는 세 병원의 직선거리로 추정)" : "") + ". 지침에 '웹앱용 데이터' 규칙을 넣고 게시하면 후보 10곳이 모두 지도에 나타나요."));
  if (t && !t.demo) [400, 1100, 2200].forEach(ms => setTimeout(scrollBriefToLatest, ms));
  refresh(); say(best ? "추천 결과: 1순위 " + best.name + (best.min != null ? ", 예상 " + best.min + "분" : "") : "조건에 맞는 병원을 찾지 못했어요");
}

// 샘플 시연용 마크다운 표시(굵게·기울임·링크·목록만)
function mdBlock(md) {
  const box = h("div", "md");
  const inline = (s, parent) => {
    const re = /\*\*([^*]+)\*\*|_([^_]+)_|\[([^\]]+)\]\((https?:[^)]+)\)/g; let i = 0, m;
    while ((m = re.exec(s))) {
      if (m.index > i) parent.append(document.createTextNode(s.slice(i, m.index)));
      if (m[1]) parent.append(h("strong", null, m[1])); else if (m[2]) parent.append(h("em", null, m[2]));
      else { const a = h("a", null, m[3]); a.href = encodeURI(m[4]); a.target = "_blank"; a.rel = "noopener"; parent.append(a); }
      i = re.lastIndex;
    }
    if (i < s.length) parent.append(document.createTextNode(s.slice(i)));
  };
  let ul = null;
  md.split("\n").forEach(line => {
    if (/^\s*-\s+/.test(line)) { if (!ul) { ul = h("ul"); box.append(ul); } const li = h("li"); inline(line.replace(/^\s*-\s+/, ""), li); ul.append(li); return; }
    ul = null; if (!line.trim()) return; const p = h("p"); inline(line.trim(), p); box.append(p);
  });
  return box;
}
// 샘플 시연: 실제 에이전트 답 기록을 차례로 재생합니다(?demo=1~4로 고를 수 있음).
function runDemo(n) {
  if (busy()) return;
  const k = Number.isInteger(n) ? clamp(n, 0, DEMOS.length - 1) : App.di % DEMOS.length, D = DEMOS[k]; App.di = k + 1;
  App.demo = true; showChat(true); noticeEl.hidden = true;
  const box = $("#demoBrief"), ub = () => h("div", "ubub", D.text);
  box.replaceChildren(ub(), h("p", "demo-wait", "에이전트가 워크플로로 실시간 데이터를 모으고 있어요…"));
  beginTurn(D.text, true, D);
  setTimeout(() => {
    if (!App.turn || !App.turn.demo) return;
    const r = readAnswer(D.answer);
    box.replaceChildren(ub(), mdBlock(r.text), h("p", "demo-tag", "샘플 " + (k + 1) + "/" + DEMOS.length + " · " + D.at + " · 에이전트에 연결하지 않고 기록한 답을 재생했어요"));
    box.scrollTop = 0; showResult(r.data);
  }, REDUCED ? 600 : 7600);
}

App.onStage = s => { Holo.setStage(s); const x = STAGE_HUD[s]; if (x && busy()) setHud(x[0], x[1] + (App.turn.demo ? " · 샘플" : "")); };
App.onConnected = () => {
  if (App.connected) return; App.connected = true; setLink("on", "에이전트 연결됨");
  if (!App.demo) noticeEl.hidden = true; refresh(); say("에이전트와 연결됐어요");
  clearTimeout(App.quiet); App.quiet = setTimeout(() => { if (!App.heard && !App.demo) showNotice("silent"); }, 20000);
};
App.onConnectError = e => {
  App.connected = false; const kind = errorKind(e), m = (e && e.message) || String(e || "unknown");
  setLink("err", "연결 안 됨"); showNotice(kind, m); refresh();
};
App.onBot = (a, r) => {
  if (a.type !== "event" && !App.heard) { App.heard = true; clearTimeout(App.quiet); if (noticeEl.dataset.kind === "silent") noticeEl.hidden = true; }
  if (a.type === "event") { if (a.name === "turn.complete" && App.turn && App.turn.got && !App.turn.paused) { clearTimeout(App.pt); setTimeout(pauseTurn, 0); } return; }
  if (a.type === "typing") { if (App.turn && App.turn.paused && !App.turn.demo) resumeTurn(); return; }
  renderSuggested(a.suggestedActions && a.suggestedActions.actions);
  if (!App.turn || App.turn.demo) return;
  if (r && r.data) { const d = r.data; clearTimeout(App.pt); setTimeout(() => showResult(d), 0); return; }
  if (!String((r && r.text) || "").trim() && !(a.attachments || []).length) return;
  App.turn.got = true; clearTimeout(App.pt); App.pt = setTimeout(pauseTurn, 4000);
};
// 에이전트 활동을 Web Chat이 그리기 전에 데이터 한 줄을 떼어 대시보드로 보내고, 기본 영어 인사말은 한국어로 바꿉니다.
function makeStore() {
  return window.WebChat.createStore({}, () => next => action => {
    try {
      if (action.type === "DIRECT_LINE/CONNECT_FULFILLED") App.onConnected();
      else if (action.type === "DIRECT_LINE/INCOMING_ACTIVITY") {
        const a = action.payload && action.payload.activity;
        if (a && a.from && a.from.role !== "user") {
          if (a.type === "event") App.onBot(a, null);
          else if (a.type === "message" || a.type === "typing") {
            const r = readAnswer(a.text), g = a.type === "message" && typeof a.text === "string" && a.text.trim().match(GREET);
            const text = g ? "안녕하세요, " + g[1] + "입니다. 환자가 있는 장소와 환자 상황을 한 줄로 알려 주세요." : r.text;
            if (r.changed || g) action = Object.assign({}, action, { payload: Object.assign({}, action.payload, { activity: Object.assign({}, a, { text }) }) });
            App.onBot(a, r);
          }
        }
      }
    } catch (e) { console.warn(e); }
    return next(action);
  });
}
// Web Chat 색은 CSS 변수로 넘깁니다. 테마를 바꿔도 Web Chat을 다시 그리지 않고 대화가 그대로 남습니다.
const STYLE = { hideSendBox: true, hideUploadButton: true, rootHeight: "100%", backgroundColor: "transparent", primaryFont: FONT, monospaceFont: MONO, bubbleBackground: "transparent", bubbleBorderWidth: 0, bubbleTextColor: "var(--wc-text)", bubbleMaxWidth: 680, bubbleMinWidth: 0, bubbleNubSize: 0, bubbleFromUserNubSize: 0, bubbleFromUserBackground: "var(--wc-user-bg)", bubbleFromUserBorderColor: "var(--wc-user-line)", bubbleFromUserBorderWidth: 1, bubbleFromUserBorderRadius: 14, bubbleFromUserTextColor: "var(--ink)", subtle: "var(--muted)", accent: "var(--coral)", timestampColor: "var(--dim)", paddingRegular: 10, paddingWide: 12 };

// 테마: 기본은 다크, 오른쪽 위 토글로 라이트. 고른 테마는 이 브라우저에 저장합니다(주소에 ?theme=light|dark가 있으면 그쪽이 먼저).
const THEME_BG = { dark: "#07080b", light: "#f4f3f0" };
const curTheme = () => document.documentElement.dataset.theme === "light" ? "light" : "dark";
function applyTheme(t) {
  document.documentElement.dataset.theme = t; $('meta[name="theme-color"]').content = THEME_BG[t];
  const b = $("#themeBtn"); b.setAttribute("aria-checked", String(t === "light")); b.title = t === "light" ? "다크 모드로 보기" : "라이트 모드로 보기";
  Holo.setTheme(t);
}
function toggleTheme() {
  const t = curTheme() === "light" ? "dark" : "light";
  try { localStorage.setItem("gtr-theme", t); } catch (e) { }
  if (/[?&]theme=/.test(location.search)) { const u = new URL(location.href); u.searchParams.set("theme", t); history.replaceState(null, "", u); }
  if (document.startViewTransition && !REDUCED) document.startViewTransition(() => applyTheme(t)); else applyTheme(t);
}

Pipe.onStage(App.onStage);
Holo.onBeat((k, info) => { if (App.turn) return; const x = BEAT_HUD[k](info); setHud(x[0], x[1]); });
Holo.onPick(i => Rank.select(i, true));
Rank.onPick(i => { Holo.select(i); Rank.select(i, false); });
Rank.onHover(i => Holo.hover(i));
q.addEventListener("input", () => { autosize(); refresh(); });
q.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); submit(); } });
sendBtn.addEventListener("click", () => submit());
$("#demoBtn").addEventListener("click", runDemo);
$("#newBtn").addEventListener("click", () => location.reload());
$("#themeBtn").addEventListener("click", toggleTheme);
document.addEventListener("keydown", e => { if (e.key === "/" && document.activeElement !== q && !/input|textarea/i.test(document.activeElement.tagName)) { e.preventDefault(); q.focus(); } });
setInterval(() => { const d = new Date(); $("#clock").textContent = pad2(d.getHours()) + ":" + pad2(d.getMinutes()) + ":" + pad2(d.getSeconds()) + (d.getTimezoneOffset() === -540 ? " KST" : ""); }, 1000);
applyTheme(curTheme()); renderChips(); Rank.empty(); setCoord(null); setMeta(IDLE_META); refresh();
const DM = location.search.match(/[?&]demo(?:=(\d+))?/);
if (DM) setTimeout(() => runDemo(DM[1] ? +DM[1] - 1 : 0), 700);
