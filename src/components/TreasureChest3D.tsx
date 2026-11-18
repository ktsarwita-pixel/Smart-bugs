import { useId } from "react";

/** Painted separately from the 3D geometry so fading the light cannot
 * flatten the lid or the body. The burst stays inside the chest's card slot. */
function TreasureReveal() {
  const lightId = useId();
  return <svg className="treasure-chest-3d__reveal" viewBox="0 0 84 76" shapeRendering="crispEdges">
    <defs>
      <linearGradient id={lightId} x1="0" y1="0" x2="0" y2="1">
        <stop stopColor="#fff1ba" stopOpacity="0" />
        <stop offset="1" stopColor="#ffe19a" stopOpacity=".88" />
      </linearGradient>
    </defs>
    <g className="treasure-chest-3d__rays" fill={`url(#${lightId})`}>
      <path d="M32 34 13 11 24 14 39 34zM44 34 38 1 47 3 49 34zM50 34 65 9 73 7 57 34z" />
    </g>
    <g className="treasure-chest-3d__spark treasure-chest-3d__spark--left">
      <path fill="#b77029" d="M20 11h4v1h1v4h-1v1h-4v-1h-1v-4h1z" />
      <path fill="#ffda72" d="M20 12h4v4h-4z" /><path fill="#fff5c9" d="M20 12h3v1h-3z" />
    </g>
    <g className="treasure-chest-3d__spark treasure-chest-3d__spark--center">
      <path fill="#14705e" d="m42 4 5 5-5 5-5-5z" /><path fill="#70e0b0" d="m42 5 4 4-4 4-4-4z" />
      <path fill="#d8ffda" d="m42 5 4 4h-8z" />
    </g>
    <g className="treasure-chest-3d__spark treasure-chest-3d__spark--right">
      <path fill="#fff3b2" d="M61 11h2v3h3v2h-3v3h-2v-3h-3v-2h3z" />
    </g>
  </svg>;
}

/** The artwork lives on the actual 3D planes. One model renders immediately
 * on win and loss, with the hinge fixed to the rear edge in every frame. */
