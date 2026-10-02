import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Player,
  Bullet,
  Obstacle,
  Enemy,
  Particle,
  FloatingText,
  PowerUp,
  Star,
  GameStats,
  Difficulty,
} from '../types/game';
import { soundManager } from '../utils/sound';
import {
  Volume2,
  VolumeX,
  RotateCcw,
  Play,
  Pause,
  Shield,
  Zap,
  Crosshair,
  Award,
  ChevronLeft,
  ChevronRight,
  Flame,
  Bomb,
  Info,
  Sparkles,
  Gauge,
  Swords
} from 'lucide-react';

interface ShootingGameProps {
  onBackToMenu?: () => void;
}

// Canvas helper to draw a 5-pointed star
function drawStarPath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  spikes: number,
  outerRadius: number,
  innerRadius: number
) {
  let rot = (Math.PI / 2) * 3;
  let x = cx;
  let y = cy;
  const step = Math.PI / spikes;

  ctx.beginPath();
  ctx.moveTo(cx, cy - outerRadius);
  for (let i = 0; i < spikes; i++) {
    x = cx + Math.cos(rot) * outerRadius;
    y = cy + Math.sin(rot) * outerRadius;
    ctx.lineTo(x, y);
    rot += step;

    x = cx + Math.cos(rot) * innerRadius;
    y = cy + Math.sin(rot) * innerRadius;
    ctx.lineTo(x, y);
    rot += step;
  }
  ctx.lineTo(cx, cy - outerRadius);
  ctx.closePath();
}

