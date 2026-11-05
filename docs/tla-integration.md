# Integrating with TLA+

The TypeScript side and the TLA+ side share one source of truth and check different things.

| | TypeScript (this repo) | TLA+ |
|---|---|---|
| Checks | The real RxJS operator against its Mealy model, on generated inputs | The declared design, on all reachable states |
| Strength | Catches implementation bugs | Catches design bugs, including liveness |
| Coverage | Sampled (fast-check) | Exhaustive within the model's bounds |

## Three connection points

### 1. Topology → TLA+ module (implemented)

`toTla(moduleName, topology)` in `src/tla.ts` generates a module with:

- one variable `phase`,
- one action per declared edge, for example `EmptyToSeen == phase = "empty" /\ phase' = "seen"`,
- `TypeOK` and `FinalIsFinal` (no step leaves a phase with no outgoing edges),
- optional extra invariants passed in as TLA+ expressions.

`toTlaCfg()` writes the matching TLC configuration. `npm run gen` writes both for every topology into `generated/`.

The same `Topology` object also drives `checkTopology` in the tests and `toMermaid` for diagrams, so the diagram, the runtime check and the model-checked spec cannot disagree.

### 2. Laws → lockstep products (one example)

An operator law becomes two Mealy machines run in lockstep with an equality invariant. `tla/DistinctIdempotent.tla` checks `distinctUntilChanged ∘ distinctUntilChanged = distinctUntilChanged` this way. The same law is checked against real RxJS by the property tests.

### 3. TLC traces → test inputs (next step)

A TLC counterexample is a concrete sequence of steps. Mapped to `Note<T>[]`, it becomes a regression input for the differential tests, so a design bug found by TLC is also pinned as an implementation test. TLC can write traces as JSON (`-dumpTrace json <file>`), which makes this a small adapter.

## Where each check belongs

- **Single-operator policy:** Mealy model + differential test (TypeScript).
- **Shape of the policy:** topology → runtime check + TLA+ module.
- **Pipeline properties and multi-input interleaving:** TLA+ / LTL, with contracts per operator chained by assume–guarantee.
- **Liveness** ("eventually completes"): TLA+ only, with fairness conditions.

## Status

The generated modules and `tla/DistinctIdempotent.tla` have not yet been run through TLC.
