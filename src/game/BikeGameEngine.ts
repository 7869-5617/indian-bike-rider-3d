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
  ChunkMaterials,
  createChunkMaterials,
  createGoldenCoin,
  createObstacle,
  createRoadChunk,
  createStuntRamp,
  createTrafficVehicle,
  StuntRampRig,
  TrafficKind,
  TrafficRig,
} from './models';
import {
  clampAmbientIntensity,
  loadStoredAmbientIntensity,
  saveStoredAmbientIntensity,
} from './settings';
import { createProceduralTextures, ProceduralTextures } from './textures';
import {
  computeDynamicTrafficProfile,
  DynamicTrafficProfile,
  pickWeightedTrafficVehicle,
} from './traffic';
import { BikeId, BikeSpec, GameState, GameTelemetry, InputState, WeatherMode } from './types';
import {
  createHeadlightBeamMesh,
  loadStoredWeather,
  RainParticleSystem,
  saveStoredWeather,
  WEATHER_PRESETS,
} from './weather';

const CHUNK_LEN = 80;
const NUM_CHUNKS = 6;
const LANES = [-5.5, -1.85, 1.85, 5.5];
const ROAD_LIMIT_X = 6.9;
const BEST_SCORE_KEY = 'indian_bike_rider_3d_best_score';
const GRAVITY = 21.5;

const _vec3A = new THREE.Vector3();
const _vec3B = new THREE.Vector3();
const _colorA = new THREE.Color();

interface ActiveEntity {
  rig: TrafficRig;
  x: number;
  z: number;
  speedMs: number;
  isOncoming: boolean;
  isObstacle: boolean;
  nearMissAwarded: boolean;
}

interface ActiveRamp {
  rig: StuntRampRig;
  x: number;
  z: number;
  launched: boolean;
}

interface ActiveCoin {
  mesh: THREE.Group;
  x: number;
  baseY: number;
  y: number;
  z: number;
  phase: number;
  value: number;
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
  private ambientLight: THREE.AmbientLight;
  private hemiLight: THREE.HemisphereLight;
  private sunLight: THREE.DirectionalLight;
  private sunDiscMat: THREE.MeshBasicMaterial | null = null;
  private cloudMat: THREE.MeshBasicMaterial | null = null;
  private chunkMats: ChunkMaterials;
  private textures: ProceduralTextures;
  private rainSystem: RainParticleSystem;
  private headlightBeam: {
    mesh: THREE.Mesh;
    material: THREE.MeshBasicMaterial;
    texture: THREE.CanvasTexture;
  };
  private weatherMode: WeatherMode;
  private ambientIntensityMultiplier: number;
  private currentRainOpacity = 0;
  private currentBeamOpacity = 0;

  private playerRig: SportsBikeRig;
  private selectedBikeId: BikeId;
  private selectedBikeSpec: BikeSpec;
  private chunks: THREE.Group[] = [];
  private entities: ActiveEntity[] = [];
  private ramps: ActiveRamp[] = [];
  private activeCoins: ActiveCoin[] = [];

  private input: InputState = {
    accelerate: false,
    brake: false,
    left: false,
    right: false,
    wheelie: false,
    nitro: false,
  };

  private gameState: GameState = 'menu';
  private suspended = false;
  private speedKmh = 0;
  private peakSpeedKmh = 0;
  private playerX = 1.85;
  private playerY = 0;
  private verticalVel = 0;
  private isAirborne = false;
  private onRamp = false;
  private lateralVel = 0;
  private steerVisual = 0;
  private leanVisual = 0;
  private wheelieVisual = 0;
  private airFlipAngle = 0;
  private flipsThisJump = 0;
  private cameraShake = 0;

  private nitroLevel = 100;
  private nitroActive = false;
  private wheelieActive = false;

  private distanceM = 0;
  private highSpeedDistanceM = 0;
  private score = 0;
  private stuntScore = 0;
  private bestScore = 0;
  private coins = 0;
  private runCoinsEarned = 0;
  private coinsCollectedInRun = 0;
  private progressCoinsCredited = 0;
  private nearMisses = 0;
  private flipsInRun = 0;
  private isNewBest = false;

  private stuntCallout: string | null = null;
  private stuntCalloutTimer = 0;

  private spawnTimer = 0;
  private rampSpawnTimer = 3.2;
  private coinSpawnTimer = 1.2;
  private uiEmitTimer = 0;
  private menuCruiseTime = 0;
  private worldClock = 0;

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

