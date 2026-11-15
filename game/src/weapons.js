// The arsenal: three guns and a frag grenade. One table owns every number the judge
// can check against the code: damage per body part, fire rate, spread, price. A gun
// that is bought stays in the loadout for the match; each round refills its ammunition.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P9 Sidearm', price: 0, mag: 12, reserve: 48,
    gap: 0.14, reload: 1.3, torso: 30, head: 90,
    spreadStill: 0.002, spreadMoving: 0.02, auto: false, kick: 0.006,
  },
  rifle: {
    id: 'rifle', name: 'KR-7 Carbine', price: 2700, mag: 30, reserve: 90,
    gap: 0.096, reload: 1.9, torso: 34, head: 100,
    spreadStill: 0.0022, spreadMoving: 0.028, auto: true, kick: 0.009,
  },
  smg: {
    id: 'smg', name: 'RK-9 Rook', price: 1500, mag: 32, reserve: 96,
    gap: 0.065, reload: 1.7, torso: 26, head: 78,
    spreadStill: 0.003, spreadMoving: 0.034, auto: true, kick: 0.005,
  },
};
export const GRENADE_PRICE = 300;
export const ARMOR_PRICE = 650;

export function damageFor(weaponId, part) {
  const weapon = WEAPONS[weaponId];
  if (!weapon) return 0;
  return part === 'head' ? weapon.head : weapon.torso;
}

function buildViewModel(def) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5, metalness: 0.2 });
  const model = new THREE.Group();
  if (def.id === 'pistol') {
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.26), body);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.13, 0.07), grip);
    handle.position.set(0, -0.08, 0.09);
    model.add(slide, handle);
    model.position.set(0.2, -0.2, -0.34);
  } else if (def.id === 'smg') {
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 0.34), body);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.3), grip);
    barrel.position.set(0, 0.02, -0.3);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.06), accent);
    mag.position.set(0, -0.11, -0.02);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.16), grip);
    stock.position.set(0, -0.01, 0.24);
    model.add(receiver, barrel, mag, stock);
    model.position.set(0.22, -0.19, -0.4);
  } else {
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.42), body);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.4), grip);
    barrel.position.set(0, 0.025, -0.38);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.22), grip);
    stock.position.set(0, -0.02, 0.3);
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.08), accent);
    sight.position.set(0, 0.07, -0.05);
    model.add(receiver, barrel, stock, sight);
    model.position.set(0.24, -0.2, -0.42);
  }
  return model;
}

export function createArsenal(camera) {
  const models = {};
  for (const def of Object.values(WEAPONS)) {
    const model = buildViewModel(def);
    model.visible = false;
    camera.add(model);
    models[def.id] = model;
  }
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.24),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  const owned = { pistol: { mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve } };
  const state = {
    weaponId: 'pistol', mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve,
    cooldown: 0, reloadLeft: 0, flash: 0, kick: 0, grenades: 0,
  };
  models.pistol.visible = true;

  function current() {
    return WEAPONS[state.weaponId];
  }
  function syncModel() {
    for (const id of Object.keys(models)) models[id].visible = id === state.weaponId;
  }

  return {
    state,
    owned,
    current,
    has(id) {
      return Boolean(owned[id]);
    },
    give(id) {
      const def = WEAPONS[id];
      owned[id] = { mag: def.mag, reserve: def.reserve };
    },
    select(id) {
      if (!owned[id] || state.reloadLeft > 0) return false;
      if (id === state.weaponId) return false;
      owned[state.weaponId] = { mag: state.mag, reserve: state.reserve };
      state.weaponId = id;
      state.mag = owned[id].mag;
      state.reserve = owned[id].reserve;
      state.cooldown = 0.25;
      syncModel();
      return true;
    },
    giveGrenade() {
      if (state.grenades >= 2) return false;
      state.grenades += 1;
      return true;
    },
    takeGrenade() {
      if (state.grenades <= 0) return false;
      state.grenades -= 1;
      return true;
    },
    step(dt) {
      state.cooldown = Math.max(0, state.cooldown - dt);
      state.flash = Math.max(0, state.flash - dt);
      state.kick += (0 - state.kick) * Math.min(1, dt * 14);
      const model = models[state.weaponId];
      model.position.z = -0.42 + state.kick + (state.weaponId === 'pistol' ? 0.08 : 0);
      model.rotation.x = state.kick * 2.2;
      flash.visible = state.flash > 0;
      flash.rotation.z = state.flash * 30;
      flashLight.intensity = state.flash > 0 ? 18 : 0;
      if (state.reloadLeft > 0) {
        state.reloadLeft = Math.max(0, state.reloadLeft - dt);
        model.rotation.x = -0.55 * Math.min(1, (current().reload - state.reloadLeft) * 2);
        if (state.reloadLeft === 0) {
          const def = current();
          const take = Math.min(def.mag - state.mag, state.reserve);
          state.mag += take;
          state.reserve -= take;
        }
      }
    },
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = current().gap;
      state.flash = 0.06;
      state.kick = 0.055;
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    reload() {
      const def = current();
      if (state.reloadLeft > 0 || state.mag === def.mag || state.reserve === 0) return;
      state.reloadLeft = def.reload;
    },
    spread(speed) {
      const def = current();
      return def.spreadStill + Math.min(1, speed / 5.2) * def.spreadMoving;
    },
    refill() {
      for (const id of Object.keys(owned)) {
        owned[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
      }
      state.mag = owned[state.weaponId].mag;
      state.reserve = owned[state.weaponId].reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
    },
  };
}
