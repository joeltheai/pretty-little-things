const EXPORT_EDGE = 1800;
const PREVIEW_EDGE = 1500;
const SHEET_MAX_HEIGHT = 4600;
const MIN_CROP = 0.04;
const HANDLE_HIT = 14;

const DEFAULTS = {
  notches: 11,
  hole: 34,
  margin: 6,
  paper: "#f3ecdf",
};

const PAPERS = [
  { name: "ecru", color: "#f3ecdf" },
  { name: "lily", color: "#fbfaf6" },
  { name: "blush", color: "#f5e2dc" },
  { name: "mint", color: "#e0eae1" },
  { name: "sky", color: "#dde8ef" },
  { name: "ink", color: "#242322" },
];

const state = {
  image: null,
  name: "sample · dunes",
  cropRect: { x: 0, y: 0, w: 1, h: 1 },
  notches: DEFAULTS.notches,
  hole: DEFAULTS.hole,
  margin: DEFAULTS.margin,
  paper: DEFAULTS.paper,
};

const preview = document.getElementById("preview");
const thumb = document.getElementById("thumb");
const sourceButton = document.getElementById("source");
const sourceName = document.getElementById("source-name");
const fileInput = document.getElementById("file");
const metaEl = document.getElementById("meta");
const statusEl = document.getElementById("status");
const dropEl = document.getElementById("drop");
const downloadButton = document.getElementById("download");
const downloadAlt = document.getElementById("download-stamp");
const paperWrap = document.getElementById("papers");
const cropOpen = document.getElementById("crop-open");
const cropModal = document.getElementById("crop-modal");
const cropCanvas = document.getElementById("crop-canvas");
const cropReadout = document.getElementById("crop-readout");
const cropApply = document.getElementById("crop-apply");
const cropDialog = document.getElementById("crop-dialog");

let grainPattern = null;
let frame = 0;
let statusTimer = 0;
let exporting = false;
let editor = null;

/* ---------- sample image ---------- */

