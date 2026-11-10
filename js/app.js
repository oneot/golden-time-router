"use strict";
// ── 화면 흐름 ────────────────────────────────────────────────
// 질문 → 분석 연출(지도·단계·순위판 뼈대) → 결과(지도·순위판·브리핑), 샘플 시연, 연결 안내

const EXAMPLES = ["보라매공원, 50대 다리골절 노인", "강남역, 60대 남성 갑작스러운 가슴 통증", "잠실 롯데월드, 7살 아이 열성 경련", "광화문광장, 70대 여성 한쪽 팔다리 마비"];
const STAGE_HUD = [null, ["LOCATING", "카카오 장소 검색으로 좌표를 찾는 중"], ["SCANNING ER", "주변 응급실 후보 10곳을 찾는 중"], ["LIVE BEDS", "가용병상·중증질환 수용·제한 메시지 확인 중"], ["ROUTING", "실시간 교통으로 도로 이동 시간 계산 중"], ["AI DECISION", "에이전트가 순위를 판단하는 중"]];
const GREET = /^Hello! I'm (.+?)\. How can I help you today\?$/;
const App = { store: null, connected: false, heard: false, turn: null, data: null, demo: false, timer: 0, pt: 0, quiet: 0 };
const q = $("#q"), sendBtn = $("#send"), chipsEl = $("#chips"), noticeEl = $("#notice");

const Boot = (() => {
  const el = $("#boot"), log = $("#bootLog"); let done = false;
  const line = (txt, cls) => log.append(h("div", cls || null, txt));
  function close(delay) { if (done) return; done = true; setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 700); }, delay || 0); }
  if (REDUCED || /[?&]demo/.test(location.search)) { el.remove(); done = true; }
  else { line("> GOLDEN TIME ROUTER // HOLO HUD"); setTimeout(() => line("> 응급의료 데이터 링크 준비"), 250); setTimeout(() => line("> 에이전트 토큰 요청 · agent-seal broker"), 500); setTimeout(() => close(), 3400); el.addEventListener("click", () => close()); }
  return { ok: () => { if (done) return; line("> Direct Line 연결 완료 · 대기", "ok"); close(650); }, fail: m => { if (done) return; line("> 연결 실패 · " + m, "bad"); line("> 샘플 시연으로 화면을 볼 수 있어요", "bad"); close(1400); } };
})();

