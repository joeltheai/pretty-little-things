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

  const $ = (selector) => document.querySelector(selector);

  /* ------------------------------------------------------------------ *
   * Knobs
   *
   * Each knob wraps a real range input (kept for keyboard + screen
   * reader support); the dial is decorative and drives that input.
   * ------------------------------------------------------------------ */

  const KNOB_START = -135;
  const KNOB_SWEEP = 270;
  const knobs = new Map();

  function knobPolar(cx, cy, radius, deg) {
    const rad = (deg * Math.PI) / 180;
    return [cx + radius * Math.sin(rad), cy - radius * Math.cos(rad)];
  }

  function knobArc(cx, cy, radius, from, to) {
    const [x0, y0] = knobPolar(cx, cy, radius, from);
    const [x1, y1] = knobPolar(cx, cy, radius, to);
    const large = Math.abs(to - from) > 180 ? 1 : 0;
    return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${radius} ${radius} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  }

  function knobSvg() {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 64 64");
    svg.setAttribute("aria-hidden", "true");

    let ticks = "";
    for (let i = 0; i <= 10; i++) {
      const angle = KNOB_START + (i / 10) * KNOB_SWEEP;
      const [x0, y0] = knobPolar(32, 32, 26, angle);
      const [x1, y1] = knobPolar(32, 32, 29, angle);
      ticks += `<line x1="${x0.toFixed(2)}" y1="${y0.toFixed(2)}" x2="${x1.toFixed(2)}" y2="${y1.toFixed(2)}" />`;
    }

    svg.innerHTML = [
      `<g class="knob-ticks">${ticks}</g>`,
      `<path class="knob-track" d="${knobArc(32, 32, 23.5, KNOB_START, KNOB_START + KNOB_SWEEP)}" />`,
      `<path class="knob-arc" />`,
      `<circle class="knob-body" cx="32" cy="32" r="19" />`,
      `<g class="knob-pointer"><line x1="32" y1="25" x2="32" y2="15" /></g>`,
    ].join("");

    return svg;
  }

  function renderKnob(input) {
    const knob = knobs.get(input);
    if (!knob) return;

    const min = Number(input.min);
    const max = Number(input.max);
    const t = max === min ? 0 : (Number(input.value) - min) / (max - min);
    const angle = KNOB_START + Math.min(1, Math.max(0, t)) * KNOB_SWEEP;

    knob.pointer.setAttribute("transform", `rotate(${angle.toFixed(2)} 32 32)`);
    knob.arc.setAttribute("d", knobArc(32, 32, 23.5, KNOB_START, angle));
  }

  function setKnobValue(input, value) {
    const min = Number(input.min);
    const max = Number(input.max);
    const step = Number(input.step) || 1;
    const snapped = min + Math.round((value - min) / step) * step;
    const next = Math.min(max, Math.max(min, Number(snapped.toFixed(6))));

    if (Number(input.value) !== next) {
      input.value = String(next);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }

    return next;
  }

  function initKnobs() {
    document.querySelectorAll(".knob-face").forEach((face) => {
      const input = face.querySelector("input");
      if (!input) return;

      const svg = knobSvg();
      face.appendChild(svg);
      knobs.set(input, {
        pointer: svg.querySelector(".knob-pointer"),
        arc: svg.querySelector(".knob-arc"),
      });

      let drag = null;

      const move = (event) => {
        if (!drag) return;

        const range = Number(input.max) - Number(input.min);
        const speed = event.shiftKey ? 520 : 180;
        const delta = drag.y - event.clientY;

        drag.y = event.clientY;
        drag.raw += (delta * range) / speed;
        setKnobValue(input, drag.raw);
      };

      const end = () => {
        if (!drag) return;
        drag = null;
        face.classList.remove("dragging");
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", end);
        window.removeEventListener("pointercancel", end);
      };

      face.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        event.preventDefault();

        drag = { y: event.clientY, raw: Number(input.value) };
        face.classList.add("dragging");
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", end);
        window.addEventListener("pointercancel", end);
      });
    });
  }

  /* ------------------------------------------------------------------ *
   * Synth controls
   * ------------------------------------------------------------------ */

  initKnobs();

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
      renderKnob(input);
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
   * Arpeggiator data
   *
   * Chord wheel, palette, and pattern shapes are adapted from Chrome
   * Music Lab's Arpeggios experiment (Apache-2.0).
   * ------------------------------------------------------------------ */

  const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

  const COLORS = {
    C: "rgb(246, 190, 55)",
    "C#": "rgb(128, 100, 198)",
    D: "rgb(149, 198, 49)",
    "D#": "rgb(237, 56, 131)",
    E: "rgb(69, 181, 161)",
    F: "rgb(247, 148, 61)",
    "F#": "rgb(78, 97, 216)",
    G: "rgb(209, 193, 46)",
    "G#": "rgb(165, 66, 177)",
    A: "rgb(75, 178, 80)",
    "A#": "rgb(247, 88, 57)",
    B: "rgb(69, 152, 182)",
  };

  const PITCH_CLASS = {
    C: 0,
    "C#": 1,
    D: 2,
    "D#": 3,
    E: 4,
    F: 5,
    "F#": 6,
    G: 7,
    "G#": 8,
    A: 9,
    "A#": 10,
    B: 11,
  };

  const MAJOR_ORDER = ["C", "G", "D", "A", "E", "B", "F#", "C#", "G#", "D#", "A#", "F"];
  const MINOR_ORDER = ["A", "E", "B", "F#", "C#", "G#", "D#", "A#", "F", "C", "G", "D"];
  const TRIADS = { major: [0, 4, 7], minor: [0, 3, 7] };
  const LOWEST_MIDI = 48;
  const OCTAVES = 3;

  function buildChord(root, mode) {
    const notes = [];
    const intervals = TRIADS[mode];

    for (let octave = 0; octave < OCTAVES; octave += 1) {
      intervals.forEach((interval) => {
        notes.push(
          LOWEST_MIDI + PITCH_CLASS[root] + interval + octave * 12,
        );
      });
    }

    return notes;
  }

  const CHORDS = {};

  MAJOR_ORDER.forEach((root) => {
    CHORDS[`major:${root}`] = buildChord(root, "major");
  });

  MINOR_ORDER.forEach((root) => {
    CHORDS[`minor:${root}`] = buildChord(root, "minor");
  });

  const ALL_NOTES = Object.values(CHORDS).flat();
  const LOW_MIDI = Math.min(...ALL_NOTES);
  const HIGH_MIDI = Math.max(...ALL_NOTES);

  const BEATS_PER_LOOP = 4;

  const PATTERNS = [
    {
      steps: Array.from({ length: 8 }, (_, i) => i * 0.5),
      duration: 0.5,
      degrees: [0, 1, 2, 3, 4, 3, 2, 1],
    },
    {
      steps: Array.from({ length: 8 }, (_, i) => i * 0.5),
      duration: 0.5,
      degrees: [3, 5, 4, 5, 3, 5, 4, 5],
    },
    {
      steps: [0, 1, 2, 3],
      duration: 1,
      degrees: [0, 1, 2, 3],
    },
    {
      steps: Array.from({ length: 12 }, (_, i) => i / 3),
      duration: 1 / 3,
      degrees: [5, 4, 3, 4, 3, 2, 3, 2, 1, 2, 3, 4],
    },
    {
      steps: Array.from({ length: 12 }, (_, i) => i / 3),
      duration: 1 / 3,
      pairs: [
        [0, 2],
        [1, 3],
        [2, 4],
        [3, 5],
        [2, 4],
        [1, 5],
        [0, 6],
        [1, 5],
        [2, 6],
        [3, 7],
        [6, 2],
        [5, 1],
      ],
    },
  ];

  PATTERNS.forEach((pattern) => {
    const events = pattern.pairs || pattern.degrees.map((degree) => [degree]);

    pattern.events = events.map((degrees, index) => ({
      step: pattern.steps[index],
      duration: pattern.duration,
      degrees,
    }));
  });

  /* ------------------------------------------------------------------ *
   * Arpeggiator interface
   * ------------------------------------------------------------------ */

  const SVG_NS = "http://www.w3.org/2000/svg";
  const wheel = $("#wheel");
  const stage = $("#pattern-stage");
  const notesEl = $("#pattern-notes");
  const headEl = $("#pattern-head");
  const patternCount = $("#pattern-count");
  const arpPlay = $("#arp-play");
  const tempoInput = $("#tempo");
  const tempoOut = $("#tempo-out");

  const CX = 160;
  const CY = 160;
  const RADIUS = 150;
  const INNER_RADIUS = RADIUS * 0.66;
  const ARC = (Math.PI * 2) / 12;
  const START_ANGLE = -Math.PI / 2 - ARC / 2;

  function polar(radius, angle) {
    return [CX + radius * Math.cos(angle), CY + radius * Math.sin(angle)];
  }

  function annularPath(inner, outer, start, end) {
    const [x0, y0] = polar(outer, start);
    const [x1, y1] = polar(outer, end);
    const [x2, y2] = polar(inner, end);
    const [x3, y3] = polar(inner, start);

    return [
      `M ${x0} ${y0}`,
      `A ${outer} ${outer} 0 0 1 ${x1} ${y1}`,
      `L ${x2} ${y2}`,
      `A ${inner} ${inner} 0 0 0 ${x3} ${y3}`,
      "Z",
    ].join(" ");
  }

  function wedgePath(radius, start, end) {
    const [x0, y0] = polar(radius, start);
    const [x1, y1] = polar(radius, end);

    return [
      `M ${CX} ${CY}`,
      `L ${x0} ${y0}`,
      `A ${radius} ${radius} 0 0 1 ${x1} ${y1}`,
      "Z",
    ].join(" ");
  }

  function addWheelLabel(group, name, radius, angle, mode) {
    const [x, y] = polar(radius, angle);
    const text = document.createElementNS(SVG_NS, "text");

    text.setAttribute("x", x.toFixed(2));
    text.setAttribute("y", y.toFixed(2));
    text.setAttribute("class", mode);
    text.textContent = mode === "minor" ? name.toLowerCase() : name;
    group.appendChild(text);
  }

  function buildWheel() {
    const slices = document.createElementNS(SVG_NS, "g");
    const labels = document.createElementNS(SVG_NS, "g");

    MAJOR_ORDER.forEach((root, index) => {
      const start = START_ANGLE + index * ARC;
      const end = start + ARC;
      const path = document.createElementNS(SVG_NS, "path");

      path.setAttribute("d", annularPath(INNER_RADIUS, RADIUS, start, end));
      path.setAttribute("fill", COLORS[root]);
      path.setAttribute("data-chord", `major:${root}`);
      path.setAttribute("aria-label", `${root} major`);
      slices.appendChild(path);

      addWheelLabel(labels, root, (INNER_RADIUS + RADIUS) / 2, (start + end) / 2, "major");
    });

    MINOR_ORDER.forEach((root, index) => {
      const start = START_ANGLE + index * ARC;
      const end = start + ARC;
      const path = document.createElementNS(SVG_NS, "path");

      path.setAttribute("d", wedgePath(INNER_RADIUS, start, end));
      path.setAttribute("fill", COLORS[root]);
      path.setAttribute("class", "minor-slice");
      path.setAttribute("data-chord", `minor:${root}`);
      path.setAttribute("aria-label", `${root} minor`);
      slices.appendChild(path);

      addWheelLabel(labels, root, INNER_RADIUS * 0.75, (start + end) / 2, "minor");
    });

    wheel.append(slices, labels);
  }

  let chord = CHORDS["major:C"];
  let patternIndex = 0;
  let bars = [];
  let bpm = 120;
  let playing = false;
  let timer = null;
  let raf = null;
  let eventIndex = 0;
  let nextEventTime = 0;
  let anchorTime = 0;

  function selectChord(key) {
    chord = CHORDS[key];

    wheel.querySelectorAll("path[data-chord]").forEach((path) => {
      path.classList.toggle("selected", path.getAttribute("data-chord") === key);
    });

    updateBars();
  }

  function renderPattern() {
    notesEl.textContent = "";
    bars = [];

    const pattern = PATTERNS[patternIndex];

    pattern.events.forEach((event) => {
      event.degrees.forEach((degree) => {
        const el = document.createElement("div");
        el.className = "pattern-note";
        el.style.left = `${(event.step / BEATS_PER_LOOP) * 100}%`;
        el.style.width = `${(event.duration / BEATS_PER_LOOP) * 100}%`;
        notesEl.appendChild(el);

        bars.push({
          el,
          degree,
          start: event.step,
          end: event.step + event.duration,
        });
      });
    });

    patternCount.textContent = `${patternIndex + 1} / ${PATTERNS.length}`;
    updateBars();
  }

  function updateBars() {
    const height = stage.clientHeight;
    const padding = 6;
    const barHeight = 5;
    const span = Math.max(0, height - padding * 2 - barHeight);
    const range = HIGH_MIDI - LOW_MIDI;

    bars.forEach((bar) => {
      const midi = chord[bar.degree];
      const position = range === 0 ? 0.5 : (midi - LOW_MIDI) / range;

      bar.el.style.top = `${padding + (1 - position) * span}px`;
      bar.el.style.backgroundColor = COLORS[NOTE_NAMES[midi % 12]];
    });
  }

  function loopDuration() {
    return (60 / bpm) * BEATS_PER_LOOP;
  }

  function loopProgress() {
    const elapsed = ctx.currentTime - anchorTime;
    if (elapsed <= 0) return 0;
    return (elapsed / loopDuration()) % 1;
  }

  const LOOKAHEAD = 0.12;
  const TICK_MS = 25;

  function schedule() {
    if (!playing) return;

    const beat = 60 / bpm;
    const now = ctx.currentTime;

    while (nextEventTime < now + LOOKAHEAD) {
      const pattern = PATTERNS[patternIndex];

      if (eventIndex >= pattern.events.length) {
        eventIndex = 0;
      }

      const event = pattern.events[eventIndex];
      const when = Math.max(nextEventTime, now + 0.001);

      if (eventIndex === 0) {
        anchorTime = when;
      }

      event.degrees.forEach((degree) => {
        const midi = chord[degree];
        if (midi !== undefined) {
          playNote(midi, when, event.duration * beat * 0.95);
        }
      });

      eventIndex += 1;

      let delta;

      if (eventIndex < pattern.events.length) {
        delta = pattern.events[eventIndex].step - event.step;
      } else {
        delta = BEATS_PER_LOOP - event.step;
        eventIndex = 0;
      }

      nextEventTime = when + delta * beat;
    }
  }

  function draw() {
    if (!playing) return;

    const progress = loopProgress();
    const beat = progress * BEATS_PER_LOOP;

    headEl.style.display = "block";
    headEl.style.left = `${Math.min(progress, 0.999) * 100}%`;

    bars.forEach((bar) => {
      bar.el.classList.toggle("active", beat >= bar.start && beat < bar.end);
    });

    raf = requestAnimationFrame(draw);
  }

  function updatePlayButton() {
    arpPlay.textContent = playing ? "■" : "▶";
    arpPlay.classList.toggle("playing", playing);
    arpPlay.setAttribute("aria-label", playing ? "Stop" : "Play");
  }

  async function start() {
    if (playing) return;
    await ensureRunning();

    playing = true;
    eventIndex = 0;
    nextEventTime = ctx.currentTime + 0.1;
    anchorTime = nextEventTime;

    schedule();
    timer = window.setInterval(schedule, TICK_MS);
    raf = requestAnimationFrame(draw);
    updatePlayButton();
  }

  function stop() {
    if (!playing) return;

    playing = false;
    window.clearInterval(timer);
    timer = null;
    window.cancelAnimationFrame(raf);
    raf = null;

    headEl.style.display = "none";
    bars.forEach((bar) => bar.el.classList.remove("active"));
    updatePlayButton();
  }

  function restartSequence() {
    eventIndex = 0;
    nextEventTime = ctx.currentTime + 0.06;
    anchorTime = nextEventTime;
    schedule();
  }

  function setPattern(index) {
    patternIndex = (index + PATTERNS.length) % PATTERNS.length;
    renderPattern();

    if (playing) {
      restartSequence();
    }
  }

  wheel.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;

    const slice = event.target.closest("path[data-chord]");
    if (!slice) return;

    selectChord(slice.getAttribute("data-chord"));
  });

  $("#pattern-prev").addEventListener("click", (event) => {
    setPattern(patternIndex - 1);
    event.currentTarget.blur();
  });

  $("#pattern-next").addEventListener("click", (event) => {
    setPattern(patternIndex + 1);
    event.currentTarget.blur();
  });

  arpPlay.addEventListener("click", () => {
    if (playing) stop();
    else start();
  });

  tempoInput.addEventListener("input", () => {
    const progress = playing ? loopProgress() : 0;
    bpm = Number(tempoInput.value);
    tempoOut.textContent = String(bpm);

    if (playing) {
      anchorTime = ctx.currentTime - progress * loopDuration();
    }
  });

  /* ------------------------------------------------------------------ *
   * Keyboard
   * ------------------------------------------------------------------ */

  const KEY_NOTES = {
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

  document.addEventListener("keydown", async (event) => {
    if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;

    if (event.code === "Space") {
      if (event.target instanceof Element && event.target.closest("button")) return;

      event.preventDefault();
      if (playing) stop();
      else await start();
      return;
    }

    if (event.code === "KeyZ") {
      octave = Math.max(-2, octave - 1);
      return;
    }

    if (event.code === "KeyX") {
      octave = Math.min(2, octave + 1);
      return;
    }

    const midi = KEY_NOTES[event.code];
    if (midi === undefined) return;

    event.preventDefault();
    await ensureRunning();
    playNote(midi + octave * 12, ctx.currentTime + 0.01, 0.45);
  });

  /* ------------------------------------------------------------------ *
   * Windows and wire
   * ------------------------------------------------------------------ */

  const arpWindow = $("#arp-window");
  const synthWindow = $("#synth-window");
  const wirePath = $("#wire-path");
  let zTop = 1;

  function setPos(win, x, y) {
    win.style.left = `${Math.round(x)}px`;
    win.style.top = `${Math.round(y)}px`;
  }

  function updateWire() {
    const a = arpWindow.getBoundingClientRect();
    const b = synthWindow.getBoundingClientRect();
    const ax = a.left + a.width / 2;
    const ay = a.top + a.height / 2;
    const bx = b.left + b.width / 2;
    const by = b.top + b.height / 2;

    if (Math.abs(bx - ax) >= Math.abs(by - ay)) {
      const x1 = ax <= bx ? a.right : a.left;
      const x2 = ax <= bx ? b.left : b.right;
      const y1 = ay;
      const y2 = by;
      const dx = x2 - x1;
      const sag = Math.min(50, Math.max(20, Math.abs(dx) * 0.25));

      wirePath.setAttribute(
        "d",
        `M ${x1} ${y1} C ${x1 + dx * 0.4} ${y1 + sag}, ${x2 - dx * 0.4} ${y2 + sag}, ${x2} ${y2}`,
      );
    } else {
      const y1 = ay <= by ? a.bottom : a.top;
      const y2 = ay <= by ? b.top : b.bottom;
      const x1 = ax;
      const x2 = bx;
      const dy = y2 - y1;
      const sag = Math.min(50, Math.max(20, Math.abs(dy) * 0.25));

      wirePath.setAttribute(
        "d",
        `M ${x1} ${y1} C ${x1 + sag} ${y1 + dy * 0.4}, ${x2 + sag} ${y2 - dy * 0.4}, ${x2} ${y2}`,
      );
    }
  }

  function initLayout() {
    const sideGap = 110;
    const margin = 20;
    const aw = arpWindow.offsetWidth;
    const ah = arpWindow.offsetHeight;
    const sw = synthWindow.offsetWidth;
    const sh = synthWindow.offsetHeight;

    if (aw + sw + sideGap + margin * 2 <= window.innerWidth) {
      const total = aw + sw + sideGap;
      const height = Math.max(ah, sh);
      const x = Math.max(margin, (window.innerWidth - total) / 2);
      const y = Math.max(6, (window.innerHeight - height) / 2);

      setPos(arpWindow, x, y + (height - ah) / 2);
      setPos(synthWindow, x + aw + sideGap, y + (height - sh) / 2);
    } else {
      const gap = Math.max(
        30,
        Math.min(70, window.innerHeight - ah - sh - margin * 2),
      );
      const total = ah + sh + gap;
      const y = Math.max(margin, (window.innerHeight - total) / 2);

      setPos(arpWindow, Math.max(margin, (window.innerWidth - aw) / 2), y);
      setPos(synthWindow, Math.max(margin, (window.innerWidth - sw) / 2), y + ah + gap);
    }

    updateWire();
    arpWindow.classList.add("ready");
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
      updateWire();
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

  buildWheel();
  renderPattern();
  selectChord("major:C");

  makeDraggable(arpWindow);
  makeDraggable(synthWindow);
  initLayout();
  updatePlayButton();

  window.addEventListener("resize", () => {
    clampWindow(arpWindow);
    clampWindow(synthWindow);
    updateWire();
    updateBars();
  });
})();
