// The bomb: the objective beyond killing. One attacker carries the charge; holding
// use inside a site plants it in 3.5 s; once planted it ticks for 35 s, and a defender
// holding use beside it defuses in 5 s. Planting pays, and the fuse is the round's
// real clock: attackers win on detonation, defenders on a defuse or on time.
import * as THREE from 'three';

export const PLANT_TIME = 3.5;
export const DEFUSE_TIME = 5;
export const FUSE_TIME = 35;

export function createBomb(scene) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.2, 0.24),
    new THREE.MeshStandardMaterial({ color: new THREE.Color('#e07830'), roughness: 0.45, metalness: 0.3 }),
  );
  body.castShadow = true;
  const light = new THREE.PointLight(new THREE.Color('#ff5a2a'), 0, 6);
  light.position.set(0, 0.4, 0);
  const beeper = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 8, 8),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff5a2a') }),
  );
  beeper.position.set(0, 0.14, 0);
  group.add(body, light, beeper);
  group.visible = false;
  scene.add(group);

  let state = 'carried'; // carried | planting | planted | defusing | detonated | defused
  let progress = 0;
  let fuseLeft = FUSE_TIME;
  let site = null;
  let carrier = null; // 'player' | bot object
  let beepTimer = 0;

  return {
    state() {
      return state;
    },
    fuseLeft() {
      return fuseLeft;
    },
    progress() {
      return progress;
    },
    site() {
      return site;
    },
    carrier() {
      return carrier;
    },
    isPlanted() {
      return state === 'planted' || state === 'defusing';
    },
    // The carrier starts the plant channel. Returns false when not in a site.
    startPlant(atSite, who) {
      if (state !== 'carried' || !atSite) return false;
      state = 'planting';
      site = atSite;
      progress = 0;
      return true;
    },
    startDefuse(who) {
      if (state !== 'planted') return false;
      state = 'defusing';
      progress = 0;
      return true;
    },
    // Advance the active channel by dt. Returns 'planted' | 'defused' when it completes.
    channel(dt) {
      if (state === 'planting') {
        progress += dt / PLANT_TIME;
        if (progress >= 1) {
          state = 'planted';
          fuseLeft = FUSE_TIME;
          progress = 0;
          group.visible = true;
          group.position.set(site.center.x, 0.62, site.center.z);
          return 'planted';
        }
      } else if (state === 'defusing') {
        progress += dt / DEFUSE_TIME;
        if (progress >= 1) {
          state = 'defused';
          group.visible = false;
          light.intensity = 0;
          return 'defused';
        }
      }
      return null;
    },
    cancelChannel() {
      if (state === 'planting' || state === 'defusing') {
        state = state === 'planting' ? 'carried' : 'planted';
        progress = 0;
      }
    },
    drop() {
      // The carrier died before planting: a living attacker teammate picks it up.
      carrier = null;
    },
    setCarrier(who) {
      carrier = who;
    },
    step(dt) {
      if (state === 'planted' || state === 'defusing') {
        fuseLeft -= dt;
        beepTimer -= dt;
        const rate = fuseLeft < 10 ? 0.35 : fuseLeft < 20 ? 0.6 : 1.0;
        if (beepTimer <= 0) {
          beepTimer = rate;
          light.intensity = 14;
        } else {
          light.intensity = Math.max(0, light.intensity - dt * 30);
        }
        beeper.visible = light.intensity > 2;
        if (fuseLeft <= 0) {
          state = 'detonated';
          group.visible = false;
          light.intensity = 0;
          return 'detonated';
        }
      }
      return null;
    },
    reset(nextCarrier) {
      state = 'carried';
      progress = 0;
      fuseLeft = FUSE_TIME;
      site = null;
      carrier = nextCarrier;
      group.visible = false;
      light.intensity = 0;
    },
  };
}
