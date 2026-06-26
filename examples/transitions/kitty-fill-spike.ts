/**
 * SPIKE (throwaway): sub-cell precision for FILLED boxes — companion to
 * kitty-border-spike.ts. Hypothesis: with a solid fill there are no corners,
 * only leading/trailing edges, and those map exactly onto the eighth-block
 * coverage ramp — so the glyph row should land much closer to the pixel row
 * than it does for an outline.
 *
 * Requires a Kitty-graphics terminal (kitty, Ghostty). Run:
 *   deno run -A examples/transitions/kitty-fill-spike.ts
 *
 *   ROW 1 — fill snapped to whole cells (the jitter).
 *   ROW 2 — eighth-block sub-cell fill edges (▏▎▍▌▋▊▉, 8 sub-positions/cell;
 *           the trailing edge uses an fg/bg swap for a right-anchored partial).
 *   ROW 3 — a Kitty image (solid fill) at a sub-cell pixel offset.
 * All three slide on the same eased path, on a dark track. q / Ctrl+C to quit.
 */

import { encodeBase64 } from "@std/encoding/base64";

const enc = new TextEncoder();
const dec = new TextDecoder();
const write = (s: string) => Deno.stdout.writeSync(enc.encode(s));
const cup = (row: number, col: number) => `\x1b[${row};${col}H`; // 1-based
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const sgrFg = (c: number[]) => `\x1b[38;2;${c[0]};${c[1]};${c[2]}m`;
const sgrBg = (c: number[]) => `\x1b[48;2;${c[0]};${c[1]};${c[2]}m`;
const RESET = "\x1b[0m";
const blockLeft = (n: number) => String.fromCodePoint(0x2590 - n); // n=1..8 → ▏..█

const IMG_ID = 1;
const PLACEMENT = 1;

const PAD = 3;
const BOX_W = 16;
const BOX_H = 4;
const COL0 = PAD * 2;
const BASE_COL = COL0;
const HEADER_ROW = PAD + 1;
const SNAP_ROW = HEADER_ROW + 3; // row 1: whole-cell fill
const OCTET_ROW = SNAP_ROW + BOX_H + 2; // row 2: eighth-block sub-cell fill
const KITTY_ROW = OCTET_ROW + BOX_H + 2; // row 3: kitty pixel fill
const RANGE_MAX = 14;
const PERIOD = 2.4;
const FILL_RADIUS_PX = 3; // gentle rounded corners on the raster fill

const BOX: [number, number, number] = [120, 220, 255];
const BAND: [number, number, number] = [44, 54, 67];

// runtime state, populated by the stdin reader
let quit = false;
let sized = false;
let cw = 10;
let ch = 20;
let acc = "";

