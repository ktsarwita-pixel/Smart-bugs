import { useEffect, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { createDetailedChest } from "../game/chest-model";

/** A genuine hinged 3D chest on the reward card; the sprite remains a safe
 * fallback for devices that cannot create another WebGL context. */
export function TreasureChest3D({ open, fallback }: { open: boolean; fallback: ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
    } catch { return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(84, 76, false);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.3;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffe8b1, 0x57311c, 2.0));
    const light = new THREE.DirectionalLight(0xffe4b1, 2.5);
    light.position.set(-3, 5, 5); scene.add(light);
    const camera = new THREE.OrthographicCamera(-.82, .82, .74, -.74, .1, 20);
    camera.position.set(1.8, 1.6, 3.3);
    camera.lookAt(0, .52, 0);
    const chest = createDetailedChest();
    scene.add(chest.root);
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let start = 0;
    const onContextLost = (event: Event) => {
      event.preventDefault();
      cancelAnimationFrame(frame);
      setReady(false);
    };
    canvas.addEventListener("webglcontextlost", onContextLost);
    const draw = (now: number) => {
      if (!start) start = now;
      const reduced = document.documentElement.dataset.motion === "reduced" || media.matches;
      const seconds = (now - start) / 1000;
      const progress = open ? (reduced ? 1 : Math.min(1, seconds / 1.15)) : 0;
      chest.update(progress, seconds, reduced, document.documentElement.dataset.potato === "1");
      renderer.render(scene, camera);
      const currentProgress = String(Math.round(progress * 100));
      const lidAngle = chest.lid.rotation.x.toFixed(4);
      if (canvas.dataset.openProgress !== currentProgress) canvas.dataset.openProgress = currentProgress;
      if (canvas.dataset.lidAngle !== lidAngle) canvas.dataset.lidAngle = lidAngle;
      if (open && !reduced && (progress < 1 || document.documentElement.dataset.potato !== "1")) frame = requestAnimationFrame(draw);
    };
    draw(performance.now());
    setReady(!renderer.getContext().isContextLost());
    return () => {
      cancelAnimationFrame(frame);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      chest.dispose(); renderer.dispose();
      // Do not force context loss: StrictMode reuses this same canvas on its
      // second effect setup, and losing it would also break that new renderer.
    };
  }, [open]);

  return <div className={`treasure-chest-3d${ready ? " treasure-chest-3d--ready" : ""}`} data-renderer={ready ? "webgl" : "fallback"} aria-hidden="true">
    {fallback}<canvas ref={canvasRef} />
  </div>;
}
