export type Difficulty = 'easy' | 'normal' | 'hard';

export interface Player {
  x: number;
  y: number;
  width: number;
  height: number;
  speed: number;
  health: number;
  maxHealth: number;
  invulnerableTime: number; // in seconds
  weaponLevel: number; // 1: single, 2: double, 3: triple, 4: quad
  weaponTimer: number; // time left on powerup
  starTimer: number; // time left on star invincibility
  tilt: number; // -1 to 1 for visual banking effect
}

export interface Bullet {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  isEnemy: boolean;
  damage: number;
}

export type ObstacleType = 'asteroid-small' | 'asteroid-medium' | 'asteroid-large';

export interface Obstacle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hp: number;
  maxHp: number;
  rotation: number;
  rotationSpeed: number;
  vertices: { x: number; y: number }[]; // polygonal jagged rock shape
  color: string;
  cracksColor: string;
}

export type EnemyType = 'drone' | 'scout' | 'heavy';

export interface Enemy {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  hp: number;
  maxHp: number;
  type: EnemyType;
  shootCooldown: number;
  points: number;
  color: string;
  glowColor: string;
  phase: number;
}

export interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
  shape: 'circle' | 'spark' | 'ring' | 'debris';
}

export interface FloatingText {
  id: number;
  x: number;
  y: number;
  text: string;
  color: string;
  alpha: number;
  life: number;
  vy: number;
}

export type PowerUpType = 'multishot' | 'shield' | 'bomb' | 'speed' | 'star';

export interface PowerUp {
  id: number;
  x: number;
  y: number;
  vy: number;
  type: PowerUpType;
  radius: number;
  duration: number; // in seconds
}

export interface Star {
  x: number;
  y: number;
  size: number;
  speed: number;
  alpha: number;
  twinkleSpeed: number;
}

export interface GameStats {
  score: number;
  highScore: number;
  difficulty: Difficulty;
  wave: number;
  enemiesDefeated: number;
  asteroidsDestroyed: number;
  starsCollected: number;
  shotsFired: number;
  shotsHit: number;
  combo: number;
  maxCombo: number;
}
