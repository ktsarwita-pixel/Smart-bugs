import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { ChestIcon } from "../src/components/ChestIcon";
import { UiDoctor } from "../src/components/UiDoctor";
import { TreasureChest3D } from "../src/components/TreasureChest3D";
import "../src/index.css";

const params = new URLSearchParams(location.search);
if (params.has("reduced")) document.documentElement.dataset.motion = "reduced";

function Fixture() {
  const [open, setOpen] = useState(params.has("open"));
  return <>
    <button onClick={() => setOpen(true)}>Open</button>
    {params.has("icons") && <div style={{ display: "flex", gap: 8 }}><ChestIcon /><ChestIcon size={32} /></div>}
    <div style={{ background: "#f4dca5", width: 84, height: 76 }}><TreasureChest3D open={open} /></div>
    <UiDoctor />
  </>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><Fixture /></StrictMode>);
