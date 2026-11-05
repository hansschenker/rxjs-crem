import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { Subject, distinctUntilChanged, expand, filter, from, map, merge, pipe, scan } from "rxjs";
import { C, E, N, compose, run, type Note } from "../src/mealy";
import { distinctM, filterM, mapM, scanM } from "../src/models";
import { alternative, andThen, both, either, feedback, fromFunction, hide, idMachine, left, parallel, pipeMachines, right, runMachine, type Either, type Machine } from "../src/machine";
import { runRx, sameNotes } from "../src/laws";
import { double, isEven, sum } from "../src/specs";

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

  const tagged: fc.Arbitrary<Either<Note<number>, Note<number>>[]> = fc.array(
    fc.oneof(note.map((n) => left<Note<number>, Note<number>>(n)), note.map((n) => right<Note<number>, Note<number>>(n))),
    { maxLength: 12 },
  );

  it("alternative: only the tagged side steps, each side behaves as if it ran alone", () =>
    fc.assert(
      fc.property(tagged, (es) => {
        const out = runMachine(alternative(hide(scanM(sum, 0)), hide(distinctM<number>())), es);
        const pick = <T>(xs: readonly Either<T, T>[], tag: "left" | "right") =>
          xs.filter((x) => x.tag === tag).map((x) => x.value);
        return sameNotes(pick(out, "left"), run(scanM(sum, 0), pick(es, "left")))
          && sameNotes(pick(out, "right"), run(distinctM<number>(), pick(es, "right")));
      }),
      { numRuns: 300 },
    ));

  it("either matches RxJS merge(a$.pipe(f), c$.pipe(g)) on next values", () =>
    fc.assert(
      fc.property(
        fc.array(fc.oneof(fc.integer({ min: 0, max: 3 }).map((x) => left<number, number>(x)), fc.integer({ min: 0, max: 3 }).map((x) => right<number, number>(x))), { maxLength: 12 }),
        (es) => {
          const model = runMachine(
            either(hide(mapM(double)), hide(scanM(sum, 0))),
            es.map((e) => (e.tag === "left" ? left<Note<number>, Note<number>>(N(e.value)) : right<Note<number>, Note<number>>(N(e.value)))),
          );
          const a$ = new Subject<number>();
          const c$ = new Subject<number>();
          const actual: number[] = [];
          merge(a$.pipe(map(double)), c$.pipe(scan(sum, 0))).subscribe((v) => actual.push(v));
          for (const e of es) (e.tag === "left" ? a$ : c$).next(e.value);
          const expected = model.flatMap((n) => (n.kind === "N" ? [n.value] : []));
          return expected.length === actual.length && expected.every((v, i) => v === actual[i]);
        },
      ),
      { numRuns: 300 },
    ));

  it("edge case: either does not encode merge's completion policy", () => {
    const out = runMachine(
      either(hide(mapM(double)), hide(scanM(sum, 0))),
      [left<Note<number>, Note<number>>(C), right<Note<number>, Note<number>>(N(1))],
    );
    // merge would emit 1 and complete only after both sources complete;
    // either passes the first source's complete straight through.
    expect(out.map((n) => n.kind)).toEqual(["C", "N"]);
  });

  it("feedback matches RxJS expand, including branching", () =>
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 4 }), { maxLength: 5 }), (xs) => {
        const project = (x: number): number[] => (x < 4 ? [x + 1, x + 2] : []);
        const model = runMachine(feedback(idMachine<number>(), fromFunction(project)), xs);
        const actual: number[] = [];
        from(xs).pipe(expand((x) => from(project(x)))).subscribe((v) => actual.push(v));
        return model.length === actual.length && model.every((v, i) => v === actual[i]);
      }),
      { numRuns: 300 },
    ));

  it("feedback keeps the state of both machines across inputs", () => {
    // f counts how many values it has seen in total; g feeds back once per value below 2
    const counter = hide(scanM((n: number) => n + 1, 0));
    const once = fromFunction((b: Note<number>) => (b.kind === "N" && b.value < 2 ? [N(0)] : []));
    const out = runMachine(feedback(counter, once), [N(9), N(9)]);
    expect(out.map((n) => (n.kind === "N" ? n.value : n.kind))).toEqual([1, 2, 3]);
  });

  it("edge case: a loop without an exit throws instead of hanging", () => {
    const echo = fromFunction((b: number) => [b]);
    expect(() => runMachine(feedback(idMachine<number>(), echo, 100), [1])).toThrow(/no exit/);
  });

  it("composed type stays two-parameter", () => {
    const composed: Machine<Note<number>, Note<number>> = pipeMachines(...stages());
    expect(typeof composed.step).toBe("function");
  });
});
