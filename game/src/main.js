// FERROLINE — a tactical three.js FPS. One player (Vanguard, attacker) plus two ally
// bots against four defender bots, on a rail-foundry yard with two bomb sites. Rounds
// are won by elimination, detonation, defuse, or the clock; first to 4 takes the match.
// The simulation runs at a fixed 60 Hz, apart from rendering, so a round plays the
// same on any machine. Shot mode (?shot=start|play|end|plant|buy|victory&seed=N)
// stages a deterministic scene for screenshots and sets window.__shotReady.
import * as THREE from 'three';
import { createWorld } from './world.js';
import { createPlayer } from './player.js';
import { createArsenal, damageFor, WEAPONS, GRENADE_PRICE, ARMOR_PRICE } from './weapons.js';
import { createEconomy } from './economy.js';
import { createBomb, FUSE_TIME } from './bomb.js';
import { createGrenades, GRENADE_THROW_SPEED } from './grenade.js';
import { createBots, lineOfSight } from './bots.js';
import { createRounds, BUY_TIME, ROUND_TIME, MAX_ROUNDS } from './rounds.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { createInput } from './input.js';
import { PALETTE } from './palette.js';

const params = new URLSearchParams(window.location.search);
const SHOT = params.get('shot');
const SEED = Number(params.get('seed') || 1);
const STEP = 1 / 60;

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.3;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#2a211a');
scene.fog = new THREE.Fog(new THREE.Color('#2a211a'), 34, 78);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 200);
scene.add(camera);

const world = createWorld(scene);
const player = createPlayer(world.colliders, world.spawns.attackers[1]);
const arsenal = createArsenal(camera);
const economy = createEconomy();
const bomb = createBomb(scene);
const grenades = createGrenades(scene, world.colliders);
const bots = createBots(scene, world, SEED);
const rounds = createRounds();
const audio = createAudio();
const hud = createHud();
const input = createInput(renderer.domElement);

// The squads. Callsigns are shown above each bot's head.
const BOT_DEFS = [
  { id: 'ally-1', callsign: 'MIRA', team: 'attacker', spawn: world.spawns.attackers[0], weaponId: 'smg' },
  { id: 'ally-2', callsign: 'DANTE', team: 'attacker', spawn: world.spawns.attackers[2], weaponId: 'rifle' },
  { id: 'def-1', callsign: 'VEX', team: 'defender', spawn: world.spawns.defenders[0], weaponId: 'rifle' },
  { id: 'def-2', callsign: 'ONYX', team: 'defender', spawn: world.spawns.defenders[1], weaponId: 'rifle' },
  { id: 'def-3', callsign: 'KILO', team: 'defender', spawn: world.spawns.defenders[2], weaponId: 'smg' },
  { id: 'def-4', callsign: 'SABLE', team: 'defender', spawn: world.spawns.defenders[3], weaponId: 'smg' },
];
bots.spawn(BOT_DEFS);

const raycaster = new THREE.Raycaster();
let lastFrameTime = performance.now();
let time = 0;
let running = false; // the match is live (pointer locked, not paused, not over)
let playerAlive = true;
let playerHealth = 100;
let playerKills = 0;
let carrierId = 'player'; // who carries the bomb: 'player' or a bot id
let roundEndTimer = 0; // pause between rounds
let matchEndShown = false;
let plantSoundTimer = 0;

bomb.setCarrier('player');

// Pooled tracers: thin glowing lines from muzzle to impact, fading in 70 ms.
const tracers = [];
for (let i = 0; i < 16; i++) {
  const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const material = new THREE.LineBasicMaterial({
    color: new THREE.Color(PALETTE.ember), transparent: true, opacity: 0,
  });
  const line = new THREE.Line(geometry, material);
  line.frustumCulled = false;
  scene.add(line);
  tracers.push({ line, life: 0 });
}
let tracerIndex = 0;
function spawnTracer(from, to) {
  const tracer = tracers[tracerIndex];
  tracerIndex = (tracerIndex + 1) % tracers.length;
  tracer.line.geometry.setFromPoints([from, to]);
  tracer.line.material.opacity = 0.85;
  tracer.life = 0.07;
}
function stepTracers(dt) {
  for (const tracer of tracers) {
    if (tracer.life <= 0) continue;
    tracer.life -= dt;
    tracer.line.material.opacity = Math.max(0, tracer.life / 0.07) * 0.85;
  }
}