function makeSampleImage() {
  const width = 1200;
  const height = 1500;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "#f7e7cf");
  sky.addColorStop(0.42, "#f2c9a6");
  sky.addColorStop(0.72, "#e4a887");
  sky.addColorStop(1, "#c9806f");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  const glow = ctx.createRadialGradient(700, 610, 20, 700, 610, 310);
  glow.addColorStop(0, "rgba(255, 226, 154, 1)");
  glow.addColorStop(0.45, "rgba(250, 198, 120, 0.82)");
  glow.addColorStop(1, "rgba(240, 170, 110, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(700, 610, 310, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#fbe6b4";
  ctx.beginPath();
  ctx.arc(700, 610, 132, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(255, 236, 205, 0.18)";
  ctx.fillRect(0, 898, width, 62);

  const bands = [
    { y: 1010, amp: 68, color: "#c98b72", phase: 0.6 },
    { y: 1178, amp: 98, color: "#a96a5c", phase: 2.1 },
    { y: 1330, amp: 78, color: "#7c4f4c", phase: 4.0 },
  ];

  for (const band of bands) {
    ctx.beginPath();
    ctx.moveTo(0, height);
    ctx.lineTo(0, band.y);
    for (let x = 0; x <= width; x += 16) {
      const y =
        band.y +
        Math.sin((x / width) * Math.PI * 1.6 + band.phase) *
          band.amp *
          (0.4 + (x / width) * 0.8);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fillStyle = band.color;
    ctx.fill();
  }

  ctx.strokeStyle = "rgba(90, 60, 55, 0.5)";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  for (const [x, y, scale] of [
    [420, 430, 1],
    [500, 470, 0.8],
    [350, 500, 0.65],
  ]) {
    ctx.beginPath();
    ctx.moveTo(x - 18 * scale, y);
    ctx.quadraticCurveTo(x - 9 * scale, y - 8 * scale, x, y);
    ctx.quadraticCurveTo(x + 9 * scale, y - 8 * scale, x + 18 * scale, y);
    ctx.stroke();
  }

  return canvas;
}

/* ---------- helpers ---------- */

function mulberry32(seed) {
  return function random() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function isDarkPaper(hex) {
  const value = parseInt(hex.slice(1), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 110;
}

function paperName(color) {
  const match = PAPERS.find((paper) => paper.color === color);
  return match ? match.name : "custom";
}

function resetCropRect() {
  state.cropRect = { x: 0, y: 0, w: 1, h: 1 };
}

function cropSource(image) {
  const rect = state.cropRect;
  return {
    x: rect.x * image.width,
    y: rect.y * image.height,
    w: rect.w * image.width,
    h: rect.h * image.height,
  };
}

function cropAspect(image) {
  const source = cropSource(image);
  return source.w / source.h;
}

function updateThumb() {
  if (!state.image) return;

  const ctx = thumb.getContext("2d");
  const source = cropSource(state.image);
  const scale = Math.max(thumb.width / source.w, thumb.height / source.h);
  const sw = thumb.width / scale;
  const sh = thumb.height / scale;
  const sx = source.x + (source.w - sw) / 2;
  const sy = source.y + (source.h - sh) / 2;

  ctx.clearRect(0, 0, thumb.width, thumb.height);
  ctx.drawImage(
    state.image,
    sx,
    sy,
    sw,
    sh,
    0,
    0,
    thumb.width,
    thumb.height,
  );
}

/* ---------- stamp geometry ---------- */

function stampMetrics(width, height) {
  const long = Math.max(width, height);
  const spacing = long / state.notches;
  const across = Math.max(1, Math.round(width / spacing));
  const down = Math.max(1, Math.round(height / spacing));
  const stepX = width / across;
  const stepY = height / down;
  const radius = Math.min(stepX, stepY) * (state.hole / 100);

  return { radius, across, down, stepX, stepY, short: Math.min(width, height) };
}

/*
 * The photo frame is sized from the crop's aspect ratio first, then the paper
 * border is added around it. That way the chosen crop fills the frame exactly
 * instead of being cropped a second time.
 */
function stampLayout(image, frameLongEdge) {
  const aspect = cropAspect(image);
  const frameW = aspect >= 1 ? frameLongEdge : frameLongEdge * aspect;
  const frameH = aspect >= 1 ? frameLongEdge / aspect : frameLongEdge;
  const short = Math.min(frameW, frameH);
  const base = (state.margin / 100) * short;
  let inset = base;

  for (let i = 0; i < 3 && inset > 0; i += 1) {
    const metrics = stampMetrics(frameW + inset * 2, frameH + inset * 2);
    inset = Math.max(base, metrics.radius + short * 0.006);
  }

  return {
    width: frameW + inset * 2,
    height: frameH + inset * 2,
    inset,
  };
}

/*
 * Walks the rectangular outline clockwise, cutting a semicircular notch out of
 * each edge. Notches are centred in equal segments so the corners stay intact.
 */
function stampPath(ctx, width, height, metrics) {
  const { radius, across, down, stepX, stepY } = metrics;

  ctx.beginPath();
  ctx.moveTo(0, 0);

  for (let i = 0; i < across; i += 1) {
    const cx = (i + 0.5) * stepX;
    ctx.lineTo(cx - radius, 0);
    ctx.arc(cx, 0, radius, Math.PI, 0, true);
  }
  ctx.lineTo(width, 0);

  for (let i = 0; i < down; i += 1) {
    const cy = (i + 0.5) * stepY;
    ctx.lineTo(width, cy - radius);
    ctx.arc(width, cy, radius, -Math.PI / 2, Math.PI / 2, true);
  }
  ctx.lineTo(width, height);

  for (let i = across - 1; i >= 0; i -= 1) {
    const cx = (i + 0.5) * stepX;
    ctx.lineTo(cx + radius, height);
    ctx.arc(cx, height, radius, 0, Math.PI, true);
  }
  ctx.lineTo(0, height);

  for (let i = down - 1; i >= 0; i -= 1) {
    const cy = (i + 0.5) * stepY;
    ctx.lineTo(0, cy + radius);
    ctx.arc(0, cy, radius, Math.PI / 2, -Math.PI / 2, true);
  }
  ctx.closePath();
}

function getGrain(ctx) {
  if (grainPattern) return grainPattern;

  const tile = document.createElement("canvas");
  tile.width = 160;
  tile.height = 160;
  const tileCtx = tile.getContext("2d");
  const pixels = tileCtx.createImageData(160, 160);
  const random = mulberry32(0x51a3c7);

  for (let i = 0; i < pixels.data.length; i += 4) {
    const value = 96 + Math.floor(random() * 64);
    pixels.data[i] = value;
    pixels.data[i + 1] = value;
    pixels.data[i + 2] = value;
    pixels.data[i + 3] = 255;
  }

  tileCtx.putImageData(pixels, 0, 0);
  grainPattern = ctx.createPattern(tile, "repeat");
  return grainPattern;
}

/* ---------- rendering ---------- */

function renderStamp(canvas, image, frameLongEdge) {
  const layout = stampLayout(image, frameLongEdge);
  const w = Math.max(2, Math.round(layout.width));
  const h = Math.max(2, Math.round(layout.height));
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, w, h);

  const metrics = stampMetrics(w, h);
  const short = Math.min(w, h);
  const dark = isDarkPaper(state.paper);
  const insetX = layout.inset * (w / layout.width);
  const insetY = layout.inset * (h / layout.height);
  const frameW = w - insetX * 2;
  const frameH = h - insetY * 2;

  ctx.save();
  stampPath(ctx, w, h, metrics);
  ctx.clip();

  ctx.fillStyle = state.paper;
  ctx.fillRect(0, 0, w, h);

  const source = cropSource(image);
  if (source.w > 0 && source.h > 0 && frameW > 1 && frameH > 1) {
    ctx.drawImage(
      image,
      source.x,
      source.y,
      source.w,
      source.h,
      insetX,
      insetY,
      frameW,
      frameH,
    );
  }

  if (insetX > 0.5 && insetY > 0.5) {
    const lineWidth = Math.max(1, short * 0.0014);
    ctx.strokeStyle = dark ? "rgba(255, 255, 255, 0.16)" : "rgba(0, 0, 0, 0.1)";
    ctx.lineWidth = lineWidth;
    ctx.strokeRect(
      insetX + lineWidth / 2,
      insetY + lineWidth / 2,
      frameW - lineWidth,
      frameH - lineWidth,
    );
  }

  const grain = getGrain(ctx);
  if (grain) {
    ctx.globalAlpha = 0.055;
    ctx.globalCompositeOperation = "overlay";
    ctx.fillStyle = grain;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  stampPath(ctx, w, h, metrics);
  ctx.strokeStyle = dark ? "rgba(255, 255, 255, 0.07)" : "rgba(0, 0, 0, 0.1)";
  ctx.lineWidth = Math.max(2, short * 0.004);
  ctx.stroke();

  ctx.restore();
}

/* ---------- sheet layout ---------- */

function sheetLayout(image) {
  const reference = stampLayout(image, 1000);
  const stampAspect = reference.width / reference.height;
  const imageAspect = image.width / image.height;
  const relativeHeight = 0.26 + 1 / stampAspect + 1 / imageAspect;
  const content = Math.max(
    640,
    Math.min(1500, image.width, Math.floor(SHEET_MAX_HEIGHT / relativeHeight)),
  );
  const margin = Math.round(content * 0.09);
  const gap = Math.round(content * 0.08);
  const stampHeight = content / stampAspect;
  const imageHeight = content / imageAspect;

  return {
    width: Math.round(content + margin * 2),
    height: Math.round(margin * 2 + stampHeight + gap + imageHeight),
    content,
    margin,
    gap,
    stampHeight,
    imageHeight,
  };
}

function paint() {
  if (!state.image) return;

  renderStamp(preview, state.image, PREVIEW_EDGE);

  const sheet = sheetLayout(state.image);
  metaEl.textContent = `${sheet.width} × ${sheet.height} px sheet · ${paperName(
    state.paper,
  )} paper`;
}

function scheduleDraw() {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    paint();
  });
}

/* ---------- status ---------- */

function setStatus(message) {
  window.clearTimeout(statusTimer);
  if (!message) {
    statusEl.classList.remove("show");
    return;
  }
  statusEl.textContent = message;
  statusEl.classList.add("show");
  statusTimer = window.setTimeout(() => statusEl.classList.remove("show"), 2600);
}

/* ---------- image input ---------- */

function loadViaImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image decode failed"));
    };
    image.src = url;
  });
}

