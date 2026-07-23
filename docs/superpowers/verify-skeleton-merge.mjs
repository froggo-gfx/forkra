// Differential verification harness for the skeleton file merge.
//
// It lives in docs/superpowers next to the plan it enforces
// (plans/2026-07-23-skeleton-file-merging-plan.md, §5) rather than in scripts/,
// on purpose: it is not part of the app build and has no home in the test
// suite — it is a throwaway gate for one refactor. Keeping it beside the plan
// means the plan and the thing that proves each of its phases are read and
// retired together. Delete both once the merge has landed.
//
// The merge is a pure relocation: no symbol may vanish, change shape, or change
// behaviour. Almost everything moving is a pure function, so behaviour can be
// pinned exactly without a DOM.
//
//   node docs/superpowers/verify-skeleton-merge.mjs snapshot <treeRoot> <out.json>
//   node docs/superpowers/verify-skeleton-merge.mjs compare  <before.json> <after.json> [allow.json]
//
// Typical use, per phase (run from the repo root):
//   node docs/superpowers/verify-skeleton-merge.mjs snapshot . /tmp/before.json   # once, before touching anything
//   ...do the phase...
//   node docs/superpowers/verify-skeleton-merge.mjs snapshot . /tmp/after.json
//   node docs/superpowers/verify-skeleton-merge.mjs compare  /tmp/before.json /tmp/after.json phase-4.1.allow.json
//
// The allow-list names ONLY the symbols that phase intends to change; any other
// divergence fails. An allow.json looks like:
//   { "deletedSymbols": ["..."], "changedBehavior": ["parseSkeletonPointKey"] }
//
// Proven to fire (negative controls, 2026-07-23): the strict-null 4.1 change
// surfaced 17/4480 behaviour divergences; un-exporting a symbol tripped the
// symbol-loss arm; the allow-list suppressed exactly the intended change.
//
// Snapshots are keyed by SYMBOL, never by file, so relocation is invisible to
// the diff and only real changes show up.

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const MODULES = [
  "src-js/fontra-core/src/skeleton-model.js",
  "src-js/fontra-core/src/skeleton-generator.js",
  "src-js/views-editor/src/skeleton-editing.js",
];

// ---------------------------------------------------------------- fixtures

// Literal, already-normalized skeleton data. Kept as literals rather than built
// through the tree's own constructors so the corpus is identical on both trees.
const OPEN = {
  nextId: 20,
  contours: [
    {
      id: 10,
      closed: false,
      defaultWidth: 80,
      points: [
        { id: 1, x: 0, y: 0, type: null, width: { left: 40, right: 40, linked: true } },
        { id: 2, x: 100, y: 40, type: "cubic" },
        { id: 3, x: 200, y: 40, type: "cubic" },
        {
          id: 4,
          x: 300,
          y: 0,
          type: null,
          width: { left: 25, right: 55, linked: false },
          handleOffsets: { leftOut: { x: 25, y: 40, detached: true } },
        },
      ],
    },
  ],
};

const CLOSED = {
  nextId: 30,
  contours: [
    {
      id: 20,
      closed: true,
      defaultWidth: 60,
      points: [
        { id: 1, x: 0, y: 0, type: null },
        { id: 2, x: 100, y: 0, type: "cubic" },
        { id: 3, x: 100, y: 100, type: "cubic" },
        { id: 4, x: 0, y: 100, type: null },
      ],
    },
  ],
};

const SINGLE = {
  nextId: 15,
  contours: [
    {
      id: 30,
      closed: false,
      singleSided: "left",
      defaultWidth: 50,
      points: [
        { id: 1, x: 0, y: 0, type: null },
        { id: 2, x: 80, y: 0, type: null },
      ],
    },
  ],
};

const EMPTY = { nextId: 1, contours: [] };

// A generic value pool. Positions are filled from this deterministically, so
// every function sees the same tuples on both trees.
const POOL = [
  OPEN,
  CLOSED,
  SINGLE,
  EMPTY,
  null,
  undefined,
  10,
  1,
  4,
  "10",
  "1",
  999,
  "left",
  "right",
  "bogus",
  "onCurve",
  "in",
  "out",
  0,
  40,
  -12.5,
  { x: 10, y: -5 },
  { x: 0, y: 0 },
  {},
  [],
  "skeletonPoint/10/1",
  "skeletonRib/10/1/left",
  "editableGeneratedPoint/10/1/left",
  "editableGeneratedHandle/10/1/left/out",
  true,
  false,
];

