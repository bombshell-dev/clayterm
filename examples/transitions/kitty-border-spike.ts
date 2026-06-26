/**
 * SPIKE (throwaway): pixel-precise borders via the Kitty graphics protocol.
 *
 * No fallbacks, no capability handshake, no clayterm/wasm. The point is to see
 * whether the Kitty path eliminates the border jitter that box-drawing glyphs
 * can't — corners and edges move together at pixel precision because the whole
 * outline is one rasterized image, placed at a sub-cell pixel offset.
 *
 * Requires a Kitty-graphics terminal (kitty, Ghostty; WezTerm partial).
 *   deno run -A examples/transitions/kitty-border-spike.ts
 *
 *   ROW 1 — rounded box-drawing glyphs (╭╮╰╯) snapped to whole cells (jitter).
 *   ROW 2 — braille (U+2800): the rounded-rect contour rasterized into a 2×4
 *           dot grid per cell. Corners and edges move together in half-cell
 *           steps (no snap-vs-slide mismatch), but dotted and coarser than px.
 *   ROW 3 — a Kitty image (anti-aliased rounded-rect outline) at a sub-cell
 *           pixel offset: smooth motion, corners and edges aligned.
 * All slide on the same eased path. Press q or Ctrl+C to quit.
 */

import { encodeBase64 } from "@std/encoding/base64";

const enc = new TextEncoder();
const dec = new TextDecoder();
const write = (s: string) => Deno.stdout.writeSync(enc.encode(s));
const cup = (row: number, col: number) => `\x1b[${row};${col}H`; // 1-based
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const IMG_ID = 1;
const PLACEMENT = 1;

// layout + animation geometry. Text is cell-positioned, so PAD is in cells.
const PAD = 3; // padding around the whole demo
const BOX_W = 16;
const BOX_H = 6;
const COL0 = PAD * 2; // first content column (1-based)
const BASE_COL = COL0; // box left column at rest
const HEADER_ROW = PAD + 1; // first content row
const GLYPH_ROW = HEADER_ROW + 3; // row 1: snapped box-drawing
const BRAILLE_ROW = GLYPH_ROW + BOX_H + 2; // row 2: braille 2×4 dot raster
const KITTY_ROW = BRAILLE_ROW + BOX_H + 2; // row 3: kitty pixel image
const RANGE_MAX = 14; // desired travel; clamped to keep the right pad
const PERIOD = 2.4; // seconds per one-way sweep
// stroke thickness of the rasterized border, in px.
const BORDER_PX = 3;
// corner radius for the rasterized box, in px — kept tiny to match the glyphs'
// light-arc corners (╭╮╰╯ round only a hair), not a full-cell round.
// dial to taste: ~0.5 ≈ nearly sharp, 2 ≈ a gentle round.
const CORNER_RADIUS_PX = 4;

// runtime state, populated by the stdin reader
let quit = false;
let sized = false;
let cw = 10; // cell width px (fallback)
let ch = 20; // cell height px (fallback)
let acc = ""; // accumulates query replies (may arrive split across reads)

