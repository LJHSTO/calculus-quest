'use strict';
const crypto = require('node:crypto');

// Keep identifying records separate from anonymous study exports and prompts.
// The document is included in the protocol fingerprint and archived on signing.
function document() {
  const contact = String(process.env.STUDY_CONTACT || '请通过现场主试联系研究负责人').trim();
  const sections = [
    ['研究目的', '本研究了解学生如何使用和调整 AI 学习帮助，以及这些经历与后续独立学习的关系。参与表现不计入课程成绩。'],
    ['研究安排', '参加者须年满18周岁。完成本页后开始一次最长90分钟的学习，包括问卷、独立测验、函数与极限课件及学习回顾；三天后返回完成独立测验与14分钟调节任务。系统会随机安排一种帮助方式。'],
    ['可能的不适', '学习和问卷可能使你疲劳，帮助提醒可能打断思考。AI 的解释可能有误，请结合课件核对。你可以暂停或退出，不必说明理由。'],
    ['记录与用途', '系统保存学习操作、帮助设置、对话、答题、问卷及时间记录，用于研究分析。姓名和电子签名另行保存，用于核对参与和同意记录；常规研究导出和评分材料不包含这份实名签署记录。请勿在对话或开放题中填写其他人的个人信息。'],
    ['AI 服务', '向知点提问或请求讲解时，必要的课程内容、相关作答和对话会发送到研究平台配置的模型服务。本次独立测验的简答题由评分者按量规复核。电子签署记录不会作为模型输入。'],
    ['填写与退出', '问卷标明的必答题须填写后才能提交，选填题可以留空；不适用题可按实际情况选择“不适用”。你可以停止填写并联系主试退出，已有草稿会保留。退出后的数据处理、保管期限及其他参与安排，请在签署前向研究负责人确认。'],
    ['联系与确认', contact + '。如对研究、数据使用或退出处理仍有疑问，请先咨询，理解后再签署。']
  ];
  const value = {version:'study-consent-20261113-v2',title:'学习研究知情同意书',contact,sections,signatureMethod:'typed_name_confirmation',reviewStatus:'draft_for_teacher_review'};
  return {...value,hash:crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')};
}
function validate(input, doc = document()) {
  const name = typeof input.participantName === 'string' ? input.participantName.trim().normalize('NFC') : '';
  const signature = typeof input.signature === 'string' ? input.signature.trim().normalize('NFC') : '';
  const fail = message => {throw Object.assign(new Error(message), {status:400});};
  if(input.consentVersion !== doc.version || input.consentHash !== doc.hash)fail('同意书已更新，请重新阅读后签署');
  if(name.length<2||name.length>80||/[\u0000-\u001f<>]/.test(name))fail('请填写完整姓名（2至80字）');
  if(signature!==name)fail('请在电子签名处再次填写相同的完整姓名');
  if(input.consent!==true||input.adult!==true)fail('请确认年满18周岁，并已理解研究安排、自愿参加');
  return {participantName:name,signature,signatureMethod:doc.signatureMethod,consent:true,adult:true,document:doc};
}
module.exports={document,validate};
