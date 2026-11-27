import * as THREE from 'three';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { BikeId, BikeSpec } from './types';

THREE.Cache.enabled = true;

const sharedDracoLoader = new DRACOLoader();
sharedDracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');

export const BIKE_CATALOG: BikeSpec[] = [
  {
    id: 'ninja-zx6r',
    name: 'Kawasaki Ninja ZX-6R',
    category: 'SUPERSPORT 636',
    modelUrl: './zx6r.glb',
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
    modelUrl: './ducati.glb',
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

  // 3. Uniform auto-scale to match real highway motorcycle scale (~2.08 m long, fitting road lanes cleanly)
  let scaleFactor = TARGET_BIKE_LENGTH / Math.max(_sizeA.z, 0.001);
  if (_sizeA.y * scaleFactor > 1.48) {
    scaleFactor = Math.min(scaleFactor, 1.32 / Math.max(_sizeA.y, 0.001));
  }
  if (_sizeA.x * scaleFactor > 1.05) {
    scaleFactor = Math.min(scaleFactor, 0.96 / Math.max(_sizeA.x, 0.001));
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
  const abortController = new AbortController();
  rig.dispose = () => {
    cancelled = true;
    abortController.abort();
    disposeHierarchy(root);
  };

  const loader = new GLTFLoader();
  loader.setDRACOLoader(sharedDracoLoader);

  void (async () => {
    try {
      const response = await fetch(spec.modelUrl, { signal: abortController.signal });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} fetching ${spec.modelUrl}`);
      }
      const contentType = response.headers.get('content-type') ?? '';
      if (/text\/html/i.test(contentType)) {
        throw new Error(`Received HTML instead of binary GLB at ${spec.modelUrl}`);
      }

      const buffer = await response.arrayBuffer();
      if (cancelled) return;

      const bytes = new Uint8Array(buffer);
      const isBinaryGlb =
        bytes.byteLength >= 12 &&
        bytes[0] === 0x67 && // 'g'
        bytes[1] === 0x6c && // 'l'
        bytes[2] === 0x54 && // 'T'
        bytes[3] === 0x46;   // 'F'
      const firstNonSpace = bytes.find((b) => b > 0x20);
      const isJsonGltf = firstNonSpace === 0x7b; // '{'

      if (!isBinaryGlb && !isJsonGltf) {
        throw new Error(`Invalid GLB/glTF header at ${spec.modelUrl}`);
      }

      loader.parse(
        buffer,
        './',
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
          } catch (normErr) {
            console.warn(`Failed to normalize GLB model at ${spec.modelUrl}:`, normErr);
            disposeHierarchy(gltf.scene);
          }
        },
        (parseErr) => {
          if (cancelled) return;
          console.warn(`Failed to parse GLB model at ${spec.modelUrl}:`, parseErr);
        }
      );
    } catch (err) {
      if (cancelled || (err instanceof DOMException && err.name === 'AbortError')) return;
      console.warn(`Unable to load GLB model from ${spec.modelUrl}:`, err);
    }
  })();

  return rig;
}
