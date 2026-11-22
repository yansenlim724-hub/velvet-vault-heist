// The three heists: rooms, walls, cover, vents, patrols, cameras, loot and
// exits. All coordinates are in the 1280x720 field. Waypoint segments never
// cross a wall, and no loot, exit or start point sits inside a wall or a
// piece of cover. The outer walls are the same for every level.
const OUTER = [
  { x: 0, y: 0, w: 1280, h: 24 },
  { x: 0, y: 696, w: 1280, h: 24 },
  { x: 0, y: 0, w: 24, h: 720 },
  { x: 1256, y: 0, w: 24, h: 720 },
];

export const LEVELS = [
  {
    name: 'The Gallery',
    sub: 'Heist 1 of 3 — the Star Sapphire',
    briefing:
      'A quiet gallery after closing. Two guards walk the floor and one camera watches the hall. Lift the Star Sapphire, then slip out the north-east door. The vent along the top wall is yours — if you sneak.',
    start: { x: 90, y: 620 },
    exit: { x: 1180, y: 70, w: 56, h: 56 },
    door: null,
    par: 75,
    walls: [
      ...OUTER,
      { x: 380, y: 330, w: 520, h: 26 },
      { x: 880, y: 100, w: 26, h: 140 },
    ],
    cover: [
      { x: 500, y: 170, w: 70, h: 50, kind: 'crate' },
      { x: 200, y: 500, w: 90, h: 50, kind: 'desk' },
      { x: 1050, y: 170, w: 50, h: 50, kind: 'plant' },
      { x: 700, y: 470, w: 60, h: 60, kind: 'statue' },
      { x: 300, y: 130, w: 60, h: 50, kind: 'crate' },
    ],
    vents: [{ x: 150, y: 56, w: 700, h: 34 }],
    guards: [
      { waypoints: [[300, 260], [820, 260], [820, 320], [300, 320]], pause: 1.1 },
      { waypoints: [[420, 550], [1000, 550], [1000, 650], [420, 650]], pause: 1.1 },
    ],
    cameras: [{ x: 640, y: 30, angle: Math.PI / 2, sweep: 0.9, speed: 0.55, range: 300 }],
    loot: [
      { x: 1150, y: 620, kind: 'main', name: 'Star Sapphire', value: 500 },
      { x: 640, y: 110, kind: 'side', name: 'Moonlit Portrait', value: 120 },
      { x: 300, y: 300, kind: 'side', name: 'Cash Drawer', value: 80 },
      { x: 1010, y: 300, kind: 'side', name: 'Jade Figurine', value: 100 },
    ],
  },
  {
    name: 'The Bank',
    sub: 'Heist 2 of 3 — the Velvet Diamond',
    briefing:
      'The Velvet Diamond sits in the vault, bottom right, behind a locked door. Hold E by the door to pick it — two seconds, out in the open, under a camera. Three guards, two cameras. The vent on the west wall is your quiet way down.',
    start: { x: 90, y: 360 },
    exit: { x: 70, y: 70, w: 56, h: 56 },
    door: { x: 1060, y: 430, w: 80, h: 26 },
    par: 110,
    walls: [
      ...OUTER,
      { x: 300, y: 420, w: 26, h: 200 },
      { x: 600, y: 80, w: 26, h: 140 },
      // A tall partition west of the vault door: it stands clear of every
      // patrol segment, and it blocks guard 1's cones from reaching the
      // pick stance, so the door is picked in a real pocket — while the
      // approach to the pocket is still patrolled and the camera still
      // watches it. The thief rounds the partition's north end.
      { x: 900, y: 280, w: 26, h: 140 },
      // A bridge from the partition to the vault wall: the south squeeze
      // around the partition is shut, so the only way to the door pocket
      // is around the partition's north end, through the open corridor.
      { x: 926, y: 430, w: 54, h: 26 },
      { x: 980, y: 430, w: 80, h: 26 },
      { x: 1140, y: 430, w: 100, h: 26 },
      { x: 980, y: 430, w: 26, h: 266 },
    ],
    cover: [
      { x: 350, y: 120, w: 100, h: 50, kind: 'desk' },
      { x: 700, y: 360, w: 90, h: 50, kind: 'desk' },
      { x: 450, y: 550, w: 70, h: 50, kind: 'crate' },
      { x: 90, y: 520, w: 50, h: 50, kind: 'plant' },
      { x: 1000, y: 150, w: 50, h: 50, kind: 'plant' },
      // A crate just west of the vault door: the one hiding spot on the
      // approach corridor, so a careful thief can wait out a sweep
      // instead of picking in the open. It stands clear of every patrol
      // segment and of the vault wall.
      { x: 960, y: 380, w: 50, h: 50, kind: 'crate' },
    ],
    vents: [{ x: 180, y: 120, w: 36, h: 400 }],
    guards: [
      // The east leg stops at x880, so the corridor to the vault door
      // (x900..1060) is a real window, not a second patrol ground
      // stacked on the door guard's.
      { waypoints: [[650, 300], [880, 300], [880, 420], [650, 420]], pause: 1.1 },
      { waypoints: [[400, 480], [900, 480], [900, 620], [400, 620]], pause: 1.1 },
      // Lingers at the north waypoints: the patrol is readable and the
      // vault door has a real window, instead of a guard that is always
      // about to turn back south. The south leg runs at y220, well north
      // of the pick stance (y390): the door guard's cone no longer sits
      // on the stance itself, so a careful thief can reach the pocket
      // and pick while the guard is on the far legs — the camera still
      // watches the door, and the east leg still sweeps the approach.
      { waypoints: [[950, 100], [1150, 100], [1150, 220], [950, 220]], pause: 3.2 },
    ],
    cameras: [
      { x: 640, y: 30, angle: Math.PI / 2, sweep: 0.9, speed: 0.55, range: 300 },
      { x: 1240, y: 360, angle: Math.PI, sweep: 0.55, speed: 0.5, range: 260 },
    ],
    loot: [
      { x: 1110, y: 560, kind: 'main', name: 'Velvet Diamond', value: 800 },
      { x: 700, y: 150, kind: 'side', name: 'Cash Drawer', value: 100 },
      { x: 200, y: 600, kind: 'side', name: 'Bank Portrait', value: 120 },
      { x: 900, y: 120, kind: 'side', name: 'Gold Bars', value: 140 },
      { x: 500, y: 420, kind: 'side', name: 'Safe Deposit', value: 160 },
    ],
  },
  {
    name: 'The Penthouse',
    sub: 'Heist 3 of 3 — the Moonlight Tiara',
    briefing:
      'The final job. The Moonlight Tiara waits on its plinth in the middle of the penthouse, ringed by four guards and three cameras. Take everything worth taking, then reach the south-east door and vanish into the night.',
    start: { x: 90, y: 90 },
    exit: { x: 1190, y: 620, w: 56, h: 56 },
    door: null,
    par: 140,
    walls: [
      ...OUTER,
      { x: 280, y: 180, w: 26, h: 360 },
      { x: 974, y: 180, w: 26, h: 360 },
      { x: 440, y: 330, w: 120, h: 26 },
      { x: 720, y: 330, w: 120, h: 26 },
    ],
    cover: [
      { x: 540, y: 170, w: 60, h: 60, kind: 'pillar' },
      { x: 680, y: 170, w: 60, h: 60, kind: 'pillar' },
      { x: 540, y: 490, w: 60, h: 60, kind: 'pillar' },
      { x: 680, y: 490, w: 60, h: 60, kind: 'pillar' },
    ],
    vents: [{ x: 200, y: 660, w: 800, h: 34 }],
    guards: [
      { waypoints: [[420, 260], [860, 260], [860, 470], [420, 470]], pause: 1.1 },
      // The west strip guard walks a shorter beat: its north leg sits
      // at y400, so the north corridor into the centre is a real lane
      // instead of a cone the thief can never cross — it still guards
      // the west strip and the portrait, and the plinth itself is
      // still ringed by the centre guard.
      { waypoints: [[100, 400], [240, 400], [240, 500], [100, 500]], pause: 1.1 },
      { waypoints: [[1040, 200], [1180, 200], [1180, 500], [1040, 500]], pause: 1.1 },
      // The south guard walks a shorter beat along the bottom wall:
      // its east end stops at x700, so the south-east lane to the
      // exit is a real getaway instead of a patrol the thief has to
      // cross head-on — it still guards the south-west and the vent.
      { waypoints: [[420, 600], [700, 600], [700, 650], [420, 650]], pause: 1.1 },
    ],
    cameras: [
      { x: 640, y: 30, angle: Math.PI / 2, sweep: 0.9, speed: 0.55, range: 300 },
      // The west camera watches the west side, not the whole room: a
      // shorter range leaves the north corridor crossable, so the thief
      // can reach the plinth without the camera seeing every step.
      { x: 30, y: 360, angle: 0, sweep: 0.6, speed: 0.6, range: 230 },
      { x: 1250, y: 360, angle: Math.PI, sweep: 0.8, speed: 0.6, range: 300 },
    ],
    loot: [
      { x: 640, y: 360, kind: 'main', name: 'Moonlight Tiara', value: 1200 },
      // The portrait hangs on the north wall, clear of the west
      // guard's cone and the west camera's sweep: side loot the thief
      // can lift on the way in, not a second vault door.
      { x: 200, y: 200, kind: 'side', name: 'Penthouse Portrait', value: 140 },
      { x: 1080, y: 150, kind: 'side', name: 'Cash Drawer', value: 120 },
      { x: 200, y: 620, kind: 'side', name: 'Jade Figurine', value: 160 },
      { x: 1080, y: 560, kind: 'side', name: 'Gold Bars', value: 180 },
    ],
  },
];
