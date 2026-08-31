const Database = require("better-sqlite3");

const db = new Database("./data/thai-amulet.db", {
  readonly: true,
});

const columns = db
  .prepare("PRAGMA table_info(content)")
  .all();

console.log(columns);

db.close();
