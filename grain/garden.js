(() => {
  "use strict";
  const TAU = Math.PI * 2;
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function glowSprite() {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, "rgba(255,249,232,0.85)");
    gradient.addColorStop(0.18, "rgba(255,249,232,0.32)");
    gradient.addColorStop(0.5, "rgba(255,249,232,0.08)");
    gradient.addColorStop(1, "rgba(255,249,232,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
    return canvas;
  }

  window.MothGarden = class MothGarden {
    constructor(canvas, { params, engine }) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d", { alpha: false });
      this.params = params;
      this.engine = engine;
      this.motion = true;
      this.time = 0;
      this.last = 0;
      this.w = 1;
      this.h = 1;
      this.dpr = 1;
      this.energy = 0;
      this.beamX = 1;
      this.sparks = [];
      this.grainCount = 0;
      this.glow = glowSprite();
      this.resize();
      this.createScene();
      this._resizeFrame = 0;
      this._onResize = () => {
        if (this._resizeFrame) cancelAnimationFrame(this._resizeFrame);
        this._resizeFrame = requestAnimationFrame(() => this.resize());
      };
      window.addEventListener("resize", this._onResize);
      this.loop = this.loop.bind(this);
      requestAnimationFrame(this.loop);
    }

    resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.w = w;
      this.h = h;
      this.dpr = dpr;
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.canvas.style.width = `${w}px`;
      this.canvas.style.height = `${h}px`;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (this.moths) {
        for (const moth of this.moths) {
          moth.x = clamp(moth.x, -40, w + 40);
          moth.y = clamp(moth.y, -40, h + 40);
          moth.trail.length = 0;
        }
      }
    }

    createScene() {
      const kinds = ["daisy", "daisy", "bell", "daisy", "seed", "fern", "grass"];
      this.flowers = Array.from({ length: 34 }, (_, i) => {
        const random = mulberry32(900 + i * 37);
        const kind = kinds[Math.floor(random() * kinds.length)];
        const edge = i < 2 || i > 31;
        const u = edge
          ? i < 2
            ? 0.015 + i * 0.035
            : 0.955 + (i - 32) * 0.025
          : 0.045 + random() * 0.91;
        const depth = random();
        const tall = kind === "fern" || kind === "grass";
        return {
          kind,
          u,
          depth,
          height:
            (tall ? 0.13 + random() * 0.2 : 0.08 + random() * 0.17) *
            (0.8 + depth * 0.45),
          lean: (random() - 0.5) * 30,
          phase: random() * TAU,
          sway: 2 + random() * 8,
          petals: 5 + Math.floor(random() * 4),
          bloom: 10 + random() * 11,
          alpha: 0.34 + depth * 0.6,
          pulse: 0,
        };
      }).sort((a, b) => a.depth - b.depth);

      this.blades = Array.from({ length: 170 }, (_, i) => {
        const random = mulberry32(4100 + i * 19);
        return {
          u: random(),
          depth: random(),
          height: 0.02 + random() * 0.07,
          lean: (random() - 0.5) * 26,
          phase: random() * TAU,
          alpha: 0.12 + random() * 0.3,
        };
      }).sort((a, b) => a.depth - b.depth);

      this.stars = Array.from({ length: 130 }, (_, i) => {
        const random = mulberry32(7100 + i * 13);
        return {
          x: random(),
          y: random() * 0.72,
          r: 0.35 + random() * 1.1,
          phase: random() * TAU,
          depth: random(),
        };
      });

      this.pollen = Array.from({ length: 190 }, (_, i) => {
        const random = mulberry32(2600 + i * 23);
        return {
          x: random() * this.w,
          y: random() * this.h,
          depth: random(),
          phase: random() * TAU,
          drift: (random() - 0.5) * 8,
        };
      });

      const blooms = this.flowers.filter(
        (flower) => flower.kind !== "fern" && flower.kind !== "grass",
      );
      this.moths = Array.from({ length: 12 }, (_, i) => {
        const random = mulberry32(5200 + i * 71);
        const home = blooms[i % blooms.length];
        return {
          home,
          depth: random(),
          size: 1.7 + random() * 1.1,
          phase: random() * TAU,
          orbit: 0.5 + random() * 1.2,
          orbitSpeed: 0.3 + random() * 0.65,
          seed: random() * 90,
          x: 0,
          y: 0,
          vx: 0,
          vy: 0,
          angle: 0,
          alpha: 0,
          flap: random() * TAU,
          trail: [],
        };
      }).sort((a, b) => a.depth - b.depth);
    }

    setMotion(on) {
      this.motion = !!on;
    }

    _sway(flower) {
      const speed = clamp(this.params.speed, 0.25, 2);
      const density = clamp(this.params.density / 60, 0, 1);
      return (
        Math.sin(this.time * (0.85 + speed * 0.55) + flower.phase) *
        flower.sway *
        (0.45 + density * 0.8) *
        (0.5 + flower.depth * 0.7)
      );
    }

    _bloomPoint(flower) {
      const sway = this._sway(flower);
      const baseY = this.h * (1 + flower.depth * 0.02);
      const size = clamp(this.params.size, 24, 480) / 480;
      return {
        x: flower.u * this.w + flower.lean * 0.6 + sway,
        y: baseY - flower.height * this.h,
        baseY,
        sway,
        radius: flower.bloom * (0.9 + size * 0.45) * (1 + flower.pulse * 0.2),
      };
    }

    _lit(x) {
      return Math.exp(-Math.pow((x - this.beamX) / (this.w * 0.16), 2));
    }

    burst(x, y) {
      if (!this.motion) return;
      for (let i = 0; i < 24; i++) {
        const angle = Math.random() * TAU;
        const speed = 18 + Math.random() * 68;
        this.sparks.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0.5 + Math.random() * 0.9,
          max: 1.4,
        });
      }
      if (this.sparks.length > 260) this.sparks.splice(0, this.sparks.length - 260);
    }

    grain(grain) {
      this.grainCount++;
      if (!this.motion || this.grainCount % 4 !== 0) return;
      if (this.sparks.length > 200) return;
      this.sparks.push({
        x: (grain.start + grain.span / 2) * this.w,
        y: this.h * (0.56 + Math.random() * 0.36),
        vx: (Math.random() - 0.5) * 7,
        vy: -(5 + Math.random() * 24),
        life: 0.45 + Math.random() * 0.8,
        max: 1.25,
      });
    }

    pulse(velocity) {
      const blooms = this.flowers.filter(
        (flower) => flower.kind !== "fern" && flower.kind !== "grass",
      );
      for (const flower of blooms) {
        const lit = this._lit(flower.u * this.w);
        flower.pulse = Math.max(
          flower.pulse,
          lit * velocity * 1.3 + velocity * 0.18,
        );
      }
      if (!this.motion) return;
      const count = 5 + Math.round(velocity * 8);
      for (let i = 0; i < count; i++) {
        this.sparks.push({
          x: this.beamX + (Math.random() - 0.5) * 26,
          y: this.h * (0.6 + Math.random() * 0.3),
          vx: (Math.random() - 0.5) * 18,
          vy: -(10 + Math.random() * 36),
          life: 0.6 + Math.random() * 0.9,
          max: 1.5,
        });
      }
    }

    loop(ts) {
      const now = ts / 1000;
      if (!this.last) this.last = now;
      const real = Math.min(0.05, Math.max(0.001, now - this.last));
      this.last = now;
      const params = this.params;
      const running = this.engine && this.engine.running;
      let scale = 0.2 + clamp(params.speed, 0.25, 2) * 0.48;
      if (running) scale *= 1.15;
      if (params.freeze) scale *= 0.04;
      if (!this.motion) scale = 0;
      this.time += real * scale;
      this.update(real * scale, real);
      this.draw();
      requestAnimationFrame(this.loop);
    }

    update(mdt, real) {
      const params = this.params;
      const mod = this.engine ? this.engine.mod : null;
      const targetEnergy = this.engine ? this.engine.energy : 0;
      this.energy += (targetEnergy - this.energy) * Math.min(1, real * 4);
      this.modTone = mod ? mod.tone : params.tone;
      this.modSpace = mod ? mod.space : params.space;
      this.beamX =
        this.w *
        (0.04 + clamp(mod ? mod.position : params.position, 0, 1) * 0.92);
      const density = clamp(params.density / 60, 0, 1);
      const speed = clamp(params.speed, 0.25, 2);
      const width = clamp(mod ? mod.width : params.width, 0, 1);
      const spray = clamp(params.spray, 0, 1);
      const scatter = clamp(params.scatter, 0, 100) / 100;
      const pitch = clamp(
        (params.pitch + (mod ? mod.pitch : 0)) / 24,
        -1,
        1,
      );

      for (const flower of this.flowers) {
        flower.pulse *= Math.exp(-real * 2.4);
      }

      if (mdt > 0) {
        for (const mote of this.pollen) {
          mote.y -= (2 + mote.depth * 9 + speed * 8) * mdt * (0.4 + mote.depth);
          mote.x +=
            Math.sin(this.time * 0.42 + mote.phase) * 5 * mdt +
            mote.drift * mdt;
          if (mote.y < -14) {
            mote.y = this.h + 8;
            mote.x = Math.random() * this.w;
          }
          if (mote.x < -14) mote.x = this.w + 10;
          else if (mote.x > this.w + 14) mote.x = -10;
        }
      }

      const activeCount = 1 + Math.round(density * 11);
      for (let i = 0; i < this.moths.length; i++) {
        const moth = this.moths[i];
        const targetAlpha = i < activeCount ? 1 : 0;
        moth.alpha += (targetAlpha - moth.alpha) * Math.min(1, real * 3.5);
        if (moth.alpha < 0.015) continue;
        const bloom = this._bloomPoint(moth.home);
        const orbitRadius =
          (9 + moth.orbit * 24 + width * 48) * (0.7 + moth.depth * 0.7);
        const wobble = 1 + spray * 1.8;
        const tx =
          bloom.x +
          Math.cos(this.time * moth.orbitSpeed + moth.phase) *
            orbitRadius *
            wobble +
          Math.sin(this.time * 0.31 + moth.seed) * 24 * spray +
          (this.beamX - bloom.x) * 0.16;
        const ty =
          bloom.y -
          this.h * (0.05 + moth.depth * 0.045) -
          Math.max(0, pitch) * this.h * 0.18 +
          Math.sin(this.time * moth.orbitSpeed * 1.27 + moth.phase) *
            orbitRadius *
            0.5 *
            wobble +
          pitch * this.h * 0.02;
        if (!moth.x) {
          moth.x = tx;
          moth.y = ty;
        }
        moth.vx += (tx - moth.x) * 2.6 * mdt;
        moth.vy += (ty - moth.y) * 2.6 * mdt;
        const damping = Math.exp(-2.4 * mdt);
        moth.vx *= damping;
        moth.vy *= damping;
        moth.x += moth.vx * mdt;
        moth.y += moth.vy * mdt;
        const direction = Math.atan2(moth.vy, moth.vx) + Math.PI / 2;
        const turn = Math.atan2(
          Math.sin(direction - moth.angle),
          Math.cos(direction - moth.angle),
        );
        moth.angle += turn * Math.min(1, mdt * 5);
        moth.flap +=
          mdt *
          (5 + density * 15 + speed * 5) *
          (0.8 + scatter * 0.7) *
          (0.75 + 0.25 * Math.sin(moth.seed));
        if (mdt > 0) {
          moth.trail.push({ x: moth.x, y: moth.y });
          if (moth.trail.length > 10) moth.trail.shift();
        }
      }

      if (mdt > 0) {
        for (let i = this.sparks.length - 1; i >= 0; i--) {
          const spark = this.sparks[i];
          spark.x += spark.vx * mdt;
          spark.y += spark.vy * mdt;
          spark.vy += 16 * mdt;
          spark.life -= real * 1.15;
          if (spark.life <= 0) this.sparks.splice(i, 1);
        }
      }
    }

    draw() {
      const ctx = this.ctx;
      const w = this.w;
      const h = this.h;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#050505";
      ctx.fillRect(0, 0, w, h);
      this.drawSky();
      this.drawHills();
      this.drawBeam(false);
      for (const blade of this.blades) this.drawBlade(blade);
      for (const flower of this.flowers) this.drawFlower(flower);
      this.drawBeam(true);
      this.drawPollen();
      for (const moth of this.moths) this.drawMoth(moth);
      this.drawSparks();
      this.drawVignette();
    }

    drawSky() {
      const ctx = this.ctx;
      const w = this.w;
      const h = this.h;
      const params = this.params;
      const tone = clamp(this.modTone, 0, 1);
      const moonX = w * 0.77;
      const moonY = h * 0.19;
      const radius = Math.min(w, h) * 0.34;

      const haze = ctx.createRadialGradient(
        moonX,
        moonY,
        0,
        moonX,
        moonY,
        radius,
      );
      haze.addColorStop(0, `rgba(248,243,230,${0.055 + tone * 0.05})`);
      haze.addColorStop(0.45, "rgba(248,243,230,0.016)");
      haze.addColorStop(1, "rgba(248,243,230,0)");
      ctx.fillStyle = haze;
      ctx.fillRect(0, 0, w, h);

      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.1 + tone * 0.1 + this.energy * 0.12;
      ctx.drawImage(this.glow, moonX - 190, moonY - 190, 380, 380);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";

      ctx.beginPath();
      ctx.arc(moonX, moonY, 24, 0, TAU);
      const disc = ctx.createRadialGradient(
        moonX - 8,
        moonY - 9,
        2,
        moonX,
        moonY,
        25,
      );
      disc.addColorStop(0, "rgba(250,246,235,0.26)");
      disc.addColorStop(0.65, "rgba(250,246,235,0.12)");
      disc.addColorStop(1, "rgba(250,246,235,0.05)");
      ctx.fillStyle = disc;
      ctx.fill();
      ctx.strokeStyle = "rgba(246,241,229,0.24)";
      ctx.lineWidth = 0.7;
      ctx.stroke();

      const craters = [
        [-7, -4, 3.2],
        [6, 7, 4.4],
        [9, -6, 2.4],
      ];
      ctx.fillStyle = "rgba(5,5,5,0.18)";
      for (const [dx, dy, radius] of craters) {
        ctx.beginPath();
        ctx.arc(moonX + dx, moonY + dy, radius, 0, TAU);
        ctx.fill();
      }

      for (const star of this.stars) {
        const twinkle =
          0.35 +
          0.65 *
            (0.5 +
              0.5 *
                Math.sin(this.time * (0.3 + star.depth * 0.5) + star.phase));
        const alpha =
          (0.09 + star.depth * 0.38) *
          twinkle *
          (0.7 + this.energy * 0.5);
        ctx.fillStyle = `rgba(244,240,228,${alpha})`;
        ctx.fillRect(star.x * w, star.y * h, star.r, star.r);
      }

      const bottom = ctx.createLinearGradient(0, h * 0.52, 0, h);
      bottom.addColorStop(0, "rgba(244,240,228,0)");
      bottom.addColorStop(
        1,
        `rgba(244,240,228,${0.012 + clamp(this.modSpace, 0, 1) * 0.035})`,
      );
      ctx.fillStyle = bottom;
      ctx.fillRect(0, h * 0.52, w, h * 0.48);
    }

    drawHills() {
      const ctx = this.ctx;
      const w = this.w;
      const h = this.h;
      for (let layer = 0; layer < 2; layer++) {
        ctx.beginPath();
        ctx.moveTo(0, h);
        ctx.lineTo(0, h * (0.85 + layer * 0.04));
        for (let x = 0; x <= w; x += w / 28) {
          const y =
            h *
            (0.85 +
              layer * 0.04 +
              Math.sin(x * 0.004 + layer * 2.3) * 0.012 +
              Math.sin(x * 0.0016 + layer) * 0.01);
          ctx.lineTo(x, y);
        }
        ctx.lineTo(w, h);
        ctx.closePath();
        ctx.fillStyle = layer ? "#070707" : "#090909";
        ctx.fill();
      }
    }

    drawBlade(blade) {
      const ctx = this.ctx;
      const w = this.w;
      const h = this.h;
      const density = clamp(this.params.density / 60, 0, 1);
      const sway =
        Math.sin(this.time * 1.3 + blade.phase) *
        (2 + density * 5) *
        (0.4 + blade.depth);
      const baseX = blade.u * w;
      const baseY = h * (1 + blade.depth * 0.02);
      const tipX = baseX + blade.lean * 0.4 + sway;
      const tipY = baseY - blade.height * h;
      ctx.beginPath();
      ctx.moveTo(baseX, baseY);
      ctx.quadraticCurveTo(baseX + blade.lean * 0.2, (baseY + tipY) / 2, tipX, tipY);
      ctx.strokeStyle = `rgba(236,232,220,${blade.alpha * 0.65})`;
      ctx.lineWidth = 0.45 + blade.depth * 0.5;
      ctx.stroke();
    }

    drawBeam(lineOnly) {
      const ctx = this.ctx;
      const w = this.w;
      const h = this.h;
      const params = this.params;
      const x = this.beamX;
      const half = w * (0.028 + clamp(params.spray, 0, 1) * 0.15) + 24;
      if (!lineOnly) {
        const band = ctx.createLinearGradient(x - half, 0, x + half, 0);
        band.addColorStop(0, "rgba(255,249,232,0)");
        band.addColorStop(
          0.5,
          `rgba(255,249,232,${0.018 + clamp(this.modTone, 0, 1) * 0.022})`,
        );
        band.addColorStop(1, "rgba(255,249,232,0)");
        ctx.fillStyle = band;
        ctx.fillRect(x - half, 0, half * 2, h);

        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.09 + clamp(this.modTone, 0, 1) * 0.1;
        ctx.drawImage(this.glow, x - 120, h * 0.72 - 120, 240, 240);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
      } else {
        const line = ctx.createLinearGradient(0, h * 0.06, 0, h);
        line.addColorStop(0, "rgba(255,249,232,0)");
        line.addColorStop(
          0.4,
          `rgba(255,249,232,${0.045 + clamp(this.modTone, 0, 1) * 0.04})`,
        );
        line.addColorStop(
          0.9,
          `rgba(255,249,232,${0.14 + clamp(this.modTone, 0, 1) * 0.1})`,
        );
        line.addColorStop(1, "rgba(255,249,232,0.02)");
        ctx.beginPath();
        ctx.moveTo(x, h * 0.06);
        ctx.lineTo(x, h * 0.98);
        ctx.strokeStyle = line;
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }
    }

    drawFlower(flower) {
      const ctx = this.ctx;
      const bloom = this._bloomPoint(flower);
      const lit = this._lit(bloom.x);
      const alpha =
        flower.alpha * (0.5 + lit * 0.6) * (0.85 + this.energy * 0.35);
      if (alpha < 0.015) return;
      const stroke = `rgba(240,235,223,${alpha})`;
      const dim = `rgba(240,235,223,${alpha * 0.5})`;
      const baseX = flower.u * this.w;
      const baseY = bloom.baseY;

      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = 0.5 + flower.depth * 0.5;
      ctx.beginPath();
      ctx.moveTo(baseX, baseY);
      ctx.quadraticCurveTo(
        baseX + flower.lean * 0.25 + bloom.sway * 0.35,
        (baseY + bloom.y) / 2,
        bloom.x,
        bloom.y,
      );
      ctx.strokeStyle = stroke;
      ctx.stroke();

      if (flower.kind !== "grass" && flower.kind !== "fern") {
        this.drawLeaf(baseX, baseY, bloom, 0.34, 1, dim);
        this.drawLeaf(baseX, baseY, bloom, 0.56, -1, dim);
      }

      const radius = bloom.radius;
      ctx.save();
      ctx.translate(bloom.x, bloom.y);

      if (flower.kind === "daisy") {
        for (let i = 0; i < flower.petals; i++) {
          const angle =
            (i / flower.petals) * TAU +
            flower.phase * 0.35 +
            this.time * 0.03;
          ctx.save();
          ctx.rotate(angle);
          ctx.beginPath();
          ctx.ellipse(
            radius * 0.62,
            0,
            radius * 0.52,
            radius * 0.18,
            0,
            0,
            TAU,
          );
          ctx.fillStyle = "#060606";
          ctx.fill();
          ctx.strokeStyle = stroke;
          ctx.lineWidth = 0.6;
          ctx.stroke();
          ctx.restore();
        }
        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.19, 0, TAU);
        ctx.fillStyle = `rgba(250,245,232,${0.55 * alpha + 0.1})`;
        ctx.fill();
      } else if (flower.kind === "bell") {
        ctx.rotate(bloom.sway * 0.004);
        ctx.beginPath();
        ctx.moveTo(-radius * 0.55, 0);
        ctx.bezierCurveTo(
          -radius * 0.72,
          radius * 0.9,
          radius * 0.72,
          radius * 0.9,
          radius * 0.55,
          0,
        );
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 0.7;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-radius * 0.55, 0);
        ctx.quadraticCurveTo(-radius * 0.22, radius * 0.2, 0, 0);
        ctx.quadraticCurveTo(radius * 0.22, radius * 0.2, radius * 0.55, 0);
        ctx.strokeStyle = dim;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, radius * 0.55);
        ctx.strokeStyle = dim;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, radius * 0.55, 1.1, 0, TAU);
        ctx.fillStyle = `rgba(250,245,232,${0.6 * alpha})`;
        ctx.fill();
      } else if (flower.kind === "seed") {
        for (let i = 0; i < 11; i++) {
          const angle = -Math.PI / 2 + (i / 10 - 0.5) * 2.7;
          const length = radius * (0.75 + (i % 3) * 0.13);
          const x = Math.cos(angle) * length;
          const y = Math.sin(angle) * length;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(x, y);
          ctx.strokeStyle = dim;
          ctx.lineWidth = 0.5;
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(x, y, 0.9, 0, TAU);
          ctx.fillStyle = `rgba(250,245,232,${0.5 * alpha})`;
          ctx.fill();
        }
      } else if (flower.kind === "fern") {
        for (let i = 0; i < 7; i++) {
          const t = 0.2 + i * 0.11;
          const side = i % 2 ? 1 : -1;
          const leaf = radius * (0.55 - i * 0.04);
          ctx.beginPath();
          ctx.ellipse(
            side * leaf * 0.7,
            -radius * t,
            leaf,
            radius * 0.16,
            side * 0.6,
            0,
            TAU,
          );
          ctx.strokeStyle = dim;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      } else {
        for (let i = 0; i < 7; i++) {
          const angle = -Math.PI / 2 + (i / 6 - 0.5) * 1.7;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(
            Math.cos(angle) * radius * 1.1,
            Math.sin(angle) * radius * 1.1,
          );
          ctx.strokeStyle = dim;
          ctx.lineWidth = 0.45;
          ctx.stroke();
        }
      }

      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = clamp(
        (0.1 + lit * 0.5 + this.energy * 0.25) * alpha,
        0,
        1,
      );
      ctx.drawImage(
        this.glow,
        -radius * 1.9,
        -radius * 1.9,
        radius * 3.8,
        radius * 3.8,
      );
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      ctx.restore();
    }

    drawLeaf(baseX, baseY, bloom, t, side, color) {
      const ctx = this.ctx;
      const x = baseX + (bloom.x - baseX) * t;
      const y = baseY + (bloom.y - baseY) * t;
      const length = 9 + Math.abs(bloom.radius) * 0.7;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(
        x + side * length * 0.65,
        y - length * 0.55,
        x + side * length,
        y - length * 0.05,
      );
      ctx.quadraticCurveTo(
        x + side * length * 0.45,
        y + length * 0.22,
        x,
        y,
      );
      ctx.fillStyle = "#060606";
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.55;
      ctx.stroke();
    }

    drawPollen() {
      const ctx = this.ctx;
      const params = this.params;
      const count = Math.round(
        20 + clamp(params.density / 60, 0, 1) * 150,
      );
      const size = clamp(params.size, 24, 480) / 480;
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < count; i++) {
        const mote = this.pollen[i];
        const lit = this._lit(mote.x);
        const alpha = clamp(
          (0.1 + mote.depth * 0.42) *
            (0.5 + lit * 0.9) *
            (0.65 + this.energy * 0.5),
          0,
          1,
        );
        const radius = (0.4 + size * 1.5) * (0.5 + mote.depth * 0.85);
        ctx.fillStyle = `rgba(250,246,235,${alpha})`;
        ctx.beginPath();
        ctx.arc(mote.x, mote.y, radius, 0, TAU);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
    }

    drawMoth(moth) {
      if (moth.alpha < 0.02) return;
      const ctx = this.ctx;
      const params = this.params;
      const lit = this._lit(moth.x);
      const scale =
        moth.size *
        (0.82 + (clamp(params.size, 24, 480) / 480) * 0.5) *
        (0.78 + moth.depth * 0.4);
      const spread = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(moth.flap));
      const alpha = moth.alpha;
      const wingAlpha = clamp(
        0.34 + lit * 0.38 + this.energy * 0.3,
        0,
        1,
      );

      if (moth.trail.length > 1) {
        ctx.beginPath();
        for (let i = 0; i < moth.trail.length; i++) {
          const point = moth.trail[i];
          if (i === 0) ctx.moveTo(point.x, point.y);
          else ctx.lineTo(point.x, point.y);
        }
        ctx.strokeStyle = `rgba(240,236,225,${0.07 * alpha})`;
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }

      ctx.save();
      ctx.translate(moth.x, moth.y);
      ctx.rotate(moth.angle);

      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = clamp(
        (0.08 + clamp(this.modTone, 0, 1) * 0.14 + this.energy * 0.28) * alpha,
        0,
        1,
      );
      ctx.drawImage(
        this.glow,
        -scale * 7,
        -scale * 7,
        scale * 14,
        scale * 14,
      );
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      ctx.scale(scale, scale);

      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(0, -2.4);
        ctx.bezierCurveTo(
          side * 3 * spread,
          -8,
          side * 12 * spread,
          -13,
          side * 20 * spread,
          -7,
        );
        ctx.bezierCurveTo(
          side * 16 * spread,
          -1,
          side * 7 * spread,
          2.5,
          0,
          2.2,
        );
        ctx.closePath();
        ctx.fillStyle = "rgba(26,25,21,0.82)";
        ctx.fill();
        ctx.strokeStyle = `rgba(242,238,226,${wingAlpha * alpha})`;
        ctx.lineWidth = 0.55;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(0, 2.4);
        ctx.bezierCurveTo(side * 3, 5.5, side * 7, 9.5, side * 4.6, 10.4);
        ctx.bezierCurveTo(side * 2.2, 10.4, side * 0.5, 7, 0, 4.6);
        ctx.closePath();
        ctx.fillStyle = "rgba(22,21,18,0.8)";
        ctx.fill();
        ctx.stroke();

        ctx.strokeStyle = `rgba(242,238,226,${wingAlpha * alpha * 0.24})`;
        ctx.lineWidth = 0.45;
        ctx.beginPath();
        ctx.moveTo(0, -0.5);
        ctx.quadraticCurveTo(side * 9 * spread, -8, side * 17 * spread, -7.5);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, 1);
        ctx.lineTo(side * 13 * spread, -1.5);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, 4);
        ctx.lineTo(side * 5, 8.6);
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.moveTo(0, -3.8);
      ctx.quadraticCurveTo(-1.15, -1, -0.65, 4.6);
      ctx.quadraticCurveTo(0, 6.4, 0.65, 4.6);
      ctx.quadraticCurveTo(1.15, -1, 0, -3.8);
      ctx.closePath();
      ctx.fillStyle = `rgba(246,242,230,${0.62 * alpha})`;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(0, -4.2, 0.8, 0, TAU);
      ctx.fillStyle = `rgba(246,242,230,${0.72 * alpha})`;
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(-0.5, -4.6);
      ctx.quadraticCurveTo(-2.5, -7.5, -3.4, -9);
      ctx.moveTo(0.5, -4.6);
      ctx.quadraticCurveTo(2.5, -7.5, 3.4, -9);
      ctx.strokeStyle = `rgba(246,242,230,${0.55 * alpha})`;
      ctx.lineWidth = 0.4;
      ctx.stroke();

      ctx.restore();
    }

    drawSparks() {
      const ctx = this.ctx;
      ctx.globalCompositeOperation = "lighter";
      for (const spark of this.sparks) {
        const alpha = clamp(spark.life / spark.max, 0, 1);
        ctx.strokeStyle = `rgba(255,249,232,${alpha * 0.55})`;
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(spark.x, spark.y);
        ctx.lineTo(spark.x - spark.vx * 0.018, spark.y - spark.vy * 0.018);
        ctx.stroke();
        ctx.fillStyle = `rgba(255,249,232,${alpha * 0.5})`;
        ctx.beginPath();
        ctx.arc(spark.x, spark.y, 0.8, 0, TAU);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
    }

    drawVignette() {
      const ctx = this.ctx;
      const w = this.w;
      const h = this.h;
      const gradient = ctx.createRadialGradient(
        w / 2,
        h / 2,
        Math.min(w, h) * 0.32,
        w / 2,
        h / 2,
        Math.max(w, h) * 0.76,
      );
      gradient.addColorStop(0, "rgba(0,0,0,0)");
      gradient.addColorStop(1, "rgba(0,0,0,0.55)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);
    }
  };
})();
