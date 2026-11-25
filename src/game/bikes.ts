import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { BikeId, BikeSpec } from './types';

THREE.Cache.enabled = true;

export const BIKE_CATALOG: BikeSpec[] = [
  {
    id: 'ninja-zx6r',
    name: 'Kawasaki Ninja ZX-6R',
    category: 'SUPERSPORT 636',
    modelUrl: '/zx6r.glb',
    price: 0,
    tagline: '636cc KRT lime-green supersport with twin LED headlights & razor-sharp fairing',
    topSpeedKmh: 260,
    accelerationStat: 86,
    handlingStat: 94,
    accelMultiplier: 1.28,
    handlingMultiplier: 1.18,
    hasNitro: false,
    accentHex: '#22c55e',
  },
  {
    id: 'ducati-sf-v4',
    name: '2024 Ducati Streetfighter V4',
    category: 'ULTIMATE SUPERBIKE',
    modelUrl: '/ducati.glb',
    price: 6500,
    tagline: '1103cc Desmosedici Stradale V4 hypernaked with biplane aero wings & nitro boost',
    topSpeedKmh: 285,
    accelerationStat: 100,
    handlingStat: 96,
    accelMultiplier: 1.54,
    handlingMultiplier: 1.24,
    hasNitro: true,
    accentHex: '#ef4444',
  },
];

export const COINS_STORAGE_KEY = 'indian_bike_rider_3d_coins';
export const OWNED_BIKES_STORAGE_KEY = 'indian_bike_rider_3d_owned_bikes';
export const SELECTED_BIKE_STORAGE_KEY = 'indian_bike_rider_3d_selected_bike';

const STARTER_BIKE_ID: BikeId = 'ninja-zx6r';
const TARGET_BIKE_LENGTH = 2.08;
const DEFAULT_FLIP_PIVOT_Y = 0.62;

const _boxA = new THREE.Box3();
const _boxB = new THREE.Box3();
const _sizeA = new THREE.Vector3();
const _sizeB = new THREE.Vector3();
const _centerA = new THREE.Vector3();
const _centerB = new THREE.Vector3();
const _vertex = new THREE.Vector3();

export function getBikeSpec(id: BikeId): BikeSpec {
  return BIKE_CATALOG.find((b) => b.id === id) ?? BIKE_CATALOG[0];
}

export function loadStoredCoins(): number {
  try {
    const raw = localStorage.getItem(COINS_STORAGE_KEY);
    const val = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(val) && val >= 0 ? val : 0;
  } catch {
    return 0;
  }
}

export function saveStoredCoins(coins: number): void {
  try {
    localStorage.setItem(COINS_STORAGE_KEY, String(Math.max(0, Math.floor(coins))));
  } catch {
    // Ignore storage failures
  }
}

export function loadPurchasedBikes(): BikeId[] {
  try {
    const raw = localStorage.getItem(OWNED_BIKES_STORAGE_KEY);
    if (!raw) return [STARTER_BIKE_ID];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [STARTER_BIKE_ID];
    const validIds = new Set(BIKE_CATALOG.map((b) => b.id));
    const filtered = parsed.filter((id): id is BikeId => validIds.has(id));
    if (!filtered.includes(STARTER_BIKE_ID)) {
      filtered.unshift(STARTER_BIKE_ID);
    }
    return Array.from(new Set(filtered));
  } catch {
    return [STARTER_BIKE_ID];
  }
}

export function savePurchasedBikes(owned: BikeId[]): void {
  try {
    const validIds = new Set(BIKE_CATALOG.map((b) => b.id));
    const filtered = owned.filter((id): id is BikeId => validIds.has(id));
    const list = filtered.includes(STARTER_BIKE_ID)
      ? filtered
      : [STARTER_BIKE_ID, ...filtered];
    localStorage.setItem(OWNED_BIKES_STORAGE_KEY, JSON.stringify(Array.from(new Set(list))));
  } catch {
    // Ignore storage failures
  }
}

export function loadSelectedBikeId(owned: BikeId[]): BikeId {
  try {
    const raw = localStorage.getItem(SELECTED_BIKE_STORAGE_KEY) as BikeId | null;
    if (raw && owned.includes(raw)) return raw;
    return STARTER_BIKE_ID;
  } catch {
    return STARTER_BIKE_ID;
  }
}

export function saveSelectedBikeId(id: BikeId): void {
  try {
    localStorage.setItem(SELECTED_BIKE_STORAGE_KEY, id);
  } catch {
    // Ignore storage failures
  }
}

