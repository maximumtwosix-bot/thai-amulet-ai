const Database = require("better-sqlite3");

const db = new Database("./data/thai-amulet.db");

const result = db.prepare(`
  INSERT INTO content (
    title,
    content_type,
    platform,
    caption,
    status
  )
  VALUES (?, ?, ?, ?, 'draft')
`).run(
  "TEST - Content Studio",
  "facebook",
  "facebook",
  "ทดสอบระบบบันทึกคอนเทนต์ THAI AMULET TH"
);

console.log("INSERT สำเร็จ:", result.lastInsertRowid);

const row = db.prepare(`
  SELECT *
  FROM content
  WHERE id = ?
`).get(result.lastInsertRowid);

console.log("ข้อมูลที่บันทึก:");
console.log(row);

db.close();