function parseGeometry() {
  // CSI 16 t -> CSI 6 ; cellH ; cellW t  (cell size in px, most direct)
  // deno-lint-ignore no-control-regex
  let m16 = acc.match(/\x1b\[6;(\d+);(\d+)t/);
  if (m16 && +m16[1] > 0 && +m16[2] > 0) {
    ch = +m16[1];
    cw = +m16[2];
    sized = true;
    return;
  }
  // else derive from text-area px (CSI 4;h;w t) / cells (CSI 8;rows;cols t)
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

// Rasterize an anti-aliased rounded-rectangle outline into an RGBA buffer
// (transparent inside). The stroke is centered on the signed-distance contour
// of a rounded rect, so corners are true arcs at whatever sub-pixel position
// the box lands on — the thing glyph corners (one fixed ╭╮╰╯ per cell) can't do.
//
// insetX/insetY pull the centerline in from the image edges so the stroke sits
// at the *centers* of the edge cells, matching box-drawing glyphs (│─ run
// through the middle of their cell) rather than hugging the cell boundary.
function rasterBorder(
  wpx: number,
  hpx: number,
  insetX: number,
  insetY: number,
  stroke: number,
  radius: number,
  rgb: [number, number, number],
): Uint8Array {
  let buf = new Uint8Array(wpx * hpx * 4);
  let [r, g, b] = rgb;
  let cx = wpx / 2, cy = hpx / 2;
  let bx = wpx / 2 - insetX, by = hpx / 2 - insetY; // centerline half-extents
  let rad = Math.max(0, Math.min(radius, bx, by));
  let half = stroke / 2;
  for (let y = 0; y < hpx; y++) {
    for (let x = 0; x < wpx; x++) {
      // signed distance to the rounded-rect contour (the stroke centerline)
      let px = Math.abs(x + 0.5 - cx) - bx + rad;
      let py = Math.abs(y + 0.5 - cy) - by + rad;
      let d = Math.min(Math.max(px, py), 0) +
        Math.hypot(Math.max(px, 0), Math.max(py, 0)) - rad;
      // ~1px anti-aliased coverage of a stroke straddling the contour
      let cov = half - Math.abs(d) + 0.5;
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
    // only the first chunk carries the full control keys
    let ctrl = first
      ? `a=t,f=32,t=d,i=${id},s=${wpx},v=${hpx},q=2,m=${last ? 0 : 1}`
      : `m=${last ? 0 : 1}`;
    write(`\x1b_G${ctrl};${piece}\x1b\\`);
    first = false;
  }
}

function placeImage(row: number, col: number, x: number, y: number) {
  write(cup(row, col));
  // c/r: scale to exactly BOX_W x BOX_H cells, so size is right even if the
  //      px geometry query failed (it'd just be a touch blurry, not tiny).
  // C=1: don't move the cursor; X/Y: sub-cell pixel offset within the cell.
  write(
    `\x1b_Ga=p,i=${IMG_ID},p=${PLACEMENT},c=${BOX_W},r=${BOX_H},` +
      `X=${x},Y=${y},z=0,C=1,q=2;\x1b\\`,
  );
}

function deletePlacement() {
  // lowercase d=i keeps the image data for reuse, just drops the placement
  write(`\x1b_Ga=d,d=i,i=${IMG_ID},p=${PLACEMENT},q=2;\x1b\\`);
}

function drawGlyphBox(row: number, col: number, w: number, h: number) {
  // clear the band this box lives in, then draw at the snapped column
  for (let r = 0; r < h; r++) {
    write(cup(row + r, 1) + "\x1b[2K");
  }
  write(cup(row, col) + "╭" + "─".repeat(w - 2) + "╮");
  for (let r = 1; r < h - 1; r++) {
    write(cup(row + r, col) + "│" + " ".repeat(w - 2) + "│");
  }
  write(cup(row + h - 1, col) + "╰" + "─".repeat(w - 2) + "╯");
}

// Braille dot grid: 2 cols × 4 rows per cell; codepoint = 0x2800 | bitmask.
// BRAILLE[row][col] is the bit for that sub-pixel.
const BRAILLE = [
  [0x01, 0x08], // row 0: [left, right]
  [0x02, 0x10], // row 1
  [0x04, 0x20], // row 2
  [0x40, 0x80], // row 3
];
const BRAILLE_STROKE = 0.75; // lit if within this many sub-px of the contour
const BRAILLE_RADIUS = 1.5; // corner radius in sub-px (braille is coarse)

// Best pure-Unicode that keeps corners *consistent* with the edges: rasterize
// the rounded-rect contour into a 2×4 dot grid per cell (drawille-style) and
// emit braille. Corners and edges move together in half-cell (1 sub-px) steps —
// no snap-vs-slide mismatch — at the cost of a dotted texture and coarser
// horizontal steps (2 vs the eighth-bars' 8). Snaps to box-drawing at rest.
function drawBrailleBox(
  rowTop: number,
  left: number,
  w: number,
  h: number,
  moving: boolean,
) {
  if (!moving) {
    drawGlyphBox(rowTop, Math.round(left), w, h);
    return;
  }
  for (let r = 0; r < h; r++) write(cup(rowTop + r, 1) + "\x1b[2K");

  let cellStart = Math.floor(left);
  let cols = w + 1; // cover horizontal overhang from the fractional offset
  let gw = cols * 2, gh = h * 4; // sub-pixel grid
  // rounded-rect centerline in sub-px, inset half a cell (1 sub-px x, 2 sub-px y)
  let cl = (left + 0.5 - cellStart) * 2;
  let cr = (left + w - 0.5 - cellStart) * 2;
  let cx = (cl + cr) / 2, cy = (2 + (gh - 2)) / 2;
  let bx = (cr - cl) / 2, by = (gh - 2 - 2) / 2;
  let rad = Math.min(BRAILLE_RADIUS, bx, by);

  let dots = new Uint8Array(gw * gh);
  for (let sy = 0; sy < gh; sy++) {
    for (let sx = 0; sx < gw; sx++) {
      let qx = Math.abs(sx + 0.5 - cx) - bx + rad;
      let qy = Math.abs(sy + 0.5 - cy) - by + rad;
      let d = Math.min(Math.max(qx, qy), 0) +
        Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - rad;
      if (Math.abs(d) < BRAILLE_STROKE) dots[sy * gw + sx] = 1;
    }
  }

  for (let c = 0; c < cols; c++) {
    for (let cy2 = 0; cy2 < h; cy2++) {
      let bits = 0;
      for (let dy = 0; dy < 4; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          if (dots[(cy2 * 4 + dy) * gw + (c * 2 + dx)]) bits |= BRAILLE[dy][dx];
        }
      }
      if (bits) {
        write(
          cup(rowTop + cy2, cellStart + c) +
            String.fromCodePoint(0x2800 | bits),
        );
      }
    }
  }
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// printable rendering of whatever the terminal replied to the geometry query,
// so an UNKNOWN result shows what (if anything) came back instead of a guess.
function escapeReply(s: string): string {
  if (s.length === 0) return "(no reply)";
  return JSON.stringify(s.slice(0, 60)).replace(/\\u001b/g, "ESC");
}

async function main() {
  if (!Deno.stdin.isTerminal()) {
    console.error("kitty-border-spike needs a TTY (kitty or Ghostty).");
    Deno.exit(1);
  }

  write("\x1b[?1049h\x1b[?25l"); // alt screen + hide cursor
  Deno.stdin.setRaw(true);
  reader(); // fire-and-forget: collects cell size, watches for quit

  // ask the terminal for its pixel/cell geometry (16t = cell px directly;
  // 14t/18t = text-area px / cells, as a fallback derivation). Re-query a few
  // times in case the first reply is dropped/slow.
  for (let attempt = 0; attempt < 3 && !sized; attempt++) {
    write("\x1b[16t\x1b[14t\x1b[18t");
    let deadline = performance.now() + 200;
    while (!sized && performance.now() < deadline) {
      await sleep(20);
    }
  }

  // keep the slide within the right padding
  let { columns } = Deno.consoleSize();
  let range = Math.max(
    2,
    Math.min(RANGE_MAX, columns - PAD - BASE_COL - BOX_W),
  );

  let bwpx = BOX_W * cw;
  let bhpx = BOX_H * ch;
  // inset by half a cell so the stroke aligns with glyph line centers
  transmitImage(
    IMG_ID,
    bwpx,
    bhpx,
    rasterBorder(
      bwpx,
      bhpx,
      Math.floor(cw / 2),
      Math.floor(ch / 2),
      BORDER_PX,
      CORNER_RADIUS_PX,
      [120, 220, 255],
    ),
  );

  let start = performance.now();
  let lastFrame = start;
  let fps = 0;
  let prevX = 0; // previous frame's position, for the octet row's motion gate

  try {
    while (!quit) {
      let now = performance.now();
      let dt = now - lastFrame;
      lastFrame = now;
      if (dt > 0) fps = fps * 0.9 + (1000 / dt) * 0.1;

      // ping-pong eased position in [0, range] cells
      let phase = ((now - start) / 1000 / PERIOD) % 2;
      let tri = phase < 1 ? phase : 2 - phase;
      let x = easeInOut(tri) * range;
      let moving = Math.abs(x - prevX) > 0.03; // ~still at the eased turnarounds
      prevX = x;

      write("\x1b[?2026h"); // BSU — atomic frame (matters here: image + text)

      // header / labels
      write(
        cup(HEADER_ROW, COL0) +
          "\x1b[2K\x1b[1mTransitions w/ raster sub-cell precision\x1b[0m  " +
          (sized
            ? `cell ${cw}x${ch}px`
            : `cell UNKNOWN reply=${escapeReply(acc)}`) +
          `  ~${fps.toFixed(0)} fps   q to quit`,
      );
      write(
        cup(GLYPH_ROW - 1, COL0) +
          "\x1b[2K\x1b[2mglyphs — snapped to cells\x1b[0m",
      );
      write(
        cup(BRAILLE_ROW - 1, COL0) +
          "\x1b[2K\x1b[2mbraille — 2×4 dot raster (corners track edges)\x1b[0m",
      );
      write(
        cup(KITTY_ROW - 1, COL0) +
          "\x1b[2K\x1b[2mraster — sub-cell pixel offset\x1b[0m",
      );

      // ROW 1: glyph box, snapped to the nearest whole cell (the jitter)
      drawGlyphBox(GLYPH_ROW, BASE_COL + Math.round(x), BOX_W, BOX_H);

      // ROW 2: braille 2×4 dot raster — corners and edges move together
      drawBrailleBox(BRAILLE_ROW, BASE_COL + x, BOX_W, BOX_H, moving);

      // ROW 3: kitty image at sub-cell pixel offset (smooth)
      let totalPx = x * cw;
      let col = BASE_COL + Math.floor(totalPx / cw);
      let xoff = Math.floor(totalPx % cw);
      deletePlacement();
      placeImage(KITTY_ROW, col, xoff, 0);

      write("\x1b[?2026l"); // ESU
      await sleep(16);
    }
  } finally {
    deletePlacement();
    write(`\x1b_Ga=d,d=I,i=${IMG_ID},q=2;\x1b\\`); // free image data
    Deno.stdin.setRaw(false);
    write("\x1b[?25h\x1b[?1049l"); // show cursor + leave alt screen
  }
  Deno.exit(0);
}

await main();
