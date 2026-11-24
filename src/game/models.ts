import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ProceduralTextures } from './textures';

export interface PlayerBikeRig {
  root: THREE.Group;
  leanGroup: THREE.Group;
  pitchGroup: THREE.Group;
  steeringGroup: THREE.Group;
  frontWheel: THREE.Group;
  rearWheel: THREE.Group;
  brakeLightMat: THREE.MeshStandardMaterial;
}

export interface TrafficRig {
  root: THREE.Group;
  wheels: THREE.Object3D[];
  halfWidth: number;
  halfLength: number;
  height: number;
}

function createWheel(
  radius: number,
  tubeRadius: number,
  rimColor: number,
  accentColor: number | null
): THREE.Group {
  const wheel = new THREE.Group();

  const tyreMat = new THREE.MeshStandardMaterial({
    color: 0x18181b,
    roughness: 0.88,
    metalness: 0.05,
  });
  const rimMat = new THREE.MeshStandardMaterial({
    color: rimColor,
    roughness: 0.28,
    metalness: 0.82,
  });
  const discMat = new THREE.MeshStandardMaterial({
    color: 0x9ca3af,
    roughness: 0.22,
    metalness: 0.9,
  });

  // Outer rubber tyre (torus in YZ plane -> rotateY(Math.PI/2))
  const tyreGeo = new THREE.TorusGeometry(radius - tubeRadius, tubeRadius, 14, 28);
  const tyre = new THREE.Mesh(tyreGeo, tyreMat);
  tyre.rotation.y = Math.PI / 2;
  tyre.castShadow = true;
  wheel.add(tyre);

  // Inner alloy rim barrel
  const rimRadius = radius - tubeRadius * 1.65;
  const barrelGeo = new THREE.CylinderGeometry(rimRadius, rimRadius, tubeRadius * 1.4, 20, 1, true);
  const barrel = new THREE.Mesh(barrelGeo, rimMat);
  barrel.rotation.z = Math.PI / 2;
  wheel.add(barrel);

  // Central hub
  const hubGeo = new THREE.CylinderGeometry(rimRadius * 0.28, rimRadius * 0.28, tubeRadius * 1.7, 14);
  const hub = new THREE.Mesh(hubGeo, rimMat);
  hub.rotation.z = Math.PI / 2;
  wheel.add(hub);

  // 5 sporty spokes
  const spokeGeo = new THREE.BoxGeometry(tubeRadius * 0.55, rimRadius * 1.9, 0.028);
  for (let i = 0; i < 5; i++) {
    const spoke = new THREE.Mesh(spokeGeo, rimMat);
    spoke.rotation.x = (i * Math.PI) / 5;
    wheel.add(spoke);
  }

  // Brake disc
  const discGeo = new THREE.CylinderGeometry(rimRadius * 0.72, rimRadius * 0.72, 0.015, 20);
  const disc = new THREE.Mesh(discGeo, discMat);
  disc.rotation.z = Math.PI / 2;
  disc.position.x = tubeRadius * 0.82;
  wheel.add(disc);

  // Optional red rim pinstripe
  if (accentColor !== null) {
    const stripeMat = new THREE.MeshStandardMaterial({
      color: accentColor,
      roughness: 0.3,
      metalness: 0.4,
    });
    const stripeGeo = new THREE.TorusGeometry(rimRadius + 0.008, 0.009, 8, 28);
    const stripeL = new THREE.Mesh(stripeGeo, stripeMat);
    stripeL.rotation.y = Math.PI / 2;
    stripeL.position.x = -tubeRadius * 0.65;
    wheel.add(stripeL);

    const stripeR = stripeL.clone();
    stripeR.position.x = tubeRadius * 0.65;
    wheel.add(stripeR);
  }

  return wheel;
}

