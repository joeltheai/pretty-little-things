(() => {
  "use strict";

  /* ------------------------------------------------------------------ *
   * Audio
   * ------------------------------------------------------------------ */

  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const ctx = new AudioCtx();

  const master = ctx.createGain();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 24;
  comp.ratio.value = 6;
  comp.attack.value = 0.004;
  comp.release.value = 0.25;
  master.connect(comp);
  comp.connect(ctx.destination);

  const state = {
    wave: "sawtooth",
    voices: 3,
    detune: 12,
    attack: 0.01,
    decay: 0.25,
    sustain: 0.55,
    release: 0.35,
    tone: 62,
    level: 70,
  };

  master.gain.value = (state.level / 100) * 0.7;

  const toneHz = (value) => 300 * Math.pow(40, value / 100);

  function playNote(midi, when, duration) {
    const t = Math.max(when, ctx.currentTime);
    const freq = 440 * Math.pow(2, (midi - 69) / 12);

    const amp = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(toneHz(state.tone), t);
    filter.Q.setValueAtTime(0.7, t);

    const count = state.voices;
    const spread = state.detune;
    const oscs = [];
    const panners = [];

    for (let i = 0; i < count; i += 1) {
      const ratio = count === 1 ? 0 : i / (count - 1) - 0.5;

      const osc = ctx.createOscillator();
      osc.type = state.wave;
      osc.frequency.setValueAtTime(freq, t);
      osc.detune.setValueAtTime(ratio * 2 * spread, t);

      const voiceGain = ctx.createGain();
      voiceGain.gain.value = 0.9 / count;

      const pan = ctx.createStereoPanner();
      pan.pan.value = ratio * 0.8;

      osc.connect(voiceGain);
      voiceGain.connect(pan);
      pan.connect(filter);
      osc.start(t);

      oscs.push(osc);
      panners.push(pan);
    }

    filter.connect(amp);
    amp.connect(master);

    const a = Math.max(0.004, state.attack);
    const d = Math.max(0.01, state.decay);
    const s = Math.max(0.0001, state.sustain);
    const r = Math.max(0.03, state.release);

    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.linearRampToValueAtTime(1, t + a);
    amp.gain.linearRampToValueAtTime(s, t + a + d);

    const off = Math.max(t + duration, t + 0.03);
    try {
      amp.gain.cancelAndHoldAtTime(off);
    } catch (err) {
      amp.gain.cancelScheduledValues(off);
    }
    amp.gain.linearRampToValueAtTime(0.0001, off + r);

    const end = off + r + 0.05;
    oscs.forEach((osc) => osc.stop(end));

    oscs[0].onended = () => {
      oscs.forEach((osc) => osc.disconnect());
      panners.forEach((pan) => pan.disconnect());
      filter.disconnect();
      amp.disconnect();
    };
  }

  async function ensureRunning() {
    if (ctx.state !== "running") {
      await ctx.resume();
    }
  }

  /* ------------------------------------------------------------------ *
   * Synth controls
   * ------------------------------------------------------------------ */

  const $ = (selector) => document.querySelector(selector);

  const waveButtons = Array.from(document.querySelectorAll(".waves button"));
  waveButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.wave = button.dataset.wave;
      waveButtons.forEach((other) => {
        other.setAttribute("aria-pressed", String(other === button));
      });
    });
  });

  function bindRange(id, key, format, apply) {
    const input = document.getElementById(id);
    const output = document.getElementById(`${id}-out`);

    const sync = () => {
      const value = Number(input.value);
      state[key] = value;
      output.textContent = format(value);
      if (apply) apply(value);
    };

    input.addEventListener("input", sync);
    sync();
  }

  bindRange("voices", "voices", (value) => String(value));
  bindRange("detune", "detune", (value) => String(value));
  bindRange("attack", "attack", (value) => value.toFixed(2));
  bindRange("decay", "decay", (value) => value.toFixed(2));
  bindRange("sustain", "sustain", (value) => `${Math.round(value * 100)}%`);
  bindRange("release", "release", (value) => value.toFixed(2));
  bindRange("tone", "tone", (value) => {
    const hz = toneHz(value);
    return hz >= 1000 ? `${(hz / 1000).toFixed(1)}k` : String(Math.round(hz));
  });
  bindRange(
    "level",
    "level",
    (value) => `${value}%`,
    (value) => {
      master.gain.setTargetAtTime((value / 100) * 0.7, ctx.currentTime, 0.02);
    },
  );

  /* ------------------------------------------------------------------ *
   * Window
   * ------------------------------------------------------------------ */

  const synthWindow = $("#synth-window");
  let zTop = 1;

  function setPos(win, x, y) {
    win.style.left = `${Math.round(x)}px`;
    win.style.top = `${Math.round(y)}px`;
  }

  function initLayout() {
    const w = synthWindow.offsetWidth;
    const h = synthWindow.offsetHeight;
    const x = Math.max(20, (window.innerWidth - w) / 2);
    const y = Math.max(20, (window.innerHeight - h) / 2);

    setPos(synthWindow, x, y);
    synthWindow.classList.add("ready");
  }

  function clampWindow(win) {
    const maxX = Math.max(0, window.innerWidth - win.offsetWidth);
    const maxY = Math.max(0, window.innerHeight - win.offsetHeight);
    const x = Math.min(Math.max(0, parseFloat(win.style.left) || 0), maxX);
    const y = Math.min(Math.max(0, parseFloat(win.style.top) || 0), maxY);
    setPos(win, x, y);
  }

  function makeDraggable(win) {
    const bar = win.querySelector(".titlebar");
    let drag = null;

    bar.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;

      const rect = win.getBoundingClientRect();
      drag = { dx: event.clientX - rect.left, dy: event.clientY - rect.top };
      win.style.zIndex = String(++zTop);
      bar.setPointerCapture(event.pointerId);
      event.preventDefault();
    });

    bar.addEventListener("pointermove", (event) => {
      if (!drag) return;

      const maxX = Math.max(0, window.innerWidth - win.offsetWidth);
      const maxY = Math.max(0, window.innerHeight - win.offsetHeight);
      const x = Math.min(Math.max(0, event.clientX - drag.dx), maxX);
      const y = Math.min(Math.max(0, event.clientY - drag.dy), maxY);

      setPos(win, x, y);
    });

    const end = (event) => {
      if (!drag) return;
      drag = null;
      if (bar.hasPointerCapture(event.pointerId)) {
        bar.releasePointerCapture(event.pointerId);
      }
    };

    bar.addEventListener("pointerup", end);
    bar.addEventListener("pointercancel", end);
  }

  makeDraggable(synthWindow);
  initLayout();

  window.addEventListener("resize", () => {
    clampWindow(synthWindow);
  });
})();
