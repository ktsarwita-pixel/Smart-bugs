/** A single, immediately rendered CSS-3D chest. Its lid, front, back and sides
 * are real depth planes sharing one hinge; there is no sprite-to-WebGL swap. */
export function TreasureChest3D({ open }: { open: boolean }) {
  return <div className={`treasure-chest-3d${open ? " treasure-chest-3d--open" : ""}`} data-renderer="css3d" data-chest-state={open ? "open" : "closed"} aria-hidden="true">
    <div className="treasure-chest-3d__world">
      <div className="treasure-chest-3d__body-back" />
      <div className="treasure-chest-3d__body-side treasure-chest-3d__body-side--left" />
      <div className="treasure-chest-3d__body-side treasure-chest-3d__body-side--right" />
      <div className="treasure-chest-3d__floor" />
      <div className="treasure-chest-3d__cavity">
        {/* A packed, pixel-cut bed of treasure stays inside the chest. */}
        <svg data-chest-treasure className="treasure-chest-3d__treasure" viewBox="0 0 60 16" preserveAspectRatio="none" shapeRendering="crispEdges">
          <path fill="#9b5a19" d="M0 8h4V5h7V3h8V2h8v2h5V1h8v3h7V2h7v4h6v10H0z" />
          <path fill="#d7942b" d="M1 8h5V6h7V4h6v2h5V3h5v3h5V2h5v3h7V4h6v3h7v8H1z" />
          <path fill="#ffd064" d="M2 8h5v2H2zM10 5h5v2h-5zM19 5h5v2h-5zM27 7h5v2h-5zM34 3h5v2h-5zM43 6h5v2h-5zM53 8h5v2h-5zM5 12h6v2H5zM16 11h6v2h-6zM37 11h6v2h-6zM49 12h6v2h-6z" />
          <path fill="#fff0aa" d="M3 8h3v1H3zM11 5h3v1h-3zM20 5h3v1h-3zM35 3h3v1h-3zM44 6h3v1h-3zM54 8h3v1h-3z" />
        </svg>
        <i /><i /><i /><i /><i /><i /><i />
        <span className="treasure-chest-3d__gem" /><span className="treasure-chest-3d__gem treasure-chest-3d__gem--ruby" />
      </div>
      <div className="treasure-chest-3d__body-front">
        <svg className="treasure-chest-3d__pixel-texture" viewBox="0 0 64 30" preserveAspectRatio="none" shapeRendering="crispEdges">
          <path fill="#713719" d="M2 5h4v1H2zM58 5h4v1h-4zM17 5h7v1h-7zM40 5h7v1h-7zM19 14h5v1h-5zM40 14h5v1h-5zM16 23h8v1h-8zM40 23h8v1h-8z" />
          <path fill="#e7a359" d="M17 3h6v1h-6zM41 3h6v1h-6zM18 12h6v1h-6zM40 12h6v1h-6zM17 21h6v1h-6zM41 21h6v1h-6z" />
          <path data-chest-planks fill="#d88c40" d="M16 7h9v1h-9zM39 7h9v1h-9zM17 16h8v1h-8zM39 16h8v1h-8zM17 25h8v1h-8zM39 25h8v1h-8z" />
          <path fill="#84421d" d="M22 4h3v1h-3zM39 4h3v1h-3zM20 13h2v1h-2zM42 13h2v1h-2zM22 22h3v1h-3zM39 22h3v1h-3z" />
          <path fill="#c88b37" d="M0 0h5v2H3v4H0zM59 0h5v6h-3V2h-2zM0 24h3v4h3v2H0zM61 24h3v6h-6v-2h3z" />
          <path fill="#ffe49c" d="M1 1h2v1H1zM61 1h2v1h-2zM1 27h2v1H1zM61 27h2v1h-2z" />
          {/* A small inset maker's mark, echoed by the VS and board chests. */}
          <path data-chest-emblem fill="#673615" d="M31 18h2v1h2v3h-2v1h-2v-1h-2v-3h2z" />
          <path fill="#e5ad51" d="M31 19h2v1h1v1h-1v1h-2v-1h-1v-1h1z" />
          <path fill="#fff0b5" d="M31 19h2v1h-2z" />
        </svg>
        <span className="treasure-chest-3d__strap treasure-chest-3d__strap--left" /><span className="treasure-chest-3d__strap treasure-chest-3d__strap--right" /><span className="treasure-chest-3d__lock"><i /></span>
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
            <path fill="#9b5324" d="M14 4h8v1h-8zM32 4h8v1h-8zM17 11h7v1h-7zM30 11h7v1h-7zM14 18h8v1h-8zM32 18h8v1h-8z" />
            <path fill="#efaa55" d="M16 2h6v1h-6zM32 2h6v1h-6zM19 9h5v1h-5zM30 9h5v1h-5zM16 16h6v1h-6zM32 16h6v1h-6z" />
            <path fill="#fff0b5" d="M8 2h2v2H8zM44 2h2v2h-2zM8 18h2v2H8zM44 18h2v2h-2z" />
          </svg>
        </div>
        <div className="treasure-chest-3d__lid-ridge-back" />
        {/* A second connected step gives the lid a fuller, domed silhouette. */}
        <div className="treasure-chest-3d__lid-crown-front" />
        <div className="treasure-chest-3d__lid-crown-back" />
        <div className="treasure-chest-3d__lid-crown-side treasure-chest-3d__lid-crown-side--left" />
        <div className="treasure-chest-3d__lid-crown-side treasure-chest-3d__lid-crown-side--right" />
        <div className="treasure-chest-3d__lid-crown-top">
          <svg data-chest-crown className="treasure-chest-3d__pixel-texture" viewBox="0 0 42 22" preserveAspectRatio="none" shapeRendering="crispEdges">
            <path fill="#8f4a20" d="M8 5h8v1H8zM26 5h8v1h-8zM11 12h7v1h-7zM24 12h7v1h-7zM8 18h8v1H8zM26 18h8v1h-8z" />
            <path fill="#edac59" d="M10 3h6v1h-6zM26 3h6v1h-6zM13 10h5v1h-5zM24 10h5v1h-5zM10 16h6v1h-6zM26 16h6v1h-6z" />
            <path fill="#fff0b5" d="M2 2h2v2H2zM38 2h2v2h-2zM2 18h2v2H2zM38 18h2v2h-2z" />
          </svg>
        </div>
        <div className="treasure-chest-3d__lid-bottom">
          <svg className="treasure-chest-3d__pixel-texture" viewBox="0 0 62 18" preserveAspectRatio="none" shapeRendering="crispEdges">
            <path fill="#6c3a1a" d="M9 5h9v1H9zM44 5h9v1h-9zM11 12h8v1h-8zM43 12h8v1h-8z" />
            <path fill="#f4c56e" d="M29 3h4v2h2v5h-2v2h-4v-2h-2V5h2z" />
            <path fill="#985c27" d="M30 5h2v5h-2z" />
          </svg>
        </div>
        <div className="treasure-chest-3d__lid-front">
          <svg className="treasure-chest-3d__pixel-texture" viewBox="0 0 64 12" preserveAspectRatio="none" shapeRendering="crispEdges">
            <path fill="#f2b967" d="M17 2h8v1h-8zM39 2h8v1h-8z" />
            <path fill="#7a3b1a" d="M19 6h6v1h-6zM39 6h6v1h-6z" />
          </svg>
          <span className="treasure-chest-3d__strap treasure-chest-3d__strap--left" /><span className="treasure-chest-3d__strap treasure-chest-3d__strap--right" /><span className="treasure-chest-3d__lid-latch" />
        </div>
      </div>
    </div>
  </div>;
}