    this.renderer.domElement.addEventListener('webglcontextlost', this.handleContextLost);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.handleContextRestored);

    this.weatherMode = loadStoredWeather();
    this.ambientIntensityMultiplier = loadStoredAmbientIntensity();

    // Dynamic Sky + Horizon Fog
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x6ec3f4);
    this.scene.fog = new THREE.Fog(0x9bd8fa, 95, 295);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.2, 420);
    this.camera.position.set(this.playerX, 2.2, 4.7);
    this.camera.lookAt(this.playerX, 1.0, -8);

    this.ambientLight = new THREE.AmbientLight(
      0xffffff,
      0.32 * this.ambientIntensityMultiplier
    );
    this.scene.add(this.ambientLight);
    this.scene.environmentIntensity = THREE.MathUtils.clamp(
      0.22 + 0.78 * this.ambientIntensityMultiplier,
      0.2,
      1.85
    );

    this.hemiLight = new THREE.HemisphereLight(
      0x9bd8fa,
      0x5c6b4d,
      0.95 * this.ambientIntensityMultiplier
    );
    this.hemiLight.position.set(0, 50, 0);
    this.scene.add(this.hemiLight);

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

    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.textures = createProceduralTextures(maxAniso);

    this.buildSkyDetails();

    this.chunkMats = createChunkMaterials(this.textures);
    for (let i = 0; i < NUM_CHUNKS; i++) {
      const chunk = createRoadChunk(i, this.chunkMats, this.isSoftwareGl);
      chunk.position.z = CHUNK_LEN - i * CHUNK_LEN;
      this.chunks.push(chunk);
      this.scene.add(chunk);
    }

    this.rainSystem = new RainParticleSystem(640);
    this.scene.add(this.rainSystem.lines);

    this.headlightBeam = createHeadlightBeamMesh();
    this.scene.add(this.headlightBeam.mesh);

    this.playerRig = createSportsBikeModel(
      this.selectedBikeId,
      {
        withRider: true,
        shadowTexture: this.textures.contactShadow,
      },
      () => {
        if (!this.disposed && !this.suspended && this.isSoftwareGl) {
          this.renderer.render(this.scene, this.camera);
        }
      }
    );
    this.playerRig.root.position.set(this.playerX, 0, 0);
    this.scene.add(this.playerRig.root);

    this.seedMenuTraffic();
    this.applyWeatherImmediate(this.weatherMode);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    window.addEventListener('resize', this.handleResize);

    this.emitTelemetry();
    this.lastTime = performance.now();
    this.startLoop();
  }

  private buildSkyDetails(): void {
    this.sunDiscMat = new THREE.MeshBasicMaterial({
      color: 0xfffbeb,
      transparent: true,
      opacity: 1,
      fog: false,
    });
    const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(14, 24), this.sunDiscMat);
    sunDisc.position.set(78, 88, -280);
    this.scene.add(sunDisc);

    this.cloudMat = new THREE.MeshBasicMaterial({
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
      const p1 = new THREE.Mesh(new THREE.SphereGeometry(8, 10, 8), this.cloudMat);
      p1.scale.set(1.8, 0.7, 0.7);
      const p2 = new THREE.Mesh(new THREE.SphereGeometry(6.5, 10, 8), this.cloudMat);
      p2.position.set(8, -1.2, 0);
      p2.scale.set(1.4, 0.65, 0.7);
      const p3 = new THREE.Mesh(new THREE.SphereGeometry(6, 10, 8), this.cloudMat);
      p3.position.set(-8, -1.5, 0);
      p3.scale.set(1.3, 0.6, 0.7);
      cloud.add(p1, p2, p3);
      this.scene.add(cloud);
    }
  }

  public getWeather(): WeatherMode {
    return this.weatherMode;
  }

  public setWeather(mode: WeatherMode, immediate = false): void {
    this.weatherMode = mode;
    saveStoredWeather(mode);
    if (immediate) {
      this.applyWeatherImmediate(mode);
    }
    this.sound.updateWeatherAudio(mode, this.gameState === 'playing');
  }

  public getAmbientIntensity(): number {
    return this.ambientIntensityMultiplier;
  }

  public setAmbientIntensity(value: number, immediate = false): void {
    const clamped = clampAmbientIntensity(value);
    this.ambientIntensityMultiplier = clamped;
    saveStoredAmbientIntensity(clamped);
    if (immediate || this.isSoftwareGl) {
      const preset = WEATHER_PRESETS[this.weatherMode];
      this.ambientLight.intensity = 0.32 * clamped;
      this.hemiLight.intensity = preset.hemiIntensity * clamped;
      this.scene.environmentIntensity = THREE.MathUtils.clamp(0.22 + 0.78 * clamped, 0.2, 1.85);
      this.renderer.toneMappingExposure = 0.58 + 0.50 * clamped;
      if (this.isSoftwareGl && !this.disposed) {
        this.renderer.render(this.scene, this.camera);
      }
    }
  }

  private applyWeatherImmediate(mode: WeatherMode): void {
    const preset = WEATHER_PRESETS[mode];
    if (this.scene.background instanceof THREE.Color) {
      this.scene.background.setHex(preset.skyColor);
    }
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.color.setHex(preset.fogColor);
      this.scene.fog.near = preset.fogNear;
      this.scene.fog.far = preset.fogFar;
    }
    this.ambientLight.intensity = 0.32 * this.ambientIntensityMultiplier;
    this.hemiLight.color.setHex(preset.hemiSkyColor);
    this.hemiLight.groundColor.setHex(preset.hemiGroundColor);
    this.hemiLight.intensity = preset.hemiIntensity * this.ambientIntensityMultiplier;
    this.scene.environmentIntensity = THREE.MathUtils.clamp(
      0.22 + 0.78 * this.ambientIntensityMultiplier,
      0.2,
      1.85
    );
    this.renderer.toneMappingExposure = 0.58 + 0.50 * this.ambientIntensityMultiplier;

    this.sunLight.color.setHex(preset.sunColor);
    this.sunLight.intensity = preset.sunIntensity;

    if (this.cloudMat) {
      this.cloudMat.color.setHex(preset.cloudColor);
      this.cloudMat.opacity = preset.cloudOpacity;
    }
    if (this.sunDiscMat) {
      this.sunDiscMat.opacity = preset.sunDiscOpacity;
    }

    this.chunkMats.road.roughness = preset.roadRoughness;
    this.chunkMats.road.metalness = preset.roadMetalness;
    this.chunkMats.road.envMapIntensity = preset.roadEnvIntensity;
    this.chunkMats.lampGlow.emissiveIntensity = preset.lampEmissiveIntensity;

    this.currentRainOpacity = preset.rainOpacity;
    this.currentBeamOpacity = preset.headlightBeamOpacity;
    this.rainSystem.update(0, this.camera.position.x, 0, this.currentRainOpacity);
    this.updateHeadlightBeam();
  }

  private updateWeatherEffects(dt: number, forwardSpeedMs: number): void {
    const preset = WEATHER_PRESETS[this.weatherMode];
    const colorLerp = 1 - Math.exp(-3.5 * dt);

    if (this.scene.background instanceof THREE.Color) {
      _colorA.setHex(preset.skyColor);
      this.scene.background.lerp(_colorA, colorLerp);
    }
    if (this.scene.fog instanceof THREE.Fog) {
      _colorA.setHex(preset.fogColor);
      this.scene.fog.color.lerp(_colorA, colorLerp);
      this.scene.fog.near = THREE.MathUtils.damp(this.scene.fog.near, preset.fogNear, 3.8, dt);
      this.scene.fog.far = THREE.MathUtils.damp(this.scene.fog.far, preset.fogFar, 3.8, dt);
    }

    this.ambientLight.intensity = THREE.MathUtils.damp(
      this.ambientLight.intensity,
      0.32 * this.ambientIntensityMultiplier,
      8,
      dt
    );
    _colorA.setHex(preset.hemiSkyColor);
    this.hemiLight.color.lerp(_colorA, colorLerp);
    _colorA.setHex(preset.hemiGroundColor);
    this.hemiLight.groundColor.lerp(_colorA, colorLerp);
    this.hemiLight.intensity = THREE.MathUtils.damp(
      this.hemiLight.intensity,
      preset.hemiIntensity * this.ambientIntensityMultiplier,
      6,
      dt
    );
    this.scene.environmentIntensity = THREE.MathUtils.damp(
      this.scene.environmentIntensity,
      THREE.MathUtils.clamp(0.22 + 0.78 * this.ambientIntensityMultiplier, 0.2, 1.85),
      8,
      dt
    );
    this.renderer.toneMappingExposure = THREE.MathUtils.damp(
      this.renderer.toneMappingExposure,
      0.58 + 0.50 * this.ambientIntensityMultiplier,
      8,
      dt
    );

    _colorA.setHex(preset.sunColor);
    this.sunLight.color.lerp(_colorA, colorLerp);
    this.sunLight.intensity = THREE.MathUtils.damp(
      this.sunLight.intensity,
      preset.sunIntensity,
      4,
      dt
    );

    if (this.cloudMat) {
      _colorA.setHex(preset.cloudColor);
      this.cloudMat.color.lerp(_colorA, colorLerp);
      this.cloudMat.opacity = THREE.MathUtils.damp(
        this.cloudMat.opacity,
        preset.cloudOpacity,
        4,
        dt
      );
    }
    if (this.sunDiscMat) {
      this.sunDiscMat.opacity = THREE.MathUtils.damp(
        this.sunDiscMat.opacity,
        preset.sunDiscOpacity,
        4.5,
        dt
      );
    }

    this.chunkMats.road.roughness = THREE.MathUtils.damp(
      this.chunkMats.road.roughness,
      preset.roadRoughness,
      3.5,
      dt
    );
    this.chunkMats.road.metalness = THREE.MathUtils.damp(
      this.chunkMats.road.metalness,
      preset.roadMetalness,
      3.5,
      dt
    );
    this.chunkMats.road.envMapIntensity = THREE.MathUtils.damp(
      this.chunkMats.road.envMapIntensity,
      preset.roadEnvIntensity,
      3.5,
      dt
    );
    this.chunkMats.lampGlow.emissiveIntensity = THREE.MathUtils.damp(
      this.chunkMats.lampGlow.emissiveIntensity,
      preset.lampEmissiveIntensity,
      4,
      dt
    );

    this.currentRainOpacity = THREE.MathUtils.damp(
      this.currentRainOpacity,
      preset.rainOpacity,
      4.5,
      dt
    );
    this.currentBeamOpacity = THREE.MathUtils.damp(
      this.currentBeamOpacity,
      preset.headlightBeamOpacity,
      4.5,
      dt
    );

    this.rainSystem.update(dt, this.camera.position.x, forwardSpeedMs, this.currentRainOpacity);
    this.updateHeadlightBeam();
  }

  private updateHeadlightBeam(): void {
    const heightFade = THREE.MathUtils.clamp(1 - this.playerY / 2.2, 0, 1);
    const effectiveOpacity = this.currentBeamOpacity * heightFade;
    this.headlightBeam.mesh.visible = effectiveOpacity > 0.015;
    if (this.headlightBeam.mesh.visible) {
      this.headlightBeam.material.opacity = effectiveOpacity;
      this.headlightBeam.mesh.position.x = this.playerX + this.steerVisual * 0.8;
      this.headlightBeam.mesh.rotation.y = this.steerVisual * 0.45;
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
      // Ignore storage failures
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
    this.input.wheelie = false;
    this.input.nitro = false;
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
    this.playerRig.dispose();

    this.playerRig = createSportsBikeModel(
      bikeId,
      {
        withRider: true,
        shadowTexture: this.textures.contactShadow,
      },
      () => {
        if (!this.disposed && !this.suspended && this.isSoftwareGl) {
          this.renderer.render(this.scene, this.camera);
        }
      }
    );
    this.playerRig.root.position.set(this.playerX, this.playerY, 0);
    this.playerRig.leanGroup.rotation.z = this.leanVisual;
    this.playerRig.steeringGroup.rotation.y = this.steerVisual;
    this.playerRig.wheelieGroup.rotation.x = this.wheelieVisual;
    this.playerRig.flipGroup.rotation.x = this.airFlipAngle;
    this.scene.add(this.playerRig.root);

    // Enforce strict speed cap immediately if bike changed
    this.speedKmh = Math.min(this.speedKmh, this.selectedBikeSpec.topSpeedKmh);
    this.emitTelemetry();
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
      this.sound.updateEngine(0, this.selectedBikeSpec.topSpeedKmh, false, false, false);
      this.sound.updateWeatherAudio(this.weatherMode, false);
    } else {
      this.lastTime = performance.now();
      this.sound.updateWeatherAudio(this.weatherMode, this.gameState === 'playing');
      this.startLoop();
    }
  }

  private clearEntities(): void {
    for (const ent of this.entities) {
      this.scene.remove(ent.rig.root);
      this.disposeObjectHierarchy(ent.rig.root);
    }
    this.entities.length = 0;

    for (const ramp of this.ramps) {
      this.scene.remove(ramp.rig.root);
      this.disposeObjectHierarchy(ramp.rig.root);
    }
    this.ramps.length = 0;

    for (const coin of this.activeCoins) {
      this.scene.remove(coin.mesh);
      this.disposeObjectHierarchy(coin.mesh);
    }
    this.activeCoins.length = 0;
  }

  public startGame(): void {
    this.sound.unlock();
    this.clearEntities();
    this.clearInput();

    this.playerX = 1.85;
    this.playerY = 0;
    this.verticalVel = 0;
    this.isAirborne = false;
    this.onRamp = false;
    this.lateralVel = 0;
    this.speedKmh = 24;
    this.peakSpeedKmh = 24;
    this.steerVisual = 0;
    this.leanVisual = 0;
    this.wheelieVisual = 0;
    this.airFlipAngle = 0;
    this.flipsThisJump = 0;
    this.cameraShake = 0;

    this.nitroLevel = 100;
    this.nitroActive = false;
    this.wheelieActive = false;

    this.distanceM = 0;
    this.highSpeedDistanceM = 0;
    this.score = 0;
    this.stuntScore = 0;
    this.runCoinsEarned = 0;
    this.coinsCollectedInRun = 0;
    this.progressCoinsCredited = 0;
    this.nearMisses = 0;
    this.flipsInRun = 0;
    this.isNewBest = false;
    this.stuntCallout = null;
    this.stuntCalloutTimer = 0;

    this.spawnTimer = 0.5;
    this.rampSpawnTimer = 2.8;
    this.coinSpawnTimer = 0.8;
    this.gameState = 'playing';

    this.playerRig.root.position.set(this.playerX, 0, 0);
    this.playerRig.leanGroup.rotation.set(0, 0, 0);
    this.playerRig.flipGroup.rotation.set(0, 0, 0);
    this.playerRig.wheelieGroup.rotation.set(0, 0, 0);
    this.playerRig.steeringGroup.rotation.set(0, 0, 0);
    if (this.playerRig.nitroFlame) {
      this.playerRig.nitroFlame.visible = false;
    }

    // Seed initial oncoming & same-direction traffic + first golden coin line + stunt ramp
    this.spawnAheadWave(-100);
    this.spawnAheadWave(-165);
    this.spawnAheadWave(-230);
    this.spawnCoinLine(1.85, -72, 5);
    this.spawnStuntRampAt(5.5, -145);

    this.sound.updateWeatherAudio(this.weatherMode, true);
    this.emitTelemetry();
  }

  public pauseGame(): void {
    if (this.gameState !== 'playing') return;
    this.gameState = 'paused';
    this.clearInput();
    this.sound.updateEngine(0, this.selectedBikeSpec.topSpeedKmh, false, false, false);
    this.sound.updateWeatherAudio(this.weatherMode, false);
  }

  public resumeGame(): void {
    if (this.gameState !== 'paused') return;
    this.sound.unlock();
    this.gameState = 'playing';
    this.sound.updateWeatherAudio(this.weatherMode, true);
    this.lastTime = performance.now();
  }

  public returnToMenu(): void {
    this.gameState = 'menu';
    this.clearInput();
    this.clearEntities();
    this.playerX = 1.85;
    this.playerY = 0;
    this.verticalVel = 0;
    this.isAirborne = false;
    this.onRamp = false;
    this.speedKmh = 0;
    this.peakSpeedKmh = 0;
    this.highSpeedDistanceM = 0;
    this.runCoinsEarned = 0;
    this.leanVisual = 0;
    this.steerVisual = 0;
    this.wheelieVisual = 0;
    this.airFlipAngle = 0;
    this.nitroActive = false;
    this.wheelieActive = false;
    this.stuntCallout = null;
    this.playerRig.root.position.set(this.playerX, 0, 0);
    this.playerRig.leanGroup.rotation.set(0, 0, 0);
    this.playerRig.flipGroup.rotation.set(0, 0, 0);
    this.playerRig.wheelieGroup.rotation.set(0, 0, 0);
    if (this.playerRig.nitroFlame) {
      this.playerRig.nitroFlame.visible = false;
    }
    this.seedMenuTraffic();
    this.sound.updateEngine(0, this.selectedBikeSpec.topSpeedKmh, false, false, false);
    this.sound.updateWeatherAudio(this.weatherMode, false);
    this.emitTelemetry();
  }

  private seedMenuTraffic(): void {
    const menuSpecs: Array<{
      kind: TrafficKind;
      lane: number;
      z: number;
      speedMs: number;
      isOncoming: boolean;
    }> = [
      { kind: 'car', lane: 0, z: -55, speedMs: 16, isOncoming: true },
      { kind: 'auto', lane: 1, z: -98, speedMs: 11, isOncoming: true },
      { kind: 'truck', lane: 0, z: -155, speedMs: 13, isOncoming: true },
      { kind: 'bike', lane: 3, z: -62, speedMs: 18, isOncoming: false },
      { kind: 'car', lane: 2, z: -135, speedMs: 19, isOncoming: false },
    ];
    for (const spec of menuSpecs) {
      const rig = createTrafficVehicle(spec.kind, this.textures);
      const x = LANES[spec.lane];
      rig.root.position.set(x, 0, spec.z);
      rig.root.rotation.y = spec.isOncoming ? Math.PI : 0;
      this.scene.add(rig.root);
      this.entities.push({
        rig,
        x,
        z: spec.z,
        speedMs: spec.speedMs,
        isOncoming: spec.isOncoming,
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
      if (Math.abs(ent.x - laneX) < 1.3 && Math.abs(ent.z - targetZ) < minGap) {
        return true;
      }
    }
    for (const ramp of this.ramps) {
      if (Math.abs(ramp.x - laneX) < 1.6 && Math.abs(ramp.z - targetZ) < minGap) {
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

  public getDynamicTrafficProfile(): DynamicTrafficProfile {
    return computeDynamicTrafficProfile(this.speedKmh, this.distanceM);
  }

  private spawnAheadWave(spawnZ: number): void {
    const profile = this.getDynamicTrafficProfile();
    if (this.entities.length >= profile.maxActiveEntities) return;

    // Never block more than 2 lanes in the same Z band so player always has clean room to weave
    if (this.countEntitiesInZBand(spawnZ, 20) >= 2) return;

    const maxSpawnsInWave = Math.random() < profile.doubleSpawnChance ? 2 : 1;
    let spawnedInWave = 0;

    const shuffledLanes = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
    for (const laneIdx of shuffledLanes) {
      if (spawnedInWave >= maxSpawnsInWave) break;
      if (this.entities.length >= profile.maxActiveEntities) break;

      const laneZ = spawnedInWave === 0 ? spawnZ : spawnZ - (10 + Math.random() * 14);
      if (this.countEntitiesInZBand(laneZ, 20) >= 2) continue;

      const laneX = LANES[laneIdx];
      const isOncomingLane = laneIdx <= 1;
      const minGap = isOncomingLane ? profile.oncomingMinGap : profile.sameDirMinGap;
      if (this.isLaneOccupiedNear(laneX, laneZ, minGap)) continue;

      const obstacleChance = isOncomingLane
        ? profile.obstacleChanceOncoming
        : profile.obstacleChanceSameDir;
      const spawnAsObstacle = Math.random() < obstacleChance;

      if (spawnAsObstacle) {
        const obsKind = Math.random() < 0.5 ? 'barricade' : 'cones';
        const rig = createObstacle(obsKind, this.textures);
        rig.root.position.set(laneX, 0, laneZ);
        this.scene.add(rig.root);
        this.entities.push({
          rig,
          x: laneX,
          z: laneZ,
          speedMs: 0,
          isOncoming: false,
          isObstacle: true,
          nearMissAwarded: false,
        });
      } else {
        const pool = isOncomingLane ? profile.oncomingPool : profile.sameDirPool;
        const picked = pickWeightedTrafficVehicle(pool, profile.speedBoostKmh);
        const speedMs = picked.speedKmh / 3.6;

        const rig = createTrafficVehicle(picked.kind, this.textures);
        rig.root.position.set(laneX, 0, laneZ);
        rig.root.rotation.y = isOncomingLane ? Math.PI : 0;
        this.scene.add(rig.root);
        this.entities.push({
          rig,
          x: laneX,
          z: laneZ,
          speedMs,
          isOncoming: isOncomingLane,
          isObstacle: false,
          nearMissAwarded: false,
        });
      }
      spawnedInWave += 1;
    }
  }

  private spawnCoinLine(laneX: number, startZ: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const z = startZ - i * 4.5;
      const mesh = createGoldenCoin();
      mesh.position.set(laneX, 0.75, z);
      this.scene.add(mesh);
      this.activeCoins.push({
        mesh,
        x: laneX,
        baseY: 0.75,
        y: 0.75,
        z,
        phase: i * 0.6,
        value: 15,
      });
    }
  }

  private spawnStuntRampAt(laneX: number, z: number): void {
    if (this.isLaneOccupiedNear(laneX, z, 24)) return;
    const rig = createStuntRamp(this.textures);
    rig.root.position.set(laneX, 0, z);
    this.scene.add(rig.root);
    this.ramps.push({
      rig,
      x: laneX,
      z,
      launched: false,
    });

    // Spawn curved 5-coin golden arc right off the ramp lip!
    for (let i = 0; i < 5; i++) {
      const frac = i / 4; // 0 .. 1
      const cz = z - rig.halfLength - 2.0 - frac * 14.0;
      const arcY = 1.65 + Math.sin(frac * Math.PI) * 2.15;
      const mesh = createGoldenCoin();
      mesh.position.set(laneX, arcY, cz);
      this.scene.add(mesh);
      this.activeCoins.push({
        mesh,
        x: laneX,
        baseY: arcY,
        y: arcY,
        z: cz,
        phase: i * 0.5,
        value: 20,
      });
    }
  }

  private triggerStuntCallout(text: string): void {
    this.stuntCallout = text;
    this.stuntCalloutTimer = 2.0;
  }

  private creditCoinsImmediate(amount: number): void {
    if (amount <= 0) return;
    this.coins += amount;
    this.runCoinsEarned += amount;
    saveStoredCoins(this.coins);
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
      this.updateWeatherEffects(dt, 0);
      return;
    }

    if (this.gameState === 'menu') {
      this.updateMenuCruise(dt);
      this.updateWeatherEffects(dt, 17.5);
      return;
    }

    if (this.gameState === 'gameover') {
      this.updateGameOverIdle(dt);
      this.updateWeatherEffects(dt, 0);
      return;
    }

    this.worldClock += dt;

    if (this.stuntCalloutTimer > 0) {
      this.stuntCalloutTimer -= dt;
      if (this.stuntCalloutTimer <= 0) {
        this.stuntCallout = null;
      }
    }

    // --- CRITICAL STRICT SPEED LIMITER ---
    // Hard mathematical top speed cap per bike: Ninja ZX-6R = 260, Ducati Streetfighter V4 = 285
    const hardMaxKmh = this.selectedBikeSpec.topSpeedKmh;
    const canUseNitro =
      this.selectedBikeSpec.hasNitro &&
      this.input.nitro &&
      !this.input.brake &&
      this.nitroLevel > 0.5 &&
      this.speedKmh > 15;

    this.nitroActive = canUseNitro;
    if (this.nitroActive) {
      this.nitroLevel = Math.max(0, this.nitroLevel - 30 * dt);
    } else if (this.selectedBikeSpec.hasNitro) {
      this.nitroLevel = Math.min(100, this.nitroLevel + 11 * dt);
    }

    if (this.playerRig.nitroFlame) {
      this.playerRig.nitroFlame.visible = this.nitroActive;
      if (this.nitroActive) {
        const flicker = 0.85 + Math.sin(this.worldClock * 48) * 0.25;
        this.playerRig.nitroFlame.scale.set(1, flicker, 1);
      }
    }

    let throttlePitch = 0;
    if ((this.input.accelerate || this.nitroActive) && !this.input.brake) {
      const ratio = Math.min(this.speedKmh / hardMaxKmh, 1);
      const nitroBoost = this.nitroActive ? 1.85 : 1.0;
      const accelRate =
        THREE.MathUtils.lerp(64, 24, ratio) *
        this.selectedBikeSpec.accelMultiplier *
        nitroBoost;
      this.speedKmh = Math.min(hardMaxKmh, this.speedKmh + accelRate * dt);
      throttlePitch = this.nitroActive ? 0.08 : 0.04;
      if (this.playerRig.brakeLightMat) {
        this.playerRig.brakeLightMat.emissiveIntensity = 0.9;
      }
    } else if (this.input.brake) {
      this.speedKmh = Math.max(0, this.speedKmh - 135 * dt);
      throttlePitch = this.speedKmh > 2 ? -0.07 : 0;
      if (this.playerRig.brakeLightMat) {
        this.playerRig.brakeLightMat.emissiveIntensity = 3.6;
      }
    } else {
      this.speedKmh = Math.max(0, this.speedKmh - 14 * dt);
      throttlePitch = 0;
      if (this.playerRig.brakeLightMat) {
        this.playerRig.brakeLightMat.emissiveIntensity = 0.9;
      }
    }

    // Hard clamp guarantee on every physics step
    this.speedKmh = Math.min(Math.max(0, this.speedKmh), hardMaxKmh);
    const speedMs = this.speedKmh / 3.6;

    // --- STEERING & LATERAL KINEMATICS ---
    const steerInput = (this.input.left ? -1 : 0) + (this.input.right ? 1 : 0);
    const steerCapability =
      (4.6 + Math.min(this.speedKmh / 140, 1) * 6.0) *
      this.selectedBikeSpec.handlingMultiplier;
    const targetLatVel = steerInput * steerCapability;
    this.lateralVel = THREE.MathUtils.damp(this.lateralVel, targetLatVel, 11, dt);
    this.playerX = THREE.MathUtils.clamp(
      this.playerX + this.lateralVel * dt,
      -ROAD_LIMIT_X,
      ROAD_LIMIT_X
    );

    if (
      (this.playerX <= -ROAD_LIMIT_X && this.lateralVel < 0) ||
      (this.playerX >= ROAD_LIMIT_X && this.lateralVel > 0)
    ) {
      this.lateralVel = 0;
    }

    // --- STUNT RAMPS, WHEELIE & AIR-FLIP PHYSICS ---
    this.advanceRoadChunks(speedMs * dt);

    let activeRampDeckY = 0;
    let rampSlopeAngle = 0;
    this.onRamp = false;

    for (let i = this.ramps.length - 1; i >= 0; i--) {
      const ramp = this.ramps[i];
      ramp.z += speedMs * dt;
      ramp.rig.root.position.z = ramp.z;

      const withinWidth = Math.abs(this.playerX - ramp.x) < ramp.rig.halfWidth + 0.15;
      const entryZ = ramp.z + ramp.rig.halfLength;
      const lipZ = ramp.z - ramp.rig.halfLength;

      if (withinWidth && entryZ >= 0 && lipZ <= 0 && !this.isAirborne) {
        this.onRamp = true;
        const progress = THREE.MathUtils.clamp(entryZ / (ramp.rig.halfLength * 2), 0, 1);
        activeRampDeckY = progress * ramp.rig.height;
        rampSlopeAngle = Math.atan2(ramp.rig.height, ramp.rig.halfLength * 2);
        this.playerY = Math.max(this.playerY, activeRampDeckY);
      } else if (withinWidth && lipZ > 0 && !ramp.launched && this.playerY > 0.25) {
        // Launched cleanly off ramp lip!
        ramp.launched = true;
        this.isAirborne = true;
        this.verticalVel = THREE.MathUtils.clamp(speedMs * 0.34, 9.5, 14.5);
        this.airFlipAngle = 0;
        this.flipsThisJump = 0;
        this.score += 75;
        this.stuntScore += 75;
        this.triggerStuntCallout('RAMP LAUNCH! +75');
        this.sound.playRampJump();
      }

      if (ramp.z > 24) {
        this.scene.remove(ramp.rig.root);
        this.disposeObjectHierarchy(ramp.rig.root);
        this.ramps.splice(i, 1);
      }
    }

    // Gravity & Air-Flip spin while airborne
    if (this.isAirborne) {
      this.verticalVel -= GRAVITY * dt;
      this.playerY += this.verticalVel * dt;

      if (this.input.wheelie) {
        this.airFlipAngle += 7.0 * dt;
        const nextFlipThreshold = (this.flipsThisJump + 1) * Math.PI * 2 - 0.45;
        if (this.airFlipAngle >= nextFlipThreshold) {
          this.flipsThisJump += 1;
          this.flipsInRun += 1;
          this.score += 250;
          this.stuntScore += 250;
          this.creditCoinsImmediate(25);
          if (this.selectedBikeSpec.hasNitro) {
            this.nitroLevel = Math.min(100, this.nitroLevel + 35);
          }
          this.triggerStuntCallout(
            `${this.flipsThisJump > 1 ? 'DOUBLE ' : ''}AIR FLIP! +250 · +25 COINS`
          );
          this.sound.playStuntBonus();
        }
      }

      if (this.playerY <= 0) {
        this.playerY = 0;
        this.verticalVel = 0;
        this.isAirborne = false;
        this.airFlipAngle = 0;
        this.flipsThisJump = 0;
      }
    } else if (!this.onRamp) {
      this.playerY = THREE.MathUtils.damp(this.playerY, 0, 14, dt);
      if (this.playerY < 0.01) this.playerY = 0;
    }

    // Ground Wheelie Stunt
    const canWheelie =
      !this.isAirborne &&
      !this.onRamp &&
      this.input.wheelie &&
      !this.input.brake &&
      this.speedKmh >= 28;
    this.wheelieActive = canWheelie;

    if (this.wheelieActive) {
      this.score += 75 * dt;
      this.stuntScore += 75 * dt;
      if (this.selectedBikeSpec.hasNitro) {
        this.nitroLevel = Math.min(100, this.nitroLevel + 6 * dt);
      }
      if (!this.stuntCallout || this.stuntCallout === 'WHEELIE!') {
        this.stuntCallout = 'WHEELIE!';
        this.stuntCalloutTimer = 0.25;
      }
    }

    // Apply Lean, Steering, Wheelie Pivot & Air-Flip Visuals
    const leanFactor = 0.4 + Math.min(this.speedKmh / 100, 1) * 0.6;
    const targetLean = -steerInput * 0.38 * leanFactor;
    const targetSteer = -steerInput * 0.24;
    const targetWheelieAngle = this.wheelieActive
      ? 0.42
      : this.onRamp
        ? rampSlopeAngle
        : throttlePitch;

    this.leanVisual = THREE.MathUtils.damp(this.leanVisual, targetLean, 9.5, dt);
    this.steerVisual = THREE.MathUtils.damp(this.steerVisual, targetSteer, 12, dt);
    this.wheelieVisual = THREE.MathUtils.damp(this.wheelieVisual, targetWheelieAngle, 10, dt);

    this.playerRig.root.position.set(this.playerX, this.playerY, 0);
    this.playerRig.leanGroup.rotation.z = this.leanVisual;
    this.playerRig.steeringGroup.rotation.y = this.steerVisual;
    this.playerRig.wheelieGroup.rotation.x = this.wheelieVisual;
    this.playerRig.flipGroup.rotation.x = this.isAirborne
      ? this.airFlipAngle
      : THREE.MathUtils.damp(this.playerRig.flipGroup.rotation.x, 0, 14, dt);

    // Ground shadow fades slightly during jumps
    if (this.playerRig.shadowMesh) {
      const mat = this.playerRig.shadowMesh.material as THREE.MeshBasicMaterial;
      const heightRatio = THREE.MathUtils.clamp(this.playerY / 4.5, 0, 1);
      mat.opacity = 0.74 * (1 - heightRatio * 0.65);
      this.playerRig.shadowMesh.position.y = 0.025 - this.playerY;
      this.playerRig.shadowMesh.scale.setScalar(1 + heightRatio * 0.25);
    }

    // Wheel Rotation
    const frontWheelSpin = this.wheelieActive ? 0 : (speedMs / 0.32) * dt;
    const rearWheelSpin = (speedMs / 0.33) * dt;
    this.playerRig.frontWheel.rotation.x -= frontWheelSpin;
    this.playerRig.rearWheel.rotation.x -= rearWheelSpin;

    // --- DISTANCE, PEAK SPEED, SCORE & COINS ---
    if (this.speedKmh > this.peakSpeedKmh) {
      this.peakSpeedKmh = Math.min(this.speedKmh, hardMaxKmh);
    }
    const deltaDist = speedMs * dt;
    const level = this.getDifficultyLevel();
    this.distanceM += deltaDist;
    if (this.speedKmh >= 120) {
      this.highSpeedDistanceM += deltaDist;
    }
    this.score += deltaDist * (1 + (level - 1) * 0.15);

    // Credit highway distance & near-miss coin rewards incrementally without double-counting
    const targetProgressCoins = Math.floor(this.distanceM * 0.5) + this.nearMisses * 50;
    const deltaProgressCoins = targetProgressCoins - this.progressCoinsCredited;
    if (deltaProgressCoins > 0) {
      this.progressCoinsCredited = targetProgressCoins;
      this.creditCoinsImmediate(deltaProgressCoins);
    }

    const intScore = Math.floor(this.score);
    if (intScore > this.bestScore) {
      this.bestScore = intScore;
      this.isNewBest = true;
    }

    // --- SPAWNING (DYNAMIC TRAFFIC, STUNT RAMPS & GOLDEN COINS) ---
    const trafficProfile = this.getDynamicTrafficProfile();
    this.spawnTimer -= dt * trafficProfile.spawnRateMultiplier;
    if (this.spawnTimer <= 0) {
      this.spawnAheadWave(-235 - Math.random() * 35);
      this.spawnTimer = trafficProfile.spawnIntervalSec;
    }

    this.rampSpawnTimer -= dt * (0.6 + speedMs / 48);
    if (this.rampSpawnTimer <= 0) {
      const rampLane = LANES[1 + Math.floor(Math.random() * 3)];
      this.spawnStuntRampAt(rampLane, -245);
      this.rampSpawnTimer = 5.2 + Math.random() * 3.0;
    }

    this.coinSpawnTimer -= dt * (0.7 + speedMs / 45);
    if (this.coinSpawnTimer <= 0) {
      const coinLane = LANES[Math.floor(Math.random() * 4)];
      if (!this.isLaneOccupiedNear(coinLane, -220, 26)) {
        this.spawnCoinLine(coinLane, -220, 5);
      }
      this.coinSpawnTimer = 2.6 + Math.random() * 1.8;
    }

    // --- GOLDEN COIN PICKUPS ---
    for (let i = this.activeCoins.length - 1; i >= 0; i--) {
      const c = this.activeCoins[i];
      c.z += speedMs * dt;
      c.y = c.baseY + Math.sin(this.worldClock * 4.5 + c.phase) * 0.08;
      c.mesh.position.set(c.x, c.y, c.z);
      c.mesh.rotation.y += dt * 3.4;

      const dx = Math.abs(this.playerX - c.x);
      const dy = Math.abs(this.playerY + 0.65 - c.y);
      const dz = Math.abs(c.z);
      if (dx < 1.28 && dy < 1.45 && dz < 1.38) {
        this.creditCoinsImmediate(c.value);
        this.coinsCollectedInRun += 1;
        this.score += 25;
        this.sound.playCoinPickup();
        this.scene.remove(c.mesh);
        this.disposeObjectHierarchy(c.mesh);
        this.activeCoins.splice(i, 1);
        continue;
      }

      if (c.z > 18) {
        this.scene.remove(c.mesh);
        this.disposeObjectHierarchy(c.mesh);
        this.activeCoins.splice(i, 1);
      }
    }

    // --- TRAFFIC MOVEMENT & COLLISION CHECK ---
    const playerHalfW = 0.32;
    const playerHalfL = 0.88;

    for (let i = this.entities.length - 1; i >= 0; i--) {
      const ent = this.entities[i];
      // Oncoming vehicles drive toward +Z (+ent.speedMs), same-direction drive toward -Z (-ent.speedMs)
      const relSpeedMs = ent.isOncoming ? speedMs + ent.speedMs : speedMs - ent.speedMs;
      ent.z += relSpeedMs * dt;
      ent.rig.root.position.z = ent.z;

      if (!ent.isObstacle && ent.rig.wheels.length > 0) {
        const wSpin = (ent.speedMs / 0.32) * dt;
        for (const w of ent.rig.wheels) {
          w.rotation.x -= wSpin;
        }
      }

      // Collision Check (AABB + jump height clearance so jumping off ramps flies cleanly over cars!)
      const hitX = Math.abs(this.playerX - ent.x) < playerHalfW + ent.rig.halfWidth - 0.06;
      const hitZ = Math.abs(ent.z) < playerHalfL + ent.rig.halfLength - 0.08;
      const hitY = this.playerY < ent.rig.height - 0.14;
      if (hitX && hitZ && hitY) {
        this.triggerCrash();
        return;
      }

      // Near-Miss Bonus
      if (!ent.nearMissAwarded && ent.z > 1.35) {
        ent.nearMissAwarded = true;
        if (
          !ent.isObstacle &&
          this.speedKmh >= 55 &&
          Math.abs(this.playerX - ent.x) < ent.rig.halfWidth + 1.15
        ) {
          this.nearMisses += 1;
          this.score += ent.isOncoming ? 80 : 50;
          const nmReward = ent.isOncoming ? 75 : 50;
          this.progressCoinsCredited += 50;
          this.creditCoinsImmediate(nmReward);
          this.sound.playNearMiss();
          if (ent.isOncoming) {
            this.triggerStuntCallout('ONCOMING NEAR MISS! +80');
          }
        }
      }

      if (ent.z > 24 || ent.z < -310) {
        this.scene.remove(ent.rig.root);
        this.disposeObjectHierarchy(ent.rig.root);
        this.entities.splice(i, 1);
      }
    }

    // --- CHASE CAMERA, WEATHER & ENGINE AUDIO ---
    this.updateChaseCamera(dt, speedMs);
    this.updateWeatherEffects(dt, speedMs);
    this.sound.updateEngine(
      this.speedKmh,
      hardMaxKmh,
      this.input.accelerate,
      true,
      this.nitroActive
    );
    this.sound.updateWeatherAudio(this.weatherMode, true);

    this.uiEmitTimer += dt;
    if (this.uiEmitTimer >= 0.05) {
      this.uiEmitTimer = 0;
      this.emitTelemetry();
    }
  }

  private updateMenuCruise(dt: number): void {
    this.menuCruiseTime += dt;
    const cruiseSpeedMs = 17.5;
    const deltaDist = cruiseSpeedMs * dt;

    this.advanceRoadChunks(deltaDist);
    this.playerRig.frontWheel.rotation.x -= (cruiseSpeedMs / 0.32) * dt;
    this.playerRig.rearWheel.rotation.x -= (cruiseSpeedMs / 0.33) * dt;

    const sway = Math.sin(this.menuCruiseTime * 0.55) * 1.4;
    this.playerX = 1.85 + sway;
    const swaySlope = Math.cos(this.menuCruiseTime * 0.55) * 0.14;
    this.playerRig.root.position.x = this.playerX;
    this.playerRig.leanGroup.rotation.z = -swaySlope;
    this.playerRig.steeringGroup.rotation.y = -swaySlope * 0.5;

    for (let i = this.entities.length - 1; i >= 0; i--) {
      const ent = this.entities[i];
      const relSpeed = ent.isOncoming ? cruiseSpeedMs + ent.speedMs : cruiseSpeedMs - ent.speedMs;
      ent.z += relSpeed * dt;
      if (ent.z > 24) {
        ent.z -= 210;
      }
      ent.rig.root.position.z = ent.z;
      for (const w of ent.rig.wheels) {
        w.rotation.x -= (ent.speedMs / 0.32) * dt;
      }
    }

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

    this.camera.position.x =
      THREE.MathUtils.damp(this.camera.position.x, this.playerX + 1.5, 3, dt) + shakeX;
    this.camera.position.y =
      THREE.MathUtils.damp(this.camera.position.y, 2.4 + this.playerY * 0.6, 3, dt) + shakeY;
    this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, 5.4, 3, dt);
    _vec3A.set(this.playerX, 0.75 + this.playerY * 0.6, 0);
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
    const speedRatio = Math.min(speedMs / (250 / 3.6), 1);

    const targetCamX = this.playerX - this.leanVisual * 1.35;
    const targetCamY = 2.08 + this.playerY * 0.85 - speedRatio * 0.12;
    const targetCamZ = 4.65 - speedRatio * 0.4 + (this.nitroActive ? 0.35 : 0);

    this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, targetCamX, 8.5, dt);
    this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, targetCamY, 7, dt);
    this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, targetCamZ, 7, dt);

    _vec3B.set(this.playerX * 0.88, 0.92 + this.playerY * 0.8, -8.5);
    this.camera.lookAt(_vec3B);

    this.camera.rotation.z += this.leanVisual * 0.12;

    const targetFov = 58 + speedRatio * 14 + (this.nitroActive ? 7 : 0);
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 5, dt);
      this.camera.updateProjectionMatrix();
    }

    this.sunLight.position.set(this.playerX + 22, 34, 14);
    this.sunLight.target.position.set(this.playerX, 0, -14);
    this.sunLight.target.updateMatrixWorld();
  }

  private triggerCrash(): void {
    this.gameState = 'gameover';
    this.speedKmh = 0;
    this.nitroActive = false;
    this.wheelieActive = false;
    if (this.playerRig.nitroFlame) {
      this.playerRig.nitroFlame.visible = false;
    }
    this.cameraShake = 0.55;
    this.clearInput();
    this.sound.updateEngine(0, this.selectedBikeSpec.topSpeedKmh, false, false, false);
    this.sound.updateWeatherAudio(this.weatherMode, false);
    this.sound.playCrash();

    const finalScore = Math.floor(this.score);
    if (finalScore >= this.bestScore) {
      this.bestScore = finalScore;
      this.saveBestScore(this.bestScore);
    }

    const telemetry = this.buildTelemetry();
    this.callbacks.onTelemetry(telemetry);
    this.callbacks.onGameOver(telemetry);
  }

  private buildTelemetry(): GameTelemetry {
    const maxBikeSpeedKmh = this.selectedBikeSpec.topSpeedKmh;
    const clampedSpeed = Math.min(Math.round(this.speedKmh), maxBikeSpeedKmh);
    const clampedPeak = Math.min(Math.round(this.peakSpeedKmh), maxBikeSpeedKmh);
    const gear =
      clampedSpeed < 2
        ? 1
        : Math.min(6, 1 + Math.floor((clampedSpeed / maxBikeSpeedKmh) * 5.2));

    return {
      speedKmh: clampedSpeed,
      peakSpeedKmh: clampedPeak,
      maxBikeSpeedKmh,
      distanceM: Math.round(this.distanceM),
      highSpeedDistanceM: Math.round(this.highSpeedDistanceM),
      score: Math.floor(this.score),
      stuntScore: Math.floor(this.stuntScore),
      bestScore: this.bestScore,
      coins: this.coins,
      runCoinsEarned: this.runCoinsEarned,
      coinsCollectedInRun: this.coinsCollectedInRun,
      difficultyLevel: this.getDifficultyLevel(),
      nearMisses: this.nearMisses,
      flipsInRun: this.flipsInRun,
      wheelieActive: this.wheelieActive,
      isAirborne: this.isAirborne,
      nitroLevel: Math.round(this.nitroLevel),
      nitroActive: this.nitroActive,
      hasNitro: this.selectedBikeSpec.hasNitro,
      stuntCallout: this.stuntCallout,
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
    this.rainSystem.dispose();
    this.headlightBeam.texture.dispose();
    this.playerRig.dispose();

    this.scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh || (obj as THREE.LineSegments).isLineSegments) {
        const renderable = obj as THREE.Mesh | THREE.LineSegments;
        renderable.geometry?.dispose();
        if (Array.isArray(renderable.material)) {
          renderable.material.forEach((m) => m.dispose());
        } else {
          renderable.material?.dispose();
        }
      }
    });

    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
