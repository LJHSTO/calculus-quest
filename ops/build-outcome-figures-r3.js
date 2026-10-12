const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "resources", "assessment", "v14-c3-r3");
const colors = { ink: "#273c43", grid: "#dce5e8", teal: "#087e79", red: "#b33b55", gold: "#986600" };
const escape = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const line = (x1, y1, x2, y2, color = colors.ink, dash = "") =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="1.5"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;
const text = (x, y, value, color = colors.ink, anchor = "middle", size = 17, halo = false) =>
  `<text x="${x}" y="${y}" fill="${color}" text-anchor="${anchor}" font-size="${size}"${halo ? ' paint-order="stroke" stroke="#ffffff" stroke-width="4" stroke-linejoin="round"' : ""}>${escape(value)}</text>`;
const rect = (x, y, width, height, color, opacity = 0.15, dash = "") =>
  `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${color}" fill-opacity="${opacity}" stroke="${color}" stroke-width="1.5"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;

function svg(title, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="300" viewBox="0 0 640 300" role="img">
<title>${escape(title)}</title>
<rect width="640" height="300" fill="#ffffff"/>
<g font-family="Microsoft YaHei, Noto Sans CJK SC, sans-serif">${body}</g>
</svg>\n`;
}

function plot({ x, y, width, height, xmin, xmax, ymin, ymax }) {
  const X = (value) => x + (value - xmin) / (xmax - xmin) * width;
  const Y = (value) => y + height - (value - ymin) / (ymax - ymin) * height;
  const axes = (xs, ys) => {
    let body = "";
    for (const value of xs) {
      body += line(X(value), y, X(value), y + height, colors.grid);
    }
    for (const value of ys) {
      body += line(x, Y(value), x + width, Y(value), colors.grid);
    }
    return body + line(x, Y(0), x + width, Y(0)) + line(X(0), y, X(0), y + height);
  };
  const labels = (xs, ys) => xs.map((value) => text(X(value), Y(0) + 22, value,
    colors.ink, "middle", 17, true)).join("")
    + ys.filter((value) => value !== 0).map((value) => text(X(0) - 10, Y(value) + 5,
      value, colors.ink, "end", 17, true)).join("")
    + text(x + width + 13, Y(0) + 5, "x");
  const curve = (fn, color, start = xmin, end = xmax) => {
    const points = Array.from({ length: 161 }, (_, i) => {
      const value = start + (end - start) * i / 160;
      return `${X(value).toFixed(2)},${Y(fn(value)).toFixed(2)}`;
    }).join(" ");
    return `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="2.5"/>`;
  };
  return { X, Y, axes, labels, curve };
}

function accumulation() {
  const p = plot({ x: 70, y: 40, width: 490, height: 220, xmin: 0, xmax: 4, ymin: -1.5, ymax: 3.5 });
  return svg("连续函数 f 的图像", p.axes([0, 1, 2, 3, 4], [-1, 0, 1, 2, 3])
    + p.curve((x) => (x - 2) ** 2 - 1, colors.teal)
    + text(310, 25, "f(x)") + line(p.X(2), p.Y(0), p.X(2), p.Y(-1), colors.red, "5 4")
    + p.labels([0, 1, 2, 3, 4], [-1, 0, 1, 2, 3]));
}

function riemann() {
  let body = "";
  for (const [index, n] of [2, 4].entries()) {
    const p = plot({ x: 48 + index * 318, y: 50, width: 230, height: 180,
      xmin: 0, xmax: 2, ymin: 0, ymax: 4.5 });
    body += text(163 + index * 318, 25, `${n} 份`);
    const dx = 2 / n;
    let lower = 0;
    let upper = 0;
    for (let i = 0; i < n; i += 1) {
      const left = i * dx;
      const low = left ** 2;
      const high = (left + dx) ** 2;
      lower += low * dx;
      upper += high * dx;
      body += rect(p.X(left), p.Y(high), p.X(left + dx) - p.X(left),
        p.Y(0) - p.Y(high), colors.gold, 0.09, "5 3");
      body += rect(p.X(left), p.Y(low), p.X(left + dx) - p.X(left),
        p.Y(0) - p.Y(low), colors.teal, 0.17);
    }
    body += p.axes([0, 1, 2], [0, 2, 4]) + p.curve((x) => x ** 2, colors.ink);
    body += p.labels([0, 1, 2], [0, 2, 4]);
    body += text(163 + index * 318, 281, `下和 ${lower}    上和 ${upper}`);
  }
  return svg("两次分割的上下和矩形", body);
}

