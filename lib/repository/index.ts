import { LocalStorageRepository } from "./localStorage";
import type { AkifRepository } from "./types";

export type { AkifRepository, UiState, WorkspaceSnapshot } from "./types";
export { LocalStorageRepository } from "./localStorage";

/**
 * The app-wide repository instance. Swapping the backend (e.g. Supabase in a
 * later phase) means changing this one assignment — engine and UI are
 * untouched (locked decision).
 */
export const repository: AkifRepository = new LocalStorageRepository();
