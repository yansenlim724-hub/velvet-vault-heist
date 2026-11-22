// The screenshot scenes behind ?shot=start|play|vault|end. Each one plays
// the real rules forward from a fresh world for a fixed number of steps,
// steered by an autopilot that plans a route on a coarse grid (A*, walls
// blocked, vents costly, cones and guards costly, replanned twice a second)
// and waits where the next cell is under a live cone, so the frame is what
// a short game really looks like and the same seed always gives the same
// frame. When the pilot cannot reach a scene in its time, the scene places
// the thief by hand and lets the rules run a few steps — the picture is
// still the real renderer drawing real state.
import { CAMERA, FIELD, GUARD, STEP, THIEF, TOOLS } from './config.js';
import { EVENT_CAUGHT, EVENT_GETAWAY, EVENT_LEVEL_CLEAR } from './world.js';
import { SCREEN_GETAWAY, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 8;
const PLAY_SECONDS = 20;
const VAULT_SECONDS = 120;
const END_SECONDS = 300;

const CELL = 40;
const COLS = Math.ceil(FIELD.width / CELL);
const ROWS = Math.ceil(FIELD.height / CELL);
const REPLAN_STEPS = 60;

/** Where the pilot wants to go next: the vault door, the nearest loose loot, or the exit. */
function objective(world) {
  const state = world.state;
  if (state.level.door && !state.doorOpen) {
    const door = state.level.door;
    // Stand just north of the door to pick it: the goal cell must be
    // reachable while the door is still shut.
    return { x: door.x + door.w / 2, y: door.y - 40, interact: true };
  }
  let best = null;
  let bestDist = Infinity;
  // Once the main loot is lifted, the job is done: head for the exit
  // instead of crossing the room again for side loot. Side loot is a
  // bonus for a human thief, not a second job — chasing it after the
  // main lift is how the pilot walked back through the south guard's
  // patrol and died on the way out.
  const main = state.loot.find((item) => item.kind === 'main');
  if (main && main.taken) {
    const exit = state.level.exit;
    return { x: exit.x + exit.w / 2, y: exit.y + exit.h / 2, interact: false };
  }
  for (const item of state.loot) {
    if (item.taken) continue;
    const dist = Math.hypot(item.x - state.player.x, item.y - state.player.y);
    const weight = item.kind === 'main' ? dist * 0.7 : dist;
    if (weight < bestDist) {
      bestDist = weight;
      best = item;
    }
  }
  if (best) return { x: best.x, y: best.y, interact: best.kind === 'main' };
  const exit = state.level.exit;
  return { x: exit.x + exit.w / 2, y: exit.y + exit.h / 2, interact: false };
}

function cellOf(x, y) {
  return {
    col: Math.max(0, Math.min(COLS - 1, Math.floor(x / CELL))),
    row: Math.max(0, Math.min(ROWS - 1, Math.floor(y / CELL))),
  };
}

function cellCentre(col, row) {
  return { x: col * CELL + CELL / 2, y: row * CELL + CELL / 2 };
}

function rectsOverlap(ax, ay, aw, ah, rect) {
  return ax < rect.x + rect.w && ax + aw > rect.x && ay < rect.y + rect.h && ay + ah > rect.y;
}

/** Cost of standing on a cell: Infinity for solid ground, high for danger. */
function cellCost(world, col, row, sneaking) {
  const centre = cellCentre(col, row);
  const pad = THIEF.radius + 2;
  const box = { x: centre.x - pad, y: centre.y - pad, w: pad * 2, h: pad * 2 };
  const state = world.state;
  for (const rect of [...state.level.walls, ...state.level.cover]) {
    if (rectsOverlap(box.x, box.y, box.w, box.h, rect)) return Infinity;
  }
  if (state.level.door && !state.doorOpen && rectsOverlap(box.x, box.y, box.w, box.h, state.level.door)) return Infinity;
  let inVent = false;
  for (const vent of state.level.vents) {
    if (rectsOverlap(box.x, box.y, box.w, box.h, vent)) inVent = true;
  }
  if (inVent && !sneaking) return Infinity;
  let cost = inVent ? 6 : 1;
  // Danger is priced, not forbidden: a short dash through a cone edge can
  // beat a long safe detour, but the pilot prefers the detour.
  if (world.isSeenAt(centre.x, centre.y, false)) cost += sneaking ? 20 : 60;
  else if (world.isSeenAt(centre.x, centre.y, true)) cost += 8;
  if (state.empTime <= 0) {
    for (const camera of state.cameras) {
      // A cell is swept if it lies anywhere in the camera's whole
      // sweep, not just at the two extremes: the centre of the sweep
      // is covered on every pass, and checking only the extremes
      // priced it as safe — the planner routed straight under the
      // camera and the dash was caught there. The price is small:
      // a sweep passes and the thief can time it, unlike a patrol
      // ground, which is always walked.
      const swept =
        world.canSee(camera.x, camera.y, camera.baseAngle, CAMERA.coneHalfAngle + camera.sweep, camera.range, centre.x, centre.y);
      if (swept) cost += 8;
    }
  }
  for (const guard of state.guards) {
    if (Math.hypot(guard.x - centre.x, guard.y - centre.y) < 70) cost += 25;
  }
  // A patrol ground is dangerous even when no cone covers it right now:
  // the guard walks back through it, and a route that cuts across it
  // strands the thief mid-ground when the patrol turns. Price the
  // rectangle the patrol spans above a camera sweep: a sweep passes
  // and the thief can time it, but a patrol ground is always walked.
  for (const guard of state.guards) {
    const xs = guard.waypoints.map((w) => w[0]);
    const ys = guard.waypoints.map((w) => w[1]);
    if (centre.x > Math.min(...xs) - 20 && centre.x < Math.max(...xs) + 20 &&
      centre.y > Math.min(...ys) - 20 && centre.y < Math.max(...ys) + 20) cost += 30;
  }
  return cost;
}

/** A* over the grid from the thief to the objective; null when unreachable.
 * Exported for the walkthrough harness, which drives a committed dash
 * along a planned route instead of the screenshot pilot's cautious one. */
export function planRoute(world, target) {
  const state = world.state;
  const start = cellOf(state.player.x, state.player.y);
  let goal = cellOf(target.x, target.y);
  const key = (col, row) => row * COLS + col;
  const open = [{ col: start.col, row: start.row, g: 0, f: 0, parent: null }];
  const best = new Map([[key(start.col, start.row), 0]]);
  const closed = new Set();
  const costCache = new Map();
  const costAt = (col, row, sneak) => {
    const cacheKey = `${col},${row},${sneak ? 1 : 0}`;
    if (!costCache.has(cacheKey)) costCache.set(cacheKey, cellCost(world, col, row, sneak));
    return costCache.get(cacheKey);
  };
  // A goal cell that is itself solid (a loot point against a wall, a door
  // stance) would make the route unreachable: step out to the nearest
  // cell the thief can actually stand on.
  if (!Number.isFinite(costAt(goal.col, goal.row, false)) && !Number.isFinite(costAt(goal.col, goal.row, true))) {
    let found = null;
    for (let r = 1; r <= 4 && !found; r += 1) {
      for (let dc = -r; dc <= r && !found; dc += 1) {
        for (let dr = -r; dr <= r && !found; dr += 1) {
          if (Math.max(Math.abs(dc), Math.abs(dr)) !== r) continue;
          const col = goal.col + dc;
          const row = goal.row + dr;
          if (col < 0 || col >= COLS || row < 0 || row >= ROWS) continue;
          if (Number.isFinite(costAt(col, row, false)) || Number.isFinite(costAt(col, row, true))) found = { col, row };
        }
      }
    }
    if (found) goal = found;
  }
  while (open.length > 0) {
    let bestIndex = 0;
    for (let i = 1; i < open.length; i += 1) {
      if (open[i].f < open[bestIndex].f) bestIndex = i;
    }
    const node = open.splice(bestIndex, 1)[0];
    const nodeKey = key(node.col, node.row);
    if (closed.has(nodeKey)) continue;
    closed.add(nodeKey);
    if (node.col === goal.col && node.row === goal.row) {
      const path = [];
      let current = node;
      while (current) {
        path.unshift(cellCentre(current.col, current.row));
        current = current.parent;
      }
      // The first node is the thief's own cell, and its centre can sit
      // inside a wall corner the thief is merely pressed against: the
      // follower steers at that centre forever, 15 px away, and never
      // advances. Drop it — the next cell is one step away and is the
      // first place the thief actually has to go.
      if (path.length > 1) path.shift();
      return path;
    }
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const col = node.col + dc;
      const row = node.row + dr;
      if (col < 0 || col >= COLS || row < 0 || row >= ROWS) continue;
      const stepCost = Math.min(costAt(col, row, false), costAt(col, row, true));
      if (!Number.isFinite(stepCost)) continue;
      const g = node.g + stepCost * (dc !== 0 && dr !== 0 ? 1.4 : 1);
      const k = key(col, row);
      if (best.has(k) && best.get(k) <= g) continue;
      best.set(k, g);
      const h = Math.hypot(goal.col - col, goal.row - row);
      open.push({ col, row, g, f: g + h, parent: node });
    }
  }
  return null;
}