// Key-grammar cases: hand-written because this is exactly where the three
// families disagree (id type, malformed-input contract) and where the merge
// has to pick one. Every parse/make function sees all of them.
const KEY_CASES = [
  "skeletonPoint/10/1",
  "10/1",
  "skeletonRib/10/1/left",
  "10/1/left",
  "editableGeneratedPoint/10/1/left",
  "editableGeneratedHandle/10/1/left/out",
  "editableGeneratedHandle/10/1/left/onCurve",
  "skeletonPoint/10",
  "skeletonPoint/10/1/2",
  "skeletonPoint//1",
  "skeletonPoint/x/1",
  "skeletonPoint/-1/1",
  "skeletonPoint/1.5/1",
  "skeletonPoint/01/1",
  "skeletonRib/10/1/up",
  "skeletonRib/10/1",
  "",
  "/",
  null,
  undefined,
  0,
  10,
  {},
];

const KEY_FN = /^(make|parse).*(Key)$/;

// ------------------------------------------------------------ canonicalize

function canon(value, depth = 0, seen = new Set()) {
  if (depth > 6) return "<deep>";
  if (value === undefined) return "<undefined>";
  if (value === null) return null;
  const t = typeof value;
  if (t === "number") {
    if (Number.isNaN(value)) return "<NaN>";
    if (!Number.isFinite(value)) return value > 0 ? "<Inf>" : "<-Inf>";
    // Guard against last-bit float noise being read as a behaviour change.
    return Math.abs(value) < 1e-12 ? 0 : Number(value.toPrecision(12));
  }
  if (t === "string" || t === "boolean") return value;
  if (t === "function") return `<fn ${value.name}/${value.length}>`;
  if (t === "symbol" || t === "bigint") return String(value);
  if (seen.has(value)) return "<cycle>";
  seen = new Set(seen).add(value);
  if (Array.isArray(value)) return value.map((v) => canon(v, depth + 1, seen));
  if (value instanceof Set)
    return { "<Set>": [...value].map((v) => canon(v, depth + 1, seen)).sort(cmp) };
  if (value instanceof Map)
    return {
      "<Map>": [...value.entries()]
        .map(([k, v]) => [canon(k, depth + 1, seen), canon(v, depth + 1, seen)])
        .sort(cmp),
    };
  const out = {};
  for (const key of Object.keys(value).sort()) {
    out[key] = canon(value[key], depth + 1, seen);
  }
  return out;
}

const cmp = (a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1);

function callAndRecord(fn, args) {
  try {
    // Keep one function's mutations from contaminating the deterministic
    // corpus used by later symbols. Relocation changes module iteration order,
    // so sharing POOL object references would make a pure move look like a
    // behavior change.
    const callArgs = structuredClone(args);
    let result = fn(...callArgs);
    // Generators must be materialized or the snapshot pins nothing.
    if (
      result &&
      typeof result[Symbol.iterator] === "function" &&
      typeof result.next === "function"
    ) {
      const items = [];
      for (const item of result) {
        items.push(item);
        if (items.length > 40) break;
      }
      result = { "<generator>": items };
    }
    return { ok: canon(result) };
  } catch (err) {
    return { throw: `${err?.constructor?.name}: ${err?.message}` };
  }
}

// Deterministic tuple builder: same function name always yields the same
// argument tuples, on any tree.
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function tuplesFor(name, arity, count) {
  const n = Math.max(arity, 1);
  const tuples = [];
  let seed = hash(name);
  for (let i = 0; i < count; i++) {
    const args = [];
    for (let p = 0; p < n; p++) {
      seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
      args.push(POOL[seed % POOL.length]);
    }
    tuples.push(args);
  }
  return tuples;
}

// ---------------------------------------------------------------- snapshot