export interface SportsBikeRig {
  root: THREE.Group;
  leanGroup: THREE.Group;
  flipGroup: THREE.Group;
  wheelieGroup: THREE.Group;
  pitchGroup: THREE.Group;
  steeringGroup: THREE.Group;
  frontWheel: THREE.Group;
  rearWheel: THREE.Group;
  brakeLightMat: THREE.MeshStandardMaterial | null;
  nitroFlame: THREE.Group | null;
  shadowMesh: THREE.Mesh | null;
  dispose: () => void;
}

function disposeHierarchy(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh;
      mesh.geometry?.dispose();
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((m) => m.dispose());
      } else {
        mesh.material?.dispose();
      }
    }
  });
}

function detectForwardOrientationSign(
  sceneRoot: THREE.Object3D,
  bounds: THREE.Box3,
  boundsSize: THREE.Vector3,
  boundsCenter: THREE.Vector3
): boolean {
  let frontNameVote = 0;
  let rearNameVote = 0;

  sceneRoot.traverse((obj) => {
    if (!obj.name) return;
    const isFrontName =
      /front|headlight|head_light|windscreen|windshield|handlebar|fork|visor|steer/i.test(
        obj.name
      ) && !/rear|back|tail/i.test(obj.name);
    const isRearName = /rear|taillight|tail_light|swingarm|plate/i.test(obj.name);
    if (!isFrontName && !isRearName) return;

    _boxB.setFromObject(obj);
    if (_boxB.isEmpty()) return;
    _boxB.getCenter(_centerB);

    if (isFrontName) {
      if (_centerB.z > boundsCenter.z + boundsSize.z * 0.08) frontNameVote += 1;
      else if (_centerB.z < boundsCenter.z - boundsSize.z * 0.08) frontNameVote -= 1;
    }
    if (isRearName) {
      if (_centerB.z < boundsCenter.z - boundsSize.z * 0.08) rearNameVote += 1;
      else if (_centerB.z > boundsCenter.z + boundsSize.z * 0.08) rearNameVote -= 1;
    }
  });

  if (frontNameVote !== 0) return frontNameVote > 0;
  if (rearNameVote !== 0) return rearNameVote > 0;

  // Geometry heuristic: handlebars, mirrors, and upper fairing make the front half
  // wider in X above mid-height than the narrow rear tail.
  const upperThresholdY = bounds.min.y + boundsSize.y * 0.42;
  const negCutoffZ = boundsCenter.z - boundsSize.z * 0.05;
  const posCutoffZ = boundsCenter.z + boundsSize.z * 0.05;

  let negMinX = Infinity;
  let negMaxX = -Infinity;
  let posMinX = Infinity;
  let posMaxX = -Infinity;

  sceneRoot.traverse((obj) => {
    if (!(obj as THREE.Mesh).isMesh) return;
    const mesh = obj as THREE.Mesh;
    const pos = mesh.geometry?.getAttribute('position');
    if (!pos) return;
    const stride = Math.max(1, Math.floor(pos.count / 900));
    for (let i = 0; i < pos.count; i += stride) {
      _vertex.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      if (_vertex.y < upperThresholdY) continue;
      if (_vertex.z <= negCutoffZ) {
        if (_vertex.x < negMinX) negMinX = _vertex.x;
        if (_vertex.x > negMaxX) negMaxX = _vertex.x;
      } else if (_vertex.z >= posCutoffZ) {
        if (_vertex.x < posMinX) posMinX = _vertex.x;
        if (_vertex.x > posMaxX) posMaxX = _vertex.x;
      }
    }
  });

  const negSpanX = negMaxX > negMinX ? negMaxX - negMinX : 0;
  const posSpanX = posMaxX > posMinX ? posMaxX - posMinX : 0;

  if (negSpanX > posSpanX + boundsSize.x * 0.05) {
    return false; // Already facing -Z
  }
  if (posSpanX > negSpanX + boundsSize.x * 0.05) {
    return true; // Facing +Z (glTF standard), rotate 180 deg to -Z
  }

  // Standard glTF 2.0 specification faces +Z forward, so flip 180 deg to align with -Z highway direction.
  return true;
}