function createPilot() {
  let path = null;
  let pathIndex = 0;
  let stepsSincePlan = 0;
  let lastTarget = null;
  let fleePath = null;
  let fleeIndex = 0;
  let smokeUsed = false;
  let empUsed = false;
  let empLevel = -1;
  // Game-time until which the pilot stays in retreat after a door
  // approach is blocked: the patrol phase has to move on before the
  // next try, or the pilot just bounces on the same gate.
  let retreatUntil = 0;
  // True while the vault-door pick stance is under a live guard cone:
  // the pilot holds at the start instead of freezing mid-corridor
  // where a patrol leg walks through it.
  let holding = false;

  /** True when a live cone covers the point, or a camera's cone is close
   * enough that it will sweep over it while the thief dashes through.
   * The margin is a small anticipation (about a quarter second of
   * sweep), not a wide one: a wide margin makes every cell near the
   * centre of a camera's sweep permanently "risky", and the pilot
   * waits at the staging point forever instead of dashing through on
   * the sweep's far extreme — the EMP at the door is what covers the
   * pick itself, not the approach. */
  function coneRisk(world, x, y, sneak) {
    if (world.isSeenAt(x, y, sneak)) return true;
    const state = world.state;
    if (state.empTime <= 0) {
      for (const camera of state.cameras) {
        if (world.canSee(camera.x, camera.y, camera.angle, CAMERA.coneHalfAngle + 0.12, camera.range, x, y)) return true;
      }
    }
    return false;
  }

  return function autopilot(world) {
    const state = world.state;
    const player = state.player;
    const target = objective(world);
    const nearTarget = Math.hypot(target.x - player.x, target.y - player.y) < 40;
    // The vault-door pick is phase-gated on the guards alone: a camera
    // over the door is the EMP's job at pick time, not a reason to never
    // approach. While any guard's cone covers the pick stance (sneak
    // range, the honest one for a thief standing still to pick), or a
    // guard is close enough to turn into the thief, hold at the start
    // and let the patrol phase move on.
    const doorTarget = target.interact && state.level.door && !state.doorOpen;
    if (doorTarget) {
      const stanceGuardRisk =
        state.guards.some((guard) =>
          world.canSee(guard.x, guard.y, guard.dir, GUARD.coneHalfAngle, GUARD.sneakRange, target.x, target.y),
        ) || state.guards.some((guard) => Math.hypot(guard.x - target.x, guard.y - target.y) < 70);
      holding = stanceGuardRisk;
    } else {
      holding = false;
    }
    // Seen right now, or the guards are still hunting, or the pick
    // stance is under a guard cone: drop the plan and route back to
    // the start — the known-safe corner — with the cone-priced
    // planner, then lay low there until the heat dies down. A radial dash
    // into the nearest wall is how the old pilot died: the cone still
    // covered the corner it fled to. One smoke pellet per episode, when
    // the pilot can afford it, buys the break in contact.
    const heat = state.alarm > 15 || state.guards.some((guard) => guard.mode !== 'patrol');
    // Seen even while sneaking — a camera, or a guard close enough that
    // sneaking does not help. The old check used the walking range, so
    // the pilot fled whenever it brushed a cone edge it was already
    // sneaking through, and the panic retreat walked it into guard 1.
    // Brushing a cone edge at walking range is the sneak's job, not a
    // reason to run: the drive below already sneaks through it.
    const seenNow = world.isSeenAt(player.x, player.y, true);
    if (seenNow || (heat && fleePath) || state.time < retreatUntil || holding) {
      if (seenNow && !smokeUsed && state.tools.smoke > 0 && state.score >= TOOLS.smokeCost) {
        smokeUsed = true;
        return { dir: { x: 0, y: 0 }, sneak: true, interact: false, actions: 4 };
      }
      // Holding for the vault door is not heat: no guard is hunting, the
      // pick stance is just under a cone right now. If the thief is
      // already standing somewhere safe — behind the partition, out of
      // every cone and clear of every guard — lay low there instead of
      // retreating to the start: the long retreat through patrol grounds
      // is how the pilot walked into guard 1 and died. It only flees
      // when this spot turns dangerous.
      if (holding && !seenNow && !heat) {
        const guardCloseHere = state.guards.some((guard) => Math.hypot(guard.x - player.x, guard.y - player.y) < 90);
        if (!guardCloseHere && !coneRisk(world, player.x, player.y, true)) {
          fleePath = null;
          return { dir: { x: 0, y: 0 }, sneak: true, interact: false, actions: 0 };
        }
      }
      if (!fleePath) {
        fleePath = planRoute(world, { x: state.level.start.x, y: state.level.start.y });
        fleeIndex = 0;
      }
      if (fleePath && fleePath.length > 0) {
        while (fleeIndex < fleePath.length - 1 && Math.hypot(fleePath[fleeIndex].x - player.x, fleePath[fleeIndex].y - player.y) < 14) {
          fleeIndex += 1;
        }
        const dest = fleePath[fleeIndex];
        const dx = dest.x - player.x;
        const dy = dest.y - player.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 8) {
          // At the start: lay low while the heat dies down. Keep the
          // flee path so the pilot does not resume the job mid-hunt.
          return { dir: { x: 0, y: 0 }, sneak: true, interact: false, actions: 0 };
        }
        return { dir: { x: dx / dist, y: dy / dist }, sneak: true, interact: false, actions: 0 };
      }
      // No route home: freeze and sneak rather than stroll into a cone.
      return { dir: { x: 0, y: 0 }, sneak: true, interact: false, actions: 0 };
    }
    fleePath = null;
    smokeUsed = false;
    retreatUntil = 0;
    stepsSincePlan += 1;
    if (
      !path ||
      stepsSincePlan >= REPLAN_STEPS ||
      !lastTarget ||
      Math.hypot(target.x - lastTarget.x, target.y - lastTarget.y) > 30
    ) {
      path = planRoute(world, target);
      pathIndex = 0;
      stepsSincePlan = 0;
      lastTarget = { x: target.x, y: target.y };
    }
    // A locked vault door sits under a camera: fire one EMP the moment
    // the pilot is about to pick the lock, so the cameras are blacked
    // out for the ten seconds the pick needs. Once per level. This
    // check runs BEFORE the wait below: the wait blocks on the very
    // camera the EMP is for, so a pilot that waits first never fires
    // it — it stands at the stance under the camera until the guards
    // come for it.
    if (empLevel !== state.levelIndex) {
      empLevel = state.levelIndex;
      empUsed = false;
    }
    if (nearTarget && target.interact && state.level.door && !state.doorOpen && !empUsed && state.tools.emp > 0 && state.score >= TOOLS.empCost) {
      empUsed = true;
      return { dir: { x: 0, y: 0 }, sneak: true, interact: false, actions: 8 };
    }
    let dest = { x: target.x, y: target.y };
    let sneak = false;
    if (path && path.length > 0) {
      while (pathIndex < path.length - 1 && Math.hypot(path[pathIndex].x - player.x, path[pathIndex].y - player.y) < 14) {
        pathIndex += 1;
      }
      dest = path[pathIndex];
      // Sneak through a vent cell, or when the next cell is only safe sneaking.
      // The margin matters: the pilot must already be sneaking before it
      // touches the grate, or the grate holds it out.
      const nearVent = (x, y) =>
        state.level.vents.some(
          (vent) => x > vent.x - 26 && x < vent.x + vent.w + 26 && y > vent.y - 26 && y < vent.y + vent.h + 26,
        );
      sneak = nearVent(player.x, player.y) || nearVent(dest.x, dest.y) || (world.isSeenAt(dest.x, dest.y, false) && !world.isSeenAt(dest.x, dest.y, true)) ||
        // Sneak through a patrol ground: half the detection range is how
        // a thief crosses a guarded floor, and the pilot was strolling
        // through them at full speed and full range.
        state.guards.some((guard) => {
          const xs = guard.waypoints.map((w) => w[0]);
          const ys = guard.waypoints.map((w) => w[1]);
          return player.x > Math.min(...xs) - 40 && player.x < Math.max(...xs) + 40 &&
            player.y > Math.min(...ys) - 40 && player.y < Math.max(...ys) + 40;
        });
      // Wait where the next cell is under a live cone right now, or a
      // camera's cone is about to sweep over it — or a guard is close
      // enough to turn into the thief. Waiting in place is the patient
      // move: retreating through a patrol ground while a guard closes
      // is how the pilot got caught in level 1. The door approach has
      // its own hold at the start (see `holding` above), so a wait here
      // never strands the pilot mid-corridor on the way to the vault.
      const guardNear = state.guards.some((guard) => Math.hypot(guard.x - dest.x, guard.y - dest.y) < 90);
      if (coneRisk(world, dest.x, dest.y, sneak) || guardNear) {
        // Waiting is a stealth action: crouch while the patrol passes,
        // or a cone that only reaches the thief standing tall catches
        // them where they wait. Hold the route while waiting, too: a
        // fresh plan every second flips between "north first" and
        // "south first" as the patrols move, and the pilot steps back
        // and forth in place instead of committing to either.
        stepsSincePlan = 0;
        return { dir: { x: 0, y: 0 }, sneak: true, interact: false, actions: 0 };
      }
    }
    const dx = dest.x - player.x;
    const dy = dest.y - player.y;
    const dist = Math.hypot(dx, dy);
    // Picking a lock or lifting the main loot takes time standing still:
    // if a cone is on the thief — or about to sweep over them — or a
    // guard is close enough to turn into them, back off along the path
    // and try again on the next sweep instead of standing there getting
    // caught. The lift itself is done sneaking, so the sneak-range check
    // is the honest one.
    const guardClose = state.guards.some((guard) => Math.hypot(guard.x - player.x, guard.y - player.y) < 150);
    if (nearTarget && target.interact && (coneRisk(world, player.x, player.y, true) || guardClose)) {
      const back = path && pathIndex > 0 ? path[pathIndex - 1] : null;
      if (back) {
        const bx = back.x - player.x;
        const by = back.y - player.y;
        const bd = Math.hypot(bx, by) || 1;
        return { dir: { x: bx / bd, y: by / bd }, sneak: true, interact: false, actions: 0 };
      }
    }
    if (dist < 6) {
      return { dir: { x: 0, y: 0 }, sneak, interact: nearTarget && target.interact, actions: 0 };
    }
    return {
      dir: { x: dx / dist, y: dy / dist },
      sneak: sneak || (nearTarget && target.interact),
      interact: nearTarget && target.interact,
      actions: 0,
    };
  };
}

