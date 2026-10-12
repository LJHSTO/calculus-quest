const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const resourcesRoot = path.join(root, "resources");
const capabilities = require("../lib/courseware-scene-capabilities");
const route = JSON.parse(
  fs.readFileSync(path.join(root, "data", "multi-scene-learning-route.json"), "utf8")
);
const chapterId = process.env.COURSEWARE_CHAPTER_ID || "V14-C3";
const chapter = route.chapters.find((item) => item.id === chapterId);

assert.ok(chapter, "V14-C3 chapter not found");

const commonEvents = [
  "scene_entered",
  "interaction_change",
  "hint_requested",
  "reset_used",
  "scene_completed"
];
const gameEvents = [
  "attempt_submitted",
  "challenge_result",
  "independent_check_completed"
];
let updated = 0;
const checkOnly = process.argv.includes("--check");

function semanticContract(module, knowledgePoint, candidate, facts = {}) {
  const judges = Boolean(facts.judgesCorrectness);
  const reportsHint = Boolean(facts.reportsHint);
  const reportsReset = Boolean(facts.reportsReset);
  const reportsAttempt = Boolean(facts.reportsAttempt);
  const reportsChallenge = Boolean(facts.reportsChallenge);
  // Derived from what the scene can actually emit, not from a blanket list. The
  // old fixed list claimed hint_requested / reset_used for every scene, which was
  // false for most of them — and because recordAttempt derives `independent` from
  // the hint and reset counters, a scene that never reports them makes every
  // attempt look independent.
  const evidenceEvents = [
    "scene_entered",
    "scene_completed",
    ...(reportsHint ? ["hint_requested"] : []),
    ...(reportsReset ? ["reset_used"] : []),
    ...(reportsAttempt ? ["attempt_submitted"] : []),
    ...(reportsChallenge ? ["challenge_result", "independent_check_completed"] : [])
  ];
  // Independence cannot be established for a scene that never reports hints: the
  // emitter would stamp every attempt independent:true. Refusing the claim is the
  // conservative choice — an unverifiable attempt is not independent evidence.
  const independentAllowed = judges && reportsHint;
  const auditedGame = candidate.type === "game"
    && ["GH-06-K02", "GH-07-K01", "GH-07-K02"].includes(knowledgePoint.id);
  const revisedEvidence = candidate.type === "game"
    && ["GH-07-K01", "GH-07-K04"].includes(knowledgePoint.id);
  const auditedSimulation = candidate.type === "simulation" && knowledgePoint.id === "GH-07-K03";
  return {
    schema_version: "openmaic.semantic-contract.v1",
    contract_revision: auditedSimulation ? "2026-09-09-simulation-audit-r2"
      : revisedEvidence ? "2026-09-09-game-audit-r3"
        : auditedGame ? "2026-09-09-game-audit-r2" : "2026-09-03",
    course_version: route.versionId,
    chapter_id: chapter.id,
    chapter_title: chapter.title,
    module_id: module.id,
    module_title: module.title,
    knowledge_point_id: knowledgePoint.id,
    concept_tag: knowledgePoint.name,
    scene_type: candidate.type,
    resource_id: `${knowledgePoint.id}:${candidate.type}`,
    resource_title: candidate.title,
    learning_objective: knowledgePoint.goal,
    misconception: knowledgePoint.misconception,
    observable_evidence: candidate.description,
    evidence_events: evidenceEvents,
    // What the scene can actually do, read out of its own code rather than
    // asserted. A consumer can now tell "this scene reports a judged result" from
    // "this scene only records that something was touched".
    capabilities: {
      widget_type: candidate.type,
      controls: Array.isArray(facts.controls) ? facts.controls : [],
      reports_attempt: reportsAttempt,
      reports_challenge: reportsChallenge,
      reports_hint: reportsHint,
      reports_reset: reportsReset,
      judges_correctness: judges,
      requires_webgl: Boolean(facts.usesWebgl),
      requires_network: Boolean(facts.externalNetwork),
      keeps_local_state: Boolean(facts.keepsState)
    },
    // Where a nudge may legitimately place the learner. This courseware has no
    // step-level addressing, so a suggestion can only open a scene from its start;
    // claiming otherwise would let the agent aim at a state that does not exist.
    safe_entry_points: {
      open_at_start: true,
      deep_link_supported: false,
      resume_supported: Boolean(facts.keepsState),
      reentry_after_help: facts.keepsState ? "resume_or_restart" : "restart_scene"
    },
    // What this scene must NOT be used for. The chapter measures mastery with the
    // platform's own items; a scene result is supporting behaviour.
    assessment_restrictions: {
      independent_evidence_allowed: independentAllowed,
      independent_requires: independentAllowed
        ? "本次提交前 hint_count=0 且 reset_count=0，且场景自行判定了对错"
        : !judges
          ? "该场景不判定对错，不能作为独立掌握证据"
          : "该场景不上报提示使用，无法确认本次尝试是否无辅助，因此不作为独立掌握证据",
      counts_toward_mastery: false,
      mastery_source: "platform_verification_items"
    },
    completion_semantics: candidate.type === "game"
      ? {
          success_requires: "由关卡真实判定函数产生 is_correct=true，不能由点击次数或打开页面代替",
          independent_requires: chapterId === "V14-C1"
            ? "游戏结果只作辅助行为记录，independent=false；掌握度必须使用平台独立验证题"
            : "本次提交前 hint_count=0 且 reset_count=0",
          failure_is_evidence: true
        }
      : {
          success_requires: "产生与本知识点目标一致的可观察交互变化",
          failure_is_evidence: false
        }
  };
}

