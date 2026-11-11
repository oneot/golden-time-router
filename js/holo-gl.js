"use strict";
// ── 지도 그래픽(WebGL) ─────────────────────────────────────
// 점묘 지구본과 출발지 주변 지도를 GPU로 그립니다. 점 하나하나의 밝기·크기·초점(피사계 심도)을 셰이더에서 계산합니다.
// 지구본 점: 육지(촘촘) · 바다(성김) · 대기(가장자리) · 실크 리본(꼬이며 흐름) · 먼지(초점 밖) / 지도 점: 거리 고리 · 병원 주변 군집 · 먼지

const vec = (lat, lon) => { const a = lat * D2R, b = lon * D2R; return [Math.cos(a) * Math.sin(b), Math.sin(a), Math.cos(a) * Math.cos(b)]; };
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function gauss(r) { let u = 0; while (u === 0) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * r()); }

// 지구본 점 7개 값: x, y, z, 크기, 종류(0 육지 1 바다 2 대기 3 리본 4 먼지), 씨앗, 한국 표시
// 리본 점은 x = 리본 위 위치(0~1), y = 리본 번호, z = 폭 방향 위치(-1~1)
function buildGlobePoints(small) {
  const r = mulberry32(20261111), N = small ? 110000 : 165000, GA = Math.PI * (3 - Math.sqrt(5)), A = [];
  const push = (x, y, z, s, k, seed, f) => A.push(x, y, z, s, k, seed, f);
  for (let i = 0; i < N; i++) {
    const yy = 1 - 2 * (i + .5) / N, rr = Math.sqrt(1 - yy * yy), th = i * GA, j = .003;
    let x = rr * Math.sin(th) + (r() - .5) * j, y = yy + (r() - .5) * j, z = rr * Math.cos(th) + (r() - .5) * j;
    const l = Math.hypot(x, y, z); x /= l; y /= l; z /= l;
    const lat = Math.asin(y) / D2R, lon = Math.atan2(x, z) / D2R;
    if (isLand(lat, lon)) {
      const n = .5 + .5 * Math.sin(x * 4.1 + 1.3) * Math.sin(y * 3.7 + .4) * Math.sin(z * 4.6 + 2.2);
      if (r() > .58 + .42 * n) continue;
      const kr = lat > 33 && lat < 38.62 && lon > 124.6 && lon < 129.62 ? 1 : 0;
      push(x, y, z, .8 + .7 * Math.pow(r(), 3) + (r() < .014 ? 1.1 : 0), 0, r(), kr);
    } else if (r() < .028) push(x, y, z, .7 + .5 * r() * r(), 1, r(), 0);
  }
  for (let i = 0, n = small ? 2600 : 4400; i < n; i++) {
    let x = gauss(r), y = gauss(r), z = gauss(r); const l = Math.hypot(x, y, z), hh = 1.006 + Math.abs(gauss(r)) * .03;
    push(x / l * hh, y / l * hh, z / l * hh, .6 + .7 * r() * r(), 2, r(), 0);
  }
  // 리본: 점을 두 가장자리에 몰아 두어, 리본이 꼬일 때 가장자리 두 줄이 실처럼 엇갈립니다.
  for (let b = 0; b < 2; b++) for (let i = 0, n = small ? 4600 : 8200; i < n; i++) {
    const e = r(), sg = r() < .5 ? -1 : 1;
    const w = e < .38 ? sg * (1 - Math.abs(gauss(r)) * .06) : e < .64 ? sg * (.55 + .45 * r()) : r() * 2 - 1;
    push((i + r()) / n, b, clamp(w, -1, 1), .55 + .8 * Math.pow(r(), 3), 3, r(), 0);
  }
  // 먼지: 카메라 가까이 떠 있는 흐린 점(초점 밖)
  for (let i = 0, n = small ? 220 : 380; i < n; i++) {
    const a = r() * TAU, rad = 1.3 + Math.pow(r(), .7) * 1.5;
    push(Math.cos(a) * rad, gauss(r) * .5, Math.sin(a) * rad, .7 + .8 * r(), 4, r(), 0);
  }
  return new Float32Array(A);
}

// 리본의 기준 축(화면 좌표): 수평 고리를 tilt만큼 눕히고 roll만큼 돌립니다. 열 순서 u, w, n
function bandMat(tilt, roll, out) {
  const ct = Math.cos(tilt), st = Math.sin(tilt), cr = Math.cos(roll), sr = Math.sin(roll);
  out.set([cr, sr, 0, sr * st, -cr * st, ct, -sr * ct, cr * ct, st]);
  return out;
}