function normalizeAndOrientGlbBike(rawScene: THREE.Group): {
  container: THREE.Group;
  rearAxleY: number;
  rearAxleZ: number;
} {
  rawScene.updateMatrixWorld(true);
  _boxA.setFromObject(rawScene);
  if (_boxA.isEmpty()) {
    throw new Error('Loaded GLB has empty bounding box.');
  }
  _boxA.getSize(_sizeA);
  if (_sizeA.lengthSq() < 1e-8) {
    throw new Error('Loaded GLB has zero dimensions.');
  }

  // 1. Align longest horizontal dimension along Z
  if (_sizeA.x > _sizeA.z * 1.15) {
    rawScene.rotation.y += Math.PI / 2;
    rawScene.updateMatrixWorld(true);
    _boxA.setFromObject(rawScene);
    _boxA.getSize(_sizeA);
  }

  // 2. Orient front of motorcycle toward -Z
  _boxA.getCenter(_centerA);
  const flip180 = detectForwardOrientationSign(rawScene, _boxA, _sizeA, _centerA);
  if (flip180) {
    rawScene.rotation.y += Math.PI;
    rawScene.updateMatrixWorld(true);
    _boxA.setFromObject(rawScene);
    _boxA.getSize(_sizeA);
  }

  // 3. Uniform auto-scale to match real highway motorcycle scale (~2.08 m long)
  let scaleFactor = TARGET_BIKE_LENGTH / Math.max(_sizeA.z, 0.001);
  if (_sizeA.y * scaleFactor > 1.55) {
    scaleFactor = Math.min(scaleFactor, 1.35 / Math.max(_sizeA.y, 0.001));
  }
  const container = new THREE.Group();
  container.add(rawScene);
  container.scale.setScalar(scaleFactor);
  container.updateMatrixWorld(true);

  // 4. Center X & Z at origin, and place lowest tyre contact point flush on y = 0
  _boxA.setFromObject(container);
  _boxA.getCenter(_centerA);
  _boxA.getSize(_sizeA);
  container.position.set(-_centerA.x, -_boxA.min.y, -_centerA.z);
  container.updateMatrixWorld(true);

  // 5. Enhance PBR lighting/shadow properties on loaded GLB meshes
  container.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        if (mat && 'envMapIntensity' in mat) {
          const stdMat = mat as THREE.MeshStandardMaterial;
          stdMat.envMapIntensity = Math.max(stdMat.envMapIntensity ?? 1, 1.15);
          stdMat.needsUpdate = true;
        }
      }
    }
  });

  // 6. Compute rear wheel axle coordinates for smooth rear-wheel wheelie pivot
  _boxA.setFromObject(container);
  _boxA.getSize(_sizeA);

  let rearAxleY = THREE.MathUtils.clamp(_sizeA.y * 0.285, 0.24, 0.38);
  let rearAxleZ = _sizeA.z * 0.345;

  container.traverse((obj) => {
    if (!obj.name) return;
    if (/rear.*wheel|wheel.*rear|back.*wheel|wheel.*r\b|tire.*r\b|tyre.*r\b/i.test(obj.name)) {
      _boxB.setFromObject(obj);
      if (_boxB.isEmpty()) return;
      _boxB.getSize(_sizeB);
      _boxB.getCenter(_centerB);
      if (
        _sizeB.z < _sizeA.z * 0.45 &&
        _sizeB.y < _sizeA.y * 0.72 &&
        _centerB.z > _sizeA.z * 0.14
      ) {
        rearAxleY = THREE.MathUtils.clamp(_centerB.y, 0.22, 0.42);
        rearAxleZ = THREE.MathUtils.clamp(_centerB.z, 0.42, _sizeA.z * 0.46);
      }
    }
  });

  return { container, rearAxleY, rearAxleZ };
}

function createNitroFlameGroup(): THREE.Group {
  const nitroFlame = new THREE.Group();
  nitroFlame.position.set(0.22, 0.5, 0.86);
  nitroFlame.rotation.x = Math.PI / 2 - 0.32;
  nitroFlame.visible = false;

  const outerFlame = new THREE.Mesh(
    new THREE.ConeGeometry(0.085, 0.72, 12),
    new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.85,
    })
  );
  outerFlame.position.y = 0.36;
  nitroFlame.add(outerFlame);

  const innerFlame = new THREE.Mesh(
    new THREE.ConeGeometry(0.048, 0.44, 10),
    new THREE.MeshBasicMaterial({
      color: 0xe0f2fe,
    })
  );
  innerFlame.position.y = 0.22;
  nitroFlame.add(innerFlame);

  return nitroFlame;
}

