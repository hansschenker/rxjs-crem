// Declared topology, after crem: the allowed phase transitions are data,
// so they can be checked against runs and rendered as a diagram.
import { states, type Mealy } from "./mealy";

export interface Topology<P extends string> {
  readonly initial: P;
  readonly edges: { readonly [K in P]: readonly P[] };
}

export interface Spec<S, I, O, P extends string> {
  readonly name: string;
  readonly model: Mealy<S, I, O>;
  readonly phase: (s: S) => P;
  readonly topology: Topology<P>;
}

export interface Violation {
  readonly step: number;
  readonly from: string;
  readonly to: string;
}

/**
 * Check every phase change in a run against the topology.
 * Steps that leave the phase unchanged are stuttering steps and always allowed,
 * as in TLA+.
 */
export const checkTopology = <S, I, O, P extends string>(
  spec: Spec<S, I, O, P>,
  inputs: readonly I[],
): Violation | null => {
  const phases = states(spec.model, inputs).map(spec.phase);
  if (phases[0] !== spec.topology.initial) return { step: 0, from: "(start)", to: phases[0] };
  for (let i = 1; i < phases.length; i++) {
    const from = phases[i - 1];
    const to = phases[i];
    if (from !== to && !spec.topology.edges[from].includes(to)) return { step: i, from, to };
  }
  return null;
};

/** Render a topology as a Mermaid state diagram. Phases without outgoing edges are final. */
export const toMermaid = <P extends string>(t: Topology<P>): string => {
  const entries = Object.entries(t.edges) as [P, readonly P[]][];
  const lines = ["stateDiagram-v2", `  [*] --> ${t.initial}`];
  for (const [from, tos] of entries) {
    for (const to of tos) lines.push(`  ${from} --> ${to}`);
    if (tos.length === 0) lines.push(`  ${from} --> [*]`);
  }
  return lines.join("\n");
};
