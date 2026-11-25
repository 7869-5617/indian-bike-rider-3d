import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ProceduralTextures } from './textures';

export interface TrafficRig {
  root: THREE.Group;
  wheels: THREE.Object3D[];
  halfWidth: number;
  halfLength: number;
  height: number;
}

export interface StuntRampRig {
  root: THREE.Group;
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

export type TrafficKind =
  | 'car'
  | 'auto'
  | 'bike'
  | 'truck'
  | 'taxi'
  | 'suv'
  | 'bus'
  | 'sportscar';

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

    const frontBumper = new THREE.Mesh(new THREE.BoxGeometry(2.18, 0.26, 0.22), darkTrim);
    frontBumper.position.set(0, 0.42, -3.14);
    root.add(frontBumper);

    const grille = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.56, 0.06), darkTrim);
    grille.position.set(0, 0.92, -3.14);
    root.add(grille);

    for (const side of [-1, 1]) {
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.22, 0.07), headlightMat);
      head.position.set(side * 0.78, 0.72, -3.14);
      root.add(head);

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

  if (kind === 'taxi') {
    // Classic Indian Kaali-Peeli City Taxi (black body, yellow roof & illuminated TAXI sign)
    const blackBody = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.25, metalness: 0.45 });
    const yellowRoof = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.28, metalness: 0.2 });
    const taxiSignMat = new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      emissive: 0xf59e0b,
      emissiveIntensity: 1.15,
    });

    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.15, 4.3), shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.022;
    root.add(shadow);

    const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.76, 0.56, 3.82), blackBody);
    chassis.position.set(0, 0.54, 0);
    chassis.castShadow = true;
    chassis.receiveShadow = true;
    root.add(chassis);

    const sideStripe = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.1, 3.4), yellowRoof);
    sideStripe.position.set(0, 0.62, 0);
    root.add(sideStripe);

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.52, 1.92), yellowRoof);
    cabin.position.set(0, 1.08, 0.16);
    cabin.castShadow = true;
    root.add(cabin);

    const roofBeacon = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.16, 0.22), taxiSignMat);
    roofBeacon.position.set(0, 1.42, -0.1);
    root.add(roofBeacon);

    const windshieldFront = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.4, 0.08), glassMat);
    windshieldFront.position.set(0, 1.06, -0.78);
    windshieldFront.rotation.x = 0.35;
    root.add(windshieldFront);

    const sideWindows = new THREE.Mesh(new THREE.BoxGeometry(1.51, 0.36, 1.52), glassMat);
    sideWindows.position.set(0, 1.08, 0.16);
    root.add(sideWindows);

    for (const side of [-1, 1]) {
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.14, 0.06), taillightMat);
      tail.position.set(side * 0.62, 0.64, 1.92);
      root.add(tail);

      const head = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, 0.06), headlightMat);
      head.position.set(side * 0.62, 0.6, -1.92);
      root.add(head);

      for (const zPos of [-1.16, 1.16]) {
        const wheel = createWheel(0.31, 0.1, 0xd1d5db, null);
        wheel.position.set(side * 0.85, 0.31, zPos);
        root.add(wheel);
        wheels.push(wheel);
      }
    }

    return { root, wheels, halfWidth: 0.91, halfLength: 1.94, height: 1.48 };
  }

  if (kind === 'suv') {
    const suvColors = [0xf8fafc, 0x1e293b, 0x3f3f46, 0x7c2d12, 0x065f46];
    const bodyColor = suvColors[Math.floor(Math.random() * suvColors.length)];
    const paintMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.22, metalness: 0.48 });
    const chromeMat = new THREE.MeshStandardMaterial({ color: 0xd4d4d8, roughness: 0.2, metalness: 0.88 });

    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.35, 4.9), shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.022;
    root.add(shadow);

    const lowerBody = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.72, 4.35), paintMat);
    lowerBody.position.set(0, 0.72, 0);
    lowerBody.castShadow = true;
    lowerBody.receiveShadow = true;
    root.add(lowerBody);

    const upperCabin = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.68, 2.75), paintMat);
    upperCabin.position.set(0, 1.4, 0.38);
    upperCabin.castShadow = true;
    root.add(upperCabin);

    const glassBand = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.48, 2.45), glassMat);
    glassBand.position.set(0, 1.38, 0.38);
    root.add(glassBand);

    const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.54, 0.08), glassMat);
    windshield.position.set(0, 1.36, -0.98);
    windshield.rotation.x = 0.32;
    root.add(windshield);

    const bullBar = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.24, 0.14), chromeMat);
    bullBar.position.set(0, 0.56, -2.22);
    root.add(bullBar);

    const rearSpare = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.2, 16), darkTrim);
    rearSpare.rotation.x = Math.PI / 2;
    rearSpare.position.set(0, 0.96, 2.24);
    root.add(rearSpare);

    for (const side of [-1, 1]) {
      const roofRail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 2.3), chromeMat);
      roofRail.position.set(side * 0.72, 1.78, 0.38);
      root.add(roofRail);

      const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.06), headlightMat);
      head.position.set(side * 0.68, 0.78, -2.18);
      root.add(head);

      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, 0.06), taillightMat);
      tail.position.set(side * 0.72, 0.84, 2.18);
      root.add(tail);

      for (const zPos of [-1.38, 1.38]) {
        const wheel = createWheel(0.39, 0.125, 0x9ca3af, null);
        wheel.position.set(side * 0.94, 0.39, zPos);
        root.add(wheel);
        wheels.push(wheel);
      }
    }

    return { root, wheels, halfWidth: 1.0, halfLength: 2.24, height: 1.82 };
  }

  if (kind === 'bus') {
    const busThemes = [
      { body: 0xdc2626, stripe: 0xfef3c7 },
      { body: 0x1d4ed8, stripe: 0xe2e8f0 },
      { body: 0x0f766e, stripe: 0xfde047 },
    ];
    const theme = busThemes[Math.floor(Math.random() * busThemes.length)];
    const bodyMat = new THREE.MeshStandardMaterial({ color: theme.body, roughness: 0.32, metalness: 0.28 });
    const stripeMat = new THREE.MeshStandardMaterial({ color: theme.stripe, roughness: 0.4 });

    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 8.6), shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.022;
    root.add(shadow);

    const coachBody = new THREE.Mesh(new THREE.BoxGeometry(2.34, 2.42, 7.8), bodyMat);
    coachBody.position.set(0, 1.66, 0);
    coachBody.castShadow = true;
    coachBody.receiveShadow = true;
    root.add(coachBody);

    const liveryStripe = new THREE.Mesh(new THREE.BoxGeometry(2.38, 0.34, 7.82), stripeMat);
    liveryStripe.position.set(0, 1.18, 0);
    root.add(liveryStripe);

    const sideWindows = new THREE.Mesh(new THREE.BoxGeometry(2.38, 0.78, 6.7), glassMat);
    sideWindows.position.set(0, 2.08, 0.15);
    root.add(sideWindows);

    const frontGlass = new THREE.Mesh(new THREE.BoxGeometry(2.14, 1.15, 0.08), glassMat);
    frontGlass.position.set(0, 2.0, -3.91);
    root.add(frontGlass);

    const acPod = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.26, 2.4), stripeMat);
    acPod.position.set(0, 2.98, -0.35);
    root.add(acPod);

    const bumper = new THREE.Mesh(new THREE.BoxGeometry(2.36, 0.28, 0.16), darkTrim);
    bumper.position.set(0, 0.5, -3.92);
    root.add(bumper);

    for (const side of [-1, 1]) {
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.2, 0.07), headlightMat);
      head.position.set(side * 0.84, 0.78, -3.91);
      root.add(head);

      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.24, 0.07), taillightMat);
      tail.position.set(side * 0.86, 0.84, 3.91);
      root.add(tail);

      for (const zPos of [-2.45, 2.15]) {
        const wheel = createWheel(0.46, 0.14, 0x4b5563, null);
        wheel.position.set(side * 1.14, 0.46, zPos);
        root.add(wheel);
        wheels.push(wheel);
      }
    }

    return { root, wheels, halfWidth: 1.22, halfLength: 3.95, height: 3.12 };
  }

  if (kind === 'sportscar') {
    const coupeColors = [0xe11d48, 0xf59e0b, 0x0284c7, 0x7c3aed, 0x10b981];
    const bodyColor = coupeColors[Math.floor(Math.random() * coupeColors.length)];
    const paintMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.12, metalness: 0.62 });
    const stripeMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.22, metalness: 0.35 });

    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.25, 4.4), shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.022;
    root.add(shadow);

    const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.44, 4.05), paintMat);
    chassis.position.set(0, 0.46, 0);
    chassis.castShadow = true;
    chassis.receiveShadow = true;
    root.add(chassis);

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.44, 0.42, 1.72), paintMat);
    cabin.position.set(0, 0.86, 0.15);
    cabin.castShadow = true;
    root.add(cabin);

    const racingStripe = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.03, 3.9), stripeMat);
    racingStripe.position.set(0, 0.695, 0);
    root.add(racingStripe);

    const windshieldFront = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.36, 0.08), glassMat);
    windshieldFront.position.set(0, 0.86, -0.76);
    windshieldFront.rotation.x = 0.52;
    root.add(windshieldFront);

    const sideWindows = new THREE.Mesh(new THREE.BoxGeometry(1.47, 0.28, 1.38), glassMat);
    sideWindows.position.set(0, 0.86, 0.15);
    root.add(sideWindows);

    const spoilerWing = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.06, 0.28), darkTrim);
    spoilerWing.position.set(0, 0.88, 1.84);
    root.add(spoilerWing);

    const splitter = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.07, 0.25), darkTrim);
    splitter.position.set(0, 0.22, -1.98);
    root.add(splitter);

    for (const side of [-1, 1]) {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 0.14), darkTrim);
      strut.position.set(side * 0.56, 0.76, 1.84);
      root.add(strut);

      const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 0.06), headlightMat);
      head.position.set(side * 0.66, 0.52, -2.03);
      root.add(head);

      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 0.06), taillightMat);
      tail.position.set(side * 0.62, 0.56, 2.03);
      root.add(tail);

      for (const zPos of [-1.22, 1.22]) {
        const wheel = createWheel(0.32, 0.105, 0x18181b, 0xef4444);
        wheel.position.set(side * 0.9, 0.32, zPos);
        root.add(wheel);
        wheels.push(wheel);
      }
    }

    return { root, wheels, halfWidth: 0.96, halfLength: 2.05, height: 1.18 };
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

