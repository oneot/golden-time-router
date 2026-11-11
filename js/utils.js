"use strict";
// ── 공통 함수 ──────────────────────────────────────────────
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const TAU = Math.PI * 2, D2R = Math.PI / 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const now = () => performance.now();
const E = { out: t => 1 - Math.pow(1 - t, 3), out5: t => 1 - Math.pow(1 - t, 5), inOut: t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2, in: t => t * t * t, sine: t => .5 - .5 * Math.cos(Math.PI * t), back: t => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2) };
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
const MOBILE = () => matchMedia("(max-width: 760px)").matches;
const FONT = "'Pretendard Variable', Pretendard, -apple-system, sans-serif";
const MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
const pad2 = n => String(n).padStart(2, "0");
const fmtT = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return pad2(Math.floor(s / 60)) + ":" + pad2(s % 60); };
const fmtKm = k => k < 1 ? Math.round(k * 1000) + "m" : Math.round(k * 10) / 10 + "km";
const num = v => { if (v == null || v === "") return null; const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, "")); return Number.isFinite(n) ? n : null; };
const rgba = (c, a) => "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")";
const hasJong = s => { const c = String(s).charCodeAt(String(s).length - 1); return c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28 > 0; };
function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function say(msg) { const l = $("#live"); l.textContent = ""; setTimeout(() => { l.textContent = msg; }, 40); }
function shortName(n) {
  let s = String(n || "").trim();
  s = s.replace(/^(의료법인|재단법인|학교법인|사회복지법인|사단법인)\s*/, "");
  let m = s.match(/^.*?의료재단\s*(.+)$/); if (m && m[1].length > 2) s = m[1];
  m = s.match(/^[가-힣]{2,12}?(?:학원|재단|공단)\s*(.+(?:병원|의료원|센터))$/); if (m && m[1].length >= 4) s = m[1];
  s = s.replace(/대학교(?:의과대학)?(?:부속)?\s*(?=병원$)/, "대").replace(/대학교(?:의과대학)?(?:부속)?\s*/, "대 ");
  m = s.match(/^(?:서울특별시|부산광역시|대구광역시|인천광역시|광주광역시|대전광역시|울산광역시)립?\s*(.+)$/); if (m && m[1].length >= 4) s = m[1];
  return s.trim() || String(n);
}

const ST = { "추천": "rec", "대안": "alt", "보류": "hold", "제외": "out" };
const ST_TXT = { rec: "추천", alt: "대안", hold: "보류", out: "제외" };
const ST_ORDER = { rec: 0, alt: 1, hold: 2, out: 3 };
// 지도 색: 강조는 코랄 하나, 나머지는 은색 계열로 절제합니다.
const COL = { rec: [255, 123, 107], alt: [214, 219, 228], hold: [233, 179, 95], out: [128, 133, 143], origin: [255, 255, 255], ink: [7, 8, 11] };

