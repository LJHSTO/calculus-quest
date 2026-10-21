"use strict";

// Rebuildable, source-linked history, never an inferred ability score.
function buildLearnerMemory({ userId, generation, chapterId, points = [], rows = [], index = new Map(), now = Date.now() }) {
  const byPoint = new Map(points.map(point => [point.id, { id:point.id, name:point.name, correct:0, incorrect:0, pending:0, lastObservedAt:null, sources:[] }]));
  const latest = new Map();
  for (const row of rows) {
    const time = Date.parse(row.created_at);
    if (String(row.user_id)!==String(userId) || row.chapter_id!==chapterId || Number(row.learning_generation)!==Number(generation) || !Number.isFinite(time) || time>now) continue;
    if (!latest.has(row.question_id) || Date.parse(latest.get(row.question_id).created_at)<time) latest.set(row.question_id,row);
  }
  for (const row of latest.values()) {
    const entry=index.get(row.question_id), ids=entry?.question?.knowledgePointIds || (entry?.knowledgePointId ? [entry.knowledgePointId] : []);
    for (const id of new Set(ids)) {
      const point=byPoint.get(id);if(!point)continue;
      const pending=row.status==="pending_review" || row.is_correct===null || ![0,1].includes(Number(row.is_correct));
      point[pending?"pending":Number(row.is_correct)===1?"correct":"incorrect"]++;
      if(!point.lastObservedAt || Date.parse(point.lastObservedAt)<Date.parse(row.created_at))point.lastObservedAt=row.created_at;
      point.sources.push({id:row.id,kind:"quiz_result",at:row.created_at,status:pending?"pending":Number(row.is_correct)===1?"correct":"incorrect",phase:row.phase});
    }
  }
  return {version:"sourced-history-v1",generation,chapterId,generatedAt:new Date(now).toISOString(),historyIsMasteryEvidence:false,
    coverage:"当前学习轮次内，最多最近 500 条课程测验记录；每题取最新提交。",
    points:[...byPoint.values()].map(point=>({...point,needsFreshObservation:Boolean(point.lastObservedAt && now-Date.parse(point.lastObservedAt)>=72*3600000),sources:point.sources.slice(0,30)}))};
}
module.exports={buildLearnerMemory};
