# Burn Vector

A browser space trading and combat game, built as a tribute to **Escape Velocity** (Ambrosia Software, 1996). Fly a ship across a 46-system galaxy, trade commodities, take missions, upgrade your hull and weapons, hire or capture escorts, fight corsairs, and play through a seven-chapter story that spans every faction. Everything in it is original: the ships, star map, factions, text, art (procedural canvas rendering) and audio (synthesized at runtime).

## Run it

```bash
bun install
```

```bash
bun run dev
```

Then open http://localhost:5317. Sound starts **off**; press **V** or click the speaker in the top-left corner to turn it on (the choice is remembered). The **?** button next to it (or the **?** / **F1** key) opens the Pilot's Handbook from any screen.

Production build (static files in `dist/`):

```bash
bun run build
```

Type check:

```bash
bun run typecheck
```

## Controls

| Key | Action |
| --- | --- |
| ← → | Turn |
| ↑ | Thrust |
| ↓ | Turn to reverse heading |
| Z | Afterburner (if installed) |
| Space | Fire primary weapons (and turrets) |
| Shift | Fire secondary weapon |
| W / Q | Cycle secondary weapon |
| Tab / Shift+Tab | Cycle targets |
| R | Target nearest hostile |
| A | Aim at target |
| C | Clear target |
| L | Land (press again to pick the next planet) |
| M | Galaxy map: click a system to plot a route |
| J | Hyperspace jump along your route |
| H | Hail target ship or planet (bribes, fines, fuel) |
| B | Board a disabled ship (loot or capture it) |
| I | Pilot dossier |
| - / = | Zoom out / in |
| Esc / P | Pause |
| V | Sound on / off, anywhere |
| ? or F1 | Pilot's Handbook (help), anywhere |
| Click | Select a ship or planet |

In the spaceport: **T** trade, **O** outfitter, **S** shipyard, **M** missions, **B** bar, **F** refuel, **G** map, **I** dossier, **L** or **Enter** take off.

## How to play

You never have to guess what to do next: an objective panel in flight and a "Next step" card in every spaceport name the next goal and the exact keys to press, starting with a six-step getting-started path (buy cargo, plot a route, jump, sell, take a mission, upgrade). Accepting a mission plots its route automatically. One-time tips appear the first time you meet a hostile ship, disable a target or run low on fuel. The Handbook explains everything else, and the objective panel can be switched off from it or from the pause menu.

- **Trade.** Buy commodities where the market is Low and sell where it is High. The bar's rumors point to good routes.
- **Missions.** Cargo runs, rush deliveries, passengers, courier packets, bounties and (in the Shoal) smuggling. Deadlines are real; failing costs standing.
- **Outfit and upgrade.** Ships have gun mounts, turret mounts and a fixed amount of outfit space. Buy a better hull at a shipyard (your old ship is traded in). An escape pod keeps you alive when your ship dies.
- **Reputation.** Each government tracks your standing. Attack lawful ships and their police turn on you; kill corsairs and lawful worlds love you. Hail patrols to pay fines, pirates to pay tribute, and spaceports to bribe your way in.
- **Escorts.** Hire mercenaries at spaceport bars (daily wages) or board a disabled ship and try to capture it. Up to four ships fly with you; captured prizes can be sold at shipyards.
- **The story.** Once you have some experience (a few kills, jumps or missions), look for a gray-haired man at the mission boards of Mira Crossroads, Antares Waystation, Hyades Market, Kapteyn's Reach, Canopus Landing or Pollux Freeport.
- **The Vael.** Their space lies beyond the Shroud nebula, east of the League. Earn their trust to buy their technology.

Your career saves automatically every time you land (browser `localStorage`). Multiple pilots are supported from the title screen.

## How it's built

- **Bun** serves `index.html` with HTML imports and HMR (`server.ts`); no framework and no runtime dependencies.
- **Canvas 2D** for flight: procedurally lit vector ships, per-pixel rendered planets and stars, tiled parallax starfields and nebulae, additive particles.
- **DOM** for screens and dialogs (spaceport, outfitter, shipyard, missions, map, dossier).
- **Web Audio** for synthesized sound effects and a generative ambient score.

```
src/
  core/     math, color, keyboard input, audio engine
  data/     governments, commodities, outfits, ships (with art), galaxy, fleets, names
  game/     game loop + modes, world simulation, AI, entities, effects, economy,
            missions, story, escorts, guidance (objectives), player state, saves, rumors
  render/   renderer + HUD, ship art, planets/stations/stars, starfield, noise, sprites
  ui/       DOM helpers, title, spaceport, galaxy map, dialogs, handbook (native <dialog>)
```

For debugging, `window.game`, `window.PLANETS` and `window.SYSTEMS` are exposed in the browser console.

## Credits and attribution

Burn Vector exists because of **Escape Velocity**, the space trading and combat game created by Matt Burch and published by Ambrosia Software in 1996. Its open-ended mix of trading, missions, ship upgrades and hyperspace travel between charted star systems is the direct inspiration for this game, and many of its ideas (spaceport services, the galaxy map, disabling and boarding ships, legal standing with each government) are deliberate homages.

This is an independent, non-commercial fan tribute. It is not affiliated with, endorsed by or connected to Ambrosia Software or the creators of Escape Velocity, and it contains none of their code, art, sound, text or data. Escape Velocity is a trademark of its respective owners.