export function createPlayerBike(textures: ProceduralTextures): PlayerBikeRig {
  const root = new THREE.Group();
  const leanGroup = new THREE.Group();
  const pitchGroup = new THREE.Group();
  root.add(leanGroup);
  leanGroup.add(pitchGroup);

  // Ground contact shadow (flat on asphalt under root)
  const shadowGeo = new THREE.PlaneGeometry(1.4, 2.7);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: textures.contactShadow,
    transparent: true,
    depthWrite: false,
    opacity: 0.7,
  });
  const contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = 0.025;
  root.add(contactShadow);

  // Materials — Red & Black Sports Bike Palette
  const redPaint = new THREE.MeshStandardMaterial({
    color: 0xdc2626,
    roughness: 0.16,
    metalness: 0.42,
  });
  const darkCarbon = new THREE.MeshStandardMaterial({
    color: 0x111827,
    roughness: 0.55,
    metalness: 0.25,
  });
  const satinFrame = new THREE.MeshStandardMaterial({
    color: 0x1f2937,
    roughness: 0.45,
    metalness: 0.65,
  });
  const chromeMetal = new THREE.MeshStandardMaterial({
    color: 0xe5e7eb,
    roughness: 0.16,
    metalness: 0.92,
  });
  const goldFork = new THREE.MeshStandardMaterial({
    color: 0xd97706,
    roughness: 0.22,
    metalness: 0.85,
  });
  const visorGlass = new THREE.MeshStandardMaterial({
    color: 0x09090b,
    roughness: 0.12,
    metalness: 0.85,
  });
  const headlightMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xe0f2fe,
    emissiveIntensity: 2.2,
    roughness: 0.1,
  });
  const brakeLightMat = new THREE.MeshStandardMaterial({
    color: 0x991b1b,
    emissive: 0xef4444,
    emissiveIntensity: 0.9,
    roughness: 0.2,
  });

  // Rear Wheel (center y = 0.33, z = +0.76)
  const rearWheel = createWheel(0.33, 0.105, 0x1f2937, 0xef4444);
  rearWheel.position.set(0, 0.33, 0.76);
  pitchGroup.add(rearWheel);

  // Swingarm
  const swingGeo = new THREE.BoxGeometry(0.05, 0.07, 0.72);
  const swingL = new THREE.Mesh(swingGeo, satinFrame);
  swingL.position.set(-0.14, 0.36, 0.44);
  pitchGroup.add(swingL);
  const swingR = swingL.clone();
  swingR.position.x = 0.14;
  pitchGroup.add(swingR);

  // Engine Block & Crankcase
  const engine = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.36, 0.48), satinFrame);
  engine.position.set(0, 0.44, 0.02);
  engine.castShadow = true;
  pitchGroup.add(engine);

  const engineFin = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.2, 0.36), darkCarbon);
  engineFin.position.set(0, 0.42, 0.02);
  pitchGroup.add(engineFin);

  // Belly Pan (black aerodynamic lower fairing)
  const bellyPan = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.68), darkCarbon);
  bellyPan.position.set(0, 0.24, -0.05);
  bellyPan.rotation.x = -0.1;
  pitchGroup.add(bellyPan);

  // Twin Upswept Exhaust Mufflers (chrome + carbon tips)
  const exhaustGeo = new THREE.CylinderGeometry(0.042, 0.036, 0.65, 12);
  for (const side of [-1, 1]) {
    const pipe = new THREE.Mesh(exhaustGeo, chromeMetal);
    pipe.rotation.x = Math.PI / 2 - 0.26;
    pipe.position.set(side * 0.2, 0.38, 0.52);
    pipe.castShadow = true;
    pitchGroup.add(pipe);

    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.044, 0.12, 12), darkCarbon);
    tip.rotation.x = Math.PI / 2 - 0.26;
    tip.position.set(side * 0.2, 0.46, 0.82);
    pitchGroup.add(tip);
  }

  // Sculpted Fuel Tank (ExtrudeGeometry silhouette)
  const tankShape = new THREE.Shape();
  tankShape.moveTo(-0.28, 0);
  tankShape.quadraticCurveTo(-0.22, 0.24, 0.02, 0.26);
  tankShape.quadraticCurveTo(0.24, 0.22, 0.28, 0.02);
  tankShape.lineTo(-0.28, 0);

  const tankGeo = new THREE.ExtrudeGeometry(tankShape, {
    depth: 0.34,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.04,
    bevelSegments: 3,
  });
  tankGeo.center();
  const tank = new THREE.Mesh(tankGeo, redPaint);
  tank.rotation.y = Math.PI / 2;
  tank.position.set(0, 0.86, -0.14);
  tank.castShadow = true;
  pitchGroup.add(tank);

  // Black Center Tank Stripe
  const tankStripe = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.04, 0.46), darkCarbon);
  tankStripe.position.set(0, 0.99, -0.14);
  tankStripe.rotation.x = 0.08;
  pitchGroup.add(tankStripe);

  // Side Fairings (Red wings + Black accents)
  for (const side of [-1, 1]) {
    const sideWing = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.34, 0.56), redPaint);
    sideWing.position.set(side * 0.2, 0.65, -0.24);
    sideWing.rotation.x = -0.24;
    sideWing.rotation.y = side * -0.08;
    sideWing.castShadow = true;
    pitchGroup.add(sideWing);

    // Trellis Frame Strut
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.46, 8), redPaint);
    strut.rotation.x = Math.PI / 2 + 0.32;
    strut.position.set(side * 0.17, 0.67, 0.14);
    pitchGroup.add(strut);
  }

  // Sport Seat & Tail Cowl
  const riderSeat = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.08, 0.38), darkCarbon);
  riderSeat.position.set(0, 0.79, 0.26);
  riderSeat.rotation.x = -0.1;
  pitchGroup.add(riderSeat);

  const tailCowl = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, 0.52), redPaint);
  tailCowl.position.set(0, 0.86, 0.66);
  tailCowl.rotation.x = -0.24;
  tailCowl.castShadow = true;
  pitchGroup.add(tailCowl);

  // LED Taillight
  const taillight = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.045, 0.04), brakeLightMat);
  taillight.position.set(0, 0.91, 0.91);
  pitchGroup.add(taillight);

  // Rear Mudguard + License Plate
  const plateBracket = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.22, 0.03), darkCarbon);
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

  // Front Steering Assembly (pivots around steering stem)
  const steeringGroup = new THREE.Group();
  steeringGroup.position.set(0, 0.78, -0.48);
  pitchGroup.add(steeringGroup);

  // Front Wheel (offset relative to steeringGroup so world position is y = 0.32, z = -0.78)
  const frontWheel = createWheel(0.32, 0.095, 0x1f2937, 0xef4444);
  frontWheel.position.set(0, 0.32 - 0.78, -0.3);
  steeringGroup.add(frontWheel);

  // Twin Inverted Forks
  for (const side of [-1, 1]) {
    const upperFork = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.42, 10), goldFork);
    upperFork.position.set(side * 0.11, -0.02, -0.09);
    upperFork.rotation.x = -0.45;
    steeringGroup.add(upperFork);

    const lowerFork = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.36, 10), chromeMetal);
    lowerFork.position.set(side * 0.11, -0.3, -0.22);
    lowerFork.rotation.x = -0.45;
    steeringGroup.add(lowerFork);
  }

  // Front Fender (red)
  const fender = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.34), redPaint);
  fender.position.set(0, -0.22, -0.3);
  fender.rotation.x = -0.25;
  steeringGroup.add(fender);

  // Nose Fairing & Twin LED Headlights
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.24, 0.36), redPaint);
  nose.position.set(0, 0.12, -0.14);
  nose.rotation.x = 0.22;
  nose.castShadow = true;
  steeringGroup.add(nose);

  const windscreen = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, 0.03), visorGlass);
  windscreen.position.set(0, 0.28, -0.14);
  windscreen.rotation.x = 0.65;
  steeringGroup.add(windscreen);

  for (const side of [-1, 1]) {
    const headlight = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.055, 0.04), headlightMat);
    headlight.position.set(side * 0.09, 0.1, -0.32);
    headlight.rotation.y = side * -0.18;
    steeringGroup.add(headlight);
  }

  // Handlebars, Grips, Mirrors & Digital Dash
  const tripleClamp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.08), darkCarbon);
  tripleClamp.position.set(0, 0.16, 0.02);
  steeringGroup.add(tripleClamp);

  const dash = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.08, 0.02),
    new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.45,
      roughness: 0.2,
    })
  );
  dash.position.set(0, 0.22, -0.05);
  dash.rotation.x = -0.45;
  steeringGroup.add(dash);

  for (const side of [-1, 1]) {
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.24, 8), darkCarbon);
    bar.rotation.z = Math.PI / 2 - side * 0.14;
    bar.rotation.y = side * 0.18;
    bar.position.set(side * 0.21, 0.17, 0.04);
    steeringGroup.add(bar);

    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.13, 10), redPaint);
    grip.rotation.z = Math.PI / 2 - side * 0.14;
    grip.rotation.y = side * 0.18;
    grip.position.set(side * 0.28, 0.15, 0.06);
    steeringGroup.add(grip);

    const mirrorArm = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.14, 6), darkCarbon);
    mirrorArm.position.set(side * 0.22, 0.27, -0.08);
    mirrorArm.rotation.z = side * -0.5;
    steeringGroup.add(mirrorArm);

    const mirrorHead = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.045, 0.025), darkCarbon);
    mirrorHead.position.set(side * 0.28, 0.33, -0.08);
    steeringGroup.add(mirrorHead);
  }

  // Visible Helmeted Rider (Tucked Sport Posture)
  const jacketMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.68, metalness: 0.1 });
  const armorRed = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.45, metalness: 0.2 });
  const jeansMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.82 });

  const riderGroup = new THREE.Group();
  pitchGroup.add(riderGroup);

  // Pelvis & Torso leaning forward over tank
  const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, 0.22), jeansMat);
  pelvis.position.set(0, 0.86, 0.27);
  riderGroup.add(pelvis);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.42, 0.22), jacketMat);
  torso.position.set(0, 1.12, 0.11);
  torso.rotation.x = 0.58;
  torso.castShadow = true;
  riderGroup.add(torso);

  // Racing Red Back Hump & Chest Stripe
  const backHump = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.24, 0.12), armorRed);
  backHump.position.set(0, 1.16, 0.2);
  backHump.rotation.x = 0.62;
  riderGroup.add(backHump);

  // Legs & Boots
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

    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.08, 0.22), darkCarbon);
    boot.position.set(side * 0.18, 0.39, 0.18);
    riderGroup.add(boot);

    // Shoulder + Upper Arm + Forearm to Handlebar
    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 10), armorRed);
    shoulder.position.set(side * 0.19, 1.24, -0.02);
    riderGroup.add(shoulder);

    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.048, 0.36, 4, 8), jacketMat);
    arm.position.set(side * 0.24, 1.07, -0.22);
    arm.rotation.x = 1.05;
    arm.rotation.z = side * 0.14;
    riderGroup.add(arm);

    const glove = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), armorRed);
    glove.position.set(side * 0.28, 0.93, -0.41);
    riderGroup.add(glove);
  }

  // Racing Full-Face Helmet (Red & Black + Tinted Visor)
  const helmetGroup = new THREE.Group();
  helmetGroup.position.set(0, 1.39, -0.07);
  riderGroup.add(helmetGroup);

  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.145, 18, 16), redPaint);
  shell.scale.set(0.92, 1.02, 1.12);
  shell.castShadow = true;
  helmetGroup.add(shell);

  const helmetStripe = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.22, 0.28), darkCarbon);
  helmetStripe.position.set(0, 0.04, 0.01);
  helmetGroup.add(helmetStripe);

  const visor = new THREE.Mesh(new THREE.CylinderGeometry(0.138, 0.138, 0.095, 16, 1, false, -Math.PI * 0.42, Math.PI * 0.84), visorGlass);
  visor.rotation.y = Math.PI;
  visor.position.set(0, -0.005, -0.02);
  helmetGroup.add(visor);

  const chinGuard = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.12), darkCarbon);
  chinGuard.position.set(0, -0.08, -0.1);
  helmetGroup.add(chinGuard);

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

