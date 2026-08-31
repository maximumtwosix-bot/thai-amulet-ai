const Database = require("better-sqlite3");

const db = new Database("./data/thai-amulet.db", {
  readonly: true,
});

const rows = db.prepare(`
  SELECT id, title, caption
  FROM content
  ORDER BY id DESC
`).all();

for (const row of rows) {
  console.log("\n===== CONTENT " + row.id + " =====");
  console.log("TITLE:", row.title);
  console.log("CAPTION:", row.caption);
}

db.close();
