import * as THREE from 'three';
import { WeatherMode } from './types';

const WEATHER_STORAGE_KEY = 'indian_bike_rider_3d_weather';

export interface WeatherOption {
  id: WeatherMode;
  label: string;
}

export const WEATHER_OPTIONS: WeatherOption[] = [
  { id: 'sunny', label: 'Sunny' },
  { id: 'rain', label: 'Rain' },
  { id: 'fog', label: 'Fog' },
];

export interface WeatherPreset {
  skyColor: number;
  fogColor: number;
  fogNear: number;
  fogFar: number;
  hemiSkyColor: number;
  hemiGroundColor: number;
  hemiIntensity: number;
  sunColor: number;
  sunIntensity: number;
  cloudColor: number;
  cloudOpacity: number;
  sunDiscOpacity: number;
  roadRoughness: number;
  roadMetalness: number;
  roadEnvIntensity: number;
  lampEmissiveIntensity: number;
  rainOpacity: number;
  headlightBeamOpacity: number;
}

export const WEATHER_PRESETS: Record<WeatherMode, WeatherPreset> = {
  sunny: {
    skyColor: 0x6ec3f4,
    fogColor: 0x9bd8fa,
    fogNear: 95,
    fogFar: 295,
    hemiSkyColor: 0x9bd8fa,
    hemiGroundColor: 0x5c6b4d,
    hemiIntensity: 0.95,
    sunColor: 0xfff5e0,
    sunIntensity: 2.15,
    cloudColor: 0xffffff,
    cloudOpacity: 0.85,
    sunDiscOpacity: 1.0,
    roadRoughness: 0.9,
    roadMetalness: 0.02,
    roadEnvIntensity: 0.2,
    lampEmissiveIntensity: 1.0,
    rainOpacity: 0,
    headlightBeamOpacity: 0,
  },
  rain: {
    skyColor: 0x354659,
    fogColor: 0x45586d,
    fogNear: 34,
    fogFar: 165,
    hemiSkyColor: 0x70859c,
    hemiGroundColor: 0x26313d,
    hemiIntensity: 0.68,
    sunColor: 0xcbd5e1,
    sunIntensity: 0.92,
    cloudColor: 0x526375,
    cloudOpacity: 0.92,
    sunDiscOpacity: 0,
    roadRoughness: 0.18,
    roadMetalness: 0.14,
    roadEnvIntensity: 1.25,
    lampEmissiveIntensity: 3.4,
    rainOpacity: 0.68,
    headlightBeamOpacity: 0.52,
  },
  fog: {
    skyColor: 0xa5b4c4,
    fogColor: 0xaab9c8,
    fogNear: 12,
    fogFar: 86,
    hemiSkyColor: 0xc2d0de,
    hemiGroundColor: 0x4f5a65,
    hemiIntensity: 0.88,
    sunColor: 0xe2e8f0,
    sunIntensity: 1.05,
    cloudColor: 0xcbd5e1,
    cloudOpacity: 0.28,
    sunDiscOpacity: 0.18,
    roadRoughness: 0.62,
    roadMetalness: 0.04,
    roadEnvIntensity: 0.48,
    lampEmissiveIntensity: 2.8,
    rainOpacity: 0,
    headlightBeamOpacity: 0.42,
  },
};

export function loadStoredWeather(): WeatherMode {
  try {
    const raw = localStorage.getItem(WEATHER_STORAGE_KEY);
    if (raw === 'sunny' || raw === 'rain' || raw === 'fog') {
      return raw;
    }
  } catch {
    // Ignore storage access errors
  }
  return 'sunny';
}

export function saveStoredWeather(mode: WeatherMode): void {
  try {
    localStorage.setItem(WEATHER_STORAGE_KEY, mode);
  } catch {
    // Ignore storage access errors
  }
}

export class RainParticleSystem {
  public readonly lines: THREE.LineSegments;
  public readonly material: THREE.LineBasicMaterial;
  private readonly geometry: THREE.BufferGeometry;
  private readonly positions: Float32Array;
  private readonly speeds: Float32Array;
  private readonly count: number;

  private readonly spanX = 36;
  private readonly maxY = 18;
  private readonly minZ = -44;
  private readonly maxZ = 9;

  constructor(count = 640) {
    this.count = count;
    this.positions = new Float32Array(count * 6);
    this.speeds = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * this.spanX;
      const y = Math.random() * this.maxY;
      const z = this.minZ + Math.random() * (this.maxZ - this.minZ);
      this.speeds[i] = 24 + Math.random() * 12;

      const idx = i * 6;
      this.positions[idx] = x;
      this.positions[idx + 1] = y;
      this.positions[idx + 2] = z;
      this.positions[idx + 3] = x + 0.08;
      this.positions[idx + 4] = y + 0.85;
      this.positions[idx + 5] = z - 0.12;
    }

    this.geometry = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(this.positions, 3);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('position', posAttr);

    this.material = new THREE.LineBasicMaterial({
      color: 0xdbeafe,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });

    this.lines = new THREE.LineSegments(this.geometry, this.material);
    this.lines.frustumCulled = false;
    this.lines.visible = false;
  }

  public update(dt: number, focusX: number, forwardSpeedMs: number, opacity: number): void {
    this.material.opacity = opacity;
    const isVisible = opacity > 0.015;
    this.lines.visible = isVisible;
    if (!isVisible) return;

    this.lines.position.x = focusX;

    const halfX = this.spanX * 0.5;
    const zRange = this.maxZ - this.minZ;
    const zAdvance = (forwardSpeedMs * 0.42 + 2.8) * dt;
    const xDrift = -1.9 * dt;
    const streakZ = 0.08 + Math.min(forwardSpeedMs / 55, 1) * 0.95;

    for (let i = 0; i < this.count; i++) {
      const idx = i * 6;
      let x = this.positions[idx] + xDrift;
      let y = this.positions[idx + 1] - this.speeds[i] * dt;
      let z = this.positions[idx + 2] + zAdvance;

      if (y < 0) y += this.maxY;
      if (x < -halfX) x += this.spanX;
      else if (x > halfX) x -= this.spanX;
      if (z > this.maxZ) z -= zRange;

      this.positions[idx] = x;
      this.positions[idx + 1] = y;
      this.positions[idx + 2] = z;

      this.positions[idx + 3] = x + 0.09;
      this.positions[idx + 4] = y + 0.88;
      this.positions[idx + 5] = z - streakZ;
    }

    (this.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  public dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}

export function createHeadlightBeamMesh(): {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  texture: THREE.CanvasTexture;
} {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, 128, 256);
    const grad = ctx.createLinearGradient(64, 252, 64, 10);
    grad.addColorStop(0, 'rgba(254, 249, 195, 0.85)');
    grad.addColorStop(0.35, 'rgba(254, 240, 138, 0.35)');
    grad.addColorStop(1, 'rgba(254, 240, 138, 0.0)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(52, 256);
    ctx.lineTo(76, 256);
    ctx.lineTo(122, 12);
    ctx.lineTo(6, 12);
    ctx.closePath();
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const geo = new THREE.PlaneGeometry(5.6, 18);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(0, 0.04, -10.2);
  mesh.visible = false;

  return { mesh, material, texture };
}
