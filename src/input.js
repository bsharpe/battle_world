import { clamp } from './math.js';

export const treadsFromArcade = (forward, turn) => ({
  left: clamp(forward + turn, -1, 1),
  right: clamp(forward - turn, -1, 1),
});

const DEADZONE = 0.2;

export function createInput(win = window) {
  const down = new Set();
  const prev = { fire: false, start: false, toggle: false, fullscreen: false };
  let mode = 'arcade';
  win.addEventListener('keydown', (e) => {
    down.add(e.code);
    if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  });
  win.addEventListener('keyup', (e) => down.delete(e.code));
  win.addEventListener('blur', () => down.clear());
  const k = (code) => (down.has(code) ? 1 : 0);
  const edge = (name, held) => {
    const hit = held && !prev[name];
    prev[name] = held;
    return hit;
  };

  return {
    get mode() { return mode; },
    read() {
      let { left, right } =
        mode === 'arcade'
          ? treadsFromArcade(
              Math.max(k('KeyW'), k('ArrowUp')) - Math.max(k('KeyS'), k('ArrowDown')),
              Math.max(k('KeyD'), k('ArrowRight')) - Math.max(k('KeyA'), k('ArrowLeft')),
            )
          : { left: k('KeyQ') - k('KeyA'), right: k('KeyP') - k('KeyL') };
      let fire = down.has('Space'), start = down.has('Enter');
      const pad = Array.from(globalThis.navigator?.getGamepads?.() ?? []).find(Boolean);
      if (pad) {
        const axis = (i) => (Math.abs(pad.axes[i] ?? 0) < DEADZONE ? 0 : -pad.axes[i]);
        if (axis(1) || axis(3)) [left, right] = [axis(1), axis(3)];
        fire ||= [0, 5, 7].some((i) => pad.buttons[i]?.pressed);
        start ||= !!pad.buttons[9]?.pressed;
      }
      if (edge('toggle', down.has('KeyT'))) mode = mode === 'arcade' ? 'treads' : 'arcade';
      return {
        left, right,
        fire: edge('fire', fire),
        start: edge('start', start),
        fullscreen: edge('fullscreen', down.has('KeyF')),
      };
    },
  };
}
