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

  return { csvCell };
});
