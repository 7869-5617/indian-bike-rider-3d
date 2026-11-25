import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  CloudFog,
  CloudRain,
  Coins,
  Flame,
  Gamepad2,
  Lock,
  Pause,
  Play,
  RotateCcw,
  Settings,
  ShoppingBag,
  Sparkles,
  Sun,
  Target,
  Trophy,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react';
import { SpeedometerGauge } from './components/SpeedometerGauge';
import { BikeGameEngine } from './game/BikeGameEngine';
import {
  BIKE_CATALOG,
  getBikeSpec,
  loadPurchasedBikes,
  loadSelectedBikeId,
  loadStoredCoins,
  savePurchasedBikes,
  saveSelectedBikeId,
  saveStoredCoins,
} from './game/bikes';
import {
  claimAllMissionRewards,
  claimMissionReward,
  evaluateMissionsWithTelemetry,
  getTelemetryMetricForMission,
  getTimeUntilDailyReset,
  loadDailyMissions,
} from './game/missions';
import { ShowroomEngine } from './game/ShowroomEngine';
import {
  clampAmbientIntensity,
  DEFAULT_AMBIENT_INTENSITY,
  loadStoredAmbientIntensity,
  MAX_AMBIENT_INTENSITY,
  MIN_AMBIENT_INTENSITY,
  saveStoredAmbientIntensity,
} from './game/settings';
import {
  BikeId,
  BikeSpec,
  DailyMissionsSnapshot,
  GameState,
  GameTelemetry,
  InputState,
  WeatherMode,
} from './game/types';
import { loadStoredWeather, saveStoredWeather, WEATHER_OPTIONS } from './game/weather';

const INITIAL_TELEMETRY: GameTelemetry = {
  speedKmh: 0,
  peakSpeedKmh: 0,
  maxBikeSpeedKmh: 260,
  distanceM: 0,
  highSpeedDistanceM: 0,
  score: 0,
  stuntScore: 0,
  bestScore: 0,
  coins: 0,
  runCoinsEarned: 0,
  coinsCollectedInRun: 0,
  difficultyLevel: 1,
  nearMisses: 0,
  flipsInRun: 0,
  wheelieActive: false,
  isAirborne: false,
  nitroLevel: 100,
  nitroActive: false,
  hasNitro: false,
  stuntCallout: null,
  isNewBest: false,
  gear: 1,
};

