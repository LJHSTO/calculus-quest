const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const assessmentProbe = `
const Module = require("node:module");
let calls = 0;
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  const parentFile = String(parent?.filename || "").replace(/\\\\/g, "/");
  if (request === "../llm" && parentFile.endsWith("/lib/agents/assessment.js")) {
    return {
      provider: () => "openai-compatible",
      completeChat: async () => {
        calls += 1;
        return {
          provider: "openai-compatible",
          text: JSON.stringify({
            masteryLevel: 0.9,
            weakConcepts: [],
            suggestedAction: "skip",
            confidenceLevel: 0.9,
            summary: "模型诊断"
          })
        };
      }
    };
  }
  return originalLoad.apply(this, arguments);
};
const assessment = require("./lib/agents/assessment");
assessment.analyze({
  quizSummary: {
    byChapter: [{ chapterId: "C1", phase: "formative", accuracy: 0.5 }],
    wrongConcepts: [{ tag: "导数定义", count: 2 }]
  },
  gradingResults: [],
  interactionEvents: []
}).then((result) => {
  process.stdout.write(JSON.stringify({ calls, result }));
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
`;

function runAssessment(enabled) {
  const child = spawnSync(process.execPath, ["-e", assessmentProbe], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      ASSESSMENT_LLM_ENABLED: enabled ? "true" : "false",
      LLM_PROVIDER: "openai-compatible"
    }
  });
  assert.equal(child.status, 0, child.stderr);
  return JSON.parse(child.stdout);
}

const disabled = runAssessment(false);
assert.equal(disabled.calls, 0);
assert.equal(disabled.result.provider, "rules");
assert.equal(disabled.result.masteryLevel, 0.5);
assert.equal(disabled.result.suggestedAction, "remediate");
assert.match(disabled.result.summary, /固定规则/);

const enabled = runAssessment(true);
assert.equal(enabled.calls, 1);
assert.equal(enabled.result.provider, "openai-compatible");
assert.equal(enabled.result.masteryLevel, 0.9);
assert.equal(enabled.result.suggestedAction, "skip");

const timeoutProbe = `
const Module = require("node:module");
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  const parentFile = String(parent?.filename || "").replace(/\\\\/g, "/");
  if (request === "../llm" && parentFile.endsWith("/lib/agents/assessment.js")) {
    return {
      provider: () => "openai-compatible",
      completeChat: ({ signal }) => new Promise((resolve, reject) => {
        signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        }, { once: true });
      })
    };
  }
  if (request === "./llm" && parentFile.endsWith("/lib/agentic-coach.js")) {
    return {
      completeChat: ({ signal }) => new Promise((resolve, reject) => {
        signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        }, { once: true });
      })
    };
  }
  return originalLoad.apply(this, arguments);
};
const assessment = require("./lib/agents/assessment");
const coach = require("./lib/agentic-coach");
const quizSummary = {
  byChapter: [{ chapterId: "C1", phase: "post", accuracy: 0.5 }],
  wrongConcepts: [{ tag: "导数定义", count: 2 }]
};
Promise.all([
  assessment.analyze({ quizSummary, gradingResults: [], interactionEvents: [] }),
  coach.explain({
    ok: true,
    chapterTitle: "测试章节",
    metrics: { preAccuracy: 0.5, postAccuracy: 0.5 },
    draftForLlm: { skip: [], remediate: [], extension: [], weakConcepts: "" }
  })
]).then(([assessmentResult, coachResult]) => {
  process.stdout.write(JSON.stringify({ assessmentResult, coachResult }));
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
`;

const timeoutChild = spawnSync(process.execPath, ["-e", timeoutProbe], {
  cwd: root,
  encoding: "utf8",
  timeout: 5000,
  env: {
    ...process.env,
    ASSESSMENT_LLM_ENABLED: "true",
    ASSESSMENT_TIMEOUT_MS: "250",
    COACH_NARRATION_TIMEOUT_MS: "250",
    LLM_PROVIDER: "openai-compatible"
  }
});
assert.equal(timeoutChild.status, 0, timeoutChild.stderr);
const timeoutResult = JSON.parse(timeoutChild.stdout);
assert.equal(timeoutResult.assessmentResult.provider, "rules");
assert.match(timeoutResult.assessmentResult.summary, /接口异常|超时|规则模式/);
assert.equal(timeoutResult.coachResult.provider, "fallback");
assert.match(timeoutResult.coachResult.narration, /暂时离线/);

console.log("assessment and coach model mode tests passed");
