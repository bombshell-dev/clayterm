import { describe, expect, it } from "./suite.ts";
import { createTerm } from "../term.ts";
import { close, grow, open, rgba, text } from "../ops.ts";

const decode = (b: Uint8Array) => new TextDecoder().decode(b);

describe("targeted SGR resets", () => {
  it("leaving a background run emits a targeted bg reset", async () => {
    let term = await createTerm({ width: 6, height: 2 });
    let ansi = decode(
      term.render([
        open("root", {
          layout: { width: grow(), height: grow(), direction: "ttb" },
        }),
        open("a", { layout: { width: grow() }, bg: rgba(255, 0, 0) }),
        text("A"),
        close(),
        open("b", { layout: { width: grow() } }),
        text("B"),
        close(),
        close(),
      ]).output,
    );

    // pins: ending a bg run uses \x1b[49m (bg-default), not a blanket \x1b[0m
    expect(ansi).toContain("\x1b[49m");
  });
});
