/** A single, immediately rendered CSS-3D chest. Its lid, front, back and sides
 * are real depth planes sharing one hinge; there is no sprite-to-WebGL swap. */
export function TreasureChest3D({ open }: { open: boolean }) {
  return <div className={`treasure-chest-3d${open ? " treasure-chest-3d--open" : ""}`} data-renderer="css3d" data-chest-state={open ? "open" : "closed"} aria-hidden="true">
    <div className="treasure-chest-3d__world">
      <div className="treasure-chest-3d__body-back" />
      <div className="treasure-chest-3d__body-side treasure-chest-3d__body-side--left" />
      <div className="treasure-chest-3d__body-side treasure-chest-3d__body-side--right" />
      <div className="treasure-chest-3d__floor" />
      <div className="treasure-chest-3d__cavity"><i /><i /><i /><i /><i /><span className="treasure-chest-3d__gem" /></div>
      <div className="treasure-chest-3d__body-front">
        <svg className="treasure-chest-3d__pixel-texture" viewBox="0 0 64 30" preserveAspectRatio="none" shapeRendering="crispEdges">
          <path fill="#713719" d="M2 5h4v1H2zM58 5h4v1h-4zM17 5h7v1h-7zM40 5h7v1h-7zM19 14h5v1h-5zM40 14h5v1h-5zM16 23h8v1h-8zM40 23h8v1h-8z" />
          <path fill="#e7a359" d="M17 3h6v1h-6zM41 3h6v1h-6zM18 12h6v1h-6zM40 12h6v1h-6zM17 21h6v1h-6zM41 21h6v1h-6z" />
          <path fill="#c88b37" d="M0 0h5v2H3v4H0zM59 0h5v6h-3V2h-2zM0 24h3v4h3v2H0zM61 24h3v6h-6v-2h3z" />
          <path fill="#ffe49c" d="M1 1h2v1H1zM61 1h2v1h-2zM1 27h2v1H1zM61 27h2v1h-2z" />
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
        <div className="treasure-chest-3d__lid-ridge-top" />
        <div className="treasure-chest-3d__lid-ridge-back" />
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
