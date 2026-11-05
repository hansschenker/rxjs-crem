// Reference models of RxJS operator policies as Mealy machines over notifications.
//
// Each model declares its topology once, as an `as const` object. That object is
// both a value (rendered to Mermaid and TLA+, checked at runtime) and, via its
// type, the type-level topology the compiler checks every transition against.
// This is crem's `Machine (topology :: Topology vertex) input output` in TypeScript.
import { C, E, type Mealy, type Note } from "./mealy";
import type { Topology } from "./topology";

// ---------------------------------------------------------------------------
// Type-level topology
// ---------------------------------------------------------------------------

export type Terminal = "completed" | "errored";

/** Allowed transitions: phase -> phases it may move to. */
export type Edges = { readonly [phase: string]: readonly string[] };

export type PhaseOf<E extends Edges> = keyof E & string;
export type LivePhase<E extends Edges> = Exclude<PhaseOf<E>, Terminal>;

/** From P a machine may stay in P (stuttering) or move along a declared edge. */
export type NextOf<E extends Edges, P extends PhaseOf<E>> = P | (E[P][number] & PhaseOf<E>);

/**
 * The protocol requirement on a topology: terminal phases have no outgoing edges,
 * and every live phase can reach both terminals (any input may complete or error).
 * A topology that breaks this rule fails to type-check where it is used.
 */
export type ProtocolEdges<E extends Edges> = {
  readonly [P in PhaseOf<E>]: P extends Terminal
    ? readonly []
    : "completed" extends E[P][number]
      ? "errored" extends E[P][number]
        ? E[P]
        : never
      : never;
};

export interface TypedState<E extends Edges, D> {
  readonly phase: PhaseOf<E>;
  readonly data: D;
}

/** One `next` handler per live phase; its return type only admits that phase's successors. */
export type NextHandlers<E extends Edges, D, A, B> = {
  readonly [P in LivePhase<E>]: (
    data: D,
    value: A,
  ) => readonly [{ readonly phase: NextOf<E, P>; readonly data: D }, readonly Note<B>[]];
};

export type OpModel<E extends Edges, D, A, B> = Mealy<TypedState<E, D>, Note<A>, Note<B>>;

/** The value-level topology for rendering and runtime checks, from the same object. */
export const topologyOf = <E extends Edges>(edges: E, initial: LivePhase<E>): Topology<PhaseOf<E>> => ({
  initial,
  edges: edges as unknown as Topology<PhaseOf<E>>["edges"],
});

/**
 * Build a typed operator model from its `next` handlers alone.
 * The wrapper owns the protocol: a `complete` or `error` input moves to the
 * terminal phase and passes through; in a terminal phase every input is ignored.
 */
export const op = <E extends Edges, D, A, B>(
  edges: E & ProtocolEdges<E>,
  initial: { readonly phase: LivePhase<E>; readonly data: D },
  handlers: NextHandlers<E, D, A, B>,
): OpModel<E, D, A, B> => ({
  initial,
  step: (st, n) => {
    if (st.phase === "completed" || st.phase === "errored") return [st, []];
    if (n.kind === "C") return [{ phase: "completed", data: st.data }, [C]];
    if (n.kind === "E") return [{ phase: "errored", data: st.data }, [E(n.error)]];
    const [next, out] = handlers[st.phase as LivePhase<E>](st.data, n.value);
    const terminal = out.find((o) => o.kind !== "N");
    const expected = !terminal ? undefined : terminal.kind === "C" ? "completed" : "errored";
    if (expected !== undefined && next.phase !== expected)
      throw new Error(`${String(st.phase)}: emitted ${terminal!.kind} but moved to ${String(next.phase)}`);
    return [next, out];
  },
});

// ---------------------------------------------------------------------------
// Topologies
// ---------------------------------------------------------------------------

/** next* (error | complete)? */
export const protocolEdges = {
  active: ["completed", "errored"],
  completed: [],
  errored: [],
} as const;

export const distinctEdges = {
  empty: ["seen", "completed", "errored"],
  seen: ["completed", "errored"],
  completed: [],
  errored: [],
} as const;

type Protocol = typeof protocolEdges;
type Distinct = typeof distinctEdges;

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

const N_ = <T>(value: T): Note<T> => ({ kind: "N", value });

export const mapM = <A, B>(f: (a: A) => B) =>
  op<Protocol, null, A, B>(protocolEdges, { phase: "active", data: null }, {
    active: (d, a) => [{ phase: "active", data: d }, [N_(f(a))]],
  });

export const filterM = <A>(p: (a: A) => boolean) =>
  op<Protocol, null, A, A>(protocolEdges, { phase: "active", data: null }, {
    active: (d, a) => [{ phase: "active", data: d }, p(a) ? [N_(a)] : []],
  });

export type DistinctData<A> = { readonly last: A } | null;

export const distinctM = <A>() =>
  op<Distinct, DistinctData<A>, A, A>(distinctEdges, { phase: "empty", data: null }, {
    empty: (_, a) => [{ phase: "seen", data: { last: a } }, [N_(a)]],
    seen: (d, a) =>
      d !== null && d.last === a
        ? [{ phase: "seen", data: d }, []]
        : [{ phase: "seen", data: { last: a } }, [N_(a)]],
  });

export const scanM = <A, R>(acc: (r: R, a: A) => R, seed: R) =>
  op<Protocol, R, A, R>(protocolEdges, { phase: "active", data: seed }, {
    active: (r, a) => {
      const next = acc(r, a);
      return [{ phase: "active", data: next }, [N_(next)]];
    },
  });

/** take(count) for count >= 1. take(0) completes before any input, which a Mealy machine cannot express. */
export const takeM = <A>(count: number) =>
  op<Protocol, number, A, A>(protocolEdges, { phase: "active", data: 0 }, {
    active: (k, a) => {
      const n = k + 1;
      return n >= count
        ? [{ phase: "completed", data: n }, [N_(a), C]]
        : [{ phase: "active", data: n }, [N_(a)]];
    },
  });
