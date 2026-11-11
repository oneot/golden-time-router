"use strict";
// ── 실시간 지도 ─────────────────────────────────────────────
// 대기: 은색 점묘 지구본이 천천히 돌고, 서울에서 세계로 코랄 추적선이 하나씩 그려집니다.
// 질문: 한국으로 회전·확대하고, 표면의 동심원 물결과 들어오는 추적선으로 데이터 수집을 보여 줍니다.
// 결과: 출발지로 날아들어 등시선 점묘 지도로 바뀌고, 1~3순위 경로가 코랄 선으로 그려집니다.
// 점은 WebGL(#holoGL), 경로·병원·라벨은 2D 캔버스(#holo)에 그립니다. WebGL이 없으면 점을 2D로 줄여 그립니다.
const Holo = (() => {
  const stage = $("#holoPanel"), glc = $("#holoGL"), cv = $("#holo"), ctx = cv.getContext("2d"), tipEl = $("#tip");
  const D0 = 4, SEOUL = [37.5665, 126.978], KOREA = [36.3, 127.8];
  const CITIES = [[35.68, 139.69], [1.35, 103.82], [-33.87, 151.21], [37.77, -122.42], [51.51, -.13], [25.2, 55.27], [22.32, 114.17], [40.71, -74], [19.08, 72.88], [55.75, 37.62], [-23.55, -46.63], [13.75, 100.5], [31.23, 121.47], [48.86, 2.35], [-1.29, 36.82], [64.15, -21.94]];
  const CORAL = COL.rec, LIGHT = (() => { const l = [-.42, .55, .72], n = Math.hypot(...l); return l.map(x => x / n); })();
  let W = 1, H = 1, DPR = 1, cx = 0, cy = 0, R0 = 100, raf = 0, last = now(), G2 = null, GP = null, FP = null, bufG = null, bufF = null;
  const G = { lon0: 96 * D2R, lat0: 24 * D2R, zoom: 1, dist: D0, alpha: 1, hi: 0, ripple: 0, intro: 0, spin: 1, flow: 1, fp: 0, drift: 0 };
  const F = { alpha: 0, bloom: 0 };
  const S = { mode: "idle", stage: 0, data: null, nodes: [], ranked: [], nearest: null, approx: false, center: null, ringStep: 1, ringN: 4, k: 1, revealAt: 0, arcsEnd: 0, sel: -1, hov: -1, queued: null, locateEnd: 0, pick: null, tm: 0, target: vec(KOREA[0], KOREA[1]), targetLL: KOREA.slice(), tracers: [], nextTracer: 0, lastCity: -1, originLab: null };
  const M = new Float32Array(9), MG = new Float32Array(9), B0 = new Float32Array(9), B1 = new Float32Array(9), tmp = [0, 0, 0, 0];

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
  const shortest = (from, toDeg) => { const tl = toDeg * D2R; return from + ((((tl - from) % TAU) + TAU * 1.5) % TAU) - Math.PI; };

  // ── 카메라와 투영(셰이더와 같은 식) ──
  function updateRot(t) {
    const lon = G.lon0 + G.drift * Math.sin(t * .00016), lat = G.lat0 + G.drift * .45 * Math.cos(t * .00013);
    const c1 = Math.cos(lon), s1 = Math.sin(lon), c2 = Math.cos(lat), s2 = Math.sin(lat);
    M.set([c1, 0, -s1, -s2 * s1, c2, -s2 * c1, c2 * s1, s2, c2 * c1]);
    MG.set([M[0], M[3], M[6], M[1], M[4], M[7], M[2], M[5], M[8]]);
    bandMat(.47, -.42 + .06 * Math.sin(t * .00005), B0); bandMat(.6, .5 + .05 * Math.cos(t * .00004), B1);
  }
  const focal = () => R0 * G.zoom * D0;
  const silR = () => focal() / Math.sqrt(Math.max(G.dist * G.dist - 1, 1e-3));
  function proj(x, y, z, o) {
    const vx = M[0] * x + M[1] * y + M[2] * z, vy = M[3] * x + M[4] * y + M[5] * z, vz = M[6] * x + M[7] * y + M[8] * z;
    const den = Math.max(G.dist - vz, .06), s = focal() / den;
    o[0] = cx + vx * s; o[1] = cy - vy * s; o[2] = vz; o[3] = vz < 0 && Math.hypot(vx * s, vy * s) < silR() ? 0 : 1;
    return o;
  }

  // ── 코랄 추적선 ──
  function arcPoints(a, b, lift) {
    const A = vec(a[0], a[1]), B = vec(b[0], b[1]), w = Math.acos(clamp(A[0] * B[0] + A[1] * B[1] + A[2] * B[2], -1, 1)), sw = Math.sin(w) || 1, n = 72, P = new Float32Array((n + 1) * 3);
    const hgt = lift != null ? lift : .03 + .2 * w / Math.PI;
    for (let i = 0; i <= n; i++) {
      const u = i / n, f1 = Math.sin((1 - u) * w) / sw, f2 = Math.sin(u * w) / sw, hh = 1 + Math.sin(Math.PI * u) * hgt;
      P[i * 3] = (f1 * A[0] + f2 * B[0]) * hh; P[i * 3 + 1] = (f1 * A[1] + f2 * B[1]) * hh; P[i * 3 + 2] = (f1 * A[2] + f2 * B[2]) * hh;
    }
    return P;
  }
  function offsetLL(ll, distDeg, bearing) {
    const la = ll[0] * D2R, lo = ll[1] * D2R, d = distDeg * D2R, b = bearing;
    const la2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(b));
    const lo2 = lo + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(la2));
    return [la2 / D2R, lo2 / D2R];
  }
  function spawnTracer(t) {
    if (S.mode === "idle") {
      let i; do { i = Math.floor(Math.random() * CITIES.length); } while (i === S.lastCity);
      S.lastCity = i; S.tracers.push({ P: arcPoints(SEOUL, CITIES[i]), t0: t, dur: 1900, hold: 900, fade: 1100 });
      S.nextTracer = t + 2600 + Math.random() * 900;
    } else {
      const src = offsetLL(S.targetLL, 14 + Math.random() * 26, Math.random() * TAU);
      S.tracers.push({ P: arcPoints(src, S.targetLL, .012 + Math.random() * .03), t0: t, dur: 1150, hold: 250, fade: 700 });
      S.nextTracer = t + (S.stage >= 5 ? 1300 : 560) + Math.random() * 520;
    }
    if (S.tracers.length > 8) S.tracers.shift();
  }
  function drawTracer(tr, t) {
    const e = t - tr.t0, p = clamp(e / tr.dur, 0, 1), fa = e > tr.dur + tr.hold ? clamp(1 - (e - tr.dur - tr.hold) / tr.fade, 0, 1) : 1;
    if (fa <= 0) { tr.dead = true; return; }
    const n = tr.P.length / 3 - 1, head = Math.max(1, Math.round(n * E.inOut(p))), pts = [];
    for (let i = 0; i <= head; i++) { proj(tr.P[i * 3], tr.P[i * 3 + 1], tr.P[i * 3 + 2], tmp); pts.push(tmp[0], tmp[1], tmp[3]); }
    let first = -1; for (let i = 0; i <= head; i++) if (pts[i * 3 + 2]) { first = i; break; }
    if (first < 0) return;
    const path = () => { ctx.beginPath(); let pen = false; for (let i = 0; i <= head; i++) { if (!pts[i * 3 + 2]) { pen = false; continue; } if (pen) ctx.lineTo(pts[i * 3], pts[i * 3 + 1]); else ctx.moveTo(pts[i * 3], pts[i * 3 + 1]); pen = true; } };
    const g = ctx.createLinearGradient(pts[first * 3], pts[first * 3 + 1], pts[head * 3], pts[head * 3 + 1]);
    g.addColorStop(0, rgba(CORAL, .08 * fa)); g.addColorStop(1, rgba(CORAL, .92 * fa));
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.strokeStyle = rgba(CORAL, .07 * fa); ctx.lineWidth = 5 * DPR; path(); ctx.stroke();
    ctx.strokeStyle = g; ctx.lineWidth = 1.5 * DPR; path(); ctx.stroke();
    if (pts[head * 3 + 2]) {
      const hx = pts[head * 3], hy = pts[head * 3 + 1];
      ctx.strokeStyle = rgba(CORAL, .95 * fa); ctx.lineWidth = 1.3 * DPR; ctx.beginPath(); ctx.arc(hx, hy, 5.5 * DPR, 0, TAU); ctx.stroke();
      ctx.fillStyle = rgba(CORAL, fa); ctx.beginPath(); ctx.arc(hx, hy, 1.6 * DPR, 0, TAU); ctx.fill();
    }
  }
  // 한국 표시: 확대 중에만, 얇은 고리와 지시선 라벨
  function drawTarget(t) {
    const k = G.hi * G.alpha * clamp((G.dist - 1.6) / 1.2, 0, 1); if (k < .02) return;
    proj(S.target[0], S.target[1], S.target[2], tmp); if (!tmp[3]) return;
    const x = tmp[0], y = tmp[1], r = 13 * DPR;
    ctx.save(); ctx.globalAlpha = k;
    ctx.strokeStyle = rgba(CORAL, .85); ctx.lineWidth = 1.1 * DPR; ctx.setLineDash([2 * DPR, 3.5 * DPR]); ctx.lineDashOffset = -t * .006 * DPR;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    const lx = x + 34 * DPR, ly = y - 34 * DPR;
    ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.lineWidth = DPR; ctx.beginPath(); ctx.moveTo(x + r * .72, y - r * .72); ctx.lineTo(lx, ly); ctx.lineTo(lx + 16 * DPR, ly); ctx.stroke();
    ctx.textBaseline = "middle"; ctx.textAlign = "left";
    ctx.font = "600 " + 12 * DPR + "px " + FONT; ctx.fillStyle = "rgba(255,255,255,.92)"; ctx.fillText("대한민국", lx + 22 * DPR, ly - 1 * DPR);
    ctx.font = "500 " + 10 * DPR + "px " + MONO; ctx.fillStyle = "rgba(255,255,255,.45)"; ctx.fillText(S.targetLL[0].toFixed(2) + "°N  " + S.targetLL[1].toFixed(2) + "°E", lx + 22 * DPR, ly + 15 * DPR);
    ctx.restore();
  }

  // ── 출발지 주변 지도 배치 ──
  const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  function niceStep(m) { for (const s of [.1, .2, .25, .5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100]) if (m / s <= 4.2) return s; return 200; }
  function curve(x0, y0, x1, y1, bend) { const qx = (x0 + x1) / 2 - (y1 - y0) * bend, qy = (y0 + y1) / 2 + (x1 - x0) * bend, N = 48, P = new Float32Array((N + 1) * 2); for (let i = 0; i <= N; i++) { const u = i / N, v = 1 - u; P[i * 2] = v * v * x0 + 2 * v * u * qx + u * u * x1; P[i * 2 + 1] = v * v * y0 + 2 * v * u * qy + u * u * y1; } return P; }
  const fieldR = () => Math.min(W, H) * .4;
  function revealDur(d) { const m = d.hs.filter(x => x.lat != null && x.lng != null); return 450 + m.length * 90 + 250 + Math.max(0, m.filter(x => x.rank).length - 1) * 260 + 900; }
  function layout() {
    S.nodes = []; S.ranked = []; S.nearest = null; S.originLab = null; S.ringLabs = [];
    const d = S.data; if (!d) return;
    const o = d.origin, pts = d.hs.filter(x => x.lat != null && x.lng != null);
    let lat0 = o.lat, lng0 = o.lng; S.approx = lat0 == null || lng0 == null;
    if (S.approx) { if (!pts.length) return; lat0 = pts.reduce((s, x) => s + x.lat, 0) / pts.length; lng0 = pts.reduce((s, x) => s + x.lng, 0) / pts.length; }
    S.center = [lat0, lng0];
    const kx = Math.cos(lat0 * D2R) * 111.32, ky = 110.574; let maxKm = .3;
    const P = pts.map(x => { const dx = (x.lng - lng0) * kx, dy = (x.lat - lat0) * ky, dist = Math.hypot(dx, dy); maxKm = Math.max(maxKm, dist); return { h: x, dx, dy, dist }; });
    S.ringStep = niceStep(maxKm * 1.06); S.ringN = Math.max(1, Math.ceil(maxKm * 1.06 / S.ringStep)); S.k = fieldR() / (S.ringN * S.ringStep);
    P.sort((a, b) => a.dist - b.dist);
    S.nodes = P.map((p, k) => ({ h: p.h, dx: p.dx, dy: p.dy, x: cx + p.dx * S.k, y: cy - p.dy * S.k, t0: 450 + k * 90, dist: p.dist }));
    S.ranked = S.approx ? [] : S.nodes.filter(n => n.h.rank).sort((a, b) => a.h.rank - b.h.rank);
    const base = 450 + S.nodes.length * 90 + 250;
    S.ranked.forEach((n, k) => { n.a0 = base + k * 260; n.dur = k ? 650 : 900; n.curve = curve(cx, cy, n.x, n.y, k % 2 ? -.15 : .15); });
    S.arcsEnd = base + Math.max(0, S.ranked.length - 1) * 260 + 900;
    S.nearest = S.approx ? null : S.nodes.filter(n => n.h.st !== "out").sort((a, b) => (a.h.km ?? a.dist) - (b.h.km ?? b.dist))[0] || null;
    placeLabels();
  }
  function labelSegs(n) {
    const x = n.h, near = S.nearest === n && x.rank !== 1 ? [["  직선 최단" + (x.km != null ? " " + x.km + "km" : ""), "500 " + 10.5 * DPR + "px " + FONT, "rgba(240,201,138,.95)", 1]] : [];
    if (x.rank) return [[String(x.rank), "600 " + 11 * DPR + "px " + MONO, "rgba(255,164,151,1)"], ["  " + x.short, "600 " + 12.5 * DPR + "px " + FONT, "rgba(255,255,255,.96)"], [x.min != null ? "  " + x.min + "분" : "", "500 " + 12 * DPR + "px " + FONT, "rgba(255,255,255,.55)"], ...near];
    const c = x.st === "hold" ? "rgba(233,179,95,.95)" : x.st === "out" ? "rgba(140,145,155,.7)" : "rgba(214,219,228,.8)";
    return [[x.short, "500 " + 11.5 * DPR + "px " + FONT, c], [x.min != null && x.st !== "out" ? "  " + x.min + "분" : "", "400 " + 11 * DPR + "px " + FONT, "rgba(255,255,255,.4)"], ...near];
  }
  const segW = segs => segs.reduce((w, s) => { ctx.font = s[1]; return w + ctx.measureText(s[0]).width; }, 0);
  // 라벨은 병원 점에서 바깥쪽부터 16방향 × 4거리를 차례로 시도하고, 떨어진 자리에 놓이면 지시선을 긋습니다.
  function placeLabels() {
    const d = S.data; if (!d) return;
    const placed = [], pr = stage.getBoundingClientRect(), pad = 8 * DPR;
    const fits = r => r.x >= pad && r.x + r.w <= W - pad && r.y >= pad && r.y + r.h <= H - pad && !placed.some(q => hit(q, r));
    $$(".hud", stage).forEach(e => { const r = e.getBoundingClientRect(); if (r.width && r.height) placed.push({ x: (r.left - pr.left) * DPR, y: (r.top - pr.top) * DPR, w: r.width * DPR, h: r.height * DPR }); });
    const ob = (x, y, r) => { const o = { x: x - r, y: y - r, w: r * 2, h: r * 2 }; placed.push(o); return o; };
    const inside = (q, x, y) => x > q.x && x < q.x + q.w && y > q.y && y < q.y + q.h;
    ob(cx, cy, 16 * DPR); S.nodes.forEach(n => { n.ob = ob(n.x, n.y, (n.h.rank ? 13 : 6) * DPR); });
    S.ranked.forEach(n => { const P = n.curve, c = P.length / 2; for (let i = 6; i < c - 5; i += 5) ob(P[i * 2], P[i * 2 + 1], 3 * DPR); });
    if (!S.approx) {
      const name = d.origin.name.length > 16 ? d.origin.name.slice(0, 15) + "…" : d.origin.name;
      ctx.font = "500 " + 10 * DPR + "px " + FONT; const tw0 = ctx.measureText("출발").width;
      ctx.font = "600 " + 12 * DPR + "px " + FONT; const tw1 = ctx.measureText(name).width;
      const w = 12 * DPR + tw0 + 8 * DPR + tw1 + 12 * DPR, hh = 26 * DPR;
      const L = { x: cx - w / 2, y: cy - 30 * DPR - hh, w, h: hh, name, tw0 };
      if (S.nodes.some(n => Math.abs(n.x - cx) < w / 2 + 8 * DPR && n.y > L.y - 8 * DPR && n.y < L.y + hh + 8 * DPR)) L.y = cy + 28 * DPR;
      S.originLab = L; placed.push(L);
    }
    const prio = n => n.h.rank ? n.h.rank : 10 + ST_ORDER[n.h.st];
    S.nodes.slice().sort((a, b) => prio(a) - prio(b) || a.dist - b.dist).forEach(n => {
      const big = !!n.h.rank, segs = labelSegs(n), w = segW(segs), hh = (big ? 13 : 12) * DPR * 1.3, g = (big ? 14 : 9) * DPR;
      const out = Math.atan2(n.y - cy, n.x - cx) || 0;
      let best = null;
      search: for (const rad of [g, g + 16 * DPR, g + 32 * DPR, g + 54 * DPR]) {
        for (let j = 0; j < 16; j++) {
          const ang = out + (j % 2 ? 1 : -1) * Math.ceil(j / 2) * TAU / 16, ca = Math.cos(ang), sa = Math.sin(ang), lead = rad > g + 1;
          const ax = n.x + ca * rad, ay = n.y + sa * rad, gx = lead ? ca * 4 * DPR : 0, gy = lead ? sa * 3 * DPR : 0;
          const r = { x: (ca > .35 ? ax : ca < -.35 ? ax - w : ax - w / 2) + gx, y: (sa > .35 ? ay : sa < -.35 ? ay - hh : ay - hh / 2) + gy, w, h: hh };
          if (!fits(r)) continue;
          if (lead) {
            const x0 = n.x + ca * (big ? 9 : 5) * DPR, y0 = n.y + sa * (big ? 9 : 5) * DPR;
            if ([.3, .55, .8].some(u => placed.some(q => q !== n.ob && inside(q, x0 + (ax - x0) * u, y0 + (ay - y0) * u)))) continue;
            r.lead = [x0, y0, ax, ay];
          }
          best = r; break search;
        }
      }
      if (!best && big) best = { x: clamp(n.x + g, pad, W - w - pad), y: n.y - hh / 2, w, h: hh };
      n.lab = best ? Object.assign(best, { segs }) : null;
      if (best) { placed.push(best); if (best.lead) { const [x0, y0, x1, y1] = best.lead; [.3, .55, .8].forEach(u => ob(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, 2 * DPR)); } }
    });
    // 거리 고리 숫자는 가장 낮은 순위: 병원 라벨과 겹치지 않는 각도를 찾고, 없으면 생략
    S.ringLabs = [];
    if (!S.approx) {
      ctx.font = "500 " + 10 * DPR + "px " + MONO; const R = fieldR();
      for (let k = 1; k <= S.ringN; k++) {
        const r = R * k / S.ringN, txt = fmtKm(S.ringStep * k), w = ctx.measureText(txt).width, hh = 12 * DPR;
        for (const a of [-.885, -.6, -1.15, -.35, -1.4]) {
          const L = { x: cx + Math.cos(a) * r + 5 * DPR, y: cy + Math.sin(a) * r - 2 * DPR - hh, w, h: hh };
          if (fits(L)) { S.ringLabs.push(Object.assign(L, { txt })); placed.push(L); break; }
        }
      }
    }
  }

  // ── 출발지 주변 지도 그리기 ──
  function poly(P, m) { ctx.beginPath(); ctx.moveTo(P[0], P[1]); for (let i = 1; i <= m; i++) ctx.lineTo(P[i * 2], P[i * 2 + 1]); }
  function drawField(t) {
    const tt = t - S.revealAt; ctx.save(); ctx.globalAlpha = F.alpha;
    if (!S.approx) {
      const R = fieldR(), pr = clamp(tt / 900, 0, 1);
      for (let k = 1; k <= S.ringN; k++) { ctx.strokeStyle = "rgba(255,255,255," + .045 * pr + ")"; ctx.lineWidth = DPR; ctx.beginPath(); ctx.arc(cx, cy, R * k / S.ringN, 0, TAU); ctx.stroke(); }
      ctx.font = "500 " + 10 * DPR + "px " + MONO; ctx.textAlign = "left"; ctx.textBaseline = "bottom"; ctx.fillStyle = "rgba(255,255,255," + .4 * pr + ")";
      for (const L of S.ringLabs || []) ctx.fillText(L.txt, L.x, L.y + L.h);
    }
    const nr = S.nearest;
    if (nr && nr.h.rank !== 1) {
      const p = E.out(clamp((tt - S.arcsEnd) / 700, 0, 1));
      if (p > 0) { ctx.setLineDash([3 * DPR, 5 * DPR]); ctx.strokeStyle = "rgba(233,179,95,.55)"; ctx.lineWidth = 1.1 * DPR; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + (nr.x - cx) * p, cy + (nr.y - cy) * p); ctx.stroke(); ctx.setLineDash([]); }
    }
    for (let k = S.ranked.length - 1; k >= 0; k--) {
      const n = S.ranked[k], p = clamp((tt - n.a0) / n.dur, 0, 1); if (p <= 0) continue;
      const one = n.h.rank === 1, P = n.curve, cnt = P.length / 2 - 1, m = Math.max(1, Math.round(cnt * E.inOut(p)));
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      if (one) { ctx.strokeStyle = rgba(CORAL, .12); ctx.lineWidth = 7 * DPR; poly(P, m); ctx.stroke(); }
      ctx.strokeStyle = rgba(CORAL, one ? .95 : .42); ctx.lineWidth = (one ? 2.1 : 1.3) * DPR; poly(P, m); ctx.stroke();
      const hx = P[m * 2], hy = P[m * 2 + 1];
      if (p < 1) { ctx.strokeStyle = rgba(CORAL, .95); ctx.lineWidth = 1.3 * DPR; ctx.beginPath(); ctx.arc(hx, hy, 6.5 * DPR, 0, TAU); ctx.stroke(); }
      else if (one && !REDUCED) {
        const u = ((tt - n.a0 - n.dur) % 2600) / 2600, i = Math.floor(E.inOut(u) * cnt), j0 = Math.max(0, i - 7);
        ctx.strokeStyle = "rgba(255,226,220,.95)"; ctx.lineWidth = 2.4 * DPR; ctx.beginPath(); ctx.moveTo(P[j0 * 2], P[j0 * 2 + 1]); for (let j = j0 + 1; j <= i; j++) ctx.lineTo(P[j * 2], P[j * 2 + 1]); ctx.stroke();
      }
    }
    for (const n of S.nodes) drawNode(n, t, tt);
    if (!S.approx) drawOrigin(t, tt);
    drawLabels(tt);
    ctx.restore();
  }
  function ring(x, y, r, col, lw) { ctx.strokeStyle = col; ctx.lineWidth = lw * DPR; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke(); }
  function dot(x, y, r, col) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
  function drawNode(n, t, tt) {
    const p = clamp((tt - n.t0) / 520, 0, 1); if (p <= 0) return;
    const x = n.h, e = E.out(p), one = x.rank === 1;
    if (x.rank) {
      const routeDone = !S.ranked.includes(n) || tt > n.a0 + n.dur, r = (one ? 4.6 : 3.8) * DPR * e;
      dot(n.x, n.y, r, rgba(CORAL, 1));
      if (routeDone) ring(n.x, n.y, r + (one ? 7 : 5.5) * DPR, rgba(CORAL, one ? .9 : .5), 1.2);
      if (one && routeDone && !REDUCED) { const u = (t % 2600) / 2600; ring(n.x, n.y, r + (7 + 22 * E.out(u)) * DPR, rgba(CORAL, .45 * (1 - u)), 1); }
    } else if (x.st === "hold") ring(n.x, n.y, 3.6 * DPR * e, "rgba(233,179,95,.95)", 1.4);
    else if (x.st === "out") { const s = 3 * DPR * e; ctx.strokeStyle = "rgba(140,145,155,.75)"; ctx.lineWidth = 1.2 * DPR; ctx.beginPath(); ctx.moveTo(n.x - s, n.y - s); ctx.lineTo(n.x + s, n.y + s); ctx.moveTo(n.x + s, n.y - s); ctx.lineTo(n.x - s, n.y + s); ctx.stroke(); }
    else dot(n.x, n.y, 2.8 * DPR * e, "rgba(214,219,228,.9)");
    if (p < 1) ring(n.x, n.y, (4 + 18 * p) * DPR, rgba(x.rank ? CORAL : [214, 219, 228], .5 * (1 - p)), 1);
    if (x.i === S.sel || x.i === S.hov) ring(n.x, n.y, (x.rank ? 19 : 10) * DPR, "rgba(255,255,255,.85)", 1.1);
  }
  function drawOrigin(t, tt) {
    const p = clamp(tt / 600, 0, 1); if (p <= 0) return;
    if (!REDUCED) for (let k = 0; k < 2; k++) { const u = (t / 3400 + k / 2) % 1; ring(cx, cy, (6 + 44 * E.out(u)) * DPR, "rgba(255,255,255," + .32 * (1 - u) * p + ")", 1); }
    ring(cx, cy, 9 * DPR * p, "rgba(255,255,255,.55)", 1.1);
    dot(cx, cy, 3.4 * DPR * p, "#fff");
  }
  function drawLabels(tt) {
    ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.lineJoin = "round";
    const L = S.originLab, po = clamp((tt - 200) / 500, 0, 1);
    if (L && po > 0) {
      ctx.globalAlpha = F.alpha * po; const r = L.h / 2;
      ctx.fillStyle = "rgba(9,10,14,.86)"; ctx.strokeStyle = "rgba(255,255,255,.16)"; ctx.lineWidth = DPR;
      ctx.beginPath(); ctx.moveTo(L.x + r, L.y); ctx.arcTo(L.x + L.w, L.y, L.x + L.w, L.y + L.h, r); ctx.arcTo(L.x + L.w, L.y + L.h, L.x, L.y + L.h, r); ctx.arcTo(L.x, L.y + L.h, L.x, L.y, r); ctx.arcTo(L.x, L.y, L.x + L.w, L.y, r); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.font = "500 " + 10 * DPR + "px " + FONT; ctx.fillStyle = "rgba(255,255,255,.5)"; ctx.fillText("출발", L.x + 12 * DPR, L.y + L.h / 2 + .5 * DPR);
      ctx.font = "600 " + 12 * DPR + "px " + FONT; ctx.fillStyle = "#fff"; ctx.fillText(L.name, L.x + 20 * DPR + L.tw0, L.y + L.h / 2 + .5 * DPR);
    }
    const late = clamp((tt - S.arcsEnd - 400) / 500, 0, 1);
    for (const n of S.nodes) {
      const lb = n.lab; if (!lb) continue; const p = clamp((tt - n.t0 - 220) / 450, 0, 1); if (p <= 0) continue;
      ctx.globalAlpha = F.alpha * p;
      if (lb.lead) { ctx.strokeStyle = n.h.rank ? rgba(CORAL, .5) : "rgba(255,255,255,.24)"; ctx.lineWidth = DPR; ctx.beginPath(); ctx.moveTo(lb.lead[0], lb.lead[1]); ctx.lineTo(lb.lead[2], lb.lead[3]); ctx.stroke(); }
      let x = lb.x; const y = lb.y + lb.h / 2;
      for (const [txt, font, col, isLate] of lb.segs) {
        if (!txt) continue; ctx.font = font;
        if (!isLate || late > 0) { ctx.globalAlpha = F.alpha * p * (isLate ? late : 1); ctx.lineWidth = 4 * DPR; ctx.strokeStyle = "rgba(7,8,11,.88)"; ctx.strokeText(txt, x, y); ctx.fillStyle = col; ctx.fillText(txt, x, y); }
        x += ctx.measureText(txt).width;
      }
    }
    ctx.globalAlpha = F.alpha;
  }

  // ── 병원 정보 말풍선과 선택 ──
  function tip(i) {
    const n = S.nodes.find(x => x.h.i === i);
    if (!n || F.alpha < .5) { tipEl.hidden = true; return; }
    const x = n.h; tipEl.replaceChildren(h("b", "t", x.name));
    const dl = h("dl"), add = (k, v) => { if (v != null && v !== "") dl.append(h("dt", null, k), h("dd", null, v)); };
    add("판정", ST_TXT[x.st] + (x.rank ? " · " + x.rank + "순위" : ""));
    add("예상 소요", x.min != null ? x.min + "분 · 실시간 교통" : null);
    add("도로 거리", x.road != null ? x.road + "km" : null);
    add("직선 거리", x.km != null ? x.km + "km" : null);
    add("가용 병상", x.beds != null ? x.beds + (x.time ? " · " + x.time + " 기준" : "") : null);
    add("응급실", x.tel);
    tipEl.append(dl); if (x.note) tipEl.append(h("p", null, x.note));
    tipEl.hidden = false;
    const pw = stage.clientWidth, ph = stage.clientHeight, tw = tipEl.offsetWidth, th = tipEl.offsetHeight;
    let L = n.x / DPR + 22; if (L + tw > pw - 12) L = n.x / DPR - 22 - tw;
    tipEl.style.left = clamp(L, 12, Math.max(12, pw - tw - 12)) + "px"; tipEl.style.top = clamp(n.y / DPR - th / 2, 12, Math.max(12, ph - th - 12)) + "px";
  }
  function pickAt(e) { const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) * DPR, y = (e.clientY - r.top) * DPR; let best = -1, bd = 24 * DPR; for (const n of S.nodes) { const d = Math.hypot(n.x - x, n.y - y); if (d < bd) { bd = d; best = n.h.i; } } return best; }
  cv.addEventListener("pointermove", e => { if (e.pointerType !== "mouse" || !S.nodes.length || F.alpha < .5) return; const i = pickAt(e); if (i !== S.hov) { S.hov = i; cv.style.cursor = i >= 0 ? "pointer" : ""; tip(i >= 0 ? i : S.sel); } });
  cv.addEventListener("pointerleave", () => { S.hov = -1; cv.style.cursor = ""; tip(S.sel); });
  cv.addEventListener("click", e => { if (!S.nodes.length || F.alpha < .5) return; const i = pickAt(e); S.sel = i; tip(i); if (S.pick) S.pick(i); });

  // ── GPU 점 그리기(없으면 2D로 줄여서) ──
  function uploadField() {
    const d = S.data; FP = null; if (!d || !S.nodes.length) return;
    const hs = S.nodes.map(n => ({ x: n.dx, y: n.dy, st: n.h.st, rank: n.h.rank }));
    FP = buildFieldPoints(hs, S.ringStep, S.ringN, S.k / DPR, Math.round((S.center[0] + S.center[1]) * 1000) | 0);
    if (G2) { if (!bufF) bufF = G2.gl.createBuffer(); G2.gl.bindBuffer(G2.gl.ARRAY_BUFFER, bufF); G2.gl.bufferData(G2.gl.ARRAY_BUFFER, FP, G2.gl.STATIC_DRAW); }
  }
  function drawGL(t) {
    const { gl, P } = G2, ts = t / 1000;
    gl.viewport(0, 0, W, H); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    G2.draw(P.back, G2.quad, 8, gl.TRIANGLES, 3, { uRes: [W, H], uC: [cx, cy], uFC: [cx, cy], uSil: silR(), uGA: G.alpha * G.intro, uFA: F.alpha, uFR: fieldR() });
    if (G.alpha > .004) G2.draw(P.globe, bufG, 28, gl.POINTS, GP.length / 7, { uRot: MG, uB0: B0, uB1: B1, uRes: [W, H], uCenter: [cx, cy], uTarget: S.target, uLight: LIGHT, uF: focal(), uDist: G.dist, uDPR: DPR, uTime: ts, uAlpha: G.alpha, uHi: G.hi, uIntro: G.intro, uRipple: G.ripple, uFP: G.fp });
    if (F.alpha > .004 && FP && bufF) G2.draw(P.field, bufF, 32, gl.POINTS, FP.length / 8, { uRes: [W, H], uCenter: [cx, cy], uK: S.k, uTime: ts, uAlpha: F.alpha, uBloom: F.bloom, uDPR: DPR, uWob: S.ringStep * .006 });
  }
  function draw2D(t) {
    const ts = t / 1000;
    if (G.alpha > .004) {
      const f = focal(), sil = silR();
      for (let i = 0; i < GP.length; i += 28) {
        const kind = GP[i + 4]; if (kind > 2.5) continue;
        const x = GP[i], y = GP[i + 1], z = GP[i + 2], vx = M[0] * x + M[1] * y + M[2] * z, vy = M[3] * x + M[4] * y + M[5] * z, vz = M[6] * x + M[7] * y + M[8] * z;
        const sc = 1 + (1 - G.intro) * 2, den = Math.max(G.dist - vz * sc, .06), s = f / den, px = vx * sc * s, py = vy * sc * s;
        const occ = vz < 0 && Math.hypot(px, py) < sil; let a = kind < .5 ? .5 : kind < 1.5 ? .2 : .3 * Math.pow(1 - Math.abs(vz), 3);
        if (occ) a *= .1; a *= G.alpha * (1 + G.hi * GP[i + 6]);
        ctx.fillStyle = GP[i + 6] && G.hi > .1 ? rgba(CORAL, a) : "rgba(214,221,235," + a + ")"; const sz = 1.3 * DPR; ctx.fillRect(cx + px - sz / 2, cy - py - sz / 2, sz, sz);
      }
    }
    if (F.alpha > .004 && FP) {
      for (let i = 0; i < FP.length; i += 16) {
        const b = clamp((F.bloom - FP[i + 6] * .55) / .45, 0, 1), e = 1 - Math.pow(1 - b, 3), x = FP[i] * e, y = FP[i + 1] * e, tint = FP[i + 7];
        const c = tint < .5 ? [214, 221, 235] : tint < 1.5 ? CORAL : tint < 2.5 ? [233, 179, 95] : [128, 133, 143];
        ctx.fillStyle = rgba(c, (FP[i + 4] < .5 ? .4 : FP[i + 4] < 1.5 ? .5 : .18) * F.alpha * e); ctx.fillRect(cx + x * S.k - DPR / 2, cy - y * S.k - DPR / 2, 1.3 * DPR, 1.3 * DPR);
      }
    }
    void ts;
  }

  // ── 반복 그리기 ──
  function frame(t) {
    const dt = Math.min(64, t - last); last = t; runTweens(t);
    if (G.spin && !REDUCED) G.lon0 += dt * .000042;
    G.fp += dt / 1000 * G.flow;
    updateRot(t);
    if ((S.mode === "idle" || S.mode === "locate" || S.mode === "scan") && t >= S.nextTracer && G.alpha > .5 && G.intro > .8 && !REDUCED) spawnTracer(t);
    S.tracers = S.tracers.filter(x => !x.dead);
    if (G2) drawGL(t);
    ctx.clearRect(0, 0, W, H);
    if (!G2) draw2D(t);
    if (G.alpha > .01) { ctx.save(); ctx.globalAlpha = G.alpha; for (const tr of S.tracers) drawTracer(tr, t); ctx.restore(); drawTarget(t); }
    if (F.alpha > .01 && S.data) drawField(t);
  }
  function loop(t) { frame(t); raf = requestAnimationFrame(loop); }
  function start() { if (!raf && !REDUCED) raf = requestAnimationFrame(loop); }
  function resize() {
    const r = stage.getBoundingClientRect(), w = Math.max(240, r.width), hh = Math.max(240, r.height);
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = glc.width = cv.width = Math.round(w * DPR); H = glc.height = cv.height = Math.round(hh * DPR);
    cx = W / 2; cy = H / 2 + (w > 700 ? 20 : 10) * DPR; R0 = Math.min(W * .3, H * .34);
    if (S.data) { layout(); uploadField(); }
    if (S.sel >= 0) tip(S.sel);
    if (REDUCED) frame(now());
  }

  G2 = createGL(glc);
  GP = buildGlobePoints(stage.getBoundingClientRect().width < 640);
  if (G2) bufG = G2.buf(GP);
  glc.addEventListener("webglcontextlost", e => { e.preventDefault(); G2 = null; });
  document.addEventListener("visibilitychange", () => { if (document.hidden) { cancelAnimationFrame(raf); raf = 0; } else start(); });
  new ResizeObserver(() => resize()).observe(stage);
  resize(); start();
  if (REDUCED) { G.intro = 1; setInterval(() => frame(now()), 400); }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (S.data) placeLabels(); });

  // ── 바깥에서 부르는 동작 ──
  function intro() { G.intro = 0; tween(G, "intro", 1, 2600, E.out5, 150); S.nextTracer = now() + 2400; }
  function reveal(d) {
    S.data = d; S.mode = "dive"; S.sel = S.hov = -1; tip(-1); S.tracers.length = 0;
    layout(); uploadField();
    const c = S.center || KOREA; S.targetLL = c.slice(); S.target = vec(c[0], c[1]);
    tween(G, "drift", 0, 500, E.out); tween(G, "hi", 0, 320, E.out);
    tween(G, "lon0", shortest(G.lon0, c[1]), 800, E.inOut); tween(G, "lat0", c[0] * D2R, 800, E.inOut);
    tween(G, "dist", 1.1, 1500, E.in, 250); tween(G, "alpha", 0, 450, E.out, 1250); tween(G, "ripple", 0, 600, E.out, 900);
    F.alpha = 0; F.bloom = 0; tween(F, "alpha", 1, 700, E.out, 1200); tween(F, "bloom", 1, 1600, E.out5, 1200);
    S.revealAt = now() + (REDUCED ? 0 : 1200);
    setTimeout(() => { if (S.mode === "dive") S.mode = "result"; }, REDUCED ? 0 : 1700);
  }
  function locate() {
    clearTimeout(S.tm); Object.assign(S, { mode: "locate", data: null, queued: null, sel: -1, hov: -1, stage: 1, nodes: [], ranked: [] }); tip(-1);
    S.targetLL = KOREA.slice(); S.target = vec(KOREA[0], KOREA[1]); G.spin = 0;
    let p0 = 0;
    if (F.alpha > .02) { p0 = 450; tween(F, "alpha", 0, 450, E.out); G.dist = 1.5; G.alpha = 0; tween(G, "alpha", 1, 800, E.out, 150); tween(G, "dist", D0, 1200, E.out, 150); }
    tween(G, "lon0", shortest(G.lon0, KOREA[1]), 1500, E.inOut, p0); tween(G, "lat0", KOREA[0] * D2R, 1500, E.inOut, p0);
    tween(G, "zoom", 1.45, 1800, E.inOut, p0 + 200); tween(G, "hi", 1, 900, E.out, p0 + 900); tween(G, "ripple", 1, 900, E.out, p0 + 1300);
    tween(G, "flow", 2.4, 1200, E.inOut, p0); tween(G, "drift", .02, 1600, E.inOut, p0 + 1800);
    S.locateEnd = now() + (REDUCED ? 0 : p0 + 1900); S.nextTracer = now() + p0 + 1000;
    S.tm = setTimeout(() => { if (S.mode !== "locate") return; S.mode = "scan"; if (S.queued) { const q = S.queued; S.queued = null; reveal(q); } }, Math.max(0, S.locateEnd - now()));
  }
  function setData(d) { const wait = S.mode === "locate" ? Math.max(0, S.locateEnd - now()) : 0; if (wait > 0) S.queued = d; else reveal(d); return wait + (REDUCED ? 0 : 1200) + revealDur(d); }
  function reset() {
    clearTimeout(S.tm); Object.assign(S, { mode: "idle", data: null, queued: null, sel: -1, hov: -1, stage: 0, nodes: [], ranked: [] }); tip(-1);
    S.targetLL = KOREA.slice(); S.target = vec(KOREA[0], KOREA[1]);
    if (F.alpha > .02) { tween(F, "alpha", 0, 450, E.out); G.dist = 1.5; G.alpha = 0; tween(G, "alpha", 1, 900, E.out, 150); }
    tween(G, "dist", D0, 1400, E.out, 150); tween(G, "zoom", 1, 1600, E.inOut, 150); tween(G, "hi", 0, 700); tween(G, "ripple", 0, 600); tween(G, "flow", 1, 1200); tween(G, "drift", 0, 800);
    G.spin = 1; S.nextTracer = now() + 1500;
  }
  return {
    intro, locate, setData, reset,
    setStage: s => { S.stage = s; },
    select: i => { S.sel = i; tip(i); },
    hover: i => { S.hov = i; tip(i >= 0 ? i : S.sel); },
    onPick: f => { S.pick = f; },
    hasGL: () => !!G2
  };
})();
