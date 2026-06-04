/**
 * AMWALI App Build Number.
 *
 * Rules:
 *  - Plain incrementing integer. Increase by +1 with every meaningful release.
 *  - Compared against `latestBuild` / `minSupportedBuild` in /version.json.
 *  - BUILD_DATE is informational only — shown to support staff.
 *
 * To bump: change APP_BUILD here, then bump `latestBuild` in
 * public/version.json. To force-block older clients, also raise
 * `minSupportedBuild` and set `forceUpdate: true`.
 */
export const APP_BUILD = 2;
export const BUILD_DATE = "2026-06-04";

export const APP_VERSION_LABEL = `Build #${APP_BUILD} (${BUILD_DATE})`;