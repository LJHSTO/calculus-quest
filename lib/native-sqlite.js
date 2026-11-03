"use strict";
const { DatabaseSync } = require("node:sqlite");

// Preserve the small sql.js interface used by the stores, with durable page writes.
function openDatabase(filename) {
  const database = new DatabaseSync(filename, { timeout: 5000, enableForeignKeyConstraints: false });
  database.exec("PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;");
  const args = values => Array.isArray(values) ? values : values ? [values] : [];
  return {
    native: true,
    run(sql, values) {
      if (values && (!Array.isArray(values) || values.length)) database.prepare(sql).run(...args(values));
      else database.exec(sql);
      return this;
    },
    prepare(sql) {
      let statement = database.prepare(sql), values = [], iterator = null, row = null;
      function reset() { iterator?.return?.(); iterator = null; row = null; }
      return {
        bind(parameters) { reset(); values = args(parameters); return true; },
        step() {
          if (!iterator) iterator = statement.iterate(...values);
          const next = iterator.next(); row = next.value;
          return !next.done;
        },
        getAsObject() { return { ...row }; },
        free() { reset(); statement = null; }
      };
    },
    getRowsModified() { return database.prepare("SELECT changes() AS count").get().count; },
    close() { database.close(); }
  };
}
module.exports = { openDatabase };