function eyePosition() {
  return new THREE.Vector3(player.state.position.x, player.state.position.y + player.state.eye, player.state.position.z);
}
function cameraDirection() {
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  return dir;
}

function botMeshes() {
  const meshes = [];
  for (const bot of bots.bots) {
    if (!bot.alive) continue;
    bot.body.group.traverse((mesh) => {
      if (mesh.isMesh) meshes.push(mesh);
    });
  }
  return meshes;
}

// One hitscan shot. Returns the impact point (or null). Shooter is 'player' or a bot.
function shootRay(origin, direction, maxDist, shooter, baseDamage, weaponId) {
  raycaster.set(origin, direction);
  raycaster.far = maxDist;
  const targets = [...world.shootables, ...botMeshes()];
  const hits = raycaster.intersectObjects(targets, false);
  // The player's own body is not a target, but a bot shot can hit the player.
  let playerHit = null;
  if (shooter !== 'player') {
    const headBox = new THREE.Box3(
      new THREE.Vector3(player.state.position.x - 0.34, player.state.position.y + 1.45, player.state.position.z - 0.34),
      new THREE.Vector3(player.state.position.x + 0.34, player.state.position.y + 1.75, player.state.position.z + 0.34),
    );
    const bodyBox = new THREE.Box3(
      new THREE.Vector3(player.state.position.x - 0.34, player.state.position.y, player.state.position.z - 0.34),
      new THREE.Vector3(player.state.position.x + 0.34, player.state.position.y + 1.45, player.state.position.z + 0.34),
    );
    const headHit = raycaster.ray.intersectBox(headBox, new THREE.Vector3());
    const bodyHit = raycaster.ray.intersectBox(bodyBox, new THREE.Vector3());
    if (playerAlive && headHit) playerHit = { point: headHit, part: 'head', dist: headHit.distanceTo(origin) };
    else if (playerAlive && bodyHit) playerHit = { point: bodyHit, part: 'torso', dist: bodyHit.distanceTo(origin) };
  }
  const worldHit = hits[0] || null;
  const candidates = [];
  if (worldHit) candidates.push({ kind: 'world', point: worldHit.point, dist: worldHit.distance });
  if (playerHit) candidates.push({ kind: 'player', point: playerHit.point, dist: playerHit.dist, part: playerHit.part });
  candidates.sort((a, b) => a.dist - b.dist);
  const first = candidates[0];
  if (!first) {
    const end = origin.clone().addScaledVector(direction, maxDist);
    spawnTracer(origin, end);
    return end;
  }
  spawnTracer(origin, first.point);
  if (first.kind === 'world') {
    const bot = worldHit.object.userData.bot;
    if (bot && bot.alive) {
      const part = worldHit.object.userData.part || 'torso';
      const damage = damageFor(weaponId, part);
      damageBot(bot, damage, shooter, part);
      if (shooter === 'player') {
        hud.hitmarker(false);
        audio.hit();
      }
    }
    return first.point;
  }
  if (first.kind === 'player') {
    const damage = damageFor(weaponId, first.part);
    damagePlayer(damage, shooter);
    return first.point;
  }
  return first.point;
}

function damageBot(bot, damage, shooter, part) {
  bot.health -= damage;
  if (bot.health > 0) return;
  bot.health = 0;
  bot.alive = false;
  bot.body.group.visible = false;
  const shooterLabel = shooter === 'player' ? 'YOU' : shooter.callsign;
  hud.killfeedLine(`${shooterLabel} › ${bot.callsign} (${part === 'head' ? 'headshot' : 'KR-7'})`);
  if (shooter === 'player') {
    playerKills += 1;
    economy.addKill();
    hud.hitmarker(true);
    audio.kill();
  }
  // The bomb passes to a living attacker teammate.
  if (carrierId === bot.id) {
    const next = bots.bots.find((b) => b.alive && b.team === 'attacker' && b.isBot);
    carrierId = next ? next.id : 'player';
    bomb.setCarrier(carrierId);
  }
  checkRoundEnd();
}

