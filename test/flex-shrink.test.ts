import { beforeEach, describe, expect, it } from "./suite.ts";
import { createTerm, type Term } from "../term.ts";
import { close, fit, fixed, open, type SizingAxis, text } from "../ops.ts";
import { print } from "./print.ts";

const decode = (b: Uint8Array) => new TextDecoder().decode(b);

describe("flex-shrink", () => {
  let term: Term;
  beforeEach(async () => {
    term = await createTerm({ width: 10, height: 1 });
  });

  // Width-10 row with two basis-6 children (A, B) that should be allowed to
  // shrink, plus a 1-col trailing child (C). Basis total 6+6+1=13 overflows
  // the parent by 3, so the shrinkable children must absorb it: A 6->5, B 6->4.
  // The basis + shrink weight is opted in via a cast so the scene still
  // type-checks against today's SizingAxis, which has no basis/shrink fields.
  function shrinkScene() {
    return term.render([
      open("root", {
        layout: { width: fixed(10), height: fixed(1), direction: "ltr" },
      }),
      open("a", {
        layout: {
          width: {
            ...fixed(6),
            basis: 6,
            shrinkWeight: 1,
          } as unknown as SizingAxis,
          height: fixed(1),
        },
      }),
      text("A"),
      close(),
      open("b", {
        layout: {
          width: {
            ...fixed(6),
            basis: 6,
            shrinkWeight: 1,
          } as unknown as SizingAxis,
          height: fixed(1),
        },
      }),
      text("B"),
      close(),
      open("c", { layout: { width: fit(), height: fixed(1) } }),
      text("C"),
      close(),
      close(),
    ]);
  }

  it("shrinks the first overflowing child from basis 6 to 5", () => {
    let r = shrinkScene();
    // pins the 5-wide share of the first shrinkable child
    expect(r.info.get("a")!.bounds.width).toBe(5);
  });

  it("shrinks the second overflowing child from basis 6 to 4", () => {
    let r = shrinkScene();
    // pins the 4-wide share of the second shrinkable child
    expect(r.info.get("b")!.bounds.width).toBe(4);
  });

  it("keeps the trailing child inside the parent at col 9", () => {
    let r = shrinkScene();
    // after shrink, C must land on the last cell, not be pushed off-grid
    expect(r.info.get("c")!.bounds.x).toBe(9);
  });

  it("renders all three glyphs within the 10-wide grid", () => {
    let r = shrinkScene();
    // exact frame after the 5/4 split: A at col 0, B at col 5, C at col 9
    expect(print(decode(r.output), 10, 1)).toBe("A    B   C");
  });
});
