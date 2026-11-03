(() => {
  "use strict";
  const $ = (selector) => document.querySelector(selector);
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const TAU = Math.PI * 2;

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashSeed(text) {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  const DEFAULTS = {
    source: "choir",
    position: 0.32,
    size: 180,
    density: 26,
    spray: 0.16,
    pitch: 0,
    scatter: 10,
    speed: 1,
    tone: 0.62,
    space: 0.4,
    width: 0.38,
    level: 0.72,
    freeze: false,
    shape: "soft",
    direction: "forward",
    scale: "off",
    lfoTarget: "position",
    lfoRate: 0.08,
    lfoDepth: 0.35,
    filterType: "lowpass",
    resonance: 1.1,
    drive: 0.08,
    echo: 0.12,
    attack: 0.06,
    decay: 0.35,
    sustain: 0.72,
    release: 1.2,
  };

  const KNOBS = [
    {
      key: "position",
      label: "position",
      min: 0,
      max: 1,
      curve: 1,
      format: (value) => `${Math.round(value * 100)}`,
    },
    {
      key: "size",
      label: "size",
      min: 24,
      max: 480,
      curve: 2,
      format: (value) => `${Math.round(value)} ms`,
    },
    {
      key: "density",
      label: "density",
      min: 2,
      max: 60,
      curve: 2,
      format: (value) => `${Math.round(value)}/s`,
    },
    {
      key: "spray",
      label: "spray",
      min: 0,
      max: 1,
      curve: 1,
      format: (value) => `${Math.round(value * 100)}%`,
    },
    {
      key: "pitch",
      label: "pitch",
      min: -24,
      max: 24,
      curve: 1,
      format: (value) => `${value > 0 ? "+" : ""}${value.toFixed(0)} st`,
    },
    {
      key: "scatter",
      label: "scatter",
      min: 0,
      max: 100,
      curve: 1,
      format: (value) => `${Math.round(value)} ct`,
    },
    {
      key: "speed",
      label: "speed",
      min: 0.25,
      max: 2,
      curve: 1.6,
      format: (value) => `${value.toFixed(2)}×`,
    },
    {
      key: "tone",
      label: "tone",
      min: 0,
      max: 1,
      curve: 1,
      format: (value) => `${Math.round(value * 100)}%`,
    },
    {
      key: "space",
      label: "space",
      min: 0,
      max: 1,
      curve: 1,
      format: (value) => `${Math.round(value * 100)}%`,
    },
    {
      key: "width",
      label: "width",
      min: 0,
      max: 1,
      curve: 1,
      format: (value) => `${Math.round(value * 100)}%`,
    },
    {
      key: "attack",
      label: "attack",
      min: 0.005,
      max: 2,
      curve: 2,
      group: "env",
      format: (value) => `${Math.round(value * 1000)} ms`,
    },
    {
      key: "decay",
      label: "decay",
      min: 0.01,
      max: 2,
      curve: 2,
      group: "env",
      format: (value) => `${Math.round(value * 1000)} ms`,
    },
    {
      key: "sustain",
      label: "sustain",
      min: 0,
      max: 1,
      curve: 1,
      group: "env",
      format: (value) => `${Math.round(value * 100)}%`,
    },
    {
      key: "release",
      label: "release",
      min: 0.02,
      max: 4,
      curve: 2,
      group: "env",
      format: (value) => `${Math.round(value * 1000)} ms`,
    },
    {
      key: "lfoRate",
      label: "rate",
      min: 0.02,
      max: 8,
      curve: 2,
      group: "motion",
      format: (value) => `${value.toFixed(2)} Hz`,
    },
    {
      key: "lfoDepth",
      label: "depth",
      min: 0,
      max: 1,
      curve: 1,
      group: "motion",
      format: (value) => `${Math.round(value * 100)}%`,
    },
    {
      key: "resonance",
      label: "resonance",
      min: 0.1,
      max: 20,
      curve: 2,
      group: "tone",
      format: (value) => value.toFixed(1),
    },
    {
      key: "drive",
      label: "drive",
      min: 0,
      max: 1,
      curve: 1,
      group: "tone",
      format: (value) => `${Math.round(value * 100)}%`,
    },
    {
      key: "echo",
      label: "echo",
      min: 0,
      max: 1,
      curve: 1,
      group: "tone",
      format: (value) => `${Math.round(value * 100)}%`,
    },
    {
      key: "level",
      label: "level",
      min: 0,
      max: 1,
      curve: 1,
      format: (value) => `${Math.round(value * 100)}%`,
    },
  ];

  const state = {
    params: { ...DEFAULTS },
    running: false,
    auto: true,
    motion: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    octave: 4,
  };

  const engine = new window.GrainEngine(state.params);
  const garden = new window.MothGarden($("#garden"), {
    params: state.params,
    engine,
  });

  const panel = $("#panel");
  const handle = $("#handle");
  const power = $("#power");
  const autoButton = $("#auto");
  const freezeButton = $("#freeze");
  const reverseButton = $("#reverse");
  const randomizeButton = $("#randomize");
  const shapeSelect = $("#shape");
  const directionSelect = $("#direction");
  const scaleSelect = $("#scale");
  const lfoTargetSelect = $("#lfo-target");
  const filterTypeSelect = $("#filter-type");
  const motionButton = $("#motion");
  const sourcesEl = $("#sources");
  const knobsEl = $("#knobs");
  const envKnobsEl = $("#env-knobs");
  const lfoKnobsEl = $("#lfo-knobs");
  const filterKnobsEl = $("#filter-knobs");
  const levelEl = $("#level-knob");
  const moreButton = $("#more");
  const advancedEl = $("#advanced");
  const loadButton = $("#load");
  const fileInput = $("#file");
  const keysEl = $("#keys");
  const octLabel = $("#oct-label");
  const errorEl = $("#error");
  const cloud = $("#cloud");
  const cloudTag = $(".cloud-tag");
  const scope = $("#scope");
  const cloudCtx = cloud.getContext("2d");
  const scopeCtx = scope.getContext("2d");

  const knobDefs = new Map(KNOBS.map((def) => [def.key, def]));
  const knobEls = new Map();
  const sourceButtons = new Map();
  const keyEls = new Map();
  const held = new Map();

  const KEYMAP = {
    a: 0,
    w: 1,
    s: 2,
    e: 3,
    d: 4,
    f: 5,
    t: 6,
    g: 7,
    y: 8,
    h: 9,
    u: 10,
    j: 11,
    k: 12,
  };
  const NOTE_NAMES = [
    "C",
    "C#",
    "D",
    "D#",
    "E",
    "F",
    "F#",
    "G",
    "G#",
    "A",
    "A#",
    "B",
  ];

  function makePlaceholder(source) {
    const random = mulberry32(hashSeed(source));
    const peaks = new Float32Array(168);
    const seed = ((hashSeed(source) % 17) / 17) * TAU;
    for (let i = 0; i < peaks.length; i++) {
      const t = i / peaks.length;
      const envelope = Math.pow(Math.sin(Math.PI * t), 0.35);
      const wave =
        0.3 +
        0.7 *
          Math.abs(
            Math.sin(t * TAU * 3.1 + seed) *
              Math.sin(t * TAU * 0.7 + seed * 0.5),
          );
      peaks[i] = clamp(wave * envelope + (random() - 0.5) * 0.06, 0, 1);
    }
    return peaks;
  }

  let placeholder = makePlaceholder(state.params.source);
  const cloudGrains = [];

  function norm(def, value) {
    return Math.pow(
      clamp((value - def.min) / (def.max - def.min), 0, 1),
      1 / def.curve,
    );
  }

  function normToValue(def, position) {
    return (
      def.min +
      (def.max - def.min) * Math.pow(clamp(position, 0, 1), def.curve)
    );
  }

  function polar(radius, angle) {
    const radians = (angle * Math.PI) / 180;
    return [
      20 + radius * Math.cos(radians),
      20 + radius * Math.sin(radians),
    ];
  }

  function arcPath(radius, from, to) {
    const [x0, y0] = polar(radius, from);
    const [x1, y1] = polar(radius, to);
    const large = to - from > 180 ? 1 : 0;
    return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${radius} ${radius} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  }

  function setParam(key, value) {
    const def = knobDefs.get(key);
    if (!def) return;
    state.params[key] = clamp(value, def.min, def.max);
    updateKnob(key);
  }

  function updateKnob(key) {
    const el = knobEls.get(key);
    if (!el) return;
    const { def } = el;
    const value = state.params[key];
    const position = norm(def, value);
    const angle = 135 + position * 270;
    el.arc.setAttribute(
      "d",
      position <= 0.001 ? "" : arcPath(14.5, 135, angle),
    );
    el.pointer.setAttribute(
      "transform",
      `rotate(${225 + position * 270} 20 20)`,
    );
    el.output.textContent = def.format(value);
    el.face.setAttribute(
      "aria-valuenow",
      String(Math.round(value * 1000) / 1000),
    );
    el.face.setAttribute("aria-valuetext", def.format(value));
  }

  function bindKnob(el) {
    const { def, face } = el;
    let drag = null;

    face.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      event.preventDefault();
      face.focus({ preventScroll: true });
      face.classList.add("active");
      drag = {
        id: event.pointerId,
        startY: event.clientY,
        startP: norm(def, state.params[def.key]),
      };
      try {
        face.setPointerCapture(event.pointerId);
      } catch (error) {
        /* pointer capture is best effort */
      }
    });

    face.addEventListener("pointermove", (event) => {
      if (!drag || event.pointerId !== drag.id) return;
      const range = event.shiftKey ? 0.2 : 1;
      const position = clamp(
        drag.startP + ((drag.startY - event.clientY) / 150) * range,
        0,
        1,
      );
      setParam(def.key, normToValue(def, position));
    });

    const end = (event) => {
      if (!drag || event.pointerId !== drag.id) return;
      drag = null;
      face.classList.remove("active");
      if (face.hasPointerCapture(event.pointerId)) {
        face.releasePointerCapture(event.pointerId);
      }
    };
    face.addEventListener("pointerup", end);
    face.addEventListener("pointercancel", end);
    face.addEventListener("lostpointercapture", () => {
      if (drag) {
        drag = null;
        face.classList.remove("active");
      }
    });

    face.addEventListener("dblclick", () => {
      setParam(def.key, DEFAULTS[def.key]);
    });

    face.addEventListener("keydown", (event) => {
      const step = event.shiftKey ? 0.004 : 0.018;
      let position = norm(def, state.params[def.key]);
      switch (event.key) {
        case "ArrowUp":
        case "ArrowRight":
          position += step;
          break;
        case "ArrowDown":
        case "ArrowLeft":
          position -= step;
          break;
        case "Home":
          position = 0;
          break;
        case "End":
          position = 1;
          break;
        default:
          return;
      }
      event.preventDefault();
      setParam(def.key, normToValue(def, clamp(position, 0, 1)));
    });
  }

  function createKnob(def, holder) {
    const wrap = document.createElement("div");
    wrap.className = "knob";
    const face = document.createElement("div");
    face.className = "knob-face";
    face.tabIndex = 0;
    face.setAttribute("role", "slider");
    face.setAttribute("aria-label", def.label);
    face.setAttribute("aria-orientation", "vertical");
    face.setAttribute("aria-valuemin", String(def.min));
    face.setAttribute("aria-valuemax", String(def.max));
    face.innerHTML = `
      <svg viewBox="0 0 40 40" aria-hidden="true">
        <path class="knob-track" d="${arcPath(14.5, 135, 405)}" />
        <path class="knob-arc" />
        <circle class="knob-body" cx="20" cy="20" r="10.4" />
        <line class="knob-pointer" x1="20" y1="20" x2="20" y2="9.4" />
      </svg>
      <output class="knob-value"></output>`;
    const label = document.createElement("span");
    label.className = "knob-label";
    label.textContent = def.label;
    wrap.append(face, label);
    holder.appendChild(wrap);
    const el = {
      def,
      face,
      arc: face.querySelector(".knob-arc"),
      pointer: face.querySelector(".knob-pointer"),
      output: face.querySelector(".knob-value"),
    };
    knobEls.set(def.key, el);
    bindKnob(el);
    return el;
  }

  KNOBS.forEach((def) => {
    if (def.key === "level" || def.group) return;
    createKnob(def, knobsEl);
  });
  KNOBS.filter((def) => def.group === "env").forEach((def) => {
    createKnob(def, envKnobsEl);
  });
  KNOBS.filter((def) => def.group === "motion").forEach((def) => {
    createKnob(def, lfoKnobsEl);
  });
  KNOBS.filter((def) => def.group === "tone").forEach((def) => {
    createKnob(def, filterKnobsEl);
  });
  createKnob(
    KNOBS.find((def) => def.key === "level"),
    levelEl,
  );
  KNOBS.forEach((def) => updateKnob(def.key));

  const SOURCES = ["choir", "harp", "rain", "glass", "own"];
  function setSource(source) {
    if (source === "own" && !(engine.buffers && engine.buffers.own)) return;
    state.params.source = source;
    sourceButtons.forEach((button, id) => {
      button.setAttribute("aria-pressed", String(id === source));
    });
    placeholder = makePlaceholder(source);
  }

  SOURCES.forEach((source) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "source";
    button.textContent = source;
    button.dataset.source = source;
    button.setAttribute(
      "aria-pressed",
      String(state.params.source === source),
    );
    if (source === "own") button.hidden = true;
    button.addEventListener("click", () => setSource(source));
    sourcesEl.appendChild(button);
    sourceButtons.set(source, button);
  });

  function setRunningUI(running) {
    state.running = running;
    document.body.classList.toggle("running", running);
    power.setAttribute("aria-pressed", String(running));
    power.setAttribute("aria-label", running ? "Stop audio" : "Start audio");
  }

  let audioStart = null;

  function ensureAudio() {
    if (state.running) return Promise.resolve(true);
    if (audioStart) return audioStart;
    document.body.classList.add("starting");
    power.disabled = true;
    audioStart = engine
      .start()
      .then(() => {
        setRunningUI(true);
        return true;
      })
      .catch((error) => {
        errorEl.hidden = false;
        errorEl.textContent = "Audio could not start in this browser.";
        console.error(error);
        return false;
      })
      .finally(() => {
        document.body.classList.remove("starting");
        power.disabled = false;
        audioStart = null;
      });
    return audioStart;
  }

  async function togglePower(force) {
    const want = typeof force === "boolean" ? force : !state.running;
    if (want) {
      await ensureAudio();
      return;
    }
    engine.stop();
    setRunningUI(false);
    releaseHeld();
  }

  function releaseHeld() {
    held.forEach((midi) => engine.noteOff(midi));
    held.clear();
    keyEls.forEach((button) => button.classList.remove("on"));
  }

  function noteFor(offset) {
    return 60 + (state.octave - 4) * 12 + offset;
  }

  function buildKeys() {
    keysEl.innerHTML = "";
    keyEls.clear();
    Object.entries(KEYMAP).forEach(([letter, offset]) => {
      const midi = noteFor(offset);
      const name = NOTE_NAMES[((midi % 12) + 12) % 12];
      const button = document.createElement("button");
      button.type = "button";
      button.className = `key${[1, 3, 6, 8, 10].includes(offset) ? " sharp" : ""}`;
      button.dataset.letter = letter;
      button.innerHTML = `<span>${letter}</span><i>${name}</i>`;
      button.setAttribute(
        "aria-label",
        `Play ${name}${Math.floor(midi / 12) - 1}`,
      );
      button.title = button.getAttribute("aria-label");
      keysEl.appendChild(button);
      keyEls.set(letter, button);

      button.addEventListener("pointerdown", (event) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        event.preventDefault();
        const pressedMidi = noteFor(offset);
        let alive = true;
        button.classList.add("on");
        try {
          button.setPointerCapture(event.pointerId);
        } catch (error) {
          /* pointer capture is best effort */
        }
        const release = () => {
          if (!alive) return;
          alive = false;
          button.classList.remove("on");
          engine.noteOff(pressedMidi);
        };
        button.addEventListener("pointerup", release, { once: true });
        button.addEventListener("pointercancel", release, { once: true });
        button.addEventListener("lostpointercapture", release, {
          once: true,
        });
        ensureAudio().then((ok) => {
          if (ok && alive) engine.noteOn(pressedMidi, 0.85);
          if (!alive) button.classList.remove("on");
        });
      });

      let keyboardHeld = false;
      const keyboardRelease = () => {
        if (!keyboardHeld) return;
        keyboardHeld = false;
        button.classList.remove("on");
        engine.noteOff(noteFor(offset));
      };
      button.addEventListener("keydown", (event) => {
        if (event.key !== " " && event.key !== "Enter") return;
        event.preventDefault();
        if (event.repeat || keyboardHeld) return;
        keyboardHeld = true;
        const pressedMidi = noteFor(offset);
        button.classList.add("on");
        ensureAudio().then((ok) => {
          if (ok && keyboardHeld) engine.noteOn(pressedMidi, 0.85);
          if (!keyboardHeld) button.classList.remove("on");
        });
      });
      button.addEventListener("keyup", (event) => {
        if (event.key !== " " && event.key !== "Enter") return;
        event.preventDefault();
        keyboardRelease();
      });
      button.addEventListener("blur", keyboardRelease);
    });
  }

  function shiftOctave(delta) {
    releaseHeld();
    state.octave = clamp(state.octave + delta, 1, 6);
    octLabel.textContent = `oct ${state.octave}`;
    buildKeys();
  }

  power.addEventListener("click", () => togglePower());
  autoButton.addEventListener("click", () => {
    state.auto = !state.auto;
    engine.setAuto(state.auto);
    autoButton.setAttribute("aria-pressed", String(state.auto));
  });
  freezeButton.addEventListener("click", () => {
    state.params.freeze = !state.params.freeze;
    freezeButton.setAttribute("aria-pressed", String(state.params.freeze));
  });

  function updateCloudTag() {
    const direction = state.params.direction;
    cloudTag.textContent =
      direction === "random"
        ? "read ↔"
        : direction === "playDir" || direction === "playDirInv"
          ? "read ↕"
          : direction === "reverse"
            ? "read ←"
            : "read →";
  }

  function setDirection(value) {
    state.params.direction = value;
    directionSelect.value = value;
    reverseButton.setAttribute("aria-pressed", String(value === "reverse"));
    updateCloudTag();
  }

  reverseButton.addEventListener("click", () => {
    setDirection(
      state.params.direction === "reverse" ? "forward" : "reverse",
    );
  });
  directionSelect.addEventListener("change", () => {
    setDirection(directionSelect.value);
  });
  shapeSelect.addEventListener("change", () => {
    state.params.shape = shapeSelect.value;
  });
  scaleSelect.addEventListener("change", () => {
    state.params.scale = scaleSelect.value;
  });
  lfoTargetSelect.addEventListener("change", () => {
    state.params.lfoTarget = lfoTargetSelect.value;
  });
  filterTypeSelect.addEventListener("change", () => {
    state.params.filterType = filterTypeSelect.value;
  });

  let advancedOpen = window.innerWidth > 640;
  function setAdvanced(open) {
    advancedOpen = open;
    advancedEl.hidden = !open;
    moreButton.setAttribute("aria-expanded", String(open));
    moreButton.querySelector("span").textContent = open ? "less" : "more";
    requestAnimationFrame(clampPanel);
  }
  setAdvanced(advancedOpen);
  moreButton.addEventListener("click", () => setAdvanced(!advancedOpen));

  function randomizePatch() {
    const random = (min, max) => min + Math.random() * (max - min);
    const sources = ["choir", "harp", "rain", "glass"];
    if (engine.buffers && engine.buffers.own) sources.push("own");
    setSource(sources[Math.floor(Math.random() * sources.length)]);

    const shapes = window.GrainShapes.names;
    const shape = shapes[Math.floor(Math.random() * shapes.length)];
    state.params.shape = shape;
    shapeSelect.value = shape;

    const directions = ["forward", "reverse", "random", "playDir", "playDirInv"];
    setDirection(directions[Math.floor(Math.random() * directions.length)]);

    const scales = ["off", "minor", "major", "dorian"];
    const scale = scales[Math.floor(Math.random() * scales.length)];
    state.params.scale = scale;
    scaleSelect.value = scale;

    const targets = ["position", "pitch", "tone", "width", "space"];
    const target = targets[Math.floor(Math.random() * targets.length)];
    state.params.lfoTarget = target;
    lfoTargetSelect.value = target;

    const filters = ["lowpass", "highpass", "bandpass"];
    const filter = filters[Math.floor(Math.random() * filters.length)];
    state.params.filterType = filter;
    filterTypeSelect.value = filter;

    const values = {
      position: random(0.05, 0.95),
      size: random(60, 320),
      density: random(10, 50),
      spray: random(0, 0.5),
      pitch: Math.round(random(-7, 7)),
      scatter: random(0, 40),
      speed: random(0.55, 1.45),
      tone: random(0.35, 0.9),
      space: random(0.15, 0.7),
      width: random(0.15, 0.8),
      attack: random(0.01, 0.25),
      decay: random(0.15, 0.7),
      sustain: random(0.45, 0.9),
      release: random(0.4, 2.5),
      lfoRate: random(0.03, 0.6),
      lfoDepth: random(0.1, 0.6),
      resonance: random(0.7, 6),
      drive: random(0, 0.45),
      echo: random(0, 0.35),
    };
    Object.entries(values).forEach(([key, value]) => setParam(key, value));
  }

  randomizeButton.addEventListener("click", randomizePatch);
  loadButton.addEventListener("click", () => {
    ensureAudio();
    fileInput.click();
  });
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = "";
    if (!file) return;
    loadButton.disabled = true;
    loadButton.classList.add("busy");
    try {
      const data = await file.arrayBuffer();
      await engine.loadSample(data, file.name);
      const ownButton = sourceButtons.get("own");
      ownButton.hidden = false;
      ownButton.title = file.name;
      ownButton.setAttribute("aria-label", `Play ${file.name}`);
      setSource("own");
    } catch (error) {
      errorEl.hidden = false;
      errorEl.textContent = "That sample could not be decoded.";
      console.error(error);
    } finally {
      loadButton.disabled = false;
      loadButton.classList.remove("busy");
    }
  });

  motionButton.addEventListener("click", () => {
    state.motion = !state.motion;
    garden.setMotion(state.motion);
    motionButton.setAttribute("aria-pressed", String(state.motion));
  });
  $("#oct-down").addEventListener("click", () => shiftOctave(-1));
  $("#oct-up").addEventListener("click", () => shiftOctave(1));

  setDirection(state.params.direction);

  if (!state.motion) {
    garden.setMotion(false);
    motionButton.setAttribute("aria-pressed", "false");
  }
  buildKeys();
  octLabel.textContent = `oct ${state.octave}`;
  engine.setAuto(state.auto);

  window.addEventListener("keydown", (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      target.closest("input, textarea, select")
    ) {
      return;
    }
    const key = event.key.toLowerCase();
    const isButton =
      target instanceof HTMLElement && !!target.closest("button");
    if ((key === " " || event.code === "Space" || key === "enter") && isButton) {
      return;
    }
    if (key === " " || event.code === "Space") {
      event.preventDefault();
      if (!event.repeat) togglePower();
      return;
    }
    if (key === "z" || key === "x") {
      event.preventDefault();
      if (!event.repeat) shiftOctave(key === "x" ? 1 : -1);
      return;
    }
    const offset = KEYMAP[key];
    if (offset === undefined) return;
    event.preventDefault();
    if (event.repeat || held.has(key)) return;
    const midi = noteFor(offset);
    held.set(key, midi);
    const button = keyEls.get(key);
    if (button) button.classList.add("on");
    ensureAudio().then((ok) => {
      if (ok && held.get(key) === midi) engine.noteOn(midi, 0.85);
    });
  });

  window.addEventListener("keyup", (event) => {
    const key = event.key.toLowerCase();
    if (!held.has(key)) return;
    const midi = held.get(key);
    held.delete(key);
    engine.noteOff(midi);
    const button = keyEls.get(key);
    if (button) button.classList.remove("on");
  });

  window.addEventListener("blur", () => {
    releaseHeld();
    engine.allNotesOff();
  });

  engine.onGrain = (grain) => {
    cloudGrains.push({
      start: grain.start,
      span: grain.span,
      reverse: grain.reverse,
      size: grain.size,
      born: performance.now(),
      y: Math.random(),
    });
    if (cloudGrains.length > 150) cloudGrains.shift();
    garden.grain(grain);
  };
  engine.onNote = ({ velocity }) => {
    garden.pulse(velocity);
  };

  function fitCanvas(canvas, ctx) {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    if (
      canvas.width !== Math.round(width * dpr) ||
      canvas.height !== Math.round(height * dpr)
    ) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    return { width, height };
  }

  const scopeData = new Uint8Array(1024);

  const CLOUD_VIEW_SECONDS = 1.15;

  function drawCloud(now) {
    const { width, height } = fitCanvas(cloud, cloudCtx);
    cloudCtx.clearRect(0, 0, width, height);
    const params = state.params;
    const overview = engine.getPeaks(params.source) || placeholder;
    const detail = engine.getWaveform(params.source) || overview;
    const duration = engine.getDuration(params.source);
    const viewSpan = Math.min(1, CLOUD_VIEW_SECONDS / duration);
    const center = clamp(
      engine.mod ? engine.mod.position : params.position,
      0,
      1,
    );
    let viewStart = center - viewSpan / 2;
    viewStart = clamp(viewStart, 0, 1 - viewSpan);
    const overviewHeight = 12;
    const zoomHeight = height - overviewHeight - 5;
    const zoomMiddle = zoomHeight * 0.53;
    const overviewTop = height - overviewHeight;
    const overviewMiddle = overviewTop + overviewHeight / 2;
    const mapX = (t) => ((t - viewStart) / viewSpan) * width;
    const readX = mapX(center);

    cloudCtx.fillStyle = "rgba(240, 234, 220, 0.2)";
    for (let x = 0; x < width; x += 2) {
      const t = viewStart + (x / width) * viewSpan;
      const index = clamp(
        Math.floor(t * detail.length),
        0,
        detail.length - 1,
      );
      const amplitude = Math.max(0.5, detail[index] * zoomHeight * 0.42);
      cloudCtx.fillRect(x, zoomMiddle - amplitude, 1.4, amplitude * 2);
    }

    cloudCtx.strokeStyle = "rgba(240, 234, 220, 0.08)";
    cloudCtx.lineWidth = 0.5;
    cloudCtx.beginPath();
    cloudCtx.moveTo(0, zoomMiddle);
    cloudCtx.lineTo(width, zoomMiddle);
    cloudCtx.stroke();

    const band = Math.max(7, params.spray * width * 0.24);
    const bandGradient = cloudCtx.createLinearGradient(
      readX - band,
      0,
      readX + band,
      0,
    );
    bandGradient.addColorStop(0, "rgba(255, 249, 232, 0)");
    bandGradient.addColorStop(0.5, "rgba(255, 249, 232, 0.07)");
    bandGradient.addColorStop(1, "rgba(255, 249, 232, 0)");
    cloudCtx.fillStyle = bandGradient;
    cloudCtx.fillRect(readX - band, 0, band * 2, zoomHeight);

    cloudCtx.strokeStyle = `rgba(255, 249, 232, ${params.freeze ? 0.85 : 0.5})`;
    cloudCtx.lineWidth = 0.8;
    cloudCtx.beginPath();
    cloudCtx.moveTo(readX, 2);
    cloudCtx.lineTo(readX, zoomHeight - 2);
    cloudCtx.stroke();
    cloudCtx.beginPath();
    cloudCtx.moveTo(readX, 2);
    cloudCtx.lineTo(readX - 2.5, 6);
    cloudCtx.lineTo(readX + 2.5, 6);
    cloudCtx.closePath();
    cloudCtx.fillStyle = `rgba(255, 249, 232, ${params.freeze ? 0.9 : 0.55})`;
    cloudCtx.fill();

    for (let i = cloudGrains.length - 1; i >= 0; i--) {
      const grain = cloudGrains[i];
      const age = (now - grain.born) / 1000;
      const life = 0.4 + grain.size * 2.4;
      if (age > life) {
        cloudGrains.splice(i, 1);
        continue;
      }
      const startX = mapX(grain.start);
      const endX = mapX(grain.start + grain.span);
      if (endX < -20 || startX > width + 20) continue;
      const fade = 1 - age / life;
      const y = zoomMiddle + (grain.y - 0.5) * zoomHeight * 0.62;
      const progress = clamp(age / Math.max(0.01, grain.size), 0, 1);
      const headX = grain.reverse
        ? endX + (startX - endX) * progress
        : startX + (endX - startX) * progress;

      cloudCtx.strokeStyle = `rgba(255, 249, 232, ${fade * 0.16})`;
      cloudCtx.lineWidth = 0.7;
      cloudCtx.beginPath();
      cloudCtx.moveTo(startX, y);
      cloudCtx.lineTo(endX, y);
      cloudCtx.stroke();

      cloudCtx.strokeStyle = `rgba(255, 249, 232, ${fade * 0.45})`;
      cloudCtx.lineWidth = 0.9;
      cloudCtx.beginPath();
      if (grain.reverse) {
        cloudCtx.moveTo(headX, y);
        cloudCtx.lineTo(endX, y);
      } else {
        cloudCtx.moveTo(startX, y);
        cloudCtx.lineTo(headX, y);
      }
      cloudCtx.stroke();

      cloudCtx.strokeStyle = `rgba(255, 249, 232, ${fade * 0.32})`;
      cloudCtx.lineWidth = 0.55;
      cloudCtx.beginPath();
      for (let k = 0; k <= 8; k++) {
        const t = k / 8;
        const windowValue = window.GrainShapes.sample(params.shape, t);
        const x = startX + (endX - startX) * t;
        const curveY = y - windowValue * 8;
        if (k === 0) cloudCtx.moveTo(x, curveY);
        else cloudCtx.lineTo(x, curveY);
      }
      cloudCtx.stroke();

      cloudCtx.strokeStyle = `rgba(255, 249, 232, ${fade * 0.55})`;
      cloudCtx.lineWidth = 0.7;
      cloudCtx.beginPath();
      cloudCtx.moveTo(headX, y - 4.5);
      cloudCtx.lineTo(headX, y + 4.5);
      cloudCtx.stroke();

      cloudCtx.fillStyle = `rgba(255, 249, 232, ${fade * 0.95})`;
      cloudCtx.beginPath();
      cloudCtx.arc(headX, y, 0.9 + grain.size * 5, 0, TAU);
      cloudCtx.fill();

      const direction = grain.reverse ? -1 : 1;
      cloudCtx.strokeStyle = `rgba(255, 249, 232, ${fade * 0.6})`;
      cloudCtx.lineWidth = 0.7;
      cloudCtx.beginPath();
      cloudCtx.moveTo(headX - direction * 3, y - 3);
      cloudCtx.lineTo(headX, y);
      cloudCtx.lineTo(headX - direction * 3, y + 3);
      cloudCtx.stroke();
    }

    const overviewBar = width / overview.length;
    cloudCtx.fillStyle = "rgba(240, 234, 220, 0.14)";
    for (let i = 0; i < overview.length; i++) {
      const amplitude = Math.max(0.4, overview[i] * overviewHeight * 0.36);
      cloudCtx.fillRect(
        i * overviewBar,
        overviewMiddle - amplitude,
        Math.max(0.5, overviewBar * 0.7),
        amplitude * 2,
      );
    }
    cloudCtx.strokeStyle = "rgba(255, 249, 232, 0.3)";
    cloudCtx.lineWidth = 0.6;
    cloudCtx.strokeRect(
      viewStart * width,
      overviewTop + 0.5,
      viewSpan * width,
      overviewHeight - 1,
    );
    cloudCtx.fillStyle = "rgba(255, 249, 232, 0.22)";
    cloudCtx.fillRect(params.position * width, overviewTop, 1, overviewHeight);
    cloudCtx.fillStyle = "rgba(255, 249, 232, 0.8)";
    cloudCtx.fillRect(center * width, overviewTop, 1, overviewHeight);
    cloudCtx.strokeStyle = "rgba(240, 234, 220, 0.08)";
    cloudCtx.beginPath();
    cloudCtx.moveTo(0, overviewTop);
    cloudCtx.lineTo(width, overviewTop);
    cloudCtx.stroke();
  }

  function drawScope() {
    const { width, height } = fitCanvas(scope, scopeCtx);
    scopeCtx.clearRect(0, 0, width, height);
    const middle = height / 2;
    scopeCtx.strokeStyle = "rgba(240, 234, 220, 0.1)";
    scopeCtx.lineWidth = 0.5;
    scopeCtx.beginPath();
    scopeCtx.moveTo(0, middle);
    scopeCtx.lineTo(width, middle);
    scopeCtx.stroke();
    if (!engine.getScope(scopeData)) return;
    let peak = 0;
    for (let i = 0; i < scopeData.length; i++) {
      peak = Math.max(peak, Math.abs((scopeData[i] - 128) / 128));
    }
    const gain = clamp(0.85 / Math.max(0.002, peak), 1, 10);
    scopeCtx.beginPath();
    for (let i = 0; i < scopeData.length; i++) {
      const x = (i / (scopeData.length - 1)) * width;
      const y =
        middle +
        clamp(((scopeData[i] - 128) / 128) * gain, -1, 1) * height * 0.46;
      if (i === 0) scopeCtx.moveTo(x, y);
      else scopeCtx.lineTo(x, y);
    }
    scopeCtx.strokeStyle = "rgba(245, 239, 223, 0.72)";
    scopeCtx.lineWidth = 0.8;
    scopeCtx.stroke();
  }

  let energyAt = 0;

  function uiFrame(now) {
    drawCloud(now);
    drawScope();
    if (now - energyAt > 100) {
      energyAt = now;
      document.documentElement.style.setProperty(
        "--energy",
        engine.energy.toFixed(3),
      );
    }
    requestAnimationFrame(uiFrame);
  }
  requestAnimationFrame(uiFrame);

  $("#garden").addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const x = event.clientX;
    const y = event.clientY;
    garden.burst(x, y);
    ensureAudio().then((ok) => {
      if (!ok) return;
      const scale = [0, 2, 3, 5, 7, 10, 12];
      const index = clamp(
        Math.floor((x / window.innerWidth) * scale.length),
        0,
        scale.length - 1,
      );
      const octave =
        5 - Math.floor(clamp(y / window.innerHeight, 0, 0.999) * 3);
      const midi = 60 + scale[index] + (octave - 4) * 12;
      engine.pluck(midi, 0.82, 1.6);
    });
  });

  let dragState = null;

  function clampPanel() {
    if (window.innerWidth <= 640) return;
    if (panel.style.transform !== "none") return;
    const rect = panel.getBoundingClientRect();
    const x = clamp(
      parseFloat(panel.style.left) || rect.left,
      8,
      Math.max(8, window.innerWidth - rect.width - 8),
    );
    const y = clamp(
      parseFloat(panel.style.top) || rect.top,
      8,
      Math.max(8, window.innerHeight - rect.height - 8),
    );
    panel.style.left = `${x}px`;
    panel.style.top = `${y}px`;
  }

  handle.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button")) return;
    if (window.innerWidth <= 640) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    const rect = panel.getBoundingClientRect();
    panel.style.left = `${rect.left}px`;
    panel.style.top = `${rect.top}px`;
    panel.style.transform = "none";
    panel.classList.add("dragging");
    dragState = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    };
    try {
      handle.setPointerCapture(event.pointerId);
    } catch (error) {
      /* pointer capture is best effort */
    }
  });

  handle.addEventListener("pointermove", (event) => {
    if (!dragState || event.pointerId !== dragState.id) return;
    const x = clamp(
      dragState.left + event.clientX - dragState.startX,
      8,
      Math.max(8, window.innerWidth - dragState.width - 8),
    );
    const y = clamp(
      dragState.top + event.clientY - dragState.startY,
      8,
      Math.max(8, window.innerHeight - dragState.height - 8),
    );
    panel.style.left = `${x}px`;
    panel.style.top = `${y}px`;
  });

  function endDrag(event) {
    if (!dragState || event.pointerId !== dragState.id) return;
    dragState = null;
    panel.classList.remove("dragging");
    if (handle.hasPointerCapture(event.pointerId)) {
      handle.releasePointerCapture(event.pointerId);
    }
    try {
      localStorage.setItem(
        "grain:layout",
        JSON.stringify({
          x: parseFloat(panel.style.left),
          y: parseFloat(panel.style.top),
        }),
      );
    } catch (error) {
      /* storage may be unavailable */
    }
  }

  handle.addEventListener("pointerup", endDrag);
  handle.addEventListener("pointercancel", endDrag);
  handle.addEventListener("lostpointercapture", () => {
    if (dragState) {
      dragState = null;
      panel.classList.remove("dragging");
    }
  });
  window.addEventListener("resize", clampPanel);

  try {
    const saved = localStorage.getItem("grain:layout");
    if (saved && window.innerWidth > 640) {
      const layout = JSON.parse(saved);
      if (Number.isFinite(layout.x) && Number.isFinite(layout.y)) {
        panel.style.left = `${layout.x}px`;
        panel.style.top = `${layout.y}px`;
        panel.style.transform = "none";
        requestAnimationFrame(clampPanel);
      }
    }
  } catch (error) {
    /* ignore malformed layout */
  }

  window.grain = { state, engine, garden };
})();
