// Mealy machines with explicit state, after crem's StateMachine.
// A machine reads one input and returns the next state plus zero or more
// outputs, so it is a Mealy machine over O* (a sequential transducer).

/** One Observable notification, used as the input and output alphabet. */
export type Note<T> =
  | { readonly kind: "N"; readonly value: T }
  | { readonly kind: "C" }
  | { readonly kind: "E"; readonly error: unknown };

export const N = <T>(value: T): Note<T> => ({ kind: "N", value });
export const C: Note<never> = { kind: "C" };
export const E = (error: unknown): Note<never> => ({ kind: "E", error });

export interface Mealy<S, I, O> {
  readonly initial: S;
  readonly step: (state: S, input: I) => readonly [S, readonly O[]];
}

/** Run a machine over a finite input and collect all outputs. */
export const run = <S, I, O>(m: Mealy<S, I, O>, inputs: readonly I[]): O[] => {
  let state = m.initial;
  const out: O[] = [];
  for (const input of inputs) {
    const [next, os] = m.step(state, input);
    out.push(...os);
    state = next;
  }
  return out;
};

/** Run a machine and return the sequence of states, starting with the initial one. */
export const states = <S, I, O>(m: Mealy<S, I, O>, inputs: readonly I[]): S[] => {
  const seen: S[] = [m.initial];
  let state = m.initial;
  for (const input of inputs) {
    state = m.step(state, input)[0];
    seen.push(state);
  }
  return seen;
};

// ---------------------------------------------------------------------------
// Category: identity and sequential composition (crem's `id` and `(.)`)
// ---------------------------------------------------------------------------

export const identity = <I>(): Mealy<null, I, I> => ({
  initial: null,
  step: (s, i) => [s, [i]],
});

/** Serial composition: every output of `f` is fed through `g`. State is the pair. */
export const compose = <S1, S2, A, B, O>(
  f: Mealy<S1, A, B>,
  g: Mealy<S2, B, O>,
): Mealy<readonly [S1, S2], A, O> => ({
  initial: [f.initial, g.initial],
  step: ([s1, s2], a) => {
    const [s1Next, bs] = f.step(s1, a);
    let s2Next = s2;
    const os: O[] = [];
    for (const b of bs) {
      const [n, out] = g.step(s2Next, b);
      s2Next = n;
      os.push(...out);
    }
    return [[s1Next, s2Next], os];
  },
});

// ---------------------------------------------------------------------------
// Profunctor: pre- and post-composition with pure functions (lmap / rmap)
// ---------------------------------------------------------------------------

export const lmap = <S, I0, I, O>(f: (i: I0) => I, m: Mealy<S, I, O>): Mealy<S, I0, O> => ({
  initial: m.initial,
  step: (s, i) => m.step(s, f(i)),
});

export const rmap = <S, I, O, O2>(f: (o: O) => O2, m: Mealy<S, I, O>): Mealy<S, I, O2> => ({
  initial: m.initial,
  step: (s, i) => {
    const [next, os] = m.step(s, i);
    return [next, os.map(f)];
  },
});
