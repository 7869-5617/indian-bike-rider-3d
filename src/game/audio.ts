import { WeatherMode } from './types';

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private oscPrimary: OscillatorNode | null = null;
  private oscSub: OscillatorNode | null = null;
  private oscNitro: OscillatorNode | null = null;
  private nitroGain: GainNode | null = null;
  private rainSource: AudioBufferSourceNode | null = null;
  private rainGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private muted = false;
  private engineRunning = false;
  private initialized = false;

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(mute: boolean): void {
    this.muted = mute;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(mute ? 0 : 0.75, this.ctx.currentTime, 0.04);
    }
  }

  public toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  public unlock(): void {
    try {
      if (!this.ctx) {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return;
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = this.muted ? 0 : 0.75;
        this.masterGain.connect(this.ctx.destination);
        this.createNoiseBuffer();
        this.setupEngineNodes();
        this.initialized = true;
      }

      if (this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
    } catch {
      // Audio unavailable in current environment
    }
  }

  private createNoiseBuffer(): void {
    if (!this.ctx) return;
    const sampleRate = this.ctx.sampleRate;
    const length = Math.floor(sampleRate * 1.0);
    const buffer = this.ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buffer;
  }

  private setupEngineNodes(): void {
    if (!this.ctx || !this.masterGain) return;

    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 260;
    this.engineFilter.Q.value = 2.4;

    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;

    this.oscPrimary = this.ctx.createOscillator();
    this.oscPrimary.type = 'sawtooth';
    this.oscPrimary.frequency.value = 55;

    this.oscSub = this.ctx.createOscillator();
    this.oscSub.type = 'triangle';
    this.oscSub.frequency.value = 27.5;

    const subGain = this.ctx.createGain();
    subGain.gain.value = 0.65;

    this.oscPrimary.connect(this.engineFilter);
    this.oscSub.connect(subGain);
    subGain.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.masterGain);

    // ZX-10R Nitro afterburner turbine layer
    this.oscNitro = this.ctx.createOscillator();
    this.oscNitro.type = 'sawtooth';
    this.oscNitro.frequency.value = 240;
    this.nitroGain = this.ctx.createGain();
    this.nitroGain.gain.value = 0;
    this.oscNitro.connect(this.nitroGain);
    this.nitroGain.connect(this.masterGain);

    this.oscPrimary.start();
    this.oscSub.start();
    this.oscNitro.start();

    if (this.noiseBuffer) {
      this.rainSource = this.ctx.createBufferSource();
      this.rainSource.buffer = this.noiseBuffer;
      this.rainSource.loop = true;

      const rainFilter = this.ctx.createBiquadFilter();
      rainFilter.type = 'bandpass';
      rainFilter.frequency.value = 1150;
      rainFilter.Q.value = 0.65;

      this.rainGain = this.ctx.createGain();
      this.rainGain.gain.value = 0;

      this.rainSource.connect(rainFilter);
      rainFilter.connect(this.rainGain);
      this.rainGain.connect(this.masterGain);
      this.rainSource.start();
    }

    this.engineRunning = true;
  }

  public updateWeatherAudio(weather: WeatherMode, isPlaying: boolean): void {
    if (!this.initialized || !this.ctx || !this.rainGain) return;
    const now = this.ctx.currentTime;
    const target =
      this.muted || weather !== 'rain' ? 0 : isPlaying ? 0.055 : 0.022;
    this.rainGain.gain.setTargetAtTime(target, now, 0.2);
  }

  public updateEngine(
    speedKmh: number,
    maxSpeedKmh: number,
    accelerating: boolean,
    active: boolean,
    nitroActive = false
  ): void {
    if (!this.initialized || !this.ctx || !this.engineRunning) return;
    if (!this.engineGain || !this.oscPrimary || !this.oscSub || !this.engineFilter) return;

    const now = this.ctx.currentTime;
    if (!active || this.muted) {
      this.engineGain.gain.setTargetAtTime(0, now, 0.06);
      if (this.nitroGain) this.nitroGain.gain.setTargetAtTime(0, now, 0.05);
      return;
    }

    const normalized = Math.min(Math.max(speedKmh / Math.max(maxSpeedKmh, 120), 0), 1);
    const gearCycle = (normalized * 5.2) % 1;
    const basePitch =
      46 + normalized * 112 + gearCycle * 46 + (accelerating ? 16 : 0) + (nitroActive ? 34 : 0);

    const targetGain = 0.055 + normalized * 0.085 + (accelerating ? 0.035 : 0);
    const filterFreq = 220 + normalized * 960 + (accelerating ? 280 : 0) + (nitroActive ? 450 : 0);

    this.oscPrimary.frequency.setTargetAtTime(basePitch, now, 0.07);
    this.oscSub.frequency.setTargetAtTime(basePitch * 0.5, now, 0.07);
    this.engineFilter.frequency.setTargetAtTime(filterFreq, now, 0.08);
    this.engineGain.gain.setTargetAtTime(targetGain, now, 0.08);

    if (this.oscNitro && this.nitroGain) {
      this.oscNitro.frequency.setTargetAtTime(220 + normalized * 280, now, 0.08);
      this.nitroGain.gain.setTargetAtTime(nitroActive ? 0.055 : 0, now, 0.06);
    }
  }

  public playClick(): void {
    this.unlock();
    if (!this.ctx || !this.masterGain || this.muted) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(640, now);
      osc.frequency.exponentialRampToValueAtTime(220, now + 0.055);

      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.065);
    } catch {
      // Ignore audio scheduling error
    }
  }

  public playCoinPickup(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(987.77, now); // B5
      osc.frequency.setValueAtTime(1318.51, now + 0.055); // E6

      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.17);
    } catch {
      // Ignore
    }
  }

  public playRampJump(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(560, now + 0.22);

      gain.gain.setValueAtTime(0.16, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.25);
    } catch {
      // Ignore
    }
  }

  public playStuntBonus(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    try {
      const now = this.ctx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, idx) => {
        if (!this.ctx || !this.masterGain) return;
        const t = now + idx * 0.055;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t);

        gain.gain.setValueAtTime(0.14, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(t);
        osc.stop(t + 0.16);
      });
    } catch {
      // Ignore
    }
  }

  public playNearMiss(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.11);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.14);
    } catch {
      // Ignore
    }
  }

  public playMissionComplete(): void {
    this.unlock();
    if (!this.ctx || !this.masterGain || this.muted) return;
    try {
      const now = this.ctx.currentTime;
      const notes = [587.33, 880.0];
      notes.forEach((freq, idx) => {
        if (!this.ctx || !this.masterGain) return;
        const t = now + idx * 0.09;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t);

        gain.gain.setValueAtTime(0.16, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.19);

        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(t);
        osc.stop(t + 0.2);
      });
    } catch {
      // Ignore
    }
  }

  public playCrash(): void {
    this.unlock();
    if (!this.ctx || !this.masterGain || this.muted) return;
    try {
      const now = this.ctx.currentTime;

      if (this.engineGain) {
        this.engineGain.gain.setTargetAtTime(0, now, 0.02);
      }
      if (this.nitroGain) {
        this.nitroGain.gain.setTargetAtTime(0, now, 0.02);
      }

      const thump = this.ctx.createOscillator();
      const thumpGain = this.ctx.createGain();
      thump.type = 'sine';
      thump.frequency.setValueAtTime(145, now);
      thump.frequency.exponentialRampToValueAtTime(28, now + 0.35);

      thumpGain.gain.setValueAtTime(0.55, now);
      thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

      thump.connect(thumpGain);
      thumpGain.connect(this.masterGain);
      thump.start(now);
      thump.stop(now + 0.4);

      if (this.noiseBuffer) {
        const noise = this.ctx.createBufferSource();
        noise.buffer = this.noiseBuffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(950, now);
        filter.frequency.exponentialRampToValueAtTime(220, now + 0.45);
        filter.Q.value = 1.2;

        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0.42, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.46);

        noise.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(this.masterGain);
        noise.start(now);
        noise.stop(now + 0.48);
      }
    } catch {
      // Ignore
    }
  }

  public dispose(): void {
    try {
      if (this.oscPrimary) this.oscPrimary.stop();
      if (this.oscSub) this.oscSub.stop();
      if (this.oscNitro) this.oscNitro.stop();
      if (this.rainSource) this.rainSource.stop();
      if (this.ctx && this.ctx.state !== 'closed') {
        void this.ctx.close();
      }
    } catch {
      // Ignore cleanup errors
    }
    this.ctx = null;
    this.initialized = false;
    this.engineRunning = false;
  }
}