// 지도 점 8개 값: x, y(km), 크기, 씨앗, 종류(0 고리 1 군집 2 먼지), 무리 번호, 펼쳐지는 순서(0~1), 색(0 은 1 코랄 2 호박 3 회색)
function buildFieldPoints(hs, step, rings, kCss, seed) {
  const r = mulberry32(seed), A = [], maxR = (rings + .35) * step;
  const push = (x, y, s, sd, k, g, dl, t) => A.push(x, y, s, sd, k, g, dl, t);
  for (let j = 1; j <= rings * 2; j++) {
    const rj = j * step / 2, major = j % 2 === 0, cnt = Math.round(TAU * rj * kCss / (major ? 1.25 : 2.6));
    for (let i = 0; i < cnt; i++) {
      const th = r() * TAU, rad = rj * (1 + .035 * Math.sin(3 * th + j * 1.7) + .02 * Math.sin(7 * th - j * .9)) + gauss(r) * step * (major ? .016 : .028);
      let x = Math.cos(th) * rad, y = Math.sin(th) * rad;
      for (const q of hs) {
        const dx = x - q.x, dy = y - q.y, w = (q.rank ? .2 : .1) * step * Math.exp(-(dx * dx + dy * dy) / (.1 * step * step)), L = Math.hypot(x, y) || 1;
        x += x / L * w; y += y / L * w;
      }
      push(x, y, .7 + .8 * Math.pow(r(), 3), r(), 0, j, Math.min(1, rad / maxR), 0);
    }
  }
  hs.forEach((q, i) => {
    const cnt = q.rank ? 320 : q.st === "alt" ? 170 : q.st === "hold" ? 150 : 70, tint = q.rank ? 1 : q.st === "hold" ? 2 : q.st === "out" ? 3 : 0;
    for (let k = 0; k < cnt; k++) {
      const wide = r() < .38, sg = (wide ? .24 : .075) * step, x = q.x + gauss(r) * sg, y = q.y + gauss(r) * sg;
      push(x, y, .7 + .9 * Math.pow(r(), 3), r(), 1, i, Math.min(1, Math.hypot(x, y) / maxR), wide ? 0 : tint);
    }
  });
  for (let k = 0; k < 1700; k++) { const a = r() * TAU, rad = Math.sqrt(r()) * maxR * 1.3; push(Math.cos(a) * rad, Math.sin(a) * rad, .6 + .8 * Math.pow(r(), 4), r(), 2, 0, Math.min(1, rad / maxR), 0); }
  return new Float32Array(A);
}

