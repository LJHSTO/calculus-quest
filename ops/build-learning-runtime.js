"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const zlib = require("node:zlib");


async function main() {
  const root = path.resolve(__dirname, "..");
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)]
    .filter(match => !match[1].startsWith("app/main/error-monitoring.js"))
    .map(match => ({ tag: match[0], file: match[1].split("?")[0] }));
  if (scripts.length < 20 || scripts.at(-1).file !== "app/main/bootstrap.js") throw new Error("Unexpected script order.");
  const esbuild = require("esbuild");
  const contents = scripts.map(script => fs.readFileSync(path.join(root, script.file), "utf8"));
  const code = (await esbuild.transform(contents.join("\n;\n"), {
    minifyWhitespace: true, minifySyntax: true, minifyIdentifiers: false,
    target: "es2022", legalComments: "inline"
  })).code;
  const bytes = Buffer.from(code);
  const digest = value => crypto.createHash("sha256").update(value).digest("hex");
  const styles = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)" \/>/g)]
    .map(match => ({ tag: match[0], file: match[1].split("?")[0] }));
  const styleBuild = await esbuild.build({
    absWorkingDir: root,
    stdin: { contents: styles.map(style => `@import "./${style.file}";`).join("\n"), loader: "css", resolveDir: root },
    bundle: true, minify: true, write: false, metafile: true,
    outfile: path.join(root, "assets/learning-runtime.css"),
    plugins: [{
      name: "preserve-relative-media",
      setup(build) {
        build.onResolve({ filter: /.*/ }, args => {
          if (args.kind !== "url-token" || /^(data:|https?:|#)/.test(args.path)) return;
          const asset = path.resolve(args.resolveDir, args.path.split(/[?#]/)[0]);
          if (!asset.startsWith(root + path.sep) || !fs.existsSync(asset)) throw new Error(`Invalid CSS asset: ${args.path}`);
          return { path: "../" + path.relative(root, asset).replaceAll(path.sep, "/")
            + args.path.slice(args.path.split(/[?#]/)[0].length), external: true };
        });
      }
    }]
  });
  const css = Buffer.from(styleBuild.outputFiles[0].contents);
  const icons = [...new Set([...html.matchAll(/src="(assets\/classroom-icons\/[^"]+\.svg)"/g)].map(match => match[1]))]
    .map(file => ({ file, sha256: digest(fs.readFileSync(path.join(root, file))) }));
  const manifest = {
    version: digest(bytes).slice(0, 20),
    indexSha256: digest(html),
    scripts: scripts.map((script, index) => ({ ...script, sha256: digest(contents[index]) })),
    styles,
    styleVersion: digest(css).slice(0, 20),
    styleSources: Object.keys(styleBuild.metafile.inputs).filter(file => file !== "<stdin>")
      .map(file => ({ file, sha256: digest(fs.readFileSync(path.join(root, file))) })),
    icons
  };
  fs.writeFileSync(path.join(root, "assets/learning-runtime.css"), css);
  fs.writeFileSync(path.join(root, "assets/learning-runtime.css.gz"), zlib.gzipSync(css, { level: 9 }));
  fs.writeFileSync(path.join(root, "assets/learning-runtime.js"), bytes);
  const compressed = zlib.gzipSync(bytes, { level: 9 });
  fs.writeFileSync(path.join(root, "assets/learning-runtime.js.gz"), compressed);
  fs.writeFileSync(path.join(root, "assets/learning-runtime.json"), JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify({ scripts: scripts.length, bytes: bytes.length, gzipBytes: compressed.length,
    styles: styles.length, cssGzipBytes: zlib.gzipSync(css).length, inlineIcons: icons.length }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
