import { describe, expect, it } from "./suite.ts";
import { createTerm } from "../term.ts";
import { close, fixed, open, rgba, text } from "../ops.ts";

const decode = (b: Uint8Array) => new TextDecoder().decode(b);

describe("per-side border colors", () => {
  it("supports per-side border foreground colors", async () => {
    let term = await createTerm({ width: 12, height: 4 });
    let ansi = decode(
      term.render([
        open("box", {
          layout: { width: fixed(8), height: fixed(3), direction: "ttb" },
          border: {
            color: rgba(255, 255, 255), // shared fallback
            // proposed: per-side color override on top vs bottom
            top: { width: 1, color: rgba(255, 0, 0) }, // red top
            bottom: { width: 1, color: rgba(0, 255, 0) }, // green bottom
            left: 1,
            right: 1,
            // deno-lint-ignore no-explicit-any
          } as any,
        }),
        text("Hi"),
        close(),
      ]).output,
    );

    // pins down: top edge carries red fg
    expect(ansi).toContain("\x1b[38;2;255;0;0");
    // pins down: bottom edge carries green fg
    expect(ansi).toContain("\x1b[38;2;0;255;0");
  });
});
