/** Deterministic browser fixture for both sides, interruption and motion mode. */
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { Scene3D } from "../src/components/Scene3D";
import { UiDoctor } from "../src/components/UiDoctor";
import { createBattle, stepBattle, type BattleState, type PrepUnit } from "../src/game/engine";
import { type CmdId } from "../src/game/data";
import { SettingsProvider } from "../src/i18n";
import "../src/index.css";

const unit = (uid: number, bugId: PrepUnit["bugId"], star: number, slot: number): PrepUnit => ({ uid, bugId, star, slot, zone: "board" });
const params = new URLSearchParams(location.search);
// Match the shortest real landscape battle stage from the first render.
if (params.has("short")) document.getElementById("root")!.style.height = "180px";
const edge = params.has("edge");
const commander = (value: string | null): CmdId => value === "lampyris" || value === "worm" ? value : "matriarch";
const cmdA = commander(params.get("cmdA")), cmdB = commander(params.get("cmdB"));
const prep = [unit(1, "spider", 3, edge ? 0 : 4), unit(2, "stag", 3, 1)];
const foes = [unit(3, "spider", 3, edge ? 6 : 4), unit(4, "stag", 3, 1)];
const battle = createBattle(prep, foes, "matriarch", "matriarch");
for (const u of battle.units) { u.hp = u.maxHp = 5000; u.cd = 100; u.spd = 0; }
const battleRef = { current: battle } as React.RefObject<BattleState | null>;
Object.assign(window, {
  roarHarness: {
    battle,
    step: (count: number) => { for (let i = 0; i < count; i++) stepBattle(battle, 0.1); },
    interrupt: (uid: number) => {
      const spider = battle.units.find((u) => u.uid === uid)!;
      spider.hp = 0; spider.dead = true;
    },
  },
});

function Fixture() {
  const [mode, setMode] = useState<"prep" | "battle">(params.has("prep") ? "prep" : "battle");
  const [zoom, setZoom] = useState(Number(params.get("zoom")) || 1);
  Object.assign((window as unknown as { roarHarness: object }).roarHarness, { start: () => setMode("battle"), zoom: setZoom });
  return <><Scene3D mode={mode} prep={prep} battle={battle} battleRef={battleRef} cmdA={cmdA} cmdB={cmdB} drawerZoom={zoom} advancedEffects={!params.has("legacy")} className="h-full w-full" />{params.has("doctor") && <UiDoctor />}</>;
}
createRoot(document.getElementById("root")!).render(<SettingsProvider><Fixture /></SettingsProvider>);
