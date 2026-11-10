"use strict";
// 홀로 맵: 점 지구본 → 한국으로 확대 → 레이더 위 응급실 노드와 경로
const Holo = (() => {
  const panel = $("#holoPanel"), cv = $("#holo"), ctx = cv.getContext("2d"), tipEl = $("#tip");
  let W = 1, H = 1, DPR = 1, cx = 0, cy = 0, Rh = 100, raf = 0, last = now(), ga = 1;
  const G = { lon0: 95 * D2R, lat0: 24 * D2R, zoom: 1, alpha: 1, spin: 1, hi: 0 };
  const RD = { alpha: 0, sweep: -Math.PI / 2, lab: 0 };
  const S = { mode: "idle", stage: 0, data: null, nodes: [], ranked: [], nearest: null, nearestLab: null, originLab: null, arcsEnd: 0, ringStep: 1, ringN: 4, revealAt: 0, sel: -1, hov: -1, queued: null, locateEnd: 0, pick: null, tm: 0 };
  const tweens = [];
  function tween(o, k, to, ms, fn = E.inOut, delay = 0) { if (REDUCED) { o[k] = to; return; } tweens.push({ o, k, to, ms, fn, t0: now() + delay, from: null }); }
  function runTweens(t) {
    for (let i = tweens.length - 1; i >= 0; i--) {
      const w = tweens[i]; if (t < w.t0) continue;
      if (w.from === null) w.from = w.o[w.k];
      const p = clamp((t - w.t0) / w.ms, 0, 1); w.o[w.k] = w.from + (w.to - w.from) * w.fn(p);
      if (p >= 1) tweens.splice(i, 1);
    }
  }

  const PTS = (() => {
    const N = 9000, GA = Math.PI * (3 - Math.sqrt(5)), land = [], sea = [];
    for (let i = 0; i < N; i++) {
      const y = 1 - 2 * (i + .5) / N, r = Math.sqrt(1 - y * y), th = i * GA;
      const lat = Math.asin(y), lon = Math.atan2(Math.sin(th) * r, Math.cos(th) * r);
      const kr = lat > 33 * D2R && lat < 39.5 * D2R && lon > 124.5 * D2R && lon < 130 * D2R ? 1 : 0;
      if (isLand(lat / D2R, lon / D2R)) land.push(Math.cos(lat), Math.sin(lat), lon, kr);
      else if (i % 5 === 0) sea.push(Math.cos(lat), Math.sin(lat), lon, 0);
    }
    return { land: new Float32Array(land), sea: new Float32Array(sea) };
  })();
  const HUB = [37.57, 126.98];
  const ARCS = [[35.68, 139.69], [1.35, 103.82], [-33.87, 151.21], [37.77, -122.42], [51.51, -.13], [25.2, 55.27], [22.32, 114.17], [40.71, -74], [-23.55, -46.63], [19.08, 72.88], [55.75, 37.62], [-1.29, 36.82]].map((c, k) => {
    const v = ([la, lo]) => [Math.cos(la * D2R) * Math.cos(lo * D2R), Math.sin(la * D2R), Math.cos(la * D2R) * Math.sin(lo * D2R)];
    const A = v(HUB), B = v(c), w = Math.acos(clamp(A[0] * B[0] + A[1] * B[1] + A[2] * B[2], -1, 1)), sw = Math.sin(w) || 1, n = 60, P = new Float32Array((n + 1) * 3);
    for (let i = 0; i <= n; i++) {
      const t = i / n, f1 = Math.sin((1 - t) * w) / sw, f2 = Math.sin(t * w) / sw, x = f1 * A[0] + f2 * B[0], y = f1 * A[1] + f2 * B[1], z = f1 * A[2] + f2 * B[2];
      P[i * 3] = Math.asin(clamp(y, -1, 1)); P[i * 3 + 1] = Math.atan2(z, x); P[i * 3 + 2] = 1 + Math.sin(Math.PI * t) * (.04 + .22 * w / Math.PI);
    }
    return { P, n, off: (k * .618) % 1, sp: .00008 + (k % 4) * .00002, c: [[34, 211, 238], [139, 92, 246], [244, 114, 182]][k % 3] };
  });

  const SPR = new Map();
  function spr(c) {
    const key = c.join(); let o = SPR.get(key); if (o) return o;
    const s = 64; o = document.createElement("canvas"); o.width = o.height = s;
    const g = o.getContext("2d"), gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(.16, rgba(c, .95)); gr.addColorStop(.45, rgba(c, .28)); gr.addColorStop(1, rgba(c, 0));
    g.fillStyle = gr; g.fillRect(0, 0, s, s); SPR.set(key, o); return o;
  }
  function glow(c, x, y, r, a = 1) { if (r <= 0) return; ctx.globalAlpha = ga * a; ctx.drawImage(spr(c), x - r, y - r, r * 2, r * 2); ctx.globalAlpha = ga; }
  function rr(x, y, w, hh, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + hh, r); ctx.arcTo(x + w, y + hh, x, y + hh, r); ctx.arcTo(x, y + hh, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function project(la, lo, R, hh, sl0, cl0) { const cl = Math.cos(la), sl = Math.sin(la), dl = lo - G.lon0, cd = Math.cos(dl); return [cx + R * hh * cl * Math.sin(dl), cy - R * hh * (cl0 * sl - sl0 * cl * cd), sl0 * sl + cl0 * cl * cd]; }

  let gridC = null;
  function grid(R) {
    if (gridC && gridC.R === R && gridC.W === W && gridC.H === H) return gridC.c;
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const g = c.getContext("2d"), step = 18 * DPR, s = 1.2 * DPR; g.fillStyle = "rgb(143,243,255)";
    for (let y = cy - Math.floor(R / step) * step; y <= cy + R; y += step) for (let x = cx - Math.floor(R / step) * step; x <= cx + R; x += step) {
      const d = Math.hypot(x - cx, y - cy); if (d > R - 4 * DPR) continue;
      g.globalAlpha = .07 + .13 * (1 - d / R); g.fillRect(x - s / 2, y - s / 2, s, s);
    }
    gridC = { R, W, H, c }; return c;
  }
  function arcSeg(r, rot, segs, col, lw) { ctx.strokeStyle = col; ctx.lineWidth = lw * DPR; ctx.lineCap = "round"; for (const [a, b] of segs) { ctx.beginPath(); ctx.arc(0, 0, r, a + rot, b + rot); ctx.stroke(); } }
  function drawRing(t) {
    const R = Rh; ctx.save(); ctx.translate(cx, cy);
    ctx.lineWidth = DPR; ctx.strokeStyle = "rgba(103,232,249,.2)"; ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke();
    const rot = t * .00003; ctx.beginPath();
    for (let d = 0; d < 360; d += 2) { const a = d * D2R + rot, L = (d % 30 === 0 ? 11 : d % 10 === 0 ? 7 : 3.5) * DPR; ctx.moveTo(Math.cos(a) * R, Math.sin(a) * R); ctx.lineTo(Math.cos(a) * (R - L), Math.sin(a) * (R - L)); }
    ctx.strokeStyle = "rgba(103,232,249,.3)"; ctx.stroke();
    arcSeg(R * 1.035, t * .00016, [[0, .85], [1.25, 2.1], [3.2, 3.5], [4.1, 5.5]], "rgba(139,92,246,.6)", 2.2);
    arcSeg(R * .955, -t * .0001, [[.3, 1.1], [2.5, 3.8], [4.9, 5.85]], "rgba(34,211,238,.42)", 1.2);
    arcSeg(R * 1.07, -t * .00006, [[.9, 1], [2.2, 2.26], [3.9, 4.06], [5.3, 5.37]], "rgba(244,114,182,.75)", 3);
    ctx.save(); ctx.rotate(t * .0004); ctx.fillStyle = "rgba(143,243,255,.9)"; ctx.beginPath(); ctx.moveTo(R + 4 * DPR, 0); ctx.lineTo(R + 11 * DPR, -4 * DPR); ctx.lineTo(R + 11 * DPR, 4 * DPR); ctx.closePath(); ctx.fill(); ctx.restore();
    ctx.font = "500 " + 10 * DPR + "px " + MONO; ctx.fillStyle = "rgba(143,243,255,.55)"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    [["N", -Math.PI / 2], ["E", 0], ["S", Math.PI / 2], ["W", Math.PI]].forEach(([s, a]) => ctx.fillText(s, Math.cos(a) * (R + 17 * DPR), Math.sin(a) * (R + 17 * DPR)));
    ctx.restore();
  }

  function drawGlobe(t) {
    if (G.alpha < .01) return;
    const R = Rh * .74 * G.zoom, sl0 = Math.sin(G.lat0), cl0 = Math.cos(G.lat0);
    ga = G.alpha; ctx.save(); ctx.globalAlpha = ga * clamp((2.2 - G.zoom) / 1.2, 0, 1);
    let g = ctx.createRadialGradient(cx, cy, R * .9, cx, cy, R * 1.25);
    g.addColorStop(0, "rgba(120,110,255,.28)"); g.addColorStop(.35, "rgba(70,140,255,.1)"); g.addColorStop(1, "rgba(34,211,238,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * 1.25, 0, TAU); ctx.fill();
    g = ctx.createRadialGradient(cx - R * .35, cy - R * .45, R * .05, cx, cy, R);
    g.addColorStop(0, "rgba(70,80,190,.32)"); g.addColorStop(.72, "rgba(12,15,46,.6)"); g.addColorStop(1, "rgba(40,50,140,.4)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
    ctx.strokeStyle = "rgba(150,170,255,.35)"; ctx.lineWidth = DPR; ctx.stroke(); ctx.globalAlpha = ga;
    const B = [[], [], [], []], K = [], P = PTS.land;
    for (let i = 0; i < P.length; i += 4) {
      const cl = P[i], sl = P[i + 1], dl = P[i + 2] - G.lon0, cd = Math.cos(dl), z = sl0 * sl + cl0 * cl * cd;
      if (z <= 0) continue;
      const x = cx + R * cl * Math.sin(dl), y = cy - R * (cl0 * sl - sl0 * cl * cd);
      if (P[i + 3] && G.hi > .05) K.push(x, y); else B[z > .75 ? 3 : z > .5 ? 2 : z > .25 ? 1 : 0].push(x, y);
    }
    const s = (1.3 + .55 * Math.min(G.zoom - 1, 2.5)) * DPR, COLS = ["rgba(139,92,246,.42)", "rgba(129,140,248,.62)", "rgba(103,232,249,.82)", "rgba(220,250,255,.95)"];
    for (let b = 0; b < 4; b++) { ctx.fillStyle = COLS[b]; const A = B[b]; for (let k = 0; k < A.length; k += 2) ctx.fillRect(A[k] - s / 2, A[k + 1] - s / 2, s, s); }
    if (K.length) { ctx.fillStyle = rgba(COL.origin, .6 + .4 * G.hi); const s2 = s * 1.6; for (let k = 0; k < K.length; k += 2) ctx.fillRect(K[k] - s2 / 2, K[k + 1] - s2 / 2, s2, s2); }
    ctx.fillStyle = "rgba(99,102,241,.2)"; const SE = PTS.sea, s3 = s * .8;
    for (let i = 0; i < SE.length; i += 4) { const cl = SE[i], sl = SE[i + 1], dl = SE[i + 2] - G.lon0, cd = Math.cos(dl); if (sl0 * sl + cl0 * cl * cd <= 0) continue; ctx.fillRect(cx + R * cl * Math.sin(dl) - s3 / 2, cy - R * (cl0 * sl - sl0 * cl * cd) - s3 / 2, s3, s3); }
    if (G.zoom < 1.6) drawArcs(t, R, sl0, cl0);
    if (G.hi > .05) drawTarget(t, R, sl0, cl0);
    ctx.restore(); ga = 1;
  }
  function drawArcs(t, R, sl0, cl0) {
    const fade = clamp(1 - (G.zoom - 1) / .6, 0, 1) * (1 - G.hi); if (fade <= .01) return;
    ctx.lineWidth = 1.2 * DPR; ctx.lineCap = "round";
    const hub = project(HUB[0] * D2R, HUB[1] * D2R, R, 1, sl0, cl0);
    if (hub[2] > 0) { ctx.globalCompositeOperation = "lighter"; glow([244, 114, 182], hub[0], hub[1], (12 + 4 * Math.sin(t * .004)) * DPR, fade); ctx.globalCompositeOperation = "source-over"; }
    for (const a of ARCS) {
      const n = a.n, xs = new Float32Array((n + 1) * 2), vis = new Uint8Array(n + 1);
      for (let i = 0; i <= n; i++) { const hh = a.P[i * 3 + 2], p = project(a.P[i * 3], a.P[i * 3 + 1], R, hh, sl0, cl0); xs[i * 2] = p[0]; xs[i * 2 + 1] = p[1]; vis[i] = p[2] >= 0 || hh * hh * (1 - p[2] * p[2]) > 1 ? 1 : 0; }
      ctx.strokeStyle = rgba(a.c, .28 * fade); ctx.beginPath(); let pen = false;
      for (let i = 0; i <= n; i++) { if (vis[i]) { if (pen) ctx.lineTo(xs[i * 2], xs[i * 2 + 1]); else ctx.moveTo(xs[i * 2], xs[i * 2 + 1]); pen = true; } else pen = false; }
      ctx.stroke();
      const hi = Math.floor(((t * a.sp + a.off) % 1) * n);
      if (!vis[hi]) continue;
      ctx.strokeStyle = rgba(a.c, .85 * fade); ctx.beginPath(); pen = false;
      for (let i = Math.max(0, hi - 9); i <= hi; i++) { if (!vis[i]) { pen = false; continue; } if (pen) ctx.lineTo(xs[i * 2], xs[i * 2 + 1]); else ctx.moveTo(xs[i * 2], xs[i * 2 + 1]); pen = true; }
      ctx.stroke(); ctx.globalCompositeOperation = "lighter"; glow(a.c, xs[hi * 2], xs[hi * 2 + 1], 9 * DPR, fade); ctx.globalCompositeOperation = "source-over";
    }
  }
  function drawTarget(t, R, sl0, cl0) {
    const p = project(36.3 * D2R, 127.8 * D2R, R, 1, sl0, cl0); if (p[2] <= 0) return;
    const x = p[0], y = p[1], k = G.hi, s = (24 + 8 * Math.sin(t * .006)) * DPR;
    ctx.strokeStyle = rgba(COL.origin, .9 * k); ctx.lineWidth = 1.6 * DPR;
    for (let q = 0; q < 4; q++) { const a = q * Math.PI / 2 + t * .0015; ctx.beginPath(); ctx.arc(x, y, s, a, a + .8); ctx.stroke(); }
    ctx.globalAlpha = ga * k * .55; ctx.beginPath(); ctx.moveTo(x - s * 2.4, y); ctx.lineTo(x - s * 1.25, y); ctx.moveTo(x + s * 1.25, y); ctx.lineTo(x + s * 2.4, y); ctx.moveTo(x, y - s * 2.4); ctx.lineTo(x, y - s * 1.25); ctx.moveTo(x, y + s * 1.25); ctx.lineTo(x, y + s * 2.4); ctx.stroke(); ctx.globalAlpha = ga;
    ctx.font = "600 " + 10.5 * DPR + "px " + MONO; ctx.fillStyle = rgba(COL.origin, k); ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText("TARGET · KOREA", x + s + 10 * DPR, y - s - 4 * DPR);
  }
  function drawRadar(t) {
    if (RD.alpha < .01) return;
    const R = Rh * .86; ga = RD.alpha; ctx.save(); ctx.globalAlpha = ga;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    g.addColorStop(0, "rgba(34,211,238,.08)"); g.addColorStop(.75, "rgba(60,70,180,.05)"); g.addColorStop(1, "rgba(139,92,246,.12)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
    ctx.drawImage(grid(R), 0, 0);
    const n = S.data ? S.ringN : 4; ctx.lineWidth = DPR;
    for (let k = 1; k <= n; k++) { ctx.strokeStyle = k === n ? "rgba(139,92,246,.5)" : "rgba(103,232,249,.17)"; ctx.setLineDash(k === n ? [] : [3 * DPR, 5 * DPR]); ctx.beginPath(); ctx.arc(cx, cy, R * k / n, 0, TAU); ctx.stroke(); }
    ctx.setLineDash([]); ctx.strokeStyle = "rgba(103,232,249,.13)"; ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke();
    if (S.data && !S.approx && RD.lab > .01) {
      ctx.globalAlpha = ga * RD.lab; ctx.font = "500 " + 10 * DPR + "px " + MONO; ctx.fillStyle = "rgba(143,243,255,.8)"; ctx.textAlign = "left"; ctx.textBaseline = "bottom";
      const a = -Math.PI / 4 - .12; for (let k = 1; k <= n; k++) { const r = R * k / n; ctx.fillText(fmtKm(S.ringStep * k), cx + Math.cos(a) * r + 4 * DPR, cy + Math.sin(a) * r); }
      ctx.globalAlpha = ga;
    }
    drawSweep(R);
    if (S.data) drawData(t); else drawScan(R, t);
    ctx.restore(); ga = 1;
  }
  function drawSweep(R) {
    const a = RD.sweep, span = .95, k = S.data ? .45 : 1;
    if (ctx.createConicGradient) {
      const cg = ctx.createConicGradient(a - span, cx, cy), e = span / TAU;
      cg.addColorStop(0, "rgba(34,211,238,0)"); cg.addColorStop(e * .7, "rgba(34,211,238," + .07 * k + ")"); cg.addColorStop(e, "rgba(103,232,249," + .3 * k + ")"); cg.addColorStop(Math.min(1, e + .002), "rgba(34,211,238,0)"); cg.addColorStop(1, "rgba(34,211,238,0)");
      ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
    }
    ctx.strokeStyle = "rgba(143,243,255," + .6 * k + ")"; ctx.lineWidth = 1.4 * DPR; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); ctx.stroke();
  }
  const SRC = [{ a: -2.36, t: "KAKAO LOCAL", c: [250, 204, 21] }, { a: -.79, t: "NEMC ER LIST", c: [34, 211, 238] }, { a: .79, t: "NEMC LIVE BEDS", c: [52, 211, 153] }, { a: 2.36, t: "KAKAO MOBILITY", c: [244, 114, 182] }];
  function drawScan(R, t) {
    const Rs = Rh * .96, small = W < 600 * DPR;
    SRC.forEach((s, k) => {
      const on = S.stage === k + 1, done = S.stage > k + 1, lv = S.mode === "idle" ? .12 : on ? 1 : done ? .4 : .2;
      const sx = cx + Math.cos(s.a) * Rs, sy = cy + Math.sin(s.a) * Rs, qx = cx + Math.cos(s.a + .6) * R * .5, qy = cy + Math.sin(s.a + .6) * R * .5;
      ctx.strokeStyle = rgba(s.c, .08 + .25 * lv); ctx.lineWidth = DPR; ctx.setLineDash([2 * DPR, 6 * DPR]); ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(qx, qy, cx, cy); ctx.stroke(); ctx.setLineDash([]);
      ctx.globalCompositeOperation = "lighter";
      const cnt = on ? 7 : 2;
      for (let i = 0; i < cnt; i++) { const u = (t * (on ? .0005 : .0002) + i / cnt + k * .13) % 1, v = 1 - u; glow(s.c, v * v * sx + 2 * v * u * qx + u * u * cx, v * v * sy + 2 * v * u * qy + u * u * cy, (on ? 9 : 6) * DPR, lv * (1 - u * .5)); }
      glow(s.c, sx, sy, (on ? 18 : 11) * DPR, .4 + .6 * lv);
      ctx.globalCompositeOperation = "source-over";
      ctx.font = (on ? "700 " : "500 ") + (small ? 8.5 : 10) * DPR + "px " + MONO; ctx.fillStyle = rgba(s.c, .35 + .65 * lv); ctx.textAlign = "center"; ctx.textBaseline = "middle";
      const lr = Rs - 24 * DPR; ctx.fillText(s.t, cx + Math.cos(s.a) * lr, cy + Math.sin(s.a) * lr);
    });
    const st5 = S.stage >= 5, pulse = .5 + .5 * Math.sin(t * .006);
    ctx.globalCompositeOperation = "lighter"; glow([139, 92, 246], cx, cy, (30 + 12 * pulse) * DPR * (st5 ? 1.5 : 1), st5 ? .9 : .5); glow([34, 211, 238], cx, cy, 13 * DPR, .9); ctx.globalCompositeOperation = "source-over";
    ctx.lineWidth = 1.6 * DPR; ctx.lineCap = "round";
    [[22, .0021, [139, 92, 246]], [31, -.0015, [34, 211, 238]], [41, .0009, [244, 114, 182]]].forEach(([r, sp, c], i) => { const a0 = t * sp * (st5 ? 2.2 : 1); ctx.strokeStyle = rgba(c, .75); ctx.beginPath(); ctx.arc(cx, cy, r * DPR, a0, a0 + 1.9 + i * .5); ctx.stroke(); ctx.beginPath(); ctx.arc(cx, cy, r * DPR, a0 + Math.PI, a0 + Math.PI + .8); ctx.stroke(); });
    if (S.mode !== "idle") { ctx.font = "700 " + 9.5 * DPR + "px " + MONO; ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(st5 ? "AI DECISION" : "COLLECTING", cx, cy + 58 * DPR); }
  }

  function drawData(t) {
    const tt = t - S.revealAt; ctx.lineWidth = DPR;
    for (const n of S.nodes) { if (n.h.rank || S.approx) continue; const p = clamp((tt - n.t0) / 420, 0, 1); if (p <= 0) continue; ctx.strokeStyle = rgba(COL[n.h.st], .14 * p); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + (n.x - cx) * p, cy + (n.y - cy) * p); ctx.stroke(); }
    const nr = S.nearest;
    if (nr && nr.h.rank !== 1) {
      const p = E.out(clamp((tt - S.arcsEnd) / 700, 0, 1));
      if (p > 0) { ctx.save(); ctx.setLineDash([5 * DPR, 5 * DPR]); ctx.lineDashOffset = -t * .02 * DPR; ctx.strokeStyle = rgba(COL.hold, .85); ctx.lineWidth = 1.5 * DPR; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + (nr.x - cx) * p, cy + (nr.y - cy) * p); ctx.stroke(); ctx.restore(); }
    }
    for (const n of S.ranked) {
      const p = clamp((tt - n.a0) / 700, 0, 1); if (p <= 0) continue;
      const one = n.h.rank === 1, c = one ? COL.rec : [139, 160, 250], P = n.curve, cnt = P.length / 2 - 1, m = Math.max(1, Math.round(cnt * E.out(p)));
      const lg = ctx.createLinearGradient(cx, cy, n.x, n.y); lg.addColorStop(0, rgba(COL.origin, .95)); lg.addColorStop(1, rgba(c, .95));
      ctx.strokeStyle = lg; ctx.lineWidth = (one ? 2.8 : 1.7) * DPR; ctx.lineCap = "round"; ctx.shadowColor = rgba(c, .9); ctx.shadowBlur = (one ? 16 : 7) * DPR;
      ctx.beginPath(); ctx.moveTo(P[0], P[1]); for (let i = 1; i <= m; i++) ctx.lineTo(P[i * 2], P[i * 2 + 1]); ctx.stroke(); ctx.shadowBlur = 0;
      if (p >= 1) { ctx.globalCompositeOperation = "lighter"; const k = one ? 4 : 2; for (let j = 0; j < k; j++) { const ix = Math.floor(((t * (one ? .00042 : .0003) + j / k) % 1) * cnt); glow(one ? [200, 255, 255] : c, P[ix * 2], P[ix * 2 + 1], (one ? 10 : 7) * DPR, .95); } ctx.globalCompositeOperation = "source-over"; }
    }
    for (const n of S.nodes) drawNode(n, t, tt);
    if (!S.approx) drawOrigin(t, tt);
    drawLabels(tt);
  }
  function bracket(x, y, r, rot, c) { ctx.strokeStyle = rgba(c, .85); ctx.lineWidth = 1.6 * DPR; for (let k = 0; k < 4; k++) { const a = rot + k * Math.PI / 2; ctx.beginPath(); ctx.arc(x, y, r, a, a + .7); ctx.stroke(); } }
  function badge(x, y, rk, c) { const r = 8.5 * DPR; ctx.fillStyle = "rgba(3,5,16,.92)"; ctx.strokeStyle = rgba(c, .95); ctx.lineWidth = 1.4 * DPR; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.stroke(); ctx.fillStyle = "#fff"; ctx.font = "700 " + 10.5 * DPR + "px " + MONO; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(rk), x, y + .5 * DPR); }
  function drawNode(n, t, tt) {
    const p = clamp((tt - n.t0) / 450, 0, 1); if (p <= 0) return;
    const x = n.h, c = COL[x.st], out = x.st === "out", one = x.rank === 1;
    const r = Math.max(0, (x.rank ? 6.5 : 4.4) * DPR * E.back(p) + (x.beds ? Math.min(Math.sqrt(x.beds), 4.5) * .45 * DPR : 0));
    ctx.globalCompositeOperation = "lighter"; glow(c, n.x, n.y, r * (one ? 7 : 4.5), out ? .3 : .75); ctx.globalCompositeOperation = "source-over";
    if (p < 1) { ctx.strokeStyle = rgba(c, (1 - p) * .9); ctx.lineWidth = 1.5 * DPR; ctx.beginPath(); ctx.arc(n.x, n.y, r + 26 * DPR * p, 0, TAU); ctx.stroke(); }
    ctx.fillStyle = rgba(c, out ? .55 : 1); ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, TAU); ctx.fill();
    if (!out) { ctx.fillStyle = "rgba(255,255,255,.92)"; ctx.beginPath(); ctx.arc(n.x, n.y, r * .38, 0, TAU); ctx.fill(); }
    if (x.st === "hold") { ctx.strokeStyle = rgba(c, .85); ctx.lineWidth = 1.2 * DPR; ctx.setLineDash([2 * DPR, 3 * DPR]); ctx.beginPath(); ctx.arc(n.x, n.y, r + 4 * DPR, 0, TAU); ctx.stroke(); ctx.setLineDash([]); }
    if (out) { const d = r + 2 * DPR; ctx.strokeStyle = rgba(c, .9); ctx.lineWidth = 1.4 * DPR; ctx.beginPath(); ctx.moveTo(n.x - d, n.y - d); ctx.lineTo(n.x + d, n.y + d); ctx.moveTo(n.x + d, n.y - d); ctx.lineTo(n.x - d, n.y + d); ctx.stroke(); }
    if (one && p >= 1) { const u = (t % 1800) / 1800; ctx.strokeStyle = rgba(c, .7 * (1 - u)); ctx.lineWidth = 1.5 * DPR; ctx.beginPath(); ctx.arc(n.x, n.y, r + 30 * DPR * u, 0, TAU); ctx.stroke(); bracket(n.x, n.y, r + 12 * DPR, t * .0012, c); }
    if (x.i === S.sel || x.i === S.hov) bracket(n.x, n.y, r + (one ? 18 : 10) * DPR, -t * .002, [255, 255, 255]);
    if (x.rank && p >= 1) badge(n.x + r * .9 + 7 * DPR, n.y - r * .9 - 7 * DPR, x.rank, c);
  }
  function drawOrigin(t, tt) {
    const c = COL.origin, p = clamp(tt / 500, 0, 1); if (p <= 0) return;
    for (let k = 0; k < 3; k++) { const u = (t / 2400 + k / 3) % 1; ctx.strokeStyle = rgba(c, .55 * (1 - u) * p); ctx.lineWidth = 1.3 * DPR; ctx.beginPath(); ctx.arc(cx, cy, (8 + 46 * u) * DPR, 0, TAU); ctx.stroke(); }
    ctx.globalCompositeOperation = "lighter"; glow(c, cx, cy, 34 * DPR * p, .9); ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(cx, cy, 3.6 * DPR * p, 0, TAU); ctx.fill();
    const a = 9 * DPR, b = 16 * DPR; ctx.strokeStyle = rgba(c, .9 * p); ctx.lineWidth = 1.4 * DPR;
    ctx.beginPath(); ctx.moveTo(cx - b, cy); ctx.lineTo(cx - a, cy); ctx.moveTo(cx + a, cy); ctx.lineTo(cx + b, cy); ctx.moveTo(cx, cy - b); ctx.lineTo(cx, cy - a); ctx.moveTo(cx, cy + a); ctx.lineTo(cx, cy + b); ctx.stroke();
  }
  function drawLabels(tt) {
    ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.lineJoin = "round";
    const L = S.originLab, po = clamp((tt - 150) / 500, 0, 1);
    if (L && po > 0) {
      ctx.globalAlpha = ga * po; rr(L.x, L.y, L.w, L.h, 7 * DPR); ctx.fillStyle = "rgba(6,8,22,.88)"; ctx.fill(); ctx.strokeStyle = rgba(COL.origin, .85); ctx.lineWidth = 1.2 * DPR; ctx.stroke();
      ctx.font = "700 " + 9 * DPR + "px " + MONO; ctx.fillStyle = rgba(COL.origin, 1); ctx.fillText("ORIGIN", L.x + 9 * DPR, L.y + L.h / 2 + .5 * DPR);
      ctx.font = "700 " + 12 * DPR + "px " + FONT; ctx.fillStyle = "#fff"; ctx.fillText(L.txt, L.x + L.tx, L.y + L.h / 2 + .5 * DPR);
    }
    const NL = S.nearestLab;
    if (NL) { const p = clamp((tt - S.arcsEnd - 400) / 500, 0, 1); if (p > 0) { ctx.globalAlpha = ga * p; ctx.font = "700 " + 10 * DPR + "px " + FONT; ctx.lineWidth = 4 * DPR; ctx.strokeStyle = "rgba(3,4,11,.9)"; ctx.strokeText(NL.txt, NL.x, NL.y); ctx.fillStyle = rgba(COL.hold, 1); ctx.fillText(NL.txt, NL.x, NL.y); } }
    for (const n of S.nodes) {
      const lb = n.lab; if (!lb) continue; const p = clamp((tt - n.t0 - 200) / 400, 0, 1); if (p <= 0) continue;
      ctx.globalAlpha = ga * p * (n.h.st === "out" ? .65 : 1); ctx.font = lb.font; ctx.lineWidth = 4 * DPR; ctx.strokeStyle = "rgba(3,4,11,.88)";
      const y = lb.y + lb.h / 2; ctx.strokeText(lb.txt, lb.x, y); ctx.fillStyle = n.h.rank ? "#ffffff" : rgba(COL[n.h.st], 1); ctx.fillText(lb.txt, lb.x, y);
    }
    ctx.globalAlpha = ga;
  }

  const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  function niceStep(m) { for (const s of [.1, .2, .25, .5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100]) if (m / s <= 4.2) return s; return 200; }
  function curve(x0, y0, x1, y1, bend) { const qx = (x0 + x1) / 2 - (y1 - y0) * bend, qy = (y0 + y1) / 2 + (x1 - x0) * bend, N = 40, P = new Float32Array((N + 1) * 2); for (let i = 0; i <= N; i++) { const u = i / N, v = 1 - u; P[i * 2] = v * v * x0 + 2 * v * u * qx + u * u * x1; P[i * 2 + 1] = v * v * y0 + 2 * v * u * qy + u * u * y1; } return P; }
  function revealDur(d) { const m = d.hs.filter(x => x.lat != null && x.lng != null); return 300 + m.length * 110 + 150 + m.filter(x => x.rank).length * 380 + 350; }
  function layout() {
    S.nodes = []; S.ranked = []; S.nearest = null; S.originLab = null; S.nearestLab = null;
    const d = S.data; if (!d) return;
    const R = Rh * .86, o = d.origin, pts = d.hs.filter(x => x.lat != null && x.lng != null);
    let lat0 = o.lat, lng0 = o.lng; S.approx = lat0 == null || lng0 == null;
    if (S.approx) { if (!pts.length) return; lat0 = pts.reduce((s, x) => s + x.lat, 0) / pts.length; lng0 = pts.reduce((s, x) => s + x.lng, 0) / pts.length; }
    const kx = Math.cos(lat0 * D2R) * 111.32, ky = 110.574; let maxKm = .3;
    const P = pts.map(x => { const dx = (x.lng - lng0) * kx, dy = (x.lat - lat0) * ky, dist = Math.hypot(dx, dy); maxKm = Math.max(maxKm, dist); return { h: x, dx, dy, dist }; });
    S.ringStep = niceStep(maxKm * 1.06); S.ringN = Math.max(1, Math.ceil(maxKm * 1.06 / S.ringStep)); const sc = R / (S.ringN * S.ringStep);
    P.sort((a, b) => a.dist - b.dist);
    S.nodes = P.map((p, k) => ({ h: p.h, x: cx + p.dx * sc, y: cy - p.dy * sc, t0: 300 + k * 110, dist: p.dist }));
    S.ranked = S.nodes.filter(n => n.h.rank).sort((a, b) => a.h.rank - b.h.rank);
    const base = 300 + S.nodes.length * 110 + 150;
    if (S.approx) S.ranked = [];
    S.ranked.forEach((n, k) => { n.a0 = base + k * 380; n.curve = curve(cx, cy, n.x, n.y, k % 2 ? -.17 : .17); });
    S.arcsEnd = base + S.ranked.length * 380 + 350;
    S.nearest = S.approx ? null : S.nodes.filter(n => n.h.st !== "out").sort((a, b) => (a.h.km ?? a.dist) - (b.h.km ?? b.dist))[0] || null;
    placeLabels();
  }
  function placeLabels() {
    const d = S.data; if (!d) return;
    const placed = [], pr = panel.getBoundingClientRect();
    $$(".hud", panel).forEach(e => { const r = e.getBoundingClientRect(); if (r.width && r.height) placed.push({ x: (r.left - pr.left) * DPR, y: (r.top - pr.top) * DPR, w: r.width * DPR, h: r.height * DPR }); });
    const ob = (x, y, r) => placed.push({ x: x - r, y: y - r, w: r * 2, h: r * 2 });
    ob(cx, cy, 16 * DPR); S.nodes.forEach(n => ob(n.x, n.y, (n.h.rank ? 10 : 6) * DPR));
    ctx.font = "700 " + 12 * DPR + "px " + FONT;
    const ot = d.origin.name.length > 18 ? d.origin.name.slice(0, 17) + "…" : d.origin.name, tx = 50 * DPR, ow = tx + ctx.measureText(ot).width + 10 * DPR, oh = 24 * DPR;
    const OL = { x: cx - ow / 2, y: cy - 44 * DPR - oh, w: ow, h: oh, txt: ot, tx };
    if (S.nodes.some(n => Math.abs(n.x - cx) < ow / 2 + 8 * DPR && n.y > OL.y - 8 * DPR && n.y < OL.y + oh + 8 * DPR)) OL.y = cy + 40 * DPR;
    if (!S.approx) { S.originLab = OL; placed.push(OL); }
    const nr = S.nearest;
    if (nr && nr.h.rank !== 1) {
      ctx.font = "700 " + 10 * DPR + "px " + FONT;
      const txt = "직선 최단" + (nr.h.km != null ? " " + nr.h.km + "km" : ""), w = ctx.measureText(txt).width, dx = nr.x - cx, dy = nr.y - cy, L = Math.hypot(dx, dy) || 1, ox = -dy / L * 14 * DPR, oy = dx / L * 14 * DPR;
      S.nearestLab = { txt, x: (cx + nr.x) / 2 + ox - (ox < 0 ? w : 0), y: (cy + nr.y) / 2 + oy };
      placed.push({ x: S.nearestLab.x, y: S.nearestLab.y - 7 * DPR, w, h: 14 * DPR });
    }
    const prio = n => n.h.rank ? n.h.rank : 10 + ST_ORDER[n.h.st];
    S.nodes.slice().sort((a, b) => prio(a) - prio(b) || a.dist - b.dist).forEach(n => {
      const big = !!n.h.rank, fs = (big ? 12.5 : 11) * DPR, font = (big ? 700 : 500) + " " + fs + "px " + FONT;
      ctx.font = font;
      const txt = n.h.short + (n.h.min != null && n.h.st !== "out" ? "  " + n.h.min + "분" : ""), w = ctx.measureText(txt).width, hh = fs * 1.3, g = (big ? 17 : 10) * DPR;
      const C = [[g, -hh / 2], [-g - w, -hh / 2], [-w / 2, -g - hh], [-w / 2, g], [g * .8, -hh - g * .4], [g * .8, g * .4], [-g * .8 - w, -hh - g * .4], [-g * .8 - w, g * .4]];
      let best = null;
      for (const [ox, oy] of C) { const r = { x: n.x + ox, y: n.y + oy, w, h: hh }; if (r.x < 6 * DPR || r.x + w > W - 6 * DPR || r.y < 6 * DPR || r.y + hh > H - 6 * DPR) continue; if (placed.some(q => hit(q, r))) continue; best = r; break; }
      if (!best && big) best = { x: clamp(n.x + g, 6 * DPR, W - w - 6 * DPR), y: n.y - hh / 2, w, h: hh };
      n.lab = best ? Object.assign(best, { txt, font }) : null; if (best) placed.push(best);
    });
  }

  function tip(i) {
    const n = S.nodes.find(x => x.h.i === i);
    if (!n) { tipEl.hidden = true; return; }
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
    const pw = panel.clientWidth, ph = panel.clientHeight, tw = tipEl.offsetWidth, th = tipEl.offsetHeight;
    let L = n.x / DPR + 20; if (L + tw > pw - 10) L = n.x / DPR - 20 - tw;
    tipEl.style.left = clamp(L, 10, Math.max(10, pw - tw - 10)) + "px"; tipEl.style.top = clamp(n.y / DPR - th / 2, 10, Math.max(10, ph - th - 10)) + "px";
  }
  function pickAt(e) { const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) * DPR, y = (e.clientY - r.top) * DPR; let best = -1, bd = 24 * DPR; for (const n of S.nodes) { const d = Math.hypot(n.x - x, n.y - y); if (d < bd) { bd = d; best = n.h.i; } } return best; }
  cv.addEventListener("pointermove", e => { if (e.pointerType !== "mouse" || !S.nodes.length) return; const i = pickAt(e); if (i !== S.hov) { S.hov = i; cv.style.cursor = i >= 0 ? "pointer" : ""; tip(i >= 0 ? i : S.sel); } });
  cv.addEventListener("pointerleave", () => { S.hov = -1; cv.style.cursor = ""; tip(S.sel); });
  cv.addEventListener("click", e => { if (!S.nodes.length) return; const i = pickAt(e); S.sel = i; tip(i); if (S.pick) S.pick(i); });

  function resize() {
    const r = panel.getBoundingClientRect(), w = Math.max(240, r.width), hh = Math.max(240, r.height);
    DPR = Math.min(window.devicePixelRatio || 1, w * hh > 640000 ? 1.5 : 2);
    W = cv.width = Math.round(w * DPR); H = cv.height = Math.round(hh * DPR);
    cx = W / 2; cy = H / 2 + (w > 700 ? 14 : 6) * DPR; Rh = Math.min(W, H) * (w > 700 ? .42 : .44);
    gridC = null; if (S.data) layout(); if (S.sel >= 0) tip(S.sel);
    if (REDUCED) draw(now());
  }
  function draw(t) {
    const dt = Math.min(64, t - last); last = t; runTweens(t);
    if (G.spin) G.lon0 += dt * .00011;
    RD.sweep = (RD.sweep + dt * (S.data ? .0007 : .0024)) % TAU;
    ctx.globalAlpha = 1; ga = 1; ctx.clearRect(0, 0, W, H);
    drawGlobe(t); drawRing(t); drawRadar(t);
  }
  function loop(t) { draw(t); raf = requestAnimationFrame(loop); }
  function start() { if (!raf && !REDUCED) raf = requestAnimationFrame(loop); }
  document.addEventListener("visibilitychange", () => { if (document.hidden) { cancelAnimationFrame(raf); raf = 0; } else start(); });
  new ResizeObserver(() => resize()).observe(panel);
  resize(); start();
  if (REDUCED) setInterval(() => draw(now()), 500);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => placeLabels());

  function reveal(d) {
    tweens.length = 0; S.data = d; S.mode = "result"; S.revealAt = now(); S.stage = 6; S.sel = S.hov = -1; tip(-1);
    if (G.alpha > .01) tween(G, "alpha", 0, 500); if (RD.alpha < 1) tween(RD, "alpha", 1, 500); tween(RD, "lab", 1, 700, E.out, 250);
    layout();
  }
  function locate() {
    tweens.length = 0; clearTimeout(S.tm);
    Object.assign(S, { mode: "locate", data: null, queued: null, sel: -1, hov: -1, stage: 1 }); layout(); tip(-1); RD.lab = 0; G.spin = 0;
    let p0 = 0;
    if (G.alpha < .6 || G.zoom > 1.2) { p0 = 650; tween(RD, "alpha", 0, 450, E.out); if (G.zoom > 1.2) G.zoom = 1.8; tween(G, "zoom", 1, 650, E.out); tween(G, "alpha", 1, 500, E.out); }
    const tl = 127.8 * D2R, dl = ((((tl - G.lon0) % TAU) + TAU * 1.5) % TAU) - Math.PI;
    tween(G, "lon0", G.lon0 + dl, 1300, E.inOut, p0); tween(G, "lat0", 36.2 * D2R, 1300, E.inOut, p0); tween(G, "hi", 1, 500, E.out, p0 + 800);
    tween(G, "zoom", 4.6, 1000, E.in, p0 + 1400); tween(G, "alpha", 0, 800, E.in, p0 + 1600); tween(RD, "alpha", 1, 800, E.out, p0 + 1700);
    S.locateEnd = now() + (REDUCED ? 0 : p0 + 2500);
    S.tm = setTimeout(() => { if (S.mode !== "locate") return; S.mode = "scan"; if (S.queued) { const q = S.queued; S.queued = null; reveal(q); } }, Math.max(0, S.locateEnd - now()));
  }
  function setData(d) { const wait = S.mode === "locate" ? Math.max(0, S.locateEnd - now()) : 0; if (wait > 0) S.queued = d; else reveal(d); return wait + revealDur(d); }
  function reset() {
    tweens.length = 0; clearTimeout(S.tm);
    Object.assign(S, { mode: "idle", data: null, queued: null, sel: -1, hov: -1, stage: 0 }); layout(); tip(-1);
    tween(RD, "alpha", 0, 500); tween(RD, "lab", 0, 300); if (G.zoom > 1.2) G.zoom = 2.2; tween(G, "zoom", 1, 1100, E.out); tween(G, "alpha", 1, 900, E.out, 150); tween(G, "hi", 0, 600); G.spin = 1;
  }
  return {
    locate, setData, reset,
    setStage: s => { S.stage = s; },
    select: i => { S.sel = i; tip(i); },
    hover: i => { S.hov = i; tip(i >= 0 ? i : S.sel); },
    onPick: f => { S.pick = f; }
  };
})();