function contractTag(contract, newline) {
  const json = JSON.stringify(contract, null, 2).replaceAll("\n", newline);
  return [
    '<script type="application/json" id="openmaic-semantic-contract" data-openmaic-semantic-contract="1">',
    json,
    "</script>"
  ].join(newline);
}

(chapter.modules || []).forEach((module) => {
  (module.knowledgePoints || []).forEach((knowledgePoint) => {
    (knowledgePoint.resourceCandidates || []).forEach((candidate) => {
      const file = path.resolve(resourcesRoot, candidate.root, candidate.file);
      assert.ok(
        file.startsWith(`${resourcesRoot}${path.sep}`),
        `resource escaped resources root: ${file}`
      );
      const buffer = fs.readFileSync(file);
      const hasBom = buffer.length >= 3
        && buffer[0] === 0xef
        && buffer[1] === 0xbb
        && buffer[2] === 0xbf;
      const source = buffer.toString("utf8").replace(/^\uFEFF/, "");
      const newline = source.includes("\r\n") ? "\r\n" : "\n";
      // Read the scene before writing a contract about it, and refuse to declare
      // an event the scene's own code cannot produce. This is what stops the
      // contract from promising evidence that never arrives.
      const facts = capabilities.describeScene(source);
      const contract = semanticContract(module, knowledgePoint, candidate, facts);
      const unverifiable = capabilities.unverifiableEvents(source, contract.evidence_events);
      assert.equal(
        unverifiable.length,
        0,
        `${candidate.root}/${candidate.file} declares events it cannot emit: ${unverifiable.join(", ")}`
      );
      const tag = contractTag(contract, newline);
      const existing = /<script\s+type="application\/json"\s+id="openmaic-semantic-contract"[^>]*>([\s\S]*?)<\/script>/i;
      let next;

      if (existing.test(source)) {
        next = source.replace(existing, tag);
      } else {
        const title = /<title>[\s\S]*?<\/title>/i;
        assert.match(source, title, `${file} is missing a title element`);
        next = source.replace(title, (match) => `${match}${newline}${tag}`);
      }

      assert.equal(
        (next.match(/id="openmaic-semantic-contract"/g) || []).length,
        1,
        `${file} must contain exactly one semantic contract`
      );
      const output = Buffer.from(`${hasBom ? "\uFEFF" : ""}${next}`, "utf8");
      if (checkOnly) {
        assert.deepEqual(
          JSON.parse(source.match(existing)?.[1] || "null"),
          contract,
          `${file} 的语义合同与预处理定义不一致`
        );
      } else if (!buffer.equals(output)) {
        fs.writeFileSync(file, output);
      }
      updated += 1;
    });
  });
});

// The expected count is a property of the imported courseware, not a constant.
// It used to be hardcoded (24 for V14-C1, 28 for V14-C3), which broke the moment
// the chapter moved to function-driven scene selection.
const expectedContracts = chapter.modules
  .flatMap((module) => module.knowledgePoints)
  .reduce((sum, knowledgePoint) => sum + (knowledgePoint.resourceCandidates || []).length, 0);
assert.ok(expectedContracts > 0, `${chapterId} has no resource candidates to contract`);
assert.equal(
  updated,
  expectedContracts,
  `processed ${updated} files but the route declares ${expectedContracts} interactive scenes`
);
console.log(`已${checkOnly ? "核对" : "处理"} ${updated} 份 ${chapterId} 语义合同。`);
