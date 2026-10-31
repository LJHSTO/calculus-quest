"use strict";
const crypto=require('node:crypto');
function create({id,run,scope,sceneType,profileRevision,profile={},content,plan={},supportLevel,expiresAt,source,contentVersion}){
 return {version:'help-spec-v1',id,runId:run?.id||null,mode:run?.mode||'engineering',protocolFingerprint:run?.protocolFingerprint||null,
  configurationRevision:profileRevision??null,knowledgePointId:scope,sceneType:sceneType||'slide',
  goal:plan.primaryGoal||'cognitive',supportLevel:plan.knowledgeScaffoldLevel||supportLevel||null,dose:plan.dose||profile.supportDose||null,
  contentSource:source,contentVersion:contentVersion||content?.audit?.contentVersion||null,
  contentHash:content?.audit?.contentHash||crypto.createHash('sha256').update(JSON.stringify(content||{})).digest('hex'),
  requiresConfirmation:profile.supportInquiryEnabled===true,expiresAt:expiresAt||null,
  recheck:['configuration','scene','independent_assessment','closed_or_declined'],visibility:{minimumFraction:.5,minimumDurationMs:1000}};
}
module.exports={create};
