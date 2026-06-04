import { beforeEach, describe, expect, it } from "./suite.ts";
import { createTerm, type Term } from "../term.ts";
import { close, fixed, open, rgba, text } from "../ops.ts";

const decode = (b: Uint8Array) => new TextDecoder().decode(b);

describe("border background color", () => {
  let term: Term;

  beforeEach(async () => {
    term = await createTerm({ width: 12, height: 4 });
  });

  it("emits a uniform bg SGR on border cells", () => {
    let ansi = decode(
      term.render([
        open("box", {
          layout: { width: fixed(8), height: fixed(3), direction: "ttb" },
          border: {
            color: rgba(255, 255, 255),
            bg: rgba(0, 0, 255), // proposed: blue border background
            left: 1,
            right: 1,
            top: 1,
            bottom: 1,
            // deno-lint-ignore no-explicit-any
          } as any,
        }),
        text("Hi"),
        close(),
      ]).output,
    );

    // pins down: border cells carry a blue background SGR
    expect(ansi).toContain("\x1b[48;2;0;0;255");
  });

  it("emits the border fg AND bg together on a corner cell", () => {
    let ansi = decode(
      term.render([
        open("box", {
          layout: { width: fixed(8), height: fixed(3), direction: "ttb" },
          border: {
            color: rgba(255, 0, 0), // red fg
            bg: rgba(0, 0, 255), // blue bg
            left: 1,
            right: 1,
            top: 1,
            bottom: 1,
            // deno-lint-ignore no-explicit-any
          } as any,
        }),
        text("Hi"),
        close(),
      ]).output,
    );

    let before = ansi.slice(0, ansi.indexOf("┌"));
    // pins down: red fg active on the run leading to the top-left corner
    expect(before).toContain("\x1b[38;2;255;0;0");
    // pins down: blue bg active on the same corner cell
    expect(before).toContain("\x1b[48;2;0;0;255");
  });
});