export type TrafficKind = 'car' | 'auto' | 'bike' | 'truck';

export function createTrafficVehicle(
  kind: TrafficKind,
  textures: ProceduralTextures
): TrafficRig {
  const root = new THREE.Group();
  const wheels: THREE.Object3D[] = [];

  const shadowMat = new THREE.MeshBasicMaterial({
    map: textures.contactShadow,
    transparent: true,
    depthWrite: false,
    opacity: 0.55,
  });

  const darkTrim = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.7, metalness: 0.15 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.15, metalness: 0.85 });
  const taillightMat = new THREE.MeshStandardMaterial({
    color: 0x991b1b,
    emissive: 0xef4444,
    emissiveIntensity: 0.8,
  });
  const headlightMat = new THREE.MeshStandardMaterial({
    color: 0xfef9c3,
    emissive: 0xfef08a,
    emissiveIntensity: 1.2,
  });

  if (kind === 'car') {
    const carColors = [0xf8fafc, 0x94a3b8, 0x2563eb, 0xea580c, 0x0f766e, 0xfacc15];
    const bodyColor = carColors[Math.floor(Math.random() * carColors.length)];
    const paintMat = new THREE.MeshStandardMaterial({
      color: bodyColor,
      roughness: 0.2,
      metalness: 0.42,
    });

    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 4.4), shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.022;
    root.add(shadow);

    const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.58, 3.85), paintMat);
    chassis.position.set(0, 0.56, 0);
    chassis.castShadow = true;
    chassis.receiveShadow = true;
    root.add(chassis);

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.54, 1.95), paintMat);
    cabin.position.set(0, 1.1, 0.18);
    cabin.castShadow = true;
    root.add(cabin);

    const windshieldFront = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.42, 0.08), glassMat);
    windshieldFront.position.set(0, 1.08, -0.78);
    windshieldFront.rotation.x = 0.35;
    root.add(windshieldFront);

    const windshieldRear = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.4, 0.08), glassMat);
    windshieldRear.position.set(0, 1.08, 1.14);
    windshieldRear.rotation.x = -0.38;
    root.add(windshieldRear);

    const sideWindows = new THREE.Mesh(new THREE.BoxGeometry(1.53, 0.38, 1.55), glassMat);
    sideWindows.position.set(0, 1.1, 0.18);
    root.add(sideWindows);

    // Bumpers & Lights
    const rearBumper = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.22, 0.16), darkTrim);
    rearBumper.position.set(0, 0.36, 1.92);
    root.add(rearBumper);

    const frontBumper = rearBumper.clone();
    frontBumper.position.z = -1.92;
    root.add(frontBumper);

    for (const side of [-1, 1]) {
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.14, 0.06), taillightMat);
      tail.position.set(side * 0.62, 0.66, 1.93);
      root.add(tail);

      const head = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, 0.06), headlightMat);
      head.position.set(side * 0.62, 0.62, -1.93);
      root.add(head);

      for (const zPos of [-1.18, 1.18]) {
        const wheel = createWheel(0.32, 0.1, 0x9ca3af, null);
        wheel.position.set(side * 0.86, 0.32, zPos);
        root.add(wheel);
        wheels.push(wheel);
      }
    }

    return { root, wheels, halfWidth: 0.92, halfLength: 1.96, height: 1.4 };
  }

  if (kind === 'auto') {
    // Iconic Indian Green & Yellow Auto-Rickshaw
    const greenMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.35, metalness: 0.25 });
    const yellowMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.4, metalness: 0.1 });
    const canopyMat = new THREE.MeshStandardMaterial({ color: 0x1c1917, roughness: 0.85 });

    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.75, 2.8), shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.022;
    root.add(shadow);

    const lowerBody = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.56, 2.15), greenMat);
    lowerBody.position.set(0, 0.5, 0.05);
    lowerBody.castShadow = true;
    root.add(lowerBody);

    const frontCowl = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.68, 0.62), greenMat);
    frontCowl.position.set(0, 0.66, -0.88);
    frontCowl.rotation.x = 0.15;
    root.add(frontCowl);

    const canopyTop = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.52, 1.85), yellowMat);
    canopyTop.position.set(0, 1.24, 0.2);
    canopyTop.castShadow = true;
    root.add(canopyTop);

    const canvasRoof = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.14, 1.9), canopyMat);
    canvasRoof.position.set(0, 1.52, 0.2);
    root.add(canvasRoof);

    const windshield = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.44, 0.06), glassMat);
    windshield.position.set(0, 1.15, -0.72);
    windshield.rotation.x = 0.2;
    root.add(windshield);

    const frontLamp = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.08, 12), headlightMat);
    frontLamp.rotation.x = Math.PI / 2;
    frontLamp.position.set(0, 0.72, -1.2);
    root.add(frontLamp);

    for (const side of [-1, 1]) {
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.05), taillightMat);
      tail.position.set(side * 0.48, 0.52, 1.13);
      root.add(tail);

      const rearW = createWheel(0.24, 0.075, 0x374151, null);
      rearW.position.set(side * 0.64, 0.24, 0.78);
      root.add(rearW);
      wheels.push(rearW);
    }

    const frontW = createWheel(0.24, 0.075, 0x374151, null);
    frontW.position.set(0, 0.24, -0.95);
    root.add(frontW);
    wheels.push(frontW);

    return { root, wheels, halfWidth: 0.72, halfLength: 1.15, height: 1.6 };
  }

  if (kind === 'truck') {
    const cabColors = [0x1d4ed8, 0xb91c1c, 0xc2410c, 0x047857];
    const cabColor = cabColors[Math.floor(Math.random() * cabColors.length)];
    const cabMat = new THREE.MeshStandardMaterial({ color: cabColor, roughness: 0.35, metalness: 0.3 });
    const cargoMat = new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.65 });
    const stripeMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.5 });

    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 6.9), shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.022;
    root.add(shadow);

    const cargo = new THREE.Mesh(new THREE.BoxGeometry(2.3, 2.25, 4.4), cargoMat);
    cargo.position.set(0, 1.68, 0.9);
    cargo.castShadow = true;
    cargo.receiveShadow = true;
    root.add(cargo);

    const rearStripe = new THREE.Mesh(new THREE.BoxGeometry(2.32, 0.36, 0.12), stripeMat);
    rearStripe.position.set(0, 1.1, 3.08);
    root.add(rearStripe);

    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.15, 1.7, 1.75), cabMat);
    cab.position.set(0, 1.38, -2.25);
    cab.castShadow = true;
    root.add(cab);

    const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.62, 0.08), glassMat);
    windshield.position.set(0, 1.7, -3.14);
    root.add(windshield);

    const bumper = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.25, 0.2), darkTrim);
    bumper.position.set(0, 0.42, 3.12);
    root.add(bumper);

    for (const side of [-1, 1]) {
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.16, 0.06), taillightMat);
      tail.position.set(side * 0.85, 0.65, 3.12);
      root.add(tail);

      for (const zPos of [-2.25, 0.55, 2.05]) {
        const w = createWheel(0.45, 0.14, 0x374151, null);
        w.position.set(side * 1.12, 0.45, zPos);
        root.add(w);
        wheels.push(w);
      }
    }

    return { root, wheels, halfWidth: 1.2, halfLength: 3.15, height: 2.8 };
  }

  // AI Commuter Motorcycle + Helmeted Rider
  const bikeColors = [0x2563eb, 0x059669, 0x64748b, 0xf59e0b];
  const bikeColor = bikeColors[Math.floor(Math.random() * bikeColors.length)];
  const bodyMat = new THREE.MeshStandardMaterial({ color: bikeColor, roughness: 0.32, metalness: 0.35 });

  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.3), shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.022;
  root.add(shadow);

  const fw = createWheel(0.29, 0.08, 0x334155, null);
  fw.position.set(0, 0.29, -0.68);
  root.add(fw);
  wheels.push(fw);

  const rw = createWheel(0.29, 0.08, 0x334155, null);
  rw.position.set(0, 0.29, 0.68);
  root.add(rw);
  wheels.push(rw);

  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.34, 0.95), darkTrim);
  frame.position.set(0, 0.52, 0);
  frame.castShadow = true;
  root.add(frame);

  const tank = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, 0.44), bodyMat);
  tank.position.set(0, 0.82, -0.18);
  root.add(tank);

  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.1, 0.58), darkTrim);
  seat.position.set(0, 0.76, 0.28);
  root.add(seat);

  const fork = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.66, 8), darkTrim);
  fork.position.set(0, 0.6, -0.52);
  fork.rotation.x = -0.35;
  root.add(fork);

  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.58, 8), darkTrim);
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, 0.92, -0.4);
  root.add(bar);

  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.06, 0.05), taillightMat);
  tail.position.set(0, 0.78, 0.76);
  root.add(tail);

  // Upright commuter rider
  const riderJacket = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.75 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.46, 0.2), riderJacket);
  torso.position.set(0, 1.08, 0.12);
  torso.rotation.x = 0.22;
  torso.castShadow = true;
  root.add(torso);

  const helmet = new THREE.Mesh(
    new THREE.SphereGeometry(0.135, 12, 12),
    new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.25 })
  );
  helmet.position.set(0, 1.44, 0.03);
  root.add(helmet);

  return { root, wheels, halfWidth: 0.34, halfLength: 0.98, height: 1.55 };
}

