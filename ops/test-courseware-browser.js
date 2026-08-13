const assert = require("node:assert/strict");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright-core");

const root = path.resolve(__dirname, "..");
const route = require("../data/multi-scene-learning-route.json");
const basePath = "/calculus_quest";
const targetKnowledgePointId = String(process.env.COURSEWARE_BROWSER_TARGET || "").trim();
const targetChapterId = String(process.env.COURSEWARE_BROWSER_CHAPTER || "").trim();
const targetSurface = String(process.env.COURSEWARE_BROWSER_SURFACE || "both").trim().toLowerCase();
const targetHostFeatures = process.env.COURSEWARE_BROWSER_HOST_FEATURES === "1";
const browserCandidates = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"
].filter(Boolean);

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

async function waitForHealth(baseUrl, child, logs) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`server exited early (${child.exitCode})\n${logs.join("")}`);
    }
    try {
      const response = await fetch(`${baseUrl}${basePath}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`server health timeout\n${logs.join("")}`);
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 4000))
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

function coursewareEntries() {
  const entries = (route.chapters || []).flatMap((chapter) => (
    (chapter.modules || []).flatMap((module) => (
      (module.knowledgePoints || []).map((knowledgePoint) => ({
        chapter,
        module,
        knowledgePoint,
        resources: knowledgePoint.resourceCandidates || []
      }))
    ))
  ));
  return entries.filter((entry) => (
    (!targetKnowledgePointId || entry.knowledgePoint.id === targetKnowledgePointId)
    && (!targetChapterId || entry.chapter.id === targetChapterId)
  ));
}

function encodedResourcePath(candidate) {
  return `/${["resources", ...candidate.root.split("/"), ...candidate.file.split("/")]
    .map(encodeURIComponent)
    .join("/")}`;
}

function normalizedPathname(url) {
  return decodeURIComponent(new URL(url).pathname).replace(/^\/calculus_quest/, "");
}

function createBrowserIssueCollector(page) {
  const issues = [];
  page.on("pageerror", (error) => {
    issues.push({
      kind: "pageerror",
      url: page.url(),
      message: String(error?.stack || error?.message || error)
    });
  });
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const location = message.location();
    issues.push({
      kind: "console",
      url: location.url || page.url(),
      message: message.text()
    });
  });
  page.on("requestfailed", (request) => {
    const failure = request.failure()?.errorText || "";
    if (/ERR_ABORTED/i.test(failure)) return;
    issues.push({
      kind: "requestfailed",
      url: request.url(),
      message: failure
    });
  });
  return issues;
}

async function waitForCoursewareFrame(frameLocator, expectedPath) {
  await frameLocator.waitFor({ state: "visible", timeout: 10000 });
  await assertEventually(async () => {
    const src = await frameLocator.getAttribute("src");
    return src
      && normalizedPathname(new URL(src, "http://local.test").toString()) === decodeURIComponent(expectedPath);
  }, `iframe did not select ${expectedPath}`);
  const frame = frameLocator.contentFrame();
  await frame.locator("body").waitFor({ state: "attached", timeout: 10000 });
  await assertEventually(
    () => frame.locator("body").evaluate((body, decodedExpectedPath) => {
      const currentPath = decodeURIComponent(body.ownerDocument.location.pathname)
        .replace(/^\/calculus_quest/, "");
      return currentPath === decodedExpectedPath && body.ownerDocument.readyState === "complete";
    }, decodeURIComponent(expectedPath)),
    `iframe document did not finish loading ${expectedPath}`
  );
  return frame;
}

async function assertEventually(check, message, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      if (await check()) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  if (lastError) throw lastError;
  assert.fail(message);
}

async function waitForUsableBox(locator, options = {}) {
  const timeoutMs = Number(options.timeoutMs || 5000);
  const minWidth = Number(options.minWidth || 0);
  const minHeight = Number(options.minHeight || 0);
  const deadline = Date.now() + timeoutMs;
  let lastBox = null;
  while (Date.now() < deadline) {
    const box = await locator.boundingBox();
    lastBox = box;
    if (box && box.width >= minWidth && box.height >= minHeight) return box;
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  const diagnostic = await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const parentRect = element.parentElement?.getBoundingClientRect?.();
    const style = getComputedStyle(element);
    const parentStyle = element.parentElement ? getComputedStyle(element.parentElement) : null;
    return {
      element: {
        tagName: element.tagName,
        id: element.id,
        className: String(element.className || ""),
        rect: {
          width: Math.round(rect.width * 10) / 10,
          height: Math.round(rect.height * 10) / 10
        },
        display: style.display,
        visibility: style.visibility,
        position: style.position,
        flex: style.flex,
        minWidth: style.minWidth,
        maxWidth: style.maxWidth
      },
      parent: parentRect ? {
        tagName: element.parentElement?.tagName,
        id: element.parentElement?.id || "",
        className: String(element.parentElement?.className || ""),
        rect: {
          width: Math.round(parentRect.width * 10) / 10,
          height: Math.round(parentRect.height * 10) / 10
        },
        display: parentStyle?.display || "",
        flex: parentStyle?.flex || ""
      } : null
    };
  }).catch(() => null);
  assert.fail(`element did not reach a usable layout size ${JSON.stringify({
    required: { minWidth, minHeight },
    lastBox,
    diagnostic
  })}`);
}

async function frameHealth(frame, label, options = {}) {
  const health = await frame.locator("body").evaluate((body) => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width >= 2
        && rect.height >= 2
        && style.display !== "none"
        && style.visibility !== "hidden"
        && Number(style.opacity || 1) > 0.01;
    };
    const visibleControls = Array.from(
      body.querySelectorAll("button, input, select, textarea, [role='button'], [role='slider']")
    ).filter(visible);
    const visibleCanvases = Array.from(body.querySelectorAll("canvas")).filter(visible);
    const visibleContent = Array.from(body.querySelectorAll("main, section, article, canvas, svg, form, button, input"))
      .filter(visible);
    const bodyRect = body.getBoundingClientRect();
    return {
      title: document.title,
      bodyRect: {
        width: Math.round(bodyRect.width),
        height: Math.round(bodyRect.height)
      },
      scrollWidth: body.scrollWidth,
      scrollHeight: body.scrollHeight,
      textLength: (body.innerText || "").replace(/\s+/g, "").length,
      visibleControls: visibleControls.length,
      visibleContent: visibleContent.length,
      canvases: visibleCanvases.map((canvas) => ({
        width: canvas.width,
        height: canvas.height,
        rect: {
          width: Math.round(canvas.getBoundingClientRect().width),
          height: Math.round(canvas.getBoundingClientRect().height)
        }
      })),
      bridgeReady: window.__calculusQuestContextBridge === true
    };
  });

  assert.ok(health.bodyRect.width >= 300, `${label}: body width is too small`);
  assert.ok(health.bodyRect.height >= 180, `${label}: body height is too small`);
  assert.ok(
    health.textLength >= 12 || health.visibleContent > 0 || health.canvases.length > 0,
    `${label}: blank courseware body`
  );
  assert.ok(health.visibleControls > 0, `${label}: no visible controls`);
  health.canvases.forEach((canvas, index) => {
    assert.ok(canvas.width > 0 && canvas.height > 0, `${label}: canvas ${index + 1} has zero buffer`);
    assert.ok(canvas.rect.width >= 20 && canvas.rect.height >= 20, `${label}: canvas ${index + 1} is not visible`);
  });
  if (health.canvases.length && ["simulation", "visualization3d"].includes(options.type)) {
    assert.ok(
      health.canvases.some((canvas) => (
        canvas.rect.width >= health.bodyRect.width * 0.35
        && canvas.rect.height >= health.bodyRect.height * 0.25
      )),
      `${label}: primary canvas is too small for interaction`
    );
  }
  assert.equal(health.bridgeReady, true, `${label}: context bridge was not injected`);
  return health;
}

async function exerciseBasicControls(frame, label) {
  const ranges = frame.locator("input[type='range']:visible");
  if (await ranges.count()) {
    let range = ranges.first();
    if (await range.isEnabled()) {
      const rangeMarker = `cq-range-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      await range.evaluate((element, marker) => {
        element.setAttribute("data-cq-browser-range", marker);
      }, rangeMarker);
      range = frame.locator(`[data-cq-browser-range="${rangeMarker}"]`);
      await range.evaluate((element) => {
        element.scrollIntoView({ block: "center", inline: "center" });
      });
      const box = await waitForUsableBox(range, { minWidth: 40, minHeight: 4 });
      assert.ok(box, `${label}: range control has no layout box`);
      const before = Number(await range.inputValue());
      const min = Number(await range.getAttribute("min") || 0);
      const max = Number(await range.getAttribute("max") || 100);
      const currentRatio = max > min ? (before - min) / (max - min) : 0;
      const targetFraction = 0.5;
      const pointerHit = await range.evaluate((element, fraction) => {
        const rect = element.getBoundingClientRect();
        const target = document.elementFromPoint(
          rect.left + rect.width * fraction,
          rect.top + rect.height / 2
        );
        const overlay = target?.closest?.(
          "#overlay,[id*='overlay' i],[class*='overlay' i],"
          + "#start-screen,#startScreen,.start-screen,.startScreen,"
          + "#intro-screen,#introScreen,.intro-screen,.modal,[role='dialog']"
        );
        return {
          receivesPointer: target === element || element.contains(target),
          coveredByOverlay: Boolean(overlay),
          target: target ? {
            tagName: target.tagName,
            id: target.id,
            className: String(target.className || "")
          } : null
        };
      }, targetFraction);
      assert.ok(
        pointerHit.receivesPointer || pointerHit.coveredByOverlay,
        `${label}: range control is covered ${JSON.stringify(pointerHit)}`
      );
      if (pointerHit.receivesPointer) {
        assert.ok(
          box.width >= 40 && box.height >= 4,
          `${label}: range control is too small ${JSON.stringify(box)}`
        );
        let pointerError = "";
        try {
          await range.click({ timeout: 5000 });
        } catch (error) {
          pointerError = String(error?.message || error);
        }
        let after = Number(await range.inputValue());
        if (after === before) {
          await range.focus();
          await range.press(currentRatio >= 0.5 ? "Home" : "End");
          after = Number(await range.inputValue());
        }
        let pointerDiagnostics = null;
        if (after === before) {
          pointerDiagnostics = await range.evaluate((element, fraction) => {
            const rect = element.getBoundingClientRect();
            const frameElement = window.frameElement;
            const frameRect = frameElement?.getBoundingClientRect?.() || null;
            const localX = rect.left + rect.width * fraction;
            const localY = rect.top + rect.height / 2;
            const outerX = frameRect ? frameRect.left + localX : null;
            const outerY = frameRect ? frameRect.top + localY : null;
            const outerTarget = frameElement?.ownerDocument?.elementFromPoint?.(outerX, outerY) || null;
            return {
              viewport: { width: innerWidth, height: innerHeight },
              localRect: {
                left: rect.left,
                top: rect.top,
                right: rect.right,
                bottom: rect.bottom
              },
              frameRect: frameRect ? {
                left: frameRect.left,
                top: frameRect.top,
                right: frameRect.right,
                bottom: frameRect.bottom
              } : null,
              outerPoint: { x: outerX, y: outerY },
              outerTarget: outerTarget ? {
                tagName: outerTarget.tagName,
                id: outerTarget.id,
                className: String(outerTarget.className || "")
              } : null
            };
          }, targetFraction);
        }
        assert.ok(
          max <= min || after !== before,
          `${label}: range control did not respond to pointer or keyboard input ${JSON.stringify({
            before,
            after,
            min,
            max,
            targetFraction,
            box,
            pointerError,
            pointerDiagnostics
          })}`
        );
      }
    }
  }

  const startPattern = /开始|启动|进入|继续|体验|挑战|演示|start|play/i;
  const buttons = frame.locator("button:visible, [role='button']:visible");
  const buttonCount = Math.min(await buttons.count(), 20);
  const coveredControls = [];
  for (let index = 0; index < buttonCount; index += 1) {
    const button = buttons.nth(index);
    const text = (await button.innerText().catch(() => "")).trim();
    if (!startPattern.test(text)) continue;
    if (!await button.isEnabled().catch(() => false)) continue;
    await button.evaluate((element) => {
      element.scrollIntoView({ block: "center", inline: "center" });
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    const pointerHit = await button.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const target = document.elementFromPoint(
        rect.left + rect.width / 2,
        rect.top + rect.height / 2
      );
      return {
        receivesPointer: target === element || element.contains(target),
        button: {
          id: element.id,
          className: String(element.className || ""),
          text: (element.innerText || "").trim().slice(0, 120),
          rect: {
            left: Math.round(rect.left),
            top: Math.round(rect.top),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          }
        },
        target: target ? {
          tagName: target.tagName,
          id: target.id,
          className: String(target.className || ""),
          pointerEvents: getComputedStyle(target).pointerEvents,
          position: getComputedStyle(target).position,
          zIndex: getComputedStyle(target).zIndex
        } : null
      };
    });
    if (!pointerHit.receivesPointer) {
      coveredControls.push(pointerHit);
      continue;
    }
    await button.evaluate((element) => element.click());
    await new Promise((resolve) => setTimeout(resolve, 20));
    coveredControls.length = 0;
    break;
  }
  assert.equal(
    coveredControls.length,
    0,
    `${label}: all start controls are covered ${JSON.stringify(coveredControls)}`
  );
}

