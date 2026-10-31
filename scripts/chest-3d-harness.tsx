import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { TreasureChest3D } from "../src/components/TreasureChest3D";
import "../src/index.css";
const params = new URLSearchParams(location.search);
if (params.has("reduced")) document.documentElement.dataset.motion = "reduced";
function Fixture() {
  const [open, setOpen] = useState(params.has("open"));
  return <><button onClick={() => setOpen(true)}>Open</button><div style={{ background: "#f4dca5", width: 84, height: 76 }}><TreasureChest3D open={open} fallback={<svg className="pixel-treasure" viewBox="0 0 4 4"><path fill="brown" d="M0 0h4v4H0z" /></svg>} /></div></>;
}
createRoot(document.getElementById("root")!).render(<StrictMode><Fixture /></StrictMode>);
