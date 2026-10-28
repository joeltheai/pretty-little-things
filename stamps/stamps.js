const EXPORT_EDGE = 1800;
const PREVIEW_EDGE = 1500;

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
const paperWrap = document.getElementById("papers");

let grainPattern = null;
let frame = 0;
let statusTimer = 0;

/* ---------- image helpers ---------- */

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

function mulberry32(seed) {
  return function random() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function drawCover(ctx, image, dx, dy, dw, dh) {
  const scale = Math.max(dw / image.width, dh / image.height);
  const sw = dw / scale;
  const sh = dh / scale;
  const sx = (image.width - sw) / 2;
  const sy = (image.height - sh) / 2;
  ctx.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh);
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

function stampDims(image, longEdge) {
  const aspect = Math.min(1.5, Math.max(0.66, image.width / image.height));
  return aspect >= 1
    ? { width: longEdge, height: longEdge / aspect }
    : { width: longEdge * aspect, height: longEdge };
}

/* ---------- stamp geometry ---------- */

function stampMetrics(width, height) {
  const long = Math.max(width, height);
  const short = Math.min(width, height);
  const spacing = long / state.notches;
  const radius = spacing * (state.hole / 100);
  const across = Math.max(2, Math.round(width / spacing));
  const down = Math.max(2, Math.round(height / spacing));
  return {
    radius,
    across,
    down,
    stepX: width / across,
    stepY: height / down,
    short,
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

function renderStamp(canvas, image, width, height) {
  const w = Math.max(2, Math.round(width));
  const h = Math.max(2, Math.round(height));
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, w, h);

  const metrics = stampMetrics(w, h);
  const { radius, short } = metrics;
  const dark = isDarkPaper(state.paper);

  let inset = (state.margin / 100) * short;
  if (inset > 0) inset = Math.max(inset, radius + short * 0.006);
  else inset = 0;

  ctx.save();
  stampPath(ctx, w, h, metrics);
  ctx.clip();

  ctx.fillStyle = state.paper;
  ctx.fillRect(0, 0, w, h);

  if (inset > 0) {
    drawCover(ctx, image, inset, inset, w - inset * 2, h - inset * 2);
    const lineWidth = Math.max(1, short * 0.0014);
    ctx.strokeStyle = dark ? "rgba(255, 255, 255, 0.16)" : "rgba(0, 0, 0, 0.1)";
    ctx.lineWidth = lineWidth;
    ctx.strokeRect(
      inset + lineWidth / 2,
      inset + lineWidth / 2,
      w - inset * 2 - lineWidth,
      h - inset * 2 - lineWidth,
    );
  } else {
    drawCover(ctx, image, 0, 0, w, h);
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

function paint() {
  if (!state.image) return;

  const previewDims = stampDims(state.image, PREVIEW_EDGE);
  renderStamp(preview, state.image, previewDims.width, previewDims.height);

  const exportDims = stampDims(state.image, EXPORT_EDGE);
  metaEl.textContent = `${Math.round(exportDims.width)} × ${Math.round(
    exportDims.height,
  )} px · ${paperName(state.paper)} paper`;
}

function scheduleDraw() {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    paint();
  });
}

function setThumb(image) {
  const ctx = thumb.getContext("2d");
  ctx.clearRect(0, 0, thumb.width, thumb.height);
  drawCover(ctx, image, 0, 0, thumb.width, thumb.height);
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

    state.image = image;
    state.name = (file.name || "image").replace(/\.[^.]+$/, "") || "image";
    sourceName.textContent = state.name;
    setThumb(image);
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

  scheduleDraw();
});

sourceButton.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", () => {
  const [file] = fileInput.files || [];
  acceptFile(file);
  fileInput.value = "";
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

function download() {
  if (!state.image || downloadButton.dataset.busy === "1") return;

  downloadButton.dataset.busy = "1";
  const label = downloadButton.innerHTML;
  downloadButton.textContent = "rendering…";

  const restore = () => {
    downloadButton.innerHTML = label;
    delete downloadButton.dataset.busy;
  };

  try {
    const canvas = document.createElement("canvas");
    const dims = stampDims(state.image, EXPORT_EDGE);
    renderStamp(canvas, state.image, dims.width, dims.height);

    canvas.toBlob((blob) => {
      if (!blob) {
        restore();
        setStatus("could not build the png");
        return;
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `stamp-${slug(state.name)}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 4000);

      restore();
      setStatus("stamp saved");
    }, "image/png");
  } catch {
    restore();
    setStatus("could not build the png");
  }
}

downloadButton.addEventListener("click", download);

/* ---------- start ---------- */

const sample = makeSampleImage();
state.image = sample;
setThumb(sample);
paint();
