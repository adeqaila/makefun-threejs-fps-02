// The frag grenade: thrown in an arc, bounces once or twice off walls and floor, then
// detonates after 1.6 s. Damage falls off with distance and a wall between the blast
// and a body blocks it — the same line-of-sight rule as bullets. Visuals are pooled:
// four grenade meshes and four explosion flashes, reused every round.
import * as THREE from 'three';

export const GRENADE_FUSE = 1.6;
export const GRENADE_RADIUS = 6;
export const GRENADE_DAMAGE = 110;
export const GRENADE_THROW_SPEED = 13;

export function createGrenades(scene, colliders) {
  const grenades = [];
  for (let i = 0; i < 4; i++) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 10, 10),
      new THREE.MeshStandardMaterial({ color: new THREE.Color('#3a2f22'), roughness: 0.6, metalness: 0.4 }),
    );
    mesh.visible = false;
    scene.add(mesh);
    grenades.push({ mesh, position: new THREE.Vector3(), velocity: new THREE.Vector3(), fuse: 0, active: false });
  }
  const flashes = [];
  for (let i = 0; i < 4; i++) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 16, 16),
      new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff9a3d'), transparent: true, opacity: 0, depthWrite: false }),
    );
    mesh.visible = false;
    scene.add(mesh);
    const light = new THREE.PointLight(new THREE.Color('#ff9a3d'), 0, 12);
    scene.add(light);
    flashes.push({ mesh, light, age: 0, active: false });
  }
  let flashIndex = 0;

  function explode(center, onDamage) {
    const flash = flashes[flashIndex];
    flashIndex = (flashIndex + 1) % flashes.length;
    flash.mesh.position.copy(center);
    flash.light.position.copy(center);
    flash.age = 0;
    flash.active = true;
    flash.mesh.visible = true;
    flash.mesh.scale.setScalar(0.4);
    flash.mesh.material.opacity = 0.85;
    flash.light.intensity = 60;
    if (onDamage) onDamage(center, GRENADE_RADIUS, GRENADE_DAMAGE);
  }

  const probe = new THREE.Box3();
  function step(dt, onDamage) {
    for (const g of grenades) {
      if (!g.active) continue;
      g.fuse -= dt;
      g.velocity.y -= 20 * dt;
      g.position.addScaledVector(g.velocity, dt);
      // Cheap bounce: test the next position against colliders on each axis.
      probe.min.set(g.position.x - 0.11, g.position.y - 0.11, g.position.z - 0.11);
      probe.max.set(g.position.x + 0.11, g.position.y + 0.11, g.position.z + 0.11);
      for (const collider of colliders) {
        if (!probe.intersectsBox(collider)) continue;
        if (Math.abs(g.velocity.x) > 1 && (g.position.x < collider.min.x || g.position.x > collider.max.x)) {
          g.velocity.x *= -0.45;
          g.position.x = g.position.x < collider.min.x ? collider.min.x - 0.12 : collider.max.x + 0.12;
        } else if (Math.abs(g.velocity.z) > 1 && (g.position.z < collider.min.z || g.position.z > collider.max.z)) {
          g.velocity.z *= -0.45;
          g.position.z = g.position.z < collider.min.z ? collider.min.z - 0.12 : collider.max.z + 0.12;
        } else if (g.velocity.y !== 0) {
          g.velocity.y = Math.abs(g.velocity.y) > 1.5 ? -g.velocity.y * 0.45 : 0;
          g.position.y = Math.max(g.position.y, collider.max.y + 0.12);
        }
      }
      if (g.position.y < 0.11) {
        g.position.y = 0.11;
        g.velocity.y = Math.abs(g.velocity.y) > 1.5 ? -g.velocity.y * 0.45 : 0;
        g.velocity.x *= 0.8;
        g.velocity.z *= 0.8;
      }
      g.mesh.position.copy(g.position);
      if (g.fuse <= 0) {
        g.active = false;
        g.mesh.visible = false;
        explode(g.position, onDamage);
      }
    }
    for (const flash of flashes) {
      if (!flash.active) continue;
      flash.age += dt;
      const t = flash.age / 0.45;
      if (t >= 1) {
        flash.active = false;
        flash.mesh.visible = false;
        flash.light.intensity = 0;
        continue;
      }
      flash.mesh.scale.setScalar(0.4 + t * 5.5);
      flash.mesh.material.opacity = 0.85 * (1 - t);
      flash.light.intensity = 60 * (1 - t);
    }
  }

  return {
    step,
    throwGrenade(origin, direction) {
      const g = grenades.find((item) => !item.active);
      if (!g) return false;
      g.active = true;
      g.fuse = GRENADE_FUSE;
      g.position.copy(origin);
      g.velocity.copy(direction).multiplyScalar(GRENADE_THROW_SPEED);
      g.velocity.y += 3.5;
      g.mesh.visible = true;
      g.mesh.position.copy(origin);
      return true;
    },
  };
}
