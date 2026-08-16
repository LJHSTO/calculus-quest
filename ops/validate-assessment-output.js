"use strict";

const fs = require("fs");
const path = require("path");
const { validatePairedAssessment, validateFormativeAssessment } = require("./assessment-output-validator");

function usage() {
  process.stderr.write("Usage: node ops/validate-assessment-output.js <result.json> --module <MODULE_ID> [--knowledge-point <KP_ID>]\n");
}

function readArgument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

const inputPath = process.argv[2];
const moduleId = readArgument("--module");
const knowledgePointId = readArgument("--knowledge-point");

if (!inputPath || !moduleId) {
  usage();
  process.exitCode = 2;
} else {
  try {
    const rootDir = path.resolve(__dirname, "..");
    const route = JSON.parse(fs.readFileSync(path.join(rootDir, "data", "multi-scene-learning-route.json"), "utf8"));
    const modules = (route.chapters || []).flatMap((chapter) => chapter.modules || []);
    const moduleDefinition = modules.find((module) => module.id === moduleId);
    if (!moduleDefinition) throw new Error(`Unknown module: ${moduleId}`);
    const payload = JSON.parse(fs.readFileSync(path.resolve(inputPath), "utf8"));
    const result = knowledgePointId
      ? validateFormativeAssessment(payload, moduleDefinition, knowledgePointId)
      : validatePairedAssessment(payload, moduleDefinition);
    if (result.valid) {
      process.stdout.write(`PASS: ${knowledgePointId || moduleId} assessment output is valid.\n`);
    } else {
      process.stderr.write(`FAIL: ${result.errors.length} validation error(s).\n`);
      for (const error of result.errors) {
        process.stderr.write(`- [${error.code}] ${error.path}: ${error.message}\n`);
      }
      process.exitCode = 1;
    }
  } catch (error) {
    process.stderr.write(`FAIL: ${error.message}\n`);
    process.exitCode = 2;
  }
}
