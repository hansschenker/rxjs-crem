// Browser runner for the prototype page: runs the same checks as the test
// suite against real RxJS, with a small seeded generator and shrinking.
import { filter, scan, take } from "rxjs";
import { C, E, N, type Note } from "../src/mealy";
import { distinctM } from "../src/models";
import {
  associativity, leftIdentity, mapFusion, matchesModel, pipeMatchesCompose,
  preservesProtocol, rightIdentity, runRx,
} from "../src/laws";
import { run } from "../src/mealy";
import { checkTopology } from "../src/topology";
import { entries, double, isEven, sum } from "../src/specs";
import { buggyDistinct } from "../src/buggy";

type Check = (ns: Note<number>[]) => boolean;
interface Row {
  group: string;
  name: string;
  check: Check;
  explain?: (ns: Note<number>[]) => { expected: string; actual: string };
  expectFail?: boolean;
}

const BOOM = new Error("boom");
const RUNS = 300;

let seed = 20261105;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const gen = (): Note<number>[] => {
  const xs = Array.from({ length: Math.floor(rnd() * 9) }, () => N(Math.floor(rnd() * 4)));
  const end = rnd();
  return end < 1 / 3 ? xs : end < 2 / 3 ? [...xs, C] : [...xs, E(BOOM)];
};

/** Shrink a failing input: delete notifications, then lower values, while it still fails. */
const shrink = (input: Note<number>[], check: Check): Note<number>[] => {
  let cur = input;
  for (let improved = true; improved; ) {
    improved = false;
    for (let i = 0; i < cur.length && !improved; i++) {
      const cand = [...cur.slice(0, i), ...cur.slice(i + 1)];
      if (!check(cand)) { cur = cand; improved = true; }
    }
    for (let i = 0; i < cur.length && !improved; i++) {
      const n = cur[i];
      if (n.kind === "N" && n.value > 0) {
        const cand = cur.map((x, j) => (j === i ? N(n.value - 1) : x));
        if (!check(cand)) { cur = cand; improved = true; }
      }
    }
  }
  return cur;
};

export const marble = (ns: readonly Note<number>[]): string =>
  ns.length === 0 ? "(nothing)" : ns.map((n) => (n.kind === "N" ? String(n.value) : n.kind === "C" ? "|" : "#")).join("-");

const rows: Row[] = [
  ...entries.map((e): Row => ({
    group: "Mealy oracle",
    name: `${e.name} matches its model`,
    check: matchesModel(e.model as never, e.operator as never),
  })),
  {
    group: "Mealy oracle",
    name: "pipe(filter, distinctUntilChanged) = compose of the models",
    check: pipeMatchesCompose(entries[1].model as never, entries[1].operator as never, entries[2].model as never, entries[2].operator as never),
  },
  ...entries.flatMap((e): Row[] => [
    { group: "Composition laws", name: `left identity · ${e.name}`, check: leftIdentity(e.operator as never) },
    { group: "Composition laws", name: `right identity · ${e.name}`, check: rightIdentity(e.operator as never) },
    { group: "Composition laws", name: `preserves protocol · ${e.name}`, check: preservesProtocol(e.operator as never) },
  ]),
  { group: "Composition laws", name: "associativity · filter, scan, take(3)", check: associativity(filter(isEven), scan(sum, 0), take<number>(3)) },
  { group: "Composition laws", name: "map fusion after scan", check: mapFusion(scan(sum, 0), double, (x: number) => x + 1) },
  ...entries.map((e): Row => ({
    group: "Declared topology",
    name: `runs stay inside the topology · ${e.name}`,
    check: (ns) => checkTopology(e.spec as never, ns) === null,
  })),
  {
    group: "Buggy operator",
    name: "buggyDistinct (compares with the first value) against the model",
    check: matchesModel(distinctM<number>(), buggyDistinct<number>()),
    explain: (ns) => ({ expected: marble(run(distinctM<number>(), ns)), actual: marble(runRx(buggyDistinct<number>(), ns)) }),
    expectFail: true,
  },
];

export interface Result {
  group: string;
  name: string;
  ok: boolean;
  expectFail: boolean;
  runs: number;
  counterexample?: string;
  expected?: string;
  actual?: string;
}

export const runAll = (): Result[] =>
  rows.map((r) => {
    for (let i = 0; i < RUNS; i++) {
      const input = gen();
      if (!r.check(input)) {
        const small = shrink(input, r.check);
        const ex = r.explain?.(small);
        return { group: r.group, name: r.name, ok: false, expectFail: !!r.expectFail, runs: i + 1, counterexample: marble(small), expected: ex?.expected, actual: ex?.actual };
      }
    }
    return { group: r.group, name: r.name, ok: true, expectFail: !!r.expectFail, runs: RUNS };
  });

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const render = () => {
  const host = document.getElementById("results");
  const summary = document.getElementById("summary");
  if (!host || !summary) return;
  const t0 = performance.now();
  const results = runAll();
  const ms = Math.round(performance.now() - t0);
  const asExpected = results.filter((r) => r.ok !== r.expectFail).length;
  summary.textContent = `${asExpected} of ${results.length} checks behaved as expected · ${results.length * RUNS} generated inputs max · ${ms} ms`;
  const groups = [...new Set(results.map((r) => r.group))];
  host.innerHTML = groups
    .map((g) => `
      <div class="group">
        <h3>${esc(g)}</h3>
        <ul class="checks">${results.filter((r) => r.group === g).map((r) => {
          const state = r.ok ? "pass" : r.expectFail ? "caught" : "fail";
          const label = r.ok ? "holds" : r.expectFail ? "bug caught" : "fails";
          const detail = r.ok
            ? `<span class="meta">${r.runs} inputs</span>`
            : `<span class="meta">after ${r.runs} inputs</span>
               <div class="cx"><span>input</span><code>${esc(r.counterexample ?? "")}</code>
               ${r.expected !== undefined ? `<span>model</span><code>${esc(r.expected)}</code><span>operator</span><code>${esc(r.actual ?? "")}</code>` : ""}</div>`;
          return `<li class="${state}"><span class="pill">${label}</span><span class="name">${esc(r.name)}</span>${detail}</li>`;
        }).join("")}</ul>
      </div>`)
    .join("");
};

const button = document.getElementById("rerun");
button?.addEventListener("click", () => { seed = Math.floor(Math.random() * 1e9); render(); });
render();
