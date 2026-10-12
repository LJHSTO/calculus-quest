const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const zlib = require("node:zlib");
const { createRequire } = require("node:module");
const { execFileSync } = require("node:child_process");

async function main() {
  const root = path.resolve(__dirname, "..");
  const upstream = path.resolve(process.argv[2] || path.join(root, "../OpenMAIC-Upstream"));
  const source = path.join(upstream, "packages/@openmaic/renderer");
  const upstreamRequire = createRequire(path.join(upstream, "package.json"));
  const viteRequire = createRequire(createRequire(upstreamRequire.resolve("vitest/package.json")).resolve("vite"));
  const esbuild = viteRequire("esbuild");
  const postcss = upstreamRequire("postcss");
  const tailwind = upstreamRequire("@tailwindcss/postcss");
  const output = path.join(root, "assets/openmaic-classroom");
  fs.mkdirSync(output, { recursive: true });
  const highlighterResult = await esbuild.build({
    absWorkingDir: root,
    entryPoints: [path.join(root, "app/classroom-renderer/highlighter-entry.js")],
    outfile: path.join(output, "highlighter.js"),
    bundle: true, minify: true, format: "iife", platform: "browser",
    target: "es2022", legalComments: "linked", metafile: true,
    nodePaths: [path.join(upstream, "node_modules")]
  });
  const highlighterBytes = fs.readFileSync(path.join(output, "highlighter.js"));
  const highlighterVersion = crypto.createHash("sha256").update(highlighterBytes).digest("hex").slice(0, 20);
  fs.writeFileSync(path.join(output, "highlighter.js.gz"), zlib.gzipSync(highlighterBytes, { level: 9 }));
  const result = await esbuild.build({
    absWorkingDir: root,
    entryPoints: [path.join(root, "app/classroom-renderer/entry.jsx")],
    outfile: path.join(output, "renderer.js"),
    bundle: true, minify: true, format: "iife", platform: "browser",
    target: "es2022", legalComments: "linked", metafile: true,
    define: { "process.env.NODE_ENV": '"production"', __CQ_HIGHLIGHTER_VERSION__: JSON.stringify(highlighterVersion) },
    nodePaths: [path.join(upstream, "node_modules")],
    alias: {
      "@openmaic/renderer": path.join(source, "dist/index.js"),
      shiki: path.join(root, "app/classroom-renderer/lazy-highlighter.js")
    }
  });
  const css = `@import "tailwindcss/theme" layer(theme);\n@import "tailwindcss/utilities" layer(utilities);\n@source "${path.join(source, "dist").replaceAll("\\", "/")}";`;
  const compiled = await postcss([tailwind({ base: upstream, optimize: true })]).process(css, {
    from: path.join(upstream, "classroom-renderer.css"), to: path.join(output, "renderer.css")
  });
  fs.writeFileSync(path.join(output, "renderer.css"), compiled.css);
  fs.copyFileSync(path.join(source, "LICENSE"), path.join(output, "OpenMAIC-LICENSE"));
  const packages = new Map();
  const directoryCache = new Map();
  function owningPackage(directory) {
    if (directoryCache.has(directory)) return directoryCache.get(directory);
    const manifest = path.join(directory, "package.json");
    const parent = path.dirname(directory);
    const found = fs.existsSync(manifest) ? directory : parent !== directory ? owningPackage(parent) : null;
    directoryCache.set(directory, found);
    return found;
  }
  for (const input of new Set([...Object.keys(result.metafile.inputs), ...Object.keys(highlighterResult.metafile.inputs)])) {
    const directory = owningPackage(path.dirname(path.resolve(root, input)));
    if (!directory || directory === root) continue;
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, "package.json"), "utf8"));
    if (!manifest.name || !manifest.version) continue;
    const name = `${manifest.name}@${manifest.version}`;
    if (packages.has(name)) continue;
    const license = ["LICENSE", "LICENSE.md", "LICENSE.txt", "LICENCE", "LICENSE-MIT"].map((file) => path.join(directory, file))
      .find((file) => fs.existsSync(file) && fs.statSync(file).isFile());
    packages.set(name, license ? fs.readFileSync(license, "utf8") : `许可声明：${manifest.license || "请参见原包许可证及 renderer.js.LEGAL.txt"}`);
  }
  fs.writeFileSync(path.join(output, "第三方许可证.txt"), Array.from(packages).sort(([left], [right]) => left.localeCompare(right))
    .map(([name, license]) => `## ${name}\n\n${license}`).join("\n\n"));
  const bytes = fs.readFileSync(path.join(output, "renderer.js"));
  const compressed = zlib.gzipSync(bytes, { level: 9 });
  fs.writeFileSync(path.join(output, "renderer.js.gz"), compressed);
  const metadata = {
    upstreamCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: upstream, encoding: "utf8" }).trim(),
    rendererVersion: JSON.parse(fs.readFileSync(path.join(source, "package.json"), "utf8")).version,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    assetVersion: crypto.createHash("sha256").update(bytes).update(compiled.css).digest("hex").slice(0, 20),
    bytes: bytes.length,
    gzipBytes: compressed.length,
    inputCount: Object.keys(result.metafile.inputs).length,
    optionalHighlighter: { assetVersion: highlighterVersion, bytes: highlighterBytes.length }
  };
  const frameTemplate = fs.readFileSync(path.join(root, "app/classroom-renderer/frame.html"), "utf8");
  fs.writeFileSync(path.join(output, "frame.html"), frameTemplate.replaceAll("__RENDERER_VERSION__", metadata.assetVersion));
  fs.writeFileSync(path.join(output, "provenance.json"), JSON.stringify(metadata, null, 2) + "\n");
  console.log("OpenMAIC 渲染包构建完成", metadata);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