function resourceLabel(surface, entry, candidate) {
  return `${surface} ${entry.chapter.id}/${entry.knowledgePoint.id}/${candidate.type}`;
}

async function auditResource(surface, entry, candidate, check) {
  const label = resourceLabel(surface, entry, candidate);
  try {
    return await check(label);
  } catch (error) {
    const message = String(error?.message || error);
    throw new Error(message.startsWith(`${label}:`) ? message : `${label}: ${message}`, {
      cause: error
    });
  }
}

async function assertSlidePreview(page, label) {
  const wrap = page.locator("#slide-frame .flow-slide-wrap");
  await wrap.waitFor({ state: "visible", timeout: 5000 });
  const box = await wrap.boundingBox();
  assert.ok(box && box.width >= 300 && box.height >= 160, `${label}: Flow Test slide is too small`);
  assert.ok(await page.locator("#slide-frame .flow-slide-element").count(), `${label}: Flow Test slide is empty`);
}

async function ensureFlowNavigationOpen(page) {
  const toggle = page.locator("#toggle-navigation");
  await toggle.waitFor({ state: "visible", timeout: 10000 });
  if ((await toggle.getAttribute("aria-expanded")) !== "true") {
    await toggle.click();
  }
  await page.locator("[data-chapter-id]").first().waitFor({ state: "visible", timeout: 15000 });
}

