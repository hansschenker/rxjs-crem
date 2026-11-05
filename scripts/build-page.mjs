// Build dist/prototype.html: the source files, generated diagrams and TLA+,
// plus the bundled browser runner (npm run build:page first).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const read = (p) => readFileSync(p, "utf8");
const esc = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
const file = (path, open = false) =>
  `<details${open ? " open" : ""}><summary><code>${path}</code></summary><pre>${esc(read(path))}</pre></details>`;

const runner = read("dist/runner.js").replace(/<\/script/gi, "<\\/script");

const html = `<title>rxjs-crem Prototype</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;600;700&family=Fira+Code:wght@400;500&display=swap">
<style>
/* Layout: one column; live results first, then the three ideas, the TLA+ bridge and the source */
:root {
  --bg: #f5f6f4;
  --surface: #ffffff;
  --code-bg: #ecefea;
  --fg: #1c211d;
  --muted: #5a645c;
  --line: #d9ded7;
  --accent: #2f6b4f;
  --pass: #2f7d4a;
  --fail: #b3362f;
  --caught: #9a6a00;
  --body: "Public Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
  --mono: "Fira Code", ui-monospace, "SFMono-Regular", Menlo, monospace;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #131714; --surface: #1a1f1b; --code-bg: #222823; --fg: #e2e7e2; --muted: #98a39a;
    --line: #2c332d; --accent: #7cc5a0; --pass: #6fcf8d; --fail: #f08a82; --caught: #e6b84d; color-scheme: dark;
  }
}
:root[data-theme="dark"] {
  --bg: #131714; --surface: #1a1f1b; --code-bg: #222823; --fg: #e2e7e2; --muted: #98a39a;
  --line: #2c332d; --accent: #7cc5a0; --pass: #6fcf8d; --fail: #f08a82; --caught: #e6b84d; color-scheme: dark;
}
body { background: var(--bg); color: var(--fg); font-family: var(--body); font-size: 16px; line-height: 1.6; }
.wrap { max-width: 860px; margin: 0 auto; padding-block: 40px 64px;
  padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
.eyebrow { font-family: var(--mono); font-size: 12px; letter-spacing: .06em; text-transform: uppercase; color: var(--accent); }
h1 { font-weight: 700; font-size: clamp(30px, 6vw, 42px); line-height: 1.1; margin: 6px 0 10px; letter-spacing: -.01em; text-wrap: balance; }
h2 { font-weight: 700; font-size: 24px; margin: 0; text-wrap: balance; }
h3 { font-weight: 600; font-size: 16px; margin: 0; }
p { margin: 0; max-width: 68ch; }
.lede { color: var(--muted); font-size: 18px; }
header { display: grid; gap: 4px; padding-bottom: 24px; }
section { display: grid; gap: 14px; padding-block: 28px; border-top: 1px solid var(--line); }
code { font-family: var(--mono); font-size: .9em; }
p code, li code, td code { background: var(--code-bg); padding: 1px 5px; border-radius: 3px; }
pre { margin: 0; background: var(--code-bg); border-radius: 6px; padding: 14px 16px; overflow-x: auto; font-family: var(--mono); font-size: 13px; line-height: 1.55; }
a { color: var(--accent); }
.bar { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
#summary { font-family: var(--mono); font-size: 13px; color: var(--muted); }
button { font: 600 14px var(--body); color: var(--accent); background: transparent; border: 1px solid var(--accent); border-radius: 6px; padding: 6px 12px; cursor: pointer; }
button:hover { background: var(--code-bg); }
button:focus-visible, summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.group { display: grid; gap: 8px; }
.checks { list-style: none; margin: 0; padding: 0; display: grid; border: 1px solid var(--line); border-radius: 6px; background: var(--surface); }
.checks li { display: grid; grid-template-columns: 96px 1fr auto; gap: 4px 12px; align-items: baseline; padding: 9px 12px; border-top: 1px solid var(--line); }
.checks li:first-child { border-top: 0; }
.name { min-width: 0; }
.meta { font-family: var(--mono); font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }
.pill { font-family: var(--mono); font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: .05em; }
.pass .pill { color: var(--pass); } .fail .pill { color: var(--fail); } .caught .pill { color: var(--caught); }
.cx { grid-column: 2 / -1; display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; font-size: 13px; }
.cx span { color: var(--muted); font-family: var(--mono); font-size: 12px; }
.ideas { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; }
.idea { display: grid; gap: 6px; align-content: start; background: var(--surface); border: 1px solid var(--line); border-radius: 6px; padding: 14px 16px; }
.idea .from { font-family: var(--mono); font-size: 12px; color: var(--muted); }
.diagrams { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }
.diagram { display: grid; gap: 6px; min-width: 0; }
.diagram pre.mermaid { background: var(--surface); border: 1px solid var(--line); }
.tablewrap { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; min-width: 520px; font-size: 15px; }
th, td { text-align: left; vertical-align: top; padding: 9px 10px; border-bottom: 1px solid var(--line); }
th { font-weight: 600; }
details { border: 1px solid var(--line); border-radius: 6px; background: var(--surface); }
details > summary { cursor: pointer; padding: 10px 14px; }
details > pre { border-radius: 0 0 6px 6px; }
.files { display: grid; gap: 8px; }
.note { color: var(--muted); font-size: 15px; }
@media (max-width: 560px) { .checks li { grid-template-columns: 1fr; } .cx { grid-column: 1; } }
</style>

<div class="wrap">
  <header>
    <div class="eyebrow">Prototype · hansschenker/rxjs-crem</div>
    <h1>rxjs-crem Prototype</h1>
    <p class="lede">Three ideas from the Haskell library crem, carried over to RxJS as a specification layer: composition laws, Mealy models as oracles, and declared topologies that also generate TLA+.</p>
    <p class="note">Repository: <a href="https://github.com/hansschenker/rxjs-crem">github.com/hansschenker/rxjs-crem</a></p>
  </header>

  <section>
    <h2>Live checks against real RxJS</h2>
    <p>These run in your browser on page load, using the same TypeScript code as the test suite, bundled with RxJS 7.8.1. Each check gets up to 300 generated inputs. A failure is shrunk to a small counterexample, written as a marble: <code>1-0-0-|</code> means next 1, next 0, next 0, complete; <code>#</code> is an error.</p>
    <div class="bar"><button id="rerun" type="button">Run again with a new seed</button><span id="summary">Running checks…</span></div>
    <div id="results"></div>
  </section>

  <section>
    <h2>The three ideas</h2>
    <div class="ideas">
      <div class="idea"><span class="from">crem: Category, Profunctor</span><h3>Composition laws</h3><p>Identity, associativity and <code>map</code> fusion, checked on real <code>pipe</code>. One generic suite covers every operator.</p></div>
      <div class="idea"><span class="from">crem: explicit Mealy machines</span><h3>Mealy model as oracle</h3><p>A reference model of a few lines per operator. The real operator must produce the same notifications, and <code>compose</code> of models must equal <code>pipe</code>.</p></div>
      <div class="idea"><span class="from">crem: declared topology</span><h3>Topology as data</h3><p>Allowed phase transitions as a plain object. It drives a runtime check, a Mermaid diagram and a generated TLA+ module.</p></div>
    </div>
<pre>// The core type: explicit state, zero or more outputs per input
interface Mealy&lt;S, I, O&gt; {
  readonly initial: S;
  readonly step: (state: S, input: I) =&gt; readonly [S, readonly O[]];
}

// distinctUntilChanged as a model: the wrapper op() owns the protocol
const distinctM = &lt;A&gt;() =&gt;
  op&lt;DistinctState&lt;A&gt;, A, A&gt;({ seen: false }, (s, a) =&gt;
    s.seen &amp;&amp; s.last === a ? [s, []] : [{ seen: true, last: a }, [N(a)]]);

// The oracle check
matchesModel(distinctM&lt;number&gt;(), distinctUntilChanged&lt;number&gt;())</pre>
  </section>

  <section>
    <h2>One topology, three outputs</h2>
    <p>Each diagram below is generated from the same <code>Topology</code> object that the tests use to check every run, so they cannot drift apart.</p>
    <div class="diagrams">
      <div class="diagram"><h3>Observable protocol</h3><pre class="mermaid">${esc(read("generated/ProtocolPolicy.mmd"))}</pre></div>
      <div class="diagram"><h3>distinctUntilChanged policy</h3><pre class="mermaid">${esc(read("generated/DistinctPolicy.mmd"))}</pre></div>
    </div>
    <p>The same object generates this TLA+ module and its TLC configuration:</p>
    <pre>${esc(read("generated/DistinctPolicy.tla"))}</pre>
  </section>

  <section>
    <h2>Integration with TLA+</h2>
    <p>The two sides share one source of truth and check different things.</p>
    <div class="tablewrap"><table>
      <thead><tr><th>Connection</th><th>How</th><th>Status</th></tr></thead>
      <tbody>
        <tr><td>Topology → TLA+</td><td><code>toTla()</code> writes one action per declared edge, plus <code>TypeOK</code> and <code>FinalIsFinal</code></td><td>Implemented</td></tr>
        <tr><td>Law → lockstep product</td><td>Both sides of a law as Mealy machines in one TLA+ module, outputs equal as an invariant (<code>tla/DistinctIdempotent.tla</code>)</td><td>One example</td></tr>
        <tr><td>TLC trace → test input</td><td>A TLC counterexample (<code>-dumpTrace json</code>) mapped to <code>Note[]</code> and replayed in the differential tests</td><td>Next step</td></tr>
      </tbody>
    </table></div>
    <p class="note">The TLA+ files have not been model-checked yet. Run them with TLC or the TLA+ Toolbox; the commands are in the README.</p>
  </section>

  <section>
    <h2>Source</h2>
    <div class="files">
      ${file("src/mealy.ts", true)}
      ${file("src/models.ts")}
      ${file("src/topology.ts")}
      ${file("src/laws.ts")}
      ${file("src/tla.ts")}
      ${file("src/specs.ts")}
      ${file("src/buggy.ts")}
      ${file("test/prototype.test.ts")}
      ${file("tla/DistinctIdempotent.tla")}
    </div>
  </section>
</div>
<script>${runner}</script>
`;

mkdirSync("dist", { recursive: true });
writeFileSync("dist/prototype.html", html);
console.log("wrote dist/prototype.html", (html.length / 1024).toFixed(1), "KB");
