(function () {
  "use strict";
  const labels = {
    browser_error: "页面脚本异常", browser_rejection: "异步任务异常",
    resource_failed: "脚本或样式加载失败", api_network: "网络请求失败", api_5xx: "服务端接口失败",
    server_exception: "服务端异常退出", server_rejection: "服务端异步异常",
    grading_unavailable: "模型评分不可用", monitor_test: "监控测试"
  };
  let records = [], busy = false;
  const status = document.getElementById("monitoring-status");
  function render(data) {
    records = data.rows || [];
    status.textContent = `站内记录：${data.enabled ? "已开启" : "已关闭"}；Sentry：${data.sentryState}；版本：${data.release}`
      + (data.storageError ? "；磁盘保存失败，当前仅有内存记录" : "")
      + (data.dropped ? `；限流丢弃 ${data.dropped} 条` : "");
    const body = document.querySelector("#monitoring-table tbody");
    body.replaceChildren();
    for (const row of records) {
      const tr = document.createElement("tr");
      for (const value of [new Date(row.lastAt).toLocaleString("zh-CN"), row.source === "browser" ? "浏览器" : "服务端",
        labels[row.code] || "其他异常", `${row.file || row.route || "-"}${row.line ? `:${row.line}:${row.column}` : ""}`,
        row.count, row.release, row.id]) {
        const td = document.createElement("td");
        td.textContent = String(value);
        tr.append(td);
      }
      body.append(tr);
    }
    if (!records.length) {
      const row = body.insertRow(), cell = row.insertCell();
      cell.colSpan = 7;
      cell.textContent = "暂无错误记录";
    }
  }
  async function load(test = false) {
    if (busy) return;
    busy = true;
    const buttons = ["monitoring-refresh", "monitoring-test"].map((id) => document.getElementById(id));
    buttons.forEach((button) => { button.disabled = true; });
    try {
      const response = await fetch(`${API_BASE}/api/admin/monitoring`, {
        method: test ? "POST" : "GET", headers: adminRequestHeaders(), cache: "no-store"
      });
      if (!response.ok) throw new Error("monitoring_unavailable");
      const payload = await response.json();
      render(payload.data);
      if (test) status.textContent += payload.eventId
        ? `；测试事件 ${payload.eventId}` + (payload.data.sentryConfigured
          ? "，请在Sentry项目中核对是否收到" : "，仅写入站内记录，尚未配置Sentry")
        : "；监控关闭或已限流，本次没有产生测试事件";
    } catch { status.textContent = "读取失败，请检查管理员登录和服务器连接。"; }
    finally { busy = false; buttons.forEach((button) => { button.disabled = false; }); }
  }
  document.querySelector('[data-tab="monitoring"]').addEventListener("click", () => load());
  document.getElementById("monitoring-refresh").addEventListener("click", () => load());
  document.getElementById("monitoring-test").addEventListener("click", () => load(true));
  document.getElementById("monitoring-export").addEventListener("click", () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(records, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "错误监控记录.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
})();
