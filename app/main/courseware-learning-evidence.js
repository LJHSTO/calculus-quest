(function initCoursewareLearningEvidence(globalScope, factory) {
  const exported = factory();

  if (typeof module !== "undefined" && module.exports) {
    module.exports = exported;
  }

  if (!globalScope?.document || globalScope.OpenMaicLearningEvidence) return;

  const client = exported.createLearningEvidenceClient({
    window: globalScope,
    document: globalScope.document
  });
  Object.assign(client, {
    relativeAccuracy: exported.relativeAccuracy,
    evaluateDisplacementAttempt: exported.evaluateDisplacementAttempt,
    expectedIntegralZone: exported.expectedIntegralZone
  });
  globalScope.OpenMaicLearningEvidence = client;

  const announceScene = () => client.emit("scene_entered", {
    phase: "enter",
    completed: false
  });
  if (globalScope.document.readyState === "loading") {
    globalScope.document.addEventListener("DOMContentLoaded", announceScene, { once: true });
  } else {
    globalScope.setTimeout(announceScene, 0);
  }
})(typeof window !== "undefined" ? window : null, function coursewareLearningEvidenceFactory() {
  "use strict";

  const CONTRACT_SELECTOR = [
    "#openmaic-semantic-contract",
    "script[data-openmaic-semantic-contract]"
  ].join(",");
  const CONTRACT_EVENT_FIELDS = [
    "schema_version",
    "contract_revision",
    "course_version",
    "chapter_id",
    "module_id",
    "knowledge_point_id",
    "concept_tag",
    "scene_type",
    "resource_id",
    "resource_title",
    "learning_objective",
    "misconception"
  ];

  function finiteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function relativeAccuracy(approximateArea, trueArea) {
    const approximate = finiteNumber(approximateArea, 0);
    const target = finiteNumber(trueArea, 0);
    if (target <= 0) return approximate === 0 ? 1 : 0;
    const relativeError = Math.abs(approximate - target) / Math.abs(target);
    return Math.max(0, Math.min(1, 1 - relativeError));
  }

  function evaluateDisplacementAttempt({
    target = 0,
    position = 0,
    totalDistance = 0,
    hadPositiveVelocity = false,
    hadNegativeVelocity = false,
    tolerance = 1,
    minimumMovement = 2
  } = {}) {
    const targetValue = finiteNumber(target, 0);
    const positionValue = finiteNumber(position, 0);
    const distanceValue = Math.max(0, finiteNumber(totalDistance, 0));
    const error = Math.abs(positionValue - targetValue);
    const precisionPassed = error < Math.max(0.01, finiteNumber(tolerance, 1));
    let conceptPassed = false;
    let reason = "";

    if (targetValue === 0) {
      conceptPassed = Boolean(
        hadPositiveVelocity
        && hadNegativeVelocity
        && distanceValue >= Math.max(0.1, finiteNumber(minimumMovement, 2))
      );
      if (!conceptPassed) reason = "需要用正、负速度形成相互抵消的位移";
    } else if (targetValue < 0) {
      conceptPassed = Boolean(hadNegativeVelocity && distanceValue >= 0.5);
      if (!conceptPassed) reason = "负目标需要产生负速度与负位移";
    } else {
      conceptPassed = Boolean(hadPositiveVelocity && distanceValue >= 0.5);
      if (!conceptPassed) reason = "正目标需要产生正速度与正位移";
    }

    if (!precisionPassed) reason = `最终位置与目标相差 ${error.toFixed(2)}m`;
    return {
      passed: precisionPassed && conceptPassed,
      precisionPassed,
      conceptPassed,
      error,
      reason
    };
  }

  function expectedIntegralZone(expression = {}) {
    if (expression.isError === true) return "error";
    const category = String(expression.category || "").trim().toLowerCase();
    return ["determinate", "indefinite"].includes(category) ? category : "error";
  }

  function readSemanticContract(documentRef) {
    const node = documentRef?.querySelector?.(CONTRACT_SELECTOR);
    if (!node) return {};
    try {
      const parsed = JSON.parse(String(node.textContent || "{}"));
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  function defaultIdFactory(windowRef, now) {
    return () => {
      try {
        if (typeof windowRef?.crypto?.randomUUID === "function") {
          return windowRef.crypto.randomUUID();
        }
      } catch {}
      return `cw-${now()}-${Math.random().toString(36).slice(2, 10)}`;
    };
  }

  function createLearningEvidenceClient({
    window: windowRef,
    document: documentRef,
    now = () => Date.now(),
    createId
  } = {}) {
    const contract = readSemanticContract(documentRef);
    const idFactory = typeof createId === "function"
      ? createId
      : defaultIdFactory(windowRef, now);
    const sceneStartedAt = now();
    let attemptNumber = 0;
    let pendingHintCount = 0;
    let pendingResetCount = 0;
    let activeAttempt = null;
    let lastAttempt = null;

    function eventBase(eventType, payload = {}, attempt = activeAttempt || lastAttempt) {
      const base = {};
      CONTRACT_EVENT_FIELDS.forEach((key) => {
        if (contract[key] !== undefined) base[key] = contract[key];
      });
      const timestamp = new Date(now()).toISOString();
      return {
        ...base,
        event_id: idFactory(),
        event_type: String(eventType || "").trim().toLowerCase(),
        timestamp,
        time_on_task_ms: Math.max(0, now() - sceneStartedAt),
        ...(attempt ? {
          attempt_id: attempt.attempt_id,
          attempt_number: attempt.attempt_number,
          hint_count: attempt.hint_count,
          reset_count: attempt.reset_count,
          independent: attempt.independent
        } : {
          hint_count: pendingHintCount,
          reset_count: pendingResetCount,
          independent: pendingHintCount === 0 && pendingResetCount === 0
        }),
        ...payload
      };
    }

    function post(payload) {
      const message = { type: "maic_learning_event", payload };
      try {
        const target = windowRef?.parent || windowRef;
        target?.postMessage?.(message, "*");
      } catch {}
      try {
        const CustomEventCtor = windowRef?.CustomEvent;
        if (typeof CustomEventCtor === "function") {
          windowRef.dispatchEvent?.(new CustomEventCtor("openmaic:learning-evidence", {
            detail: payload
          }));
        }
      } catch {}
      return payload;
    }

    function emit(eventType, payload = {}) {
      return post(eventBase(eventType, payload));
    }

    function recordHint(payload = {}) {
      pendingHintCount += 1;
      return post(eventBase("hint_requested", payload, null));
    }

    function recordReset(payload = {}) {
      pendingResetCount += 1;
      return post(eventBase("reset_used", payload, null));
    }

    function recordAttempt(payload = {}) {
      attemptNumber += 1;
      activeAttempt = {
        attempt_id: String(payload.attempt_id || idFactory()),
        attempt_number: attemptNumber,
        hint_count: pendingHintCount,
        reset_count: pendingResetCount,
        independent: payload.independent === undefined
          ? pendingHintCount === 0 && pendingResetCount === 0
          : Boolean(payload.independent)
      };
      return post(eventBase("attempt_submitted", payload, activeAttempt));
    }

    function recordChallenge(payload = {}) {
      const attemptPayload = { ...payload };
      delete attemptPayload.result;
      recordAttempt(attemptPayload);
      const result = post(eventBase("challenge_result", payload, activeAttempt));
      post(eventBase("independent_check_completed", {
        ...payload,
        verification_source: "courseware_game"
      }, activeAttempt));
      lastAttempt = { ...activeAttempt };
      activeAttempt = null;
      pendingHintCount = 0;
      pendingResetCount = 0;
      return result;
    }

    function completeScene(payload = {}) {
      return post(eventBase("scene_completed", payload, activeAttempt || lastAttempt));
    }

    function state() {
      return {
        attemptNumber,
        pendingHintCount,
        pendingResetCount,
        activeAttempt: activeAttempt ? { ...activeAttempt } : null,
        lastAttempt: lastAttempt ? { ...lastAttempt } : null
      };
    }

    return {
      schemaVersion: 1,
      contract: { ...contract },
      emit,
      recordHint,
      recordReset,
      recordAttempt,
      recordChallenge,
      completeScene,
      getState: state
    };
  }

  return {
    createLearningEvidenceClient,
    evaluateDisplacementAttempt,
    expectedIntegralZone,
    relativeAccuracy
  };
});