function damagePlayer(damage, shooter) {
  if (!playerAlive) return;
  const taken = economy.absorb(damage);
  playerHealth -= taken;
  hud.damageFlash();
  audio.hurt();
  if (playerHealth > 0) return;
  playerHealth = 0;
  playerAlive = false;
  hud.killfeedLine(`${shooter.callsign || 'YOU'} › YOU`);
  hud.banner('YOU ARE DOWN', 'Your squad fights on — watch the round');
  input.exitLock();
  // The bomb passes to a living ally bot.
  if (carrierId === 'player') {
    const next = bots.bots.find((b) => b.alive && b.team === 'attacker' && b.isBot);
    if (next) {
      carrierId = next.id;
      bomb.setCarrier(carrierId);
    }
  }
  checkRoundEnd();
}

function checkRoundEnd() {
  if (rounds.phase() === 'over') return;
  const attackersAlive = (playerAlive ? 1 : 0) + bots.aliveCount('attacker');
  const defendersAlive = bots.aliveCount('defender');
  if (defendersAlive === 0) endRound('attacker', 'ELIMINATION — all defenders down');
  else if (attackersAlive === 0) endRound('defender', 'ELIMINATION — all attackers down');
}

function endRound(winner, reason) {
  if (rounds.phase() === 'over') return;
  const playerWon = winner === 'attacker';
  economy.endRound(playerWon);
  const matchWinner = rounds.endRound(winner, reason);
  hud.banner(playerWon ? 'ROUND WON' : 'ROUND LOST', reason);
  audio.roundEnd(playerWon);
  roundEndTimer = 3.5;
  if (matchWinner) {
    matchEndShown = true;
    const score = `${rounds.scoreAttacker()} — ${rounds.scoreDefender()}`;
    const won = matchWinner === 'attacker';
    hud.showOverlay(
      won ? 'VANGUARD WINS' : 'WARDENS WIN',
      `Match ${score}. ${won ? 'The foundry is yours.' : 'The foundry holds.'} Play again?`,
      'PLAY AGAIN',
      () => {
        hud.hideOverlay();
        resetMatch();
      },
    );
    input.exitLock();
  }
}

function resetRound() {
  player.respawn(world.spawns.attackers[1], -Math.PI / 2);
  playerHealth = 100;
  playerAlive = true;
  playerKills = 0;
  carrierId = 'player';
  bomb.reset('player');
  arsenal.refill();
  arsenal.select('pistol');
  bots.reset(BOT_DEFS);
  rounds.startBuy();
  hud.setRound(rounds.round(), MAX_ROUNDS);
  hud.setScore(rounds.scoreAttacker(), rounds.scoreDefender());
  hud.setBomb('BOMB: CARRIED', 0);
  hud.showBuy(false);
}

function resetMatch() {
  economy.resetMatch();
  rounds.resetMatch();
  matchEndShown = false;
  resetRound();
  hud.setMoney(economy.money());
  audio.roundStart();
}

function startLive() {
  rounds.startLive();
  hud.showBuy(false);
  hud.banner(`ROUND ${rounds.round()}`, 'Plant the bomb at A or B — or clear the site');
  audio.roundStart();
}

// --- Buy phase ---------------------------------------------------------------
function tryBuy(key) {
  if (rounds.phase() !== 'buy' || !playerAlive) return;
  const ownedCheck = key === '1' ? arsenal.has('rifle') : key === '2' ? arsenal.has('smg') : key === '4' ? economy.armor() > 0 : false;
  if (key === '3' && arsenal.state.grenades >= 2) {
    audio.denied();
    return;
  }
  if (ownedCheck) {
    audio.denied();
    return;
  }
  if (!economy.pay(key)) {
    audio.denied();
    return;
  }
  if (key === '1') {
    arsenal.give('rifle');
    arsenal.select('rifle');
  } else if (key === '2') {
    arsenal.give('smg');
    arsenal.select('smg');
  } else if (key === '3') {
    arsenal.giveGrenade();
  }
  audio.buy();
  hud.setMoney(economy.money());
}