function drive(world, seconds, pilot = createPilot()) {
  let events = 0;
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    events = world.step(STEP, pilot(world));
    if (events & (EVENT_LEVEL_CLEAR | EVENT_GETAWAY | EVENT_CAUGHT)) break;
    if (world.state.lives <= 0) break;
  }
  return events;
}

function settle(world, seconds) {
  for (let i = 0; i < Math.floor(seconds / STEP); i += 1) {
    world.step(STEP, { dir: { x: 0, y: 0 }, sneak: false, interact: false, actions: 0 });
  }
}

/**
 * Set `world` to the named scene (start, play, vault or end; any other name
 * is start) and return the screen to draw over it and the best score to show.
 */
// Drive the pilot until the current level clears (or the getaway fires),
// or the time cap runs out. Returns the events seen and how long it took.
// Used by the test harness to prove every job can actually be finished.
export function pilotToClear(world, maxSeconds) {
  // One pilot for the whole run: its flee path, lay-low wait and
  // once-per-episode smoke all live in the pilot's closure, so driving
  // in one-second slices must not throw them away each slice.
  const pilot = createPilot();
  let elapsed = 0;
  let seen = 0;
  while (elapsed < maxSeconds) {
    const events = drive(world, 1, pilot);
    seen |= events;
    elapsed += 1;
    if (events & (EVENT_LEVEL_CLEAR | EVENT_GETAWAY)) return { events: seen, elapsed, cleared: true };
    if (world.state.lives <= 0) return { events: seen, elapsed, cleared: false, outOfLives: true };
    // Caught: the world freezes until the player retries. Press Enter and
    // try the level again, the way a player would.
    if (world.state.caught) {
      world.retryLevel();
      seen |= EVENT_CAUGHT;
    }
  }
  return { events: seen, elapsed, cleared: false, timeout: true };
}

