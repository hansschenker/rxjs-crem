// Type-level tests: the lines marked @ts-expect-error must NOT compile.
// `npm run typecheck` fails if any of them compiles, so these are real checks.
import { describe, expect, it } from "vitest";
import { C, N, run } from "../src/mealy";
import { distinctEdges, op, protocolEdges, type Edges } from "../src/models";
import { toMermaid } from "../src/topology";
import { toTla } from "../src/tla";
import { distinctTopology } from "../src/specs";

type Distinct = typeof distinctEdges;

describe("typed topology", () => {
  it("rejects a transition the topology does not declare", () => {
    const broken = () =>
      op<Distinct, number | null, number, number>(distinctEdges, { phase: "empty", data: null }, {
        empty: (_, a) => [{ phase: "seen", data: a }, [N(a)]],
        // @ts-expect-error seen -> empty is not a declared edge
        seen: (_, a) => [{ phase: "empty", data: a }, []],
      });
    expect(typeof broken).toBe("function");
  });

  it("rejects a topology where a live phase cannot complete", () => {
    const noComplete = { active: ["errored"], completed: [], errored: [] } as const;
    const broken = () =>
      op<typeof noComplete, null, number, number>(
        // @ts-expect-error active must be able to reach "completed"
        noComplete,
        { phase: "active", data: null },
        { active: (d, a) => [{ phase: "active", data: d }, [N(a)]] },
      );
    expect(typeof broken).toBe("function");
  });

  it("rejects a terminal phase with outgoing edges", () => {
    const leaky = { active: ["completed", "errored"], completed: ["active"], errored: [] } as const;
    const broken = () =>
      op<typeof leaky, null, number, number>(
        // @ts-expect-error terminal phases must have no outgoing edges
        leaky,
        { phase: "active", data: null },
        { active: (d, a) => [{ phase: "active", data: d }, [N(a)]] },
      );
    expect(typeof broken).toBe("function");
  });

  it("requires a handler for every live phase", () => {
    const broken = () =>
      // @ts-expect-error missing handler for "seen"
      op<Distinct, null, number, number>(distinctEdges, { phase: "empty", data: null }, {
        empty: (d, a) => [{ phase: "seen", data: d }, [N(a)]],
      });
    expect(typeof broken).toBe("function");
  });

  it("throws if a handler emits complete without moving to completed", () => {
    const inconsistent = op<typeof protocolEdges, null, number, number>(protocolEdges, { phase: "active", data: null }, {
      active: (d, a) => [{ phase: "active", data: d }, [N(a), C]],
    });
    expect(() => run(inconsistent, [N(1)])).toThrow(/emitted C/);
  });

  it("the same object drives Mermaid and TLA+", () => {
    const edges: Edges = distinctEdges;
    expect(Object.keys(edges)).toEqual(["empty", "seen", "completed", "errored"]);
    expect(toMermaid(distinctTopology)).toContain("empty --> seen");
    expect(toTla("DistinctPolicy", distinctTopology)).toContain(`EmptyToSeen == phase = "empty" /\\ phase' = "seen"`);
  });
});