const GLSL = {
  globeVS: `precision highp float;
attribute vec3 aPos; attribute vec4 aMeta;
uniform mat3 uRot, uB0, uB1; uniform vec2 uRes, uCenter; uniform vec3 uTarget, uLight;
uniform float uF, uDist, uDPR, uTime, uAlpha, uHi, uIntro, uRipple, uFP;
varying vec3 vCol; varying float vA, vSoft;
void main() {
  float size = aMeta.x, kind = aMeta.y, seed = aMeta.z, flag = aMeta.w, env = 1.0, edge = 0.0;
  vec3 v;
  if (kind > 3.5) {
    float c = cos(uTime * 0.011), s = sin(uTime * 0.011);
    v = vec3(c * aPos.x + s * aPos.z, aPos.y, c * aPos.z - s * aPos.x);
  } else if (kind > 2.5) {
    bool one = aPos.y < 0.5;
    float dir = one ? 1.0 : -1.0, ph = one ? 0.4 : 2.5;
    float u = fract(aPos.x + uFP * (one ? 0.0105 : 0.0082) * (0.94 + 0.12 * fract(seed * 7.13)));
    env = pow(sin(3.14159265 * u), 0.9);
    float th = ph + dir * ((u - 0.5) * (one ? 4.7 : 4.1) + uTime * 0.016);
    mat3 B = one ? uB0 : uB1;
    vec3 rd = B[0] * cos(th) + B[1] * sin(th);
    float tw = th * (one ? 1.8 : -1.5) + ph + dir * uTime * 0.045;
    float w = (one ? 0.24 : 0.18) * env * (0.7 + 0.3 * sin(2.0 * th + ph + uTime * 0.06));
    float rr = (one ? 1.17 : 1.28) + 0.04 * sin(1.5 * th + ph * 2.0);
    edge = smoothstep(0.8, 1.0, abs(aPos.z));
    v = rd * rr + (B[2] * cos(tw) + rd * (0.55 * sin(tw))) * (aPos.z * w) + B[2] * ((fract(seed * 91.7) - 0.5) * 0.006);
  } else v = uRot * aPos;
  vec3 n = normalize(v);
  v *= mix(2.4 + 2.4 * fract(seed * 3.7), 1.0, uIntro);
  float den = max(uDist - v.z, 0.06);
  vec2 sp = v.xy * (uF / den);
  float sil = uF / sqrt(max(uDist * uDist - 1.0, 0.001));
  float occl = (v.z < 0.0 && length(sp) < sil && kind < 3.5) ? 1.0 : 0.0;
  float lam = max(dot(n, uLight), 0.0), rim = pow(1.0 - abs(n.z), 2.0), a;
  if (kind < 0.5) a = 0.2 + 0.52 * lam + 0.3 * rim;
  else if (kind < 1.5) a = 0.06 + 0.12 * lam + 0.16 * rim;
  else if (kind < 2.5) a = 0.5 * pow(rim, 1.5);
  else if (kind < 3.5) a = (0.085 + 0.24 * edge) * env * (0.65 + 0.45 * lam);
  else a = 0.32;
  if (kind < 3.5) a *= 0.86 + 0.14 * sin(uTime * (0.5 + fract(seed * 3.1)) + seed * 40.0);
  vec3 col = vec3(0.84, 0.87, 0.93), coral = vec3(1.0, 0.48, 0.42);
  float hi = flag * uHi;
  col = mix(col, coral, hi * 0.92); a *= 1.0 + hi;
  if (kind < 1.5 && uRipple > 0.001) {
    float ang = acos(clamp(dot(aPos, uTarget), -1.0, 1.0)), rp = 0.0;
    for (int k = 0; k < 3; k++) { float ph = fract(uTime * 0.3 + float(k) / 3.0), x = (ang - ph * 0.35) / 0.008; rp += exp(-x * x) * (1.0 - ph); }
    rp *= uRipple; col = mix(col, coral, clamp(rp, 0.0, 1.0)); a += rp * (kind < 0.5 ? 0.8 : 1.4);
  }
  float blur = occl > 0.5 ? 0.9 : clamp((0.25 - n.z) * 0.7, 0.0, 0.6);
  blur = max(blur, clamp((v.z - 1.04) * 1.5, 0.0, 1.0));
  if (kind > 3.5) blur = max(blur, 0.55 + 0.45 * fract(seed * 5.3));
  float px = size * uDPR * (uDist / den) * (1.0 + 1.3 * blur);
  if (occl > 0.5) a *= 0.085;
  a /= 1.0 + 1.3 * blur;
  float big = clamp((px - 3.0) / 14.0, 0.0, 1.0);
  if (px > 3.0) a *= max(9.0 / (px * px), 0.02);
  if (px < 1.5) { a *= px / 1.5; px = 1.5; }
  gl_PointSize = min(px, 72.0);
  vA = a * uAlpha; vCol = col; vSoft = mix(0.5, 0.0, clamp(blur + big, 0.0, 1.0));
  vec2 q = uCenter + vec2(sp.x, -sp.y);
  gl_Position = vec4(q.x / uRes.x * 2.0 - 1.0, 1.0 - q.y / uRes.y * 2.0, 0.0, 1.0);
  if (uDist - v.z < 0.07) gl_Position = vec4(3.0, 3.0, 0.0, 1.0);
}`,
  fieldVS: `precision highp float;
attribute vec4 aA; attribute vec4 aB;
uniform vec2 uRes, uCenter; uniform float uK, uTime, uAlpha, uBloom, uDPR, uWob;
varying vec3 vCol; varying float vA, vSoft;
void main() {
  vec2 p = aA.xy; float size = aA.z, seed = aA.w, kind = aB.x, grp = aB.y, delay = aB.z, tint = aB.w, w = 0.0;
  if (kind < 0.5) w = (mod(grp, 2.0) < 0.5 ? 0.012 : -0.008) * (0.9 + 0.2 * fract(seed * 5.1));
  else if (kind > 1.5) w = 0.004;
  float c = cos(uTime * w), s = sin(uTime * w);
  p = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  p += vec2(sin(uTime * 0.55 + seed * 61.0), cos(uTime * 0.47 + seed * 37.0)) * uWob * (kind > 0.5 && kind < 1.5 ? 1.5 : 0.5);
  float b = clamp((uBloom - delay * 0.55) / 0.45, 0.0, 1.0), e = 1.0 - pow(1.0 - b, 3.0);
  p *= mix(0.08, 1.0, e);
  vec2 q = uCenter + vec2(p.x, -p.y) * uK;
  vec3 col = tint < 0.5 ? vec3(0.84, 0.87, 0.93) : tint < 1.5 ? vec3(1.0, 0.48, 0.42) : tint < 2.5 ? vec3(0.91, 0.7, 0.37) : vec3(0.5, 0.52, 0.56);
  float a = kind < 0.5 ? 0.34 : kind < 1.5 ? 0.46 : 0.16;
  float dep = fract(seed * 17.31), blur = dep > 0.93 ? (dep - 0.93) * 12.0 : 0.0;
  float px = size * uDPR * (1.0 + 2.0 * blur);
  a /= 1.0 + 2.0 * blur * blur;
  if (px < 1.5) { a *= px / 1.5; px = 1.5; }
  gl_PointSize = px;
  vA = a * e * uAlpha; vCol = col; vSoft = mix(0.5, 0.0, clamp(blur, 0.0, 1.0));
  gl_Position = vec4(q.x / uRes.x * 2.0 - 1.0, 1.0 - q.y / uRes.y * 2.0, 0.0, 1.0);
}`,
  pointFS: `precision mediump float;
varying vec3 vCol; varying float vA, vSoft;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0; float d = dot(c, c);
  if (d > 1.0) discard;
  float a = vA * (1.0 - smoothstep(vSoft, 1.0, d));
  gl_FragColor = vec4(vCol * a, a);
}`,
  backVS: `attribute vec2 aQ; void main() { gl_Position = vec4(aQ, 0.0, 1.0); }`,
  backFS: `precision mediump float;
uniform vec2 uRes, uC, uFC; uniform float uSil, uGA, uFA, uFR;
void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec3 col = vec3(0.0); float a = 0.0;
  if (uGA > 0.001) {
    vec2 q = (p - uC) / uSil; float d = length(q);
    float lit = clamp(0.5 + 0.5 * dot(q, vec2(-0.55, -0.62)), 0.0, 1.0);
    float body = (1.0 - smoothstep(0.97, 1.0, d)) * (0.012 + 0.03 * lit * lit * (1.0 - d * d * 0.5));
    float rim = exp(-pow((d - 1.0) / 0.012, 2.0)) * 0.05;
    float haze = d > 1.0 ? exp(-(d - 1.0) * 4.5) * 0.05 : 0.0;
    float g = (body + rim + haze) * uGA;
    col += vec3(0.8, 0.84, 0.95) * g; a += g;
  }
  if (uFA > 0.001) {
    float d = length(p - uFC) / uFR;
    float g = (exp(-d * d * 2.6) * 0.055 + exp(-d * d * 18.0) * 0.05) * uFA;
    col += vec3(1.0, 0.66, 0.58) * g; a += g;
  }
  gl_FragColor = vec4(col, a);
}`
};

