// LLM adapter. Defaults to a mock provider so local development never blocks on the network.
// Set LLM_PROVIDER=pioneer (and PIONEER_API_KEY / PIONEER_BASE_URL) to switch to a live provider.

const PIONEER_DEFAULT_BASE_URL = "https://api.pioneer.ai/v1";
const PIONEER_DEFAULT_MODEL = "pioneer/auto";

function provider() {
  return (process.env.LLM_PROVIDER || "mock").toLowerCase();
}

async function complete({ system, user, jsonHint = false, maxTokens = 600 } = {}) {
  const which = provider();
  if (which === "pioneer") return pioneerComplete({ system, user, jsonHint, maxTokens });
  return mockComplete({ system, user, jsonHint });
}

// Pioneer adapter uses the OpenAI Responses API (`POST /v1/responses`).
async function pioneerComplete({ system, user, jsonHint, maxTokens }) {
  const baseUrl = process.env.PIONEER_BASE_URL || PIONEER_DEFAULT_BASE_URL;
  const apiKey = process.env.PIONEER_API_KEY;
  const model = process.env.PIONEER_MODEL || PIONEER_DEFAULT_MODEL;
  if (!apiKey) throw new Error("PIONEER_API_KEY is not set");
  const body = {
    model,
    input: [
      { role: "system", content: [{ type: "input_text", text: system || "" }] },
      { role: "user", content: [{ type: "input_text", text: user || "" }] }
    ],
    max_output_tokens: maxTokens
  };
  if (jsonHint) body.response_format = { type: "json_object" };
  const res = await fetch(new URL("/v1/responses", baseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Pioneer LLM HTTP ${res.status}: ${txt.slice(0, 200)}`);
  }
  const json = await res.json();
  const text = json.output_text
    || (Array.isArray(json.output)
      ? json.output.flatMap((item) => (item.content || []).map((part) => part.text || "")).join("")
      : "");
  return { provider: "pioneer", text };
}

// Mock provider: composes a deterministic Chinese narration from a "draft" payload embedded in the user prompt.
// The user prompt template that calls this MUST embed a JSON block tagged `<<<plan_json>>> ... <<<end>>>`.
function mockComplete({ user }) {
  const planMatch = String(user || "").match(/<<<plan_json>>>([\s\S]*?)<<<end>>>/);
  let plan = {};
  if (planMatch) {
    try { plan = JSON.parse(planMatch[1]); } catch { plan = {}; }
  }
  const lines = [];
  if (plan.openingNote) lines.push(plan.openingNote);
  if (Array.isArray(plan.skip) && plan.skip.length) {
    const titles = plan.skip.slice(0, 3).map((unit) => `「${unit.title}」`).join("、");
    lines.push(`你在「${plan.chapterTitle || "本章前测"}」里的答题情况看起来已经掌握得不错，要不要先跳过 ${titles} 这一组直接进入下一个挑战？这些环节会保留入口，随时可以回来补。`);
  }
  if (Array.isArray(plan.remediate) && plan.remediate.length) {
    const items = plan.remediate.slice(0, 2).map((unit) => `「${unit.title}」（${unit.modality === "visual" ? "图像版" : unit.modality === "symbolic" ? "公式版" : "对比版"}）`).join("、");
    lines.push(`刚刚的后测里 ${plan.weakConcepts || "几个概念"} 看起来还没踩稳。想换一种方式再走一遍吗？我推荐 ${items}，换个视角试试。`);
  }
  if (Array.isArray(plan.extension) && plan.extension.length) {
    const extItem = plan.extension[0];
    lines.push(`如果还有兴趣，可以提前走一步到「${extItem.chapterTitle}」的入口「${extItem.title}」，先看看下一章的全景图，再决定要不要深入。我只解锁一步，避免一次走太远。`);
  }
  if (!lines.length) lines.push("整体表现稳定，按当前路线继续就好。");
  return { provider: "mock", text: lines.join("\n\n") };
}

module.exports = { complete, provider };