export function createObstacle(
  kind: 'barricade' | 'cones',
  textures: ProceduralTextures
): TrafficRig {
  const root = new THREE.Group();

  const shadowMat = new THREE.MeshBasicMaterial({
    map: textures.contactShadow,
    transparent: true,
    depthWrite: false,
    opacity: 0.5,
  });

  if (kind === 'barricade') {
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.9), shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.022;
    root.add(shadow);

    const steelMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5, metalness: 0.6 });
    const boardMat = new THREE.MeshStandardMaterial({ map: textures.barricade, roughness: 0.45 });
    const amberMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.8,
    });

    for (const side of [-0.85, 0.85]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.95, 0.45), steelMat);
      leg.position.set(side, 0.475, 0);
      leg.castShadow = true;
      root.add(leg);

      const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 10), amberMat);
      beacon.position.set(side, 1.0, 0);
      root.add(beacon);
    }

    const panel = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.48, 0.12), boardMat);
    panel.position.set(0, 0.68, 0);
    panel.castShadow = true;
    root.add(panel);

    return { root, wheels: [], halfWidth: 1.0, halfLength: 0.28, height: 1.05 };
  }

  // Group of 3 orange-white traffic cones
  const orangeMat = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.4 });
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.35 });
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.85 });

  for (const offset of [-0.55, 0, 0.55]) {
    const coneGroup = new THREE.Group();
    coneGroup.position.set(offset, 0, 0);

    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.55), shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.022;
    coneGroup.add(shadow);

    const base = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.06, 0.38), baseMat);
    base.position.y = 0.03;
    coneGroup.add(base);

    const body = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.65, 12), orangeMat);
    body.position.y = 0.36;
    body.castShadow = true;
    coneGroup.add(body);

    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.11, 0.15, 12), whiteMat);
    stripe.position.y = 0.38;
    coneGroup.add(stripe);

    root.add(coneGroup);
  }

  return { root, wheels: [], halfWidth: 0.78, halfLength: 0.25, height: 0.7 };
}

