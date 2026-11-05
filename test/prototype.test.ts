import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { filter, map, scan, take } from "rxjs";
import { C, E, N, type Note } from "../src/mealy";
import { distinctM } from "../src/models";
import {
  associativity, leftIdentity, mapFusion, matchesModel, pipeMatchesCompose,
  preservesProtocol, rightIdentity, wellFormed,
} from "../src/laws";
import { checkTopology, toMermaid } from "../src/topology";
import { toTla } from "../src/tla";
import { entries, distinctTopology, isEven, double, sum } from "../src/specs";
import { buggyDistinct } from "../src/buggy";

export const BOOM = new Error("boom");

/** Well-formed inputs: a few small values, then optionally complete or error. */
const notes: fc.Arbitrary<Note<number>[]> = fc
  .tuple(fc.array(fc.integer({ min: 0, max: 3 }), { maxLength: 8 }), fc.constantFrom("none", "C", "E"))
  .map(([xs, end]) => [...xs.map((x) => N(x)), ...(end === "C" ? [C] : end === "E" ? [E(BOOM)] : [])]);

const holds = (check: (ns: Note<number>[]) => boolean) =>
  fc.assert(fc.property(notes, check), { numRuns: 300 });

describe("idea 2: each operator matches its Mealy model", () => {
  for (const e of entries) {
    it(e.name, () => holds(matchesModel(e.model as never, e.operator as never)));
  }
  it("the model of pipe(f, g) is compose(model f, model g)", () => {
    const fm = entries[1], gm = entries[2]; // filter, distinctUntilChanged
    holds(pipeMatchesCompose(fm.model as never, fm.operator as never, gm.model as never, gm.operator as never));
  });
});

describe("idea 1: Category and Profunctor laws on real RxJS", () => {
  for (const e of entries) {
    it(`left identity: ${e.name}`, () => holds(leftIdentity(e.operator as never)));
    it(`right identity: ${e.name}`, () => holds(rightIdentity(e.operator as never)));
    it(`preserves protocol: ${e.name}`, () => holds(preservesProtocol(e.operator as never)));
  }
  it("associativity: filter, scan, take", () => holds(associativity(filter(isEven), scan(sum, 0), take<number>(3))));
  it("map fusion after scan", () => holds(mapFusion(scan(sum, 0), double, (x: number) => x + 1)));
});

describe("idea 3: declared topology", () => {
  for (const e of entries) {
    it(`every run stays inside the topology: ${e.name}`, () =>
      holds((ns) => checkTopology(e.spec as never, ns) === null));
  }
  it("renders Mermaid", () => {
    expect(toMermaid(distinctTopology)).toContain("empty --> seen");
  });
  it("generates a TLA+ module", () => {
    const tla = toTla("DistinctPolicy", distinctTopology);
    expect(tla).toContain(`EmptyToSeen == phase = "empty" /\\ phase' = "seen"`);
  });
});

describe("a buggy operator is caught", () => {
  it("buggyDistinct fails against the model, with a small counterexample", () => {
    const result = fc.check(fc.property(notes, matchesModel(distinctM<number>(), buggyDistinct<number>())), { numRuns: 300 });
    expect(result.failed).toBe(true);
    const [counterexample] = result.counterexample!;
    expect(counterexample.length).toBeLessThanOrEqual(4);
    expect(wellFormed(counterexample)).toBe(true);
  });
});
