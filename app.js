class CanvasEffects {
    static PARTICLE_COUNT_BASE = 40;
    static PARTICLE_COUNT_MAX = 70;
    static PARTICLE_SIZE_MIN = 0.5;
    static PARTICLE_SIZE_MAX = 1.2;
    static PARTICLE_SPEED = 0.015;
    static PARTICLE_OPACITY = 0.2;

    static LINE_DISTANCE_BASE = 150;
    static LINE_DISTANCE_MIN = 100;
    static LINE_OPACITY = .9;
    static LINE_WIDTH = 1;

    static EFFECT_RADIUS = 120;

    static PARALLAX_STRENGTH = 30;
    static PARALLAX_SMOOTHING = 0.08;

    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;

        this.ctx = this.canvas.getContext('2d');
        this.mouse = {
            x: -1e4,
            y: -1e4
        };
        this.parallax = {
            x: 0,
            y: 0
        };
        this.parallaxTarget = {
            x: 0,
            y: 0
        };
        this.lastTime = 0;

        this.particles = [];
        this.isLight = false;
        this.resize();
        this.initParticles();
        this.bind();
        this.updateTheme();

        requestAnimationFrame(t => this.loop(t));
    }

    initParticles() {
        this.particles.length = 0;
        this.adjustParticleCount();
    }

    adjustParticleCount() {
        const C = CanvasEffects;
        const factor = Math.min(this.cssW, this.cssH) / 600;
        const target = Math.round(
            Math.min(C.PARTICLE_COUNT_MAX, Math.max(15, C.PARTICLE_COUNT_BASE * factor))
        );

        while (this.particles.length < target) {
            this.particles.push(this.createParticle());
        }
        this.particles.length = target;
    }

    createParticle() {
        const C = CanvasEffects;
        return {
            x: Math.random(),
            y: Math.random(),
            vx: (Math.random() - 0.5) * C.PARTICLE_SPEED,
            vy: (Math.random() - 0.5) * C.PARTICLE_SPEED,
            size: C.PARTICLE_SIZE_MIN + Math.random() * (C.PARTICLE_SIZE_MAX - C.PARTICLE_SIZE_MIN),
            opacity: 0.1 + Math.random() * C.PARTICLE_OPACITY
        };
    }

    updateParticles(dt) {
        for (const p of this.particles) {
            p.x += p.vx * dt;
            p.y += p.vy * dt;

            if (p.x < 0) p.x = 1;
            else if (p.x > 1) p.x = 0;

            if (p.y < 0) p.y = 1;
            else if (p.y > 1) p.y = 0;
        }

        const C = CanvasEffects;
        this.parallax.x += (this.parallaxTarget.x - this.parallax.x) * C.PARALLAX_SMOOTHING;
        this.parallax.y += (this.parallaxTarget.y - this.parallax.y) * C.PARALLAX_SMOOTHING;
    }

    draw() {
        const ctx = this.ctx;
        const C = CanvasEffects;
        const w = this.cssW;
        const h = this.cssH;
        const mx = this.mouse.x;
        const my = this.mouse.y;
        const px = this.parallax.x;
        const py = this.parallax.y;

        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);

        ctx.lineWidth = C.LINE_WIDTH;
        ctx.lineCap = 'round';

        const effectRadiusSq = C.EFFECT_RADIUS ** 2;
        const lineDistSq = this.lineDistance ** 2;

        const getIntensity = (x, y) => {
            const dx = x - mx;
            const dy = y - my;
            const d2 = dx * dx + dy * dy;
            if (d2 > effectRadiusSq) return 0;
            return (1 - Math.sqrt(d2) / C.EFFECT_RADIUS) ** 2;
        };

        for (let i = 0; i < this.particles.length; i++) {
            const a = this.particles[i];
            const ax = a.x * w + px;
            const ay = a.y * h + py;

            for (let j = i + 1; j < this.particles.length; j++) {
                const b = this.particles[j];
                const bx = b.x * w + px;
                const by = b.y * h + py;

                const dx = ax - bx;
                const dy = ay - by;
                const d2 = dx * dx + dy * dy;

                if (d2 > lineDistSq) continue;

                const proximity = 1 - Math.sqrt(d2) / this.lineDistance;
                const intensity = getIntensity((ax + bx) * 0.5, (ay + by) * 0.5);

                ctx.globalAlpha = proximity * C.LINE_OPACITY;

                if (intensity > 0) {
                    const blue = Math.round(136 + intensity * 119);
                    ctx.strokeStyle = `rgb(${136 - intensity * 80}, ${136 - intensity * 50}, ${blue})`;
                } else {
                    ctx.strokeStyle = this.isLight ? '#aaa' : '#888';
                }

                ctx.beginPath();
                ctx.moveTo(ax, ay);
                ctx.lineTo(bx, by);
                ctx.stroke();
            }
        }

        for (const p of this.particles) {
            const particleX = p.x * w + px;
            const particleY = p.y * h + py;
            const intensity = getIntensity(particleX, particleY);

            ctx.globalAlpha = p.opacity;

            if (intensity > 0) {
                const other = Math.round(255 - intensity * 100);
                ctx.fillStyle = `rgb(${other}, ${other}, 255)`;
            } else {
                ctx.fillStyle = this.isLight ? '#333' : '#fff';
            }

            ctx.beginPath();
            ctx.arc(particleX, particleY, p.size, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.globalAlpha = 1;
    }

    loop(now) {
        const dt = Math.min(0.05, (now - this.lastTime) / 1000 || 0);
        this.lastTime = now;

        this.updateParticles(dt);
        this.draw();

        requestAnimationFrame(t => this.loop(t));
    }

    resize() {
        const C = CanvasEffects;

        this.dpr = Math.min(devicePixelRatio || 1, 2);
        this.cssW = innerWidth;
        this.cssH = innerHeight;

        this.canvas.style.width = `${this.cssW}px`;
        this.canvas.style.height = `${this.cssH}px`;
        this.canvas.width = Math.floor(this.cssW * this.dpr);
        this.canvas.height = Math.floor(this.cssH * this.dpr);

        const factor = Math.min(this.cssW, this.cssH) / 600;
        this.lineDistance = Math.max(
            C.LINE_DISTANCE_MIN,
            C.LINE_DISTANCE_BASE * Math.min(1, factor * 0.8 + 0.2)
        );

        this.adjustParticleCount();
    }

    updateTheme() {
        this.isLight = document.documentElement.classList.contains('light');
    }

    bind() {
        addEventListener('resize', () => this.resize(), {
            passive: true
        });

        new MutationObserver(() => this.updateTheme()).observe(
            document.documentElement, {
                attributes: true,
                attributeFilter: ['class']
            }
        );

        addEventListener('pointermove', e => {
            this.mouse.x = e.clientX;
            this.mouse.y = e.clientY;

            const C = CanvasEffects;
            const centerX = this.cssW / 2;
            const centerY = this.cssH / 2;
            this.parallaxTarget.x = ((e.clientX - centerX) / centerX) * C.PARALLAX_STRENGTH;
            this.parallaxTarget.y = ((e.clientY - centerY) / centerY) * C.PARALLAX_STRENGTH;
        }, {
            passive: true
        });

        addEventListener('pointerleave', () => {
            this.mouse.x = this.mouse.y = -1e4;
        });
    }
}

