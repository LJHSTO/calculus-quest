'use strict';
const VERSION = 'first-session-90min-r11';
const plan = Object.freeze({ version: VERSION, targetSeconds: 4800, maximumSeconds: 5400, posttestReserveFromSeconds: 3840, delayedFollowupIncluded: false });
function project(run, now = Date.now()) {
  if (!run?.firstSessionBudget || run.firstSessionBudget.version !== VERSION) return null;
  const started = Date.parse(run.firstSessionBudget.startedAt), finished = Date.parse(run.finalSurveyAt || '');
  if (!Number.isFinite(started)) return null;
  const observedSeconds = Math.max(0, Math.floor(((Number.isFinite(finished) ? finished : now) - started) / 1000));
  const elapsedSeconds = run.mode === 'formal' ? Math.min(plan.maximumSeconds, observedSeconds) : observedSeconds;
  return { ...plan, startedAt: run.firstSessionBudget.startedAt, deadlineAt: new Date(started + plan.maximumSeconds * 1000).toISOString(), serverNow: new Date(now).toISOString(), elapsedSeconds, remainingSeconds: Math.max(0, plan.maximumSeconds - elapsedSeconds), completed: Number.isFinite(finished), expired: !Number.isFinite(finished) && elapsedSeconds >= plan.maximumSeconds, enforce: run.mode === 'formal', reservePosttest: !Number.isFinite(finished) && elapsedSeconds >= plan.posttestReserveFromSeconds };
}
function start(at) { if (!Number.isFinite(Date.parse(at))) throw Error('首次学习开始时间无效'); return { ...plan, startedAt: at }; }
function assertOpen(run, now = Date.now()) {
  const state = project(run, now);
  if (state?.enforce && state.expired) throw Object.assign(new Error('本次现场学习的90分钟已结束，已有作答和草稿保留；未完成部分记录为未完成。延迟随访另行开放。'), { status: 409, code: 'FIRST_SESSION_TIME_LIMIT' });
}
module.exports = { version: VERSION, plan, start, project, assertOpen };
