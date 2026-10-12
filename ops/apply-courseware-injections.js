"use strict";

/**
 * Apply the three GENERIC platform injections to courseware HTML.
 *
 * Why this exists: the shipped V14-C1 courseware carries three content-independent
 * <script> blocks that the platform needs but that no generator in this repository
 * produces. They were frozen out of the shipped files into ops/courseware-injections/
 * (see that directory's manifest.json for the sha256 of each). Any newly generated
 * courseware must have them applied or it will not run on the site:
 *
 *   openmaic-storage-shim-v2
 *     The site embeds courseware in <iframe sandbox="allow-scripts ..."> with no
 *     allow-same-origin, so the frame is an opaque origin and touching
 *     localStorage/sessionStorage throws SecurityError.
 *   openmaic-audit-repair-shim-v5
 *   openmaic-courseware-layout-runtime-v52
 *
 * Placement mirrors the shipped files exactly:
 *   storage-shim      immediately after the opening <head> tag
 *   audit-repair      last-but-one script, immediately before </body>
 *   layout-runtime    last script, immediately before </body>
 *
 * The fourth injection, `openmaic-semantic-contract`, is NOT handled here: it is
 * per-scene and generated from route metadata by
 * ops/apply-v14-c3-semantic-contracts.js.
 *
 * Usage:
 *   node ops/apply-courseware-injections.js            # apply to resources/open-maic/**
 *   node ops/apply-courseware-injections.js --check     # report only, never write
 *   node ops/apply-courseware-injections.js <dir|file>  # restrict the target
 */

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const root = path.resolve(__dirname, "..");
const assetsDir = path.join(__dirname, "courseware-injections");
const checkOnly = process.argv.includes("--check");
const explicitTargets = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));

const manifestPath = path.join(assetsDir, "manifest.json");
assert.ok(fs.existsSync(manifestPath), `missing ${manifestPath}; run the freeze step first`);
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

const payloads = manifest.payloads.map((entry) => {
  const file = path.join(assetsDir, entry.file);
  assert.ok(fs.existsSync(file), `missing injection asset ${entry.file}`);
  const script = fs.readFileSync(file, "utf8").trimEnd();
  const digest = crypto.createHash("sha256").update(script).digest("hex");
  assert.equal(
    digest,
    entry.sha256,
    `${entry.file} does not match the frozen sha256 — re-freeze from a trusted source`
  );
  // The marker that tells us the injection is already present.
  const markerMatch = /<script[^>]*?(data-openmaic-storage-shim-v2|id="openmaic-audit-repair-shim-v5"|id="openmaic-courseware-layout-runtime-v52")/.exec(script);
  assert.ok(markerMatch, `${entry.file} has no recognisable marker`);
  return {
    label: entry.label,
    placement: entry.placement,
    script,
    marker: markerMatch[1],
    bytes: Buffer.byteLength(script, "utf8")
  };
});

const byLabel = Object.fromEntries(payloads.map((p) => [p.label, p]));
const storageShim = byLabel["openmaic-storage-shim-v2"];
const auditRepair = byLabel["openmaic-audit-repair-shim-v5"];
const layoutRuntime = byLabel["openmaic-courseware-layout-runtime-v52"];
for (const needed of [storageShim, auditRepair, layoutRuntime]) {
  assert.ok(needed, "a required injection is missing from the frozen manifest");
}

function collectTargets() {
  const roots = explicitTargets.length
    ? explicitTargets.map((target) => path.resolve(root, target))
    : [path.join(root, "resources", "open-maic")];
  const files = [];
  const walk = (target) => {
    if (!fs.existsSync(target)) return;
    const stat = fs.statSync(target);
    if (stat.isFile()) {
      if (target.toLowerCase().endsWith(".html")) files.push(target);
      return;
    }
    for (const name of fs.readdirSync(target)) walk(path.join(target, name));
  };
  roots.forEach(walk);
  return files.sort();
}

function injectAfterHead(source, script) {
  const match = /<head\b[^>]*>/i.exec(source);
  if (!match) return null;
  const at = match.index + match[0].length;
  return `${source.slice(0, at)}\n${script}${source.slice(at)}`;
}

function injectBeforeBodyEnd(source, scripts) {
  const block = scripts.join("\n");
  const at = source.search(/<\/body\s*>/i);
  if (at >= 0) return `${source.slice(0, at)}${block}\n${source.slice(at)}`;
  // No </body>: append, but only if the document is not obviously truncated.
  if (!/<\/html\s*>/i.test(source)) return null;
  const htmlAt = source.search(/<\/html\s*>/i);
  return `${source.slice(0, htmlAt)}${block}\n${source.slice(htmlAt)}`;
}

const targets = collectTargets();
assert.ok(targets.length > 0, "no courseware HTML found to process");

const summary = { scanned: 0, changed: 0, alreadyComplete: 0, skipped: 0, files: [] };

for (const file of targets) {
  const relative = path.relative(root, file).replaceAll("\\", "/");
  const source = fs.readFileSync(file, "utf8");
  const hasBom = source.charCodeAt(0) === 0xfeff;
  const body = hasBom ? source.slice(1) : source;
  const newline = body.includes("\r\n") ? "\r\n" : "\n";

  const missing = [];
  if (!body.includes(storageShim.marker)) missing.push(storageShim);
  if (!body.includes(auditRepair.marker)) missing.push(auditRepair);
  if (!body.includes(layoutRuntime.marker)) missing.push(layoutRuntime);

  summary.scanned += 1;
  if (!missing.length) {
    summary.alreadyComplete += 1;
    continue;
  }

  // The shipped files embed these blocks verbatim; normalise line endings so a
  // CRLF source does not end up with mixed endings.
  const normalise = (script) => (newline === "\r\n" ? script.replace(/\n/g, "\r\n") : script);

  let next = body;
  if (missing.includes(storageShim)) {
    const injected = injectAfterHead(next, normalise(storageShim.script));
    if (injected === null) {
      summary.skipped += 1;
      summary.files.push({ relative, action: "skipped", reason: "no <head> tag" });
      continue;
    }
    next = injected;
  }
  const trailing = [auditRepair, layoutRuntime]
    .filter((payload) => missing.includes(payload))
    .map((payload) => normalise(payload.script));
  if (trailing.length) {
    const injected = injectBeforeBodyEnd(next, trailing);
    if (injected === null) {
      summary.skipped += 1;
      summary.files.push({ relative, action: "skipped", reason: "no </body> or </html> tag" });
      continue;
    }
    next = injected;
  }

  const output = `${hasBom ? "\uFEFF" : ""}${next}`;
  summary.changed += 1;
  summary.files.push({
    relative,
    action: "injected",
    applied: missing.map((payload) => payload.label)
  });
  if (!checkOnly) fs.writeFileSync(file, output, "utf8");
}

const verb = checkOnly ? "would inject" : "injected";
console.log(`${checkOnly ? "CHECK" : "APPLY"} — scanned ${summary.scanned} courseware file(s)`);
for (const entry of summary.files) {
  if (entry.action === "injected") {
    console.log(`  ${verb}: ${entry.relative} [${entry.applied.join(", ")}]`);
  } else {
    console.log(`  SKIPPED: ${entry.relative} (${entry.reason})`);
  }
}
console.log(
  `summary: changed=${summary.changed} already-complete=${summary.alreadyComplete} skipped=${summary.skipped}`
);

if (checkOnly && summary.changed > 0) {
  console.log("\nRun without --check to apply.");
}
