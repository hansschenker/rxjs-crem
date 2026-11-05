// The operator registry: model, real operator and topology side by side.
// Each topology comes from the same `as const` object the compiler checks the model against.
import { distinctUntilChanged, filter, map, scan, take } from "rxjs";
import {
  distinctEdges, distinctM, filterM, mapM, protocolEdges, scanM, takeM, topologyOf,
  type TypedState,
} from "./models";
import type { Spec } from "./topology";
import type { Note } from "./mealy";

export const protocolTopology = topologyOf(protocolEdges, "active");
export const distinctTopology = topologyOf(distinctEdges, "empty");

type ProtocolPhase = keyof typeof protocolEdges & string;
type DistinctPhase = keyof typeof distinctEdges & string;

const phase = <P extends string>(s: { readonly phase: P }): P => s.phase;

// Fixed functions so the model and the real operator use the same ones.
export const double = (x: number) => x * 2;
export const isEven = (x: number) => x % 2 === 0;
export const sum = (r: number, x: number) => r + x;

type ProtocolSpec<D> = Spec<TypedState<typeof protocolEdges, D>, Note<number>, Note<number>, ProtocolPhase>;

export const entries = [
  {
    name: "map(x => x * 2)",
    model: mapM(double),
    operator: map(double),
    spec: { name: "map", model: mapM(double), phase, topology: protocolTopology } as ProtocolSpec<null>,
  },
  {
    name: "filter(x => x % 2 === 0)",
    model: filterM(isEven),
    operator: filter(isEven),
    spec: { name: "filter", model: filterM(isEven), phase, topology: protocolTopology } as ProtocolSpec<null>,
  },
  {
    name: "distinctUntilChanged()",
    model: distinctM<number>(),
    operator: distinctUntilChanged<number>(),
    spec: { name: "distinctUntilChanged", model: distinctM<number>(), phase, topology: distinctTopology } as Spec<TypedState<typeof distinctEdges, unknown>, Note<number>, Note<number>, DistinctPhase>,
  },
  {
    name: "scan((r, x) => r + x, 0)",
    model: scanM(sum, 0),
    operator: scan(sum, 0),
    spec: { name: "scan", model: scanM(sum, 0), phase, topology: protocolTopology } as ProtocolSpec<number>,
  },
  {
    name: "take(3)",
    model: takeM<number>(3),
    operator: take<number>(3),
    spec: { name: "take", model: takeM<number>(3), phase, topology: protocolTopology } as ProtocolSpec<number>,
  },
] as const;
