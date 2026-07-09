function allUnits() {
  const chapterEntries = typeof agenticVisibleChaptersForNav === "function"
    ? agenticVisibleChaptersForNav()
    : curriculum.map((chapter, index) => ({ chapter, index }));
  return chapterEntries.flatMap(({ chapter }) => chapter.units.map((unit) => ({ ...unit, chapterLabel: chapter.label })));
}

function allResourceUnits() {
  const chapterEntries = typeof agenticVisibleChaptersForNav === "function"
    ? agenticVisibleChaptersForNav()
    : curriculum.map((chapter, index) => ({ chapter, index }));
  return chapterEntries.flatMap(({ chapter }) =>
    (chapter.allUnits || chapter.units || []).map((unit) => ({ ...unit, chapterLabel: chapter.label }))
  );
}

function displayMainUnits() {
  if (typeof agenticDisplayUnitsForChapter !== "function") return allUnits();
  const chapterEntries = typeof agenticVisibleChaptersForNav === "function"
    ? agenticVisibleChaptersForNav()
    : curriculum.map((chapter, index) => ({ chapter, index }));
  return chapterEntries.flatMap(({ chapter }) =>
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
  if (typeof unitCountsTowardProgress === "function") {
    return allUnits().filter((unit) => mainIds.has(unit.id) && unitCountsTowardProgress(unit)).length;
  }
  return state.completed.filter((id) => mainIds.has(id)).length;
}

function renderRecommendationPanel() {
  if (!els.recommendationPanel) return;
  els.recommendationPanel.hidden = true;
  els.recommendationPanel.innerHTML = "";
}
