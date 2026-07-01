// Extract Knowledge Graph nodes and edges from an Open MAIC courseware JSON.
// This is the missing "step 6" in the pipeline: after Open MAIC generates
// the classroom JSON, this module converts its scene structure into KG
// nodes (units) + edges (follows, chapter_handoff, alt_modality).
//
// Input:  parsed index.json (the Open MAIC export format)
// Output: { chapterNode, unitNodes[], edges[] } ready to merge into knowledge-graph.json

function inferRole(scene, index, total) {
  if (scene.type === "quiz") {
    if (index === 0) return "pre_test";
    if (index === total - 1) return "post_test";
    return "formative_quiz";
  }
  if (scene.type === "slide") {
    if (index === 1) return "concept_map";
    // Heuristic: slides near the end are recaps
    if (index >= total - 3) return "recap";
    return "lecture";
  }
  if (scene.type === "interactive") return "experiment";
  return "lecture";
}

function inferModality(scene) {
  if (scene.type === "quiz") return "assessment";
  const widgetConfig = scene.content?.widgetConfig;
  if (widgetConfig) {
    if (widgetConfig.concept?.includes("visual") || widgetConfig.type === "canvas") return "visual";
    if (widgetConfig.concept?.includes("formula") || widgetConfig.type === "symbolic") return "symbolic";
    if (widgetConfig.type === "simulation") return "visual";
    return "relational";
  }
  if (scene.type === "slide") return "narrative";
  return "visual";
}

function inferConcept(scene) {
  const wc = scene.content?.widgetConfig;
  if (wc?.concept) return wc.concept;
  // Try to extract from title
  return scene.title || "";
}

function isCheckpoint(role) {
  return role === "pre_test" || role === "post_test" || role === "formative_quiz";
}

function extractKgFromCourseware(coursewareJson, chapterId, chapterMeta) {
  const scenes = coursewareJson.scenes || [];
  const total = scenes.length;
  if (!total) return { chapterNode: null, unitNodes: [], edges: [] };

  // Chapter node
  const chapterNode = {
    id: chapterId,
    kind: "chapter",
    chapterId,
    label: chapterMeta?.title || coursewareJson.stage?.name || chapterId,
    objective: chapterMeta?.objective || "",
    concepts: chapterMeta?.concepts || [],
    sceneCount: total
  };

  // Unit nodes
  const unitNodes = scenes.map((scene, i) => {
    const role = inferRole(scene, i, total);
    const unitId = chapterId + "-scene-" + (scene.order || (i + 1));
    return {
      id: unitId,
      kind: "unit",
      chapterId,
      order: scene.order || (i + 1),
      type: scene.type,
      title: scene.title || "",
      role,
      modality: inferModality(scene),
      conceptClusterId: scene.conceptClusterId || "",
      conceptClusterLabel: scene.conceptClusterLabel || "",
      conceptClusterFocus: scene.conceptClusterFocus || "",
      concepts: Array.isArray(scene.concepts) ? scene.concepts : [],
      representation: scene.representation || "",
      scenarioType: scene.scenarioType || "",
      difficultyBand: scene.difficultyBand || "",
      duration: 4,
      isCheckpoint: isCheckpoint(role),
      isOptional: false
    };
  });

  const edges = [];

  // follows edges: scene-1 -> scene-2 -> ... -> scene-N
  for (let i = 0; i < unitNodes.length - 1; i++) {
    edges.push({ from: unitNodes[i].id, to: unitNodes[i + 1].id, kind: "follows" });
  }

  // alt_modality edges: connect interactive scenes that share similar concepts
  // Heuristic: interactive scenes within 2 orders of each other with same inferred concept
  const interactiveNodes = unitNodes.filter(n => n.type === "interactive");
  for (let i = 0; i < interactiveNodes.length; i++) {
    for (let j = i + 1; j < interactiveNodes.length; j++) {
      const a = interactiveNodes[i];
      const b = interactiveNodes[j];
      if (Math.abs(a.order - b.order) <= 3 && a.modality !== b.modality) {
        edges.push({ from: a.id, to: b.id, kind: "alt_modality" });
      }
    }
  }

  return { chapterNode, unitNodes, edges };
}

// Merge extracted KG into an existing knowledge-graph.json structure
function mergeKg(existingKg, extracted, chapterId) {
  const kg = JSON.parse(JSON.stringify(existingKg)); // deep clone

  // Remove old chapter + nodes + edges for this chapterId
  kg.chapters = kg.chapters.filter(c => c.id !== chapterId);
  kg.nodes = kg.nodes.filter(n => n.chapterId !== chapterId || n.kind === "chapter" && n.id !== chapterId);
  kg.edges = kg.edges.filter(e => {
    const fromChapter = e.from.split("-scene-")[0];
    const toChapter = e.to.split("-scene-")[0];
    return !(fromChapter === chapterId && e.kind === "follows") &&
           !(fromChapter === chapterId && toChapter === chapterId && e.kind === "alt_modality");
  });

  // Add new chapter
  kg.chapters.push({
    id: chapterId,
    title: extracted.chapterNode.label,
    objective: extracted.chapterNode.objective,
    concepts: extracted.chapterNode.concepts,
    mmlChapter: existingKg.chapters.find(c => c.id === chapterId)?.mmlChapter || 0,
    mmlPages: existingKg.chapters.find(c => c.id === chapterId)?.mmlPages || ""
  });

  // Add new nodes
  kg.nodes.push(extracted.chapterNode);
  kg.nodes.push(...extracted.unitNodes);

  // Add new edges
  kg.edges.push(...extracted.edges);

  // Rebuild chapter_handoff edges based on chapterOrder
  if (kg.chapterOrder && kg.chapterOrder.length > 1) {
    kg.edges = kg.edges.filter(e => e.kind !== "chapter_handoff");
    for (let i = 0; i < kg.chapterOrder.length - 1; i++) {
      const fromChapter = kg.chapterOrder[i];
      const toChapter = kg.chapterOrder[i + 1];
      const fromNodes = kg.nodes.filter(n => n.chapterId === fromChapter && n.kind === "unit");
      const toNodes = kg.nodes.filter(n => n.chapterId === toChapter && n.kind === "unit");
      const lastScene = fromNodes.sort((a, b) => b.order - a.order)[0];
      const firstScene = toNodes.sort((a, b) => a.order - b.order)[0];
      if (lastScene && firstScene) {
        kg.edges.push({ from: lastScene.id, to: firstScene.id, kind: "chapter_handoff" });
      }
    }
  }

  kg.generatedAt = new Date().toISOString();
  return kg;
}

module.exports = { extractKgFromCourseware, mergeKg, inferRole, inferModality };