// WebGL 준비: 실패하면 null을 돌려주고 지도는 2D로 줄여 그립니다.
function createGL(canvas) {
  let gl;
  try { gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: "high-performance" }); } catch (e) { gl = null; }
  if (!gl) return null;
  const compile = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const program = (vs, fs, attrs) => {
    const p = gl.createProgram(); gl.attachShader(p, compile(gl.VERTEX_SHADER, vs)); gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i); u[a.name] = gl.getUniformLocation(p, a.name); }
    return { p, u, a: attrs.map(([name, size, off]) => ({ loc: gl.getAttribLocation(p, name), size, off })) };
  };
  try {
    const P = {
      globe: program(GLSL.globeVS, GLSL.pointFS, [["aPos", 3, 0], ["aMeta", 4, 12]]),
      field: program(GLSL.fieldVS, GLSL.pointFS, [["aA", 4, 0], ["aB", 4, 16]]),
      back: program(GLSL.backVS, GLSL.backFS, [["aQ", 2, 0]])
    };
    const buf = data => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); return b; };
    const quad = buf(new Float32Array([-1, -1, 3, -1, -1, 3]));
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.disable(gl.DEPTH_TEST);
    // prog 그리기: 속성 연결 → 유니폼 설정 → 그리기 → 속성 해제
    const draw = (pr, buffer, stride, mode, count, uni) => {
      gl.useProgram(pr.p); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      for (const at of pr.a) { if (at.loc < 0) continue; gl.enableVertexAttribArray(at.loc); gl.vertexAttribPointer(at.loc, at.size, gl.FLOAT, false, stride, at.off); }
      for (const k in uni) {
        const loc = pr.u[k], v = uni[k]; if (loc == null) continue;
        if (typeof v === "number") gl.uniform1f(loc, v);
        else if (v.length === 2) gl.uniform2fv(loc, v); else if (v.length === 3) gl.uniform3fv(loc, v); else if (v.length === 9) gl.uniformMatrix3fv(loc, false, v);
      }
      gl.drawArrays(mode, 0, count);
      for (const at of pr.a) if (at.loc >= 0) gl.disableVertexAttribArray(at.loc);
    };
    return { gl, P, quad, buf, draw };
  } catch (e) { console.warn("WebGL 셰이더를 준비하지 못해 2D로 그립니다.", e); return null; }
}