async function decodeImage(file) {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      try {
        return await createImageBitmap(file);
      } catch {
        /* fall through to <img> */
      }
    }
  }
  return loadViaImage(file);
}

async function acceptFile(file) {
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    setStatus("that file is not an image");
    return;
  }

  setStatus("reading image…");

  try {
    const image = await decodeImage(file);
    if (!image.width || !image.height) throw new Error("empty image");

    if (editor) closeCrop();
    state.image = image;
    state.name = (file.name || "image").replace(/\.[^.]+$/, "") || "image";
    sourceName.textContent = state.name;
    resetCropRect();
    updateThumb();
    setStatus("");
    paint();
  } catch {
    setStatus("could not read that image");
  }
}

/* ---------- controls ---------- */

function bindRange(input, output, key, format) {
  const sync = () => {
    const min = Number(input.min);
    const max = Number(input.max);
    const percent = ((Number(input.value) - min) / (max - min)) * 100;
    input.style.setProperty("--p", `${percent}%`);
    output.textContent = format(Number(input.value));
  };

  input.addEventListener("input", () => {
    state[key] = Number(input.value);
    sync();
    scheduleDraw();
  });

  sync();
  return { input, sync };
}

const ranges = {
  notches: bindRange(
    document.getElementById("notches"),
    document.getElementById("notches-out"),
    "notches",
    (value) => String(value),
  ),
  hole: bindRange(
    document.getElementById("hole"),
    document.getElementById("hole-out"),
    "hole",
    (value) => `${value}%`,
  ),
  margin: bindRange(
    document.getElementById("margin"),
    document.getElementById("margin-out"),
    "margin",
    (value) => `${value}%`,
  ),
};

