/// <reference types="npm:@types/node" />

import { Buffer } from "node:buffer";
import {
  alternateBuffer,
  close,
  createInput,
  createTerm,
  cursor,
  fixed,
  grow,
  mouseTracking,
  open,
  progressiveInput,
  rgba,
  settings,
  text,
} from "../build/npm/esm/mod.js";
import type { InputEvent, PointerEvent } from "../mod.ts";
import { createKeyboardDemo } from "./keyboard-shared.ts";

type PointerState = {
  x: number;
  y: number;
  down: boolean;
};

type NodeInput = Awaited<ReturnType<typeof createInput>>;
type NodeScanResult = {
  events: InputEvent[];
  pending?: { delay: number };
};

let demo = createKeyboardDemo(
  {
    close,
    fixed,
    grow,
    mouseTracking,
    open,
    progressiveInput,
    rgba,
    settings,
    text,
  } as Parameters<typeof createKeyboardDemo>[0],
);

let term: Awaited<ReturnType<typeof createTerm>> | null = null;
let input: NodeInput | null = null;
let size = getSize();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let tty = settings(alternateBuffer(), cursor(false));
let modality = demo.recognizer();
let context = modality.next().value;
let flags = demo.ttyFlags(context);

let pointer: { state: PointerState | undefined } = {
  state: undefined,
};

function getSize() {
  return {
    width: process.stdout.columns || 80,
    height: process.stdout.rows || 24,
  };
}

function write(bytes: Uint8Array): void {
  process.stdout.write(Buffer.from(bytes));
}

function scan(chunk?: Uint8Array): NodeScanResult {
  let normalized = chunk ? new Uint8Array(chunk) : undefined;
  return input!.scan(normalized) as NodeScanResult;
}

function resetFlushTimer(delay: number): void {
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
  }
  flushTimer = setTimeout(() => {
    flushTimer = null;
    let result = scan();
    for (let event of result.events) {
      handleEvent(event);
    }
  }, delay);
}

function applyFlags(): void {
  write(flags.revert);
  flags = demo.ttyFlags(context);
  write(flags.apply);
}

function render(): PointerEvent[] {
  if (!term) {
    return [];
  }
  let result = term.render(demo.keyboard(context), {
    pointer: pointer.state,
  });
  write(result.output);
  return result.events as PointerEvent[];
}

function dispatchLogged(event: InputEvent | PointerEvent): void {
  let previous = context.logged;
  context = modality.next(event).value;
  if (
    context.event &&
    context.event.type in context.log &&
    context.log[context.event.type as keyof typeof context.log]
  ) {
    context = { ...context, logged: context.event };
  } else {
    context = { ...context, logged: previous };
  }
}

function updatePointer(event: InputEvent | PointerEvent): void {
  if (!context["Capture mouse events"]) {
    pointer.state = undefined;
    return;
  }
  if (!("x" in event)) {
    return;
  }
  pointer.state = {
    x: event.x,
    y: event.y,
    down: event.type === "mousedown",
  };
}

function handleEvent(event: InputEvent | PointerEvent): void {
  if (event.type === "keydown" && event.ctrl && event.key === "c") {
    cleanup();
    process.exit(0);
  }

  if (event.type === "pointerenter") {
    context.entered.add(event.id);
  }
  if (event.type === "pointerleave") {
    context.entered.delete(event.id);
  }

  dispatchLogged(event);
  applyFlags();
  updatePointer(event);

  let queue = render();
  while (queue.length > 0) {
    let next = queue.shift();
    if (!next) {
      continue;
    }
    if (next.type === "pointerenter") {
      context.entered.add(next.id);
    }
    if (next.type === "pointerleave") {
      context.entered.delete(next.id);
    }
    dispatchLogged(next);
    applyFlags();
    let emitted = render();
    queue.push(...emitted);
  }
}

async function resetTerm(): Promise<void> {
  size = getSize();
  term = await createTerm(size);
}

function cleanup(): void {
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  try {
    write(flags.revert);
    write(tty.revert);
  } catch {
    // ignore cleanup write failures during shutdown
  }
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false);
  }
  process.stdin.pause();
}

try {
  input = await createInput();
  await resetTerm();

  write(tty.apply);
  write(flags.apply);
  render();

  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  process.stdin.resume();
  process.stdin.on("data", (chunk: Uint8Array) => {
    let result = scan(new Uint8Array(chunk));
    for (let event of result.events) {
      handleEvent(event);
    }
    if (result.pending) {
      resetFlushTimer(result.pending.delay);
    }
  });

  if (process.stdout.isTTY) {
    process.stdout.on("resize", async () => {
      try {
        await resetTerm();
        render();
      } catch (error) {
        cleanup();
        console.error(error);
        process.exit(1);
      }
    });
  }

  process.on("SIGINT", () => {
    cleanup();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    cleanup();
    process.exit(0);
  });
  process.on("exit", cleanup);
} catch (error) {
  cleanup();
  console.error(error);
  process.exit(1);
}
