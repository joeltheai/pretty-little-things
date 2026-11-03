(() => {
  "use strict";
  const TAU = Math.PI * 2;
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const mtof = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function normalize(data, peak) {
    let max = 0;
    for (let i = 0; i < data.length; i++) {
      const v = Math.abs(data[i]);
      if (v > max) max = v;
    }
    if (max > 0.0001) {
      const gain = peak / max;
      for (let i = 0; i < data.length; i++) data[i] *= gain;
    }
    return data;
  }

  function renderChoir(sampleRate, seconds) {
    const length = Math.floor(sampleRate * seconds);
    const out = new Float32Array(length);
    const notes = [36, 43, 48, 55, 60, 64, 67];
    const phases = notes.map((_, i) => i * 1.618);
    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      let sample = 0;
      for (let n = 0; n < notes.length; n++) {
        const freq = mtof(notes[n]);
        const drift = 1 + 0.0035 * Math.sin(TAU * (4.1 + n * 0.23) * t + phases[n]);
        const swell =
          0.5 +
          0.5 *
            Math.sin(TAU * (0.045 + n * 0.009) * t + phases[n] * 0.7);
        sample +=
          (Math.sin(TAU * freq * drift * t) +
            0.32 * Math.sin(TAU * freq * 2 * drift * t + 0.5) +
            0.1 * Math.sin(TAU * freq * 3 * t + 1.2)) *
          swell *
          0.14;
      }
      const breath = Math.sin(TAU * 0.063 * t) * 0.008;
      out[i] = sample + breath * Math.sin(TAU * 2200 * t);
    }
    return normalize(out, 0.82);
  }

  function renderHarp(sampleRate, seconds) {
    const length = Math.floor(sampleRate * seconds);
    const out = new Float32Array(length);
    const random = mulberry32(31);
    const scale = [48, 51, 53, 55, 58, 60, 63, 65, 67, 70, 72, 75];
    let at = 0.04;
    let index = 0;
    while (at < seconds - 0.2) {
      const midi = scale[index % scale.length] + (random() < 0.18 ? 12 : 0);
      const freq = mtof(midi);
      const start = Math.floor(at * sampleRate);
      const span = Math.min(length - start, Math.floor(sampleRate * 2.8));
      const amp = 0.2 + random() * 0.12;
      const pick = Math.floor(sampleRate * 0.006);
      for (let i = 0; i < span; i++) {
        const t = i / sampleRate;
        const env = Math.exp(-t * 2.2) * (1 - Math.exp(-t * 420));
        let sample =
          Math.sin(TAU * freq * t) +
          0.46 * Math.sin(TAU * freq * 2 * t + 0.2) * Math.exp(-t * 1.4) +
          0.2 * Math.sin(TAU * freq * 3.01 * t) * Math.exp(-t * 2.4) +
          0.09 * Math.sin(TAU * freq * 4.02 * t) * Math.exp(-t * 3.1);
        if (i < pick) sample += (random() * 2 - 1) * 0.35 * (1 - i / pick);
        out[start + i] += sample * env * amp;
      }
      at += 0.33 + random() * 0.3;
      index += 1 + Math.floor(random() * 2);
    }
    return normalize(out, 0.8);
  }

  function renderRain(sampleRate, seconds) {
    const length = Math.floor(sampleRate * seconds);
    const out = new Float32Array(length);
    const random = mulberry32(97);
    let low = 0;
    let lower = 0;
    for (let i = 0; i < length; i++) {
      const white = random() * 2 - 1;
      low += (white - low) * 0.045;
      lower += (low - lower) * 0.02;
      out[i] = low * 0.55 + lower * 1.8 + white * 0.02;
    }
    for (let d = 0; d < 240; d++) {
      const start = Math.floor(random() * length);
      const freq = 850 + random() * 3800;
      const span = Math.min(
        length - start,
        Math.floor(sampleRate * (0.03 + random() * 0.18)),
      );
      const amp = 0.05 + random() * 0.11;
      for (let i = 0; i < span; i++) {
        const t = i / sampleRate;
        out[start + i] += Math.sin(TAU * freq * t) * Math.exp(-t * 34) * amp;
      }
    }
    return normalize(out, 0.72);
  }

  function renderGlass(sampleRate, seconds) {
    const length = Math.floor(sampleRate * seconds);
    const out = new Float32Array(length);
    const random = mulberry32(53);
    const roots = [60, 63, 65, 67, 70, 72, 75, 79];
    const partials = [
      [1, 1, 1.8],
      [2.76, 0.5, 1.2],
      [5.4, 0.24, 0.8],
      [8.93, 0.13, 0.52],
      [13.3, 0.06, 0.34],
    ];
    let at = 0.08;
    let index = 0;
    while (at < seconds - 0.4) {
      const freq = mtof(roots[index % roots.length]);
      const start = Math.floor(at * sampleRate);
      const span = Math.min(length - start, Math.floor(sampleRate * 4.4));
      const amp = 0.14 + random() * 0.1;
      for (let i = 0; i < span; i++) {
        const t = i / sampleRate;
        let sample = 0;
        for (let p = 0; p < partials.length; p++) {
          const [ratio, level, decay] = partials[p];
          sample +=
            level *
            Math.sin(TAU * freq * ratio * t + index + p) *
            Math.exp(-t / decay);
        }
        out[start + i] += sample * amp * (1 - Math.exp(-t * 380));
      }
      at += 1.15 + random() * 1.5;
      index++;
    }
    return normalize(out, 0.78);
  }

  function renderImpulse(ctx, seconds, decay) {
    const rate = ctx.sampleRate;
    const length = Math.floor(rate * seconds);
    const buffer = ctx.createBuffer(2, length, rate);
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      const random = mulberry32(channel ? 907 : 431);
      for (let i = 0; i < length; i++) {
        const t = i / length;
        data[i] = (random() * 2 - 1) * Math.pow(1 - t, decay);
      }
      for (let k = 0; k < 9; k++) {
        const position = Math.floor(
          (0.008 + k * 0.019 + channel * 0.004) * rate,
        );
        if (position < length) {
          data[position] += (random() * 2 - 1) * 0.7 * Math.pow(0.78, k);
        }
      }
    }
    return buffer;
  }

  const SCALES = {
    off: null,
    minor: [0, 2, 3, 5, 7, 10],
    major: [0, 2, 4, 5, 7, 9, 11],
    dorian: [0, 2, 3, 5, 7, 9, 10],
    chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  };

  const SHAPES = {
    soft: (t) => {
      const fade = 0.3;
      if (t < fade) return 0.5 - 0.5 * Math.cos((Math.PI * t) / fade);
      if (t > 1 - fade) {
        return 0.5 - 0.5 * Math.cos((Math.PI * (1 - t)) / fade);
      }
      return 1;
    },
    perc: (t) => {
      const attack = 0.03;
      if (t < attack) return t / attack;
      return Math.pow(1 - (t - attack) / (1 - attack), 2.2);
    },
    swell: (t) => {
      const release = 0.03;
      if (t > 1 - release) return (1 - t) / release;
      return Math.pow(t / (1 - release), 2.2);
    },
    tri: (t) => (t < 0.5 ? t * 2 : (1 - t) * 2),
    gate: (t) => {
      const fade = 0.06;
      if (t < fade) return t / fade;
      if (t > 1 - fade) return (1 - t) / fade;
      return 1;
    },
    sine: (t) => Math.sin(Math.PI * t),
    sine2: (t) => Math.sin(Math.PI * t) ** 2,
    rampUp: (t) => (t < 0.98 ? t / 0.98 : (1 - t) / 0.02),
    rampDown: (t) =>
      t < 0.02 ? t / 0.02 : 1 - (t - 0.02) / 0.98,
    rect: (t) =>
      t < 0.02 ? t / 0.02 : t > 0.98 ? (1 - t) / 0.02 : 1,
  };

  window.GrainShapes = {
    names: Object.keys(SHAPES),
    sample(shape, t) {
      const fn = SHAPES[shape] || SHAPES.soft;
      return fn(clamp(t, 0, 1));
    },
  };

  window.GrainEngine = class GrainEngine {
    constructor(params) {
      this.params = params;
      this.ctx = null;
      this.running = false;
      this.voices = [];
      this.energy = 0;
      this.autoOn = true;
      this.onGrain = null;
      this.onNote = null;
      this.buffers = null;
      this.peaks = {};
      this.waveforms = {};
      this._nextAuto = 0;
      this._timer = 0;
      this._timeData = null;
      this._buildFailed = false;
      this._starting = null;
      this._lastCutoff = -1;
      this._lastWet = -1;
      this._lastLevel = -1;
      this._lastRunning = null;
      this._lastFilterType = "";
      this._lastQ = -1;
      this._lastDrive = -1;
      this._lastEcho = -1;
      this.lfoPhase = 0;
      this.lfoValue = 0;
      this._lastTick = 0;
      this._lastModPosition = params.position;
      this.modDirection = 0;
      this.mod = {
        position: params.position,
        pitch: 0,
        tone: params.tone,
        width: params.width,
        space: params.space,
      };
    }

    _build() {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) throw new Error("Web Audio is not available");
      const ctx = new AudioCtor({ latencyHint: "interactive" });
      this.ctx = ctx;

      this.master = ctx.createGain();
      this.master.gain.value = 0.0001;
      this.limiter = ctx.createDynamicsCompressor();
      this.limiter.threshold.value = -10;
      this.limiter.knee.value = 18;
      this.limiter.ratio.value = 9;
      this.limiter.attack.value = 0.004;
      this.limiter.release.value = 0.26;
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.55;
      this.makeup = ctx.createGain();
      this.makeup.gain.value = 1.35;
      this.master.connect(this.limiter);
      this.limiter.connect(this.makeup);
      this.makeup.connect(this.analyser);
      this.analyser.connect(ctx.destination);

      this.bus = ctx.createGain();
      this.bus.gain.value = 0.8;
      this.highpass = ctx.createBiquadFilter();
      this.highpass.type = "highpass";
      this.highpass.frequency.value = 32;
      this.tone = ctx.createBiquadFilter();
      this.tone.type = "lowpass";
      this.tone.frequency.value = 8000;
      this.tone.Q.value = 0.45;
      this.dry = ctx.createGain();
      this.dry.gain.value = 1;
      this.convolver = ctx.createConvolver();
      this.convolver.buffer = renderImpulse(ctx, 3.4, 3.1);
      this.wet = ctx.createGain();
      this.wet.gain.value = 0.4;

      this.driveIn = ctx.createGain();
      this.driveDry = ctx.createGain();
      this.driveDry.gain.value = 1;
      this.driveShaper = ctx.createWaveShaper();
      this.driveShaper.oversample = "2x";
      this.driveWet = ctx.createGain();
      this.driveWet.gain.value = 0;
      this.driveMix = ctx.createGain();
      this._setDrive();
      this.driveComp = Math.tanh(11) / 11;
      this.delaySend = ctx.createGain();
      this.delaySend.gain.value = 0;
      this.delay = ctx.createDelay(1.5);
      this.delay.delayTime.value = 0.38;
      this.delayFeedback = ctx.createGain();
      this.delayFeedback.gain.value = 0.36;
      this.delayPan = ctx.createStereoPanner();
      this.delayPan.pan.value = 0.28;

      this.bus.connect(this.highpass);
      this.highpass.connect(this.tone);
      this.tone.connect(this.driveIn);
      this.driveIn.connect(this.driveDry);
      this.driveDry.connect(this.driveMix);
      this.driveIn.connect(this.driveShaper);
      this.driveShaper.connect(this.driveWet);
      this.driveWet.connect(this.driveMix);
      this.driveMix.connect(this.dry);
      this.dry.connect(this.master);
      this.driveMix.connect(this.convolver);
      this.convolver.connect(this.wet);
      this.wet.connect(this.master);
      this.driveMix.connect(this.delaySend);
      this.delaySend.connect(this.delay);
      this.delay.connect(this.delayPan);
      this.delayPan.connect(this.master);
      this.delay.connect(this.delayFeedback);
      this.delayFeedback.connect(this.delay);

      const rate = ctx.sampleRate;
      const seconds = 8;
      const make = (data) => {
        const buffer = ctx.createBuffer(1, data.length, rate);
        buffer.copyToChannel(data, 0);
        return buffer;
      };
      this.buffers = {
        choir: make(renderChoir(rate, seconds)),
        harp: make(renderHarp(rate, seconds)),
        rain: make(renderRain(rate, seconds)),
        glass: make(renderGlass(rate, seconds)),
      };
      const reversed = {};
      Object.keys(this.buffers).forEach((name) => {
        const data = this.buffers[name].getChannelData(0);
        const copy = new Float32Array(data.length);
        for (let i = 0; i < data.length; i++) {
          copy[i] = data[data.length - 1 - i];
        }
        reversed[`${name}:rev`] = make(copy);
      });
      this.buffers = { ...this.buffers, ...reversed };
      this.shapeCurves = {};
      for (const name of window.GrainShapes.names) {
        const curve = new Float32Array(128);
        for (let i = 0; i < curve.length; i++) {
          curve[i] = window.GrainShapes.sample(name, i / (curve.length - 1));
        }
        this.shapeCurves[name] = curve;
      }
      this._buildPeaks();
      this._timer = setInterval(() => this._tick(), 25);
    }

    _setDrive() {
      const curve = new Float32Array(1024);
      const k = 11;
      const norm = Math.tanh(k);
      for (let i = 0; i < 1024; i++) {
        const x = (i / 1023) * 2 - 1;
        curve[i] = Math.tanh(x * k) / norm;
      }
      this.driveShaper.curve = curve;
    }

    _buildPeaksFor(data, count) {
      const step = Math.max(1, Math.floor(data.length / count));
      const peaks = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        let max = 0;
        const start = i * step;
        for (let j = 0; j < step; j += 3) {
          const value = Math.abs(data[start + j] || 0);
          if (value > max) max = value;
        }
        peaks[i] = max;
      }
      return peaks;
    }

    _storePeaks(name, buffer) {
      const data = buffer.getChannelData(0);
      this.peaks[name] = this._buildPeaksFor(data, 168);
      this.waveforms[name] = this._buildPeaksFor(data, 2048);
    }

    _buildPeaks() {
      Object.keys(this.buffers).forEach((name) => {
        if (name.endsWith(":rev")) return;
        this._storePeaks(name, this.buffers[name]);
      });
    }

    getPeaks(name) {
      return this.peaks[name] || null;
    }

    getWaveform(name) {
      return this.waveforms[name] || null;
    }

    getDuration(name) {
      return this.buffers && this.buffers[name]
        ? this.buffers[name].duration
        : 8;
    }

    async loadSample(arrayBuffer, name = "own") {
      if (!this.ctx) await this.start();
      const decoded = await this.ctx.decodeAudioData(arrayBuffer);
      const length = Math.min(
        decoded.length,
        Math.floor(this.ctx.sampleRate * 24),
      );
      if (length < this.ctx.sampleRate * 0.1) {
        throw new Error("Sample is too short");
      }
      const data = new Float32Array(length);
      const channels = decoded.numberOfChannels;
      for (let channel = 0; channel < channels; channel++) {
        const source = decoded.getChannelData(channel);
        for (let i = 0; i < length; i++) {
          data[i] += source[i] / channels;
        }
      }
      normalize(data, 0.9);
      const make = (samples) => {
        const buffer = this.ctx.createBuffer(
          1,
          samples.length,
          this.ctx.sampleRate,
        );
        buffer.copyToChannel(samples, 0);
        return buffer;
      };
      const buffer = make(data);
      this.buffers.own = buffer;
      const reversed = new Float32Array(length);
      for (let i = 0; i < length; i++) {
        reversed[i] = data[length - 1 - i];
      }
      this.buffers["own:rev"] = make(reversed);
      this._storePeaks("own", buffer);
      this.params.source = "own";
      return { duration: buffer.duration, name };
    }

    getScope(target) {
      if (!this.analyser) return false;
      this.analyser.getByteTimeDomainData(target);
      return true;
    }

    start() {
      if (this._starting) return this._starting;
      this._starting = this._start().finally(() => {
        this._starting = null;
      });
      return this._starting;
    }

    async _start() {
      if (!this.ctx) {
        if (this._buildFailed) {
          throw new Error("Web Audio is unavailable");
        }
        try {
          this._build();
        } catch (error) {
          this._buildFailed = true;
          throw error;
        }
      }
      if (this.ctx.state !== "running") await this.ctx.resume();
      this.running = true;
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(this.params.level * 0.9, now, 0.18);
      this._nextAuto = now + 0.45;
    }

    stop() {
      if (!this.ctx || !this.running) return;
      this.running = false;
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(0.0001, now, 0.16);
      for (const voice of this.voices) this._release(voice, now);
    }

    setAuto(on) {
      this.autoOn = !!on;
      if (on && this.ctx) this._nextAuto = this.ctx.currentTime + 0.4;
    }

    noteOn(midi, velocity = 0.8, kind = "user") {
      if (!this.ctx || !this.running) return null;
      const now = this.ctx.currentTime;
      if (kind === "user") {
        const held = this.voices.find(
          (v) => !v.released && v.kind === "user" && v.midi === midi,
        );
        if (held) return held;
      }
      const active = this.voices.filter((v) => !v.released);
      if (active.length >= 8) this._release(active[0], now);
      const gain = this.ctx.createGain();
      const attack = clamp(this.params.attack, 0.005, 2);
      const decay = clamp(this.params.decay, 0.01, 2);
      const sustain = clamp(this.params.sustain, 0, 1);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(velocity, now + attack);
      gain.gain.linearRampToValueAtTime(
        velocity * sustain,
        now + attack + decay,
      );
      gain.connect(this.bus);
      const voice = {
        midi,
        kind,
        velocity,
        gain,
        nextGrain: now + Math.random() * 0.02,
        released: false,
        releaseAt: 0,
        autoRelease: 0,
      };
      this.voices.push(voice);
      if (this.onNote) this.onNote({ midi, velocity, kind });
      return voice;
    }

    pluck(midi, velocity = 0.8, seconds = 1.5) {
      const voice = this.noteOn(midi, velocity, "tap");
      if (voice && this.ctx) {
        voice.autoRelease = this.ctx.currentTime + seconds;
      }
      return voice;
    }

    noteOff(midi) {
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      for (const voice of this.voices) {
        if (!voice.released && voice.kind === "user" && voice.midi === midi) {
          this._release(voice, now);
        }
      }
    }

    allNotesOff() {
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      for (const voice of this.voices) {
        if (!voice.released) this._release(voice, now);
      }
    }

    _release(voice, now) {
      if (voice.released) return;
      voice.released = true;
      voice.releaseAt = now;
      voice.releaseSeconds = clamp(this.params.release, 0.02, 4);
      const param = voice.gain.gain;
      try {
        if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(now);
        else param.cancelScheduledValues(now);
      } catch (error) {
        param.cancelScheduledValues(now);
      }
      param.linearRampToValueAtTime(0, now + voice.releaseSeconds);
    }

    _autoNote(now) {
      const pool = [50, 53, 55, 58, 60, 62, 65, 67, 70, 72, 75];
      const autos = this.voices.filter((v) => !v.released && v.kind === "auto");
      if (autos.length >= 3) this._release(autos[0], now);
      const midi = pool[Math.floor(Math.random() * pool.length)];
      const voice = this.noteOn(midi, 0.55, "auto");
      if (voice) voice.autoRelease = now + 4.5 + Math.random() * 4;
      if (Math.random() < 0.24) {
        const fifth = this.noteOn(midi + 7, 0.34, "auto");
        if (fifth) fifth.autoRelease = now + 4 + Math.random() * 3.4;
      }
    }

    _applyParams(now) {
      const p = this.params;
      const toneValue = this.mod ? this.mod.tone : p.tone;
      const cutoff = 220 * Math.pow(52, clamp(toneValue, 0, 1));
      if (Math.abs(cutoff - this._lastCutoff) > 1) {
        this.tone.frequency.setTargetAtTime(cutoff, now, 0.06);
        this._lastCutoff = cutoff;
      }
      if (p.filterType !== this._lastFilterType) {
        this.tone.type = p.filterType;
        this._lastFilterType = p.filterType;
      }
      const q = clamp(p.resonance, 0.1, 20);
      if (Math.abs(q - this._lastQ) > 0.05) {
        this.tone.Q.setTargetAtTime(q, now, 0.06);
        this._lastQ = q;
      }
      const wet = clamp(this.mod ? this.mod.space : p.space, 0, 1) * 1.15;
      if (Math.abs(wet - this._lastWet) > 0.004) {
        this.wet.gain.setTargetAtTime(wet, now, 0.12);
        this._lastWet = wet;
      }
      if (Math.abs(p.drive - this._lastDrive) > 0.005) {
        const drive = clamp(p.drive, 0, 1);
        this.driveDry.gain.setTargetAtTime(1 - drive, now, 0.05);
        this.driveWet.gain.setTargetAtTime(
          drive * this.driveComp,
          now,
          0.05,
        );
        this._lastDrive = p.drive;
      }
      const echo = clamp(p.echo, 0, 1) * 0.6;
      if (Math.abs(echo - this._lastEcho) > 0.005) {
        this.delaySend.gain.setTargetAtTime(echo, now, 0.1);
        this._lastEcho = echo;
      }
      const level = this.running ? p.level * 0.9 : 0.0001;
      if (
        Math.abs(level - this._lastLevel) > 0.002 ||
        this._lastRunning !== this.running
      ) {
        this.master.gain.setTargetAtTime(level, now, 0.09);
        this._lastLevel = level;
        this._lastRunning = this.running;
      }
    }

    _tick() {
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const p = this.params;
      const dt = this._lastTick
        ? Math.min(0.1, Math.max(0, now - this._lastTick))
        : 0;
      this._lastTick = now;
      const lfoRate = clamp(p.lfoRate, 0.01, 8);
      this.lfoPhase = (this.lfoPhase + TAU * lfoRate * dt) % TAU;
      this.lfoValue = Math.sin(this.lfoPhase);
      const depth = clamp(p.lfoDepth, 0, 1);
      const target = p.lfoTarget;
      this.mod = {
        position: clamp(
          p.freeze
            ? p.position
            : p.position +
                (target === "position" ? this.lfoValue * depth * 0.5 : 0),
          0,
          1,
        ),
        pitch: target === "pitch" ? this.lfoValue * depth * 12 : 0,
        tone: clamp(
          p.tone + (target === "tone" ? this.lfoValue * depth * 0.45 : 0),
          0,
          1,
        ),
        width: clamp(
          p.width + (target === "width" ? this.lfoValue * depth * 0.5 : 0),
          0,
          1,
        ),
        space: clamp(
          p.space + (target === "space" ? this.lfoValue * depth * 0.5 : 0),
          0,
          1,
        ),
      };
      this.modDirection = Math.sign(this.mod.position - this._lastModPosition);
      this._lastModPosition = this.mod.position;
      this._applyParams(now);

      for (let i = this.voices.length - 1; i >= 0; i--) {
        const voice = this.voices[i];
        if (
          voice.released &&
          now > voice.releaseAt + (voice.releaseSeconds || 1.2) + 0.8
        ) {
          try {
            voice.gain.disconnect();
          } catch (error) {
            /* already detached */
          }
          this.voices.splice(i, 1);
        }
      }

      const data =
        this._timeData || (this._timeData = new Float32Array(this.analyser.fftSize));
      this.analyser.getFloatTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i += 2) sum += data[i] * data[i];
      const rms = Math.sqrt(sum / (data.length / 2));
      this.energy += (clamp(rms * 6.5, 0, 1) - this.energy) * 0.24;

      if (!this.running) return;

      if (this.autoOn && now >= this._nextAuto) {
        this._autoNote(now);
        this._nextAuto = now + 2.5 + Math.random() * 2.8;
      }
      for (const voice of this.voices) {
        if (!voice.released && voice.autoRelease && now >= voice.autoRelease) {
          this._release(voice, now);
        }
      }

      const density = clamp(p.density, 1, 80);
      const spacing = 1 / density;
      const lookahead =
        now + (typeof document !== "undefined" && document.hidden ? 1.6 : 0.12);
      for (const voice of this.voices) {
        const releaseEnd = voice.released
          ? voice.releaseAt + (voice.releaseSeconds || 1.2)
          : Infinity;
        if (now >= releaseEnd) continue;
        if (voice.nextGrain < now) voice.nextGrain = now + Math.random() * 0.01;
        let guard = 0;
        while (
          voice.nextGrain < lookahead &&
          voice.nextGrain < releaseEnd &&
          guard++ < 180
        ) {
          this._scheduleGrain(voice, voice.nextGrain);
          voice.nextGrain += spacing * (0.72 + Math.random() * 0.56);
        }
      }
    }

    _scheduleGrain(voice, when) {
      const ctx = this.ctx;
      const p = this.params;
      const direction = p.direction || "forward";
      let reversed = false;
      if (direction === "reverse") reversed = true;
      else if (direction === "random") reversed = Math.random() < 0.5;
      else if (direction === "playDir") reversed = this.modDirection < 0;
      else if (direction === "playDirInv") reversed = this.modDirection > 0;
      const buffer =
        this.buffers[reversed ? `${p.source}:rev` : p.source] ||
        this.buffers[p.source] ||
        this.buffers.choir;
      const duration = buffer.duration;
      const size = clamp(p.size / 1000, 0.012, 0.6);
      const cents = (Math.random() * 2 - 1) * p.scatter;
      let semitones =
        voice.midi -
        60 +
        p.pitch +
        (this.mod ? this.mod.pitch : 0) +
        cents / 100;
      if (p.scale !== "off" && SCALES[p.scale]) {
        const scale = SCALES[p.scale];
        const baseOctave = Math.floor(semitones / 12);
        let best = semitones;
        let bestDistance = Infinity;
        for (
          let octave = baseOctave - 1;
          octave <= baseOctave + 1;
          octave++
        ) {
          for (const note of scale) {
            const candidate = octave * 12 + note;
            const distance = Math.abs(candidate - semitones);
            if (distance < bestDistance) {
              bestDistance = distance;
              best = candidate;
            }
          }
        }
        semitones = best;
      }
      const rate = clamp(
        Math.pow(2, semitones / 12) * p.speed,
        0.06,
        12,
      );
      const consume = Math.min(duration, size * rate);
      const range = Math.max(0, duration - consume);
      const position = clamp(
        this.mod ? this.mod.position : p.position,
        0,
        1,
      );
      let offset = (reversed ? 1 - position : position) * range;
      if (!p.freeze) {
        offset += (Math.random() * 2 - 1) * p.spray * duration * 0.4;
        offset = clamp(offset, 0, range);
      }
      const grainRate = rate;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = grainRate;
      const envelope = ctx.createGain();
      const pan = ctx.createStereoPanner();
      const width = this.mod ? this.mod.width : p.width;
      pan.pan.value = clamp((Math.random() * 2 - 1) * width, -1, 1);
      const amplitude = 0.46 * Math.sqrt(10 / Math.max(6, p.density));
      const grainGain = ctx.createGain();
      grainGain.gain.value = amplitude;
      envelope.gain.setValueCurveAtTime(
        this.shapeCurves[p.shape] || this.shapeCurves.soft,
        when,
        size,
      );
      source.connect(grainGain);
      grainGain.connect(envelope);
      envelope.connect(pan);
      pan.connect(voice.gain);
      source.start(when, offset, consume);
      source.stop(when + size + 0.04);
      source.onended = () => {
        try {
          source.disconnect();
          grainGain.disconnect();
          envelope.disconnect();
          pan.disconnect();
        } catch (error) {
          /* already detached */
        }
      };
      if (this.onGrain) {
        const visualStart = reversed
          ? 1 - (offset + consume) / duration
          : offset / duration;
        this.onGrain({
          start: clamp(visualStart, 0, 1),
          span: consume / duration,
          reverse: reversed,
          size,
          pan: pan.pan.value,
          midi: voice.midi,
          rate: grainRate,
        });
      }
    }
  };
})();
