// deno-lint-ignore-file no-fallthrough
import type { InputEvent, KeyEvent, Op, PointerEvent } from "../mod.ts";
import type { SizingAxis } from "../ops.ts";
import type { Setting } from "../settings.ts";

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

type AppContext = {
  mode: "input" | "config";
  event: InputEvent | PointerEvent | null;
  logged: InputEvent | PointerEvent | null;
  log: EventFilter;
  entered: Set<string>;
  ["Disambiguate escape codes"]: boolean;
  ["Report event types"]: boolean;
  ["Report alternate keys"]: boolean;
  ["Report all keys as escapes"]: boolean;
  ["Report associated text"]: boolean;
  ["Capture mouse events"]: boolean;
};

type KeyDef = {
  label: string;
  code: string;
  width?: number;
};

type KeyboardDemoApi = {
  close(): Op;
  fixed(value: number): SizingAxis;
  grow(min?: number, max?: number): SizingAxis;
  mouseTracking(): Setting;
  open(id: string, properties: Record<string, unknown>): Op;
  progressiveInput(bits: number): Setting;
  rgba(r: number, g: number, b: number, a?: number): number;
  settings(...parts: Setting[]): Setting;
  text(value: string, properties?: Record<string, unknown>): Op;
};

type Mode = Iterable<AppContext, Mode, InputEvent | PointerEvent>;

