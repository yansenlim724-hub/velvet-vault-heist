// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer paints what is there. The game moves between eight screens:
// title, briefing, play, paused, caught, level clear, getaway and game over.
//
// ?seed=N fixes the run's seed. ?shot=start|play|vault|end (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_CAUGHT, EVENT_GETAWAY, EVENT_LEVEL_CLEAR, EVENT_LOOT, EVENT_MAIN, EVENT_OVER, EVENT_SPOTTED, EVENT_TOOL, EVENT_UNLOCK } from './world.js';
import { ACTION_CONFIRM, ACTION_EMP, ACTION_PAUSE, ACTION_SMOKE, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_BRIEFING, SCREEN_CAUGHT, SCREEN_GETAWAY, SCREEN_LEVEL_CLEAR, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

// A small handle for testing in a browser console: read the live world,
// the current screen and the best score. It changes nothing about the game.
window.__velvet = {
  world,
  screen: () => currentScreen,
  best: () => currentBest,
};
let currentScreen = SCREEN_TITLE;
let currentBest = readBest();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best then lasts one visit.
  }
}

function ratingFor(state) {
  if (state.caughtCount === 0 && state.alarmsRaised === 0) return 'GHOST';
  if (state.caughtCount === 0) return 'CLEAN';
  if (state.caughtCount <= 2) return 'LOUD';
  return 'MESSY';
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, scene.summary);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let summary = null;
  let accumulator = 0;
  let last = performance.now();

  // Screen readers (and anyone watching the page's text) hear the screen
  // changes and each pickup.
  function announce(message) {
    status.textContent = message;
  }

  function startRun() {
    world.reset();
    summary = null;
    screen = SCREEN_BRIEFING;
    audio.start();
    announce(`Heist 1, The Gallery. ${world.state.level.briefing}`);
  }

  function beginLevel() {
    screen = SCREEN_PLAY;
    announce(`Playing. ${world.state.level.name}.`);
  }

  function endRun() {
    screen = SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    announce(`Game over. Score ${world.state.score}. Best ${best}.`);
  }

  function finishGetaway() {
    summary = {
      score: world.state.score,
      time: world.state.time,
      caught: world.state.caughtCount,
      alarms: world.state.alarmsRaised,
      rating: ratingFor(world.state),
    };
    screen = SCREEN_GETAWAY;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    audio.getaway();
    announce(`Getaway complete. Score ${world.state.score}. Rating ${summary.rating}.`);
  }

  function handleActions(actions) {
    if (actions & ACTION_CONFIRM) {
      if (screen === SCREEN_TITLE) startRun();
      else if (screen === SCREEN_BRIEFING) beginLevel();
      else if (screen === SCREEN_CAUGHT) {
        if (world.state.lives <= 0) endRun();
        else {
          world.retryLevel();
          screen = SCREEN_BRIEFING;
          announce(`Trying ${world.state.level.name} again.`);
        }
      } else if (screen === SCREEN_LEVEL_CLEAR) {
        world.advanceLevel();
        screen = SCREEN_BRIEFING;
        announce(`Heist ${world.state.levelIndex + 1}, ${world.state.level.name}.`);
      } else if (screen === SCREEN_GETAWAY || screen === SCREEN_OVER) startRun();
      else if (screen === SCREEN_PAUSED) screen = SCREEN_PLAY;
    }
    if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }
  }

  function step(actions) {
    if (screen === SCREEN_TITLE) {
      // The title's backdrop: the job already in motion, harmless.
      world.step(STEP, { dir: { x: 0, y: 0 }, sneak: false, interact: false, actions: 0 });
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    const events = world.step(STEP, {
      dir: input.direction(),
      sneak: input.sneaking(),
      interact: input.interacting(),
      actions: (actions & ACTION_SMOKE ? 4 : 0) | (actions & ACTION_EMP ? 8 : 0),
    });
    if (events & EVENT_LOOT) audio.pickup();
    if (events & EVENT_MAIN) audio.mainLoot();
    if (events & EVENT_UNLOCK) audio.unlock();
    if (events & EVENT_SPOTTED) audio.spotted();
    if (events & EVENT_TOOL) audio.smoke();
    if (events & EVENT_CAUGHT) {
      audio.caught();
      screen = SCREEN_CAUGHT;
      announce(world.state.lives > 0 ? `Caught. ${world.state.lives} lives left.` : 'Caught. No lives left.');
      return;
    }
    if (events & EVENT_GETAWAY) {
      finishGetaway();
      return;
    }
    if (events & EVENT_LEVEL_CLEAR) {
      screen = SCREEN_LEVEL_CLEAR;
      announce(`${world.state.level.name} done. Score ${world.state.score}.`);
      return;
    }
    if (events & EVENT_OVER) endRun();
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions = input.takeActions();
    handleActions(actions);
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      // One-shot tool presses belong to the first sub-step only: applying
      // them to every sub-step would fire the same pellet twice.
      let firstStep = true;
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step(firstStep ? actions : 0);
        firstStep = false;
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    // Keep the testing handle in sync with the live game.
    currentScreen = screen;
    currentBest = best;
    renderer.draw(world.state, screen, best, summary);
  }

  // Leaving the tab pauses a running game rather than letting the alarm
  // fill unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