const paperButtons = PAPERS.map((paper) => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "swatch";
  button.style.setProperty("--c", paper.color);
  button.dataset.paper = paper.color;
  button.setAttribute("aria-label", `${paper.name} paper`);
  button.setAttribute("aria-pressed", String(paper.color === state.paper));
  button.title = paper.name;

  button.addEventListener("click", () => {
    state.paper = paper.color;
    paperButtons.forEach((item) => {
      item.setAttribute("aria-pressed", String(item.dataset.paper === paper.color));
    });
    scheduleDraw();
  });

  paperWrap.appendChild(button);
  return button;
});

document.getElementById("reset").addEventListener("click", () => {
  state.notches = DEFAULTS.notches;
  state.hole = DEFAULTS.hole;
  state.margin = DEFAULTS.margin;
  state.paper = DEFAULTS.paper;

  ranges.notches.input.value = String(DEFAULTS.notches);
  ranges.hole.input.value = String(DEFAULTS.hole);
  ranges.margin.input.value = String(DEFAULTS.margin);
  Object.values(ranges).forEach((range) => range.sync());

  paperButtons.forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.paper === state.paper));
  });

  resetCropRect();
  updateThumb();
  scheduleDraw();
});

sourceButton.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", () => {
  const [file] = fileInput.files || [];
  acceptFile(file);
  fileInput.value = "";
});

/* ---------- crop editor ---------- */

