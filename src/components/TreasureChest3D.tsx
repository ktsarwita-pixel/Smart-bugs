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
      <div className="treasure-chest-3d__body-front"><span className="treasure-chest-3d__strap treasure-chest-3d__strap--left" /><span className="treasure-chest-3d__strap treasure-chest-3d__strap--right" /><span className="treasure-chest-3d__lock"><i /></span></div>
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
        <div className="treasure-chest-3d__lid-bottom" />
        <div className="treasure-chest-3d__lid-front"><span className="treasure-chest-3d__strap treasure-chest-3d__strap--left" /><span className="treasure-chest-3d__strap treasure-chest-3d__strap--right" /><span className="treasure-chest-3d__lid-latch" /></div>
      </div>
    </div>
  </div>;
}
