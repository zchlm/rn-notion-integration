import Database from "better-sqlite3"

// Create DB
const db = new Database("notion.db", {})
db.prepare("CREATE TABLE blocks(id TEXT PRIMARY KEY, data TEXT)").run()
