// Admin dashboard behavior, data loading, charts, and exports.
const API_BASE = window.location.origin;
let adminToken = sessionStorage.getItem("cq_admin_token") || "";
let charts = {};
let allUsers = [];
let cachedChapterData = [];
let cachedPhaseData = [];
let interactionsData = { rows: [], total: 0, limit: 100, offset: 0 };
let interactionPage = Number(sessionStorage.getItem("cq_interaction_page") || 0);
let interactionPageSize = Number(sessionStorage.getItem("cq_interaction_page_size") || 100);
let interactionUserId = sessionStorage.getItem("cq_interaction_user") || "";
let currentRange = sessionStorage.getItem("cq_admin_range") || "";
let loadController = null;
let refreshCooldown = false;
let refreshTimer = null;

// ---- Auth ----
function checkAuth() {
  if (adminToken) {
    testToken().then(result => {
      if (result.ok) { showApp(); }
      else if (result.status === 0) {
        // Network error — keep token, show login with error
        showLogin();
        document.getElementById("login-error").classList.remove("hidden");
        document.getElementById("login-error").textContent = "无法连接服务器，请确认服务正在运行。";
      } else {
        adminToken = ""; sessionStorage.removeItem("cq_admin_token"); showLogin();
      }
    });
  } else { showLogin(); }
}

function showLogin() {
  document.getElementById("login-gate").classList.remove("hidden");
  document.getElementById("app").classList.add("hidden");
}

function showApp() {
  document.getElementById("login-gate").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
  // Initial load — no debounce, but abort any stale requests
  if (loadController) loadController.abort();
  loadController = new AbortController();
  loadAll(loadController.signal);
}

async function testToken() {
  try {
    const r = await fetch(`${API_BASE}/api/admin/stats/overview`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    return { ok: r.ok, status: r.status };
  } catch {
    return { ok: false, status: 0 }; // network error
  }
}

document.getElementById("login-btn").addEventListener("click", async () => {
  const token = document.getElementById("admin-token-input").value.trim();
  if (!token) return;
  adminToken = token;
  const result = await testToken();
  if (result.ok) {
    sessionStorage.setItem("cq_admin_token", token);
    showApp();
  } else if (result.status === 0) {
    // Network error — keep token, show server-down message
    adminToken = ""; // clear to avoid retrying
    document.getElementById("login-error").classList.remove("hidden");
    document.getElementById("login-error").textContent = "无法连接服务器，请确认服务正在运行。";
  } else {
    adminToken = "";
    document.getElementById("login-error").classList.remove("hidden");
    document.getElementById("login-error").textContent = "Token 无效，请重试。";
  }
});

document.getElementById("admin-token-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("login-btn").click();
});

document.getElementById("logout-btn").addEventListener("click", () => {
  adminToken = "";
  sessionStorage.removeItem("cq_admin_token");
  showLogin();
});

// ---- API helpers ----
async function fetchStats(endpoint, params = "", signal) {
  let url = `${API_BASE}/api/admin/stats/${endpoint}`;
  const parts = [];
  if (currentRange) {
    parts.push("range=" + currentRange);
  } else {
    const start = document.getElementById("date-start")?.value || "";
    const end = document.getElementById("date-end")?.value || "";
    if (start) parts.push("start_date=" + encodeURIComponent(start));
    if (end) parts.push("end_date=" + encodeURIComponent(end));
  }
  if (params) parts.push(params);
  if (parts.length) url += "?" + parts.join("&");
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${adminToken}` },
    signal
  });
  if (!r.ok) throw new Error(`API error: ${r.status}`);
  const j = await r.json();
  if (!j.ok) throw new Error(j.message);
  return j.data;
}

// ---- Chart helpers ----
function destroyChart(key) {
  if (charts[key]) { charts[key].destroy(); delete charts[key]; }
}

function destroyAllCharts() {
  Object.keys(charts).forEach(k => destroyChart(k));
}

function resetInteractionPage() {
  interactionPage = 0;
  sessionStorage.setItem("cq_interaction_page", String(interactionPage));
}

function interactionQueryParams() {
  const limit = Math.max(1, Math.min(Number(interactionPageSize || 100), 1000));
  const offset = Math.max(0, interactionPage) * limit;
  const parts = [
    "limit=" + encodeURIComponent(limit),
    "offset=" + encodeURIComponent(offset)
  ];
  if (interactionUserId) parts.push("userId=" + encodeURIComponent(interactionUserId));
  return parts.join("&");
}

// ---- Load all data ----
async function loadAll(signal) {
  document.getElementById("load-error").classList.add("hidden");
  try {
    const [overview, daily, userProg, chapter, questions, phase, qType, scoreDist, hourly, shortAnswers, interactions, interactionSummary, unitEngagement, skipRepeat, parameterChanges, pathAnalysis] = await Promise.all([
      fetchStats("overview", "", signal),
      fetchStats("daily-activity", "", signal),
      fetchStats("user-progress", "", signal),
      fetchStats("chapter-accuracy", "", signal),
      fetchStats("question-errors", "", signal),
      fetchStats("phase-comparison", "", signal),
      fetchStats("question-type-accuracy", "", signal),
      fetchStats("score-distribution", "", signal),
      fetchStats("hourly-activity", "", signal),
      fetchStats("short-answer-responses", "", signal),
      fetchStats("interactions", interactionQueryParams(), signal),
      fetchStats("interaction-summary", "", signal),
      fetchStats("unit-engagement", "", signal),
      fetchStats("skip-repeat", "", signal),
      fetchStats("parameter-changes", "", signal),
      fetchStats("path-analysis", "", signal)
    ]);
    allUsers = userProg;
    cachedChapterData = chapter;
    cachedPhaseData = phase;
    interactionsData = interactions;

    try { renderMetrics(overview, phase); } catch (e) { console.warn("Metrics:", e); }
    try { renderDailyChart(daily); } catch (e) { console.warn("Daily chart:", e); }
    try { renderUserRankChart(userProg); } catch (e) { console.warn("User rank:", e); }
    try { renderChapterDistChart(chapter); } catch (e) { console.warn("Chapter dist chart:", e); }
    try { renderHeatmap(chapter); } catch (e) { console.warn("Heatmap:", e); }
    try { renderChapterSummary(chapter, phase); } catch (e) { console.warn("Chapter summary:", e); }
    try { renderQuestionErrors(questions); } catch (e) { console.warn("Question errors:", e); }
    try { renderQuestionTypeChart(qType); } catch (e) { console.warn("Question type chart:", e); }
    try { renderPrePostChart(phase); } catch (e) { console.warn("Pre/post chart:", e); }
    try { renderScoreDistChart(scoreDist); } catch (e) { console.warn("Score dist chart:", e); }
    try { renderLearningGainChart(phase); } catch (e) { console.warn("Learning gain chart:", e); }
    try { renderPhaseCompactTable(phase); } catch (e) { console.warn("Phase table:", e); }
    try { renderUserTable(userProg); } catch (e) { console.warn("User table:", e); }
    try { renderActivityTab(daily, hourly, phase); } catch (e) { console.warn("Activity tab:", e); }
    try { renderShortAnswers(shortAnswers); } catch (e) { console.warn("Short answers:", e); }
    try { renderInteractionUserOptions(userProg); } catch (e) { console.warn("Interaction users:", e); }
    try { renderInteractionSummary(interactionSummary); } catch (e) { console.warn("Interaction summary:", e); }
    try { renderUnitEngagement(unitEngagement); } catch (e) { console.warn("Unit engagement:", e); }
    try { renderSkipRepeat(skipRepeat); } catch (e) { console.warn("Skip repeat:", e); }
    try { renderParameterChanges(parameterChanges); } catch (e) { console.warn("Parameter changes:", e); }
    try { renderPathAnalysis(pathAnalysis); } catch (e) { console.warn("Path analysis:", e); }
    try { renderInteractions(interactions); } catch (e) { console.warn("Interactions:", e); }

    document.getElementById("status-dot").className = "dot on";
    document.getElementById("status-text").textContent = "已连接";
    document.getElementById("last-refresh").textContent = new Date().toLocaleTimeString("zh-CN");
  } catch (e) {
    if (e.name === "AbortError") return; // silently ignore aborted requests
    document.getElementById("status-dot").className = "dot off";
    document.getElementById("status-text").textContent = "加载失败";
    document.getElementById("load-error").classList.remove("hidden");
    document.getElementById("load-error").textContent = "数据加载失败: " + e.message;
  }
}

async function loadUsers() {
  allUsers = await fetchStats("user-progress");
  renderUserTable(allUsers);
}

// ---- Metrics ----
function renderMetrics(o, phase) {
  const gainEntries = (phase || []).filter(d => d.post_count > 0 && d.pre_count > 0);
  const avgGain = gainEntries.length > 0
    ? (gainEntries.reduce((s, d) => s + ((d.post_accuracy || 0) - (d.pre_accuracy || 0)), 0) / gainEntries.length).toFixed(1)
    : "-";
  const improvedCount = gainEntries.filter(d => (d.post_accuracy || 0) > (d.pre_accuracy || 0)).length;

  const rangeLabel = currentRange || "all";
  const rangeNames = { today: "今天", yesterday: "昨天", "24h": "近24小时", "14d": "近14天", "30d": "近30天", month: "本月" };
  const dateDesc = rangeNames[rangeLabel] || (currentRange ? "所选范围" : "全部历史");

  document.getElementById("overview-metrics").innerHTML = `
    <div class="metric-card highlight">
      <div class="label">总用户数</div><div class="value">${o.totalUsers}</div>
      <div class="sub">已注册学习者</div>
    </div>
    <div class="metric-card">
      <div class="label">Quiz 提交总数</div><div class="value">${o.totalQuizResults}</div>
      <div class="sub">${dateDesc}</div>
    </div>
    <div class="metric-card">
      <div class="label">${currentRange ? "区间活跃" : "今日活跃"}</div><div class="value">${currentRange ? o.activeInRange : o.activeToday}</div>
      <div class="sub">${currentRange ? dateDesc : "当日有活动记录"}</div>
    </div>
    <div class="metric-card">
      <div class="label">总体正确率</div><div class="value">${o.avgAccuracy}%</div>
      <div class="sub">${dateDesc} · 已评分题目</div>
    </div>
    <div class="metric-card good">
      <div class="label">平均学习增益</div><div class="value small">${avgGain === "-" ? "-" : (Number(avgGain) >= 0 ? "+" : "") + avgGain + "%"}</div>
      <div class="sub">${gainEntries.length} 组前/后测对比, ${improvedCount} 组进步</div>
    </div>
    <div class="metric-card warn">
      <div class="label">总事件数</div><div class="value">${o.totalEvents}</div>
      <div class="sub">${dateDesc} · 学习行为记录</div>
    </div>
  `;
}

// ---- Daily Activity Chart ----
function renderDailyChart(data) {
  destroyChart("daily");
  const ctx = document.getElementById("chart-daily").getContext("2d");
  charts.daily = new Chart(ctx, {
    type: "line",
    data: {
      labels: data.map(d => d.date),
      datasets: [
        { label: "活跃用户", data: data.map(d => d.active_users), borderColor: "#0b8f8a", backgroundColor: "rgba(11,143,138,0.1)", fill: true, tension: 0.3, pointRadius: 3, pointHoverRadius: 5 },
        { label: "Quiz 提交", data: data.map(d => d.quiz_submissions), borderColor: "#d9972a", backgroundColor: "rgba(217,151,42,0.1)", fill: true, tension: 0.3, pointRadius: 3, pointHoverRadius: 5, yAxisID: "y1" }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { intersect: false, mode: "index" },
      plugins: { legend: { position: "bottom" } },
      scales: {
        y: { beginAtZero: true, title: { display: true, text: "活跃用户数" }, grid: { color: "#f0ece4" } },
        y1: { position: "right", beginAtZero: true, grid: { drawOnChartArea: false }, title: { display: true, text: "Quiz 提交数" } }
      }
    }
  });
}

// ---- User Rank Chart ----
function renderUserRankChart(data) {
  destroyChart("userRank");
  const sorted = [...data].sort((a, b) => b.quiz_count - a.quiz_count).slice(0, 20);
  const ctx = document.getElementById("chart-user-rank").getContext("2d");
  charts.userRank = new Chart(ctx, {
    type: "bar",
    data: {
      labels: sorted.map(d => d.nickname),
      datasets: [
        { label: "Quiz 数量", data: sorted.map(d => d.quiz_count), backgroundColor: "#0b8f8a", borderRadius: 4 },
        { label: "正确率 %", data: sorted.map(d => d.avg_accuracy), backgroundColor: "#d9972a", borderRadius: 4, yAxisID: "y1" }
      ]
    },
    options: {
      indexAxis: "y", responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: "bottom" } },
      scales: {
        y: { ticks: { font: { size: 11 } }, grid: { display: false } },
        y1: { position: "top", beginAtZero: true, max: 100, grid: { drawOnChartArea: false }, title: { display: true, text: "正确率 %" } }
      }
    }
  });
}

// ---- Chapter Distribution Scatter ----
function renderChapterDistChart(data) {
  destroyChart("chapterDist");
  if (!data || !data.length) return;
  const chapters = [...new Set(data.map(d => d.chapter_label))];
  const palette = ["#0b8f8a","#d9972a","#cf6048","#4c7847","#3f6fa4","#8b5cf6","#ec4899","#64748b"];
  const datasets = chapters.map((ch, i) => {
    const pts = data.filter(d => d.chapter_label === ch);
    return {
      label: ch,
      data: pts.map(d => ({ x: d.nickname, y: d.accuracy })),
      backgroundColor: palette[i % palette.length],
      pointRadius: 6, pointHoverRadius: 9
    };
  });
  const ctx = document.getElementById("chart-chapter-dist").getContext("2d");
  charts.chapterDist = new Chart(ctx, {
    type: "scatter",
    data: { datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom" },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.raw.x} - ${ctx.raw.y}%` } }
      },
      scales: {
        x: { type: "category", title: { display: true, text: "用户" }, ticks: { maxRotation: 45, font: { size: 9 } } },
        y: { beginAtZero: true, max: 105, title: { display: true, text: "正确率 %" }, ticks: { callback: v => v + "%" } }
      }
    }
  });
}