export function createStuntRamp(textures: ProceduralTextures): StuntRampRig {
  const root = new THREE.Group();
  const width = 2.85;
  const length = 7.0;
  const height = 1.45;

  const steelMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.45,
    metalness: 0.65,
  });
  const deckMat = new THREE.MeshStandardMaterial({
    map: textures.rampSurface,
    roughness: 0.5,
    metalness: 0.25,
  });
  const lipGlowMat = new THREE.MeshStandardMaterial({
    color: 0xfef08a,
    emissive: 0xf59e0b,
    emissiveIntensity: 1.5,
    roughness: 0.2,
  });

  // Ground shadow under ramp
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(width + 0.5, length + 0.6),
    new THREE.MeshBasicMaterial({
      map: textures.contactShadow,
      transparent: true,
      depthWrite: false,
      opacity: 0.55,
    })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.022;
  root.add(shadow);

  // Extruded wedge side profile: approach at +Z (player rides in -Z direction up from +Z to -Z!)
  // Side profile X = -z (so -length/2 is high lip, +length/2 is low entry)
  const wedgeShape = new THREE.Shape();
  wedgeShape.moveTo(-length / 2, 0);
  wedgeShape.lineTo(length / 2, 0);
  wedgeShape.lineTo(length / 2, height);
  wedgeShape.lineTo(-length / 2, 0.04);
  wedgeShape.closePath();

  const wedgeGeo = new THREE.ExtrudeGeometry(wedgeShape, {
    depth: width,
    bevelEnabled: false,
  });
  wedgeGeo.center();
  // Rotate so X-axis of shape maps onto -Z (low entry at +length/2, high launch lip at -length/2)
  const wedgeMesh = new THREE.Mesh(wedgeGeo, steelMat);
  wedgeMesh.rotation.y = Math.PI / 2;
  wedgeMesh.position.y = height / 2;
  wedgeMesh.castShadow = true;
  wedgeMesh.receiveShadow = true;
  root.add(wedgeMesh);

  // Sloped top deck with chevron launch markings
  const slopeLen = Math.hypot(length, height);
  const slopeAngle = Math.atan2(height, length);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(width + 0.04, 0.08, slopeLen), deckMat);
  deck.position.set(0, height / 2 + 0.02, 0);
  deck.rotation.x = slopeAngle;
  deck.receiveShadow = true;
  root.add(deck);

  // Glowing amber launch lip bar & approach markers
  const lipBar = new THREE.Mesh(new THREE.BoxGeometry(width + 0.08, 0.1, 0.16), lipGlowMat);
  lipBar.position.set(0, height + 0.04, -length / 2 + 0.08);
  root.add(lipBar);

  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.32, 0.1), lipGlowMat);
    post.position.set(side * (width / 2 + 0.05), height + 0.16, -length / 2 + 0.08);
    root.add(post);
  }

  return {
    root,
    halfWidth: width / 2,
    halfLength: length / 2,
    height,
  };
}

export function createGoldenCoin(): THREE.Group {
  const coin = new THREE.Group();

  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xfacc15,
    emissive: 0xb45309,
    emissiveIntensity: 0.35,
    roughness: 0.18,
    metalness: 0.9,
  });
  const innerMat = new THREE.MeshStandardMaterial({
    color: 0xfef08a,
    emissive: 0xf59e0b,
    emissiveIntensity: 0.45,
    roughness: 0.22,
    metalness: 0.85,
  });

  // Main disc standing vertically facing +Z/-Z
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.1, 20), goldMat);
  disc.rotation.x = Math.PI / 2;
  disc.castShadow = true;
  coin.add(disc);

  // Raised outer rim
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.39, 0.055, 8, 22), goldMat);
  coin.add(rim);

  // Inner embossed emblem boss on both faces
  const emblem = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.125), innerMat);
  emblem.rotation.z = Math.PI / 4;
  coin.add(emblem);

  return coin;
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
