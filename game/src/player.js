// Player movement: acceleration, friction, gravity, crouch and jump, resolved as a
// box against the world's colliders one axis at a time, so a wall never swallows the
// player. The same box test is what the bots use through the exported `moveBody`.
import * as THREE from 'three';

const RADIUS = 0.34;
const STAND_HEIGHT = 1.72;
const CROUCH_HEIGHT = 1.12;
const STAND_EYE = 1.6;
const CROUCH_EYE = 1.02;
const WALK_SPEED = 5.2;
const CROUCH_SPEED = 2.4;
const GROUND_ACCEL = 42;
const AIR_ACCEL = 9;
const FRICTION = 9;
const GRAVITY = 20;
const JUMP_SPEED = 6.2;

// Shared by players and bots: try to move a capsule (x, z) with a height; returns the
// position reached, sliding along walls instead of sticking to them.
export function moveBody(colliders, position, velocity, height, dt) {
  const probe = new THREE.Box3();
  function overlaps(x, y, z, lift) {
    probe.min.set(x - RADIUS, y + lift, z - RADIUS);
    probe.max.set(x + RADIUS, y + height - lift, z + RADIUS);
    for (const collider of colliders) if (probe.intersectsBox(collider)) return collider;
    return null;
  }
  const nextX = position.x + velocity.x * dt;
  if (!overlaps(nextX, position.y, position.z, 0.04)) position.x = nextX;
  else velocity.x = 0;
  const nextZ = position.z + velocity.z * dt;
  if (!overlaps(position.x, position.y, nextZ, 0.04)) position.z = nextZ;
  else velocity.z = 0;
  position.y += velocity.y * dt;
  let onGround = false;
  const hit = overlaps(position.x, position.y, position.z, 0);
  if (hit && velocity.y <= 0) {
    position.y = hit.max.y;
    velocity.y = 0;
    onGround = true;
  } else if (hit) {
    position.y = hit.min.y - height;
    velocity.y = 0;
  }
  if (position.y < 0) {
    position.y = 0;
    velocity.y = 0;
    onGround = true;
  }
  velocity.y = Math.max(-30, velocity.y);
  return onGround;
}

export function createPlayer(colliders, spawn) {
  const player = {
    position: new THREE.Vector3(spawn[0], 0, spawn[1]),
    velocity: new THREE.Vector3(),
    yaw: -Math.PI / 2,
    pitch: 0,
    eye: STAND_EYE,
    onGround: true,
    crouching: false,
    height: STAND_HEIGHT,
  };
  const wish = new THREE.Vector3();

  function overlaps(x, y, z, height, lift) {
    const probe = new THREE.Box3();
    probe.min.set(x - RADIUS, y + lift, z - RADIUS);
    probe.max.set(x + RADIUS, y + height - lift, z + RADIUS);
    for (const collider of colliders) if (probe.intersectsBox(collider)) return collider;
    return null;
  }

  function look(dx, dy, sensitivity = 0.0022) {
    player.yaw -= dx * sensitivity;
    player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch - dy * sensitivity));
  }

  function recoil(pitchKick, yawKick) {
    player.pitch = Math.min(1.45, player.pitch + pitchKick);
    player.yaw += yawKick;
  }

  function step(dt, keys) {
    const crouching = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    if (crouching && !player.crouching) {
      player.crouching = true;
      player.height = CROUCH_HEIGHT;
    } else if (!crouching && player.crouching && !overlaps(player.position.x, player.position.y, player.position.z, STAND_HEIGHT, 0.02)) {
      player.crouching = false;
      player.height = STAND_HEIGHT;
    }
    const eyeTarget = player.crouching ? CROUCH_EYE : STAND_EYE;
    player.eye += (eyeTarget - player.eye) * Math.min(1, dt * 12);

    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    wish.set(0, 0, 0);
    if (forward || strafe) {
      const sin = Math.sin(player.yaw);
      const cos = Math.cos(player.yaw);
      wish.set(-sin * forward + cos * strafe, 0, -cos * forward - sin * strafe).normalize();
    }

    const speed = player.crouching ? CROUCH_SPEED : WALK_SPEED;
    const blend = Math.min(1, (player.onGround ? GROUND_ACCEL : AIR_ACCEL) * dt / speed);
    player.velocity.x += (wish.x * speed - player.velocity.x) * blend;
    player.velocity.z += (wish.z * speed - player.velocity.z) * blend;
    if (player.onGround && !wish.lengthSq()) {
      const damp = Math.max(0, 1 - FRICTION * dt);
      player.velocity.x *= damp;
      player.velocity.z *= damp;
    }

    if (keys.has('Space') && player.onGround) {
      player.velocity.y = JUMP_SPEED;
      player.onGround = false;
    }
    player.velocity.y -= GRAVITY * dt;
    player.onGround = moveBody(colliders, player.position, player.velocity, player.height, dt);
  }

  return {
    state: player,
    step,
    look,
    recoil,
    groundSpeed() {
      return Math.hypot(player.velocity.x, player.velocity.z);
    },
    respawn(spawnPoint, yaw) {
      player.position.set(spawnPoint[0], 0, spawnPoint[1]);
      player.velocity.set(0, 0, 0);
      player.yaw = yaw;
      player.pitch = 0;
      player.eye = STAND_EYE;
      player.crouching = false;
      player.height = STAND_HEIGHT;
      player.onGround = true;
    },
  };
}