// ---- Heatmap ----
function renderHeatmap(data) {
  const users = [...new Set(data.map(d => d.nickname))];
  const chapters = [...new Set(data.map(d => d.chapter_label))];
  // Sort chapters by ID
  chapters.sort((a, b) => a.localeCompare(b));
  const matrix = [];
  for (const u of users) {
    const row = [];
    for (const ch of chapters) {
      const r = data.find(d => d.nickname === u && d.chapter_label === ch);
      row.push(r ? r.accuracy : null);
    }
    matrix.push(row);
  }

  let html = '<div class="heatmap-table"><table><thead><tr><th>用户</th>';
  for (const ch of chapters) html += `<th>${ch}</th>`;
  html += '</tr></thead><tbody>';
  for (let i = 0; i < users.length; i++) {
    html += `<tr><td style="font-weight:600;white-space:nowrap;">${users[i]}</td>`;
    for (let j = 0; j < chapters.length; j++) {
      const v = matrix[i][j];
      if (v === null) {
        html += '<td style="color:#ccc;text-align:center;background:#fafaf9;">-</td>';
        continue;
      }
      // Color gradient: red (low) -> yellow (mid) -> green (high)
      const ratio = v / 100;
      const r = Math.round(ratio < 0.5 ? 220 : 220 - (ratio - 0.5) * 2 * 180);
      const g = Math.round(ratio < 0.5 ? 80 + ratio * 2 * 140 : 220 - (ratio - 0.5) * 2 * 60);
      const b = 70;
      html += `<td style="background:rgb(${r},${g},${b});text-align:center;font-weight:600;font-size:0.82rem;color:${v > 60 ? '#fff' : '#333'};">${v}%</td>`;
    }
    html += '</tr>';
  }
  html += '</tbody></table></div>';
  document.getElementById("heatmap-container").innerHTML = html;
}

// ---- Chapter Summary Table ----
function renderChapterSummary(chapterData, phaseData) {
  const chapters = [...new Set(chapterData.map(d => d.chapter_label))];
  chapters.sort();
  const tbody = document.getElementById("table-chapter-summary").querySelector("tbody");

  // Build chapter stats
  const stats = chapters.map(ch => {
    const records = chapterData.filter(d => d.chapter_label === ch);
    const users = new Set(records.map(d => d.user_id)).size;
    const total = records.reduce((s, d) => s + d.total, 0);
    const avgAcc = records.length > 0 ? (records.reduce((s, d) => s + d.accuracy, 0) / records.length).toFixed(1) : "-";

    // Calculate learning gain for this chapter
    const phaseEntries = (phaseData || []).filter(d => d.chapter_label === ch && d.pre_count > 0 && d.post_count > 0);
    const gain = phaseEntries.length > 0
      ? (phaseEntries.reduce((s, d) => s + ((d.post_accuracy || 0) - (d.pre_accuracy || 0)), 0) / phaseEntries.length).toFixed(1)
      : "-";
    const gainStr = gain === "-" ? "-" : (Number(gain) >= 0 ? "+" + gain + "%" : gain + "%");

    return { chapter: ch, total, users, avgAcc, gain, gainStr };
  });

  tbody.innerHTML = stats.map(s => `<tr>
    <td style="font-weight:600;">${s.chapter}</td>
    <td>${s.total}</td><td>${s.users}</td>
    <td><span class="badge ${s.avgAcc === '-' ? '' : Number(s.avgAcc) >= 80 ? 'badge-green' : Number(s.avgAcc) >= 60 ? 'badge-amber' : 'badge-red'}">${s.avgAcc === '-' ? '-' : s.avgAcc + '%'}</span></td>
    <td>-</td>
    <td><span class="badge ${s.gain === '-' ? '' : Number(s.gain) > 0 ? 'badge-green' : Number(s.gain) < 0 ? 'badge-red' : 'badge-amber'}">${s.gainStr}</span></td>
  </tr>`).join("");
}

