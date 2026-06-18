function allUnits() {
  return curriculum.flatMap((chapter) => chapter.units.map((unit) => ({ ...unit, chapterLabel: chapter.label })));
}

function allResourceUnits() {
  return curriculum.flatMap((chapter) =>
    (chapter.allUnits || chapter.units || []).map((unit) => ({ ...unit, chapterLabel: chapter.label }))
  );
}

function displayMainUnits() {
  if (typeof agenticDisplayUnitsForChapter !== "function") return allUnits();
  return curriculum.flatMap((chapter) =>
    agenticDisplayUnitsForChapter(chapter).map((unit) => ({ ...unit, chapterLabel: chapter.label }))
  );
}

function allNavigableUnits() {
  return displayMainUnits();
}

function currentNavigableUnits() {
  return displayMainUnits();
}

function mainCompletedCount() {
  const mainIds = new Set(allUnits().map((unit) => unit.id));
  return state.completed.filter((id) => mainIds.has(id)).length;
}

function renderRecommendationPanel() {
  if (!els.recommendationPanel) return;
  els.recommendationPanel.hidden = true;
  els.recommendationPanel.innerHTML = "";
}
