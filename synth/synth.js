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
   * Piano roll
   * ------------------------------------------------------------------ */

  const STEPS = 32;
  const TOP_MIDI = 71;
  const BOTTOM_MIDI = 48;
  const CELL_W = 16;
  const CELL_H = 14;
  const BLACK_KEYS = new Set([1, 3, 6, 8, 10]);
  const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const noteName = (midi) => `${NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;

  const keysEl = $("#keys");
  const grid = $("#grid");
  const gridScroll = $("#grid-scroll");
  const playhead = $("#playhead");

  for (let row = 0; row <= TOP_MIDI - BOTTOM_MIDI; row += 1) {
    const midi = TOP_MIDI - row;
    const black = BLACK_KEYS.has(midi % 12);

    const key = document.createElement("div");
    key.className = `key ${black ? "black" : "white"}`;
    key.textContent = noteName(midi);
    keysEl.appendChild(key);

    for (let step = 0; step < STEPS; step += 1) {
      const cell = document.createElement("div");
      cell.className = `cell ${black ? "black" : "white"}`;
      if (step % 4 === 0) cell.classList.add("bar");
      if (midi % 12 === 0) cell.classList.add("octave");
      cell.dataset.step = String(step);
      cell.dataset.midi = String(midi);
      grid.appendChild(cell);
    }
  }

  const notes = [];
  let nextNoteId = 1;

  function renderNote(note) {
    note.el.style.left = `${note.start * CELL_W}px`;
    note.el.style.top = `${(TOP_MIDI - note.midi) * CELL_H}px`;
    note.el.style.width = `${note.length * CELL_W - 1}px`;
    note.el.style.height = `${CELL_H - 1}px`;
  }

  function addNote(midi, start, length) {
    const note = { id: nextNoteId, midi, start, length };
    nextNoteId += 1;

    const el = document.createElement("div");
    el.className = "note";
    el.dataset.id = String(note.id);
    note.el = el;
    grid.appendChild(el);
    notes.push(note);
    renderNote(note);

    return note;
  }

  function removeNote(note) {
    note.el.remove();
    const index = notes.indexOf(note);
    if (index !== -1) notes.splice(index, 1);
  }

  function clearNotes() {
    notes.forEach((note) => note.el.remove());
    notes.length = 0;
  }

  function findNote(id) {
    return notes.find((note) => note.id === id);
  }

  [
    [48, 0, 8], [64, 0, 6], [67, 0, 4], [71, 0, 2],
    [57, 8, 8], [60, 8, 6], [64, 8, 4], [67, 8, 2],
    [53, 16, 8], [57, 16, 6], [60, 16, 4], [64, 16, 2],
    [55, 24, 8], [59, 24, 6], [62, 24, 4], [65, 24, 2],
  ].forEach(([midi, start, length]) => addNote(midi, start, length));

  async function previewNote(midi) {
    await ensureRunning();
    playNote(midi, ctx.currentTime + 0.01, 0.4);
  }

  let action = null;
  let touchCandidate = null;

  grid.addEventListener("pointerdown", (event) => {
    if (event.button === 2) return;

    const noteEl = event.target.closest(".note");

    if (noteEl) {
      const note = findNote(Number(noteEl.dataset.id));
      if (!note) return;

      event.preventDefault();

      const rect = noteEl.getBoundingClientRect();
      const resize = event.clientX >= rect.right - 6;

      action = {
        type: resize ? "resize" : "move",
        note,
        startX: event.clientX,
        startY: event.clientY,
        origStart: note.start,
        origMidi: note.midi,
        origLength: note.length,
        pointerId: event.pointerId,
      };

      noteEl.classList.add("dragging");
      noteEl.setPointerCapture(event.pointerId);

      const onMove = (moveEvent) => {
        if (!action || action.pointerId !== moveEvent.pointerId) return;

        if (action.type === "move") {
          const dStep = Math.round((moveEvent.clientX - action.startX) / CELL_W);
          const dRow = Math.round((moveEvent.clientY - action.startY) / CELL_H);

          note.start = Math.min(
            Math.max(0, action.origStart + dStep),
            STEPS - note.length,
          );
          note.midi = Math.min(
            Math.max(BOTTOM_MIDI, action.origMidi - dRow),
            TOP_MIDI,
          );
        } else {
          const dStep = Math.round((moveEvent.clientX - action.startX) / CELL_W);

          note.length = Math.min(
            Math.max(1, action.origLength + dStep),
            STEPS - note.start,
          );
        }

        renderNote(note);
      };

      const finish = (upEvent) => {
        if (!action) return;
        action = null;
        noteEl.classList.remove("dragging");
        noteEl.removeEventListener("pointermove", onMove);
        noteEl.removeEventListener("pointerup", finish);
        noteEl.removeEventListener("pointercancel", finish);

        if (noteEl.hasPointerCapture(upEvent.pointerId)) {
          noteEl.releasePointerCapture(upEvent.pointerId);
        }

        previewNote(note.midi);
      };

      noteEl.addEventListener("pointermove", onMove);
      noteEl.addEventListener("pointerup", finish);
      noteEl.addEventListener("pointercancel", finish);
      return;
    }

    const cell = event.target.closest(".cell");
    if (!cell) return;

    if (event.pointerType === "mouse" || event.pointerType === "pen") {
      event.preventDefault();

      const note = addNote(
        Number(cell.dataset.midi),
        Number(cell.dataset.step),
        1,
      );

      action = { type: "create", note, pointerId: event.pointerId };
      grid.setPointerCapture(event.pointerId);
    } else {
      touchCandidate = {
        midi: Number(cell.dataset.midi),
        start: Number(cell.dataset.step),
        x: event.clientX,
        y: event.clientY,
        moved: false,
      };
    }
  });

  grid.addEventListener("pointermove", (event) => {
    if (action && action.type === "create") {
      const rect = grid.getBoundingClientRect();
      const step = Math.floor((event.clientX - rect.left) / CELL_W);
      const length = Math.max(
        1,
        Math.min(STEPS - action.note.start, step - action.note.start + 1),
      );

      if (length !== action.note.length) {
        action.note.length = length;
        renderNote(action.note);
      }
    }

    if (touchCandidate) {
      const distance = Math.hypot(
        event.clientX - touchCandidate.x,
        event.clientY - touchCandidate.y,
      );
      if (distance > 6) touchCandidate.moved = true;
    }
  });

  grid.addEventListener("pointerup", (event) => {
    if (action && action.type === "create") {
      const note = action.note;
      action = null;

      if (grid.hasPointerCapture(event.pointerId)) {
        grid.releasePointerCapture(event.pointerId);
      }

      previewNote(note.midi);
    }

    if (touchCandidate) {
      if (!touchCandidate.moved) {
        const note = addNote(touchCandidate.midi, touchCandidate.start, 1);
        previewNote(note.midi);
      }
      touchCandidate = null;
    }
  });

  grid.addEventListener("pointercancel", () => {
    action = null;
    touchCandidate = null;
  });

  window.addEventListener("pointerup", () => {
    touchCandidate = null;
  });

  grid.addEventListener("contextmenu", (event) => {
    const noteEl = event.target.closest(".note");
    if (!noteEl) return;

    event.preventDefault();
    const note = findNote(Number(noteEl.dataset.id));
    if (note) removeNote(note);
  });

  /* ------------------------------------------------------------------ *
   * Transport
   * ------------------------------------------------------------------ */

  const LOOKAHEAD = 0.12;
  const TICK_MS = 25;

  const playButton = $("#play");
  const bpmInput = $("#bpm");

  let bpm = Number(bpmInput.value) || 96;
  let playing = false;
  let timer = null;
  let raf = null;
  let currentStep = 0;
  let nextStepTime = 0;
  const queue = [];

  bpmInput.addEventListener("change", () => {
    const value = Math.round(Number(bpmInput.value));
    bpm = Number.isFinite(value) ? Math.min(200, Math.max(40, value)) : bpm;
    bpmInput.value = String(bpm);
  });

  function schedule() {
    if (!playing) return;

    const stepDuration = 60 / bpm / 4;

    while (nextStepTime < ctx.currentTime + LOOKAHEAD) {
      const step = currentStep;

      notes.forEach((note) => {
        if (note.start === step) {
          playNote(note.midi, nextStepTime, note.length * stepDuration * 0.9);
        }
      });

      queue.push({ step, time: nextStepTime });
      currentStep = (currentStep + 1) % STEPS;
      nextStepTime += stepDuration;
    }
  }

  function showStep(step) {
    playhead.style.display = "block";
    playhead.style.left = `${step * CELL_W}px`;

    const x = step * CELL_W;
    const viewLeft = gridScroll.scrollLeft;
    const viewRight = viewLeft + gridScroll.clientWidth;

    if (x < viewLeft || x + CELL_W > viewRight) {
      gridScroll.scrollLeft = Math.max(0, x - gridScroll.clientWidth / 2);
    }
  }

  function clearPlayhead() {
    playhead.style.display = "none";
  }

  function draw() {
    if (!playing) return;

    while (queue.length && queue[0].time <= ctx.currentTime) {
      showStep(queue.shift().step);
    }

    raf = requestAnimationFrame(draw);
  }

  function updatePlayButton() {
    playButton.textContent = playing ? "■" : "▶";
    playButton.classList.toggle("playing", playing);
    playButton.setAttribute("aria-label", playing ? "Stop" : "Play");
  }

  async function start() {
    if (playing) return;
    await ensureRunning();

    playing = true;
    currentStep = 0;
    nextStepTime = ctx.currentTime + 0.1;
    queue.length = 0;
    clearPlayhead();
    updatePlayButton();

    schedule();
    timer = window.setInterval(schedule, TICK_MS);
    raf = requestAnimationFrame(draw);
  }

  function stop() {
    if (!playing) return;

    playing = false;
    window.clearInterval(timer);
    timer = null;
    window.cancelAnimationFrame(raf);
    raf = null;
    queue.length = 0;
    clearPlayhead();
    updatePlayButton();
  }

  playButton.addEventListener("click", () => {
    if (playing) stop();
    else start();
  });

  $("#clear").addEventListener("click", clearNotes);

  document.addEventListener("keydown", (event) => {
    if (event.code !== "Space") return;
    if (!(event.target instanceof Element)) return;
    if (event.target.closest("input, button")) return;

    event.preventDefault();
    if (playing) stop();
    else start();
  });

  /* ------------------------------------------------------------------ *
   * Windows and wire
   * ------------------------------------------------------------------ */

  const rollWindow = $("#roll-window");
  const synthWindow = $("#synth-window");
  const wirePath = $("#wire-path");
  let zTop = 1;

  function setPos(win, x, y) {
    win.style.left = `${Math.round(x)}px`;
    win.style.top = `${Math.round(y)}px`;
  }

  function updateWire() {
    const a = rollWindow.getBoundingClientRect();
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
    const sideGap = 140;
    const margin = 20;
    const sw = rollWindow.offsetWidth;
    const sh = rollWindow.offsetHeight;
    const yw = synthWindow.offsetWidth;
    const yh = synthWindow.offsetHeight;

    if (sw + yw + sideGap + margin * 2 <= window.innerWidth) {
      const total = sw + yw + sideGap;
      const x = Math.max(margin, (window.innerWidth - total) / 2);
      const y = Math.max(margin, (window.innerHeight - Math.max(sh, yh)) / 2);

      setPos(rollWindow, x, y);
      setPos(synthWindow, x + sw + sideGap, y + (sh - yh) / 2);
    } else {
      const stackGap = Math.max(
        40,
        Math.min(80, window.innerHeight - sh - yh - margin * 2),
      );
      const total = sh + yh + stackGap;
      const y = Math.max(margin, (window.innerHeight - total) / 2);

      setPos(rollWindow, Math.max(margin, (window.innerWidth - sw) / 2), y);
      setPos(
        synthWindow,
        Math.max(margin, (window.innerWidth - yw) / 2),
        y + sh + stackGap,
      );
    }

    updateWire();
    rollWindow.classList.add("ready");
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

  makeDraggable(rollWindow);
  makeDraggable(synthWindow);
  initLayout();

  window.addEventListener("resize", () => {
    clampWindow(rollWindow);
    clampWindow(synthWindow);
    updateWire();
  });
})();
