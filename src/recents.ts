// The recent-projects record — app-facing surface (R3-485, OSO §4.3).
//
// `listRecentProjects()` reads the HOST-OWNED record through the one elevated,
// app-scoped `recents:read` capability. Two gates stand between an app and the
// record, and both must pass: the §8.4 capability grant (declared as
// `requests: { 'recents:read': {} }` and consented per (app, principal)), and the
// handler's structural binding — the read is granted only to the app bound at
// `page.home`. For every other app the call resolves to a refusal, whatever it
// declared.
//
// A project entry is COORDINATES (provider/namespace/repository/ref + when) — a
// location the user already navigated to under their own authority, never an
// in-repo path. Opening one runs the ordinary load path with the ordinary
// consent: the record confers nothing (R-OSO-22).
import { protocolRequest } from './sandboxUtils';
import { PROTOCOL_RECENTS } from './generated/protocol';
import { SCHEMES } from './protocolSchemes';

/** One recently opened project — repository coordinates, never an in-repo path. */
export interface RecentProject {
  provider: string;
  namespace: string;
  repository: string;
  /** The ref the user opened (`main`, a sha). */
  ref: string;
  /** When the user last opened it (epoch ms). */
  ts: number;
}

interface RecentsReply {
  /** Newest-first; `null` when the record is empty or the user cleared it. */
  projects: RecentProject[] | null;
}

/**
 * The one call shape the SDK speaks under `protocol-recents` — read, or clear
 * (same gated surface). A single typed call site keeps the wire contract exact:
 * the snapshot gate reads THIS shape, and the host handler accepts the same.
 */
const recentsRequest = (params: { clear?: boolean }): Promise<RecentsReply> =>
  protocolRequest(SCHEMES[PROTOCOL_RECENTS], 'list', [params]) as Promise<RecentsReply>;

/**
 * The user's recently opened projects, newest-first, or `null` when the record is
 * absent (R-OSO-22: cleared is absent, never an empty list). Refuses for any app
 * that is not the `page.home` binding.
 */
export async function listRecentProjects(): Promise<RecentProject[] | null> {
  const res = await recentsRequest({});
  return res.projects ?? null;
}

/**
 * Clear the user's recent-projects record (the surface afterwards is absent, not
 * empty). Rides the same page.home binding gate as the read.
 */
export async function clearRecentProjects(): Promise<void> {
  await recentsRequest({ clear: true });
}