function cropPointer(event) {
  const rect = cropCanvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * editor.displayW,
    y: ((event.clientY - rect.top) / rect.height) * editor.displayH,
  };
}

function editorRect() {
  const { rect, pad, imgW, imgH } = editor;
  return {
    x: pad + rect.x * imgW,
    y: pad + rect.y * imgH,
    w: rect.w * imgW,
    h: rect.h * imgH,
  };
}

function cursorFor(hit) {
  if (hit === "move") return "grab";
  if (hit === "nw" || hit === "se") return "nwse-resize";
  if (hit === "ne" || hit === "sw") return "nesw-resize";
  if (hit === "n" || hit === "s") return "ns-resize";
  if (hit === "e" || hit === "w") return "ew-resize";
  return "default";
}

function hitTest(x, y) {
  const rect = editorRect();
  const left = Math.abs(x - rect.x) <= HANDLE_HIT;
  const right = Math.abs(x - (rect.x + rect.w)) <= HANDLE_HIT;
  const top = Math.abs(y - rect.y) <= HANDLE_HIT;
  const bottom = Math.abs(y - (rect.y + rect.h)) <= HANDLE_HIT;
  const insideX = x >= rect.x && x <= rect.x + rect.w;
  const insideY = y >= rect.y && y <= rect.y + rect.h;

  if (left && top) return "nw";
  if (right && top) return "ne";
  if (left && bottom) return "sw";
  if (right && bottom) return "se";
  if (top && insideX) return "n";
  if (bottom && insideX) return "s";
  if (left && insideY) return "w";
  if (right && insideY) return "e";
  if (insideX && insideY) return "move";
  return null;
}

function drawEditor() {
  if (!editor) return;

  const { pad, imgW, imgH, displayW, displayH } = editor;
  const ctx = cropCanvas.getContext("2d");
  ctx.clearRect(0, 0, displayW, displayH);
  ctx.drawImage(state.image, pad, pad, imgW, imgH);

  const rect = editorRect();
  const right = rect.x + rect.w;
  const bottom = rect.y + rect.h;

  ctx.fillStyle = "rgba(6, 6, 7, 0.64)";
  ctx.fillRect(pad, pad, imgW, rect.y - pad);
  ctx.fillRect(pad, bottom, imgW, pad + imgH - bottom);
  ctx.fillRect(pad, rect.y, rect.x - pad, rect.h);
  ctx.fillRect(right, rect.y, pad + imgW - right, rect.h);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i < 3; i += 1) {
    const x = rect.x + (rect.w * i) / 3;
    const y = rect.y + (rect.h * i) / 3;
    ctx.moveTo(x, rect.y);
    ctx.lineTo(x, bottom);
    ctx.moveTo(rect.x, y);
    ctx.lineTo(right, y);
  }
  ctx.stroke();

  ctx.strokeStyle = "#f0e3c8";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);

  const handles = [
    [rect.x, rect.y],
    [rect.x + rect.w / 2, rect.y],
    [right, rect.y],
    [right, rect.y + rect.h / 2],
    [right, bottom],
    [rect.x + rect.w / 2, bottom],
    [rect.x, bottom],
    [rect.x, rect.y + rect.h / 2],
  ];

  ctx.fillStyle = "#f0e3c8";
  ctx.strokeStyle = "rgba(10, 10, 11, 0.65)";
  ctx.lineWidth = 1;
  for (const [x, y] of handles) {
    ctx.fillRect(x - 4.5, y - 4.5, 9, 9);
    ctx.strokeRect(x - 4.5, y - 4.5, 9, 9);
  }

  cropReadout.textContent = `${Math.round(
    editor.rect.w * state.image.width,
  )} × ${Math.round(editor.rect.h * state.image.height)} px`;
}

