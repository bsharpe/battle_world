const LINE_VS = `#version 300 es
layout(location = 0) in vec2 corner;
layout(location = 1) in vec4 seg;
layout(location = 2) in float inten;
layout(location = 3) in vec3 col;
uniform vec2 res;
uniform float halfW;
out vec2 vP;
out vec4 vSeg;
out float vI;
out vec3 vC;
void main() {
  vec2 a = seg.xy, b = seg.zw, d = b - a;
  float len = length(d);
  vec2 dir = len > 0.001 ? d / len : vec2(1.0, 0.0);
  vec2 n = vec2(-dir.y, dir.x);
  vec2 p = mix(a - dir * halfW, b + dir * halfW, corner.x) + n * (corner.y * halfW);
  vP = p; vSeg = seg; vI = inten; vC = col;
  gl_Position = vec4(p.x / res.x * 2.0 - 1.0, 1.0 - p.y / res.y * 2.0, 0.0, 1.0);
}`;

const LINE_FS = `#version 300 es
precision highp float;
in vec2 vP;
in vec4 vSeg;
in float vI;
in vec3 vC;
uniform float sigma;
out vec4 o;
void main() {
  vec2 pa = vP - vSeg.xy, ba = vSeg.zw - vSeg.xy;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 0.0001), 0.0, 1.0);
  float d = length(pa - ba * h);
  float g = exp(-d * d / (2.0 * sigma * sigma)) * vI;
  o = vec4(vC * g, g);
}`;