function createSportsWheel(
  radius: number,
  tubeRadius: number,
  rimColor: number,
  stripeColor: number,
  spokeCount = 6
): THREE.Group {
  const wheel = new THREE.Group();

  const tyreMat = new THREE.MeshStandardMaterial({
    color: 0x141416,
    roughness: 0.86,
    metalness: 0.05,
  });
  const rimMat = new THREE.MeshStandardMaterial({
    color: rimColor,
    roughness: 0.24,
    metalness: 0.82,
  });
  const discMat = new THREE.MeshStandardMaterial({
    color: 0xa1a1aa,
    roughness: 0.2,
    metalness: 0.9,
  });

  const tyre = new THREE.Mesh(
    new THREE.TorusGeometry(radius - tubeRadius, tubeRadius, 14, 30),
    tyreMat
  );
  tyre.rotation.y = Math.PI / 2;
  tyre.castShadow = true;
  wheel.add(tyre);

  const rimRadius = radius - tubeRadius * 1.65;
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(rimRadius, rimRadius, tubeRadius * 1.42, 22, 1, true),
    rimMat
  );
  barrel.rotation.z = Math.PI / 2;
  wheel.add(barrel);

  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(rimRadius * 0.28, rimRadius * 0.28, tubeRadius * 1.72, 14),
    rimMat
  );
  hub.rotation.z = Math.PI / 2;
  wheel.add(hub);

  const spokeGeo = new THREE.BoxGeometry(tubeRadius * 0.52, rimRadius * 1.9, 0.024);
  for (let i = 0; i < spokeCount; i++) {
    const spoke = new THREE.Mesh(spokeGeo, rimMat);
    spoke.rotation.x = (i * Math.PI) / spokeCount;
    wheel.add(spoke);
  }

  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(rimRadius * 0.74, rimRadius * 0.74, 0.015, 22),
    discMat
  );
  disc.rotation.z = Math.PI / 2;
  disc.position.x = tubeRadius * 0.82;
  wheel.add(disc);

  const stripeMat = new THREE.MeshStandardMaterial({
    color: stripeColor,
    roughness: 0.28,
    metalness: 0.45,
  });
  const stripeGeo = new THREE.TorusGeometry(rimRadius + 0.008, 0.009, 8, 28);
  for (const side of [-1, 1]) {
    const stripe = new THREE.Mesh(stripeGeo, stripeMat);
    stripe.rotation.y = Math.PI / 2;
    stripe.position.x = side * tubeRadius * 0.65;
    wheel.add(stripe);
  }

  return wheel;
}