async function auditFlowTest(page, entries) {
  await page.goto(`${basePath}/flow-test`, { waitUntil: "domcontentloaded" });
  await ensureFlowNavigationOpen(page);
  assert.equal(await page.locator("[data-chapter-id]").count(), route.chapters.length);

  let slides = 0;
  let resources = 0;
  let activeChapterId = "";
  for (const entry of entries) {
    if (entry.chapter.id !== activeChapterId) {
      if (activeChapterId) console.log(`[Flow Test] ${activeChapterId} 完成`);
      if (activeChapterId) {
        await page.goto(`${basePath}/flow-test`, { waitUntil: "domcontentloaded" });
        await ensureFlowNavigationOpen(page);
      }
      activeChapterId = entry.chapter.id;
      await page.locator(`[data-chapter-id="${entry.chapter.id}"]`).click();
    }
    await page.locator(`[data-kp-id="${entry.knowledgePoint.id}"]`).click();
    await page.locator("[data-resource-index]").first().click();
    await assertSlidePreview(page, `Flow Test ${entry.knowledgePoint.id}`);
    slides += 1;

    for (let index = 0; index < entry.resources.length; index += 1) {
      const candidate = entry.resources[index];
      await auditResource("Flow Test", entry, candidate, async (label) => {
        const expectedPath = encodedResourcePath(candidate);
        await page.locator("[data-resource-index]").nth(index + 1).click();
        const frameLocator = page.locator("#resource-frame");
        const frame = await waitForCoursewareFrame(frameLocator, expectedPath);
        await frameLocator.evaluate((element) => {
          element.scrollIntoView({ block: "center", inline: "center" });
        });
        await page.waitForTimeout(150);
        const frameBox = await frameLocator.boundingBox();
        assert.ok(frameBox && frameBox.width >= 500 && frameBox.height >= 250, `${label}: iframe is too small`);
        await frameHealth(frame, label, {
          type: candidate.type
        });
        await exerciseBasicControls(frame, label);
      });
      resources += 1;
      if (resources % 12 === 0) console.log(`[Flow Test] 已检查 ${resources}/288 个互动资源`);
    }
  }
  if (activeChapterId) console.log(`[Flow Test] ${activeChapterId} 完成`);
  return { slides, resources };
}

