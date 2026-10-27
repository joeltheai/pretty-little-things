(() => {
  "use strict";
  const TAU = Math.PI * 2;
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const spring = (value) => ({ value, velocity: 0 });
  // Exact critically damped response: continuous position and velocity at any frame rate.
  function follow(body, target, dt, frequency = 4) {
    const offset = body.value - target;
    const impulse = (body.velocity + frequency * offset) * dt;
    const decay = Math.exp(-frequency * dt);
    body.value = target + (offset + impulse) * decay;
    body.velocity = (body.velocity - frequency * impulse) * decay;
  }
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

  window.SoundGarden = class SoundGarden {
    constructor({ canvas, rainCanvas, fireworksCanvas, state, motion }) {
      this.canvas = canvas;
      this.garden = canvas.getContext("2d");
      this.rainCanvas = rainCanvas;
      this.rain = rainCanvas.getContext("2d");
      this.fireworksCanvas = fireworksCanvas;
      this.sky = fireworksCanvas.getContext("2d");
      this.state = state;
      this.motion = motion;
      this.width = this.height = 1;
      this.time = 0;
      this.sceneSeed = Math.random() * 100000;
      this.controls = {};
      [
        "voices",
        "detune",
        "morph",
        "sub",
        "sustain",
        "tone",
        "resonance",
      ].forEach((key) => {
        this.controls[key] = spring(state[key]);
      });
      this.energy = Array.from({ length: 7 }, () => spring(0));
      this.pulses = Array(7).fill(0);
      this.field = spring(0);
      this.storm = spring(0);
      this.rainActivity = 0;
      this.rainAmount = 0;
      this.drops = [];
      this.fireworks = [];
      this.plants = this.createPlants();
      const grassCount = 900;
      this.grass = Array.from({ length: grassCount }, (_, i) => ({
        u: (i + this.random(i + 900)) / grassCount,
        depth: this.random(i + 1100) ** 1.6 * 1660 - 160,
        height: 18 + this.random(i + 1300) * 58,
        phase: this.random(i + 1500) * TAU,
        lean: this.random(i + 1700) * 2 - 1,
      })).sort((a, b) => b.depth - a.depth);
    }

    random(index) {
      const value = Math.sin(index * 127.1 + this.sceneSeed) * 43758.5453;
      return value - Math.floor(value);
    }

    createPlants() {
      const heroes = [
        "cosmos",
        "daisy",
        "poppy",
        "seedhead",
        "bell",
        "daisy",
        "cosmos",
      ];
      const anchors = [0.035, 0.155, 0.31, 0.49, 0.68, 0.845, 0.97];
      const understory = [
        "fern",
        "reed",
        "sprig",
        "fern",
        "seedhead",
        "reed",
        "cosmos",
        "sprig",
        "fern",
        "reed",
        "sprig",
        "poppy",
        "bell",
      ];
      const wildflowers = Array.from(
        { length: 56 },
        (_, i) => ["cosmos", "daisy", "poppy", "bell", "seedhead"][i % 5],
      );
      return [...heroes, ...understory, ...wildflowers]
        .map((kind, i) => {
          const r = (n) => this.random(i * 47 + n + 20);
          const hero = i < heroes.length;
          const meadow = i >= heroes.length + understory.length;
          const patch = i - heroes.length - understory.length;
          const row = Math.floor(patch / 14);
          const baseHeight = hero
            ? i === 0 || i === 6
              ? 310
              : 170 + r(1) * 150
            : meadow
              ? 90 + r(1) * 120 + (r(15) < 0.28 ? 140 + r(16) * 60 : 0)
              : 100 + r(1) * 160;
          const baseRadius = meadow ? 20 + r(2) * 30 : 32 + r(2) * 24;
          const pitch = (kind === "poppy" ? 0.55 : -0.25) + (r(3) - 0.5) * 0.75;
          return {
            kind,
            group: i % 7,
            u: hero
              ? anchors[i]
              : meadow
                ? (((patch % 14) + 0.1 + r(4) * 0.8) / 14 + row * 0.017) % 1
                : (i - heroes.length + 0.2 + r(4) * 0.6) / understory.length,
            depth: hero
              ? 40 + r(5) * 210
              : meadow
                ? [-40, 260, 650, 1100][row] + r(5) * 190
                : 280 + r(5) * 1250,
            baseHeight,
            baseRadius,
            height: spring(baseHeight * (0.88 + (this.state.sub / 100) * 0.42)),
            radius: spring(baseRadius * (0.9 + this.state.sustain * 0.25)),
            swayX: spring(0),
            swayZ: spring(0),
            pitch: spring(pitch),
            yaw: spring((r(6) - 0.5) * 1.5),
            basePitch: pitch,
            baseYaw: (r(6) - 0.5) * 1.5,
            roll: (r(7) - 0.5) * 1.5,
            phase: r(8) * TAU,
            frequency: 1.05 + r(9) * 0.7,
            lean: (r(10) - 0.5) * 0.24,
            petals:
              kind === "daisy"
                ? 8 + Math.floor(r(11) * 4)
                : kind === "poppy"
                  ? 4
                  : 5 + Math.floor(r(11) * 2),
            width:
              kind === "daisy"
                ? 0.14 + r(12) * 0.09
                : kind === "poppy"
                  ? 0.55 + r(12) * 0.2
                  : 0.34 + r(12) * 0.13,
            cup: kind === "poppy" ? 0.68 : kind === "cosmos" ? 0.28 : 0.12,
            leafYaw: r(13) * TAU,
            age: r(14),
          };
        })
        .sort((a, b) => b.depth - a.depth);
    }

    resize(width, height, dpr) {
      const oldWidth = this.width,
        oldHeight = this.height;
      this.width = width;
      this.height = height;
      this.focal = height * 0.95;
      this.cameraDistance = 620;
      this.cameraHeight = (this.cameraDistance * 0.32) / 0.95;
      this.horizon = height * 0.66;
      this.worldScale = clamp(width / 1000, 0.58, 1);
      const grassLimit = Math.min(this.grass.length, Math.ceil(width * 0.7));
      this.visibleGrass = Array.from(
        { length: grassLimit },
        (_, i) => this.grass[Math.floor((i / grassLimit) * this.grass.length)],
      );
      [this.canvas, this.rainCanvas, this.fireworksCanvas].forEach((canvas) => {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        canvas.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);
      });
      this.drops.forEach((drop) => {
        drop.x *= width / oldWidth;
        drop.y *= height / oldHeight;
      });
    }

    setMotion(enabled) {
      this.motion = enabled;
      if (!enabled) {
        this.drops.length = 0;
        this.fireworks.length = 0;
        this.rainAmount = 0;
        this.rainActivity = 0;
        this.rain.clearRect(0, 0, this.width, this.height);
        this.sky.clearRect(0, 0, this.width, this.height);
      }
    }

    noteOn(midi, velocity) {
      if (!this.motion) return;
      this.rainActivity = Math.min(10, this.rainActivity + velocity * 0.85);
      const group = midi % this.energy.length;
      this.pulses[group] = Math.min(1.6, this.pulses[group] + velocity * 0.55);
    }

    update(dt, levels) {
      if (!this.motion) return;
      this.time += dt;
      Object.entries(this.controls).forEach(([key, body]) =>
        follow(
          body,
          this.state[key],
          dt,
          key === "voices" ? 36 : key === "detune" ? 14 : 8,
        ),
      );
      const total = levels.reduce((sum, level) => sum + level, 0);
      const global = clamp(total * 0.6, 0, 1.7);
      follow(this.field, global, dt, 8);
      this.energy.forEach((body, i) => {
        const target = clamp(
          global * 0.42 + levels[i] * 0.85 + this.pulses[i] * 0.2,
          0,
          1.8,
        );
        follow(body, target, dt, 8);
        this.pulses[i] *= Math.exp(-dt * 1.5);
      });
      this.rainActivity *= Math.exp(-dt * 1.25);
      follow(
        this.storm,
        clamp(this.rainActivity * 0.36 + this.field.value * 0.55, 0, 1.8),
        dt,
        3,
      );
      const detune = Math.sqrt(this.controls.detune.value / 50);
      this.plants.forEach((plant) => {
        const energy = this.energy[plant.group].value;
        // Fixed-frequency waves share a wind field; changing sound never resets their phase.
        const wind =
          Math.sin(this.time * plant.frequency + plant.phase) * 0.65 +
          Math.sin(this.time * 1.8 + plant.phase * 1.7) * 0.22 +
          Math.sin(this.time * 0.55 + plant.u * 3) * 0.18;
        const force =
          (20 + detune * 30 + energy * 15) * (plant.baseHeight / 200);
        follow(
          plant.swayX,
          wind * force + this.storm.value * 8,
          dt,
          6.5 + plant.age * 2,
        );
        follow(
          plant.swayZ,
          Math.sin(this.time * 0.9 + plant.phase) *
            (9 + detune * 12 + energy * 4),
          dt,
          6,
        );
        follow(
          plant.height,
          plant.baseHeight *
            (0.88 + (this.controls.sub.value / 100) * 0.42 + energy * 0.065),
          dt,
          6,
        );
        follow(
          plant.radius,
          plant.baseRadius *
            (0.9 + this.controls.sustain.value * 0.25 + energy * 0.22),
          dt,
          8,
        );
        follow(
          plant.pitch,
          plant.basePitch +
            plant.swayX.value * 0.003 +
            Math.sin(this.time * 0.9 + plant.phase) * 0.085,
          dt,
          6,
        );
        follow(
          plant.yaw,
          plant.baseYaw +
            Math.sin(this.time * 0.7 + plant.phase) * 0.12 +
            plant.swayZ.value * 0.007,
          dt,
          6,
        );
      });
    }

    project(point) {
      const scale = this.focal / (this.cameraDistance + point[2]);
      return {
        x: this.width / 2 + point[0] * scale,
        y: this.horizon - (point[1] - this.cameraHeight) * scale,
        scale,
      };
    }

    fillBlack() {
      const ctx = this.garden;
      ctx.save();
      // Silhouettes always occlude, independently of depth/outline opacity.
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#000";
      ctx.fill();
      ctx.restore();
    }

    stroke(points, alpha, width = 0.8, closed = false, fill = false) {
      if (!points.length) return;
      const ctx = this.garden;
      ctx.beginPath();
      points.forEach((point, i) => {
        const p = this.project(point);
        if (i) ctx.lineTo(p.x, p.y);
        else ctx.moveTo(p.x, p.y);
      });
      if (closed) ctx.closePath();
      if (fill) this.fillBlack();
      ctx.strokeStyle = `rgba(255,255,255,${clamp(alpha * Math.sqrt(this.state.level / 100), 0, 0.9)})`;
      ctx.lineWidth = width;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.stroke();
    }

    mask(points) {
      const projected = points
        .map((point) => this.project(point))
        .sort((a, b) => a.x - b.x || a.y - b.y);
      const cross = (o, a, b) =>
        (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
      const lower = [],
        upper = [];
      projected.forEach((point) => {
        while (
          lower.length > 1 &&
          cross(lower.at(-2), lower.at(-1), point) <= 0
        )
          lower.pop();
        lower.push(point);
      });
      for (let i = projected.length - 1; i >= 0; i--) {
        const point = projected[i];
        while (
          upper.length > 1 &&
          cross(upper.at(-2), upper.at(-1), point) <= 0
        )
          upper.pop();
        upper.push(point);
      }
      const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
      if (hull.length < 3) return;
      const ctx = this.garden;
      ctx.beginPath();
      hull.forEach((point, i) => {
        if (i) ctx.lineTo(point.x, point.y);
        else ctx.moveTo(point.x, point.y);
      });
      ctx.closePath();
      this.fillBlack();
    }

    plantFrame(plant) {
      const scale = this.worldScale,
        h = plant.height.value * scale;
      const x =
        ((plant.u - 0.5) * this.width * (this.cameraDistance + plant.depth)) /
        this.focal;
      const at = (t) => [
        x + plant.lean * h * t + plant.swayX.value * scale * t * t,
        h * t,
        plant.depth + plant.swayZ.value * scale * t * t,
      ];
      const opacity =
        clamp(0.62 - plant.depth / 2400, 0.13, 0.6) +
        this.energy[plant.group].value * 0.065;
      return { at, h, scale, opacity, x };
    }

    headTransform(plant, center, point, pitchOffset = 0) {
      const roll = plant.roll,
        pitch = plant.pitch.value + pitchOffset,
        yaw = plant.yaw.value;
      const x = point[0] * Math.cos(roll) - point[1] * Math.sin(roll);
      const y = point[0] * Math.sin(roll) + point[1] * Math.cos(roll);
      const yy = y * Math.cos(pitch) - point[2] * Math.sin(pitch);
      const z = y * Math.sin(pitch) + point[2] * Math.cos(pitch);
      return [
        center[0] + x * Math.cos(yaw) + z * Math.sin(yaw),
        center[1] + yy,
        center[2] - x * Math.sin(yaw) + z * Math.cos(yaw),
      ];
    }

    leaf(origin, direction, width, phase, alpha) {
      const length = Math.hypot(direction[0], direction[1]);
      const across = [
        -direction[1] / length,
        direction[0] / length,
        Math.sin(phase) * 0.35,
      ];
      const points = [];
      for (let side = -1; side <= 1; side += 2) {
        for (let i = 0; i <= 8; i++) {
          const t = side < 0 ? i / 8 : 1 - i / 8;
          const bow = Math.sin(t * Math.PI) * width;
          points.push([
            origin[0] + direction[0] * t + across[0] * bow * side,
            origin[1] + direction[1] * t + across[1] * bow * side,
            origin[2] + direction[2] * t + bow * 0.3 + across[2] * bow * side,
          ]);
        }
      }
      this.stroke(points, alpha, 0.72, true, true);
      this.stroke(
        [
          origin,
          add(origin, [
            direction[0] * 0.85,
            direction[1] * 0.85,
            direction[2] * 0.85 + width * 0.13,
          ]),
        ],
        alpha * 0.4,
        0.5,
      );
    }

    foliage(plant, frame, count = 3) {
      const opening = 0.55 + (this.controls.tone.value / 100) * 0.8;
      for (let i = 0; i < count; i++) {
        const t = 0.22 + i * 0.17,
          side = i % 2 ? 1 : -1;
        const length = (25 + plant.baseRadius * 0.45) * frame.scale * opening;
        const yaw = plant.leafYaw + i * 0.8;
        const flutter = Math.sin(this.time * 1.35 + plant.phase + i) * 0.08;
        this.leaf(
          frame.at(t),
          [
            side * length * Math.cos(yaw),
            length * (0.42 + flutter),
            side * length * Math.sin(yaw),
          ],
          length * 0.19,
          yaw,
          frame.opacity * 0.8,
        );
      }
    }

    drawBloom(plant, frame) {
      const center = frame.at(1),
        energy = this.energy[plant.group].value;
      const detune = this.controls.detune.value / 50;
      const count = plant.petals + (this.controls.voices.value - 1) * 0.48;
      const length = plant.radius.value * frame.scale * (0.8 + detune * 0.55);
      const broad =
        plant.width * (0.7 + (this.controls.morph.value / 100) * 0.6);
      const petals = [];
      for (let petal = 0; petal < Math.ceil(count); petal++) {
        const angle = (petal / count) * TAU;
        const fade = clamp(count - petal, 0, 1);
        const flutter =
          Math.sin(this.time * 1.2 + plant.phase + petal * 0.9) *
          (0.035 + energy * 0.016);
        const reach =
          length * (1 + flutter + this.random(petal + plant.phase) * 0.06);
        const points = [];
        for (let i = 0; i <= 20; i++) {
          const u = (i / 20) * TAU;
          const radial = 3 * frame.scale + (reach * (1 - Math.cos(u))) / 2;
          const lateral = Math.sin(u) * Math.sin(u / 2) * reach * broad;
          const curl = (radial / reach) ** 2 * reach * plant.cup;
          points.push(
            this.headTransform(plant, center, [
              radial * Math.cos(angle) - lateral * Math.sin(angle),
              radial * Math.sin(angle) + lateral * Math.cos(angle),
              curl,
            ]),
          );
        }
        petals.push({
          points,
          fade,
          angle,
          z: points.reduce((sum, point) => sum + point[2], 0) / points.length,
        });
      }
      petals.sort((a, b) => b.z - a.z);
      petals.forEach((petal) => {
        const lighting = clamp(
          0.8 - ((petal.z - center[2]) / length) * 0.3,
          0.35,
          1.05,
        );
        this.stroke(
          petal.points,
          frame.opacity * petal.fade * lighting,
          0.85,
          true,
          true,
        );
        if (plant.kind !== "daisy") {
          const vein = Array.from({ length: 7 }, (_, i) => {
            const r = length * (0.15 + (i / 6) * 0.7);
            return this.headTransform(plant, center, [
              r * Math.cos(petal.angle),
              r * Math.sin(petal.angle),
              (r / length) ** 2 * length * plant.cup,
            ]);
          });
          this.stroke(vein, frame.opacity * petal.fade * 0.2, 0.5);
        }
      });
      const radius = (plant.kind === "daisy" ? 5 : 3.7) * frame.scale;
      const disk = Array.from({ length: 25 }, (_, i) =>
        this.headTransform(plant, center, [
          Math.cos((i / 24) * TAU) * radius,
          Math.sin((i / 24) * TAU) * radius,
          -2 * frame.scale,
        ]),
      );
      this.stroke(disk, frame.opacity, 0.8, true, true);
      const meridian = Array.from({ length: 13 }, (_, i) =>
        this.headTransform(plant, center, [
          Math.cos((i / 12) * Math.PI) * radius,
          Math.sin((i / 12) * Math.PI) * radius * 0.3,
          -2 * frame.scale - Math.sin((i / 12) * Math.PI) * radius * 0.6,
        ]),
      );
      this.stroke(meridian, frame.opacity * 0.4, 0.5);
    }

    drawSeedhead(plant, frame) {
      const center = frame.at(1),
        radius = plant.radius.value * frame.scale * 0.8;
      const seeds = Array.from({ length: 27 }, (_, i) => {
        const y = 1 - ((i + 0.5) / 27) * 2,
          r = Math.sqrt(1 - y * y),
          angle = i * 2.399963;
        const tip = this.headTransform(plant, center, [
          r * Math.cos(angle) * radius,
          y * radius,
          r * Math.sin(angle) * radius,
        ]);
        return { tip, z: tip[2] };
      }).sort((a, b) => b.z - a.z);
      seeds.forEach((seed) => {
        const alpha = frame.opacity * (seed.z < center[2] ? 0.9 : 0.36);
        this.stroke([center, seed.tip], alpha, 0.55);
        const tuft = 3.5 * frame.scale;
        this.stroke(
          [
            add(seed.tip, [-tuft, tuft * 0.7, 0]),
            seed.tip,
            add(seed.tip, [tuft, tuft * 0.7, 0]),
          ],
          alpha,
          0.55,
        );
      });
    }

    drawBell(plant, frame) {
      this.foliage(plant, frame, 2);
      for (let bell = 0; bell < 3; bell++) {
        const start = frame.at(0.55 + bell * 0.2),
          side = bell % 2 ? -1 : 1;
        const center = add(start, [
          side * 18 * frame.scale,
          9 * frame.scale,
          -8 * frame.scale,
        ]);
        this.stroke(
          [
            start,
            add(center, [-side * 5 * frame.scale, 5 * frame.scale, 0]),
            center,
          ],
          frame.opacity,
          0.8,
        );
        const h = plant.radius.value * frame.scale * 0.8;
        const bellScale = (frame.scale * plant.radius.value) / 26;
        const contours = [];
        for (let meridian = 0; meridian < 6; meridian++) {
          const angle = (meridian / 6) * TAU;
          contours.push(
            Array.from({ length: 10 }, (_, i) => {
              const t = i / 9,
                r = (3 + t * t * 10) * bellScale;
              return this.headTransform(
                plant,
                center,
                [Math.cos(angle) * r, -h * t, Math.sin(angle) * r],
                0.2,
              );
            }),
          );
        }
        const rim = Array.from({ length: 31 }, (_, i) => {
          const angle = (i / 30) * TAU,
            radius = (13 + Math.cos(angle * 5) * 1.3) * bellScale;
          return this.headTransform(
            plant,
            center,
            [
              Math.cos(angle) * radius,
              -h + Math.cos(angle * 5) * bellScale,
              Math.sin(angle) * radius,
            ],
            0.2,
          );
        });
        this.mask([...contours.flat(), ...rim]);
        const edges = contours.map((points) => ({
          points,
          x: this.project(points.at(-1)).x,
          z: points.reduce((sum, point) => sum + point[2], 0) / points.length,
        }));
        const left = edges.reduce((a, b) => (a.x < b.x ? a : b)),
          right = edges.reduce((a, b) => (a.x > b.x ? a : b));
        this.stroke(left.points, frame.opacity, 0.8);
        this.stroke(right.points, frame.opacity, 0.8);
        edges
          .sort((a, b) => a.z - b.z)
          .slice(0, 2)
          .forEach((edge) =>
            this.stroke(edge.points, frame.opacity * 0.35, 0.6),
          );
        this.stroke(rim, frame.opacity, 0.8, true, true);
      }
    }

    drawFern(plant, frame) {
      const opening = 0.65 + (this.controls.tone.value / 100) * 0.55;
      for (let i = 0; i < 9; i++) {
        const t = 0.19 + i * 0.085;
        const reach = frame.h * 0.34 * Math.sin(Math.PI * t) ** 0.7 * opening;
        const yaw =
          plant.leafYaw +
          Math.sin(this.time * 0.43 + plant.phase + i * 0.3) * 0.06;
        for (const side of [-1, 1]) {
          this.leaf(
            frame.at(t),
            [
              side * Math.cos(yaw) * reach,
              reach * 0.35,
              side * Math.sin(yaw) * reach,
            ],
            reach * 0.11,
            yaw,
            frame.opacity * (0.6 + i / 30),
          );
        }
      }
    }

    drawReed(plant, frame) {
      for (let stalk = -1; stalk <= 1; stalk++) {
        const end = add(frame.at(0.8 + (stalk + 1) * 0.1), [
          stalk * frame.h * 0.11,
          0,
          stalk * 9,
        ]);
        const base = frame.at(0);
        const stem = Array.from({ length: 10 }, (_, i) => {
          const t = i / 9;
          return [
            base[0] + (end[0] - base[0]) * t * t,
            end[1] * t,
            base[2] + (end[2] - base[2]) * t,
          ];
        });
        this.stroke(stem, frame.opacity * 0.8, 0.7);
        const head = Array.from({ length: 25 }, (_, i) => {
          const angle = (i / 24) * TAU;
          return [
            end[0] + Math.cos(angle) * 3.2 * frame.scale,
            end[1] + Math.sin(angle) * 12 * frame.scale,
            end[2] + Math.cos(angle) * 2 * frame.scale,
          ];
        });
        this.stroke(head, frame.opacity, 0.7, true, true);
      }
      this.foliage(plant, frame, 2);
    }

    drawPlant(plant) {
      const frame = this.plantFrame(plant);
      const shadow = Array.from({ length: 21 }, (_, i) => [
        frame.x + Math.cos((i / 20) * TAU) * 16,
        0,
        plant.depth + Math.sin((i / 20) * TAU) * 10,
      ]);
      this.stroke(shadow, frame.opacity * 0.12, 0.55, true);
      this.stroke(
        Array.from({ length: 13 }, (_, i) => frame.at(i / 12)),
        frame.opacity * 0.85,
        0.85,
      );
      if (plant.kind === "fern") this.drawFern(plant, frame);
      else if (plant.kind === "reed") this.drawReed(plant, frame);
      else if (plant.kind === "sprig") this.foliage(plant, frame, 5);
      else if (plant.kind === "bell") this.drawBell(plant, frame);
      else {
        this.foliage(plant, frame, 2 + Math.floor(plant.age * 2));
        if (plant.kind === "seedhead") this.drawSeedhead(plant, frame);
        else this.drawBloom(plant, frame);
      }
    }

    drawGrass(from = 0, to = this.visibleGrass.length) {
      const ctx = this.garden;
      const scale = this.worldScale,
        brightness = Math.sqrt(this.state.level / 100);
      let band = -1;
      // Batch nearby depths into a few paths so the denser field stays smooth.
      for (let i = from; i < to; i++) {
        const tuft = this.visibleGrass[i];
        const depth = tuft.depth,
          nextBand = clamp(Math.floor((depth + 160) / 280), 0, 5);
        if (nextBand !== band) {
          if (band !== -1) ctx.stroke();
          band = nextBand;
          ctx.beginPath();
          ctx.strokeStyle = `rgba(255,255,255,${clamp(0.35 - (band * 280 - 20) / 2600, 0.055, 0.4) * brightness})`;
          ctx.lineWidth = band <= 1 ? 0.85 : 0.55;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
        }
        const x =
          ((tuft.u - 0.5) * this.width * (this.cameraDistance + depth)) /
          this.focal;
        const h =
          tuft.height * scale * (0.8 + (this.controls.sub.value / 100) * 0.4);
        const wind =
          Math.sin(this.time * 0.65 + tuft.phase + tuft.u * 2) *
            (5 + this.controls.detune.value * 0.12) +
          this.storm.value * 3;
        for (let blade = -1; blade <= 1; blade++) {
          const lean = (blade * 9 + tuft.lean * 9 + wind) * scale;
          const tall = h * (blade === 0 ? 1 : 0.7);
          for (let j = 0; j <= 6; j++) {
            const t = j / 6;
            const perspective =
              this.focal / (this.cameraDistance + depth + blade * 4 * t);
            const px = this.width / 2 + (x + lean * t * t) * perspective;
            const py =
              this.horizon - (tall * t - this.cameraHeight) * perspective;
            if (j) ctx.lineTo(px, py);
            else ctx.moveTo(px, py);
          }
        }
      }
      if (band !== -1) ctx.stroke();
    }

    drawMotes() {
      const ctx = this.garden;
      for (let i = 0; i < 14; i++) {
        const x =
          ((this.random(i + 2100) * this.width + this.time * (3 + (i % 4))) %
            (this.width + 20)) -
          10;
        const y =
          this.height * (0.62 + this.random(i + 2200) * 0.3) +
          Math.sin(this.time * 0.3 + i) * 9;
        ctx.strokeStyle = `rgba(255,255,255,${(0.08 + this.field.value * 0.035) * Math.sqrt(this.state.level / 100)})`;
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(x - 1.3, y + 1.5);
        ctx.lineTo(x + 1.3, y - 1.5);
        ctx.stroke();
      }
    }

    makeDrop(scattered = false) {
      const depth = 0.35 + Math.random() * 0.65;
      const drop = {
        x: 0,
        y: 0,
        depth,
        speed: 380 + depth * 430,
        length: 10 + depth * 22,
        alpha: 0.09 + depth * 0.13,
      };
      this.resetDrop(drop, scattered);
      return drop;
    }
    resetDrop(drop, scattered = false) {
      if (scattered) {
        drop.x = Math.random() * this.width;
        drop.y = Math.random() * this.height;
        return;
      }
      const leftShare =
        (this.height * 0.48) / (this.width + this.height * 0.48);
      if (Math.random() < leftShare) {
        drop.x = -35;
        drop.y = Math.random() * this.height;
      } else {
        drop.x = Math.random() * (this.width + 70) - 35;
        drop.y = -45;
      }
    }
    drawRain(dt) {
      const ctx = this.rain;
      ctx.clearRect(0, 0, this.width, this.height);
      if (!this.motion) return;
      const storm = this.storm.value;
      const area = clamp((this.width * this.height) / 1000000, 0.4, 1.8);
      const target = clamp(area * (40 + storm * 230), 16, 620);
      this.rainAmount += (target - this.rainAmount) * (1 - Math.exp(-dt * 2.7));
      const count = Math.ceil(this.rainAmount);
      while (this.drops.length < count) this.drops.push(this.makeDrop(true));
      if (this.drops.length > count) this.drops.length = count;
      const wind = 0.48 + Math.sin(this.time * 0.27) * 0.05;
      ctx.lineCap = "round";
      this.drops.forEach((drop) => {
        const speed = drop.speed * (1 + storm * 0.24);
        drop.x += speed * wind * dt;
        drop.y += speed * dt;
        if (drop.y > this.height + 55 || drop.x > this.width + 55)
          this.resetDrop(drop);
        const length =
          drop.length * (1 + storm * 0.3 + this.state.release * 0.12);
        ctx.strokeStyle = `rgba(255,255,255,${drop.alpha * Math.sqrt(this.state.level / 100) * (0.8 + storm * 0.25)})`;
        ctx.lineWidth = 0.55 + drop.depth * 0.45;
        ctx.beginPath();
        ctx.moveTo(drop.x, drop.y);
        ctx.lineTo(drop.x - length * wind, drop.y - length);
        ctx.stroke();
      });
    }

    launchFirework(root, minor) {
      if (!this.motion) return;
      const radius = Math.min(
        this.width * 0.42,
        this.height * 0.36,
        190 + Math.random() * 100,
      );
      const panels = [...document.querySelectorAll(".panel")].map((panel) =>
        panel.getBoundingClientRect(),
      );
      let x = 0.5,
        y = 0.25,
        best = -Infinity;
      const visible = (px, py) =>
        px > 0 &&
        px < this.width &&
        py > 0 &&
        py < this.height &&
        !panels.some(
          (rect) =>
            px > rect.left &&
            px < rect.right &&
            py > rect.top &&
            py < rect.bottom,
        );
      for (let attempt = 0; attempt < 18; attempt++) {
        const cx = 0.12 + Math.random() * 0.76,
          cy = 0.2 + Math.random() * 0.26;
        let score = visible(cx * this.width, cy * this.height) ? 10 : 0;
        for (let i = 0; i < 16; i++) {
          const angle = (i / 16) * TAU;
          if (
            visible(
              cx * this.width + Math.cos(angle) * radius * 0.75,
              cy * this.height + Math.sin(angle) * radius * 0.75,
            )
          )
            score++;
        }
        if (score > best) {
          x = cx;
          y = cy;
          best = score;
        }
      }
      const type = Math.floor(Math.random() * 3),
        count = 90 + Math.floor(Math.random() * 42);
      const particles = Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * TAU + Math.random() * 0.08;
        const depth = type === 1 ? 0 : Math.random() * 1.8 - 0.9;
        const r = Math.sqrt(1 - depth * depth) * (0.8 + Math.random() * 0.2);
        return {
          x: Math.cos(angle) * r,
          y: Math.sin(angle) * r,
          depth,
          speed: 0.8 + Math.random() * 0.5,
          gravity: 13 + Math.random() * 15,
          alpha: 0.45 + Math.random() * 0.4,
        };
      });
      this.fireworks.push({
        born: performance.now(),
        x,
        y,
        radius,
        type,
        root,
        minor,
        duration: 2.1 + Math.random() * 0.6,
        particles,
      });
      if (this.fireworks.length > 8) this.fireworks.shift();
    }
    drawFireworks() {
      const ctx = this.sky,
        now = performance.now();
      ctx.clearRect(0, 0, this.width, this.height);
      if (!this.motion) return;
      for (let i = this.fireworks.length - 1; i >= 0; i--) {
        const firework = this.fireworks[i];
        const elapsed = (now - firework.born) / 1000;
        if (elapsed > firework.duration) {
          this.fireworks.splice(i, 1);
          continue;
        }
        if (elapsed < 0) continue;
        const x = firework.x * this.width,
          y = firework.y * this.height;
        const brightness = Math.sqrt(this.state.level / 100);
        ctx.lineCap = "round";
        const t = elapsed;
        const fade = Math.min(1, t / 0.09) * (1 - t / firework.duration) ** 1.4;
        firework.particles.forEach((particle) => {
          const position = (age) => {
            const expand =
              (1 - Math.exp(-age * 2.4)) * firework.radius * particle.speed;
            return [
              x + particle.x * expand + age * 7,
              y +
                particle.y * expand * (firework.type === 1 ? 0.65 : 0.9) +
                particle.gravity * age * age,
            ];
          };
          const p = position(t),
            tail = position(
              Math.max(0, t - (firework.type === 2 ? 0.1 : 0.045)),
            );
          const light =
            particle.alpha *
            (particle.depth > 0 ? 0.65 : 1) *
            fade *
            brightness;
          ctx.strokeStyle = `rgba(255,255,255,${light})`;
          ctx.lineWidth = particle.depth < 0 ? 1.2 : 0.8;
          ctx.beginPath();
          ctx.moveTo(tail[0], tail[1]);
          ctx.lineTo(p[0], p[1]);
          ctx.stroke();
        });
      }
    }

    frame(dt, levels) {
      this.update(dt, levels);
      this.garden.clearRect(0, 0, this.width, this.height);
      this.drawMotes();
      // Interleave grass and plants by depth; distant blades cannot show through petals.
      let cursor = 0;
      this.plants.forEach((plant) => {
        const start = cursor;
        while (
          cursor < this.visibleGrass.length &&
          this.visibleGrass[cursor].depth > plant.depth
        )
          cursor++;
        this.drawGrass(start, cursor);
        this.drawPlant(plant);
      });
      this.drawGrass(cursor);
      this.drawRain(dt);
      this.drawFireworks();
    }
  };
})();
