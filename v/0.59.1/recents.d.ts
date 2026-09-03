/** One recently opened project — repository coordinates, never an in-repo path. */
interface RecentProject {
    provider: string;
    namespace: string;
    repository: string;
    /** The ref the user opened (`main`, a sha). */
    ref: string;
    /** When the user last opened it (epoch ms). */
    ts: number;
}
/**
 * The user's recently opened projects, newest-first, or `null` when the record is
 * absent (R-OSO-22: cleared is absent, never an empty list). Refuses for any app
 * that is not the `page.home` binding.
 */
declare function listRecentProjects(): Promise<RecentProject[] | null>;
/**
 * Clear the user's recent-projects record (the surface afterwards is absent, not
 * empty). Rides the same page.home binding gate as the read.
 */
declare function clearRecentProjects(): Promise<void>;

export { type RecentProject, clearRecentProjects, listRecentProjects };
