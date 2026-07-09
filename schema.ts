/**
 * Butterbase schema for app_agz6hkqam42m (hack-with-bay).
 * Apply via: mcp__butterbase__manage_schema action="apply"
 */
export const schema = {
  tables: {
    sessions: {
      columns: {
        id:              { type: 'uuid',        primaryKey: true, default: 'gen_random_uuid()' },
        user_id:         { type: 'text',        nullable: false },
        title:           { type: 'text',        nullable: false },
        problem:         { type: 'text',        nullable: false },
        academic_query:  { type: 'text' },
        keywords:        { type: 'jsonb',       nullable: false, default: "'[]'::jsonb" },
        research_fields: { type: 'jsonb',       nullable: false, default: "'[]'::jsonb" },
        papers:          { type: 'jsonb',       nullable: false, default: "'[]'::jsonb" },
        created_at:      { type: 'timestamptz', nullable: false, default: 'now()' },
        updated_at:      { type: 'timestamptz', nullable: false, default: 'now()' },
      },
      indexes: {
        sessions_user_id_idx:    { columns: ['user_id'] },
        sessions_created_at_idx: { columns: ['created_at'] },
      },
    },
  },
} as const;

/**
 * REST API notes (Butterbase convention):
 *
 * GET    /sessions?order=created_at.desc&limit=50
 * POST   /sessions          — jsonb columns must be JSON.stringify()'d
 * DELETE /sessions/{id}     — path-based, NOT ?id=eq.{id}
 *
 * RLS: users see only rows where user_id = auth.uid()
 */
