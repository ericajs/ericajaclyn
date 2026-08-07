
(function () {
  'use strict';

  var canvas = document.getElementById('glass');
  var gl = null;
  try { gl = canvas.getContext('webgl'); } catch (e) { gl = null; }
  if (!gl) {
    document.getElementById('nowebgl').style.display = 'flex';
    canvas.style.display = 'none';
    return;
  }

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hasDeriv = !!gl.getExtension('OES_standard_derivatives');

  // ---------- parameter model ----------
  // hard: true  => value is hardcoded in the original prototype
  var SPEC = [
    { k: 'refraction',     g: 'glass',  min: 0,    max: 3,   step: 0.05, def: 2.2  },
    { k: 'depth',          g: 'glass',  min: 4,    max: 24,  step: 0.5,  def: 11, hard: true },
    { k: 'dispersion',     g: 'glass',  min: 0,    max: 4,   step: 0.05, def: 1.2  },
    { k: 'frost',          g: 'glass',  min: 0.1,  max: 3,   step: 0.05, def: 2.0  },

    { k: 'lightAngle',     g: 'light',  min: 0,    max: 360, step: 1,    def: 135, hard: true },
    { k: 'lightIntensity', g: 'light',  min: 0,    max: 1,   step: 0.01, def: 0.38, hard: true },
    { k: 'counterLight',   g: 'light',  min: 0,    max: 1,   step: 0.01, def: 0.45, hard: true },
    { k: 'splay',          g: 'light',  min: 1,    max: 14,  step: 0.25, def: 5,   hard: true },

    { k: 'saturation',     g: 'color',  min: 0,    max: 1.2, step: 0.01, def: 1.0  },
    { k: 'luminance',      g: 'color',  min: 0.6,  max: 1.6, step: 0.01, def: 1.0, hard: true },

    { k: 'innerShadow',    g: 'shadow', min: 0,    max: 0.6, step: 0.01, def: 0,   hard: true },
    { k: 'shadowIntensity',g: 'shadow', min: 0,    max: 1,   step: 0.01, def: 0.32 },
    { k: 'shadowBlur',     g: 'shadow', min: 0,    max: 40,  step: 1,    def: 20   },
    { k: 'shadowY',        g: 'shadow', min: -20,  max: 20,  step: 1,    def: 6    },
    { k: 'cornerRadius',   g: 'shadow', min: 0,    max: 90,  step: 1,    def: 34   },
    { k: 'width',          g: 'shadow', min: 120,  max: 460, step: 5,    def: 300  },
    { k: 'height',         g: 'shadow', min: 60,   max: 260, step: 5,    def: 130  }
  ];

  var P = {};
  SPEC.forEach(function (s) { P[s.k] = s.def; });
  P.tint = '#f7ffe0';
  P.mode = 'light';

  var PRESETS = {
    'Apple-ish':   { refraction: 2.2, depth: 11, dispersion: 1.2, frost: 2.0, lightAngle: 135,
                     lightIntensity: 0.38, counterLight: 0.45, splay: 5, saturation: 1, luminance: 1,
                     innerShadow: 0, shadowIntensity: 0.32, shadowBlur: 20, cornerRadius: 34,
                     tint: '#f7ffe0', mode: 'light' },
    'Thick crystal': { refraction: 3, depth: 5, dispersion: 2.6, frost: 1.2, lightAngle: 130,
                     lightIntensity: 0.6, counterLight: 0.6, splay: 2.5, saturation: 1.1, luminance: 1.05,
                     innerShadow: 0.12, shadowIntensity: 0.4, shadowBlur: 26, cornerRadius: 46,
                     tint: '#eaf6ff', mode: 'light' },
    'Clear pane':  { refraction: 1.1, depth: 20, dispersion: 0.4, frost: 0.3, lightAngle: 140,
                     lightIntensity: 0.5, counterLight: 0.3, splay: 9, saturation: 1, luminance: 1,
                     innerShadow: 0, shadowIntensity: 0.18, shadowBlur: 12, cornerRadius: 24,
                     tint: '#ffffff', mode: 'light' },
    'Frosted card':{ refraction: 1.4, depth: 9, dispersion: 0.5, frost: 3, lightAngle: 135,
                     lightIntensity: 0.3, counterLight: 0.5, splay: 6, saturation: 0.7, luminance: 1.12,
                     innerShadow: 0.08, shadowIntensity: 0.3, shadowBlur: 24, cornerRadius: 40,
                     tint: '#ffffff', mode: 'light' },
    'Dark smoke':  { refraction: 2.0, depth: 12, dispersion: 1.6, frost: 2.2, lightAngle: 135,
                     lightIntensity: 0.5, counterLight: 0.5, splay: 4, saturation: 0.9, luminance: 0.92,
                     innerShadow: 0.22, shadowIntensity: 0.45, shadowBlur: 28, cornerRadius: 34,
                     tint: '#b9c9e6', mode: 'dark' }
  };

  // ---------- procedural backdrops (no external assets: CSP-safe) ----------
  function mkGrid() {
    var c = document.createElement('canvas'); c.width = 1200; c.height = 800;
    var x = c.getContext('2d');
    x.fillStyle = '#0b1020'; x.fillRect(0, 0, 1200, 800);
    var i;
    for (i = 0; i <= 1200; i += 40) {
      x.strokeStyle = (i % 200 === 0) ? '#ffffff' : '#3f5f96';
      x.lineWidth = (i % 200 === 0) ? 3 : 1;
      x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 800); x.stroke();
    }
    for (i = 0; i <= 800; i += 40) {
      x.strokeStyle = (i % 200 === 0) ? '#ffffff' : '#3f5f96';
      x.lineWidth = (i % 200 === 0) ? 3 : 1;
      x.beginPath(); x.moveTo(0, i); x.lineTo(1200, i); x.stroke();
    }
    var cols = ['#ff3b30', '#34c759', '#0a84ff', '#ffd60a', '#ff2d92'];
    cols.forEach(function (col, j) {
      x.fillStyle = col; x.fillRect(70 + j * 225, 300, 150, 200);
    });
    return c;
  }

  function mkMesh() {
    var c = document.createElement('canvas'); c.width = 1200; c.height = 800;
    var x = c.getContext('2d');
    x.fillStyle = '#12123a'; x.fillRect(0, 0, 1200, 800);
    var blobs = [
      [180, 170, 420, '#ff7a45'], [900, 130, 460, '#ffd166'],
      [1050, 620, 480, '#3ad6c5'], [320, 640, 460, '#7b5cff'],
      [640, 380, 380, '#ff4f9a'], [60, 420, 300, '#26c6ff']
    ];
    blobs.forEach(function (b) {
      var g = x.createRadialGradient(b[0], b[1], 0, b[0], b[1], b[2]);
      g.addColorStop(0, b[3]);
      g.addColorStop(1, 'rgba(18,18,58,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, 1200, 800);
    });
    return c;
  }

  function mkStripes() {
    var c = document.createElement('canvas'); c.width = 1200; c.height = 800;
    var x = c.getContext('2d');
    var g = x.createLinearGradient(0, 0, 1200, 800);
    g.addColorStop(0, '#0d1b2a'); g.addColorStop(1, '#1f3550');
    x.fillStyle = g; x.fillRect(0, 0, 1200, 800);
    x.save();
    x.translate(600, 400); x.rotate(-Math.PI / 5); x.translate(-600, -400);
    for (var i = -400; i < 1600; i += 64) {
      x.fillStyle = (i / 64) % 2 === 0 ? 'rgba(255,255,255,.92)' : 'rgba(255,255,255,.10)';
      x.fillRect(i, -400, 30, 1600);
    }
    x.restore();
    return c;
  }

  var BACKDROPS = { 'Spectrum': mkMesh, 'Grid': mkGrid, 'Stripes': mkStripes };
  var bgName = 'Spectrum';

  // ---------- shader ----------
  var VERT = [
    'attribute vec2 a_position;',
    'attribute vec2 a_texCoord;',
    'varying vec2 v_texCoord;',
    'void main(){ gl_Position = vec4(a_position,0.0,1.0); v_texCoord = a_texCoord; }'
  ].join('\n');

  function fragSrc(deriv) {
    return [
      deriv ? '#extension GL_OES_standard_derivatives : enable' : '',
      'precision mediump float;',
      'uniform vec2 u_resolution; uniform vec2 u_center;',
      'uniform sampler2D u_texture;',
      'uniform float u_imageAspect; uniform float u_canvasAspect; uniform float u_time;',
      'uniform float u_halfW; uniform float u_halfH; uniform float u_cornerRadius;',
      'uniform float u_lightAngle; uniform float u_lightIntensity; uniform float u_counterLight;',
      'uniform float u_refraction; uniform float u_depth; uniform float u_dispersion;',
      'uniform float u_frost; uniform float u_splay;',
      'uniform vec3 u_tint; uniform float u_saturation; uniform float u_luminance;',
      'uniform float u_shadowIntensity; uniform vec2 u_shadowOffset; uniform float u_shadowBlur;',
      'uniform float u_innerShadow; uniform float u_mode;',
      'varying vec2 v_texCoord;',

      'vec2 coverUV(vec2 uv){',
      '  vec2 o = uv;',
      '  if (u_imageAspect > u_canvasAspect) o.x = (uv.x-0.5)*(u_canvasAspect/u_imageAspect)+0.5;',
      '  else o.y = (uv.y-0.5)*(u_imageAspect/u_canvasAspect)+0.5;',
      '  return o;',
      '}',

      'float sdRoundRect(vec2 p, vec2 h, float r){',
      '  r = min(r, min(h.x,h.y));',
      '  vec2 q = abs(p) - h + r;',
      '  return min(max(q.x,q.y),0.0) + length(max(q,0.0)) - r;',
      '}',
      'float shapeSDF(vec2 p){ return sdRoundRect(p, vec2(u_halfW,u_halfH), u_cornerRadius); }',

      'vec2 hash2(vec2 co){',
      '  return fract(sin(vec2(dot(co,vec2(127.1,311.7)),dot(co,vec2(269.5,183.3))))*43758.5453);',
      '}',

      'vec3 tap(vec2 uv, float seed, float mip){',
      '  vec2 cuv = coverUV(uv);',
      '  vec2 j = hash2(cuv+vec2(u_time+seed))/u_resolution.x*pow(2.0,mip)*0.01;',
      '  if (u_dispersion <= 0.0) return texture2D(u_texture, cuv+j).rgb;',
      '  vec2 dir = normalize(cuv - vec2(0.5) + vec2(1e-6));',
      '  float amt = u_dispersion * length(cuv-vec2(0.5)) * 0.01;',
      '  return vec3(',
      '    texture2D(u_texture, cuv + dir*amt*1.2 + j).r,',
      '    texture2D(u_texture, cuv + j).g,',
      '    texture2D(u_texture, cuv - dir*amt*0.8 + j).b);',
      '}',

      'vec3 frosted(vec2 uv, float mip){',
      '  vec3 s = vec3(0.0);',
      '  s += tap(uv,0.0,mip);  s += tap(uv,0.25,mip); s += tap(uv,0.5,mip);',
      '  s += tap(uv,0.75,mip); s += tap(uv,1.0,mip);  s += tap(uv,1.25,mip);',
      '  s += tap(uv,1.5,mip);  s += tap(uv,1.75,mip); s += tap(uv,2.0,mip);',
      '  return s * 0.11111;',
      '}',

      'vec3 applySat(vec3 c, float f){',
      '  return mix(vec3(dot(c,vec3(0.299,0.587,0.114))), c, f);',
      '}',

      'vec2 edgeGrad(float field, vec2 frag){',
      deriv
        ? '  return normalize(vec2(dFdx(field), dFdy(field)) + vec2(1e-6));'
        : ['  float e = 2.0;',
           '  float a = shapeSDF(frag+vec2(e,0.0)-u_center);',
           '  float b = shapeSDF(frag-vec2(e,0.0)-u_center);',
           '  float c2 = shapeSDF(frag+vec2(0.0,e)-u_center);',
           '  float d2 = shapeSDF(frag-vec2(0.0,e)-u_center);',
           '  return normalize(vec2(a-b, c2-d2) + vec2(1e-6));'].join('\n'),
      '}',

      'void main(){',
      '  vec2 frag = v_texCoord * u_resolution;',
      '  vec2 p = frag - u_center;',
      '  float sdf = shapeSDF(p);',
      '  float edge = clamp((sdf/max(u_halfH,1.0))+1.0, 0.0, 1.0);',
      '  float fall = pow(edge, u_depth);',
      '  vec3 backdrop = texture2D(u_texture, coverUV(v_texCoord)).rgb;',

      '  float shadow = 0.0;',
      '  if (u_shadowIntensity > 0.0) {',
      '    float ssdf = shapeSDF(p - u_shadowOffset);',
      '    shadow = (1.0 - smoothstep(-u_shadowBlur, u_shadowBlur, ssdf)) * u_shadowIntensity;',
      '  }',

      '  vec2 off = vec2(0.0);',
      '  if (edge >= 0.1) off = edgeGrad(edge, frag) * (pow(edge,u_depth) * -0.05 * u_refraction);',

      '  vec3 glass = frosted(v_texCoord + off, mix(3.5*u_frost, 1.5, fall));',
      '  glass = mix(glass, pow(applySat(glass,u_saturation), vec3(0.5)), fall);',
      '  glass *= u_tint;',

      '  float spec = 0.0;',
      '  if (edge >= 0.1) {',
      '    vec2 g = edgeGrad(edge, frag);',
      '    vec2 L = vec2(cos(radians(u_lightAngle)), sin(radians(u_lightAngle)));',
      '    float d = dot(g, L);',
      '    float lit   = 1.0 - clamp(pow(1.0 - clamp( d,0.0,1.0), 0.5), 0.0, 1.0);',
      '    float unlit = 1.0 - clamp(pow(1.0 - clamp(-d,0.0,1.0), 0.5), 0.0, 1.0);',
      '    spec = clamp((lit + unlit*u_counterLight) * pow(fall,u_splay), 0.0, 1.0);',
      '  }',
      '  glass += u_lightIntensity * spec;',

      '  if (u_mode > 0.5) {',
      '    glass = mix(glass, glass*0.7, 0.3);',
      '    float rim = smoothstep(0.0,0.2,sdf)*smoothstep(1.5,0.3,sdf)*0.15;',
      '    glass += vec3(rim);',
      '  }',

      '  glass -= u_innerShadow * pow(edge, u_splay);',
      '  glass *= u_luminance;',

      '  float mask = 1.0 - clamp(sdf, 0.0, 1.0);',
      '  gl_FragColor = vec4(mix(backdrop*(1.0-shadow), glass, mask), 1.0);',
      '}'
    ].join('\n');
  }

  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error('shader compile failed:', gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }

  var vs = compile(gl.VERTEX_SHADER, VERT);
  var fs = compile(gl.FRAGMENT_SHADER, fragSrc(hasDeriv));
  if (!vs || !fs) { document.getElementById('nowebgl').style.display = 'flex'; return; }

  var prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error('link failed:', gl.getProgramInfoLog(prog));
    document.getElementById('nowebgl').style.display = 'flex';
    return;
  }
  gl.useProgram(prog);

  var quad = new Float32Array([-1,-1,0,1,  1,-1,1,1,  -1,1,0,0,  1,1,1,0]);
  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
  var aP = gl.getAttribLocation(prog, 'a_position');
  var aT = gl.getAttribLocation(prog, 'a_texCoord');
  gl.enableVertexAttribArray(aP); gl.enableVertexAttribArray(aT);
  gl.vertexAttribPointer(aP, 2, gl.FLOAT, false, 16, 0);
  gl.vertexAttribPointer(aT, 2, gl.FLOAT, false, 16, 8);

  var L = {};
  ['u_resolution','u_center','u_texture','u_imageAspect','u_canvasAspect','u_time',
   'u_halfW','u_halfH','u_cornerRadius','u_lightAngle','u_lightIntensity','u_counterLight',
   'u_refraction','u_depth','u_dispersion','u_frost','u_splay','u_tint','u_saturation',
   'u_luminance','u_shadowIntensity','u_shadowOffset','u_shadowBlur','u_innerShadow','u_mode'
  ].forEach(function (n) { L[n] = gl.getUniformLocation(prog, n); });

  var tex = gl.createTexture();
  var texAspect = 1.5;
  function uploadBackdrop(name) {
    var src = BACKDROPS[name]();
    texAspect = src.width / src.height;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  }
  uploadBackdrop(bgName);

  function hexToRgb(hex) {
    var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!m) return [1, 1, 1];
    return [parseInt(m[1],16)/255, parseInt(m[2],16)/255, parseInt(m[3],16)/255];
  }

  var t0 = Date.now();
  var lastSize = '';

  function draw() {
    var dpr = window.devicePixelRatio || 1;
    var w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    var key = w + 'x' + h + 'x' + dpr;
    if (key !== lastSize) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
      lastSize = key;
    }

    gl.useProgram(prog);
    gl.uniform2f(L.u_resolution, canvas.width, canvas.height);
    gl.uniform2f(L.u_center, canvas.width / 2, canvas.height / 2);
    gl.uniform1i(L.u_texture, 0);
    gl.uniform1f(L.u_imageAspect, texAspect);
    gl.uniform1f(L.u_canvasAspect, canvas.width / canvas.height);
    gl.uniform1f(L.u_time, reduce ? 0 : (Date.now() - t0) / 1000);

    gl.uniform1f(L.u_halfW, (P.width / 2) * dpr);
    gl.uniform1f(L.u_halfH, (P.height / 2) * dpr);
    gl.uniform1f(L.u_cornerRadius, P.cornerRadius * dpr);

    gl.uniform1f(L.u_lightAngle, P.lightAngle);
    gl.uniform1f(L.u_lightIntensity, P.lightIntensity);
    gl.uniform1f(L.u_counterLight, P.counterLight);
    gl.uniform1f(L.u_refraction, P.refraction);
    gl.uniform1f(L.u_depth, P.depth);
    gl.uniform1f(L.u_dispersion, P.dispersion);
    gl.uniform1f(L.u_frost, P.frost);
    gl.uniform1f(L.u_splay, P.splay);

    var t = hexToRgb(P.tint);
    gl.uniform3f(L.u_tint, t[0], t[1], t[2]);
    gl.uniform1f(L.u_saturation, P.saturation);
    gl.uniform1f(L.u_luminance, P.luminance);

    gl.uniform1f(L.u_shadowIntensity, P.shadowIntensity);
    gl.uniform2f(L.u_shadowOffset, 4 * dpr, P.shadowY * dpr);
    gl.uniform1f(L.u_shadowBlur, Math.max(P.shadowBlur, 0.001) * dpr);
    gl.uniform1f(L.u_innerShadow, P.innerShadow);
    gl.uniform1f(L.u_mode, P.mode === 'dark' ? 1 : 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // Continuous rAF gives the frost its live grain. Under reduced-motion we
  // freeze time and redraw only when a control changes.
  function loop() { draw(); requestAnimationFrame(loop); }
  if (reduce) { draw(); } else { loop(); }
  function nudge() { if (reduce) draw(); }

  // ---------- controls ----------
  var groups = {
    glass:  document.getElementById('grp-glass'),
    light:  document.getElementById('grp-light'),
    color:  document.getElementById('grp-color'),
    shadow: document.getElementById('grp-shadow')
  };
  var outs = {};
  var inputs = {};

  function fmt(k, v) {
    if (k === 'lightAngle') return v + '°';
    if (k === 'width' || k === 'height' || k === 'cornerRadius' ||
        k === 'shadowBlur' || k === 'shadowY') return v + 'px';
    return (Math.round(v * 100) / 100).toFixed(2);
  }

  SPEC.forEach(function (s) {
    var row = document.createElement('div');
    row.className = 'ctl' + (s.hard ? ' was-hardcoded' : '');

    var lab = document.createElement('label');
    lab.textContent = s.k;
    lab.setAttribute('for', 'ctl-' + s.k);
    if (s.hard) lab.title = 'Hardcoded in the original prototype';

    var out = document.createElement('output');
    out.textContent = fmt(s.k, P[s.k]);

    var inp = document.createElement('input');
    inp.type = 'range'; inp.id = 'ctl-' + s.k;
    inp.min = s.min; inp.max = s.max; inp.step = s.step; inp.value = P[s.k];
    inp.addEventListener('input', function () {
      P[s.k] = parseFloat(inp.value);
      out.textContent = fmt(s.k, P[s.k]);
      nudge();
    });

    row.appendChild(lab); row.appendChild(out); row.appendChild(inp);
    groups[s.g].appendChild(row);
    outs[s.k] = out; inputs[s.k] = inp;
  });

  var tintEl = document.getElementById('tint');
  tintEl.addEventListener('input', function () { P.tint = tintEl.value; nudge(); });

  var modeBtn = document.getElementById('modeBtn');
  modeBtn.addEventListener('click', function () {
    P.mode = P.mode === 'light' ? 'dark' : 'light';
    modeBtn.textContent = 'mode: ' + P.mode;
    modeBtn.setAttribute('aria-pressed', P.mode === 'dark' ? 'true' : 'false');
    modeBtn.classList.toggle('on', P.mode === 'dark');
    nudge();
  });

  function syncUI() {
    SPEC.forEach(function (s) {
      inputs[s.k].value = P[s.k];
      outs[s.k].textContent = fmt(s.k, P[s.k]);
    });
    tintEl.value = P.tint;
    modeBtn.textContent = 'mode: ' + P.mode;
    modeBtn.classList.toggle('on', P.mode === 'dark');
    modeBtn.setAttribute('aria-pressed', P.mode === 'dark' ? 'true' : 'false');
  }

  var presetWrap = document.getElementById('presets');
  Object.keys(PRESETS).forEach(function (name) {
    var b = document.createElement('button');
    b.className = 'btn'; b.textContent = name;
    b.addEventListener('click', function () {
      var pr = PRESETS[name];
      Object.keys(pr).forEach(function (k) { P[k] = pr[k]; });
      [].forEach.call(presetWrap.children, function (el) { el.classList.remove('on'); });
      b.classList.add('on');
      syncUI(); nudge();
    });
    presetWrap.appendChild(b);
  });
  presetWrap.firstChild.classList.add('on');

  var bgWrap = document.getElementById('bgs');
  Object.keys(BACKDROPS).forEach(function (name) {
    var b = document.createElement('button');
    b.className = 'btn' + (name === bgName ? ' on' : '');
    b.textContent = name;
    b.addEventListener('click', function () {
      bgName = name;
      uploadBackdrop(name);
      [].forEach.call(bgWrap.children, function (el) { el.classList.remove('on'); });
      b.classList.add('on');
      nudge();
    });
    bgWrap.appendChild(b);
  });

  document.getElementById('resetAll').addEventListener('click', function () {
    SPEC.forEach(function (s) { P[s.k] = s.def; });
    P.tint = '#f7ffe0'; P.mode = 'light';
    syncUI(); nudge();
  });

  // ---------- copy helpers ----------
  function copyText(text, btn) {
    var done = function () {
      var old = btn.textContent;
      btn.textContent = 'Copied';
      setTimeout(function () { btn.textContent = old; }, 1200);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallback(text, done); });
    } else { fallback(text, done); }
  }
  function fallback(text, done) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    // execCommand is deprecated, and `astro check` will note that. It is kept
    // deliberately: it remains the only synchronous copy path when the async
    // Clipboard API is unavailable or permission-blocked.
    try { document.execCommand('copy'); done(); } catch (e) { /* no-op */ }
    document.body.removeChild(ta);
  }

  document.getElementById('copyProps').addEventListener('click', function () {
    var lines = [
      '<LiquidGlass',
      '  src={BACKGROUND_URL}',
      '  width={' + P.width + '}',
      '  height={' + P.height + '}',
      '  cornerRadius={' + P.cornerRadius + '}',
      '  lightAngle={' + P.lightAngle + '}',
      '  lightIntensity={' + P.lightIntensity + '}',
      '  counterLight={' + P.counterLight + '}',
      '  refraction={' + P.refraction + '}',
      '  depth={' + P.depth + '}',
      '  dispersion={' + P.dispersion + '}',
      '  frost={' + P.frost + '}',
      '  splay={' + P.splay + '}',
      '  saturation={' + P.saturation + '}',
      '  luminance={' + P.luminance + '}',
      '  tint="' + P.tint + '"',
      '  mode="' + P.mode + '"',
      '  innerShadow={{ intensity: ' + P.innerShadow + ', splay: ' + P.splay + ' }}',
      '  dropShadow={{ intensity: ' + P.shadowIntensity + ', x: 4, y: ' + P.shadowY +
        ', blur: ' + P.shadowBlur + ' }}',
      '>',
      '  Continue',
      '</LiquidGlass>'
    ];
    copyText(lines.join('\n'), this);
  });

  [].forEach.call(document.querySelectorAll('.copybtn'), function (btn) {
    btn.addEventListener('click', function () {
      var el = document.getElementById(btn.getAttribute('data-copy'));
      if (el) copyText(el.innerText, btn);
    });
  });

  window.addEventListener('resize', nudge);
})();
