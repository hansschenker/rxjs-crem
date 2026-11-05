// Reference models of RxJS operator policies as Mealy machines over notifications.
import { C, E, N, type Mealy, type Note } from "./mealy";

/** Protocol phase: next* (error | complete)? */
export type Phase = "active" | "completed" | "errored";

export interface OpState<S> {
  readonly phase: Phase;
  readonly inner: S;
}

export type OpModel<S, A, B> = Mealy<OpState<S>, Note<A>, Note<B>>;

/**
 * Build an operator model from its `next` policy alone.
 * The wrapper owns the protocol: terminal inputs pass through,
 * and after a terminal output the machine ignores everything.
 */
export const op = <S, A, B>(
  initial: S,
  onNext: (s: S, a: A) => readonly [S, readonly Note<B>[]],
): OpModel<S, A, B> => ({
  initial: { phase: "active", inner: initial },
  step: (st, n) => {
    if (st.phase !== "active") return [st, []];
    if (n.kind === "C") return [{ ...st, phase: "completed" }, [C]];
    if (n.kind === "E") return [{ ...st, phase: "errored" }, [E(n.error)]];
    const [inner, out] = onNext(st.inner, n.value);
    const terminal = out.find((o) => o.kind !== "N");
    const phase: Phase = !terminal ? "active" : terminal.kind === "C" ? "completed" : "errored";
    return [{ phase, inner }, out];
  },
});

export const mapM = <A, B>(f: (a: A) => B) =>
  op<null, A, B>(null, (s, a) => [s, [N(f(a))]]);

export const filterM = <A>(p: (a: A) => boolean) =>
  op<null, A, A>(null, (s, a) => [s, p(a) ? [N(a)] : []]);

export type DistinctState<A> = { readonly seen: false } | { readonly seen: true; readonly last: A };

export const distinctM = <A>() =>
  op<DistinctState<A>, A, A>({ seen: false }, (s, a) =>
    s.seen && s.last === a ? [s, []] : [{ seen: true, last: a }, [N(a)]],
  );

export const scanM = <A, R>(acc: (r: R, a: A) => R, seed: R) =>
  op<R, A, R>(seed, (r, a) => {
    const next = acc(r, a);
    return [next, [N(next)]];
  });

/** take(count) for count >= 1. take(0) completes before any input, which a Mealy machine cannot express. */
export const takeM = <A>(count: number) =>
  op<number, A, A>(0, (k, a) => {
    const n = k + 1;
    return [n, n >= count ? [N(a), C] : [N(a)]];
  });
