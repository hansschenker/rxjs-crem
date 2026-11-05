// Machines with hidden state, after crem's StateMachine.
// `Mealy<S, I, O>` keeps the state type visible, which topology checks need.
// `Machine<I, O>` hides it in a closure, so composed machines keep a two-parameter
// type no matter how much state they carry. TypeScript has no existential types;
// the closure plays that role.
import type { Mealy } from "./mealy";

export interface Machine<I, O> {
  readonly step: (input: I) => readonly [readonly O[], Machine<I, O>];
}

/** Hide the state of an explicit Mealy machine. */
export const hide = <S, I, O>(m: Mealy<S, I, O>, s: S = m.initial): Machine<I, O> => ({
  step: (i) => {
    const [next, out] = m.step(s, i);
    return [out, hide(m, next)];
  },
});

export const runMachine = <I, O>(m: Machine<I, O>, inputs: readonly I[]): O[] => {
  const out: O[] = [];
  for (const i of inputs) {
    const [os, next] = m.step(i);
    out.push(...os);
    m = next;
  }
  return out;
};

export const idMachine = <I>(): Machine<I, I> => ({
  step: (i) => [[i], idMachine<I>()],
});

/** Serial composition. The result is again Machine<A, O>; the pair state stays inside. */
export const andThen = <A, B, O>(f: Machine<A, B>, g: Machine<B, O>): Machine<A, O> => ({
  step: (a) => {
    const [bs, f2] = f.step(a);
    let g2 = g;
    const os: O[] = [];
    for (const b of bs) {
      const [out, next] = g2.step(b);
      os.push(...out);
      g2 = next;
    }
    return [os, andThen(f2, g2)];
  },
});

/** Pre-composition with a pure function (Profunctor lmap). */
export const lmapMachine = <I0, I, O>(h: (i: I0) => I, m: Machine<I, O>): Machine<I0, O> => ({
  step: (i) => {
    const [os, next] = m.step(h(i));
    return [os, lmapMachine(h, next)];
  },
});

/**
 * Parallel composition (crem `parallel`, Arrow `***`).
 * Each machine may emit several outputs per step, so the result pairs the lists:
 * exactly one pair per step, and nothing is dropped.
 */
export const parallel = <A, B, C, D>(
  f: Machine<A, B>,
  g: Machine<C, D>,
): Machine<readonly [A, C], readonly [readonly B[], readonly D[]]> => ({
  step: ([a, c]) => {
    const [bs, f2] = f.step(a);
    const [ds, g2] = g.step(c);
    return [[[bs, ds]], parallel(f2, g2)];
  },
});

/** Same input to both machines (crem `fanOut`, Arrow `&&&`): lmap duplicate, then parallel. */
export const both = <A, B, D>(
  f: Machine<A, B>,
  g: Machine<A, D>,
): Machine<A, readonly [readonly B[], readonly D[]]> =>
  lmapMachine((a: A) => [a, a] as const, parallel(f, g));

/** Compose any number of same-typed stages, like RxJS pipe for MonoTypeOperatorFunction. */
export const pipeMachines = <T>(...ms: readonly Machine<T, T>[]): Machine<T, T> =>
  ms.reduce<Machine<T, T>>((acc, m) => andThen(acc, m), idMachine<T>());
