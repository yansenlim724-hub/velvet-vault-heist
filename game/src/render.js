// Drawing only: the world's state and the current screen in, pixels out.
// The 1280x720 playfield is scaled to fit the window and centred, the
// margin filled with the backdrop colour. Vision cones are raycast: each
// ray stops at the first wall or piece of cover, so cover really does block
// sight on screen, not just in the rules.
import { ALARM, CAMERA, FIELD, FONT, GUARD, PALETTE, THIEF, TOOLS } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_BRIEFING = 'briefing';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_CAUGHT = 'caught';
export const SCREEN_LEVEL_CLEAR = 'levelclear';
export const SCREEN_GETAWAY = 'getaway';
export const SCREEN_OVER = 'over';

const CONE_RAYS = 26;

function pointInSolid(state, x, y) {
  const rects = [...state.level.walls, ...state.level.cover];
  if (state.level.door && !state.doorOpen) rects.push(state.level.door);
  for (const rect of rects) {
    if (x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h) return true;
  }
  return false;
}

/** Distance along a ray before it hits something solid, capped at range. */
function rayLength(state, x, y, angle, range) {
  const step = 10;
  for (let d = step; d <= range; d += step) {
    if (pointInSolid(state, x + Math.cos(angle) * d, y + Math.sin(angle) * d)) return d;
  }
  return range;
}

