const rand = (min, max) => min + Math.random() * (max - min);

const splitLetters = (el, text) => {
  el.innerHTML = '';
  return [...text].map(ch => {
    const s = document.createElement('span');
    s.className = 'ltr';
    s.textContent = ch;
    el.appendChild(s);
    return s;
  });
};

(() => {
  const wm = document.querySelector('.wordmark');
  const letters = splitLetters(wm, 'marco');

  let driftTweens = [];
  const startDrift = () => {
    driftTweens = letters.map((l, i) => gsap.to(l, {
      y: () => rand(-10, 10), rotation: () => rand(-3, 3),
      duration: () => rand(2.4, 4), delay: i * 0.15,
      ease: 'sine.inOut', repeat: -1, yoyo: true,
    }));
  };
  startDrift();

  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  const STEP = 2;
  const DOT = 1.5;
  const SPREAD = 0.45;
  const DUR = 1.25;
  const EDGE = 0.18;
  const INV_EDGE = 1 / EDGE, INV_SPAN = 1 / (1 - SPREAD), HALF_DOT = DOT / 2;
  const smooth = t => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

  const sample = (w, h, draw) => {
    const c = document.createElement('canvas');
    c.width = Math.ceil(w); c.height = Math.ceil(h);
    const cx = c.getContext('2d');
    draw(cx);
    const data = cx.getImageData(0, 0, c.width, c.height).data, pts = [];
    for (let y = 0; y < c.height; y += STEP)
      for (let x = 0; x < c.width; x += STEP)
        if (data[(y * c.width + x) * 4 + 3] > 128) pts.push([x, y]);
    return pts;
  };
  const centroid = p => {
    let sx = 0, sy = 0;
    for (const q of p) { sx += q[0]; sy += q[1]; }
    return [sx / p.length, sy / p.length];
  };
  const shuffle = a => {
    for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };

  const SWOOSH = new Path2D('M218.574 124.746L218.574 142.146C131.454 142.146 121.614 168.666 22.254 168.666L22.254 151.266C124.308 151.266 124.174 124.746 218.574 124.746Z');
  const drawLogo = (c, size, fill = '#fff') => {
    c.fillStyle = fill;
    c.scale(size / 240, size / 240);
    c.fillRect(22.254, 174.786, 196.32, 17.4);
    c.fill(SWOOSH);
    const ring = new Path2D();
    ring.arc(60.153, 106.565, 33.575, 0, Math.PI * 2);
    ring.arc(60.153, 106.565, 14.975, 0, Math.PI * 2, true);
    c.fill(ring, 'evenodd');
  };

  let canvas = null, ctx = null, field = null, placeLogo = null, ink = '#fff';
  let tween = null, lastT = 0, shown = false, busy = false, onDoc = null;

  const build = () => {
    const rects = letters.map(l => l.getBoundingClientRect());
    const rots = letters.map(l => +gsap.getProperty(l, 'rotation') || 0);
    const left = Math.min(...rects.map(r => r.left)), right = Math.max(...rects.map(r => r.right));
    const top = Math.min(...rects.map(r => r.top)), bot = Math.max(...rects.map(r => r.bottom));
    const cx = (left + right) / 2, cy = (top + bot) / 2;
    const cs = getComputedStyle(wm), F = parseFloat(cs.fontSize);
    ink = cs.color;

    const pad = F, ox = left - pad, oy = top - pad;
    const text = sample((right - left) + pad * 2, (bot - top) + pad * 2, c => {
      c.fillStyle = '#fff';
      c.textAlign = 'center';
      c.textBaseline = 'alphabetic';
      c.font = `${cs.fontWeight} ${F}px ${cs.fontFamily}`;
      const m = c.measureText('m');
      const baseY = ((m.fontBoundingBoxAscent || F * 0.8) - (m.fontBoundingBoxDescent || F * 0.2)) / 2;
      letters.forEach((l, i) => {
        const r = rects[i];
        c.save();
        c.translate(r.left + r.width / 2 - ox, r.top + r.height / 2 - oy);
        c.rotate(rots[i] * Math.PI / 180);
        c.fillText('marco'[i], 0, baseY);
        c.restore();
      });
    }).map(p => [ox + p[0], oy + p[1]]);

    const size = (bot - top) * 2, lpad = size * 0.2;
    const local = sample(size + lpad * 2, size + lpad * 2, c => { c.translate(lpad, lpad); drawLogo(c, size); });
    const [mx, my] = centroid(local);
    const logo = local.map(([x, y]) => [x - mx + cx, y - my + cy]);
    placeLogo = (c, fill) => { c.save(); c.translate(cx - mx + lpad, cy - my + lpad); drawLogo(c, size, fill); c.restore(); };

    shuffle(text); shuffle(logo);
    const n = Math.max(text.length, logo.length);
    const ax = new Float32Array(n), ay = new Float32Array(n), dx = new Float32Array(n), dy = new Float32Array(n);
    const bx = new Float32Array(n), by = new Float32Array(n), dl = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = text[i % text.length], b = logo[i % logo.length];
      const vx = b[0] - a[0], vy = b[1] - a[1], inv = ((Math.random() - 0.5) * 70) / (Math.hypot(vx, vy) || 1);
      ax[i] = a[0]; ay[i] = a[1]; dx[i] = vx; dy[i] = vy;
      bx[i] = -vy * inv; by[i] = vx * inv; dl[i] = Math.random() * SPREAD;
    }
    field = { n, ax, ay, dx, dy, bx, by, dl };
  };

  const sizeCanvas = () => {
    canvas.width = innerWidth * DPR; canvas.height = innerHeight * DPR;
    canvas.style.width = innerWidth + 'px'; canvas.style.height = innerHeight + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  };

  const render = T => {
    lastT = T;
    const partA = Math.min(smooth(T * INV_EDGE), smooth((1 - T) * INV_EDGE));
    const logoA = smooth((T - 1 + EDGE) * INV_EDGE);
    wm.style.opacity = 1 - smooth(T * INV_EDGE);

    ctx.clearRect(0, 0, innerWidth, innerHeight);
    if (logoA > 0) { ctx.globalAlpha = logoA; placeLogo(ctx, ink); }

    if (partA > 0) {
      const { n, ax, ay, dx, dy, bx, by, dl } = field;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        let e = (T - dl[i]) * INV_SPAN;
        e = e <= 0 ? 0 : e >= 1 ? 1 : e * e * (3 - 2 * e);
        const ph = 4 * e * (1 - e);
        ctx.rect(ax[i] + dx[i] * e + bx[i] * ph - HALF_DOT, ay[i] + dy[i] * e + by[i] * ph - HALF_DOT, DOT, DOT);
      }
      ctx.globalAlpha = partA;
      ctx.fillStyle = ink;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };

  const teardown = () => { canvas.remove(); canvas = ctx = field = placeLogo = null; };

  const toLogo = () => {
    if (shown || busy) return;
    busy = true;
    driftTweens.forEach(t => t.kill());
    gsap.killTweensOf(letters);
    build();

    canvas = document.createElement('canvas');
    canvas.className = 'morph-canvas';
    ctx = canvas.getContext('2d');
    document.body.appendChild(canvas);
    sizeCanvas();

    const o = { t: 0 };
    render(0);
    tween = gsap.to(o, {
      t: 1, duration: DUR, ease: 'none', onUpdate: () => render(o.t),
      onComplete: () => {
        busy = false; shown = true;
        onDoc = e => { if (!e.target.closest('.cluster, #adv-chev')) toWord(); };
        document.addEventListener('click', onDoc);
      },
    });
  };

  const toWord = () => {
    if (!shown || busy) return;
    busy = true; shown = false;
    document.removeEventListener('click', onDoc); onDoc = null;
    const o = { t: 1 };
    tween = gsap.to(o, {
      t: 0, duration: DUR * 0.85, ease: 'none', onUpdate: () => render(o.t),
      onComplete: () => { wm.style.opacity = ''; teardown(); busy = false; startDrift(); },
    });
  };

  const dismiss = () => {
    if (!shown && !busy) return;
    if (tween) tween.kill();
    if (onDoc) { document.removeEventListener('click', onDoc); onDoc = null; }
    shown = busy = false;
    if (canvas) {
      const c = canvas;
      canvas = ctx = field = placeLogo = null;
      gsap.to(c, { opacity: 0, duration: 0.3, ease: 'power2.out', onComplete: () => c.remove() });
    }
    wm.style.opacity = '';
    startDrift();
  };

  addEventListener('resize', () => { if (canvas) { sizeCanvas(); render(lastT); } });
  wm.addEventListener('click', toLogo);
  window.__morphDismiss = dismiss;
})();

