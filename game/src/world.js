// The game's rules and state, with no drawing and no browser in it: the
// thief, the guards and their patrols, the cameras, the alarm, the loot, the
// tools and the win/lose conditions. step() advances one fixed step and
// returns what happened as bit flags, so the caller can react without the
// world knowing about screens or sound. Nothing here allocates after
// createWorld returns, and nothing reads Math.random: the world is fully
// deterministic for a given seed.
import { ALARM, CAMERA, FIELD, GUARD, LIVES, STEP, THIEF, TOOLS } from './config.js';
import { LEVELS } from './levels.js';

export const EVENT_LOOT = 1;
export const EVENT_MAIN = 2;
export const EVENT_CAUGHT = 4;
export const EVENT_LEVEL_CLEAR = 8;
export const EVENT_GETAWAY = 16;
export const EVENT_OVER = 32;
export const EVENT_UNLOCK = 64;
export const EVENT_TOOL = 128;
export const EVENT_SPOTTED = 256;

function clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** True when the two segments cross (or touch). */
function segmentsCross(ax, ay, bx, by, cx, cy, dx, dy) {
  const d1 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
  const d2 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
  const d3 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const d4 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  return false;
}

function pointInRect(x, y, rect) {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

/** True when the segment crosses the rectangle (edges or interior). */
function segmentHitsRect(x1, y1, x2, y2, rect) {
  if (pointInRect(x1, y1, rect) || pointInRect(x2, y2, rect)) return true;
  const { x, y, w, h } = rect;
  return (
    segmentsCross(x1, y1, x2, y2, x, y, x + w, y) ||
    segmentsCross(x1, y1, x2, y2, x + w, y, x + w, y + h) ||
    segmentsCross(x1, y1, x2, y2, x + w, y + h, x, y + h) ||
    segmentsCross(x1, y1, x2, y2, x, y + h, x, y)
  );
}

/** Shortest distance from a point to a segment. */
function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / len2;
  t = clamp(t, 0, 1);
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

export function createWorld() {
  const state = {
    levelIndex: 0,
    level: LEVELS[0],
    player: { x: 0, y: 0, dir: -Math.PI / 2, sneaking: false },
    guards: [],
    cameras: [],
    loot: [],
    alarm: 0,
    score: 0,
    lives: LIVES,
    time: 0,
    levelTime: 0,
    tools: { smoke: TOOLS.smokeCount, emp: TOOLS.empCount },
    smokeClouds: [],
    empTime: 0,
    doorOpen: false,
    grabProgress: 0,
    pickProgress: 0,
    lastSeen: { x: 0, y: 0 },
    caughtCount: 0,
    alarmsRaised: 0,
    sideLootTaken: 0,
    sideLootTotal: 0,
    mainTaken: false,
    caught: false,
    scoreAtLevelStart: 0,
    toolsAtLevelStart: { smoke: TOOLS.smokeCount, emp: TOOLS.empCount },
    spotted: false,
  };

  function solidRects() {
    const rects = [...state.level.walls, ...state.level.cover];
    if (state.level.door && !state.doorOpen) rects.push(state.level.door);
    return rects;
  }

  /** Push a circle out of every solid rectangle it overlaps. */
  function resolveCircle(body, rects) {
    for (const rect of rects) {
      const nearestX = clamp(body.x, rect.x, rect.x + rect.w);
      const nearestY = clamp(body.y, rect.y, rect.y + rect.h);
      const dx = body.x - nearestX;
      const dy = body.y - nearestY;
      const dist2 = dx * dx + dy * dy;
      if (dist2 >= body.radius * body.radius) continue;
      if (dist2 === 0) {
        // Centre inside the rectangle: push out along the shallowest side.
        const left = body.x - rect.x;
        const right = rect.x + rect.w - body.x;
        const top = body.y - rect.y;
        const bottom = rect.y + rect.h - body.y;
        const min = Math.min(left, right, top, bottom);
        if (min === left) body.x = rect.x - body.radius;
        else if (min === right) body.x = rect.x + rect.w + body.radius;
        else if (min === top) body.y = rect.y - body.radius;
        else body.y = rect.y + rect.h + body.radius;
        continue;
      }
      const dist = Math.sqrt(dist2);
      body.x = nearestX + (dx / dist) * body.radius;
      body.y = nearestY + (dy / dist) * body.radius;
    }
  }

  function segmentBlocked(x1, y1, x2, y2) {
    const blockers = [...state.level.walls, ...state.level.cover];
    if (state.level.door && !state.doorOpen) blockers.push(state.level.door);
    for (const rect of blockers) {
      if (segmentHitsRect(x1, y1, x2, y2, rect)) return true;
    }
    return false;
  }

  function segmentInSmoke(x1, y1, x2, y2) {
    for (const cloud of state.smokeClouds) {
      if (cloud.t <= 0) continue;
      if (distToSegment(cloud.x, cloud.y, x1, y1, x2, y2) < cloud.radius) return true;
    }
    return false;
  }

  /** Would a watcher at (x, y) facing `facing` see point (tx, ty)? */
  function canSee(x, y, facing, halfAngle, range, tx, ty) {
    const dx = tx - x;
    const dy = ty - y;
    const dist = Math.hypot(dx, dy);
    if (dist > range) return false;
    if (dist > 1 && Math.abs(angleDiff(Math.atan2(dy, dx), facing)) > halfAngle) return false;
    if (segmentBlocked(x, y, tx, ty)) return false;
    if (segmentInSmoke(x, y, tx, ty)) return false;
    return true;
  }

  /** Is the point visible to any guard or live camera right now? */
  function isSeenAt(x, y, sneaking) {
    const range = sneaking ? GUARD.sneakRange : GUARD.coneRange;
    for (const guard of state.guards) {
      if (canSee(guard.x, guard.y, guard.dir, GUARD.coneHalfAngle, range, x, y)) return true;
    }
    if (state.empTime <= 0) {
      for (const camera of state.cameras) {
        if (canSee(camera.x, camera.y, camera.angle, CAMERA.coneHalfAngle, camera.range, x, y)) return true;
      }
    }
    return false;
  }

  function loadLevel(index) {
    const level = LEVELS[index];
    state.levelIndex = index;
    state.level = level;
    state.player.x = level.start.x;
    state.player.y = level.start.y;
    state.player.dir = -Math.PI / 2;
    state.guards = level.guards.map((def) => ({
      waypoints: def.waypoints,
      pause: def.pause,
      x: def.waypoints[0][0],
      y: def.waypoints[0][1],
      dir: 0,
      wpIndex: 1,
      pauseTime: 0,
      lookTime: 0,
      mode: 'patrol',
      targetX: 0,
      targetY: 0,
      lostTime: 0,
    }));
    for (const guard of state.guards) {
      const next = guard.waypoints[guard.wpIndex];
      guard.dir = Math.atan2(next[1] - guard.y, next[0] - guard.x);
    }
    state.cameras = level.cameras.map((def) => ({ ...def, baseAngle: def.angle, sweepDir: 1 }));
    state.loot = level.loot.map((item) => ({ ...item, taken: false }));
    state.sideLootTotal = level.loot.filter((item) => item.kind === 'side').length;
    state.sideLootTaken = 0;
    state.mainTaken = false;
    state.alarm = 0;
    state.smokeClouds = [];
    state.empTime = 0;
    state.doorOpen = false;
    state.grabProgress = 0;
    state.pickProgress = 0;
    state.levelTime = 0;
    state.spotted = false;
    state.caught = false;
    state.scoreAtLevelStart = state.score;
    state.toolsAtLevelStart = { ...state.tools };
  }

  function reset() {
    state.score = 0;
    state.lives = LIVES;
    state.time = 0;
    state.caughtCount = 0;
    state.alarmsRaised = 0;
    state.tools = { smoke: TOOLS.smokeCount, emp: TOOLS.empCount };
    loadLevel(0);
  }

  function retryLevel() {
    state.score = state.scoreAtLevelStart;
    state.tools = { ...state.toolsAtLevelStart };
    loadLevel(state.levelIndex);
  }

  function moveGuard(guard, dt, speed) {
    const dx = guard.targetX - guard.x;
    const dy = guard.targetY - guard.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 2) return true;
    const stepLen = Math.min(dist, speed * dt);
    guard.x += (dx / dist) * stepLen;
    guard.y += (dy / dist) * stepLen;
    guard.dir = Math.atan2(dy, dx);
    return dist - stepLen < 2;
  }

  function stepGuards(dt) {
    for (const guard of state.guards) {
      if (guard.mode === 'patrol') {
        if (guard.pauseTime > 0) {
          guard.pauseTime -= dt;
          continue;
        }
        const wp = guard.waypoints[guard.wpIndex];
        guard.targetX = wp[0];
        guard.targetY = wp[1];
        if (moveGuard(guard, dt, GUARD.patrolSpeed)) {
          guard.wpIndex = (guard.wpIndex + 1) % guard.waypoints.length;
          guard.pauseTime = guard.pause;
        }
      } else if (guard.mode === 'investigate') {
        if (guard.lookTime > 0) {
          guard.lookTime -= dt;
          guard.dir += dt * 1.4;
          continue;
        }
        if (moveGuard(guard, dt, GUARD.investigateSpeed)) {
          guard.lookTime = GUARD.lookAroundTime;
        }
      } else if (guard.mode === 'chase') {
        guard.targetX = state.lastSeen.x;
        guard.targetY = state.lastSeen.y;
        moveGuard(guard, dt, GUARD.chaseSpeed);
      }
    }
  }

  function stepCameras(dt) {
    for (const camera of state.cameras) {
      if (state.empTime > 0) continue;
      camera.angle += camera.speed * dt * camera.sweepDir;
      const offset = angleDiff(camera.angle, camera.baseAngle);
      if (offset > camera.sweep) {
        camera.angle = camera.baseAngle + camera.sweep;
        camera.sweepDir = -1;
      } else if (offset < -camera.sweep) {
        camera.angle = camera.baseAngle - camera.sweep;
        camera.sweepDir = 1;
      }
    }
  }

  /**
   * One fixed step. `input` is { dir: {x, y}, sneak, interact, actions }.
   * Returns event bit flags.
   */
  function step(dt, input) {
    // Frozen after a catch until the level is retried: without this, the
    // alarm (still full) would catch the thief again on the very next step
    // and drain every life at once.
    if (state.caught) return 0;
    let events = 0;
    state.time += dt;
    state.levelTime += dt;
    if (state.empTime > 0) state.empTime = Math.max(0, state.empTime - dt);
    for (const cloud of state.smokeClouds) cloud.t -= dt;
    state.smokeClouds = state.smokeClouds.filter((cloud) => cloud.t > 0);

    // Tools.
    if (input.actions & 4) {
      if (state.tools.smoke > 0 && state.score >= TOOLS.smokeCost) {
        state.tools.smoke -= 1;
        state.score -= TOOLS.smokeCost;
        state.smokeClouds.push({ x: state.player.x, y: state.player.y, radius: TOOLS.smokeRadius, t: TOOLS.smokeSeconds });
        events |= EVENT_TOOL;
      }
    }
    if (input.actions & 8) {
      if (state.tools.emp > 0 && state.score >= TOOLS.empCost) {
        state.tools.emp -= 1;
        state.score -= TOOLS.empCost;
        state.empTime = TOOLS.empSeconds;
        events |= EVENT_TOOL;
      }
    }

    // Thief movement, axis separated so walls slide instead of sticking.
    const player = state.player;
    player.sneaking = input.sneak;
    const speed = input.sneak ? THIEF.sneakSpeed : THIEF.walkSpeed;
    const rects = solidRects();
    const body = { x: player.x, y: player.y, radius: THIEF.radius };
    body.x += input.dir.x * speed * dt;
    body.x = clamp(body.x, THIEF.radius, FIELD.width - THIEF.radius);
    if (!input.sneak) {
      for (const vent of state.level.vents) {
        if (body.x + THIEF.radius > vent.x && body.x - THIEF.radius < vent.x + vent.w && body.y + THIEF.radius > vent.y && body.y - THIEF.radius < vent.y + vent.h) {
          // Walking into a vent without sneaking: the grate holds.
          resolveCircle(body, [vent]);
        }
      }
    }
    resolveCircle(body, rects);
    body.y += input.dir.y * speed * dt;
    body.y = clamp(body.y, THIEF.radius, FIELD.height - THIEF.radius);
    if (!input.sneak) {
      for (const vent of state.level.vents) {
        if (body.x + THIEF.radius > vent.x && body.x - THIEF.radius < vent.x + vent.w && body.y + THIEF.radius > vent.y && body.y - THIEF.radius < vent.y + vent.h) {
          resolveCircle(body, [vent]);
        }
      }
    }
    resolveCircle(body, rects);
    player.x = body.x;
    player.y = body.y;
    if (input.dir.x !== 0 || input.dir.y !== 0) {
      player.dir = Math.atan2(input.dir.y, input.dir.x);
    }

    // Side loot: taken on touch.
    for (const item of state.loot) {
      if (item.taken || item.kind !== 'side') continue;
      if (Math.hypot(item.x - player.x, item.y - player.y) < 32) {
        item.taken = true;
        state.score += item.value;
        state.sideLootTaken += 1;
        events |= EVENT_LOOT;
      }
    }

    // Main loot: hold E beside it to lift it.
    const main = state.loot.find((item) => item.kind === 'main');
    let nearMain = false;
    if (main && !main.taken) {
      nearMain = Math.hypot(main.x - player.x, main.y - player.y) < 46;
      if (nearMain && input.interact) {
        state.grabProgress += dt / THIEF.grabTime;
        if (state.grabProgress >= 1) {
          main.taken = true;
          state.mainTaken = true;
          state.score += main.value;
          state.grabProgress = 0;
          events |= EVENT_MAIN;
        }
      } else {
        state.grabProgress = Math.max(0, state.grabProgress - dt * 2);
      }
    }

    // Vault door: hold E beside it to pick the lock.
    let nearDoor = false;
    const door = state.level.door;
    if (door && !state.doorOpen) {
      const cx = door.x + door.w / 2;
      const cy = door.y + door.h / 2;
      // Reach of the lockpick from the door's centre: wide enough that a
      // thief standing at the pick stance — or a few pixels short of it,
      // where the route planner stops — can actually work the lock. A
      // stance a hair outside the reach leaves the thief holding E
      // forever with no progress.
      nearDoor = Math.hypot(cx - player.x, cy - player.y) < 80;
      if (nearDoor && input.interact) {
        state.pickProgress += dt / THIEF.pickTime;
        if (state.pickProgress >= 1) {
          state.doorOpen = true;
          state.pickProgress = 0;
          events |= EVENT_UNLOCK;
        }
      } else {
        state.pickProgress = Math.max(0, state.pickProgress - dt * 2);
      }
    }

    state.nearMain = nearMain;
    state.nearDoor = nearDoor;

    // Detection: guards and cameras.
    const seenByGuard = state.guards.some((guard) =>
      canSee(guard.x, guard.y, guard.dir, GUARD.coneHalfAngle, player.sneaking ? GUARD.sneakRange : GUARD.coneRange, player.x, player.y),
    );
    const seenByCamera = state.empTime <= 0 && state.cameras.some((camera) =>
      canSee(camera.x, camera.y, camera.angle, CAMERA.coneHalfAngle, camera.range, player.x, player.y),
    );
    const seen = seenByGuard || seenByCamera;
    const wasSpotted = state.spotted;
    if (seen) {
      state.lastSeen.x = player.x;
      state.lastSeen.y = player.y;
      const rate = seenByGuard ? ALARM.guardRate : ALARM.cameraRate;
      const before = state.alarm;
      state.alarm = Math.min(ALARM.max, state.alarm + rate * dt);
      if (before < ALARM.investigateAt && state.alarm >= ALARM.investigateAt) {
        state.alarmsRaised += 1;
        for (const guard of state.guards) {
          if (guard.mode === 'patrol') {
            guard.mode = 'investigate';
            guard.targetX = state.lastSeen.x;
            guard.targetY = state.lastSeen.y;
            guard.lookTime = 0;
          }
        }
      }
      state.spotted = true;
      if (!wasSpotted) events |= EVENT_SPOTTED;
    } else {
      state.alarm = Math.max(0, state.alarm - ALARM.decayRate * dt);
      state.spotted = false;
    }

    // Guard behaviour follows what they see.
    for (const guard of state.guards) {
      const sees = canSee(guard.x, guard.y, guard.dir, GUARD.coneHalfAngle, player.sneaking ? GUARD.sneakRange : GUARD.coneRange, player.x, player.y);
      if (sees) {
        guard.mode = 'chase';
        guard.lostTime = 0;
      } else if (guard.mode === 'chase') {
        guard.lostTime += dt;
        if (guard.lostTime > 1.5) {
          guard.mode = 'investigate';
          guard.targetX = state.lastSeen.x;
          guard.targetY = state.lastSeen.y;
          guard.lookTime = 0;
        }
      } else if (guard.mode === 'investigate' && guard.lookTime > 0 && state.alarm < ALARM.investigateAt) {
        guard.mode = 'patrol';
        guard.lookTime = 0;
      }
    }
    stepGuards(dt);
    stepCameras(dt);

    // Caught: the alarm filled, or a guard laid hands on the thief.
    let caught = state.alarm >= ALARM.max;
    if (!caught) {
      for (const guard of state.guards) {
        if (Math.hypot(guard.x - player.x, guard.y - player.y) < GUARD.catchRadius) {
          caught = true;
          break;
        }
      }
    }
    if (caught) {
      state.caught = true;
      state.lives -= 1;
      state.caughtCount += 1;
      events |= EVENT_CAUGHT;
      if (state.lives <= 0) events |= EVENT_OVER;
      return events;
    }

    // Exit: open only once the main target is lifted.
    const exit = state.level.exit;
    if (state.mainTaken && player.x > exit.x && player.x < exit.x + exit.w && player.y > exit.y && player.y < exit.y + exit.h) {
      if (state.levelIndex >= LEVELS.length - 1) {
        events |= EVENT_GETAWAY;
      } else {
        events |= EVENT_LEVEL_CLEAR;
      }
      return events;
    }

    return events;
  }

  function advanceLevel() {
    loadLevel(state.levelIndex + 1);
  }

  reset();
  return {
    state,
    reset,
    loadLevel,
    retryLevel,
    advanceLevel,
    step,
    isSeenAt,
    segmentBlocked,
    canSee,
  };
}
