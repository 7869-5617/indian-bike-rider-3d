import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { BIKE_CATALOG, createSportsBikeModel } from './bikes';
import { BikeId } from './types';

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

function createShowroomFloorTexture(anisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#0c0e14';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle dark marble sheen variation
  for (let i = 0; i < 3500; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const v = 14 + Math.floor(Math.random() * 14);
    ctx.fillStyle = `rgb(${v},${v + 2},${v + 6})`;
    ctx.fillRect(x, y, 3, 3);
  }

  // Sleek porcelain tile seams
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, 510, 510);
  ctx.beginPath();
  ctx.moveTo(256, 0);
  ctx.lineTo(256, 512);
  ctx.moveTo(0, 256);
  ctx.lineTo(512, 256);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.max(1, Math.min(anisotropy, 16));
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(14, 14);
  tex.needsUpdate = true;
  return tex;
}

const HERO_BASE_YAW = Math.PI * 0.76;
const HERO_SCALE = 1.08;

export class ShowroomEngine {
  private container: HTMLElement;
  private isSoftwareGl: boolean;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private floorTexture: THREE.CanvasTexture;
  private resizeObserver: ResizeObserver | null = null;

  private heroBikes = new Map<BikeId, THREE.Group>();
  private heroRingMat!: THREE.MeshStandardMaterial;

  private activeBikeId: BikeId;
  private transitionProgress = 1;
  private transitionSpinOffset = 0;
  private turntableAngle = 0;
  private idleTimer: number | null = null;

  private frameId = 0;
  private lastTime = 0;
  private disposed = false;

