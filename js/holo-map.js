"use strict";
// ── 실시간 지도 ─────────────────────────────────────────────
// 대기: 은색 점묘 지구본이 돌고, 곳곳에서 짧은 은색 선이 흩날립니다. 한국에는 전국 응급실 530곳이 실제 위치에 불빛으로 켜집니다.
// 질문: 지구본이 한국으로 내려앉아 한반도 점 지도(응급실 530곳)로 바뀌고, 웹앱이 찾은 출발지에 핀이 꽂힙니다.
// 기다리는 동안: 출발지로 날아들어 직선거리가 가까운 응급실 10곳(워크플로와 같은 기준)에 조회선을 긋습니다.
// 답이 오면 에이전트의 판단 순서대로: ① 치료 불가 제외 ② 병상·수용 제한은 확인 필요 ③ 남은 곳으로 실제 소요 시간만큼 달려 도착 ④ 1~3순위 경로.
// 점은 WebGL(#holoGL), 선·병원·라벨은 2D 캔버스(#holo)에 그립니다. WebGL이 없으면 점을 2D로 줄여 그립니다.
const Holo = (() => {
  const stage = $("#holoPanel"), glc = $("#holoGL"), cv = $("#holo"), ctx = cv.getContext("2d"), tipEl = $("#tip");
  const D0 = 4, KOREA = [36.3, 127.8], KBOX = [33.05, 38.7, 124.55, 131.95], KC = [(KBOX[0] + KBOX[1]) / 2, (KBOX[2] + KBOX[3]) / 2];
  // 테마별 색. 다크는 먹색 바탕에 흰색·은색, 라이트는 종이 바탕에 먹색입니다. 코랄(추천)·호박(확인 필요)·회색(제외)은 두 테마에서 뜻이 같습니다.
  // gl*: 셰이더 점 색(0~1), t*: 병원 주변 점 구름(기본 · 제외 · 확인 필요 · 추천)
  const PALS = {
    dark: { ink: [255, 255, 255], silver: COL.alt, warm: [246, 241, 233], coral: COL.rec, amber: COL.hold, gray: COL.out, sand: [240, 201, 138], halo: [7, 8, 11], chip: [9, 10, 14], chipA: .86, pulse: [255, 226, 220], dots: [214, 221, 235], hot: [255, 153, 133],
      glInk: [.84, .87, .93], glHot: [1, .6, .52], tb: [.84, .87, .93], tg: [.5, .52, .56], ta: [.91, .7, .37], tc: [1, .48, .42],
      nm: [214, 219, 228, .85], nmTop: [255, 255, 255, .97], nmOut: [140, 145, 155, .75], nmChk: [233, 179, 95, .95], rankNo: [255, 164, 151], amberT: COL.hold, grayT: COL.out, erGlow: .55, erR: 1.25, erA: 1, erAs: [1, .86, .68, .48], erHalo: 0, d2: 1, koff: [.3, .2, .08] },
    light: { ink: [17, 18, 22], silver: [86, 92, 104], warm: [26, 27, 33], coral: [226, 82, 62], amber: [188, 120, 18], gray: [152, 156, 164], sand: [146, 92, 14], halo: [244, 243, 240], chip: [255, 255, 255], chipA: .94, pulse: [150, 26, 14], dots: [40, 44, 52], hot: [224, 80, 60],
      glInk: [.07, .075, .09], glHot: [.89, .32, .24], tb: [.07, .075, .09], tg: [.6, .61, .64], ta: [.74, .47, .07], tc: [.89, .32, .24],
      nm: [44, 47, 54, .86], nmTop: [17, 18, 22, .97], nmOut: [128, 132, 140, .85], nmChk: [146, 92, 14, .95], rankNo: [192, 57, 43], amberT: [146, 92, 14], grayT: [128, 132, 140], erGlow: 0, erR: 1.2, erA: 1, erAs: [1, .96, .9, .82], erHalo: 1, d2: 1.7, koff: [.4, .24, .1] }
  };
  let THEME = "dark", PAL = PALS.dark, INK, SILVER, WARM, CORAL, AMBER, GRAY, SAND;
  const LIGHT = (() => { const l = [-.42, .55, .72], n = Math.hypot(...l); return l.map(x => x / n); })();
  const ER_R = [2.4, 1.8, 1.35, 1.05];
  const B1 = 350, B2 = 950, B3 = 1550;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const mix3 = (a, b, p) => [a[0] + (b[0] - a[0]) * p, a[1] + (b[1] - a[1]) * p, a[2] + (b[2] - a[2]) * p];
  const wrapLng = x => ((x % 360) + 540) % 360 - 180;
  let W = 1, H = 1, DPR = 1, cx = 0, cy = 0, R0 = 100, raf = 0, last = now(), G2 = null, GP = null, KP = null, FP = null, bufG = null, bufK = null, bufF = null, KOFF = null;
  // G 지구본 · C 평면 지도 카메라(lk = log(화면 px/km)) · F 출발지 주변 점
  const G = { lon0: 96 * D2R, lat0: 24 * D2R, zoom: 1, dist: D0, alpha: 1, intro: 0, spin: 1, flow: 1, fp: 0, drift: 0, label: 0 };
  const C = { lat: KC[0], lng: KC[1], lk: 0, alpha: 0, lock: 0 };
  const F = { alpha: 0, bloom: 0 };
  const S = { phase: "globe", ep: 0, dive: null, fly: null, origin: null, oname: "", meta: null, nodes: [], gone: [], nodeEr: new Set(), data: null, res: null, qo: null, ring: null, ringLabs: [], chip: null, nearest: null, approx: false, na: 0, lz: 0, o2: [0, 0], stage: 0, sel: null, hov: null, pick: null, onBeat: null, tracers: [], nextTracer: 0, pinAt: 0, lt0: 0, arrived: 0, rt0: 0, fsig: "", tint: new Float32Array(64) };
  const M = new Float32Array(9), MG = new Float32Array(9), BA = new Float32Array(9), BB = new Float32Array(9), tmp = [0, 0, 0, 0];
  // 불빛(glow)과 응급실 점(dot) 그림. 라이트에서는 불빛 대신 옅은 먹 번짐입니다.
  const SPRS = (() => {
    const mk = (n, f) => { const c = document.createElement("canvas"); c.width = c.height = n; f(c.getContext("2d"), n); return c; };
    const rad = (stops) => (g, n) => { const r = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2); stops.forEach(([o, c]) => r.addColorStop(o, c)); g.fillStyle = r; g.fillRect(0, 0, n, n); };
    const set = (glow, dot) => ({ glow: mk(64, rad(glow)), dot: mk(32, rad(dot)) });
    return {
      dark: set([[0, "rgba(255,232,218,.6)"], [.3, "rgba(255,222,206,.18)"], [1, "rgba(255,222,206,0)"]], [[0, "rgba(250,246,240,1)"], [.55, "rgba(250,246,240,.96)"], [1, "rgba(250,246,240,0)"]]),
      light: set([[0, "rgba(36,28,24,.2)"], [.3, "rgba(36,28,24,.06)"], [1, "rgba(36,28,24,0)"]], [[0, "rgba(22,23,28,1)"], [.55, "rgba(22,23,28,.96)"], [1, "rgba(22,23,28,0)"]])
    };
  })();
  let SPR = SPRS.dark;
  // 테마 바꾸기: 색·그림만 바꾸고 장면(단계·카메라·예약)은 그대로 이어 갑니다.
  function setTheme(t) {
    THEME = t === "light" ? "light" : "dark"; PAL = PALS[THEME]; SPR = SPRS[THEME];
    INK = PAL.ink; SILVER = PAL.silver; WARM = PAL.warm; CORAL = PAL.coral; AMBER = PAL.amber; GRAY = PAL.gray; SAND = PAL.sand;
    if (!G2 && KOFF) buildKoff();
    if (REDUCED && W > 1) frame(now());
  }
  setTheme(document.documentElement.dataset.theme);

  // ── 시간 변화 ──
  const tweens = [];
  function tween(o, k, to, ms, fn = E.inOut, delay = 0) {
    for (let i = tweens.length - 1; i >= 0; i--) if (tweens[i].o === o && tweens[i].k === k) tweens.splice(i, 1);
    if (REDUCED || ms <= 0) { o[k] = to; return; }
    tweens.push({ o, k, to, ms, fn, t0: now() + delay, from: null });
  }
  function runTweens(t) {
    for (let i = tweens.length - 1; i >= 0; i--) {
      const w = tweens[i]; if (t < w.t0) continue;
      if (w.from === null) w.from = w.o[w.k];
      const p = clamp((t - w.t0) / w.ms, 0, 1); w.o[w.k] = w.from + (w.to - w.from) * w.fn(p);
      if (p >= 1) tweens.splice(i, 1);
    }
  }
  // 예약 실행: 새 질문·초기화가 오면(ep가 바뀌면) 예전 예약은 버립니다.
  function later(ms, fn) { const ep = S.ep; setTimeout(() => { if (S.ep === ep) fn(); }, REDUCED ? 0 : ms); }
  const shortest = (from, toDeg) => { const tl = toDeg * D2R; return from + ((((tl - from) % TAU) + TAU * 1.5) % TAU) - Math.PI; };

  // ── 지구본 카메라와 투영(셰이더와 같은 식) ──
  function updateRot(t) {
    const lon = G.lon0 + G.drift * Math.sin(t * .00016), lat = G.lat0 + G.drift * .45 * Math.cos(t * .00013);
    const c1 = Math.cos(lon), s1 = Math.sin(lon), c2 = Math.cos(lat), s2 = Math.sin(lat);
    M.set([c1, 0, -s1, -s2 * s1, c2, -s2 * c1, c2 * s1, s2, c2 * c1]);
    MG.set([M[0], M[3], M[6], M[1], M[4], M[7], M[2], M[5], M[8]]);
    bandMat(.47, -.42 + .06 * Math.sin(t * .00005), BA); bandMat(.6, .5 + .05 * Math.cos(t * .00004), BB);
  }
  const focal = () => R0 * G.zoom * D0;
  const silR = () => focal() / Math.sqrt(Math.max(G.dist * G.dist - 1, 1e-3));
  function gproj(x, y, z, o) {
    const vx = M[0] * x + M[1] * y + M[2] * z, vy = M[3] * x + M[4] * y + M[5] * z, vz = M[6] * x + M[7] * y + M[8] * z;
    const den = Math.max(G.dist - vz, .06), s = focal() / den, hz = 1 / G.dist * smooth(2.2, 1.4, G.dist);
    o[0] = cx + vx * s; o[1] = cy - vy * s; o[2] = vz; o[3] = vz < hz && Math.hypot(vx * s, vy * s) < silR() ? 0 : 1;
    return o;
  }
  // 지구본 중심 근처 1km가 화면에서 몇 px인지, 그리고 그 배율이 되는 카메라 거리
  const globeKd = () => focal() / (Math.max(G.dist - 1, .02) * 6371);
  const distFor = k => 1 + focal() / (6371 * k);
  // 카메라 거리는 (거리 − 1)의 로그로 바꿔야 확대 속도가 고르게 느껴집니다.
  function dive(to, ms, delay = 0) { if (REDUCED || ms <= 0) { G.dist = to; S.dive = null; return; } S.dive = { t0: now() + delay, ms, a: Math.log(G.dist - 1), b: Math.log(to - 1) }; }
  function updateDive(t) { const d = S.dive; if (!d || t < d.t0) return; const p = clamp((t - d.t0) / d.ms, 0, 1); G.dist = 1 + Math.exp(d.a + (d.b - d.a) * E.inOut(p)); if (p >= 1) S.dive = null; }

  // ── 평면 지도 카메라 ──
  const kd = () => Math.exp(C.lk);
  function projAt(lat0, lng0, k, lat, lng, o) { o[0] = cx + (lng - lng0) * Math.cos(lat0 * D2R) * 111.32 * k; o[1] = cy - (lat - lat0) * 110.574 * k; return o; }
  const proj = (lat, lng, o = [0, 0]) => projAt(C.lat, C.lng, Math.exp(C.lk), lat, lng, o);
  const kmXY = (o, lat, lng) => [(lng - o.lng) * Math.cos(o.lat * D2R) * 111.32, (lat - o.lat) * 110.574];
  function fitKorea() { const hk = (KBOX[1] - KBOX[0]) * 110.574, wk = (KBOX[3] - KBOX[2]) * Math.cos(KC[0] * D2R) * 111.32; return Math.min(H * .84 / hk, W * .9 / wk); }
  const fieldR = () => Math.min(W, H) * .4;
  function niceStep(m) { for (const s of [.1, .2, .25, .5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100]) if (m / s <= 4.2) return s; return 200; }
  function localFrame(nodes) {
    let mk = .3; for (const n of nodes) mk = Math.max(mk, Math.hypot(n.dx, n.dy));
    const step = niceStep(mk * 1.06), rings = Math.max(1, Math.ceil(mk * 1.06 / step));
    return { step, rings, k: fieldR() / (rings * step) };
  }
  // 카메라 이동: 확대할 때는 도착점이, 축소할 때는 출발점이 화면에서 곧게 움직이도록 중심을 보간합니다.
  function flyTo(lat, lng, k1, ms, done) {
    const a = { lat: C.lat, lng: C.lng, lk: C.lk }, b = { lat, lng, lk: Math.log(k1) };
    if (REDUCED || ms <= 0) { C.lat = lat; C.lng = lng; C.lk = b.lk; S.fly = null; if (done) done(); return; }
    S.fly = { t0: now(), ms, a, b, done, ep: S.ep };
  }
  function updateFly(t) {
    const f = S.fly; if (!f) return;
    const p = clamp((t - f.t0) / f.ms, 0, 1), e = E.inOut(p), lk = f.a.lk + (f.b.lk - f.a.lk) * e;
    const u = f.b.lk > f.a.lk + 1e-3 ? 1 - Math.exp(f.a.lk - lk) * (1 - e) : f.b.lk < f.a.lk - 1e-3 ? e * Math.exp(f.b.lk - lk) : e;
    C.lat = f.a.lat + (f.b.lat - f.a.lat) * u; C.lng = f.a.lng + (f.b.lng - f.a.lng) * u; C.lk = lk;
    if (p >= 1) { S.fly = null; if (f.done && f.ep === S.ep) f.done(); }
  }
  function curve(x0, y0, x1, y1, bend) { const qx = (x0 + x1) / 2 - (y1 - y0) * bend, qy = (y0 + y1) / 2 + (x1 - x0) * bend, N = 48, P = new Float32Array((N + 1) * 2); for (let i = 0; i <= N; i++) { const u = i / N, v = 1 - u; P[i * 2] = v * v * x0 + 2 * v * u * qx + u * u * x1; P[i * 2 + 1] = v * v * y0 + 2 * v * u * qy + u * u * y1; } return P; }
  function poly(P, m, i0 = 0) { ctx.beginPath(); ctx.moveTo(P[i0 * 2], P[i0 * 2 + 1]); for (let i = i0 + 1; i <= m; i++) ctx.lineTo(P[i * 2], P[i * 2 + 1]); }
  function ring(x, y, r, col, a, lw) { if (a <= .003 || r <= 0) return; ctx.strokeStyle = rgba(col, a); ctx.lineWidth = lw * DPR; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke(); }
  function dot(x, y, r, col, a) { if (a <= .003 || r <= 0) return; ctx.fillStyle = rgba(col, a); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
  function xmark(x, y, s, col, a) { if (a <= .003) return; ctx.strokeStyle = rgba(col, a); ctx.lineWidth = 1.25 * DPR; ctx.beginPath(); ctx.moveTo(x - s, y - s); ctx.lineTo(x + s, y + s); ctx.moveTo(x + s, y - s); ctx.lineTo(x - s, y + s); ctx.stroke(); }
  function text(s, x, y, font, col, a, align = "left") { if (a <= .003) return; ctx.font = font; ctx.textAlign = align; ctx.textBaseline = "middle"; ctx.lineJoin = "round"; ctx.globalAlpha = 1; ctx.lineWidth = 4 * DPR; ctx.strokeStyle = rgba(PAL.halo, .9 * Math.min(1, a * 1.4)); ctx.strokeText(s, x, y); ctx.fillStyle = rgba(col, a); ctx.fillText(s, x, y); }
  // ── 지구본: 흩날리는 은색 선(분위기 연출)과 한국 표시 ──
  function arcPoints(a, b, lift) {
    const A = vec(a[0], a[1]), B = vec(b[0], b[1]), w = Math.acos(clamp(A[0] * B[0] + A[1] * B[1] + A[2] * B[2], -1, 1)), sw = Math.sin(w) || 1, n = 40, P = new Float32Array((n + 1) * 3);
    for (let i = 0; i <= n; i++) {
      const u = i / n, f1 = Math.sin((1 - u) * w) / sw, f2 = Math.sin(u * w) / sw, hh = 1 + Math.sin(Math.PI * u) * lift;
      P[i * 3] = (f1 * A[0] + f2 * B[0]) * hh; P[i * 3 + 1] = (f1 * A[1] + f2 * B[1]) * hh; P[i * 3 + 2] = (f1 * A[2] + f2 * B[2]) * hh;
    }
    return P;
  }
  // 선은 어디로도 모이지 않습니다: 보이는 쪽 육지 아무 데서나 짧게 그려졌다 사라집니다(한국 주변은 비워 둠).
  function spawnTracer(t) {
    for (let k = 0; k < 14; k++) {
      const la = -46 + Math.random() * 116, lo = -180 + Math.random() * 360;
      if (!isLand(la, lo) || Math.abs(la - KOREA[0]) + Math.abs(wrapLng(lo - KOREA[1])) < 14) continue;
      const v = vec(la, lo); if (M[6] * v[0] + M[7] * v[1] + M[8] * v[2] < .25) continue;
      const len = 6 + Math.random() * 18, br = Math.random() * TAU, la2 = clamp(la + Math.sin(br) * len, -70, 80), lo2 = lo + Math.cos(br) * len / Math.max(.25, Math.cos(la * D2R));
      if (Math.abs(la2 - KOREA[0]) + Math.abs(wrapLng(lo2 - KOREA[1])) < 16) continue;
      S.tracers.push({ P: arcPoints([la, lo], [la2, lo2], .012 + Math.random() * .03), t0: t, dur: 1300 + Math.random() * 900, hold: 250, fade: 900, a: .45 + Math.random() * .55 });
      break;
    }
    S.nextTracer = t + 260 + Math.random() * 420;
    if (S.tracers.length > 12) S.tracers.shift();
  }
  function drawTracer(tr, t) {
    const e = t - tr.t0, p = clamp(e / tr.dur, 0, 1), fa = (e > tr.dur + tr.hold ? clamp(1 - (e - tr.dur - tr.hold) / tr.fade, 0, 1) : 1) * tr.a * G.alpha;
    if (fa <= .003) { if (e > tr.dur + tr.hold + tr.fade) tr.dead = true; return; }
    const n = tr.P.length / 3 - 1, head = Math.max(1, Math.round(n * E.inOut(p))), pts = [];
    for (let i = 0; i <= head; i++) { gproj(tr.P[i * 3], tr.P[i * 3 + 1], tr.P[i * 3 + 2], tmp); pts.push(tmp[0], tmp[1], tmp[3]); }
    ctx.lineCap = "round"; ctx.lineWidth = 1.1 * DPR;
    for (let i = 1; i <= head; i++) {
      if (!pts[i * 3 + 2] || !pts[i * 3 - 1]) continue;
      const u = i / head; ctx.strokeStyle = rgba(INK, (.04 + .8 * u * u) * fa);
      ctx.beginPath(); ctx.moveTo(pts[i * 3 - 3], pts[i * 3 - 2]); ctx.lineTo(pts[i * 3], pts[i * 3 + 1]); ctx.stroke();
    }
    if (p < 1 && pts[head * 3 + 2]) { const hx = pts[head * 3], hy = pts[head * 3 + 1], r = 7 * DPR; ctx.globalAlpha = .5 * fa; ctx.drawImage(SPR.glow, hx - r, hy - r, r * 2, r * 2); ctx.globalAlpha = 1; dot(hx, hy, 1.4 * DPR, INK, fa); }
  }
  function drawKoreaLabel() {
    const v = vec(KOREA[0], KOREA[1]); gproj(v[0], v[1], v[2], tmp);
    const a = G.label * G.alpha * G.intro * smooth(.3, .6, tmp[2]); if (a <= .01 || !tmp[3]) return;
    const t1 = "대한민국 응급실 " + Geo.ER.length + "곳", f1 = "600 " + 12 * DPR + "px " + FONT;
    ctx.font = f1; const tw = ctx.measureText(t1).width;
    // 글자는 늘 한국 오른쪽 위에 적되, 화면 밖으로 나가면 안쪽으로 당깁니다(좁은 화면에서 지구본 대륙 위를 덮지 않게).
    const x = tmp[0] + 8 * DPR, y = tmp[1] - 6 * DPR, ly = y - 26 * DPR, tx = Math.min(x + 50 * DPR, W - 10 * DPR - tw), ex = Math.min(x + 30 * DPR, tx - 20 * DPR);
    ctx.strokeStyle = rgba(INK, .32 * a); ctx.lineWidth = DPR; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ly); ctx.lineTo(tx - 6 * DPR, ly); ctx.stroke();
    text(t1, tx, ly, f1, INK, .92 * a);
  }

  // ── 한반도 지도: 전국 응급실과 출발지 핀 ──
  function drawERs(t) {
    const k = kd(), kN = fitKorea(), sc = clamp(1 + .28 * Math.log(Math.max(1, k / kN)), 1, 2), dim = 1 - .72 * smooth(.3, .85, S.lz), skip = S.na > .02 ? S.nodeEr : null;
    const p = [0, 0], A = C.alpha, ER = Geo.ER, cos0 = Math.cos(C.lat * D2R) * 111.32 * k, pad = 24 * DPR;
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < ER.length; i++) {
      const e = ER[i]; if (skip && skip.has(i)) continue;
      p[0] = cx + (e.lng - C.lng) * cos0; p[1] = cy - (e.lat - C.lat) * 110.574 * k;
      if (p[0] < -pad || p[1] < -pad || p[0] > W + pad || p[1] > H + pad) continue;
      const a = A * PAL.erAs[e.cls] * dim * (.86 + .14 * Math.sin(t * .0017 + i * 1.7));
      if (pass === 0) {
        if (PAL.erGlow) { const r = (6 + 3 * sc) * DPR * (e.cls ? 1 : 1.35); ctx.globalAlpha = PAL.erGlow * a; ctx.drawImage(SPR.glow, p[0] - r, p[1] - r, r * 2, r * 2); }
        // 라이트: 응급실 점 둘레를 종이색으로 비워, 짙은 한반도 점 위에서도 응급실이 또렷하게 보이게 합니다.
        else if (PAL.erHalo) { ctx.globalAlpha = 1; dot(p[0], p[1], ER_R[e.cls] * sc * DPR * PAL.erR + 1.4 * DPR, PAL.halo, PAL.erHalo * a); }
      }
      else {
        const r = ER_R[e.cls] * sc * DPR * PAL.erR; ctx.globalAlpha = Math.min(1, a * PAL.erA); ctx.drawImage(SPR.dot, p[0] - r, p[1] - r, r * 2, r * 2);
        if (!e.cls) { ctx.globalAlpha = 1; ring(p[0], p[1], r + 3 * DPR, WARM, .3 * a, .8); if (S.phase === "korea" && !REDUCED) { const u = ((t / 4200) + i * .37) % 1; ring(p[0], p[1], r + (4 + 16 * u) * DPR, WARM, .16 * a * (1 - u), .8); } }
      }
    }
    ctx.globalAlpha = 1;
  }
  // 출발지 핀: 웹앱이 OpenStreetMap에서 찾은 실제 위치. 바다 쪽 빈자리에 이름·좌표·근처 응급실 수를 적습니다.
  function drawPin(t) {
    if (!S.origin) return;
    const [x, y] = proj(S.origin.lat, S.origin.lng), p = E.out(clamp((t - S.pinAt) / 450, 0, 1)), a = C.alpha * (1 - S.lz);
    if (a <= .01) return;
    if (!REDUCED) { const u = ((t - S.pinAt) % 1700) / 1700; ring(x, y, (6 + 26 * E.out(u)) * DPR, CORAL, .5 * (1 - u) * a, 1); }
    ring(x, y, 6.5 * DPR * p, CORAL, .95 * a, 1.4); dot(x, y, 2.4 * DPR * p, CORAL, a);
    const la = a * clamp((t - S.pinAt - 150) / 400, 0, 1) * (S.phase === "pin" ? 1 : 1 - clamp((t - S.lt0) / 450, 0, 1)); if (la <= .01) return;
    const m = S.meta, l3 = m && m.sido ? m.sido + " 응급실 " + m.count + "곳 중 가까운 " + S.nodes.length + "곳을 찾아요" : "가까운 응급실 " + S.nodes.length + "곳을 찾아요";
    const L = [[S.oname || "출발지", "600 " + 12.5 * DPR + "px " + FONT, .95], [S.origin.lat.toFixed(4) + "°N  " + S.origin.lng.toFixed(4) + "°E", "500 " + 10 * DPR + "px " + MONO, .55], [l3, "400 " + 10.5 * DPR + "px " + FONT, .65]];
    let tw = 0; for (const l of L) { ctx.font = l[1]; tw = Math.max(tw, ctx.measureText(l[0]).width); }
    // 바다 쪽(지도 중심 반대편)에 적되, 글자가 잘리면 반대쪽으로 옮깁니다.
    const off = 60 * DPR, room = sd => sd < 0 ? x - off - tw - 8 * DPR : W - 8 * DPR - (x + off + tw);
    let side = x < cx ? -1 : 1; if (room(side) < 0 && room(-side) > room(side)) side = -side;
    const vdir = y < cy + 40 * DPR ? 1 : -1, ex = x + side * 42 * DPR, ey = y + vdir * 58 * DPR, tx = ex + side * 12 * DPR, al = side < 0 ? "right" : "left";
    ctx.strokeStyle = rgba(INK, .35 * la); ctx.lineWidth = DPR; ctx.beginPath(); ctx.moveTo(x + side * 7 * DPR, y + vdir * 7 * DPR); ctx.lineTo(ex, ey); ctx.lineTo(tx, ey); ctx.stroke();
    const X = tx + side * 6 * DPR;
    L.forEach((l, i) => text(l[0], X, ey + [-8, 9, 25][i] * DPR, l[1], INK, l[2] * la, al));
  }
  // ── 출발지 주변: 병원 점, 주변 점 구름, 라벨 배치 ──
  function waitNode(c) { return { key: "e" + c.i, er: c.i, lat: c.lat, lng: c.lng, name: c.name, short: c.short, kind: c.kind, km: c.km, h: null, born: now(), ph: Math.random() }; }
  function ansNodes(d) { return d.hs.filter(x => x.lat != null && x.lng != null).map(x => ({ key: "h" + x.i, er: -1, lat: x.lat, lng: x.lng, name: x.name, short: x.short, km: x.km, h: x, born: now(), ph: Math.random() })); }
  function setNodes(list) {
    S.nodes = list; S.nodeEr = new Set(list.map(n => n.er).filter(i => i >= 0));
    if (S.origin) for (const n of list) { const v = kmXY(S.origin, n.lat, n.lng); n.dx = v[0]; n.dy = v[1]; if (n.km == null) n.km = Math.round(Math.hypot(v[0], v[1]) * 100) / 100; }
  }
  const fieldSig = () => S.nodes.map(n => n.lat.toFixed(4) + "," + n.lng.toFixed(4)).join("|") + "@" + (S.origin ? S.origin.lat.toFixed(4) + "," + S.origin.lng.toFixed(4) : "") + "#" + (S.ring ? S.ring.step + "x" + S.ring.rings : "");
  function uploadField(force) {
    if (!S.origin || !S.nodes.length || !S.ring) { FP = null; S.fsig = ""; return false; }
    const sig = fieldSig(); if (!force && FP && sig === S.fsig) return false;
    FP = buildFieldPoints(S.nodes.slice(0, 16).map(n => ({ x: n.dx, y: n.dy })), S.ring.step, S.ring.rings, S.ring.k / DPR, Math.round((S.origin.lat + S.origin.lng) * 1000) | 0);
    if (G2) { const gl = G2.gl; if (!bufF) bufF = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bufF); gl.bufferData(gl.ARRAY_BUFFER, FP, gl.STATIC_DRAW); }
    S.fsig = sig; return true;
  }
  const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  function hudRects() { const pr = stage.getBoundingClientRect(), out = []; $$(".hud", stage).forEach(e => { const r = e.getBoundingClientRect(); if (r.width && r.height) out.push({ x: (r.left - pr.left) * DPR, y: (r.top - pr.top) * DPR, w: r.width * DPR, h: r.height * DPR }); }); return out; }
  const segW = segs => segs.reduce((w, s) => { ctx.font = s.f; return w + ctx.measureText(s.t).width; }, 0);
  function targetPos(lat0, lng0, k) { const pos = new Map(); for (const n of S.nodes) pos.set(n, projAt(lat0, lng0, k, n.lat, n.lng, [0, 0])); pos.o = S.origin ? projAt(lat0, lng0, k, S.origin.lat, S.origin.lng, [0, 0]) : [cx, cy]; pos.k = k; return pos; }
  // 라벨은 병원 점에서 바깥쪽부터 16방향 × 4거리를 시도하고, 떨어진 자리에 놓이면 지시선을 긋습니다. 위치는 병원 점 기준 상대값으로 저장해 카메라가 움직여도 따라갑니다.
  function placeLabels(pos, items, extra) {
    const placed = hudRects(), pad = 8 * DPR, [ox, oy] = pos.o;
    const fits = r => r.x >= pad && r.x + r.w <= W - pad && r.y >= pad && r.y + r.h <= H - pad && !placed.some(q => hit(q, r));
    const ob = (x, y, r) => { const o = { x: x - r, y: y - r, w: r * 2, h: r * 2 }; placed.push(o); return o; };
    const inside = (q, x, y) => x > q.x && x < q.x + q.w && y > q.y && y < q.y + q.h;
    if (!S.approx) ob(ox, oy, 16 * DPR);
    for (const n of S.nodes) { const p = pos.get(n); n.ob = ob(p[0], p[1], (n.h && n.h.rank ? 13 : 7) * DPR); }
    (extra || []).forEach(([x, y]) => ob(x, y, 3 * DPR));
    S.chip = null;
    if (!S.approx && S.oname) {
      const name = S.oname.length > 16 ? S.oname.slice(0, 15) + "…" : S.oname;
      ctx.font = "500 " + 10 * DPR + "px " + FONT; const tw0 = ctx.measureText("출발").width;
      ctx.font = "600 " + 12 * DPR + "px " + FONT; const tw1 = ctx.measureText(name).width;
      const w = 32 * DPR + tw0 + tw1, hh = 26 * DPR;
      let L = { x: ox - w / 2, y: oy - 30 * DPR - hh, w, h: hh };
      if (!fits(L)) { const L2 = { x: ox - w / 2, y: oy + 26 * DPR, w, h: hh }; if (fits(L2)) L = L2; }
      placed.push(L); S.chip = { ox: L.x - ox, oy: L.y - oy, w, h: hh, name, tw0 };
    }
    for (const it of items) {
      const n = it.n, p = pos.get(n), segs = it.segs, w = segW(segs), hh = (it.big ? 13 : 12) * DPR * 1.3, g = (it.big ? 13 : 9) * DPR;
      const out = Math.atan2(p[1] - oy, p[0] - ox) || 0; let best = null;
      search: for (const rad of [g, g + 16 * DPR, g + 32 * DPR, g + 54 * DPR]) for (let j = 0; j < 16; j++) {
        const ang = out + (j % 2 ? 1 : -1) * Math.ceil(j / 2) * TAU / 16, ca = Math.cos(ang), sa = Math.sin(ang), lead = rad > g + 1;
        const ax = p[0] + ca * rad, ay = p[1] + sa * rad, gx = lead ? ca * 4 * DPR : 0, gy = lead ? sa * 3 * DPR : 0;
        const r = { x: (ca > .35 ? ax : ca < -.35 ? ax - w : ax - w / 2) + gx, y: (sa > .35 ? ay : sa < -.35 ? ay - hh : ay - hh / 2) + gy, w, h: hh };
        if (!fits(r)) continue;
        if (lead) { const x0 = p[0] + ca * (it.big ? 9 : 5) * DPR, y0 = p[1] + sa * (it.big ? 9 : 5) * DPR; if ([.3, .55, .8].some(u => placed.some(q => q !== n.ob && inside(q, x0 + (ax - x0) * u, y0 + (ay - y0) * u)))) continue; r.lead = [x0, y0, ax, ay]; }
        best = r; break search;
      }
      if (!best && it.must) best = { x: clamp(p[0] + g, pad, W - w - pad), y: p[1] - hh / 2, w, h: hh };
      n[it.slot] = best ? { ox: best.x - p[0], oy: best.y - p[1], w, h: hh, segs, lead: best.lead ? best.lead.map((v, i) => v - p[i % 2]) : null } : null;
      if (best) { placed.push(best); if (best.lead) { const [x0, y0, x1, y1] = best.lead; [.3, .55, .8].forEach(u => ob(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, 2 * DPR)); } }
    }
    S.ringLabs = [];
    if (!S.approx && S.ring) {
      ctx.font = "500 " + 10 * DPR + "px " + MONO;
      for (let j = 1; j <= S.ring.rings; j++) {
        const r = S.ring.step * j * pos.k, txt = fmtKm(S.ring.step * j), w = ctx.measureText(txt).width, hh = 12 * DPR;
        for (const a of [-.885, -.6, -1.15, -.35, -1.4, 2.3, .55]) { const L = { x: ox + Math.cos(a) * r + 5 * DPR, y: oy + Math.sin(a) * r - 2 * DPR - hh, w, h: hh }; if (fits(L)) { S.ringLabs.push({ ox: L.x - ox, oy: L.y - oy, txt }); placed.push(L); break; } }
      }
    }
  }
  function layoutWait() {
    const pos = targetPos(C.lat, C.lng, kd());
    placeLabels(pos, S.nodes.slice().sort((a, b) => a.km - b.km).map(n => ({ n, slot: "labW", segs: [{ t: n.short, f: "500 " + 11.5 * DPR + "px " + FONT, role: "name" }, { t: "  " + fmtKm(n.km), f: "500 " + 10.5 * DPR + "px " + MONO, c: "ink", a: .45 }] })));
  }
  // 결과 라벨 조각마다 나타나는 시각이 다릅니다: 이름(처음) · 제외/확인 필요(①②) · 도착 시간(도착 순간) · 순위 번호(④) · 직선 최단(마지막)
  function resultSegs(n) {
    const x = n.h, R = S.res, segs = [];
    if (x.rank) segs.push({ t: x.rank + "  ", f: "600 " + 11 * DPR + "px " + MONO, c: "rankNo", a: 1, show: R.B4 + (x.rank - 1) * 150 });
    segs.push({ t: x.short, f: "500 " + 12 * DPR + "px " + FONT, role: "name", show: 0 });
    if (x.st !== "out" && x.min != null) segs.push({ t: "  " + x.min + "분", f: "500 " + 11.5 * DPR + "px " + FONT, c: "ink", a: .6, show: n.arr != null ? n.arr : R.B4 });
    const tag = x.st === "out" ? "제외" : x.chk ? x.why : "";
    if (tag) segs.push({ t: "  " + tag, f: "500 " + 10.5 * DPR + "px " + FONT, c: x.st === "out" ? "grayT" : "amberT", a: .95, show: x.st === "out" ? B1 : B2 });
    if (S.nearest === n && x.rank !== 1) segs.push({ t: "  직선 최단 " + fmtKm(n.km), f: "500 " + 10.5 * DPR + "px " + FONT, c: "sand", a: .95, show: R.B4 + 500 });
    return segs;
  }
  function layoutResult(lat0, lng0, k) {
    const pos = targetPos(lat0, lng0, k), extra = [];
    if (!S.approx) for (const n of S.nodes) if (n.h && n.h.rank) { const p = pos.get(n), P = curve(pos.o[0], pos.o[1], p[0], p[1], n.bend || .12); for (let i = 6; i < 43; i += 5) extra.push([P[i * 2], P[i * 2 + 1]]); }
    const prio = n => n.h.rank ? n.h.rank : 10 + ST_ORDER[n.h.st];
    placeLabels(pos, S.nodes.filter(n => n.h).sort((a, b) => prio(a) - prio(b) || a.km - b.km).map(n => ({ n, slot: "labR", big: !!n.h.rank, must: !!n.h.rank, segs: resultSegs(n) })), extra);
  }
  // ── 출발지 주변 그리기 ──
  const nodeIn = (n, t) => E.out(clamp((t - n.born) / 450, 0, 1));
  function drawLab(n, lab, base, tt, nameCol) {
    if (!lab || base <= .01) return;
    const y = n.sy + lab.oy + lab.h / 2;
    if (lab.lead) { ctx.strokeStyle = n.h && n.h.rank && S.res && tt >= S.res.B4 ? rgba(CORAL, .5 * base) : rgba(INK, .24 * base); ctx.lineWidth = DPR; ctx.beginPath(); ctx.moveTo(n.sx + lab.lead[0], n.sy + lab.lead[1]); ctx.lineTo(n.sx + lab.lead[2], n.sy + lab.lead[3]); ctx.stroke(); }
    let x = n.sx + lab.ox;
    for (const s of lab.segs) {
      ctx.font = s.f; const w = ctx.measureText(s.t).width, p = s.show == null ? 1 : clamp((tt - s.show) / 350, 0, 1);
      if (p > 0) text(s.t, x, y, s.f, s.role === "name" ? nameCol : typeof s.c === "string" ? PAL[s.c] : s.c, (s.role === "name" ? nameCol[3] : s.a) * p * base);
      x += w;
    }
  }
  function drawRings(o, a) { if (!S.ring || S.approx || a <= .01) return; const k = kd(); for (let j = 1; j <= S.ring.rings; j++) ring(o[0], o[1], S.ring.step * j * k, INK, .045 * a, 1); }
  function drawRingLabs(o, a) { if (a > .01) for (const L of S.ringLabs) text(L.txt, o[0] + L.ox, o[1] + L.oy + 6 * DPR, "500 " + 10 * DPR + "px " + MONO, INK, .4 * a); }
  function drawOrigin(t, o, a) {
    if (a <= .01 || S.approx) return;
    if (!REDUCED) for (let k = 0; k < 2; k++) { const u = (t / 3400 + k / 2) % 1; ring(o[0], o[1], (6 + 44 * E.out(u)) * DPR, INK, .32 * (1 - u) * a, 1); }
    ring(o[0], o[1], 9 * DPR, INK, .55 * a, 1.1); dot(o[0], o[1], 3.4 * DPR, INK, a);
  }
  function drawChip(o, a) {
    const L = S.chip; if (!L || a <= .01) return;
    const x = o[0] + L.ox, y = o[1] + L.oy, r = L.h / 2;
    ctx.fillStyle = rgba(PAL.chip, PAL.chipA * a); ctx.strokeStyle = rgba(INK, .16 * a); ctx.lineWidth = DPR;
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + L.w, y, x + L.w, y + L.h, r); ctx.arcTo(x + L.w, y + L.h, x, y + L.h, r); ctx.arcTo(x, y + L.h, x, y, r); ctx.arcTo(x, y, x + L.w, y, r); ctx.closePath(); ctx.fill(); ctx.stroke();
    text("출발", x + 12 * DPR, y + r + .5 * DPR, "500 " + 10 * DPR + "px " + FONT, INK, .5 * a);
    text(L.name, x + 20 * DPR + L.tw0, y + r + .5 * DPR, "600 " + 12 * DPR + "px " + FONT, INK, a);
  }
  // 기다리는 동안: 후보 10곳으로 점선 조회선과 오가는 요청 점. 'AI 판단' 단계부터는 요청 점을 멈추고 후보가 숨 쉬듯 깜빡입니다.
  function drawWait(t, o) {
    const inLocal = S.phase === "local", tl = inLocal ? t - S.arrived : -1, s5 = S.stage >= 5, lz = S.lz;
    const qa = inLocal ? clamp(tl / 600, 0, 1) : 0, la = inLocal ? clamp((tl - 150) / 500, 0, 1) : 0;
    for (const n of S.nodes) {
      const a = C.alpha * S.na * nodeIn(n, t); if (a <= .01) continue;
      if (qa > 0) {
        ctx.setLineDash([2 * DPR, 5 * DPR]); ctx.strokeStyle = rgba(SILVER, .22 * qa * a * (s5 ? .6 : 1)); ctx.lineWidth = DPR; ctx.beginPath(); ctx.moveTo(o[0], o[1]); ctx.lineTo(n.sx, n.sy); ctx.stroke(); ctx.setLineDash([]);
        if (!s5 && !REDUCED) for (let k = 0; k < 2; k++) {
          const u = ((tl / 1700) + n.ph + k / 2) % 1, x = o[0] + (n.sx - o[0]) * u, y = o[1] + (n.sy - o[1]) * u, b = Math.sin(Math.PI * u) * qa * a, r = 6 * DPR;
          ctx.globalAlpha = .45 * b; ctx.drawImage(SPR.glow, x - r, y - r, r * 2, r * 2); ctx.globalAlpha = 1; dot(x, y, 1.3 * DPR, INK, .95 * b);
        }
      }
      dot(n.sx, n.sy, 2.7 * DPR, mix3(WARM, SILVER, lz), .95 * a);
      if (lz > .4) {
        const q = smooth(.4, 1, lz) * a;
        ctx.setLineDash([2 * DPR, 2.5 * DPR]); ctx.lineDashOffset = -t * .006 * DPR; ring(n.sx, n.sy, 7.5 * DPR, SILVER, .55 * q, 1); ctx.setLineDash([]); ctx.lineDashOffset = 0;
        ring(n.sx, n.sy, 13 * DPR, SILVER, .14 * q, 1);
        if (s5 && inLocal && !REDUCED) { const u = ((t / 2200) + n.ph) % 1; ring(n.sx, n.sy, (8 + 12 * u) * DPR, SILVER, .3 * (1 - u) * q, 1); }
      }
      if (n === S.hov || n === S.sel) ring(n.sx, n.sy, 11 * DPR, INK, .85 * a, 1.1);
    }
    if (la > 0) for (const n of S.nodes) drawLab(n, n.labW, la * C.alpha * S.na, 1e9, PAL.nm);
  }
  function nameColor(n, tt) {
    const x = n.h, R = S.res;
    if (x.rank && tt >= R.B4 + (x.rank - 1) * 150) return PAL.nmTop;
    if (x.st === "out" && tt >= B1) return PAL.nmOut;
    if (x.chk && tt >= B2) return PAL.nmChk;
    return PAL.nm;
  }
  function drawResNode(n, t, tt) {
    const x = n.h, R = S.res, A = C.alpha * nodeIn(n, t); if (!x || A <= .01) return;
    const X = n.sx, Y = n.sy;
    if (x.st === "out") {
      const p = E.out(clamp((tt - B1) / 450, 0, 1));
      if (p < 1) dot(X, Y, 2.7 * DPR * (1 - p), SILVER, .9 * A);
      xmark(X, Y, 3.2 * DPR * p, GRAY, .8 * A * p);
    } else {
      const rk = x.rank, rp = rk ? E.out(clamp((tt - R.B4 - (rk - 1) * 150) / 450, 0, 1)) : 0, cp = x.chk ? E.out(clamp((tt - B2) / 450, 0, 1)) : 0, arr = n.arr != null ? tt - n.arr : -1;
      if (rp < 1) dot(X, Y, (arr >= 0 ? 3 : 2.7) * DPR, arr >= 0 ? (x.chk ? AMBER : INK) : SILVER, (arr >= 0 ? 1 : .9) * A * (1 - rp));
      if (rp > 0) {
        const r = (rk === 1 ? 4.6 : 3.8) * DPR * rp; dot(X, Y, r, CORAL, A * rp); ring(X, Y, r + (rk === 1 ? 7 : 5.5) * DPR, CORAL, (rk === 1 ? .9 : .5) * A * rp, 1.2);
        if (rk === 1 && rp >= 1 && !REDUCED) { const u = (t % 2600) / 2600; ring(X, Y, r + (7 + 22 * E.out(u)) * DPR, CORAL, .45 * (1 - u) * A, 1); }
      }
      if (cp > 0) { ring(X, Y, (rk ? 13.5 : 6.5) * DPR, AMBER, .9 * A * cp, 1.3); if (cp < 1) ring(X, Y, (6 + 20 * cp) * DPR, AMBER, .6 * (1 - cp) * A, 1); }
      if (arr >= 0 && arr < 600) { const u = arr / 600; ring(X, Y, (5 + 18 * E.out(u)) * DPR, x.chk ? AMBER : INK, .7 * (1 - u) * A, 1.1); }
    }
    if (n === S.hov || n === S.sel) ring(X, Y, (x.rank ? 19 : 11) * DPR, INK, .85 * A, 1.1);
  }
  // 결과: ① 제외 ② 확인 필요 ③ 남은 곳으로 동시에 출발해 실제 소요 시간(초)에 비례해 도착 ④ 1~3순위 경로
  function drawResult(t, o) {
    const R = S.res, tt = t - S.rt0, A = C.alpha, la = A * clamp((tt + 150) / 350, 0, 1);
    for (const n of S.gone) { const a = A * (1 - clamp((t - n.died) / 350, 0, 1)); if (a > .01) dot(n.sx, n.sy, 2.7 * DPR, SILVER, .9 * a); }
    const nr = S.nearest;
    if (nr && nr.h.rank !== 1 && !S.approx) { const p = E.out(clamp((tt - R.B4 - 450) / 700, 0, 1)); if (p > 0) { ctx.setLineDash([3 * DPR, 5 * DPR]); ctx.strokeStyle = rgba(AMBER, .55 * A); ctx.lineWidth = 1.1 * DPR; ctx.beginPath(); ctx.moveTo(o[0], o[1]); ctx.lineTo(o[0] + (nr.sx - o[0]) * p, o[1] + (nr.sy - o[1]) * p); ctx.stroke(); ctx.setLineDash([]); } }
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (const n of R.racers) {
      if (tt < B3 - 300) break;
      const P = curve(o[0], o[1], n.sx, n.sy, n.bend), cnt = P.length / 2 - 1, x = n.h, col = x.chk ? AMBER : INK;
      const rk = x.rank, rp = rk ? clamp((tt - R.B4 - (rk - 1) * 150) / 420, 0, 1) : 0, keep = rk ? 1 : 1 - .8 * clamp((tt - R.B4) / 700, 0, 1), g = clamp((tt - B3 + 300) / 300, 0, 1);
      ctx.strokeStyle = rgba(SILVER, .07 * g * keep * A); ctx.lineWidth = DPR; poly(P, cnt); ctx.stroke();
      const p = clamp((tt - B3) / Math.max(1, n.arr - B3), 0, 1), fi = cnt * p, m = Math.floor(fi);
      if (m > 0) { ctx.strokeStyle = rgba(col, (p < 1 ? .32 : .22) * keep * A); ctx.lineWidth = 1.2 * DPR; poly(P, m); ctx.stroke(); }
      if (p > 0 && p < 1) {
        const j0 = Math.max(0, m - 10);
        for (let j = j0 + 1; j <= m; j++) { const u = (j - j0) / Math.max(1, m - j0); ctx.strokeStyle = rgba(col, .85 * u * u * A); ctx.lineWidth = 1.6 * DPR; ctx.beginPath(); ctx.moveTo(P[j * 2 - 2], P[j * 2 - 1]); ctx.lineTo(P[j * 2], P[j * 2 + 1]); ctx.stroke(); }
        const i1 = Math.min(cnt, m + 1), f = fi - m, hx = P[m * 2] + (P[i1 * 2] - P[m * 2]) * f, hy = P[m * 2 + 1] + (P[i1 * 2 + 1] - P[m * 2 + 1]) * f, r = 8 * DPR;
        ctx.globalAlpha = .55 * A; ctx.drawImage(SPR.glow, hx - r, hy - r, r * 2, r * 2); ctx.globalAlpha = 1; dot(hx, hy, 2.2 * DPR, col, A);
      }
      if (rp > 0) {
        const mm = Math.max(1, Math.round(cnt * E.inOut(rp)));
        if (rk === 1) { ctx.strokeStyle = rgba(CORAL, .14 * A); ctx.lineWidth = 7 * DPR; poly(P, mm); ctx.stroke(); }
        ctx.strokeStyle = rgba(CORAL, (rk === 1 ? .95 : .5) * A); ctx.lineWidth = (rk === 1 ? 2.1 : 1.3) * DPR; poly(P, mm); ctx.stroke();
        if (rk === 1 && rp >= 1 && !REDUCED) { const u = ((tt - R.B4 - 420) % 2600) / 2600, i = Math.floor(E.inOut(u) * cnt), j0 = Math.max(0, i - 7); if (i > j0) { ctx.strokeStyle = rgba(PAL.pulse, .95 * A); ctx.lineWidth = 2.4 * DPR; poly(P, i, j0); ctx.stroke(); } }
      }
    }
    for (const n of S.nodes) drawResNode(n, t, tt);
    for (const n of S.nodes) if (n.h) drawLab(n, n.labR, la * nodeIn(n, t), tt, nameColor(n, tt));
    if (R.racers.length && tt >= B3 - 200 && tt <= R.B4 + 1500) {
      const a = A * clamp((tt - B3 + 200) / 300, 0, 1) * (1 - clamp((tt - R.B4 - 1000) / 500, 0, 1)), mins = clamp((tt - B3) / R.rate, 0, R.maxMin);
      text("경과 " + Math.floor(mins) + "분", W - 18 * DPR, H - 58 * DPR, "600 " + 15 * DPR + "px " + FONT, INK, .95 * a, "right");
      text("실제 소요 시간 비율 · 1분 = " + String(+(R.rate / 1000).toFixed(2)) + "초", W - 18 * DPR, H - 40 * DPR, "500 " + 10 * DPR + "px " + MONO, INK, .45 * a, "right");
    }
  }
  function drawFlat(t) {
    if (C.alpha <= .01) return;
    const k = kd(), kN = fitKorea();
    S.lz = S.ring && S.origin && S.ring.k > kN ? clamp(Math.log(k / kN) / Math.log(S.ring.k / kN), 0, 1) : 0;
    for (const n of S.nodes) { proj(n.lat, n.lng, tmp); n.sx = tmp[0]; n.sy = tmp[1]; }
    for (const n of S.gone) { proj(n.lat, n.lng, tmp); n.sx = tmp[0]; n.sy = tmp[1]; }
    const o = S.origin ? proj(S.origin.lat, S.origin.lng, [0, 0]) : [cx, cy], ph = S.phase; S.o2 = o;
    drawERs(t);
    if (ph === "pin" || ph === "toLocal") drawPin(t);
    drawRings(o, F.alpha * C.alpha);
    if (ph === "toLocal" || ph === "local") drawWait(t, o);
    else if (ph === "result" && S.res) drawResult(t, o);
    else if (S.na > .01) for (const n of S.nodes) dot(n.sx, n.sy, 2.7 * DPR, SILVER, .9 * S.na * C.alpha);
    if (S.origin && (ph === "toLocal" || ph === "local" || ph === "result" || S.na > .01)) {
      drawOrigin(t, o, C.alpha * (ph === "toLocal" ? S.lz : ph === "local" || ph === "result" ? 1 : S.na));
      const la = ph === "local" ? clamp((t - S.arrived - 100) / 500, 0, 1) : ph === "result" ? clamp((t - S.rt0 + 150) / 350, 0, 1) : 0;
      drawChip(o, C.alpha * la); drawRingLabs(o, F.alpha * C.alpha * la);
    }
  }
  // ── 병원 정보 말풍선과 선택 ──
  function tipNode(n) {
    if (!n || C.alpha < .5 || (S.phase !== "local" && S.phase !== "result")) { tipEl.hidden = true; return; }
    const x = n.h, dl = h("dl"), add = (k, v) => { if (v != null && v !== "") dl.append(h("dt", null, k), h("dd", null, v)); };
    tipEl.replaceChildren(h("b", "t", n.name));
    if (x && S.phase === "result") {
      add("판정", ST_TXT[x.st] + (x.rank ? " · " + x.rank + "순위" : ""));
      if (x.chk) add("확인 필요", x.why + " · 출발 전 전화 확인");
      add("예상 소요", x.min != null ? x.min + "분 · 실시간 교통" : null);
      add("도로 거리", x.road != null ? x.road + "km" : null);
      add("직선 거리", n.km != null ? fmtKm(n.km) : null);
      add("가용 병상", x.beds != null ? x.beds + (x.time ? " · " + x.time + " 기준" : "") : null);
      add("응급실", x.tel);
      tipEl.append(dl); if (x.note) tipEl.append(h("p", null, x.note));
    } else { add("종별", n.kind || null); add("직선 거리", n.km != null ? fmtKm(n.km) : null); tipEl.append(dl, h("p", null, "에이전트가 병상·수용 제한·이동 시간을 확인하고 있어요")); }
    tipEl.hidden = false;
    const pw = stage.clientWidth, ph = stage.clientHeight, tw = tipEl.offsetWidth, th = tipEl.offsetHeight;
    let L = n.sx / DPR + 22; if (L + tw > pw - 12) L = n.sx / DPR - 22 - tw;
    tipEl.style.left = clamp(L, 12, Math.max(12, pw - tw - 12)) + "px"; tipEl.style.top = clamp(n.sy / DPR - th / 2, 12, Math.max(12, ph - th - 12)) + "px";
  }
  function pickAt(e) {
    if (S.phase !== "local" && S.phase !== "result") return null;
    const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) * DPR, y = (e.clientY - r.top) * DPR; let best = null, bd = 24 * DPR;
    for (const n of S.nodes) { const d = Math.hypot(n.sx - x, n.sy - y); if (d < bd) { bd = d; best = n; } }
    return best;
  }
  cv.addEventListener("pointermove", e => { if (e.pointerType !== "mouse") return; const n = pickAt(e); if (n !== S.hov) { S.hov = n; cv.style.cursor = n ? "pointer" : ""; tipNode(n || S.sel); } });
  cv.addEventListener("pointerleave", () => { S.hov = null; cv.style.cursor = ""; tipNode(S.sel); });
  cv.addEventListener("click", e => { const n = pickAt(e); S.sel = n; tipNode(n); if (S.pick) S.pick(n && n.h ? n.h.i : -1); });

  // ── GPU 점 그리기(없으면 2D로 줄여서) ──
  // 병원 주변 점 구름의 색: 대기 중에는 은색, 결과에서는 박자에 맞춰 제외(회색)·확인 필요(호박)·추천(코랄)으로 바뀝니다.
  function updateTints(t) {
    const T = S.tint, R = S.res, tt = t - S.rt0; T.fill(0);
    S.nodes.slice(0, 16).forEach((n, i) => {
      let c = PAL.tb, a = S.na * nodeIn(n, t);
      if (S.phase === "result" && R && n.h) {
        const x = n.h;
        if (x.st === "out") { const p = clamp((tt - B1) / 450, 0, 1); c = mix3(c, PAL.tg, p); a *= 1 - .65 * p; }
        else {
          if (x.chk) c = mix3(c, PAL.ta, clamp((tt - B2) / 450, 0, 1));
          if (x.rank) { const p = clamp((tt - R.B4 - (x.rank - 1) * 150) / 450, 0, 1); c = mix3(c, PAL.tc, p); a *= 1 + .3 * p; }
        }
      }
      T[i * 4] = c[0]; T[i * 4 + 1] = c[1]; T[i * 4 + 2] = c[2]; T[i * 4 + 3] = a;
    });
  }
  function drawGL(t) {
    const { gl, P } = G2, ts = t / 1000, k = kd(), lt = THEME === "light" ? 1 : 0;
    gl.viewport(0, 0, W, H); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    // 다크는 점이 겹칠수록 밝아지게(더하기), 라이트는 먹이 쌓이듯 짙어지게(덮어 그리기) 섞습니다.
    gl.blendFunc(gl.ONE, lt ? gl.ONE_MINUS_SRC_ALPHA : gl.ONE);
    G2.draw(P.back, G2.quad, 8, gl.TRIANGLES, 3, { uRes: [W, H], uC: [cx, cy], uFC: S.o2, uKC: proj(KC[0], KC[1]), uSil: silR(), uGA: G.alpha * G.intro, uFA: F.alpha * C.alpha, uFR: fieldR(), uKA: C.alpha * (1 - S.lz), uKR: Math.min(W, H) * .6, uTheme: lt });
    if (C.alpha > .004 && bufK) G2.draw(P.kmap, bufK, 24, gl.POINTS, KP.length / 6, { uRes: [W, H], uC: [cx, cy], uLL: [C.lat, C.lng], uK: [Math.cos(C.lat * D2R) * 111.32 * k, 110.574 * k], uAlpha: C.alpha, uDPR: DPR, uTime: ts, uInk: PAL.glInk, uTheme: lt });
    if (G.alpha > .004) G2.draw(P.globe, bufG, 28, gl.POINTS, GP.length / 7, { uRot: MG, uB0: BA, uB1: BB, uRes: [W, H], uCenter: [cx, cy], uLight: LIGHT, uF: focal(), uDist: G.dist, uDPR: DPR, uTime: ts, uAlpha: G.alpha, uIntro: G.intro, uFP: G.fp, uInk: PAL.glInk, uHot: PAL.glHot, uTheme: lt });
    if (F.alpha > .004 && FP && bufF) G2.draw(P.field, bufF, 32, gl.POINTS, FP.length / 8, { uRes: [W, H], uCenter: S.o2, uK: k, uTime: ts, uAlpha: F.alpha * C.alpha, uBloom: F.bloom, uDPR: DPR, uWob: S.ring ? S.ring.step * .006 : 0, "uTint[0]": S.tint, uInk: PAL.glInk, uTheme: lt });
  }
  // 2D 대체: 한반도 점은 전국 배율로 한 번 그려 두고 확대·이동만 합니다.
  function buildKoff() {
    const kref = fitKorea(), cs = Math.cos(KC[0] * D2R) * 111.32 * kref, ky = 110.574 * kref, { m, w, h: gh, lat0, lon0, dla, dlo } = KGRID;
    const x0 = (lon0 - KC[1]) * cs - 2, y0 = -(lat0 + gh * dla - KC[0]) * ky - 2, c = document.createElement("canvas");
    c.width = Math.ceil(w * dlo * cs) + 4; c.height = Math.ceil(gh * dla * ky) + 4;
    const g = c.getContext("2d"), r = mulberry32(36127);
    for (let i = 0; i < gh; i++) for (let j = 0; j < w; j++) { const v = m[i * w + j]; if (!v) continue; g.fillStyle = v === 1 ? rgba(PAL.dots, (PAL.koff[0] + PAL.koff[1] * r()).toFixed(2)) : rgba(PAL.dots, PAL.koff[2]); g.fillRect((lon0 + (j + .5) * dlo - KC[1]) * cs - x0 - .6, -(lat0 + (i + .5) * dla - KC[0]) * ky - y0 - .6, 1.2, 1.2); }
    KOFF = { c, kref, x0, y0 };
  }
  function draw2D(t) {
    if (G.alpha > .004) {
      const f = focal(), sil = silR(), hz = 1 / G.dist * smooth(2.2, 1.4, G.dist);
      for (let i = 0; i < GP.length; i += 28) {
        const kind = GP[i + 4]; if (kind > 2.5 && kind < 4.5) continue;
        const x = GP[i], y = GP[i + 1], z = GP[i + 2], vx = M[0] * x + M[1] * y + M[2] * z, vy = M[3] * x + M[4] * y + M[5] * z, vz = M[6] * x + M[7] * y + M[8] * z;
        const sc = 1 + (1 - G.intro) * 2, den = Math.max(G.dist - vz * sc, .06), s = f / den, px = vx * sc * s, py = vy * sc * s;
        const occ = vz < hz && Math.hypot(px, py) < sil; let a = kind < .5 ? .5 : kind < 1.5 ? .2 : kind < 2.5 ? .3 * Math.pow(1 - Math.abs(vz), 3) : .9;
        if (occ) a *= .1; a = Math.min(1, a * G.alpha * PAL.d2);
        ctx.fillStyle = rgba(kind > 4.5 ? PAL.hot : PAL.dots, a); const sz = (kind > 4.5 ? 2 : 1.3) * DPR; ctx.fillRect(cx + px - sz / 2, cy - py - sz / 2, sz, sz);
      }
    }
    if (KOFF && C.alpha > .01) {
      const k = kd(), s = k / KOFF.kref, cell = .02 * 110.574 * k, a = C.alpha * (1 - smooth(2.6 * DPR, 6.5 * DPR, cell)) * Math.min(1, (cell / (1.5 * DPR)) ** 2);
      if (a > .01) { const p = proj(KC[0], KC[1]); ctx.globalAlpha = a; ctx.drawImage(KOFF.c, p[0] + KOFF.x0 * s, p[1] + KOFF.y0 * s, KOFF.c.width * s, KOFF.c.height * s); ctx.globalAlpha = 1; }
    }
    if (F.alpha > .004 && FP) {
      const o = S.o2, k = kd(), T = S.tint;
      for (let i = 0; i < FP.length; i += 16) {
        const b = clamp((F.bloom - FP[i + 6] * .55) / .45, 0, 1), e = 1 - Math.pow(1 - b, 3), kind = FP[i + 4];
        let c = PAL.dots, a = Math.min(1, (kind < .5 ? .4 : kind < 1.5 ? .5 : .18) * PAL.d2) * F.alpha * C.alpha * e;
        if (kind > .5 && kind < 1.5) { const gi = Math.min(15, FP[i + 5]) * 4; c = [Math.round(T[gi] * 255), Math.round(T[gi + 1] * 255), Math.round(T[gi + 2] * 255)]; a *= T[gi + 3]; }
        ctx.fillStyle = rgba(c, a); ctx.fillRect(o[0] + FP[i] * e * k - DPR / 2, o[1] - FP[i + 1] * e * k - DPR / 2, 1.3 * DPR, 1.3 * DPR);
      }
    }
  }

  // ── 반복 그리기 ──
  function frame(t) {
    const dt = Math.min(64, t - last); last = t; runTweens(t); updateDive(t); updateFly(t);
    if (G.spin && !REDUCED) G.lon0 += dt * .000042;
    G.fp += dt / 1000 * G.flow;
    updateRot(t);
    if (C.lock) { C.lat = G.lat0 / D2R; C.lng = wrapLng(G.lon0 / D2R); C.lk = Math.log(globeKd()); }
    S.o2 = S.origin ? proj(S.origin.lat, S.origin.lng) : [cx, cy];
    updateTints(t);
    if (S.phase === "globe" && G.alpha > .5 && G.intro > .8 && t >= S.nextTracer && !REDUCED) spawnTracer(t);
    S.tracers = S.tracers.filter(x => !x.dead);
    if (G2) drawGL(t);
    ctx.clearRect(0, 0, W, H);
    if (!G2) draw2D(t);
    if (G.alpha > .01) { for (const tr of S.tracers) drawTracer(tr, t); drawKoreaLabel(); }
    drawFlat(t);
  }
  function loop(t) { frame(t); raf = requestAnimationFrame(loop); }
  function start() { if (!raf && !REDUCED) raf = requestAnimationFrame(loop); }
  function resize() {
    const r = stage.getBoundingClientRect(), w = Math.max(240, r.width), hh = Math.max(240, r.height);
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = glc.width = cv.width = Math.round(w * DPR); H = glc.height = cv.height = Math.round(hh * DPR);
    cx = W / 2; cy = H / 2 + (w > 700 ? 20 : 10) * DPR; R0 = Math.min(W * .3, H * .34);
    if (!G2) buildKoff();
    const ph = S.phase;
    if ((ph === "korea" || ph === "pin") && !S.fly) { C.lat = KC[0]; C.lng = KC[1]; C.lk = Math.log(fitKorea()); }
    else if ((ph === "local" || ph === "result") && S.origin && S.nodes.length && !S.fly) {
      S.ring = localFrame(S.nodes); C.lat = S.origin.lat; C.lng = S.origin.lng; C.lk = Math.log(S.ring.k); uploadField(true);
      if (ph === "local") layoutWait(); else if (S.res) layoutResult(C.lat, C.lng, kd());
    }
    if (S.sel) tipNode(S.sel);
    if (REDUCED) frame(now());
  }
  // ── 장면 전환 ──
  function intro() { G.intro = 0; tween(G, "intro", 1, 2600, E.out5, 150); tween(G, "label", 1, 900, E.out, 2300); S.nextTracer = now() + 2200; }
  // 지구본 → 한반도: 한국 쪽으로 돌며 카메라가 내려앉습니다. 지구본 점 간격이 벌어질 즈음 같은 배율의 평면 지도로 바꿔 끼웁니다.
  function toKorea() {
    if (G.alpha < .5 && C.alpha > .5) { toNational(); return; }
    S.phase = "toKorea"; G.spin = 0; S.tracers.length = 0; S.nodes = []; S.gone = []; S.nodeEr = new Set(); S.origin = null; FP = null; S.ring = null; S.na = 0; F.alpha = 0;
    tween(G, "drift", 0, 400, E.out); tween(G, "label", 0, 300, E.out); if (G.intro < 1) tween(G, "intro", 1, 400, E.out);
    tween(G, "lon0", shortest(G.lon0, KC[1]), 1100, E.inOut); tween(G, "lat0", KC[0] * D2R, 1100, E.inOut); tween(G, "zoom", 1, 500);
    const kN = fitKorea(); dive(distFor(kN), 1500);
    C.lock = 1; tween(C, "alpha", 1, 450, E.inOut, 520); tween(G, "alpha", 0, 450, E.inOut, 760);
    later(1520, () => { C.lock = 0; C.lat = KC[0]; C.lng = KC[1]; C.lk = Math.log(kN); S.phase = "korea"; next(); });
  }
  // 결과(또는 대기) 화면 → 한반도 전체: 다음 질문을 받았을 때
  function toNational() {
    S.phase = "toKorea"; C.lock = 0; S.dive = null; tween(G, "alpha", 0, 300); tween(C, "alpha", 1, 300);
    tween(F, "alpha", 0, 400, E.out); tween(S, "na", 0, 350, E.out); tipNode(null);
    flyTo(KC[0], KC[1], fitKorea(), 1300, () => { S.phase = "korea"; S.nodes = []; S.gone = []; S.nodeEr = new Set(); S.origin = null; FP = null; S.ring = null; S.res = null; next(); });
  }
  function pin(q) {
    S.origin = { lat: q.o.lat, lng: q.o.lng }; S.oname = q.o.name || ""; S.meta = q.meta || null; S.gone = []; S.approx = false;
    setNodes(q.cands.map(waitNode)); S.na = 0; S.phase = "pin"; S.pinAt = now();
    later(1150, () => { if (S.phase === "pin") flyLocal(); });
  }
  // 출발지로 날아들기: 한반도 점은 확대될수록 옅어지고, 마지막에 거리 고리와 병원 주변 점이 피어납니다.
  function flyLocal() {
    if (!S.origin) return;
    setNodes(S.nodes); S.ring = localFrame(S.nodes); S.phase = "toLocal"; S.lt0 = now();
    uploadField(true); F.alpha = 0; F.bloom = 0;
    const ms = 1900;
    tween(S, "na", 1, 500, E.out, ms * .5); tween(F, "alpha", 1, 700, E.out, ms * .62); tween(F, "bloom", 1, 1500, E.out5, ms * .62);
    flyTo(S.origin.lat, S.origin.lng, S.ring.k, ms, () => { S.phase = "local"; S.arrived = now(); layoutWait(); next(); });
  }
  const centroid = list => ({ lat: list.reduce((s, x) => s + x.lat, 0) / list.length, lng: list.reduce((s, x) => s + x.lng, 0) / list.length });
  // 결과의 출발지: 에이전트 데이터 → (요약 모드) 웹앱이 찾은 곳 → 병원 거리로 추정한 곳
  function resultOrigin(d) {
    const o = d.origin;
    if (o.lat != null && o.lng != null && !o.est) return { lat: o.lat, lng: o.lng };
    if (S.origin && S.oname && !S.approx) return S.origin;
    if (o.lat != null && o.lng != null) return { lat: o.lat, lng: o.lng };
    return null;
  }
  function next() {
    if (S.phase === "korea") {
      if (S.data) {
        const d = S.data, o = resultOrigin(d), list = ansNodes(d);
        if (!list.length) { startResult(); return; }
        S.origin = o || centroid(list); S.approx = !o; S.oname = d.origin.name || S.oname; S.gone = [];
        setNodes(list); S.na = 0; flyLocal(); return;
      }
      if (S.qo) { const q = S.qo; S.qo = null; pin(q); }
      return;
    }
    if (S.phase === "local" && S.data) startResult();
  }
  function beat(k) { if (S.onBeat && S.res) S.onBeat(k, S.res.info); }
  // 답이 오면: 대기 후보와 답의 병원을 이름·위치로 맞추고, 판단 순서 박자(①~④)를 예약합니다.
  function startResult() {
    const d = S.data; if (!d) return;
    const t = now(), o = resultOrigin(d);
    if (o && S.origin && S.phase === "local" && distKm(o, S.origin) > 2) { S.origin = null; toNational(); return; }
    S.phase = "result"; S.approx = !o; S.sel = S.hov = null; tipNode(null);
    const used = new Set(), list = [];
    for (const x of d.hs.filter(y => y.lat != null && y.lng != null)) {
      let n = S.nodes.find(m => !used.has(m) && (sameName(m.name, x.name) || distKm(m, x) < .25));
      if (n) used.add(n); else n = { key: "h" + x.i, er: -1, born: t, ph: Math.random() };
      Object.assign(n, { lat: x.lat, lng: x.lng, name: x.name, short: x.short, h: x, km: null, labW: null, labR: null });
      list.push(n);
    }
    S.gone = S.nodes.filter(m => !used.has(m)).map(m => Object.assign(m, { died: t }));
    const info = { out: d.hs.filter(x => x.st === "out").length, chk: d.hs.filter(x => x.st !== "out" && x.chk).length, racers: 0, rate: 200, best: d.hs.find(x => x.rank === 1) || null };
    if (!list.length) { S.nodes = []; S.res = { B4: 0, END: 0, racers: [], rate: 200, maxMin: 0, info }; S.rt0 = t - 1; [1, 2, 3, 4].forEach(beat); return; }
    S.origin = o || centroid(list); S.oname = d.origin.name || S.oname;
    setNodes(list); list.forEach(n => { if (n.h.km != null) n.km = n.h.km; });
    S.nearest = S.approx ? null : list.filter(n => n.h.st !== "out").sort((a, b) => a.km - b.km)[0] || null;
    const racers = S.approx ? [] : list.filter(n => n.h.st !== "out" && (n.h.sec != null || n.h.min != null));
    const mins = racers.map(n => n.h.sec != null ? n.h.sec / 60 : n.h.min), maxMin = Math.max(1, ...mins), rate = Math.min(200, 3800 / maxMin);
    list.forEach(n => { n.arr = null; }); racers.forEach((n, i) => { n.arr = B3 + mins[i] * rate; });
    racers.slice().sort((a, b) => Math.atan2(a.dy, a.dx) - Math.atan2(b.dy, b.dx)).forEach((n, i) => { n.bend = (i % 2 ? -1 : 1) * .12; });
    racers.sort((a, b) => b.arr - a.arr);
    const B4 = (racers.length ? Math.max(...racers.map(n => n.arr)) : B3) + 350;
    info.racers = racers.length; info.rate = rate;
    S.res = { B4, END: B4 + 1100, racers, rate, maxMin, info };
    S.ring = localFrame(list);
    const moved = distKm(C, S.origin) > .03 || Math.abs(C.lk - Math.log(S.ring.k)) > .02, panMs = moved && !REDUCED ? 650 : 0;
    if (uploadField(false)) { F.bloom = 1; F.alpha = .25; tween(F, "alpha", 1, 500, E.out, panMs); }
    layoutResult(S.origin.lat, S.origin.lng, S.ring.k);
    flyTo(S.origin.lat, S.origin.lng, S.ring.k, panMs);
    S.na = 1;
    if (REDUCED) { S.rt0 = t - S.res.END - 1; [1, 2, 3, 4].forEach(beat); return; }
    S.rt0 = t + panMs;
    later(panMs + B1, () => beat(1)); later(panMs + B2, () => beat(2)); later(panMs + B3, () => beat(3)); later(panMs + B4, () => beat(4));
  }
  function setData(d) {
    S.data = d;
    const ph = S.phase;
    if (ph === "globe" || ph === "toGlobe") { S.ep++; toKorea(); }
    else if (ph === "korea" || ph === "local") next();
    else if (ph === "result") startResult();
  }
  function locate() {
    const ph = S.phase;
    S.data = null; S.res = null; S.qo = null; S.sel = S.hov = null; tipNode(null);
    if (ph === "toKorea") return;
    S.ep++;
    if (ph === "globe" || (ph === "toGlobe" && G.alpha > .5)) toKorea(); else toNational();
  }
  function origin(o, cands, meta) {
    if (!o || !cands || !cands.length) return;
    const q = { o, cands, meta };
    if (S.phase === "toKorea") S.qo = q; else if (S.phase === "korea" && !S.data) pin(q);
  }
  // 지구본으로 돌아가기: 한반도 전체로 물러난 뒤 지구본으로 바꿔 끼우고 멀어집니다.
  function backToGlobe() {
    S.phase = "toGlobe"; S.nodes = []; S.gone = []; S.nodeEr = new Set(); S.origin = null; FP = null; S.ring = null; S.res = null; S.fly = null;
    if (C.alpha > .02 && !C.lock) { G.lat0 = KC[0] * D2R; G.lon0 = shortest(G.lon0, KC[1]); G.zoom = 1; G.dist = distFor(kd()); S.dive = null; G.alpha = 0; }
    C.lock = 1; tween(G, "alpha", 1, 450, E.inOut); tween(C, "alpha", 0, 450, E.inOut);
    dive(D0, 1500, 150); tween(G, "lat0", 24 * D2R, 1600, E.inOut, 150); tween(G, "zoom", 1, 600);
    later(1700, () => { C.lock = 0; S.phase = "globe"; G.spin = 1; tween(G, "label", 1, 800); S.nextTracer = now() + 300; });
  }
  function reset() {
    const ph = S.phase;
    S.ep++; S.data = null; S.res = null; S.qo = null; S.sel = S.hov = null; tipNode(null);
    if (ph === "globe" || ph === "toGlobe") { if (ph === "toGlobe") backToGlobe(); return; }
    if (ph === "toKorea" && G.alpha > .02) { backToGlobe(); return; }
    S.phase = "toGlobe"; tween(F, "alpha", 0, 400, E.out); tween(S, "na", 0, 350, E.out);
    const kN = fitKorea(), near = Math.abs(C.lk - Math.log(kN)) < .05 && distKm(C, { lat: KC[0], lng: KC[1] }) < 5;
    flyTo(KC[0], KC[1], kN, near ? 0 : 1200, backToGlobe);
  }

  G2 = createGL(glc);
  GP = buildGlobePoints(stage.getBoundingClientRect().width < 640);
  if (G2) { bufG = G2.buf(GP); KP = buildKoreaPoints(); bufK = G2.buf(KP); }
  glc.addEventListener("webglcontextlost", e => { e.preventDefault(); G2 = null; buildKoff(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden) { cancelAnimationFrame(raf); raf = 0; } else start(); });
  new ResizeObserver(() => resize()).observe(stage);
  resize(); start();
  if (REDUCED) { G.intro = 1; G.label = 1; setInterval(() => frame(now()), 400); }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (S.phase === "local") layoutWait(); else if (S.phase === "result" && S.res && !S.fly) layoutResult(C.lat, C.lng, kd()); });

  const byI = i => S.nodes.find(n => n.h && n.h.i === i) || null;
  return {
    intro, locate, origin, setData, reset,
    setStage: s => { S.stage = s; },
    select: i => { S.sel = i >= 0 ? byI(i) : null; tipNode(S.sel); },
    hover: i => { S.hov = i >= 0 ? byI(i) : null; tipNode(S.hov || S.sel); },
    onPick: f => { S.pick = f; },
    onBeat: f => { S.onBeat = f; },
    hasGL: () => !!G2,
    setTheme,
    phase: () => S.phase
  };
})();
