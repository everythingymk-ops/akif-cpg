/**
 * Turning an "edit a draft list, then press Save" dialog into per-record
 * writes.
 *
 * The subtlety is which deletions are real. Comparing the draft against the
 * *live* collection would infer a delete for every record the user never saw —
 * including one a colleague added while the dialog was open. Comparing against
 * the snapshot the dialog opened with only ever deletes what this user
 * actually removed, which is the honest reading of their intent.
 */
export interface RecordDiff<T> {
  /** Present in the draft: new or edited, both handled by an upsert. */
  upserts: T[];
  /** Ids the user removed from the list they were shown. */
  deletedIds: string[];
}

export function diffById<T extends { id: string }>(
  snapshot: readonly T[],
  draft: readonly T[],
): RecordDiff<T> {
  const draftIds = new Set(draft.map((record) => record.id));
  return {
    upserts: [...draft],
    deletedIds: snapshot.filter((record) => !draftIds.has(record.id)).map((record) => record.id),
  };
}

/**
 * Same, but skipping records that are unchanged since the snapshot — one
 * network write per genuinely edited row instead of one per visible row.
 */
export function diffChangedById<T extends { id: string }>(
  snapshot: readonly T[],
  draft: readonly T[],
): RecordDiff<T> {
  const before = new Map(snapshot.map((record) => [record.id, JSON.stringify(record)]));
  const { deletedIds } = diffById(snapshot, draft);
  return {
    upserts: draft.filter((record) => before.get(record.id) !== JSON.stringify(record)),
    deletedIds,
  };
}