// --- Bomb channels -----------------------------------------------------------
function stepBomb(dt) {
  const state = bomb.state();
  // Player planting.
  if (state === 'carried' && carrierId === 'player' && playerAlive && rounds.phase() === 'live') {
    const site = world.siteAt(player.state.position.x, player.state.position.z);
    if (site && input.keys.has('KeyE')) {
      if (bomb.startPlant(site, 'player')) {
        hud.setBomb(`PLANTING AT SITE ${site.id}…`, 0);
      }
    }
  }
  // Ally bot planting.
  if (state === 'carried' && carrierId !== 'player') {
    const carrier = bots.bots.find((b) => b.id === carrierId);
    if (carrier && carrier.alive && carrier.state === 'plant') {
      const site = world.siteAt(carrier.position.x, carrier.position.z);
      if (site && bomb.startPlant(site, carrier)) {
        hud.setBomb(`MIRA IS PLANTING AT SITE ${site.id}…`, 0);
      }
    }
  }
  // A defender defusing.
  if (state === 'planted' && rounds.phase() === 'live') {
    const site = bomb.site();
    const defuser = bots.bots.find((b) => b.alive && b.team === 'defender'
      && Math.hypot(b.position.x - site.center.x, b.position.z - site.center.z) < 2.4);
    if (defuser) {
      defuser.state = 'defuse';
      if (bomb.startDefuse(defuser)) {
        hud.setBomb('BOMB BEING DEFUSED!', 0);
        audio.defuseBeep();
      }
    }
  }
  // Advance the active channel.
  const current = bomb.state();
  if (current === 'planting' || current === 'defusing') {
    const stillValid = current === 'planting'
      ? (carrierId === 'player'
        ? playerAlive && input.keys.has('KeyE') && world.siteAt(player.state.position.x, player.state.position.z)
        : (() => {
          const carrier = bots.bots.find((b) => b.id === carrierId);
          return carrier && carrier.alive && world.siteAt(carrier.position.x, carrier.position.z);
        })())
      : (() => {
        const defuser = bots.bots.find((b) => b.alive && b.team === 'defender' && b.state === 'defuse');
        return Boolean(defuser);
      })();
    if (!stillValid) {
      bomb.cancelChannel();
      hud.setBomb(bomb.isPlanted() ? `BOMB PLANTED — ${Math.ceil(bomb.fuseLeft())}s` : 'BOMB: CARRIED', 0);
    } else {
      const result = bomb.channel(dt);
      hud.setBomb(
        current === 'planting' ? `PLANTING… ${Math.round(bomb.progress() * 100)}%` : `DEFUSING… ${Math.round(bomb.progress() * 100)}%`,
        bomb.progress(),
      );
      if (result === 'planted') {
        economy.addPlant();
        rounds.startFuse(FUSE_TIME);
        hud.setBomb(`BOMB PLANTED — ${FUSE_TIME}s`, 1);
        hud.banner('BOMB PLANTED', 'Defend it until it blows — 35 seconds');
        audio.plantBeep();
        bots.hearShot(bomb.site().center.x, bomb.site().center.z, 'attacker', time);
        // Defenders break their holds and converge on the site.
        for (const bot of bots.bots) {
          if (bot.alive && bot.team === 'defender') {
            bot.state = 'advance';
            bot.path = [];
            bot.pathIndex = 0;
            bot.holdTimer = 0;
          }
        }
      } else if (result === 'defused') {
        endRound('defender', 'BOMB DEFUSED');
      }
    }
  }
  const boom = bomb.step(dt);
  if (boom === 'detonated') {
    const site = bomb.site();
    audio.explosion();
    hud.setBomb('BOMB DETONATED', 0);
    endRound('attacker', 'BOMB DETONATED — site destroyed');
  }
  if (bomb.isPlanted()) {
    hud.setBomb(`BOMB PLANTED — ${Math.ceil(bomb.fuseLeft())}s`, bomb.fuseLeft() / FUSE_TIME);
    plantSoundTimer -= dt;
    if (plantSoundTimer <= 0) {
      plantSoundTimer = 1;
      audio.plantBeep();
    }
  }
}