async function prepareFormalPlayer(page, participant, token) {
  await page.addInitScript(({ savedParticipant, authToken }) => {
    if (window !== window.top || location.href === "about:blank") return;
    const storageKey = "calculus-quest-openmaic-v14-player-v1";
    const participantId = savedParticipant.participantId;
    sessionStorage.setItem("calculus-quest-auth-token-v1", authToken);
    localStorage.setItem("calculus-quest-last-participant-v1", participantId);
    localStorage.setItem(`${storageKey}:${participantId}`, JSON.stringify({
      participant: savedParticipant,
      currentView: "learn",
      currentChapterId: "V14-C1",
      currentUnitId: ""
    }));
  }, { savedParticipant: participant, authToken: token });
  await page.goto(`${basePath}/`, { waitUntil: "domcontentloaded" });
  await page.locator("#app-loader.hidden").waitFor({ state: "attached", timeout: 20000 });
  await assertEventually(
    () => page.evaluate(() => Array.isArray(curriculum) && curriculum.length === 11),
    "formal curriculum did not load",
    20000
  );
  await page.evaluate(() => {
    window.__coursewareBrowserSignals = [];
    window.addEventListener("cq:learning-signal", (event) => {
      const signal = event.detail?.event;
      if (signal?.source === "iframe") window.__coursewareBrowserSignals.push(signal);
    });
    switchView("learn");
    const unitIds = curriculum.flatMap((chapter) => (chapter.units || []).map((unit) => unit.id));
    const extensionIds = curriculum.filter((chapter) => chapter.extension).map((chapter) => chapter.id);
    const pathState = ensureAgenticPath();
    pathState.unlocked = [...unitIds];
    pathState.visibleUnits = [...unitIds];
    pathState.unlockedExtensionChapters = [...extensionIds];
    pathState.chapterAdvanceReady = Object.fromEntries(curriculum.map((chapter) => [chapter.id, true]));
    renderAll();
  });
  await page.locator("#learn-view.active").waitFor({ state: "visible", timeout: 10000 });
}

