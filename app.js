// todo: the selected section text should be tinted blue

class Portfolio {
  static FONT = '"Space Grotesk", sans-serif';
  static DURATION = 600;

  constructor(id, config) {
    this.canvas = document.getElementById(id);
    this.gl = this.canvas.getContext('webgl');
    if (!this.gl) return;

    this.config = config;

    // state
    this.section = null;
    this.trans = null;

    // layout
    this.menuX = 0;
    this.menuY = 0;
    this.contentX = 1;
    this.contentY = 1;
    this.layoutDirty = true;

    // interaction (CSS-space)
    this.mouse = { x: 0, y: 0 };

    // animation
    this.time = 0;
    this.lastTime = 0;
    this.intensity = 1;
    this.block = 3;

    // rendering
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.offscreen = document.createElement('canvas');
    this.ctx = this.offscreen.getContext('2d');
    this.items = [];
    this.menuItems = [];
    this.contentItems = [];

    this.initGL();
    this.resize();
    this.bind();
    requestAnimationFrame(t => this.loop(t));
  }

  // webgl
  
  initGL() {
    const gl = this.gl;

    const vsSrc = `
      attribute vec2 p,u;
      varying vec2 v;
      void main(){
        gl_Position = vec4(p,0.,1.);
        v = u;
      }
    `;

    const fsSrc = `
      precision highp float;
      varying vec2 v;
      uniform sampler2D t;
      uniform vec2 r,m;
      uniform float time,i,b,rad,dsp,spl,tr;
      void main(){
        vec2 px = v * r;
        vec2 d = px - m;
        float dist = length(d);
        float s = max(0., 1. - dist / rad);
        if (tr > .5) s = max(s, .25);

        if (s <= 0. && tr < .5) {
          gl_FragColor = vec4(texture2D(t, v).rgb, 1.);
          return;
        }

        vec2 bl = (floor(px / b) + .5) * b / r;
        float dp = dsp * i;
        float sp = spl * i;
        float a = atan(d.y, d.x);
        float w = sin(dist * .03 + time) * dp * s;
        vec2 dr = vec2(cos(a), sin(a));

        float R = texture2D(t, bl - dr * (w + sp * s) / r).r;
        float G = texture2D(t, bl - dr * w / r).g;
        float B = texture2D(t, bl - dr * (w - sp * s) / r).b;

        gl_FragColor = vec4(
          R * vec3(.2,.4,1.) +
          G * vec3(.3,.8,1.) +
          B * vec3(.5,.6,1.),
          1.
        );
      }
    `;

    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(s));
        gl.deleteShader(s);
        return null;
      }
      return s;
    };

    const vs = compile(gl.VERTEX_SHADER, vsSrc);
    const fs = compile(gl.FRAGMENT_SHADER, fsSrc);

    const pg = gl.createProgram();
    gl.attachShader(pg, vs);
    gl.attachShader(pg, fs);
    gl.linkProgram(pg);
    if (!gl.getProgramParameter(pg, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(pg));
      return;
    }

    this.pg = pg;

    const buf = d => {
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(d), gl.STATIC_DRAW);
      return b;
    };

    this.posBuf = buf([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]);
    this.uvBuf  = buf([0,1, 1,1, 0,0, 0,0, 1,1, 1,0]);

    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    const u = n => gl.getUniformLocation(pg, n);
    this.loc = {
      p: gl.getAttribLocation(pg, 'p'),
      u: gl.getAttribLocation(pg, 'u'),
      r: u('r'), m: u('m'),
      time: u('time'), i: u('i'),
      b: u('b'), rad: u('rad'),
      dsp: u('dsp'), spl: u('spl'),
      tr: u('tr')
    };
  }

  // state & transitions
  
  open(name) {
    if (this.trans || this.section === name) return;
    this.trans = {
      type: this.section ? 2 : 0,
      from: this.section,
      to: name,
      start: performance.now()
    };
    this.layoutDirty = true;
  }

  close() {
    if (this.trans || !this.section) return;
    this.trans = {
      type: 1,
      from: this.section,
      start: performance.now()
    };
    this.layoutDirty = true;
  }

  ease(t) {
    return t < .5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2;
  }

  isPortrait() {
    return this.cssH > this.cssW;
  }

  update(now) {
    if (!this.trans) return;

    const t = Math.min(1, (now - this.trans.start) / Portfolio.DURATION);
    const e = this.ease(t);
    const mid = Math.abs(t - .5);

    this.intensity = 1 + this.ease(mid < .3 ? 1 - mid/.3 : 0) * 1.5;

    if (this.trans.type === 0) {
      this.menuX = e * .35;
      this.menuY = e * .35;
      this.contentX = 1 - e;
      this.contentY = 1 - e;
      if (t >= .5) this.section = this.trans.to;
    } else if (this.trans.type === 1) {
      this.menuX = .35 * (1 - e);
      this.menuY = .35 * (1 - e);
      this.contentX = e;
      this.contentY = e;
      if (t >= .5) this.section = null;
    } else {
      this.menuX = .35;
      this.menuY = .35;
      this.contentX = t < .5 ? this.ease(t*2) : 1 - this.ease((t-.5)*2);
      this.contentY = t < .5 ? this.ease(t*2) : 1 - this.ease((t-.5)*2);
      if (t >= .5) this.section = this.trans.to;
    }

    if (t >= 1) {
      this.trans = null;
      this.intensity = 1;
      this.menuX = this.section ? .35 : 0;
      this.menuY = this.section ? .35 : 0;
      this.contentX = this.section ? 0 : 1;
      this.contentY = this.section ? 0 : 1;
      this.layoutDirty = true;
    }
  }

  getActiveSection() {
    if (this.section) return this.section;
    if (!this.trans) return null;
    return this.trans.type === 1 ? this.trans.from : this.trans.to;
  }

  // layout
  
  buildItems() {
    const items = [
      { text: this.config.logo, size: 48, type: 0, act: () => this.close() }
    ];

    this.config.menu.forEach(m =>
      items.push({ text: m.text, size: 36, type: 1, act: () => this.open(m.section) })
    );

    const sec = this.getActiveSection();
    if (sec) {
      this.config.sections[sec].forEach(c =>
        items.push({ text: c.text, size: c.fontSize || 28, type: 2, href: c.href })
      );
    }

    this.items = items.map(it => {
      this.ctx.font = `bold ${it.size}px ${Portfolio.FONT}`;
      return { ...it, w: this.ctx.measureText(it.text).width };
    });

    this.menuItems = this.items.filter(i => i.type === 1);
    this.contentItems = this.items.filter(i => i.type === 2);
  }

  pos(it) {
    const W = this.cssW;
    const H = this.cssH;
    const portrait = this.isPortrait();

    if (it.type === 0)
      return { x: 40, y: 50 - it.size/2, rx: 40 + it.w/2, ry: 50 };

    if (it.type === 1) {
      const i = this.menuItems.indexOf(it);
      if (portrait) {
        const x = W / 2;
        const baseY = H * .35;
        const y = baseY - this.menuItems.length*30 + 30 + i*60 - this.menuY * H * .35;
        return { x: x - it.w/2, y: y - it.size/2, rx: x, ry: y };
      } else {
        const y = H/2 - this.menuItems.length*30 + 30 + i*60;
        const x = W/2 - this.menuX * W;
        return { x: x - it.w/2, y: y - it.size/2, rx: x, ry: y };
      }
    }

    const i = this.contentItems.indexOf(it);
    if (portrait) {
      const x = W / 2;
      const baseY = H * .7;
      const y = baseY - this.contentItems.length*25 + 25 + i*50 + this.contentY * H * .5;
      return { x: x - it.w/2, y: y - it.size/2, rx: x, ry: y };
    } else {
      const y = H/2 - this.contentItems.length*25 + 25 + i*50;
      const x = W*.65 + this.contentX * W*.5;
      return { x: x - it.w/2, y: y - it.size/2, rx: x, ry: y };
    }
  }

  // mouse hit detection
  
  hit(e) {
    if (!this.items.length) this.buildItems();

    return this.items.find(it => {
      if (it.type === 0 && !this.section) return false;
      if (!it.act && !it.href) return false;

      const p = this.pos(it);
      const left   = p.rx - it.w/2;
      const right  = p.rx + it.w/2;
      const top    = p.ry - it.size/2;
      const bottom = p.ry + it.size/2;

      return e.clientX >= left && e.clientX <= right &&
             e.clientY >= top && e.clientY <= bottom;
    });
  }

  // rendering

  draw() {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssW, this.cssH);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.cssW, this.cssH);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const it of this.items) {
      const p = this.pos(it);
      ctx.font = `bold ${it.size}px ${Portfolio.FONT}`;
      ctx.fillText(it.text, p.rx, p.ry);
    }
  }

  loop(now) {
    const dt = (now - this.lastTime) / 1000 || 0;
    this.lastTime = now;
    this.time += dt;

    this.update(now);

    if (this.layoutDirty) {
      this.buildItems();
      this.layoutDirty = false;
    }

    let minD = Infinity;
    let sz = 36;
    for (const it of this.items) {
      const p = this.pos(it);
      const d = Math.hypot(this.mouse.x - p.rx, this.mouse.y - p.ry);
      if (d < minD) { minD = d; sz = it.size; }
    }
    this.block += (Math.max(2, Math.min(6, sz / 12)) - this.block) * .1;

    const hovering = this.hit({ clientX: this.mouse.x, clientY: this.mouse.y });
    this.canvas.style.cursor = hovering ? 'pointer' : 'default';

    this.draw();

    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.offscreen);

    gl.useProgram(this.pg);
    gl.uniform2f(this.loc.r, this.canvas.width, this.canvas.height);
    gl.uniform2f(this.loc.m, this.mouse.x * this.dpr, this.mouse.y * this.dpr);
    gl.uniform1f(this.loc.time, this.time);
    gl.uniform1f(this.loc.i, this.intensity);
    gl.uniform1f(this.loc.b, this.block);
    gl.uniform1f(this.loc.rad, 200 * this.dpr);
    gl.uniform1f(this.loc.dsp, 4);
    gl.uniform1f(this.loc.spl, 2);
    gl.uniform1f(this.loc.tr, this.trans ? 1 : 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
    gl.enableVertexAttribArray(this.loc.p);
    gl.vertexAttribPointer(this.loc.p, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuf);
    gl.enableVertexAttribArray(this.loc.u);
    gl.vertexAttribPointer(this.loc.u, 2, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    requestAnimationFrame(t => this.loop(t));
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);

    this.cssW = innerWidth;
    this.cssH = innerHeight;

    const w = Math.floor(this.cssW * this.dpr);
    const h = Math.floor(this.cssH * this.dpr);

    this.canvas.style.width = this.cssW + 'px';
    this.canvas.style.height = this.cssH + 'px';
    this.canvas.width = this.offscreen.width = w;
    this.canvas.height = this.offscreen.height = h;

    this.gl.viewport(0, 0, w, h);

    this.gl.bindTexture(this.gl.TEXTURE_2D, this.tex);
    this.gl.texImage2D(
      this.gl.TEXTURE_2D,
      0,
      this.gl.RGBA,
      w,
      h,
      0,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
      null
    );

    this.layoutDirty = true;
  }

  bind() {
    addEventListener('resize', () => this.resize());

    this.canvas.addEventListener('mousemove', e => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
    });

    this.canvas.addEventListener('click', e => {
      if (this.trans) return;
      const h = this.hit(e);
      if (h?.act) h.act();
      else if (h?.href) window.open(h.href, '_blank');
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new Portfolio('canvas', {
    logo: 'marco',
    menu: [
      { text: 'about', section: 'about' },
      { text: 'projects', section: 'projects' },
      { text: 'contact', section: 'contact' }
    ],
    sections: {
      about: [{ text: 'todo', fontSize: 24 }],
      projects: [{ text: 'todo', fontSize: 28 }],
      contact: [{ text: 'todo', fontSize: 24 }]
    }
  });
});