export function TreasureChest3D({ open }: { open: boolean }) {
  return <div className={`treasure-chest-3d${open ? " treasure-chest-3d--open" : ""}`} data-renderer="css3d" data-chest-state={open ? "open" : "closed"} aria-hidden="true">
    <div className="treasure-chest-3d__world">
      <div className="treasure-chest-3d__body-back" />
      <div className="treasure-chest-3d__body-side treasure-chest-3d__body-side--left" />
      <div className="treasure-chest-3d__body-side treasure-chest-3d__body-side--right" />
      <div className="treasure-chest-3d__floor" />
      <div className="treasure-chest-3d__cavity">
        <svg data-chest-treasure className="treasure-chest-3d__treasure" viewBox="0 0 60 16" preserveAspectRatio="none" shapeRendering="crispEdges">
          <path fill="#88501d" d="M0 9h4V6h7V4h8V2h8v3h5V2h8v3h7V3h7v4h6v9H0z" />
          <path fill="#d99938" d="M1 9h5V7h7V5h6v2h5V4h5v3h5V3h5v3h7V5h6v3h7v7H1z" />
          <path fill="#ffc85f" d="M2 9h5v2H2zM10 6h5v2h-5zM19 6h5v2h-5zM27 8h5v2h-5zM34 4h5v2h-5zM43 7h5v2h-5zM53 9h5v2h-5zM5 12h6v2H5zM16 11h6v2h-6zM37 11h6v2h-6zM49 12h6v2h-6z" />
          <path fill="#fff0aa" d="M3 9h3v1H3zM11 6h3v1h-3zM20 6h3v1h-3zM35 4h3v1h-3zM44 7h3v1h-3zM54 9h3v1h-3z" />
        </svg>
        <i /><i /><i /><i /><i /><i /><i />
        <svg className="treasure-chest-3d__gem" viewBox="0 0 12 12" shapeRendering="crispEdges">
          <path fill="#184b3e" d="M3 0h6l3 4-6 8-6-8z" />
          <path fill="#52cba3" d="m3 1-2 3 5 7 5-7-2-3z" />
          <path fill="#a9f3c6" d="M3 1h6L8 4H4z" /><path fill="#278a74" d="M8 4h3l-5 7z" />
        </svg>
        <svg className="treasure-chest-3d__gem treasure-chest-3d__gem--ruby" viewBox="0 0 12 12" shapeRendering="crispEdges">
          <path fill="#6b311f" d="m6 0 6 6-6 6-6-6z" />
          <path fill="#e66849" d="m6 1 5 5-5 5-5-5z" />
          <path fill="#ffad7b" d="m6 1 5 5H1z" /><path fill="#ffdd97" d="m6 1-2 5H1z" />
        </svg>
      </div>
      <div className="treasure-chest-3d__body-front">
        <svg className="treasure-chest-3d__pixel-texture" viewBox="0 0 64 30" preserveAspectRatio="none" shapeRendering="crispEdges">
          <path fill="#532a20" d="M0 0h64v30H0z" />
          <path fill="#a25b33" d="M2 3h60v7H2zM2 12h60v7H2zM2 21h60v5H2z" />
          <path fill="#7d3b26" d="M2 8h60v2H2zM2 17h60v2H2zM2 24h60v2H2z" />
          <path data-chest-planks fill="#cb8245" d="M15 4h8v1h-8zM41 5h7v1h-7zM17 7h6v1h-6zM17 13h7v1h-7zM43 14h6v1h-6zM14 22h5v1h-5zM42 22h7v1h-7z" />
          <path fill="#602e22" d="M19 6h5v1h-5zM41 8h5v1h-5zM16 16h9v1h-9zM42 16h4v1h-4zM16 24h6v1h-6zM42 24h7v1h-7z" />
          {/* Brass braces follow the same offsets on the body and hinged lid. */}
          <path fill="#7d4b26" d="M7 0h8v27H7zM49 0h8v27h-8zM0 0h64v3H0zM0 25h64v5H0z" />
          <path fill="#d29448" d="M8 1h5v26H8zM51 1h5v26h-5zM0 0h64v2H0zM0 26h64v2H0z" />
          <path fill="#e5a74f" d="M0 0h6v3H3v4H0zM58 0h6v7h-3V3h-3zM0 22h3v4h4v4H0zM61 22h3v8h-7v-4h4z" />
          <path fill="#ffe19c" d="M8 4h2v1H8zM54 4h2v1h-2zM9 10h2v2H9zM53 10h2v2h-2zM9 20h2v2H9zM53 20h2v2h-2zM1 26h2v2H1zM61 26h2v2h-2zM16 26h32v1H16z" />
          <g data-chest-emblem>
            <path fill="#65391f" d="M21 17h7v-2h8v2h7v2h-3v3h-4v3h-8v-3h-4v-3h-3z" />
            <path fill="#e2ad5c" d="M22 17h7v-1h6v1h7v2h-6v1h-8v-1h-6zM25 20h4v1h-4zM35 20h4v1h-4z" />
            <path fill="#276958" d="M30 17h4v1h2v4h-2v2h-4v-2h-2v-4h2z" />
            <path fill="#86d0a5" d="M30 18h4v1h1v2h-2v2h-2v-2h-2v-2h1z" /><path fill="#c1efc1" d="M30 18h4v1h-4z" />
          </g>
          <g className="treasure-chest-3d__lock">
            <path fill="#48281c" d="M27-2h10v2h3v10h-2v3H26v-3h-2V0h3z" />
            <path fill="#e3ad55" d="M27-1h10v2h2v8h-2v3H27V9h-2V1h2z" />
            <path fill="#fff0ad" d="M27-1h10v1H27zM25 1h2v3h-2z" />
            <path fill="#9a612e" d="M27 9h10v2H27zM36 1h2v8h-2z" />
            <path fill="#56321e" d="M30 3h4v3h-1v3h-2V6h-1z" />
            <path className="treasure-chest-3d__lock-flash" fill="#fff6c4" d="M27 0h9v1h-9zM30 2h4v1h-4zM25 1h2v3h-2z" />
          </g>
        </svg>
      </div>
      <span className="treasure-chest-3d__body-anchor" />
      <div className="treasure-chest-3d__lid">
        <span className="treasure-chest-3d__lid-anchor" />
        <div className="treasure-chest-3d__lid-back" />
        <div className="treasure-chest-3d__lid-side treasure-chest-3d__lid-side--left" />
        <div className="treasure-chest-3d__lid-side treasure-chest-3d__lid-side--right" />
        <div className="treasure-chest-3d__lid-top" />
        <div className="treasure-chest-3d__lid-ridge-front" />
        <div className="treasure-chest-3d__lid-ridge-side treasure-chest-3d__lid-ridge-side--left" />
        <div className="treasure-chest-3d__lid-ridge-side treasure-chest-3d__lid-ridge-side--right" />
        <div className="treasure-chest-3d__lid-ridge-top">
          <svg data-chest-ridge className="treasure-chest-3d__pixel-texture" viewBox="0 0 54 22" preserveAspectRatio="none" shapeRendering="crispEdges">
            <path fill="#935129" d="M13 3h10v1H13zM31 6h9v1h-9zM14 12h8v1h-8zM30 14h10v1H30zM13 18h9v1h-9zM30 18h7v1h-7z" />
            <path fill="#e8a45b" d="M14 2h7v1h-7zM31 5h8v1h-8zM16 10h6v1h-6zM33 12h6v1h-6zM14 17h8v1h-8zM30 17h6v1h-6z" />
            <path fill="#fff0b5" d="M8 2h2v2H8zM44 2h2v2h-2zM8 18h2v2H8zM44 18h2v2h-2z" />
          </svg>
        </div>
        <div className="treasure-chest-3d__lid-ridge-back" />
        <div className="treasure-chest-3d__lid-crown-front" />
        <div className="treasure-chest-3d__lid-crown-back" />
        <div className="treasure-chest-3d__lid-crown-side treasure-chest-3d__lid-crown-side--left" />
        <div className="treasure-chest-3d__lid-crown-side treasure-chest-3d__lid-crown-side--right" />
        <div className="treasure-chest-3d__lid-crown-top">
          <svg data-chest-crown className="treasure-chest-3d__pixel-texture" viewBox="0 0 42 22" preserveAspectRatio="none" shapeRendering="crispEdges">
            <path fill="#9a5028" d="M6 5h11v1H6zM24 6h11v1H24zM9 12h8v1H9zM25 13h9v1h-9zM8 18h10v1H8zM25 18h8v1h-8z" />
            <path fill="#f4bc6b" d="M3 1h36v1H3zM8 4h8v1H8zM25 5h8v1h-8zM10 10h5v1h-5zM26 11h7v1h-7zM9 16h8v1H9zM26 16h6v1h-6z" />
            <path fill="#ffedb1" d="M2 2h2v2H2zM38 2h2v2h-2zM2 18h2v2H2zM38 18h2v2h-2z" />
          </svg>
        </div>
        <div className="treasure-chest-3d__lid-bottom">
          <svg className="treasure-chest-3d__pixel-texture" viewBox="0 0 62 18" preserveAspectRatio="none" shapeRendering="crispEdges">
            <path fill="#63816d" d="M13 3h36v12H13z" />
            <path fill="#2e4e44" d="M15 4h32v10H15z" />
            <path fill="#b47e42" d="M10 3h4v1h-4zM48 3h4v1h-4zM10 13h4v1h-4zM48 13h4v1h-4z" />
            <path fill="#d5a250" d="M19 7h9V5h6v2h9v2h-4v2h-5v2h-6v-2h-5V9h-4z" />
            <path fill="#fff0ac" d="M20 7h8v1h-8zM34 7h8v1h-8zM29 5h4v1h-4z" />
            <path fill="#5ebb9f" d="m31 6 3 3-3 3-3-3z" /><path fill="#b4e5b9" d="m31 6 3 3h-6z" />
          </svg>
        </div>
        <div className="treasure-chest-3d__lid-front">
          <svg className="treasure-chest-3d__pixel-texture" viewBox="0 0 64 12" preserveAspectRatio="none" shapeRendering="crispEdges">
            <path fill="#edb464" d="M3 1h58v1H3zM16 4h8v1h-8zM40 4h8v1h-8z" />
            <path fill="#763a24" d="M17 6h7v1h-7zM40 7h7v1h-7z" />
            <path fill="#835024" d="M7 0h8v10H7zM49 0h8v10h-8zM0 9h64v3H0z" />
            <path fill="#daa14c" d="M8 0h5v9H8zM51 0h5v9h-5zM0 9h64v2H0z" />
            <path fill="#fff0ae" d="M9 2h2v2H9zM53 2h2v2h-2zM2 9h60v1H2z" />
          </svg>
          <span className="treasure-chest-3d__lid-latch" />
        </div>
      </div>
    </div>
    {open && <TreasureReveal />}
  </div>;
}
