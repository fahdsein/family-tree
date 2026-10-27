import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { seedState } from "./seed.mjs";

export class FamilyStore {
  constructor() {
    this.state = null;
    this.pool = null;
    this.file = resolve(process.env.DATA_FILE || "./data/family-tree.json");
  }

  async init() {
    if (process.env.DATABASE_URL) {
      const { Pool } = await import("pg");
      this.pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5, connectionTimeoutMillis: 5000 });
      if (/^(1|true|yes)$/i.test(process.env.DATABASE_AUTO_MIGRATE || "")) {
        const schema = await readFile(new URL("../database/schema.sql", import.meta.url), "utf8");
        await this.pool.query(schema);
      }
      const found = await this.pool.query("SELECT document FROM family_tree_documents WHERE workspace_id=$1", ["roots-demo"]);
      this.state = found.rows[0]?.document || seedState();
      if (!found.rows.length) await this.persist();
      return;
    }
    try { this.state = JSON.parse(await readFile(this.file, "utf8")); }
    catch { this.state = seedState(); await this.persist(); }
  }

  snapshot() { return structuredClone(this.state); }

  async mutate(fn) {
    const draft = this.snapshot();
    const result = await fn(draft);
    this.state = draft;
    await this.persist();
    return result;
  }

  async persist() {
    if (this.pool) {
      await this.pool.query(`INSERT INTO family_tree_documents(workspace_id, document, revision)
        VALUES($1,$2,1) ON CONFLICT(workspace_id) DO UPDATE SET document=EXCLUDED.document, revision=family_tree_documents.revision+1, updated_at=now()`, ["roots-demo", this.state]);
      return;
    }
    await mkdir(dirname(this.file), { recursive: true });
    await writeFile(this.file, JSON.stringify(this.state, null, 2));
  }

  async ready() {
    if (!this.pool) return { persistence: "file" };
    await this.pool.query("SELECT 1");
    return { persistence: "postgres" };
  }
}
