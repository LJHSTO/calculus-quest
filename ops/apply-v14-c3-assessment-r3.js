const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { applyToChapter, version } = require("../lib/assessments/v14-c3-r3");
const root = path.resolve(__dirname, "..");
const file = path.join(root, "data/multi-scene-learning-route.json");
const route = JSON.parse(fs.readFileSync(file, "utf8"));
const chapter = route.chapters.find((entry) => entry.id === "V14-C3");
const otherChapters = JSON.stringify(route.chapters.filter((entry) => entry.id !== "V14-C3"));
const alreadyRevised = chapter.assessmentRevision?.version === version;
const beforeRevision = JSON.stringify(chapter);
const archivePath = path.join(root, "research/archive/V14-C3修订前题库-2026-09-09.json");
const original = {
  chapterId: chapter.id,
  capturedAt: "2026-09-09",
  flow: chapter.flow,
  formative: chapter.modules.flatMap((module) => module.knowledgePoints
    .map((point) => ({ id: point.id, formativeQuiz: point.formativeQuiz })))
};
if (chapter.assessmentRevision?.version !== version) {
  if (fs.existsSync(archivePath)) {
    if (JSON.stringify(JSON.parse(fs.readFileSync(archivePath, "utf8"))) !== JSON.stringify(original)) {
      throw new Error("已存在不同旧题库档案，拒绝覆盖");
    }
  } else {
    fs.mkdirSync(path.dirname(archivePath), { recursive: true });
    fs.writeFileSync(archivePath, JSON.stringify(original, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
  }
} else if (!fs.existsSync(archivePath)) {
  throw new Error("缺少历史题库，拒绝继续修订");
}
applyToChapter(chapter);
if (alreadyRevised && JSON.stringify(chapter) !== beforeRevision) {
  throw new Error("r3内容已发生差异：不得原地重写已版本化题目，须创建下一修订版");
}
const identities = route.chapters.flatMap((current) => [
  ...["preQuiz", "postQuiz"].flatMap((phase) =>
    (current.flow?.[phase]?.questions || []).map((question) => ({
      chapterId: current.id,
      unitId: `${current.id}-${phase === "preQuiz" ? "pre" : "post"}`,
      id: question.id, sourceId: question.sourceId, type: question.type,
      knowledgePointIds: question.knowledgePointIds, points: question.points
    }))
  ),
  ...(current.modules || []).flatMap((module) => (module.knowledgePoints || []).flatMap((point) =>
    (point.formativeQuiz?.questions || []).map((question) => ({
      chapterId: current.id, unitId: `${point.id}-formative`,
      id: question.id, sourceId: question.sourceId, type: question.type,
      knowledgePointIds: question.knowledgePointIds, adaptiveRole: question.adaptiveRole,
      points: question.points
    }))
  ))
]);
route.quizKnowledgePointCuration.questionSetFingerprint =
  crypto.createHash("sha256").update(JSON.stringify(identities)).digest("hex");
if (otherChapters !== JSON.stringify(route.chapters.filter((entry) => entry.id !== "V14-C3"))) {
  throw new Error("修订意外影响其他章节，拒绝写入");
}
fs.writeFileSync(file, JSON.stringify(route, null, 2) + "\n", "utf8");
console.log("V14-C3的34道题已版本化修订，旧题库档案保留，其他章节未修改。");
