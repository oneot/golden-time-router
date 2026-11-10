"use strict";
// ── agent-seal 연결 ───────────────────────────────────────────
// config.js(BROKER_URL · SEALED)는 학생이 바꾸는 파일이라, 캐시된 옛 값을 쓰지 않도록 매번 새로 불러옵니다.
// 그다음은 2주차 index.html과 같은 흐름입니다.
// 발급소에 봉인값을 보내 임시 토큰 받기 → Direct Line 연결 → 첫 인사말 요청 → Web Chat 표시
function loadConfig() {
  return new Promise((ok, fail) => {
    const s = document.createElement("script");
    s.src = "config.js?v=" + Date.now();
    s.onload = () => ok();
    s.onerror = () => fail(Object.assign(new Error("config.js를 불러오지 못했습니다"), { kind: "config-missing" }));
    document.head.appendChild(s);
  });
}

loadConfig()
  .then(() => {
    if (typeof BROKER_URL !== "string" || typeof SEALED !== "string" || !SEALED) throw Object.assign(new Error("config.js에서 BROKER_URL과 SEALED를 찾지 못했습니다"), { kind: "config-invalid" });
    if (!window.WebChat) throw new Error("Web Chat 스크립트를 불러오지 못했습니다");
    return fetch(BROKER_URL, { method: "POST", body: JSON.stringify({ sealed: SEALED }) });
  })
  .then(r => r.json())
  .then(({ token, error }) => {
    if (!token) throw new Error(error);
    const directLine = WebChat.createDirectLine({ token });
    directLine.postActivity({ type: "event", name: "startConversation", from: { id: "user" } }).subscribe(); // 첫 인사말 요청
    App.store = makeStore();
    WebChat.renderWebChat({ directLine, store: App.store, styleOptions: STYLE, locale: "ko-KR" }, document.getElementById("webchat"));
  })
  .catch(e => App.onConnectError(e));
