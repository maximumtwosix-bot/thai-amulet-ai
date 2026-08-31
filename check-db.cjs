const Database = require("better-sqlite3");

const db = new Database("./data/thai-amulet.db", {
  readonly: true,
});

const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
  .all();

console.log(tables);

db.close();
