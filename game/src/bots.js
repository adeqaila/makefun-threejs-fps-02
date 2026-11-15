// The bots: six of them, two allies and four defenders. Each bot walks the waypoint
// graph (BFS to a target node), holds a position, or fights, and it reacts to what it
// can see and hear. A bot only shoots when it has line of sight, and its aim gets
// worse with distance and with the target moving — the same fairness rules that make
// a human duel readable. Ally bots follow the player loosely; defenders guard lanes
// and sites, and one of them plants the bomb if the player falls.
import * as THREE from 'three';
import { moveBody } from './player.js';
import { damageFor } from './weapons.js';

const BOT_RADIUS = 0.34;
const BOT_HEIGHT = 1.7;
const BOT_EYE = 1.55;
const BOT_SPEED = 3.6;
const BOT_HEALTH = 100;

function mulberry32(seed) {
  let state = seed >>> 0;
  return function () {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function nearestNode(nodes, x, z) {
  let best = null;
  let bestD = Infinity;
  for (const [name, [nx, nz]] of Object.entries(nodes)) {
    const d = (nx - x) ** 2 + (nz - z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = name;
    }
  }
  return best;
}

function bfs(adjacency, from, to) {
  if (from === to) return [from];
  const prev = { [from]: null };
  const queue = [from];
  while (queue.length) {
    const current = queue.shift();
    for (const next of adjacency[current] || []) {
      if (prev[next] === undefined) {
        prev[next] = current;
        if (next === to) {
          const path = [to];
          let at = to;
          while (prev[at]) {
            at = prev[at];
            path.unshift(at);
          }
          return path;
        }
        queue.push(next);
      }
    }
  }
  return [from];
}

// A ray from `from` to `to` is clear when no world mesh is in between. Shared by
// bots (sight) and grenades (blast) through the callback in main.js.
export function lineOfSight(raycaster, shootables, from, to) {
  const dir = new THREE.Vector3().subVectors(to, from);
  const dist = dir.length();
  if (dist < 0.01) return true;
  raycaster.set(from, dir.normalize());
  raycaster.far = dist;
  const hits = raycaster.intersectObjects(shootables, false);
  return hits.length === 0;
}

export function createBots(scene, world, rngSeed = 7) {
  const rng = mulberry32(rngSeed);
  const raycaster = new THREE.Raycaster();
  const bots = [];

  function buildBody(team, callsign) {
    const group = new THREE.Group();
    const torsoMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(team === 'attacker' ? '#e07830' : '#3fa7a0'),
      roughness: 0.8, metalness: 0.1,
    });
    const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#221c16'), roughness: 0.9 });
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.72, 0.3), darkMat);
    legs.position.y = 0.36;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.6, 0.34), torsoMat);
    torso.position.y = 1.02;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.MeshStandardMaterial({ color: new THREE.Color('#c9a37e'), roughness: 0.8 }));
    head.position.y = 1.56;
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 0.05), new THREE.MeshStandardMaterial({ color: new THREE.Color('#14161a'), roughness: 0.3, metalness: 0.6 }));
    visor.position.set(0, 1.58, 0.16);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.62), darkMat);
    gun.position.set(0.2, 1.15, -0.3);
    group.add(legs, torso, head, visor, gun);
    group.traverse((mesh) => {
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.userData.bot = null; // filled below
        mesh.userData.part = mesh === head ? 'head' : 'torso';
      }
    });
    // A floating callsign above the head, drawn on a canvas at runtime. A sprite
    // always faces the camera, so no per-frame orientation math is needed.
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(23,19,16,0.72)';
    ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = team === 'attacker' ? '#ff9a3d' : '#3fa7a0';
    ctx.font = 'bold 34px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(callsign, 128, 34);
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false,
    }));
    tag.scale.set(1.5, 0.38, 1);
    tag.position.y = 2.05;
    group.add(tag);
    scene.add(group);
    return { group, tag, torso, head };
  }

  function spawnBot(def) {
    const body = buildBody(def.team, def.callsign);
    const bot = {
      id: def.id,
      callsign: def.callsign,
      team: def.team,
      isBot: true,
      position: new THREE.Vector3(def.spawn[0], 0, def.spawn[1]),
      velocity: new THREE.Vector3(),
      yaw: def.team === 'attacker' ? -Math.PI / 2 : Math.PI / 2,
      health: BOT_HEALTH,
      alive: true,
      state: 'advance', // advance | hold | engage | plant | defuse | retreat
      weaponId: def.weaponId || 'rifle',
      targetNode: null,
      path: [],
      pathIndex: 0,
      thinkTimer: rng() * 0.4,
      shootTimer: 0,
      burstLeft: 0,
      burstPause: 0,
      holdTimer: 0,
      target: null,
      lastKnown: new THREE.Vector3(),
      hasLastKnown: false,
      hearing: null,
      body,
      site: def.site || null,
      respawnPoint: def.spawn,
    };
    body.group.traverse((mesh) => {
      if (mesh.isMesh) mesh.userData.bot = bot;
    });
    body.group.position.copy(bot.position);
    bots.push(bot);
    return bot;
  }

  function resetBot(bot, spawnPoint) {
    bot.position.set(spawnPoint[0], 0, spawnPoint[1]);
    bot.velocity.set(0, 0, 0);
    bot.health = BOT_HEALTH;
    bot.alive = true;
    bot.state = 'advance';
    bot.path = [];
    bot.pathIndex = 0;
    bot.target = null;
    bot.hasLastKnown = false;
    bot.hearing = null;
    bot.burstLeft = 0;
    bot.burstPause = 0;
    bot.body.group.visible = true;
    bot.body.group.position.copy(bot.position);
  }

  function setGoal(bot, nodeName) {
    const from = nearestNode(world.nodes, bot.position.x, bot.position.z);
    bot.path = bfs(world.adjacency, from, nodeName);
    bot.pathIndex = 0;
    bot.targetNode = nodeName;
  }

  function canSee(bot, targetPos) {
    const eye = new THREE.Vector3(bot.position.x, BOT_EYE, bot.position.z);
    return lineOfSight(raycaster, world.shootables, eye, targetPos);
  }

  // Pick a goal node for a bot that is not fighting. Attackers push toward a site;
  // defenders walk to a hold point near their site or a lane.
  function chooseGoal(bot, context) {
    const { sites, playerAlive } = context;
    if (bot.team === 'attacker') {
      const site = bot.site || (rng() < 0.5 ? sites[0] : sites[1]);
      bot.site = site;
      const pick = rng();
      const node = pick < 0.45 ? (site.id === 'A' ? 'aSite' : 'bSite')
        : pick < 0.7 ? (site.id === 'A' ? 'n4' : 's4')
        : (site.id === 'A' ? 'a2' : 'b2');
      setGoal(bot, node);
    } else {
      // When the bomb is planted, defenders converge on that site instead of
      // wandering to a random hold point.
      const site = (context.plantSite && (context.bombState === 'planted' || context.bombState === 'defusing'))
        ? context.plantSite
        : (bot.site || (rng() < 0.5 ? sites[0] : sites[1]));
      bot.site = site;
      const pick = rng();
      const node = pick < 0.4 ? (site.id === 'A' ? 'a1' : 'b1')
        : pick < 0.65 ? (site.id === 'A' ? 'a3' : 'b3')
        : pick < 0.85 ? (site.id === 'A' ? 'h1' : 'h2')
        : (site.id === 'A' ? 'e1' : 'e2');
      setGoal(bot, node);
      bot.state = 'hold';
      bot.holdTimer = 3 + rng() * 4;
    }
  }

  // Hearing: a recent gunshot nearby pulls the bot toward it for a moment.
  // Returns true when the bot turned toward the sound.
  function reactToSound(bot, context) {
    if (!bot.hearing || context.time - bot.hearing.time >= 2.5) return false;
    if (bot.state === 'plant' || bot.state === 'defuse') return false;
    setGoal(bot, nearestNode(world.nodes, bot.hearing.x, bot.hearing.z));
    bot.hearing = null;
    bot.state = 'advance';
    return true;
  }

  // Hold a position until the hold timer runs out, then advance to a new goal.
  function holdPosition(bot, dt, context) {
    bot.holdTimer -= dt;
    if (bot.holdTimer <= 0) {
      bot.state = 'advance';
      chooseGoal(bot, context);
    }
    bot.velocity.set(0, 0, 0);
  }

  // Walk the waypoint path (BFS route from setGoal). When the route ends, pick
  // a new goal; the bomb carrier walks to a site and plants instead. Returns
  // the point the bot should look at while walking, or null.
  function followRoute(bot, dt, context) {
    if (!bot.path.length || bot.pathIndex >= bot.path.length) {
      if (bot.team === 'attacker' && context.bombState === 'carried' && bot.id === context.carrierId) {
        bot.state = 'plant';
      } else {
        chooseGoal(bot, context);
      }
    }
    const nodeName = bot.path[bot.pathIndex];
    if (!nodeName) return null;
    const [nx, nz] = world.nodes[nodeName];
    const dx = nx - bot.position.x;
    const dz = nz - bot.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.6) {
      bot.pathIndex += 1;
      return null;
    }
    bot.velocity.x = (dx / dist) * BOT_SPEED;
    bot.velocity.z = (dz / dist) * BOT_SPEED;
    return new THREE.Vector3(nx, BOT_EYE, nz);
  }

  function stepBot(bot, dt, context) {
    if (!bot.alive) return;
    const { player, playerAlive, plantSite, bombState, onShot, time } = context;
    bot.thinkTimer -= dt;
    bot.shootTimer -= dt;
    bot.burstPause -= dt;

    // Where does this bot look? At its target when fighting, at its walk direction
    // otherwise, at the plant site when the bomb is planted.
    let lookTarget = null;
    let enemyPos = null;
    if (playerAlive && player.alive) {
      const playerEye = new THREE.Vector3(player.position.x, player.position.y + player.eye, player.position.z);
      if (bot.position.distanceTo(player.position) < 34 && canSee(bot, playerEye)) {
        enemyPos = playerEye;
        bot.target = 'player';
        bot.lastKnown.copy(player.position);
        bot.hasLastKnown = true;
      }
    }
    if (!enemyPos) {
      // Another visible bot on the other team is also a target.
      for (const other of bots) {
        if (other === bot || !other.alive || other.team === bot.team) continue;
        const otherEye = new THREE.Vector3(other.position.x, other.position.y + 1.4, other.position.z);
        if (bot.position.distanceTo(other.position) < 30 && canSee(bot, otherEye)) {
          enemyPos = otherEye;
          bot.target = other;
          bot.lastKnown.copy(other.position);
          bot.hasLastKnown = true;
          break;
        }
      }
    }
    if (enemyPos) {
      bot.state = 'engage';
      lookTarget = enemyPos;
    } else if (bot.state === 'engage') {
      // Lost sight: walk to the last known position, then resume the plan.
      bot.state = 'advance';
      bot.target = null;
      if (bot.hasLastKnown) {
        setGoal(bot, nearestNode(world.nodes, bot.lastKnown.x, bot.lastKnown.z));
        bot.hasLastKnown = false;
      }
    }

    if (!enemyPos) reactToSound(bot, context);

    // Planting / defusing channels are decided by main.js; here the bot only walks
    // to the right place and waits.
    if (bot.state === 'plant' || bot.state === 'defuse') {
      bot.velocity.set(0, 0, 0);
    } else if (bot.state === 'hold') {
      holdPosition(bot, dt, context);
    } else if (bot.state === 'engage') {
      // Strafe a little while shooting so the fight is not a statue contest.
      const strafe = Math.sin(time * 1.7 + bot.id.charCodeAt(0)) * 0.7;
      const dx = enemyPos.x - bot.position.x;
      const dz = enemyPos.z - bot.position.z;
      const len = Math.hypot(dx, dz) || 1;
      const px = -dz / len;
      const pz = dx / len;
      bot.velocity.x = px * strafe * BOT_SPEED * 0.5;
      bot.velocity.z = pz * strafe * BOT_SPEED * 0.5;
    } else {
      const routeLook = followRoute(bot, dt, context);
      if (routeLook) lookTarget = routeLook;
    }

    // Turn toward the look target, capped so bots do not snap instantly.
    if (lookTarget) {
      const wantYaw = Math.atan2(-(lookTarget.x - bot.position.x), -(lookTarget.z - bot.position.z));
      let diff = wantYaw - bot.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      bot.yaw += Math.max(-3.4 * dt, Math.min(3.4 * dt, diff));
    }

    // Move and collide.
    moveBody(world.colliders, bot.position, bot.velocity, BOT_HEIGHT, dt);
    bot.velocity.y -= 20 * dt;
    bot.body.group.position.copy(bot.position);
    bot.body.group.rotation.y = bot.yaw;

    // Shooting: bursts of 3–5 with a pause, inaccuracy grows with distance and with
    // a moving target. Each shot is a real hitscan through onShot.
    if (enemyPos && bot.shootTimer <= 0 && bot.burstPause <= 0) {
      if (bot.burstLeft <= 0) {
        bot.burstLeft = 3 + Math.floor(rng() * 3);
        bot.burstPause = 0.35 + rng() * 0.5;
      }
      const dist = bot.position.distanceTo(new THREE.Vector3(enemyPos.x, bot.position.y, enemyPos.z));
      const targetSpeed = bot.target === 'player' ? Math.hypot(player.velocity.x, player.velocity.z) : 2;
      const spread = 0.02 + dist * 0.0022 + Math.min(1, targetSpeed / 5) * 0.03;
      const dir = new THREE.Vector3(enemyPos.x - bot.position.x, enemyPos.y - BOT_EYE, enemyPos.z - bot.position.z).normalize();
      dir.x += (rng() - 0.5) * 2 * spread;
      dir.y += (rng() - 0.5) * 2 * spread;
      dir.z += (rng() - 0.5) * 2 * spread;
      dir.normalize();
      const origin = new THREE.Vector3(bot.position.x, BOT_EYE, bot.position.z);
      onShot(bot, origin, dir, damageFor(bot.weaponId, 'torso'));
      bot.burstLeft -= 1;
      bot.shootTimer = bot.weaponId === 'smg' ? 0.09 : 0.13;
      if (bot.burstLeft <= 0) bot.burstPause = 0.6 + rng() * 0.7;
    }
  }

  return {
    bots,
    spawn(defs) {
      bots.length = 0;
      for (const def of defs) spawnBot(def);
    },
    reset(defs) {
      for (const bot of bots) {
        const def = defs.find((d) => d.id === bot.id);
        if (def) resetBot(bot, def.spawn);
      }
    },
    step(dt, context) {
      for (const bot of bots) stepBot(bot, dt, context);
    },
    hearShot(x, z, team, time) {
      for (const bot of bots) {
        if (!bot.alive || bot.team === team) continue;
        if (bot.position.distanceTo(new THREE.Vector3(x, 0, z)) < 26) {
          bot.hearing = { x, z, time };
        }
      }
    },
    aliveCount(team) {
      return bots.filter((b) => b.alive && b.team === team).length;
    },
  };
}
