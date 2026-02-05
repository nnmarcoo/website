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
        this.parallax = { x: 0, y: 0 };
        this.parallaxTarget = { x: 0, y: 0 };
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
            document.documentElement,
            { attributes: true, attributeFilter: ['class'] }
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

/* Theme Toggle */

function initTheme() {
    const toggle = document.getElementById('theme-toggle');
    const root = document.documentElement;

    toggle.addEventListener('click', () => {
        root.classList.toggle('light');
        localStorage.setItem('theme', root.classList.contains('light') ? 'light' : 'dark');
    });
}

/* Navigation */

function initNav() {
    const links = document.querySelectorAll('.nav-link');
    let transitioning = false;

    const show = id => {
        if (transitioning) return;

        const current = document.querySelector('.section.active');
        const target = document.getElementById(id);
        if (current === target || !target) return;

        links.forEach(l => l.classList.toggle('active', l.dataset.section === id));

        if (!current) {
            target.classList.add('active');
            return;
        }

        transitioning = true;
        current.classList.replace('active', 'exiting');

        current.addEventListener('animationend', () => {
            current.classList.remove('exiting');
            target.classList.add('active');
            transitioning = false;
        }, {
            once: true
        });
    };

    links.forEach(link => {
        link.addEventListener('click', e => {
            e.preventDefault();
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
    initNav();
});