// --- Grenade damage ----------------------------------------------------------
function grenadeDamage(center, radius, maxDamage) {
  const targets = [];
  if (playerAlive) {
    targets.push({
      kind: 'player',
      chest: new THREE.Vector3(player.state.position.x, player.state.position.y + 1.2, player.state.position.z),
      pos: player.state.position,
    });
  }
  for (const bot of bots.bots) {
    if (!bot.alive) continue;
    targets.push({
      kind: 'bot', bot,
      chest: new THREE.Vector3(bot.position.x, bot.position.y + 1.2, bot.position.z),
      pos: bot.position,
    });
  }
  for (const target of targets) {
    const dist = target.pos.distanceTo(center);
    if (dist > radius) continue;
    if (!lineOfSight(raycaster, world.shootables, center.clone().add(new THREE.Vector3(0, 0.2, 0)), target.chest)) continue;
    const damage = Math.round(maxDamage * (1 - (dist / radius) * 0.6));
    if (target.kind === 'player') damagePlayer(damage, { callsign: 'GRENADE' });
    else damageBot(target.bot, damage, 'player', 'torso');
  }
}

// --- Fixed-step simulation ---------------------------------------------------
function step(dt) {
  time += dt;
  const phase = rounds.phase();

  if (phase === 'over') {
    roundEndTimer -= dt;
    if (roundEndTimer <= 0 && !matchEndShown) {
      resetRound();
    }
    // Bots stand still between rounds; the world still renders.
    stepTracers(dt);
    return;
  }

  // Mouse look.
  const { dx, dy } = input.consumeMouse();
  if (playerAlive && running) player.look(dx, dy);

  // Movement (only while alive and the round is running).
  if (playerAlive && phase !== 'buy') player.step(dt, input.keys);
  else if (phase === 'buy') player.step(dt, new Set()); // frozen during buy

  // Camera follows the player's eye.
  camera.position.set(player.state.position.x, player.state.position.y + player.state.eye, player.state.position.z);
  camera.rotation.set(player.state.pitch, player.state.yaw, 0, 'YXZ');

  // Weapon keys and firing.
  if (playerAlive && running) {
    if (input.wasPressed('Digit1')) arsenal.select('pistol');
    if (input.wasPressed('Digit2') && arsenal.has('rifle')) arsenal.select('rifle');
    if (input.wasPressed('Digit3') && arsenal.has('smg')) arsenal.select('smg');
    if (input.wasPressed('KeyR')) {
      arsenal.reload();
      audio.reload();
    }
    if (input.wasPressed('KeyG') && arsenal.state.grenades > 0) {
      const origin = eyePosition().addScaledVector(cameraDirection(), 0.5);
      if (arsenal.takeGrenade() && grenades.throwGrenade(origin, cameraDirection())) {
        audio.shot('smg');
      }
    }
    if (phase === 'live') {
      const def = arsenal.current();
      const wantFire = def.auto ? input.firing : input.firing && input.wasPressed('Mouse0');
      if (wantFire && arsenal.ready()) {
        if (arsenal.takeRound()) {
          arsenal.pullTrigger();
          const spread = arsenal.spread(player.groundSpeed());
          const dir = cameraDirection();
          dir.x += (Math.random() - 0.5) * 2 * spread;
          dir.y += (Math.random() - 0.5) * 2 * spread;
          dir.z += (Math.random() - 0.5) * 2 * spread;
          dir.normalize();
          const origin = eyePosition();
          shootRay(origin, dir, 120, 'player', damageFor(def.id, 'torso'), def.id);
          player.recoil(def.kick, (Math.random() - 0.5) * def.kick * 0.4);
          audio.shot(def.id);
          bots.hearShot(player.state.position.x, player.state.position.z, 'attacker', time);
        } else {
          arsenal.reload();
          audio.reload();
        }
      }
      if (arsenal.state.mag === 0 && arsenal.state.reserve > 0 && arsenal.state.reloadLeft === 0) {
        arsenal.reload();
        audio.reload();
      }
    }
  }
  if (input.wasPressed('KeyB') && phase === 'buy') {
    hud.showBuy(true);
  }
  if (phase === 'buy' && input.keys.has('KeyB')) {
    for (const key of ['1', '2', '3', '4']) {
      if (input.wasPressed(`Digit${key}`)) tryBuy(key);
    }
  }

  arsenal.step(dt);
  grenades.step(dt, grenadeDamage);

  // Bots.
  bots.step(dt, {
    player: player.state,
    playerAlive,
    plantSite: bomb.site(),
    bombState: bomb.state(),
    carrierId,
    sites: world.sites,
    time,
    onShot: (bot, origin, dir, damage) => {
      shootRay(origin, dir, 120, bot, damage, bot.weaponId);
      audio.distantShot();
      bots.hearShot(bot.position.x, bot.position.z, bot.team, time);
    },
  });

  // Bomb and round clock.
  stepBomb(dt);
  if (phase === 'buy') {
    const timeout = rounds.step(dt);
    if (timeout === 'timeout') startLive();
  } else if (phase === 'live') {
    if (!bomb.isPlanted()) {
      const timeout = rounds.step(dt);
      if (timeout === 'timeout') endRound('defender', 'TIME EXPIRED — bomb never planted');
    } else {
      rounds.step(dt); // the fuse is the clock now; detonation ends the round
    }
  }

  // HUD.
  hud.setHealth(playerHealth, economy.armor());
  hud.setAmmo(arsenal.state.mag, arsenal.state.reserve, arsenal.state.reloadLeft > 0);
  hud.setWeapon(arsenal.current().name);
  hud.setGrenades(arsenal.state.grenades);
  hud.setMoney(economy.money());
  hud.setTimer(bomb.isPlanted() ? bomb.fuseLeft() : rounds.timer(), rounds.timer() < 10 || bomb.fuseLeft() < 10);
  hud.setRound(rounds.round(), MAX_ROUNDS);
  hud.setScore(rounds.scoreAttacker(), rounds.scoreDefender());
  hud.setCrosshairSpread(6 + arsenal.spread(player.groundSpeed()) * 900);
  hud.setBuyAffordability(economy.money(), {
    1: WEAPONS.rifle.price, 2: WEAPONS.smg.price, 3: GRENADE_PRICE, 4: ARMOR_PRICE,
  });
  stepTracers(dt);
  input.clearPressed();
}