function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(2)} km`;
  }
  return `${meters} m`;
}

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const showroomMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<BikeGameEngine | null>(null);
  const showroomRef = useRef<ShowroomEngine | null>(null);
  const gameStateRef = useRef<GameState>('menu');
  const showroomReturnTargetRef = useRef<'menu' | 'gameover'>('menu');

  const [ownedBikes, setOwnedBikes] = useState<BikeId[]>(() => loadPurchasedBikes());
  const [selectedBikeId, setSelectedBikeId] = useState<BikeId>(() =>
    loadSelectedBikeId(loadPurchasedBikes())
  );
  const [focusedBikeId, setFocusedBikeId] = useState<BikeId>(() =>
    loadSelectedBikeId(loadPurchasedBikes())
  );
  const focusedBikeIdRef = useRef<BikeId>(focusedBikeId);

  const [coins, setCoins] = useState<number>(() => loadStoredCoins());
  const coinsRef = useRef<number>(coins);
  const [dailyMissions, setDailyMissions] = useState<DailyMissionsSnapshot>(() =>
    loadDailyMissions()
  );
  const dailyMissionsRef = useRef<DailyMissionsSnapshot>(dailyMissions);
  const [showMissionsModal, setShowMissionsModal] = useState(false);
  const showMissionsModalRef = useRef(false);
  const [missionBanner, setMissionBanner] = useState<{
    title: string;
    rewardCoins: number;
    extraCount: number;
  } | null>(null);
  const missionBannerTimerRef = useRef<number | null>(null);

  const [gameState, setGameState] = useState<GameState>('menu');
  const [telemetry, setTelemetry] = useState<GameTelemetry>(() => ({
    ...INITIAL_TELEMETRY,
    coins: loadStoredCoins(),
  }));
  const [muted, setMuted] = useState(false);
  const [weather, setWeather] = useState<WeatherMode>(() => loadStoredWeather());
  const [ambientIntensity, setAmbientIntensity] = useState<number>(() =>
    loadStoredAmbientIntensity()
  );
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const showSettingsModalRef = useRef(false);
  const [showTouchControls, setShowTouchControls] = useState(false);
  const [showAccelHint, setShowAccelHint] = useState(false);
  const [contextNotice, setContextNotice] = useState<string | null>(null);

  const [activeTouch, setActiveTouch] = useState<InputState>({
    accelerate: false,
    brake: false,
    left: false,
    right: false,
    wheelie: false,
    nitro: false,
  });

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    focusedBikeIdRef.current = focusedBikeId;
  }, [focusedBikeId]);

  useEffect(() => {
    coinsRef.current = coins;
  }, [coins]);

  useEffect(() => {
    dailyMissionsRef.current = dailyMissions;
  }, [dailyMissions]);

  useEffect(() => {
    showMissionsModalRef.current = showMissionsModal;
  }, [showMissionsModal]);

  useEffect(() => {
    showSettingsModalRef.current = showSettingsModal;
  }, [showSettingsModal]);

  // Detect touch-capable or compact viewports for automatic mobile controls
  useEffect(() => {
    const evaluateTouch = () => {
      const isCoarse = window.matchMedia('(pointer: coarse)').matches;
      const isCompact = window.innerWidth < 1024;
      const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      setShowTouchControls(isCoarse || isCompact || hasTouch);
    };
    evaluateTouch();
    window.addEventListener('resize', evaluateTouch);
    return () => window.removeEventListener('resize', evaluateTouch);
  }, []);

  // Mount Three.js highway game engine once inside isolated container ref
  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const notifyNewlyCompleted = (
      newlyCompleted: DailyMissionsSnapshot['missions'],
      eng: BikeGameEngine
    ) => {
      if (newlyCompleted.length === 0) return;
      eng.sound.playMissionComplete();
      const first = newlyCompleted[0];
      setMissionBanner({
        title: first.definition.title,
        rewardCoins: newlyCompleted.reduce((sum, m) => sum + m.definition.rewardCoins, 0),
        extraCount: Math.max(0, newlyCompleted.length - 1),
      });
      if (missionBannerTimerRef.current !== null) {
        window.clearTimeout(missionBannerTimerRef.current);
      }
      missionBannerTimerRef.current = window.setTimeout(() => {
        setMissionBanner(null);
      }, 3400);
    };

    const engine = new BikeGameEngine(mount, {
      onTelemetry: (next) => {
        setTelemetry(next);
        coinsRef.current = next.coins;
        setCoins(next.coins);
        if (gameStateRef.current === 'playing') {
          const evalRes = evaluateMissionsWithTelemetry(dailyMissionsRef.current, next);
          if (evalRes.changed) {
            dailyMissionsRef.current = evalRes.next;
            setDailyMissions(evalRes.next);
            notifyNewlyCompleted(evalRes.newlyCompleted, engine);
          }
        }
      },
      onGameOver: (finalTelemetry) => {
        setTelemetry(finalTelemetry);
        coinsRef.current = finalTelemetry.coins;
        setCoins(finalTelemetry.coins);
        const evalRes = evaluateMissionsWithTelemetry(dailyMissionsRef.current, finalTelemetry);
        if (evalRes.changed) {
          dailyMissionsRef.current = evalRes.next;
          setDailyMissions(evalRes.next);
          notifyNewlyCompleted(evalRes.newlyCompleted, engine);
        }
        setGameState('gameover');
        setActiveTouch({
          accelerate: false,
          brake: false,
          left: false,
          right: false,
          wheelie: false,
          nitro: false,
        });
      },
      onContextError: (msg) => {
        setContextNotice(msg);
      },
    });

    engineRef.current = engine;

    return () => {
      if (missionBannerTimerRef.current !== null) {
        window.clearTimeout(missionBannerTimerRef.current);
      }
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  // Mount & dispose the 3D Showroom when entering/leaving showroom state
  useEffect(() => {
    if (gameState !== 'showroom') {
      engineRef.current?.setSuspended(false);
      return;
    }

    const mount = showroomMountRef.current;
    if (!mount) return;

    engineRef.current?.setSuspended(true);

    const showroom = new ShowroomEngine(mount, focusedBikeIdRef.current);
    showroomRef.current = showroom;

    return () => {
      showroom.dispose();
      showroomRef.current = null;
      engineRef.current?.setSuspended(false);
    };
  }, [gameState]);

  // Rotate showroom carousel whenever the focused bike changes
  useEffect(() => {
    if (gameState === 'showroom') {
      showroomRef.current?.setFocusedBike(focusedBikeId);
    }
  }, [focusedBikeId, gameState]);

  // Gentle acceleration hint if player sits at standstill for 1.8s after starting
  useEffect(() => {
    if (gameState !== 'playing') {
      setShowAccelHint(false);
      return;
    }
    if (telemetry.speedKmh > 12) {
      setShowAccelHint(false);
      return;
    }
    const timer = window.setTimeout(() => {
      if (gameStateRef.current === 'playing') {
        setShowAccelHint(true);
      }
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [gameState, telemetry.speedKmh]);

  const stepShowroomBike = useCallback((dir: -1 | 1) => {
    engineRef.current?.sound.playClick();
    setFocusedBikeId((curr) => {
      const idx = BIKE_CATALOG.findIndex((b) => b.id === curr);
      const nextIdx = (idx + dir + BIKE_CATALOG.length) % BIKE_CATALOG.length;
      return BIKE_CATALOG[nextIdx].id;
    });
  }, []);

  const handleBackFromShowroom = useCallback(() => {
    engineRef.current?.sound.playClick();
    setGameState(showroomReturnTargetRef.current);
  }, []);

  // Keyboard Controls (Highway Driving + Pause + Showroom Browsing)
  useEffect(() => {
    const mapKey = (code: string): keyof InputState | null => {
      switch (code) {
        case 'KeyW':
        case 'ArrowUp':
          return 'accelerate';
        case 'KeyS':
        case 'ArrowDown':
        case 'Space':
          return 'brake';
        case 'KeyA':
        case 'ArrowLeft':
          return 'left';
        case 'KeyD':
        case 'ArrowRight':
          return 'right';
        case 'ShiftLeft':
        case 'ShiftRight':
        case 'KeyE':
          return 'wheelie';
        case 'KeyN':
        case 'KeyF':
          return 'nitro';
        default:
          return null;
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.code === 'ArrowUp' ||
        e.code === 'ArrowDown' ||
        e.code === 'ArrowLeft' ||
        e.code === 'ArrowRight' ||
        e.code === 'Space'
      ) {
        e.preventDefault();
      }

      if (showSettingsModalRef.current && e.code === 'Escape') {
        if (e.repeat) return;
        engineRef.current?.sound.playClick();
        setShowSettingsModal(false);
        return;
      }

      if (showMissionsModalRef.current && e.code === 'Escape') {
        if (e.repeat) return;
        engineRef.current?.sound.playClick();
        setShowMissionsModal(false);
        return;
      }

      if (gameStateRef.current === 'showroom') {
        if (e.repeat) return;
        if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
          stepShowroomBike(-1);
        } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
          stepShowroomBike(1);
        } else if (e.code === 'Escape') {
          handleBackFromShowroom();
        }
        return;
      }

      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (e.repeat) return;
        const engine = engineRef.current;
        if (!engine) return;
        if (gameStateRef.current === 'playing') {
          engine.sound.playClick();
          engine.pauseGame();
          setGameState('paused');
        } else if (gameStateRef.current === 'paused') {
          engine.sound.playClick();
          engine.resumeGame();
          setGameState('playing');
        }
        return;
      }

      if (gameStateRef.current !== 'playing') return;
      const action = mapKey(e.code);
      if (action && engineRef.current) {
        engineRef.current.sound.unlock();
        engineRef.current.setInput({ [action]: true });
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const action = mapKey(e.code);
      if (action && engineRef.current) {
        engineRef.current.setInput({ [action]: false });
      }
    };

    const handleBlur = () => {
      engineRef.current?.clearInput();
      setActiveTouch({
        accelerate: false,
        brake: false,
        left: false,
        right: false,
        wheelie: false,
        nitro: false,
      });
    };

    window.addEventListener('keydown', handleKeyDown, { passive: false });
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [handleBackFromShowroom, stepShowroomBike]);

  const handlePlay = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.sound.playClick();
    setContextNotice(null);
    setShowMissionsModal(false);
    setShowSettingsModal(false);
    setMissionBanner(null);
    const syncedMissions = loadDailyMissions();
    dailyMissionsRef.current = syncedMissions;
    setDailyMissions(syncedMissions);
    engine.startGame();
    setGameState('playing');
  }, []);

  const handleOpenShowroom = useCallback(
    (from: 'menu' | 'gameover') => {
      engineRef.current?.sound.unlock();
      engineRef.current?.sound.playClick();
      setShowMissionsModal(false);
      setShowSettingsModal(false);
      showroomReturnTargetRef.current = from;
      setFocusedBikeId(selectedBikeId);
      setGameState('showroom');
    },
    [selectedBikeId]
  );

  const handleOpenMissions = useCallback(() => {
    engineRef.current?.sound.unlock();
    engineRef.current?.sound.playClick();
    setShowSettingsModal(false);
    const fresh = loadDailyMissions();
    dailyMissionsRef.current = fresh;
    setDailyMissions(fresh);
    setShowMissionsModal(true);
  }, []);

  const handleOpenSettings = useCallback(() => {
    engineRef.current?.sound.unlock();
    engineRef.current?.sound.playClick();
    setShowMissionsModal(false);
    setShowSettingsModal(true);
  }, []);

  const handleClaimMission = useCallback((missionId: string) => {
    const { next, rewardEarned } = claimMissionReward(dailyMissionsRef.current, missionId);
    if (rewardEarned <= 0) return;
    dailyMissionsRef.current = next;
    setDailyMissions(next);

    const nextCoins = coinsRef.current + rewardEarned;
    coinsRef.current = nextCoins;
    saveStoredCoins(nextCoins);
    setCoins(nextCoins);
    engineRef.current?.setCoins(nextCoins);
    engineRef.current?.sound.playMissionComplete();
  }, []);

  const handleClaimAllMissions = useCallback(() => {
    const { next, rewardEarned } = claimAllMissionRewards(dailyMissionsRef.current);
    if (rewardEarned <= 0) return;
    dailyMissionsRef.current = next;
    setDailyMissions(next);

    const nextCoins = coinsRef.current + rewardEarned;
    coinsRef.current = nextCoins;
    saveStoredCoins(nextCoins);
    setCoins(nextCoins);
    engineRef.current?.setCoins(nextCoins);
    engineRef.current?.sound.playMissionComplete();
  }, []);

  const handleBuyBike = useCallback(
    (bike: BikeSpec) => {
      if (ownedBikes.includes(bike.id)) return;
      if (coins < bike.price) return;

      const nextCoins = coins - bike.price;
      const nextOwned: BikeId[] = [...ownedBikes, bike.id];

      saveStoredCoins(nextCoins);
      savePurchasedBikes(nextOwned);
      saveSelectedBikeId(bike.id);

      coinsRef.current = nextCoins;
      setCoins(nextCoins);
      setOwnedBikes(nextOwned);
      setSelectedBikeId(bike.id);

      engineRef.current?.sound.playClick();
      engineRef.current?.setCoins(nextCoins);
      engineRef.current?.setSelectedBike(bike.id);
    },
    [coins, ownedBikes]
  );

  const handleSelectBike = useCallback(
    (bikeId: BikeId) => {
      if (!ownedBikes.includes(bikeId)) return; // Locked bikes cannot be selected
      saveSelectedBikeId(bikeId);
      setSelectedBikeId(bikeId);
      engineRef.current?.sound.playClick();
      engineRef.current?.setSelectedBike(bikeId);
    },
    [ownedBikes]
  );

  const handleRideNow = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.sound.playClick();
    setContextNotice(null);
    setShowMissionsModal(false);
    setMissionBanner(null);

    if (ownedBikes.includes(focusedBikeId) && focusedBikeId !== selectedBikeId) {
      saveSelectedBikeId(focusedBikeId);
      setSelectedBikeId(focusedBikeId);
      engine.setSelectedBike(focusedBikeId);
    }

    const syncedMissions = loadDailyMissions();
    dailyMissionsRef.current = syncedMissions;
    setDailyMissions(syncedMissions);
    engine.startGame();
    setActiveTouch({
      accelerate: false,
      brake: false,
      left: false,
      right: false,
      wheelie: false,
      nitro: false,
    });
    setGameState('playing');
  }, [focusedBikeId, ownedBikes, selectedBikeId]);

  const handlePause = useCallback(() => {
    const engine = engineRef.current;
    if (!engine || gameStateRef.current !== 'playing') return;
    engine.sound.playClick();
    engine.pauseGame();
    setActiveTouch({
      accelerate: false,
      brake: false,
      left: false,
      right: false,
      wheelie: false,
      nitro: false,
    });
    setGameState('paused');
  }, []);

  const handleResume = useCallback(() => {
    const engine = engineRef.current;
    if (!engine || gameStateRef.current !== 'paused') return;
    engine.sound.playClick();
    setShowMissionsModal(false);
    engine.resumeGame();
    setGameState('playing');
  }, []);

  const handleRestart = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.sound.playClick();
    setShowMissionsModal(false);
    setMissionBanner(null);
    const syncedMissions = loadDailyMissions();
    dailyMissionsRef.current = syncedMissions;
    setDailyMissions(syncedMissions);
    engine.startGame();
    setActiveTouch({
      accelerate: false,
      brake: false,
      left: false,
      right: false,
      wheelie: false,
      nitro: false,
    });
    setGameState('playing');
  }, []);

  const handleMainMenu = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.sound.playClick();
    setShowMissionsModal(false);
    setMissionBanner(null);
    engine.returnToMenu();
    setActiveTouch({
      accelerate: false,
      brake: false,
      left: false,
      right: false,
      wheelie: false,
      nitro: false,
    });
    setGameState('menu');
  }, []);

  const handleToggleMute = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.sound.unlock();
    const nextMuted = engine.sound.toggleMute();
    setMuted(nextMuted);
    if (!nextMuted) {
      engine.sound.playClick();
    }
  }, []);

  const handleSelectWeather = useCallback((nextWeather: WeatherMode) => {
    engineRef.current?.sound.unlock();
    engineRef.current?.sound.playClick();
    saveStoredWeather(nextWeather);
    setWeather(nextWeather);
    engineRef.current?.setWeather(nextWeather);
  }, []);

  const handleCycleWeather = useCallback(() => {
    const idx = WEATHER_OPTIONS.findIndex((o) => o.id === weather);
    const next = WEATHER_OPTIONS[(idx + 1) % WEATHER_OPTIONS.length].id;
    handleSelectWeather(next);
  }, [handleSelectWeather, weather]);

  const handleChangeAmbientIntensity = useCallback((nextValue: number) => {
    const clamped = clampAmbientIntensity(nextValue);
    saveStoredAmbientIntensity(clamped);
    setAmbientIntensity(clamped);
    engineRef.current?.setAmbientIntensity(clamped);
    showroomRef.current?.setAmbientIntensity(clamped);
  }, []);

  const bindTouchControl = (control: keyof InputState) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Ignore if pointer capture unsupported
      }
      engineRef.current?.sound.unlock();
      engineRef.current?.setInput({ [control]: true });
      setActiveTouch((prev) => ({ ...prev, [control]: true }));
    },
    onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        // Ignore
      }
      engineRef.current?.setInput({ [control]: false });
      setActiveTouch((prev) => ({ ...prev, [control]: false }));
    },
    onPointerCancel: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      engineRef.current?.setInput({ [control]: false });
      setActiveTouch((prev) => ({ ...prev, [control]: false }));
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  const equippedBikeSpec = getBikeSpec(selectedBikeId);
  const focusedBikeSpec = getBikeSpec(focusedBikeId);
  const focusedIndex = BIKE_CATALOG.findIndex((b) => b.id === focusedBikeId);
  const isFocusedOwned = ownedBikes.includes(focusedBikeSpec.id);
  const isFocusedSelected = selectedBikeId === focusedBikeSpec.id;
  const canAffordFocused = coins >= focusedBikeSpec.price;

  const completedMissionCount = dailyMissions.missions.filter((m) => m.completed).length;
  const claimableMissions = dailyMissions.missions.filter((m) => m.completed && !m.claimed);
  const claimableCoinsTotal = claimableMissions.reduce(
    (sum, m) => sum + m.definition.rewardCoins,
    0
  );
  const activeHudMission =
    dailyMissions.missions.find((m) => !m.completed) ?? dailyMissions.missions[0];
  const activeHudLiveValue = activeHudMission
    ? activeHudMission.completed
      ? activeHudMission.definition.target
      : Math.min(
          activeHudMission.definition.target,
          Math.floor(getTelemetryMetricForMission(activeHudMission.definition.kind, telemetry))
        )
    : 0;
  const activeHudPct = activeHudMission
    ? Math.min(100, Math.round((activeHudLiveValue / activeHudMission.definition.target) * 100))
    : 0;
  const dailyResetLabel = getTimeUntilDailyReset();

  return (
    <div className="relative w-full h-full overflow-hidden bg-zinc-950 select-none">
      {/* Dedicated WebGL Canvas Container for Highway Game */}
      <div
        ref={canvasMountRef}
        className={`absolute inset-0 w-full h-full ${
          gameState === 'showroom' ? 'invisible pointer-events-none' : 'visible'
        }`}
        aria-label="3D motorcycle highway viewport"
      />

      {contextNotice && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-zinc-950/95 border border-red-500/40 text-xs font-medium text-red-200">
          {contextNotice}
        </div>
      )}

      {/* IN-GAME HUD */}
      {(gameState === 'playing' || gameState === 'paused') && (
        <div className="absolute inset-0 z-20 pointer-events-none">
          {/* Top Bar: Score/Distance + Daily Tracker (Left), Compact Circular Gauge (Mobile Center), Actions (Right) */}
          <div className="flex items-start justify-between gap-1.5 sm:gap-2 p-2.5 sm:p-4">
            {/* Left Column: Score/Distance Cluster + Compact Daily Mission Tracker */}
            <div className="flex flex-col items-start gap-2.5">
              <div className="pointer-events-auto bg-zinc-950/90 border border-white/10 rounded-xl px-2.5 py-1.5 sm:px-4 sm:py-2.5 shadow-lg">
                <div className="flex items-baseline gap-2.5 sm:gap-5">
                  <div>
                    <div className="text-[9px] sm:text-[10px] font-semibold tracking-wider text-zinc-400">
                      SCORE
                    </div>
                    <div className="font-display text-base sm:text-2xl font-bold text-white tabular-nums leading-tight">
                      {telemetry.score.toLocaleString()}
                    </div>
                  </div>
                  <div className="h-6 sm:h-7 w-px bg-white/10" aria-hidden="true" />
                  <div>
                    <div className="text-[9px] sm:text-[10px] font-semibold tracking-wider text-zinc-400">
                      DISTANCE
                    </div>
                    <div className="font-display text-sm sm:text-xl font-bold text-red-400 tabular-nums leading-tight">
                      {formatDistance(telemetry.distanceM)}
                    </div>
                  </div>
                  <div className="hidden sm:block h-7 w-px bg-white/10" aria-hidden="true" />
                  <div className="hidden sm:block">
                    <div className="text-[10px] font-semibold tracking-wider text-amber-400/90">
                      COINS
                    </div>
                    <div className="font-display text-xl font-bold text-amber-300 tabular-nums leading-tight flex items-center gap-1">
                      <Coins className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>{telemetry.coins.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </div>

              {gameState === 'playing' && activeHudMission && (
                <div
                  data-testid="hud-mission-tracker"
                  className="hidden md:block w-64 bg-zinc-950/88 border border-white/10 rounded-xl px-3.5 py-2.5 shadow-lg"
                >
                  <div className="flex items-center justify-between gap-2 text-[11px] font-semibold">
                    <span className="text-zinc-300 truncate">
                      {completedMissionCount === dailyMissions.missions.length
                        ? 'All daily missions done'
                        : activeHudMission.definition.description}
                    </span>
                    <span className="font-display text-amber-300 tabular-nums shrink-0">
                      +{activeHudMission.definition.rewardCoins}
                    </span>
                  </div>
                  {completedMissionCount < dailyMissions.missions.length && (
                    <>
                      <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden mt-1.5">
                        <div
                          className="h-full bg-red-500 transition-[width] duration-150"
                          style={{ width: `${activeHudPct}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] text-zinc-400 tabular-nums mt-1">
                        <span>Daily Objective</span>
                        <span>
                          {activeHudLiveValue.toLocaleString()} /{' '}
                          {activeHudMission.definition.target.toLocaleString()}{' '}
                          {activeHudMission.definition.unit}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Compact Mobile Circular Speedometer Gauge (Top-Center on <768px) */}
            <div className="md:hidden shrink-0">
              <SpeedometerGauge
                compact
                speedKmh={telemetry.speedKmh}
                maxSpeedKmh={equippedBikeSpec.topSpeedKmh}
                gear={telemetry.gear}
                bikeName={equippedBikeSpec.name}
                hasNitro={telemetry.hasNitro}
                nitroLevel={telemetry.nitroLevel}
                nitroActive={telemetry.nitroActive}
              />
            </div>

            {/* Top-Right Functional Controls */}
            <div className="pointer-events-auto flex items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={() => {
                  engineRef.current?.sound.playClick();
                  setShowTouchControls((v) => !v);
                }}
                aria-label="Toggle on-screen touch controls"
                title="Toggle on-screen controls"
                className={`hidden lg:inline-flex items-center justify-center w-11 h-11 rounded-xl border transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-red-500 ${
                  showTouchControls
                    ? 'bg-red-600 border-red-500 text-white'
                    : 'bg-zinc-950/90 border-white/10 text-zinc-300 hover:text-white hover:border-white/25'
                }`}
              >
                <Gamepad2 className="w-5 h-5" />
              </button>

              <button
                type="button"
                data-testid="hud-weather-btn"
                onClick={handleCycleWeather}
                aria-label={`Weather: ${weather}. Click to switch`}
                title={`Weather: ${weather.charAt(0).toUpperCase() + weather.slice(1)} (click to change)`}
                className={`inline-flex items-center justify-center gap-1.5 w-10 h-10 sm:w-auto sm:h-11 sm:px-3 rounded-xl border transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-red-500 ${
                  weather === 'rain'
                    ? 'bg-sky-950/90 border-sky-400/50 text-sky-300 hover:border-sky-300'
                    : weather === 'fog'
                      ? 'bg-slate-900/90 border-slate-400/50 text-slate-200 hover:border-slate-300'
                      : 'bg-zinc-950/90 border-white/10 text-amber-300 hover:border-white/25'
                }`}
              >
                {weather === 'rain' ? (
                  <CloudRain className="w-4 h-4 shrink-0" />
                ) : weather === 'fog' ? (
                  <CloudFog className="w-4 h-4 shrink-0" />
                ) : (
                  <Sun className="w-4 h-4 shrink-0" />
                )}
                <span className="hidden md:inline text-xs font-semibold capitalize">
                  {weather}
                </span>
              </button>

              <button
                type="button"
                onClick={handleToggleMute}
                aria-label={muted ? 'Unmute audio' : 'Mute audio'}
                className="inline-flex items-center justify-center w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-zinc-950/90 border border-white/10 text-zinc-200 hover:text-white hover:border-white/25 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-red-500"
              >
                {muted ? <VolumeX className="w-4 h-4 sm:w-5 sm:h-5 text-red-400" /> : <Volume2 className="w-4 h-4 sm:w-5 sm:h-5" />}
              </button>

              <button
                type="button"
                onClick={handlePause}
                aria-label="Pause game"
                className="inline-flex items-center justify-center gap-2 w-10 h-10 sm:w-auto sm:h-11 sm:px-3.5 rounded-xl bg-zinc-950/90 border border-white/10 text-white font-semibold text-sm hover:border-red-500/60 hover:bg-zinc-900 transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-red-500"
              >
                <Pause className="w-4 h-4 text-red-500" />
                <span className="hidden sm:inline">Pause</span>
              </button>
            </div>
          </div>

          {/* Mission Completion Toast Banner */}
          {missionBanner && gameState === 'playing' && (
            <div
              data-testid="hud-mission-toast"
              className="absolute top-16 sm:top-5 left-1/2 -translate-x-1/2 z-30 px-4 py-2.5 rounded-xl bg-zinc-950/95 border border-amber-400/50 shadow-2xl text-center whitespace-nowrap"
            >
              <div className="text-[10px] font-bold tracking-widest text-amber-400">
                MISSION COMPLETE
              </div>
              <div className="font-display text-sm font-bold text-white mt-0.5 tabular-nums">
                {missionBanner.title}
                {missionBanner.extraCount > 0 ? ` +${missionBanner.extraCount} more` : ''}{' '}
                <span className="text-amber-300">
                  · +{missionBanner.rewardCoins.toLocaleString()} COINS
                </span>
              </div>
            </div>
          )}

          {/* Live Stunt / Wheelie / Air-Flip Callout */}
          {telemetry.stuntCallout && gameState === 'playing' && (
            <div
              data-testid="hud-stunt-callout"
              className="absolute top-20 sm:top-6 left-1/2 -translate-x-1/2 z-30 px-4 py-1.5 rounded-xl bg-zinc-950/92 border border-amber-400/50 shadow-xl text-center whitespace-nowrap"
            >
              <span className="font-display text-sm sm:text-base font-bold tracking-wider text-amber-300">
                {telemetry.stuntCallout}
              </span>
            </div>
          )}

          {/* Gentle acceleration prompt when stationary */}
          {showAccelHint && gameState === 'playing' && (
            <div className="absolute top-32 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg bg-zinc-950/90 border border-red-500/40 text-xs sm:text-sm font-medium text-zinc-100 whitespace-nowrap shadow-lg">
              {showTouchControls ? 'Hold GAS to ride' : 'Hold W or Up Arrow to accelerate'}
            </div>
          )}

          {/* Desktop Circular Speedometer Gauge (Bottom-Right) */}
          <div className="hidden md:block absolute bottom-5 right-5">
            <SpeedometerGauge
              speedKmh={telemetry.speedKmh}
              maxSpeedKmh={equippedBikeSpec.topSpeedKmh}
              gear={telemetry.gear}
              bikeName={equippedBikeSpec.name}
              hasNitro={telemetry.hasNitro}
              nitroLevel={telemetry.nitroLevel}
              nitroActive={telemetry.nitroActive}
            />
          </div>

          {/* Desktop Subtle Controls Strip (Bottom-Left when touch controls hidden) */}
          {!showTouchControls && (
            <div className="hidden md:flex flex-wrap absolute bottom-5 left-5 items-center gap-3 bg-zinc-950/88 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-zinc-300">
              <span>
                <strong className="text-white">W / ↑</strong> Gas
              </span>
              <span className="text-zinc-600" aria-hidden="true">·</span>
              <span>
                <strong className="text-white">S / ↓ / Space</strong> Brake
              </span>
              <span className="text-zinc-600" aria-hidden="true">·</span>
              <span>
                <strong className="text-white">A D / ← →</strong> Steer
              </span>
              <span className="text-zinc-600" aria-hidden="true">·</span>
              <span>
                <strong className="text-amber-300">Shift / E</strong> Wheelie & Flip
              </span>
              {telemetry.hasNitro && (
                <>
                  <span className="text-zinc-600" aria-hidden="true">·</span>
                  <span>
                    <strong className="text-sky-300">N / F</strong> Nitro
                  </span>
                </>
              )}
            </div>
          )}

          {/* Mobile / Touch Controls Overlay (Continuous hold-responsive multi-touch) */}
          {showTouchControls && gameState === 'playing' && (
            <>
              {/* Left & Right Steering Pad + Stunt Wheelie/Flip button (Bottom-Left) */}
              <div className="pointer-events-auto absolute bottom-4 left-4 flex flex-col items-start gap-2.5">
                <button
                  type="button"
                  aria-label="Wheelie or Air Flip"
                  {...bindTouchControl('wheelie')}
                  className={`h-11 px-4 rounded-xl border font-display text-xs font-bold tracking-wider flex items-center gap-1.5 transition-transform cursor-pointer touch-none ${
                    activeTouch.wheelie
                      ? 'bg-amber-500 border-amber-300 text-zinc-950 scale-95'
                      : 'bg-zinc-950/88 border-amber-400/40 text-amber-300'
                  }`}
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>{telemetry.isAirborne ? 'AIR FLIP' : 'WHEELIE'}</span>
                </button>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    aria-label="Steer left"
                    {...bindTouchControl('left')}
                    className={`w-16 h-16 sm:w-[72px] sm:h-[72px] rounded-2xl border flex items-center justify-center transition-transform cursor-pointer touch-none ${
                      activeTouch.left
                        ? 'bg-red-600 border-red-400 text-white scale-95'
                        : 'bg-zinc-950/88 border-white/15 text-white'
                    }`}
                  >
                    <ChevronLeft className="w-9 h-9" />
                  </button>
                  <button
                    type="button"
                    aria-label="Steer right"
                    {...bindTouchControl('right')}
                    className={`w-16 h-16 sm:w-[72px] sm:h-[72px] rounded-2xl border flex items-center justify-center transition-transform cursor-pointer touch-none ${
                      activeTouch.right
                        ? 'bg-red-600 border-red-400 text-white scale-95'
                        : 'bg-zinc-950/88 border-white/15 text-white'
                    }`}
                  >
                    <ChevronRight className="w-9 h-9" />
                  </button>
                </div>
              </div>

              {/* Brake, Gas & Nitro Pedals (Bottom-Right) */}
              <div
                className={`pointer-events-auto absolute bottom-4 right-4 ${
                  telemetry.hasNitro ? 'md:bottom-[296px]' : 'md:bottom-[242px]'
                } flex flex-col items-end gap-2.5`}
              >
                {telemetry.hasNitro && (
                  <button
                    type="button"
                    aria-label="Nitro boost"
                    {...bindTouchControl('nitro')}
                    className={`h-11 px-4 rounded-xl border font-display text-xs font-bold tracking-wider flex items-center gap-1.5 transition-transform cursor-pointer touch-none ${
                      activeTouch.nitro
                        ? 'bg-sky-400 border-white text-zinc-950 scale-95'
                        : 'bg-zinc-950/88 border-sky-400/50 text-sky-300'
                    }`}
                  >
                    <Flame className="w-3.5 h-3.5" />
                    <span>NITRO {telemetry.nitroLevel}%</span>
                  </button>
                )}

                <div className="flex items-end gap-3">
                  <button
                    type="button"
                    aria-label="Brake"
                    {...bindTouchControl('brake')}
                    className={`w-[68px] h-16 sm:w-20 sm:h-[72px] rounded-2xl border font-display text-xs sm:text-sm font-bold tracking-wider flex flex-col items-center justify-center transition-transform cursor-pointer touch-none ${
                      activeTouch.brake
                        ? 'bg-amber-600 border-amber-400 text-white scale-95'
                        : 'bg-zinc-950/88 border-white/15 text-zinc-200'
                    }`}
                  >
                    <span>BRAKE</span>
                  </button>
                  <button
                    type="button"
                    aria-label="Accelerate"
                    {...bindTouchControl('accelerate')}
                    className={`w-[74px] h-[76px] sm:w-22 sm:h-24 rounded-2xl border font-display text-sm sm:text-base font-bold tracking-wider flex flex-col items-center justify-center transition-transform cursor-pointer touch-none ${
                      activeTouch.accelerate
                        ? 'bg-red-500 border-red-300 text-white scale-95'
                        : 'bg-red-600/95 border-red-400/50 text-white'
                    }`}
                  >
                    <span>GAS</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* 3D LUXURY MOTORCYCLE SHOWROOM */}
      {gameState === 'showroom' && (
        <div className="absolute inset-0 z-40 bg-zinc-950 flex flex-col overflow-hidden">
          {/* Top Header Bar (Shared across Desktop & Mobile) */}
          <header className="relative z-20 shrink-0 flex items-center justify-between gap-2 px-3 py-2.5 sm:px-5 sm:py-3.5 bg-zinc-950/95 border-b border-white/10">
            <button
              type="button"
              onClick={handleBackFromShowroom}
              aria-label="Back"
              className="inline-flex items-center gap-2 h-10 sm:h-11 px-3.5 sm:px-4 rounded-xl bg-zinc-900 border border-white/15 text-xs sm:text-sm font-semibold text-zinc-100 hover:text-white hover:border-red-500/60 transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-red-500"
            >
              <ArrowLeft className="w-4 h-4 text-red-500" />
              <span>BACK</span>
            </button>

            <div className="text-center min-w-0">
              <div className="font-display text-base sm:text-xl font-bold tracking-wider text-white truncate">
                GARAGE / SHOWROOM
              </div>
              <div className="hidden md:block text-[11px] font-medium text-zinc-400">
                Drag center 3D view to rotate · Scroll to zoom
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <div
                data-testid="showroom-coins"
                className="inline-flex items-center gap-1.5 sm:gap-2 h-10 sm:h-11 px-3 sm:px-4 rounded-xl bg-zinc-900 border border-amber-500/35 text-xs sm:text-sm font-semibold text-white"
              >
                <Coins className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="font-display font-bold tabular-nums text-amber-300">
                  {coins.toLocaleString()}
                </span>
                <span className="hidden sm:inline text-xs text-zinc-400">COINS</span>
              </div>

              <button
                type="button"
                onClick={handleToggleMute}
                aria-label={muted ? 'Unmute audio' : 'Mute audio'}
                className="inline-flex items-center justify-center w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-zinc-900 border border-white/15 text-zinc-200 hover:text-white hover:border-white/30 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-red-500"
              >
                {muted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
              </button>
            </div>
          </header>

          {/* Main Showroom Area: Top 3D + Bottom Details on Mobile | Full-bleed 3D + Left/Right Panels on Desktop */}
          <div className="relative flex-1 min-h-0 flex flex-col lg:block">
            {/* WebGL 3D Showroom Viewport */}
            <div className="relative flex-1 min-h-[220px] lg:absolute lg:inset-0">
              <div
                ref={showroomMountRef}
                className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing"
                aria-label="3D motorcycle showroom viewport"
              />

              {/* Mobile-only Left/Right arrows pinned cleanly to edges of 3D viewport */}
              <button
                type="button"
                onClick={() => stepShowroomBike(-1)}
                aria-label="Previous motorcycle mobile"
                className="lg:hidden absolute left-2.5 top-1/2 -translate-y-1/2 z-10 w-10 h-12 rounded-xl bg-zinc-950/90 border border-white/15 text-white flex items-center justify-center active:scale-95 cursor-pointer shadow-lg"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <button
                type="button"
                onClick={() => stepShowroomBike(1)}
                aria-label="Next motorcycle mobile"
                className="lg:hidden absolute right-2.5 top-1/2 -translate-y-1/2 z-10 w-10 h-12 rounded-xl bg-zinc-950/90 border border-white/15 text-white flex items-center justify-center active:scale-95 cursor-pointer shadow-lg"
              >
                <ChevronRight className="w-6 h-6" />
              </button>

              {/* Mobile subtle rotate label */}
              <div className="lg:hidden pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-md bg-zinc-950/80 border border-white/10 text-[10px] font-medium text-zinc-300 whitespace-nowrap">
                Drag to rotate bike
              </div>
            </div>

            {/* DESKTOP THREE-SECTION OVERLAY (Left Panel | Open Center 3D | Right Panel) */}
            <div className="hidden lg:flex relative z-10 h-full pointer-events-none items-center justify-between gap-4 p-5">
              {/* LEFT PANEL: Bike Collection List + Prev/Next Navigation */}
              <aside className="pointer-events-auto w-[264px] xl:w-[288px] max-h-full flex flex-col bg-zinc-950/92 border border-white/15 rounded-2xl p-4 shadow-2xl">
                <div className="flex items-center justify-between pb-3 border-b border-white/10">
                  <span className="text-xs font-bold tracking-widest text-red-400">
                    MOTORCYCLES
                  </span>
                  <span className="font-display text-xs font-bold text-zinc-400 tabular-nums">
                    {focusedIndex + 1} / {BIKE_CATALOG.length}
                  </span>
                </div>

                <div className="mt-3 flex flex-col gap-2 overflow-y-auto">
                  {BIKE_CATALOG.map((bike) => {
                    const isFocused = bike.id === focusedBikeSpec.id;
                    const isOwned = ownedBikes.includes(bike.id);
                    const isEquipped = selectedBikeId === bike.id;
                    return (
                      <button
                        key={bike.id}
                        type="button"
                        onClick={() => {
                          engineRef.current?.sound.playClick();
                          setFocusedBikeId(bike.id);
                        }}
                        className={`w-full text-left px-3 py-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 ${
                          isFocused
                            ? 'bg-red-600/20 border-red-500 text-white shadow-md shadow-red-600/15'
                            : 'bg-zinc-900/80 border-white/10 text-zinc-300 hover:border-white/25 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: bike.accentHex }}
                            aria-hidden="true"
                          />
                          <div className="min-w-0">
                            <div className="font-display text-sm font-bold leading-tight truncate">
                              {bike.name}
                            </div>
                            <div className="text-[11px] font-medium text-zinc-400 tabular-nums mt-0.5">
                              {bike.topSpeedKmh} KM/H ·{' '}
                              {bike.price === 0 ? 'STARTER' : `${bike.price.toLocaleString()} coins`}
                            </div>
                          </div>
                        </div>

                        <div className="shrink-0">
                          {isEquipped ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-500/40 text-[10px] font-bold text-emerald-300">
                              <Check className="w-3 h-3" />
                              ACTIVE
                            </span>
                          ) : isOwned ? (
                            <span className="text-[10px] font-bold text-zinc-300 px-1.5">
                              OWNED
                            </span>
                          ) : (
                            <Lock className="w-4 h-4 text-zinc-500" />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Prev / Next Navigation Controls */}
                <div className="mt-4 pt-3 border-t border-white/10 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => stepShowroomBike(-1)}
                    aria-label="Previous motorcycle"
                    className="inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/15 hover:border-red-500/60 text-xs font-display font-bold tracking-wider text-white transition-colors cursor-pointer active:scale-95"
                  >
                    <ChevronLeft className="w-4 h-4 text-red-400" />
                    <span>PREV</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => stepShowroomBike(1)}
                    aria-label="Next motorcycle"
                    className="inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/15 hover:border-red-500/60 text-xs font-display font-bold tracking-wider text-white transition-colors cursor-pointer active:scale-95"
                  >
                    <span>NEXT</span>
                    <ChevronRight className="w-4 h-4 text-red-400" />
                  </button>
                </div>
              </aside>

              {/* CENTER: Open Unobstructed 3D Motorcycle Stage */}
              <div className="flex-1 h-full pointer-events-none flex flex-col items-center justify-end pb-1">
                <div className="px-3.5 py-1.5 rounded-lg bg-zinc-950/80 border border-white/10 text-[11px] font-medium text-zinc-300">
                  Drag to inspect 360° · Scroll to zoom
                </div>
              </div>

              {/* RIGHT PANEL: Specifications, Price, Ownership & Actions */}
              <aside
                key={focusedBikeSpec.id}
                className="pointer-events-auto w-[288px] xl:w-[316px] max-h-full flex flex-col justify-between bg-zinc-950/92 border border-white/15 rounded-2xl p-5 shadow-2xl transition-all duration-200 overflow-y-auto"
              >
                <div>
                  {/* Ownership Status & Price */}
                  <div className="flex items-center justify-between gap-2">
                    {isFocusedSelected ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/15 border border-emerald-500/40 text-[11px] font-bold tracking-wider text-emerald-300">
                        <Check className="w-3.5 h-3.5" />
                        EQUIPPED
                      </span>
                    ) : isFocusedOwned ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-800 border border-white/15 text-[11px] font-bold tracking-wider text-zinc-200">
                        OWNED
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-500/15 border border-amber-500/35 text-[11px] font-bold tracking-wider text-amber-300">
                        <Lock className="w-3.5 h-3.5" />
                        LOCKED
                      </span>
                    )}

                    <div className="inline-flex items-center gap-1.5 font-display text-sm font-bold">
                      {focusedBikeSpec.price === 0 ? (
                        <span className="text-emerald-400 tracking-wide">FREE</span>
                      ) : (
                        <>
                          <Coins className="w-4 h-4 text-amber-400" />
                          <span className="text-amber-300 tabular-nums">
                            {focusedBikeSpec.price.toLocaleString()}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Bike Name & Tagline */}
                  <div className="mt-3 text-[10px] font-bold tracking-widest text-zinc-400">
                    {focusedBikeSpec.category}
                  </div>
                  <h2 className="font-display text-2xl xl:text-3xl font-bold text-white leading-tight mt-0.5">
                    {focusedBikeSpec.name}
                  </h2>
                  <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
                    {focusedBikeSpec.tagline}
                  </p>

                  {focusedBikeSpec.hasNitro && (
                    <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-sky-500/15 border border-sky-400/40 text-[11px] font-bold tracking-wider text-sky-300">
                      <Flame className="w-3.5 h-3.5" />
                      <span>NITRO BOOST EQUIPPED</span>
                    </div>
                  )}

                  {/* Specifications Panel */}
                  <div className="mt-4 pt-4 border-t border-white/10 flex flex-col gap-3.5">
                    <div>
                      <div className="flex justify-between text-xs font-semibold text-zinc-300 mb-1.5">
                        <span>TOP SPEED (STRICT CAP)</span>
                        <span className="font-display text-white tabular-nums">
                          {focusedBikeSpec.topSpeedKmh} KM/H
                        </span>
                      </div>
                      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-red-500 transition-[width] duration-300"
                          style={{
                            width: `${Math.min(100, Math.round((focusedBikeSpec.topSpeedKmh / 300) * 100))}%`,
                          }}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-xs font-semibold text-zinc-300 mb-1.5">
                        <span>ACCELERATION</span>
                        <span className="font-display text-white tabular-nums">
                          {focusedBikeSpec.accelerationStat} / 100
                        </span>
                      </div>
                      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-400 transition-[width] duration-300"
                          style={{ width: `${focusedBikeSpec.accelerationStat}%` }}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-xs font-semibold text-zinc-300 mb-1.5">
                        <span>HANDLING</span>
                        <span className="font-display text-white tabular-nums">
                          {focusedBikeSpec.handlingStat} / 100
                        </span>
                      </div>
                      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-sky-400 transition-[width] duration-300"
                          style={{ width: `${focusedBikeSpec.handlingStat}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="mt-5 pt-4 border-t border-white/10 flex flex-col gap-2.5">
                  {!isFocusedOwned && (
                    <button
                      type="button"
                      onClick={() => handleBuyBike(focusedBikeSpec)}
                      disabled={!canAffordFocused}
                      className={`w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-display text-sm font-bold tracking-wider transition-all whitespace-nowrap ${
                        canAffordFocused
                          ? 'bg-amber-500 hover:bg-amber-400 text-zinc-950 shadow-lg shadow-amber-500/25 cursor-pointer active:scale-[0.98]'
                          : 'bg-zinc-900 border border-white/10 text-zinc-500 cursor-not-allowed'
                      }`}
                    >
                      <ShoppingBag className="w-4 h-4 shrink-0" />
                      <span>BUY · {focusedBikeSpec.price.toLocaleString()} COINS</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleSelectBike(focusedBikeSpec.id)}
                    disabled={!isFocusedOwned || isFocusedSelected}
                    className={`w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-display text-sm font-bold tracking-wider border transition-all whitespace-nowrap ${
                      !isFocusedOwned
                        ? 'bg-zinc-900/80 border-white/10 text-zinc-500 cursor-not-allowed'
                        : isFocusedSelected
                          ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-300 cursor-default'
                          : 'bg-zinc-900 hover:bg-zinc-800 border-white/20 text-white cursor-pointer active:scale-[0.98]'
                    }`}
                  >
                    {isFocusedSelected ? (
                      <>
                        <Check className="w-4 h-4 shrink-0" />
                        <span>SELECTED</span>
                      </>
                    ) : !isFocusedOwned ? (
                      <>
                        <Lock className="w-4 h-4 shrink-0" />
                        <span>SELECT</span>
                      </>
                    ) : (
                      <span>SELECT</span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleRideNow}
                    className="w-full inline-flex items-center justify-center gap-2 py-3.5 px-5 rounded-xl bg-red-600 hover:bg-red-500 active:scale-[0.98] text-white font-display text-base font-bold tracking-wider shadow-lg shadow-red-600/35 transition-all cursor-pointer whitespace-nowrap focus-visible:outline-2 focus-visible:outline-white"
                  >
                    <Play className="w-4 h-4 fill-current shrink-0" />
                    <span>RIDE NOW</span>
                  </button>
                </div>
              </aside>
            </div>

            {/* MOBILE BOTTOM DETAILS & SELECTION SHEET (< lg) */}
            <div className="lg:hidden relative z-20 shrink-0 bg-zinc-950 border-t border-white/15 px-3.5 pt-2.5 pb-3.5 flex flex-col gap-2.5">
              {/* Compact Horizontal Bike Selector Strip */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                {BIKE_CATALOG.map((bike, idx) => {
                  const isFocused = bike.id === focusedBikeSpec.id;
                  const isOwned = ownedBikes.includes(bike.id);
                  const isSelected = selectedBikeId === bike.id;
                  return (
                    <button
                      key={bike.id}
                      type="button"
                      onClick={() => {
                        engineRef.current?.sound.playClick();
                        setFocusedBikeId(bike.id);
                      }}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                        isFocused
                          ? 'bg-red-600 border-red-400 text-white'
                          : 'bg-zinc-900 border-white/10 text-zinc-300'
                      }`}
                    >
                      {isSelected ? (
                        <Check className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
                      ) : !isOwned ? (
                        <Lock className="w-3 h-3 text-zinc-400 shrink-0" />
                      ) : null}
                      <span>{idx + 1}. {bike.name}</span>
                    </button>
                  );
                })}
              </div>

              {/* Bike Name, Ownership, Price */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="font-display text-xl font-bold text-white leading-tight truncate">
                      {focusedBikeSpec.name}
                    </h2>
                    {isFocusedSelected ? (
                      <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-[10px] font-bold text-emerald-300 shrink-0">
                        EQUIPPED
                      </span>
                    ) : isFocusedOwned ? (
                      <span className="px-2 py-0.5 rounded bg-zinc-800 text-[10px] font-bold text-zinc-300 shrink-0">
                        OWNED
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded bg-amber-500/20 text-[10px] font-bold text-amber-300 shrink-0">
                        LOCKED
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                    {focusedBikeSpec.tagline}
                  </p>
                </div>

                <div className="shrink-0 font-display text-sm font-bold pt-0.5">
                  {focusedBikeSpec.price === 0 ? (
                    <span className="text-emerald-400">FREE</span>
                  ) : (
                    <span className="text-amber-300 tabular-nums">
                      {focusedBikeSpec.price.toLocaleString()} COINS
                    </span>
                  )}
                </div>
              </div>

              {/* 3-Column Specs */}
              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <div className="flex justify-between text-[10px] font-semibold text-zinc-300 mb-1">
                    <span>SPEED</span>
                    <span className="font-display text-white tabular-nums">
                      {focusedBikeSpec.topSpeedKmh}
                    </span>
                  </div>
                  <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-red-500"
                      style={{
                        width: `${Math.min(100, Math.round((focusedBikeSpec.topSpeedKmh / 300) * 100))}%`,
                      }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-[10px] font-semibold text-zinc-300 mb-1">
                    <span>ACCEL</span>
                    <span className="font-display text-white tabular-nums">
                      {focusedBikeSpec.accelerationStat}
                    </span>
                  </div>
                  <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-400"
                      style={{ width: `${focusedBikeSpec.accelerationStat}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-[10px] font-semibold text-zinc-300 mb-1">
                    <span>HANDLING</span>
                    <span className="font-display text-white tabular-nums">
                      {focusedBikeSpec.handlingStat}
                    </span>
                  </div>
                  <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-sky-400"
                      style={{ width: `${focusedBikeSpec.handlingStat}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Mobile Action Buttons */}
              <div className="flex flex-col gap-2">
                {!isFocusedOwned ? (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => handleBuyBike(focusedBikeSpec)}
                        disabled={!canAffordFocused}
                        className={`inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl font-display text-xs font-bold tracking-wider whitespace-nowrap ${
                          canAffordFocused
                            ? 'bg-amber-500 text-zinc-950 cursor-pointer'
                            : 'bg-zinc-900 border border-white/10 text-zinc-500 cursor-not-allowed'
                        }`}
                      >
                        <ShoppingBag className="w-3.5 h-3.5 shrink-0" />
                        <span>BUY · {focusedBikeSpec.price.toLocaleString()}</span>
                      </button>
                      <button
                        type="button"
                        disabled
                        className="inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl font-display text-xs font-bold tracking-wider border bg-zinc-900/80 border-white/10 text-zinc-500 cursor-not-allowed whitespace-nowrap"
                      >
                        <Lock className="w-3.5 h-3.5 shrink-0" />
                        <span>SELECT</span>
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={handleRideNow}
                      className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-display text-sm font-bold tracking-wider cursor-pointer whitespace-nowrap"
                    >
                      <Play className="w-4 h-4 fill-current shrink-0" />
                      <span>RIDE NOW</span>
                    </button>
                  </>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleSelectBike(focusedBikeSpec.id)}
                      disabled={isFocusedSelected}
                      className={`inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl font-display text-xs font-bold tracking-wider border whitespace-nowrap ${
                        isFocusedSelected
                          ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-300'
                          : 'bg-zinc-900 border-white/20 text-white cursor-pointer'
                      }`}
                    >
                      <Check className="w-3.5 h-3.5 shrink-0" />
                      <span>{isFocusedSelected ? 'SELECTED' : 'SELECT'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleRideNow}
                      className="inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-display text-sm font-bold tracking-wider cursor-pointer whitespace-nowrap"
                    >
                      <Play className="w-4 h-4 fill-current shrink-0" />
                      <span>RIDE NOW</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MAIN MENU OVERLAY */}
      {gameState === 'menu' && (
        <div
          className={`absolute inset-0 z-30 flex flex-col justify-between p-4 sm:p-8 ${
            showSettingsModal
              ? 'bg-zinc-950/15'
              : 'bg-gradient-to-t from-zinc-950/90 via-zinc-950/45 to-zinc-950/60'
          }`}
        >
          {/* Top Stats & Audio Row */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-zinc-200 bg-zinc-950/88 border border-white/10 rounded-xl px-3.5 py-2">
                <Trophy className="w-4 h-4 text-red-500" />
                <span>Best:</span>
                <span className="font-display font-bold text-white tabular-nums">
                  {telemetry.bestScore.toLocaleString()}
                </span>
              </div>

              <div
                data-testid="menu-coins"
                className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-zinc-200 bg-zinc-950/88 border border-amber-500/30 rounded-xl px-3.5 py-2"
              >
                <Coins className="w-4 h-4 text-amber-400" />
                <span className="font-display font-bold text-amber-300 tabular-nums">
                  {coins.toLocaleString()}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="menu-settings-btn"
                onClick={handleOpenSettings}
                aria-label="Open settings"
                className="inline-flex items-center gap-2 h-11 px-4 rounded-xl bg-zinc-950/88 border border-white/10 text-sm font-medium text-zinc-200 hover:text-white hover:border-red-500/60 transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-red-500"
              >
                <Settings className="w-4 h-4 text-red-400" />
                <span>Settings</span>
              </button>

              <button
                type="button"
                onClick={handleToggleMute}
                aria-label={muted ? 'Unmute audio' : 'Mute audio'}
                className="inline-flex items-center gap-2 h-11 px-4 rounded-xl bg-zinc-950/88 border border-white/10 text-sm font-medium text-zinc-200 hover:text-white hover:border-white/25 transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-red-500"
              >
                {muted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
                <span className="hidden sm:inline">{muted ? 'Muted' : 'Sound On'}</span>
              </button>
            </div>
          </div>

          {/* Center Title, Play & Showroom CTA */}
          {!showSettingsModal && !showMissionsModal ? (
            <div className="w-full max-w-lg mx-auto bg-zinc-950/92 border border-white/10 rounded-2xl p-6 sm:p-8 shadow-2xl text-center">
            <div className="text-xs font-semibold tracking-widest text-red-500 mb-2">
              HIGHWAY RACING SIMULATOR
            </div>
            <h1 className="font-display text-3xl sm:text-5xl font-bold tracking-tight text-white leading-none text-balance">
              INDIAN BIKE RIDER 3D
            </h1>
            <p className="text-sm text-zinc-300 mt-3 max-w-md mx-auto leading-relaxed">
              Dodge oncoming cars, trucks & auto-rickshaws, hit stunt ramps for air-flips, pop wheelies, and collect golden coins to unlock superbikes.
            </p>

            <div className="mt-3 text-xs font-semibold text-zinc-300">
              Active Bike:{' '}
              <span className="text-white font-display tracking-wide">
                {equippedBikeSpec.name}
              </span>{' '}
              <span className="text-zinc-500">·</span>{' '}
              <span className="text-red-400 font-display tabular-nums">
                {equippedBikeSpec.topSpeedKmh} KM/H CAP
              </span>
              {equippedBikeSpec.hasNitro && (
                <>
                  {' '}
                  <span className="text-zinc-500">·</span>{' '}
                  <span className="text-sky-400 font-display">NITRO</span>
                </>
              )}
            </div>

            {/* Dynamic Weather Selector */}
            <div className="mt-4 flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-zinc-900/85 border border-white/10">
              <span className="text-[11px] font-semibold tracking-wider text-zinc-400 shrink-0">
                WEATHER
              </span>
              <div
                className="grid grid-cols-3 gap-1.5 flex-1 max-w-[260px]"
                role="radiogroup"
                aria-label="Highway weather"
              >
                {WEATHER_OPTIONS.map((opt) => {
                  const active = weather === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      data-testid={`menu-weather-${opt.id}`}
                      onClick={() => handleSelectWeather(opt.id)}
                      className={`inline-flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
                        active
                          ? opt.id === 'rain'
                            ? 'bg-sky-500/20 border-sky-400 text-sky-200'
                            : opt.id === 'fog'
                              ? 'bg-slate-400/20 border-slate-300 text-white'
                              : 'bg-amber-500/20 border-amber-400 text-amber-200'
                          : 'bg-zinc-950/70 border-white/10 text-zinc-400 hover:text-white hover:border-white/25'
                      }`}
                    >
                      {opt.id === 'sunny' && <Sun className="w-3.5 h-3.5 shrink-0" />}
                      {opt.id === 'rain' && <CloudRain className="w-3.5 h-3.5 shrink-0" />}
                      {opt.id === 'fog' && <CloudFog className="w-3.5 h-3.5 shrink-0" />}
                      <span>{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-3">
              <button
                type="button"
                onClick={handlePlay}
                className="w-full inline-flex items-center justify-center gap-3 px-7 py-4 rounded-xl bg-red-600 hover:bg-red-500 active:scale-[0.98] text-white font-display text-xl font-bold tracking-wider shadow-lg shadow-red-600/30 transition-all cursor-pointer whitespace-nowrap focus-visible:outline-2 focus-visible:outline-white"
              >
                <Play className="w-6 h-6 fill-current" />
                <span>PLAY</span>
              </button>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleOpenShowroom('menu')}
                  className="inline-flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 active:scale-[0.98] border border-red-500/40 hover:border-red-500 text-white font-display text-sm sm:text-base font-bold tracking-wider transition-all cursor-pointer whitespace-nowrap focus-visible:outline-2 focus-visible:outline-red-500"
                >
                  <Sparkles className="w-4 h-4 text-red-400 shrink-0" />
                  <span>GARAGE</span>
                </button>

                <button
                  type="button"
                  data-testid="menu-missions-btn"
                  onClick={handleOpenMissions}
                  className={`inline-flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl active:scale-[0.98] border font-display text-sm sm:text-base font-bold tracking-wider transition-all cursor-pointer whitespace-nowrap focus-visible:outline-2 focus-visible:outline-amber-400 ${
                    claimableMissions.length > 0
                      ? 'bg-amber-500/15 hover:bg-amber-500/25 border-amber-400 text-amber-200'
                      : 'bg-zinc-900 hover:bg-zinc-800 border-white/15 hover:border-amber-400/60 text-white'
                  }`}
                >
                  <Target className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>MISSIONS</span>
                  <span className="text-xs text-amber-300 tabular-nums">
                    {claimableMissions.length > 0
                      ? `(${claimableMissions.length})`
                      : `${completedMissionCount}/3`}
                  </span>
                </button>
              </div>
            </div>

            {/* Controls Summary */}
            <div className="mt-6 pt-5 border-t border-white/10 grid grid-cols-2 gap-3 text-left text-xs text-zinc-300">
              <div>
                <div className="font-semibold text-white mb-1">PC Keyboard</div>
                <div>W / ↑ : Accelerate</div>
                <div>S / ↓ / Space : Brake</div>
                <div>A / D or ← / → : Steer</div>
                <div>Shift / E : Wheelie & Air-Flip</div>
                <div>N / F : Nitro (Ducati V4)</div>
              </div>
              <div>
                <div className="font-semibold text-white mb-1">Mobile Touch</div>
                <div>Hold Left / Right to steer</div>
                <div>Hold GAS / BRAKE pedals</div>
                <div>WHEELIE / AIR FLIP pad</div>
                <div>NITRO button (Ducati V4)</div>
              </div>
            </div>
            </div>
          ) : (
            <div aria-hidden="true" />
          )}

          <div className="h-2" aria-hidden="true" />
        </div>
      )}

      {/* PAUSE OVERLAY */}
      {gameState === 'paused' && (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-4 bg-zinc-950/75">
          <div className="w-full max-w-sm bg-zinc-950 border border-white/10 rounded-2xl p-6 sm:p-7 shadow-2xl text-center">
            <div className="text-xs font-semibold tracking-widest text-red-500 mb-1">
              RIDE PAUSED
            </div>
            <h2 className="font-display text-3xl font-bold text-white">PAUSED</h2>

            <div className="mt-5 grid grid-cols-2 gap-3 bg-zinc-900/90 border border-white/5 rounded-xl p-3 text-left">
              <div>
                <div className="text-[11px] text-zinc-400">Current Score</div>
                <div className="font-display text-lg font-bold text-white tabular-nums">
                  {telemetry.score.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-zinc-400">Distance</div>
                <div className="font-display text-lg font-bold text-red-400 tabular-nums">
                  {formatDistance(telemetry.distanceM)}
                </div>
              </div>
            </div>

            {/* In-Ride Weather Settings Toggle */}
            <div className="mt-3 flex items-center justify-between gap-2 bg-zinc-900/90 border border-white/5 rounded-xl px-3 py-2">
              <span className="text-[11px] font-semibold tracking-wider text-zinc-400">
                WEATHER
              </span>
              <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Weather settings">
                {WEATHER_OPTIONS.map((opt) => {
                  const active = weather === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      data-testid={`pause-weather-${opt.id}`}
                      onClick={() => handleSelectWeather(opt.id)}
                      className={`inline-flex items-center justify-center gap-1 py-1 px-2 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                        active
                          ? opt.id === 'rain'
                            ? 'bg-sky-500/20 border-sky-400 text-sky-200'
                            : opt.id === 'fog'
                              ? 'bg-slate-400/20 border-slate-300 text-white'
                              : 'bg-amber-500/20 border-amber-400 text-amber-200'
                          : 'bg-zinc-950/70 border-white/10 text-zinc-400 hover:text-white'
                      }`}
                    >
                      {opt.id === 'sunny' && <Sun className="w-3 h-3 shrink-0" />}
                      {opt.id === 'rain' && <CloudRain className="w-3 h-3 shrink-0" />}
                      {opt.id === 'fog' && <CloudFog className="w-3 h-3 shrink-0" />}
                      <span>{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* In-Ride Ambient Light Intensity Slider */}
            <div className="mt-3 bg-zinc-900/90 border border-white/5 rounded-xl px-3 py-2.5 text-left">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <label
                  htmlFor="pause-ambient-slider"
                  className="text-[11px] font-semibold tracking-wider text-zinc-400"
                >
                  AMBIENT LIGHT
                </label>
                <div className="flex items-center gap-2">
                  <span className="font-display text-xs font-bold text-amber-300 tabular-nums">
                    {Math.round(ambientIntensity * 100)}%
                  </span>
                  {ambientIntensity !== DEFAULT_AMBIENT_INTENSITY && (
                    <button
                      type="button"
                      onClick={() => handleChangeAmbientIntensity(DEFAULT_AMBIENT_INTENSITY)}
                      className="text-[10px] font-semibold text-zinc-400 hover:text-white underline cursor-pointer"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>
              <input
                id="pause-ambient-slider"
                data-testid="pause-ambient-slider"
                type="range"
                min={MIN_AMBIENT_INTENSITY}
                max={MAX_AMBIENT_INTENSITY}
                step={0.05}
                value={ambientIntensity}
                onChange={(e) => handleChangeAmbientIntensity(parseFloat(e.target.value))}
                aria-label="Ambient light intensity"
                className="w-full h-2 accent-red-500 bg-zinc-800 rounded-lg cursor-pointer touch-auto"
              />
            </div>

            <div className="mt-5 flex flex-col gap-3">
              <button
                type="button"
                onClick={handleResume}
                className="w-full inline-flex items-center justify-center gap-2 py-3.5 px-5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-display text-lg font-bold tracking-wide transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-white"
              >
                <Play className="w-5 h-5 fill-current" />
                <span>RESUME</span>
              </button>

              <button
                type="button"
                onClick={handleRestart}
                className="w-full inline-flex items-center justify-center gap-2 py-3 px-5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-white font-semibold text-sm transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-red-500"
              >
                <RotateCcw className="w-4 h-4" />
                <span>RESTART</span>
              </button>

              <button
                type="button"
                data-testid="pause-missions-btn"
                onClick={handleOpenMissions}
                className="w-full inline-flex items-center justify-between py-3 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 hover:border-amber-400/50 text-white font-semibold text-sm transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-amber-400"
              >
                <span className="inline-flex items-center gap-2">
                  <Target className="w-4 h-4 text-amber-400" />
                  <span>Daily Missions</span>
                </span>
                <span className="font-display text-xs text-amber-300 tabular-nums">
                  {claimableMissions.length > 0
                    ? `${claimableMissions.length} READY`
                    : `${completedMissionCount}/3`}
                </span>
              </button>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={handleToggleMute}
                  className="inline-flex items-center justify-center gap-2 py-3 px-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-200 font-medium text-xs transition-colors cursor-pointer"
                >
                  {muted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
                  <span>{muted ? 'Unmute' : 'Mute'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleMainMenu}
                  className="inline-flex items-center justify-center py-3 px-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-200 font-medium text-xs transition-colors cursor-pointer"
                >
                  Main Menu
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* GAME OVER OVERLAY */}
      {gameState === 'gameover' && (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-4 bg-zinc-950/80">
          <div className="w-full max-w-md max-h-[92vh] overflow-y-auto bg-zinc-950 border border-red-500/25 rounded-2xl p-5 sm:p-7 shadow-2xl text-center">
            <div className="text-xs font-semibold tracking-widest text-red-500 mb-1">
              {telemetry.isNewBest ? 'NEW HIGH SCORE' : 'COLLISION DETECTED'}
            </div>
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-white">
              GAME OVER
            </h2>

            <div className="mt-4 grid grid-cols-2 gap-2.5 text-left">
              <div className="bg-zinc-900 border border-white/5 rounded-xl p-3">
                <div className="text-[11px] font-medium text-zinc-400">FINAL SCORE</div>
                <div className="font-display text-2xl font-bold text-white tabular-nums mt-0.5">
                  {telemetry.score.toLocaleString()}
                </div>
              </div>
              <div className="bg-zinc-900 border border-white/5 rounded-xl p-3">
                <div className="text-[11px] font-medium text-zinc-400">BEST SCORE</div>
                <div className="font-display text-2xl font-bold text-red-400 tabular-nums mt-0.5">
                  {telemetry.bestScore.toLocaleString()}
                </div>
              </div>
              <div className="bg-zinc-900 border border-white/5 rounded-xl p-3">
                <div className="text-[11px] font-medium text-zinc-400">DISTANCE · TOP SPD</div>
                <div className="font-display text-lg font-bold text-zinc-100 tabular-nums mt-0.5">
                  {formatDistance(telemetry.distanceM)} · {telemetry.peakSpeedKmh} km/h
                </div>
              </div>
              <div className="bg-zinc-900 border border-amber-500/20 rounded-xl p-3">
                <div className="text-[11px] font-medium text-zinc-400">
                  COINS ({telemetry.flipsInRun} FLIPS)
                </div>
                <div className="font-display text-lg font-bold text-amber-300 tabular-nums mt-0.5 flex items-center gap-1.5">
                  <span>+{telemetry.runCoinsEarned.toLocaleString()}</span>
                  <span className="text-[11px] font-normal text-zinc-400">
                    ({coins.toLocaleString()})
                  </span>
                </div>
              </div>
            </div>

            {/* Daily Missions Summary / Quick Claim inside Game Over */}
            <div className="mt-4 pt-3.5 border-t border-white/10 text-left">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-200">
                  <Target className="w-3.5 h-3.5 text-amber-400" />
                  <span>Daily Missions</span>
                  <span className="text-zinc-500">·</span>
                  <span className="text-zinc-400 tabular-nums">{completedMissionCount}/3</span>
                </div>
                <button
                  type="button"
                  data-testid="gameover-missions-btn"
                  onClick={handleOpenMissions}
                  className="text-xs font-semibold text-red-400 hover:text-red-300 cursor-pointer whitespace-nowrap"
                >
                  View all
                </button>
              </div>

              {claimableMissions.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {claimableMissions.map((m) => (
                    <div
                      key={m.definition.id}
                      className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-400/35"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-white truncate">
                          {m.definition.title}
                        </div>
                        <div className="text-[11px] text-zinc-300 truncate">
                          {m.definition.description}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleClaimMission(m.definition.id)}
                        className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 font-display text-xs font-bold tracking-wider cursor-pointer whitespace-nowrap"
                      >
                        CLAIM +{m.definition.rewardCoins}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-zinc-400">
                  {completedMissionCount === dailyMissions.missions.length
                    ? 'All daily mission rewards collected for today.'
                    : 'Track today’s single-ride objectives in Daily Missions for bonus coins.'}
                </div>
              )}
            </div>

            <div className="mt-5 flex flex-col gap-2.5">
              <div className="flex flex-col sm:flex-row gap-2.5">
                <button
                  type="button"
                  onClick={handleRestart}
                  className="flex-1 inline-flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl bg-red-600 hover:bg-red-500 text-white font-display text-lg font-bold tracking-wide transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-2 focus-visible:outline-white"
                >
                  <RotateCcw className="w-5 h-5" />
                  <span>RESTART</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenShowroom('gameover')}
                  className="flex-1 inline-flex items-center justify-center gap-2 py-3.5 px-5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-red-500/40 text-white font-display text-base font-bold tracking-wide transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-2 focus-visible:outline-red-500"
                >
                  <Sparkles className="w-4 h-4 text-red-400" />
                  <span>SHOWROOM</span>
                </button>
              </div>

              <button
                type="button"
                onClick={handleMainMenu}
                className="w-full inline-flex items-center justify-center py-3 px-5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-300 font-semibold text-sm transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-2 focus-visible:outline-red-500"
              >
                Main Menu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DAILY MISSIONS MODAL */}
      {showMissionsModal && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/85"
          role="dialog"
          aria-modal="true"
          aria-labelledby="daily-missions-title"
        >
          <div className="w-full max-w-lg max-h-[90vh] flex flex-col bg-zinc-950 border border-white/15 rounded-2xl shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-4 px-5 py-4 sm:px-6 sm:py-5 border-b border-white/10">
              <div>
                <h2
                  id="daily-missions-title"
                  className="font-display text-xl sm:text-2xl font-bold text-white leading-tight"
                >
                  Daily Missions
                </h2>
                <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400 mt-1 tabular-nums">
                  <span>{completedMissionCount} / 3 completed</span>
                  <span aria-hidden="true">·</span>
                  <span>Resets in {dailyResetLabel}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <div
                  data-testid="missions-modal-coins"
                  className="inline-flex items-center gap-1.5 h-10 px-3 rounded-xl bg-zinc-900 border border-amber-500/30 text-xs font-display font-bold text-amber-300 tabular-nums"
                >
                  <Coins className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>{coins.toLocaleString()}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    engineRef.current?.sound.playClick();
                    setShowMissionsModal(false);
                  }}
                  aria-label="Close daily missions"
                  className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/15 text-zinc-300 hover:text-white transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-red-500"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Mission Rows */}
            <div className="flex-1 overflow-y-auto divide-y divide-white/10 px-5 sm:px-6">
              {dailyMissions.missions.map((mission) => {
                const isActiveRun = gameState === 'playing' || gameState === 'paused';
                const currentRunMetric = isActiveRun
                  ? Math.min(
                      mission.definition.target,
                      Math.floor(
                        getTelemetryMetricForMission(mission.definition.kind, telemetry)
                      )
                    )
                  : mission.bestProgress;
                const displayProgress = mission.completed
                  ? mission.definition.target
                  : isActiveRun
                    ? currentRunMetric
                    : mission.bestProgress;
                const progressPct = Math.min(
                  100,
                  Math.round((displayProgress / mission.definition.target) * 100)
                );

                return (
                  <div key={mission.definition.id} className="py-4 flex flex-col gap-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-display text-base font-bold text-white leading-snug">
                          {mission.definition.title}
                        </div>
                        <div className="text-xs sm:text-sm text-zinc-300 mt-0.5">
                          {mission.definition.description}
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        <div className="inline-flex items-center gap-1 font-display text-sm font-bold text-amber-300 tabular-nums">
                          <Coins className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span>+{mission.definition.rewardCoins.toLocaleString()}</span>
                        </div>
                        <div className="text-[11px] font-medium text-zinc-400 mt-0.5">
                          {mission.claimed
                            ? 'Collected'
                            : mission.completed
                              ? 'Ready to claim'
                              : isActiveRun
                                ? 'This ride'
                                : 'Best today'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-[width] duration-200 ${
                              mission.completed ? 'bg-emerald-500' : 'bg-red-500'
                            }`}
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-[11px] text-zinc-400 tabular-nums mt-1">
                          <span>
                            {displayProgress.toLocaleString()} /{' '}
                            {mission.definition.target.toLocaleString()}{' '}
                            {mission.definition.unit}
                          </span>
                          <span>{progressPct}%</span>
                        </div>
                      </div>

                      {mission.completed && !mission.claimed ? (
                        <button
                          type="button"
                          onClick={() => handleClaimMission(mission.definition.id)}
                          className="shrink-0 min-h-[40px] px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-[0.98] text-zinc-950 font-display text-xs font-bold tracking-wider transition-all cursor-pointer whitespace-nowrap"
                        >
                          CLAIM +{mission.definition.rewardCoins}
                        </button>
                      ) : mission.claimed ? (
                        <span className="shrink-0 inline-flex items-center gap-1.5 min-h-[40px] px-3 py-2 text-xs font-bold text-emerald-400 whitespace-nowrap">
                          <Check className="w-4 h-4 shrink-0" />
                          <span>CLAIMED</span>
                        </span>
                      ) : (
                        <span className="shrink-0 min-h-[40px] inline-flex items-center px-2 text-xs font-medium text-zinc-500 whitespace-nowrap">
                          In progress
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-4 sm:px-6 border-t border-white/10 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 bg-zinc-950">
              {claimableCoinsTotal > 0 ? (
                <button
                  type="button"
                  onClick={handleClaimAllMissions}
                  className="w-full sm:flex-1 inline-flex items-center justify-center gap-2 py-3 px-5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-display text-sm font-bold tracking-wider transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Coins className="w-4 h-4 shrink-0" />
                  <span>CLAIM ALL (+{claimableCoinsTotal.toLocaleString()} COINS)</span>
                </button>
              ) : gameState === 'menu' || gameState === 'gameover' ? (
                <button
                  type="button"
                  onClick={handlePlay}
                  className="w-full sm:flex-1 inline-flex items-center justify-center gap-2 py-3 px-5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-display text-sm font-bold tracking-wider transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Play className="w-4 h-4 fill-current shrink-0" />
                  <span>START RIDE</span>
                </button>
              ) : null}

              <button
                type="button"
                onClick={() => {
                  engineRef.current?.sound.playClick();
                  setShowMissionsModal(false);
                }}
                className="w-full sm:w-auto inline-flex items-center justify-center py-3 px-5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/15 text-zinc-200 font-semibold text-sm transition-colors cursor-pointer whitespace-nowrap"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SETTINGS MODAL */}
      {showSettingsModal && (
        <div
          data-testid="settings-modal"
          className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/20"
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-modal-title"
        >
          <div className="w-full max-w-md max-h-[90vh] flex flex-col bg-zinc-950 border border-white/15 rounded-2xl shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between gap-4 px-5 py-4 sm:px-6 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <Settings className="w-5 h-5 text-red-500 shrink-0" />
                <h2
                  id="settings-modal-title"
                  className="font-display text-xl sm:text-2xl font-bold text-white leading-tight"
                >
                  Settings
                </h2>
              </div>

              <button
                type="button"
                onClick={() => {
                  engineRef.current?.sound.playClick();
                  setShowSettingsModal(false);
                }}
                aria-label="Close settings"
                className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/15 text-zinc-300 hover:text-white transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-red-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Settings Content */}
            <div className="flex-1 overflow-y-auto p-5 sm:p-6 flex flex-col gap-5">
              {/* Ambient Light Intensity Slider */}
              <div className="bg-zinc-900/90 border border-white/10 rounded-xl p-4">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <label
                    htmlFor="settings-ambient-slider"
                    className="text-xs font-bold tracking-wider text-zinc-200"
                  >
                    AMBIENT LIGHT INTENSITY
                  </label>
                  <div className="flex items-center gap-2.5">
                    <span
                      data-testid="settings-ambient-value"
                      className="font-display text-sm font-bold text-amber-300 tabular-nums"
                    >
                      {Math.round(ambientIntensity * 100)}%
                    </span>
                    <button
                      type="button"
                      data-testid="settings-ambient-reset"
                      onClick={() => handleChangeAmbientIntensity(DEFAULT_AMBIENT_INTENSITY)}
                      disabled={ambientIntensity === DEFAULT_AMBIENT_INTENSITY}
                      className={`text-xs font-semibold px-2 py-0.5 rounded border transition-colors ${
                        ambientIntensity === DEFAULT_AMBIENT_INTENSITY
                          ? 'border-white/5 text-zinc-600 cursor-default'
                          : 'border-white/15 text-zinc-300 hover:text-white hover:border-white/30 cursor-pointer'
                      }`}
                    >
                      Reset
                    </button>
                  </div>
                </div>
                <p className="text-xs text-zinc-400 mb-3">
                  Adjust the 3D scene ambient brightness in real time.
                </p>
                <input
                  id="settings-ambient-slider"
                  data-testid="settings-ambient-slider"
                  type="range"
                  min={MIN_AMBIENT_INTENSITY}
                  max={MAX_AMBIENT_INTENSITY}
                  step={0.05}
                  value={ambientIntensity}
                  onChange={(e) => handleChangeAmbientIntensity(parseFloat(e.target.value))}
                  aria-label="Ambient light intensity"
                  className="w-full h-2.5 accent-red-500 bg-zinc-800 rounded-lg cursor-pointer touch-auto"
                />
                <div className="flex justify-between text-[11px] font-medium text-zinc-500 tabular-nums mt-1.5">
                  <span>Dim (25%)</span>
                  <span>Default (100%)</span>
                  <span>Bright (200%)</span>
                </div>
              </div>

              {/* Weather Toggle */}
              <div className="bg-zinc-900/90 border border-white/10 rounded-xl p-4">
                <div className="text-xs font-bold tracking-wider text-zinc-200 mb-2.5">
                  HIGHWAY WEATHER
                </div>
                <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Highway weather settings">
                  {WEATHER_OPTIONS.map((opt) => {
                    const active = weather === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        data-testid={`settings-weather-${opt.id}`}
                        onClick={() => handleSelectWeather(opt.id)}
                        className={`inline-flex items-center justify-center gap-1.5 py-2.5 px-2.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                          active
                            ? opt.id === 'rain'
                              ? 'bg-sky-500/20 border-sky-400 text-sky-200'
                              : opt.id === 'fog'
                                ? 'bg-slate-400/20 border-slate-300 text-white'
                                : 'bg-amber-500/20 border-amber-400 text-amber-200'
                            : 'bg-zinc-950/70 border-white/10 text-zinc-400 hover:text-white hover:border-white/25'
                        }`}
                      >
                        {opt.id === 'sunny' && <Sun className="w-3.5 h-3.5 shrink-0" />}
                        {opt.id === 'rain' && <CloudRain className="w-3.5 h-3.5 shrink-0" />}
                        {opt.id === 'fog' && <CloudFog className="w-3.5 h-3.5 shrink-0" />}
                        <span>{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Audio & Touch Controls */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={handleToggleMute}
                  className="inline-flex items-center justify-center gap-2 py-3 px-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-sm font-semibold text-zinc-200 transition-colors cursor-pointer"
                >
                  {muted ? (
                    <VolumeX className="w-4 h-4 text-red-400 shrink-0" />
                  ) : (
                    <Volume2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  )}
                  <span>{muted ? 'Muted' : 'Sound On'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    engineRef.current?.sound.playClick();
                    setShowTouchControls((v) => !v);
                  }}
                  className={`inline-flex items-center justify-center gap-2 py-3 px-3 rounded-xl border text-sm font-semibold transition-colors cursor-pointer ${
                    showTouchControls
                      ? 'bg-red-600/20 border-red-500/60 text-white'
                      : 'bg-zinc-900 hover:bg-zinc-800 border-white/10 text-zinc-300'
                  }`}
                >
                  <Gamepad2 className="w-4 h-4 shrink-0" />
                  <span>{showTouchControls ? 'Touch: On' : 'Touch: Auto'}</span>
                </button>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-4 sm:px-6 border-t border-white/10 flex justify-end bg-zinc-950">
              <button
                type="button"
                data-testid="settings-done-btn"
                onClick={() => {
                  engineRef.current?.sound.playClick();
                  setShowSettingsModal(false);
                }}
                className="w-full sm:w-auto inline-flex items-center justify-center py-2.5 px-6 rounded-xl bg-red-600 hover:bg-red-500 text-white font-display text-sm font-bold tracking-wider transition-colors cursor-pointer whitespace-nowrap"
              >
                DONE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
