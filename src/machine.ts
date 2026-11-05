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

/** Post-composition with a pure function (Profunctor rmap). */
export const rmapMachine = <I, O, O2>(h: (o: O) => O2, m: Machine<I, O>): Machine<I, O2> => ({
  step: (i) => {
    const [os, next] = m.step(i);
    return [os.map(h), rmapMachine(h, next)];
  },
});

export type Either<L, R> =
  | { readonly tag: "left"; readonly value: L }
  | { readonly tag: "right"; readonly value: R };

export const left = <L, R = never>(value: L): Either<L, R> => ({ tag: "left", value });
export const right = <R, L = never>(value: R): Either<L, R> => ({ tag: "right", value });

/**
 * Alternative composition (crem `alternative`, ArrowChoice `+++`).
 * Only the machine the input is tagged for steps; the other keeps its state.
 */
export const alternative = <A, B, C, D>(
  f: Machine<A, B>,
  g: Machine<C, D>,
): Machine<Either<A, C>, Either<B, D>> => ({
  step: (e) => {
    if (e.tag === "left") {
      const [bs, f2] = f.step(e.value);
      return [bs.map((b) => left<B, D>(b)), alternative(f2, g)];
    }
    const [ds, g2] = g.step(e.value);
    return [ds.map((d) => right<D, B>(d)), alternative(f, g2)];
  },
});

/** Merge two machines with the same output (crem `fanIn`, ArrowChoice `|||`). Models merge with per-source pipelines. */
export const either = <A, C, B>(f: Machine<A, B>, g: Machine<C, B>): Machine<Either<A, C>, B> =>
  rmapMachine((e: Either<B, B>) => e.value, alternative(f, g));

/** A stateless machine from a function returning zero or more outputs (Arrow `arr`, over lists). */
export const fromFunction = <A, B>(h: (a: A) => readonly B[]): Machine<A, B> => ({
  step: (a) => [h(a), fromFunction(h)],
});

/**
 * Feedback (crem `feedback`): every output of `f` is emitted and also fed to `g`;
 * every output of `g` is fed back into `f`, until `g` returns nothing.
 * The loop runs depth-first, which matches RxJS `expand` with synchronous inners.
 * `fuel` bounds the number of inner steps per input, so a loop without an exit
 * throws instead of hanging.
 */
export const feedback = <A, B>(f: Machine<A, B>, g: Machine<B, A>, fuel = 10_000): Machine<A, B> => ({
  step: (a) => {
    let f2 = f;
    let g2 = g;
    let budget = fuel;
    const out: B[] = [];
    const go = (x: A): void => {
      if (budget-- <= 0) throw new Error(`feedback: no exit within ${fuel} steps`);
      const [bs, fNext] = f2.step(x);
      f2 = fNext;
      for (const b of bs) {
        out.push(b);
        const [as, gNext] = g2.step(b);
        g2 = gNext;
        for (const back of as) go(back);
      }
    };
    go(a);
    return [out, feedback(f2, g2, fuel)];
  },
});

/** Compose any number of same-typed stages, like RxJS pipe for MonoTypeOperatorFunction. */
export const pipeMachines = <T>(...ms: readonly Machine<T, T>[]): Machine<T, T> =>
  ms.reduce<Machine<T, T>>((acc, m) => andThen(acc, m), idMachine<T>());
