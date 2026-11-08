(function (global) {
  'use strict';
  let budget = null, runId = null, receivedAt = 0, badge = null, notice = null, warned = new Set();
  const format = n => Math.floor(Math.max(0, n) / 60) + ':' + String(Math.floor(Math.max(0, n)) % 60).padStart(2, '0');
  const elapsedNow = () => {
    if (!budget) return 0;
    const elapsed = budget.elapsedSeconds + (budget.completed ? 0 : Math.max(0, Math.floor((performance.now() - receivedAt) / 1000)));
    return budget.enforce ? Math.min(budget.maximumSeconds, elapsed) : elapsed;
  };
  const closed = () => Boolean(budget?.enforce && !budget.completed && elapsedNow() >= budget.maximumSeconds);
  function explain(expired = false) {
    notice?.remove(); notice = document.createElement('dialog'); notice.className = 'first-session-budget-dialog';
    const title = document.createElement('h2'); title.textContent = expired ? '本次现场学习时间已到' : '本次学习的时间安排';
    const description = document.createElement('p'); description.textContent = expired
      ? '90分钟已结束。已保存的作答和草稿会保留；未完成的环节会如实记录，不会记成已掌握。请按研究负责人的安排结束本次现场学习，延迟随访另计。'
      : '首次现场按80分钟安排，另留10分钟缓冲。每个知识点完成讲解、一种核心互动和两题检测；其他探索可按需要选择。请为最后的独立后测与问卷保留约16分钟。三天后的随访另计。';
    const close = document.createElement('button'); close.type = 'button'; close.textContent = expired ? '知道了，查看已保存内容' : '继续当前学习'; close.onclick = () => notice.close();
    notice.append(title, description, close); document.body.append(notice); notice.showModal();
  }
  function paint() {
    badge?.remove(); badge = null;
    if (!budget) return;
    if (closed() && !warned.has(runId)) { warned.add(runId); global.dispatchEvent(new CustomEvent('cq:first-session-closed', { detail: { runId } })); explain(true); }
  }
  function update(run) {
    if (runId !== run?.id) { notice?.close(); notice?.remove(); notice = null; }
    runId = run?.id || null; budget = run?.firstSessionClock || null; receivedAt = performance.now(); paint();
  }
  global.FirstSessionBudget = Object.freeze({ update, get closed() { return closed(); } });
  global.addEventListener('cq:proactive-state', event => { if (!event.detail?.signedIn) update(null); });
  setInterval(paint, 1000);
})(window);
