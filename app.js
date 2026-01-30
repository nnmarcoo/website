class Portfolio {
    static FONT = '"Space Grotesk", sans-serif';
    static DURATION = 600;

    static EFFECT_RADIUS = 200;
    static WAVE_FREQ = 0.03;
    static DISPLACEMENT = 4;
    static CHROMA_SPLIT = 2;
    static CORE_RADIUS = 0.4;
    static CORE_BLOCK_MULT = 2.0;
    static CORRUPT_CHANCE = 0.5;
    static KNOCKOUT_CHANCE = 0.25;
    static SCRAMBLE_DIST = 8.0;
    static TINT_R = [0.2, 0.4, 1.0];
    static TINT_G = [0.3, 0.8, 1.0];
    static TINT_B = [0.5, 0.6, 1.0];
    static SCRAMBLE_TINT = [0.3, 0.5, 1.0];

    constructor(id, config) {
        this.canvas = document.getElementById(id);
        this.gl = this.canvas.getContext('webgl');
        if (!this.gl) return;

        this.config = config;

        // state
        this.section = null;
        this.trans = null;

        // projects
        this.projectImages = {};
        this.projectScroll = 0;
        this.projectScrollTarget = 0;

        // layout
        this.menuX = 0;
        this.menuY = 0;
        this.contentX = 1;
        this.contentY = 1;
        this.layoutDirty = true;

        // interaction
        this.mouse = {
            x: 0,
            y: 0
        };

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
        this.icons = {};

        this.initGL();
        this.resize();
        this.bind();
        Promise.all([this.loadIcons(), this.loadProjectImages()]).then(() => {
            this.layoutDirty = true;
            requestAnimationFrame(t => this.loop(t));
        });
    }

    // assets

    async loadIcons() {
        const iconPaths = new Set();
        for (const sec of Object.values(this.config.sections)) {
            for (const item of sec) {
                if (item.icon) iconPaths.add(item.icon);
            }
        }

        const promises = [...iconPaths].map(path => {
            return new Promise(resolve => {
                const img = new Image();
                img.onload = () => {
                    this.icons[path] = img;
                    resolve();
                };
                img.onerror = () => resolve();
                img.src = path;
            });
        });

        await Promise.all(promises);
    }

    async loadProjectImages() {
        const projects = this.config.sections.projects;
        if (!projects || !Array.isArray(projects)) return;

        const promises = projects.map(project => {
            if (!project.image) return Promise.resolve();
            return new Promise(resolve => {
                const img = new Image();
                img.onload = () => {
                    this.projectImages[project.image] = img;
                    resolve();
                };
                img.onerror = () => resolve();
                img.src = project.image;
            });
        });

        await Promise.all(promises);
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
      uniform float time,i,b,rad,dsp,spl,wfreq,coreRad,coreBlock,corruptChance,knockoutChance,scrambleDist;
      uniform vec3 tintR,tintG,tintB,scrambleTint;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }

      void main(){
        vec2 px = v * r;
        vec2 d = px - m;
        float dist = length(d);

        float f = dist / rad;
        float s = f >= 1.0 ? 0.0 : 1.0 - f * f * (3.0 - 2.0 * f);

        if (s <= 0.) {
          gl_FragColor = vec4(texture2D(t, v).rgb, 1.);
          return;
        }

        vec2 bl = (floor(px / b) + .5) * b / r;
        float dp = dsp * i;
        float sp = spl * i;
        float a = atan(d.y, d.x);
        float w = sin(dist * wfreq + time) * dp * s;
        vec2 dr = vec2(cos(a), sin(a));

        float R = texture2D(t, bl - dr * (w + sp * s) / r).r;
        float G = texture2D(t, bl - dr * w / r).g;
        float B = texture2D(t, bl - dr * (w - sp * s) / r).b;

        vec3 tinted = R * tintR + G * tintG + B * tintB;
        vec3 untinted = texture2D(t, v).rgb;
        vec3 col = mix(untinted, tinted, s * s);

        float coreRadius = rad * coreRad;
        if (dist < coreRadius) {
          vec2 blockCoord = floor(px / (b * coreBlock));
          float h = hash(blockCoord);
          float coreness = 1.0 - dist / coreRadius;

          if (h < corruptChance) {
            float reveal = coreness;
            if (h < knockoutChance) {
              col = mix(col, vec3(0.0), reveal);
            } else {
              vec2 scramble = (hash(blockCoord * 1.3) - 0.5) * b * scrambleDist / r;
              vec3 scrambled = texture2D(t, bl + scramble).rgb * scrambleTint;
              col = mix(col, scrambled, reveal);
            }
          }
        }

        gl_FragColor = vec4(col, 1.);
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

        this.posBuf = buf([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
        this.uvBuf = buf([0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 0]);

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
            r: u('r'),
            m: u('m'),
            time: u('time'),
            i: u('i'),
            b: u('b'),
            rad: u('rad'),
            dsp: u('dsp'),
            spl: u('spl'),
            wfreq: u('wfreq'),
            coreRad: u('coreRad'),
            coreBlock: u('coreBlock'),
            corruptChance: u('corruptChance'),
            knockoutChance: u('knockoutChance'),
            scrambleDist: u('scrambleDist'),
            tintR: u('tintR'),
            tintG: u('tintG'),
            tintB: u('tintB'),
            scrambleTint: u('scrambleTint')
        };
    }

    // transitions

    open(name) {
        if (this.trans || this.section === name) return;
        const type = this.section ? 2 : 0;
        this.trans = {
            type,
            from: this.section,
            to: name,
            start: performance.now()
        };
        if (name === 'projects') {
            this.projectScroll = 0;
            this.projectScrollTarget = 0;
        }
        if (type === 0) {
            this.section = name;
            this.buildItems();
        }
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
        return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    isPortrait() {
        return this.cssH > this.cssW;
    }

    update(now) {
        if (!this.trans) return;

        const t = Math.min(1, (now - this.trans.start) / Portfolio.DURATION);
        const e = this.ease(t);
        const mid = Math.abs(t - .5);

        this.intensity = 1 + this.ease(mid < .3 ? 1 - mid / .3 : 0) * 1.5;

        if (this.trans.type === 0) {
            this.menuX = e * .35;
            this.menuY = e * .35;
            this.contentX = 1 - e;
            this.contentY = 1 - e;
        } else if (this.trans.type === 1) {
            this.menuX = .35 * (1 - e);
            this.menuY = .35 * (1 - e);
            this.contentX = e;
            this.contentY = e;
            if (t >= .5 && this.section !== null) {
                this.section = null;
                this.buildItems();
            }
        } else {
            this.menuX = .35;
            this.menuY = .35;
            this.contentX = t < .5 ? this.ease(t * 2) : 1 - this.ease((t - .5) * 2);
            this.contentY = t < .5 ? this.ease(t * 2) : 1 - this.ease((t - .5) * 2);
            if (t >= .5 && this.section !== this.trans.to) {
                this.section = this.trans.to;
                this.buildItems();
            }
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

    isProjectGrid() {
        const sec = this.getActiveSection();
        if (sec !== 'projects') return false;
        const projects = this.config.sections.projects;
        return projects && projects.length > 0 && projects[0].image;
    }

    // layout

    buildItems() {
        const items = [{
            text: this.config.logo,
            size: 48,
            type: 0,
            act: () => this.close()
        }];

        this.config.menu.forEach(m =>
            items.push({
                text: m.text,
                size: 36,
                type: 1,
                section: m.section,
                act: () => this.open(m.section)
            })
        );

        const sec = this.getActiveSection();
        if (sec) {
            if (this.isProjectGrid()) {
                const projects = this.config.sections.projects;
                projects.forEach((project, i) => {
                    items.push({
                        type: 3,
                        subtype: 'grid-item',
                        image: project.image,
                        title: project.title,
                        description: project.description,
                        index: i,
                        size: 140,
                        w: 220,
                        href: project.href
                    });
                });
            } else {
                const sectionConfig = this.config.sections[sec];
                const isHorizontal = sectionConfig.some(c => c.icon);
                this.config.sections[sec].forEach(c => {
                    if (c.icon) {
                        items.push({
                            icon: c.icon,
                            size: c.size || 32,
                            width: c.width,
                            type: 2,
                            href: c.href,
                            horizontal: isHorizontal
                        });
                    } else {
                        items.push({
                            text: c.text,
                            segments: c.segments,
                            size: c.fontSize || 28,
                            type: 2,
                            href: c.href,
                            horizontal: isHorizontal
                        });
                    }
                });
            }
        }

        this.items = items.map(it => {
            if (it.icon) {
                const w = it.width || it.size;
                return {
                    ...it,
                    w
                };
            }
            if (it.type === 3) {
                return it;
            }
            this.ctx.font = `bold ${it.size}px ${Portfolio.FONT}`;
            const text = it.text || (it.segments ? it.segments.map(s => s.text).join('') : '');
            return {
                ...it,
                w: this.ctx.measureText(text).width
            };
        });

        this.menuItems = this.items.filter(i => i.type === 1);
        this.contentItems = this.items.filter(i => i.type === 2 || i.type === 3);
    }

    pos(it) {
        const W = this.cssW;
        const H = this.cssH;
        const portrait = this.isPortrait();

        if (it.type === 0)
            return {
                x: 40,
                y: 50 - it.size / 2,
                rx: 40 + it.w / 2,
                ry: 50
            };

        if (it.type === 1) {
            const i = this.menuItems.indexOf(it);
            if (portrait) {
                const x = W / 2;
                const logoBottom = 50 + 24 + 40;
                const menuHeight = this.menuItems.length * 50;
                const baseY = logoBottom + menuHeight / 2;
                const y = baseY - this.menuItems.length * 25 + 25 + i * 50 - this.menuY * (baseY - 50);
                return {
                    x: x - it.w / 2,
                    y: y - it.size / 2,
                    rx: x,
                    ry: y
                };
            } else {
                const y = H / 2 - this.menuItems.length * 30 + 30 + i * 60;
                const t = this.menuX / .35;
                const centerX = W / 2 - this.menuX * W;
                const leftX = 40 + it.w / 2;
                const x = centerX + (leftX - centerX) * t;
                return {
                    x: x - it.w / 2,
                    y: y - it.size / 2,
                    rx: x,
                    ry: y
                };
            }
        }

        const i = this.contentItems.indexOf(it);
        const isHorizontal = it.horizontal;

        const menuRightEdge = 200;
        const contentCenterX = menuRightEdge + (W - menuRightEdge) / 2;

        if (isHorizontal) {
            const totalWidth = this.contentItems.reduce((sum, c) => sum + c.w, 0);
            const gap = 40;
            const totalWithGaps = totalWidth + (this.contentItems.length - 1) * gap;
            let offsetX = 0;
            for (let j = 0; j < i; j++) {
                offsetX += this.contentItems[j].w + gap;
            }
            const startX = -totalWithGaps / 2 + it.w / 2;

            if (portrait) {
                const x = W / 2 + startX + offsetX;
                const baseY = H * .75;
                const y = baseY + this.contentY * H * .4;
                return {
                    x: x - it.w / 2,
                    y: y - it.size / 2,
                    rx: x,
                    ry: y
                };
            } else {
                const baseX = contentCenterX;
                const x = baseX + startX + offsetX + this.contentX * W * .5;
                const y = H / 2;
                return {
                    x: x - it.w / 2,
                    y: y - it.size / 2,
                    rx: x,
                    ry: y
                };
            }
        }

        if (it.type === 3) {
            return this.posGrid(it, W, H, portrait, contentCenterX);
        }

        if (portrait) {
            const x = W / 2;
            const baseY = H * .75;
            const y = baseY - this.contentItems.length * 20 + 20 + i * 40 + this.contentY * H * .4;
            return {
                x: x - it.w / 2,
                y: y - it.size / 2,
                rx: x,
                ry: y
            };
        } else {
            const y = H / 2 - this.contentItems.length * 25 + 25 + i * 50;
            const x = contentCenterX + this.contentX * W;
            return {
                x: x - it.w / 2,
                y: y - it.size / 2,
                rx: x,
                ry: y
            };
        }
    }

    posGrid(it, W, H, portrait, contentCenterX) {
        const baseX = portrait ? W / 2 : contentCenterX;

        const itemW = it.w;
        const itemH = it.size;
        const gap = 30;
        const titleH = 60;

        const gridItems = this.contentItems.filter(c => c.subtype === 'grid-item');
        const count = gridItems.length;

        const availW = portrait ? W - 60 : (W - 200) * 0.8;
        const maxCols = Math.max(1, Math.floor((availW + gap) / (itemW + gap)));
        const cols = Math.max(1, Math.min(maxCols, Math.ceil(Math.sqrt(count))));
        const rows = Math.ceil(count / cols);

        const idx = it.index;
        const col = idx % cols;
        const row = Math.floor(idx / cols);

        const gridW = cols * itemW + (cols - 1) * gap;
        const gridH = rows * (itemH + titleH + gap) - gap;

        let startY;
        if (portrait) {
            const logoBottom = 50 + 24 + 40;
            const menuBottom = logoBottom + this.menuItems.length * 50 + 30;
            startY = menuBottom + itemH / 2;
        } else {
            const availableH = H - 80;
            if (gridH > availableH) {
                startY = 40 + itemH / 2;
            } else {
                const baseY = H / 2;
                startY = baseY - gridH / 2 + itemH / 2;
            }
        }

        const startX = baseX - gridW / 2 + itemW / 2;
        const baseItemX = startX + col * (itemW + gap);
        const transX = this.contentX * (W - baseItemX + itemW);

        const x = baseItemX + transX;
        const y = startY + row * (itemH + titleH + gap) - this.projectScroll;

        return {
            x: x - itemW / 2,
            y: y - itemH / 2,
            rx: x,
            ry: y
        };
    }

    // hit detection

    hit(e) {
        if (!this.items.length) this.buildItems();

        return this.items.find(it => {
            if (it.type === 0 && !this.section) return false;
            if (!it.act && !it.href) return false;

            const p = this.pos(it);
            const left = p.rx - it.w / 2;
            const right = p.rx + it.w / 2;
            const top = p.ry - it.size / 2;
            const bottom = p.ry + it.size / 2;

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
            if (it.type === 3) {
                this.drawGridItem(ctx, it, p);
            } else if (it.icon && this.icons[it.icon]) {
                const iconW = it.width || it.size;
                ctx.drawImage(this.icons[it.icon], p.rx - iconW / 2, p.ry - it.size / 2, iconW, it.size);
            } else if (it.segments) {
                ctx.font = `bold ${it.size}px ${Portfolio.FONT}`;
                ctx.textAlign = 'left';
                let offsetX = 0;
                for (const seg of it.segments) {
                    ctx.fillStyle = seg.color || '#fff';
                    ctx.fillText(seg.text, p.x + offsetX, p.ry);
                    offsetX += ctx.measureText(seg.text).width;
                }
                ctx.textAlign = 'center';
            } else if (it.text) {
                ctx.font = `bold ${it.size}px ${Portfolio.FONT}`;
                if (it.section && this.highlightPos !== null) {
                    const idx = this.menuItems.indexOf(it);
                    const dist = Math.abs(idx - this.highlightPos);
                    const h = Math.max(0, 1 - dist);
                    const r = Math.round(255 - (255 - 51) * h);
                    const g = Math.round(255 - (255 - 102) * h);
                    ctx.fillStyle = `rgb(${r},${g},255)`;
                } else {
                    ctx.fillStyle = '#fff';
                }
                ctx.fillText(it.text, p.rx, p.ry);
                ctx.fillStyle = '#fff';
            }
        }
    }

    drawGridItem(ctx, it, p) {
        const img = this.projectImages[it.image];
        const w = it.w;
        const h = it.size;
        const leftX = p.rx - w / 2;

        if (img) {
            ctx.drawImage(img, leftX, p.ry - h / 2, w, h);
        } else {
            ctx.strokeStyle = '#3366ff';
            ctx.lineWidth = 2;
            ctx.strokeRect(leftX, p.ry - h / 2, w, h);
        }

        ctx.textAlign = 'left';
        if (it.title) {
            ctx.fillStyle = '#fff';
            ctx.font = `bold 18px ${Portfolio.FONT}`;
            ctx.fillText(it.title, leftX, p.ry + h / 2 + 22);
        }

        if (it.description) {
            ctx.fillStyle = '#888';
            ctx.font = `14px ${Portfolio.FONT}`;
            ctx.fillText(it.description, leftX, p.ry + h / 2 + 44);
        }
        ctx.textAlign = 'center';
    }

    loop(now) {
        const dt = (now - this.lastTime) / 1000 || 0;
        this.lastTime = now;
        this.time += dt;

        this.projectScroll += (this.projectScrollTarget - this.projectScroll) * 0.15;

        const targetIdx = this.menuItems.findIndex(it => it.section === this.section);
        if (targetIdx >= 0) {
            if (this.highlightPos === null || this.highlightPos === undefined) {
                this.highlightPos = targetIdx;
            } else {
                this.highlightPos += (targetIdx - this.highlightPos) * 0.02;
            }
        } else {
            this.highlightPos = null;
        }

        this.update(now);

        if (this.layoutDirty && !this.trans) {
            this.buildItems();
            this.layoutDirty = false;
        }

        let minD = Infinity;
        let sz = 36;
        for (const it of this.items) {
            const p = this.pos(it);
            if (it.type === 3) {
                const imgBottom = p.ry + it.size / 2;
                if (this.mouse.y > imgBottom) {
                    const textD = Math.hypot(this.mouse.x - p.rx, this.mouse.y - (imgBottom + 30));
                    if (textD < minD) {
                        minD = textD;
                        sz = 14;
                    }
                } else {
                    const d = Math.hypot(this.mouse.x - p.rx, this.mouse.y - p.ry);
                    if (d < minD) {
                        minD = d;
                        sz = it.size;
                    }
                }
            } else {
                const d = Math.hypot(this.mouse.x - p.rx, this.mouse.y - p.ry);
                if (d < minD) {
                    minD = d;
                    sz = it.size;
                }
            }
        }
        this.block += (Math.max(2, Math.min(6, sz / 12)) - this.block) * .1;

        const hovering = this.hit({
            clientX: this.mouse.x,
            clientY: this.mouse.y
        });
        this.canvas.style.cursor = hovering ? 'pointer' : 'default';

        this.draw();

        const gl = this.gl;
        gl.bindTexture(gl.TEXTURE_2D, this.tex);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.offscreen);

        const P = Portfolio;
        gl.useProgram(this.pg);
        gl.uniform2f(this.loc.r, this.canvas.width, this.canvas.height);
        gl.uniform2f(this.loc.m, this.mouse.x * this.dpr, this.mouse.y * this.dpr);
        gl.uniform1f(this.loc.time, this.time);
        gl.uniform1f(this.loc.i, this.intensity);
        gl.uniform1f(this.loc.b, this.block);
        gl.uniform1f(this.loc.rad, P.EFFECT_RADIUS * this.dpr);
        gl.uniform1f(this.loc.dsp, P.DISPLACEMENT);
        gl.uniform1f(this.loc.spl, P.CHROMA_SPLIT);
        gl.uniform1f(this.loc.wfreq, P.WAVE_FREQ);
        gl.uniform1f(this.loc.coreRad, P.CORE_RADIUS);
        gl.uniform1f(this.loc.coreBlock, P.CORE_BLOCK_MULT);
        gl.uniform1f(this.loc.corruptChance, P.CORRUPT_CHANCE);
        gl.uniform1f(this.loc.knockoutChance, P.KNOCKOUT_CHANCE);
        gl.uniform1f(this.loc.scrambleDist, P.SCRAMBLE_DIST);
        gl.uniform3fv(this.loc.tintR, P.TINT_R);
        gl.uniform3fv(this.loc.tintG, P.TINT_G);
        gl.uniform3fv(this.loc.tintB, P.TINT_B);
        gl.uniform3fv(this.loc.scrambleTint, P.SCRAMBLE_TINT);

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

        if (this.section === 'projects') {
            const maxScroll = this.getMaxProjectScroll();
            this.projectScrollTarget = Math.min(this.projectScrollTarget, maxScroll);
            this.projectScroll = Math.min(this.projectScroll, maxScroll);
        }
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

        this.canvas.addEventListener('wheel', e => {
            if (this.section === 'projects' && !this.trans) {
                e.preventDefault();
                const maxScroll = this.getMaxProjectScroll();
                this.projectScrollTarget = Math.max(0, Math.min(maxScroll, this.projectScrollTarget + e.deltaY));
            }
        }, {
            passive: false
        });

        let touchStartY = 0;
        let touchStartScroll = 0;

        this.canvas.addEventListener('touchstart', e => {
            if (this.section === 'projects' && !this.trans) {
                touchStartY = e.touches[0].clientY;
                touchStartScroll = this.projectScrollTarget;
            }
        }, {
            passive: true
        });

        this.canvas.addEventListener('touchmove', e => {
            if (this.section === 'projects' && !this.trans) {
                e.preventDefault();
                const deltaY = touchStartY - e.touches[0].clientY;
                const maxScroll = this.getMaxProjectScroll();
                this.projectScrollTarget = Math.max(0, Math.min(maxScroll, touchStartScroll + deltaY));
            }
        }, {
            passive: false
        });
    }

    getMaxProjectScroll() {
        if (!this.isProjectGrid()) return 0;

        const gridItems = this.contentItems.filter(c => c.subtype === 'grid-item');
        if (gridItems.length === 0) return 0;

        const it = gridItems[0];
        const itemH = it.size;
        const titleH = 60;
        const gap = 30;
        const itemW = it.w;
        const W = this.cssW;
        const H = this.cssH;
        const portrait = this.isPortrait();

        const availW = portrait ? W - 60 : (W - 200) * 0.8;
        const maxCols = Math.max(1, Math.floor((availW + gap) / (itemW + gap)));
        const cols = Math.max(1, Math.min(maxCols, Math.ceil(Math.sqrt(gridItems.length))));
        const rows = Math.ceil(gridItems.length / cols);

        const gridH = rows * (itemH + titleH + gap) - gap;

        let availableH;
        if (portrait) {
            const logoBottom = 50 + 24 + 40;
            const menuBottom = logoBottom + this.menuItems.length * 50 + 30;
            availableH = H - menuBottom - 40;
        } else {
            availableH = H - 80;
        }

        return Math.max(0, gridH - availableH);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new Portfolio('canvas', {
        logo: 'marco',
        menu: [{
                text: 'about',
                section: 'about'
            },
            {
                text: 'projects',
                section: 'projects'
            },

            {
                text: 'contact',
                section: 'contact'
            },
            {
                text: 'blog',
                section: 'blog'
            },
        ],
        sections: {
            about: [{
                    segments: [{
                            text: 'I build things that are '
                        },
                        {
                            text: 'useful',
                            color: '#3366ff'
                        },
                        {
                            text: '.'
                        }
                    ]
                },
                {
                    text: 'Sometimes I just build things.'
                }
            ],
            projects: [{
                    image: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyODAiIGhlaWdodD0iMTgwIiB2aWV3Qm94PSIwIDAgMjgwIDE4MCI+PHJlY3QgZmlsbD0iIzExMSIgd2lkdGg9IjI4MCIgaGVpZ2h0PSIxODAiLz48dGV4dCB4PSIxNDAiIHk9IjkwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjMzM2NmZmIiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC1zaXplPSIyNCIgZm9udC13ZWlnaHQ9ImJvbGQiPlByb2plY3QgMTwvdGV4dD48L3N2Zz4=',
                    title: 'todo',
                    description: 'todo',
                    href: 'https://github.com/nnmarcoo'
                },
                {
                    image: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyODAiIGhlaWdodD0iMTgwIiB2aWV3Qm94PSIwIDAgMjgwIDE4MCI+PHJlY3QgZmlsbD0iIzExMSIgd2lkdGg9IjI4MCIgaGVpZ2h0PSIxODAiLz48dGV4dCB4PSIxNDAiIHk9IjkwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjMzM2NmZmIiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC1zaXplPSIyNCIgZm9udC13ZWlnaHQ9ImJvbGQiPlByb2plY3QgMjwvdGV4dD48L3N2Zz4=',
                    title: 'todo',
                    description: 'todo',
                    href: 'https://github.com/nnmarcoo'
                },
                {
                    image: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyODAiIGhlaWdodD0iMTgwIiB2aWV3Qm94PSIwIDAgMjgwIDE4MCI+PHJlY3QgZmlsbD0iIzExMSIgd2lkdGg9IjI4MCIgaGVpZ2h0PSIxODAiLz48dGV4dCB4PSIxNDAiIHk9IjkwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjMzM2NmZmIiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC1zaXplPSIyNCIgZm9udC13ZWlnaHQ9ImJvbGQiPlByb2plY3QgMzwvdGV4dD48L3N2Zz4=',
                    title: 'todo',
                    description: 'todo',
                    href: 'https://github.com/nnmarcoo'
                },
                {
                    image: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyODAiIGhlaWdodD0iMTgwIiB2aWV3Qm94PSIwIDAgMjgwIDE4MCI+PHJlY3QgZmlsbD0iIzExMSIgd2lkdGg9IjI4MCIgaGVpZ2h0PSIxODAiLz48dGV4dCB4PSIxNDAiIHk9IjkwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjMzM2NmZmIiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC1zaXplPSIyNCIgZm9udC13ZWlnaHQ9ImJvbGQiPlByb2plY3QgNDwvdGV4dD48L3N2Zz4=',
                    title: 'todo',
                    description: 'todo',
                    href: 'https://github.com/nnmarcoo'
                }
            ],
            contact: [{
                    icon: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0id2hpdGUiPjxwYXRoIGQ9Ik0xMiAwQzUuMzcgMCAwIDUuMzcgMCAxMmMwIDUuMzEgMy40MzUgOS43OTUgOC4yMDUgMTEuMzg1LjYuMTA1LjgyNS0uMjU1LjgyNS0uNTcgMC0uMjg1LS4wMTUtMS4yMy0uMDE1LTIuMjM1LTMuMDE1LjU1NS0zLjc5NS0uNzM1LTQuMDM1LTEuNDEtLjEzNS0uMzQ1LS43Mi0xLjQxLTEuMjMtMS42OTUtLjQyLS4yMjUtMS4wMi0uNzgtLjAxNS0uNzk1Ljk0NS0uMDE1IDEuNjIuODcgMS44NDUgMS4yMyAxLjA4IDEuODE1IDIuODA1IDEuMzA1IDMuNDk1Ljk5LjEwNS0uNzguNDItMS4zMDUuNzY1LTEuNjA1LTIuNjctLjMtNS40Ni0xLjMzNS01LjQ2LTUuOTI1IDAtMS4zMDUuNDY1LTIuMzg1IDEuMjMtMy4yMjUtLjEyLS4zLS41NC0xLjUzLjEyLTMuMTggMCAwIDEuMDA1LS4zMTUgMy4zIDEuMjMuOTYtLjI3IDEuOTgtLjQwNSAzLS40MDVzMi4wNC4xMzUgMyAuNDA1YzIuMjk1LTEuNTYgMy4zLTEuMjMgMy4zLTEuMjMuNjYgMS42NS4yNCAyLjg4LjEyIDMuMTguNzY1Ljg0IDEuMjMgMS45MDUgMS4yMyAzLjIyNSAwIDQuNjA1LTIuODA1IDUuNjI1LTUuNDc1IDUuOTI1LjQzNS4zNzUuODEgMS4wOTUuODEgMi4yMiAwIDEuNjA1LS4wMTUgMi44OTUtLjAxNSAzLjMgMCAuMzE1LjIyNS42OS44MjUuNTdBMTIuMDIgMTIuMDIgMCAwIDAgMjQgMTJjMC02LjYzLTUuMzctMTItMTItMTJ6Ii8+PC9zdmc+',
                    size: 36,
                    href: 'https://github.com/nnmarcoo'
                },
                {
                    icon: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0id2hpdGUiPjxwYXRoIGQ9Ik0yMC40NDcgMjAuNDUyaC0zLjU1NHYtNS41NjljMC0xLjMyOC0uMDI3LTMuMDM3LTEuODUyLTMuMDM3LTEuODUzIDAtMi4xMzYgMS40NDUtMi4xMzYgMi45Mzl2NS42NjdIOS4zNTFWOWgzLjQxNHYxLjU2MWguMDQ2Yy40NzctLjkgMS42MzctMS44NSAzLjM3LTEuODUgMy42MDEgMCA0LjI2NyAyLjM3IDQuMjY3IDUuNDU1djYuMjg2ek01LjMzNyA3LjQzM2EyLjA2MiAyLjA2MiAwIDAgMS0yLjA2My0yLjA2NSAyLjA2NCAyLjA2NCAwIDEgMSAyLjA2MyAyLjA2NXptMS43ODIgMTMuMDE5SDMuNTU1VjloMy41NjR2MTEuNDUyek0yMi4yMjUgMEgxLjc3MUMuNzkyIDAgMCAuNzc0IDAgMS43Mjl2MjAuNTQyQzAgMjMuMjI3Ljc5MiAyNCAxLjc3MSAyNGgyMC40NTFDMjMuMiAyNCAyNCAyMy4yMjcgMjQgMjIuMjcxVjEuNzI5QzI0IC43NzQgMjMuMiAwIDIyLjIyMiAwaC4wMDN6Ii8+PC9zdmc+',
                    size: 36,
                    href: 'https://www.linkedin.com/in/marco-todorov'
                },
                {
                    icon: 'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz48c3ZnIGlkPSJEaXNjb3JkLUxvZ28iIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgdmlld0JveD0iMCAwIDEyNi42NDQgOTYiPjxkZWZzPjxzdHlsZT4uY2xzLTF7ZmlsbDojZmZmO308L3N0eWxlPjwvZGVmcz48cGF0aCBpZD0iRGlzY29yZC1TeW1ib2wtV2hpdGUiIGNsYXNzPSJjbHMtMSIgZD0iTTgxLjE1LDBjLTEuMjM3NiwyLjE5NzMtMi4zNDg5LDQuNDcwNC0zLjM1OTEsNi43OTQtOS41OTc1LTEuNDM5Ni0xOS4zNzE4LTEuNDM5Ni0yOC45OTQ1LDAtLjk4NS0yLjMyMzYtMi4xMjE2LTQuNTk2Ny0zLjM1OTEtNi43OTQtOS4wMTY2LDEuNTQwNy0xNy44MDU5LDQuMjQzMS0yNi4xNDA1LDguMDU2OEMyLjc3OSwzMi41MzA0LTEuNjkxNCw1Ni4zNzI1LjUzMTIsNzkuODg2M2M5LjY3MzIsNy4xNDc2LDIwLjUwODMsMTIuNjAzLDMyLjA1MDUsMTYuMDg4NCwyLjYwMTQtMy40ODU0LDQuODk5OC03LjE5ODEsNi44Njk4LTExLjA2MjMtMy43MzgtMS4zODkxLTcuMzQ5Ny0zLjEzMTgtMTAuODA5OC01LjE1MjMuOTA5Mi0uNjU2NywxLjc5MzItMS4zMzg2LDIuNjUxOS0xLjk5NTMsMjAuMjgxLDkuNTQ3LDQzLjc2OTYsOS41NDcsNjQuMDc1OCwwLC44NTg3LjcwNzIsMS43NDI3LDEuMzg5MSwyLjY1MTksMS45OTUzLTMuNDYwMSwyLjA0NTctNy4wNzE4LDMuNzYzMi0xMC44MzUsNS4xNzc2LDEuOTcsMy44NjQyLDQuMjY4Myw3LjU3NjksNi44Njk4LDExLjA2MjMsMTEuNTQxOS0zLjQ4NTQsMjIuMzc2OS04LjkxNTYsMzIuMDUwOS0xNi4wNjMxLDIuNjI2LTI3LjI3NzEtNC40OTYtNTAuOTE3Mi0xOC44MTctNzEuODU0OEM5OC45ODExLDQuMjY4NCw5MC4xOTE4LDEuNTY1OSw4MS4xNzUyLjA1MDVsLS4wMjUyLS4wNTA1Wk00Mi4yODAyLDY1LjQxNDRjLTYuMjM4MywwLTExLjQxNTktNS42NTc1LTExLjQxNTktMTIuNjUzNXM0Ljk3NTUtMTIuNjc4OCwxMS4zOTA3LTEyLjY3ODgsMTEuNTE2OSw1LjcwOCwxMS40MTU5LDEyLjY3ODhjLS4xMDEsNi45NzA4LTUuMDI2LDEyLjY1MzUtMTEuMzkwNywxMi42NTM1Wk04NC4zNTc2LDY1LjQxNDRjLTYuMjYzNywwLTExLjM5MDctNS42NTc1LTExLjM5MDctMTIuNjUzNXM0Ljk3NTUtMTIuNjc4OCwxMS4zOTA3LTEyLjY3ODgsMTEuNDkxNyw1LjcwOCwxMS4zOTA2LDEyLjY3ODhjLS4xMDEsNi45NzA4LTUuMDI2LDEyLjY1MzUtMTEuMzkwNiwxMi42NTM1WiIvPjwvc3ZnPg==',
                    size: 36,
                    width: 47,
                    href: 'https://discord.com/users/nnmarco'
                }
            ],
            blog: [{
                    text: 'todo',
                },
                {
                    text: 'todo',
                },
                {
                    text: 'todo',
                },
                {
                    text: 'todo',
                },
                {
                    text: 'todo',
                },
                {
                    text: 'todo',
                },
                {
                    text: 'todo',
                }
            ]
        }
    });
});