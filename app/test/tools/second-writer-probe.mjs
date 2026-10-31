// Measures the window the stale-file check cannot close: a hand edit landing
// between Apply's last look at the file and its rename. Runs N Applies on a
// throwaway config while a second process keeps hand-editing it, then prints how
// many Applies went through, how many were refused as stale, and how many
// acknowledged hand edits are missing at the end. Not part of npm test: slow,
// and the numbers depend on the machine. Exit code 1 if any edit was lost.
//
//   node app/test/tools/second-writer-probe.mjs [--n 60] [--writer-ms 250]

import { mkdtempSync, writeFileSync, readFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : Number(process.argv[i + 1]);
};
const N = arg("n", 60);
const WRITER_MS = arg("writer-ms", 250);

// Point the library at a throwaway copy before it is imported.
const sandbox = mkdtempSync(join(tmpdir(), "gcm-probe-"));
const config = join(sandbox, "config");
const ackLog = join(sandbox, "acked.log");
process.env.GHOSTTY_MGR_CONFIG = config;
process.env.GHOSTTY_MGR_STATE = join(sandbox, "state");
writeFileSync(config, "# probe config\nfont-size = 13\ncursor-style = bar\n");
writeFileSync(ackLog, "");

// Imported only now: the library reads these env values when it loads.
const { applyChanges, hashOf } = await import("../../lib/config-write.mjs");
const { ghosttyBin } = await import("../../lib/ghostty.mjs");
if (!ghosttyBin()) {
  console.error("Ghostty was not found, so Apply cannot validate. Nothing was run.");
  process.exit(2);
}

// The second writer: read, append a marker line, write in place, then log it.
const writerSource = `
  const fs = require("node:fs");
  let id = 0;
  setInterval(() => {
    try {
      const text = fs.readFileSync(${JSON.stringify(config)}, "utf8");
      const marker = "# hand-edit " + (++id);
      fs.writeFileSync(${JSON.stringify(config)}, text + marker + "\\n");
      fs.appendFileSync(${JSON.stringify(ackLog)}, marker + "\\n");
    } catch (e) { /* a read that raced a rename: try again next tick */ }
  }, ${WRITER_MS});
`;
const writer = spawn(process.execPath, ["-e", writerSource], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 100));

const tally = { applied: 0, refused: 0, other: 0 };
for (let i = 0; i < N; i++) {
  // What the page does: read the file, remember its hash, then Apply against it.
  const seen = readFileSync(config, "utf8");
  const res = applyChanges([{ key: "font-size", value: String(14 + (i % 7)) }], { baseHash: hashOf(seen) });
  if (res.ok) tally.applied++;
  else if (res.reason === "stale") tally.refused++;
  else tally.other++;
}

writer.kill();
await new Promise((r) => setTimeout(r, 100));

const acked = readFileSync(ackLog, "utf8").split("\n").filter(Boolean);
const final = readFileSync(config, "utf8");
const lost = acked.filter((m) => !final.split("\n").includes(m));

console.log(`Applies run:            ${N}`);
console.log(`  went through:         ${tally.applied}`);
console.log(`  refused as stale:     ${tally.refused}`);
console.log(`  failed another way:   ${tally.other}`);
console.log(`Hand edits acknowledged: ${acked.length}`);
console.log(`  lost from the file:   ${lost.length}`);
if (lost.length) console.log(`  first few lost:       ${lost.slice(0, 5).join(", ")}`);
console.log(`Writer interval ${WRITER_MS} ms. Sandbox: ${sandbox}`);
process.exit(lost.length ? 1 : 0);
