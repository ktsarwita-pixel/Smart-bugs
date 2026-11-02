/** Which interface a build renders.
 *
 *  v0.7 publishes every update to the original server as well as the test one,
 *  so the modern interface is no longer a preview-only skin: `advancedGame` is
 *  true everywhere and `/` gets exactly the same screens as `/preview/`.
 *
 *  Kept as a function (instead of deleting the call sites) so the historical
 *  name still compiles; the argument is ignored on purpose. */
export function isAdvancedGameLocation(_location?: Pick<Location, "pathname" | "search">): boolean {
  return true;
}

/** The opt-in test door: `/preview/`, or the `?advenced` query (which redirects
 *  there). Only this decides whether the ADVANCED TEST BUILD banner shows — it
 *  never decides which release or which interface you get. */
export function isTestBuildLocation(location: Pick<Location, "pathname" | "search">): boolean {
  return new URLSearchParams(location.search).has("advenced") || /^\/preview\/?$/i.test(location.pathname);
}
