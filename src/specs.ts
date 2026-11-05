// The operator registry: model, real operator and topology side by side.
import { distinctUntilChanged, filter, map, scan, take } from "rxjs";
import { distinctM, filterM, mapM, scanM, takeM, type OpState, type Phase, type DistinctState } from "./models";
import type { Spec, Topology } from "./topology";
import type { Note } from "./mealy";

export const protocolTopology: Topology<Phase> = {
  initial: "active",
  edges: { active: ["completed", "errored"], completed: [], errored: [] },
};

type DistinctPhase = "empty" | "seen" | "completed" | "errored";

export const distinctTopology: Topology<DistinctPhase> = {
  initial: "empty",
  edges: {
    empty: ["seen", "completed", "errored"],
    seen: ["completed", "errored"],
    completed: [],
    errored: [],
  },
};

const protocolPhase = <S>(s: OpState<S>): Phase => s.phase;

const distinctPhase = (s: OpState<DistinctState<number>>): DistinctPhase =>
  s.phase !== "active" ? s.phase : s.inner.seen ? "seen" : "empty";

// Fixed functions so the model and the real operator use the same ones.
export const double = (x: number) => x * 2;
export const isEven = (x: number) => x % 2 === 0;
export const sum = (r: number, x: number) => r + x;

export const entries = [
  {
    name: "map(x => x * 2)",
    model: mapM(double),
    operator: map(double),
    spec: { name: "map", model: mapM(double), phase: protocolPhase, topology: protocolTopology } as Spec<OpState<null>, Note<number>, Note<number>, Phase>,
  },
  {
    name: "filter(x => x % 2 === 0)",
    model: filterM(isEven),
    operator: filter(isEven),
    spec: { name: "filter", model: filterM(isEven), phase: protocolPhase, topology: protocolTopology } as Spec<OpState<null>, Note<number>, Note<number>, Phase>,
  },
  {
    name: "distinctUntilChanged()",
    model: distinctM<number>(),
    operator: distinctUntilChanged<number>(),
    spec: { name: "distinctUntilChanged", model: distinctM<number>(), phase: distinctPhase, topology: distinctTopology } as Spec<OpState<DistinctState<number>>, Note<number>, Note<number>, DistinctPhase>,
  },
  {
    name: "scan((r, x) => r + x, 0)",
    model: scanM(sum, 0),
    operator: scan(sum, 0),
    spec: { name: "scan", model: scanM(sum, 0), phase: protocolPhase, topology: protocolTopology } as Spec<OpState<number>, Note<number>, Note<number>, Phase>,
  },
  {
    name: "take(3)",
    model: takeM<number>(3),
    operator: take<number>(3),
    spec: { name: "take", model: takeM<number>(3), phase: protocolPhase, topology: protocolTopology } as Spec<OpState<number>, Note<number>, Note<number>, Phase>,
  },
] as const;
