// Full automated pipeline: chapter design -> standardized prompts -> Open MAIC
// generation -> QA self-check -> KG extraction -> merge into project.
//
// This orchestrates the entire course-creation workflow so adding a new
// chapter (or regenerating an existing one) becomes a single function call.
//
// Usage:
//   const { runPipeline } = require("./lib/course-gen/pipeline");
//   const result = await runPipeline({
//     chapterId: "E1",
//     chapterMeta: { title: "...", objective: "...", concepts: [...] },
//     openMaicBaseUrl: "http://localhost:3001",
//     kgPath: "data/knowledge-graph.json",
//     coursewareDir: "resources/open-maic"
//   });

const fs = require("fs");
const path = require("path");
const protocol = require("./protocol");
const { extractKgFromCourseware, mergeKg } = require("./kg-extract");

// ── Step 1: Generate standardized outline from chapter design ──────────
async function step1Outline(chapterMeta) {
  console.log("[Pipeline] Step 1: Generating standardized outline...");
  const outline = await protocol.generateCourseOutline(chapterMeta);
  if (!outline.scenes || !outline.scenes.length) {
    throw new Error("Outline generation failed: no scenes returned");
  }
  console.log("[Pipeline]   Outline: " + outline.scenes.length + " scenes");
  return outline;
}

// ── Step 2: Build visual anchors for each scene ────────────────────────
async function step2VisualAnchors(outline, chapterMeta) {
  console.log("[Pipeline] Step 2: Selecting visual anchors...");
  const anchors = [];
  for (const scene of outline.scenes) {
    const anchor = await protocol.generateVisualAnchor(scene, chapterMeta);
    anchors.push(anchor);
  }
  console.log("[Pipeline]   " + anchors.length + " visual anchors selected");
  return anchors;
}

// ── Step 3: Build standardized prompts for Open MAIC ──────────────────
function step3BuildPrompts(outline, anchors, chapterMeta) {
  console.log("[Pipeline] Step 3: Building standardized prompts...");
  const prompts = outline.scenes.map((scene, i) => {
    const anchor = anchors[i] || {};
    const prereqs = i > 0
      ? outline.scenes.slice(0, i).map(s => s.anchorConcept).filter(Boolean)
      : [];
    return protocol.buildScenePrompt(scene, anchor, chapterMeta, prereqs);
  });
  console.log("[Pipeline]   " + prompts.length + " prompts built");
  return prompts;
}

// ── Step 4: Submit to Open MAIC (or use provided courseware JSON) ─────
// If openMaicCourseware is provided directly, skip the API call.
async function step4Generate(coursewareJson, prompts, openMaicConfig) {
  console.log("[Pipeline] Step 4: Courseware generation...");
  if (coursewareJson) {
    console.log("[Pipeline]   Using provided courseware JSON (skipping Open MAIC API)");
    return coursewareJson;
  }
  if (!openMaicConfig || !openMaicConfig.baseUrl) {
    throw new Error("Step 4 requires either coursewareJson or openMaicConfig.baseUrl");
  }
  // Submit to Open MAIC's /api/generate-classroom endpoint
  // The prompts are combined into a single requirement string
  const requirement = prompts.map((p, i) => "## Scene " + (i + 1) + "\n" + p).join("\n\n");
  console.log("[Pipeline]   Submitting to Open MAIC: " + openMaicConfig.baseUrl);

  const submitRes = await fetch(openMaicConfig.baseUrl + "/api/generate-classroom", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(openMaicConfig.headers || {}) },
    body: JSON.stringify({
      requirement,
      enableWebSearch: false,
      enableImageGeneration: false,
      enableTTS: false
    })
  });
  if (!submitRes.ok) throw new Error("Open MAIC submit failed: HTTP " + submitRes.status);
  const submitData = await submitRes.json();
  if (!submitData.jobId) throw new Error("Open MAIC submit failed: no jobId");

  // Poll for completion
  const jobId = submitData.jobId;
  console.log("[Pipeline]   Job ID: " + jobId + ", polling...");
  const deadline = Date.now() + (openMaicConfig.timeoutMs || 7200000);
  let courseware = null;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, (openMaicConfig.pollMs || 15000)));
    const pollRes = await fetch(openMaicConfig.baseUrl + "/api/generate-classroom/" + jobId);
    if (!pollRes.ok) continue;
    const pollData = await pollRes.json();
    console.log("[Pipeline]   Status: " + pollData.status + " " + (pollData.progress || 0) + "%");
    if (pollData.done) {
      if (pollData.status === "succeeded") {
        // Fetch the classroom JSON
        const classRes = await fetch(openMaicConfig.baseUrl + "/api/classroom?id=" + pollData.result.classroomId);
        courseware = await classRes.json();
      } else {
        throw new Error("Open MAIC job failed: " + (pollData.error || "unknown"));
      }
      break;
    }
  }
  if (!courseware) throw new Error("Open MAIC job timed out");
  console.log("[Pipeline]   Courseware generated: " + (courseware.scenes?.length || 0) + " scenes");
  return courseware;
}