function formatTime(seconds) {
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${rest < 10 ? '0' : ''}${rest}`;
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  const fonts = new Map();
  function font(size, bold) {
    const key = `${bold ? '700 ' : ''}${size}`;
    if (!fonts.has(key)) fonts.set(key, `${bold ? '700 ' : ''}${size}px ${FONT}`);
    return fonts.get(key);
  }

  function text(value, x, y, size, color, align, bold) {
    context.font = font(size, bold);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.textBaseline = 'alphabetic';
    context.fillText(value, x, y);
  }

  function wrapLines(value, maxWidth, size, bold) {
    context.font = font(size, bold);
    const words = value.split(' ');
    const lines = [];
    let line = '';
    for (const word of words) {
      const next = line === '' ? word : `${line} ${word}`;
      if (context.measureText(next).width > maxWidth && line !== '') {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    if (line !== '') lines.push(line);
    return lines;
  }

  function drawCone(state, x, y, facing, halfAngle, range, fill, edge) {
    context.beginPath();
    context.moveTo(x, y);
    for (let i = 0; i <= CONE_RAYS; i += 1) {
      const angle = facing - halfAngle + (2 * halfAngle * i) / CONE_RAYS;
      const len = rayLength(state, x, y, angle, range);
      context.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
    }
    context.closePath();
    context.fillStyle = fill;
    context.fill();
    context.strokeStyle = edge;
    context.lineWidth = 1.5;
    context.stroke();
  }

  function drawFloor(state) {
    context.fillStyle = PALETTE.floorA;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    context.fillStyle = PALETTE.floorB;
    const tile = 80;
    for (let ty = 0; ty < FIELD.height / tile; ty += 1) {
      for (let tx = 0; tx < FIELD.width / tile; tx += 1) {
        if ((tx + ty) % 2 === 0) context.fillRect(tx * tile, ty * tile, tile, tile);
      }
    }
    context.strokeStyle = PALETTE.floorLine;
    context.lineWidth = 1;
    for (let gx = 0; gx <= FIELD.width; gx += tile) {
      context.beginPath();
      context.moveTo(gx, 0);
      context.lineTo(gx, FIELD.height);
      context.stroke();
    }
    for (let gy = 0; gy <= FIELD.height; gy += tile) {
      context.beginPath();
      context.moveTo(0, gy);
      context.lineTo(FIELD.width, gy);
      context.stroke();
    }
    // A rug marks the middle of the room.
    context.fillStyle = PALETTE.rug;
    context.fillRect(FIELD.width / 2 - 190, FIELD.height / 2 - 110, 380, 220);
    context.strokeStyle = '#4a2f5e';
    context.lineWidth = 3;
    context.strokeRect(FIELD.width / 2 - 190, FIELD.height / 2 - 110, 380, 220);
  }

  function drawVents(state) {
    for (const vent of state.level.vents) {
      context.fillStyle = PALETTE.vent;
      context.fillRect(vent.x, vent.y, vent.w, vent.h);
      context.strokeStyle = PALETTE.ventSlat;
      context.lineWidth = 2;
      const horizontal = vent.w > vent.h;
      const count = Math.floor((horizontal ? vent.w : vent.h) / 22);
      for (let i = 1; i <= count; i += 1) {
        if (horizontal) {
          const sx = vent.x + (vent.w * i) / (count + 1);
          context.beginPath();
          context.moveTo(sx, vent.y + 4);
          context.lineTo(sx, vent.y + vent.h - 4);
          context.stroke();
        } else {
          const sy = vent.y + (vent.h * i) / (count + 1);
          context.beginPath();
          context.moveTo(vent.x + 4, sy);
          context.lineTo(vent.x + vent.w - 4, sy);
          context.stroke();
        }
      }
      text('VENT', vent.x + vent.w / 2, vent.y + vent.h / 2 + 4, 11, PALETTE.muted, 'center', true);
    }
  }

  function drawWallsAndCover(state) {
    for (const wall of state.level.walls) {
      context.fillStyle = PALETTE.wall;
      context.fillRect(wall.x, wall.y, wall.w, wall.h);
      context.fillStyle = PALETTE.wallTop;
      context.fillRect(wall.x, wall.y, wall.w, 4);
    }
    for (const item of state.level.cover) {
      context.fillStyle = PALETTE.cover;
      context.fillRect(item.x, item.y, item.w, item.h);
      context.fillStyle = PALETTE.coverTop;
      context.fillRect(item.x, item.y, item.w, 5);
      context.strokeStyle = '#0e2f23';
      context.lineWidth = 2;
      context.strokeRect(item.x + 1, item.y + 1, item.w - 2, item.h - 2);
      if (item.kind === 'plant') {
        context.fillStyle = '#3fae6a';
        context.beginPath();
        context.arc(item.x + item.w / 2, item.y + item.h / 2, 12, 0, Math.PI * 2);
        context.fill();
      } else if (item.kind === 'pillar') {
        // A square column, wall-coloured: it reads as architecture, never
        // as loot.
        context.fillStyle = PALETTE.wall;
        context.fillRect(item.x, item.y, item.w, item.h);
        context.fillStyle = PALETTE.wallTop;
        context.fillRect(item.x, item.y, item.w, 5);
      } else if (item.kind === 'statue') {
        context.fillStyle = '#c9b48a';
        context.beginPath();
        context.arc(item.x + item.w / 2, item.y + item.h / 2, 9, 0, Math.PI * 2);
        context.fill();
      }
    }
    if (state.level.door) {
      const door = state.level.door;
      if (!state.doorOpen) {
        context.fillStyle = '#6b5a1e';
        context.fillRect(door.x, door.y, door.w, door.h);
        context.fillStyle = PALETTE.loot;
        context.beginPath();
        context.arc(door.x + door.w / 2, door.y + door.h / 2, 6, 0, Math.PI * 2);
        context.fill();
        text('VAULT', door.x + door.w / 2, door.y - 8, 11, PALETTE.loot, 'center', true);
      } else {
        context.fillStyle = '#2a2f45';
        context.fillRect(door.x, door.y, door.w, door.h);
      }
    }
  }

  function drawExit(state) {
    const exit = state.level.exit;
    const open = state.mainTaken;
    context.fillStyle = open ? PALETTE.exit : PALETTE.exitLocked;
    context.fillRect(exit.x, exit.y, exit.w, exit.h);
    context.strokeStyle = open ? '#b8ffce' : '#8b93a3';
    context.lineWidth = 3;
    context.strokeRect(exit.x + 2, exit.y + 2, exit.w - 4, exit.h - 4);
    if (open) {
      const pulse = 0.6 + 0.4 * Math.sin(state.time * 4);
      context.fillStyle = `rgba(61, 220, 132, ${0.25 * pulse})`;
      context.fillRect(exit.x - 8, exit.y - 8, exit.w + 16, exit.h + 16);
    }
    text('EXIT', exit.x + exit.w / 2, exit.y + exit.h / 2 + 5, 13, '#0a0d18', 'center', true);
  }

  function drawLoot(state) {
    for (const item of state.loot) {
      if (item.taken) continue;
      const pulse = 0.7 + 0.3 * Math.sin(state.time * 3 + item.x);
      if (item.kind === 'main') {
        context.fillStyle = PALETTE.lootGlow;
        context.beginPath();
        context.arc(item.x, item.y, 42 * pulse, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = PALETTE.loot;
        context.beginPath();
        context.moveTo(item.x, item.y - 20);
        context.lineTo(item.x + 15, item.y);
        context.lineTo(item.x, item.y + 20);
        context.lineTo(item.x - 15, item.y);
        context.closePath();
        context.fill();
        context.fillStyle = '#fff6c9';
        context.beginPath();
        context.moveTo(item.x, item.y - 12);
        context.lineTo(item.x + 8, item.y);
        context.lineTo(item.x, item.y + 12);
        context.lineTo(item.x - 8, item.y);
        context.closePath();
        context.fill();
        text(item.name.toUpperCase(), item.x, item.y - 30, 12, PALETTE.loot, 'center', true);
      } else {
        context.fillStyle = PALETTE.lootGlow;
        context.beginPath();
        context.arc(item.x, item.y, 20 * pulse, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = PALETTE.loot;
        context.beginPath();
        context.arc(item.x, item.y, 9, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#7a5c1e';
        context.font = font(11, true);
        context.textAlign = 'center';
        context.fillText('$', item.x, item.y + 4);
      }
    }
  }

  function drawSmoke(state) {
    for (const cloud of state.smokeClouds) {
      if (cloud.t <= 0) continue;
      context.fillStyle = PALETTE.smoke;
      context.beginPath();
      context.arc(cloud.x, cloud.y, cloud.radius, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = 'rgba(220, 228, 240, 0.5)';
      context.beginPath();
      context.arc(cloud.x - 20, cloud.y - 10, 26, 0, Math.PI * 2);
      context.arc(cloud.x + 22, cloud.y + 12, 30, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawCones(state) {
    for (const camera of state.cameras) {
      if (state.empTime > 0) continue;
      drawCone(state, camera.x, camera.y, camera.angle, CAMERA.coneHalfAngle, camera.range, PALETTE.coneCamera, 'rgba(255, 138, 61, 0.4)');
    }
    for (const guard of state.guards) {
      const range = guard.mode === 'chase' ? GUARD.coneRange : GUARD.coneRange;
      const fill = guard.mode === 'patrol' ? PALETTE.coneGuard : 'rgba(229, 83, 75, 0.32)';
      drawCone(state, guard.x, guard.y, guard.dir, GUARD.coneHalfAngle, range, fill, PALETTE.coneEdge);
    }
  }

  function drawGuards(state) {
    for (const guard of state.guards) {
      // Faint patrol path, so the player can read the route before moving.
      context.strokeStyle = 'rgba(154, 163, 189, 0.35)';
      context.lineWidth = 2;
      context.setLineDash([4, 8]);
      context.beginPath();
      guard.waypoints.forEach(([x, y], i) => {
        if (i === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.closePath();
      context.stroke();
      context.setLineDash([]);
      context.fillStyle = PALETTE.guardBody;
      context.beginPath();
      context.arc(guard.x, guard.y, 16, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = PALETTE.guard;
      context.lineWidth = 3;
      context.stroke();
      context.strokeStyle = PALETTE.guard;
      context.lineWidth = 4;
      context.beginPath();
      context.moveTo(guard.x, guard.y);
      context.lineTo(guard.x + Math.cos(guard.dir) * 20, guard.y + Math.sin(guard.dir) * 20);
      context.stroke();
      if (guard.mode !== 'patrol') {
        text(guard.mode === 'chase' ? '!' : '?', guard.x, guard.y - 22, 22, guard.mode === 'chase' ? PALETTE.danger : '#ffc53d', 'center', true);
      }
    }
  }

  function drawCameras(state) {
    for (const camera of state.cameras) {
      const disabled = state.empTime > 0;
      context.fillStyle = disabled ? '#5a6478' : PALETTE.camera;
      context.fillRect(camera.x - 9, camera.y - 9, 18, 18);
      context.strokeStyle = disabled ? '#8b93a3' : '#ffd9b0';
      context.lineWidth = 2;
      context.strokeRect(camera.x - 9, camera.y - 9, 18, 18);
      context.fillStyle = disabled ? '#3a415c' : '#fff';
      context.beginPath();
      context.arc(camera.x + Math.cos(camera.angle) * 4, camera.y + Math.sin(camera.angle) * 4, 4, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawThief(state) {
    const player = state.player;
    const blink = state.invulnerable && Math.floor(state.time * 10) % 2 === 0;
    if (blink) return;
    // A cyan glow halo, so the thief reads at a glance against the dark
    // floor, the red cones and the gold loot — never a small gold dot
    // that blends into the coins.
    context.fillStyle = 'rgba(46, 230, 255, 0.16)';
    context.beginPath();
    context.arc(player.x, player.y, 30, 0, Math.PI * 2);
    context.fill();
    if (player.sneaking) {
      context.fillStyle = 'rgba(46, 230, 255, 0.22)';
      context.beginPath();
      context.arc(player.x, player.y, 24, 0, Math.PI * 2);
      context.fill();
    }
    context.fillStyle = PALETTE.thiefCloak;
    context.beginPath();
    context.arc(player.x, player.y, THIEF.radius + 4, 0, Math.PI * 2);
    context.fill();
    // A thick white ring: the thief's outline, distinct from every
    // other colour on the board.
    context.strokeStyle = PALETTE.thiefRing;
    context.lineWidth = 4;
    context.beginPath();
    context.arc(player.x, player.y, THIEF.radius + 4, 0, Math.PI * 2);
    context.stroke();
    context.fillStyle = PALETTE.thief;
    context.beginPath();
    context.arc(player.x, player.y, 11, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#ffffff';
    context.beginPath();
    context.arc(player.x, player.y, 4, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = '#ffffff';
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(player.x, player.y);
    context.lineTo(player.x + Math.cos(player.dir) * 22, player.y + Math.sin(player.dir) * 22);
    context.stroke();
    if (player.sneaking) {
      text('SNEAK', player.x, player.y - 24, 10, PALETTE.muted, 'center', true);
    }
    const progress = state.grabProgress > 0 ? state.grabProgress : state.pickProgress;
    if (progress > 0) {
      context.strokeStyle = PALETTE.loot;
      context.lineWidth = 5;
      context.beginPath();
      context.arc(player.x, player.y, 26, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
      context.stroke();
    }
  }

  function alarmColor(value) {
    if (value < ALARM.investigateAt) return PALETTE.alarmLow;
    if (value < 80) return PALETTE.alarmMid;
    return PALETTE.alarmHigh;
  }

  function drawHud(state, best) {
    context.fillStyle = 'rgba(10, 13, 24, 0.88)';
    context.fillRect(0, 0, FIELD.width, 48);
    context.fillStyle = PALETTE.panelEdge;
    context.fillRect(0, 48, FIELD.width, 2);
    text(`HEIST ${state.levelIndex + 1} · ${state.level.name.toUpperCase()}`, 16, 30, 17, PALETTE.text, 'left', true);
    // Alarm meter.
    const meterX = 470;
    const meterW = 260;
    text('ALARM', meterX - 8, 30, 14, PALETTE.muted, 'right', true);
    context.fillStyle = '#1c2138';
    context.fillRect(meterX, 16, meterW, 16);
    context.fillStyle = alarmColor(state.alarm);
    context.fillRect(meterX, 16, meterW * (state.alarm / ALARM.max), 16);
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    context.strokeRect(meterX, 16, meterW, 16);
    if (state.alarm >= ALARM.investigateAt) {
      text(state.spotted ? 'SPOTTED!' : 'SEARCHING…', meterX + meterW + 10, 30, 14, alarmColor(state.alarm), 'left', true);
    }
    // Loot, lives, tools, timer.
    let right = FIELD.width - 16;
    text(`$${state.score}`, right, 30, 17, PALETTE.loot, 'right', true);
    right -= 110;
    let hearts = '';
    for (let i = 0; i < state.lives; i += 1) hearts += '♥';
    text(hearts, right, 30, 17, PALETTE.danger, 'right', true);
    right -= 90;
    text(`◐ ${state.tools.smoke}  ⚡ ${state.tools.emp}`, right, 30, 15, PALETTE.text, 'right', true);
    right -= 150;
    text(formatTime(state.levelTime), right, 30, 15, PALETTE.muted, 'right', true);
    // Bottom hint line.
    context.fillStyle = 'rgba(10, 13, 24, 0.75)';
    context.fillRect(0, FIELD.height - 26, FIELD.width, 26);
    const hint = state.mainTaken
      ? 'Main target lifted — reach the green EXIT.  WASD move · Shift sneak · 1 smoke ($150) · 2 EMP ($100) · P pause'
      : 'WASD move · Shift sneak (vents too) · E hold to lift loot / pick locks · 1 smoke ($150) · 2 EMP ($100) · P pause';
    text(hint, FIELD.width / 2, FIELD.height - 8, 13, PALETTE.muted, 'center');
    // Alarm vignette: the screen itself warns you before the catch.
    if (state.alarm > 5) {
      const alpha = (state.alarm / ALARM.max) * 0.4 * (0.7 + 0.3 * Math.sin(state.time * 6));
      const gradient = context.createRadialGradient(
        FIELD.width / 2, FIELD.height / 2, FIELD.height * 0.35,
        FIELD.width / 2, FIELD.height / 2, FIELD.height * 0.75,
      );
      gradient.addColorStop(0, 'rgba(255, 60, 50, 0)');
      gradient.addColorStop(1, `rgba(255, 60, 50, ${alpha})`);
      context.fillStyle = gradient;
      context.fillRect(0, 0, FIELD.width, FIELD.height);
    }
  }

  function drawPanel(title, lines, prompt, titleColor) {
    const width = 640;
    const height = 150 + lines.length * 30;
    const x = (FIELD.width - width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, width, height);
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    context.strokeRect(x, y, width, height);
    text(title, FIELD.width / 2, y + 52, 30, titleColor || PALETTE.text, 'center', true);
    lines.forEach((line, index) => {
      text(line, FIELD.width / 2, y + 96 + index * 30, 16, PALETTE.text, 'center');
    });
    if (prompt) text(prompt, FIELD.width / 2, y + height - 22, 15, PALETTE.muted, 'center');
  }

  function drawTitleOverlay(state) {
    // A compact banner, so the live room stays visible behind it.
    context.fillStyle = PALETTE.panel;
    context.fillRect(190, 56, 900, 118);
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    context.strokeRect(190, 56, 900, 118);
    text('VELVET VAULT', FIELD.width / 2, 108, 44, PALETTE.loot, 'center', true);
    text('A midnight heist in three jobs — steal it all, get out clean.', FIELD.width / 2, 142, 16, PALETTE.text, 'center');
    text('Press Enter to begin  ·  WASD move · Shift sneak · E lift & pick · 1 smoke · 2 EMP', FIELD.width / 2, 164, 14, PALETTE.muted, 'center');
  }

  function drawBriefing(state) {
    const level = state.level;
    const lines = wrapLines(level.briefing, 560, 16);
    const width = 680;
    const height = 190 + lines.length * 26;
    const x = (FIELD.width - width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, width, height);
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    context.strokeRect(x, y, width, height);
    text(level.name.toUpperCase(), FIELD.width / 2, y + 52, 28, PALETTE.loot, 'center', true);
    text(level.sub, FIELD.width / 2, y + 80, 15, PALETTE.muted, 'center');
    lines.forEach((line, index) => {
      text(line, FIELD.width / 2, y + 122 + index * 26, 16, PALETTE.text, 'center');
    });
    text('Press Enter to start the job', FIELD.width / 2, y + height - 24, 15, PALETTE.muted, 'center');
  }

  function drawWorld(state) {
    drawFloor(state);
    drawVents(state);
    drawExit(state);
    drawLoot(state);
    drawCones(state);
    drawWallsAndCover(state);
    drawSmoke(state);
    drawGuards(state);
    drawCameras(state);
    drawThief(state);
  }

  function draw(state, screen, best, summary) {
    resize();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    if (screen === SCREEN_TITLE) {
      drawWorld(state);
      drawHud(state, best);
      drawTitleOverlay(state);
      return;
    }
    if (screen === SCREEN_BRIEFING) {
      drawWorld(state);
      drawHud(state, best);
      drawBriefing(state);
      return;
    }
    drawWorld(state);
    drawHud(state, best);
    if (screen === SCREEN_PAUSED) {
      drawPanel('PAUSED', ['The crew waits in the dark.'], 'Press P or Enter to keep going');
    } else if (screen === SCREEN_CAUGHT) {
      drawPanel('CAUGHT!', [`The alarm hit the roof — ${state.lives} ${state.lives === 1 ? 'life' : 'lives'} left.`], 'Press Enter to try this job again', PALETTE.danger);
    } else if (screen === SCREEN_LEVEL_CLEAR) {
      drawPanel('CLEAN GETAWAY', [
        `${state.level.name} — done in ${formatTime(state.levelTime)}.`,
        `Loot so far: $${state.score} · Side loot ${state.sideLootTaken}/${state.sideLootTotal} on this job.`,
      ], 'Press Enter for the next job');
    } else if (screen === SCREEN_GETAWAY) {
      const total = summary || { score: state.score, time: state.time, caught: state.caughtCount, alarms: state.alarmsRaised, rating: 'CLEAN' };
      drawPanel('THE VAULT IS YOURS', [
        `All three jobs done. Loot: $${total.score} · Time: ${formatTime(total.time)}.`,
        `Times caught: ${total.caught} · Alarms raised: ${total.alarms} · Rating: ${total.rating}.`,
        `Best score: $${best}.`,
      ], 'Press Enter to run it all again', PALETTE.loot);
    } else if (screen === SCREEN_OVER) {
      drawPanel('THE CREW IS DONE', [
        `Three strikes and the night is over. Loot kept: $${state.score}.`,
        `Best score: $${best}.`,
      ], 'Press Enter to start a new night', PALETTE.danger);
    }
  }

  return { draw, resize };
}