async function snapshot(treeRoot, outFile) {
  const symbols = {};
  const behavior = {};
  const missing = [];
  let calls = 0;
  let real = 0;

  for (const rel of MODULES) {
    const abs = resolve(treeRoot, rel);
    let ns;
    try {
      ns = await import(pathToFileURL(abs).href);
    } catch (err) {
      missing.push({
        module: rel,
        error: `${err?.constructor?.name}: ${err?.message}`,
      });
      continue;
    }
    for (const name of Object.keys(ns).sort()) {
      const value = ns[name];
      const kind = typeof value;
      const entry = { kind, module: rel };
      if (kind === "function") {
        entry.arity = value.length;
        entry.generator = value.constructor?.name === "GeneratorFunction";
      } else {
        entry.value = canon(value);
      }
      if (symbols[name]) {
        entry.alsoIn = [symbols[name].module];
      }
      symbols[name] = entry;

      if (kind !== "function") continue;

      const cases = [];
      if (KEY_FN.test(name)) {
        for (const key of KEY_CASES) cases.push([key]);
        // make* take positional ids; drive those too.
        if (name.startsWith("make")) {
          for (const t of tuplesFor(name, value.length, 24)) cases.push(t);
        }
      } else {
        for (const t of tuplesFor(name, value.length, 40)) cases.push(t);
      }

      behavior[name] = cases.map((args, i) => {
        const rec = callAndRecord(value, args);
        calls++;
        if (rec.ok !== undefined && rec.ok !== null && rec.ok !== "<undefined>") real++;
        return { i, args: canon(args), ...rec };
      });
    }
  }

  const graph = importGraph(treeRoot);

  const out = { symbols, behavior, graph, missing, stats: { calls, real } };
  writeFileSync(outFile, JSON.stringify(out, null, 1));
  console.log(
    `modules read      : ${MODULES.length - missing.length}/${MODULES.length}`
  );
  if (missing.length) {
    for (const m of missing) console.log(`  absent: ${m.module}`);
  }
  console.log(`symbols captured  : ${Object.keys(symbols).length}`);
  console.log(`behaviour cases   : ${calls}`);
  console.log(
    `  producing a real value: ${real} (${((100 * real) / calls).toFixed(1)}%) <- harness teeth`
  );
  console.log(`core->editor imports : ${graph.coreImportsEditor.length}`);
  console.log(`cycles               : ${graph.cycles.length}`);
  for (const c of graph.cycles) console.log(`  ${c}`);
  console.log(`written: ${outFile}`);
}

// ------------------------------------------------------------ import graph

function srcFiles(treeRoot) {
  const dirs = ["src-js/fontra-core/src", "src-js/views-editor/src"];
  const files = [];
  for (const dir of dirs) {
    let names;
    try {
      names = readdirSync(resolve(treeRoot, dir));
    } catch {
      continue;
    }
    for (const name of names) {
      if (name.endsWith(".js") || name.endsWith(".ts")) files.push(join(dir, name));
    }
  }
  return files;
}

