// Earth Online derived presentation state.
// Read-only layer: never mutates learning state or navigation state.
(function () {
  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function visibleChapters() {
    try {
      if (typeof agenticVisibleChaptersForNav === "function") {
        return agenticVisibleChaptersForNav().map((entry) => entry.chapter).filter(Boolean);
      }
    } catch {
      // Presentation only; fall back to curriculum.
    }
    return safeArray(window.curriculum || curriculum);
  }

  function allCourseUnits() {
    return visibleChapters().flatMap((chapter) => safeArray(chapter.units));
  }

  function countsTowardRecovery(unit) {
    try {
      return typeof unitCountsTowardProgress !== "function" || unitCountsTowardProgress(unit);
    } catch {
      return true;
    }
  }

  function uniqueLearningDays(logs) {
    const days = new Set(
      safeArray(logs)
        .map((log) => String(log).slice(0, 10))
        .filter(Boolean)
    );
    return days.size;
  }

  function quizCorrectCount(results) {
    return safeArray(results).filter((item) => item && item.isCorrect === true).length;
  }

  function unitKind(unit) {
    if (!unit) return "mission";
    if (unit.type === "quiz" && unit.assessmentPhase === "pre") return "scan";
    if (unit.type === "quiz" && unit.assessmentPhase === "post") return "boss";
    if (unit.type === "quiz") return "challenge";
    if (unit.type === "interactive") return "experiment";
    if (unit.type === "knowledge") return "knowledge";
    return "mission";
  }

  function regionTheme(index) {
    return [
      { name: "数学大陆", subtitle: "Mathematics Continent" },
      { name: "函数平原", subtitle: "Function Plains" },
      { name: "导数高塔", subtitle: "Derivative Tower" },
      { name: "积分能源中心", subtitle: "Integral Energy Core" },
      { name: "梯度高原", subtitle: "Gradient Highlands" },
      { name: "优化中枢", subtitle: "Optimization Nexus" },
      { name: "机器学习研究院", subtitle: "ML Research Lab" },
      { name: "概率港", subtitle: "Probability Harbor" },
      { name: "向量都市", subtitle: "Vector City" },
      { name: "AI未来都市", subtitle: "AI Future City" },
      { name: "地球核心", subtitle: "Earth Core" }
    ][index % 11];
  }

  function derive() {
    const learningState = state || {};
    const units = allCourseUnits();
    const recoveryUnits = units.filter(countsTowardRecovery);
    const completed = safeArray(learningState.completed);
    const submittedQuizzes = safeArray(learningState.submittedQuizzes);
    const quizResults = safeArray(learningState.quizResults);
    const completedCount = units.filter((unit) => completed.includes(unit.id)).length;
    const recoveryCompletedCount = recoveryUnits.filter((unit) => completed.includes(unit.id)).length;
    const xp = completedCount * 20 + submittedQuizzes.length * 30 + quizCorrectCount(quizResults) * 5;
    const level = Math.max(1, Math.floor(xp / 120) + 1);
    const skillPoints = Math.floor(completedCount / 2);
    const streak = Math.max(uniqueLearningDays(learningState.logs), completedCount ? 1 : 0);
    const currentChapter = typeof getChapter === "function" ? getChapter(currentChapterId) : visibleChapters()[0];
    const currentUnit = typeof getUnit === "function" ? getUnit(currentUnitId) : null;
    const nextUnit = currentUnit || units.find((unit) => !completed.includes(unit.id)) || units[0] || null;
    const chapterRegions = visibleChapters().map((chapter, index) => {
      let unlocked = true;
      try {
        unlocked = typeof agenticIsChapterUnlocked !== "function" || agenticIsChapterUnlocked(chapter.id);
      } catch {
        unlocked = true;
      }
      const chapterUnits = safeArray(chapter.units).filter(countsTowardRecovery);
      const done = chapterUnits.filter((unit) => completed.includes(unit.id)).length;
      const progress = chapterUnits.length ? Math.round((done / chapterUnits.length) * 100) : 0;
      return {
        id: chapter.id,
        active: chapter.id === currentChapter?.id,
        unlocked,
        progress,
        label: chapter.label,
        summary: chapter.summary || "",
        ...regionTheme(index + 1)
      };
    });
    const reservedRegions = [];
    for (let index = chapterRegions.length + 1; index < 11; index += 1) {
      reservedRegions.push({
        id: `reserved-region-${index}`,
        active: false,
        unlocked: false,
        progress: 0,
        label: "Reserved Region",
        summary: "预留区域",
        ...regionTheme(index)
      });
    }
    const regions = [
      {
        id: "earth-origin",
        active: false,
        unlocked: true,
        progress: chapterRegions.length ? 100 : 0,
        label: "Earth Online",
        summary: "出生点",
        ...regionTheme(0)
      },
      ...chapterRegions,
      ...reservedRegions
    ];

    const worldRecovery = recoveryUnits.length ? Math.round((recoveryCompletedCount / recoveryUnits.length) * 100) : 0;

    return {
      explorer: {
        level,
        xp,
        skillPoints,
        streak,
        completedCount,
        totalCount: recoveryUnits.length || units.length,
        worldRecovery
      },
      currentMission: nextUnit
        ? {
            id: nextUnit.id,
            title: nextUnit.label,
            summary: nextUnit.summary || "",
            kind: unitKind(nextUnit),
            chapterLabel: currentChapter?.label || ""
          }
        : null,
      regions
    };
  }

  window.EarthOnlineGame = { derive };
})();
