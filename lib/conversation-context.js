"use strict";

// A bounded representation of server-selected conversation data, not a new
// cross-conversation store or a model-authored claim about learning.
const MESSAGE_LIMIT = 60;
const RECENT_MESSAGE_LIMIT = 12;
const RECENT_CONTENT_LIMIT = 1200;
const EARLIER_CONTENT_BUDGET = 6000;

function text(value, limit) {
  return String(value ?? "").replace(/\u0000/g, "").replace(/\r\n?/g, "\n").trim().slice(0, limit);
}

function excerpt(content, limit) {
  if (content.length <= limit) return { content, truncated: false };
  const marker = "\n[中间原文已省略]\n";
  const available = Math.max(0, limit - marker.length);
  const head = Math.ceil(available * .65);
  return { content: content.slice(0, head) + marker + content.slice(-(available - head)), truncated: true };
}

function buildConversationContext(history = [], scope = {}) {
  const valid = (Array.isArray(history) ? history : [])
    .filter(item => item && ["user", "assistant"].includes(item.role))
    .map(item => ({ role: item.role, content: text(item.content, 1800) }))
    .filter(item => item.content);
  const bounded = valid.slice(-MESSAGE_LIMIT);
  const split = Math.max(0, bounded.length - RECENT_MESSAGE_LIMIT);
  const earlier = bounded.slice(0, split);
  const earlierLimit = earlier.length ? Math.floor(EARLIER_CONTENT_BUDGET / earlier.length) : 0;
  const earlierConversation = earlier.map((item, index) => ({
    messagePosition: index + 1, role: item.role,
    ...excerpt(item.content, earlierLimit), evidenceType: "conversation_excerpt"
  }));
  const recentConversation = bounded.slice(split).map(item => ({
    role: item.role, content: excerpt(item.content, RECENT_CONTENT_LIMIT).content
  }));
  return {
    recentConversation, earlierConversation,
    coverage: {
      scope: "server_selected_conversation",
      chapterId: text(scope.chapterId, 80), knowledgePointId: text(scope.knowledgePointId, 100),
      threadKey: text(scope.threadKey, 180), messageLimit: MESSAGE_LIMIT,
      sourceMessageCount: bounded.length, recentMessageCount: recentConversation.length,
      earlierMessageCount: earlierConversation.length,
      discardedOutsideWindow: Math.max(0, valid.length - bounded.length),
      earlierContextType: "verbatim_excerpts",
      containsTruncation: earlierConversation.some(item => item.truncated)
        || bounded.slice(split).some(item => item.content.length > RECENT_CONTENT_LIMIT),
      contentCharacterCount: [...recentConversation, ...earlierConversation].reduce((sum, item) => sum + item.content.length, 0)
    }
  };
}

module.exports = { buildConversationContext };
