# Magic WildLife — Pixel Bug Auto-Chess

A 3D voxel auto-chess battler (React 19 + Vite 7 + Three.js + Tailwind CSS 4 + TypeScript).
Choose a bug commander, recruit and evolve your army, and fight until only one colony survives.

## ▶ Just want to play?

Play the latest release at **[smart-bugs.vercel.app](https://smart-bugs.vercel.app/)**.
To play offline, generate `Smart-Bugs-RUN-DIRECTLY.html` using the steps below,
then open that file in a browser.

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

No internet (or fonts.gstatic.com is unreachable)? Rebuild only the HTML with the
font subsets already embedded in the previous direct-run file — the script
re-embeds them and checks that the UI copy still has every glyph it needs:

```bash
python3 scripts/make-direct.py --reuse-fonts=Smart-Bugs-RUN-DIRECTLY.html
```

## v0.9 — Commander skills

Bonds no longer affect either side's combat stats. Bug roles still identify
specimens in the Field Guide and determine World Worm's same-role recruit.

| Commander | Passive | Active skill |
|---|---|---|
| Ancient Scavanger | Three losses in a row schedule 25G and two 1★ copies of the strongest owned bug at the end of the following round, once per match. | Each pair of consecutive wins earns an uncapped use of Incomes. Pick any owned bug for base cost + 1G. The bug stays; using it in round R makes it ready again in R+2. |
| Hyber Lantern | A fallen ally sends a white soul to its nearest living teammate to heal 10% of max HP. | Mark a deployed ally in prep or battle. At 50 HP or less it heals 15% immediately, again at +1.5s and +3s, then 30% at +6s. The final ray strikes the surrounding 3×3 tiles for 75% of the marked bug's ATK before incoming damage modifiers. |
| World Worm | The two strongest enemies take 100 damage each at battle start and are stunned for 3s, then Vulnerable for 10s. | Every three completed rounds grants one Eat and spit use (up to five stored). Consume a bench bug for two 1★ recruits: one of the same role and one random. |

Strength is ordered by stars, max HP, ATK, then oldest recruit. Skill recruits
can moult immediately, even with a full bench. Overflow waits in reserve and
lands as soon as there's room. Treasure still uses its normal claim button.
Rival Oracles pick their strongest deployed bug at battle start; treasure guards
have no commander. Players can target via the 3D drawer, the bench where valid,
or the keyboard-accessible target list.

Pressure present stamps a sealed relic into the report and opens it on payout.
Incomes sends coins to the Gold counter; Eat and spit chomps the bench bug and
pops out two recruit portraits. Trap holes erupt from the tiles and clamp shut,
and Last Spark lands with a healing halo. The Oracle ray winds down from above
the marked bug and ends in the same green 3×3 impact. Reduced Motion keeps the
cues readable without most movement; Potato trims extra particles and strands.

Run the commander-specific checks against Vite:

```bash
node scripts/commander-rules-smoke.mjs
BASE_URL=http://127.0.0.1:5173 CHROMIUM_PATH=/path/to/chromium node scripts/commander-browser-smoke.mjs
BASE_URL=http://127.0.0.1:5173 CHROMIUM_PATH=/path/to/chromium node scripts/commander-fx-smoke.mjs
BASE_URL=http://127.0.0.1:5173 CHROMIUM_PATH=/path/to/chromium node scripts/commander-framing-smoke.mjs
```

`SHOTS=dir` saves the browser captures. The FX harness shows the actual battle
state and WebGL effects, not a mock-up of the animations.

## v0.8 — Fair initiative, sound, career record

### Fair initiative

Units used to act in array order, so the ally line always moved and struck first inside
a tick. Measured over mirror matches (identical line-ups on both sides), the
ally side won between 42% and 81% depending on the line-up instead of 50%. Strictly
alternating the order did not fix it (a 3-Mantis mirror went to 0%), because the tick
on which two lines meet has a fixed parity. Initiative is now a coin flip per tick;
mirror matches measure 46–54% over 500–600 fights each. Two consequences worth knowing:
close fights are slightly harder for the player than in v0.7, and simulated
rival-vs-rival duels no longer favour the colony listed first.

### Sound

The game shipped silent. `src/game/sfx.ts` synthesises every cue with WebAudio at play
time (no audio files, nothing fetched, the single-file build stays single-file). Battle
audio is driven by the pop-up stream the engine already emits. Cues are rate-limited per
name and voice-capped. Settings → **SOUND** has an on/off switch and a volume slider;
audio starts only after the first tap or keypress (browser autoplay policy).

### Career record

Finished matches are kept in `localStorage` (`smartbugs.career`): matches, titles,
podiums, best finish, longest win streak, round win rate and a per-commander tally. A
match is written once, when your final place is known; abandoned matches are not
counted. It shows on the main menu and the final standings, and Settings can erase it.

### Also

- `E` sells the selected bug during prep.
- `__BUILD_TIME__` on the `/advanced` page falls back to `dev` when the build does not
  define it, instead of throwing.

```bash
node scripts/v08-regression-smoke.mjs   # mirror-match fairness and career record

# Browser check (needs a Chromium executable and playwright-core, like the other visual scripts):
npm run build && npx vite preview --port 4173 &
CHROMIUM_PATH=/path/to/chromium node scripts/v08-browser-smoke.mjs
```

The browser check drives the real build, fights a live battle and confirms it
was voiced, flips the sound switch, and finishes a match to prove the career
record is written once. `SHOTS=dir` keeps screenshots.

## 📊 Damage Shower — the in-battle damage chart

The combat dock lists every bug on your line with the damage it **actually dealt**
this fight, sorted from the heaviest hitter down, plus a bar for its share of the
line's output. The header folds the chart away, and `SHOW ENEMY DAMAGE` reveals the
enemy line in the same layout. Tables show the damage each bug took on tablets and
desktop, and every row keeps it in its tooltip.

Attribution is exact because every hit in `src/game/engine.ts` funnels through the
single `damage()` function, which credits `src.dealt`, `tgt.taken` and `src.kills`:

| Damage source | Credited to |
|---|---|
| Basic attacks, Pincer Lock, Caustic Burst, Raking Slash, shells | the attacker |
| Battle Roar (exact, ignores modifiers) | the roaring Spider |
| Enraged poison ticks | the Spider that applied the poison (`poisonFrom`) |
| After Web 3×3 snare | the web's owner; the victim if that owner is gone |
| Airstrike field ticks | the Dragonfly that called it (`zone.srcUid`) |
| Trap holes (opening bites) | the Worm side's strongest opening unit |
| Hits against Vulnerable bugs | the bug that landed the hit, with the multiplier applied |
| Final wave impact | the Oracle's marked bug |

`damageLedger(battle)` returns both lines already sorted, with 0..1 `share` values —
plain, JSON-safe data that survives the 4 Hz HUD snapshot.

```bash
npm run test:damage   # engine ledger + bilingual panel rendering (no browser needed)
npm run test:notes    # every patch note renders in Indonesian (no browser needed)
npm run test:fuzz     # 400 random battles: the ledger must match the HP they removed
npm run test:ladder   # colony detail panel must take the ladder rail's exact box
npm run test:publish  # every advanced-server update also ships to the original server
npm run test:doctor   # UI Doctor chrome + findings render in the selected language
```

The UI Doctor speaks the interface language: its panel chrome, status messages, every
finding label and every finding sentence go through the same translator as the rest of
the game (`npm run test:doctor` fails if any English line would leak in Bahasa
Indonesia). Tapping a colony in the ladder reuses the rail's own box — same width, same
height, same edges — instead of a separately sized overlay that could cross the deck
border.

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

- **Vulnerable** (after a Worm trap releases): ×1.5 damage taken — shown as `VULN ×1.5` in the HUD.
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

The battlefield gets the extra room first. In portrait combat, unit cards
swipe horizontally and the telemetry details scroll in their own dock, with
speed and Settings always reachable above them. Short phones can still scroll
the page during setup to reach the full bench and shop. When the stage is wide
enough, the zoom controls move to a separate side rail to give the board more
height; **FIT** keeps the drawer and commander plinths in frame.

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

### Publishing: one build, every door

**Release policy:** Publish every completed, tested Smart Bugs update to
`smart-bugs.vercel.app`. A local preview or Git push is not a release. Verify
that Vercel has promoted the tested commit to the live domain before calling
it shipped. The original and advanced/test URLs always get the same build.

`smart-bugs.vercel.app` and `smart-bugs.vercel.app/?advenced` serve the same
release. The `?advenced` spelling (intentional) hands off to `/preview/`, which
shows the ADVANCED TEST BUILD banner without changing the game or layouts.
`bash smartbugs-build.sh` builds once, prints a bundle fingerprint, and
packages the same bundle at `/`, `/preview/`, `/advanced` and `/advenced`. The
last two paths open the in-app balance tables while `DEV_BUILD` is enabled.
Only `/` gets an extra query router. `npm run test:publish` checks that the game bytes
are otherwise identical, and `npm run test:ui-default` checks the banner rules.

The Vercel project does not deploy on Git pushes. For a file-based production
deployment, push the release commit and send `smartbugs-build.sh`, `vercel.json`
and a text file named `smartbugs-release-ref` containing that commit's full SHA
(`git rev-parse HEAD`). With no checkout uploaded, the build script downloads
that exact revision from the public repo. The project runs `bash smartbugs-build.sh`
with a no-op install command and serves `dist`.

To verify the chest artwork and reveal locally, start `npm run dev` and run:

```bash
CHROMIUM_PATH=/path/to/chromium npm run test:chest
CHROMIUM_PATH=/path/to/chromium npm run test:treasure-art
```

### Mobile UI smoke test

With a Chromium executable installed, start the Vite server and run:

```bash
npm run dev
CHROMIUM_PATH=/path/to/chromium npm run test:mobile
CHROMIUM_PATH=/path/to/chromium npm run test:gameplay-size
```

The mobile test exercises board scrolling, shop and bench taps, and phase transitions.
The gameplay-size test measures the projected 3D drawer in portrait, landscape, and
wide windows, and checks that scrolling battle telemetry leaves the controls in place.
Set `BASE_URL` if the development server is not on port 5173. The targeted
visual regressions can also be run against the development server:

```bash
npm run test:roar                # simulation and pose timing (no browser)
CHROMIUM_PATH=/path/to/chromium npm run test:round-icons
CHROMIUM_PATH=/path/to/chromium npm run test:roar:visual
```

`REDUCED=1`, `POTATO=1` or `SPEED=3` exercise alternate roar settings. The
browser harness also supports `SCENARIO=simultaneous` and `SCENARIO=legacy`.
