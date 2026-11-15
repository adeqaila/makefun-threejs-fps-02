// Input: keyboard state, mouse look, pointer lock, and the fire button. The game
// owns the listeners; main.js reads the state once per fixed step and clears the
// edge-triggered flags (use, grenade, reload, number keys) after handling them.
export function createInput(canvas) {
  const keys = new Set();
  const pressed = new Set(); // edge-triggered: consumed once by main.js
  let mouseDX = 0;
  let mouseDY = 0;
  let firing = false;
  let locked = false;
  let onLockChange = null;
  let onKeyDown = null;

  document.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    keys.add(event.code);
    pressed.add(event.code);
    if (onKeyDown) onKeyDown(event.code);
  });
  document.addEventListener('keyup', (event) => keys.delete(event.code));
  document.addEventListener('mousemove', (event) => {
    if (!locked) return;
    mouseDX += event.movementX;
    mouseDY += event.movementY;
  });
  document.addEventListener('mousedown', (event) => {
    if (event.button === 0) {
      firing = true;
      pressed.add('Mouse0');
    }
  });
  document.addEventListener('mouseup', (event) => {
    if (event.button === 0) firing = false;
  });
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
    if (onLockChange) onLockChange(locked);
  });
  window.addEventListener('blur', () => {
    keys.clear();
    firing = false;
  });

  return {
    keys,
    get firing() {
      return firing;
    },
    get locked() {
      return locked;
    },
    set onLockChange(fn) {
      onLockChange = fn;
    },
    set onKeyDown(fn) {
      onKeyDown = fn;
    },
    requestLock() {
      canvas.requestPointerLock();
    },
    exitLock() {
      document.exitPointerLock();
    },
    consumeMouse() {
      const dx = mouseDX;
      const dy = mouseDY;
      mouseDX = 0;
      mouseDY = 0;
      return { dx, dy };
    },
    wasPressed(code) {
      return pressed.has(code);
    },
    clearPressed() {
      pressed.clear();
    },
  };
}
