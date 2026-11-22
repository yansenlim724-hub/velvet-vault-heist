// Keyboard and pointer input. Held keys give a steering direction; one-shot
// presses (confirm, pause, tools, interact) are queued as bit flags and taken
// once by the loop, so a press between two frames is never lost and never
// counted twice. The interact key is also held: holding E near a vault door
// or the main loot fills its progress ring.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_SMOKE = 4;
export const ACTION_EMP = 8;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const SNEAK = new Set(['ShiftLeft', 'ShiftRight']);
const INTERACT = new Set(['KeyE']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const SMOKE = new Set(['Digit1', 'Numpad1']);
const EMP = new Set(['Digit2', 'Numpad2']);

export function createInput(target) {
  const held = { up: false, down: false, left: false, right: false, sneak: false, interact: false };
  let actions = 0;

  window.addEventListener('keydown', (event) => {
    if (UP.has(event.code)) held.up = true;
    else if (DOWN.has(event.code)) held.down = true;
    else if (LEFT.has(event.code)) held.left = true;
    else if (RIGHT.has(event.code)) held.right = true;
    else if (SNEAK.has(event.code)) held.sneak = true;
    else if (INTERACT.has(event.code)) held.interact = true;
    else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (SMOKE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_SMOKE;
    } else if (EMP.has(event.code)) {
      if (!event.repeat) actions |= ACTION_EMP;
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (UP.has(event.code)) held.up = false;
    else if (DOWN.has(event.code)) held.down = false;
    else if (LEFT.has(event.code)) held.left = false;
    else if (RIGHT.has(event.code)) held.right = false;
    else if (SNEAK.has(event.code)) held.sneak = false;
    else if (INTERACT.has(event.code)) held.interact = false;
  });
  // A key released while the tab is hidden never sends keyup: let go of
  // everything on blur.
  window.addEventListener('blur', () => {
    held.up = false;
    held.down = false;
    held.left = false;
    held.right = false;
    held.sneak = false;
    held.interact = false;
  });
  target.addEventListener('pointerdown', () => {
    actions |= ACTION_CONFIRM;
  });

  return {
    /** Normalised steering vector, {x, y} each in -1..1. */
    direction() {
      const x = (held.right ? 1 : 0) - (held.left ? 1 : 0);
      const y = (held.down ? 1 : 0) - (held.up ? 1 : 0);
      if (x !== 0 && y !== 0) {
        const inv = 1 / Math.sqrt(2);
        return { x: x * inv, y: y * inv };
      }
      return { x, y };
    },
    sneaking() {
      return held.sneak;
    },
    interacting() {
      return held.interact;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
