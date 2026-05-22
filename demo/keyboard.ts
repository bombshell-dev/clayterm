import {
  createChannel,
  each,
  ensure,
  main,
  race,
  resource,
  type Stream,
  until,
} from "effection";
import { createTerm, type PointerEvent } from "../mod.ts";
import { alternateBuffer, settings } from "../settings.ts";
import { close, fixed, grow, open, rgba, text } from "../mod.ts";
import { cursor, mouseTracking, progressiveInput } from "../settings.ts";
import { createKeyboardDemo } from "./keyboard-shared.ts";
import { useInput } from "./use-input.ts";
import { useStdin } from "./use-stdin.ts";

const demo = createKeyboardDemo({
  close,
  fixed,
  grow,
  mouseTracking,
  open,
  progressiveInput,
  rgba,
  settings,
  text,
});

function writeAllSync(output: Uint8Array): void {
  // Deno's stdout writes are not guaranteed to drain the full buffer in one
  // call, so always loop until the entire frame chunk is written.
  let offset = 0;
  while (offset < output.length) {
    let written = Deno.stdout.writeSync(output.subarray(offset));
    if (written <= 0) {
      // should never happen with stdout, but guard against infinite loop if it does
      throw new Error("stdout write returned without making progress");
    }
    offset += written;
  }
}

await main(function* () {
  let { columns, rows } = Deno.stdout.isTerminal()
    ? Deno.consoleSize()
    : { columns: 80, rows: 24 };

  if (Deno.stdin.isTerminal()) {
    Deno.stdin.setRaw(true);
  }

  let stdin = yield* useStdin();
  let input = useInput(stdin);
  let term = yield* until(createTerm({ width: columns, height: rows }));

  let tty = settings(alternateBuffer(), cursor(false));
  writeAllSync(tty.apply);

  let modality = demo.recognizer();
  let context = modality.next().value;

  let flags = demo.ttyFlags(context);
  writeAllSync(flags.apply);

  yield* ensure(() => {
    // Restore so Backspace and normal shell editing work after exit.
    if (Deno.stdin.isTerminal()) {
      Deno.stdin.setRaw(false);
    }
    writeAllSync(flags.revert);
    writeAllSync(tty.revert);
  });

  let { output } = term.render(demo.keyboard(context));

  writeAllSync(output);

  let pointer = {
    events: createChannel<PointerEvent, void>(),
    state: undefined as { x: number; y: number; down: boolean } | undefined,
  };

  for (let event of yield* each(merge(input, pointer.events))) {
    if (event.type === "keydown" && event.ctrl && event.key === "c") {
      break;
    }
    if (event.type === "pointerenter") {
      context.entered.add(event.id);
    }
    if (event.type === "pointerleave") {
      context.entered.delete(event.id);
    }

    let prev = context.logged;
    context = modality.next(event).value;
    if (context.event && context.log[context.event.type as keyof EventFilter]) {
      context = { ...context, logged: context.event };
    } else {
      context = { ...context, logged: prev };
    }

    writeAllSync(flags.revert);
    flags = demo.ttyFlags(context);
    writeAllSync(flags.apply);

    if (context["Capture mouse events"]) {
      if ("x" in event) {
        pointer.state = {
          x: event.x,
          y: event.y,
          down: event.type === "mousedown",
        };
      }
    } else {
      pointer.state = undefined;
    }

    let { output, events } = term.render(demo.keyboard(context), {
      pointer: pointer.state,
    });

    for (let event of events) {
      yield* pointer.events.send(event);
    }

    writeAllSync(output);

    yield* each.next();
  }
});

function merge<A, B, TClose>(
  a: Stream<A, TClose>,
  b: Stream<B, TClose>,
): Stream<A | B, TClose> {
  return resource(function* (provide) {
    let subscription = {
      a: yield* a,
      b: yield* b,
    };

    return yield* provide({
      *next() {
        return yield* race([subscription.a.next(), subscription.b.next()]);
      },
    });
  });
}

type EventFilter = {
  keydown: boolean;
  keyrepeat: boolean;
  keyup: boolean;
  mousedown: boolean;
  mouseup: boolean;
  mousemove: boolean;
  wheel: boolean;
  resize: boolean;
  pointerenter: boolean;
  pointerleave: boolean;
  pointerclick: boolean;
};
