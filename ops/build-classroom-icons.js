const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");

// Export the same Lucide assets used by OpenMAIC; no React runtime in the platform.
const upstream = path.resolve(process.argv[2] || "../OpenMAIC-Upstream");
const upstreamRequire = createRequire(path.join(upstream, "package.json"));
const React = upstreamRequire("react");
const { renderToStaticMarkup } = upstreamRequire("react-dom/server");
const lucide = upstreamRequire("lucide-react");
const output = path.resolve(__dirname, "../assets/classroom-icons");
fs.mkdirSync(output, { recursive: true });
for (const name of ["PanelLeftClose", "PanelLeftOpen", "PanelRightClose", "PanelRightOpen", "Play", "Pause", "RotateCcw", "Quote", "NotebookPen", "Maximize", "Maximize2", "Minimize2", "Volume2"]) {
  fs.writeFileSync(path.join(output, `${name}.svg`),
    renderToStaticMarkup(React.createElement(lucide[name], { width: 20, height: 20, strokeWidth: 1.7 })));
}
fs.copyFileSync(path.join(upstream, "node_modules/lucide-react/LICENSE"), path.join(output, "LICENSE"));
console.log("已导出 OpenMAIC 使用的 Lucide 图标与许可证。");