function product() {
  return svg("乘积求导的两项来源",
    text(320, 34, "乘积：x · cos(x)", colors.ink, "middle", 22)
    + line(260, 52, 155, 94) + line(380, 52, 485, 94)
    + text(155, 119, "第一因子求导") + text(485, 119, "第二因子求导")
    + text(155, 157, "1 · cos(x)", colors.teal, "middle", 24)
    + text(485, 157, "x · [−sin(x)]", colors.red, "middle", 24)
    + line(155, 175, 275, 216) + line(485, 175, 365, 216)
    + text(320, 250, "(x · cos(x))′ = cos(x) − x · sin(x)", colors.ink, "middle", 23));
}

function signedArea() {
  const p = plot({ x: 70, y: 40, width: 490, height: 215, xmin: 0, xmax: 5, ymin: -2.5, ymax: 3.5 });
  return svg("变化率函数 q 的两块几何面积",
    rect(p.X(0), p.Y(3), p.X(3) - p.X(0), p.Y(0) - p.Y(3), colors.teal)
    + rect(p.X(3), p.Y(0), p.X(5) - p.X(3), p.Y(-2) - p.Y(0), colors.red)
    + p.axes([0, 1, 2, 3, 4, 5], [-2, 0, 3])
    + line(p.X(0), p.Y(3), p.X(3), p.Y(3), colors.teal)
    + line(p.X(3), p.Y(-2), p.X(5), p.Y(-2), colors.red)
    + text(p.X(1.5), p.Y(1.5), "面积 9", colors.teal, "middle", 22)
    + text(p.X(4), p.Y(-1.2), "面积 4", colors.red, "middle", 22)
    + text(315, 25, "q(x)") + p.labels([0, 1, 2, 3, 4, 5], [-2, 0, 3]));
}

function family() {
  const p = plot({ x: 80, y: 45, width: 460, height: 215, xmin: -2, xmax: 2, ymin: -3, ymax: 10 });
  let body = p.axes([-2, -1, 0, 1, 2], [-2, 1, 5, 9]);
  for (const [offset, color] of [[-2, colors.teal], [1, colors.red], [5, colors.gold]]) {
    body += p.curve((x) => x * x + offset, color);
  }
  body += text(125, 25, "y=x²-2", colors.teal)
    + text(320, 25, "y=x²+1", colors.red) + text(515, 25, "y=x²+5", colors.gold);
  body += p.labels([-2, -1, 0, 1, 2], [-2, 1, 5, 9]);
  return svg("三条竖直平移的抛物线", body);
}

function build() {
  return {
    "累积变化率-r3.svg": accumulation(),
    "上下和细分-r3.svg": riemann(),
    "乘积求导关系-r3.svg": product(),
    "有向面积-r3.svg": signedArea(),
    "原函数族-r3.svg": family()
  };
}

if (require.main === module) {
  const check = process.argv.includes("--check");
  if (!check) fs.mkdirSync(output, { recursive: true });
  for (const [file, content] of Object.entries(build())) {
    const target = path.join(output, file);
    if (check) assert.equal(fs.readFileSync(target, "utf8"), content, `${file} 与生成器不一致`);
    else fs.writeFileSync(target, content, "utf8");
  }
  console.log(`独立测量数学图形${check ? "一致性检查" : "生成"}通过：5 幅。`);
}

module.exports = { build };