export const ShootingGame: React.FC<ShootingGameProps> = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Difficulty setting (saved in localStorage)
  const [difficulty, setDifficulty] = useState<Difficulty>(() => {
    const saved = localStorage.getItem('cosmic_striker_diff');
    return saved === 'easy' || saved === 'normal' || saved === 'hard' ? saved : 'normal';
  });

  // Game UI state
  const [gameState, setGameState] = useState<'start' | 'playing' | 'paused' | 'gameover'>('start');
  const [score, setScore] = useState<number>(0);
  const [highScore, setHighScore] = useState<number>(() => {
    return parseInt(localStorage.getItem('cosmic_striker_highscore') || '0', 10);
  });
  const [health, setHealth] = useState<number>(3);
  const [maxHealth, setMaxHealth] = useState<number>(3);
  const [wave, setWave] = useState<number>(1);
  const [weaponLevel, setWeaponLevel] = useState<number>(1);
  const [weaponTimeLeft, setWeaponTimeLeft] = useState<number>(0);
  const [starTimeLeft, setStarTimeLeft] = useState<number>(0);
  const [isMuted, setIsMuted] = useState<boolean>(soundManager.getMuted());
  const [autoFire, setAutoFire] = useState<boolean>(false);
  const [lastStats, setLastStats] = useState<GameStats>({
    score: 0,
    highScore: 0,
    difficulty: 'normal',
    wave: 1,
    enemiesDefeated: 0,
    asteroidsDestroyed: 0,
    starsCollected: 0,
    shotsFired: 0,
    shotsHit: 0,
    combo: 0,
    maxCombo: 0,
  });

  // Touch control states
  const leftPressedRef = useRef<boolean>(false);
  const rightPressedRef = useRef<boolean>(false);
  const firePressedRef = useRef<boolean>(false);

  // References for mutable game loop state to guarantee 60fps without React re-render lag
  const gameLoopRef = useRef<number | null>(null);
  const keysRef = useRef<{ [key: string]: boolean }>({});
  const lastShotTimeRef = useRef<number>(0);
  const lastSpawnObstacleRef = useRef<number>(0);
  const lastSpawnEnemyRef = useRef<number>(0);
  const lastSpawnStarRef = useRef<number>(0);
  const shakeRef = useRef<{ intensity: number; decay: number }>({ intensity: 0, decay: 0 });
  const nextIdRef = useRef<number>(1);
  const difficultyRef = useRef<Difficulty>(difficulty);

  // Keep difficulty ref synced
  useEffect(() => {
    difficultyRef.current = difficulty;
    localStorage.setItem('cosmic_striker_diff', difficulty);
  }, [difficulty]);

  // Game entities
  const playerRef = useRef<Player>({
    x: 240,
    y: 560,
    width: 44,
    height: 48,
    speed: 380, // pixels per second
    health: 3,
    maxHealth: 3,
    invulnerableTime: 0,
    weaponLevel: 1,
    weaponTimer: 0,
    starTimer: 0,
    tilt: 0,
  });

  const bulletsRef = useRef<Bullet[]>([]);
  const obstaclesRef = useRef<Obstacle[]>([]);
  const enemiesRef = useRef<Enemy[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const floatingTextsRef = useRef<FloatingText[]>([]);
  const powerUpsRef = useRef<PowerUp[]>([]);
  const starsRef = useRef<Star[]>([]);

  // Statistics tracker
  const statsRef = useRef<GameStats>({
    score: 0,
    highScore: 0,
    difficulty: 'normal',
    wave: 1,
    enemiesDefeated: 0,
    asteroidsDestroyed: 0,
    starsCollected: 0,
    shotsFired: 0,
    shotsHit: 0,
    combo: 0,
    maxCombo: 0,
  });

  // Virtual Game Canvas Resolution (internal coordinate space: 480 x 640)
  const GAME_WIDTH = 480;
  const GAME_HEIGHT = 640;

  // Initialize stars background
  useEffect(() => {
    const stars: Star[] = [];
    for (let i = 0; i < 85; i++) {
      stars.push({
        x: Math.random() * GAME_WIDTH,
        y: Math.random() * GAME_HEIGHT,
        size: Math.random() * 2 + 0.8,
        speed: Math.random() * 60 + 25,
        alpha: Math.random() * 0.7 + 0.3,
        twinkleSpeed: Math.random() * 2 + 1,
      });
    }
    starsRef.current = stars;
  }, []);

  // Handle keyboard inputs
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent browser scrolling on Arrow keys and Space
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Spacebar'].includes(e.key)) {
        e.preventDefault();
      }
      keysRef.current[e.key.toLowerCase()] = true;
      if (e.code === 'Space') {
        keysRef.current['space'] = true;
      }

      // Quick pause key
      if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
        setGameState((prev) => {
          if (prev === 'playing') return 'paused';
          if (prev === 'paused') return 'playing';
          return prev;
        });
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current[e.key.toLowerCase()] = false;
      if (e.code === 'Space') {
        keysRef.current['space'] = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Spawn visual particle explosions
  const createExplosion = useCallback(
    (x: number, y: number, color: string = '#f59e0b', size: 'small' | 'medium' | 'large' = 'small') => {
      const count = size === 'small' ? 18 : size === 'medium' ? 30 : 50;
      const speedMult = size === 'small' ? 1 : size === 'medium' ? 1.4 : 1.8;

      // Trigger audio
      soundManager.playExplosion(size);

      // Screen shake for tactile game feel
      shakeRef.current.intensity = Math.max(
        shakeRef.current.intensity,
        size === 'small' ? 4 : size === 'medium' ? 8 : 14
      );

      const newParticles: Particle[] = [];

      // 1. Shockwave ring
      newParticles.push({
        id: nextIdRef.current++,
        x,
        y,
        vx: 0,
        vy: 0,
        size: size === 'small' ? 12 : 24,
        color,
        alpha: 0.9,
        life: 0.25,
        maxLife: 0.25,
        shape: 'ring',
      });

      // 2. Bright hot center spark
      newParticles.push({
        id: nextIdRef.current++,
        x,
        y,
        vx: 0,
        vy: 0,
        size: size === 'small' ? 16 : 28,
        color: '#ffffff',
        alpha: 1,
        life: 0.15,
        maxLife: 0.15,
        shape: 'circle',
      });

      // 3. Radial sparks & debris shards
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.8;
        const speed = (Math.random() * 140 + 60) * speedMult;
        const sparkColor = Math.random() > 0.6 ? '#ffffff' : Math.random() > 0.3 ? color : '#f43f5e';

        newParticles.push({
          id: nextIdRef.current++,
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          size: Math.random() * 3.5 + 1.5,
          color: sparkColor,
          alpha: 1,
          life: Math.random() * 0.35 + 0.2,
          maxLife: 0.55,
          shape: Math.random() > 0.4 ? 'spark' : 'debris',
        });
      }

      particlesRef.current.push(...newParticles);
    },
    []
  );

  // Floating score text popup
  const addFloatingText = useCallback(
    (x: number, y: number, text: string, color: string = '#38bdf8') => {
      floatingTextsRef.current.push({
        id: nextIdRef.current++,
        x,
        y,
        text,
        color,
        alpha: 1,
        life: 0.8,
        vy: -55,
      });
    },
    []
  );

  // Generate polygonal rock vertices for asteroids
  const generateAsteroidVertices = (radius: number) => {
    const pointsCount = 8;
    const vertices: { x: number; y: number }[] = [];
    for (let i = 0; i < pointsCount; i++) {
      const angle = (Math.PI * 2 * i) / pointsCount;
      const variation = 0.75 + Math.random() * 0.5;
      vertices.push({
        x: Math.cos(angle) * radius * variation,
        y: Math.sin(angle) * radius * variation,
      });
    }
    return vertices;
  };

  // Helper to spawn a Star power-up
  const spawnStarPowerUp = useCallback((x?: number, y?: number) => {
    const posX = x !== undefined ? x : Math.random() * (GAME_WIDTH - 60) + 30;
    const posY = y !== undefined ? y : -25;
    powerUpsRef.current.push({
      id: nextIdRef.current++,
      x: posX,
      y: posY,
      vy: 110,
      type: 'star',
      radius: 17,
      duration: 10,
    });
  }, []);

  // Helper to drop level-up materials / power-ups based on difficulty
  const tryDropItem = useCallback(
    (x: number, y: number, isHeavy: boolean = false, isAsteroid: boolean = false) => {
      const diff = difficultyRef.current;
      let dropChance = 0.22;

      if (diff === 'easy') {
        // In Easy, level-up powerup materials rain down much more frequently!
        dropChance = isHeavy ? 0.95 : isAsteroid ? 0.35 : 0.65;
      } else if (diff === 'normal') {
        dropChance = isHeavy ? 0.8 : isAsteroid ? 0.08 : 0.22;
      } else {
        // Hard
        dropChance = isHeavy ? 0.5 : isAsteroid ? 0.03 : 0.12;
      }

      if (Math.random() < dropChance) {
        // Decide item type
        const roll = Math.random();
        let pType: PowerUp['type'] = 'multishot';

        // 12% chance for star if not already falling
        if (roll < 0.12) {
          pType = 'star';
        } else if (roll < 0.5) {
          pType = 'multishot'; // weapon level up!
        } else if (roll < 0.75) {
          pType = 'shield';
        } else if (roll < 0.88) {
          pType = 'speed';
        } else {
          pType = 'bomb';
        }

        powerUpsRef.current.push({
          id: nextIdRef.current++,
          x,
          y,
          vy: 115,
          type: pType,
          radius: pType === 'star' ? 17 : 14,
          duration: 12,
        });
      }
    },
    []
  );

  // Start / Restart game
  const startGame = useCallback(() => {
    const startingHealth = difficultyRef.current === 'easy' ? 4 : 3;
    playerRef.current = {
      x: GAME_WIDTH / 2,
      y: GAME_HEIGHT - 70,
      width: 44,
      height: 48,
      speed: 380,
      health: startingHealth,
      maxHealth: startingHealth,
      invulnerableTime: 0,
      weaponLevel: 1,
      weaponTimer: 0,
      starTimer: 0,
      tilt: 0,
    };

    bulletsRef.current = [];
    obstaclesRef.current = [];
    enemiesRef.current = [];
    particlesRef.current = [];
    floatingTextsRef.current = [];
    powerUpsRef.current = [];

    lastSpawnStarRef.current = performance.now();

    const currentHigh = parseInt(localStorage.getItem('cosmic_striker_highscore') || '0', 10);
    statsRef.current = {
      score: 0,
      highScore: currentHigh,
      difficulty: difficultyRef.current,
      wave: 1,
      enemiesDefeated: 0,
      asteroidsDestroyed: 0,
      starsCollected: 0,
      shotsFired: 0,
      shotsHit: 0,
      combo: 0,
      maxCombo: 0,
    };

    setScore(0);
    setHealth(startingHealth);
    setMaxHealth(startingHealth);
    setWave(1);
    setWeaponLevel(1);
    setWeaponTimeLeft(0);
    setStarTimeLeft(0);
    setGameState('playing');
  }, []);

  // Fire player weapons
  const firePlayerWeapons = useCallback(() => {
    const player = playerRef.current;
    const now = performance.now();
    const cooldown = player.weaponLevel > 1 ? 130 : 180;

    if (now - lastShotTimeRef.current < cooldown) return;
    lastShotTimeRef.current = now;

    statsRef.current.shotsFired++;
    soundManager.playLaser(player.weaponLevel > 1 ? 'spread' : 'single');

    if (player.weaponLevel === 1) {
      // Single center shot
      bulletsRef.current.push({
        id: nextIdRef.current++,
        x: player.x,
        y: player.y - player.height / 2,
        vx: 0,
        vy: -680,
        radius: 4,
        color: '#38bdf8',
        isEnemy: false,
        damage: 1,
      });
    } else if (player.weaponLevel === 2) {
      // Dual parallel cannons
      bulletsRef.current.push(
        {
          id: nextIdRef.current++,
          x: player.x - 12,
          y: player.y - player.height / 2 + 5,
          vx: 0,
          vy: -720,
          radius: 4,
          color: '#38bdf8',
          isEnemy: false,
          damage: 1,
        },
        {
          id: nextIdRef.current++,
          x: player.x + 12,
          y: player.y - player.height / 2 + 5,
          vx: 0,
          vy: -720,
          radius: 4,
          color: '#38bdf8',
          isEnemy: false,
          damage: 1,
        }
      );
    } else if (player.weaponLevel === 3) {
      // Triple spread fire
      bulletsRef.current.push(
        {
          id: nextIdRef.current++,
          x: player.x,
          y: player.y - player.height / 2,
          vx: 0,
          vy: -750,
          radius: 5,
          color: '#06b6d4',
          isEnemy: false,
          damage: 1.2,
        },
        {
          id: nextIdRef.current++,
          x: player.x - 12,
          y: player.y - player.height / 2 + 5,
          vx: -130,
          vy: -730,
          radius: 4,
          color: '#38bdf8',
          isEnemy: false,
          damage: 1,
        },
        {
          id: nextIdRef.current++,
          x: player.x + 12,
          y: player.y - player.height / 2 + 5,
          vx: 130,
          vy: -730,
          radius: 4,
          color: '#38bdf8',
          isEnemy: false,
          damage: 1,
        }
      );
    } else {
      // Quad barrage fire
      [-20, -7, 7, 20].forEach((offset, idx) => {
        const spreadVx = (idx - 1.5) * 80;
        bulletsRef.current.push({
          id: nextIdRef.current++,
          x: player.x + offset,
          y: player.y - player.height / 2 + Math.abs(offset) * 0.3,
          vx: spreadVx,
          vy: -760,
          radius: 4,
          color: '#a855f7',
          isEnemy: false,
          damage: 1.2,
        });
      });
    }

    // Engine muzzle flash particles
    particlesRef.current.push({
      id: nextIdRef.current++,
      x: player.x,
      y: player.y - player.height / 2,
      vx: (Math.random() - 0.5) * 40,
      vy: -80,
      size: 6,
      color: '#67e8f9',
      alpha: 0.8,
      life: 0.08,
      maxLife: 0.08,
      shape: 'circle',
    });
  }, []);

  // Main game update & render loop
  useEffect(() => {
    let lastTime = performance.now();

    const loop = (currentTime: number) => {
      const dt = Math.min((currentTime - lastTime) / 1000, 0.1);
      lastTime = currentTime;

      const canvas = canvasRef.current;
      if (!canvas) {
        gameLoopRef.current = requestAnimationFrame(loop);
        return;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        gameLoopRef.current = requestAnimationFrame(loop);
        return;
      }

      const currentDiff = difficultyRef.current;

      // Update entities if playing
      if (gameState === 'playing') {
        const player = playerRef.current;

        // Player input: Left / Right
        let moveDir = 0;
        if (
          keysRef.current['arrowleft'] ||
          keysRef.current['a'] ||
          leftPressedRef.current
        ) {
          moveDir -= 1;
        }
        if (
          keysRef.current['arrowright'] ||
          keysRef.current['d'] ||
          rightPressedRef.current
        ) {
          moveDir += 1;
        }

        // Smooth tilt banking animation
        const targetTilt = moveDir * 0.8;
        player.tilt += (targetTilt - player.tilt) * dt * 14;

        // Apply movement
        player.x += moveDir * player.speed * dt;
        // Clamp within canvas boundaries
        const halfW = player.width / 2;
        if (player.x < halfW + 10) player.x = halfW + 10;
        if (player.x > GAME_WIDTH - halfW - 10) player.x = GAME_WIDTH - halfW - 10;

        // Weapon timer decrement
        if (player.weaponTimer > 0) {
          player.weaponTimer -= dt;
          setWeaponTimeLeft(Math.ceil(player.weaponTimer));
          if (player.weaponTimer <= 0) {
            player.weaponLevel = 1;
            setWeaponLevel(1);
          }
        }

        // Star invincibility timer decrement
        if (player.starTimer > 0) {
          player.starTimer -= dt;
          setStarTimeLeft(Math.ceil(player.starTimer));
          if (player.starTimer <= 0) {
            player.starTimer = 0;
            setStarTimeLeft(0);
          }

          // Golden rainbow sparkle trail when star invincible!
          for (let i = 0; i < 2; i++) {
            const hue = Math.floor(Math.random() * 360);
            particlesRef.current.push({
              id: nextIdRef.current++,
              x: player.x + (Math.random() - 0.5) * player.width,
              y: player.y + (Math.random() - 0.5) * player.height,
              vx: (Math.random() - 0.5) * 60,
              vy: Math.random() * 60 + 40,
              size: Math.random() * 4 + 2,
              color: `hsl(${hue}, 100%, 65%)`,
              alpha: 1,
              life: 0.35,
              maxLife: 0.35,
              shape: 'spark',
            });
          }
        }

        // Invulnerability decrement
        if (player.invulnerableTime > 0) {
          player.invulnerableTime -= dt;
        }

        // Shooting action: Spacebar, Touch Fire button, or Auto-fire
        if (
          keysRef.current[' '] ||
          keysRef.current['space'] ||
          firePressedRef.current ||
          autoFire
        ) {
          firePlayerWeapons();
        }

        // Player thruster particles
        if (Math.random() < 0.85) {
          particlesRef.current.push({
            id: nextIdRef.current++,
            x: player.x + (Math.random() - 0.5) * 12,
            y: player.y + player.height / 2 - 4,
            vx: (Math.random() - 0.5) * 35,
            vy: Math.random() * 80 + 120,
            size: Math.random() * 3 + 2,
            color: player.starTimer > 0 ? '#fbbf24' : Math.random() > 0.4 ? '#38bdf8' : '#0284c7',
            alpha: 0.9,
            life: Math.random() * 0.2 + 0.1,
            maxLife: 0.3,
            shape: 'circle',
          });
        }

        // Wave progression calculation based on score
        const currentWave = Math.floor(statsRef.current.score / 1200) + 1;
        if (currentWave !== statsRef.current.wave) {
          statsRef.current.wave = currentWave;
          setWave(currentWave);
          addFloatingText(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 80, `WAVE ${currentWave} REACHED!`, '#fbbf24');
        }

        // --- SPAWN PERIODIC FALLING STAR (Available across ALL difficulties!) ---
        // Every 25 seconds guaranteed, a glittering golden star falls from the cosmos!
        const starInterval = currentDiff === 'easy' ? 20000 : 26000;
        if (currentTime - lastSpawnStarRef.current > starInterval) {
          lastSpawnStarRef.current = currentTime;
          spawnStarPowerUp();
        }

        // --- SPAWN OBSTACLES (Asteroids) ---
        const obstacleInterval = Math.max(1200 - currentWave * 70, 600);
        if (currentTime - lastSpawnObstacleRef.current > obstacleInterval) {
          lastSpawnObstacleRef.current = currentTime;

          const sizeRoll = Math.random();
          let radius = 18;
          let hp = 2;
          let color = '#78716c';
          let cracksColor = '#fbbf24';

          if (sizeRoll < 0.45) {
            radius = 16; // small
            hp = currentDiff === 'hard' ? 3 : 2;
            color = '#78716c';
          } else if (sizeRoll < 0.8) {
            radius = 26; // medium
            hp = currentDiff === 'hard' ? 6 : 4;
            color = '#57534e';
          } else {
            radius = 38; // large asteroid
            hp = currentDiff === 'hard' ? 10 : 7;
            color = '#44403c';
            cracksColor = '#f97316';
          }

          const x = Math.random() * (GAME_WIDTH - radius * 2 - 20) + radius + 10;
          const vy = (Math.random() * 90 + 90) + currentWave * 8;
          const vx = (Math.random() - 0.5) * 50;

          obstaclesRef.current.push({
            id: nextIdRef.current++,
            x,
            y: -radius - 10,
            vx,
            vy,
            radius,
            hp,
            maxHp: hp,
            rotation: Math.random() * Math.PI * 2,
            rotationSpeed: (Math.random() - 0.5) * 2.5,
            vertices: generateAsteroidVertices(radius),
            color,
            cracksColor,
          });
        }

        // --- SPAWN ENEMIES ---
        // Hard mode slightly increases enemy frequency and significantly boosts HP
        const enemyIntervalBase = currentDiff === 'hard' ? 1400 : 1700;
        const enemyInterval = Math.max(enemyIntervalBase - currentWave * 80, 750);
        if (currentTime - lastSpawnEnemyRef.current > enemyInterval) {
          lastSpawnEnemyRef.current = currentTime;

          const enemyRoll = Math.random();
          let enemyType: Enemy['type'] = 'scout';
          let hp = 2;
          let width = 36;
          let height = 36;
          let points = 100;
          let color = '#ef4444';
          let glowColor = '#f87171';
          let vy = 110 + currentWave * 8;

          if (enemyRoll < 0.5) {
            // Scout dart
            enemyType = 'scout';
            hp = currentDiff === 'hard' ? 4 : 2; // Hard: HP increased
            width = 34;
            height = 34;
            points = currentDiff === 'hard' ? 130 : 100;
            color = '#ef4444';
            glowColor = '#fca5a5';
            vy = 130 + currentWave * 10;
          } else if (enemyRoll < 0.82) {
            // Drone zig-zag
            enemyType = 'drone';
            hp = currentDiff === 'hard' ? 5 : 3; // Hard: HP increased
            width = 38;
            height = 38;
            points = currentDiff === 'hard' ? 240 : 180;
            color = '#a855f7';
            glowColor = '#d8b4fe';
            vy = 100 + currentWave * 7;
          } else {
            // Heavy armored gunship
            enemyType = 'heavy';
            hp = currentDiff === 'hard' ? 10 : 6; // Hard: HP increased
            width = 48;
            height = 46;
            points = currentDiff === 'hard' ? 450 : 350;
            color = '#f59e0b';
            glowColor = '#fde68a';
            vy = 75 + currentWave * 5;
          }

          const x = Math.random() * (GAME_WIDTH - width - 40) + width / 2 + 20;

          enemiesRef.current.push({
            id: nextIdRef.current++,
            x,
            y: -height - 10,
            vx: 0,
            vy,
            width,
            height,
            hp,
            maxHp: hp,
            type: enemyType,
            shootCooldown: Math.random() * 1.5 + 1.2,
            points,
            color,
            glowColor,
            phase: Math.random() * 10,
          });
        }

        // --- UPDATE OBSTACLES ---
        obstaclesRef.current.forEach((obs) => {
          obs.x += obs.vx * dt;
          obs.y += obs.vy * dt;
          obs.rotation += obs.rotationSpeed * dt;

          if (obs.x - obs.radius < 0) {
            obs.x = obs.radius;
            obs.vx *= -1;
          } else if (obs.x + obs.radius > GAME_WIDTH) {
            obs.x = GAME_WIDTH - obs.radius;
            obs.vx *= -1;
          }
        });
        obstaclesRef.current = obstaclesRef.current.filter((obs) => obs.y < GAME_HEIGHT + obs.radius + 40);

        // --- UPDATE ENEMIES ---
        enemiesRef.current.forEach((enemy) => {
          enemy.y += enemy.vy * dt;
          enemy.phase += dt * 3;

          if (enemy.type === 'drone') {
            enemy.x += Math.sin(enemy.phase) * 120 * dt;
          } else if (enemy.type === 'heavy') {
            const dx = player.x - enemy.x;
            enemy.x += Math.sign(dx) * Math.min(Math.abs(dx), 35) * dt;
          }

          // Enemy shooting
          enemy.shootCooldown -= dt;
          if (enemy.shootCooldown <= 0 && enemy.y > 20 && enemy.y < GAME_HEIGHT - 120) {
            enemy.shootCooldown = enemy.type === 'heavy' ? 1.8 : 2.4;

            bulletsRef.current.push({
              id: nextIdRef.current++,
              x: enemy.x,
              y: enemy.y + enemy.height / 2,
              vx: (player.x - enemy.x) * 0.35,
              vy: 230 + currentWave * 10,
              radius: 5,
              color: enemy.color,
              isEnemy: true,
              damage: 1,
            });
          }
        });
        enemiesRef.current = enemiesRef.current.filter((e) => e.y < GAME_HEIGHT + e.height + 40);

        // --- UPDATE BULLETS ---
        bulletsRef.current.forEach((b) => {
          b.x += b.vx * dt;
          b.y += b.vy * dt;
        });
        bulletsRef.current = bulletsRef.current.filter(
          (b) => b.y > -20 && b.y < GAME_HEIGHT + 20 && b.x > -20 && b.x < GAME_WIDTH + 20
        );

        // --- UPDATE POWERUPS ---
        powerUpsRef.current.forEach((p) => {
          p.y += p.vy * dt;

          // Sparkle trail for Star powerups
          if (p.type === 'star' && Math.random() < 0.6) {
            particlesRef.current.push({
              id: nextIdRef.current++,
              x: p.x + (Math.random() - 0.5) * 12,
              y: p.y + (Math.random() - 0.5) * 12,
              vx: (Math.random() - 0.5) * 20,
              vy: (Math.random() - 0.5) * 20,
              size: Math.random() * 3 + 1.5,
              color: '#fde047',
              alpha: 0.9,
              life: 0.25,
              maxLife: 0.25,
              shape: 'spark',
            });
          }
        });
        powerUpsRef.current = powerUpsRef.current.filter((p) => p.y < GAME_HEIGHT + 30);

        // --- COLLISION: PLAYER BULLETS VS ENEMIES ---
        bulletsRef.current.forEach((bullet) => {
          if (bullet.isEnemy) return;

          for (let i = enemiesRef.current.length - 1; i >= 0; i--) {
            const enemy = enemiesRef.current[i];
            const dist = Math.hypot(bullet.x - enemy.x, bullet.y - enemy.y);
            const hitThreshold = enemy.width / 2 + bullet.radius;

            if (dist < hitThreshold) {
              bullet.y = -999;
              enemy.hp -= bullet.damage;
              statsRef.current.shotsHit++;
              soundManager.playHit();

              // Spark
              particlesRef.current.push({
                id: nextIdRef.current++,
                x: bullet.x,
                y: bullet.y,
                vx: (Math.random() - 0.5) * 80,
                vy: (Math.random() - 0.5) * 80,
                size: 4,
                color: '#ffffff',
                alpha: 1,
                life: 0.12,
                maxLife: 0.12,
                shape: 'spark',
              });

              if (enemy.hp <= 0) {
                // ENEMY DESTROYED: TRIGGER EXPLOSION!
                createExplosion(
                  enemy.x,
                  enemy.y,
                  enemy.glowColor,
                  enemy.type === 'heavy' ? 'large' : 'medium'
                );

                statsRef.current.enemiesDefeated++;
                statsRef.current.combo++;
                if (statsRef.current.combo > statsRef.current.maxCombo) {
                  statsRef.current.maxCombo = statsRef.current.combo;
                }

                const comboBonus = Math.min(statsRef.current.combo, 5);
                const awardedPoints = enemy.points * comboBonus;
                statsRef.current.score += awardedPoints;
                setScore(statsRef.current.score);

                const textStr = comboBonus > 1 ? `+${awardedPoints} (${comboBonus}x)` : `+${awardedPoints}`;
                addFloatingText(enemy.x, enemy.y - 10, textStr, enemy.glowColor);

                // Try drop level-up materials or star
                tryDropItem(enemy.x, enemy.y, enemy.type === 'heavy', false);

                enemiesRef.current.splice(i, 1);
              }
              break;
            }
          }

          // Check against obstacles (Asteroids)
          for (let j = obstaclesRef.current.length - 1; j >= 0; j--) {
            const obs = obstaclesRef.current[j];
            const dist = Math.hypot(bullet.x - obs.x, bullet.y - obs.y);
            if (dist < obs.radius + bullet.radius) {
              bullet.y = -999;
              obs.hp -= bullet.damage;
              statsRef.current.shotsHit++;
              soundManager.playHit();

              // Rock chipping sparks
              for (let k = 0; k < 4; k++) {
                particlesRef.current.push({
                  id: nextIdRef.current++,
                  x: bullet.x,
                  y: bullet.y,
                  vx: (Math.random() - 0.5) * 90,
                  vy: (Math.random() - 0.5) * 90,
                  size: 3,
                  color: '#d6d3d1',
                  alpha: 0.9,
                  life: 0.15,
                  maxLife: 0.15,
                  shape: 'debris',
                });
              }

              if (obs.hp <= 0) {
                createExplosion(obs.x, obs.y, '#eab308', obs.radius > 30 ? 'medium' : 'small');
                statsRef.current.asteroidsDestroyed++;
                const asteroidPoints = Math.round(obs.radius * 3);
                statsRef.current.score += asteroidPoints;
                setScore(statsRef.current.score);
                addFloatingText(obs.x, obs.y, `+${asteroidPoints}`, '#fcd34d');

                // Try drop level-up materials from asteroid (especially in Easy mode!)
                tryDropItem(obs.x, obs.y, false, true);

                if (obs.radius >= 26) {
                  for (let s = 0; s < 2; s++) {
                    const smallRadius = 14;
                    obstaclesRef.current.push({
                      id: nextIdRef.current++,
                      x: obs.x + (s === 0 ? -12 : 12),
                      y: obs.y,
                      vx: (s === 0 ? -70 : 70) + (Math.random() - 0.5) * 20,
                      vy: obs.vy * 1.2,
                      radius: smallRadius,
                      hp: currentDiff === 'hard' ? 2 : 1,
                      maxHp: currentDiff === 'hard' ? 2 : 1,
                      rotation: Math.random() * Math.PI,
                      rotationSpeed: (Math.random() - 0.5) * 4,
                      vertices: generateAsteroidVertices(smallRadius),
                      color: '#78716c',
                      cracksColor: '#fbbf24',
                    });
                  }
                }

                obstaclesRef.current.splice(j, 1);
              }
              break;
            }
          }
        });

        // --- COLLISION: PLAYER VS POWERUPS (INCLUDING STAR!) ---
        for (let i = powerUpsRef.current.length - 1; i >= 0; i--) {
          const pup = powerUpsRef.current[i];
          const dist = Math.hypot(player.x - pup.x, player.y - pup.y);
          if (dist < pup.radius + player.width / 2) {
            if (pup.type === 'star') {
              // STAR COLLECTED: ENTER INVINCIBLE STATE!
              player.starTimer = 10; // 10 seconds of invincibility
              setStarTimeLeft(10);
              statsRef.current.starsCollected++;
              soundManager.playStarFanfare();
              shakeRef.current.intensity = 12;
              addFloatingText(player.x, player.y - 30, '★ SUPER STAR INVINCIBLE! ★', '#fde047');

              // Huge radial burst of golden star particles
              for (let k = 0; k < 35; k++) {
                const angle = (Math.PI * 2 * k) / 35;
                const spd = Math.random() * 150 + 80;
                particlesRef.current.push({
                  id: nextIdRef.current++,
                  x: player.x,
                  y: player.y,
                  vx: Math.cos(angle) * spd,
                  vy: Math.sin(angle) * spd,
                  size: Math.random() * 5 + 2,
                  color: Math.random() > 0.5 ? '#fde047' : '#38bdf8',
                  alpha: 1,
                  life: 0.5,
                  maxLife: 0.5,
                  shape: 'spark',
                });
              }
            } else if (pup.type === 'multishot') {
              soundManager.playPowerUp();
              player.weaponLevel = Math.min(player.weaponLevel + 1, 4);
              player.weaponTimer = 14;
              setWeaponLevel(player.weaponLevel);
              setWeaponTimeLeft(14);
              addFloatingText(player.x, player.y - 20, 'WEAPON LEVEL UP!', '#38bdf8');
            } else if (pup.type === 'shield') {
              soundManager.playPowerUp();
              player.health = Math.min(player.health + 1, player.maxHealth);
              setHealth(player.health);
              addFloatingText(player.x, player.y - 20, 'SHIELD RESTORED!', '#34d399');
            } else if (pup.type === 'speed') {
              soundManager.playPowerUp();
              player.speed = 480;
              setTimeout(() => {
                playerRef.current.speed = 380;
              }, 10000);
              addFloatingText(player.x, player.y - 20, 'SPEED BOOST!', '#f472b6');
            } else if (pup.type === 'bomb') {
              soundManager.playPowerUp();
              addFloatingText(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'EMP DETONATED!', '#fbbf24');
              shakeRef.current.intensity = 18;

              enemiesRef.current.forEach((en) => {
                createExplosion(en.x, en.y, en.glowColor, 'medium');
                statsRef.current.enemiesDefeated++;
                statsRef.current.score += en.points;
              });
              enemiesRef.current = [];

              obstaclesRef.current.forEach((ob) => {
                createExplosion(ob.x, ob.y, '#eab308', 'small');
                statsRef.current.asteroidsDestroyed++;
                statsRef.current.score += Math.round(ob.radius * 2);
              });
              obstaclesRef.current = [];

              bulletsRef.current = bulletsRef.current.filter((b) => !b.isEnemy);
              setScore(statsRef.current.score);
            }

            powerUpsRef.current.splice(i, 1);
          }
        }

        // --- COLLISION: PLAYER VS HAZARDS (RAM MECHANISM IF STAR INVINCIBLE) ---
        const checkPlayerDamage = (sourceX: number, sourceY: number, damage: number = 1) => {
          // If star invincible, player takes NO damage!
          if (player.starTimer > 0) return;
          if (player.invulnerableTime > 0) return;

          player.health -= damage;
          player.invulnerableTime = 1.6;
          statsRef.current.combo = 0;
          setHealth(player.health);
          soundManager.playPlayerDamage();

          createExplosion(player.x, player.y, '#ef4444', 'small');
          shakeRef.current.intensity = 15;

          if (player.health <= 0) {
            createExplosion(player.x, player.y, '#f59e0b', 'large');
            soundManager.playGameOver();

            const finalScore = statsRef.current.score;
            const currentHigh = parseInt(localStorage.getItem('cosmic_striker_highscore') || '0', 10);
            if (finalScore > currentHigh) {
              localStorage.setItem('cosmic_striker_highscore', String(finalScore));
              setHighScore(finalScore);
              statsRef.current.highScore = finalScore;
            }

            setLastStats({ ...statsRef.current });
            setGameState('gameover');
          }
        };

        // Enemy bullets hitting player
        for (let i = bulletsRef.current.length - 1; i >= 0; i--) {
          const bullet = bulletsRef.current[i];
          if (!bullet.isEnemy) continue;

          const dist = Math.hypot(bullet.x - player.x, bullet.y - player.y);
          if (dist < bullet.radius + player.width / 2.5) {
            bullet.y = 9999;
            if (player.starTimer > 0) {
              // DEFLECTED by Star Invincibility!
              soundManager.playHit();
              particlesRef.current.push({
                id: nextIdRef.current++,
                x: bullet.x,
                y: bullet.y,
                vx: (Math.random() - 0.5) * 100,
                vy: -120,
                size: 5,
                color: '#fde047',
                alpha: 1,
                life: 0.15,
                maxLife: 0.15,
                shape: 'spark',
              });
            } else {
              checkPlayerDamage(bullet.x, bullet.y, bullet.damage);
            }
            break;
          }
        }

        // Obstacles hitting player (RAM KILL IF STAR INVINCIBLE!)
        for (let i = obstaclesRef.current.length - 1; i >= 0; i--) {
          const obs = obstaclesRef.current[i];
          const dist = Math.hypot(obs.x - player.x, obs.y - player.y);
          if (dist < obs.radius + player.width / 2.4) {
            if (player.starTimer > 0) {
              // SMASH THROUGH OBSTACLE WITH STAR!
              soundManager.playStarSmash();
              createExplosion(obs.x, obs.y, '#fde047', 'medium');
              obstaclesRef.current.splice(i, 1);
              statsRef.current.asteroidsDestroyed++;
              statsRef.current.score += 250;
              setScore(statsRef.current.score);
              addFloatingText(obs.x, obs.y, '★ SMASH! +250', '#fde047');
            } else {
              createExplosion(obs.x, obs.y, '#f59e0b', 'small');
              obstaclesRef.current.splice(i, 1);
              checkPlayerDamage(obs.x, obs.y, 1);
            }
            break;
          }
        }

        // Enemies colliding into player (RAM KILL IF STAR INVINCIBLE!)
        for (let i = enemiesRef.current.length - 1; i >= 0; i--) {
          const enemy = enemiesRef.current[i];
          const dist = Math.hypot(enemy.x - player.x, enemy.y - player.y);
          if (dist < enemy.width / 2 + player.width / 2.4) {
            if (player.starTimer > 0) {
              // SMASH ENEMY WITH STAR!
              soundManager.playStarSmash();
              createExplosion(enemy.x, enemy.y, '#fde047', 'large');
              enemiesRef.current.splice(i, 1);
              statsRef.current.enemiesDefeated++;
              const ramPoints = enemy.points * 2;
              statsRef.current.score += ramPoints;
              setScore(statsRef.current.score);
              addFloatingText(enemy.x, enemy.y, `★ RAM CRUSH! +${ramPoints}`, '#fde047');
              tryDropItem(enemy.x, enemy.y, enemy.type === 'heavy', false);
            } else {
              createExplosion(enemy.x, enemy.y, enemy.glowColor, 'medium');
              enemiesRef.current.splice(i, 1);
              checkPlayerDamage(enemy.x, enemy.y, 1);
            }
            break;
          }
        }

        bulletsRef.current = bulletsRef.current.filter((b) => b.y > -50 && b.y < GAME_HEIGHT + 50);
      }

      // --- UPDATE PARTICLES & FLOATING TEXTS ---
      particlesRef.current.forEach((p) => {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
        p.alpha = Math.max(0, p.life / p.maxLife);
        p.vx *= 0.96;
        p.vy *= 0.96;
      });
      particlesRef.current = particlesRef.current.filter((p) => p.life > 0);

      floatingTextsRef.current.forEach((ft) => {
        ft.y += ft.vy * dt;
        ft.life -= dt;
        ft.alpha = Math.max(0, ft.life / 0.8);
      });
      floatingTextsRef.current = floatingTextsRef.current.filter((ft) => ft.life > 0);

      // --- UPDATE BACKGROUND STARS ---
      starsRef.current.forEach((s) => {
        s.y += s.speed * dt;
        if (s.y > GAME_HEIGHT) {
          s.y = 0;
          s.x = Math.random() * GAME_WIDTH;
        }
      });

      // --- SCREEN SHAKE DECAY ---
      if (shakeRef.current.intensity > 0) {
        shakeRef.current.intensity = Math.max(0, shakeRef.current.intensity - dt * 25);
      }

      // ==========================================
      // --- RENDERING PHASE ---
      // ==========================================
      ctx.save();

      if (shakeRef.current.intensity > 0) {
        const sx = (Math.random() - 0.5) * shakeRef.current.intensity;
        const sy = (Math.random() - 0.5) * shakeRef.current.intensity;
        ctx.translate(sx, sy);
      }

      // Deep space gradient
      const bgGrad = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
      bgGrad.addColorStop(0, '#020617');
      bgGrad.addColorStop(0.5, '#050c26');
      bgGrad.addColorStop(1, '#020617');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

      // Subtle cyan grid lines
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.04)';
      ctx.lineWidth = 1;
      for (let x = 0; x < GAME_WIDTH; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, GAME_HEIGHT);
        ctx.stroke();
      }

      // Draw scrolling stars
      starsRef.current.forEach((s) => {
        ctx.fillStyle = `rgba(255, 255, 255, ${s.alpha})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fill();
      });

      // Draw Power-ups (Special handling for Star!)
      powerUpsRef.current.forEach((p) => {
        ctx.save();
        ctx.translate(p.x, p.y);

        if (p.type === 'star') {
          // GLOWING ROTATING 5-POINT STAR
          const starAngle = currentTime * 0.003;
          ctx.rotate(starAngle);

          // Pulsing rainbow halo
          const pulse = 1 + Math.sin(currentTime * 0.01) * 0.2;
          ctx.shadowColor = '#fde047';
          ctx.shadowBlur = 16 * pulse;
          ctx.fillStyle = '#fef08a';

          drawStarPath(ctx, 0, 0, 5, p.radius * pulse, (p.radius * pulse) / 2);
          ctx.fill();

          ctx.fillStyle = '#eab308';
          drawStarPath(ctx, 0, 0, 5, p.radius * 0.6 * pulse, (p.radius * 0.6 * pulse) / 2);
          ctx.fill();
        } else {
          const pulse = 1 + Math.sin(currentTime * 0.008) * 0.15;
          const color =
            p.type === 'multishot'
              ? '#38bdf8'
              : p.type === 'shield'
              ? '#34d399'
              : p.type === 'speed'
              ? '#f472b6'
              : '#fbbf24';

          ctx.shadowColor = color;
          ctx.shadowBlur = 12 * pulse;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(0, 0, p.radius * pulse, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#0f172a';
          ctx.beginPath();
          ctx.arc(0, 0, p.radius * 0.7, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 11px Orbitron, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const label =
            p.type === 'multishot'
              ? 'UP'
              : p.type === 'shield'
              ? 'HP'
              : p.type === 'speed'
              ? 'SPD'
              : 'BOM';
          ctx.fillText(label, 0, 1);
        }

        ctx.restore();
      });

      // Draw Obstacles (Asteroids)
      obstaclesRef.current.forEach((obs) => {
        ctx.save();
        ctx.translate(obs.x, obs.y);
        ctx.rotate(obs.rotation);

        ctx.fillStyle = obs.color;
        ctx.strokeStyle = obs.hp < obs.maxHp ? obs.cracksColor : '#a8a29e';
        ctx.lineWidth = 2;

        ctx.beginPath();
        if (obs.vertices.length > 0) {
          ctx.moveTo(obs.vertices[0].x, obs.vertices[0].y);
          for (let i = 1; i < obs.vertices.length; i++) {
            ctx.lineTo(obs.vertices[i].x, obs.vertices[i].y);
          }
          ctx.closePath();
        }
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
        ctx.beginPath();
        ctx.arc(obs.radius * 0.25, -obs.radius * 0.2, obs.radius * 0.25, 0, Math.PI * 2);
        ctx.arc(-obs.radius * 0.3, obs.radius * 0.3, obs.radius * 0.2, 0, Math.PI * 2);
        ctx.fill();

        if (obs.hp < obs.maxHp) {
          ctx.strokeStyle = obs.cracksColor;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(obs.radius * 0.6, obs.radius * 0.4);
          ctx.moveTo(0, 0);
          ctx.lineTo(-obs.radius * 0.5, -obs.radius * 0.5);
          ctx.stroke();
        }

        ctx.restore();
      });

      // Draw Enemies
      enemiesRef.current.forEach((enemy) => {
        ctx.save();
        ctx.translate(enemy.x, enemy.y);

        ctx.shadowColor = enemy.glowColor;
        ctx.shadowBlur = 10;

        if (enemy.type === 'scout') {
          ctx.fillStyle = enemy.color;
          ctx.beginPath();
          ctx.moveTo(0, enemy.height / 2);
          ctx.lineTo(enemy.width / 2, -enemy.height / 2);
          ctx.lineTo(0, -enemy.height / 4);
          ctx.lineTo(-enemy.width / 2, -enemy.height / 2);
          ctx.closePath();
          ctx.fill();

          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
          ctx.fill();
        } else if (enemy.type === 'drone') {
          ctx.fillStyle = enemy.color;
          ctx.beginPath();
          ctx.moveTo(0, enemy.height / 2);
          ctx.lineTo(enemy.width / 2, -enemy.height / 3);
          ctx.lineTo(enemy.width / 3, -enemy.height / 2);
          ctx.lineTo(0, -enemy.height / 5);
          ctx.lineTo(-enemy.width / 3, -enemy.height / 2);
          ctx.lineTo(-enemy.width / 2, -enemy.height / 3);
          ctx.closePath();
          ctx.fill();

          ctx.fillStyle = '#c084fc';
          ctx.fillRect(-6, -4, 12, 5);
        } else {
          ctx.fillStyle = '#d97706';
          ctx.beginPath();
          ctx.moveTo(0, enemy.height / 2 + 4);
          ctx.lineTo(enemy.width / 2, 0);
          ctx.lineTo(enemy.width / 2 - 4, -enemy.height / 2);
          ctx.lineTo(-enemy.width / 2 + 4, -enemy.height / 2);
          ctx.lineTo(-enemy.width / 2, 0);
          ctx.closePath();
          ctx.fill();

          ctx.fillStyle = '#f59e0b';
          ctx.fillRect(-enemy.width / 3, -enemy.height / 3, (enemy.width * 2) / 3, enemy.height / 2);

          ctx.fillStyle = '#ef4444';
          ctx.beginPath();
          ctx.arc(0, 0, 5, 0, Math.PI * 2);
          ctx.fill();
        }

        // Enemy Health Bar
        if (enemy.hp < enemy.maxHp) {
          const barW = enemy.width;
          const barH = 4;
          const pct = Math.max(0, enemy.hp / enemy.maxHp);
          ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
          ctx.fillRect(-barW / 2, -enemy.height / 2 - 10, barW, barH);
          ctx.fillStyle = '#ef4444';
          ctx.fillRect(-barW / 2, -enemy.height / 2 - 10, barW * pct, barH);
        }

        ctx.restore();
      });

      // Draw Bullets
      bulletsRef.current.forEach((b) => {
        ctx.save();
        ctx.shadowColor = b.color;
        ctx.shadowBlur = 8;
        ctx.fillStyle = b.color;

        if (b.isEnemy) {
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.radius * 0.4, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.ellipse(b.x, b.y, b.radius * 0.75, b.radius * 2.2, 0, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.ellipse(b.x, b.y, b.radius * 0.35, b.radius * 1.2, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      });

      // Draw Player Spaceship
      if (gameState === 'playing' || gameState === 'paused') {
        const player = playerRef.current;
        const isBlinking =
          player.invulnerableTime > 0 &&
          player.starTimer <= 0 &&
          Math.floor(currentTime * 0.015) % 2 === 0;

        if (!isBlinking) {
          ctx.save();
          ctx.translate(player.x, player.y);
          ctx.rotate(player.tilt * 0.25);

          // Star Invincible Rainbow Aura
          if (player.starTimer > 0) {
            const rainbowHue = Math.floor(currentTime * 0.4) % 360;
            ctx.shadowColor = `hsl(${rainbowHue}, 100%, 60%)`;
            ctx.shadowBlur = 24;

            // Rotating radiant energy shield
            ctx.strokeStyle = `hsl(${rainbowHue}, 100%, 70%)`;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(0, 0, player.width * 0.9, 0, Math.PI * 2);
            ctx.stroke();

            // Inner star points
            drawStarPath(ctx, 0, 0, 5, player.width * 0.75, player.width * 0.45);
            ctx.strokeStyle = `rgba(255, 255, 255, 0.6)`;
            ctx.lineWidth = 1.5;
            ctx.stroke();
          } else {
            ctx.shadowColor = '#38bdf8';
            ctx.shadowBlur = 14;
          }

          // Main Fighter Body
          ctx.fillStyle = player.starTimer > 0 ? '#38bdf8' : '#0284c7';
          ctx.beginPath();
          ctx.moveTo(0, -player.height / 2);
          ctx.lineTo(player.width / 2, player.height / 2 - 4);
          ctx.lineTo(player.width / 4, player.height / 2 - 10);
          ctx.lineTo(0, player.height / 2);
          ctx.lineTo(-player.width / 4, player.height / 2 - 10);
          ctx.lineTo(-player.width / 2, player.height / 2 - 4);
          ctx.closePath();
          ctx.fill();

          // Cockpit canopy glow
          ctx.fillStyle = player.starTimer > 0 ? '#fef08a' : '#38bdf8';
          ctx.beginPath();
          ctx.moveTo(0, -player.height / 4);
          ctx.lineTo(6, 4);
          ctx.lineTo(-6, 4);
          ctx.closePath();
          ctx.fill();

          // Wing accents
          ctx.strokeStyle = '#e0f2fe';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(0, -player.height / 2);
          ctx.lineTo(0, player.height / 4);
          ctx.moveTo(-player.width / 3, player.height / 4);
          ctx.lineTo(-player.width / 2, player.height / 2 - 4);
          ctx.moveTo(player.width / 3, player.height / 4);
          ctx.lineTo(player.width / 2, player.height / 2 - 4);
          ctx.stroke();

          // Normal damage shield aura
          if (player.invulnerableTime > 0 && player.starTimer <= 0) {
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.7)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, player.width * 0.8, 0, Math.PI * 2);
            ctx.stroke();
          }

          ctx.restore();
        }
      }

      // Draw Explosions & Visual Particles
      particlesRef.current.forEach((p) => {
        ctx.save();
        ctx.globalAlpha = p.alpha;

        if (p.shape === 'ring') {
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 3;
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 10;
          ctx.beginPath();
          const r = p.size * (1 + (1 - p.alpha) * 2.5);
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.stroke();
        } else if (p.shape === 'spark') {
          ctx.fillStyle = p.color;
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        } else if (p.shape === 'debris') {
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        } else {
          ctx.fillStyle = p.color;
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 6;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      });

      // Draw Floating score / popup texts
      floatingTextsRef.current.forEach((ft) => {
        ctx.save();
        ctx.globalAlpha = ft.alpha;
        ctx.fillStyle = ft.color;
        ctx.shadowColor = ft.color;
        ctx.shadowBlur = 8;
        ctx.font = 'bold 15px Orbitron, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(ft.text, ft.x, ft.y);
        ctx.restore();
      });

      ctx.restore(); // restore shake

      gameLoopRef.current = requestAnimationFrame(loop);
    };

    gameLoopRef.current = requestAnimationFrame(loop);

    return () => {
      if (gameLoopRef.current) {
        cancelAnimationFrame(gameLoopRef.current);
      }
    };
  }, [
    gameState,
    autoFire,
    firePlayerWeapons,
    createExplosion,
    addFloatingText,
    spawnStarPowerUp,
    tryDropItem,
  ]);

  // Audio toggle helper
  const handleToggleSound = () => {
    const newMuted = soundManager.toggleMute();
    setIsMuted(newMuted);
  };

  // Difficulty switch handler
  const handleSelectDifficulty = (diff: Difficulty) => {
    setDifficulty(diff);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen w-full bg-slate-950 font-sans p-2 sm:p-4 select-none">
      {/* Outer Game Cabinet Container */}
      <div className="relative w-full max-w-[500px] flex flex-col items-center bg-slate-900 border border-cyan-500/30 rounded-2xl shadow-2xl shadow-cyan-950/50 overflow-hidden">
        
        {/* Top Header Bar */}
        <div className="w-full bg-slate-950/80 backdrop-blur-md px-4 py-2.5 border-b border-cyan-500/20 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <Crosshair className="w-5 h-5 text-cyan-400 animate-pulse" />
            <span className="font-['Orbitron'] font-bold text-sm tracking-wider text-cyan-300">
              COSMIC STRIKER
            </span>
            {/* Active difficulty pill */}
            <span
              className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase tracking-wider ${
                difficulty === 'easy'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : difficulty === 'normal'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                  : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
              }`}
            >
              {difficulty}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Auto-fire toggle */}
            <button
              onClick={() => setAutoFire(!autoFire)}
              title="自動連射トグル"
              className={`px-2 py-1 text-xs font-mono rounded flex items-center gap-1 transition-all ${
                autoFire
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm shadow-amber-500/30'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700'
              }`}
            >
              <Flame className="w-3 h-3" />
              <span>連射: {autoFire ? 'ON' : 'OFF'}</span>
            </button>

            {/* Sound toggle */}
            <button
              onClick={handleToggleSound}
              title={isMuted ? 'サウンドをONにする' : 'サウンドを消音'}
              className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-colors border border-slate-700"
            >
              {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-cyan-400" />}
            </button>

            {/* Pause toggle (in-game) */}
            {gameState === 'playing' && (
              <button
                onClick={() => setGameState('paused')}
                title="一時停止"
                className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-colors border border-slate-700"
              >
                <Pause className="w-4 h-4 text-amber-400" />
              </button>
            )}
            {gameState === 'paused' && (
              <button
                onClick={() => setGameState('playing')}
                title="再開"
                className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-colors border border-slate-700"
              >
                <Play className="w-4 h-4 text-emerald-400" />
              </button>
            )}
          </div>
        </div>

        {/* In-Game HUD: Score, Star Invincible Timer, Lives, Weapon Level */}
        <div className="w-full bg-slate-950/60 px-4 py-2 border-b border-slate-800 flex items-center justify-between text-xs font-['Orbitron'] z-10">
          {/* Score */}
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider">SCORE</span>
            <span className="text-lg font-bold text-cyan-400 leading-none tracking-wider">
              {score.toLocaleString()}
            </span>
          </div>

          {/* Active Star Invincible Badge */}
          {starTimeLeft > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-amber-500/20 via-yellow-500/30 to-amber-500/20 border border-yellow-400/60 rounded-full shadow-[0_0_12px_rgba(250,204,21,0.5)] animate-pulse">
              <Sparkles className="w-3.5 h-3.5 text-yellow-300" />
              <span className="text-[11px] text-yellow-200 font-black tracking-wide">
                ★ 無敵 STAR: {starTimeLeft}s ★
              </span>
            </div>
          )}

          {/* Weapon Power Status (shown if not star invincible or in addition) */}
          {weaponLevel > 1 && starTimeLeft <= 0 && (
            <div className="flex items-center gap-1 px-2.5 py-1 bg-cyan-950/60 border border-cyan-400/40 rounded-full animate-pulse">
              <Zap className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-[11px] text-cyan-300 font-bold">
                LV.{weaponLevel} ({weaponTimeLeft}s)
              </span>
            </div>
          )}

          {/* Player Lives (Shields) */}
          <div className="flex flex-col items-end">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider">SHIELDS</span>
            <div className="flex gap-1 mt-0.5">
              {Array.from({ length: maxHealth }).map((_, i) => (
                <Shield
                  key={i}
                  className={`w-4 h-4 transition-all ${
                    i < health
                      ? 'text-cyan-400 fill-cyan-400/40 filter drop-shadow-[0_0_4px_#38bdf8]'
                      : 'text-slate-700'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Main Canvas Viewport Area */}
        <div className="relative w-full aspect-[480/640] max-h-[640px] bg-black flex items-center justify-center overflow-hidden">
          <canvas
            ref={canvasRef}
            width={GAME_WIDTH}
            height={GAME_HEIGHT}
            className="w-full h-full object-contain cursor-crosshair"
          />

          {/* OVERLAY: START SCREEN */}
          {gameState === 'start' && (
            <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-5 text-center z-20 overflow-y-auto">
              <div className="inline-flex p-2.5 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 mb-2 shadow-[0_0_20px_rgba(6,182,212,0.3)]">
                <Crosshair className="w-10 h-10 text-cyan-400 animate-spin" style={{ animationDuration: '10s' }} />
              </div>
              <h1 className="text-2xl sm:text-3xl font-black font-['Orbitron'] text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-sky-200 to-blue-500 tracking-wider mb-1">
                COSMIC STRIKER
              </h1>
              <p className="text-[11px] text-slate-300 max-w-xs mb-3 leading-relaxed">
                隕石を避けながら敵機を撃破！爽快な爆発エフェクトを楽しもう。
              </p>

              {/* DIFFICULTY SELECTION */}
              <div className="w-full max-w-xs mb-3">
                <div className="text-[11px] font-bold font-mono text-cyan-400 mb-1.5 flex items-center justify-center gap-1">
                  <Gauge className="w-3.5 h-3.5" /> 難易度を選択
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {/* EASY */}
                  <button
                    onClick={() => handleSelectDifficulty('easy')}
                    className={`py-2 px-1 rounded-xl text-center flex flex-col items-center transition-all cursor-pointer border ${
                      difficulty === 'easy'
                        ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                        : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <span className="font-['Orbitron'] font-bold text-xs">EASY</span>
                    <span className="text-[9px] mt-0.5 leading-tight opacity-90">素材大量</span>
                  </button>

                  {/* NORMAL */}
                  <button
                    onClick={() => handleSelectDifficulty('normal')}
                    className={`py-2 px-1 rounded-xl text-center flex flex-col items-center transition-all cursor-pointer border ${
                      difficulty === 'normal'
                        ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.3)]'
                        : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <span className="font-['Orbitron'] font-bold text-xs">NORMAL</span>
                    <span className="text-[9px] mt-0.5 leading-tight opacity-90">標準</span>
                  </button>

                  {/* HARD */}
                  <button
                    onClick={() => handleSelectDifficulty('hard')}
                    className={`py-2 px-1 rounded-xl text-center flex flex-col items-center transition-all cursor-pointer border ${
                      difficulty === 'hard'
                        ? 'bg-rose-500/20 border-rose-400 text-rose-300 shadow-[0_0_12px_rgba(244,63,94,0.3)]'
                        : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <span className="font-['Orbitron'] font-bold text-xs">HARD</span>
                    <span className="text-[9px] mt-0.5 leading-tight opacity-90">敵高耐久</span>
                  </button>
                </div>

                {/* Difficulty explanation snippet */}
                <div className="mt-1.5 text-[10px] text-slate-400 font-mono text-center">
                  {difficulty === 'easy' && '★ EASY: レベルアップ素材が雨のように出現！シールド4枚'}
                  {difficulty === 'normal' && '★ NORMAL: 良好なバランスで手応えのあるシューティング'}
                  {difficulty === 'hard' && '★ HARD: 敵の耐久値が大幅UP！高密度サバイバル'}
                </div>
              </div>

              {/* STAR INVINCIBLE PROMO BANNER */}
              <div className="w-full max-w-xs mb-3 px-2.5 py-1.5 rounded-lg bg-yellow-500/10 border border-yellow-500/30 flex items-center gap-2 text-left">
                <Sparkles className="w-5 h-5 text-yellow-400 shrink-0 animate-bounce" />
                <div className="text-[10px] text-yellow-200 leading-tight">
                  <span className="font-bold text-yellow-300">★ 無敵スター降下中！</span>
                  <br />
                  全難易度で星を取ると一定時間無敵！敵や隕石に体当たりして一網打尽！
                </div>
              </div>

              {highScore > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 font-['Orbitron'] text-xs mb-3">
                  <Award className="w-4 h-4 text-amber-400" />
                  <span>BEST SCORE: {highScore.toLocaleString()}</span>
                </div>
              )}

              {/* Start Button */}
              <button
                onClick={startGame}
                className="w-52 py-2.5 px-6 rounded-xl font-['Orbitron'] font-bold text-sm bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 shadow-lg shadow-cyan-500/40 hover:shadow-cyan-400/60 active:scale-95 transition-all flex items-center justify-center gap-2 mb-3 cursor-pointer"
              >
                <Play className="w-4 h-4 fill-slate-950" />
                GAME START
              </button>

              {/* Controls instructions */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2.5 text-left w-full max-w-xs text-[11px] text-slate-300 font-mono space-y-1">
                <div className="font-bold text-cyan-400 flex items-center gap-1">
                  <Info className="w-3.5 h-3.5" /> 操作方法
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">移動:</span>
                  <span className="text-slate-100 font-semibold">[←][→] / [A][D]</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">攻撃:</span>
                  <span className="text-slate-100 font-semibold">[Space] / 画面のSHOT</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">一時停止:</span>
                  <span className="text-slate-100 font-semibold">[P] / [Esc]</span>
                </div>
              </div>
            </div>
          )}

          {/* OVERLAY: PAUSED */}
          {gameState === 'paused' && (
            <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center z-20">
              <h2 className="text-2xl font-black font-['Orbitron'] text-amber-400 mb-4 tracking-widest">
                PAUSED
              </h2>
              <div className="flex flex-col gap-3 w-48">
                <button
                  onClick={() => setGameState('playing')}
                  className="py-2.5 px-4 rounded-xl font-['Orbitron'] font-bold text-xs bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-slate-950" /> 再開する
                </button>
                <button
                  onClick={startGame}
                  className="py-2.5 px-4 rounded-xl font-['Orbitron'] text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" /> 最初から
                </button>
              </div>
            </div>
          )}

          {/* OVERLAY: GAME OVER */}
          {gameState === 'gameover' && (
            <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center z-20 animate-fade-in">
              <span className="text-xs font-mono text-rose-400 font-bold tracking-widest mb-1">
                SYSTEM FAILURE
              </span>
              <h2 className="text-3xl font-black font-['Orbitron'] text-rose-500 tracking-wider mb-4">
                GAME OVER
              </h2>

              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 w-full max-w-xs text-left mb-4 space-y-2">
                <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                  <span className="text-xs text-slate-400 font-mono">最終スコア:</span>
                  <span className="text-lg font-bold font-['Orbitron'] text-cyan-400">
                    {lastStats.score.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">難易度:</span>
                  <span className="text-cyan-300 font-mono font-bold uppercase">{lastStats.difficulty}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">獲得スター(無敵):</span>
                  <span className="text-yellow-300 font-mono font-bold">★ {lastStats.starsCollected} 回</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">撃破した敵機:</span>
                  <span className="text-slate-200 font-mono font-bold">{lastStats.enemiesDefeated} 機</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">破壊した隕石:</span>
                  <span className="text-slate-200 font-mono font-bold">{lastStats.asteroidsDestroyed} 個</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">最大コンボ:</span>
                  <span className="text-amber-400 font-mono font-bold">{lastStats.maxCombo} Combo</span>
                </div>
                {lastStats.score >= highScore && lastStats.score > 0 && (
                  <div className="pt-2 text-center text-xs font-bold text-amber-300 bg-amber-500/10 rounded py-1 border border-amber-500/20">
                    ★ NEW HIGH SCORE! ★
                  </div>
                )}
              </div>

              {/* Difficulty switch for next round */}
              <div className="flex items-center gap-2 mb-4">
                {(['easy', 'normal', 'hard'] as Difficulty[]).map((d) => (
                  <button
                    key={d}
                    onClick={() => handleSelectDifficulty(d)}
                    className={`px-3 py-1 rounded-lg text-xs font-mono font-bold uppercase border transition-all cursor-pointer ${
                      difficulty === d
                        ? 'bg-cyan-500 text-slate-950 border-cyan-400 shadow-sm shadow-cyan-400/50'
                        : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>

              <button
                onClick={startGame}
                className="w-52 py-3 px-6 rounded-xl font-['Orbitron'] font-bold text-sm bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 shadow-lg shadow-cyan-500/40 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" /> もう一度プレイ
              </button>
            </div>
          )}
        </div>

        {/* BOTTOM CONTROLS FOR TOUCH / MOBILE / EASY ACCESS */}
        <div className="w-full bg-slate-950 px-4 py-3 border-t border-cyan-500/20 flex items-center justify-between gap-3 z-10">
          {/* Left/Right Directional Buttons */}
          <div className="flex items-center gap-2">
            <button
              onMouseDown={() => (leftPressedRef.current = true)}
              onMouseUp={() => (leftPressedRef.current = false)}
              onMouseLeave={() => (leftPressedRef.current = false)}
              onTouchStart={(e) => {
                e.preventDefault();
                leftPressedRef.current = true;
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                leftPressedRef.current = false;
              }}
              className="w-14 h-12 rounded-xl bg-slate-800 hover:bg-slate-700 active:bg-cyan-600/30 border border-slate-700 active:border-cyan-400 text-cyan-400 flex items-center justify-center transition-all select-none shadow-md cursor-pointer"
              aria-label="左に移動"
            >
              <ChevronLeft className="w-7 h-7" />
            </button>

            <button
              onMouseDown={() => (rightPressedRef.current = true)}
              onMouseUp={() => (rightPressedRef.current = false)}
              onMouseLeave={() => (rightPressedRef.current = false)}
              onTouchStart={(e) => {
                e.preventDefault();
                rightPressedRef.current = true;
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                rightPressedRef.current = false;
              }}
              className="w-14 h-12 rounded-xl bg-slate-800 hover:bg-slate-700 active:bg-cyan-600/30 border border-slate-700 active:border-cyan-400 text-cyan-400 flex items-center justify-center transition-all select-none shadow-md cursor-pointer"
              aria-label="右に移動"
            >
              <ChevronRight className="w-7 h-7" />
            </button>
          </div>

          {/* Highscore ticker in center */}
          <div className="hidden sm:flex flex-col items-center font-['Orbitron']">
            <span className="text-[9px] text-slate-500">HIGH SCORE</span>
            <span className="text-xs font-bold text-slate-300">{highScore.toLocaleString()}</span>
          </div>

          {/* Fire Weapon Button */}
          <button
            onMouseDown={() => (firePressedRef.current = true)}
            onMouseUp={() => (firePressedRef.current = false)}
            onMouseLeave={() => (firePressedRef.current = false)}
            onTouchStart={(e) => {
              e.preventDefault();
              firePressedRef.current = true;
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              firePressedRef.current = false;
            }}
            className="flex-1 max-w-[150px] h-12 rounded-xl bg-gradient-to-r from-rose-600 to-red-500 hover:from-rose-500 hover:to-red-400 active:scale-95 text-white font-['Orbitron'] font-bold text-xs tracking-wider flex items-center justify-center gap-1.5 shadow-lg shadow-rose-600/30 transition-all select-none cursor-pointer"
            aria-label="ショット発射"
          >
            <Flame className="w-4 h-4 fill-white" />
            <span>SHOT</span>
          </button>
        </div>

      </div>

      {/* Helpful keyboard hint under cabinet */}
      <div className="mt-2 text-center text-xs text-slate-500 font-mono hidden sm:block">
        キーボード: [←][→] 移動 / [スペース] 弾を撃つ / [P] 一時停止 / ★スターで無敵体当たり！
      </div>
    </div>
  );
};