// 병원 목록을 화면에서 쓰는 모양으로 정리합니다(순위 1~3 다시 매기기, 출발지에서 직선거리 계산).
// chk(확인 필요): 보류이거나, 추천·대안인데 가용 병상이 0 이하·정보 없음 또는 수용 제한 메시지(기간 표기)가 있는 곳. 에이전트 지침 3·4번처럼 순위를 뒤로 미는 조건입니다.
function normalize(d) {
  if (!d || !Array.isArray(d.hospitals)) return null;
  const o = d.origin || {};
  const hs = d.hospitals.filter(x => x && x.name).map((x, i) => {
    let rank = Math.round(num(x.rank) || 0);
    const st = ST[String(x.status || "").trim()] || (rank > 0 ? "rec" : "alt");
    if (st !== "rec") rank = 0; else if (rank < 1) rank = 99;
    return { i, name: String(x.name), short: shortName(x.name), rank, st, lat: num(x.lat), lng: num(x.lng), km: num(x.km), road: num(x.road), min: num(x.min), sec: num(x.sec), beds: num(x.beds), restr: !!x.restr, time: x.time ? String(x.time) : null, tel: x.tel ? String(x.tel) : null, note: x.note ? String(x.note) : "" };
  });
  if (!hs.length) return null;
  const oo = { lat: num(o.lat), lng: num(o.lng) };
  if (oo.lat != null && oo.lng != null) hs.forEach(x => { if (x.km == null && x.lat != null && x.lng != null) x.km = Math.round(distKm(oo, x) * 100) / 100; });
  hs.filter(x => x.st === "rec").sort((a, b) => a.rank - b.rank || (a.min ?? 1e9) - (b.min ?? 1e9)).forEach((x, k) => { if (k < 3) x.rank = k + 1; else { x.rank = 0; x.st = "alt"; } });
  hs.forEach(x => {
    x.chk = x.st === "hold" || (x.st !== "out" && (x.beds == null || x.beds <= 0 || x.restr));
    x.why = !x.chk ? "" : x.restr ? "수용 제한" : x.beds == null ? "병상 정보 없음" : x.beds <= 0 ? "병상 " + x.beds : "확인 필요";
  });
  return { origin: { name: String(o.name || "기준 위치"), address: o.address ? String(o.address) : "", lat: num(o.lat), lng: num(o.lng), est: !!o.est }, need: d.need ? String(d.need) : "", hs, partial: !!d.partial };
}
// 답변 글(1~3순위·보류·제외)에서 읽을 수 있는 만큼 읽습니다.
function parseMd(text) {
  if (typeof text !== "string" || !/\*\*\s*[1-3]\s*순위/.test(text)) return null;
  const d = { origin: {}, need: "", hospitals: [], partial: true };
  let m = text.match(/필요한 치료\s*[:：]\s*([^\n]+)/); if (m) d.need = m[1].replace(/\*+/g, "").trim();
  m = text.match(/기준 위치\s*[:：]\s*([^\n(]+?)\s*(?:\(([^)\n]+)\))?\s*$/m); if (m) { d.origin.name = m[1].replace(/\*+/g, "").trim(); d.origin.address = (m[2] || "").trim(); }
  let cur = null, sect = null;
  const entry = (s, st) => {
    const t = s.replace(/\*+/g, "").trim(); if (!t) return;
    const k = t.search(/\s[–—-]\s/), names = (k > 0 ? t.slice(0, k) : t).split(/\s*,\s*/), why = k > 0 ? t.slice(k).replace(/^\s*[–—-]\s*/, "") : "";
    const mm = why.match(/예상\s*(\d+)\s*분/), bb = why.match(/병상\s*(-?\d+)/);
    names.filter(n => n && n.length < 40).forEach(n => d.hospitals.push({ rank: 0, status: st, name: n.trim(), min: mm ? +mm[1] : null, beds: bb ? +bb[1] : null, restr: /\d{4}-\d{2}-\d{2}/.test(why), note: why.split(/[·.(]/)[0].trim().slice(0, 30) }));
  };
  for (const ln of text.split(/\r?\n/)) {
    const t = ln.trim(); let x;
    if ((x = t.match(/^\*\*\s*([1-3])\s*순위\s*[:：]?\s*(.+?)\s*\*\*$/))) { cur = { rank: +x[1], status: "추천", name: x[2].trim() }; d.hospitals.push(cur); sect = null; continue; }
    if ((x = t.match(/^\*\*(보류|제외)\*\*\s*[:：]?\s*(.*)$/))) { cur = null; sect = x[1]; if (x[2]) entry(x[2], sect); continue; }
    if (/^[-*•]\s+/.test(t)) {
      const s = t.replace(/^[-*•]\s+/, "");
      if (cur) {
        if ((x = s.match(/예상\s*(\d+(?:\.\d+)?)\s*분/))) cur.min = +x[1];
        if ((x = s.match(/거리\s*(\d+(?:\.\d+)?)\s*km/))) cur.km = +x[1];
        if ((x = s.match(/가용\s*병상\s*(-?\d+)/))) cur.beds = +x[1];
        if ((x = s.match(/(\d{1,2}:\d{2})\s*기준/))) cur.time = x[1];
        if ((x = s.match(/^근거\s*[:：]\s*(.+)$/))) { cur.note = x[1].slice(0, 40); cur.restr = /\d{4}-\d{2}-\d{2}/.test(x[1]); }
        if ((x = s.match(/☎\s*([0-9+][0-9\- ]{6,})/))) cur.tel = x[1].trim();
        if ((x = s.match(/map\.kakao\.com\/link\/to\/[^)]*?,\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\)/))) { cur.lat = +x[1]; cur.lng = +x[2]; }
      } else if (sect) entry(s, sect);
      continue;
    }
    if (t) { cur = null; if (!/^\*\*(보류|제외)/.test(t)) sect = null; }
  }
  return d.hospitals.some(x => x.rank) ? d : null;
}

