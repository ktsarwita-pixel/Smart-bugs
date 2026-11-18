import { useId } from "react";

/** Front-on oak, hammered brass and a jade scarab. A short sweep is clipped
 * to the metal, so the silhouette and the centered lock never move. */
export function ChestIcon({ size = 28 }: { size?: number }) {
  const rimId = useId();
  return <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" shapeRendering="crispEdges" className="chest-icon chest-icon--advanced">
    <path fill="#291711" d="M2 15h2v-4h2V8h2V6h3V4h10v2h3v2h2v3h2v4h2v11h-2v3H4v-3H2z" />
    <path data-chest-dome fill="#9f5329" d="M4 14v-2h2V9h2V7h3V5h10v2h3v2h2v3h2v2z" />
    <path fill="#d28741" d="M10 7h12v2H10zM8 10h16v2H8z" />
    <path fill="#ffcd79" d="M11 5h10v1H11zM8 7h3v1H8zM21 7h3v1h-3z" />
    <path fill="#793c23" d="M4 16h24v11H4z" />
    <path fill="#b86a32" d="M5 17h22v3H5zM5 22h22v3H5z" />
    <path fill="#602d21" d="M5 20h22v2H5zM5 25h22v1H5zM7 13h18v1H7z" />
    <path data-chest-grain fill="#e7a454" d="M11 10h3v1h-3zM19 11h2v1h-2zM10 17h3v1h-3zM20 17h2v1h-2zM11 23h3v1h-3zM18 22h3v1h-3z" />
    <path fill="#714021" d="M7 10h4v17H7zM21 10h4v17h-4zM3 14h26v3H3zM4 25h24v3H4z" />
    <path fill="#c98b36" d="M8 9h2v5H8zM22 9h2v5h-2zM8 17h2v8H8zM22 17h2v8h-2zM3 14h26v2H3zM4 25h24v2H4z" />
    <path data-chest-corners fill="#e4a84d" d="M3 22h3v3h2v2H4v-2H3zM26 22h3v3h-1v2h-4v-2h2z" />
    <path fill="#ffe099" d="M5 14h22v1H5zM6 25h20v1H6zM8 11h1v1H8zM23 11h1v1h-1zM8 18h1v1H8zM23 18h1v1h-1zM4 23h1v1H4zM27 23h1v1h-1z" />
    <g data-chest-emblem>
      <path fill="#4d2b1c" d="M13 22h2v-1h2v1h2v2h-2v1h-2v-1h-2z" />
      <path fill="#68c5a3" d="M15 22h2v2h-2z" />
      <path fill="#b6f3c7" d="M15 22h1v1h-1z" />
    </g>
    <path data-chest-lock fill="#392017" d="M14 12h4v1h2v6h-1v2h-6v-2h-1v-6h2z" />
    <path fill="#eeb94c" d="M14 13h4v1h1v5h-1v1h-4v-1h-1v-5h1z" />
    <path fill="#fff0b6" d="M14 13h4v1h-4zM13 14h1v2h-1z" />
    <path fill="#724525" d="M15 15h2v2h-1v2h-1z" />
    <defs><clipPath id={rimId}><path d="M3 14h9v2H3zM20 14h9v2h-9zM4 25h24v2H4zM14 13h4v1h-4z" /></clipPath></defs>
    <g clipPath={`url(#${rimId})`}>
      <path className="chest-icon__shine" fill="#fff8d5" d="M3 12h4L2 29h-4zM8 12h1L4 29H3z" />
    </g>
  </svg>;
}
