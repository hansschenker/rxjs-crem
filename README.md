# rxjs-crem

Ideas from the Haskell library [crem](https://github.com/marcosh/crem) (compositional Mealy machines), carried over to RxJS as a **specification layer**. RxJS stays the runtime. The Mealy models, laws and topologies define what the operators should do, and the tests check the real operators against them.

## The three ideas

| Idea | From crem | In this repo | File |
|---|---|---|---|
| Composition laws | `Category` (`id`, `.`), `Profunctor` (`lmap`, `rmap`) | Identity, associativity and `map` fusion checked on real RxJS `pipe` | `src/laws.ts` |
| Mealy model as oracle | Machines are explicit Mealy machines | Small reference model per operator; the real operator must produce the same notifications | `src/mealy.ts`, `src/models.ts` |
| Declared topology | Allowed transitions are declared and rendered | `Topology` objects drive a runtime check, Mermaid diagrams and generated TLA+ modules | `src/topology.ts`, `src/tla.ts` |
| Hidden state | `StateMachine input output` hides the state type | `Machine<I, O>` hides state in a closure, so composed machines keep a two-parameter type | `src/machine.ts` |

Operators covered: `map`, `filter`, `distinctUntilChanged`, `scan`, `take(n ≥ 1)`.

## How the pieces fit

```
Topology object ──► runtime check in tests (checkTopology)
       │
       ├──────────► Mermaid state diagram   (generated/*.mmd)
       │
       └──────────► TLA+ module + TLC cfg   (generated/*.tla, *.cfg)

Mealy model ─────► differential test against the real RxJS operator
       │
       └──────────► compose(model f, model g)  must equal  pipe(f, g)
```

## Run

```bash
npm install
npm test        # 37 property-based checks with fast-check
npm run typecheck
npm run gen     # writes generated/*.mmd, *.tla, *.cfg
```

To model-check the TLA+ files, open them in the TLA+ Toolbox or the VS Code TLA+ extension, or run TLC:

```bash
java -cp tla2tools.jar tlc2.TLC -config generated/DistinctPolicy.cfg generated/DistinctPolicy.tla
java -cp tla2tools.jar tlc2.TLC -config tla/DistinctIdempotent.cfg tla/DistinctIdempotent.tla
```

## Status

- The TypeScript checks run and pass (37 tests), including one that shows a deliberately buggy `distinctUntilChanged` (`src/buggy.ts`) being caught with a counterexample of at most four notifications.
- The TLA+ files in `generated/` and `tla/` have **not been model-checked yet**. Running TLC was not possible in the environment where the prototype was built.

## Further reading

- [crem on GitHub](https://github.com/marcosh/crem) and its guide [How to compose machines](https://github.com/marcosh/crem/blob/main/docs/how-to-compose-machines.md).
- [Talk on crem by its author, Marco Perone](https://www.youtube.com/watch?v=w8mnp4SGT_M&t=2246s) (video).
- `docs/ideas.md` — the design discussion behind this prototype: Mealy machines for operator policies, TLA+/LTL for pipelines, contracts per operator, and which crem ideas transfer.
- `docs/tla-integration.md` — how the TypeScript side and the TLA+ side connect.

## Contributors

- Hans Schenker
- Claude (Anthropic) — prototype design and implementation

## License

MIT