function layoutEditor() {
  if (!editor) return;

  const image = state.image;
  const stage = cropCanvas.parentElement;
  const availW = Math.max(200, stage.clientWidth - 16);
  const availH = Math.max(200, window.innerHeight * 0.55);
  const pad = 18;
  const scale = Math.min(
    (availW - pad * 2) / image.width,
    availH / image.height,
    2,
  );
  const imgW = Math.max(2, Math.round(image.width * scale));
  const imgH = Math.max(2, Math.round(image.height * scale));
  const displayW = imgW + pad * 2;
  const displayH = imgH + pad * 2;
  const dpr = Math.min(2, window.devicePixelRatio || 1);

  editor.pad = pad;
  editor.imgW = imgW;
  editor.imgH = imgH;
  editor.displayW = displayW;
  editor.displayH = displayH;

  cropCanvas.style.width = `${displayW}px`;
  cropCanvas.style.height = `${displayH}px`;
  cropCanvas.width = Math.round(displayW * dpr);
  cropCanvas.height = Math.round(displayH * dpr);
  const ctx = cropCanvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  drawEditor();
}

function openCrop() {
  if (!state.image) return;

  editor = {
    rect: { ...state.cropRect },
    drag: null,
  };
  cropModal.hidden = false;
  document.body.classList.add("modal-open");
  layoutEditor();
  cropDialog.focus({ preventScroll: true });
}

function closeCrop() {
  if (!editor) return;
  editor = null;
  cropModal.hidden = true;
  document.body.classList.remove("modal-open");
  cropOpen.focus({ preventScroll: true });
}

function applyCrop() {
  if (!editor) return;
  state.cropRect = { ...editor.rect };
  updateThumb();
  scheduleDraw();
  closeCrop();
}

cropCanvas.addEventListener("pointerdown", (event) => {
  if (!editor || event.button !== 0) return;

  const point = cropPointer(event);
  const hit = hitTest(point.x, point.y);
  if (!hit) return;

  cropCanvas.setPointerCapture(event.pointerId);
  editor.drag = {
    id: event.pointerId,
    hit,
    x: point.x,
    y: point.y,
    rect: { ...editor.rect },
  };
  cropCanvas.style.cursor = hit === "move" ? "grabbing" : cursorFor(hit);
  event.preventDefault();
});

cropCanvas.addEventListener("pointermove", (event) => {
  if (!editor) return;

  const point = cropPointer(event);

  if (!editor.drag) {
    const hover = hitTest(point.x, point.y);
    cropCanvas.style.cursor = cursorFor(hover);
    return;
  }

  if (event.pointerId !== editor.drag.id) return;

  const drag = editor.drag;
  const dx = (point.x - drag.x) / editor.imgW;
  const dy = (point.y - drag.y) / editor.imgH;
  const start = drag.rect;
  let x0 = start.x;
  let y0 = start.y;
  let x1 = start.x + start.w;
  let y1 = start.y + start.h;

  if (drag.hit === "move") {
    x0 = clamp(start.x + dx, 0, 1 - start.w);
    y0 = clamp(start.y + dy, 0, 1 - start.h);
    x1 = x0 + start.w;
    y1 = y0 + start.h;
  } else {
    if (drag.hit.includes("w")) x0 = clamp(start.x + dx, 0, x1 - MIN_CROP);
    if (drag.hit.includes("e")) x1 = clamp(x1 + dx, x0 + MIN_CROP, 1);
    if (drag.hit.includes("n")) y0 = clamp(start.y + dy, 0, y1 - MIN_CROP);
    if (drag.hit.includes("s")) y1 = clamp(y1 + dy, y0 + MIN_CROP, 1);
  }

  editor.rect = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  drawEditor();
});

function endEditorDrag(event) {
  if (!editor || !editor.drag) return;
  if (event && event.pointerId !== editor.drag.id) return;
  editor.drag = null;
  cropCanvas.style.cursor = "default";
}

cropCanvas.addEventListener("pointerup", endEditorDrag);
cropCanvas.addEventListener("pointercancel", endEditorDrag);
cropCanvas.addEventListener("lostpointercapture", endEditorDrag);

