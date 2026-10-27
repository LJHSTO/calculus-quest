"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { deriveProactiveCoursewareContracts } = require("../lib/proactive-courseware-contracts");

const target = path.join(__dirname, "../data/proactive-courseware-contracts.json");
const output = `${JSON.stringify(deriveProactiveCoursewareContracts(), null, 2)}\n`;
if (process.argv.includes("--check")) {
  if (!fs.existsSync(target)) {
    console.error("缺少 data/proactive-courseware-contracts.json。运行时会改用已入库的 V14-C3 适配器生成合同；若要落盘，请去掉 --check。");
    process.exitCode = 0;
  } else if (fs.readFileSync(target, "utf8").replace(/\r\n/g, "\n") !== output) {
    console.error("data/proactive-courseware-contracts.json 与当前路线/适配器推导不一致。");
    process.exitCode = 1;
  } else {
    console.log("课件任务合同与推导结果一致。");
  }
} else {
  fs.writeFileSync(target, output, "utf8");
  console.log(`已写入 ${path.relative(process.cwd(), target)}。该文件在 data/* 忽略规则下，默认不提交。`);
}