(() => {
  const layer = document.querySelector('.label-layer');
  const GAP = 20;
  const FS = 26;

  const meas = document.createElement('span');
  meas.className = 'ltr measurer';
  layer.appendChild(meas);
  const widthOf = ch => { meas.textContent = ch; return meas.offsetWidth; };

  let active = [];

  const startTwitch = item => {
    item.twitch = gsap.to(item.gly, {
      x: () => rand(-0.7, 0.7), y: () => rand(-0.7, 0.7), rotation: () => rand(-1.2, 1.2),
      duration: () => rand(0.2, 0.45), repeat: -1, repeatRefresh: true,
      ease: 'rough({ template: none.out, strength: 1, points: 20, randomize: true })',
    });
  };

  const makeLetter = ch => {
    const el = document.createElement('span');
    el.className = 'ltr';
    const gly = document.createElement('span');
    gly.className = 'gly';
    gly.textContent = ch;
    el.appendChild(gly);
    layer.appendChild(el);
    return { ch, el, gly, twitch: null };
  };

  const exit = item => {
    if (item.twitch) item.twitch.kill();
    gsap.killTweensOf(item.gly);
    gsap.to(item.gly, {
      opacity: 0, x: rand(-30, 80), y: rand(-40, 40), rotation: rand(-60, 60),
      duration: 0.3, ease: 'power2.in', onComplete: () => item.el.remove(),
    });
  };

  const nodes = [...document.querySelectorAll('.node')];
  const darken = (hex, f) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgb(${Math.round(((n >> 16) & 255) * f)}, ${Math.round(((n >> 8) & 255) * f)}, ${Math.round((n & 255) * f)})`;
  };

  const HALF = 25;
  let selected = null;
  window.__isHome = () => selected === null;
  const shapeRestX = node => (node === selected ? HALF : 0);

  nodes.forEach(node => {
    const c = node.style.getPropertyValue('--c').trim() || '#ffffff';
    const a = makeLetter(node.dataset.label[0]);
    a.atHome = true;
    a.outColor = c;
    a.homeColor = darken(c, 0.5);
    a.el.style.color = a.homeColor;
    gsap.set(a.gly, { opacity: 1 });
    node.anchor = a;

    const lr = layer.getBoundingClientRect();
    const sr = node.querySelector('.shape').getBoundingClientRect();
    node._base = { x: sr.left - lr.left, y: sr.top - lr.top, w: sr.width, h: sr.height };
  });

  const placeAnchorsHome = () => {
    nodes.forEach(node => {
      const a = node.anchor, b = node._base;
      a.home = {
        x: b.x + (b.w - widthOf(a.ch)) / 2 + shapeRestX(node),
        y: b.y + (b.h - FS) / 2,
      };
      if (a.atHome) gsap.set(a.el, { x: a.home.x, y: a.home.y });
    });
  };
  placeAnchorsHome();
  document.fonts?.ready.then(placeAnchorsHome);

  const wordmark = document.querySelector('.wordmark');
  const home = document.querySelector('.home');
  const content = document.getElementById('content');

  const CONTACTS = `
    <div class="contacts">
      <a href="https://github.com/nnmarcoo" target="_blank" rel="noopener" aria-label="GitHub"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg></a>
      <a href="https://www.linkedin.com/in/marco-todorov" target="_blank" rel="noopener" aria-label="LinkedIn"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg></a>
      <a href="https://discord.com/users/nnmarco" target="_blank" rel="noopener" aria-label="Discord"><svg viewBox="0 0 127 96" fill="currentColor"><path d="M107.7 8.07A105.15 105.15 0 0 0 81.47 0a72.06 72.06 0 0 0-3.36 6.83 97.68 97.68 0 0 0-29.11 0A72.37 72.37 0 0 0 45.64 0a105.89 105.89 0 0 0-26.25 8.09C2.79 32.65-1.71 56.6.54 80.21a105.73 105.73 0 0 0 32.17 16.15 77.7 77.7 0 0 0 6.89-11.11 68.42 68.42 0 0 1-10.85-5.18c.91-.66 1.8-1.34 2.66-2a75.57 75.57 0 0 0 64.32 0c.87.71 1.76 1.39 2.66 2a68.68 68.68 0 0 1-10.87 5.19 77 77 0 0 0 6.89 11.1 105.25 105.25 0 0 0 32.19-16.14c2.64-27.38-4.51-51.11-18.9-72.15ZM42.45 65.69C36.18 65.69 31 60 31 53s5-12.74 11.43-12.74S54 46 53.89 53s-5.05 12.69-11.44 12.69Zm42.24 0C78.41 65.69 73.25 60 73.25 53s5-12.74 11.44-12.74S96.23 46 96.12 53s-5.04 12.69-11.43 12.69Z"/></svg></a>
    </div>`;

  const PROJECTS = [
    {
      title: 'bloom',
      excerpt: 'Hardware-accelerated media viewer',
      description: 'A high-performance media viewer built in Rust that prioritizes quality and speed. Capable of rendering billions of pixels using hardware mipmapping from 80+ media formats, Bloom removes bloat from existing viewers, while preserving the best form of useful features.',
      tags: ['rust', 'iced', 'wgpu', 'wgsl', 'wip'],
      github: 'https://github.com/nnmarcoo/bloom',
      live: 'https://bloomview.rs',
      media: [
        'https://raw.githubusercontent.com/nnmarcoo/bloom/main/docs/demo/camera.png',
        'https://raw.githubusercontent.com/nnmarcoo/bloom/main/docs/demo/pigeon.png',
        'https://raw.githubusercontent.com/nnmarcoo/bloom/main/docs/demo/bird.mp4',
        'https://raw.githubusercontent.com/nnmarcoo/bloom/main/docs/demo/gif.mp4',
      ],
    },
  ];

  const ICON_GH = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>`;
  const ICON_EXT = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;
  const CHEV_L = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`;
  const CHEV_R = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`;

  const renderSection = label => {
    if (label === 'about') return `
      <div class="about">
        <p>I build <span class="hl">native</span> desktop apps and pragmatic tools.</p>
        <p>I'm drawn to software that feels <span class="hl">fast</span>, <span class="hl">simple</span>, and <span class="hl">invisible</span> where it should be.</p>
        <div class="about-foot">${CONTACTS}</div>
      </div>`;
    if (label === 'projects') return `<div class="proj-view"></div>`;
    if (label === 'blog') return `<p class="muted center">Coming soon...</p>`;
    return '';
  };

  const hoverPop = (el, scale = 1.06, tiltMax = 7) => {
    el.addEventListener('mouseenter', () => {
      const rot = tiltMax ? rand(tiltMax * 0.45, tiltMax) * (Math.random() < 0.5 ? -1 : 1) : 0;
      gsap.to(el, { rotation: rot, scale, duration: 0.45, ease: 'back.out(2.6)' });
    });
    el.addEventListener('mouseleave', () => {
      gsap.to(el, { rotation: 0, scale: 1, duration: 0.45, ease: 'power3.out' });
    });
  };

  const lightbox = document.getElementById('lightbox');
  const lbMedia = lightbox.querySelector('.lb-media');
  const openLightbox = (src, isVideo) => {
    lbMedia.innerHTML = isVideo
      ? `<video src="${src}" controls autoplay loop playsinline></video>`
      : `<img src="${src}" alt="">`;
    lightbox.classList.add('active');
    gsap.fromTo(lbMedia, { opacity: 0, scale: 0.96 }, { opacity: 1, scale: 1, duration: 0.25, ease: 'power3.out' });
  };
  const closeLightbox = () => {
    lightbox.classList.remove('active');
    gsap.to(lbMedia, { opacity: 0, duration: 0.15, onComplete: () => { lbMedia.innerHTML = ''; } });
  };
  lightbox.addEventListener('click', e => { if (e.target === lightbox) closeLightbox(); });
  lightbox.querySelector('.lb-close').addEventListener('click', closeLightbox);

  const advChev = document.getElementById('adv-chev');
  const advBtn = advChev.querySelector('.adv-btn');
  let advTarget = null;
  advBtn.addEventListener('click', () => { if (advTarget) select(advTarget); });
  hoverPop(advBtn);
  const setAdv = label => {
    advTarget = label ? nodes.find(n => n.dataset.label === label) : null;
    advChev.classList.toggle('show', !!advTarget);
  };

  const listHTML = () => `
    <div class="proj-list">
      ${PROJECTS.map((p, i) => `
        <div class="proj-row" data-i="${i}">
          <span class="proj-idx">${String(i + 1).padStart(2, '0')}</span>
          <span class="proj-name">${p.title}</span>
          <span class="proj-desc">${p.excerpt}</span>
          <span class="proj-arrow">${CHEV_R}</span>
        </div>`).join('')}
    </div>`;

  const detailHTML = idx => {
    const p = PROJECTS[idx];
    return `
      <div class="proj-detail">
        <div class="pd-top">
          <button class="pd-back">${CHEV_L}<span>all</span></button>
          <div class="pd-nav">
            <button class="pd-cy pd-prev" aria-label="Previous project">${CHEV_L}</button>
            <div class="pd-index">${PROJECTS.map((_, i) => `<button class="pd-num${i === idx ? ' active' : ''}" data-i="${i}">${String(i + 1).padStart(2, '0')}</button>`).join('')}</div>
            <button class="pd-cy pd-next" aria-label="Next project">${CHEV_R}</button>
          </div>
        </div>
        <div class="pd-figure">
          <div class="gallery">${p.media.map(src => /\.(mp4|webm)$/.test(src)
            ? `<video src="${src}" autoplay loop muted playsinline></video>`
            : `<img src="${src}" alt="${p.title}" draggable="false">`).join('')}</div>
          ${p.media.length > 1 ? `
            <button class="gal-nav gal-prev" aria-label="Previous">${CHEV_L}</button>
            <button class="gal-nav gal-next" aria-label="Next">${CHEV_R}</button>
            <div class="gal-dots">${p.media.map((_, i) => `<button class="gal-dot${i === 0 ? ' active' : ''}" aria-label="Image ${i + 1}"></button>`).join('')}</div>
          ` : ''}
        </div>
        <div class="pd-body">
          <h2 class="pd-title">${p.title}</h2>
          <p class="pd-desc">${p.description}</p>
          <div class="chips">${p.tags.map(t => `<span class="chip">${t}</span>`).join('')}</div>
          <div class="pd-links">
            <a class="mlink" href="${p.github}" target="_blank" rel="noopener">${ICON_GH} repo</a>
            ${p.live ? `<a class="mlink secondary" href="${p.live}" target="_blank" rel="noopener">${ICON_EXT} site</a>` : ''}
          </div>
        </div>
      </div>`;
  };

  const setupGallery = root => {
    const gal = root.querySelector('.gallery');
    if (!gal) return;
    const dots = [...root.querySelectorAll('.gal-dot')];
    const prev = root.querySelector('.gal-prev');
    const next = root.querySelector('.gal-next');
    let idx = 0;
    const go = i => { idx = Math.max(0, Math.min(dots.length - 1, i)); gal.scrollTo({ left: idx * gal.clientWidth, behavior: 'smooth' }); };
    if (prev) prev.addEventListener('click', () => go((idx - 1 + dots.length) % dots.length));
    if (next) next.addEventListener('click', () => go((idx + 1) % dots.length));
    dots.forEach((d, i) => d.addEventListener('click', () => go(i)));
    gal.querySelectorAll('img, video').forEach(el =>
      el.addEventListener('click', () => openLightbox(el.getAttribute('src'), el.tagName === 'VIDEO')));
    gal.addEventListener('scroll', () => {
      const ni = Math.round(gal.scrollLeft / gal.clientWidth);
      if (ni !== idx) { idx = ni; dots.forEach((d, j) => d.classList.toggle('active', j === idx)); }
    });
  };

  const mountProjects = () => {
    const view = content.querySelector('.proj-view');
    const N = PROJECTS.length;

    const swapOut = (dir, then) => {
      const cur = view.firstElementChild;
      if (!cur) return then();
      gsap.to(cur, { opacity: 0, x: 24 * dir, duration: 0.18, ease: 'power2.in', onComplete: then });
    };

    const showList = (fromX = -24) => {
      view.innerHTML = listHTML();
      view.querySelectorAll('.proj-name').forEach(el => hoverPop(el, 1.06, 3));
      view.querySelectorAll('.proj-row').forEach(row =>
        row.addEventListener('click', () => swapOut(-1, () => showDetail(+row.dataset.i, 1))));
      gsap.fromTo(view.firstElementChild, { opacity: 0, x: fromX }, { opacity: 1, x: 0, duration: 0.35, ease: 'power3.out' });
    };

    const showDetail = (idx, dir = 1) => {
      view.innerHTML = detailHTML(idx);
      view.querySelector('.pd-back').addEventListener('click', () => swapOut(1, () => showList(-24)));
      view.querySelector('.pd-prev').addEventListener('click', () => showDetail((idx - 1 + N) % N, -1));
      view.querySelector('.pd-next').addEventListener('click', () => showDetail((idx + 1) % N, 1));
      view.querySelectorAll('.pd-num').forEach(b =>
        b.addEventListener('click', () => { const t = +b.dataset.i; if (t !== idx) showDetail(t, t > idx ? 1 : -1); }));
      setupGallery(view);
      const inner = [view.querySelector('.pd-figure'), ...view.querySelectorAll('.pd-title, .pd-desc, .chips, .pd-links')];
      gsap.from(inner, { opacity: 0, x: 26 * dir, duration: 0.4, ease: 'power3.out', stagger: 0.05 });
    };

    showList();
  };

  const showContent = node => {
    document.title = `marco / ${node.dataset.label}`;
    setAdv(node.dataset.label === 'about' ? 'projects' : null);
    content.innerHTML = renderSection(node.dataset.label);
    content.classList.toggle('wide', node.dataset.label === 'projects');
    content.querySelectorAll('.contacts a').forEach(el => hoverPop(el));
    if (node.dataset.label === 'projects') mountProjects();
    content.classList.add('active');
    gsap.to(home, { opacity: 0, duration: 0.3, ease: 'power2.out' });
    gsap.killTweensOf(content);
    gsap.fromTo(content, { opacity: 0 }, { opacity: 1, duration: 0.4, ease: 'power2.out' });
  };

  const hideContent = () => {
    document.title = 'marco';
    content.classList.remove('active');
    gsap.killTweensOf(content);
    gsap.to(content, { opacity: 0, duration: 0.25, ease: 'power2.in', onComplete: () => { content.classList.remove('wide'); content.innerHTML = ''; } });
    gsap.to(home, { opacity: 1, duration: 0.45, delay: 0.05, ease: 'power2.out' });
  };

  const moveSquare = n => {
    gsap.to(n.querySelector('.shape'), { x: shapeRestX(n), duration: 0.45, ease: 'back.out(2)' });
    const a = n.anchor;
    a.home.x = n._base.x + (n._base.w - widthOf(a.ch)) / 2 + shapeRestX(n);
    if (a.atHome) gsap.to(a.el, { x: a.home.x, duration: 0.45, ease: 'back.out(2)' });
  };

  const goHome = () => {
    const prev = selected;
    if (!prev) return;
    selected = null;
    setAdv('about');
    moveSquare(prev);
    if (!prev.anchor.atHome) transitionTo(prev);
    hideContent();
  };

  const select = node => {
    window.__morphDismiss && window.__morphDismiss();
    if (selected === node) { goHome(); return; }
    const prev = selected;
    selected = node;
    if (prev) moveSquare(prev);
    moveSquare(node);
    if (!node.anchor.atHome) transitionTo(node);
    showContent(node);
  };

  const sendAnchorHome = a => {
    if (a.atHome) return;
    a.atHome = true;
    if (a.twitch) a.twitch.kill();
    gsap.killTweensOf(a.el); gsap.killTweensOf(a.gly);
    gsap.to(a.el, { x: a.home.x, y: a.home.y, color: a.homeColor, duration: rand(0.45, 0.7), ease: 'power3.inOut' });
    gsap.to(a.gly, { opacity: 1, x: 0, y: 0, rotation: 0, scale: 1, duration: 0.4, ease: 'power2.out' });
  };

  const sendAnchorOut = (a, slot) => {
    a.atHome = false;
    if (a.twitch) a.twitch.kill();
    gsap.killTweensOf(a.el); gsap.killTweensOf(a.gly);
    gsap.to(a.el, { x: slot.x, y: slot.y, color: a.outColor, duration: rand(0.45, 0.7), ease: 'power3.out', onComplete: () => startTwitch(a) });
    gsap.to(a.gly, { opacity: 1, x: 0, y: 0, rotation: 0, scale: 1, duration: 0.4, ease: 'power2.out' });
  };

  const transitionTo = node => {
    const word = node.dataset.label;
    const color = node.style.getPropertyValue('--c').trim() || '#fff';

    const b = node._base;
    const anchorX = b.x + b.w + shapeRestX(node) + GAP;
    const posY = b.y + (b.h - FS) / 2;

    const slots = [];
    let cursor = anchorX;
    for (const ch of word) { slots.push({ ch, x: cursor, y: posY }); cursor += widthOf(ch); }

    nodes.forEach(n => n === node ? sendAnchorOut(n.anchor, slots[0]) : sendAnchorHome(n.anchor));

    const prev = active;
    const used = new Array(prev.length).fill(false);
    const next = [];

    slots.forEach((slot, i) => {
      if (i === 0) return;
      let idx = -1;
      for (let k = 0; k < prev.length; k++) {
        if (!used[k] && prev[k].ch === slot.ch) { idx = k; break; }
      }
      if (idx >= 0) {
        used[idx] = true;
        const item = prev[idx];
        if (item.twitch) item.twitch.kill();
        gsap.killTweensOf(item.el);
        gsap.to(item.el, { x: slot.x, y: slot.y, color, duration: rand(0.5, 0.8), ease: 'power3.inOut' });
        gsap.to(item.gly, {
          opacity: 1, x: 0, y: 0, rotation: 0, scale: 1, duration: 0.4, ease: 'power2.out',
          onComplete: () => startTwitch(item),
        });
        next.push(item);
      } else {
        const item = makeLetter(slot.ch);
        item.el.style.color = color;
        gsap.set(item.el, { x: slot.x, y: slot.y });
        gsap.fromTo(item.gly,
          { opacity: 0, x: rand(-40, 120), y: rand(-60, 60), rotation: rand(-90, 90), scale: rand(0.6, 1.1) },
          {
            opacity: 1, x: 0, y: 0, rotation: 0, scale: 1,
            duration: rand(0.45, 0.8), delay: i * 0.04 + rand(0, 0.08), ease: 'back.out(2.2)',
            onComplete: () => startTwitch(item),
          });
        next.push(item);
      }
    });

    prev.forEach((item, k) => { if (!used[k]) exit(item); });
    active = next;
  };

  const clearAll = () => {
    active.forEach(exit);
    active = [];
    nodes.forEach(n => sendAnchorHome(n.anchor));
  };

  nodes.forEach(node => {
    const shapeEl = node.querySelector('.shape');
    shapeEl.style.setProperty('--ga', `${Math.round(rand(0, 360))}deg`);
    node.addEventListener('mouseenter', () => {
      const rot = rand(3, 7) * (Math.random() < 0.5 ? -1 : 1);
      gsap.to(shapeEl, { rotation: rot, scale: 1.06, x: shapeRestX(node) - 4, duration: 0.45, ease: 'back.out(2.6)' });
      transitionTo(node);
    });
    node.addEventListener('mouseleave', () => {
      gsap.to(shapeEl, { rotation: 0, scale: 1, x: shapeRestX(node), duration: 0.45, ease: 'power3.out' });
    });
    node.addEventListener('click', () => select(node));
  });

  document.querySelector('.cluster').addEventListener('mouseleave', clearAll);

  const sectionKeys = { a: 'about', p: 'projects', b: 'blog' };
  addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Escape') {
      if (lightbox.classList.contains('active')) { closeLightbox(); return; }
      const back = content.querySelector('.pd-back');
      if (back) { back.click(); return; }
      goHome();
      return;
    }
    const label = sectionKeys[e.key.toLowerCase()];
    if (label) {
      const target = nodes.find(n => n.dataset.label === label);
      if (target && selected !== target) select(target);
    }
  });

  setAdv('about');
})();