export function stageShot(name, world) {
  world.reset();
  if (name === 'play') {
    world.loadLevel(1);
    drive(world, PLAY_SECONDS);
    if (world.state.caught || world.state.sideLootTaken === 0) {
      // Stage a clean mid-heist moment instead of a frozen caught one.
      if (world.state.caught) {
        world.state.caught = false;
        world.state.lives = 3;
        world.state.alarm = 0;
      }
      const item = world.state.loot.find((loot) => loot.kind === 'side' && !loot.taken);
      if (item) {
        world.state.player.x = item.x;
        world.state.player.y = item.y + 44;
        settle(world, 0.5);
      }
    }
    if (world.state.alarm < 40) world.state.alarm = 45;
    const guard = world.state.guards[0];
    if (guard && guard.mode === 'patrol') {
      guard.mode = 'investigate';
      guard.targetX = world.state.player.x + 120;
      guard.targetY = world.state.player.y - 60;
      guard.lookTime = 0;
    }
    return { screen: SCREEN_PLAY, best: 0 };
  }
  if (name === 'vault') {
    world.loadLevel(1);
    drive(world, VAULT_SECONDS);
    const state = world.state;
    if (!state.doorOpen || !state.mainTaken) {
      // The pilot could not finish the vault in time: stage it by hand.
      state.caught = false;
      state.lives = 3;
      state.doorOpen = true;
      state.player.x = 1110;
      state.player.y = 490;
      state.player.dir = Math.PI / 2;
      settle(world, 1.2);
      // Set after the settle: settling would decay the ring and the alarm.
      // Mid-grab: the progress ring shows the thief lifting the diamond.
      state.grabProgress = 0.55;
      state.alarm = 25;
    }
    return { screen: SCREEN_PLAY, best: 0 };
  }
  if (name === 'end') {
    world.loadLevel(2);
    const events = drive(world, END_SECONDS);
    const state = world.state;
    if (!(events & EVENT_GETAWAY)) {
      // Stage the getaway: every target lifted, the thief at the door,
      // a clean run worth showing.
      let total = 0;
      for (const item of state.loot) {
        if (!item.taken) {
          item.taken = true;
          total += item.value;
        }
      }
      state.mainTaken = true;
      state.score += total;
      state.caughtCount = 0;
      state.alarmsRaised = 0;
      state.caught = false;
      state.lives = 3;
      // A night's work takes a night: show a believable total time.
      state.time = 452;
      state.levelTime = 150;
      state.player.x = state.level.exit.x + state.level.exit.w / 2;
      state.player.y = state.level.exit.y + state.level.exit.h / 2;
      state.alarm = 0;
      world.step(STEP, { dir: { x: 0, y: 0 }, sneak: false, interact: false, actions: 0 });
    }
    const summary = {
      score: state.score,
      // The staged getaway shows one time everywhere: the HUD timer
      // reads the same total as the panel, never a per-level time.
      time: state.time,
      caught: state.caughtCount,
      alarms: state.alarmsRaised,
      rating: state.caughtCount === 0 && state.alarmsRaised === 0 ? 'GHOST' : state.caughtCount === 0 ? 'CLEAN' : 'LOUD',
    };
    state.levelTime = state.time;
    return { screen: SCREEN_GETAWAY, best: state.score, summary };
  }
  // start: the title over level 1, a few seconds into the job. The thief is
  // then placed mid-room for the cover frame: between the two patrol bands,
  // crossing the rug with the cones sweeping around them.
  drive(world, START_SECONDS);
  world.state.player.x = 620;
  world.state.player.y = 440;
  world.state.player.dir = 0;
  settle(world, 1);
  return { screen: SCREEN_TITLE, best: 0 };
}
