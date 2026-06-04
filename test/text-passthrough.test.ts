import { beforeEach, describe, expect, it } from "./suite.ts";
import { createTerm, type Term } from "../term.ts";
import { close, grow, open, text } from "../ops.ts";

const decode = (b: Uint8Array) => new TextDecoder().decode(b);
const ESC = String.fromCharCode(0x1b);

describe("text escape passthrough", () => {
  let term: Term;
  beforeEach(async () => {
    term = await createTerm({ width: 40, height: 3 });
  });

  it("preserves embedded SGR color escape bytes verbatim", () => {
    let input = ESC + "[32mgreen" + ESC + "[0m normal";
    let ansi = decode(
      term.render([
        open("root", {
          layout: { width: grow(), height: grow(), direction: "ttb" },
        }),
        text(input, { passthrough: true } as never),
        close(),
      ]).output,
    );
    // the raw input SGR open byte must survive into the output
    expect(ansi).toContain(ESC + "[32m");
    // and the reset byte too
    expect(ansi).toContain(ESC + "[0m normal");
  });

  it("does not substitute U+FFFD for embedded ESC bytes", () => {
    let input = ESC + "[32mx" + ESC + "[0m";
    let ansi = decode(
      term.render([
        open("root", {
          layout: { width: grow(), height: grow(), direction: "ttb" },
        }),
        text(input, { passthrough: true } as never),
        close(),
      ]).output,
    );
    // no replacement glyph should appear where the ESC bytes were stripped
    expect(ansi.includes("�")).toBe(false);
  });
});