async function selectFormalResource(page, entry, candidate) {
  await page.evaluate(() => {
    window.__coursewareBrowserSignals = [];
  });
  await page.evaluate(({ chapterId, unitId, type }) => {
    currentChapterId = chapterId;
    currentUnitId = unitId;
    const pathState = ensureAgenticPath();
    if (!pathState.unlocked.includes(unitId)) pathState.unlocked.push(unitId);
    if (!pathState.visibleUnits.includes(unitId)) pathState.visibleUnits.push(unitId);
    setKnowledgeSceneType(unitId, type);
    renderAll();
  }, {
    chapterId: entry.chapter.id,
    unitId: entry.knowledgePoint.id,
    type: candidate.type
  });

  const expectedPath = encodedResourcePath(candidate);
  const frameLocator = page.locator("iframe[data-courseware-frame]");
  const frame = await waitForCoursewareFrame(frameLocator, expectedPath);
  await assertEventually(
    async () => (await frameLocator.getAttribute("data-cq-context-bridge")) === "ready",
    `${entry.knowledgePoint.id}/${candidate.type}: bridge ready message missing`
  );
  await assertEventually(
    async () => Number(await frameLocator.getAttribute("data-host-layout-width")) > 0
      && Number(await frameLocator.getAttribute("data-host-layout-height")) > 0,
    `${entry.knowledgePoint.id}/${candidate.type}: host layout was not synchronized`
  );
  await frame.locator("body").evaluate((body) => {
    const probe = document.createElement("button");
    probe.type = "button";
    probe.textContent = "课件交互桥测试";
    probe.setAttribute("aria-label", "课件交互桥测试");
    probe.style.position = "fixed";
    probe.style.left = "-10000px";
    body.appendChild(probe);
    probe.dispatchEvent(new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      view: window
    }));
    probe.remove();
  });
  await assertEventually(
    () => page.evaluate(
      (expectedUnitId) => window.__coursewareBrowserSignals.some((signal) => (
        signal.eventType === "interactive_click" && signal.unitId === expectedUnitId
      )),
      entry.knowledgePoint.id
    ),
    `${entry.knowledgePoint.id}/${candidate.type}: bridge interaction did not reach analytics`
  );
  return { frame, frameLocator };
}

