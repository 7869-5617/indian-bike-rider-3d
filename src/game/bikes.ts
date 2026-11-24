import * as THREE from 'three';
import { BikeId, BikeSpec } from './types';

export const BIKE_CATALOG: BikeSpec[] = [
  {
    id: 'street-beast',
    name: 'Street Beast',
    price: 0,
    tagline: 'Agile crimson & carbon streetfighter built for Indian highways',
    topSpeedKmh: 205,
    accelerationStat: 74,
    handlingStat: 78,
    accelMultiplier: 1.0,
    handlingMultiplier: 1.0,
    accentHex: '#ef4444',
  },
  {
    id: 'speed-x',
    name: 'Speed X',
    price: 2500,
    tagline: 'Cobalt-blue aero supersport with bubble screen and GP exhaust',
    topSpeedKmh: 220,
    accelerationStat: 82,
    handlingStat: 85,
    accelMultiplier: 1.12,
    handlingMultiplier: 1.08,
    accentHex: '#3b82f6',
  },
  {
    id: 'ninja-pro',
    name: 'Ninja Pro',
    price: 8000,
    tagline: 'Track-tuned emerald predator with carbon aero winglets',
    topSpeedKmh: 235,
    accelerationStat: 89,
    handlingStat: 91,
    accelMultiplier: 1.24,
    handlingMultiplier: 1.16,
    accentHex: '#22c55e',
  },
  {
    id: 'phantom-rr',
    name: 'Phantom RR',
    price: 15000,
    tagline: 'Stealth matte-obsidian superbike with forged gold trim',
    topSpeedKmh: 250,
    accelerationStat: 94,
    handlingStat: 94,
    accelMultiplier: 1.35,
    handlingMultiplier: 1.22,
    accentHex: '#eab308',
  },
  {
    id: 'ducati-fury',
    name: 'Ducati Fury',
    price: 25000,
    tagline: 'Flagship Corsa Rosso V4 hyperbike with bi-plane MotoGP wings',
    topSpeedKmh: 270,
    accelerationStat: 100,
    handlingStat: 98,
    accelMultiplier: 1.48,
    handlingMultiplier: 1.28,
    accentHex: '#dc2626',
  },
];

export const COINS_STORAGE_KEY = 'indian_bike_rider_3d_coins';
export const OWNED_BIKES_STORAGE_KEY = 'indian_bike_rider_3d_owned_bikes';
export const SELECTED_BIKE_STORAGE_KEY = 'indian_bike_rider_3d_selected_bike';

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
    if (!raw) return ['street-beast'];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return ['street-beast'];
    const validIds = new Set(BIKE_CATALOG.map((b) => b.id));
    const filtered = parsed.filter((id): id is BikeId => validIds.has(id));
    if (!filtered.includes('street-beast')) {
      filtered.unshift('street-beast');
    }
    return Array.from(new Set(filtered));
  } catch {
    return ['street-beast'];
  }
}

export function savePurchasedBikes(owned: BikeId[]): void {
  try {
    const list = owned.includes('street-beast') ? owned : ['street-beast', ...owned];
    localStorage.setItem(OWNED_BIKES_STORAGE_KEY, JSON.stringify(Array.from(new Set(list))));
  } catch {
    // Ignore storage failures
  }
}

