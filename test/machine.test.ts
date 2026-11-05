import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { distinctUntilChanged, filter, pipe, scan } from "rxjs";
import { C, E, N, compose, run, type Note } from "../src/mealy";
import { distinctM, filterM, scanM } from "../src/models";
import { andThen, both, hide, idMachine, parallel, pipeMachines, runMachine, type Machine } from "../src/machine";
import { runRx, sameNotes } from "../src/laws";
import { isEven, sum } from "../src/specs";

const BOOM = new Error("boom");
const notes: fc.Arbitrary<Note<number>[]> = fc
  .tuple(fc.array(fc.integer({ min: 0, max: 3 }), { maxLength: 8 }), fc.constantFrom("none", "C", "E"))
  .map(([xs, end]) => [...xs.map((x) => N(x)), ...(end === "C" ? [C] : end === "E" ? [E(BOOM)] : [])]);
/** Any single notification, for inputs where the protocol order does not matter. */
const note: fc.Arbitrary<Note<number>> = fc.oneof(
  fc.integer({ min: 0, max: 3 }).map((x) => N(x)),
  fc.constant(C),
  fc.constant(E(BOOM)),
);
const holds = (check: (ns: Note<number>[]) => boolean) => fc.assert(fc.property(notes, check), { numRuns: 300 });

type M = Machine<Note<number>, Note<number>>;
const stages = (): [M, M, M] => [hide(filterM(isEven)), hide(scanM(sum, 0)), hide(distinctM<number>())];

describe("hidden-state machines", () => {
  it("hide preserves behaviour", () =>
    holds((ns) => sameNotes(runMachine(hide(distinctM<number>()), ns), run(distinctM<number>(), ns))));

  it("andThen of hidden machines equals hide of compose", () =>
    holds((ns) => {
      const [f, , h] = stages();
      return sameNotes(
        runMachine(andThen(f, h), ns),
        run(compose(filterM(isEven), distinctM<number>()), ns),
      );
    }));

  it("associativity", () =>
    holds((ns) => {
      const [f, g, h] = stages();
      const [f2, g2, h2] = stages();
      return sameNotes(runMachine(andThen(andThen(f, g), h), ns), runMachine(andThen(f2, andThen(g2, h2)), ns));
    }));

  it("left and right identity", () =>
    holds((ns) => {
      const m = () => hide(scanM(sum, 0));
      const plain = runMachine(m(), ns);
      return sameNotes(runMachine(andThen(idMachine<Note<number>>(), m()), ns), plain)
        && sameNotes(runMachine(andThen(m(), idMachine<Note<number>>()), ns), plain);
    }));

  it("pipeMachines agrees with RxJS pipe", () =>
    holds((ns) =>
      sameNotes(
        runMachine(pipeMachines(...stages()), ns),
        runRx(pipe(filter(isEven), scan(sum, 0), distinctUntilChanged<number>()), ns),
      )));

  it("parallel: each side behaves as if it ran alone", () =>
    fc.assert(
      fc.property(fc.array(fc.tuple(note, note), { maxLength: 10 }), (pairs) => {
        const out = runMachine(parallel(hide(scanM(sum, 0)), hide(distinctM<number>())), pairs);
        const left = out.flatMap(([bs]) => bs);
        const right = out.flatMap(([, ds]) => ds);
        return out.length === pairs.length
          && sameNotes(left, run(scanM(sum, 0), pairs.map(([a]) => a)))
          && sameNotes(right, run(distinctM<number>(), pairs.map(([, c]) => c)));
      }),
      { numRuns: 300 },
    ));

  it("both: dUC . dUC equals dUC on every step (lockstep law check)", () =>
    holds((ns) => {
      const once = hide(distinctM<number>());
      const twice = andThen(hide(distinctM<number>()), hide(distinctM<number>()));
      return runMachine(both(once, twice), ns).every(([l, r]) => sameNotes(l, r));
    }));

  it("both finds a broken law step by step", () => {
    const bad = (ns: Note<number>[]) => {
      const dUC = hide(distinctM<number>());
      const evens = hide(filterM(isEven));
      return runMachine(both(dUC, evens), ns).every(([l, r]) => sameNotes(l, r));
    };
    expect(bad([N(1)])).toBe(false);
  });

  it("composed type stays two-parameter", () => {
    const composed: Machine<Note<number>, Note<number>> = pipeMachines(...stages());
    expect(typeof composed.step).toBe("function");
  });
});