async function assertFormalSlide(page, label) {
  const canvas = page.locator("[data-slide-canvas]").first();
  await canvas.waitFor({ state: "visible", timeout: 5000 });
  const box = await canvas.boundingBox();
  assert.ok(box && box.width >= 300 && box.height >= 160, `${label}: formal slide is too small`);
  assert.ok(await canvas.locator(".slide-element").count(), `${label}: formal slide is empty`);
}

async function auditFormalPlayer(page, entries) {
  let slides = 0;
  let resources = 0;
  let activeChapterId = "";
  for (const entry of entries) {
    if (entry.chapter.id !== activeChapterId) {
      if (activeChapterId) console.log(`[正式站] ${activeChapterId} 完成`);
      activeChapterId = entry.chapter.id;
    }
    await page.evaluate(({ chapterId, unitId }) => {
      currentChapterId = chapterId;
      currentUnitId = unitId;
      renderAll();
    }, {
      chapterId: entry.chapter.id,
      unitId: entry.knowledgePoint.id
    });
    await assertFormalSlide(page, `正式站 ${entry.knowledgePoint.id}`);
    slides += 1;

    for (const candidate of entry.resources) {
      await auditResource("正式站", entry, candidate, async (label) => {
        const { frame, frameLocator } = await selectFormalResource(page, entry, candidate);
        await frameLocator.evaluate((element) => {
          element.scrollIntoView({ block: "center", inline: "center" });
        });
        await page.waitForTimeout(150);
        const frameBox = await frameLocator.boundingBox();
        assert.ok(frameBox && frameBox.width >= 500 && frameBox.height >= 250, `${label}: iframe is too small`);
        await frameHealth(frame, label, {
          type: candidate.type
        });
        await exerciseBasicControls(frame, label);
      });
      resources += 1;
      if (resources % 12 === 0) console.log(`[正式站] 已检查 ${resources}/288 个互动资源`);
    }
  }
  if (activeChapterId) console.log(`[正式站] ${activeChapterId} 完成`);
  return { slides, resources };
}

async function assertFullscreen(page, button, target, label) {
  await button.click();
  await assertEventually(
    () => page.evaluate(() => Boolean(document.fullscreenElement || document.querySelector(".is-local-fullscreen, .is-local-fullscreen-target"))),
    `${label}: fullscreen did not activate`
  );
  const viewport = page.viewportSize();
  const box = await target.boundingBox();
  assert.ok(box && box.width >= viewport.width * 0.8, `${label}: fullscreen width is too small`);
  assert.ok(box && box.height >= viewport.height * 0.75, `${label}: fullscreen height is too small`);
  await page.keyboard.press("Escape");
  await assertEventually(
    () => page.evaluate(() => !document.fullscreenElement && !document.querySelector(".is-local-fullscreen, .is-local-fullscreen-target")),
    `${label}: fullscreen did not exit`
  );
}

