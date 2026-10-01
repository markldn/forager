// Thin WebGL2 helpers: programs with reflected uniforms, VAO meshes, render targets.
export let gl;
export function initGL(canvas) {
  gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
  if (!gl) throw new Error('WebGL2 is required');
  if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('EXT_color_buffer_float is required');
  gl.getExtension('OES_texture_float_linear');
  return gl;
}
const LOC = { aP: 0, aQ: 1, aN: 2, aV: 3, aC: 4, aM: 5, iA: 6, iB: 7, iS: 8, aG: 0, aB: 0, aW: 1 };
function sh(type, src) {
  const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s), ln = src.split('\n');
    const m = /0:(\d+)/.exec(log); const at = m ? '\n>> ' + ln[+m[1] - 1] : '';
    throw new Error('shader: ' + log + at);
  }
  return s;
}
export function program(vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
  for (const k in LOC) if (new RegExp('\\b' + k + '\\b').test(vs)) gl.bindAttribLocation(p, LOC[k], k);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
  const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i); u[a.name] = { l: gl.getUniformLocation(p, a.name), t: a.type }; }
  return {
    p, u, use() { gl.useProgram(p); return this; },
    set(name, v) {
      const e = u[name]; if (!e) return this; const l = e.l;
      switch (e.t) {
        case gl.FLOAT: gl.uniform1f(l, v); break;
        case gl.FLOAT_VEC2: gl.uniform2fv(l, v); break;
        case gl.FLOAT_VEC3: gl.uniform3fv(l, v); break;
        case gl.FLOAT_VEC4: gl.uniform4fv(l, v); break;
        case gl.FLOAT_MAT4: gl.uniformMatrix4fv(l, false, v); break;
        case gl.INT_VEC2: gl.uniform2iv(l, v); break;
        default: gl.uniform1i(l, v);
      }
      return this;
    },
    setAll(o) { for (const k in o) this.set(k, o[k]); return this; }
  };
}
// mesh from Geo-like {P,Q,N,V,C,M,I} or raw arrays; inst = [{name,size}] for per-instance buffers
export function mesh(g, attrs, inst = []) {
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const sizes = { P: 3, Q: 3, N: 3, V: 3, C: 4, M: 4, W: 2, G: 2, B: 2 };
  for (const k of attrs) {
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(g[k]), gl.STATIC_DRAW);
    const loc = { P: 0, Q: 1, N: 2, V: 3, C: 4, M: 5, W: 1, G: 0, B: 0 }[k];
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, sizes[k], gl.FLOAT, false, 0, 0);
  }
  const ib = {};
  for (const { name, size } of inst) {
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); const loc = LOC[name];
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0); gl.vertexAttribDivisor(loc, 1);
    ib[name] = b;
  }
  let count = 0, idx = false;
  if (g.I && g.I.length) {
    const b = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(g.I), gl.STATIC_DRAW); count = g.I.length; idx = true;
  } else count = g[attrs[0]].length / sizes[attrs[0]];
  gl.bindVertexArray(null);
  return {
    vao, count, ib, n: 0,
    setInst(name, data) { gl.bindBuffer(gl.ARRAY_BUFFER, ib[name]); gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW); },
    draw(mode = gl.TRIANGLES, instances = 0) {
      gl.bindVertexArray(vao);
      if (idx) instances ? gl.drawElementsInstanced(mode, count, gl.UNSIGNED_INT, 0, instances) : gl.drawElements(mode, count, gl.UNSIGNED_INT, 0);
      else instances ? gl.drawArraysInstanced(mode, 0, count, instances) : gl.drawArrays(mode, 0, count);
    }
  };
}
export function tex(w, h, ifmt, fmt, type, filter = gl.LINEAR, mips = false) {
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
  if (mips) gl.texStorage2D(gl.TEXTURE_2D, Math.floor(Math.log2(Math.max(w, h))) + 1, ifmt, w, h);
  else gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, h, 0, fmt, type, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mips ? gl.LINEAR_MIPMAP_LINEAR : filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}
export function fbo(colors, depth) {
  const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
  colors.forEach((c, i) => c.rb ? gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.RENDERBUFFER, c.rb) : gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, c, 0));
  if (depth) depth.rb ? gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth.rb) : gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depth, 0);
  gl.drawBuffers(colors.length ? colors.map((_, i) => gl.COLOR_ATTACHMENT0 + i) : [gl.NONE]);
  if (!colors.length) gl.readBuffer(gl.NONE);
  const st = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (st !== gl.FRAMEBUFFER_COMPLETE) throw new Error('fbo incomplete ' + st);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return f;
}
export function rbo(w, h, fmt, samples) {
  const r = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, r);
  gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, fmt, w, h);
  return { rb: r };
}
