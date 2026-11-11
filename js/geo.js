"use strict";
// ── 위치 찾기 ───────────────────────────────────────────────
// 질문에서 장소 부분만 떼어 OpenStreetMap(Nominatim)으로 좌표를 찾고, 전국 응급실 목록(data/er.js)에서 가까운 10곳을 고릅니다.
// 장소 이름만 보내고 환자 상황은 보내지 않습니다. 찾은 장소는 이 브라우저에 저장해 같은 장소를 다시 묻지 않습니다.
// 에이전트의 워크플로와 따로 움직이는 웹앱 자체 계산이라, 기다리는 동안 지도를 실제 위치로 보여 주는 데만 씁니다.
const Geo = (() => {
  const API = "https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=kr&limit=1&accept-language=ko&q=";
  const CK = "gtr-geo1:", DAY = 864e5;
  const ER = ERS.list.map((r, i) => ({ i, lat: r[0], lng: r[1], cls: r[2], sido: ERS.sido[r[3]], name: r[4], short: shortName(r[4]) }));
  const CLS = ["권역응급의료센터", "지역응급의료센터", "지역응급의료기관", "응급실 운영 신고기관"];
  const WHO = /^(?:\d+\s*(?:대|세|살|개월|주)|남성|여성|남자|여자|아이|아기|영아|소아|노인|어르신|할머니|할아버지|환자|임산부|산모|학생|청소년)/;
  let last = 0;

  // "보라매공원, 50대 다리골절 노인" → "보라매공원", "강남역에서 60대 남성이 쓰러졌어요" → "강남역"
  function place(text) {
    let s = String(text || "").replace(/\s+/g, " ").trim().split(/[,，\n]/)[0];
    s = s.split(/\s*(?:에서|에 있는)\s*/)[0];
    const out = [];
    for (const tk of s.split(" ")) { if (WHO.test(tk) || /^(?:근처|부근|인근|주변|앞|쪽|옆)$/.test(tk)) break; out.push(tk); }
    s = out.join(" ").replace(/(?:근처|부근|인근|주변)$/, "").trim();
    return s.length >= 2 && s.length <= 40 ? s : "";
  }
  function cacheGet(q) { try { const v = JSON.parse(localStorage.getItem(CK + q) || "null"); return v && Date.now() - v.t < 30 * DAY ? v : null; } catch (e) { return null; } }
  function cachePut(q, v) { try { localStorage.setItem(CK + q, JSON.stringify(Object.assign({ t: Date.now() }, v))); } catch (e) { } }
  async function ask(q, ms) {
    const wait = last + 1100 - Date.now(); if (wait > 0) await new Promise(r => setTimeout(r, wait));
    last = Date.now();
    const ac = new AbortController(), tm = setTimeout(() => ac.abort(), ms);
    try {
      const r = await fetch(API + encodeURIComponent(q), { signal: ac.signal, headers: { Accept: "application/json" } });
      if (!r.ok) return null;
      const j = await r.json(), x = Array.isArray(j) && j[0];
      const lat = x && num(x.lat), lng = x && num(x.lon);
      return lat != null && lng != null ? { lat, lng } : null;
    } catch (e) { return null; } finally { clearTimeout(tm); }
  }
  // 장소를 찾으면 { lat, lng, name }, 못 찾으면 null. 먼저 장소 전체, 안 되면 마지막 낱말로 한 번 더 찾습니다(1초에 한 번 이하).
  async function find(text, ms = 4500) {
    const q = place(text); if (!q) return null;
    const c = cacheGet(q); if (c) return { lat: c.lat, lng: c.lng, name: q, cached: true };
    const t0 = Date.now(), tries = [q], tail = q.split(" ").pop();
    if (tail !== q && tail.length >= 2) tries.push(tail);
    for (const s of tries) {
      const left = ms - (Date.now() - t0); if (left < 600) break;
      const r = await ask(s, left);
      if (r) { cachePut(q, r); return { lat: r.lat, lng: r.lng, name: q }; }
    }
    return null;
  }
  // 직선거리가 가까운 응급실 n곳(국립중앙의료원 위치 기반 조회와 같은 기준)
  function nearest(lat, lng, n = 10) {
    const o = { lat, lng };
    return ER.map(e => ({ e, d: distKm(o, e) })).sort((a, b) => a.d - b.d).slice(0, n).map(({ e, d }) => Object.assign({ km: Math.round(d * 100) / 100, kind: CLS[e.cls] }, e));
  }
  const inSido = s => ER.filter(e => e.sido === s).length;
  return { ER, CLS, place, find, nearest, inSido };
})();
