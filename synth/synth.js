(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const NS = "http://www.w3.org/2000/svg";
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const svg = (tag, attrs = {}) => {
    const el = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([key, value]) =>
      el.setAttribute(key, value),
    );
    return el;
  };
  const state = {
    wave: "sawtooth",
    morph: 20,
    voices: 3,
    detune: 14,
    sub: 12,
    attack: 0.035,
    decay: 0.3,
    sustain: 0.48,
    release: 0.7,
    tone: 64,
    resonance: 12,
    level: 55,
  };
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
    bypass = false,
    timer = null,
    generation = 0;
  let bpm = 112,
    rate = 0.5,
    swing = 0,
    anchor = 0,
    nextStep = 0;
  let counterRatio = null,
    nextCounterStep = 0;
  let motion = !matchMedia("(prefers-reduced-motion: reduce)").matches;
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
      const spread = state.voices === 1 ? 0 : (i / (state.voices - 1)) * 2 - 1;
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
  const controlDescriptions = {
    voices: "unison → petal count",
    detune: "detune → petals open and spread",
    morph: "wavetable → petal curvature",
    sub: "sub oscillator → stem height",
    attack: "attack → how slowly the flower opens",
    decay: "decay → bloom settling time",
    sustain: "sustain → the size of the held bloom",
    release: "release → how slowly petals close",
    tone: "cutoff → leaf opening",
    resonance: "resonance → ripples around the flowers",
    level: "level → the brightness of the garden",
  };
  const definitions = {
    voices: [1, 7, 1, "unison", (v) => String(v)],
    detune: [0, 60, 1, "detune", (v) => `${v}ct`],
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
      min + Math.round((value - min) / step) * step,
      min,
      max,
    );
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }
  function control(id, target, envelope = false) {
    const [min, max, step, label, format] = definitions[id];
    const box = document.createElement("div");
    box.className = envelope ? "env-control" : "knob";
    const input = `<input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${state[id]}" aria-label="${label}"/>`;
    if (envelope)
      box.innerHTML = `<div class="env-label"><label for="${id}">${label}</label><output id="${id}-out">${format(state[id])}</output></div>${input}`;
    else
      box.innerHTML = `<div class="knob-face">${input}<svg viewBox="0 0 48 48" aria-hidden="true"><path class="knob-track" d="${arc(-135, 135)}"/><path class="knob-arc"/><circle class="knob-body" cx="24" cy="24" r="16"/><g class="knob-pointer"><path d="M24 19V11"/></g></svg></div><label for="${id}">${label}</label><output id="${id}-out">${format(state[id])}</output>`;
    $(target).append(box);
    const range = box.querySelector("input");
    const sync = () => {
      state[id] = Number(range.value);
      $(`#${id}-out`).textContent = format(state[id]);
      if (!envelope) {
        const angle = -135 + ((state[id] - min) / (max - min)) * 270;
        box
          .querySelector(".knob-pointer")
          .setAttribute("transform", `rotate(${angle} 24 24)`);
        box
          .querySelector(".knob-arc")
          .setAttribute("d", arc(-135, angle + 0.001));
      }
      if (id === "morph" || id === "voices" || id === "detune") drawWave();
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
      if (id === "detune" && ctx)
        activeVoices.forEach((v) =>
          v.oscs
            .slice(0, v.unison)
            .forEach((o, i) =>
              o.detune.setTargetAtTime(
                (v.unison === 1 ? 0 : (i / (v.unison - 1)) * 2 - 1) *
                  state.detune,
                ctx.currentTime,
                0.03,
              ),
            ),
        );
    };
    range.addEventListener("input", sync);
    box.addEventListener("pointerenter", () => {
      $("#visual-description").textContent = controlDescriptions[id];
    });
    box.addEventListener("focusin", () => {
      $("#visual-description").textContent = controlDescriptions[id];
    });
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
  const defaults = { ...state };
  const syncControls = [];
  ["voices", "detune", "morph", "sub"].forEach((id) =>
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
    $("#morph-caption").textContent = state.morph;
    $("#wave-name").textContent =
      `${state.wave === "sawtooth" ? "saw" : state.wave} / sine`;
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
    $("#visual-description").textContent = controlDescriptions[id];
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
  let chordRoot = 0,
    chordMinor = false,
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
    $("#chord-quality").textContent =
      extension === "sus" ? "suspended" : chordMinor ? "minor" : "major";
    $("#chord-notes").replaceChildren(
      ...chordNotes.map((midi) => {
        const span = document.createElement("span");
        span.textContent = noteName(midi);
        return span;
      }),
    );
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

  // Independently sized and clock-divided lanes make the combined pattern evolve.
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
      name: "velocity",
      min: 10,
      max: 100,
      values: [90, 50, 68, 44, 78, 55, 65],
      length: 7,
    },
    {
      id: "octave",
      name: "octave",
      min: -2,
      max: 2,
      values: [0, 0, 1, 0],
      length: 4,
    },
    {
      id: "harmony",
      name: "harmony",
      min: 0,
      max: 7,
      values: [0, 0, 0, 2, 0, 0, 0, 4],
      length: 8,
    },
  ];
  const lanes = laneSpecs.map((spec) => ({
    ...spec,
    division: 1,
    values: Array.from(
      { length: 16 },
      (_, i) => spec.values[i % spec.values.length],
    ),
    mutes: Array(16).fill(false),
    cells: [],
  }));
  let selectedLane = "note",
    linked = false;
  function selectLane(id) {
    selectedLane = id;
    $$(".lane").forEach((el) =>
      el.classList.toggle("selected", el.dataset.lane === id),
    );
  }
  function renderLane(lane) {
    lane.cells.forEach((cell, i) => {
      cell.classList.toggle("inactive", i >= lane.length);
      cell.classList.toggle("muted", lane.mutes[i]);
      cell.querySelector(".bar").style.height =
        `${((lane.values[i] - lane.min) / (lane.max - lane.min)) * 80 + 10}%`;
      cell.querySelector(".step-value").textContent = lane.mutes[i]
        ? "·"
        : lane.id === "gate" || lane.id === "velocity"
          ? ""
          : lane.values[i];
      cell.setAttribute(
        "aria-label",
        `${lane.name} step ${i + 1}, ${lane.mutes[i] ? "muted" : lane.values[i]}${i >= lane.length ? ", outside loop" : ""}`,
      );
      cell.setAttribute("aria-valuenow", lane.values[i]);
      cell.setAttribute(
        "aria-valuetext",
        lane.mutes[i] ? "muted" : String(lane.values[i]),
      );
    });
    $(`#length-${lane.id}`).value = lane.length;
    $(`#division-${lane.id}`).value = lane.division;
    $("#cycle-label").textContent = lanes.map((l) => l.length).join(" : ");
  }
  lanes.forEach((lane) => {
    const el = document.createElement("div");
    el.className = "lane";
    el.dataset.lane = lane.id;
    el.innerHTML = `<div class="lane-heading"><button type="button" class="lane-select">${lane.name}</button><div class="lane-options"><label for="length-${lane.id}">steps</label><input id="length-${lane.id}" type="number" min="1" max="16" value="${lane.length}" aria-label="${lane.name} lane length"/><label for="division-${lane.id}">clk</label><select id="division-${lane.id}" aria-label="${lane.name} clock division"><option value="1">÷1</option><option value="2">÷2</option><option value="3">÷3</option><option value="4">÷4</option></select></div></div><div class="steps"></div>`;
    $("#lanes").append(el);
    el.querySelector(".lane-select").addEventListener("click", () =>
      selectLane(lane.id),
    );
    let drag;
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
    }
    function paint(e) {
      const rect = steps.getBoundingClientRect();
      const i = clamp(
        Math.floor(((e.clientX - rect.left) / rect.width) * 16),
        0,
        15,
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
      const cell = e.target.closest(".step");
      if (!cell || e.button !== 0) return;
      selectLane(lane.id);
      cell.focus();
      e.preventDefault();
      steps.setPointerCapture(e.pointerId);
      drag = {
        x: e.clientX,
        y: e.clientY,
        index: Number(cell.dataset.index),
        moved: false,
      };
      if (lane.id !== "note") {
        paint(e);
        drag.moved = true;
      }
    });
    steps.addEventListener("pointermove", (e) => {
      if (!drag) return;
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 3)
        drag.moved = true;
      if (drag.moved) paint(e);
    });
    steps.addEventListener("pointerup", () => {
      if (drag && !drag.moved) {
        lane.mutes[drag.index] = !lane.mutes[drag.index];
        renderLane(lane);
        markCustom();
      }
      drag = null;
    });
    ["pointercancel", "lostpointercapture"].forEach((t) =>
      steps.addEventListener(t, () => {
        drag = null;
      }),
    );
    $(`#length-${lane.id}`).addEventListener("change", (e) => {
      const length = clamp(Math.round(Number(e.target.value) || 1), 1, 16);
      (linked ? lanes : [lane]).forEach((l) => {
        l.length = length;
        renderLane(l);
      });
      markCustom();
    });
    $(`#division-${lane.id}`).addEventListener("change", (e) => {
      lane.division = Number(e.target.value);
      markCustom();
    });
    renderLane(lane);
  });
  selectLane("note");
  function markCustom() {
    if (!$("#pattern option[value=custom]")) {
      const option = document.createElement("option");
      option.value = "custom";
      option.textContent = "your own weather";
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
    $("#link-lengths").textContent = `${linked ? "●" : "○"} link lengths`;
    if (linked) {
      const length = lanes.find((l) => l.id === selectedLane).length;
      lanes.forEach((l) => {
        l.length = length;
        renderLane(l);
      });
      markCustom();
    }
  });
  $("#randomize").addEventListener("click", () => {
    const lane = lanes.find((l) => l.id === selectedLane);
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
    const patterns = {
      bloom: [8, 5, 7, 4, 8],
      up: [8, 8, 8, 8, 8],
      down: [8, 8, 8, 8, 8],
      drift: [5, 8, 7, 3, 8],
      rain: [12, 5, 9, 4, 7],
    };
    lanes.forEach((lane, j) => {
      lane.length = patterns[name][j];
      lane.division = 1;
      lane.mutes.fill(false);
      lane.values = Array.from({ length: 16 }, (_, i) => {
        if (lane.id === "note")
          return name === "down"
            ? 8 - (i % 8)
            : name === "rain"
              ? 1 + ((i * 7 + 3) % 8)
              : name === "bloom"
                ? laneSpecs[0].values[i % 8]
                : (i % 8) + 1;
        if (lane.id === "octave")
          return name === "up" || name === "down"
            ? 0
            : laneSpecs[3].values[i % 4];
        if (lane.id === "harmony")
          return name === "rain" && i % 4 === 0
            ? 2
            : name === "bloom"
              ? laneSpecs[4].values[i % 8]
              : 0;
        return laneSpecs[j].values[i % laneSpecs[j].values.length];
      });
      renderLane(lane);
    });
    if (linked)
      lanes.forEach((l) => {
        l.length = lanes[0].length;
        renderLane(l);
      });
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
      nextCounterStep = 0;
    }
    while (stepTime(nextStep) < now + 0.09) {
      const when = stepTime(nextStep),
        step = nextStep++;
      const note = laneValue(lanes[0], step),
        gate = laneValue(lanes[1], step),
        velocity = laneValue(lanes[2], step),
        oct = laneValue(lanes[3], step),
        harmony = laneValue(lanes[4], step);
      const duration = ((stepTime(step + 1) - when) * gate) / 100;
      if (note && gate && velocity) {
        const midi = clamp(degreeNote(note) + oct * 12, 0, 127);
        playNote(midi, when, duration, velocity / 100);
        if (harmony)
          playNote(
            clamp(midi + harmony, 0, 127),
            when,
            duration,
            (velocity / 100) * 0.65,
          );
        scheduledSteps.push({ when, step, midi });
      } else scheduledSteps.push({ when, step, midi: null });
    }
    // A separate clock places counter-rhythm notes between master steps.
    if (counterRatio) {
      const interval =
        (((rate * 60) / bpm) * counterRatio[1]) / counterRatio[0];
      while (anchor + nextCounterStep * interval < now + 0.09) {
        const step = nextCounterStep++;
        const when = anchor + step * interval;
        const note = laneValue(lanes[0], step);
        const gate = laneValue(lanes[1], step);
        const velocity = laneValue(lanes[2], step);
        const octave = laneValue(lanes[3], step);
        if (note && gate && velocity) {
          const midi = clamp(degreeNote(note + 1) + octave * 12, 0, 127);
          playNote(
            midi,
            when,
            (interval * gate) / 100,
            (velocity / 100) * 0.65,
          );
        }
      }
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
    $("#current-note").textContent = "waiting for rain";
    updateTransport();
  }
  function restart() {
    if (!ctx || !playing) return;
    silence("arp");
    scheduledSteps.length = 0;
    nextStep = 0;
    nextCounterStep = 0;
    anchor = ctx.currentTime + 0.035;
    if (bypass) holdChord();
    else schedule();
  }
  function updateTransport() {
    $("#play").setAttribute("aria-pressed", String(playing));
    $("#play").setAttribute(
      "aria-label",
      playing ? "Stop garden" : "Play garden",
    );
    $("#play-icon").textContent = playing ? "□" : "▷";
    $("#play-label").textContent = playing ? "stop" : "play";
    $("#transport-status").textContent = playing ? "in bloom" : "at rest";
    $("#status-dot").classList.toggle("playing", playing);
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
  $("#tempo").addEventListener("change", (e) => {
    bpm = clamp(Math.round(Number(e.target.value) || 112), 40, 240);
    e.target.value = bpm;
    if (playing) restart();
  });
  $("#rate").addEventListener("change", (e) => {
    rate = Number(e.target.value);
    if (playing) restart();
  });
  $("#counter-rhythm").addEventListener("change", (e) => {
    counterRatio =
      e.target.value === "off" ? null : e.target.value.split(":").map(Number);
    if (playing) restart();
  });
  $("#swing").addEventListener("input", (e) => {
    swing = Number(e.target.value);
    $("#swing-out").textContent = `${Math.round(swing * 100)}%`;
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
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
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
    const bar = panel.querySelector("[data-drag]");
    let drag;
    let offset = { x: 0, y: 0 };
    bar.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || innerWidth < 671) return;
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
    window.addEventListener("resize", () => {
      offset = { x: 0, y: 0 };
      panel.style.transform = "";
    });
  });
  window.addEventListener("scroll", updateWires, { passive: true });
  const resizeObserver = new ResizeObserver(updateWires);
  $$(".panel").forEach((p) => resizeObserver.observe(p));

  // Line-drawn flowers: every motion is driven by notes or a sound parameter.
  const canvas = $("#garden"),
    garden = canvas.getContext("2d"),
    scope = $("#scope"),
    scopeCtx = scope.getContext("2d");
  let width = 0,
    height = 0,
    dpr = 1,
    scopeWidth = 0,
    scopeHeight = 0;
  const flowerPositions = [0.045, 0.16, 0.32, 0.51, 0.69, 0.85, 0.96];
  const drops = [];
  let lastFrame = 0,
    fieldTime = 0;
  function resize() {
    width = innerWidth;
    height = innerHeight;
    dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    garden.setTransform(dpr, 0, 0, dpr, 0, 0);
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
    $("#motion").textContent = `motion ${motion ? "on" : "off"}`;
    if (!motion) drops.length = 0;
  }
  $("#motion").addEventListener("click", () => setMotion(!motion));
  setMotion(motion);
  matchMedia("(prefers-reduced-motion: reduce)").addEventListener(
    "change",
    (e) => setMotion(!e.matches),
  );
  function flowerStemHeight(index) {
    const base = index === 0 || index === 6 ? Math.max(145, height * 0.48) : 95;
    return base + (state.sub / 100) * 55 + (index % 2) * 35;
  }
  function drawFlower(index, time, now) {
    const x = flowerPositions[index] * width;
    const events = visualNotes.filter(
      (n) =>
        Math.abs((n.voice.midi % 7) - index) === 0 &&
        n.voice.t <= now &&
        now < n.voice.off + n.voice.r,
    );
    const energy = motion
      ? clamp(
          events.reduce(
            (sum, n) => sum + envelopeAt(n.voice, now) * n.voice.velocity,
            0,
          ),
          0,
          1.5,
        )
      : 0;
    const stemHeight = flowerStemHeight(index);
    const sway = motion
      ? Math.sin(time * 0.28 + index * 1.6) * (2 + state.detune * 0.08)
      : 0;
    const bloom = 16 + state.sustain * 13 + energy * 14;
    const openness = 0.35 + (state.detune / 60) * 0.85;
    const alpha = (0.34 + energy * 0.4) * Math.sqrt(state.level / 100);
    garden.save();
    garden.translate(x, height + 15);
    garden.lineWidth = 0.85;
    garden.strokeStyle = `rgba(255,255,255,${alpha})`;
    garden.beginPath();
    garden.moveTo(0, 0);
    garden.bezierCurveTo(
      -13,
      -stemHeight * 0.3,
      sway - 8,
      -stemHeight * 0.7,
      sway,
      -stemHeight - 15,
    );
    garden.stroke();
    const leafOpen = state.tone / 100;
    for (let side = -1; side <= 1; side += 2) {
      const ly = -stemHeight * (side === 1 ? 0.4 : 0.63),
        lw = 12 + leafOpen * 21;
      garden.beginPath();
      garden.moveTo(-4, ly);
      garden.bezierCurveTo(side * lw, ly - 2, side * lw, ly - 25, -4, ly);
      garden.stroke();
      garden.beginPath();
      garden.moveTo(-4, ly);
      garden.lineTo(side * lw * 0.68, ly - 12);
      garden.stroke();
    }
    garden.translate(sway, -stemHeight - 15);
    const count = state.voices * 2 + 3;
    for (let petal = 0; petal < count; petal++) {
      const angle =
        (petal / count) * Math.PI * 2 +
        index * 0.3 +
        (state.wave === "triangle" ? Math.PI / 4 : 0);
      garden.save();
      garden.rotate(angle);
      const length = bloom * (0.8 + openness * 0.7),
        spread = (5 + openness * 9) * (1 + state.morph / 150);
      garden.beginPath();
      garden.moveTo(0, -3);
      garden.bezierCurveTo(
        -spread,
        -length * 0.5,
        -spread,
        -length,
        0,
        -length,
      );
      garden.bezierCurveTo(spread, -length, spread, -length * 0.5, 0, -3);
      garden.stroke();
      garden.restore();
    }
    garden.beginPath();
    garden.arc(0, 0, 3.5 + energy * 2, 0, Math.PI * 2);
    garden.stroke();
    if (energy > 0.03 && state.resonance > 0) {
      const ripple = motion ? (time * 0.4 + index) % 1 : 0.5;
      garden.strokeStyle = `rgba(255,255,255,${(alpha * (1 - ripple) * state.resonance) / 100})`;
      garden.beginPath();
      garden.ellipse(
        0,
        stemHeight - 4,
        10 + ripple * 42,
        2 + ripple * 8,
        0,
        0,
        Math.PI * 2,
      );
      garden.stroke();
    }
    garden.restore();
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
      lanes.forEach((l) =>
        l.cells.forEach((cell, i) =>
          cell.classList.toggle("active", i === laneIndex(l, current.step)),
        ),
      );
      $("#current-note").textContent =
        current.midi === null
          ? "a little silence"
          : `${noteName(current.midi)} / step ${(current.step % 16) + 1}`;
    }
    visualNotes.forEach((n) => {
      if (!n.born && n.voice.t <= now) {
        n.born = true;
        lastVisual = n.voice;
        if (motion) {
          const flower = n.voice.midi % 7;
          drops.push({
            x: flowerPositions[flower] * width + ((n.voice.midi % 3) - 1) * 18,
            y: Math.max(
              30,
              height - flowerStemHeight(flower) - 160 - (n.voice.midi - 48) * 2,
            ),
            speed: 140 + n.voice.velocity * 150,
            length: 8 + Math.min(25, (n.voice.off - n.voice.t) * 20),
            life: 1,
          });
        }
      }
    });
    for (let i = visualNotes.length - 1; i >= 0; i--)
      if (now > visualNotes[i].voice.off + visualNotes[i].voice.r + 1)
        visualNotes.splice(i, 1);
    garden.clearRect(0, 0, width, height);
    flowerPositions.forEach((_, i) => drawFlower(i, fieldTime, now));
    if (motion)
      for (let i = drops.length - 1; i >= 0; i--) {
        const drop = drops[i];
        drop.y += drop.speed * delta;
        drop.life -= delta * 0.45;
        garden.strokeStyle = `rgba(255,255,255,${((Math.max(0, drop.life) * state.level) / 100) * 0.7})`;
        garden.lineWidth = 0.8;
        garden.beginPath();
        garden.moveTo(drop.x, drop.y);
        garden.lineTo(drop.x - 1, drop.y - drop.length);
        garden.stroke();
        if (drop.y > height - 20 || drop.life <= 0) drops.splice(i, 1);
      }
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
    $("#voice-status").textContent =
      `${[...activeVoices].filter((v) => v.t <= now && now < v.off + v.r).reduce((n, v) => n + v.oscs.length, 0)} voices`;
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
  syncControls.forEach((sync) => sync());
  updateChord();
  updateTransport();
  window.addEventListener("resize", resize);
  resize();
  requestAnimationFrame(animate);
})();