function buildFallbackBikeModel(
  bikeId: BikeId,
  withRider: boolean
): {
  group: THREE.Group;
  steeringGroup: THREE.Group;
  frontWheel: THREE.Group;
  rearWheel: THREE.Group;
  brakeLightMat: THREE.MeshStandardMaterial;
} {
  const group = new THREE.Group();
  const isDucati = bikeId === 'ducati-sf-v4';

  const primaryColor = isDucati ? 0xdc2626 : 0x22c55e;
  const secondaryColor = isDucati ? 0x111827 : 0x09090b;
  const accentColor = isDucati ? 0xf87171 : 0x4ade80;
  const rimColor = 0x18181b;
  const rimStripeColor = isDucati ? 0xef4444 : 0x4ade80;
  const forkColor = isDucati ? 0xd97706 : 0x1f2937;
  const drlColor = isDucati ? 0xfef2f2 : 0xecfccb;

  const primaryPaint = new THREE.MeshStandardMaterial({
    color: primaryColor,
    roughness: isDucati ? 0.16 : 0.14,
    metalness: isDucati ? 0.42 : 0.45,
  });
  const secondaryMat = new THREE.MeshStandardMaterial({
    color: secondaryColor,
    roughness: 0.52,
    metalness: 0.26,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: accentColor,
    roughness: 0.25,
    metalness: 0.55,
  });
  const satinFrame = new THREE.MeshStandardMaterial({
    color: isDucati ? 0x374151 : 0x1f2937,
    roughness: 0.38,
    metalness: 0.78,
  });
  const chromeMetal = new THREE.MeshStandardMaterial({
    color: 0xe5e7eb,
    roughness: 0.16,
    metalness: 0.92,
  });
  const forkMat = new THREE.MeshStandardMaterial({
    color: forkColor,
    roughness: 0.22,
    metalness: 0.85,
  });
  const visorGlass = new THREE.MeshStandardMaterial({
    color: 0x09090b,
    roughness: 0.08,
    metalness: 0.9,
  });
  const headlightMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: drlColor,
    emissiveIntensity: 2.4,
    roughness: 0.1,
  });
  const brakeLightMat = new THREE.MeshStandardMaterial({
    color: 0x991b1b,
    emissive: 0xef4444,
    emissiveIntensity: 0.95,
    roughness: 0.2,
  });
  const whiteStripeMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.24,
    metalness: 0.2,
  });

  // 1. Rear Wheel & Swingarm
  const rearWheel = createSportsWheel(0.33, 0.115, rimColor, rimStripeColor, isDucati ? 7 : 6);
  rearWheel.position.set(0, 0.33, 0.76);
  group.add(rearWheel);

  if (isDucati) {
    // Ducati signature single-sided aluminum swingarm on left
    const singleSwing = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.095, 0.76), satinFrame);
    singleSwing.position.set(-0.14, 0.35, 0.44);
    group.add(singleSwing);
  } else {
    for (const side of [-1, 1]) {
      const swing = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.075, 0.74), satinFrame);
      swing.position.set(side * 0.145, 0.36, 0.44);
      group.add(swing);
    }
  }

  // 2. Engine, Radiator & Belly Pan
  const engine = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.36, 0.48), satinFrame);
  engine.position.set(0, 0.44, 0.02);
  engine.castShadow = true;
  group.add(engine);

  const radiator = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.28, 0.075), secondaryMat);
  radiator.position.set(0, 0.56, -0.28);
  radiator.rotation.x = 0.22;
  group.add(radiator);

  const bellyPan = new THREE.Mesh(
    new THREE.BoxGeometry(isDucati ? 0.26 : 0.32, isDucati ? 0.14 : 0.18, isDucati ? 0.54 : 0.74),
    secondaryMat
  );
  bellyPan.position.set(0, 0.24, -0.05);
  bellyPan.rotation.x = -0.1;
  group.add(bellyPan);

  // 3. Exhaust System
  const header = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.032, 0.48, 10), chromeMetal);
  header.rotation.x = Math.PI / 2 - 0.26;
  header.position.set(0.2, 0.31, 0.28);
  group.add(header);

  const raceCan = new THREE.Mesh(
    new THREE.CylinderGeometry(0.056, 0.043, isDucati ? 0.38 : 0.42, 14),
    isDucati ? chromeMetal : satinFrame
  );
  raceCan.rotation.x = Math.PI / 2 - 0.32;
  raceCan.position.set(0.22, 0.43, 0.58);
  raceCan.castShadow = true;
  group.add(raceCan);

  const carbonCap = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.052, 0.09, 14), secondaryMat);
  carbonCap.rotation.x = Math.PI / 2 - 0.32;
  carbonCap.position.set(0.22, 0.5, 0.77);
  group.add(carbonCap);

  // 4. Sculpted Fuel Tank
  const tankShape = new THREE.Shape();
  tankShape.moveTo(-0.28, 0);
  tankShape.quadraticCurveTo(-0.22, 0.25, 0.03, 0.27);
  tankShape.quadraticCurveTo(0.24, 0.22, 0.28, 0.02);
  tankShape.lineTo(-0.28, 0);

  const tankGeo = new THREE.ExtrudeGeometry(tankShape, {
    depth: isDucati ? 0.34 : 0.35,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.04,
    bevelSegments: 3,
  });
  tankGeo.center();
  const tank = new THREE.Mesh(tankGeo, primaryPaint);
  tank.rotation.y = Math.PI / 2;
  tank.position.set(0, 0.86, -0.14);
  tank.castShadow = true;
  group.add(tank);

  const tankStripe = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.46), secondaryMat);
  tankStripe.position.set(0, 0.995, -0.14);
  tankStripe.rotation.x = 0.08;
  group.add(tankStripe);

  // 5. Model-specific Fairings vs Streetfighter V4 Biplane Aero Shrouds
  for (const side of [-1, 1]) {
    if (isDucati) {
      // Exposed aluminum Front Frame
      const frontFrame = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.11, 0.52), satinFrame);
      frontFrame.rotation.x = -0.25;
      frontFrame.position.set(side * 0.17, 0.71, -0.08);
      group.add(frontFrame);

      // Streetfighter V4 sharp side radiator shrouds
      const shroud = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.27, 0.38), primaryPaint);
      shroud.position.set(side * 0.2, 0.74, -0.3);
      shroud.rotation.x = -0.34;
      shroud.rotation.y = side * -0.16;
      shroud.castShadow = true;
      group.add(shroud);

      // Iconic Ducati Streetfighter V4 Biplane Aero Winglets
      for (const level of [0, 1]) {
        const wing = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.018, 0.13), secondaryMat);
        wing.position.set(side * 0.29, 0.69 - level * 0.09, -0.35 - level * 0.03);
        wing.rotation.z = side * -0.16;
        wing.rotation.y = side * 0.22;
        group.add(wing);
      }
    } else {
      // Kawasaki Ninja ZX-6R Full Sport Fairing + KRT Accent Slash
      const sideFairing = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.36, 0.62), primaryPaint);
      sideFairing.position.set(side * 0.21, 0.65, -0.24);
      sideFairing.rotation.x = -0.24;
      sideFairing.rotation.y = side * -0.08;
      sideFairing.castShadow = true;
      group.add(sideFairing);

      const lowerPanel = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.22, 0.54), secondaryMat);
      lowerPanel.position.set(side * 0.2, 0.44, -0.2);
      lowerPanel.rotation.x = -0.15;
      group.add(lowerPanel);

      const fairingSlash = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.075, 0.44), whiteStripeMat);
      fairingSlash.position.set(side * 0.245, 0.66, -0.24);
      fairingSlash.rotation.x = -0.42;
      group.add(fairingSlash);

      const spar = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.09, 0.52), satinFrame);
      spar.rotation.x = -0.24;
      spar.position.set(side * 0.17, 0.69, 0.14);
      group.add(spar);
    }
  }

  // 6. Seat & Tail Cowl
  const riderSeat = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.08, 0.38), secondaryMat);
  riderSeat.position.set(0, 0.79, 0.26);
  riderSeat.rotation.x = -0.1;
  group.add(riderSeat);

  const tailCowl = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 0.13, 0.54),
    isDucati ? primaryPaint : primaryPaint
  );
  tailCowl.position.set(0, 0.87, 0.66);
  tailCowl.rotation.x = -0.25;
  tailCowl.castShadow = true;
  group.add(tailCowl);

  const tailStripe = new THREE.Mesh(
    new THREE.BoxGeometry(0.09, 0.03, 0.42),
    isDucati ? secondaryMat : whiteStripeMat
  );
  tailStripe.position.set(0, 0.945, 0.66);
  tailStripe.rotation.x = -0.25;
  group.add(tailStripe);

  const taillight = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.045, 0.04), brakeLightMat);
  taillight.position.set(0, 0.91, 0.92);
  group.add(taillight);

  const plateBracket = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.22, 0.03), secondaryMat);
  plateBracket.position.set(0, 0.73, 0.92);
  plateBracket.rotation.x = 0.45;
  group.add(plateBracket);

  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.1, 0.015),
    new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 })
  );
  plate.position.set(0, 0.66, 0.97);
  plate.rotation.x = 0.45;
  group.add(plate);

  // 7. Front Steering Assembly
  const steeringGroup = new THREE.Group();
  steeringGroup.position.set(0, 0.78, -0.48);
  group.add(steeringGroup);

  const frontWheel = createSportsWheel(0.32, 0.095, rimColor, rimStripeColor, isDucati ? 7 : 6);
  frontWheel.position.set(0, 0.32 - 0.78, -0.3);
  steeringGroup.add(frontWheel);

  for (const side of [-1, 1]) {
    const upperFork = new THREE.Mesh(new THREE.CylinderGeometry(0.027, 0.027, 0.42, 10), forkMat);
    upperFork.position.set(side * 0.11, -0.02, -0.09);
    upperFork.rotation.x = -0.45;
    steeringGroup.add(upperFork);

    const lowerFork = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.36, 10), chromeMetal);
    lowerFork.position.set(side * 0.11, -0.3, -0.22);
    lowerFork.rotation.x = -0.45;
    steeringGroup.add(lowerFork);
  }

  const fender = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.34), primaryPaint);
  fender.position.set(0, -0.22, -0.3);
  fender.rotation.x = -0.25;
  steeringGroup.add(fender);

  if (isDucati) {
    // Ducati Streetfighter V4 aggressive V-shaped DRL headlight mask
    const maskBase = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.22, 0.2), secondaryMat);
    maskBase.position.set(0, 0.07, -0.2);
    maskBase.rotation.x = 0.26;
    steeringGroup.add(maskBase);

    for (const side of [-1, 1]) {
      const browDrl = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.032, 0.04), headlightMat);
      browDrl.position.set(side * 0.075, 0.11, -0.29);
      browDrl.rotation.y = side * -0.24;
      browDrl.rotation.z = side * 0.36;
      steeringGroup.add(browDrl);
    }

    const flyScreen = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.11, 0.025), visorGlass);
    flyScreen.position.set(0, 0.21, -0.15);
    flyScreen.rotation.x = 0.58;
    steeringGroup.add(flyScreen);
  } else {
    // Kawasaki Ninja ZX-6R twin recessed LED headlights + central ram-air scoop
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.25, 0.4), primaryPaint);
    nose.position.set(0, 0.12, -0.15);
    nose.rotation.x = 0.22;
    nose.castShadow = true;
    steeringGroup.add(nose);

    const bubbleScreen = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.28, 0.03), visorGlass);
    bubbleScreen.position.set(0, 0.31, -0.14);
    bubbleScreen.rotation.x = 0.68;
    steeringGroup.add(bubbleScreen);

    const ramAir = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.065, 0.06), secondaryMat);
    ramAir.position.set(0, 0.08, -0.35);
    steeringGroup.add(ramAir);

    for (const side of [-1, 1]) {
      const twinHl = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.042, 0.04), headlightMat);
      twinHl.position.set(side * 0.098, 0.105, -0.34);
      twinHl.rotation.y = side * -0.2;
      twinHl.rotation.z = side * 0.24;
      steeringGroup.add(twinHl);
    }
  }

  // Handlebars, TFT Dash & Mirrors
  const tripleClamp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.08), secondaryMat);
  tripleClamp.position.set(0, 0.16, 0.02);
  steeringGroup.add(tripleClamp);

  const dash = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.08, 0.02),
    new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      emissive: isDucati ? 0xef4444 : 0x22c55e,
      emissiveIntensity: 0.65,
      roughness: 0.2,
    })
  );
  dash.position.set(0, 0.22, -0.05);
  dash.rotation.x = -0.45;
  steeringGroup.add(dash);

  for (const side of [-1, 1]) {
    const barLength = isDucati ? 0.29 : 0.24;
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, barLength, 8), satinFrame);
    bar.rotation.z = isDucati ? Math.PI / 2 - side * 0.05 : Math.PI / 2 - side * 0.15;
    bar.rotation.y = side * 0.18;
    bar.position.set(side * (isDucati ? 0.24 : 0.21), isDucati ? 0.2 : 0.17, 0.04);
    steeringGroup.add(bar);

    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.13, 10), accentMat);
    grip.rotation.z = bar.rotation.z;
    grip.rotation.y = bar.rotation.y;
    grip.position.set(side * (isDucati ? 0.32 : 0.28), isDucati ? 0.19 : 0.15, 0.06);
    steeringGroup.add(grip);

    const mirrorArm = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.14, 6), satinFrame);
    mirrorArm.position.set(side * 0.22, 0.28, -0.07);
    mirrorArm.rotation.z = side * -0.5;
    steeringGroup.add(mirrorArm);

    const mirrorHead = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.045, 0.025), secondaryMat);
    mirrorHead.position.set(side * 0.28, 0.34, -0.07);
    steeringGroup.add(mirrorHead);
  }

  // 8. Optional Helmeted Rider for Highway Fallback
  if (withRider) {
    const jacketMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.68, metalness: 0.1 });
    const armorAccent = new THREE.MeshStandardMaterial({
      color: accentColor,
      roughness: 0.45,
      metalness: 0.2,
    });
    const jeansMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.82 });

    const riderGroup = new THREE.Group();
    group.add(riderGroup);

    const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, 0.22), jeansMat);
    pelvis.position.set(0, 0.86, 0.27);
    riderGroup.add(pelvis);

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.42, 0.22), jacketMat);
    torso.position.set(0, 1.12, 0.11);
    torso.rotation.x = isDucati ? 0.42 : 0.58;
    torso.castShadow = true;
    riderGroup.add(torso);

    const backHump = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.24, 0.12), armorAccent);
    backHump.position.set(0, 1.16, 0.2);
    backHump.rotation.x = isDucati ? 0.46 : 0.62;
    riderGroup.add(backHump);

    for (const side of [-1, 1]) {
      const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.068, 0.28, 4, 8), jeansMat);
      thigh.position.set(side * 0.16, 0.77, 0.1);
      thigh.rotation.x = 1.05;
      thigh.rotation.z = side * -0.15;
      riderGroup.add(thigh);

      const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.28, 4, 8), jacketMat);
      shin.position.set(side * 0.18, 0.56, 0.08);
      shin.rotation.x = -0.35;
      riderGroup.add(shin);

      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.08, 0.22), secondaryMat);
      boot.position.set(side * 0.18, 0.39, 0.18);
      riderGroup.add(boot);

      const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 10), armorAccent);
      shoulder.position.set(side * 0.19, 1.24, -0.02);
      riderGroup.add(shoulder);

      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.048, 0.36, 4, 8), jacketMat);
      arm.position.set(side * 0.24, 1.07, -0.22);
      arm.rotation.x = 1.05;
      arm.rotation.z = side * 0.14;
      riderGroup.add(arm);

      const glove = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), armorAccent);
      glove.position.set(side * 0.28, 0.93, -0.41);
      riderGroup.add(glove);
    }

    const helmetGroup = new THREE.Group();
    helmetGroup.position.set(0, isDucati ? 1.43 : 1.39, isDucati ? -0.02 : -0.07);
    riderGroup.add(helmetGroup);

    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.145, 18, 16), primaryPaint);
    shell.scale.set(0.92, 1.02, 1.12);
    shell.castShadow = true;
    helmetGroup.add(shell);

    const helmetStripe = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.22, 0.28), secondaryMat);
    helmetStripe.position.set(0, 0.04, 0.01);
    helmetGroup.add(helmetStripe);

    const visor = new THREE.Mesh(
      new THREE.CylinderGeometry(0.138, 0.138, 0.095, 16, 1, false, -Math.PI * 0.42, Math.PI * 0.84),
      visorGlass
    );
    visor.rotation.y = Math.PI;
    visor.position.set(0, -0.005, -0.02);
    helmetGroup.add(visor);

    const chinGuard = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.12), secondaryMat);
    chinGuard.position.set(0, -0.08, -0.1);
    helmetGroup.add(chinGuard);
  }

  return {
    group,
    steeringGroup,
    frontWheel,
    rearWheel,
    brakeLightMat,
  };
}