export function loadSelectedBikeId(owned: BikeId[]): BikeId {
  try {
    const raw = localStorage.getItem(SELECTED_BIKE_STORAGE_KEY) as BikeId | null;
    if (raw && owned.includes(raw)) return raw;
    return 'street-beast';
  } catch {
    return 'street-beast';
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
  pitchGroup: THREE.Group;
  steeringGroup: THREE.Group;
  frontWheel: THREE.Group;
  rearWheel: THREE.Group;
  brakeLightMat: THREE.MeshStandardMaterial;
}

interface BikeVisualTheme {
  primaryColor: number;
  secondaryColor: number;
  accentColor: number;
  rimColor: number;
  rimStripeColor: number;
  forkColor: number;
  drlColor: number;
  roughness: number;
  metalness: number;
  hasAeroWinglets: boolean;
  hasBiplaneWings: boolean;
  hasUnderseatExhaust: boolean;
  hasGpStubExhaust: boolean;
  hasWhiteStripe: boolean;
  hasTallBubbleScreen: boolean;
  hasTailSpoiler: boolean;
}

const BIKE_THEMES: Record<BikeId, BikeVisualTheme> = {
  'street-beast': {
    primaryColor: 0xdc2626,
    secondaryColor: 0x111827,
    accentColor: 0xef4444,
    rimColor: 0x1f2937,
    rimStripeColor: 0xef4444,
    forkColor: 0xd97706,
    drlColor: 0xe0f2fe,
    roughness: 0.16,
    metalness: 0.42,
    hasAeroWinglets: false,
    hasBiplaneWings: false,
    hasUnderseatExhaust: false,
    hasGpStubExhaust: false,
    hasWhiteStripe: false,
    hasTallBubbleScreen: false,
    hasTailSpoiler: false,
  },
  'speed-x': {
    primaryColor: 0x2563eb,
    secondaryColor: 0xe2e8f0,
    accentColor: 0x38bdf8,
    rimColor: 0x0f172a,
    rimStripeColor: 0x38bdf8,
    forkColor: 0x94a3b8,
    drlColor: 0x7dd3fc,
    roughness: 0.14,
    metalness: 0.5,
    hasAeroWinglets: false,
    hasBiplaneWings: false,
    hasUnderseatExhaust: false,
    hasGpStubExhaust: true,
    hasWhiteStripe: true,
    hasTallBubbleScreen: true,
    hasTailSpoiler: false,
  },
  'ninja-pro': {
    primaryColor: 0x16a34a,
    secondaryColor: 0x09090b,
    accentColor: 0x4ade80,
    rimColor: 0x18181b,
    rimStripeColor: 0x4ade80,
    forkColor: 0x1f2937,
    drlColor: 0xd9f99d,
    roughness: 0.15,
    metalness: 0.45,
    hasAeroWinglets: true,
    hasBiplaneWings: false,
    hasUnderseatExhaust: true,
    hasGpStubExhaust: false,
    hasWhiteStripe: false,
    hasTallBubbleScreen: true,
    hasTailSpoiler: false,
  },
  'phantom-rr': {
    primaryColor: 0x2a2d36,
    secondaryColor: 0x16181f,
    accentColor: 0xfacc15,
    rimColor: 0xeab308,
    rimStripeColor: 0xfef08a,
    forkColor: 0xfacc15,
    drlColor: 0xfde047,
    roughness: 0.28,
    metalness: 0.62,
    hasAeroWinglets: true,
    hasBiplaneWings: false,
    hasUnderseatExhaust: false,
    hasGpStubExhaust: true,
    hasWhiteStripe: false,
    hasTallBubbleScreen: true,
    hasTailSpoiler: true,
  },
  'ducati-fury': {
    primaryColor: 0xcc1428,
    secondaryColor: 0x14161c,
    accentColor: 0xfbbf24,
    rimColor: 0xd97706,
    rimStripeColor: 0xfef3c7,
    forkColor: 0xf59e0b,
    drlColor: 0xffffff,
    roughness: 0.14,
    metalness: 0.45,
    hasAeroWinglets: true,
    hasBiplaneWings: true,
    hasUnderseatExhaust: true,
    hasGpStubExhaust: false,
    hasWhiteStripe: true,
    hasTallBubbleScreen: true,
    hasTailSpoiler: true,
  },
};

function createSportsWheel(
  radius: number,
  tubeRadius: number,
  rimColor: number,
  stripeColor: number,
  spokeCount = 5
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
    metalness: 0.85,
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

  // Dual front or single brake rotor
  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(rimRadius * 0.74, rimRadius * 0.74, 0.015, 22),
    discMat
  );
  disc.rotation.z = Math.PI / 2;
  disc.position.x = tubeRadius * 0.82;
  wheel.add(disc);

  // Colored rim pinstripe
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

export function createSportsBikeModel(
  bikeId: BikeId,
  options: { withRider: boolean; shadowTexture?: THREE.Texture }
): SportsBikeRig {
  const theme = BIKE_THEMES[bikeId] ?? BIKE_THEMES['street-beast'];
  const root = new THREE.Group();
  const leanGroup = new THREE.Group();
  const pitchGroup = new THREE.Group();
  root.add(leanGroup);
  leanGroup.add(pitchGroup);

  if (options.shadowTexture) {
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.45, 2.75),
      new THREE.MeshBasicMaterial({
        map: options.shadowTexture,
        transparent: true,
        depthWrite: false,
        opacity: 0.72,
      })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.025;
    root.add(shadow);
  }

  const primaryPaint = new THREE.MeshStandardMaterial({
    color: theme.primaryColor,
    roughness: theme.roughness,
    metalness: theme.metalness,
  });
  const secondaryMat = new THREE.MeshStandardMaterial({
    color: theme.secondaryColor,
    roughness: 0.52,
    metalness: 0.28,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: theme.accentColor,
    roughness: 0.24,
    metalness: 0.6,
  });
  const satinFrame = new THREE.MeshStandardMaterial({
    color: 0x1f2937,
    roughness: 0.44,
    metalness: 0.68,
  });
  const chromeMetal = new THREE.MeshStandardMaterial({
    color: 0xe5e7eb,
    roughness: 0.16,
    metalness: 0.92,
  });
  const forkMat = new THREE.MeshStandardMaterial({
    color: theme.forkColor,
    roughness: 0.22,
    metalness: 0.85,
  });
  const visorGlass = new THREE.MeshStandardMaterial({
    color: 0x09090b,
    roughness: 0.1,
    metalness: 0.88,
  });
  const headlightMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: theme.drlColor,
    emissiveIntensity: 2.2,
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
    roughness: 0.22,
    metalness: 0.2,
  });

  // Wheels (Ducati & Phantom get 7-spoke forged look, others 5-spoke)
  const spokes = bikeId === 'ducati-fury' || bikeId === 'phantom-rr' ? 7 : 5;
  const rearTyreTube = bikeId === 'ducati-fury' ? 0.118 : 0.105;
  const rearWheel = createSportsWheel(
    0.33,
    rearTyreTube,
    theme.rimColor,
    theme.rimStripeColor,
    spokes
  );
  rearWheel.position.set(0, 0.33, 0.76);
  pitchGroup.add(rearWheel);

  // Swingarm
  if (bikeId === 'ducati-fury') {
    // Signature beefy single-sided swingarm
    const singleArm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 0.76), satinFrame);
    singleArm.position.set(-0.15, 0.35, 0.44);
    pitchGroup.add(singleArm);
  } else {
    for (const side of [-1, 1]) {
      const swing = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.07, 0.72), satinFrame);
      swing.position.set(side * 0.14, 0.36, 0.44);
      pitchGroup.add(swing);
    }
  }

  // Engine Block & Lower Belly Pan
  const engine = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.36, 0.48), satinFrame);
  engine.position.set(0, 0.44, 0.02);
  engine.castShadow = true;
  pitchGroup.add(engine);

  const bellyPan = new THREE.Mesh(
    new THREE.BoxGeometry(bikeId === 'speed-x' || bikeId === 'ducati-fury' ? 0.34 : 0.31, 0.18, 0.74),
    secondaryMat
  );
  bellyPan.position.set(0, 0.24, -0.05);
  bellyPan.rotation.x = -0.1;
  pitchGroup.add(bellyPan);

  // Exhaust Architecture (distinct per bike!)
  if (theme.hasUnderseatExhaust) {
    for (const side of [-1, 1]) {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.032, 0.56, 10), chromeMetal);
      pipe.rotation.x = Math.PI / 2 - 0.36;
      pipe.position.set(side * 0.11, 0.64, 0.52);
      pitchGroup.add(pipe);

      const can = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.044, 0.22, 12), secondaryMat);
      can.rotation.x = Math.PI / 2 - 0.22;
      can.position.set(side * 0.11, 0.78, 0.8);
      pitchGroup.add(can);
    }
  } else if (theme.hasGpStubExhaust) {
    // Short stubby MotoGP right-side titanium canister
    const header = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.032, 0.42, 10), chromeMetal);
    header.rotation.x = Math.PI / 2 - 0.28;
    header.position.set(0.19, 0.29, 0.24);
    pitchGroup.add(header);

    const stub = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.042, 0.34, 14), accentMat);
    stub.rotation.x = Math.PI / 2 - 0.34;
    stub.position.set(0.22, 0.38, 0.48);
    stub.castShadow = true;
    pitchGroup.add(stub);
  } else {
    // Twin upswept streetfighter chrome mufflers
    for (const side of [-1, 1]) {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.036, 0.65, 12), chromeMetal);
      pipe.rotation.x = Math.PI / 2 - 0.26;
      pipe.position.set(side * 0.2, 0.38, 0.52);
      pipe.castShadow = true;
      pitchGroup.add(pipe);

      const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.044, 0.12, 12), secondaryMat);
      tip.rotation.x = Math.PI / 2 - 0.26;
      tip.position.set(side * 0.2, 0.46, 0.82);
      pitchGroup.add(tip);
    }
  }

  // Sculpted Fuel Tank
  const tankShape = new THREE.Shape();
  tankShape.moveTo(-0.28, 0);
  tankShape.quadraticCurveTo(-0.22, 0.24, 0.02, 0.27);
  tankShape.quadraticCurveTo(0.24, 0.22, 0.28, 0.02);
  tankShape.lineTo(-0.28, 0);

  const tankGeo = new THREE.ExtrudeGeometry(tankShape, {
    depth: 0.35,
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
  pitchGroup.add(tank);

  // Center Tank Stripe
  const tankStripe = new THREE.Mesh(
    new THREE.BoxGeometry(0.11, 0.04, 0.46),
    theme.hasWhiteStripe ? whiteStripeMat : secondaryMat
  );
  tankStripe.position.set(0, 0.995, -0.14);
  tankStripe.rotation.x = 0.08;
  pitchGroup.add(tankStripe);

  // Side Fairings & Trellis Struts + Optional Aero Winglets
  for (const side of [-1, 1]) {
    const fairingWidth = bikeId === 'ducati-fury' || bikeId === 'speed-x' ? 0.07 : 0.055;
    const sideWing = new THREE.Mesh(new THREE.BoxGeometry(fairingWidth, 0.36, 0.6), primaryPaint);
    sideWing.position.set(side * 0.21, 0.65, -0.24);
    sideWing.rotation.x = -0.24;
    sideWing.rotation.y = side * -0.08;
    sideWing.castShadow = true;
    pitchGroup.add(sideWing);

    // Lower secondary fairing panel
    const lowerSide = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.52), secondaryMat);
    lowerSide.position.set(side * 0.2, 0.44, -0.2);
    lowerSide.rotation.x = -0.15;
    pitchGroup.add(lowerSide);

    // Exposed Trellis Frame Strut
    const strut = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.018, 0.46, 8),
      bikeId === 'phantom-rr' ? accentMat : primaryPaint
    );
    strut.rotation.x = Math.PI / 2 + 0.32;
    strut.position.set(side * 0.17, 0.67, 0.14);
    pitchGroup.add(strut);

    // Track Aero Winglets
    if (theme.hasAeroWinglets) {
      const wing1 = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.022, 0.14), secondaryMat);
      wing1.position.set(side * 0.29, 0.72, -0.44);
      wing1.rotation.z = side * -0.18;
      wing1.rotation.y = side * 0.22;
      pitchGroup.add(wing1);

      if (theme.hasBiplaneWings) {
        const wing2 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.02, 0.12), accentMat);
        wing2.position.set(side * 0.28, 0.64, -0.41);
        wing2.rotation.z = side * -0.14;
        wing2.rotation.y = side * 0.22;
        pitchGroup.add(wing2);
      }
    }
  }

  // Sport Seat & Sculpted Tail Cowl
  const riderSeat = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.08, 0.38), secondaryMat);
  riderSeat.position.set(0, 0.79, 0.26);
  riderSeat.rotation.x = -0.1;
  pitchGroup.add(riderSeat);

  const tailCowl = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, 0.54), primaryPaint);
  tailCowl.position.set(0, 0.87, 0.66);
  tailCowl.rotation.x = -0.25;
  tailCowl.castShadow = true;
  pitchGroup.add(tailCowl);

  if (theme.hasWhiteStripe) {
    const tailStripe = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.03, 0.42), whiteStripeMat);
    tailStripe.position.set(0, 0.945, 0.66);
    tailStripe.rotation.x = -0.25;
    pitchGroup.add(tailStripe);
  }

  if (theme.hasTailSpoiler) {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.025, 0.11), accentMat);
    spoiler.position.set(0, 0.99, 0.87);
    spoiler.rotation.x = -0.15;
    pitchGroup.add(spoiler);
  }

  // LED Taillight
  const taillight = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.045, 0.04), brakeLightMat);
  taillight.position.set(0, 0.91, 0.92);
  pitchGroup.add(taillight);

  // Rear Mudguard + Plate
  const plateBracket = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.22, 0.03), secondaryMat);
  plateBracket.position.set(0, 0.73, 0.92);
  plateBracket.rotation.x = 0.45;
  pitchGroup.add(plateBracket);

  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.1, 0.015),
    new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 })
  );
  plate.position.set(0, 0.66, 0.97);
  plate.rotation.x = 0.45;
  pitchGroup.add(plate);

  // Front Steering Assembly
  const steeringGroup = new THREE.Group();
  steeringGroup.position.set(0, 0.78, -0.48);
  pitchGroup.add(steeringGroup);

  const frontWheel = createSportsWheel(
    0.32,
    0.095,
    theme.rimColor,
    theme.rimStripeColor,
    spokes
  );
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

  // Front Mudguard
  const fender = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.34), primaryPaint);
  fender.position.set(0, -0.22, -0.3);
  fender.rotation.x = -0.25;
  steeringGroup.add(fender);

  // Aggressive Nose Cowl & Windscreen
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.25, 0.38), primaryPaint);
  nose.position.set(0, 0.12, -0.15);
  nose.rotation.x = 0.22;
  nose.castShadow = true;
  steeringGroup.add(nose);

  const screenHeight = theme.hasTallBubbleScreen ? 0.28 : 0.22;
  const windscreen = new THREE.Mesh(new THREE.BoxGeometry(0.29, screenHeight, 0.03), visorGlass);
  windscreen.position.set(0, theme.hasTallBubbleScreen ? 0.31 : 0.28, -0.14);
  windscreen.rotation.x = 0.68;
  steeringGroup.add(windscreen);

  // Twin LED Headlights / Ram-Air Intake
  for (const side of [-1, 1]) {
    const hlWidth = bikeId === 'ninja-pro' || bikeId === 'ducati-fury' ? 0.11 : 0.095;
    const hlHeight = bikeId === 'ninja-pro' ? 0.038 : 0.055;
    const headlight = new THREE.Mesh(new THREE.BoxGeometry(hlWidth, hlHeight, 0.04), headlightMat);
    headlight.position.set(side * 0.095, 0.1, -0.33);
    headlight.rotation.y = side * -0.18;
    headlight.rotation.z = bikeId === 'ninja-pro' || bikeId === 'ducati-fury' ? side * 0.22 : 0;
    steeringGroup.add(headlight);
  }

  if (bikeId === 'phantom-rr' || bikeId === 'ducati-fury') {
    // Center ram-air duct
    const intake = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.05), secondaryMat);
    intake.position.set(0, 0.08, -0.34);
    steeringGroup.add(intake);
  }

  // Handlebars, TFT Dash & Mirrors
  const tripleClamp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.08), secondaryMat);
  tripleClamp.position.set(0, 0.16, 0.02);
  steeringGroup.add(tripleClamp);

  const dash = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.08, 0.02),
    new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.5,
      roughness: 0.2,
    })
  );
  dash.position.set(0, 0.22, -0.05);
  dash.rotation.x = -0.45;
  steeringGroup.add(dash);

  for (const side of [-1, 1]) {
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.24, 8), satinFrame);
    bar.rotation.z = Math.PI / 2 - side * 0.14;
    bar.rotation.y = side * 0.18;
    bar.position.set(side * 0.21, 0.17, 0.04);
    steeringGroup.add(bar);

    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.13, 10), accentMat);
    grip.rotation.z = Math.PI / 2 - side * 0.14;
    grip.rotation.y = side * 0.18;
    grip.position.set(side * 0.28, 0.15, 0.06);
    steeringGroup.add(grip);

    const mirrorArm = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.14, 6), satinFrame);
    mirrorArm.position.set(side * 0.22, 0.27, -0.08);
    mirrorArm.rotation.z = side * -0.5;
    steeringGroup.add(mirrorArm);

    const mirrorHead = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.045, 0.025), secondaryMat);
    mirrorHead.position.set(side * 0.28, 0.33, -0.08);
    steeringGroup.add(mirrorHead);
  }

  // Optional Helmeted Rider (enabled on highway, hidden in luxury showroom for clean bike showcase!)
  if (options.withRider) {
    const jacketMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.68, metalness: 0.1 });
    const armorAccent = new THREE.MeshStandardMaterial({
      color: theme.accentColor,
      roughness: 0.45,
      metalness: 0.2,
    });
    const jeansMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.82 });

    const riderGroup = new THREE.Group();
    pitchGroup.add(riderGroup);

    const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, 0.22), jeansMat);
    pelvis.position.set(0, 0.86, 0.27);
    riderGroup.add(pelvis);

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.42, 0.22), jacketMat);
    torso.position.set(0, 1.12, 0.11);
    torso.rotation.x = 0.58;
    torso.castShadow = true;
    riderGroup.add(torso);

    const backHump = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.24, 0.12), armorAccent);
    backHump.position.set(0, 1.16, 0.2);
    backHump.rotation.x = 0.62;
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
    helmetGroup.position.set(0, 1.39, -0.07);
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
    root,
    leanGroup,
    pitchGroup,
    steeringGroup,
    frontWheel,
    rearWheel,
    brakeLightMat,
  };
}
