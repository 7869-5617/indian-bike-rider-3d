import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { SoundEngine } from './audio';
import {
  createSportsBikeModel,
  getBikeSpec,
  loadPurchasedBikes,
  loadSelectedBikeId,
  loadStoredCoins,
  saveStoredCoins,
  SportsBikeRig,
} from './bikes';
import {
  createChunkMaterials,
  createObstacle,
  createRoadChunk,
  createTrafficVehicle,
  TrafficKind,
  TrafficRig,
} from './models';
import { createProceduralTextures, ProceduralTextures } from './textures';
import { BikeId, BikeSpec, GameState, GameTelemetry, InputState } from './types';

const CHUNK_LEN = 80;
const NUM_CHUNKS = 6;
const LANES = [-5.5, -1.85, 1.85, 5.5];
const ROAD_LIMIT_X = 6.9;
const BEST_SCORE_KEY = 'indian_bike_rider_3d_best_score';

const _vec3A = new THREE.Vector3();
const _vec3B = new THREE.Vector3();

interface ActiveEntity {
  rig: TrafficRig;
  x: number;
  z: number;
  speedMs: number;
  isObstacle: boolean;
  nearMissAwarded: boolean;
}

export interface EngineCallbacks {
  onTelemetry: (telemetry: GameTelemetry) => void;
  onGameOver: (telemetry: GameTelemetry) => void;
  onContextError?: (message: string) => void;
}

