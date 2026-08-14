/**
 * Issue the next account-wide revision. The UPDATE ... RETURNING runs as a
 * single statement, so two concurrent callers can never receive the same value.
 */
export const nextRevision = async (db: D1Database): Promise<number> => {
  const row = await db
    .prepare("UPDATE meta SET value = value + 1 WHERE key = 'revision' RETURNING value")
    .first<{ value: number }>();
  if (!row) throw new Error('revision counter row missing — migrations not applied');
  return row.value;
};

/** The highest revision issued so far. Used as the pull cursor high-water mark. */
export const currentRevision = async (db: D1Database): Promise<number> => {
  const row = await db
    .prepare("SELECT value FROM meta WHERE key = 'revision'")
    .first<{ value: number }>();
  if (!row) throw new Error('revision counter row missing — migrations not applied');
  return row.value;
};