function parseGeometry() {
  // deno-lint-ignore no-control-regex
  let m16 = acc.match(/\x1b\[6;(\d+);(\d+)t/); // CSI 16t → cell px directly
  if (m16 && +m16[1] > 0 && +m16[2] > 0) {
    ch = +m16[1];
    cw = +m16[2];
    sized = true;
    return;
  }
  // deno-lint-ignore no-control-regex
  let m14 = acc.match(/\x1b\[4;(\d+);(\d+)t/);
  // deno-lint-ignore no-control-regex
  let m18 = acc.match(/\x1b\[8;(\d+);(\d+)t/);
  if (m14 && m18) {
    let hpx = +m14[1], wpx = +m14[2], rows = +m18[1], cols = +m18[2];
    if (rows > 0 && cols > 0) {
      cw = Math.round(wpx / cols);
      ch = Math.round(hpx / rows);
      sized = true;
    }
  }
}

async function reader() {
  let buf = new Uint8Array(256);
  while (!quit) {
    let n: number | null;
    try {
      n = await Deno.stdin.read(buf);
    } catch {
      break;
    }
    if (n === null) break;
    let s = dec.decode(buf.subarray(0, n));
    if (!sized) {
      acc += s;
      parseGeometry();
    }
    if (s.includes("q") || s.includes("\x03")) quit = true;
  }
}

// solid (gently rounded) fill spanning the whole image, anti-aliased edge
function rasterFill(
  wpx: number,
  hpx: number,
  radius: number,
  rgb: [number, number, number],
): Uint8Array {
  let buf = new Uint8Array(wpx * hpx * 4);
  let [r, g, b] = rgb;
  let cx = wpx / 2, cy = hpx / 2;
  let rad = Math.min(radius, cx, cy);
  for (let y = 0; y < hpx; y++) {
    for (let x = 0; x < wpx; x++) {
      let qx = Math.abs(x + 0.5 - cx) - cx + rad;
      let qy = Math.abs(y + 0.5 - cy) - cy + rad;
      let d = Math.min(Math.max(qx, qy), 0) +
        Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - rad;
      let cov = Math.min(1, Math.max(0, 0.5 - d)); // inside: d < 0
      if (cov <= 0) continue;
      let i = (y * wpx + x) * 4;
      buf[i] = r;
      buf[i + 1] = g;
      buf[i + 2] = b;
      buf[i + 3] = cov >= 1 ? 255 : Math.round(cov * 255);
    }
  }
  return buf;
}

function transmitImage(id: number, wpx: number, hpx: number, rgba: Uint8Array) {
  let b64 = encodeBase64(rgba);
  let CHUNK = 4096;
  let first = true;
  for (let i = 0; i < b64.length; i += CHUNK) {
    let piece = b64.slice(i, i + CHUNK);
    let last = i + CHUNK >= b64.length;
    let ctrl = first
      ? `a=t,f=32,t=d,i=${id},s=${wpx},v=${hpx},q=2,m=${last ? 0 : 1}`
      : `m=${last ? 0 : 1}`;
    write(`\x1b_G${ctrl};${piece}\x1b\\`);
    first = false;
  }
}

function placeImage(row: number, col: number, x: number) {
  write(cup(row, col));
  write(
    `\x1b_Ga=p,i=${IMG_ID},p=${PLACEMENT},c=${BOX_W},r=${BOX_H},` +
      `X=${x},Y=0,z=0,C=1,q=2;\x1b\\`,
  );
}

function deletePlacement() {
  write(`\x1b_Ga=d,d=i,i=${IMG_ID},p=${PLACEMENT},q=2;\x1b\\`);
}

function paintBand(rowTop: number, h: number, bandW: number) {
  for (let r = 0; r < h; r++) {
    write(cup(rowTop + r, COL0) + sgrBg(BAND) + " ".repeat(bandW) + RESET);
  }
}

// row 1: fill rounded to whole cells (leading edge jumps cell to cell)
function drawSnapFill(rowTop: number, left: number, w: number, h: number) {
  let col = Math.round(left);
  for (let r = 0; r < h; r++) {
    write(cup(rowTop + r, col) + sgrBg(BOX) + " ".repeat(w) + RESET);
  }
}

// row 2: eighth-block sub-cell fill. Coverage is computed in eighths so both
// edges land on one of 8 sub-positions. A cell filled from its left edge is a
// left-block in BOX over BAND; filled from its right edge is the complement —
// a left-block of the *empty* part in BAND over BOX (the fg/bg swap).
function drawOctetFill(rowTop: number, left: number, w: number, h: number) {
  let le = Math.round(left * 8);
  let re = Math.round((left + w) * 8);
  let cFirst = Math.floor(le / 8);
  let cLast = Math.ceil(re / 8) - 1;
  for (let r = 0; r < h; r++) {
    let out = "";
    for (let c = cFirst; c <= cLast; c++) {
      let lo = Math.max(le, c * 8);
      let hi = Math.min(re, c * 8 + 8);
      let cov = hi - lo;
      if (cov <= 0) continue;
      out += cup(rowTop + r, c);
      if (cov >= 8) {
        out += sgrBg(BOX) + " " + RESET; // full cell
      } else if (lo === c * 8) {
        out += sgrFg(BOX) + sgrBg(BAND) + blockLeft(cov) + RESET; // left-fill
      } else {
        out += sgrFg(BAND) + sgrBg(BOX) + blockLeft(8 - cov) + RESET; // right-fill (swap)
      }
    }
    write(out);
  }
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

async function main() {
  if (!Deno.stdin.isTerminal()) {
    console.error("kitty-fill-spike needs a TTY (kitty or Ghostty).");
    Deno.exit(1);
  }

  write("\x1b[?1049h\x1b[?25l"); // alt screen + hide cursor
  Deno.stdin.setRaw(true);
  reader();

  for (let attempt = 0; attempt < 3 && !sized; attempt++) {
    write("\x1b[16t\x1b[14t\x1b[18t");
    let deadline = performance.now() + 200;
    while (!sized && performance.now() < deadline) await sleep(20);
  }

  let { columns } = Deno.consoleSize();
  let range = Math.max(
    2,
    Math.min(RANGE_MAX, columns - PAD - BASE_COL - BOX_W),
  );
  let bandW = range + BOX_W + 1;

  let bwpx = BOX_W * cw;
  let bhpx = BOX_H * ch;
  transmitImage(
    IMG_ID,
    bwpx,
    bhpx,
    rasterFill(bwpx, bhpx, FILL_RADIUS_PX, BOX),
  );

  let start = performance.now();
  let lastFrame = start;
  let fps = 0;

  try {
    while (!quit) {
      let now = performance.now();
      let dt = now - lastFrame;
      lastFrame = now;
      if (dt > 0) fps = fps * 0.9 + (1000 / dt) * 0.1;

      let phase = ((now - start) / 1000 / PERIOD) % 2;
      let tri = phase < 1 ? phase : 2 - phase;
      let x = easeInOut(tri) * range;

      write("\x1b[?2026h"); // BSU — atomic frame

      write(
        cup(HEADER_ROW, COL0) +
          "\x1b[2K\x1b[1mFilled sub-cell comparison\x1b[0m  " +
          (sized ? `cell ${cw}x${ch}px` : "cell UNKNOWN (fallback)") +
          `  ~${fps.toFixed(0)} fps   q to quit`,
      );
      write(
        cup(SNAP_ROW - 1, COL0) +
          "\x1b[2K\x1b[2mwhole-cell — fill snaps\x1b[0m",
      );
      write(
        cup(OCTET_ROW - 1, COL0) +
          "\x1b[2K\x1b[2meighth-blocks — sub-cell fill edges\x1b[0m",
      );
      write(
        cup(KITTY_ROW - 1, COL0) +
          "\x1b[2K\x1b[2mraster — sub-cell pixel fill\x1b[0m",
      );

      paintBand(SNAP_ROW, BOX_H, bandW);
      drawSnapFill(SNAP_ROW, BASE_COL + x, BOX_W, BOX_H);

      paintBand(OCTET_ROW, BOX_H, bandW);
      drawOctetFill(OCTET_ROW, BASE_COL + x, BOX_W, BOX_H);

      paintBand(KITTY_ROW, BOX_H, bandW);
      let totalPx = x * cw;
      deletePlacement();
      placeImage(
        KITTY_ROW,
        BASE_COL + Math.floor(totalPx / cw),
        Math.floor(totalPx % cw),
      );

      write("\x1b[?2026l"); // ESU
      await sleep(16);
    }
  } finally {
    deletePlacement();
    write(`\x1b_Ga=d,d=I,i=${IMG_ID},q=2;\x1b\\`);
    Deno.stdin.setRaw(false);
    write("\x1b[?25h\x1b[?1049l");
  }
  Deno.exit(0);
}

await main();
