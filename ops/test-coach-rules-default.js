const assert = require("node:assert/strict");
delete process.env.COACH_NARRATION_LLM_ENABLED;
const llm = require("../lib/llm");
llm.completeChat = async () => { throw new Error("默认规则推荐不应调用模型"); };
require("../lib/agentic-coach").explain({ ok: true }).then((result) => {
  assert.equal(result.provider, "rules");
  assert.match(result.narration, /选择下一步/);
  console.log("推荐文案默认规则模式：无需模型调用即可返回。");
}).catch((error) => { console.error(error); process.exitCode = 1; });
