# Magic WildLife — Pixel Bug Auto-Chess

A 3D voxel auto-chess battler (React 19 + Vite 7 + Three.js + Tailwind CSS 4 + TypeScript).
Choose a bug commander, recruit and evolve your army, and fight until only one colony survives.

## ▶ Just want to play?

Open **`Smart-Bugs-RUN-DIRECTLY.html`** in any browser (double-click it).
Everything — React, Three.js, CSS, fonts, game code — is bundled inside that one file.
No server, no npm, no internet needed.

## 🛠 Develop / import the project

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production single-file build -> dist/index.html
```

Rebuild the optimized direct-run file after code changes:

```bash
npm run build
pip install fonttools brotli
python3 scripts/make-direct.py   # writes Smart-Bugs-RUN-DIRECTLY.html
```

## 📦 Import formats in this package (flexible)

| Format | Where | Use it when |
|---|---|---|
| Normal source project | `index.html`, `package.json`, `src/…` | Importing into VS Code / any IDE / most AI tools |
| Single playable file | `Smart-Bugs-RUN-DIRECTLY.html` | Playing or sharing the game as-is |
| Markdown-wrapped source | `export-md/*.md` | A platform only accepts `.md` uploads — each `.md` wraps one original file (`# name` + code fence) and restores 1:1 |

Original file map for `export-md/` — strip the trailing `.md` and place at:

```
index.html, package.json, tsconfig.json, vite.config.ts      (project root)
src/App.tsx, src/main.tsx, src/i18n.tsx, src/index.css
src/utils/cn.ts
src/components/{AdminPanel,CodexModal,CustomIcons,PixelArt,RoundResults,Scene3D,SettingsModal,SpecimenIcon}.tsx
src/game/{airstrike,animate,data,engine,match,voxel}.ts
scripts/make-direct.py   (bonus: rebuilds the direct-run HTML)
```

## 🐉 Dragonfly ultimate — how it works (designer spec)

**Airstrike (3-star only):** the dragonfly climbs (untouchable while airborne), dives onto the
densest enemy cluster, and leaves a 2-second field with 2 ticks.

- Total damage per enemy in the field = **220% (2.2×) of your whole living team's combined ATK**
- Each tick = **110% of combined ATK**, *recalculated at tick time* — more/stronger allies alive
  means bigger ticks; as allies fall, the remaining ticks weaken.
- Example: team ATK 254 + 66 + 97 = **Σ417** → 417 × 2.2 = **918 total, 459/tick**.
- Tune it with one constant: `AIRSTRIKE_TEAM_ATK_MULT` in `src/game/airstrike.ts`.
- The Battle HUD shows this live ("AIRSTRIKE FORECAST"), including every unit's true ATK.

Dragonfly stats: 1★ 400 HP / 60 ATK · 2★ 750 / 140 · 3★ 1100 / 235,
plus the Slipstream passive (only takes 20% damage from non-projectile attacks).

## 🎨 UI (Field Lab Console v2)

- Integrated top command deck: colony HP · round · YOU-vs-foe plaque · gold/line/streak,
  with a ranked colony ladder underneath.
- Battle HUD "LINE vs LINE" cards: per-unit HP numbers, true ATK, HP + mana bars,
  ULT-READY glow, AIR/KO states, team ΣATK totals and enemy-Airstrike warnings.
- Title-screen dossier shows per-star stats for every bug.

## 🛠 Admin Panel (tap mode)

Open with the **ADMIN** button (passphrase-gated; auto-unlocks as you type, remembered for the tab session).

- **UNITS** — pick a bug + star (with live stat preview) → GIVE; put in shop; star-up/remove selected; charge mana.
- **ECONOMY** — sliders/steppers for gold, your HP, opponent HP; tap-to-apply line size; shop refresh/lock.
- **MATCH** — battle speed 1–3×, force win/lose, engage/next, two-tap reset.
- **Advanced** — the original typed commands (`give dragonfly 3`, `gold set 200`, `hp set 50`, `manaall`, …).

## ⚔️ Damage model — damage = ATK, exactly

There is **no hidden defense reduction**. A unit's basic attack deals exactly its
displayed ATK (e.g. 3★ Dragonfly shows 235 ATK → every basic hit pops **235**).
Skills deal exactly their stated multiplier × ATK (Stag Pincer Lock 2.1× → 109 → **229**).
Only two openly-labelled modifiers exist:

- **Vulnerable** (Worm hole): ×1.5 damage taken — shown as `VULN ×1.5` in the HUD.
- **Slipstream** (Dragonfly passive): takes ×0.2 from non-projectile attacks.

The stat you see in prep (including the Matriarch's +18% HP / +8% ATK) is the exact
stat used in battle — `battleStats()` in `src/game/engine.ts` is the single source.

## 🌐 Languages

Settings → **English / Bahasa Indonesia**. *Every* visible string is translated:
menus, shop/inspector, battle telemetry, result reports, Field Guide (bug & commander
lore, rules), Admin Panel, toasts, battle log, and even the 3D combat pop-ups
(DIVE → MENUKIK, etc.). Translations live in `src/i18n.tsx` (English string = key);
proper names (Vespa Syndicate, Latin species names) stay as-is in both languages.

## 📱 Mobile battle layout

On phones the battle dock can never crush the 3D stage: unit cards become
fixed-height **horizontal swipe strips** (`BARIS ANDA` / foe rows), the dock is
capped (~52dvh), the VS plaque & colony ladder hide during combat, and the stage
keeps a large share of the screen even at 6v6.

## 🚀 Publish it on the web (free, ~2 minutes)

The game is a single static HTML file, so any static host works:

1. **Netlify Drop** — open <https://app.netlify.com/drop> and drag in
   `Smart-Bugs-Web.zip` (contains the game as `index.html`). You instantly get a
   public `https://…netlify.app` game link.
2. **itch.io** — Create project → Kind of project: *HTML* → upload
   `Smart-Bugs-Web.zip` → tick *"This file will be played in the browser"*.
3. **GitHub Pages** — put the HTML from the zip in a repo as `index.html`,
   then Settings → Pages → deploy from branch.

For development you can also just run `npm run dev` / `npm run build` as above.
