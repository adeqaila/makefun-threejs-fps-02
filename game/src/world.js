// The map: FERROLINE's derelict rail foundry yard. A 46 x 32 m yard, open to a dusk
// sky, with two bomb sites (A Furnace north-east, B Depot south-east) and three lanes
// between the attacker spawn in the west and the defender spawn in the east. Every box
// is a collider for movement and a surface a bullet stops on. Waypoints are the graph
// the bots walk: lanes, site approaches and hold points, nothing more.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ember' ? 0.5 : 0.92,
      metalness: name === 'surface' || name === 'hairline' ? 0.25 : 0.03,
    });
  }

  const colliders = [];
  const shootables = [];

  // box(): a solid box. solid=false makes a visual-only prop (no collision, no bullet stop).
  function box(width, height, depth, x, y, z, material, solid = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (solid) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
    }
    return mesh;
  }

  // Ground and outer walls (5 m high, open sky above).
  box(46.4, 0.4, 32.4, 0, -0.2, 0, 'surface');
  box(0.4, 5.0, 32.4, -23.2, 2.5, 0, 'surface');
  box(0.4, 5.0, 32.4, 23.2, 2.5, 0, 'surface');
  box(46.4, 5.0, 0.4, 0, 2.5, -16.2, 'surface');
  box(46.4, 5.0, 0.4, 0, 2.5, 16.2, 'surface');

  // The furnace hall: the mid block. Two gaps (north and south of it) are the mid lane.
  box(6.0, 3.4, 4.0, 0, 1.7, 0, 'surface');
  box(6.4, 0.5, 4.4, 0, 3.65, 0, 'hairline');
  // Chimney stack on the hall, a landmark seen from spawn.
  box(1.6, 7.0, 1.6, 0, 3.5, 0, 'hairline');
  box(2.2, 0.5, 2.2, 0, 7.2, 0, 'accent');

  // North lane cover: a long wall with a gap, crates to crouch behind.
  box(8.0, 3.0, 0.6, -6, 1.5, -8, 'surface');
  box(1.2, 1.1, 1.2, -12, 0.55, -11, 'hairline');
  box(1.2, 1.1, 1.2, -11, 0.55, -10.2, 'hairline');
  box(2.4, 2.4, 2.4, 4, 1.2, -6, 'hairline');
  box(1.2, 1.1, 1.2, 9, 0.55, -11, 'hairline');
  // South lane cover, mirrored with a different rhythm so the lanes play differently.
  box(8.0, 3.0, 0.6, 6, 1.5, 8, 'surface');
  box(2.4, 2.4, 2.4, -4, 1.2, 6, 'hairline');
  box(1.2, 1.1, 1.2, -9, 0.55, 11, 'hairline');
  box(1.2, 1.1, 1.2, -10, 0.55, 10.2, 'hairline');
  box(1.2, 1.1, 1.2, 11, 0.55, 11, 'hairline');

  // Mid-east wall: forces the last approach to the sites through two gaps.
  box(0.6, 3.0, 5.0, 10, 1.5, -4.5, 'surface');
  box(0.6, 3.0, 5.0, 10, 1.5, 4.5, 'surface');
  // Containers: tall cover on the mid approaches.
  box(2.4, 2.4, 4.8, -8, 1.2, -2.5, 'hairline');
  box(2.4, 2.4, 4.8, -8, 1.2, 2.5, 'hairline');
  box(4.8, 2.4, 2.4, 6, 1.2, 0, 'surface');

  // Site A (Furnace): raised plate, furnace mouth, chimney base.
  box(8.0, 0.5, 7.0, 14, 0.25, -11, 'surface');
  box(2.0, 2.6, 1.2, 17.5, 1.3, -14.2, 'hairline');
  box(1.2, 1.1, 1.2, 11.5, 0.55, -13.5, 'hairline');
  box(1.2, 1.1, 1.2, 17, 0.55, -8.5, 'hairline');
  // Site B (Depot): crate cluster and a rail flatbed.
  box(8.0, 0.5, 7.0, 14, 0.25, 11, 'surface');
  box(2.4, 2.4, 2.4, 17, 1.2, 13, 'hairline');
  box(1.2, 1.1, 1.2, 11.5, 0.55, 13.5, 'hairline');
  box(4.8, 0.8, 2.0, 15, 0.4, 8.6, 'surface');
  // Spawn cover: low walls so nobody is shot out of spawn.
  box(0.6, 1.4, 6.0, -18, 0.7, -4, 'hairline');
  box(0.6, 1.4, 6.0, -18, 0.7, 4, 'hairline');
  box(0.6, 1.4, 6.0, 18, 0.7, -4, 'hairline');
  box(0.6, 1.4, 6.0, 18, 0.7, 4, 'hairline');

  // Rails: two rusted lines running west-east through mid (visual only, flush with the floor).
  for (const z of [-1.1, 1.1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(44, 0.06, 0.12), materials.hairline);
    rail.position.set(0, 0.03, z);
    rail.receiveShadow = true;
    group.add(rail);
  }
  // Barrels: visual cylinders with a small box collider each.
  const barrelGeo = new THREE.CylinderGeometry(0.42, 0.42, 1.05, 12);
  for (const [x, z, mat] of [[-14, -13, 'accent'], [13, -4, 'hairline'], [-12, 13.5, 'hairline'], [19, 0, 'accent'], [2, -13.5, 'hairline'], [-2, 13.5, 'hairline']]) {
    const barrel = new THREE.Mesh(barrelGeo, materials[mat]);
    barrel.position.set(x, 0.52, z);
    barrel.castShadow = true;
    barrel.receiveShadow = true;
    group.add(barrel);
    colliders.push(new THREE.Box3().setFromObject(barrel));
    shootables.push(barrel);
  }

  // Site plates: a thin accent slab on each site floor, and a letter pylon. The letters
  // are drawn on a canvas at runtime (no image assets) so the sites read at a glance.
  function sitePylon(x, z, letter, colorName) {
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(7.6, 0.06, 6.6),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE[colorName]), transparent: true, opacity: 0.28 }),
    );
    plate.position.set(x, 0.53, z);
    group.add(plate);
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#171310';
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = PALETTE[colorName];
    ctx.font = 'bold 84px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, 64, 70);
    const texture = new THREE.CanvasTexture(canvas);
    // Two planes back to back so the letter reads correctly from either side.
    for (const [offset, rotationY] of [[-0.02, 0], [0.02, Math.PI]]) {
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(1.7, 1.7),
        new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.FrontSide }),
      );
      sign.position.set(x, 2.6, z + offset);
      sign.rotation.y = rotationY;
      group.add(sign);
    }
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.6, 0.18), materials.hairline);
    post.position.set(x, 1.3, z);
    post.castShadow = true;
    group.add(post);
  }
  sitePylon(14, -11, 'A', 'ember');
  sitePylon(14, 11, 'B', 'ward');

  // Light: a warm dusk sky lifts every surface, a low warm sun from the west rakes
  // across the yard, a cool fill from the east keeps the far side readable, and the
  // furnace and depot glow from inside their sites.
  const sky = new THREE.HemisphereLight(new THREE.Color('#a08a6a'), new THREE.Color('#554634'), 2.2);
  scene.add(sky);
  const key = new THREE.DirectionalLight(new THREE.Color('#ffd9a0'), 2.6);
  key.position.set(-10, 20, 14);
  key.target.position.set(4, 0, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -26;
  key.shadow.camera.right = 26;
  key.shadow.camera.top = 20;
  key.shadow.camera.bottom = -20;
  key.shadow.camera.far = 60;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(new THREE.Color(PALETTE.muted), 1.1);
  fill.position.set(12, 10, -12);
  scene.add(fill);
  // A second fill from the north-east so north-facing walls are not black.
  const fillNorth = new THREE.DirectionalLight(new THREE.Color('#c9b896'), 0.8);
  fillNorth.position.set(8, 12, -14);
  scene.add(fillNorth);
  const furnaceGlow = new THREE.PointLight(new THREE.Color(PALETTE.ember), 30, 16);
  furnaceGlow.position.set(17.5, 1.6, -13);
  scene.add(furnaceGlow);
  const depotGlow = new THREE.PointLight(new THREE.Color(PALETTE.ward), 18, 14);
  depotGlow.position.set(14, 2.2, 11);
  scene.add(depotGlow);

  // The waypoint graph: lanes, approaches and hold points. Edges are undirected.
  const nodes = {
    w0: [-18.5, 0], w1: [-16, -6], w2: [-16, 6], w3: [-16, 0],
    n1: [-10, -11], n2: [-2, -11], n3: [6, -11], n4: [11, -11],
    m1: [-8, 0], m2: [-4.5, 0], m3: [4.5, 0], m4: [8, 0],
    s1: [-10, 11], s2: [-2, 11], s3: [6, 11], s4: [11, 11],
    a1: [16, -13], a2: [11, -8.5], a3: [18, -9], aSite: [14, -11],
    b1: [16, 13], b2: [11, 8.5], b3: [18, 9], bSite: [14, 11],
    h1: [8, -3], h2: [8, 3], e0: [20, 0], e1: [20, -8], e2: [20, 8],
  };
  const edges = [
    ['w0', 'w1'], ['w0', 'w2'], ['w0', 'w3'], ['w1', 'n1'], ['w2', 's1'], ['w3', 'm1'],
    ['n1', 'n2'], ['n2', 'n3'], ['n3', 'n4'], ['n4', 'aSite'], ['n4', 'a2'],
    ['m1', 'm2'], ['m2', 'm3'], ['m3', 'm4'], ['m4', 'h1'], ['m4', 'h2'],
    ['s1', 's2'], ['s2', 's3'], ['s3', 's4'], ['s4', 'bSite'], ['s4', 'b2'],
    ['aSite', 'a1'], ['aSite', 'a3'], ['a2', 'h1'], ['bSite', 'b1'], ['bSite', 'b3'],
    ['b2', 'h2'], ['h1', 'e1'], ['h2', 'e2'], ['e0', 'e1'], ['e0', 'e2'], ['e0', 'h1'],
    ['e0', 'h2'], ['a1', 'e1'], ['b1', 'e2'],
  ];
  const adjacency = {};
  for (const name of Object.keys(nodes)) adjacency[name] = [];
  for (const [a, b] of edges) {
    adjacency[a].push(b);
    adjacency[b].push(a);
  }

  const sites = [
    { id: 'A', name: 'Furnace', center: new THREE.Vector3(14, 0, -11), minX: 10.2, maxX: 17.8, minZ: -14.3, maxZ: -7.7 },
    { id: 'B', name: 'Depot', center: new THREE.Vector3(14, 0, 11), minX: 10.2, maxX: 17.8, minZ: 7.7, maxZ: 14.3 },
  ];
  function siteAt(x, z) {
    for (const site of sites) {
      if (x >= site.minX && x <= site.maxX && z >= site.minZ && z <= site.maxZ) return site;
    }
    return null;
  }

  return {
    colliders,
    shootables,
    group,
    nodes,
    adjacency,
    sites,
    siteAt,
    spawns: {
      attackers: [[-21, -2.5], [-21, 0], [-21, 2.5]],
      defenders: [[20, -8], [20, 8], [18, -2], [18, 2]],
    },
  };
}