function importGraph(treeRoot) {
  const edges = {};
  const coreImportsEditor = [];
  for (const rel of srcFiles(treeRoot)) {
    let text;
    try {
      text = readFileSync(resolve(treeRoot, rel), "utf8");
    } catch {
      continue;
    }
    const specs = [...text.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
    const isCore = rel.includes("fontra-core");
    const out = [];
    for (const spec of specs) {
      if (
        isCore &&
        (spec.includes("views-editor") || spec.startsWith("@fontra/views"))
      ) {
        coreImportsEditor.push(`${rel} -> ${spec}`);
      }
      // Resolve to a comparable node id for skeleton modules only.
      const m = spec.match(/([a-z-]*skeleton[a-z-]*)\.js$/);
      if (m) out.push(m[1]);
    }
    const self = rel.match(/([^/\\]+)\.js$/)?.[1];
    if (self) edges[self] = [...new Set(out)].filter((d) => d !== self);
  }

  // Cycle detection over the skeleton subgraph.
  const cycles = [];
  const state = {};
  const stack = [];
  const visit = (node) => {
    if (state[node] === 2) return;
    if (state[node] === 1) {
      cycles.push([...stack.slice(stack.indexOf(node)), node].join(" -> "));
      return;
    }
    state[node] = 1;
    stack.push(node);
    for (const next of edges[node] || []) visit(next);
    stack.pop();
    state[node] = 2;
  };
  for (const node of Object.keys(edges).sort()) visit(node);

  return { edges, coreImportsEditor, cycles: [...new Set(cycles)].sort() };
}

// ----------------------------------------------------------------- compare

function compare(beforeFile, afterFile, allowFile) {
  const before = JSON.parse(readFileSync(beforeFile, "utf8"));
  const after = JSON.parse(readFileSync(afterFile, "utf8"));
  const allow = allowFile
    ? JSON.parse(readFileSync(allowFile, "utf8"))
    : { deletedSymbols: [], changedBehavior: [] };

  const problems = [];
  const notes = [];

  for (const name of Object.keys(before.symbols)) {
    const b = before.symbols[name];
    const a = after.symbols[name];
    if (!a) {
      if (allow.deletedSymbols.includes(name)) {
        notes.push(`deleted (allowed): ${name}`);
      } else {
        problems.push(`SYMBOL LOST: ${name} (was in ${b.module})`);
      }
      continue;
    }
    if (a.kind !== b.kind)
      problems.push(`KIND CHANGED: ${name} ${b.kind} -> ${a.kind}`);
    if (b.kind === "function" && a.arity !== b.arity) {
      problems.push(
        `ARITY CHANGED: ${name} ${b.arity} -> ${a.arity} (signature edited?)`
      );
    }
    if (b.kind === "function" && a.generator !== b.generator) {
      problems.push(`GENERATOR-NESS CHANGED: ${name}`);
    }
    if (b.module !== a.module) notes.push(`moved: ${name}  ${b.module} -> ${a.module}`);
  }
  for (const name of Object.keys(after.symbols)) {
    if (!before.symbols[name])
      notes.push(`new symbol: ${name} (${after.symbols[name].module})`);
  }

  let compared = 0;
  let diverged = 0;
  for (const name of Object.keys(before.behavior)) {
    const b = before.behavior[name];
    const a = after.behavior[name];
    if (!a) continue;
    for (let i = 0; i < b.length; i++) {
      if (!a[i]) continue;
      compared++;
      const bs = JSON.stringify({ ok: b[i].ok, throw: b[i].throw });
      const as = JSON.stringify({ ok: a[i].ok, throw: a[i].throw });
      if (bs === as) continue;
      diverged++;
      const line = `BEHAVIOUR CHANGED: ${name} case ${i}\n    args   ${JSON.stringify(b[i].args)}\n    before ${bs}\n    after  ${as}`;
      if (allow.changedBehavior.includes(name)) notes.push(`(allowed) ${line}`);
      else problems.push(line);
    }
  }

  const newCoreEditor = after.graph.coreImportsEditor;
  if (newCoreEditor.length > before.graph.coreImportsEditor.length) {
    problems.push(`CORE NOW IMPORTS EDITOR:\n    ${newCoreEditor.join("\n    ")}`);
  }
  const newCycles = after.graph.cycles.filter((c) => !before.graph.cycles.includes(c));
  if (newCycles.length)
    problems.push(`NEW IMPORT CYCLE:\n    ${newCycles.join("\n    ")}`);
  const goneCycles = before.graph.cycles.filter((c) => !after.graph.cycles.includes(c));
  for (const c of goneCycles) notes.push(`cycle dissolved: ${c}`);

  console.log(`behaviour cases compared: ${compared}, diverged: ${diverged}`);
  console.log(`notes (${notes.length}):`);
  for (const n of notes) console.log(`  - ${n}`);
  console.log("");
  if (problems.length) {
    console.log(`FAIL - ${problems.length} problem(s):`);
    for (const p of problems) console.log(`  * ${p}`);
    process.exitCode = 1;
  } else {
    console.log("PASS - no symbol lost, no signature changed, no behaviour changed,");
    console.log("       no new core->editor import, no new cycle.");
  }
}

// -------------------------------------------------------------------- main

const [mode, ...rest] = process.argv.slice(2);
if (mode === "snapshot") await snapshot(rest[0], rest[1]);
else if (mode === "compare") compare(rest[0], rest[1], rest[2]);
else {
  console.error(
    "usage: snapshot <treeRoot> <out.json> | compare <before> <after> [allow]"
  );
  process.exitCode = 2;
}