export interface ChunkMaterials {
  road: THREE.MeshStandardMaterial;
  curb: THREE.MeshLambertMaterial;
  verge: THREE.MeshLambertMaterial;
  trunk: THREE.MeshLambertMaterial;
  leaves: THREE.MeshLambertMaterial[];
  pole: THREE.MeshStandardMaterial;
  lampGlow: THREE.MeshStandardMaterial;
  electricPole: THREE.MeshLambertMaterial;
  wire: THREE.MeshBasicMaterial;
  roof: THREE.MeshLambertMaterial;
  tank: THREE.MeshLambertMaterial;
  wallWarm: THREE.MeshLambertMaterial;
  wallCool: THREE.MeshLambertMaterial;
  awningOrange: THREE.MeshLambertMaterial;
  awningBlue: THREE.MeshLambertMaterial;
  facades: THREE.MeshLambertMaterial[];
  highwaySign: THREE.MeshLambertMaterial;
  speedSign: THREE.MeshLambertMaterial;
  milestoneWhite: THREE.MeshLambertMaterial;
  milestoneYellow: THREE.MeshLambertMaterial;
}

export function createChunkMaterials(textures: ProceduralTextures): ChunkMaterials {
  return {
    road: new THREE.MeshStandardMaterial({ map: textures.asphalt, roughness: 0.9, metalness: 0.02, envMapIntensity: 0.2 }),
    curb: new THREE.MeshLambertMaterial({ color: 0xcbd5e1 }),
    verge: new THREE.MeshLambertMaterial({ map: textures.grass }),
    trunk: new THREE.MeshLambertMaterial({ color: 0x5c4033 }),
    leaves: [
      new THREE.MeshLambertMaterial({ color: 0x2f6e2d }),
      new THREE.MeshLambertMaterial({ color: 0x3d8134 }),
      new THREE.MeshLambertMaterial({ color: 0x245a25 }),
    ],
    pole: new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.45, metalness: 0.6 }),
    lampGlow: new THREE.MeshStandardMaterial({ color: 0xfef3c7, emissive: 0xfde68a, emissiveIntensity: 1.1 }),
    electricPole: new THREE.MeshLambertMaterial({ color: 0x64748b }),
    wire: new THREE.MeshBasicMaterial({ color: 0x1e293b }),
    roof: new THREE.MeshLambertMaterial({ color: 0x94a3b8 }),
    tank: new THREE.MeshLambertMaterial({ color: 0x18181b }),
    wallWarm: new THREE.MeshLambertMaterial({ color: 0xe7d8be }),
    wallCool: new THREE.MeshLambertMaterial({ color: 0xcbd5e1 }),
    awningOrange: new THREE.MeshLambertMaterial({ color: 0xea580c }),
    awningBlue: new THREE.MeshLambertMaterial({ color: 0x0284c7 }),
    facades: textures.facades.map(
      (map) => new THREE.MeshLambertMaterial({ map })
    ),
    highwaySign: new THREE.MeshLambertMaterial({ map: textures.highwaySign }),
    speedSign: new THREE.MeshLambertMaterial({ map: textures.speedSign }),
    milestoneWhite: new THREE.MeshLambertMaterial({ color: 0xf8fafc }),
    milestoneYellow: new THREE.MeshLambertMaterial({ color: 0xfacc15 }),
  };
}