async function assertGh04Drag(page, surface) {
  const entry = coursewareEntries().find((item) => item.knowledgePoint.id === "GH-04-K01");
  const candidate = entry.resources.find((item) => item.type === "game");
  let frame;
  if (surface === "flow") {
    await page.locator(`[data-chapter-id="${entry.chapter.id}"]`).click();
    await page.locator(`[data-kp-id="${entry.knowledgePoint.id}"]`).click();
    await page.locator("[data-resource-index]").nth(entry.resources.indexOf(candidate) + 1).click();
    frame = await waitForCoursewareFrame(page.locator("#resource-frame"), encodedResourcePath(candidate));
  } else {
    ({ frame } = await selectFormalResource(page, entry, candidate));
  }

  const start = frame.locator("#start-btn");
  if (await start.isVisible()) await start.click();
  await page.waitForTimeout(800);
  const correct = frame.locator(".piece.correct");
  const zone = frame.locator("#answer-zone");
  const samples = [];
  for (let index = 0; index < 4; index += 1) {
    const box = await correct.boundingBox();
    samples.push(box?.y || 0);
    await page.waitForTimeout(100);
  }
  assert.ok(
    Math.max(...samples) - Math.min(...samples) < 0.5,
    `${surface}: GH-04 draggable card keeps moving ${JSON.stringify(samples)}`
  );

  const from = await correct.boundingBox();
  const to = await zone.boundingBox();
  assert.ok(from && to, `${surface}: GH-04 drag target is not visible`);
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
  await page.mouse.up();
  await assertEventually(
    async () => (await zone.getAttribute("class") || "").includes("correct"),
    `${surface}: GH-04 correct card did not drop`
  );
}

async function verifyFlowHostFeatures(flowPage) {
  const firstEntry = coursewareEntries()[0];
  const firstCandidate = firstEntry.resources[0];

  await flowPage.locator(`[data-chapter-id="${firstEntry.chapter.id}"]`).click();
  await flowPage.locator(`[data-kp-id="${firstEntry.knowledgePoint.id}"]`).click();
  await flowPage.locator("[data-resource-index]").nth(1).click();
  await waitForCoursewareFrame(flowPage.locator("#resource-frame"), encodedResourcePath(firstCandidate));
  await assertFullscreen(
    flowPage,
    flowPage.locator("#slide-fullscreen"),
    flowPage.locator(".frame-shell"),
    "Flow Test 课件全屏"
  );
}

async function verifyFormalHostFeatures(formalPage) {
  const firstEntry = coursewareEntries()[0];
  const firstCandidate = firstEntry.resources[0];
  await selectFormalResource(formalPage, firstEntry, firstCandidate);
  await assertFullscreen(
    formalPage,
    formalPage.locator("[data-knowledge-scene-fullscreen]"),
    formalPage.locator("[data-knowledge-scene-stage]"),
    "正式站互动课件全屏"
  );
  await assertFullscreen(
    formalPage,
    formalPage.locator("[data-resource-fullscreen]").first(),
    formalPage.locator("[data-resource-fullscreen-target]").first(),
    "正式站讲解页全屏"
  );
  await assertFullscreen(
    formalPage,
    formalPage.locator("#fullscreen-player"),
    formalPage.locator(".learning-shell"),
    "正式站学习区全屏"
  );
}

