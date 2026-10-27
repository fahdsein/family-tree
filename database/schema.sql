CREATE TABLE IF NOT EXISTS family_tree_documents (
  workspace_id text PRIMARY KEY,
  document jsonb NOT NULL,
  revision bigint NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);