function detectSoftwareWebGL(): boolean {
  try {
    const probeCanvas = document.createElement('canvas');
    const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) ?? '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export class BikeGameEngine {
  private container: HTMLElement;
  private callbacks: EngineCallbacks;
  public readonly sound: SoundEngine;

  private isSoftwareGl: boolean;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private sunLight: THREE.DirectionalLight;
  private textures: ProceduralTextures;

  private playerRig: SportsBikeRig;
  private selectedBikeId: BikeId;
  private selectedBikeSpec: BikeSpec;
  private chunks: THREE.Group[] = [];
  private entities: ActiveEntity[] = [];

  private input: InputState = {
    accelerate: false,
    brake: false,
    left: false,
    right: false,
  };

  private gameState: GameState = 'menu';
  private suspended = false;
  private speedKmh = 0;
  private peakSpeedKmh = 0;
  private playerX = 1.85;
  private lateralVel = 0;
  private steerVisual = 0;
  private leanVisual = 0;
  private pitchVisual = 0;
  private cameraShake = 0;

  private distanceM = 0;
  private highSpeedDistanceM = 0;
  private score = 0;
  private bestScore = 0;
  private coins = 0;
  private runCoinsEarned = 0;
  private runCoinsBanked = false;
  private nearMisses = 0;
  private isNewBest = false;
  private spawnTimer = 0;
  private uiEmitTimer = 0;
  private menuCruiseTime = 0;

  private frameId = 0;
  private lastTime = 0;
  private disposed = false;

  constructor(container: HTMLElement, callbacks: EngineCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.sound = new SoundEngine();
    this.bestScore = this.loadBestScore();
    this.coins = loadStoredCoins();
    const owned = loadPurchasedBikes();
    this.selectedBikeId = loadSelectedBikeId(owned);
    this.selectedBikeSpec = getBikeSpec(this.selectedBikeId);

    this.isSoftwareGl = detectSoftwareWebGL();

    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2)
    );
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';

    container.appendChild(this.renderer.domElement);

    // WebGL context listeners
    this.renderer.domElement.addEventListener('webglcontextlost', this.handleContextLost);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.handleContextRestored);

    // Scene & bright sunny Indian sky + horizon fog
    this.scene = new THREE.Scene();
    const skyColor = new THREE.Color(0x6ec3f4);
    this.scene.background = skyColor;
    this.scene.fog = new THREE.Fog(0x9bd8fa, 95, 295);

    // Mandatory RoomEnvironment PBR reflections
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    // Camera
    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.2, 420);
    this.camera.position.set(this.playerX, 2.2, 4.7);
    this.camera.lookAt(this.playerX, 1.0, -8);

    // Lighting Rig (Warm Sun + Cool Sky Hemisphere)
    const hemiLight = new THREE.HemisphereLight(0x9bd8fa, 0x5c6b4d, 0.95);
    hemiLight.position.set(0, 50, 0);
    this.scene.add(hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfff5e0, 2.15);
    this.sunLight.position.set(22, 34, 18);
    this.sunLight.castShadow = !this.isSoftwareGl;
    this.sunLight.shadow.mapSize.width = 1024;
    this.sunLight.shadow.mapSize.height = 1024;
    this.sunLight.shadow.camera.near = 2;
    this.sunLight.shadow.camera.far = 95;
    this.sunLight.shadow.camera.left = -22;
    this.sunLight.shadow.camera.right = 22;
    this.sunLight.shadow.camera.top = 24;
    this.sunLight.shadow.camera.bottom = -20;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.02;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    // Procedural Textures
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.textures = createProceduralTextures(maxAniso);

    // Distant warm sun sphere & horizon backdrop clouds
    this.buildSkyDetails();

    // Road Chunks (covering +80 to -320 along Z) with shared materials
    const chunkMats = createChunkMaterials(this.textures);
    for (let i = 0; i < NUM_CHUNKS; i++) {
      const chunk = createRoadChunk(i, chunkMats, this.isSoftwareGl);
      chunk.position.z = CHUNK_LEN - i * CHUNK_LEN;
      this.chunks.push(chunk);
      this.scene.add(chunk);
    }

    // Player Sports Motorcycle + Rider
    this.playerRig = createSportsBikeModel(this.selectedBikeId, {
      withRider: true,
      shadowTexture: this.textures.contactShadow,
    });
    this.playerRig.root.position.set(this.playerX, 0, 0);
    this.scene.add(this.playerRig.root);

    // Seed initial background traffic for visual life on main menu
    this.seedMenuTraffic();

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    window.addEventListener('resize', this.handleResize);

    this.emitTelemetry();
    this.lastTime = performance.now();
    this.startLoop();
  }

  private buildSkyDetails(): void {
    const sunDisc = new THREE.Mesh(
      new THREE.CircleGeometry(14, 24),
      new THREE.MeshBasicMaterial({ color: 0xfffbeb, fog: false })
    );
    sunDisc.position.set(78, 88, -280);
    this.scene.add(sunDisc);

    const cloudMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.85,
      fog: false,
    });
    const cloudPositions = [
      [-85, 58, -220, 1.4],
      [-25, 68, -250, 1.1],
      [42, 62, -235, 1.3],
      [110, 54, -210, 1.5],
    ];
    for (const [cx, cy, cz, scale] of cloudPositions) {
      const cloud = new THREE.Group();
      cloud.position.set(cx, cy, cz);
      cloud.scale.setScalar(scale);
      const p1 = new THREE.Mesh(new THREE.SphereGeometry(8, 10, 8), cloudMat);
      p1.scale.set(1.8, 0.7, 0.7);
      const p2 = new THREE.Mesh(new THREE.SphereGeometry(6.5, 10, 8), cloudMat);
      p2.position.set(8, -1.2, 0);
      p2.scale.set(1.4, 0.65, 0.7);
      const p3 = new THREE.Mesh(new THREE.SphereGeometry(6, 10, 8), cloudMat);
      p3.position.set(-8, -1.5, 0);
      p3.scale.set(1.3, 0.6, 0.7);
      cloud.add(p1, p2, p3);
      this.scene.add(cloud);
    }
  }

  private loadBestScore(): number {
    try {
      const raw = localStorage.getItem(BEST_SCORE_KEY);
      const parsed = raw ? parseInt(raw, 10) : 0;
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    } catch {
      return 0;
    }
  }

  private saveBestScore(val: number): void {
    try {
      localStorage.setItem(BEST_SCORE_KEY, String(val));
    } catch {
      // Ignore storage quota / private mode issues
    }
  }

  private handleContextLost = (e: Event): void => {
    e.preventDefault();
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.callbacks.onContextError?.('Graphics context was lost. Restoring...');
  };

  private handleContextRestored = (): void => {
    this.lastTime = performance.now();
    this.startLoop();
  };

  private handleResize = (): void => {
    if (this.disposed) return;
    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2)
    );
  };

  public setInput(partial: Partial<InputState>): void {
    Object.assign(this.input, partial);
  }

  public clearInput(): void {
    this.input.accelerate = false;
    this.input.brake = false;
    this.input.left = false;
    this.input.right = false;
  }

  private disposeObjectHierarchy(root: THREE.Object3D): void {
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

  public setSelectedBike(bikeId: BikeId): void {
    if (this.disposed || this.selectedBikeId === bikeId) return;
    this.selectedBikeId = bikeId;
    this.selectedBikeSpec = getBikeSpec(bikeId);

    this.scene.remove(this.playerRig.root);
    this.disposeObjectHierarchy(this.playerRig.root);

    this.playerRig = createSportsBikeModel(bikeId, {
      withRider: true,
      shadowTexture: this.textures.contactShadow,
    });
    this.playerRig.root.position.set(this.playerX, 0, 0);
    this.playerRig.leanGroup.rotation.z = this.leanVisual;
    this.playerRig.steeringGroup.rotation.y = this.steerVisual;
    this.playerRig.pitchGroup.rotation.x = this.pitchVisual;
    this.scene.add(this.playerRig.root);
  }

  public setCoins(coins: number): void {
    this.coins = Math.max(0, Math.floor(coins));
    this.emitTelemetry();
  }

  public setSuspended(suspended: boolean): void {
    if (this.disposed || this.suspended === suspended) return;
    this.suspended = suspended;
    if (suspended) {
      cancelAnimationFrame(this.frameId);
      clearTimeout(this.frameId);
      this.clearInput();
      this.sound.updateEngine(0, false, false);
    } else {
      this.lastTime = performance.now();
      this.startLoop();
    }
  }

  private bankRunCoins(): void {
    if (!this.runCoinsBanked && this.runCoinsEarned > 0) {
      this.runCoinsBanked = true;
      this.coins += this.runCoinsEarned;
      saveStoredCoins(this.coins);
    }
  }

  public startGame(): void {
    this.sound.unlock();
    if (this.gameState === 'playing' || this.gameState === 'paused') {
      this.bankRunCoins();
    }
    this.clearEntities();
    this.clearInput();

    this.playerX = 1.85;
    this.lateralVel = 0;
    this.speedKmh = 24; // Smooth rolling launch so player immediately feels momentum
    this.peakSpeedKmh = 24;
    this.steerVisual = 0;
    this.leanVisual = 0;
    this.pitchVisual = 0;
    this.cameraShake = 0;

    this.distanceM = 0;
    this.highSpeedDistanceM = 0;
    this.score = 0;
    this.runCoinsEarned = 0;
    this.runCoinsBanked = false;
    this.nearMisses = 0;
    this.isNewBest = false;
    this.spawnTimer = 0.6;
    this.gameState = 'playing';

    this.playerRig.root.position.set(this.playerX, 0, 0);
    this.playerRig.leanGroup.rotation.set(0, 0, 0);
    this.playerRig.pitchGroup.rotation.set(0, 0, 0);
    this.playerRig.steeringGroup.rotation.set(0, 0, 0);

    // Pre-populate a few safe traffic vehicles far ahead down the road
    this.spawnAheadWave(-105);
    this.spawnAheadWave(-165);
    this.spawnAheadWave(-225);

    this.emitTelemetry();
  }

  public pauseGame(): void {
    if (this.gameState !== 'playing') return;
    this.gameState = 'paused';
    this.clearInput();
    this.sound.updateEngine(0, false, false);
  }

  public resumeGame(): void {
    if (this.gameState !== 'paused') return;
    this.sound.unlock();
    this.gameState = 'playing';
    this.lastTime = performance.now();
  }

  public returnToMenu(): void {
    if (this.gameState === 'playing' || this.gameState === 'paused') {
      this.bankRunCoins();
    }
    this.gameState = 'menu';
    this.clearInput();
    this.clearEntities();
    this.playerX = 1.85;
    this.speedKmh = 0;
    this.peakSpeedKmh = 0;
    this.highSpeedDistanceM = 0;
    this.runCoinsEarned = 0;
    this.leanVisual = 0;
    this.steerVisual = 0;
    this.pitchVisual = 0;
    this.playerRig.root.position.set(this.playerX, 0, 0);
    this.seedMenuTraffic();
    this.sound.updateEngine(0, false, false);
    this.emitTelemetry();
  }

  private clearEntities(): void {
    for (const ent of this.entities) {
      this.scene.remove(ent.rig.root);
    }
    this.entities.length = 0;
  }

  private seedMenuTraffic(): void {
    const menuSpecs: Array<{ kind: TrafficKind; lane: number; z: number; speedMs: number }> = [
      { kind: 'car', lane: 0, z: -48, speedMs: 14 },
      { kind: 'auto', lane: 1, z: -85, speedMs: 11 },
      { kind: 'truck', lane: 0, z: -135, speedMs: 12 },
      { kind: 'bike', lane: 3, z: -62, speedMs: 18 },
      { kind: 'car', lane: 2, z: -155, speedMs: 19 },
    ];
    for (const spec of menuSpecs) {
      const rig = createTrafficVehicle(spec.kind, this.textures);
      const x = LANES[spec.lane];
      rig.root.position.set(x, 0, spec.z);
      this.scene.add(rig.root);
      this.entities.push({
        rig,
        x,
        z: spec.z,
        speedMs: spec.speedMs,
        isObstacle: false,
        nearMissAwarded: false,
      });
    }
  }

  private getDifficultyLevel(): number {
    return 1 + Math.floor(this.distanceM / 350);
  }

  private isLaneOccupiedNear(laneX: number, targetZ: number, minGap: number): boolean {
    for (const ent of this.entities) {
      if (Math.abs(ent.x - laneX) < 1.2 && Math.abs(ent.z - targetZ) < minGap) {
        return true;
      }
    }
    return false;
  }

  private countEntitiesInZBand(targetZ: number, bandHalf: number): number {
    let count = 0;
    for (const ent of this.entities) {
      if (Math.abs(ent.z - targetZ) <= bandHalf) {
        count++;
      }
    }
    return count;
  }

  private spawnAheadWave(spawnZ: number): void {
    const level = this.getDifficultyLevel();
    const maxEntities = Math.min(8 + level * 2, 18);
    if (this.entities.length >= maxEntities) return;

    // Never block more than 2 lanes in the same Z band so player always has clean room to weave
    if (this.countEntitiesInZBand(spawnZ, 18) >= 2) return;

    // Pick a random lane that isn't occupied nearby
    const shuffledLanes = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
    for (const laneIdx of shuffledLanes) {
      const laneX = LANES[laneIdx];
      if (this.isLaneOccupiedNear(laneX, spawnZ, 30)) continue;

      const obstacleChance = Math.min(0.14 + (level - 1) * 0.028, 0.3);
      const spawnAsObstacle = Math.random() < obstacleChance;

      if (spawnAsObstacle) {
        const obsKind = Math.random() < 0.5 ? 'barricade' : 'cones';
        const rig = createObstacle(obsKind, this.textures);
        rig.root.position.set(laneX, 0, spawnZ);
        this.scene.add(rig.root);
        this.entities.push({
          rig,
          x: laneX,
          z: spawnZ,
          speedMs: 0,
          isObstacle: true,
          nearMissAwarded: false,
        });
      } else {
        let kind: TrafficKind;
        let baseSpeedKmh: number;
        if (laneIdx <= 1) {
          // Left highway lanes: autos, trucks, cars
          const r = Math.random();
          if (r < 0.32) {
            kind = 'auto';
            baseSpeedKmh = 36 + Math.random() * 14;
          } else if (r < 0.58) {
            kind = 'truck';
            baseSpeedKmh = 42 + Math.random() * 14;
          } else if (r < 0.85) {
            kind = 'car';
            baseSpeedKmh = 52 + Math.random() * 20;
          } else {
            kind = 'bike';
            baseSpeedKmh = 48 + Math.random() * 18;
          }
        } else {
          // Right overtaking lanes: cars, bikes, occasional auto
          const r = Math.random();
          if (r < 0.52) {
            kind = 'car';
            baseSpeedKmh = 68 + Math.random() * 26;
          } else if (r < 0.85) {
            kind = 'bike';
            baseSpeedKmh = 62 + Math.random() * 28;
          } else {
            kind = 'auto';
            baseSpeedKmh = 44 + Math.random() * 12;
          }
        }

        const speedBoost = Math.min((level - 1) * 2.5, 18);
        const speedMs = (baseSpeedKmh + speedBoost) / 3.6;

        const rig = createTrafficVehicle(kind, this.textures);
        rig.root.position.set(laneX, 0, spawnZ);
        this.scene.add(rig.root);
        this.entities.push({
          rig,
          x: laneX,
          z: spawnZ,
          speedMs,
          isObstacle: false,
          nearMissAwarded: false,
        });
      }
      break;
    }
  }

  private startLoop(): void {
    if (this.suspended || this.disposed) return;
    const tick = (now: number) => {
      if (this.disposed || this.suspended) return;
      const rawDt = Math.max((now - this.lastTime) / 1000, 0.001);
      this.lastTime = now;

      let remaining = Math.min(rawDt, 0.5);
      while (remaining > 0.0001) {
        const step = Math.min(remaining, 0.04);
        this.update(step);
        remaining -= step;
      }
      this.renderer.render(this.scene, this.camera);

      if (this.isSoftwareGl) {
        this.afterDraw(tick);
      } else {
        this.frameId = requestAnimationFrame(tick);
      }
    };

    if (this.isSoftwareGl) {
      this.frameId = window.setTimeout(() => tick(performance.now()), 16);
    } else {
      this.frameId = requestAnimationFrame(tick);
    }
  }

  private afterDraw(cb: (now: number) => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (!gl || typeof gl.fenceSync !== 'function') {
      this.frameId = window.setTimeout(() => cb(performance.now()), 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(() => cb(performance.now()), 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private update(dt: number): void {
    if (this.gameState === 'paused') {
      return;
    }

    if (this.gameState === 'menu') {
      this.updateMenuCruise(dt);
      return;
    }

    if (this.gameState === 'gameover') {
      this.updateGameOverIdle(dt);
      return;
    }

    // --- ACTIVE GAMEPLAY ---
    const level = this.getDifficultyLevel();
    const maxSpeedKmh = Math.min(this.selectedBikeSpec.topSpeedKmh + (level - 1) * 5, 295);

    let targetPitch = 0;
    if (this.input.accelerate && !this.input.brake) {
      const accelRate =
        THREE.MathUtils.lerp(56, 20, this.speedKmh / maxSpeedKmh) *
        this.selectedBikeSpec.accelMultiplier;
      this.speedKmh = Math.min(maxSpeedKmh, this.speedKmh + accelRate * dt);
      targetPitch = 0.045; // Subtle wheelie squat under hard throttle
      this.playerRig.brakeLightMat.emissiveIntensity = 0.9;
    } else if (this.input.brake) {
      this.speedKmh = Math.max(0, this.speedKmh - 125 * dt);
      targetPitch = this.speedKmh > 2 ? -0.075 : 0; // Front fork dive under braking
      this.playerRig.brakeLightMat.emissiveIntensity = 3.6;
    } else {
      // Natural rolling coasting drag
      this.speedKmh = Math.max(0, this.speedKmh - 14 * dt);
      targetPitch = 0;
      this.playerRig.brakeLightMat.emissiveIntensity = 0.9;
    }

    const speedMs = this.speedKmh / 3.6;

    // Steering & Lateral Kinematics
    const steerInput = (this.input.left ? -1 : 0) + (this.input.right ? 1 : 0);
    // Keep responsive steering even at low speed, strongest at cruising/highway speed
    const steerCapability =
      (4.5 + Math.min(this.speedKmh / 140, 1) * 5.8) *
      this.selectedBikeSpec.handlingMultiplier;
    const targetLatVel = steerInput * steerCapability;
    this.lateralVel = THREE.MathUtils.damp(this.lateralVel, targetLatVel, 11, dt);
    this.playerX = THREE.MathUtils.clamp(
      this.playerX + this.lateralVel * dt,
      -ROAD_LIMIT_X,
      ROAD_LIMIT_X
    );

    // Clamp lateral velocity if hitting curb edge
    if (
      (this.playerX <= -ROAD_LIMIT_X && this.lateralVel < 0) ||
      (this.playerX >= ROAD_LIMIT_X && this.lateralVel > 0)
    ) {
      this.lateralVel = 0;
    }

    // Bike Lean & Front Fork Steering Animation
    // Moving left (-X) leans left (leanGroup.rotation.z > 0) and turns front fork left (rotation.y > 0)
    const leanFactor = 0.4 + Math.min(this.speedKmh / 100, 1) * 0.6;
    const targetLean = -steerInput * 0.38 * leanFactor;
    const targetSteer = -steerInput * 0.24;

    this.leanVisual = THREE.MathUtils.damp(this.leanVisual, targetLean, 9.5, dt);
    this.steerVisual = THREE.MathUtils.damp(this.steerVisual, targetSteer, 12, dt);
    this.pitchVisual = THREE.MathUtils.damp(this.pitchVisual, targetPitch, 9, dt);

    this.playerRig.root.position.x = this.playerX;
    this.playerRig.leanGroup.rotation.z = this.leanVisual;
    this.playerRig.steeringGroup.rotation.y = this.steerVisual;
    this.playerRig.pitchGroup.rotation.x = this.pitchVisual;

    // Wheel Rotation
    const frontWheelSpin = (speedMs / 0.32) * dt;
    const rearWheelSpin = (speedMs / 0.33) * dt;
    this.playerRig.frontWheel.rotation.x -= frontWheelSpin;
    this.playerRig.rearWheel.rotation.x -= rearWheelSpin;

    // Distance, Peak Speed, Score & Coin Accumulation
    if (this.speedKmh > this.peakSpeedKmh) {
      this.peakSpeedKmh = this.speedKmh;
    }
    const deltaDist = speedMs * dt;
    this.distanceM += deltaDist;
    if (this.speedKmh >= 120) {
      this.highSpeedDistanceM += deltaDist;
    }
    this.score += deltaDist * (1 + (level - 1) * 0.15);
    this.runCoinsEarned = Math.floor(this.distanceM) + this.nearMisses * 50;

    const intScore = Math.floor(this.score);
    if (intScore > this.bestScore) {
      this.bestScore = intScore;
      this.isNewBest = true;
    }

    // Advance & Recycle Road Chunks
    this.advanceRoadChunks(deltaDist);

    // Spawn Traffic & Obstacles
    this.spawnTimer -= dt * (0.65 + (speedMs / 35) + (level - 1) * 0.12);
    if (this.spawnTimer <= 0) {
      this.spawnAheadWave(-235 - Math.random() * 35);
      this.spawnTimer = Math.max(0.45, 1.35 - (level - 1) * 0.09);
    }

    // Advance Traffic Entities & Check Collisions
    const playerHalfW = 0.32;
    const playerHalfL = 0.88;

    for (let i = this.entities.length - 1; i >= 0; i--) {
      const ent = this.entities[i];
      // Traffic moves forward (-Z), player moves forward (-Z) at speedMs -> relative motion along +Z is (speedMs - ent.speedMs)
      ent.z += (speedMs - ent.speedMs) * dt;
      ent.rig.root.position.z = ent.z;

      // Spin traffic wheels
      if (!ent.isObstacle && ent.rig.wheels.length > 0) {
        const wSpin = (ent.speedMs / 0.32) * dt;
        for (const w of ent.rig.wheels) {
          w.rotation.x -= wSpin;
        }
      }

      // Collision Check (AABB)
      const hitX = Math.abs(this.playerX - ent.x) < playerHalfW + ent.rig.halfWidth - 0.06;
      const hitZ = Math.abs(ent.z) < playerHalfL + ent.rig.halfLength - 0.08;
      if (hitX && hitZ) {
        this.triggerCrash();
        return;
      }

      // Near-Miss Overtake Bonus
      if (!ent.nearMissAwarded && ent.z > 1.35) {
        ent.nearMissAwarded = true;
        if (
          !ent.isObstacle &&
          this.speedKmh >= 55 &&
          Math.abs(this.playerX - ent.x) < ent.rig.halfWidth + 1.15
        ) {
          this.nearMisses += 1;
          this.score += 50;
          this.runCoinsEarned = Math.floor(this.distanceM) + this.nearMisses * 50;
          this.sound.playNearMiss();
        }
      }

      // Recycle if behind camera or far ahead
      if (ent.z > 24 || ent.z < -310) {
        this.scene.remove(ent.rig.root);
        this.entities.splice(i, 1);
      }
    }

    // Update Chase Camera (Smooth damping + subtle steering sway + speed FOV)
    this.updateChaseCamera(dt, speedMs);

    // Update Engine Audio
    this.sound.updateEngine(this.speedKmh, this.input.accelerate, true);

    // Emit HUD Telemetry at ~20Hz to keep React ultra-fast
    this.uiEmitTimer += dt;
    if (this.uiEmitTimer >= 0.05) {
      this.uiEmitTimer = 0;
      this.emitTelemetry();
    }
  }

  private updateMenuCruise(dt: number): void {
    this.menuCruiseTime += dt;
    const cruiseSpeedMs = 17.5; // ~63 km/h gentle scenic ride
    const deltaDist = cruiseSpeedMs * dt;

    this.advanceRoadChunks(deltaDist);
    this.playerRig.frontWheel.rotation.x -= (cruiseSpeedMs / 0.32) * dt;
    this.playerRig.rearWheel.rotation.x -= (cruiseSpeedMs / 0.33) * dt;

    // Gentle lane weaving on main menu preview
    const sway = Math.sin(this.menuCruiseTime * 0.55) * 1.4;
    this.playerX = 1.85 + sway;
    const swaySlope = Math.cos(this.menuCruiseTime * 0.55) * 0.14;
    this.playerRig.root.position.x = this.playerX;
    this.playerRig.leanGroup.rotation.z = -swaySlope;
    this.playerRig.steeringGroup.rotation.y = -swaySlope * 0.5;

    for (let i = this.entities.length - 1; i >= 0; i--) {
      const ent = this.entities[i];
      ent.z += (cruiseSpeedMs - ent.speedMs) * dt;
      if (ent.z > 24) {
        ent.z -= 200;
      }
      ent.rig.root.position.z = ent.z;
      for (const w of ent.rig.wheels) {
        w.rotation.x -= (ent.speedMs / 0.32) * dt;
      }
    }

    // Scenic orbit-biased chase camera on menu
    const targetCamX = this.playerX + Math.sin(this.menuCruiseTime * 0.35) * 1.25;
    this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, targetCamX, 4, dt);
    this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, 2.05, 4, dt);
    this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, 4.65, 4, dt);
    _vec3A.set(this.playerX * 0.9, 0.95, -5.0);
    this.camera.lookAt(_vec3A);
  }

  private updateGameOverIdle(dt: number): void {
    this.cameraShake = THREE.MathUtils.damp(this.cameraShake, 0, 7, dt);
    const shakeX = (Math.random() - 0.5) * this.cameraShake;
    const shakeY = (Math.random() - 0.5) * this.cameraShake;

    this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, this.playerX + 1.5, 3, dt) + shakeX;
    this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, 2.4, 3, dt) + shakeY;
    this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, 5.4, 3, dt);
    _vec3A.set(this.playerX, 0.75, 0);
    this.camera.lookAt(_vec3A);
  }

  private advanceRoadChunks(deltaDist: number): void {
    const totalLength = CHUNK_LEN * NUM_CHUNKS;
    for (const chunk of this.chunks) {
      chunk.position.z += deltaDist;
      if (chunk.position.z > CHUNK_LEN * 1.2) {
        chunk.position.z -= totalLength;
      }
    }
  }

  private updateChaseCamera(dt: number, speedMs: number): void {
    const speedRatio = Math.min(speedMs / (210 / 3.6), 1);

    // Smooth camera position following with slight lag behind lateral bike lean
    const targetCamX = this.playerX - this.leanVisual * 1.35;
    const targetCamY = 2.08 - speedRatio * 0.14;
    const targetCamZ = 4.65 - speedRatio * 0.45;

    this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, targetCamX, 8.5, dt);
    this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, targetCamY, 7, dt);
    this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, targetCamZ, 7, dt);

    // Look ahead along the road keeping the bike clearly framed in lower-center viewport
    _vec3B.set(this.playerX * 0.88, 0.92, -8.5);
    this.camera.lookAt(_vec3B);

    // Slight horizon banking during steering
    this.camera.rotation.z += this.leanVisual * 0.12;

    // Dynamic speed FOV widening
    const targetFov = 58 + speedRatio * 15;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 5, dt);
      this.camera.updateProjectionMatrix();
    }

    // Keep shadow frustum centered near player
    this.sunLight.position.set(this.playerX + 22, 34, 14);
    this.sunLight.target.position.set(this.playerX, 0, -14);
    this.sunLight.target.updateMatrixWorld();
  }

  private triggerCrash(): void {
    this.gameState = 'gameover';
    this.speedKmh = 0;
    this.cameraShake = 0.55;
    this.clearInput();
    this.sound.updateEngine(0, false, false);
    this.sound.playCrash();

    const finalScore = Math.floor(this.score);
    if (finalScore >= this.bestScore) {
      this.bestScore = finalScore;
      this.saveBestScore(this.bestScore);
    }

    this.bankRunCoins();

    const telemetry = this.buildTelemetry();
    this.callbacks.onTelemetry(telemetry);
    this.callbacks.onGameOver(telemetry);
  }

  private buildTelemetry(): GameTelemetry {
    const gear =
      this.speedKmh < 2
        ? 1
        : Math.min(6, 1 + Math.floor(this.speedKmh / 42));
    return {
      speedKmh: Math.round(this.speedKmh),
      peakSpeedKmh: Math.round(this.peakSpeedKmh),
      distanceM: Math.round(this.distanceM),
      highSpeedDistanceM: Math.round(this.highSpeedDistanceM),
      score: Math.floor(this.score),
      bestScore: this.bestScore,
      coins: this.coins,
      runCoinsEarned: this.runCoinsEarned,
      difficultyLevel: this.getDifficultyLevel(),
      nearMisses: this.nearMisses,
      isNewBest: this.isNewBest,
      gear,
    };
  }

  private emitTelemetry(): void {
    this.callbacks.onTelemetry(this.buildTelemetry());
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    window.removeEventListener('resize', this.handleResize);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.handleContextRestored);

    this.sound.dispose();
    this.textures.dispose();

    this.scene.traverse((obj) => {
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

    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
