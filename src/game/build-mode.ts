/** The playable test build is deliberately opt-in. The public game is built
 * separately, but keeping this check here also makes a plain local build safe. */
export function isAdvancedGameLocation(location: Pick<Location, "pathname" | "search">): boolean {
  return new URLSearchParams(location.search).has("advenced") || /^\/preview\/?$/i.test(location.pathname);
}
