(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const NS = "http://www.w3.org/2000/svg";
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const DETUNE_RANGE_CENTS = 50;
  const unisonPosition = (index, count) =>
    count === 1 ? 0 : (index * 2) / (count - 1) - 1;
  const detuneControlAmount = (cents) =>
    Math.sqrt(clamp(cents / DETUNE_RANGE_CENTS, 0, 1));
  const detuneFromControl = (amount) =>
    clamp(amount, 0, 1) ** 2 * DETUNE_RANGE_CENTS;
  const formatCents = (cents) => `${Number(cents.toFixed(2))}ct`;
  const svg = (tag, attrs = {}) => {
    const el = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([key, value]) =>
      el.setAttribute(key, value),
    );
    return el;
  };
  const INITIAL_STATE = {
    synth: {
      wave: "sawtooth",
      voices: 7,
      detune: 4,
      morph: 20,
      sub: 12,
      attack: 0.005,
      decay: 0.24,
      sustain: 0.08,
      release: 0.42,
      tone: 69,
      resonance: 12,
      level: 55,
    },
    transport: {
      bpm: 122,
      rate: 0.25,
      swing: 0,
    },
    chord: {
      root: 0,
      minor: false,
      extension: "ninth",
      inversion: 0,
    },
    arp: {
      pattern: "custom",
      selectedLane: "note",
      linked: true,
      retrigger: false,
      bypass: false,
      lanes: {
        note: {
          length: 8,
          division: 1,
          values: [1, 2, 3, 5, 4, 3, 2, 4, 1, 2, 3, 5, 4, 3, 2, 4],
          mutes: [
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
          ],
        },
        gate: {
          length: 8,
          division: 1,
          values: [
            72, 36, 90, 52, 64, 72, 36, 90, 52, 64, 72, 36, 90, 52, 64, 72,
          ],
          mutes: [
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
          ],
        },
        velocity: {
          length: 8,
          division: 1,
          values: [
            90, 50, 68, 44, 78, 55, 65, 90, 50, 68, 44, 78, 55, 65, 90, 50,
          ],
          mutes: [
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
          ],
        },
        octave: {
          length: 8,
          division: 1,
          values: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
          mutes: [
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
          ],
        },
      },
    },
    motion: true,
    layout: {
      "chord-panel": {
        x: -151.852,
        y: -50.4141,
      },
      "arp-panel": {
        x: -94.6641,
        y: -45.4297,
      },
      "synth-panel": {
        x: 107.617,
        y: -160.332,
      },
    },
  };
  const state = { ...INITIAL_STATE.synth };
  const noteNames = [
    "C",
    "C♯",
    "D",
    "E♭",
    "E",
    "F",
    "F♯",
    "G",
    "A♭",
    "A",
    "B♭",
    "B",
  ];
  const noteName = (midi, octave = true) =>
    noteNames[((midi % 12) + 12) % 12] +
    (octave ? Math.floor(midi / 12) - 1 : "");
  const toneHz = (v) => 70 * Math.pow(260, v / 100);
  const seconds = (v) =>
    v < 1 ? `${Math.round(v * 1000)}ms` : `${v.toFixed(1)}s`;
  let ctx, master, analyser, compressor, responseFilter, periodicWave;
  let playing = false,
    starting = false,
    bypass = INITIAL_STATE.arp.bypass,
    retrigger = INITIAL_STATE.arp.retrigger,
    timer = null,
    generation = 0;
  let bpm = INITIAL_STATE.transport.bpm,
    rate = INITIAL_STATE.transport.rate,
    swing = INITIAL_STATE.transport.swing,
    anchor = 0,
    nextStep = 0;
  let motion =
    INITIAL_STATE.motion &&
    !matchMedia("(prefers-reduced-motion: reduce)").matches;
  const activeVoices = new Set();
  const visualNotes = [];
  const scheduledSteps = [];
  const heldKeys = new Map();
  let lastVisual = null;

  // Audio starts only after a gesture. All sequencer events share the audio clock.
  async function audio() {
    try {
      if (!ctx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        ctx = new AudioContext();
        master = ctx.createGain();
        master.gain.value = (state.level / 100) * 0.48;
        compressor = ctx.createDynamicsCompressor();
        compressor.threshold.value = -16;
        compressor.knee.value = 20;
        compressor.ratio.value = 5;
        analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        responseFilter = ctx.createBiquadFilter();
        master.connect(compressor).connect(analyser).connect(ctx.destination);
        rebuildWave();
        drawFilter();
      }
      if (ctx.state !== "running") await ctx.resume();
      if (ctx.state === "running") $(".audio-error")?.remove();
      return ctx.state === "running";
    } catch (error) {
      let message = $(".audio-error");
      if (!message) {
        message = document.createElement("p");
        message.className = "audio-error";
        message.setAttribute("role", "alert");
        document.body.append(message);
      }
      message.textContent = "Audio could not start. Try pressing play again.";
      console.error(error);
      return false;
    }
  }

  function rebuildWave() {
    if (!ctx) return;
    const real = new Float32Array(65),
      imag = new Float32Array(65);
    const mix = state.morph / 100;
    for (let n = 1; n < imag.length; n++) {
      let harmonic = 0;
      if (state.wave === "sine") harmonic = n === 1 ? 1 : 0;
      if (state.wave === "sawtooth") harmonic = (n % 2 ? 1 : -1) / n;
      if (state.wave === "square") harmonic = n % 2 ? 1 / n : 0;
      if (state.wave === "triangle")
        harmonic = n % 2 ? Math.pow(-1, (n - 1) / 2) / (n * n) : 0;
      imag[n] = harmonic * (1 - mix) + (n === 1 ? mix : 0);
    }
    periodicWave = ctx.createPeriodicWave(real, imag);
    activeVoices.forEach((voice) =>
      voice.oscs.forEach((osc, i) => {
        if (i < voice.unison) osc.setPeriodicWave(periodicWave);
      }),
    );
  }

  function envelopeAt(voice, time) {
    const elapsed = time - voice.t;
    if (elapsed <= 0) return 0;
    if (time >= voice.off)
      return voice.releaseFrom * Math.max(0, 1 - (time - voice.off) / voice.r);
    if (elapsed < voice.a) return elapsed / voice.a;
    if (elapsed < voice.a + voice.d)
      return 1 + ((voice.s - 1) * (elapsed - voice.a)) / voice.d;
    return voice.s;
  }

  function releaseVoice(voice, when) {
    if (voice.off <= when) return;
    when = Math.max(when, voice.t + 0.001);
    const value = envelopeAt(voice, when);
    voice.off = when;
    voice.releaseFrom = value;
    voice.amp.gain.cancelScheduledValues(when);
    // Keep the partial attack/decay ramp when gate closes before its endpoint.
    voice.amp.gain.linearRampToValueAtTime(value, when);
    voice.amp.gain.linearRampToValueAtTime(0, when + voice.r);
    voice.oscs.forEach((osc) => osc.stop(when + voice.r + 0.02));
  }

  function playNote(midi, when, duration, velocity = 0.8, source = "arp") {
    if (!ctx) return null;
    if (activeVoices.size >= 40) {
      const oldest = activeVoices.values().next().value;
      oldest.off = ctx.currentTime;
      oldest.r = 0.01;
      oldest.oscs.forEach((osc) => {
        try {
          osc.stop();
        } catch {}
      });
      activeVoices.delete(oldest);
    }
    const t = Math.max(ctx.currentTime, when);
    const amp = ctx.createGain(),
      filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = toneHz(state.tone);
    filter.Q.value = (state.resonance / 100) * 10 + 0.3;
    filter.connect(amp).connect(master);
    const oscs = [],
      nodes = [];
    const freq = 440 * 2 ** ((midi - 69) / 12);
    for (let i = 0; i < state.voices; i++) {
      const spread = unisonPosition(i, state.voices);
      const osc = ctx.createOscillator(),
        gain = ctx.createGain(),
        pan = ctx.createStereoPanner();
      osc.setPeriodicWave(periodicWave);
      osc.frequency.value = freq;
      osc.detune.value = spread * state.detune;
      gain.gain.value = (velocity * 0.35) / Math.sqrt(state.voices);
      pan.pan.value = spread * 0.65;
      osc.connect(gain).connect(pan).connect(filter);
      osc.start(t);
      oscs.push(osc);
      nodes.push(gain, pan);
    }
    if (state.sub > 0) {
      const sub = ctx.createOscillator(),
        gain = ctx.createGain();
      sub.type = "sine";
      sub.frequency.value = freq / 2;
      gain.gain.value = (state.sub / 100) * 0.24 * velocity;
      sub.connect(gain).connect(filter);
      sub.start(t);
      oscs.push(sub);
      nodes.push(gain);
    }
    const voice = {
      midi,
      t,
      off: Infinity,
      a: state.attack,
      d: state.decay,
      s: state.sustain,
      r: state.release,
      releaseFrom: 0,
      amp,
      filter,
      oscs,
      nodes,
      unison: state.voices,
      source,
      velocity,
    };
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(1, t + voice.a);
    amp.gain.linearRampToValueAtTime(voice.s, t + voice.a + voice.d);
    if (Number.isFinite(duration))
      releaseVoice(voice, t + Math.max(0.02, duration));
    oscs[0].onended = () => {
      activeVoices.delete(voice);
      [...oscs, ...nodes, filter, amp].forEach((node) => node.disconnect());
    };
    activeVoices.add(voice);
    visualNotes.push({ voice, born: false, x: (midi * 0.137) % 1, source });
    if (visualNotes.length > 180)
      visualNotes.splice(0, visualNotes.length - 180);
    return voice;
  }

  function silence(source) {
    if (!ctx) return;
    activeVoices.forEach((voice) => {
      if (source && voice.source !== source) return;
      const value = envelopeAt(voice, ctx.currentTime);
      voice.off = ctx.currentTime;
      voice.r = 0.025;
      voice.releaseFrom = value;
      voice.amp.gain.cancelScheduledValues(ctx.currentTime);
      voice.amp.gain.setValueAtTime(value, ctx.currentTime);
      voice.amp.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.025);
      voice.oscs.forEach((osc) => {
        try {
          osc.stop(ctx.currentTime + 0.03);
        } catch {}
      });
    });
    for (let i = visualNotes.length - 1; i >= 0; i--)
      if (!source || visualNotes[i].source === source) visualNotes.splice(i, 1);
  }

  // Knobs retain native range inputs for keyboard and assistive technology.
  const definitions = {
    voices: [1, 7, 1, "unison", (v) => String(v)],
    detune: [0, DETUNE_RANGE_CENTS, 0, "detune", formatCents],
    morph: [0, 100, 1, "position", (v) => `${v}%`],
    sub: [0, 100, 1, "sub", (v) => `${v}%`],
    attack: [0.005, 2, 0.005, "attack", seconds],
    decay: [0.02, 2, 0.01, "decay", seconds],
    sustain: [0, 1, 0.01, "sustain", (v) => `${Math.round(v * 100)}%`],
    release: [0.03, 3, 0.01, "release", seconds],
    tone: [
      0,
      100,
      1,
      "cutoff",
      (v) =>
        toneHz(v) >= 1000
          ? `${(toneHz(v) / 1000).toFixed(1)}k`
          : `${Math.round(toneHz(v))}Hz`,
    ],
    resonance: [0, 100, 1, "res", (v) => `${v}%`],
    level: [0, 100, 1, "level", (v) => `${v}%`],
  };
  const knobs = new Map();
  function polar(cx, cy, radius, angle) {
    return [
      cx + Math.sin((angle * Math.PI) / 180) * radius,
      cy - Math.cos((angle * Math.PI) / 180) * radius,
    ];
  }
  function arc(from, to) {
    const [a, b] = polar(24, 24, 21, from),
      [c, d] = polar(24, 24, 21, to);
    return `M${a} ${b}A21 21 0 ${to - from > 180 ? 1 : 0} 1 ${c} ${d}`;
  }
  function setControl(id, value) {
    const input = $(`#${id}`),
      [min, max, step] = definitions[id];
    input.value = clamp(
      step > 0 ? min + Math.round((value - min) / step) * step : value,
      min,
      max,
    );
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }
  function control(id, target, envelope = false) {
    const [min, max, step, label, format] = definitions[id];
    const box = document.createElement("div");
    box.className = envelope ? "env-control" : "knob";
    box.title = label;
    const input = `<input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${state[id]}" aria-label="${label}"/>`;
    if (envelope)
      box.innerHTML = `<div class="env-label"><label for="${id}">${label[0].toUpperCase()}</label><output id="${id}-out">${format(state[id])}</output></div>${input}`;
    else
      box.innerHTML = `<div class="knob-face">${input}<svg viewBox="0 0 48 48" aria-hidden="true"><path class="knob-track" d="${arc(-135, 135)}"/><path class="knob-arc"/><circle class="knob-body" cx="24" cy="24" r="16"/><g class="knob-pointer"><path d="M24 19V11"/></g></svg></div><label for="${id}">${label}</label><output id="${id}-out">${format(state[id])}</output>`;
    $(target).append(box);
    const range = box.querySelector("input");
    const sync = () => {
      state[id] = Number(range.value);
      $(`#${id}-out`).textContent = format(state[id]);
      range.setAttribute("aria-valuetext", format(state[id]));
      box.title = `${label}: ${format(state[id])}`;
      if (!envelope) {
        const angle = -135 + ((state[id] - min) / (max - min)) * 270;
        box
          .querySelector(".knob-pointer")
          .setAttribute("transform", `rotate(${angle} 24 24)`);
        box
          .querySelector(".knob-arc")
          .setAttribute("d", arc(-135, angle + 0.001));
      }
      if (id === "morph") drawWave();
      if (id === "morph") rebuildWave();
      if (["attack", "decay", "sustain", "release"].includes(id))
        drawEnvelope();
      if (id === "tone" || id === "resonance") {
        drawFilter();
        activeVoices.forEach((v) => {
          v.filter.frequency.setTargetAtTime(
            toneHz(state.tone),
            ctx.currentTime,
            0.025,
          );
          v.filter.Q.setTargetAtTime(
            (state.resonance / 100) * 10 + 0.3,
            ctx.currentTime,
            0.025,
          );
        });
      }
      if (id === "level" && master)
        master.gain.setTargetAtTime(
          (state.level / 100) * 0.48,
          ctx.currentTime,
          0.02,
        );
    };
    range.addEventListener("input", sync);
    if (!envelope) {
      const face = box.querySelector(".knob-face");
      knobs.set(id, sync);
      let drag;
      face.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        range.focus();
        face.setPointerCapture(e.pointerId);
        drag = { y: e.clientY, value: Number(range.value) };
      });
      face.addEventListener("pointermove", (e) => {
        if (!drag) return;
        drag.value +=
          ((drag.y - e.clientY) * (max - min)) / (e.shiftKey ? 650 : 170);
        drag.y = e.clientY;
        drag.value = clamp(drag.value, min, max);
        setControl(id, drag.value);
      });
      const end = () => {
        drag = null;
      };
      face.addEventListener("pointerup", end);
      face.addEventListener("pointercancel", end);
      face.addEventListener("lostpointercapture", end);
      face.addEventListener("dblclick", () => setControl(id, defaults[id]));
    }
    return sync;
  }
  function drawUnison() {
    const lines = $("#unison-lines");
    lines.replaceChildren();
    // Quadratic pitch response gives fine low-end control, with no cent snapping.
    const spread = detuneControlAmount(state.detune) * 82;
    for (let i = 0; i < state.voices; i++) {
      const ratio = unisonPosition(i, state.voices);
      const x = 100 + ratio * spread;
      lines.append(svg("line", { x1: x, x2: x, y1: 8, y2: 30 }));
    }
    $("#unison-display").setAttribute(
      "aria-label",
      `${state.voices} unison voices, plus or minus ${Number(state.detune.toFixed(2))} cents`,
    );
    $("#detune-out").textContent = `±${formatCents(state.detune)}`;
    $("#voice-less").disabled = state.voices <= 1;
    $("#voice-more").disabled = state.voices >= 7;
  }
  function retuneVoices() {
    if (!ctx) return;
    activeVoices.forEach((voice) =>
      voice.oscs.slice(0, voice.unison).forEach((osc, i) => {
        const ratio = unisonPosition(i, voice.unison);
        const parameter = osc.detune,
          now = ctx.currentTime;
        if (typeof parameter.cancelAndHoldAtTime === "function")
          parameter.cancelAndHoldAtTime(now);
        else {
          const value = parameter.value;
          parameter.cancelScheduledValues(now);
          parameter.setValueAtTime(value, now);
        }
        parameter.setTargetAtTime(ratio * state.detune, now, 0.012);
      }),
    );
  }
  function initUnison() {
    ["voices", "detune"].forEach((id) => {
      const input = $(`#${id}`),
        [min, max] = definitions[id];
      input.value = state[id];
      const sync = () => {
        const number = Number(input.value);
        state[id] = clamp(
          Number.isFinite(number)
            ? id === "voices"
              ? Math.round(number)
              : number
            : state[id],
          min,
          max,
        );
        input.value = state[id];
        input.setAttribute(
          "aria-valuetext",
          id === "voices"
            ? `${state[id]} voices`
            : `plus or minus ${Number(state[id].toFixed(2))} cents`,
        );
        input.title =
          id === "voices"
            ? `${state[id]} unison voices`
            : `±${formatCents(state[id])} detune`;
        drawUnison();
        drawWave();
        if (id === "detune") retuneVoices();
      };
      input.addEventListener("input", sync);
      input.addEventListener("change", sync);
      syncControls.push(sync);
    });
    $("#voice-less").addEventListener("click", () =>
      setControl("voices", state.voices - 1),
    );
    $("#voice-more").addEventListener("click", () =>
      setControl("voices", state.voices + 1),
    );
    $("#detune").addEventListener("keydown", (e) => {
      const directions = {
        ArrowLeft: -1,
        ArrowDown: -1,
        ArrowRight: 1,
        ArrowUp: 1,
        PageDown: -10,
        PageUp: 10,
      };
      if (!(e.key in directions) && e.key !== "Home" && e.key !== "End") return;
      e.preventDefault();
      setControl(
        "detune",
        e.key === "Home"
          ? 0
          : e.key === "End"
            ? DETUNE_RANGE_CENTS
            : state.detune + directions[e.key] * (e.shiftKey ? 0.01 : 0.1),
      );
    });
    const field = $("#unison-spread");
    let drag = null;
    field.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      $("#detune").focus();
      field.setPointerCapture(e.pointerId);
      drag = {
        x: e.clientX,
        y: e.clientY,
        amount: detuneControlAmount(state.detune),
        side:
          e.clientX < field.getBoundingClientRect().left + field.clientWidth / 2
            ? -1
            : 1,
        axis: null,
      };
    });
    field.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x,
        dy = e.clientY - drag.y;
      if (!drag.axis && Math.hypot(dx, dy) >= 1)
        drag.axis = Math.abs(dx) >= Math.abs(dy) ? "horizontal" : "vertical";
      if (!drag.axis) return;
      field.dataset.axis = drag.axis;
      const movement = drag.axis === "horizontal" ? dx * drag.side : -dy;
      drag.amount = clamp(
        drag.amount +
          movement /
            (field.getBoundingClientRect().width *
              0.41 *
              (e.shiftKey ? 10 : 1)),
        0,
        1,
      );
      drag.x = e.clientX;
      drag.y = e.clientY;
      setControl("detune", detuneFromControl(drag.amount));
    });
    const end = () => {
      if (!drag) return;
      drag = null;
      delete field.dataset.axis;
    };
    ["pointerup", "pointercancel", "lostpointercapture"].forEach((type) =>
      field.addEventListener(type, end),
    );
    field.addEventListener("dblclick", () => {
      setControl("detune", defaults.detune);
    });
  }
  const defaults = { ...state };
  const syncControls = [];
  initUnison();
  ["morph", "sub"].forEach((id) =>
    syncControls.push(control(id, "#osc-controls")),
  );
  ["attack", "decay", "sustain", "release"].forEach((id) =>
    syncControls.push(control(id, "#env-controls", true)),
  );
  ["tone", "resonance"].forEach((id) =>
    syncControls.push(control(id, "#filter-controls")),
  );
  syncControls.push(control("level", "#output-control"));

  function waveSample(phase) {
    const p = ((phase % 1) + 1) % 1,
      sine = Math.sin(p * Math.PI * 2);
    let base = sine;
    if (state.wave === "sawtooth") base = 1 - 2 * p;
    if (state.wave === "square") base = p < 0.5 ? 1 : -1;
    if (state.wave === "triangle") base = (2 / Math.PI) * Math.asin(sine);
    return base * (1 - state.morph / 100) + (sine * state.morph) / 100;
  }
  function drawWave() {
    const path = (offset = 0, lift = 0) =>
      Array.from(
        { length: 301 },
        (_, i) =>
          `${i ? "L" : "M"}${(12 + (i / 300) * 376).toFixed(2)} ${(52 - waveSample((i / 300) * 2.4 + offset) * 30 + lift).toFixed(2)}`,
      ).join(" ");
    $("#wave-line").setAttribute("d", path());
    $("#wave-area").setAttribute("d", `${path()} L388 106H12Z`);
    const stack = $("#wave-stack");
    stack.replaceChildren();
    for (let i = state.voices - 1; i >= 0; i--)
      stack.append(
        svg("path", {
          d: path(((i + 1) * state.detune) / 1400, -(i + 1) * 2),
          fill: "none",
          stroke: "white",
          "stroke-opacity": 0.06 + i * 0.02,
          "stroke-width": 0.7,
        }),
      );
  }
  $("#wave-grid").append(
    svg("path", {
      d: "M12 28H388 M12 52H388 M12 76H388 M106 8V100 M200 8V100 M294 8V100",
      fill: "none",
      stroke: "#222",
      "stroke-width": ".6",
    }),
  );
  $$(".waves button").forEach((button) =>
    button.addEventListener("click", () => {
      state.wave = button.dataset.wave;
      $$(".waves button").forEach((b) =>
        b.setAttribute("aria-pressed", String(b === button)),
      );
      drawWave();
      rebuildWave();
    }),
  );

  // Envelope handles use fixed time axes, so dragging never shifts the scale.
  let envPoints = [];
  function drawEnvelope() {
    const x1 = 12 + (state.attack / 2) * 92,
      x2 = x1 + 14 + (state.decay / 2) * 92,
      x3 = x2 + 65,
      x4 = x3 + 14 + (state.release / 3) * 92,
      sy = 96 - state.sustain * 82;
    envPoints = [
      { id: "attack", x: x1, y: 14 },
      { id: "decay", x: x2, y: sy },
      { id: "sustain", x: x3, y: sy },
      { id: "release", x: x4, y: 96 },
    ];
    const d = `M12 96L${x1} 14L${x2} ${sy}L${x3} ${sy}L${x4} 96`;
    $("#env-line").setAttribute("d", d);
    $("#env-area").setAttribute("d", `${d}H12Z`);
    envPoints.forEach((point) => {
      let group = $(`#env-${point.id}`);
      if (!group) {
        group = svg("g", {
          id: `env-${point.id}`,
          class: "env-point",
          tabindex: "0",
          role: "slider",
          "aria-label": `${point.id} envelope point`,
          "data-param": point.id,
        });
        group.append(
          svg("circle", { class: "env-hit", r: 12 }),
          svg("circle", { r: 3 }),
        );
        $("#env-handles").append(group);
      }
      group.setAttribute("transform", `translate(${point.x} ${point.y})`);
      group.setAttribute("aria-valuemin", definitions[point.id][0]);
      group.setAttribute("aria-valuemax", definitions[point.id][1]);
      group.setAttribute("aria-valuenow", state[point.id]);
      group.setAttribute(
        "aria-valuetext",
        definitions[point.id][4](state[point.id]),
      );
    });
  }
  let envDrag;
  $("#envelope").addEventListener("pointerdown", (e) => {
    const handle = e.target.closest("[data-param]");
    if (!handle || e.button !== 0) return;
    const id = handle.dataset.param;
    envDrag = {
      id,
      x: e.clientX,
      y: e.clientY,
      value: state[id],
      sustain: state.sustain,
    };
    $("#envelope").setPointerCapture(e.pointerId);
    e.preventDefault();
    handle.focus();
  });
  $("#envelope").addEventListener("pointermove", (e) => {
    if (!envDrag) return;
    const scale = 400 / $("#envelope").getBoundingClientRect().width;
    const dx = (e.clientX - envDrag.x) * scale,
      dy = (e.clientY - envDrag.y) * scale;
    const id = envDrag.id;
    if (id === "sustain") setControl(id, envDrag.value - dy / 82);
    else setControl(id, envDrag.value + (dx / 92) * (id === "release" ? 3 : 2));
    if (id === "decay") setControl("sustain", envDrag.sustain - dy / 82);
  });
  ["pointerup", "pointercancel", "lostpointercapture"].forEach((type) =>
    $("#envelope").addEventListener(type, () => {
      envDrag = null;
    }),
  );
  $("#env-handles").addEventListener("keydown", (e) => {
    const id = e.target.dataset.param;
    if (
      !id ||
      ![
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "Home",
        "End",
      ].includes(e.key)
    )
      return;
    e.preventDefault();
    const [min, max, step] = definitions[id];
    setControl(
      id,
      e.key === "Home"
        ? min
        : e.key === "End"
          ? max
          : state[id] +
            (["ArrowRight", "ArrowUp"].includes(e.key) ? 1 : -1) *
              step *
              (e.shiftKey ? 10 : 1),
    );
  });
  function drawFilter() {
    const points = [];
    if (responseFilter) {
      responseFilter.frequency.value = toneHz(state.tone);
      responseFilter.Q.value = (state.resonance / 100) * 10 + 0.3;
      const frequencies = new Float32Array(181),
        mag = new Float32Array(181),
        phase = new Float32Array(181);
      for (let i = 0; i <= 180; i++)
        frequencies[i] = Math.min(
          ctx.sampleRate / 2 - 1,
          30 * Math.pow(700, i / 180),
        );
      responseFilter.getFrequencyResponse(frequencies, mag, phase);
      for (let i = 0; i <= 180; i++)
        points.push(
          `${i ? "L" : "M"}${i} ${clamp(21 - 20 * Math.log10(Math.max(0.001, mag[i])) * 0.8, 3, 64)}`,
        );
    } else {
      const knee = state.tone * 1.5 + 10;
      for (let i = 0; i <= 180; i++)
        points.push(
          `${i ? "L" : "M"}${i} ${clamp(23 + Math.log1p(Math.exp((i - knee) / 7)) * 5 - Math.exp(-(((i - knee) / 10) ** 2)) * state.resonance * 0.13, 2, 64)}`,
        );
    }
    $("#filter-line").setAttribute("d", points.join(" "));
  }

  // Chord generator: circle of fifths, extensions and inversions.
  const majors = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5],
    minors = [9, 4, 11, 6, 1, 8, 3, 10, 5, 0, 7, 2];
  let chordRoot = INITIAL_STATE.chord.root,
    chordMinor = INITIAL_STATE.chord.minor,
    chordNotes = [];
  function ringPath(inner, outer, start, end) {
    const p = (r, a) => [160 + Math.cos(a) * r, 160 + Math.sin(a) * r];
    const a = p(outer, start),
      b = p(outer, end),
      c = p(inner, end),
      d = p(inner, start);
    return `M${a}A${outer} ${outer} 0 0 1 ${b}L${c}A${inner} ${inner} 0 0 0 ${d}Z`;
  }
  [majors, minors].forEach((roots, mode) =>
    roots.forEach((root, i) => {
      const start = -Math.PI / 2 - Math.PI / 12 + (i * Math.PI) / 6,
        end = start + Math.PI / 6;
      const path = svg("path", {
        d: ringPath(mode ? 60 : 108, mode ? 108 : 151, start, end),
        tabindex: 0,
        role: "button",
        "aria-label": `${noteNames[root]} ${mode ? "minor" : "major"}`,
        "aria-pressed": "false",
        "data-root": root,
        "data-minor": mode,
      });
      $("#wheel").append(path);
      const radius = mode ? 84 : 129,
        angle = (start + end) / 2;
      const label = svg("text", {
        x: 160 + Math.cos(angle) * radius,
        y: 160 + Math.sin(angle) * radius,
        class: mode ? "minor" : "major",
        "data-label": `${root}-${mode}`,
      });
      label.textContent = noteNames[root] + (mode ? "m" : "");
      $("#wheel").append(label);
    }),
  );
  $("#wheel").append(
    svg("circle", { cx: 160, cy: 160, r: 48, class: "wheel-guide" }),
  );
  function updateChord(audition = false) {
    let intervals = [0, chordMinor ? 3 : 4, 7];
    const extension = $("#extension").value;
    if (extension === "seventh") intervals.push(chordMinor ? 10 : 11);
    if (extension === "ninth") intervals.push(14);
    if (extension === "sus") intervals = [0, 5, 7];
    chordNotes = intervals.map((n) => 48 + chordRoot + n);
    for (let i = 0; i < Number($("#voicing").value); i++)
      chordNotes.push(chordNotes.shift() + 12);
    chordNotes.sort((a, b) => a - b);
    $("#chord-name").textContent =
      noteNames[chordRoot] +
      (extension === "seventh"
        ? chordMinor
          ? "m7"
          : "maj7"
        : extension === "ninth"
          ? chordMinor
            ? "madd9"
            : "add9"
          : extension === "sus"
            ? "sus4"
            : chordMinor
              ? "m"
              : "");
    $$("#wheel path[data-root]").forEach((p) => {
      const selected =
        Number(p.dataset.root) === chordRoot &&
        Boolean(Number(p.dataset.minor)) === chordMinor;
      p.classList.toggle("selected", selected);
      p.setAttribute("aria-pressed", String(selected));
      $(`[data-label="${p.dataset.root}-${p.dataset.minor}"]`).classList.toggle(
        "selected",
        selected,
      );
    });
    if (playing && bypass) holdChord();
    else if (playing && retrigger) restart();
    if (audition && !playing) auditionChord();
  }
  function chooseChord(e) {
    const p = e.target.closest("[data-root]");
    if (!p) return;
    chordRoot = Number(p.dataset.root);
    chordMinor = Boolean(Number(p.dataset.minor));
    updateChord(true);
  }
  $("#wheel").addEventListener("click", chooseChord);
  $("#wheel").addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      chooseChord(e);
    }
  });
  ["voicing", "extension"].forEach((id) =>
    $(`#${id}`).addEventListener("change", () => updateChord()),
  );
  async function auditionChord() {
    if (!(await audio())) return;
    silence("audition");
    chordNotes.forEach((m) =>
      playNote(m, ctx.currentTime + 0.01, 0.65, 0.65, "audition"),
    );
  }
  $("#audition").addEventListener("click", auditionChord);

  // A single graph is visible; each tab retains its own data, length and clock.
  const laneSpecs = [
    {
      id: "note",
      name: "note",
      min: 1,
      max: 8,
      values: [1, 2, 3, 5, 4, 3, 2, 4],
      length: 8,
    },
    {
      id: "gate",
      name: "gate",
      min: 10,
      max: 100,
      values: [72, 36, 90, 52, 64],
      length: 5,
    },
    {
      id: "velocity",
      name: "vel",
      min: 10,
      max: 100,
      values: [90, 50, 68, 44, 78, 55, 65],
      length: 7,
    },
    {
      id: "octave",
      name: "oct",
      min: -2,
      max: 2,
      values: [0, 0, 1, 0],
      length: 4,
    },
  ];
  const lanes = laneSpecs.map((spec) => ({
    ...spec,
    ...INITIAL_STATE.arp.lanes[spec.id],
    values: [...INITIAL_STATE.arp.lanes[spec.id].values],
    mutes: [...INITIAL_STATE.arp.lanes[spec.id].mutes],
    cells: [],
    muteButtons: [],
  }));
  let selectedLane = INITIAL_STATE.arp.selectedLane,
    linked = INITIAL_STATE.arp.linked,
    liveStep = -1;
  const activeLane = () => lanes.find((lane) => lane.id === selectedLane);

  function updateLaneControls() {
    const lane = activeLane();
    $("#lane-length").value = lane.length;
    $("#lane-length").setAttribute("aria-label", `${lane.name} lane length`);
    $("#lane-length-out").textContent = lane.length;
    $("#lane-division").value = lane.division;
    $("#lane-division").setAttribute(
      "aria-label",
      `${lane.name} clock division`,
    );
  }
  function updatePlayheads() {
    lanes.forEach((lane) => {
      const index =
        playing && !bypass && liveStep >= 0 ? laneIndex(lane, liveStep) : -1;
      lane.cells.forEach((cell, i) =>
        cell.classList.toggle("active", i === index),
      );
      lane.muteButtons.forEach((cell, i) =>
        cell.classList.toggle("active", i === index),
      );
    });
  }
  function selectLane(id) {
    selectedLane = id;
    $$(".lane").forEach((el) => {
      el.hidden = el.dataset.lane !== id;
    });
    $$(".lane-tab").forEach((tab) => {
      const selected = tab.dataset.lane === id;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    updateLaneControls();
    updatePlayheads();
  }
  function renderLane(lane) {
    const steps = $(`#lane-${lane.id} .steps`);
    steps.style.gridTemplateColumns = `repeat(${lane.length}, minmax(0, 1fr))`;
    lane.cells.forEach((cell, i) => {
      const value = lane.values[i];
      cell.hidden = i >= lane.length;
      cell.classList.toggle("muted", lane.mutes[i]);
      const bar = cell.querySelector(".bar");
      cell.style.setProperty(
        "--value",
        `${((value - lane.min) / (lane.max - lane.min)) * 82 + 5}%`,
      );
      if (lane.id === "octave") {
        bar.style.bottom = "50%";
        bar.style.height = `${(Math.abs(value) / 2) * 44}%`;
        bar.style.transform = value < 0 ? "translateY(100%)" : "none";
      } else
        bar.style.height = `${((value - lane.min) / (lane.max - lane.min)) * 86 + 4}%`;
      cell.querySelector(".step-value").textContent = lane.mutes[i]
        ? "·"
        : lane.id === "octave" && !value
          ? ""
          : value;
      const text = `${lane.name} step ${i + 1}: ${lane.mutes[i] ? "muted" : value}`;
      cell.setAttribute("aria-label", text);
      cell.setAttribute("aria-valuenow", value);
      cell.setAttribute(
        "aria-valuetext",
        lane.mutes[i] ? "muted" : String(value),
      );
      cell.title = text;
      if (lane.muteButtons[i]) {
        const mute = lane.muteButtons[i];
        mute.hidden = i >= lane.length;
        mute.setAttribute("aria-pressed", String(lane.mutes[i]));
      }
    });
    if (lane.muteButtons.length)
      $(`#lane-${lane.id} .step-mutes`).style.gridTemplateColumns =
        `repeat(${lane.length}, minmax(0, 1fr))`;
    if (selectedLane === lane.id) updateLaneControls();
    updatePlayheads();
  }
  lanes.forEach((lane) => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "lane-tab";
    tab.dataset.lane = lane.id;
    tab.id = `tab-${lane.id}`;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-controls", `lane-${lane.id}`);
    tab.textContent = lane.name;
    tab.addEventListener("click", () => selectLane(lane.id));
    tab.addEventListener("keydown", (e) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
      e.preventDefault();
      const index = lanes.indexOf(lane);
      const next =
        e.key === "Home"
          ? 0
          : e.key === "End"
            ? lanes.length - 1
            : (index + (e.key === "ArrowRight" ? 1 : -1) + lanes.length) %
              lanes.length;
      selectLane(lanes[next].id);
      $(`#tab-${lanes[next].id}`).focus();
    });
    $("#lane-tabs").append(tab);
    const el = document.createElement("div");
    el.className = "lane";
    el.dataset.lane = lane.id;
    el.id = `lane-${lane.id}`;
    el.setAttribute("role", "tabpanel");
    el.setAttribute("aria-labelledby", tab.id);
    el.innerHTML =
      '<div class="steps"></div>' +
      (lane.id === "note" ? '<div class="step-mutes"></div>' : "");
    $("#lanes").append(el);
    const steps = el.querySelector(".steps");
    for (let i = 0; i < 16; i++) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "step";
      cell.dataset.index = i;
      cell.setAttribute("role", "slider");
      cell.setAttribute("aria-valuemin", lane.min);
      cell.setAttribute("aria-valuemax", lane.max);
      cell.innerHTML =
        '<span class="bar"></span><span class="step-value"></span>';
      steps.append(cell);
      lane.cells.push(cell);
      cell.addEventListener("keydown", (e) => {
        if (
          [
            "ArrowUp",
            "ArrowDown",
            "ArrowLeft",
            "ArrowRight",
            "Home",
            "End",
          ].includes(e.key)
        ) {
          e.preventDefault();
          const amount = lane.id === "gate" || lane.id === "velocity" ? 5 : 1;
          lane.values[i] =
            e.key === "Home"
              ? lane.min
              : e.key === "End"
                ? lane.max
                : clamp(
                    lane.values[i] +
                      (["ArrowUp", "ArrowRight"].includes(e.key)
                        ? amount
                        : -amount),
                    lane.min,
                    lane.max,
                  );
          renderLane(lane);
          markCustom();
        } else if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          lane.mutes[i] = !lane.mutes[i];
          renderLane(lane);
          markCustom();
        }
      });
      if (lane.id === "note") {
        const mute = document.createElement("button");
        mute.type = "button";
        mute.className = "mute-step";
        mute.setAttribute("aria-label", `Mute note step ${i + 1}`);
        mute.title = `Mute step ${i + 1}`;
        mute.addEventListener("click", () => {
          lane.mutes[i] = !lane.mutes[i];
          renderLane(lane);
          markCustom();
        });
        el.querySelector(".step-mutes").append(mute);
        lane.muteButtons.push(mute);
      }
    }
    let drawing = false;
    function paint(e) {
      const rect = steps.getBoundingClientRect();
      const i = clamp(
        Math.floor(((e.clientX - rect.left) / rect.width) * lane.length),
        0,
        lane.length - 1,
      );
      lane.values[i] = clamp(
        Math.round(
          lane.min +
            (1 - clamp((e.clientY - rect.top) / rect.height, 0, 1)) *
              (lane.max - lane.min),
        ),
        lane.min,
        lane.max,
      );
      lane.mutes[i] = false;
      renderLane(lane);
      markCustom();
    }
    steps.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || !e.target.closest(".step")) return;
      e.preventDefault();
      e.target.closest(".step").focus();
      steps.setPointerCapture(e.pointerId);
      drawing = true;
      paint(e);
    });
    steps.addEventListener("pointermove", (e) => {
      if (drawing) paint(e);
    });
    ["pointerup", "pointercancel", "lostpointercapture"].forEach((type) =>
      steps.addEventListener(type, () => {
        drawing = false;
      }),
    );
    renderLane(lane);
  });
  selectLane(selectedLane);
  $("#lane-length").addEventListener("input", (e) => {
    const length = clamp(Math.round(Number(e.target.value)), 1, 16);
    (linked ? lanes : [activeLane()]).forEach((lane) => {
      lane.length = length;
      renderLane(lane);
    });
    markCustom();
  });
  $("#lane-division").addEventListener("change", (e) => {
    activeLane().division = Number(e.target.value);
    updatePlayheads();
    markCustom();
  });
  function markCustom() {
    if (!$("#pattern option[value=custom]")) {
      const option = document.createElement("option");
      option.value = "custom";
      option.textContent = "custom";
      $("#pattern").append(option);
    }
    $("#pattern").value = "custom";
  }
  function laneIndex(lane, step) {
    return Math.floor(step / lane.division) % lane.length;
  }
  function laneValue(lane, step) {
    const i = laneIndex(lane, step);
    return lane.mutes[i] ? 0 : lane.values[i];
  }
  $("#link-lengths").addEventListener("click", () => {
    linked = !linked;
    $("#link-lengths").setAttribute("aria-pressed", String(linked));
    if (linked) {
      const length = activeLane().length;
      lanes.forEach((lane) => {
        lane.length = length;
        renderLane(lane);
      });
      markCustom();
    }
  });
  $("#retrigger").addEventListener("click", () => {
    retrigger = !retrigger;
    $("#retrigger").setAttribute("aria-pressed", String(retrigger));
  });
  $("#randomize").addEventListener("click", () => {
    const lane = activeLane();
    lane.values = lane.values.map(() =>
      Math.round(lane.min + Math.random() * (lane.max - lane.min)),
    );
    lane.mutes.fill(false);
    renderLane(lane);
    markCustom();
  });
  $("#pattern").addEventListener("change", (e) => {
    const name = e.target.value;
    if (name === "custom") return;
    const lengths = {
      bloom: [8, 5, 7, 4],
      up: [8, 8, 8, 8],
      down: [8, 8, 8, 8],
      drift: [5, 8, 7, 3],
      rain: [12, 5, 9, 4],
    };
    lanes.forEach((lane, j) => {
      lane.length = lengths[name][j];
      lane.division = 1;
      lane.mutes.fill(false);
      lane.values = Array.from({ length: 16 }, (_, i) => {
        if (lane.id === "note")
          return name === "down"
            ? 8 - (i % 8)
            : name === "rain"
              ? 1 + Math.floor(Math.random() * 8)
              : name === "bloom"
                ? laneSpecs[0].values[i % 8]
                : (i % 8) + 1;
        if (lane.id === "octave")
          return name === "up" || name === "down"
            ? 0
            : laneSpecs[3].values[i % 4];
        return laneSpecs[j].values[i % laneSpecs[j].values.length];
      });
      renderLane(lane);
    });
    if (linked) {
      const length = lanes[0].length;
      lanes.forEach((lane) => {
        lane.length = length;
        renderLane(lane);
      });
    }
    if (playing) restart();
  });

  function stepTime(step) {
    return anchor + ((step + (step % 2 ? swing : 0)) * rate * 60) / bpm;
  }
  function degreeNote(degree) {
    const index = Math.max(0, degree - 1);
    return (
      chordNotes[index % chordNotes.length] +
      12 * Math.floor(index / chordNotes.length)
    );
  }
  function schedule() {
    if (!playing || bypass || !ctx) return;
    const now = ctx.currentTime;
    if (stepTime(nextStep) < now - 0.2) {
      anchor = now + 0.02;
      nextStep = 0;
    }
    while (stepTime(nextStep) < now + 0.09) {
      const when = stepTime(nextStep),
        step = nextStep++;
      const note = laneValue(lanes[0], step),
        gate = laneValue(lanes[1], step),
        velocity = laneValue(lanes[2], step),
        oct = laneValue(lanes[3], step);
      const duration = ((stepTime(step + 1) - when) * gate) / 100;
      if (note && gate && velocity) {
        const midi = clamp(degreeNote(note) + oct * 12, 0, 127);
        playNote(midi, when, duration, velocity / 100);
        scheduledSteps.push({ when, step, midi });
      } else scheduledSteps.push({ when, step, midi: null });
    }
  }

  function holdChord() {
    silence("arp");
    chordNotes.forEach((m) =>
      playNote(m, ctx.currentTime + 0.01, Infinity, 0.65),
    );
  }
  async function start() {
    if (playing || starting) return;
    starting = true;
    const request = ++generation;
    const ready = await audio();
    if (request !== generation) return;
    starting = false;
    if (!ready) return;
    playing = true;
    restart();
    timer = window.setInterval(schedule, 25);
    updateTransport();
  }
  function stop() {
    generation++;
    starting = false;
    playing = false;
    clearInterval(timer);
    timer = null;
    silence();
    heldKeys.clear();
    scheduledSteps.length = 0;
    lanes.forEach((l) => l.cells.forEach((c) => c.classList.remove("active")));
    liveStep = -1;
    updatePlayheads();
    updateTransport();
  }
  function restart() {
    if (!ctx || !playing) return;
    silence("arp");
    scheduledSteps.length = 0;
    nextStep = 0;
    liveStep = -1;
    updatePlayheads();
    anchor = ctx.currentTime + 0.035;
    if (bypass) holdChord();
    else schedule();
  }
  function updateTransport() {
    $("#play").setAttribute("aria-pressed", String(playing));
    $("#play").setAttribute("aria-label", playing ? "Stop" : "Play");
    $("#play-icon").setAttribute(
      "d",
      playing ? "M5 5H15V15H5Z" : "M6 4L15 10L6 16Z",
    );
    $("#play").title = playing ? "Stop (Space)" : "Play (Space)";
  }
  $("#play").addEventListener("click", () =>
    playing || starting ? stop() : start(),
  );
  $("#arp-bypass").addEventListener("click", () => {
    bypass = !bypass;
    $("#arp-bypass").setAttribute("aria-pressed", String(bypass));
    $("#arp-panel").classList.toggle("bypassed", bypass);
    if (playing) restart();
  });
  $("#tempo").addEventListener("input", (e) => {
    bpm = clamp(Math.round(Number(e.target.value) || 112), 40, 240);
    e.target.value = bpm;
    $("#tempo-out").textContent = bpm;
    if (playing) restart();
  });
  $("#rate").addEventListener("change", (e) => {
    rate = Number(e.target.value);
    if (playing) restart();
  });
  $("#swing").addEventListener("input", (e) => {
    swing = Number(e.target.value);
    $("#swing").title = `Swing: ${Math.round(swing * 100)}%`;
    if (playing) restart();
  });

  // Computer keyboard notes have real note-off and release behavior.
  const keyNotes = {
    KeyA: 60,
    KeyW: 61,
    KeyS: 62,
    KeyE: 63,
    KeyD: 64,
    KeyF: 65,
    KeyT: 66,
    KeyG: 67,
    KeyY: 68,
    KeyH: 69,
    KeyU: 70,
    KeyJ: 71,
    KeyK: 72,
  };
  let octave = 0;
  document.addEventListener("keydown", async (e) => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest("input,select,textarea,[role=slider]")) return;
    if (e.code === "Space") {
      if (e.target.closest("button,[role=button]")) return;
      e.preventDefault();
      playing || starting ? stop() : start();
      return;
    }
    if (e.code === "KeyZ") {
      octave = Math.max(-2, octave - 1);
      return;
    }
    if (e.code === "KeyX") {
      octave = Math.min(2, octave + 1);
      return;
    }
    if (keyNotes[e.code] === undefined) return;
    e.preventDefault();
    const code = e.code,
      midi = keyNotes[code] + octave * 12;
    const marker = {};
    heldKeys.set(code, marker);
    if (!(await audio()) || heldKeys.get(code) !== marker) return;
    const voice = playNote(
      midi,
      ctx.currentTime + 0.005,
      Infinity,
      0.8,
      "keyboard",
    );
    heldKeys.set(code, voice);
  });
  document.addEventListener("keyup", (e) => {
    const voice = heldKeys.get(e.code);
    heldKeys.delete(e.code);
    if (voice?.amp) releaseVoice(voice, ctx.currentTime);
  });
  window.addEventListener("blur", () => {
    heldKeys.forEach((v) => {
      if (v?.amp) releaseVoice(v, ctx.currentTime);
    });
    heldKeys.clear();
  });

  // Patch cables follow the modules, including after a drag or responsive reflow.
  let topZ = 3;
  function updateWires() {
    [
      ["chord-out", "arp-in", "chord-wire"],
      ["arp-out", "synth-in", "synth-wire"],
    ].forEach(([from, to, id]) => {
      const a = $(`[data-port="${from}"] i`).getBoundingClientRect(),
        b = $(`[data-port="${to}"] i`).getBoundingClientRect();
      const x1 = a.x + a.width / 2,
        y1 = a.y + a.height / 2,
        x2 = b.x + b.width / 2,
        y2 = b.y + b.height / 2;
      const bend = Math.max(24, Math.abs(x2 - x1) * 0.5);
      $(`#${id}`).setAttribute(
        "d",
        `M${x1} ${y1}C${x1 + bend} ${y1} ${x2 - bend} ${y2} ${x2} ${y2}`,
      );
    });
  }
  $$(".panel").forEach((panel) => {
    const bar = panel;
    let drag;
    let offset = { x: 0, y: 0 };
    function placePanel() {
      offset = { x: 0, y: 0 };
      panel.style.transform = "";
      if (innerWidth <= 1030) return;
      const saved = INITIAL_STATE.layout[panel.id];
      const rect = panel.getBoundingClientRect();
      offset = {
        x: clamp(
          saved.x,
          8 - rect.left,
          Math.max(8, innerWidth - rect.width - 8) - rect.left,
        ),
        y: clamp(
          saved.y,
          8 - rect.top,
          Math.max(8, innerHeight - rect.height - 8) - rect.top,
        ),
      };
      panel.style.transform = `translate(${offset.x}px, ${offset.y}px)`;
    }
    placePanel();
    bar.addEventListener("pointerdown", (e) => {
      if (
        e.button !== 0 ||
        innerWidth < 631 ||
        (e.target !== panel && !e.target.classList.contains("panel-content"))
      )
        return;
      e.preventDefault();
      const rect = panel.getBoundingClientRect();
      drag = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y, rect };
      bar.setPointerCapture(e.pointerId);
      panel.style.zIndex = ++topZ;
    });
    bar.addEventListener("pointermove", (e) => {
      if (!drag) return;
      offset = {
        x:
          drag.ox +
          clamp(
            e.clientX - drag.x,
            -drag.rect.left + 8,
            innerWidth - drag.rect.right - 8,
          ),
        y:
          drag.oy +
          clamp(
            e.clientY - drag.y,
            -drag.rect.top + 8,
            innerHeight - 42 - drag.rect.top,
          ),
      };
      panel.style.transform = `translate(${offset.x}px,${offset.y}px)`;
      updateWires();
    });
    ["pointerup", "pointercancel", "lostpointercapture"].forEach((t) =>
      bar.addEventListener(t, () => {
        drag = null;
      }),
    );
    window.addEventListener("resize", placePanel);
  });
  window.addEventListener("scroll", updateWires, { passive: true });
  const resizeObserver = new ResizeObserver(updateWires);
  $$(".panel").forEach((p) => resizeObserver.observe(p));

  // Flowers and grass share the ground; rain has its own viewport-sized layer.
  const canvas = $("#garden"),
    garden = canvas.getContext("2d"),
    rainCanvas = $("#rain"),
    rain = rainCanvas.getContext("2d"),
    scope = $("#scope"),
    scopeCtx = scope.getContext("2d");
  let width = 0,
    height = 0,
    dpr = 1,
    scopeWidth = 0,
    scopeHeight = 0;
  const flowerPositions = [0.045, 0.16, 0.32, 0.51, 0.69, 0.85, 0.96];
  const flowerEnergy = flowerPositions.map(() => 0);
  const flowerPulses = flowerPositions.map(() => 0);
  const drops = [],
    grass = [];
  let lastFrame = 0,
    fieldTime = 0,
    fieldEnergy = 0;
  let rainActivity = 0,
    storm = 0,
    rainAmount = 0;
  const smooth = (current, target, delta, speed) =>
    current + (target - current) * (1 - Math.exp(-delta * speed));
  const seed = (n) => {
    const value = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return value - Math.floor(value);
  };

  function resize() {
    const previousWidth = width || innerWidth,
      previousHeight = height || innerHeight;
    width = innerWidth;
    height = innerHeight;
    dpr = Math.min(devicePixelRatio || 1, 2);
    [canvas, rainCanvas].forEach((layer) => {
      layer.width = Math.round(width * dpr);
      layer.height = Math.round(height * dpr);
    });
    garden.setTransform(dpr, 0, 0, dpr, 0, 0);
    rain.setTransform(dpr, 0, 0, dpr, 0, 0);
    drops.forEach((drop) => {
      drop.x *= width / previousWidth;
      drop.y *= height / previousHeight;
    });
    grass.length = 0;
    const tufts = Math.min(180, Math.ceil(width / 9));
    for (let i = 0; i < tufts; i++)
      grass.push({
        x: ((i + seed(i)) / tufts) * width,
        size: seed(i + 31),
        phase: seed(i + 73) * Math.PI * 2,
      });
    const rect = scope.getBoundingClientRect();
    scopeWidth = rect.width;
    scopeHeight = rect.height;
    scope.width = Math.round(scopeWidth * dpr);
    scope.height = Math.round(scopeHeight * dpr);
    scopeCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    updateWires();
  }
  function setMotion(value) {
    motion = value;
    $("#motion").setAttribute("aria-pressed", String(motion));
    $("#motion").title = motion ? "Pause animation" : "Enable animation";
    if (!motion) {
      drops.length = 0;
      rainAmount = 0;
      rainActivity = 0;
      storm = 0;
      fieldEnergy = 0;
      flowerEnergy.fill(0);
      flowerPulses.fill(0);
      rain.clearRect(0, 0, width, height);
    }
  }
  $("#motion").addEventListener("click", () => setMotion(!motion));
  setMotion(motion);
  matchMedia("(prefers-reduced-motion: reduce)").addEventListener(
    "change",
    (e) => setMotion(!e.matches),
  );

  function updateField(delta, now) {
    const energy = flowerPositions.map(() => 0);
    let total = 0;
    visualNotes.forEach((n) => {
      if (now < n.voice.t || now >= n.voice.off + n.voice.r) return;
      const level = envelopeAt(n.voice, now) * n.voice.velocity;
      energy[n.voice.midi % energy.length] += level;
      total += level;
    });
    const target = motion ? clamp(total * 0.6, 0, 1.7) : 0;
    fieldEnergy = smooth(
      fieldEnergy,
      target,
      delta,
      target > fieldEnergy ? 9 : 3,
    );
    flowerEnergy.forEach((value, i) => {
      const bloom = motion
        ? clamp(target * 0.65 + energy[i] * 1.25 + flowerPulses[i] * 0.45, 0, 2)
        : 0;
      flowerEnergy[i] = smooth(
        value,
        bloom,
        delta,
        bloom > value ? 10 : 2 + 1 / (state.release + 0.2),
      );
      flowerPulses[i] *= Math.exp(-delta * 2.2);
    });
    rainActivity *= Math.exp(-delta * 1.25);
    const weather = motion
      ? clamp(rainActivity * 0.36 + fieldEnergy * 0.55, 0, 1.8)
      : 0;
    storm = smooth(storm, weather, delta, weather > storm ? 3 : 1.5);
  }

  // A continuous particle field: note activity changes density, never positions.
  function makeDrop(scattered = false) {
    const depth = 0.35 + Math.random() * 0.65;
    const drop = {
      x: 0,
      y: 0,
      depth,
      speed: 380 + depth * 430,
      length: 10 + depth * 22,
      alpha: 0.09 + depth * 0.13,
    };
    resetDrop(drop, scattered);
    return drop;
  }
  function resetDrop(drop, scattered = false) {
    if (scattered) {
      drop.x = Math.random() * width;
      drop.y = Math.random() * height;
      return;
    }
    // Feed both the top and windward edge so the bottom-left stays rainy too.
    const leftShare = (height * 0.48) / (width + height * 0.48);
    if (Math.random() < leftShare) {
      drop.x = -35;
      drop.y = Math.random() * height;
    } else {
      drop.x = Math.random() * (width + 70) - 35;
      drop.y = -45;
    }
  }
  function drawRain(delta) {
    rain.clearRect(0, 0, width, height);
    if (!motion) return;
    const area = clamp((width * height) / 1000000, 0.4, 1.8);
    const target = clamp(area * (40 + storm * 230), 16, 620);
    rainAmount = smooth(rainAmount, target, delta, 2.7);
    const count = Math.ceil(rainAmount);
    while (drops.length < count) drops.push(makeDrop(true));
    if (drops.length > count) drops.length = count;
    const wind = 0.48 + Math.sin(fieldTime * 0.27) * 0.05;
    const brightness = Math.sqrt(state.level / 100);
    rain.lineCap = "round";
    drops.forEach((drop) => {
      const speed = drop.speed * (1 + storm * 0.24);
      drop.x += speed * wind * delta;
      drop.y += speed * delta;
      if (drop.y > height + 55 || drop.x > width + 55) resetDrop(drop);
      const length = drop.length * (1 + storm * 0.3 + state.release * 0.12);
      rain.strokeStyle = `rgba(255,255,255,${drop.alpha * brightness * (0.8 + storm * 0.25)})`;
      rain.lineWidth = 0.55 + drop.depth * 0.45;
      rain.beginPath();
      rain.moveTo(drop.x, drop.y);
      rain.lineTo(drop.x - length * wind, drop.y - length);
      rain.stroke();
    });
  }

  function flowerStemHeight(index) {
    const base =
      index === 0 || index === 6
        ? Math.max(145, height * 0.48)
        : 108 + (index % 3) * 19;
    return base + (state.sub / 100) * 125 + (index % 2) * 30;
  }
  function drawFlower(index, time) {
    const x = flowerPositions[index] * width,
      energy = flowerEnergy[index];
    const stemHeight = flowerStemHeight(index) + energy * 22;
    const breeze = motion
      ? Math.sin(time * (0.8 + storm * 0.16) + index * 0.9)
      : 0;
    const sway = motion
      ? breeze * (9 + state.detune * 0.48 + energy * 17) + storm * 12
      : 0;
    const bloom = 23 + state.sustain * 27 + energy * 29;
    const openness = 0.2 + (state.detune / DETUNE_RANGE_CENTS) * 1.65;
    const alpha =
      clamp(0.42 + energy * 0.28, 0, 0.94) * Math.sqrt(state.level / 100);
    garden.save();
    garden.translate(x, height + 12);
    garden.lineWidth = 0.85;
    garden.strokeStyle = `rgba(255,255,255,${alpha})`;
    garden.beginPath();
    garden.moveTo(0, 0);
    garden.bezierCurveTo(
      -9 + sway * 0.15,
      -stemHeight * 0.3,
      sway * 0.65,
      -stemHeight * 0.72,
      sway,
      -stemHeight - 12,
    );
    garden.stroke();
    const leafOpen = state.tone / 100;
    for (let side = -1; side <= 1; side += 2) {
      const fraction = side === 1 ? 0.38 : 0.64;
      const ly = -stemHeight * fraction,
        lx = sway * fraction * fraction;
      const flutter = motion
        ? Math.sin(time * 1.8 + index * 2 + side) * (3 + energy * 8)
        : 0;
      const reach = 16 + leafOpen * 48 + energy * 10,
        lift = 15 + leafOpen * 29;
      garden.beginPath();
      garden.moveTo(lx, ly);
      garden.bezierCurveTo(
        lx + side * reach * 0.7,
        ly + flutter,
        lx + side * reach,
        ly - lift - flutter,
        lx,
        ly,
      );
      garden.stroke();
      garden.beginPath();
      garden.moveTo(lx, ly);
      garden.lineTo(lx + side * reach * 0.63, ly - lift * 0.44);
      garden.stroke();
    }
    garden.translate(sway, -stemHeight - 12);
    garden.rotate(breeze * 0.1 + energy * 0.06);
    const count = state.voices * 2 + 3;
    for (let petal = 0; petal < count; petal++) {
      const angle =
        (petal / count) * Math.PI * 2 +
        index * 0.3 +
        (state.wave === "triangle" ? Math.PI / 4 : 0);
      const flutter = motion
        ? Math.sin(time * 1.5 + petal * 0.8 + index) * (0.03 + energy * 0.055)
        : 0;
      const length = bloom * (0.65 + openness * 0.8) * (1 + flutter);
      const spread = (3 + openness * 16) * (0.55 + (state.morph / 100) * 1.45);
      const curl = (state.morph / 100 - 0.5) * length * 0.25;
      garden.save();
      garden.rotate(angle);
      garden.beginPath();
      garden.moveTo(0, -4);
      garden.bezierCurveTo(
        -spread,
        -length * 0.36,
        -spread + curl,
        -length,
        curl,
        -length,
      );
      garden.bezierCurveTo(
        spread + curl,
        -length,
        spread,
        -length * 0.36,
        0,
        -4,
      );
      garden.stroke();
      garden.restore();
    }
    garden.beginPath();
    garden.arc(0, 0, 4.5 + energy * 4, 0, Math.PI * 2);
    garden.stroke();
    garden.restore();
    if (energy > 0.03 && state.resonance > 0) {
      const ripple = (time * 0.8 + index * 0.13) % 1;
      garden.strokeStyle = `rgba(255,255,255,${((alpha * (1 - ripple) * state.resonance) / 100) * 0.7})`;
      garden.beginPath();
      garden.ellipse(
        x,
        height - 9,
        10 + ripple * (35 + state.resonance * 0.6),
        2 + ripple * 10,
        0,
        0,
        Math.PI * 2,
      );
      garden.stroke();
    }
  }
  function drawGrass(time) {
    const brightness = Math.sqrt(state.level / 100);
    grass.forEach((tuft, index) => {
      const growth = 18 + tuft.size * 48 + state.sub * 0.24 + fieldEnergy * 20;
      const wind = motion
        ? Math.sin(time * 1.3 + tuft.phase + (tuft.x / width) * 2) *
            (5 + state.detune * 0.22 + fieldEnergy * 8) +
          storm * 9
        : 0;
      garden.strokeStyle = `rgba(255,255,255,${(0.2 + tuft.size * 0.2 + fieldEnergy * 0.1) * brightness})`;
      garden.lineWidth = 0.65 + tuft.size * 0.25;
      for (let blade = -1; blade <= 1; blade++) {
        const reach = blade * (7 + state.tone * 0.12 + tuft.size * 8);
        const tall =
          growth * (blade === 0 ? 1 : 0.58 + seed(index + blade + 91) * 0.3);
        garden.beginPath();
        garden.moveTo(tuft.x + blade * 2, height + 2);
        garden.bezierCurveTo(
          tuft.x + wind * 0.2,
          height - tall * 0.3,
          tuft.x + reach * 0.6 + wind * 0.7,
          height - tall * 0.75,
          tuft.x + reach + wind,
          height - tall,
        );
        garden.stroke();
      }
    });
  }
  const scopeData = new Float32Array(1024);
  function drawScope() {
    scopeCtx.clearRect(0, 0, scopeWidth, scopeHeight);
    if (analyser && motion) analyser.getFloatTimeDomainData(scopeData);
    else scopeData.fill(0);
    scopeCtx.beginPath();
    scopeCtx.strokeStyle = "#aaa";
    scopeCtx.lineWidth = 0.8;
    for (let i = 0; i < scopeData.length; i += 2) {
      const x = (i / (scopeData.length - 1)) * scopeWidth,
        y = scopeHeight / 2 - scopeData[i] * scopeHeight * 1.4;
      i ? scopeCtx.lineTo(x, y) : scopeCtx.moveTo(x, y);
    }
    scopeCtx.stroke();
  }
  function animate(timestamp) {
    requestAnimationFrame(animate);
    if (timestamp - lastFrame < 32) return;
    const delta = Math.min(0.1, (timestamp - lastFrame) / 1000);
    lastFrame = timestamp;
    if (motion) fieldTime += delta;
    const now = ctx?.currentTime || 0;
    let current;
    while (scheduledSteps.length && scheduledSteps[0].when <= now)
      current = scheduledSteps.shift();
    if (current) {
      liveStep = current.step;
      updatePlayheads();
    }
    visualNotes.forEach((n) => {
      if (!n.born && n.voice.t <= now) {
        n.born = true;
        lastVisual = n.voice;
        if (motion) {
          rainActivity = Math.min(10, rainActivity + n.voice.velocity * 0.85);
          const flower = n.voice.midi % flowerPositions.length;
          flowerPulses[flower] = Math.min(
            2,
            flowerPulses[flower] + n.voice.velocity,
          );
        }
      }
    });
    for (let i = visualNotes.length - 1; i >= 0; i--)
      if (now > visualNotes[i].voice.off + visualNotes[i].voice.r + 1)
        visualNotes.splice(i, 1);
    updateField(delta, now);
    garden.clearRect(0, 0, width, height);
    flowerPositions.forEach((_, i) => drawFlower(i, fieldTime));
    drawGrass(fieldTime);
    drawRain(delta);
    const voice = lastVisual,
      envCursor = $("#env-cursor");
    if (motion && voice && now >= voice.t && now < voice.off + voice.r) {
      const elapsed = now - voice.t;
      let x;
      if (now >= voice.off)
        x =
          envPoints[2].x +
          (envPoints[3].x - envPoints[2].x) *
            clamp((now - voice.off) / voice.r, 0, 1);
      else if (elapsed < voice.a)
        x = 12 + ((envPoints[0].x - 12) * elapsed) / voice.a;
      else if (elapsed < voice.a + voice.d)
        x =
          envPoints[0].x +
          ((envPoints[1].x - envPoints[0].x) * (elapsed - voice.a)) / voice.d;
      else
        x =
          envPoints[1].x +
          ((now - voice.t) % 1) * (envPoints[2].x - envPoints[1].x);
      envCursor.setAttribute("cx", x);
      envCursor.setAttribute("cy", 96 - envelopeAt(voice, now) * 82);
      envCursor.setAttribute("opacity", 0.9);
    } else envCursor.setAttribute("opacity", 0);
    ["chord", "synth"].forEach((id, i) => {
      const circle = $(`#${id}-pulse`),
        path = $(`#${id === "chord" ? "chord" : "synth"}-wire`);
      if (motion && voice && now >= voice.t && now - voice.t < 0.4) {
        const progress = clamp((now - voice.t) / 0.4 + i * 0.12, 0, 1);
        const p = path.getPointAtLength(path.getTotalLength() * progress);
        circle.setAttribute("cx", p.x);
        circle.setAttribute("cy", p.y);
        circle.style.opacity = String(1 - progress);
      } else circle.style.opacity = "0";
    });
    drawScope();
  }
  // Restore controls without firing change handlers that regenerate the saved arp.
  Object.entries({
    tempo: bpm,
    rate,
    swing,
    extension: INITIAL_STATE.chord.extension,
    voicing: INITIAL_STATE.chord.inversion,
  }).forEach(([id, value]) => {
    $(`#${id}`).value = String(value);
  });
  $("#tempo-out").textContent = bpm;
  $("#swing").title = `Swing: ${Math.round(swing * 100)}%`;
  if (INITIAL_STATE.arp.pattern === "custom") markCustom();
  else $("#pattern").value = INITIAL_STATE.arp.pattern;
  $("#link-lengths").setAttribute("aria-pressed", String(linked));
  $("#retrigger").setAttribute("aria-pressed", String(retrigger));
  $("#arp-bypass").setAttribute("aria-pressed", String(bypass));
  $("#arp-panel").classList.toggle("bypassed", bypass);
  syncControls.forEach((sync) => sync());
  updateChord();
  updateTransport();
  window.addEventListener("resize", resize);
  resize();
  requestAnimationFrame(animate);
})();