export function createSportsBikeModel(
  bikeId: BikeId,
  options: { withRider: boolean; shadowTexture?: THREE.Texture },
  onReady?: () => void
): SportsBikeRig {
  const spec = getBikeSpec(bikeId);

  const root = new THREE.Group();
  const leanGroup = new THREE.Group();
  const flipGroup = new THREE.Group();
  flipGroup.position.set(0, DEFAULT_FLIP_PIVOT_Y, 0);

  // Rear wheel wheelie pivot defaults to (0, 0.33, 0.76) and auto-updates once the .glb bounds are measured.
  const wheelieGroup = new THREE.Group();
  wheelieGroup.position.set(0, 0.33 - DEFAULT_FLIP_PIVOT_Y, 0.76);

  const pitchGroup = new THREE.Group();
  pitchGroup.position.set(0, -0.33, -0.76);

  const modelSlot = new THREE.Group();
  pitchGroup.add(modelSlot);

  root.add(leanGroup);
  leanGroup.add(flipGroup);
  flipGroup.add(wheelieGroup);
  wheelieGroup.add(pitchGroup);

  let shadowMesh: THREE.Mesh | null = null;
  if (options.shadowTexture) {
    shadowMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.45, 2.75),
      new THREE.MeshBasicMaterial({
        map: options.shadowTexture,
        transparent: true,
        depthWrite: false,
        opacity: 0.74,
      })
    );
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.y = 0.025;
    root.add(shadowMesh);
  }

  const nitroFlame = spec.hasNitro ? createNitroFlameGroup() : null;
  if (nitroFlame) {
    pitchGroup.add(nitroFlame);
  }

  const rig: SportsBikeRig = {
    root,
    leanGroup,
    flipGroup,
    wheelieGroup,
    pitchGroup,
    steeringGroup: new THREE.Group(),
    frontWheel: new THREE.Group(),
    rearWheel: new THREE.Group(),
    brakeLightMat: null,
    nitroFlame,
    shadowMesh,
    dispose: () => {
      cancelled = true;
      disposeHierarchy(root);
    },
  };

  let cancelled = false;
  const loader = new GLTFLoader();

  loader.load(
    spec.modelUrl,
    (gltf) => {
      if (cancelled) {
        disposeHierarchy(gltf.scene);
        return;
      }

      try {
        const { container, rearAxleY, rearAxleZ } = normalizeAndOrientGlbBike(gltf.scene);
        wheelieGroup.position.set(0, rearAxleY - DEFAULT_FLIP_PIVOT_Y, rearAxleZ);
        pitchGroup.position.set(0, -rearAxleY, -rearAxleZ);
        modelSlot.add(container);
        onReady?.();
      } catch (err) {
        console.warn(`Invalid GLB model at ${spec.modelUrl}, switching to fallback:`, err);
        disposeHierarchy(gltf.scene);
        const fallback = buildFallbackBikeModel(bikeId, options.withRider);
        rig.steeringGroup = fallback.steeringGroup;
        rig.frontWheel = fallback.frontWheel;
        rig.rearWheel = fallback.rearWheel;
        rig.brakeLightMat = fallback.brakeLightMat;
        modelSlot.add(fallback.group);
        onReady?.();
      }
    },
    undefined,
    (err) => {
      if (cancelled) return;
      console.warn(`Failed to load ${spec.modelUrl}, using fallback 3D model:`, err);
      const fallback = buildFallbackBikeModel(bikeId, options.withRider);
      rig.steeringGroup = fallback.steeringGroup;
      rig.frontWheel = fallback.frontWheel;
      rig.rearWheel = fallback.rearWheel;
      rig.brakeLightMat = fallback.brakeLightMat;
      modelSlot.add(fallback.group);
      onReady?.();
    }
  );

  return rig;
}