// ── Step 5: QA self-check (Sequential Anchoring) ──────────────────────
async function step5QaCheck(outline, courseware) {
  console.log("[Pipeline] Step 5: QA self-check (Sequential Anchoring)...");
  const sceneSummaries = (courseware.scenes || []).map((s, i) => ({
    sceneOrder: s.order || (i + 1),
    role: outline.scenes[i]?.role || "unknown",
    modality: outline.scenes[i]?.modality || "unknown",
    anchorConcept: outline.scenes[i]?.anchorConcept || "",
    paramCount: s.content?.widgetConfig?.variables?.length || 0,
    questionCount: s.content?.questions?.length || 0
  }));
  const report = await protocol.assembleChapter(outline, sceneSummaries);
  console.log("[Pipeline]   QA report: pass=" + report.pass + " score=" + report.qualityScore);
  if (report.gapReport?.length) {
    report.gapReport.forEach(g => console.log("[Pipeline]   GAP: " + g.type + " " + g.detail));
  }
  return report;
}

// ── Step 6: Extract KG from courseware ────────────────────────────────
function step6ExtractKg(courseware, chapterId, chapterMeta) {
  console.log("[Pipeline] Step 6: Extracting KG from courseware...");
  const extracted = extractKgFromCourseware(courseware, chapterId, chapterMeta);
  console.log("[Pipeline]   Extracted: " + extracted.unitNodes.length + " nodes, " + extracted.edges.length + " edges");
  return extracted;
}

// ── Step 7: Merge KG + save courseware ────────────────────────────────
function step7MergeAndSave(extracted, chapterId, kgPath, courseware, coursewareDir) {
  console.log("[Pipeline] Step 7: Merging KG + saving courseware...");
  // Merge into knowledge-graph.json
  const existingKg = JSON.parse(fs.readFileSync(kgPath, "utf8"));
  const mergedKg = mergeKg(existingKg, extracted, chapterId);
  fs.writeFileSync(kgPath, JSON.stringify(mergedKg, null, 2), "utf8");
  console.log("[Pipeline]   KG merged: " + mergedKg.nodes.length + " nodes, " + mergedKg.edges.length + " edges");

  // Save courseware JSON
  const chapterDir = path.join(coursewareDir, chapterId);
  if (!fs.existsSync(chapterDir)) fs.mkdirSync(chapterDir, { recursive: true });
  const coursewarePath = path.join(chapterDir, "index.json");
  fs.writeFileSync(coursewarePath, JSON.stringify(courseware, null, 2), "utf8");
  console.log("[Pipeline]   Courseware saved: " + coursewarePath);

  return { kgPath, coursewarePath };
}

// ── Full pipeline ─────────────────────────────────────────────────────
async function runPipeline(config) {
  const { chapterId, chapterMeta, kgPath, coursewareDir } = config;
  console.log("[Pipeline] === Starting for chapter " + chapterId + " ===");

  let outline = null;
  let prompts = null;

  if (config.coursewareJson) {
    // Skip generation steps when courseware is provided directly
    console.log("[Pipeline] Skipping Steps 1-3 (courseware JSON provided)");
    // Build a minimal outline from the courseware for QA check
    const scenes = config.coursewareJson.scenes || [];
    outline = {
      scenes: scenes.map((s, i) => ({
        sceneOrder: s.order || (i + 1),
        role: require("./kg-extract").inferRole(s, i, scenes.length),
        anchorConcept: s.title || "",
        modality: require("./kg-extract").inferModality(s)
      }))
    };
  } else {
    outline = await step1Outline(chapterMeta);
    const anchors = await step2VisualAnchors(outline, chapterMeta);
    prompts = step3BuildPrompts(outline, anchors, chapterMeta);
  }

  const courseware = protocol.attachSceneMetadata(
    await step4Generate(config.coursewareJson, prompts || [], config.openMaicConfig),
    outline,
    { ...chapterMeta, id: chapterId }
  );
  const qaReport = await step5QaCheck(outline, courseware);
  const extracted = step6ExtractKg(courseware, chapterId, chapterMeta);
  const saved = step7MergeAndSave(extracted, chapterId, kgPath || "data/knowledge-graph.json",
    courseware, coursewareDir || "resources/open-maic");

  console.log("[Pipeline] === Complete ===");
  return {
    outline,
    prompts: prompts || [],
    courseware,
    qaReport,
    kg: extracted,
    saved
  };
}

module.exports = { runPipeline };
