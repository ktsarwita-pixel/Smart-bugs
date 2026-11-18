/** Deterministic 3D fixture for commanders' real, engine-authored events. */
import {createRoot} from 'react-dom/client';
import {Scene3D} from '../src/components/Scene3D';
import {createBattle, markOracleTarget, stepBattle, type PrepUnit} from '../src/game/engine';
import {SettingsProvider} from '../src/i18n';
import '../src/index.css';

const unit = (uid: number, bugId: PrepUnit['bugId'], slot: number, star = 1): PrepUnit => ({uid, bugId, slot, star, zone: 'board'});
const prep = [unit(1, 'stag', 4, 2), unit(2, 'mantis', 1)];
const foes = [unit(3, 'stag', 17), unit(4, 'bomb', 16, 2), unit(5, 'dragonfly', 10)];
const rival = new URLSearchParams(location.search).has('mirror') ? 'lampyris' : 'worm';
const battle = createBattle(prep, foes, 'lampyris', rival);
const [mark, sacrifice, attacker] = battle.units;
for (const u of battle.units) { u.cd = 100; u.spd = 0; }
Object.assign(window, {
  commanderFxHarness: {
    step: (count: number) => { for (let i = 0; i < count; i++) stepBattle(battle, 0.1); },
    cast: (side: 'ally' | 'foe' = 'ally') => {
      const receiver = side === 'ally' ? mark : attacker;
      const before = Math.floor(receiver.maxHp / 2);
      receiver.hp = before;
      markOracleTarget(battle, side, receiver.uid);
      return before;
    },
    crossThreshold: () => {
      // Wounded after the opening trap. A stag's 34 ATK is 51 on Vulnerable.
      const before = mark.maxHp / 2 + 51;
      mark.hp = before;
      markOracleTarget(battle, 'ally', mark.uid);
      Object.assign(attacker, {x: mark.x - .3, y: mark.y - .8, cd: 0});
      stepBattle(battle, .1);
      attacker.cd = 100;
      return before;
    },
    fall: () => {
      // Generate a real KO, which should emit a soul toward the marked ally.
      sacrifice.hp = 1;
      attacker.x = sacrifice.x;
      attacker.y = sacrifice.y - 0.25;
      attacker.cd = 0;
      stepBattle(battle, 0.1);
      attacker.cd = 100;
    },
    battle,
  },
});
createRoot(document.getElementById('root')!).render(<SettingsProvider>
  <Scene3D mode="battle" prep={prep} battle={battle} cmdA="lampyris" cmdB={rival} advancedEffects className="h-full w-full" />
</SettingsProvider>);