function initTheme() {
    const toggle = document.getElementById('theme-toggle');
    const root = document.documentElement;

    toggle.addEventListener('click', e => {
        e.stopPropagation();
        root.classList.toggle('light');
        localStorage.setItem('theme', root.classList.contains('light') ? 'light' : 'dark');
    });
}

function getTagColor(tag) {
    let hash = 2166136261;
    for (let i = 0; i < tag.length; i++) {
        hash ^= tag.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    hash ^= hash >>> 16;
    hash = Math.imul(hash, 2246822507);
    hash ^= hash >>> 13;
    hash = Math.imul(hash, 3266489909);
    hash ^= hash >>> 16;
    const hue = Math.abs(hash) % 360;
    return `--tag-hue: ${hue}`;
}

const PROJECTS = [
  {
    title: "bloom",
    excerpt: "Hardware-accelerated image viewer",
    description:
      "A high-performance image viewer built in Rust that uses GPU acceleration for smooth, responsive rendering. The project explores modern graphics pipelines with wgpu and the iced GUI framework, with an emphasis on efficient panning, zooming, and shader-driven image processing.",
    tags: ["rust", "iced", "wgpu", "wgsl", "bytemuck", "wip"],
    github: "https://github.com/nnmarcoo/bloom",
    live: null,
    media: [
      "https://placehold.co/800x450/222/666?text=todo",
    ]
  },

  {
    title: "countdown",
    excerpt: "Wi-Fi enabled multiplexed 7-segment display",
    description:
      "An embedded systems project inspired by the Vsauce death clock, featuring 10-digit multiplexed 7-segment displays controlled over Wi-Fi. The system supports remote configuration and real-time updates to the physical display.",
    tags: ["esp32", "c++", "wi-fi", "gpio", "multiplexing", "wip"],
    github: "https://github.com/nnmarcoo/countdown",
    live: null,
    media: [
      "https://placehold.co/800x450/222/666?text=todo",
    ]
  },

  {
  title: "routr",
  excerpt: "Smart running route generator",
  description:
    "A web app that generates optimized running routes based on user input such as distance and location. Built with an interactive map UI to quickly produce clean loop routes for runners, focusing on usability, responsiveness, and practical route planning.",
  tags: ["react", "ts", "vite", "maplibre", "valhalla", "osm", "wip"],
  github: "https://github.com/nnmarcoo/routr",
  live: "https://nnmarcoo.github.io/routr/",
  media: [
    "https://placehold.co/800x450/222/666?text=todo"
  ]
},
  {
    title: 'todo',
    excerpt: 'todo',
    description: 'todo',
    tags: ['todo'],
    github: 'https://github.com/nnmarcoo',
    live: 'https://example.com',
    media: [
      "https://placehold.co/800x450/222/666?text=todo",
    ]
  }
];

let collapseExpandedProject = null;

function initProjects() {
    const container = document.querySelector('.project-list');
    const overlay = document.getElementById('project-overlay');
    const overlayCard = overlay.querySelector('.overlay-card');
    let activeProject = null;

    const buildOverlayContent = (project) => {
        overlayCard.innerHTML = `
            <button class="project-close" aria-label="Close">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </button>
            <div class="project-gallery">
                <div class="project-gallery-media"></div>
                <button class="gallery-nav gallery-prev">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="15 18 9 12 15 6"/>
                    </svg>
                </button>
                <button class="gallery-nav gallery-next">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="9 18 15 12 9 6"/>
                    </svg>
                </button>
                <div class="gallery-dots"></div>
            </div>
            <div class="project-details">
                <h2 class="project-title">${project.title}</h2>
                <p class="project-description">${project.description}</p>
                <div class="project-tags">
                    ${project.tags.map(tag => `<span class="project-tag" style="${getTagColor(tag)}">${tag}</span>`).join('')}
                </div>
                <div class="project-links">
                    <a href="${project.github}" target="_blank" class="project-link">
                        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
                        GitHub
                    </a>
                    ${project.live ? `
                    <a href="${project.live}" target="_blank" class="project-link secondary">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                            <polyline points="15 3 21 3 21 9"/>
                            <line x1="10" y1="14" x2="21" y2="3"/>
                        </svg>
                        link
                    </a>
                    ` : ''}
                </div>
            </div>
        `;
    };

    const setupGallery = (project) => {
        const mediaEl = overlayCard.querySelector('.project-gallery-media');
        const prevBtn = overlayCard.querySelector('.gallery-prev');
        const nextBtn = overlayCard.querySelector('.gallery-next');
        const dotsEl = overlayCard.querySelector('.gallery-dots');
        let currentIndex = 0;

        mediaEl.innerHTML = '';
        project.media.forEach(src => {
            if (src.endsWith('.mp4') || src.endsWith('.webm')) {
                const video = document.createElement('video');
                video.src = src;
                video.autoplay = true;
                video.loop = true;
                video.muted = true;
                video.playsInline = true;
                mediaEl.appendChild(video);
            } else {
                const img = document.createElement('img');
                img.src = src;
                img.alt = project.title;
                mediaEl.appendChild(img);
            }
        });

        const hasMultiple = project.media.length > 1;
        prevBtn.classList.toggle('hidden', !hasMultiple);
        nextBtn.classList.toggle('hidden', !hasMultiple);
        dotsEl.classList.toggle('hidden', !hasMultiple);

        dotsEl.innerHTML = '';
        project.media.forEach((_, i) => {
            const dot = document.createElement('button');
            dot.className = 'gallery-dot' + (i === 0 ? ' active' : '');
            dot.addEventListener('click', e => {
                e.stopPropagation();
                scrollTo(i);
            });
            dotsEl.appendChild(dot);
        });

        const updateDots = () => {
            dotsEl.querySelectorAll('.gallery-dot').forEach((dot, i) => {
                dot.classList.toggle('active', i === currentIndex);
            });
        };

        const scrollTo = (index) => {
            mediaEl.scrollLeft = index * mediaEl.offsetWidth;
            currentIndex = index;
            updateDots();
        };

        prevBtn.addEventListener('click', e => {
            e.stopPropagation();
            scrollTo(currentIndex > 0 ? currentIndex - 1 : project.media.length - 1);
        });

        nextBtn.addEventListener('click', e => {
            e.stopPropagation();
            scrollTo(currentIndex < project.media.length - 1 ? currentIndex + 1 : 0);
        });

        mediaEl.addEventListener('scroll', () => {
            const newIndex = Math.round(mediaEl.scrollLeft / mediaEl.offsetWidth);
            if (newIndex !== currentIndex) {
                currentIndex = newIndex;
                updateDots();
            }
        });
    };

    const expand = (project) => {
        activeProject = project;
        buildOverlayContent(project);
        setupGallery(project);
        overlay.classList.add('active');

        overlayCard.querySelector('.project-close').addEventListener('click', e => {
            e.stopPropagation();
            collapse();
        });
    };

    const collapse = () => {
        if (!activeProject) return;
        activeProject = null;
        overlay.classList.remove('active');
        overlay.addEventListener('transitionend', () => {
            overlayCard.innerHTML = '';
        }, { once: true });
    };

    collapseExpandedProject = collapse;

    PROJECTS.forEach((project) => {
        const card = document.createElement('div');
        card.className = 'project-card';
        card.innerHTML = `
            <div class="project-card-thumb">
                <img src="${project.media[0]}" alt="${project.title}">
            </div>
            <div class="project-card-info">
                <h3>${project.title}</h3>
                <p>${project.excerpt}</p>
            </div>
        `;
        container.appendChild(card);
        card.addEventListener('click', () => expand(project));
    });

    addEventListener('keydown', e => {
        if (e.key === 'Escape' && activeProject) collapse();
    });

    overlay.addEventListener('click', e => {
        if (e.target === overlay) collapse();
    });
}

function initNav() {
    const links = document.querySelectorAll('.nav-link');
    let transitioning = false;

    const show = id => {
        if (transitioning) return;

        const current = document.querySelector('.section.active');
        const target = document.getElementById(id);
        if (current === target || !target) return;

        document.title = `marco // ${id}`;
        links.forEach(l => l.classList.toggle('active', l.dataset.section === id));

        if (!current) {
            target.classList.add('active');
            return;
        }

        transitioning = true;
        current.classList.replace('active', 'exiting');

        current.addEventListener('animationend', () => {
            current.classList.remove('exiting');
            if (collapseExpandedProject) collapseExpandedProject();
            target.classList.add('active');
            transitioning = false;
        }, {
            once: true
        });
    };

    links.forEach(link => {
        link.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            const id = link.dataset.section;
            show(id);
            history.pushState(null, '', `#${id}`);
        });
    });

    show(location.hash.slice(1) || 'about');

    addEventListener('popstate', () => {
        show(location.hash.slice(1) || 'about');
    });
}

document.addEventListener('DOMContentLoaded', () => {
    new CanvasEffects('canvas');
    initTheme();
    initProjects();
    initNav();
});