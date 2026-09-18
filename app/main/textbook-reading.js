(function initTextbookReading(global) {
  "use strict";
  const scienceSample = "https://www.ecsponline.com/yz/B80FF7491E2F84AB089693F76C9A2953E000.pdf";
  const chineseChapters = {
    "GH-01-K01": [7, "1.1.1 函数的概念（正文第1至2页）"],
    "GH-01-K02": [8, "1.1.1 函数的表示法（正文第2页）"],
    "GH-01-K03": [10, "1.1.2 单调性（正文第4页）"],
    "GH-02-K01": [21, "1.3.1 趋向常数时的函数极限（正文第15页）"],
    "GH-02-K02": [22, "1.3.1 单侧极限及两侧关系（正文第16页）"]
  };
  const chapters = {};
  const shell = document.querySelector(".core-learning-workspace");
  if (!shell) return;

  function currentReading() {
    const unit = typeof getUnit === "function" ? getUnit() : null;
    const snapshot = global.KnowledgeAssistant?.workspaceSnapshot?.();
    if (unit?.type !== "knowledge" || unit.chapterId !== "V14-C1"
      || snapshot?.locked !== false || !snapshot.signedIn
      || shell.dataset.classroomSurface !== "slide"
      || shell.classList.contains("is-coach-surface")
      || !document.querySelector("#learn-view.active")) return null;
    if (unit.id === "GH-02-K03") {
      return {
        href: "https://academic.hep.com.cn/flsc/CN/chapter/978-7-04-034526-1/chapter04",
        language: "中文",
        title: "高等教育出版社《数学分析原理》第一卷第9版 · 第四章 §1 第60目：一点处的连续性（出版社章节试读，新标签页）"
      };
    }
    const chinese = chineseChapters[unit.id];
    if (chinese) return {
      href: `${scienceSample}#page=${chinese[0]}`,
      language: "中文",
      title: `科学出版社《高等数学》沈京一、张晓晞主编 · ${chinese[1]}（出版社试读，PDF第${chinese[0]}页，新标签页）`
    };
    const reading = chapters[unit.id];
    return reading ? {
      href: `https://openstax.org/books/calculus-volume-${reading[0]}/pages/${reading[1]}`,
      language: "英文",
      title: `OpenStax《微积分》第 ${reading[0]} 卷 · ${reading[2]}（英文，新标签页）`
    } : null;
  }

  function sync() {
    const toolbar = shell.querySelector(".workspace-canvas-toolbar");
    const reading = currentReading();
    let link = shell.querySelector(".textbook-reading");
    if (!toolbar || !reading) {
      link?.remove();
      return;
    }
    if (!link) {
      link = document.createElement("a");
      link.className = "textbook-reading";
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "教材阅读";
      const language = document.createElement("span");
      link.append(language);
      // Recheck protection synchronously, even before a pending UI update runs.
      link.addEventListener("click", (event) => {
        if (!currentReading()) {
          event.preventDefault();
          sync();
          return;
        }
        if (typeof analyticsTrack === "function") analyticsTrack("textbook_open", {
          knowledgePointId: getUnit()?.id,
          sourceUrl: link.href,
          language: currentReading().language
        });
      });
      toolbar.append(link);
    }
    link.href = reading.href;
    link.title = reading.title;
    link.querySelector("span").textContent = reading.language;
    link.setAttribute("aria-label", `教材阅读：${link.title}`);
  }

  for (const name of ["cq:lesson-rendered", "cq:classroom-surface-change",
    "cq:workspace-data-change", "cq:participant-change", "cq:learning-layout-change"]) {
    global.addEventListener(name, sync);
  }
  new MutationObserver(sync).observe(shell, {
    attributes: true, attributeFilter: ["class", "data-classroom-surface"]
  });
  new MutationObserver(sync).observe(document.querySelector("#learn-view"), {
    attributes: true, attributeFilter: ["class"]
  });
  sync();
})(window);
