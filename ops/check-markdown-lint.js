"use strict";

const fs = require("fs");
const path = require("path");

const files = fs.readdirSync("docs")
  .filter(f => f.endsWith(".md"))
  .map(f => path.join("docs", f));

console.log("Analyzing " + files.length + " markdown files in docs/...\n");

files.forEach(file => {
  const content = fs.readFileSync(file, "utf8");
  const lines = content.split(/\r?\n/);
  let inCode = false;
  let codeFenceCount = 0;
  let currentTable = null;
  const issues = [];

  // Check encoding: check BOM or invalid characters
  if (content.charCodeAt(0) === 0xFEFF) {
    issues.push({ lineNum: 1, type: "Encoding Notice", detail: "File starts with UTF-8 BOM" });
  }

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      inCode = !inCode;
      codeFenceCount++;
      return;
    }
    if (inCode) return;

    // Check table structure
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      const cells = trimmed.split("|").slice(1, -1);
      const cellCount = cells.length;
      if (!currentTable) {
        currentTable = { startLine: lineNum, expectedCells: cellCount, headerRow: trimmed };
      } else {
        // Is it divider row?
        const isDivider = cells.every(c => /^:?-+:?$/.test(c.trim()));
        if (!isDivider && cellCount !== currentTable.expectedCells) {
          issues.push({
            lineNum,
            type: "Table Column Mismatch",
            detail: `Expected ${currentTable.expectedCells} cells, got ${cellCount}. Line: "${trimmed}"`
          });
        }
      }
    } else {
      currentTable = null;
    }

    // Check for naked < like <5ms or <3Hz outside code or math
    const matches = line.match(/<[0-9]+[a-zA-Z]+/g);
    if (matches) {
      // Check if inside backticks
      matches.forEach(m => {
        const parts = line.split("`");
        // parts at even indices (0, 2, 4...) are outside backticks
        for (let i = 0; i < parts.length; i += 2) {
          if (parts[i].includes(m)) {
            issues.push({ lineNum, type: "Unescaped < before alphanumeric", detail: m });
          }
        }
      });
    }

    // Check for broken links like [text](...) where URL is empty or broken
    const emptyLinks = line.match(/\[[^\]]+\]\(\s*\)/g);
    if (emptyLinks) {
      issues.push({ lineNum, type: "Empty Link", detail: emptyLinks.join(", ") });
    }

    // Check for unclosed math delimiters or unescaped pipe inside table
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      // If there is $...|...$ in a table cell, it could break pipe splitting
      const mathPipes = line.match(/\$[^$]*\|[^$]*\$/g);
      if (mathPipes) {
        issues.push({ lineNum, type: "Unescaped pipe inside math in table", detail: mathPipes.join(", ") });
      }
    }
  });

  if (codeFenceCount % 2 !== 0) {
    issues.push({ lineNum: lines.length, type: "Unclosed Code Block", detail: `Total code fences: ${codeFenceCount}` });
  }

  console.log(`=== ${file} (${lines.length} lines) ===`);
  if (issues.length === 0) {
    console.log("  ✅ No syntax, table, or tag errors found.");
  } else {
    issues.forEach(iss => console.log(`  ❌ L${iss.lineNum} [${iss.type}]: ${iss.detail}`));
  }
  console.log("");
});
