"use strict";
const fs = require("node:fs");
const path = require("node:path");

function createCoursewareFontRewriter(root) {
  const directory = path.join(root, "lib", "fonts");
  const fonts = new Map(fs.readdirSync(directory)
    .filter(name => name.endsWith(".woff2"))
    .map(name => [`data:font/woff2;base64,${fs.readFileSync(path.join(directory, name)).toString("base64")}`, name]));
  return (html, filePath) => {
    const relative = path.relative(root, filePath).replaceAll(path.sep, "/");
    const prefix = path.posix.relative(path.posix.dirname(relative), "lib/fonts");
    return html.replace(/data:font\/woff2;base64,[A-Za-z0-9+/=]+/g, value => {
      const name = fonts.get(value);
      return name ? `${prefix}/${encodeURIComponent(name)}` : value;
    });
  };
}

module.exports = { createCoursewareFontRewriter };
