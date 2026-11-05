# Design notes: Mealy machines, TLA+ and crem for RxJS

These notes collect the ideas behind the prototype, from a discussion that started with a talk on developer skills in the age of AI agents and ended with crem.

## 1. Starting point: verification without reading all the code

When agents write the code, a human can no longer read all of it. Verification then needs a definition of correctness that is **independent** of the implementation, **readable**, and **executable**. Prose specifications leave too much open for an agent; formal specifications close the doors for execution. Intent still needs human judgment: a spec can be exact and still wrong.

## 2. The split: Mealy machines for operators, TLA+/LTL for pipelines

| Level | Describes | Tool | Kind |
|---|---|---|---|
| Operator | How one operator behaves (policy) | Mealy machine | Model, operational |
| Pipeline | What the composed stream guarantees | TLA+ / LTL | Property, declarative |

The relationship is **model and property**, `M ⊨ φ`, not a categorical duality. (The duality in this space is IEnumerable/IObservable, or product/coproduct as in crem's `Strong` and `Choice`.)

Why TLA+ fits Mealy machines: a TLA+ action relates the current and next state, and the output can be bound in the same step. That is a Mealy transition: `state' = δ(state, v)`, `out' = λ(state, v)`. TLA's stuttering invariance fits operators that suppress events (`filter`, `distinctUntilChanged`).

Operator laws become **lockstep products**: run both sides of `f ∘ g = h` on the same input and require equal outputs. See `tla/DistinctIdempotent.tla`.

## 3. Mealy machines compose

Serial composition of Mealy machines gives a Mealy machine whose state is the pair of states. Composition is associative with an identity, so Mealy machines form a **category**. For RxJS this is `pipe` and `identity`. Machines that emit zero or more outputs per input are Mealy machines over O* (sequential transducers); composition stays closed.

Other compositions:

- **Parallel, shared input** (crem `fanOut`, `&&&`): the product construction used for law checks.
- **Tagged input** (crem `fanIn`, `|||`): `Left(a) | Right(b)` for `merge`. Which side arrives next is a TLA+ question.
- **Feedback** (`expand`, `retry`, a Subject feeding its source): an instantaneous loop for Mealy machines; needs a delay or scheduler step.

The composed state space is the product of the parts. That is why the next point matters.

### Two forms: explicit state and hidden state

The Mealy type from Marco Perone's crem talk keeps the state as a type parameter:

```haskell
data Mealy state input output = Mealy
  { initialState :: state
  , action       :: state -> input -> (state, output)
  }
```

`Mealy<S, I, O>` in `src/mealy.ts` is the same, with a list of outputs per step. With a visible state type, composed types grow (`readonly [readonly [S1, S2], S3]`). For composition, crem hides the state existentially, so every machine has a two-parameter type and fits `Category` and `Arrow`.

`Machine<I, O>` in `src/machine.ts` does the same in TypeScript with a closure: `hide` turns a `Mealy<S, I, O>` into a `Machine<I, O>`, and `andThen` / `pipeMachines` compose without the state appearing in the type. Both forms stay:

- **explicit** `Mealy<S, I, O>` where something must look at the state (topology checks via `phase(s)`),
- **hidden** `Machine<I, O>` for composition and public signatures.

### Parallel composition and `both`

The talk's second combinator:

```haskell
parallel :: Mealy a b -> Mealy c d -> Mealy (a, c) (b, d)
```

Our machines can emit several outputs per step, so `parallel` pairs the output **lists**: `Machine<[A, C], [B[], D[]]>`. Each step then emits exactly one pair and nothing is dropped. Zipping outputs instead would lose values when the counts differ.

`both(f, g) = lmapMachine(a => [a, a], parallel(f, g))` is crem's `fanOut` (`&&&`). It is the lockstep product used for law checks: `both(dUC, andThen(dUC, dUC))` must give equal output lists on every step, the same check as `tla/DistinctIdempotent.tla`.

### Alternative composition and `either`

The talk's third combinator, with the output read as `Either b d`:

```haskell
alternative :: Mealy a b -> Mealy c d -> Mealy (Either a c) (Either b d)
```

Only the machine the input is tagged for steps; the other keeps its state. This is the coproduct twin of `parallel`'s product (crem `Choice` vs `Strong`).

`either(f, g) = rmapMachine(untag, alternative(f, g))` is crem's `fanIn` (`|||`) and models `merge(a$.pipe(f), c$.pipe(g))`: the tagged input sequence is the interleaving of the two sources, and each source keeps its own operator state. The test suite checks this against real RxJS `merge` on next values.

Edge case: `either` does not encode `merge`'s completion policy. `merge` completes once all sources have completed; `either` passes each side's `complete` straight through. That policy is a separate small machine (count completions, emit one `complete` at the end), and which source fires next is a TLA+ question.

### Feedback and `expand`

The talk's fourth combinator:

```haskell
feedback :: Mealy a [b] -> Mealy b [a] -> Mealy a [b]
```

Every output of the first machine is emitted and fed to the second; every output of the second is fed back into the first, until the second returns an empty list. The lists in the type are what make the loop well defined: the empty list is the exit. With exactly one output per step the loop could never stop, which is the instantaneous-loop problem of Mealy feedback.

With the first machine as identity and the second as `project`, this is RxJS `expand`. `feedback` runs the loop depth-first, which matches `expand` with synchronous inner Observables; the test suite checks this against real `expand`, including branching projections. Both machines keep their state across the loop and across inputs.

Edge case: a second machine that never returns an empty list loops forever. The TypeScript `feedback` takes a step budget (`fuel`) per input and throws when it runs out. With asynchronous inners, `expand`'s order depends on scheduling and is no longer this deterministic depth-first order; that belongs to the TLA+ layer.

`test/machine.test.ts` checks that hiding preserves behaviour, that `andThen` equals `compose`, the identity and associativity laws, and that `pipeMachines` agrees with RxJS `pipe`.

### Typed topology: crem's stronger machine type

The step towards "Representable" in crem puts the topology into the machine's type:

```haskell
data Machine (topology :: Topology vertex) input output
```

The compiler then enforces the allowed transitions, and the same topology can be reflected back to a value for diagrams and documentation.

In TypeScript, an `as const` object is a value and, through `typeof`, a type, so no singletons are needed. `op()` in `src/models.ts` takes the topology object and one `next` handler per live phase. Each handler's return type admits only that phase's declared successors (or staying put). The protocol is part of the type too: terminal phases have no outgoing edges, and every live phase must reach both `completed` and `errored`. The same object feeds `topologyOf` (runtime check), `toMermaid` and `toTla`.

`test/typed.test.ts` holds type-level tests: an undeclared transition, a live phase that cannot complete, a terminal phase with outgoing edges, and a missing handler each fail to compile, so `npm run typecheck` fails if any of them is ever accepted.

Edge case: this suits small enumerated phases. Value-dependent state stays in `data`, which the type does not constrain.

### Composition as data: left to RSL

crem represents composed machines as data, so they can be both executed and drawn. For rxjs-crem that layer would duplicate RSL (Reactive State Language), which already describes RxJS pipelines as data: one State per operator, `Next` as pipe order, plus `Choice`, `Retry`/`Catch` and sub-machines. So rxjs-crem stays at the operator level, and the composition level comes from RSL. See next steps.

## 4. What makes it scale: contracts per operator

Each operator's Mealy machine gets a contract **assumption about input ⇒ guarantee about output**, checked once, in isolation. Contracts chain by the assume–guarantee rule:

> If M₁ ⊨ A₁ ⇒ G₁, M₂ ⊨ A₂ ⇒ G₂, and G₁ ⇒ A₂, then M₁ ; M₂ ⊨ A₁ ⇒ G₂.

The link check `G₁ ⇒ A₂` compares formulas, not machines. Cost becomes a sum instead of a product, operators are verified once and reused, and a change re-checks only one operator and its links.

| Operator | Assumes | Guarantees |
|---|---|---|
| `filter(p)` | Protocol | Protocol, output is a subsequence of input |
| `map(f)` | Protocol | Protocol, same number of `next` events |
| `distinctUntilChanged()` | Protocol | Protocol, no two consecutive equal values |

Edge cases: contracts can be too weak (strengthen them, don't fall back to the product); end-to-end relations need transitive relations (≤, subsequence of); feedback loops need circular assume–guarantee rules; multiple inputs need one assumption per input.

## 5. crem ideas for RxJS

**Cheap, near one-to-one (implemented here):**

1. Category and Profunctor laws as property tests on real `pipe`.
2. The Mealy model as reference semantics and differential-test oracle.
3. Declared topology as data, rendered to diagrams and checked at runtime.

**Possible, with limits:** type-level transition checking in TypeScript (only for small enumerated states); `Choice` for multi-input operators (interleaving stays in TLA+).

**Not worth taking over:** Mealy machines as RxJS's runtime. They don't model subscription lifetime, teardown, schedulers, higher-order inner streams or multicasting.

## 6. What this gives

- A definition of correctness that is independent, readable and executable.
- A trustworthy check on agent-written operator code, with shrunk counterexamples that read like minimal marble diagrams.
- Diagrams that cannot drift from the specification.
- Lower cost per new operator, and a basis for classifying operators by behaviour (shared guarantees, shared topology shapes).

Limits: no coverage of time, teardown or higher-order behaviour yet; property tests sample inputs rather than prove; a wrong model passes everything, so models need human review — but they are short enough for that.

## 7. Next steps

**Main integration step: RSL ↔ rxjs-crem.**

- Map each RSL State to its operator's model here, `Next` to `andThen`, `Choice` to `alternative`, `Retry` to a `feedback`-shaped loop. The composed model becomes a test oracle for the RSL runtime, extending its differential test gate.
- Render the pipeline-level diagram from the RSL document, with each State linked to its operator's typed topology from this repo.

Further steps:

- Model-check the generated and hand-written TLA+ files with TLC.
- Add `exhaustMap` (`idle | busy` policy) as the first lifecycle operator.
- Add contracts as data next to each topology and generate the assume–guarantee link checks.
- Turn TLC counterexample traces into `Note[]` inputs for the differential tests.