function setHud(state, sub) { $("#hudState").textContent = state; if (sub != null) $("#hudSub").textContent = sub; }
function setCoord(o) { const c = $("#hudCoord"), p = o && o.est ? "≈ " : ""; c.replaceChildren(h("span", null, o && o.est ? "ORIGIN · 추정" : "ORIGIN"), h("b", null, o && o.lat != null ? p + o.lat.toFixed(4) + "° N" : "--.----° N"), h("b", null, o && o.lng != null ? p + o.lng.toFixed(4) + "° E" : "---.----° E")); }
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
function beginTurn(text, demo) {
  App.turn = { text, demo, paused: false }; App.data = null;
  document.body.classList.add("is-working"); document.body.classList.remove("is-result");
  FX.boost(true); Holo.locate(); Pipe.start(demo); Rank.scanning(); Rank.request(text); Ticker.scan(text); setCoord(null); $("#partial").hidden = true; clearTimeout(App.pt);
  setMeta("NODES 00 · " + (demo ? "SAMPLE" : "LIVE") + " SCAN");
  clearTimeout(App.timer); if (!demo) App.timer = setTimeout(() => endTurn(), 180000);
  refresh(); if (MOBILE()) scrollToEl($("#holoPanel"));
  say("분석을 시작했어요. " + text);
}
function pauseTurn() {
  const t = App.turn; if (!t || t.paused) return;
  t.paused = true; clearTimeout(App.timer);
  document.body.classList.remove("is-working"); FX.boost(false);
  Pipe.finish(false, "에이전트가 먼저 답했어요. 질문이 있다면 브리핑을 보고 답해 주세요.");
  Holo.reset(); Rank.empty(); Ticker.idle(); setMeta("NODES 00 · STANDBY");
  setHud("AWAITING INPUT", "에이전트의 답을 아래 브리핑에서 확인하세요"); refresh();
  setTimeout(scrollBriefToLatest, 300);
  say("에이전트가 답했어요. 브리핑을 확인하세요.");
}
function resumeTurn() {
  const t = App.turn; if (!t || !t.paused) return;
  t.paused = false; document.body.classList.add("is-working"); FX.boost(true);
  Holo.locate(); Pipe.start(t.demo); Rank.scanning(); Rank.request(t.text); Ticker.scan(t.text); refresh();
  clearTimeout(App.timer); App.timer = setTimeout(() => endTurn(), 180000);
}
function endTurn() {
  if (!App.turn) return; App.turn = null; clearTimeout(App.timer);
  document.body.classList.remove("is-working"); FX.boost(false);
  Pipe.finish(false, "응답이 없어요. 새 대화를 눌러 다시 시도해 주세요."); Holo.reset(); Rank.empty(); Ticker.idle();
  setHud("NO RESPONSE", "응답이 너무 늦어요. 새 대화로 다시 시도해 주세요."); refresh();
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
  document.body.classList.remove("is-working"); document.body.classList.add("is-result"); FX.boost(false);
  const total = Holo.setData(d);
  Pipe.finish(true, t && t.demo ? "샘플 시연 · " + DEMO.at : null); Rank.render(d, total); Ticker.result(d); setCoord(d.origin);
  const recs = d.hs.filter(x => x.rank).sort((a, b) => a.rank - b.rank), best = recs[0];
  setMeta("NODES " + pad2(d.hs.filter(x => x.lat != null && x.lng != null).length) + " · RANKED " + recs.length + (t && t.demo ? " · SAMPLE" : " · LIVE"));
  setHud("ROUTE LOCKED", best ? "1순위 " + best.name + (best.min != null ? " · 예상 " + best.min + "분" : "") : "조건에 맞는 병원이 없어요");
  const pn = $("#partial"); pn.hidden = !d.partial;
  if (d.partial) pn.replaceChildren(h("b", null, "요약 모드 · "), document.createTextNode("에이전트 답에 지도 데이터(JSON)가 없어 상위 3곳과 보류·제외만 보여요" + (d.origin.est ? "(출발지는 세 병원의 직선거리로 추정)" : "") + ". 지침에 '웹앱용 데이터' 규칙을 넣고 게시하면 후보 10곳이 모두 지도에 나타나요."));
  if (best && !REDUCED) setTimeout(() => {
    const lock = $("#lock"); $("#lockName").textContent = best.name; $("#lockEta").textContent = (best.min != null ? "ETA " + best.min + " MIN" : "") + (best.beds != null ? " · BEDS " + best.beds : "");
    lock.hidden = false; lock.style.animation = "none"; void lock.offsetWidth; lock.style.animation = ""; setTimeout(() => { lock.hidden = true; }, 2900);
  }, total);
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
function runDemo() {
  if (busy()) return;
  App.demo = true; showChat(true); noticeEl.hidden = true;
  const box = $("#demoBrief"), ub = () => h("div", "ubub", DEMO.text);
  box.replaceChildren(ub(), h("p", "demo-wait", "에이전트가 워크플로로 실시간 데이터를 모으고 있어요…"));
  beginTurn(DEMO.text, true);
  setTimeout(() => {
    if (!App.turn || !App.turn.demo) return;
    const r = readAnswer(DEMO.answer);
    box.replaceChildren(ub(), mdBlock(r.text), h("p", "demo-tag", "SAMPLE · " + DEMO.at + " · 에이전트에 연결하지 않고 기록한 답을 재생했어요"));
    box.scrollTop = 0; showResult(r.data);
  }, REDUCED ? 600 : 7600);
}

App.onStage = s => { Holo.setStage(s); const x = STAGE_HUD[s]; if (x && busy()) setHud(x[0], x[1] + (App.turn.demo ? " · 샘플" : "")); };
App.onConnected = () => {
  if (App.connected) return; App.connected = true; setLink("on", "LINK · ONLINE"); Boot.ok();
  if (!App.demo) noticeEl.hidden = true; refresh(); say("에이전트와 연결됐어요");
  clearTimeout(App.quiet); App.quiet = setTimeout(() => { if (!App.heard && !App.demo) showNotice("silent"); }, 20000);
};
App.onConnectError = e => {
  App.connected = false; const kind = errorKind(e), m = (e && e.message) || String(e || "unknown");
  setLink("err", "LINK · OFFLINE"); Boot.fail(NOTICE[kind][0]); showNotice(kind, m); refresh();
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
const STYLE = { hideSendBox: true, hideUploadButton: true, rootHeight: "100%", backgroundColor: "transparent", primaryFont: FONT, monospaceFont: MONO, bubbleBackground: "transparent", bubbleBorderWidth: 0, bubbleTextColor: "#dfe6ff", bubbleMaxWidth: 680, bubbleMinWidth: 0, bubbleNubSize: 0, bubbleFromUserNubSize: 0, bubbleFromUserBackground: "rgba(34,211,238,.12)", bubbleFromUserBorderColor: "rgba(34,211,238,.38)", bubbleFromUserBorderWidth: 1, bubbleFromUserBorderRadius: 12, bubbleFromUserTextColor: "#ecfeff", subtle: "#8d96bd", accent: "#22d3ee", timestampColor: "#5d6594", paddingRegular: 10, paddingWide: 12 };

Pipe.onStage(App.onStage);
Holo.onPick(i => Rank.select(i, true));
Rank.onPick(i => { Holo.select(i); Rank.select(i, false); });
Rank.onHover(i => Holo.hover(i));
q.addEventListener("input", () => { autosize(); refresh(); });
q.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); submit(); } });
sendBtn.addEventListener("click", () => submit());
$("#demoBtn").addEventListener("click", runDemo);
$("#newBtn").addEventListener("click", () => location.reload());
document.addEventListener("keydown", e => { if (e.key === "/" && document.activeElement !== q && !/input|textarea/i.test(document.activeElement.tagName)) { e.preventDefault(); q.focus(); } });
setInterval(() => { const d = new Date(); $("#clock").textContent = pad2(d.getHours()) + ":" + pad2(d.getMinutes()) + ":" + pad2(d.getSeconds()) + (d.getTimezoneOffset() === -540 ? " KST" : ""); }, 1000);
renderChips(); Rank.empty(); Ticker.idle(); setCoord(null); refresh();
if (/[?&]demo/.test(location.search)) setTimeout(runDemo, 700);
