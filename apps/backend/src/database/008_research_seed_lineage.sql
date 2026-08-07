ALTER TABLE research_tasks
  ADD COLUMN seed_resource_id uuid;

ALTER TABLE research_tasks
  ADD CONSTRAINT research_tasks_seed_resource_fk
  FOREIGN KEY (account_id, seed_resource_id)
  REFERENCES source_resources(account_id, id);

CREATE INDEX research_tasks_seed_resource_idx
  ON research_tasks(account_id, seed_resource_id)
  WHERE seed_resource_id IS NOT NULL;
