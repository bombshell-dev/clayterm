import { describe, expect, it } from "./suite.ts";
import { createTerm } from "../term.ts";
import { close, fixed, grow, open, text } from "../ops.ts";
import { print } from "./print.ts";

const decode = (b: Uint8Array) => new TextDecoder().decode(b);

// Two 1-wide fixed children inside a 10-wide grow row.
function row(alignX: number) {
  return [
    open("row", {
      layout: { width: grow(), height: fixed(1), direction: "ltr", alignX },
    }),
    open("a", { layout: { width: fixed(1), height: fixed(1) } }),
    text("A"),
    close(),
    open("b", { layout: { width: fixed(1), height: fixed(1) } }),
    text("B"),
    close(),
    close(),
  ];
}

describe("justifyContent space distribution", () => {
  it("space-between pushes children to opposite edges", async () => {
    let term = await createTerm({ width: 10, height: 1 });
    let res = term.render(row(3)); // 3 = space-between
    // first child hugs the left edge
    expect(res.info.get("a")!.bounds.x).toBe(0);
    // last child hugs the right edge
    expect(res.info.get("b")!.bounds.x).toBe(9);
    // all free space sits between the two children
    expect(print(decode(res.output), 10, 1)).toBe("A        B");
  });

  it("space-evenly puts equal gaps on the ends and between", async () => {
    let term = await createTerm({ width: 10, height: 1 });
    let res = term.render(row(5)); // 5 = space-evenly
    // leading gap is non-zero (first child not at the left edge)
    expect(res.info.get("a")!.bounds.x).toBeGreaterThan(0);
    // trailing gap is non-zero (last child not at the right edge)
    expect(res.info.get("b")!.bounds.x).toBeLessThan(9);
    // 3 equal gaps of (10-2)/3 -> A at col 2, B at col 6
    expect(print(decode(res.output), 10, 1)).toBe("  A   B");
  });

  it("space-around puts half-size gaps on the ends", async () => {
    let term = await createTerm({ width: 10, height: 1 });
    let res = term.render(row(4)); // 4 = space-around
    // leading gap is non-zero (first child not at the left edge)
    expect(res.info.get("a")!.bounds.x).toBeGreaterThan(0);
    // last child is not pinned to the right edge
    expect(res.info.get("b")!.bounds.x).toBeLessThan(9);
  });
});