function addMergedBucket(
  chunk: THREE.Group,
  geos: THREE.BufferGeometry[],
  mat: THREE.Material,
  castShadow = false,
  receiveShadow = false
): void {
  if (geos.length === 0) return;
  const merged = mergeGeometries(geos, false);
  geos.forEach((g) => g.dispose());
  if (!merged) return;
  const mesh = new THREE.Mesh(merged, mat);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  chunk.add(mesh);
}

export function createRoadChunk(
  chunkIndex: number,
  mats: ChunkMaterials,
  isSoftwareGl: boolean
): THREE.Group {
  const CHUNK_LEN = 80;
  const ROAD_WIDTH = 16.4;
  const chunk = new THREE.Group();

  // 1. Wide 4-lane Asphalt Road
  const roadGeo = new THREE.PlaneGeometry(ROAD_WIDTH, CHUNK_LEN);
  roadGeo.rotateX(-Math.PI / 2);
  const road = new THREE.Mesh(roadGeo, mats.road);
  road.receiveShadow = true;
  chunk.add(road);

  // 2. Concrete Curbs (merged)
  const curbGeos: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const cg = new THREE.BoxGeometry(0.55, 0.14, CHUNK_LEN);
    cg.translate(side * (ROAD_WIDTH / 2 + 0.27), 0.07, 0);
    curbGeos.push(cg);
  }
  addMergedBucket(chunk, curbGeos, mats.curb, false, true);

  // 3. Expansive Green Grass & Earth Verge (merged)
  const vergeWidth = 90;
  const vergeGeos: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const vg = new THREE.PlaneGeometry(vergeWidth, CHUNK_LEN);
    vg.rotateX(-Math.PI / 2);
    vg.translate(side * (ROAD_WIDTH / 2 + 0.55 + vergeWidth / 2), -0.02, 0);
    vergeGeos.push(vg);
  }
  addMergedBucket(chunk, vergeGeos, mats.verge, false, true);

  // Geometry collector buckets for ultra-low draw calls
  const poleGeos: THREE.BufferGeometry[] = [];
  const lampGeos: THREE.BufferGeometry[] = [];
  const ePoleGeos: THREE.BufferGeometry[] = [];
  const wireGeos: THREE.BufferGeometry[] = [];
  const trunkGeos: THREE.BufferGeometry[] = [];
  const leafBuckets: THREE.BufferGeometry[][] = [[], [], []];
  const tankGeos: THREE.BufferGeometry[] = [];
  const awningOrangeGeos: THREE.BufferGeometry[] = [];
  const awningBlueGeos: THREE.BufferGeometry[] = [];
  const milestoneWhiteGeos: THREE.BufferGeometry[] = [];
  const milestoneYellowGeos: THREE.BufferGeometry[] = [];

  // 4. Streetlights & Electric Poles
  for (let z = -30; z <= 30; z += 20) {
    for (const side of [-1, 1]) {
      const x = side * 9.0;
      const mast = new THREE.CylinderGeometry(0.08, 0.12, 6.2, 6);
      mast.translate(x, 3.1, z);
      poleGeos.push(mast);

      const arm = new THREE.BoxGeometry(1.6, 0.08, 0.08);
      arm.translate(x - side * 0.75, 6.1, z);
      poleGeos.push(arm);

      const head = new THREE.BoxGeometry(0.45, 0.1, 0.22);
      head.translate(x - side * 1.4, 6.02, z);
      lampGeos.push(head);
    }
  }

  for (const side of [-1, 1]) {
    for (const z of [-20, 20]) {
      const post = new THREE.BoxGeometry(0.22, 8.2, 0.22);
      post.translate(side * 12.2, 4.1, z);
      ePoleGeos.push(post);

      const crossbar = new THREE.BoxGeometry(1.8, 0.12, 0.12);
      crossbar.translate(side * 12.2, 7.7, z);
      ePoleGeos.push(crossbar);
    }
    for (const offset of [-0.65, 0, 0.65]) {
      const wire = new THREE.CylinderGeometry(0.015, 0.015, CHUNK_LEN, 4);
      wire.rotateX(Math.PI / 2);
      wire.translate(side * 12.2 + offset, 7.65, 0);
      wireGeos.push(wire);
    }
  }

  // 5. Lush Indian Roadside Trees (merged into trunk + 3 green canopy buckets)
  for (let i = 0; i < 6; i++) {
    const z = -34 + i * 13.5 + ((chunkIndex * 7 + i * 3) % 5);
    for (const side of [-1, 1]) {
      const xBase = side * (10.8 + ((i + chunkIndex) % 3) * 1.4);
      const scale = 0.85 + ((chunkIndex + i) % 4) * 0.14;
      const bucketIdx = (i + chunkIndex) % 3;

      const addTree = (tx: number, tz: number, ts: number) => {
        const trunk = new THREE.CylinderGeometry(0.18 * ts, 0.28 * ts, 2.8 * ts, 6);
        trunk.translate(tx, 1.4 * ts, tz);
        trunkGeos.push(trunk);

        const c1 = new THREE.DodecahedronGeometry(1.55 * ts, 0);
        c1.translate(tx, 3.6 * ts, tz);
        leafBuckets[bucketIdx].push(c1);

        const c2 = new THREE.DodecahedronGeometry(1.15 * ts, 0);
        c2.translate(tx + 0.7 * ts, 3.1 * ts, tz + 0.45 * ts);
        leafBuckets[bucketIdx].push(c2);

        const c3 = new THREE.DodecahedronGeometry(1.1 * ts, 0);
        c3.translate(tx - 0.65 * ts, 3.15 * ts, tz - 0.4 * ts);
        leafBuckets[bucketIdx].push(c3);
      };

      addTree(xBase, z, scale);
      addTree(side * (26 + ((i * 5 + chunkIndex) % 14)), z + 4, scale * 1.25);
    }
  }

  // 6. Indian-Style Roadside Buildings & Shops
  const buildingSlots = [-24, 8];
  for (let b = 0; b < buildingSlots.length; b++) {
    for (const side of [-1, 1]) {
      const idx = (chunkIndex + b + (side > 0 ? 1 : 0)) % mats.facades.length;
      const width = 7.5 + ((idx + b) % 2) * 2.2;
      const height = 6.8 + ((chunkIndex + b) % 3) * 1.8;
      const depth = 9.0;
      const bx = side * 18.8;
      const bz = buildingSlots[b];

      const sideWallMat = idx % 2 === 0 ? mats.wallWarm : mats.wallCool;
      const frontMat = mats.facades[idx];

      const box = new THREE.Mesh(
        new THREE.BoxGeometry(depth, height, width),
        side > 0
          ? [sideWallMat, frontMat, mats.roof, mats.roof, sideWallMat, sideWallMat]
          : [frontMat, sideWallMat, mats.roof, mats.roof, sideWallMat, sideWallMat]
      );
      box.position.set(bx, height / 2, bz);
      if (!isSoftwareGl) box.castShadow = true;
      box.receiveShadow = true;
      chunk.add(box);

      const awning = new THREE.BoxGeometry(1.6, 0.12, width * 0.9);
      awning.rotateZ(side * 0.25);
      awning.translate(bx - side * (depth / 2 + 0.7), 3.1, bz);
      if (idx % 2 === 0) awningOrangeGeos.push(awning);
      else awningBlueGeos.push(awning);

      const tank = new THREE.CylinderGeometry(0.55, 0.55, 1.1, 8);
      tank.translate(bx + side * 1.2, height + 0.55, bz + 1.4);
      tankGeos.push(tank);
    }
  }

  // 7. Highway Road Signs & Milestones
  if (chunkIndex % 2 === 0) {
    const postL = new THREE.CylinderGeometry(0.14, 0.16, 7.2, 6);
    postL.translate(-8.8, 3.6, 18);
    poleGeos.push(postL);

    const postR = new THREE.CylinderGeometry(0.14, 0.16, 7.2, 6);
    postR.translate(8.8, 3.6, 18);
    poleGeos.push(postR);

    const beam = new THREE.BoxGeometry(18.0, 0.28, 0.28);
    beam.translate(0, 7.0, 18);
    poleGeos.push(beam);

    const signBoard = new THREE.Mesh(
      new THREE.BoxGeometry(6.8, 2.3, 0.14),
      mats.highwaySign
    );
    signBoard.position.set(0, 6.9, 18.15);
    chunk.add(signBoard);
  } else {
    const post = new THREE.CylinderGeometry(0.05, 0.05, 3.0, 6);
    post.translate(9.4, 1.5, -10);
    poleGeos.push(post);

    const backing = new THREE.CylinderGeometry(0.56, 0.56, 0.04, 16);
    backing.rotateX(Math.PI / 2);
    backing.translate(9.4, 2.8, -10);
    poleGeos.push(backing);

    const signFace = new THREE.Mesh(
      new THREE.CircleGeometry(0.54, 18),
      mats.speedSign
    );
    signFace.position.set(9.4, 2.8, -9.975);
    chunk.add(signFace);
  }

  // NH Kilometer Stone
  const msBase = new THREE.BoxGeometry(0.45, 0.45, 0.24);
  msBase.translate(9.2, 0.225, 26);
  milestoneWhiteGeos.push(msBase);

  const msTop = new THREE.BoxGeometry(0.45, 0.28, 0.24);
  msTop.translate(9.2, 0.59, 26);
  milestoneYellowGeos.push(msTop);

  // Flush merged buckets
  addMergedBucket(chunk, poleGeos, mats.pole, !isSoftwareGl, false);
  addMergedBucket(chunk, lampGeos, mats.lampGlow, false, false);
  addMergedBucket(chunk, ePoleGeos, mats.electricPole, false, false);
  addMergedBucket(chunk, wireGeos, mats.wire, false, false);
  addMergedBucket(chunk, trunkGeos, mats.trunk, !isSoftwareGl, false);
  for (let b = 0; b < 3; b++) {
    addMergedBucket(chunk, leafBuckets[b], mats.leaves[b], !isSoftwareGl, false);
  }
  addMergedBucket(chunk, tankGeos, mats.tank, false, false);
  addMergedBucket(chunk, awningOrangeGeos, mats.awningOrange, false, false);
  addMergedBucket(chunk, awningBlueGeos, mats.awningBlue, false, false);
  addMergedBucket(chunk, milestoneWhiteGeos, mats.milestoneWhite, false, false);
  addMergedBucket(chunk, milestoneYellowGeos, mats.milestoneYellow, false, false);

  return chunk;
}