// ── 에이전트 답 읽기 ─────────────────────────────────────────
// 답 끝의 ```json 한 줄(웹앱용 데이터)은 지도와 순위판에 쓰고, 나머지 글은 브리핑에 보여 줍니다.
function parseLoose(s) {
  const t = String(s).trim();
  const tries = [t, t.replace(/,\s*([}\]])/g, "$1"), t.replace(/[\u201c\u201d]/g, '"').replace(/,\s*([}\]])/g, "$1")];
  for (const x of tries) { try { return JSON.parse(x); } catch (e) { } }
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1).replace(/,\s*([}\]])/g, "$1")); } catch (e) { } }
  return null;
}
function extract(text) {
  const out = { text, data: null, changed: false };
  if (typeof text !== "string") return out;
  const re = /```[ \t]*(?:json)?[ \t]*\r?\n?([\s\S]*?)```/gi;
  let m, hit = null;
  while ((m = re.exec(text))) if (/"(?:h|hospitals)"\s*:/.test(m[1])) hit = { s: m.index, e: re.lastIndex, b: m[1] };
  if (!hit) { const r = text.match(/\n[ \t]*(\{\s*"(?:o|origin)"\s*:[^\n]*\})[ \t]*$/); if (r) hit = { s: r.index, e: text.length, b: r[1] }; }
  if (hit) { out.data = parseLoose(hit.b); out.text = (text.slice(0, hit.s) + text.slice(hit.e)).replace(/\s+$/, ""); out.changed = true; return out; }
  const open = text.search(/```[ \t]*(?:json)?[ \t]*\r?\n?\s*\{/i);
  if (open >= 0 && text.indexOf("```", open + 3) < 0) { out.text = text.slice(0, open).replace(/\s+$/, ""); out.changed = true; }
  return out;
}
// 압축 형식 {"o":[위도,경도],"h":[["병원명","판정",위도,경도,소요초,병상],…]}
function fromCompact(j) {
  const o = Array.isArray(j.o) ? j.o : [];
  const hospitals = j.h.filter(r => Array.isArray(r) && r[0]).map(r => {
    const v = String(r[1] == null ? "" : r[1]).trim(), m = v.match(/^(?:추천\s*)?([1-3])(?:\s*순위)?$/), sec = num(r[4]);
    return { name: String(r[0]), status: m ? "추천" : v, rank: m ? +m[1] : 0, lat: num(r[2]), lng: num(r[3]), sec, min: sec != null ? Math.round(sec / 60) : null, beds: num(r[5]) };
  });
  return { origin: { lat: num(o[0]), lng: num(o[1]) }, need: "", hospitals, partial: false };
}
const nameKey = s => String(s || "").replace(/\s+/g, "").replace(/^(?:의료법인|재단법인|학교법인|사회복지법인|사단법인)/, "");
const sameName = (a, b) => { const x = nameKey(a), y = nameKey(b); return !!x && !!y && (x === y || x.includes(y) || y.includes(x)); };
// 지도 데이터에 답변 글의 순위·소요 시간·전화·근거를 덧붙입니다. 화면 숫자가 브리핑과 같도록 답변 글을 따릅니다.
function mergeMd(d, md) {
  const o = d.origin;
  if (!o.name) o.name = md.origin.name;
  if (!o.address) o.address = md.origin.address;
  if (!d.need) d.need = md.need;
  if (md.hospitals.some(x => x.rank)) d.hospitals.forEach(x => { if (x.status === "추천") { x.status = "대안"; x.rank = 0; } });
  md.hospitals.forEach(m => {
    const x = d.hospitals.find(y => sameName(y.name, m.name));
    if (!x) { if (m.rank) d.hospitals.push(Object.assign({}, m)); return; }
    if (m.rank) { x.status = "추천"; x.rank = m.rank; } else if (m.status) x.status = m.status;
    ["min", "km", "beds", "time", "tel", "note", "restr"].forEach(k => { if (m[k] != null && m[k] !== "") x[k] = m[k]; });
    if (x.lat == null && m.lat != null) { x.lat = m.lat; x.lng = m.lng; }
  });
  return d;
}
function distKm(a, b) {
  const dLat = (b.lat - a.lat) * D2R, dLng = (b.lng - a.lng) * D2R;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * D2R) * Math.cos(b.lat * D2R) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(s));
}
// 지도 데이터가 없을 때: 답변 글의 병원 좌표(지도 링크)와 직선거리로 출발지를 추정합니다(삼변측량).
// 병원이 일직선에 가까우면 선 반대편에도 비슷한 점이 생기므로, 격자로 가장 잘 맞는 점을 찾고 반대편 후보보다 확실히 나을 때만 씁니다.
function estimateOrigin(list) {
  const P = list.filter(x => x.lat != null && x.lng != null && x.km > 0);
  if (P.length < 3) return null;
  const lat0 = P.reduce((s, x) => s + x.lat, 0) / P.length, lng0 = P.reduce((s, x) => s + x.lng, 0) / P.length;
  const kx = Math.cos(lat0 * D2R) * 111.32, ky = 110.574;
  const pts = P.map(x => ({ x: (x.lng - lng0) * kx, y: (x.lat - lat0) * ky, d: x.km }));
  const err = (x, y) => Math.sqrt(pts.reduce((s, p) => s + (Math.hypot(x - p.x, y - p.y) - p.d) ** 2, 0) / pts.length);
  const R = Math.max(...pts.map(p => p.d)) + 1, step = Math.max(0.02, R / 150);
  let bx = 0, by = 0, be = Infinity;
  for (let x = -R; x <= R; x += step) for (let y = -R; y <= R; y += step) { const e = err(x, y); if (e < be) { be = e; bx = x; by = y; } }
  for (let it = 0; it < 30; it++) {
    let J11 = 0, J12 = 0, J22 = 0, g1 = 0, g2 = 0;
    for (const p of pts) { const dx = bx - p.x, dy = by - p.y, r = Math.hypot(dx, dy) || 1e-6, e = r - p.d, ux = dx / r, uy = dy / r; J11 += ux * ux; J12 += ux * uy; J22 += uy * uy; g1 += ux * e; g2 += uy * e; }
    const dd = J11 * J22 - J12 * J12; if (dd < 1e-9) break;
    const sx = (J22 * g1 - J12 * g2) / dd, sy = (J11 * g2 - J12 * g1) / dd; bx -= sx; by -= sy;
    if (Math.hypot(sx, sy) < 1e-5) break;
  }
  be = err(bx, by);
  let alt = Infinity;
  for (let x = -R; x <= R; x += step) for (let y = -R; y <= R; y += step) if (Math.hypot(x - bx, y - by) > 0.3) alt = Math.min(alt, err(x, y));
  if (!(be < 0.15) || alt < Math.max(0.012, be * 3)) return null;
  return { lat: lat0 + by / ky, lng: lng0 + bx / kx };
}
// 데이터 한 줄이 있으면 지도 전체, 없으면 답변 글에서 읽은 요약(partial)을 돌려줍니다.
function readAnswer(text) {
  const r = extract(text), md = parseMd(r.text), j = r.data;
  let d = j && Array.isArray(j.h) ? fromCompact(j) : j && Array.isArray(j.hospitals) ? j : null;
  if (d) { d.origin = d.origin || {}; if (md) mergeMd(d, md); d.partial = false; }
  else if (md) { d = md; const o = estimateOrigin(md.hospitals); if (o) Object.assign(md.origin, o, { est: true }); }
  return { text: r.text, changed: r.changed, data: normalize(d) };
}

// 지구본 육지: data/land.js의 줄별 길이(바다·육지 번갈아)를 풀어 위도·경도가 육지인지 알려 줍니다.
const LANDMAP = (() => {
  const { w, h, rle } = LAND, s = atob(rle), m = new Uint8Array(w * h);
  let k = 0;
  for (let j = 0; j < h; j++) {
    let x = 0, land = 0;
    while (x < w && k < s.length) {
      let n = 0, sh = 0, b;
      do { b = s.charCodeAt(k++); n |= (b & 127) << sh; sh += 7; } while (b & 128);
      if (land) m.fill(1, j * w + x, j * w + x + n);
      x += n; land ^= 1;
    }
  }
  return m;
})();
function isLand(lat, lon) { const { w, h } = LAND, i = clamp(Math.floor((lon + 180) / 360 * w), 0, w - 1), j = clamp(Math.floor((90 - lat) / 180 * h), 0, h - 1); return LANDMAP[j * w + i]; }
