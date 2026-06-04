import { describe, expect, it } from "./suite.ts";
import { createTerm } from "../term.ts";
import { close, fit, fixed, open, type OpenElement, text } from "../ops.ts";
import { print } from "./print.ts";

const decode = (b: Uint8Array) => new TextDecoder().decode(b);
const trim = (s: string) => s.split("\n").map((l) => l.trimEnd()).join("\n");

// flexWrap is not a layout key yet; this shim lets the file type-check today.
// The extra key is dropped by pack(), so it is inert at runtime against the
// current build.
const layout = (l: Record<string, unknown>): OpenElement["layout"] =>
  l as unknown as OpenElement["layout"];

describe("flex-wrap", () => {
  it("row wrap: child exceeding main size breaks to the next line", async () => {
    let term = await createTerm({ width: 6, height: 4 });
    let res = term.render([
      open("root", {
        layout: layout({
          width: fixed(2),
          height: fixed(4),
          direction: "ltr",
          flexWrap: "wrap",
        }),
      }),
      open("a", { layout: { width: fit(), height: fit() } }),
      text("A"),
      close(),
      open("bc", { layout: { width: fit(), height: fit() } }),
      text("BC"),
      close(),
      close(),
    ]);
    let lines = trim(print(decode(res.output), 6, 4)).split("\n");
    // pins: "A" stays alone on the first flex line.
    expect(lines[0]).toBe("A");
    // pins: "BC" no longer fits beside "A", so it wraps to a second line.
    expect(lines[1]).toBe("BC");
  });

  it("row wrap: wrapped child starts a new flex line at x=0", async () => {
    let term = await createTerm({ width: 6, height: 4 });
    let res = term.render([
      open("root", {
        layout: layout({
          width: fixed(2),
          height: fixed(4),
          direction: "ltr",
          flexWrap: "wrap",
        }),
      }),
      open("a", { layout: { width: fit(), height: fit() } }),
      text("A"),
      close(),
      open("bc", { layout: { width: fit(), height: fit() } }),
      text("BC"),
      close(),
      close(),
    ]);
    // pins: the wrapped "BC" sits on cross-axis line 1 (y:1), not beside "A".
    expect(res.info.get("bc")!.bounds).toEqual({
      x: 0,
      y: 1,
      width: 2,
      height: 1,
    });
  });
});
