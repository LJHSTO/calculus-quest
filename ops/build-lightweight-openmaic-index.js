const fs = require("fs");
const path = require("path");

const root = process.cwd();
const openMaicRoot = path.join(root, "resources", "open-maic");

function byteLength(value) {
  return Buffer.byteLength(typeof value === "string" ? value : JSON.stringify(value || {}), "utf8");
}

function normalizeInteractiveTitle(fileName) {
  return path
    .basename(fileName, ".html")
    .replace(/^\d+[_\-\s]*/, "")
    .trim();
}

function interactiveFilesFor(chapterDir) {
  const dir = path.join(chapterDir, "interactive");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((file) => file.toLowerCase().endsWith(".html"))
    .sort((a, b) => a.localeCompare(b, "zh-CN", { numeric: true }));
}

function buildInteractiveResolver(chapterDir) {
  const files = interactiveFilesFor(chapterDir);
  const byTitle = new Map(files.map((file) => [normalizeInteractiveTitle(file), file]));
  let fallbackIndex = 0;

  return (title) => {
    const exact = byTitle.get(title);
    if (exact) return exact;
    const fuzzy = files.find((file) => normalizeInteractiveTitle(file).includes(title) || title.includes(normalizeInteractiveTitle(file)));
    if (fuzzy) return fuzzy;
    return files[fallbackIndex++] || "";
  };
}

function stripScene(scene, resolveInteractiveFile) {
  const next = {
    ...scene,
    content: {
      ...(scene.content || {})
    }
  };

  if (scene.type === "interactive") {
    const html = next.content.html || "";
    const file = resolveInteractiveFile(scene.title || "");
    delete next.content.html;
    next.content.htmlPath = file ? `interactive/${file}` : "";
    next.content.htmlBytes = byteLength(html);
  }

  return next;
}

function chapterSummary(chapterId, manifest, indexBytes) {
  const scenes = manifest.scenes || [];
  return {
    id: chapterId,
    scenes: scenes.length,
    slides: scenes.filter((scene) => scene.type === "slide").length,
    quizzes: scenes.filter((scene) => scene.type === "quiz").length,
    interactive: scenes.filter((scene) => scene.type === "interactive").length,
    audio: scenes.reduce((sum, scene) => sum + (scene.actions || []).filter((action) => action.audioRef).length, 0),
    indexBytes
  };
}

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, JSON.stringify(payload), "utf8");
}

function main() {
  if (!fs.existsSync(openMaicRoot)) {
    throw new Error(`OpenMAIC resource directory not found: ${openMaicRoot}`);
  }

  const chapterDirs = fs
    .readdirSync(openMaicRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, "zh-CN", { numeric: true }));

  const summaries = [];

  for (const chapterId of chapterDirs) {
    const chapterDir = path.join(openMaicRoot, chapterId);
    const manifestPath = path.join(chapterDir, "manifest.json");
    if (!fs.existsSync(manifestPath)) continue;

    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const resolveInteractiveFile = buildInteractiveResolver(chapterDir);
    const index = {
      ...manifest,
      sourceManifest: "manifest.json",
      resourceMode: "lightweight-index",
      scenes: (manifest.scenes || []).map((scene) => stripScene(scene, resolveInteractiveFile))
    };

    const indexPath = path.join(chapterDir, "index.json");
    writeJson(indexPath, index);
    const indexBytes = fs.statSync(indexPath).size;
    summaries.push(chapterSummary(chapterId, manifest, indexBytes));

    const manifestBytes = fs.statSync(manifestPath).size;
    const saved = Math.max(0, manifestBytes - indexBytes);
    console.log(`${chapterId}: ${manifestBytes} -> ${indexBytes} bytes, saved ${saved}`);
  }

  writeJson(path.join(openMaicRoot, "course-index.json"), {
    generatedAt: new Date().toISOString(),
    chapters: summaries,
    totals: summaries.reduce(
      (acc, chapter) => ({
        scenes: acc.scenes + chapter.scenes,
        slides: acc.slides + chapter.slides,
        quizzes: acc.quizzes + chapter.quizzes,
        interactive: acc.interactive + chapter.interactive,
        audio: acc.audio + chapter.audio,
        indexBytes: acc.indexBytes + chapter.indexBytes
      }),
      { scenes: 0, slides: 0, quizzes: 0, interactive: 0, audio: 0, indexBytes: 0 }
    )
  });
}

main();