const FULL_VS = `#version 300 es
out vec2 uv;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  uv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const DECAY_FS = `#version 300 es
precision highp float;
in vec2 uv;
uniform sampler2D prev, fresh;
uniform float decay;
out vec4 o;
void main() { o = texture(prev, uv) * decay + texture(fresh, uv) * (1.0 - decay); }`;

const BLUR_FS = `#version 300 es
precision highp float;
in vec2 uv;
uniform sampler2D src;
uniform vec2 dir;
out vec4 o;
void main() {
  vec4 c = texture(src, uv) * 0.227027;
  c += (texture(src, uv + dir * 1.384615) + texture(src, uv - dir * 1.384615)) * 0.316216;
  c += (texture(src, uv + dir * 3.230769) + texture(src, uv - dir * 3.230769)) * 0.070270;
  o = c;
}`;

const OUT_FS = `#version 300 es
precision highp float;
in vec2 uv;
uniform sampler2D glow, bloom, text;
uniform float bloomK, redLine;
uniform vec2 res;
uniform vec3 red;
out vec4 o;
void main() {
  vec4 v = texture(glow, uv) + texture(bloom, uv) * bloomK + texture(text, uv);
  vec3 c = (1.0 - uv.y) * res.y < redLine ? 1.0 - exp(-v.a * red * 1.5) : 1.0 - exp(-v.rgb * 1.5);
  o = vec4(c, 1.0);
}`;

// Bitmap is capped at 2× the 1920×1080 picture so a retina CSS fit is a downscale, not an upscale.
export function bitmapSize(viewW, viewH, dpr) {
  const pixelScale = Math.min(2, Math.max(1, dpr || 1));
  return [Math.round(viewW * pixelScale / 2) * 2, Math.round(viewH * pixelScale / 2) * 2];
}

// Largest 16:9 box that sits inside the window.
export function fitFrame(viewW, viewH, vw, vh) {
  const fit = Math.min(vw / viewW, vh / viewH);
  return [Math.floor(viewW * fit), Math.floor(viewH * fit)];
}

export function createVectorRenderer(canvas, opts = {}) {
  const o = {
    lineHalfWidth: 3.5, sigma: 1.1, persistence: 0.02, bloom: 0.25, redLinePx: 216,
    red: [1.0, 0.22, 0.18], maxLines: 32768,
    viewWidth: canvas.width, viewHeight: canvas.height, ...opts,
  };
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false });
  if (!gl) throw new Error('WebGL2 is unavailable');
  const floatOk = !!gl.getExtension('EXT_color_buffer_float');
  const W = canvas.width, H = canvas.height;
  const VW = o.viewWidth, VH = o.viewHeight;

  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const program = (vs, fs) => {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    for (let i = 0; i < gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i++) {
      const { name } = gl.getActiveUniform(p, i);
      u[name] = gl.getUniformLocation(p, name);
    }
    return { p, u };
  };
  const target = (w, h) => {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, floatOk ? gl.RGBA16F : gl.RGBA8, w, h, 0, gl.RGBA, floatOk ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { tex, fb, w, h };
  };

  const lines = program(LINE_VS, LINE_FS), decay = program(FULL_VS, DECAY_FS);
  const blur = program(FULL_VS, BLUR_FS), out = program(FULL_VS, OUT_FS);
  const fresh = target(W, H), glow = [target(W, H), target(W, H)];
  const halfA = target(W / 2, H / 2), halfB = target(W / 2, H / 2);

  const lineVao = gl.createVertexArray();
  gl.bindVertexArray(lineVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, -1, 1, -1, 0, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const inst = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, inst);
  gl.bufferData(gl.ARRAY_BUFFER, o.maxLines * 20, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 20, 0);
  gl.vertexAttribDivisor(1, 1);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 20, 16);
  gl.vertexAttribDivisor(2, 1);
  const instCol = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, instCol);
  gl.bufferData(gl.ARRAY_BUFFER, o.maxLines * 12, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(3);
  gl.vertexAttribPointer(3, 3, gl.FLOAT, false, 12, 0);
  gl.vertexAttribDivisor(3, 1);
  const fullVao = gl.createVertexArray();
  let cur = 0;

  const fullscreen = (prog, dst, textures, setUniforms) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst ? dst.fb : null);
    gl.viewport(0, 0, dst ? dst.w : W, dst ? dst.h : H);
    gl.useProgram(prog.p);
    textures.forEach(([name, t], i) => {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, t.tex);
      gl.uniform1i(prog.u[name], i);
    });
    setUniforms?.(prog.u);
    gl.bindVertexArray(fullVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  return {
    setRedLine(px) { o.redLinePx = px; },
    draw(buf, dt) {
      const stroke = (src, srcRgb, count, halfW, sigma, clear) => {
        const n = Math.min(count, o.maxLines);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fresh.fb);
        gl.viewport(0, 0, W, H);
        if (clear) {
          gl.clearColor(0, 0, 0, 0); // alpha is the red band's intensity, so it starts dark too
          gl.clear(gl.COLOR_BUFFER_BIT);
        }
        if (!n) return;
        gl.useProgram(lines.p);
        gl.uniform2f(lines.u.res, VW, VH);
        gl.uniform1f(lines.u.halfW, halfW);
        gl.uniform1f(lines.u.sigma, sigma);
        gl.bindVertexArray(lineVao);
        gl.bindBuffer(gl.ARRAY_BUFFER, inst);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, src, 0, n * 5);
        gl.bindBuffer(gl.ARRAY_BUFFER, instCol);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, srcRgb, 0, n * 3);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
        gl.disable(gl.BLEND);
      };
      stroke(buf.data, buf.rgb, buf.count, o.lineHalfWidth, o.sigma, true);
      // A point at the frame sigma is a few pixels, and the half-res bloom only spreads it by about six.
      // halfW stays past 3 sigma so the disk is the gaussian, not a clipped box.
      stroke(buf.dots, buf.dotRgb, buf.dotCount, 22, 6.5, false);

      const prev = glow[cur], next = glow[1 - cur];
      cur = 1 - cur;
      fullscreen(decay, next, [['prev', prev], ['fresh', fresh]], (u) => gl.uniform1f(u.decay, Math.exp(-dt / o.persistence)));
      fullscreen(blur, halfA, [['src', next]], (u) => gl.uniform2f(u.dir, 2 / VW, 0));
      fullscreen(blur, halfB, [['src', halfA]], (u) => gl.uniform2f(u.dir, 0, 2 / VH));
      // After the bloom source is taken. A narrow core only: no halo on glyphs or the wordmark.
      stroke(buf.text, buf.textRgb, buf.textCount, 1.4, 0.4, true);
      fullscreen(out, null, [['glow', next], ['bloom', halfB], ['text', fresh]], (u) => {
        gl.uniform1f(u.bloomK, o.bloom);
        gl.uniform1f(u.redLine, o.redLinePx);
        gl.uniform2f(u.res, VW, VH);
        gl.uniform3fv(u.red, o.red);
      });
    },
  };
}