// ---- Question Errors ----
function renderQuestionErrors(data) {
  destroyChart("questionErrors");
  const top = data.slice(0, 30);
  const ctx = document.getElementById("chart-question-errors").getContext("2d");
  charts.questionErrors = new Chart(ctx, {
    type: "bar",
    data: {
      labels: top.map(d => d.question_id + " (" + (d.unit_label || "") + ")"),
      datasets: [{
        label: "错误率 %", data: top.map(d => d.error_rate),
        backgroundColor: top.map(d => d.error_rate > 60 ? "#cf6048" : d.error_rate > 30 ? "#d9972a" : "#4c7847"),
        borderRadius: 4
      }]
    },
    options: {
      indexAxis: "y", responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, max: 100, ticks: { callback: v => v + "%" } } }
    }
  });

  const table = document.getElementById("table-question-errors");
  table.innerHTML = `<thead><tr><th>题目 ID</th><th>单元</th><th>章节</th><th>题型</th><th>尝试次数</th><th>错误率</th><th>平均得分/满分</th></tr></thead>
    <tbody>${data.map(d => `<tr>
      <td style="font-weight:600;">${d.question_id}</td><td>${d.unit_label}</td><td>${d.chapter_label}</td><td>${d.question_type}</td>
      <td>${d.attempts}</td>
      <td><span class="badge ${d.error_rate > 60 ? 'badge-red' : d.error_rate > 30 ? 'badge-amber' : 'badge-green'}">${d.error_rate}%</span></td>
      <td>${d.avg_score} / ${d.avg_max}</td>
    </tr>`).join("")}</tbody>`;
}

// ---- Question Type Chart (Polar Area) ----
function renderQuestionTypeChart(data) {
  destroyChart("questionType");
  if (!data || data.length === 0) {
    document.getElementById("chart-question-type").parentElement.innerHTML = '<p style="color:var(--muted);text-align:center;padding:40px;">尚无题型数据</p>';
    return;
  }
  const ctx = document.getElementById("chart-question-type").getContext("2d");
  const palette = ["#0b8f8a","#d9972a","#cf6048","#4c7847","#3f6fa4","#8b5cf6","#ec4899"];
  charts.questionType = new Chart(ctx, {
    type: "polarArea",
    data: {
      labels: data.map(d => d.question_type),
      datasets: [{
        data: data.map(d => d.accuracy),
        backgroundColor: data.map((_, i) => palette[i % palette.length] + "88"),
        borderColor: data.map((_, i) => palette[i % palette.length]),
        borderWidth: 2
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom" },
        tooltip: { callbacks: { label: ctx => `${ctx.label}: 正确率 ${ctx.raw}% (n=${data[ctx.dataIndex].total})` } }
      },
      scales: { r: { beginAtZero: true, max: 100, ticks: { callback: v => v + "%", stepSize: 20 } } }
    }
  });
}

// ---- Pre/Post Comparison Chart (Dumbbell-style using scatter + line) ----
function renderPrePostChart(data) {
  destroyChart("prePost");
  if (!data || data.length === 0) {
    document.getElementById("chart-pre-post").parentElement.innerHTML = '<p style="color:var(--muted);text-align:center;padding:60px;">尚无前测/后测对比数据</p>';
    return;
  }
  // Filter to only entries that have both pre and post
  const entries = data.filter(d => d.pre_count > 0 && d.post_count > 0);
  if (entries.length === 0) {
    document.getElementById("chart-pre-post").parentElement.innerHTML = '<p style="color:var(--muted);text-align:center;padding:60px;">尚无同时具有前测和后测的数据</p>';
    return;
  }

  const labels = entries.map(d => `${d.nickname} / ${d.chapter_label}`);
  const ctx = document.getElementById("chart-pre-post").getContext("2d");

  charts.prePost = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "前测正确率", data: entries.map(d => d.pre_accuracy), backgroundColor: "#cf604888", borderColor: "#cf6048", borderWidth: 1, borderRadius: 2 },
        { label: "后测正确率", data: entries.map(d => d.post_accuracy), backgroundColor: "#4c784788", borderColor: "#4c7847", borderWidth: 1, borderRadius: 2 }
      ]
    },
    options: {
      indexAxis: "y",
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom" },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.raw}%` } }
      },
      scales: {
        y: { ticks: { font: { size: 10 } }, grid: { display: false } },
        x: { beginAtZero: true, max: 105, title: { display: true, text: "正确率 %" }, ticks: { callback: v => v + "%" } }
      }
    }
  });
}

// ---- Score Distribution Histogram ----
function renderScoreDistChart(data) {
  destroyChart("scoreDist");
  if (!data || data.length === 0) return;
  const buckets = ["0-19%", "20-39%", "40-59%", "60-79%", "80-99%", "满分 (100%)"];
  const map = {};
  data.forEach(d => { map[d.bucket] = d.count; });

  const ctx = document.getElementById("chart-score-dist").getContext("2d");
  charts.scoreDist = new Chart(ctx, {
    type: "bar",
    data: {
      labels: buckets,
      datasets: [{
        label: "提交数量",
        data: buckets.map(b => map[b] || 0),
        backgroundColor: buckets.map(b => b === "满分 (100%)" ? "#4c7847" : b === "80-99%" ? "#8bc34a" : b === "60-79%" ? "#d9972a" : b === "40-59%" ? "#ff9800" : b === "20-39%" ? "#f44336" : "#cf6048"),
        borderRadius: 6
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, title: { display: true, text: "提交次数" }, ticks: { stepSize: 1 } },
        x: { title: { display: true, text: "得分率区间" } }
      }
    }
  });
}

// ---- Learning Gain Chart ----
function renderLearningGainChart(data) {
  destroyChart("learningGain");
  if (!data || data.length === 0) return;
  const entries = data.filter(d => d.pre_count > 0 && d.post_count > 0);
  if (entries.length === 0) {
    document.getElementById("chart-learning-gain").parentElement.innerHTML = '<p style="color:var(--muted);text-align:center;padding:60px;">尚无学习增益数据</p>';
    return;
  }

  const sorted = [...entries].sort((a, b) => {
    const gainA = (a.post_accuracy || 0) - (a.pre_accuracy || 0);
    const gainB = (b.post_accuracy || 0) - (b.pre_accuracy || 0);
    return gainA - gainB;
  });

  const ctx = document.getElementById("chart-learning-gain").getContext("2d");
  charts.learningGain = new Chart(ctx, {
    type: "bar",
    data: {
      labels: sorted.map(d => `${d.nickname} / ${d.chapter_label}`),
      datasets: [{
        label: "学习增益 (后测 - 前测)",
        data: sorted.map(d => ((d.post_accuracy || 0) - (d.pre_accuracy || 0)).toFixed(1)),
        backgroundColor: sorted.map(d => {
          const gain = (d.post_accuracy || 0) - (d.pre_accuracy || 0);
          return gain > 0 ? "#4c7847" : gain < 0 ? "#cf6048" : "#d9972a";
        }),
        borderRadius: 4
      }]
    },
    options: {
      indexAxis: "y",
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => `学习增益: ${Number(ctx.raw) >= 0 ? '+' : ''}${ctx.raw}%` } }
      },
      scales: {
        y: { ticks: { font: { size: 10 } }, grid: { display: false } },
        x: { title: { display: true, text: "正确率变化 (%)" }, ticks: { callback: v => (v >= 0 ? '+' : '') + v + "%" } }
      }
    }
  });
}

