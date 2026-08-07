ALTER TABLE knowledge_dependencies
  DROP CONSTRAINT knowledge_dependencies_dependency_type_check;

ALTER TABLE knowledge_dependencies
  ADD CONSTRAINT knowledge_dependencies_dependency_type_check CHECK (
    dependency_type IN (
      'identity_binding',
      'relationship_context',
      'source_resource',
      'evidence_fragment',
      'fact_version',
      'research_snapshot',
      'observed_outcome',
      'approved_procedure'
    )
  );