  constructor(container: HTMLElement, initialBikeId: BikeId) {
    this.container = container;
    this.activeBikeId = initialBikeId;
    this.isSoftwareGl = detectSoftwareWebGL();

    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.24;
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

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x090b10);
    this.scene.fog = new THREE.Fog(0x090b10, 15, 34);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    const aspect = width / height;
    const initialFov = aspect < 1 ? 48 : 42;
    this.camera = new THREE.PerspectiveCamera(initialFov, aspect, 0.15, 70);
    // Heroic 3/4 front-side framing putting the selected bike clearly centered with headlights, tyres & fairing visible
    this.camera.position.set(0, 1.32, aspect < 1 ? 3.85 : 3.25);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0.66, 0);
    this.controls.enableDamping = !this.isSoftwareGl;
    this.controls.dampingFactor = 0.07;
    this.controls.enablePan = false;
    this.controls.minDistance = 2.0;
    this.controls.maxDistance = 5.2;
    this.controls.minPolarAngle = 0.32;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.06;
    this.controls.autoRotate = !this.isSoftwareGl;
    this.controls.autoRotateSpeed = 0.65;
    this.controls.update();

    this.controls.addEventListener('start', this.handleOrbitStart);
    this.controls.addEventListener('end', this.handleOrbitEnd);

    this.floorTexture = createShowroomFloorTexture(this.renderer.capabilities.getMaxAnisotropy());
    this.buildShowroomArchitecture();
    this.buildLightingRig();
    this.buildHeroPlatformAndBikes();
    this.buildShowroomArches();

    this.applyActiveBikeVisibility(initialBikeId, false);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    window.addEventListener('resize', this.handleResize);
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.handleResize());
      this.resizeObserver.observe(this.container);
    }

    this.lastTime = performance.now();
    this.startLoop();
  }

  private buildShowroomArchitecture(): void {
    // Dark Glossy Reflective Floor
    const floorMat = new THREE.MeshStandardMaterial({
      map: this.floorTexture,
      color: 0x1b1e2b,
      roughness: 0.14,
      metalness: 0.76,
      envMapIntensity: 1.35,
    });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(22, 48), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Subtle red neon floor perimeter ring around center showcase zone
    const floorRing = new THREE.Mesh(
      new THREE.RingGeometry(3.4, 3.48, 64),
      new THREE.MeshBasicMaterial({ color: 0xef4444, side: THREE.DoubleSide })
    );
    floorRing.rotation.x = -Math.PI / 2;
    floorRing.position.y = 0.01;
    this.scene.add(floorRing);

    // Luxury Architectural Gallery Walls (12-sided rotunda)
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x12151f,
      roughness: 0.7,
      metalness: 0.22,
    });
    const pilasterMat = new THREE.MeshStandardMaterial({
      color: 0x222635,
      roughness: 0.35,
      metalness: 0.78,
    });
    const neonRedMat = new THREE.MeshStandardMaterial({
      color: 0xff3b3b,
      emissive: 0xef4444,
      emissiveIntensity: 2.3,
      roughness: 0.2,
    });

    const rotundaRadius = 13.5;
    const segments = 12;
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const wx = Math.sin(a) * rotundaRadius;
      const wz = Math.cos(a) * rotundaRadius;

      const panel = new THREE.Mesh(new THREE.BoxGeometry(7.3, 6.8, 0.35), wallMat);
      panel.position.set(wx, 3.4, wz);
      panel.rotation.y = a;
      this.scene.add(panel);

      // Vertical architectural pilaster + glowing red neon LED accent strip
      const pa = ((i + 0.5) / segments) * Math.PI * 2;
      const px = Math.sin(pa) * (rotundaRadius - 0.2);
      const pz = Math.cos(pa) * (rotundaRadius - 0.2);

      const pilaster = new THREE.Mesh(new THREE.BoxGeometry(0.44, 6.8, 0.44), pilasterMat);
      pilaster.position.set(px, 3.4, pz);
      pilaster.rotation.y = pa;
      this.scene.add(pilaster);

      const neonStrip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 5.2, 0.08), neonRedMat);
      neonStrip.position.set(
        Math.sin(pa) * (rotundaRadius - 0.46),
        3.1,
        Math.cos(pa) * (rotundaRadius - 0.46)
      );
      neonStrip.rotation.y = pa;
      this.scene.add(neonStrip);
    }

    // Overhead dark ceiling canopy
    const ceiling = new THREE.Mesh(
      new THREE.CircleGeometry(14.5, 32),
      new THREE.MeshBasicMaterial({ color: 0x06070b, side: THREE.DoubleSide })
    );
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = 6.5;
    this.scene.add(ceiling);

    // Ceiling Beams & Bright LED Softbox Light Panels
    const trussMat = new THREE.MeshStandardMaterial({
      color: 0x161922,
      roughness: 0.45,
      metalness: 0.72,
    });
    const ceilingPanelMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xf8fafc,
      emissiveIntensity: 2.2,
      roughness: 0.1,
    });

    const fixturePositions: Array<[number, number, number]> = [
      [0, 5.5, 0],
      [-3.4, 5.5, -1.6],
      [3.4, 5.5, -1.6],
      [-3.4, 5.5, 2.2],
      [3.4, 5.5, 2.2],
      [0, 5.5, -4.8],
    ];
    for (const [fx, fy, fz] of fixturePositions) {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.14, 1.05), trussMat);
      frame.position.set(fx, fy, fz);
      this.scene.add(frame);

      const diffuser = new THREE.Mesh(new THREE.BoxGeometry(2.25, 0.05, 0.85), ceilingPanelMat);
      diffuser.position.set(fx, fy - 0.06, fz);
      this.scene.add(diffuser);
    }

    // Hero Center Overhead Red Neon Halo Ring
    const heroHalo = new THREE.Mesh(
      new THREE.TorusGeometry(2.15, 0.045, 10, 48),
      neonRedMat
    );
    heroHalo.rotation.x = Math.PI / 2;
    heroHalo.position.set(0, 4.9, 0);
    this.scene.add(heroHalo);
  }

  private buildLightingRig(): void {
    // Bright balanced ambient base
    const hemi = new THREE.HemisphereLight(0xf1f5f9, 0x27272a, 1.25);
    this.scene.add(hemi);

    // Primary Key Light from front-right above
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.5);
    keyLight.position.set(4.0, 7.2, 5.2);
    keyLight.castShadow = !this.isSoftwareGl;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 20;
    keyLight.shadow.camera.left = -4;
    keyLight.shadow.camera.right = 4;
    keyLight.shadow.camera.top = 4;
    keyLight.shadow.camera.bottom = -4;
    keyLight.shadow.bias = -0.0005;
    this.scene.add(keyLight);

    // Front-Left Fill Light so wheels, headlights, forks & dark surfaces are super legible
    const fillLight = new THREE.DirectionalLight(0xe0f2fe, 1.6);
    fillLight.position.set(-4.2, 3.0, 4.5);
    this.scene.add(fillLight);

    // Cool Rim Backlight for crisp metallic silhouette separation
    const rimLight = new THREE.DirectionalLight(0x93c5fd, 1.65);
    rimLight.position.set(-3.5, 4.8, -5.0);
    this.scene.add(rimLight);

    // Dedicated Overhead Hero Spotlight focused onto the centered motorcycle
    const heroSpot = new THREE.SpotLight(0xfffdf5, 14.0, 14, Math.PI / 3.8, 0.65, 1.1);
    heroSpot.position.set(0, 5.2, 0.6);
    heroSpot.target.position.set(0, 0.65, 0);
    this.scene.add(heroSpot);
    this.scene.add(heroSpot.target);

    // Subtle red neon showroom accent glow from front-low rim
    const redAccent = new THREE.PointLight(0xef4444, 2.8, 8, 1.4);
    redAccent.position.set(0, 0.45, 2.25);
    this.scene.add(redAccent);
  }

  private buildHeroPlatformAndBikes(): void {
    // Luxury Tiered Hero Display Platform centered at (0, 0, 0)
    const trimMat = new THREE.MeshStandardMaterial({
      color: 0x2c3140,
      roughness: 0.28,
      metalness: 0.86,
    });
    const deckMat = new THREE.MeshStandardMaterial({
      color: 0x191d28,
      roughness: 0.18,
      metalness: 0.82,
    });

    const outerStep = new THREE.Mesh(new THREE.CylinderGeometry(1.92, 2.06, 0.12, 48), trimMat);
    outerStep.position.y = 0.06;
    outerStep.receiveShadow = true;
    this.scene.add(outerStep);

    const innerDeck = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.8, 0.08, 48), deckMat);
    innerDeck.position.y = 0.16;
    innerDeck.receiveShadow = true;
    this.scene.add(innerDeck);

    this.heroRingMat = new THREE.MeshStandardMaterial({
      color: 0xff3b3b,
      emissive: 0xef4444,
      emissiveIntensity: 2.5,
      roughness: 0.2,
    });
    const neonRing = new THREE.Mesh(new THREE.TorusGeometry(1.81, 0.028, 12, 64), this.heroRingMat);
    neonRing.rotation.x = Math.PI / 2;
    neonRing.position.y = 0.15;
    this.scene.add(neonRing);

    // Pre-build all 5 high-detail motorcycles ready to sit large & centered on the hero pedestal
    for (const spec of BIKE_CATALOG) {
      const rig = createSportsBikeModel(spec.id, { withRider: false });
      rig.root.position.set(0, 0.2, 0);
      rig.root.scale.setScalar(HERO_SCALE);
      rig.root.rotation.y = HERO_BASE_YAW;
      rig.root.visible = spec.id === this.activeBikeId;
      this.scene.add(rig.root);
      this.heroBikes.set(spec.id, rig.root);
    }
  }

  private buildShowroomArches(): void {
    // Sleek architectural steel & red-neon portal arches framing the centered bike from behind
    const archMat = new THREE.MeshStandardMaterial({
      color: 0x1e222e,
      roughness: 0.3,
      metalness: 0.85,
    });
    const redGlowMat = new THREE.MeshStandardMaterial({
      color: 0xff3b3b,
      emissive: 0xef4444,
      emissiveIntensity: 2.0,
      roughness: 0.2,
    });

    for (const side of [-1, 1]) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.28, 5.2, 0.28), archMat);
      col.position.set(side * 3.8, 2.6, -4.4);
      this.scene.add(col);

      const led = new THREE.Mesh(new THREE.BoxGeometry(0.06, 4.6, 0.06), redGlowMat);
      led.position.set(side * 3.63, 2.5, -4.25);
      this.scene.add(led);
    }

    const headerBeam = new THREE.Mesh(new THREE.BoxGeometry(7.9, 0.34, 0.34), archMat);
    headerBeam.position.set(0, 5.15, -4.4);
    this.scene.add(headerBeam);

    const headerLed = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.06, 0.06), redGlowMat);
    headerLed.position.set(0, 4.95, -4.24);
    this.scene.add(headerLed);
  }

  private applyActiveBikeVisibility(bikeId: BikeId, animate: boolean): void {
    this.activeBikeId = bikeId;
    for (const [id, group] of this.heroBikes.entries()) {
      group.visible = id === bikeId;
      if (id === bikeId) {
        group.rotation.y = HERO_BASE_YAW + this.turntableAngle;
        group.scale.setScalar(HERO_SCALE);
      }
    }

    if (animate) {
      this.transitionProgress = 0;
      this.transitionSpinOffset = 0.42;
    } else {
      this.transitionProgress = 1;
      this.transitionSpinOffset = 0;
    }
  }

  public setFocusedBike(bikeId: BikeId): void {
    if (this.disposed || this.activeBikeId === bikeId) return;
    this.applyActiveBikeVisibility(bikeId, !this.isSoftwareGl);
    if (this.isSoftwareGl) {
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    }
  }

  private handleOrbitStart = (): void => {
    this.controls.autoRotate = false;
    if (this.idleTimer !== null) {
      window.clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  };

  private handleOrbitEnd = (): void => {
    if (this.disposed) return;
    if (this.isSoftwareGl) {
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      return;
    }
    if (this.idleTimer !== null) {
      window.clearTimeout(this.idleTimer);
    }
    this.idleTimer = window.setTimeout(() => {
      if (!this.disposed) {
        this.controls.autoRotate = true;
      }
    }, 3000);
  };

  private handleResize = (): void => {
    if (this.disposed) return;
    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);
    const aspect = width / height;

    this.camera.aspect = aspect;
    this.camera.fov = aspect < 1 ? 48 : 42;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2)
    );
  };

  private startLoop(): void {
    const tick = (now: number) => {
      if (this.disposed) return;
      const dt = Math.min(Math.max((now - this.lastTime) / 1000, 0.001), 0.1);
      this.lastTime = now;

      const activeHero = this.heroBikes.get(this.activeBikeId);
      if (activeHero) {
        if (!this.isSoftwareGl) {
          this.turntableAngle += dt * 0.2;
        }
        if (this.transitionProgress < 1) {
          this.transitionProgress = Math.min(1, this.transitionProgress + dt * 4.5);
          const eased = 1 - Math.pow(1 - this.transitionProgress, 3);
          const scale = THREE.MathUtils.lerp(HERO_SCALE * 0.92, HERO_SCALE, eased);
          const spin = THREE.MathUtils.lerp(this.transitionSpinOffset, 0, eased);
          activeHero.scale.setScalar(scale);
          activeHero.rotation.y = HERO_BASE_YAW + this.turntableAngle + spin;
        } else {
          activeHero.scale.setScalar(HERO_SCALE);
          activeHero.rotation.y = HERO_BASE_YAW + this.turntableAngle;
        }
      }

      this.controls.update();
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
      this.frameId = window.setTimeout(() => cb(performance.now()), 70);
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
        this.frameId = window.setTimeout(() => cb(performance.now()), 70);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    if (this.idleTimer !== null) {
      window.clearTimeout(this.idleTimer);
    }
    this.resizeObserver?.disconnect();
    window.removeEventListener('resize', this.handleResize);
    this.controls.removeEventListener('start', this.handleOrbitStart);
    this.controls.removeEventListener('end', this.handleOrbitEnd);
    this.controls.dispose();
    this.floorTexture.dispose();

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
