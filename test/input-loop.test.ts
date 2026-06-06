import { describe, expect, it } from "./suite.ts";
import { createInput, type InputEvent, type InputOptions } from "../input.ts";

function str(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function concat(...parts: Uint8Array[]): Uint8Array {
  let len = parts.reduce((n, p) => n + p.length, 0);
  let out = new Uint8Array(len);
  let off = 0;
  for (let p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function sig(e: InputEvent): string {
  switch (e.type) {
    case "keydown":
    case "keyrepeat":
    case "keyup": {
      let m = `${e.alt ? "a" : ""}${e.ctrl ? "c" : ""}${e.shift ? "s" : ""}`;
      return `${e.type}:${e.key}${m ? `:${m}` : ""}`;
    }
    case "mousedown":
    case "mouseup":
    case "mousemove":
      return `${e.type}:${e.button}:${e.x},${e.y}`;
    case "wheel":
      return `${e.type}:${e.direction}:${e.x},${e.y}`;
    case "cursor":
      return `cursor:${e.row},${e.column}`;
    case "resize":
      return `resize:${e.width}x${e.height}`;
    default:
      return e.type;
  }
}

async function drive(
  chunks: Uint8Array[],
  opts: InputOptions = { escLatency: 25 },
): Promise<string[]> {
  let input = await createInput(opts);
  let all: InputEvent[] = [];
  for (let i = 0; i < chunks.length; i++) {
    let { events, pending } = input.scan(chunks[i]);
    all.push(...events);
    if (pending && i === chunks.length - 1) {
      await sleep(pending.delay + 10);
      all.push(...input.scan().events);
    }
  }
  return all.map(sig);
}

function perByte(buf: Uint8Array): Uint8Array[] {
  let out: Uint8Array[] = [];
  for (let i = 0; i < buf.length; i++) out.push(buf.subarray(i, i + 1));
  return out;
}

function splitAt(buf: Uint8Array, offsets: number[]): Uint8Array[] {
  let out: Uint8Array[] = [];
  let prev = 0;
  for (let o of [...offsets, buf.length]) {
    out.push(buf.subarray(prev, o));
    prev = o;
  }
  return out;
}

describe("input event loop", () => {
  let stream = concat(
    str("hi"),
    new Uint8Array([0x1b, 0x5b, 0x41]), // ArrowUp
    str("\x1b[<0;35;12M"), // SGR mouse press
    new Uint8Array([0xe4, 0xb8, 0xad]), // 中
    str("\x1b[97;3u"), // Kitty a+Alt
    new Uint8Array([0xf0, 0x9f, 0x8e, 0x89]), // 🎉
  );

  let expected = [
    "keydown:h",
    "keydown:i",
    "keydown:ArrowUp",
    "mousedown:left:34,11",
    "keydown:中",
    "keydown:a:a",
    "keydown:🎉",
  ];

  it("produces the expected sequence when fed whole", async () => {
    expect(await drive([stream])).toEqual(expected);
  });

  it("is invariant to chunk boundaries (byte-by-byte)", async () => {
    expect(await drive(perByte(stream))).toEqual(expected);
  });

  it("is invariant to chunk boundaries (mid-sequence splits)", async () => {
    expect(await drive(splitAt(stream, [3, 5, 9, 16, 21]))).toEqual(expected);
  });

  describe("pending ESC flush", () => {
    it("flushes a lone trailing ESC as Escape after the latency", async () => {
      expect(await drive([str("hi"), new Uint8Array([0x1b])])).toEqual([
        "keydown:h",
        "keydown:i",
        "keydown:Escape",
      ]);
    });

    it("resolves ESC as a sequence when the rest arrives next chunk", async () => {
      expect(
        await drive([new Uint8Array([0x1b]), new Uint8Array([0x5b, 0x41])]),
      ).toEqual(["keydown:ArrowUp"]);
    });
  });

  it("handles a large mixed burst across many small chunks", async () => {
    let unit = concat(
      new Uint8Array([0x1b, 0x5b, 0x41]), // ArrowUp
      str("ab"),
      str("\x1b[<0;1;1M"), // mouse at 0,0
      new Uint8Array([0xe4, 0xb8, 0xad]), // 中
    );
    let n = 50;
    let big = concat(...new Array(n).fill(unit));
    let chunks: Uint8Array[] = [];
    for (let i = 0; i < big.length; i += 7) chunks.push(big.subarray(i, i + 7));

    let sigs = await drive(chunks);
    expect(sigs.length).toBe(n * 5);
    expect(sigs.slice(0, 5)).toEqual([
      "keydown:ArrowUp",
      "keydown:a",
      "keydown:b",
      "mousedown:left:0,0",
      "keydown:中",
    ]);
  });
});
