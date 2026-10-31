/** Deterministic browser fixture for both sides, interruption and motion mode. */
import { createRoot } from "react-dom/client";
import { Scene3D } from "../src/components/Scene3D";
import { createBattle, stepBattle, type BattleState, type PrepUnit } from "../src/game/engine";
import { SettingsProvider } from "../src/i18n";
import "../src/index.css";

const unit = (uid: number, bugId: PrepUnit["bugId"], star: number, slot: number): PrepUnit => ({ uid, bugId, star, slot, zone: "board" });
const params = new URLSearchParams(location.search);
const edge = params.has("edge");
const battle = createBattle(
  [unit(1, "spider", 3, edge ? 0 : 4), unit(2, "stag", 3, 1)],
  [unit(3, "spider", 3, edge ? 6 : 4), unit(4, "stag", 3, 1)],
  "matriarch", "matriarch",
);
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

createRoot(document.getElementById("root")!).render(
  <SettingsProvider><Scene3D mode="battle" battle={battle} battleRef={battleRef} advancedEffects={!params.has("legacy")} className="h-full w-full" /></SettingsProvider>,
);
