"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const zlib = require("node:zlib");


async function main() {
  const root = path.resolve(__dirname, "..");
  const output = path.join(root, "assets/courseware-modules");
  fs.mkdirSync(output, { recursive: true });
  const digest = value => crypto.createHash("sha256").update(value).digest("hex");
  const chapter = require("../data/multi-scene-learning-route.json").chapters.find(item => item.id === "V14-C1");
  const modules = new Map();
  for (const module of chapter.modules) {
    for (const point of module.knowledgePoints) {
      for (const candidate of point.resourceCandidates) {
        const html = fs.readFileSync(path.join(root, "resources", candidate.root, candidate.file), "utf8");
        for (const match of html.matchAll(/<script type="importmap">([\s\S]*?)<\/script>/g)) {
          const imports = JSON.parse(match[1]).imports || {};
          for (const [name, value] of Object.entries(imports)) {
            if (!value.startsWith("data:text/javascript;base64,")) continue;
            const source = Buffer.from(value.slice(value.indexOf(",") + 1), "base64");
            const sourceHash = digest(source);
            if (modules.has(sourceHash)) continue;
            const code = (await require("esbuild").transform(source.toString("utf8"), {
              minify: true, format: "esm", target: "es2022", legalComments: "inline"
            })).code;
            const hash = digest(code);
            const label = path.posix.basename(name).replace(/\.js$/, "").replace(/[^a-zA-Z0-9-]/g, "-");
            const file = `${label}-${hash.slice(0, 16)}.js`;
            fs.writeFileSync(path.join(output, file), code);
            const compressed = zlib.gzipSync(code, { level: 9 });
            fs.writeFileSync(path.join(output, file + ".gz"), compressed);
            modules.set(sourceHash, { sourceHash, file, sha256: hash });
            console.log(JSON.stringify({ file, sourceBytes: source.length, gzipBytes: compressed.length }));
          }
        }
      }
    }
  }
  if (modules.size !== 2) throw new Error(`Unexpected shared 3D module count: ${modules.size}`);
  fs.writeFileSync(path.join(output, "manifest.json"), JSON.stringify([...modules.values()], null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
