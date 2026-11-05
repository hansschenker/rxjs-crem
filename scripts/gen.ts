// Generate diagrams and TLA+ modules from the topology objects.
import { mkdirSync, writeFileSync } from "node:fs";
import { toMermaid } from "../src/topology";
import { toTla, toTlaCfg } from "../src/tla";
import { distinctTopology, protocolTopology } from "../src/specs";

mkdirSync("generated", { recursive: true });

const targets = [
  { module: "ProtocolPolicy", topology: protocolTopology },
  { module: "DistinctPolicy", topology: distinctTopology },
] as const;

for (const { module, topology } of targets) {
  writeFileSync(`generated/${module}.mmd`, toMermaid(topology) + "\n");
  writeFileSync(`generated/${module}.tla`, toTla(module, topology as never) + "\n");
  writeFileSync(`generated/${module}.cfg`, toTlaCfg() + "\n");
}
console.log("generated:", targets.map((t) => t.module).join(", "));