async function main() {
  const executablePath = browserCandidates.find((candidate) => fs.existsSync(candidate));
  assert.ok(executablePath, "Chrome or Edge executable was not found");
  const entries = coursewareEntries();
  assert.ok(entries.length, targetKnowledgePointId
    ? `knowledge point was not found: ${targetKnowledgePointId}`
    : targetChapterId
      ? `chapter was not found: ${targetChapterId}`
      : "courseware route has no knowledge points");
  if (!targetKnowledgePointId && !targetChapterId) {
    assert.equal(entries.length, 72);
    assert.equal(entries.reduce((sum, entry) => sum + entry.resources.length, 0), 288);
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cq-courseware-browser-"));
  const dbPath = path.join(tmpDir, "courseware-browser.db");
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const logs = [];
  let child;
  let browser;

  try {
    child = spawn(process.execPath, ["server.js", String(port)], {
      cwd: root,
      env: {
        ...process.env,
        DB_PATH: dbPath,
        HOST: "127.0.0.1",
        BASE_PATH: `${basePath}/`,
        LLM_PROVIDER: "mock",
        NODE_ENV: "test"
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    child.stdout.on("data", (chunk) => logs.push(chunk.toString()));
    child.stderr.on("data", (chunk) => logs.push(chunk.toString()));
    await waitForHealth(baseUrl, child, logs);

    const nickname = `课件浏览器测试${Date.now().toString().slice(-7)}`;
    const registerResponse = await fetch(`${baseUrl}${basePath}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nickname,
        email: "",
        password: "courseware-browser-password"
      })
    });
    const registration = await registerResponse.json();
    assert.equal(registerResponse.status, 200, JSON.stringify(registration));

    browser = await chromium.launch({
      executablePath,
      headless: true,
      args: [
        "--disable-extensions",
        "--enable-webgl",
        "--ignore-gpu-blocklist",
        "--use-angle=swiftshader"
      ]
    });
    const context = await browser.newContext({
      baseURL: baseUrl,
      viewport: { width: 1600, height: 1000 },
      reducedMotion: "reduce"
    });
    const flowPage = await context.newPage();
    const formalPage = await context.newPage();
    const flowIssues = createBrowserIssueCollector(flowPage);
    const formalIssues = createBrowserIssueCollector(formalPage);

    let formalResult = null;
    let flowResult = null;
    const dragRegression = [];
    const fullscreen = [];
    if (targetSurface !== "flow") {
      await prepareFormalPlayer(formalPage, registration.participant, registration.token);
      formalResult = await auditFormalPlayer(formalPage, entries);
      await formalPage.goto("about:blank");
    }
    if (targetSurface !== "formal") {
      flowResult = await auditFlowTest(flowPage, entries);
    }
    const shouldCheckGh04Drag = (
      (!targetKnowledgePointId && (!targetChapterId || targetChapterId === "V14-C2"))
      || targetKnowledgePointId === "GH-04-K01"
    );
    if (shouldCheckGh04Drag) {
      if (targetSurface !== "formal") {
        if (targetKnowledgePointId) {
          await flowPage.goto(`${basePath}/flow-test`, { waitUntil: "domcontentloaded" });
          await ensureFlowNavigationOpen(flowPage);
        }
        await assertGh04Drag(flowPage, "flow");
        dragRegression.push("flow");
      }
      if (targetSurface !== "flow") {
        await prepareFormalPlayer(formalPage, registration.participant, registration.token);
        await assertGh04Drag(formalPage, "formal");
        dragRegression.push("formal");
      }
    }
    if ((!targetKnowledgePointId && !targetChapterId) || targetHostFeatures) {
      if (targetSurface !== "formal") {
        await verifyFlowHostFeatures(flowPage);
        fullscreen.push("flow-courseware");
      }
      if (targetSurface !== "flow") {
        if (formalPage.url() === "about:blank") {
          await prepareFormalPlayer(formalPage, registration.participant, registration.token);
        }
        assert.notEqual(
          formalPage.url(),
          "about:blank",
          "formal host features must run against the prepared learning player"
        );
        await verifyFormalHostFeatures(formalPage);
        fullscreen.push("formal-courseware", "formal-slide", "formal-learning");
      }
    }

    assert.deepEqual(flowIssues, [], `Flow Test browser issues:\n${JSON.stringify(flowIssues, null, 2)}`);
    assert.deepEqual(formalIssues, [], `Formal player browser issues:\n${JSON.stringify(formalIssues, null, 2)}`);
    console.log(JSON.stringify({
      ok: true,
      flow: flowResult,
      formal: formalResult,
      dragRegression,
      fullscreen,
      basePath,
      targetKnowledgePointId: targetKnowledgePointId || null,
      targetChapterId: targetChapterId || null,
      targetSurface
    }, null, 2));
  } finally {
    await browser?.close().catch(() => {});
    await stopChild(child);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
