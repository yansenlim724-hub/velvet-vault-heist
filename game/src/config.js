// Every tuning number and colour in one place. The playfield is a fixed
// 1280x720 logical area; the renderer scales it to the window, so no rule
// below depends on the screen size.
export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second. */
export const STEP = 1 / 60;

export const THIEF = {
  radius: 15,
  walkSpeed: 205,
  sneakSpeed: 105,
  grabTime: 0.6,
  pickTime: 1.6,
};

export const LIVES = 3;

export const GUARD = {
  patrolSpeed: 72,
  investigateSpeed: 112,
  chaseSpeed: 138,
  catchRadius: 28,
  coneHalfAngle: 0.61, // about 35 degrees each side
  coneRange: 265,
  sneakRange: 135,
  pauseAtWaypoint: 1.1,
  lookAroundTime: 2.0,
};

export const CAMERA = {
  coneHalfAngle: 0.5,
  coneRange: 300,
  sweepSpeed: 0.55,
};

export const ALARM = {
  guardRate: 85, // per second of being seen by a guard: ~1.2 s to fill
  cameraRate: 70,
  decayRate: 12,
  investigateAt: 50,
  max: 100,
};

export const TOOLS = {
  smokeCost: 150,
  smokeCount: 2,
  smokeRadius: 95,
  smokeSeconds: 6,
  empCost: 100,
  empCount: 2,
  empSeconds: 10,
};

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'velvet-vault.best';

export const PALETTE = {
  backdrop: '#0a0d18',
  floorA: '#171b2e',
  floorB: '#141828',
  floorLine: '#20263f',
  rug: '#2a1f3d',
  wall: '#3a415c',
  wallTop: '#565f83',
  cover: '#1e4d3a',
  coverTop: '#2f7a58',
  vent: '#0d111f',
  ventSlat: '#39415f',
  thief: '#2ee6ff',
  thiefCloak: '#0b6b82',
  thiefRing: '#ffffff',
  guard: '#e5534b',
  guardBody: '#5b2a30',
  camera: '#ff8a3d',
  coneGuard: 'rgba(229, 83, 75, 0.20)',
  coneCamera: 'rgba(255, 138, 61, 0.18)',
  coneEdge: 'rgba(229, 83, 75, 0.55)',
  loot: '#ffd94d',
  lootGlow: 'rgba(255, 217, 77, 0.35)',
  exit: '#3ddc84',
  exitLocked: '#5a6478',
  smoke: 'rgba(180, 190, 210, 0.55)',
  panel: 'rgba(13, 16, 30, 0.92)',
  panelEdge: '#4a5378',
  text: '#f2ead8',
  muted: '#9aa3bd',
  danger: '#ff5a4e',
  alarmLow: '#3ddc84',
  alarmMid: '#ffc53d',
  alarmHigh: '#ff5a4e',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