// ---- Phase Compact Table ----
function renderPhaseCompactTable(data) {
  const tbody = document.getElementById("table-phase-compact").querySelector("tbody");
  if (!data || data.length === 0) {
    tbody.innerHTML = "<tr><td colspan='5'>尚无前测/后测数据。</td></tr>";
    return;
  }
  const entries = data.filter(d => d.pre_count > 0 || d.post_count > 0);
  tbody.innerHTML = entries.map(d => {
    const diff = (d.post_count > 0 && d.pre_count > 0) ? ((d.post_accuracy || 0) - (d.pre_accuracy || 0)).toFixed(1) : null;
    const diffStr = diff === null ? "-" : (Number(diff) >= 0 ? "+" + diff + "%" : diff + "%");
    const badgeCls = diff === null ? "" : Number(diff) > 0 ? "badge-green" : Number(diff) < 0 ? "badge-red" : "badge-amber";
    return `<tr>
      <td>${d.nickname}</td><td>${d.chapter_label}</td>
      <td>${d.pre_accuracy ?? "-"}% (n=${d.pre_count})</td>
      <td>${d.post_accuracy ?? "-"}% (n=${d.post_count || 0})</td>
      <td><span class="badge ${badgeCls}">${diffStr}</span></td>
    </tr>`;
  }).join("");
}

// ---- User Table ----
function renderUserTable(users) {
  const table = document.getElementById("table-users");
  document.getElementById("user-total-count").textContent = `共 ${users.length} 位用户`;
  table.innerHTML = `<thead><tr><th>昵称</th><th>用户ID</th><th>最后活跃</th><th>Quiz 数</th><th>覆盖单元</th><th>正确率</th><th>总得分</th><th>操作</th></tr></thead>
    <tbody>${users.map(u => `<tr>
      <td style="font-weight:600;">${u.nickname}</td>
      <td style="font-size:0.75rem;color:var(--muted);">${(u.user_id || "").slice(-12)}</td>
      <td>${(u.last_seen_at || "").slice(0, 16)}</td>
      <td>${u.quiz_count}</td>
      <td>${u.units_attempted || 0}</td>
      <td><span class="badge ${(u.avg_accuracy||0) >= 80 ? 'badge-green' : (u.avg_accuracy||0) >= 50 ? 'badge-amber' : 'badge-red'}">${u.avg_accuracy || 0}%</span></td>
      <td>${u.total_score || 0} / ${u.total_max || 0}</td>
      <td><button class="btn btn-sm btn-primary view-user-btn" data-user-id="${u.user_id}">详情</button></td>
    </tr>`).join("")}</tbody>`;

  table.querySelectorAll(".view-user-btn").forEach(btn => {
    btn.addEventListener("click", () => loadUserDetail(btn.dataset.userId));
  });
}