export function createKeyboardDemo(api: KeyboardDemoApi) {
  let {
    close,
    fixed,
    grow,
    mouseTracking,
    open,
    progressiveInput,
    rgba,
    settings,
    text,
  } = api;

  let active = rgba(60, 120, 220);
  let inactive = rgba(50, 50, 60);
  let on = rgba(40, 180, 80);
  let label = rgba(220, 220, 220);
  let dim = rgba(100, 100, 120);
  let highlight = rgba(255, 220, 80);
  let hovered = rgba(80, 80, 100);

  let KEY_W = 5;
  let GAP = 1;

  let flagNames: (keyof Omit<
    AppContext,
    "mode" | "event" | "logged" | "log" | "entered"
  >)[] = [
    "Disambiguate escape codes",
    "Report event types",
    "Report alternate keys",
    "Report all keys as escapes",
    "Report associated text",
  ];

  let logEntries: { key: string; name: keyof EventFilter }[] = [
    { key: "a", name: "keydown" },
    { key: "b", name: "keyup" },
    { key: "c", name: "keyrepeat" },
    { key: "d", name: "mousedown" },
    { key: "e", name: "mouseup" },
    { key: "f", name: "mousemove" },
    { key: "g", name: "wheel" },
    { key: "h", name: "resize" },
    { key: "i", name: "pointerenter" },
    { key: "j", name: "pointerleave" },
    { key: "k", name: "pointerclick" },
  ];

  function isKeyEvent(event: InputEvent | PointerEvent): event is KeyEvent {
    return event.type === "keydown" || event.type === "keyrepeat" ||
      event.type === "keyup";
  }

  function matches(keyDef: KeyDef, event: InputEvent | PointerEvent): boolean {
    return isKeyEvent(event) && event.type === "keydown" &&
      event.code.toUpperCase() === keyDef.code.toUpperCase();
  }

  function key(ops: Op[], keyDef: KeyDef, context: AppContext): void {
    let pressed = context.event && matches(keyDef, context.event);
    let hover = context.entered.has(`key:${keyDef.code}`);
    let bg = pressed ? active : hover ? hovered : inactive;
    let width = keyDef.width ?? KEY_W;
    ops.push(
      open(`key:${keyDef.code}`, {
        layout: {
          width: fixed(width),
          height: grow(),
          padding: { left: 1, right: 1 },
          alignX: 2,
          alignY: 2,
        },
        bg,
        border: hover
          ? { color: highlight, left: 1, right: 1, top: 1, bottom: 1 }
          : undefined,
      }),
      text(keyDef.label, { color: hover ? highlight : label }),
      close(),
    );
  }

  function row(ops: Op[], keys: KeyDef[], context: AppContext): void {
    ops.push(
      open("", { layout: { direction: "ltr", gap: GAP, height: fixed(3) } }),
    );
    for (let keyDef of keys) {
      key(ops, keyDef, context);
    }
    ops.push(close());
  }

  function spacer(ops: Op[], width: number): void {
    ops.push(
      open("", { layout: { width: fixed(width), height: grow() } }),
      close(),
    );
  }

  function mainKeys(ops: Op[], context: AppContext): void {
    ops.push(open("main-keys", { layout: { direction: "ttb", gap: GAP } }));

    row(ops, [
      { label: "Esc", code: "Escape", width: 11 },
      { label: "F1", code: "F1" },
      { label: "F2", code: "F2" },
      { label: "F3", code: "F3" },
      { label: "F4", code: "F4" },
      { label: "F5", code: "F5" },
      { label: "F6", code: "F6" },
      { label: "F7", code: "F7" },
      { label: "F8", code: "F8" },
      { label: "F9", code: "F9" },
      { label: "F10", code: "F10" },
      { label: "F11", code: "F11" },
      { label: "F12", code: "F12" },
    ], context);

    row(ops, [
      { label: "`", code: "`" },
      { label: "1", code: "1" },
      { label: "2", code: "2" },
      { label: "3", code: "3" },
      { label: "4", code: "4" },
      { label: "5", code: "5" },
      { label: "6", code: "6" },
      { label: "7", code: "7" },
      { label: "8", code: "8" },
      { label: "9", code: "9" },
      { label: "0", code: "0" },
      { label: "-", code: "-" },
      { label: "=", code: "=" },
      { label: "Bksp", code: "Backspace", width: 9 },
    ], context);

    row(ops, [
      { label: "Tab", code: "Tab", width: 7 },
      { label: "Q", code: "q" },
      { label: "W", code: "w" },
      { label: "E", code: "e" },
      { label: "R", code: "r" },
      { label: "T", code: "t" },
      { label: "Y", code: "y" },
      { label: "U", code: "u" },
      { label: "I", code: "i" },
      { label: "O", code: "o" },
      { label: "P", code: "p" },
      { label: "[", code: "[" },
      { label: "]", code: "]" },
      { label: "\\", code: "\\", width: 7 },
    ], context);

    row(ops, [
      { label: "Caps", code: "CapsLock", width: 9 },
      { label: "A", code: "a" },
      { label: "S", code: "s" },
      { label: "D", code: "d" },
      { label: "F", code: "f" },
      { label: "G", code: "g" },
      { label: "H", code: "h" },
      { label: "J", code: "j" },
      { label: "K", code: "k" },
      { label: "L", code: "l" },
      { label: ";", code: ";" },
      { label: "'", code: "'" },
      { label: "Enter", code: "Enter", width: 10 },
    ], context);

    row(ops, [
      { label: "Shift", code: "ShiftLeft", width: 11 },
      { label: "Z", code: "z" },
      { label: "X", code: "x" },
      { label: "C", code: "c" },
      { label: "V", code: "v" },
      { label: "B", code: "b" },
      { label: "N", code: "n" },
      { label: "M", code: "m" },
      { label: ",", code: "," },
      { label: ".", code: "." },
      { label: "/", code: "/" },
      { label: "Shift", code: "ShiftRight", width: 13 },
    ], context);

    row(ops, [
      { label: "Ctrl", code: "ControlLeft", width: 7 },
      { label: "Win", code: "SuperLeft", width: 6 },
      { label: "Alt", code: "AltLeft", width: 6 },
      { label: "", code: " ", width: 33 },
      { label: "Alt", code: "AltRight", width: 6 },
      { label: "Win", code: "SuperRight", width: 6 },
      { label: "Menu", code: "Menu", width: 6 },
      { label: "Ctrl", code: "ControlRight", width: 7 },
    ], context);

    ops.push(close());
  }

  function navKeys(ops: Op[], context: AppContext): void {
    ops.push(open("nav-keys", { layout: { direction: "ttb", gap: GAP } }));

    row(ops, [
      { label: "Ins", code: "Insert", width: 6 },
      { label: "Home", code: "Home", width: 6 },
      { label: "PgUp", code: "PageUp", width: 6 },
    ], context);

    row(ops, [
      { label: "Del", code: "Delete", width: 6 },
      { label: "End", code: "End", width: 6 },
      { label: "PgDn", code: "PageDown", width: 6 },
    ], context);

    ops.push(open("", { layout: { height: fixed(3) } }), close());

    ops.push(
      open("", { layout: { direction: "ltr", gap: GAP, height: fixed(3) } }),
    );
    spacer(ops, 6);
    key(ops, { label: "↑", code: "ArrowUp", width: 6 }, context);
    spacer(ops, 6);
    ops.push(close());

    row(ops, [
      { label: "←", code: "ArrowLeft", width: 6 },
      { label: "↓", code: "ArrowDown", width: 6 },
      { label: "→", code: "ArrowRight", width: 6 },
    ], context);

    ops.push(close());
  }

  function numpad(ops: Op[], context: AppContext): void {
    ops.push(open("numpad", { layout: { direction: "ttb", gap: GAP } }));

    row(ops, [
      { label: "Num", code: "NumLock", width: 6 },
      { label: "/", code: "NumpadDivide", width: 6 },
      { label: "*", code: "NumpadMultiply", width: 6 },
      { label: "-", code: "NumpadSubtract", width: 6 },
    ], context);

    ops.push(open("", { layout: { direction: "ltr", gap: GAP } }));
    ops.push(open("", { layout: { direction: "ttb", gap: GAP } }));
    row(ops, [
      { label: "7", code: "Numpad7", width: 6 },
      { label: "8", code: "Numpad8", width: 6 },
      { label: "9", code: "Numpad9", width: 6 },
    ], context);
    row(ops, [
      { label: "4", code: "Numpad4", width: 6 },
      { label: "5", code: "Numpad5", width: 6 },
      { label: "6", code: "Numpad6", width: 6 },
    ], context);
    ops.push(close());

    key(ops, { label: "+", code: "NumpadAdd" }, context);
    ops.push(close());

    ops.push(open("", { layout: { direction: "ltr", gap: GAP } }));
    ops.push(open("", { layout: { direction: "ttb", gap: GAP } }));
    row(ops, [
      { label: "1", code: "Numpad1", width: 6 },
      { label: "2", code: "Numpad2", width: 6 },
      { label: "3", code: "Numpad3", width: 6 },
    ], context);
    row(ops, [
      { label: "0", code: "Numpad0", width: 13 },
      { label: ".", code: "NumpadDecimal", width: 6 },
    ], context);
    ops.push(close());

    key(ops, { label: "Ent", code: "NumpadEnter" }, context);
    ops.push(close());
    ops.push(close());
  }

  function toggle(ops: Op[], enabled: boolean, name: string): void {
    let indicator = enabled ? "●───" : "───○";
    ops.push(
      open("", { layout: { direction: "ltr", height: fixed(1), gap: 1 } }),
      text(indicator, { color: enabled ? on : dim }),
      text(name, { color: enabled ? label : dim }),
      close(),
    );
  }

  function logToggle(
    ops: Op[],
    entries: typeof logEntries,
    context: AppContext,
  ): void {
    for (let entry of entries) {
      ops.push(
        open(`log:${entry.name}`, {
          layout: { direction: "ltr", height: fixed(1), gap: 1 },
        }),
      );
      ops.push(text(`${entry.key}.`, { color: dim }));
      toggle(ops, context.log[entry.name], entry.name);
      ops.push(close());
    }
  }

  function configPanel(ops: Op[], context: AppContext): void {
    let color = context.mode === "config" ? active : rgba(0, 0, 0, 0);
    ops.push(open("config", {
      layout: {
        direction: "ltr",
        gap: 3,
        padding: { left: 1, right: 1, top: 1, bottom: 1 },
      },
      border: { color, left: 1, right: 1, top: 1, bottom: 1 },
    }));

    ops.push(open("protocol-level", { layout: { direction: "ttb", gap: 1 } }));
    ops.push(
      open("", { layout: { height: fixed(1) } }),
      text("Keyboard Protocol Level", { color: highlight }),
      close(),
    );
    for (let index = 0; index < flagNames.length; index++) {
      let name = flagNames[index];
      ops.push(
        open(`flag:${name}`, {
          layout: { direction: "ltr", height: fixed(1), gap: 1 },
        }),
      );
      ops.push(text(`${index + 1}.`, { color: dim }));
      toggle(ops, context[name], name);
      ops.push(close());
    }
    ops.push(close());

    let col1 = logEntries.slice(0, 6);
    let col2 = logEntries.slice(6);

    ops.push(open("log-events", { layout: { direction: "ttb", gap: 1 } }));
    ops.push(
      open("", { layout: { height: fixed(1) } }),
      text("Log Events", { color: highlight }),
      close(),
    );
    logToggle(ops, col1, context);
    ops.push(close());

    ops.push(open("log-events-2", { layout: { direction: "ttb", gap: 1 } }));
    ops.push(open("", { layout: { height: fixed(1) } }), close());
    logToggle(ops, col2, context);
    ops.push(close());

    ops.push(close());
  }

  function keyboard(context: AppContext): Op[] {
    let ops: Op[] = [];

    ops.push(open("root", {
      layout: {
        width: grow(),
        height: grow(),
        direction: "ttb",
        alignX: 2,
        alignY: 2,
        padding: { left: 2, top: 1 },
      },
    }));

    ops.push(open("", { layout: { direction: "ttb" } }));

    ops.push(open("", {
      layout: {
        width: grow(),
        direction: "ltr",
        alignY: 0,
        padding: { bottom: 1 },
      },
    }));

    let badgeBg = context.mode === "input"
      ? rgba(40, 120, 200)
      : rgba(200, 120, 40);
    let badgeLabel = context.mode === "input" ? "input" : "config";
    let badgeHint = context.mode === "input"
      ? "Ctrl+X Ctrl+X to enter config"
      : "Set flags with keys [0-5], Enter to save";
    let mouseBg = context["Capture mouse events"]
      ? rgba(40, 180, 80)
      : rgba(80, 80, 80);
    let mouseLabel = context["Capture mouse events"] ? "capture" : "system";

    ops.push(
      open("badges", {
        layout: { direction: "ttb", gap: 1, padding: { top: 1 } },
      }),
      open("badge:mode", {
        layout: { direction: "ltr", height: fixed(1), padding: { bottom: 1 } },
      }),
      open("", {
        layout: { padding: { left: 1, right: 1 } },
        bg: rgba(60, 60, 60),
      }),
      text("mode", { color: rgba(220, 220, 220) }),
      close(),
      open("", { layout: { padding: { left: 1, right: 1 } }, bg: badgeBg }),
      text(badgeLabel, { color: rgba(255, 255, 255) }),
      close(),
      text(` ${badgeHint}`, { color: dim }),
      close(),
      open("badge:mouse", { layout: { direction: "ltr", height: fixed(1) } }),
      open("", {
        layout: { padding: { left: 1, right: 1 } },
        bg: rgba(60, 60, 60),
      }),
      text("mouse", { color: rgba(220, 220, 220) }),
      close(),
      open("", { layout: { padding: { left: 1, right: 1 } }, bg: mouseBg }),
      text(mouseLabel, { color: rgba(255, 255, 255) }),
      close(),
      text(" Ctrl+X Ctrl+M to toggle", { color: dim }),
      close(),
      close(),
    );

    ops.push(
      open("", { layout: { width: grow(), direction: "ltr", alignX: 1 } }),
    );
    configPanel(ops, context);
    ops.push(close());
    ops.push(close());

    let keyboardColor = context.mode === "input" ? active : rgba(0, 0, 0, 0);
    ops.push(open("keyboard", {
      layout: {
        direction: "ltr",
        gap: 3,
        alignY: 1,
        padding: { left: 1, right: 1, top: 1, bottom: 1 },
      },
      border: { color: keyboardColor, left: 1, right: 1, top: 1, bottom: 1 },
    }));

    mainKeys(ops, context);
    navKeys(ops, context);
    numpad(ops, context);

    ops.push(close());
    ops.push(close());

    ops.push(
      open("event-log", { layout: { height: fixed(1), padding: { top: 1 } } }),
    );
    ops.push(
      text(
        context.logged ? JSON.stringify(context.logged) : "Press any key...",
        {
          color: highlight,
        },
      ),
    );
    ops.push(close());
    ops.push(close());

    return ops;
  }

  function ttyFlags(context: AppContext): Setting {
    let parts: Setting[] = [];
    let bits = 0;
    if (context["Disambiguate escape codes"]) bits |= 1;
    if (context["Report event types"]) bits |= 2;
    if (context["Report alternate keys"]) bits |= 4;
    if (context["Report all keys as escapes"]) bits |= 8;
    if (context["Report associated text"]) bits |= 16;
    parts.push(progressiveInput(bits));
    if (context["Capture mouse events"]) {
      parts.push(mouseTracking());
    }
    return settings(...parts);
  }

  function createInitialContext(): AppContext {
    return {
      mode: "input",
      "Disambiguate escape codes": true,
      "Report event types": true,
      "Report alternate keys": true,
      "Report all keys as escapes": true,
      "Report associated text": true,
      "Capture mouse events": true,
      log: {
        keydown: true,
        keyrepeat: false,
        keyup: false,
        mousedown: false,
        mouseup: false,
        mousemove: false,
        wheel: true,
        resize: true,
        pointerenter: false,
        pointerleave: false,
        pointerclick: true,
      },
      entered: new Set(),
      event: null,
      logged: null,
    };
  }

  function* recognizer(): Iterator<
    AppContext,
    never,
    InputEvent | PointerEvent
  > {
    let current = createInitialContext();
    let event = yield current;
    let mode = inputmode({ ...current, event });

    while (true) {
      mode = yield* mode;
    }
  }

  function* inputmode(context: AppContext): Mode {
    context = { ...context, mode: "input" };
    let event = context.event ? context.event : yield context;
    while (true) {
      context = { ...context, event };
      if (event.type === "keydown" && event.key === "x" && event.ctrl) {
        let next = yield context;
        while (next.type !== "keydown") {
          context = { ...context, event: next };
          next = yield context;
        }
        context = { ...context, event: next };
        if (next.key === "x" && next.ctrl) {
          return configmode({ ...context, event: null });
        } else if (next.key === "m" && next.ctrl) {
          context = {
            ...context,
            "Capture mouse events": !context["Capture mouse events"],
            event: null,
          };
          event = yield context;
          continue;
        }
      }
      event = yield context;
    }
  }

  function* configmode(context: AppContext): Mode {
    context = { ...context, mode: "config" };
    let event = yield context;
    while (true) {
      if (event.type === "keydown" && event.key === "Enter") {
        return inputmode({ ...context, event: null });
      }
      if (event.type === "keydown") {
        let keyEvent = event as KeyEvent;
        let entry = logEntries.find((candidate) =>
          candidate.key === keyEvent.key
        );
        if (entry) {
          context = {
            ...context,
            log: { ...context.log, [entry.name]: !context.log[entry.name] },
          };
        }
        if ("012345".indexOf(keyEvent.key) >= 0) {
          context = { ...context };
          context["Report associated text"] = false;
          context["Report all keys as escapes"] = false;
          context["Report alternate keys"] = false;
          context["Report event types"] = false;
          context["Disambiguate escape codes"] = false;
          switch (keyEvent.key) {
            case "5":
              context["Report associated text"] = true;
            case "4":
              context["Report all keys as escapes"] = true;
            case "3":
              context["Report alternate keys"] = true;
            case "2":
              context["Report event types"] = true;
            case "1":
              context["Disambiguate escape codes"] = true;
              break;
            case "0":
              break;
          }
        }
      }
      event = yield context;
    }
  }

  return {
    keyboard,
    recognizer,
    ttyFlags,
  };
}
