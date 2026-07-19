(function attachAdminCsv(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.AdminCsv = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createAdminCsvApi() {
  function csvCell(value) {
    let text = String(value ?? "");
    if (/^[\t\r\n ]*[=+\-@]/.test(text)) text = "'" + text;
    return `"${text.replace(/"/g, '""')}"`;
  }

  function normalizePageData(data, fallbackLimit = 500) {
    if (Array.isArray(data)) {
      return {
        rows: data,
        total: data.length,
        limit: data.length || fallbackLimit,
        offset: 0
      };
    }
    const rows = Array.isArray(data?.rows) ? data.rows : [];
    const total = Number.isFinite(Number(data?.total))
      ? Math.max(rows.length, Number(data.total))
      : rows.length;
    return {
      rows,
      total,
      limit: Math.max(1, Number(data?.limit || fallbackLimit)),
      offset: Math.max(0, Number(data?.offset || 0))
    };
  }

  async function fetchAllRows(fetchPage, options = {}) {
    if (typeof fetchPage !== "function") throw new TypeError("fetchPage must be a function");
    const pageSize = Math.max(1, Number(options.pageSize || 1000));
    const maxPages = Math.max(1, Number(options.maxPages || 10000));
    const rows = [];
    let offset = 0;
    let expectedTotal = null;

    for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
      const page = normalizePageData(
        await fetchPage({ limit: pageSize, offset }),
        pageSize
      );
      if (expectedTotal === null) expectedTotal = page.total;
      if (!page.rows.length) {
        if (offset < expectedTotal) {
          throw new Error(`导出在第 ${offset + 1} 条处提前结束，请刷新后重试。`);
        }
        break;
      }
      rows.push(...page.rows);
      offset += page.rows.length;
      if (offset >= expectedTotal) break;
      if (page.rows.length < pageSize) {
        throw new Error(`导出只读取到 ${offset}/${expectedTotal} 条，请刷新后重试。`);
      }
    }

    if (expectedTotal !== null && rows.length < expectedTotal) {
      throw new Error(`导出超过安全分页次数，只读取到 ${rows.length}/${expectedTotal} 条。`);
    }
    return expectedTotal === null ? rows : rows.slice(0, expectedTotal);
  }

  return { csvCell, normalizePageData, fetchAllRows };
});
