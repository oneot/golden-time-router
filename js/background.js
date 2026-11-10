"use strict";
// 배경: 보라·청록 데이터 흐름
const FX = (() => {
  const cv = $("#fx"), ctx = cv.getContext("2d");
  let W = 0, H = 0, DPR = 1, P = [], raf = 0, boost = 0, boostT = 0;
  function spawn(p, any) { p.x = any ? Math.random() * W : -10 * DPR; p.y = Math.random() * H; p.v = .35 + Math.random() * 1.05; p.c = Math.random(); p.life = 260 + Math.random() * 520; p.tr = []; return p; }
  function resize() { DPR = Math.min(window.devicePixelRatio || 1, 1.5); W = cv.width = Math.round(innerWidth * DPR); H = cv.height = Math.round(innerHeight * DPR); const n = Math.round(clamp(innerWidth * innerHeight / 9000, 40, 190)); P = Array.from({ length: n }, () => spawn({}, true)); }
  function field(x, y, t) { x /= DPR; y /= DPR; return Math.sin(x * .0012 + t * .00008) * 1.1 + Math.cos(y * .0017 - t * .00006) * .9 + Math.sin((x + y) * .0006) * .5; }
  function frame(t) {
    ctx.clearRect(0, 0, W, H); ctx.globalCompositeOperation = "lighter"; ctx.lineWidth = 1.1 * DPR; ctx.lineCap = "round";
    boost += (boostT - boost) * .03;
    const sp = 1 + boost * 1.6;
    for (const p of P) {
      const a = field(p.x, p.y, t) * .85;
      p.x += (Math.cos(a) * .55 + .75) * p.v * DPR * sp; p.y += Math.sin(a) * p.v * DPR * .85 * sp;
      p.tr.push(p.x, p.y); if (p.tr.length > 26) p.tr.splice(0, 2);
      if (--p.life < 0 || p.x > W + 20 * DPR || p.y < -20 * DPR || p.y > H + 20 * DPR) { spawn(p, false); continue; }
      if (p.tr.length < 4) continue;
      const cyan = p.c > .55 - boost * .3;
      ctx.strokeStyle = cyan ? "rgba(34,211,238," + (.08 + .16 * p.v / 1.4) + ")" : "rgba(139,92,246," + (.1 + .2 * p.v / 1.4) + ")";
      ctx.beginPath(); ctx.moveTo(p.tr[0], p.tr[1]); for (let k = 2; k < p.tr.length; k += 2) ctx.lineTo(p.tr[k], p.tr[k + 1]); ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";
  }
  function loop(t) { frame(t); raf = requestAnimationFrame(loop); }
  addEventListener("resize", resize); resize();
  if (!REDUCED) raf = requestAnimationFrame(loop);
  document.addEventListener("visibilitychange", () => { if (REDUCED) return; if (document.hidden) { cancelAnimationFrame(raf); raf = 0; } else if (!raf) raf = requestAnimationFrame(loop); });
  return { boost: on => { boostT = on ? 1 : 0; } };
})();