// ---- User Detail ----
async function loadUserDetail(userId) {
  try {
    const detail = await fetchStats("user-detail", `userId=${encodeURIComponent(userId)}`);
    const section = document.getElementById("user-detail-section");
    section.classList.remove("hidden");
    document.getElementById("user-detail-title").textContent = `${detail.user.nickname} - 答题时间线`;

    // Timeline chart
    destroyChart("userTimeline");
    const sorted = detail.quizResults.slice().reverse();
    const ctx = document.getElementById("chart-user-timeline").getContext("2d");
    charts.userTimeline = new Chart(ctx, {
      type: "scatter",
      data: {
        datasets: [
          { label: "正确", data: sorted.filter(d => d.is_correct === 1).map(d => ({ x: d.created_at.slice(0, 16), y: d.score, questionId: d.question_id })),
            backgroundColor: "#4c7847", pointRadius: 5, pointHoverRadius: 8 },
          { label: "部分正确", data: sorted.filter(d => d.is_correct === -1).map(d => ({ x: d.created_at.slice(0, 16), y: d.score, questionId: d.question_id })),
            backgroundColor: "#d9972a", pointRadius: 5, pointHoverRadius: 8 },
          { label: "错误", data: sorted.filter(d => d.is_correct === 0).map(d => ({ x: d.created_at.slice(0, 16), y: d.score, questionId: d.question_id })),
            backgroundColor: "#cf6048", pointRadius: 5, pointHoverRadius: 8 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom" },
          tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.raw.questionId || ""} - 得分: ${ctx.raw.y}` } }
        },
        scales: {
          x: { ticks: { maxRotation: 45, font: { size: 9 } } },
          y: { beginAtZero: true, title: { display: true, text: "得分" } }
        }
      }
    });

    // Chapter summary table
    const table = document.getElementById("table-user-chapters");
    table.innerHTML = `<thead><tr><th>章节</th><th>答题数</th><th>正确数</th><th>正确率</th><th>平均得分</th></tr></thead>
      <tbody>${detail.chapterSummary.map(c => `<tr>
        <td>${c.chapter_label}</td><td>${c.total}</td><td>${c.correct}</td>
        <td><span class="badge ${c.accuracy >= 80 ? 'badge-green' : c.accuracy >= 50 ? 'badge-amber' : 'badge-red'}">${c.accuracy}%</span></td>
        <td>${c.avg_score}</td>
      </tr>`).join("")}</tbody>`;

    // Activity summary
    const prePostEvents = detail.quizResults.filter(r => r.phase === "pre" || r.phase === "post");
    const preCount = prePostEvents.filter(r => r.phase === "pre").length;
    const postCount = prePostEvents.filter(r => r.phase === "post").length;
    document.getElementById("user-activity-summary").innerHTML = `
      <p><strong>总答题数:</strong> ${detail.quizResults.length}</p>
      <p><strong>前测次数:</strong> ${preCount} | <strong>后测次数:</strong> ${postCount}</p>
      <p><strong>覆盖章节:</strong> ${detail.chapterSummary.length} 个</p>
      <p><strong>总事件数:</strong> ${detail.events.length}</p>
      <p><strong>注册时间:</strong> ${(detail.user.created_at || "").slice(0, 16)}</p>
    `;

    section.scrollIntoView({ behavior: "smooth" });
  } catch (e) {
    alert("加载用户详情失败: " + e.message);
  }
}

// ---- Activity Tab ----
function renderActivityTab(dailyData, hourlyData, phaseData) {
  // Daily activity (duplicate the overview chart for this tab)
  destroyChart("activityDaily");
  const ctx1 = document.getElementById("chart-activity-daily").getContext("2d");
  charts.activityDaily = new Chart(ctx1, {
    type: "line",
    data: {
      labels: dailyData.map(d => d.date),
      datasets: [
        { label: "活跃用户", data: dailyData.map(d => d.active_users), borderColor: "#0b8f8a", backgroundColor: "rgba(11,143,138,0.1)", fill: true, tension: 0.3, pointRadius: 2 },
        { label: "总事件", data: dailyData.map(d => d.events_count), borderColor: "#3f6fa4", backgroundColor: "rgba(63,111,164,0.08)", fill: true, tension: 0.3, pointRadius: 2, yAxisID: "y1" }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { intersect: false, mode: "index" },
      plugins: { legend: { position: "bottom" } },
      scales: {
        y: { beginAtZero: true, title: { display: true, text: "活跃用户" }, grid: { color: "#f0ece4" } },
        y1: { position: "right", beginAtZero: true, grid: { drawOnChartArea: false }, title: { display: true, text: "总事件" } }
      }
    }
  });

  // Hourly activity
  destroyChart("hourly");
  if (hourlyData && hourlyData.length > 0) {
    const ctx2 = document.getElementById("chart-hourly").getContext("2d");
    // Fill missing hours with 0
    const hourlyMap = {};
    hourlyData.forEach(d => { hourlyMap[d.hour] = d; });
    const hours = Array.from({length: 24}, (_, i) => i);
    charts.hourly = new Chart(ctx2, {
      type: "bar",
      data: {
        labels: hours.map(h => `${h}:00`),
        datasets: [
          { label: "Quiz 提交", data: hours.map(h => hourlyMap[h]?.quiz_submissions || 0), backgroundColor: "#d9972a", borderRadius: 3 },
          { label: "其它事件", data: hours.map(h => (hourlyMap[h]?.events_count || 0) - (hourlyMap[h]?.quiz_submissions || 0)), backgroundColor: "#0b8f8a", borderRadius: 3 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom" },
          tooltip: { callbacks: { footer: ctx => `活跃用户: ${hourlyMap[ctx[0].dataIndex]?.active_users || 0}` } }
        },
        scales: {
          x: { title: { display: true, text: "小时 (UTC)" }, ticks: { maxRotation: 0 } },
          y: { stacked: true, beginAtZero: true, title: { display: true, text: "事件数" } }
        }
      }
    });
  }

  // Phase comparison table
  const table = document.getElementById("table-phase-comparison");
  if (!phaseData || phaseData.length === 0) {
    table.innerHTML = "<tr><td colspan='7'>还没有前测/后测对比数据。</td></tr>";
    return;
  }
  table.innerHTML = `<thead><tr><th>用户</th><th>章节</th><th>前测正确率</th><th>前测数量</th><th>后测正确率</th><th>后测数量</th><th>变化</th></tr></thead>
    <tbody>${phaseData.map(d => {
      const diff = (d.post_accuracy || 0) - (d.pre_accuracy || 0);
      const noPost = !d.post_count || d.post_count === 0;
      return `<tr>
        <td>${d.nickname}</td><td>${d.chapter_label}</td>
        <td>${d.pre_accuracy ?? "-"}%</td><td>${d.pre_count}</td>
        <td>${d.post_accuracy ?? "-"}%</td><td>${d.post_count || 0}</td>
        <td>${noPost ? '<span style="color:#999;">-</span>' : `<span class="badge ${diff > 0 ? 'badge-green' : diff < 0 ? 'badge-red' : 'badge-amber'}">${diff > 0 ? '+' : ''}${diff}%</span>`}</td>
      </tr>`;
    }).join("")}</tbody>`;
}

// ---- Short Answer Responses ----
function renderShortAnswers(data) {
  const tbody = document.getElementById("table-shortanswers").querySelector("tbody");
  if (!data || data.length === 0) {
    tbody.innerHTML = "<tr><td colspan='8'>尚无简答题提交数据。</td></tr>";
    return;
  }
  tbody.innerHTML = data.map(d => {
    let statusBadge = "";
    const st = (d.status || "").toLowerCase();
    if (st === "correct" || d.is_correct === 1) statusBadge = '<span class="badge badge-green">正确</span>';
    else if (st === "incorrect" || d.is_correct === 0) statusBadge = '<span class="badge badge-red">错误</span>';
    else statusBadge = '<span class="badge badge-amber">待复核</span>';
    const answer = (d.response || "").length > 200
      ? d.response.slice(0, 200) + "..."
      : (d.response || "");
    const scoreDisplay = d.max_score > 0 ? `${d.score} / ${d.max_score}` : `${d.score} (预估)`;
    return `<tr>
      <td style="font-weight:600;">${d.nickname}</td>
      <td>${d.chapter_label}</td>
      <td>${d.unit_label}</td>
      <td>${d.question_id}</td>
      <td style="max-width:350px;word-break:break-word;font-size:0.82rem;" title="${(d.response||'').replace(/"/g,'&quot;')}">${answer}</td>
      <td>${scoreDisplay}</td>
      <td>${statusBadge}</td>
      <td style="font-size:0.78rem;white-space:nowrap;">${(d.created_at||"").slice(0,16)}</td>
    </tr>`;
 }).join("");
  // Show summary
  const reviewed = data.filter(d => d.is_correct === 1 || (d.status||"").toLowerCase() === "correct").length;
  const incorrect = data.filter(d => d.is_correct === 0 || (d.status||"").toLowerCase() === "incorrect").length;
  const pending = data.length - reviewed - incorrect;
  document.getElementById("shortanswer-summary").textContent =
     `共 ${data.length} 条 | 正确 ${reviewed} | 错误 ${incorrect} | 待复核 ${pending}`;
}
function esc(s) { return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }

function parsePayload(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return { raw: String(value) }; }
}

function viewName(value) {
  const key = String(value || "").replace(/-view$/, "");
  return ({
    home: "首页",
    learn: "学习页",
    library: "资源页",
    progress: "学习记录页",
    evaluation: "评测页",
    agent: "Agent 编排页"
  })[key] || (key ? key : "未知页面");
}

const adminChapterOrder = ["A1", "A2a", "A2b", "A3", "A4", "C1", "D1", "D2"];
const adminChapterLabels = {
  A1: "变化与斜率",
  A2a: "向量：方向与长度",
  A2b: "内积与投影",
  A3: "空间变换与局部线性",
  A4: "曲面与正定性",
  C1: "导数、梯度与驻点",
  D1: "梯度下降",
  D2: "凸性与全局最优"
};
const adminUnitOverrides = {
  1: "前测",
  2: "概念地图",
  6: "公式桥",
  8: "形成性测验",
  12: "复盘页",
  15: "后测"
};
const adminUnitLabels = {
  "A1-scene-1": "前测",
  "A1-scene-2": "概念地图",
  "A1-scene-3": "实验：函数机器",
  "A1-scene-4": "实验：坐标点",
  "A1-scene-5": "实验：三类函数图像",
  "A1-scene-6": "公式桥",
  "A1-scene-7": "实验：两点斜率",
  "A1-scene-8": "形成性测验",
  "A1-scene-9": "实验：变化快慢排序",
  "A1-scene-10": "实验：局部斜率",
  "A1-scene-11": "实验：函数表示关系网",
  "A1-scene-12": "复盘页",
  "A1-scene-13": "实验：斜率正负判定",
  "A1-scene-14": "实验：微积分变化地图",
  "A1-scene-15": "后测",
  "A2a-scene-1": "前测",
  "A2a-scene-2": "概念地图",
  "A2a-scene-3": "实验：坐标与属性",
  "A2a-scene-4": "实验：首尾相接的旅程",
  "A2a-scene-5": "实验：方向的逆转",
  "A2a-scene-6": "公式桥",
  "A2a-scene-7": "实验：两点间的向量",
  "A2a-scene-8": "形成性测验",
  "A2a-scene-9": "实验：双步策略",
  "A2a-scene-10": "实验：离目标还有多远？",
  "A2a-scene-11": "实验：向量关系图谱",
  "A2a-scene-12": "复盘页",
  "A2a-scene-13": "实验：向量拼图",
  "A2a-scene-14": "实验：优化中的“一步”",
  "A2a-scene-15": "后测",
  "A2b-scene-1": "前测",
  "A2b-scene-2": "概念地图",
  "A2b-scene-3": "实验：夹角旋转台",
  "A2b-scene-4": "实验：内积数值仪表",
  "A2b-scene-5": "实验：投影影子",
  "A2b-scene-6": "公式桥",
  "A2b-scene-7": "实验：方向贡献地图",
  "A2b-scene-8": "形成性测验",
  "A2b-scene-9": "实验：投影命中",
  "A2b-scene-10": "实验：垂直零贡献",
  "A2b-scene-11": "实验：方向导数预备",
  "A2b-scene-12": "复盘页",
  "A2b-scene-13": "实验：方向关系分类",
  "A2b-scene-14": "实验：投影分解仪",
  "A2b-scene-15": "后测",
  "A3-scene-1": "前测",
  "A3-scene-2": "概念地图",
  "A3-scene-3": "实验：基向量变换器",
  "A3-scene-4": "实验：网格形变",
  "A3-scene-5": "实验：单位圆变椭圆",
  "A3-scene-6": "公式桥",
  "A3-scene-7": "实验：点对点映射追踪",
  "A3-scene-8": "形成性测验",
  "A3-scene-9": "实验：矩阵变换反推",
  "A3-scene-10": "实验：变换流程系统全景图",
  "A3-scene-11": "实验：面积与方向观察器",
  "A3-scene-12": "复盘页",
  "A3-scene-13": "实验：网格复原大",
  "A3-scene-14": "实验：局部线性预告",
  "A3-scene-15": "后测",
  "A4-scene-1": "前测",
  "A4-scene-2": "概念地图",
  "A4-scene-3": "实验：曲线到曲面切换台",
  "A4-scene-4": "实验：等高线地形阅读器",
  "A4-scene-5": "实验：二次曲面形状库",
  "A4-scene-6": "公式桥",
  "A4-scene-7": "实验：正定方向",
  "A4-scene-8": "形成性测验",
  "A4-scene-9": "实验：发现线性",
  "A4-scene-10": "实验：多维关系全景图",
  "A4-scene-11": "实验：最快上升方向",
  "A4-scene-12": "复盘页",
  "A4-scene-13": "实验：曲面识别赛",
  "A4-scene-14": "实验：局部模型匹配拼图",
  "A4-scene-15": "后测",
  "C1-scene-1": "前测",
  "C1-scene-2": "概念地图",
  "C1-scene-3": "实验：一元极值斜率扫描",
  "C1-scene-4": "实验：梯度箭头地形图",
  "C1-scene-5": "实验：梯度计算填空板",
  "C1-scene-6": "公式桥",
  "C1-scene-7": "实验：方向导数旋转盘",
  "C1-scene-8": "形成性测验",
  "C1-scene-9": "实验：最快方向",
  "C1-scene-10": "实验：驻点形状切换器",
  "C1-scene-11": "实验：概念关系系统图",
  "C1-scene-12": "复盘页",
  "C1-scene-13": "实验：驻点判断",
  "C1-scene-14": "实验：梯度为零反例",
  "C1-scene-15": "后测",
  "D1-scene-1": "前测",
  "D1-scene-2": "概念地图",
  "D1-scene-3": "实验：优化三要素",
  "D1-scene-4": "实验：目标函数地形探索",
  "D1-scene-5": "实验：一元最低点候选器",
  "D1-scene-6": "公式桥",
  "D1-scene-7": "实验：负梯度下一步模拟",
  "D1-scene-8": "形成性测验",
  "D1-scene-9": "实验：步长稳定性",
  "D1-scene-10": "实验：迭代表格",
  "D1-scene-11": "实验：梯度下降流程图",
  "D1-scene-12": "复盘页",
  "D1-scene-13": "实验：下山路线策略",
  "D1-scene-14": "实验：收敛与停止条件",
  "D1-scene-15": "后测",
  "D2-scene-1": "前测",
  "D2-scene-2": "概念地图",
  "D2-scene-3": "实验：凸碗形地形探索",
  "D2-scene-4": "实验：非凸多山谷探索",
  "D2-scene-5": "实验：凸/非凸曲线切换器",
  "D2-scene-6": "公式桥",
  "D2-scene-7": "实验：概念关系全景图",
  "D2-scene-8": "形成性测验",
  "D2-scene-9": "实验：起点选择策略",
  "D2-scene-10": "实验：等高线低谷识别器",
  "D2-scene-11": "实验：路径盆地",
  "D2-scene-12": "复盘页",
  "D2-scene-13": "实验：凸性判断拼图",
  "D2-scene-14": "实验：可靠优化对比",
  "D2-scene-15": "后测",
};

function chapterName(idOrLabel = "") {
  const value = String(idOrLabel || "");
  const unitMatch = value.match(/^([A-Za-z0-9]+)-(?:scene-\d+|chapter)$/);
  if (unitMatch) return chapterName(unitMatch[1]);
  const id = adminChapterLabels[value] ? value : Object.keys(adminChapterLabels).find((key) => value === adminChapterLabels[key]);
  if (!id) return value;
  const index = adminChapterOrder.indexOf(id);
  return index >= 0 ? `第${index + 1}章 ${adminChapterLabels[id]}` : adminChapterLabels[id];
}

function normalizedChapterName(row = {}) {
  return chapterName(row.chapter_id || row.chapter_label || row.unit_id || "");
}

function moduleName(unitId = "", fallback = "") {
  const id = String(unitId || "");
  if (adminUnitLabels[id]) return adminUnitLabels[id];
  const match = id.match(/^([A-Za-z0-9]+)-scene-(\d+)$/);
  if (match) {
    const order = Number(match[2]);
    if (adminUnitOverrides[order]) return adminUnitOverrides[order];
  }
  if (/^[A-Za-z0-9]+-chapter$/.test(id)) return "整章";
  if (/^[A-Za-z0-9]+-scene-\d+$/.test(String(fallback || ""))) return moduleName(fallback);
  return fallback || unitName(id);
}

function parseJsonMaybe(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return {}; }
}

function unitName(value) {
  const id = String(value || "");
  const m = id.match(/^([A-Za-z0-9]+)-scene-(\d+)$/);
  if (m) return moduleName(id, `${chapterName(m[1])} 第 ${m[2]} 个学习模块`);
  if (id.startsWith("supplement-")) return "推荐补给资源";
  return id || "未知模块";
}

function durationText(seconds) {
  const sec = Number(seconds || 0);
  if (sec < 60) return `${sec} 秒`;
  const min = Math.floor(sec / 60);
  const rest = sec % 60;
  return rest ? `${min} 分 ${rest} 秒` : `${min} 分钟`;
}

function shortDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 16);
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

function interactionEventType(row) {
  return row.payload?.eventType || row.type || "unknown";
}

function interactionTypeName(type) {
  return ({
    click: "点击",
    view_change: "页面切换",
    time_on_unit: "模块停留",
    leave_unit: "离开模块",
    visibility: "页面可见性",
    heartbeat: "在线心跳",
    online_period: "在线时段",
    interactive_ready: "实验打开",
    interactive_click: "实验点击",
    interactive_input: "实验输入",
    interactive_change: "实验改值",
    interactive_submit: "实验提交",
    iframe_event: "互动实验",
    interaction: "交互"
  })[type] || type || "未知事件";
}

function humanInteractionSummary(row) {
  const payload = parsePayload(row.payload);
  const data = payload.data || {};
  const type = payload.eventType || row.type || "unknown";
  if (type === "click") {
    if (data.view) return `点击了「${data.text || viewName(data.view)}」，准备切换到${viewName(data.view)}。`;
    if (data.unit) return `点击打开${unitName(data.unit)}。`;
    return `点击了页面上的「${data.text || data.tag || "控件"}」。`;
  }
  if (type === "view_change") {
    return `页面从${viewName(data.prev)}切换到${viewName(data.view)}。`;
  }
  if (type === "time_on_unit") {
    return `在${unitName(data.unitId)}停留学习了 ${durationText(data.seconds)}。`;
  }
  if (type === "leave_unit") {
    return `离开${unitName(data.unitId)}，本次停留 ${durationText(data.seconds)}。`;
  }
  if (type === "visibility") {
    return data.hidden ? "学习页面被切到后台或最小化。" : "学习页面重新回到前台。";
  }
  if (type === "heartbeat") {
    return `仍在线学习，当前停留在${viewName(data.view)}。`;
  }
  if (type === "online_period") {
    const range = data.startedAt || data.endedAt
      ? `（${shortDateTime(data.startedAt)} - ${shortDateTime(data.endedAt)}）`
      : "";
    const estimated = data.estimated ? "约 " : "";
    const merged = data.count ? `，合并 ${data.count} 条旧心跳` : "";
    const unit = data.unitId ? `，模块：${unitName(data.unitId)}` : "";
    return `在线学习 ${estimated}${durationText(data.seconds)}${range}，页面：${viewName(data.view)}${unit}${merged}。`;
  }
  if (type === "interactive_ready") {
    return `打开互动实验「${data.unitLabel || unitName(data.unitId)}」。`;
  }
  if (type === "interactive_click") {
    const target = data.label || data.id || data.name || data.tag || "控件";
    const value = data.value ? `，当前值为「${data.value}」` : "";
    const point = data.point ? `，点击位置 (${data.point.x}, ${data.point.y})` : "";
    return `在互动实验「${data.unitLabel || unitName(data.unitId)}」中点击了「${target}」${value}${point}。`;
  }
  if (type === "interactive_input" || type === "interactive_change") {
    const action = type === "interactive_input" ? "调整" : "确认修改";
    const target = data.label || data.id || data.name || data.tag || "控件";
    const value = data.value ? `为「${data.value}」` : "";
    return `在互动实验「${data.unitLabel || unitName(data.unitId)}」中${action}「${target}」${value}。`;
  }
  if (type === "interactive_submit") {
    return `在互动实验「${data.unitLabel || unitName(data.unitId)}」中提交了表单或答案。`;
  }
  if (type === "iframe_event") {
    return `在互动实验里触发了${data.action || data.event || "一次操作"}。`;
  }
  if (payload.raw) return payload.raw.slice(0, 180);
  const pieces = [];
  if (data.view) pieces.push(`页面：${viewName(data.view)}`);
  if (data.unitId || data.unit) pieces.push(`模块：${unitName(data.unitId || data.unit)}`);
  if (data.text) pieces.push(`对象：「${data.text}」`);
  return pieces.length ? pieces.join("；") : `${interactionTypeName(type)}事件。`;
}

function interactionDetail(row) {
  const payload = parsePayload(row.payload);
  return JSON.stringify(payload, null, 2).slice(0, 800);
}

function normalizeInteractionData(data) {
  if (Array.isArray(data)) {
    return { rows: data, total: data.length, limit: data.length || interactionPageSize, offset: 0 };
  }
  return {
    rows: data?.rows || [],
    total: Number(data?.total || 0),
    limit: Number(data?.limit || interactionPageSize),
    offset: Number(data?.offset || 0)
  };
}

function collapseHeartbeatRows(rows) {
  const heartbeatGapMs = 2 * 60 * 1000;
  const legacyHeartbeatSeconds = 30;
  const output = [];
  const groups = new Map();
  const flushGroup = (key) => {
    const group = groups.get(key);
    if (!group) return;
    const observedSeconds = Math.max(0, Math.round((group.lastAt - group.firstAt) / 1000));
    const seconds = Math.max(legacyHeartbeatSeconds, observedSeconds + legacyHeartbeatSeconds);
    output.push({
      ...group.lastRow,
      created_at: group.endedAt,
      payload: {
        eventType: "online_period",
        data: {
          startedAt: group.startedAt,
          endedAt: group.endedAt,
          seconds,
          view: group.view,
          count: group.count,
          estimated: true,
          source: "heartbeat"
        }
      }
    });
    groups.delete(key);
  };

  [...rows].reverse().forEach((row) => {
    const type = interactionEventType(row);
    if (type !== "heartbeat") {
      output.push(row);
      return;
    }
    const data = row.payload?.data || {};
    const at = new Date(row.created_at || "").getTime();
    if (!at) {
      output.push(row);
      return;
    }
    const key = `${row.user_id || row.nickname || ""}|${data.view || ""}`;
    const existing = groups.get(key);
    if (!existing || at - existing.lastAt > heartbeatGapMs) {
      if (existing) flushGroup(key);
      groups.set(key, {
        firstAt: at,
        lastAt: at,
        startedAt: row.created_at,
        endedAt: row.created_at,
        view: data.view || "",
        count: 1,
        lastRow: row
      });
      return;
    }
    existing.lastAt = at;
    existing.endedAt = row.created_at;
    existing.count += 1;
    existing.lastRow = row;
  });

  [...groups.keys()].forEach(flushGroup);
  return output.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
}

function renderInteractionUserOptions(users = allUsers) {
  const select = document.getElementById("interaction-user-filter");
  if (!select) return;
  const current = interactionUserId;
  select.innerHTML = `<option value="">全部用户</option>` + users
    .map(u => `<option value="${esc(u.user_id || "")}">${esc(u.nickname || "未命名")} (${esc((u.user_id || "").slice(-6))})</option>`)
    .join("");
  select.value = current;
  document.getElementById("interaction-page-size").value = String(interactionPageSize);
}

function updateInteractionPager(meta) {
  const status = document.getElementById("interaction-page-status");
  const prev = document.getElementById("interaction-prev-page");
  const next = document.getElementById("interaction-next-page");
  if (!status || !prev || !next) return;
  const total = Number(meta.total || 0);
  const limit = Math.max(1, Number(meta.limit || interactionPageSize));
  const offset = Math.max(0, Number(meta.offset || 0));
  const start = total ? offset + 1 : 0;
  const end = Math.min(offset + limit, total);
  const page = Math.floor(offset / limit) + 1;
  const pageCount = Math.max(1, Math.ceil(total / limit));
  status.textContent = total ? `第 ${page}/${pageCount} 页 · ${start}-${end} / ${total} 条` : "暂无记录";
  prev.disabled = offset <= 0;
  next.disabled = offset + limit >= total;
}

function safeRows(data) {
  return Array.isArray(data) ? data : [];
}

function renderInteractionSummary(data) {
  if (!data) return;
  const topTypes = safeRows(data.byType).slice(0, 5).map(item => `${interactionTypeName(item.event_type)} ${item.count}`).join(" / ");
  const topRoles = safeRows(data.byRole).slice(0, 5).map(item => `${item.module_role} ${item.count}`).join(" / ");
  const node = document.getElementById("interaction-metrics");
  if (!node) return;
  node.innerHTML = `
    <div class="metric-card highlight"><div class="label">交互总数</div><div class="value">${data.total || 0}</div><div class="sub">当前时间范围</div></div>
    <div class="metric-card good"><div class="label">活跃用户</div><div class="value">${data.activeUsers || 0}</div><div class="sub">产生交互记录</div></div>
    <div class="metric-card warn"><div class="label">主要事件</div><div class="value small">${esc(topTypes || "-")}</div><div class="sub">Top 5</div></div>
    <div class="metric-card"><div class="label">模块角色</div><div class="value small">${esc(topRoles || "-")}</div><div class="sub">Top 5</div></div>`;
}

function renderUnitEngagement(rows) {
  const tbody = document.querySelector("#table-unit-engagement tbody");
  if (!tbody) return;
  const list = safeRows(rows).slice(0, 150);
  tbody.innerHTML = list.length ? list.map((row) => `
    <tr>
      <td>${esc(row.nickname || "")}</td>
      <td>${esc(normalizedChapterName(row))}</td>
      <td>${esc(moduleName(row.unit_id, row.unit_label || ""))}</td>
      <td>${row.opens || 0}</td>
      <td>${row.completes || 0}</td>
      <td>${row.repeats || 0}</td>
      <td>${durationText(row.seconds || 0)}</td>
      <td>${row.clicks || 0}</td>
      <td>${row.parameter_changes || 0}</td>
    </tr>
  `).join("") : "<tr><td colspan='9'>暂无模块参与度数据。</td></tr>";
}

function renderSkipRepeat(data) {
  const tbody = document.querySelector("#table-skip-repeat tbody");
  if (!tbody) return;
  const legacySkipRows = safeRows(data?.skips).flatMap((row) => {
    const detail = parseJsonMaybe(row.detail);
    const skippedUnitIds = Array.isArray(detail.skippedUnitIds) ? detail.skippedUnitIds : [];
    if (skippedUnitIds.length) {
      return skippedUnitIds.map((unitId) => ({
        chapter_id: row.chapter_id || unitId,
        unit_id: unitId,
        skipped: 1,
        repeated: 0,
        users: 1,
        last_at: row.created_at
      }));
    }
    return [{
      chapter_id: row.chapter_id || row.unit_id || "",
      unit_id: row.unit_id || "",
      unit_label: row.unit_label || "跳过记录",
      skipped: 1,
      repeated: 0,
      users: 1,
      last_at: row.created_at
    }];
  });
  const legacyRows = [
    ...legacySkipRows,
    ...safeRows(data?.repeats).map((row) => ({
      chapter_id: row.chapter_id || row.unit_id || "",
      unit_id: row.unit_id || "",
      unit_label: row.unit_label || "",
      skipped: 0,
      repeated: row.repeat_count || 0,
      users: 1,
      last_at: row.last_at
    }))
  ];
  const rows = safeRows(Array.isArray(data) ? data : data?.rows || legacyRows).slice(0, 150);
  tbody.innerHTML = rows.length ? rows.map((row) => `
    <tr>
      <td>${esc(normalizedChapterName(row))}</td>
      <td style="max-width:260px;white-space:normal;">${esc(moduleName(row.unit_id, row.unit_label || ""))}</td>
      <td>${row.skipped || 0}</td>
      <td>${row.repeated || 0}</td>
      <td>${row.users || 0}</td>
      <td>${esc((row.last_at || "").slice(0, 16))}</td>
    </tr>
  `).join("") : "<tr><td colspan='6'>暂无跳过或重复学习记录。</td></tr>";
}

function renderParameterChanges(data) {
  const rows = Array.isArray(data) ? data : data?.rows;
  const hasServerSummary = Boolean(data && !Array.isArray(data) && data.summary);
  const derivedSummary = (() => {
    const list = safeRows(rows);
    const experiments = new Set(list.map((row) => row.unit_id || row.unit_label).filter(Boolean)).size;
    const operations = list.reduce((sum, row) => sum + Number(row.changes || 0), 0);
    return { operations, experiments };
  })();
  const summary = data?.summary || {};
  const summaryNode = document.getElementById("parameter-summary");
  if (summaryNode) {
    summaryNode.innerHTML = `
      <div><strong>${hasServerSummary ? summary.users || 0 : "-"}</strong><span>${hasServerSummary ? "操作人数" : "需重启服务端"}</span></div>
      <div><strong>${summary.operations || derivedSummary.operations || 0}</strong><span>操作次数</span></div>
      <div><strong>${summary.experiments || derivedSummary.experiments || 0}</strong><span>涉及实验</span></div>`;
  }
  const tbody = document.querySelector("#table-parameter-changes tbody");
  if (!tbody) return;
  const list = safeRows(rows).slice(0, 150);
  tbody.innerHTML = list.length ? list.map((row) => `
    <tr>
      <td>${esc(row.unit_label || row.unit_id || "")}</td>
      <td>${esc(row.param || "")}</td>
      <td>${row.changes || 0}</td>
      <td>${row.users || 0}</td>
    </tr>
  `).join("") : "<tr><td colspan='4'>暂无实验操作数据。</td></tr>";
}

function renderPathAnalysis(rows) {
  const tbody = document.querySelector("#table-path-analysis tbody");
  if (!tbody) return;
  const list = safeRows(rows).slice(0, 100);
  tbody.innerHTML = list.length ? list.map((row) => `
    <tr>
      <td>${esc(row.nickname || "")}</td>
      <td>${row.step_count || 0}</td>
      <td>${esc((row.first_at || "").slice(0, 16))} - ${esc((row.last_at || "").slice(0, 16))}</td>
      <td style="max-width:780px;white-space:normal;">${esc(row.path_preview || "")}</td>
    </tr>
  `).join("") : "<tr><td colspan='4'>暂无学习路径数据。</td></tr>";
}

// ---- Interaction Tracking ----
function renderInteractions(data) {
  const meta = normalizeInteractionData(data);
  const rawRows = meta.rows.map(d => ({ ...d, payload: parsePayload(d.payload) }));
  const rows = collapseHeartbeatRows(rawRows);
  updateInteractionPager(meta);
  if (!rows.length) {
    if (!document.getElementById("interaction-metrics").innerHTML.trim()) {
      document.getElementById("interaction-metrics").innerHTML = '<div class="metric-card"><div class="value">0</div><div class="label">暂无交互数据</div></div>';
    }
    const tbody = document.querySelector("#table-interactions tbody");
    if (tbody) tbody.innerHTML = "<tr><td colspan='4'>当前筛选条件下暂无交互记录。</td></tr>";
    return;
  }
  // Metrics
  const types = {};
  rows.forEach(d => {
    const rawType = interactionEventType(d);
    const et = interactionTypeName(rawType).slice(0, 30);
    types[et] = (types[et] || 0) + 1;
  });
  const userSet = new Set(rows.map(d => d.user_id));
  const metricsNode = document.getElementById("interaction-metrics");
  if (metricsNode && !metricsNode.innerHTML.trim()) {
    metricsNode.innerHTML = `
      <div class="metric-card highlight"><div class="label">折叠后显示</div><div class="value">${rows.length}</div><div class="sub">心跳按时段合并</div></div>
      <div class="metric-card good"><div class="label">活跃用户数</div><div class="value">${userSet.size}</div><div class="sub">有交互行为的用户</div></div>
      <div class="metric-card warn"><div class="label">事件类型数</div><div class="value">${Object.keys(types).length}</div><div class="sub">不同操作类型</div></div>
      <div class="metric-card"><div class="label">原始事件总数</div><div class="value">${meta.total}</div><div class="sub">所选时间范围内</div></div>`;
  }
  // Type distribution chart
  destroyChart("interactionTypes");
  const ctx1 = document.getElementById("chart-interaction-types")?.getContext("2d");
  if (ctx1) {
    const sorted = Object.entries(types).sort((a, b) => b[1] - a[1]);
    charts.interactionTypes = new Chart(ctx1, {
      type: "bar",
      data: { labels: sorted.map(e => e[0]), datasets: [{ label: "次数", data: sorted.map(e => e[1]), backgroundColor: "#0b8f8a", borderRadius: 4 }] },
      options: { indexAxis: "y", responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } } }
    });
  }
  // Recent interactions table
  const tbody = document.querySelector("#table-interactions tbody");
  if (tbody) {
    tbody.innerHTML = rows.map(d => {
      const eventType = interactionEventType(d);
      const summary = humanInteractionSummary(d);
      const detail = interactionDetail(d);
      return `<tr>
        <td style="white-space:nowrap;font-size:0.78rem;">${(d.created_at||"").slice(0,16)}</td>
        <td style="font-weight:600;">${esc(d.nickname || "")}</td>
        <td><span class="badge badge-blue">${esc(interactionTypeName(eventType).slice(0,20))}</span></td>
        <td style="font-size:0.82rem;max-width:520px;white-space:normal;line-height:1.45;" title="${esc(detail)}">${esc(summary)}</td>
      </tr>`;
    }).join("");
  }
}

// ---- Tab switching ----
document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    document.querySelectorAll(".tab-content").forEach(c => c.classList.add("hidden"));
    const target = document.getElementById("tab-" + tab.dataset.tab);
    if (target) target.classList.remove("hidden");
  });
});

// ---- Refresh with debounce + abort ----
function debouncedLoadAll() {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    if (loadController) loadController.abort();
    loadController = new AbortController();
    loadAll(loadController.signal);
  }, 300);
}

document.getElementById("refresh-btn").addEventListener("click", debouncedLoadAll);

document.getElementById("interaction-user-filter").addEventListener("change", (event) => {
  interactionUserId = event.target.value;
  sessionStorage.setItem("cq_interaction_user", interactionUserId);
  resetInteractionPage();
  debouncedLoadAll();
});

document.getElementById("interaction-page-size").addEventListener("change", (event) => {
  interactionPageSize = Number(event.target.value || 100);
  sessionStorage.setItem("cq_interaction_page_size", String(interactionPageSize));
  resetInteractionPage();
  debouncedLoadAll();
});

document.getElementById("interaction-prev-page").addEventListener("click", () => {
  if (interactionPage <= 0) return;
  interactionPage -= 1;
  sessionStorage.setItem("cq_interaction_page", String(interactionPage));
  debouncedLoadAll();
});

document.getElementById("interaction-next-page").addEventListener("click", () => {
  interactionPage += 1;
  sessionStorage.setItem("cq_interaction_page", String(interactionPage));
  debouncedLoadAll();
});

// ---- Quick range buttons ----
function setRange(range) {
  currentRange = range;
  sessionStorage.setItem("cq_admin_range", range);
  document.querySelectorAll(".range-btn").forEach(b => b.classList.remove("active"));
  const activeBtn = document.querySelector(`.range-btn[data-range="${range}"]`);
  if (activeBtn) activeBtn.classList.add("active");
  document.getElementById("date-start").value = "";
  document.getElementById("date-end").value = "";
  resetInteractionPage();
  destroyAllCharts();
  debouncedLoadAll();
}

document.querySelectorAll(".range-btn").forEach(btn => {
  btn.addEventListener("click", () => setRange(btn.dataset.range));
});

// ---- Date filter (manual) ----
document.getElementById("filter-apply-btn").addEventListener("click", () => {
  currentRange = "";
  sessionStorage.setItem("cq_admin_range", "");
  document.querySelectorAll(".range-btn").forEach(b => b.classList.remove("active"));
  const allBtn = document.querySelector('.range-btn[data-range=""]');
  if (allBtn) allBtn.classList.add("active");
  resetInteractionPage();
  destroyAllCharts();
  debouncedLoadAll();
});

// Restore active range button on page load
if (currentRange) {
  const activeBtn = document.querySelector(`.range-btn[data-range="${currentRange}"]`);
  if (activeBtn) {
    document.querySelectorAll(".range-btn").forEach(b => b.classList.remove("active"));
    activeBtn.classList.add("active");
  }
}

// ---- User search ----
document.getElementById("user-search-btn").addEventListener("click", () => {
  const q = document.getElementById("user-search-input").value.trim().toLowerCase();
  if (!q) { renderUserTable(allUsers); return; }
  const filtered = allUsers.filter(u => u.nickname.toLowerCase().includes(q) || (u.user_id || "").toLowerCase().includes(q));
  renderUserTable(filtered);
});
document.getElementById("user-search-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("user-search-btn").click();
});

// ---- Init ----
// ---- CSV Export (research) ----
document.getElementById("export-users-csv").addEventListener("click", () => {
  const data = allUsers;
  if (!data || !data.length) return;
  const rows = [["昵称","用户ID","最后活跃","Quiz数","覆盖单元数","正确率%","总得分","总分"]];
  data.forEach(u => {
    rows.push([
      u.nickname || "", u.user_id || "",
      (u.last_seen_at || "").slice(0,16),
      String(u.quiz_count || 0), String(u.units_attempted || 0),
      String(u.avg_accuracy || 0),
      String(u.total_score || 0), String(u.total_max || 0)
    ]);
  });
  const csv = rows.map(r => r.map(c => `"${c.replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;bom" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "user-progress-export.csv";
  a.click();
  URL.revokeObjectURL(a.href);
});

document.getElementById("export-shortanswers-csv").addEventListener("click", () => {
  const rows = [["学生","章节","单元","题目ID","答案","得分","满分","状态","时间"]];
  document.querySelectorAll("#table-shortanswers tbody tr").forEach(tr => {
    const cells = tr.querySelectorAll("td");
    if (cells.length >= 8) {
      const status = cells[6].querySelector(".badge")?.textContent?.trim() || cells[6].textContent.trim();
      rows.push([
        cells[0].textContent.trim(),
        cells[1].textContent.trim(),
        cells[2].textContent.trim(),
        cells[3].textContent.trim(),
        cells[4].textContent.trim(),
        cells[5].textContent.split("/")[0].trim(),
        cells[5].textContent.split("/")[1].trim(),
        status,
        cells[7].textContent.trim()
      ]);
    }
  });
  const csv = rows.map(r => r.map(c => `"${c.replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;bom" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "short-answers-export.csv";
  a.click();
  URL.revokeObjectURL(a.href);
});

checkAuth();
