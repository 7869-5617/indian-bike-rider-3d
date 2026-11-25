import * as THREE from 'three';

export interface ProceduralTextures {
  asphalt: THREE.CanvasTexture;
  grass: THREE.CanvasTexture;
  facades: THREE.CanvasTexture[];
  highwaySign: THREE.CanvasTexture;
  speedSign: THREE.CanvasTexture;
  barricade: THREE.CanvasTexture;
  rampSurface: THREE.CanvasTexture;
  contactShadow: THREE.CanvasTexture;
  dispose: () => void;
}

function finalizeColorTexture(
  canvas: HTMLCanvasElement,
  anisotropy: number,
  repeatX = 1,
  repeatY = 1
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.needsUpdate = true;
  return tex;
}

export function createProceduralTextures(maxAnisotropy: number): ProceduralTextures {
  const anisotropy = Math.max(1, Math.min(maxAnisotropy, 16));
  const created: THREE.CanvasTexture[] = [];

  // 1. Indian 4-Lane Two-Way Highway Asphalt Texture
  const asphaltCanvas = document.createElement('canvas');
  asphaltCanvas.width = 512;
  asphaltCanvas.height = 512;
  const actx = asphaltCanvas.getContext('2d')!;

  actx.fillStyle = '#282a2f';
  actx.fillRect(0, 0, 512, 512);

  // Aggregate mineral speckle
  for (let i = 0; i < 9000; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const shade = 32 + Math.floor(Math.random() * 28);
    actx.fillStyle = `rgb(${shade},${shade + 1},${shade + 3})`;
    actx.fillRect(x, y, 2, 2);
  }

  // Subtle tire wear tracks in the 4 lanes (x centers at 96, 200, 312, 416)
  const laneCenters = [96, 200, 312, 416];
  for (const cx of laneCenters) {
    const grad = actx.createLinearGradient(cx - 28, 0, cx + 28, 0);
    grad.addColorStop(0, 'rgba(16,17,20,0)');
    grad.addColorStop(0.3, 'rgba(16,17,20,0.24)');
    grad.addColorStop(0.5, 'rgba(16,17,20,0.06)');
    grad.addColorStop(0.7, 'rgba(16,17,20,0.24)');
    grad.addColorStop(1, 'rgba(16,17,20,0)');
    actx.fillStyle = grad;
    actx.fillRect(cx - 28, 0, 56, 512);
  }

  // Outer shoulder yellow edge lines
  actx.fillStyle = '#f59e0b';
  actx.fillRect(18, 0, 8, 512);
  actx.fillRect(486, 0, 8, 512);

  // Center double yellow two-way divider separating oncoming left lanes from right lanes
  actx.fillStyle = '#facc15';
  actx.fillRect(247, 0, 6, 512);
  actx.fillRect(259, 0, 6, 512);

  // White dashed lane dividers (between lanes 1-2 and lanes 3-4)
  actx.fillStyle = '#e5e7eb';
  for (let y = 16; y < 512; y += 128) {
    actx.fillRect(142, y, 7, 72);
    actx.fillRect(363, y, 7, 72);
  }

  const asphalt = finalizeColorTexture(asphaltCanvas, anisotropy, 1, 4);
  created.push(asphalt);

  // 2. Roadside Grass & Indian Red-Earth Verge Texture
  const grassCanvas = document.createElement('canvas');
  grassCanvas.width = 512;
  grassCanvas.height = 512;
  const gctx = grassCanvas.getContext('2d')!;
  gctx.fillStyle = '#4d7c3f';
  gctx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 6500; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const r = Math.random();
    if (r < 0.45) {
      gctx.fillStyle = '#3f6a34';
    } else if (r < 0.85) {
      gctx.fillStyle = '#5c8d47';
    } else {
      gctx.fillStyle = '#7c6544';
    }
    gctx.fillRect(x, y, 3, 4);
  }
  const grass = finalizeColorTexture(grassCanvas, anisotropy, 10, 6);
  created.push(grass);

  // 3. Indian Building & Shop Facades (4 colorful variants)
  const facadeSpecs = [
    { wall: '#f5e6c8', trim: '#c2410c', signBg: '#1e3a8a', signText: 'SHARMA CHAI & DHABA' },
    { wall: '#e2e8f0', trim: '#0f766e', signBg: '#b91c1c', signText: 'KISAN TYRE & MOTORS' },
    { wall: '#fde68a', trim: '#92400e', signBg: '#065f46', signText: 'BHARAT GENERAL STORE' },
    { wall: '#d1fae5', trim: '#1e293b', signBg: '#7c2d12', signText: 'HIGHWAY SWEETS & SNACKS' },
  ];

  const facades = facadeSpecs.map((spec) => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext('2d')!;

    ctx.fillStyle = spec.wall;
    ctx.fillRect(0, 0, 256, 256);

    ctx.fillStyle = spec.trim;
    ctx.fillRect(0, 0, 256, 12);
    ctx.fillRect(0, 122, 256, 8);

    for (const wx of [26, 104, 182]) {
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(wx, 34, 48, 56);
      ctx.fillStyle = '#93c5fd';
      ctx.fillRect(wx + 4, 38, 18, 48);
      ctx.fillRect(wx + 26, 38, 18, 48);
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 2;
      ctx.strokeRect(wx, 34, 48, 56);
    }

    ctx.fillStyle = spec.signBg;
    ctx.fillRect(14, 134, 228, 30);
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 2;
    ctx.strokeRect(16, 136, 224, 26);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(spec.signText, 128, 149);

    ctx.fillStyle = '#334155';
    ctx.fillRect(22, 174, 96, 82);
    ctx.fillRect(138, 174, 96, 82);
    ctx.fillStyle = '#64748b';
    for (let sy = 178; sy < 210; sy += 6) {
      ctx.fillRect(24, sy, 92, 3);
      ctx.fillRect(140, sy, 92, 3);
    }
    ctx.fillStyle = '#fef3c7';
    ctx.fillRect(26, 212, 88, 42);
    ctx.fillRect(142, 212, 88, 42);

    const tex = finalizeColorTexture(c, anisotropy, 1, 1);
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    created.push(tex);
    return tex;
  });

  // 4. Indian Highway Green Signboard
  const signCanvas = document.createElement('canvas');
  signCanvas.width = 512;
  signCanvas.height = 192;
  const sctx = signCanvas.getContext('2d')!;
  sctx.fillStyle = '#14532d';
  sctx.fillRect(0, 0, 512, 192);
  sctx.strokeStyle = '#ffffff';
  sctx.lineWidth = 8;
  sctx.strokeRect(8, 8, 496, 176);

  sctx.fillStyle = '#ffffff';
  sctx.font = 'bold 34px sans-serif';
  sctx.textAlign = 'left';
  sctx.fillText('DELHI    48 KM', 32, 72);
  sctx.fillText('JAIPUR  165 KM', 32, 134);

  sctx.fillStyle = '#facc15';
  sctx.font = 'bold 30px sans-serif';
  sctx.textAlign = 'right';
  sctx.fillText('NH-48 ↑', 480, 72);

  const highwaySign = finalizeColorTexture(signCanvas, anisotropy, 1, 1);
  highwaySign.wrapS = THREE.ClampToEdgeWrapping;
  highwaySign.wrapT = THREE.ClampToEdgeWrapping;
  created.push(highwaySign);

  // 5. Speed Limit Sign
  const spdCanvas = document.createElement('canvas');
  spdCanvas.width = 128;
  spdCanvas.height = 128;
  const spctx = spdCanvas.getContext('2d')!;
  spctx.fillStyle = '#ffffff';
  spctx.fillRect(0, 0, 128, 128);
  spctx.strokeStyle = '#dc2626';
  spctx.lineWidth = 14;
  spctx.beginPath();
  spctx.arc(64, 64, 52, 0, Math.PI * 2);
  spctx.stroke();
  spctx.fillStyle = '#111827';
  spctx.font = 'bold 48px sans-serif';
  spctx.textAlign = 'center';
  spctx.textBaseline = 'middle';
  spctx.fillText('80', 64, 67);
  const speedSign = finalizeColorTexture(spdCanvas, anisotropy, 1, 1);
  created.push(speedSign);

  // 6. Barricade Stripe Texture
  const barCanvas = document.createElement('canvas');
  barCanvas.width = 256;
  barCanvas.height = 128;
  const bctx = barCanvas.getContext('2d')!;
  bctx.fillStyle = '#f97316';
  bctx.fillRect(0, 0, 256, 128);
  bctx.fillStyle = '#ffffff';
  for (let x = -128; x < 384; x += 64) {
    bctx.beginPath();
    bctx.moveTo(x, 0);
    bctx.lineTo(x + 32, 0);
    bctx.lineTo(x + 96, 128);
    bctx.lineTo(x + 64, 128);
    bctx.closePath();
    bctx.fill();
  }
  const barricade = finalizeColorTexture(barCanvas, anisotropy, 1, 1);
  created.push(barricade);

  // 7. Stunt Ramp Chevron Deck Texture
  const rampCanvas = document.createElement('canvas');
  rampCanvas.width = 256;
  rampCanvas.height = 512;
  const rctx = rampCanvas.getContext('2d')!;
  rctx.fillStyle = '#18181b';
  rctx.fillRect(0, 0, 256, 512);

  // Side hazard rails
  rctx.fillStyle = '#f59e0b';
  rctx.fillRect(0, 0, 24, 512);
  rctx.fillRect(232, 0, 24, 512);
  rctx.fillStyle = '#111827';
  for (let y = 0; y < 512; y += 64) {
    rctx.fillRect(0, y, 24, 30);
    rctx.fillRect(232, y, 24, 30);
  }

  // Glowing launch chevrons pointing up the ramp
  rctx.strokeStyle = '#fbbf24';
  rctx.lineWidth = 18;
  rctx.lineCap = 'round';
  rctx.lineJoin = 'round';
  for (let cy = 96; cy < 480; cy += 120) {
    rctx.beginPath();
    rctx.moveTo(56, cy + 44);
    rctx.lineTo(128, cy);
    rctx.lineTo(200, cy + 44);
    rctx.stroke();
  }

  const rampSurface = finalizeColorTexture(rampCanvas, anisotropy, 1, 1);
  rampSurface.wrapS = THREE.ClampToEdgeWrapping;
  rampSurface.wrapT = THREE.ClampToEdgeWrapping;
  created.push(rampSurface);

  // 8. Radial Contact Shadow Texture
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 128;
  shadowCanvas.height = 128;
  const shctx = shadowCanvas.getContext('2d')!;
  const radGrad = shctx.createRadialGradient(64, 64, 6, 64, 64, 62);
  radGrad.addColorStop(0, 'rgba(0, 0, 0, 0.58)');
  radGrad.addColorStop(0.55, 'rgba(0, 0, 0, 0.28)');
  radGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  shctx.fillStyle = radGrad;
  shctx.fillRect(0, 0, 128, 128);
  const contactShadow = finalizeColorTexture(shadowCanvas, 1, 1, 1);
  created.push(contactShadow);

  return {
    asphalt,
    grass,
    facades,
    highwaySign,
    speedSign,
    barricade,
    rampSurface,
    contactShadow,
    dispose: () => {
      created.forEach((t) => t.dispose());
    },
  };
}
