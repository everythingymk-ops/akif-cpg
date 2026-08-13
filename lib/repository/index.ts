import { SupabaseRepository } from "./supabase";
import type { AkifRepository } from "./types";

export type { AkifRepository, UiState, WorkspaceSnapshot } from "./types";
export { LocalStorageRepository } from "./localStorage";
export { SupabaseRepository } from "./supabase";

/**
 * The app-wide repository instance — the one-line swap this seam was built
 * for. The workspace is shared, so it lives in Postgres; LocalStorageRepository
 * stays in the tree as the in-memory double the repository tests run against.
 */
export const repository: AkifRepository = new SupabaseRepository();