// --- Render loop -------------------------------------------------------------
let accumulator = 0;
let renders = 0;
let shotSteps = 0;
let shotHud = null; // staged HUD values for a screenshot scene, re-applied after settling
function frame() {
  requestAnimationFrame(frame);
  const now = performance.now();
  const dt = Math.min((now - lastFrameTime) / 1000, 0.1);
  lastFrameTime = now;
  if (running) {
    accumulator += dt;
    while (accumulator >= STEP) {
      step(STEP);
      accumulator -= STEP;
    }
  } else if (SHOT && shotSteps < 6) {
    // A staged shot settles for a few fixed steps, then freezes: the screenshot
    // must show the staged scene, not a match playing itself out.
    step(STEP);
    shotSteps += 1;
    if (shotSteps === 6 && shotHud) shotHud(); // re-apply the staged HUD values
  }
  renderer.render(scene, camera);
  renders += 1;
  if (SHOT && renders >= 2 && !window.__shotReady) {
    window.__shotReady = true;
  }
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Flow: start, pause, resume ----------------------------------------------
function startMatch() {
  audio.resume();
  hud.hideOverlay();
  input.requestLock();
  running = true;
}

input.onLockChange = (locked) => {
  if (!locked && running && !SHOT && !matchEndShown && playerAlive && rounds.phase() !== 'over') {
    running = false;
    hud.showOverlay(
      'PAUSED',
      'Click resume to keep playing. Buy with B, plant with E, grenade with G.',
      'RESUME',
      startMatch,
    );
  }
  if (locked && !running && !SHOT && !matchEndShown) {
    running = true;
    hud.hideOverlay();
  }
};

if (SHOT) {
  // Deterministic staged scenes for screenshots. Each branch stages the world and
  // records the HUD it should show; the HUD is applied now and again after the
  // settle steps, because the simulation overwrites it while settling.
  running = true;
  audio.resume = () => {};
  const shotBot = (id, x, z, yaw) => {
    const bot = bots.bots.find((b) => b.id === id);
    if (!bot) return;
    bot.position.set(x, 0, z);
    bot.yaw = yaw;
    bot.body.group.position.copy(bot.position);
    bot.body.group.rotation.y = yaw;
  };
  if (SHOT === 'start') {
    player.respawn(world.spawns.attackers[1], -Math.PI / 2);
    camera.position.set(player.state.position.x, player.state.eye, player.state.position.z);
    camera.rotation.set(0, -Math.PI / 2, 0, 'YXZ');
    shotHud = () => {
      hud.setRound(1, MAX_ROUNDS);
      hud.setScore(0, 0);
      hud.setMoney(800);
      hud.banner('ROUND 1', 'Plant the bomb at A or B — or clear the site');
    };
    shotHud();
  } else if (SHOT === 'play') {
    rounds.startLive();
    // North lane firefight: the player pushes east down the lane, two defenders are
    // in the open ahead, an ally follows behind.
    player.respawn([-10, -11], -Math.PI / 2);
    shotBot('def-1', 0, -11, Math.PI / 2);
    shotBot('def-3', 6, -11, Math.PI / 2);
    shotBot('ally-1', -13, -8.5, -Math.PI / 2);
    camera.position.set(-10, 1.6, -11);
    camera.rotation.set(-0.04, -Math.PI / 2, 0, 'YXZ');
    shotHud = () => {
      hud.setRound(1, MAX_ROUNDS);
      hud.setScore(0, 0);
      hud.setMoney(1100);
      hud.setAmmo(30, 90, false);
      hud.setWeapon('KR-7 Carbine');
    };
    shotHud();
    arsenal.give('rifle');
    arsenal.select('rifle');
  } else if (SHOT === 'end') {
    rounds.startLive();
    player.respawn([12, -8], -Math.PI / 2 - 0.5);
    shotBot('ally-2', 15, -9, -Math.PI / 2);
    camera.position.set(12, 1.6, -8);
    camera.rotation.set(-0.05, -Math.PI / 2 - 0.5, 0, 'YXZ');
    shotHud = () => {
      hud.setRound(1, MAX_ROUNDS);
      hud.setScore(1, 0);
      hud.setMoney(4350);
      hud.banner('ROUND WON', 'ELIMINATION — all defenders down');
    };
    shotHud();
  } else if (SHOT === 'plant') {
    rounds.startLive();
    bomb.reset('player');
    bomb.startPlant(world.sites[0], 'player');
    bomb.channel(3.5);
    rounds.startFuse(FUSE_TIME);
    player.respawn([11, -8], -Math.PI / 2 - 0.9);
    shotBot('def-2', 18, -6, Math.PI / 2);
    camera.position.set(11, 1.6, -8);
    camera.rotation.set(-0.08, -Math.PI / 2 - 0.9, 0, 'YXZ');
    shotHud = () => {
      hud.setRound(2, MAX_ROUNDS);
      hud.setScore(1, 0);
      hud.setMoney(1100);
      hud.setBomb(`BOMB PLANTED — ${FUSE_TIME}s`, 1);
      hud.banner('BOMB PLANTED', 'Defend it until it blows — 35 seconds');
    };
    shotHud();
  } else if (SHOT === 'buy') {
    player.respawn(world.spawns.attackers[1], -Math.PI / 2);
    camera.position.set(player.state.position.x, player.state.eye, player.state.position.z);
    camera.rotation.set(0, -Math.PI / 2, 0, 'YXZ');
    shotHud = () => {
      hud.setRound(2, MAX_ROUNDS);
      hud.setScore(1, 0);
      hud.setMoney(4350);
      hud.showBuy(true);
    };
    shotHud();
  } else if (SHOT === 'victory') {
    player.respawn([14, -11], -Math.PI / 2);
    camera.position.set(14, 1.6, -11);
    camera.rotation.set(-0.05, -Math.PI / 2, 0, 'YXZ');
    shotHud = () => {
      hud.setRound(7, MAX_ROUNDS);
      hud.setScore(4, 2);
    };
    shotHud();
    hud.showOverlay('VANGUARD WINS', 'Match 4 — 2. The foundry is yours.', 'PLAY AGAIN', () => {});
  }
  hud.setHealth(100, 0);
  hud.setPhase(rounds.phase());
  // Freeze the staged scene: render twice, then stop stepping.
  frame();
  running = false;
} else {
  hud.showOverlay(
    'FERROLINE',
    'Vanguard vs Wardens — first to 4 rounds. Plant the bomb at A or B, or clear the site. WASD move, mouse aim, click fire, R reload, E plant, G grenade, B buy menu.',
    'CLICK TO PLAY',
    startMatch,
  );
  resetRound();
  frame();
}