document.getElementById("crop-close").addEventListener("click", closeCrop);
document.getElementById("crop-cancel").addEventListener("click", closeCrop);
cropApply.addEventListener("click", applyCrop);
document.getElementById("crop-reset").addEventListener("click", () => {
  if (!editor) return;
  editor.rect = { x: 0, y: 0, w: 1, h: 1 };
  drawEditor();
});

cropModal.addEventListener("pointerdown", (event) => {
  if (event.target === cropModal) closeCrop();
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && editor) closeCrop();
});

window.addEventListener("resize", () => {
  if (editor) layoutEditor();
});

cropOpen.addEventListener("click", openCrop);
preview.addEventListener("click", openCrop);
preview.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    openCrop();
  }
});

/* ---------- drag and drop / paste ---------- */

let dragDepth = 0;

function hasFiles(event) {
  const transfer = event.dataTransfer;
  return transfer && Array.from(transfer.types || []).includes("Files");
}

window.addEventListener("dragenter", (event) => {
  if (!hasFiles(event)) return;
  event.preventDefault();
  dragDepth += 1;
  dropEl.hidden = false;
});

window.addEventListener("dragover", (event) => {
  if (!hasFiles(event)) return;
  event.preventDefault();
});

window.addEventListener("dragleave", (event) => {
  if (!hasFiles(event)) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) dropEl.hidden = true;
});

window.addEventListener("drop", (event) => {
  event.preventDefault();
  dragDepth = 0;
  dropEl.hidden = true;
  const [file] = (event.dataTransfer && event.dataTransfer.files) || [];
  acceptFile(file);
});

window.addEventListener("paste", (event) => {
  const items = Array.from((event.clipboardData && event.clipboardData.items) || []);
  const imageItem = items.find((item) => item.type.startsWith("image/"));
  if (!imageItem) return;
  event.preventDefault();
  acceptFile(imageItem.getAsFile());
});

/* ---------- export ---------- */

function slug(value) {
  const clean = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return clean || "image";
}

function renderStampExport(image) {
  const canvas = document.createElement("canvas");
  renderStamp(canvas, image, EXPORT_EDGE);
  return canvas;
}

/*
 * A white proof sheet: the finished stamp above the untouched original photo.
 */
function renderSheet(image) {
  const layout = sheetLayout(image);
  const canvas = document.createElement("canvas");
  canvas.width = layout.width;
  canvas.height = layout.height;

  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const stampCanvas = document.createElement("canvas");
  renderStamp(stampCanvas, image, EXPORT_EDGE);
  ctx.drawImage(stampCanvas, layout.margin, layout.margin, layout.content, layout.stampHeight);

  ctx.drawImage(
    image,
    layout.margin,
    layout.margin + layout.stampHeight + layout.gap,
    layout.content,
    layout.imageHeight,
  );

  return canvas;
}

function exportPng(kind, button) {
  if (!state.image || exporting) return;

  exporting = true;
  button.dataset.busy = "1";
  const label = button.innerHTML;
  button.textContent = "rendering…";

  const restore = () => {
    button.innerHTML = label;
    delete button.dataset.busy;
    exporting = false;
  };

  try {
    const canvas =
      kind === "sheet" ? renderSheet(state.image) : renderStampExport(state.image);
    const filename = `${
      kind === "sheet" ? "stamp-sheet" : "stamp"
    }-${slug(state.name)}.png`;

    canvas.toBlob((blob) => {
      if (!blob) {
        restore();
        setStatus("could not build the png");
        return;
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 4000);

      restore();
      setStatus(kind === "sheet" ? "sheet saved" : "stamp saved");
    }, "image/png");
  } catch {
    restore();
    setStatus("could not build the png");
  }
}

downloadButton.addEventListener("click", () => exportPng("sheet", downloadButton));
downloadAlt.addEventListener("click", () => exportPng("stamp", downloadAlt));

/* ---------- start ---------- */

const sample = makeSampleImage();
state.image = sample;
updateThumb();
paint();
