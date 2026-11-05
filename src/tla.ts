// TLA+ bridge: the same Topology that drives the runtime check and the Mermaid
// diagram also generates a TLA+ module, so TLC checks the declared shape.
import type { Topology } from "./topology";

/**
 * Generate a TLA+ module from a topology.
 * - one variable `phase`
 * - one action per declared edge (self-loops become explicit stutter actions)
 * - `TypeOK` and `FinalIsFinal` (no step leaves a phase without outgoing edges)
 * - optional extra invariants, written as TLA+ expressions over `phase`
 */
export const toTla = <P extends string>(
  moduleName: string,
  t: Topology<P>,
  extraInvariants: Readonly<Record<string, string>> = {},
): string => {
  const phases = Object.keys(t.edges) as P[];
  const finals = phases.filter((p) => t.edges[p].length === 0);
  const actions: { name: string; from: P; to: P }[] = [];
  for (const from of phases)
    for (const to of t.edges[from]) actions.push({ name: `${cap(from)}To${cap(to)}`, from, to });

  const q = (p: string) => `"${p}"`;
  const lines = [
    `---- MODULE ${moduleName} ----`,
    `\\* Generated from a Topology object. Do not edit by hand.`,
    `VARIABLE phase`,
    ``,
    `Phases == {${phases.map(q).join(", ")}}`,
    ``,
    `Init == phase = ${q(t.initial)}`,
    ``,
    ...actions.map((a) => `${a.name} == phase = ${q(a.from)} /\\ phase' = ${q(a.to)}`),
    ``,
    `Next == ${actions.length ? actions.map((a) => a.name).join(" \\/ ") : "FALSE"}`,
    ``,
    `Spec == Init /\\ [][Next]_phase`,
    ``,
    `TypeOK == phase \\in Phases`,
    ``,
    finals.length
      ? `FinalIsFinal == [][phase \\in {${finals.map(q).join(", ")}} => UNCHANGED phase]_phase`
      : `FinalIsFinal == TRUE`,
    ...Object.entries(extraInvariants).flatMap(([name, expr]) => [``, `${name} == ${expr}`]),
    `====`,
  ];
  return lines.join("\n");
};

/** TLC model configuration matching the generated module. */
export const toTlaCfg = (extraInvariants: readonly string[] = []): string =>
  ["SPECIFICATION Spec", "INVARIANT TypeOK", ...extraInvariants.map((i) => `INVARIANT ${i}`), "PROPERTY FinalIsFinal"].join("\n");

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
