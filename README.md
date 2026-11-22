# Velvet Vault

[![make.fun · best-heist-game-20261122-0559](https://make.fun/badge/best-heist-game-20261122-0559.svg)](https://make.fun/bounty/best-heist-game-20261122-0559?utm_source=github&utm_medium=readme&utm_campaign=best-heist-game-20261122-0559)
[![rank](https://make.fun/badge/best-heist-game-20261122-0559/yansenlim724-hub/velvet-vault-heist/rank.svg)](https://make.fun/bounty/best-heist-game-20261122-0559/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-heist-game-20261122-0559)
[![reward](https://make.fun/badge/best-heist-game-20261122-0559/yansenlim724-hub/velvet-vault-heist/reward.svg)](https://make.fun/bounty/best-heist-game-20261122-0559?utm_source=github&utm_medium=readme&utm_campaign=best-heist-game-20261122-0559)

A midnight heist in three jobs. You are the thief: slip past patrolling guards and sweeping cameras, lift the main target, grab what else you can carry, and reach the green exit before the alarm fills. Three rooms — the Gallery, the Bank, and the Penthouse — each with its own patrols, cameras, and three ways through: the guarded hall, the camera-watched corridor, or the vents, if you sneak.

## How it plays

- **WASD / arrows** — move. **Shift** — sneak (slower, harder to spot, and the only way through vents).
- **E (hold)** — lift the main loot, or pick the vault door in the Bank.
- **1** — smoke pellet, $150 of your loot: a cloud no one can see through for 6 seconds. **2** — EMP, $100: kills every camera for 10 seconds. Both are limited per job, and both cost real loot, so spend them like it.
- **P / Esc** — pause. **Enter / Space** — confirm.
- Guards patrol waypoints and pause to look around. Their vision cones are raycast — walls and tall cover really block sight, so read the cone before you move. Get seen and the alarm climbs; break sight and it falls. Past halfway, guards come looking for you. At full, you are caught: lose a life, retry the job.
- Cameras sweep back and forth. Their cones are orange; guards' are red. Gold glows are loot; green is the exit, which only opens once the main target is lifted.
- Three lives per night. Finish the Penthouse for the getaway screen, your rating (Ghost, Clean, Loud, Messy), and your best score.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in a desktop browser. No build step, no network: the game is plain static files under `game/`, all art drawn on canvas and all sound synthesized in the browser.

Screenshots live in `screenshots/` (the first is the cover). `?shot=start|play|vault|end` stages a deterministic scene for screenshots.

---
