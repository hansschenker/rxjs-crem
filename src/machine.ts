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

/** Compose any number of same-typed stages, like RxJS pipe for MonoTypeOperatorFunction. */
export const pipeMachines = <T>(...ms: readonly Machine<T, T>[]): Machine<T, T> =>
  ms.reduce<Machine<T, T>>((acc, m) => andThen(acc, m), idMachine<T>());
