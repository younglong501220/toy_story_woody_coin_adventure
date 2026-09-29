/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Volume2, VolumeX, Pause, Play, RotateCcw, Trophy, Sparkles, Heart, HelpCircle, ArrowLeft, ArrowRight } from 'lucide-react';
import { sounds } from './utils/audio';

interface Cloud {
  x: number;
  y: number;
  scale: number;
  speed: number;
}

interface Item {
  x: number;
  y: number;
  radius: number;
  type: 'coin' | 'alien' | 'buzz' | 'bomb' | 'heart';
  points: number;
  isHazard: boolean;
  speed: number;
  rotation: number;
  rotSpeed: number;
}

interface FloatingText {
  id: number;
  text: string;
  x: number;
  y: number;
  color: string;
  opacity: number;
  life: number;
  scale: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  radius: number;
  life: number;
  maxLife: number;
}

interface GameStats {
  coinsCaught: number;
  aliensRescued: number;
  buzzHelmets: number;
  maxCombo: number;
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  
  // Game states
  const [gameState, setGameState] = useState<'START' | 'PLAYING' | 'PAUSED' | 'GAMEOVER'>('START');
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [combo, setCombo] = useState(0);
  const [highScore, setHighScore] = useState<number>(() => {
    const saved = localStorage.getItem('toystory_best_score');
    return saved ? parseInt(saved, 10) : 0;
  });
  const [isMuted, setIsMuted] = useState(false);
  const [showHowTo, setShowHowTo] = useState(false);
  const [stats, setStats] = useState<GameStats>({
    coinsCaught: 0,
    aliensRescued: 0,
    buzzHelmets: 0,
    maxCombo: 0,
  });

  // Mutable refs for high-frequency game loop
  const gameLoopRef = useRef<number | null>(null);
  const scoreRef = useRef(0);
  const livesRef = useRef(3);
  const comboRef = useRef(0);
  const maxComboRef = useRef(0);
  const isPlayingRef = useRef(false);
  const isPausedRef = useRef(false);
  const statsRef = useRef<GameStats>({
    coinsCaught: 0,
    aliensRescued: 0,
    buzzHelmets: 0,
    maxCombo: 0,
  });

  // Player state
  const hatRef = useRef({
    x: 240,
    y: 685,
    width: 110,
    height: 52,
    speed: 9,
    targetX: 240,
    tilt: 0, // dynamic tilt angle in radians
  });

  const keysRef = useRef<{ left: boolean; right: boolean }>({ left: false, right: false });
  const itemsRef = useRef<Item[]>([]);
  const floatingTextsRef = useRef<FloatingText[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const spawnTimerRef = useRef(0);
  const baseDropSpeedRef = useRef(3.5);
  const shakeTimerRef = useRef(0);
  const cloudsRef = useRef<Cloud[]>([
    { x: 45, y: 70, scale: 1.15, speed: 0.15 },
    { x: 290, y: 120, scale: 0.9, speed: 0.2 },
    { x: 110, y: 250, scale: 1.25, speed: 0.12 },
    { x: 350, y: 340, scale: 1.0, speed: 0.18 },
    { x: 50, y: 470, scale: 1.1, speed: 0.14 },
    { x: 310, y: 560, scale: 0.95, speed: 0.22 },
  ]);

  // Audio mute toggle
  const toggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    sounds.setEnabled(!nextMuted);
  };

  // Particles generator
  const addParticles = (x: number, y: number, color: string, count = 8, speedScale = 1) => {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (Math.random() * 3.5 + 1.5) * speedScale;
      particlesRef.current.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color,
        radius: Math.random() * 3.5 + 2,
        life: 25 + Math.random() * 15,
        maxLife: 40,
      });
    }
  };

  // Floating text generator
  const addFloatingText = (text: string, x: number, y: number, color: string, scale = 1) => {
    floatingTextsRef.current.push({
      id: Date.now() + Math.random(),
      text,
      x,
      y,
      color,
      opacity: 1,
      life: 45,
      scale,
    });
  };

  // Spawn falling item
  const spawnItem = () => {
    const rand = Math.random() * 100;
    let type: 'coin' | 'alien' | 'buzz' | 'bomb' | 'heart' = 'coin';
    let radius = 18;
    let points = 10;
    let isHazard = false;

    // Rare heart chance if injured
    if (livesRef.current < 3 && Math.random() < 0.05) {
      type = 'heart';
      radius = 16;
      points = 0;
    } else if (rand < 58) {
      // 58% Coins
      type = 'coin';
      radius = 18;
      points = 10;
    } else if (rand < 72) {
      // 14% Alien
      type = 'alien';
      radius = 23;
      points = 50;
    } else if (rand < 84) {
      // 12% Buzz Helmet
      type = 'buzz';
      radius = 23;
      points = 50;
    } else {
      // 16% Sid Bomb
      type = 'bomb';
      radius = 20;
      points = 0;
      isHazard = true;
    }

    itemsRef.current.push({
      x: Math.random() * (480 - 90) + 45,
      y: -35,
      radius,
      type,
      points,
      isHazard,
      speed: baseDropSpeedRef.current + Math.random() * 1.6,
      rotation: Math.random() * Math.PI,
      rotSpeed: (Math.random() - 0.5) * 0.06,
    });
  };

  // Drawing helpers
  const drawCloud = (ctx: CanvasRenderingContext2D, x: number, y: number, scale = 1) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = '#ffffff';

    ctx.beginPath();
    ctx.arc(0, 0, 22, 0, Math.PI * 2);
    ctx.arc(22, -10, 26, 0, Math.PI * 2);
    ctx.arc(48, 0, 22, 0, Math.PI * 2);
    ctx.arc(14, 12, 20, 0, Math.PI * 2);
    ctx.arc(36, 12, 18, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  };

  const drawCowboyHat = (ctx: CanvasRenderingContext2D, x: number, y: number, tilt: number) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);

    // Drop shadow under the hat
    ctx.beginPath();
    ctx.ellipse(0, 16, 56, 12, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
    ctx.fill();

    // Brim bottom outline & depth
    ctx.beginPath();
    ctx.ellipse(0, 10, 54, 14, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#5c2400';
    ctx.fill();

    // Brim main upper leather
    ctx.beginPath();
    ctx.ellipse(0, 8, 52, 12, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#8d4914';
    ctx.fill();

    // Brim edge curved specular highlight
    ctx.beginPath();
    ctx.ellipse(0, 6, 48, 9, 0, 0, Math.PI);
    ctx.strokeStyle = '#b86b24';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Woody's hat crown (with cowboy crease on top)
    ctx.beginPath();
    ctx.moveTo(-25, 7);
    ctx.quadraticCurveTo(-30, -26, -19, -34);
    ctx.quadraticCurveTo(0, -24, 19, -34);
    ctx.quadraticCurveTo(30, -26, 25, 7);
    ctx.closePath();
    ctx.fillStyle = '#9b5118';
    ctx.fill();
    ctx.strokeStyle = '#5c2400';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Crown shading left
    ctx.beginPath();
    ctx.moveTo(-25, 7);
    ctx.quadraticCurveTo(-30, -26, -19, -34);
    ctx.quadraticCurveTo(-10, -28, -6, 7);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
    ctx.fill();

    // Dark brown stitched leather band
    ctx.beginPath();
    ctx.moveTo(-25, 3);
    ctx.quadraticCurveTo(0, 8, 25, 3);
    ctx.lineWidth = 7;
    ctx.strokeStyle = '#3d1c04';
    ctx.stroke();

    // Cross-stitches on hat band
    ctx.strokeStyle = '#d4ac0d';
    ctx.lineWidth = 1.5;
    [-18, -10, 10, 18].forEach(sx => {
      ctx.beginPath();
      ctx.moveTo(sx - 2, 2);
      ctx.lineTo(sx + 2, 7);
      ctx.moveTo(sx + 2, 2);
      ctx.lineTo(sx - 2, 7);
      ctx.stroke();
    });

    // Gold Sheriff Star Badge on the hat band
    const starX = 0;
    const starY = 5;
    ctx.save();
    ctx.translate(starX, starY);
    ctx.fillStyle = '#f1c40f';
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const outerR = 6;
      const innerR = 2.8;
      const outerAngle = (i * 72 - 90) * (Math.PI / 180);
      const innerAngle = (i * 72 + 36 - 90) * (Math.PI / 180);
      if (i === 0) ctx.moveTo(Math.cos(outerAngle) * outerR, Math.sin(outerAngle) * outerR);
      else ctx.lineTo(Math.cos(outerAngle) * outerR, Math.sin(outerAngle) * outerR);
      ctx.lineTo(Math.cos(innerAngle) * innerR, Math.sin(innerAngle) * innerR);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#b7950b';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    ctx.restore();
  };

  const drawCoin = (ctx: CanvasRenderingContext2D, item: Item) => {
    ctx.save();
    ctx.translate(item.x, item.y);
    const squish = Math.cos(item.rotation * 3.5);

    ctx.scale(squish, 1);
    ctx.beginPath();
    ctx.arc(0, 0, item.radius, 0, Math.PI * 2);
    ctx.fillStyle = '#f39c12';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#b7791f';
    ctx.stroke();

    // Inner gold rim
    ctx.beginPath();
    ctx.arc(0, 0, item.radius * 0.72, 0, Math.PI * 2);
    ctx.fillStyle = '#f1c40f';
    ctx.fill();

    // Star icon inside
    ctx.fillStyle = '#b7791f';
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('★', 0, 1);

    ctx.restore();
  };

  const drawAlien = (ctx: CanvasRenderingContext2D, item: Item) => {
    ctx.save();
    ctx.translate(item.x, item.y);
    ctx.rotate(Math.sin(item.rotation * 2) * 0.1);

    // Antenna stalk
    ctx.strokeStyle = '#1e8449';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(0, -22);
    ctx.stroke();

    // Antenna ball
    ctx.beginPath();
    ctx.arc(0, -23, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = '#2ecc71';
    ctx.fill();
    ctx.strokeStyle = '#1e8449';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Alien ears
    ctx.fillStyle = '#27ae60';
    // Left ear
    ctx.beginPath();
    ctx.moveTo(-18, -4);
    ctx.lineTo(-27, -12);
    ctx.lineTo(-20, 2);
    ctx.closePath();
    ctx.fill();
    // Right ear
    ctx.beginPath();
    ctx.moveTo(18, -4);
    ctx.lineTo(27, -12);
    ctx.lineTo(20, 2);
    ctx.closePath();
    ctx.fill();

    // Head oval
    ctx.beginPath();
    ctx.ellipse(0, 0, 23, 15, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#2ecc71';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#1e8449';
    ctx.stroke();

    // Blue collar/suit
    ctx.beginPath();
    ctx.ellipse(0, 14, 14, 6, 0, 0, Math.PI);
    ctx.fillStyle = '#2980b9';
    ctx.fill();

    // Planet Pizza logo on suit
    ctx.beginPath();
    ctx.arc(4, 15, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = '#e74c3c';
    ctx.fill();

    // 3 Big round eyes
    [-11, 0, 11].forEach(eyeX => {
      ctx.beginPath();
      ctx.arc(eyeX, -3, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = '#1e8449';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Pupil
      ctx.beginPath();
      ctx.arc(eyeX, -3, 2, 0, Math.PI * 2);
      ctx.fillStyle = '#111111';
      ctx.fill();
    });

    // Happy alien smile
    ctx.beginPath();
    ctx.arc(0, 4, 6.5, 0.2, Math.PI - 0.2);
    ctx.strokeStyle = '#196f3d';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();
  };

  const drawBuzz = (ctx: CanvasRenderingContext2D, item: Item) => {
    ctx.save();
    ctx.translate(item.x, item.y);
    ctx.rotate(Math.sin(item.rotation * 2) * 0.1);

    // Purple cowl/head hood
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.fillStyle = '#8e44ad';
    ctx.fill();

    // Buzz face
    ctx.beginPath();
    ctx.arc(0, 3, 11, 0, Math.PI * 2);
    ctx.fillStyle = '#fcd3a1';
    ctx.fill();

    // Buzz eyebrows & eyes
    ctx.fillStyle = '#2c3e50';
    ctx.fillRect(-6, 0, 3.5, 2);
    ctx.fillRect(2.5, 0, 3.5, 2);

    // Chin swirl
    ctx.strokeStyle = '#c0392b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 9, 2.5, 0, Math.PI);
    ctx.stroke();

    // Neon Green space armor collar
    ctx.beginPath();
    ctx.rect(-15, 14, 30, 8);
    ctx.fillStyle = '#2ecc71';
    ctx.fill();
    ctx.strokeStyle = '#27ae60';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Armor buttons (Red laser button + Blue action button)
    ctx.beginPath();
    ctx.arc(-8, 18, 2, 0, Math.PI * 2);
    ctx.fillStyle = '#e74c3c';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(8, 18, 2, 0, Math.PI * 2);
    ctx.fillStyle = '#3498db';
    ctx.fill();

    // Clear Helmet Bubble Glass & Specular Glow
    ctx.beginPath();
    ctx.arc(0, 0, 21, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 2.5;
    ctx.fillStyle = 'rgba(174, 214, 241, 0.35)';
    ctx.fill();
    ctx.stroke();

    // Glass reflection glare curve
    ctx.beginPath();
    ctx.arc(0, 0, 17, -Math.PI * 0.75, -Math.PI * 0.25);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.restore();
  };

  const drawBomb = (ctx: CanvasRenderingContext2D, item: Item) => {
    ctx.save();
    ctx.translate(item.x, item.y);
    ctx.rotate(item.rotation * 0.5);

    // Curved rope fuse
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.quadraticCurveTo(8, -22, 14, -19);
    ctx.strokeStyle = '#d35400';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Animated burning sparks at fuse tip
    const sparkRadius = 4 + Math.random() * 2;
    ctx.beginPath();
    ctx.arc(15, -20, sparkRadius, 0, Math.PI * 2);
    ctx.fillStyle = Math.random() > 0.5 ? '#f39c12' : '#e74c3c';
    ctx.fill();

    // Bomb heavy iron sphere
    ctx.beginPath();
    ctx.arc(0, 2, item.radius, 0, Math.PI * 2);
    ctx.fillStyle = '#2c3e50';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#17202a';
    ctx.stroke();

    // Glossy light highlight
    ctx.beginPath();
    ctx.arc(-6, -4, 5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.fill();

    // Sid's Skull Crossbones / Warning decal
    ctx.strokeStyle = '#e74c3c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-6, -2);
    ctx.lineTo(6, 8);
    ctx.moveTo(6, -2);
    ctx.lineTo(-6, 8);
    ctx.stroke();

    ctx.restore();
  };

  const drawHeartItem = (ctx: CanvasRenderingContext2D, item: Item) => {
    ctx.save();
    ctx.translate(item.x, item.y);
    const pulse = 1 + Math.sin(item.rotation * 5) * 0.15;
    ctx.scale(pulse, pulse);

    // Heart shape
    ctx.fillStyle = '#e74c3c';
    ctx.beginPath();
    ctx.moveTo(0, 5);
    ctx.bezierCurveTo(-12, -8, -16, -18, 0, -22);
    ctx.bezierCurveTo(16, -18, 12, -8, 0, 5);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Star sparkle in heart
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(-3, -12, 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  };

  // Main game physics update
  const updateGame = () => {
    // Left / Right keyboard movement
    if (keysRef.current.left) {
      hatRef.current.x -= hatRef.current.speed;
      hatRef.current.targetX = hatRef.current.x;
      hatRef.current.tilt = Math.max(-0.25, hatRef.current.tilt - 0.05);
    } else if (keysRef.current.right) {
      hatRef.current.x += hatRef.current.speed;
      hatRef.current.targetX = hatRef.current.x;
      hatRef.current.tilt = Math.min(0.25, hatRef.current.tilt + 0.05);
    } else {
      // Natural return to level
      hatRef.current.tilt *= 0.8;
    }

    // Smooth lerp to mouse / touch targetX
    const deltaX = hatRef.current.targetX - hatRef.current.x;
    hatRef.current.x += deltaX * 0.28;
    if (Math.abs(deltaX) > 2) {
      hatRef.current.tilt = Math.max(-0.25, Math.min(0.25, deltaX * 0.015));
    }

    // Boundary check
    const halfW = hatRef.current.width / 2;
    if (hatRef.current.x < halfW) hatRef.current.x = halfW;
    if (hatRef.current.x > 480 - halfW) hatRef.current.x = 480 - halfW;

    // Drifting background clouds
    cloudsRef.current.forEach(cloud => {
      cloud.x += cloud.speed;
      if (cloud.x > 480 + 60) {
        cloud.x = -80;
      }
    });

    // Spawn falling items
    spawnTimerRef.current++;
    // Interval scales down with score (starts around 55 frames, floors at 24 frames)
    const currentInterval = Math.max(24, Math.floor(55 - (scoreRef.current / 80) * 3));
    if (spawnTimerRef.current >= currentInterval) {
      spawnItem();
      spawnTimerRef.current = 0;
    }

    // Update items & collision detection
    for (let i = itemsRef.current.length - 1; i >= 0; i--) {
      const item = itemsRef.current[i];
      item.y += item.speed;
      item.rotation += item.rotSpeed;

      // Hat bounding area
      const hitX = Math.abs(item.x - hatRef.current.x) < (hatRef.current.width / 2 + item.radius * 0.5);
      const hitY = item.y + item.radius >= hatRef.current.y - 18 && item.y - item.radius <= hatRef.current.y + 16;

      if (hitX && hitY) {
        if (item.isHazard) {
          // Hit Sid's Bomb
          sounds.playBomb();
          shakeTimerRef.current = 18;
          livesRef.current -= 1;
          setLives(livesRef.current);
          comboRef.current = 0;
          setCombo(0);

          addParticles(item.x, item.y, '#e74c3c', 16, 1.4);
          addParticles(item.x, item.y, '#f39c12', 12, 1.2);
          addFloatingText('OUCH! -1❤️', hatRef.current.x, hatRef.current.y - 35, '#c0392b', 1.2);

          if (livesRef.current <= 0) {
            handleGameOver();
            return;
          }
        } else if (item.type === 'heart') {
          // Rare Heart Recovery
          sounds.playHeal();
          livesRef.current = Math.min(3, livesRef.current + 1);
          setLives(livesRef.current);
          addParticles(item.x, item.y, '#e74c3c', 14);
          addFloatingText('+1 ❤️ RESTORED!', item.x, item.y - 20, '#e74c3c', 1.2);
        } else {
          // Collected Treasure
          comboRef.current += 1;
          setCombo(comboRef.current);
          if (comboRef.current > maxComboRef.current) {
            maxComboRef.current = comboRef.current;
            statsRef.current.maxCombo = comboRef.current;
          }

          // Combo Multiplier: 1-2: 1x, 3-5: 2x, 6-9: 3x, 10+: 5x
          let multiplier = 1;
          if (comboRef.current >= 10) multiplier = 5;
          else if (comboRef.current >= 6) multiplier = 3;
          else if (comboRef.current >= 3) multiplier = 2;

          const earnedPoints = item.points * multiplier;
          scoreRef.current += earnedPoints;
          setScore(scoreRef.current);

          // Track stats & play corresponding sound
          if (item.type === 'coin') {
            sounds.playCoin();
            statsRef.current.coinsCaught += 1;
            addParticles(item.x, item.y, '#f1c40f', 9);
          } else if (item.type === 'alien') {
            sounds.playAlien();
            statsRef.current.aliensRescued += 1;
            addParticles(item.x, item.y, '#2ecc71', 14);
          } else if (item.type === 'buzz') {
            sounds.playBuzz();
            statsRef.current.buzzHelmets += 1;
            addParticles(item.x, item.y, '#9b59b6', 14);
          }

          // Special combo milestone celebration
          if (comboRef.current === 5 || comboRef.current === 10 || (comboRef.current > 10 && comboRef.current % 5 === 0)) {
            sounds.playCombo();
            addFloatingText(`YEE-HAW! x${multiplier}`, hatRef.current.x, hatRef.current.y - 55, '#f39c12', 1.3);
          }

          const label = multiplier > 1 ? `+${earnedPoints} (x${multiplier})` : `+${earnedPoints}`;
          const labelColor = item.type === 'coin' ? '#d35400' : item.type === 'alien' ? '#27ae60' : '#8e44ad';
          addFloatingText(label, item.x, item.y - 15, labelColor, multiplier > 1 ? 1.15 : 1);

          // Gradual drop speed scaling
          baseDropSpeedRef.current = 3.5 + Math.min(scoreRef.current / 300, 4.5);
        }

        itemsRef.current.splice(i, 1);
        continue;
      }

      // Fallen past screen bottom
      if (item.y > 750 + 40) {
        if (!item.isHazard && item.type !== 'heart') {
          // Missed a treasure item breaks combo
          if (comboRef.current > 0) {
            comboRef.current = 0;
            setCombo(0);
          }
        }
        itemsRef.current.splice(i, 1);
      }
    }

    // Update floating texts
    for (let i = floatingTextsRef.current.length - 1; i >= 0; i--) {
      const ft = floatingTextsRef.current[i];
      ft.y -= 1.6;
      ft.opacity -= 1 / ft.life;
      if (ft.opacity <= 0) {
        floatingTextsRef.current.splice(i, 1);
      }
    }

    // Update particles
    for (let i = particlesRef.current.length - 1; i >= 0; i--) {
      const p = particlesRef.current[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.08; // gravity
      p.life -= 1;
      if (p.life <= 0) {
        particlesRef.current.splice(i, 1);
      }
    }
  };

  // Main Canvas Render
  const renderGame = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();

    // Screen Shake effect on bomb hit
    if (shakeTimerRef.current > 0) {
      const dx = (Math.random() - 0.5) * 14;
      const dy = (Math.random() - 0.5) * 14;
      ctx.translate(dx, dy);
      shakeTimerRef.current--;
    }

    // 1. Andy's Room Blue Sky Wall
    const skyGrad = ctx.createLinearGradient(0, 0, 0, 750);
    skyGrad.addColorStop(0, '#54a0ff');
    skyGrad.addColorStop(0.85, '#5dade2');
    skyGrad.addColorStop(1, '#48c9b0');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, 480, 750);

    // 2. Iconic Toy Story Clouds
    cloudsRef.current.forEach(c => drawCloud(ctx, c.x, c.y, c.scale));

    // 3. Andy's Room Wooden Floor & Baseboard at bottom
    ctx.fillStyle = '#b9770e';
    ctx.fillRect(0, 715, 480, 35);
    // Baseboard trim line
    ctx.fillStyle = '#7e5109';
    ctx.fillRect(0, 712, 480, 4);

    // Subtle Wood planks lines
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.12)';
    ctx.lineWidth = 1.5;
    for (let x = 60; x < 480; x += 90) {
      ctx.beginPath();
      ctx.moveTo(x, 716);
      ctx.lineTo(x, 750);
      ctx.stroke();
    }

    // Andy's iconic signature handwritten with backwards 'N' ("A И D Y")
    ctx.save();
    ctx.font = '900 16px "Fredoka", sans-serif';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.textAlign = 'right';
    ctx.fillText('A И D Y', 465, 737);
    ctx.restore();

    // 4. Render Falling Items
    itemsRef.current.forEach(item => {
      if (item.type === 'coin') drawCoin(ctx, item);
      else if (item.type === 'alien') drawAlien(ctx, item);
      else if (item.type === 'buzz') drawBuzz(ctx, item);
      else if (item.type === 'bomb') drawBomb(ctx, item);
      else if (item.type === 'heart') drawHeartItem(ctx, item);
    });

    // 5. Render Woody's Cowboy Hat (Player)
    drawCowboyHat(ctx, hatRef.current.x, hatRef.current.y, hatRef.current.tilt);

    // 6. Render Particles
    particlesRef.current.forEach(p => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // 7. Render Floating Feedback Texts
    floatingTextsRef.current.forEach(ft => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, ft.opacity);
      ctx.fillStyle = ft.color;
      ctx.font = `900 ${Math.floor(21 * ft.scale)}px "Fredoka", "Noto Sans TC", sans-serif`;
      ctx.textAlign = 'center';
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 8;
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    });

    ctx.restore();
  };

  // Main Loop
  const loop = useCallback(() => {
    if (!isPlayingRef.current) return;
    if (!isPausedRef.current) {
      updateGame();
      renderGame();
    }
    gameLoopRef.current = requestAnimationFrame(loop);
  }, []);

  // Start / Restart game
  const startGame = () => {
    scoreRef.current = 0;
    livesRef.current = 3;
    comboRef.current = 0;
    maxComboRef.current = 0;
    baseDropSpeedRef.current = 3.5;
    spawnTimerRef.current = 0;
    itemsRef.current = [];
    floatingTextsRef.current = [];
    particlesRef.current = [];
    statsRef.current = {
      coinsCaught: 0,
      aliensRescued: 0,
      buzzHelmets: 0,
      maxCombo: 0,
    };

    setScore(0);
    setLives(3);
    setCombo(0);
    setStats({ ...statsRef.current });

    hatRef.current.x = 240;
    hatRef.current.targetX = 240;
    hatRef.current.tilt = 0;

    isPlayingRef.current = true;
    isPausedRef.current = false;
    setGameState('PLAYING');

    if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
    gameLoopRef.current = requestAnimationFrame(loop);
  };

  // Pause / Resume
  const togglePause = () => {
    if (gameState === 'PLAYING') {
      isPausedRef.current = true;
      setGameState('PAUSED');
    } else if (gameState === 'PAUSED') {
      isPausedRef.current = false;
      setGameState('PLAYING');
    }
  };

  // Game Over
  const handleGameOver = () => {
    isPlayingRef.current = false;
    sounds.playGameOver();
    setGameState('GAMEOVER');

    if (scoreRef.current > highScore) {
      setHighScore(scoreRef.current);
      localStorage.setItem('toystory_best_score', scoreRef.current.toString());
    }

    setStats({ ...statsRef.current });
  };

  // Mouse & Touch coordinate helper
  const updateTargetX = (clientX: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = 480 / rect.width;
    const canvasX = (clientX - rect.left) * scaleX;
    const halfW = hatRef.current.width / 2;
    hatRef.current.targetX = Math.max(halfW, Math.min(480 - halfW, canvasX));
  };

  // Keyboard controls listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        keysRef.current.left = true;
      }
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        keysRef.current.right = true;
      }
      if (e.key === ' ' || e.key === 'Escape') {
        if (isPlayingRef.current) {
          togglePause();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        keysRef.current.left = false;
      }
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        keysRef.current.right = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [gameState]);

  // Initial canvas render on mount
  useEffect(() => {
    renderGame();
    return () => {
      if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
    };
  }, []);

  return (
    <div className="relative w-screen h-screen flex flex-col items-center justify-center bg-slate-950 p-2 sm:p-4 overflow-hidden">
      {/* Background Andy Room Wallpaper Ambience */}
      <div 
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(#48dbfb 1.5px, transparent 1.5px), radial-gradient(#48dbfb 1.5px, #0b132b 1.5px)`,
          backgroundSize: '40px 40px',
          backgroundPosition: '0 0, 20px 20px',
        }}
      />

      {/* Main Arcade Frame Container */}
      <div className="relative w-full max-w-[480px] h-[96vh] max-h-[820px] flex flex-col rounded-3xl overflow-hidden shadow-2xl border-4 border-amber-600 bg-sky-400 select-none">
        
        {/* Top Header HUD Bar */}
        <header className="relative z-20 flex items-center justify-between px-3 py-2 bg-amber-500/95 border-b-4 border-amber-700 shadow-md backdrop-blur-sm">
          {/* Score & Combo */}
          <div className="flex items-center gap-2">
            <div className="bg-white/90 border-2 border-amber-700 px-3 py-1 rounded-xl shadow-inner">
              <span className="text-xs text-amber-900 font-bold block leading-none">分數</span>
              <span className="text-xl font-black text-amber-900 tracking-tight tabular-nums">{score}</span>
            </div>

            {combo >= 2 && (
              <div className="flex items-center gap-1 bg-red-500 text-white text-xs font-black px-2 py-1 rounded-xl shadow animate-bounce">
                <Sparkles className="w-3.5 h-3.5 text-yellow-300" />
                <span>COMBO x{combo >= 10 ? 5 : combo >= 6 ? 3 : combo >= 3 ? 2 : 1}</span>
              </div>
            )}
          </div>

          {/* Lives and Quick Actions */}
          <div className="flex items-center gap-2">
            {/* Lives Heart Icons */}
            <div className="flex items-center gap-1 bg-white/90 border-2 border-amber-700 px-2.5 py-1.5 rounded-xl shadow-inner">
              {[0, 1, 2].map(idx => (
                <Heart
                  key={idx}
                  className={`w-5 h-5 transition-transform duration-200 ${
                    idx < lives
                      ? 'fill-red-500 text-red-600 scale-100'
                      : 'fill-slate-300 text-slate-400 scale-90'
                  }`}
                />
              ))}
            </div>

            {/* Mute Button */}
            <button
              onClick={toggleMute}
              className="p-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white border-2 border-amber-800 shadow transition-colors"
              title={isMuted ? '開啟音效' : '靜音'}
              aria-label={isMuted ? '開啟音效' : '靜音'}
            >
              {isMuted ? <VolumeX className="w-4 h-4 text-red-200" /> : <Volume2 className="w-4 h-4" />}
            </button>

            {/* Pause / Info Button */}
            {gameState === 'PLAYING' && (
              <button
                onClick={togglePause}
                className="p-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white border-2 border-amber-800 shadow transition-colors"
                title="暫停遊戲 (Space)"
                aria-label="暫停遊戲"
              >
                <Pause className="w-4 h-4" />
              </button>
            )}
          </div>
        </header>

        {/* Central Canvas Zone */}
        <div className="relative flex-1 w-full h-full overflow-hidden bg-sky-400">
          <canvas
            ref={canvasRef}
            width={480}
            height={750}
            className="w-full h-full object-contain cursor-grab active:cursor-grabbing block"
            onMouseMove={e => {
              if (gameState === 'PLAYING') updateTargetX(e.clientX);
            }}
            onTouchStart={e => {
              if (gameState === 'PLAYING' && e.touches[0]) updateTargetX(e.touches[0].clientX);
            }}
            onTouchMove={e => {
              if (gameState === 'PLAYING' && e.touches[0]) updateTargetX(e.touches[0].clientX);
            }}
          />

          {/* Start Menu Overlay */}
          {gameState === 'START' && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
              <div className="w-full max-w-sm bg-amber-50 border-4 border-amber-600 rounded-3xl p-6 text-center shadow-2xl animate-in fade-in zoom-in duration-200">
                {/* Sheriff Badge Icon & Title */}
                <div className="inline-flex p-3 rounded-full bg-amber-100 border-2 border-amber-500 mb-2">
                  <span className="text-4xl">🤠</span>
                </div>
                <h1 className="text-2xl font-black text-amber-950 mb-1 tracking-tight">
                  玩具總動員
                </h1>
                <h2 className="text-lg font-bold text-amber-800 mb-3">
                  胡迪的硬幣大冒險
                </h2>
                <p className="text-xs text-amber-900/80 mb-4 font-medium leading-relaxed">
                  移動胡迪的牛仔帽接住掉落的寶藏，連續接住可累積連擊加倍！注意躲避阿薛的危險炸彈！
                </p>

                {/* Legend Guide */}
                <div className="grid grid-cols-2 gap-2 mb-5 text-left text-xs font-bold text-slate-800">
                  <div className="flex items-center gap-2 bg-amber-100/80 border border-amber-300 p-2 rounded-xl">
                    <span className="text-base">🪙</span>
                    <div>
                      <div>金幣</div>
                      <div className="text-[10px] text-amber-700 font-semibold">+10 分</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 bg-emerald-100/80 border border-emerald-300 p-2 rounded-xl">
                    <span className="text-base">👽</span>
                    <div>
                      <div>三眼怪</div>
                      <div className="text-[10px] text-emerald-700 font-semibold">+50 分</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 bg-purple-100/80 border border-purple-300 p-2 rounded-xl">
                    <span className="text-base">🚀</span>
                    <div>
                      <div>巴斯光年</div>
                      <div className="text-[10px] text-purple-700 font-semibold">+50 分</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 bg-red-100/80 border border-red-300 p-2 rounded-xl">
                    <span className="text-base">💣</span>
                    <div>
                      <div>阿薛炸彈</div>
                      <div className="text-[10px] text-red-700 font-semibold">-1 ❤️ 生命</div>
                    </div>
                  </div>
                </div>

                {/* Best Score Indicator */}
                {highScore > 0 && (
                  <div className="flex items-center justify-center gap-1.5 mb-4 text-xs font-bold text-amber-800">
                    <Trophy className="w-4 h-4 text-amber-600" />
                    <span>歷史最高分：{highScore}</span>
                  </div>
                )}

                {/* Controls Tip */}
                <div className="text-[11px] text-amber-900/70 mb-4 bg-amber-200/50 py-1.5 px-3 rounded-lg">
                  🎮 電腦鍵盤 <kbd className="px-1 py-0.5 bg-white rounded border border-amber-300">←</kbd> <kbd className="px-1 py-0.5 bg-white rounded border border-amber-300">→</kbd> / 滑鼠滑動 / 手機手指拖曳
                </div>

                <button
                  onClick={startGame}
                  className="w-full py-3.5 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-black text-lg tracking-wide shadow-lg shadow-emerald-700/40 border-b-4 border-emerald-800 transition-all"
                >
                  開始冒險 (START)
                </button>
              </div>
            </div>
          )}

          {/* Pause Menu Overlay */}
          {gameState === 'PAUSED' && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
              <div className="w-full max-w-xs bg-amber-50 border-4 border-amber-600 rounded-3xl p-6 text-center shadow-2xl">
                <h2 className="text-2xl font-black text-amber-950 mb-2">遊戲暫停</h2>
                <p className="text-xs text-amber-900/80 mb-5 font-medium">休息一下，胡迪隨時準備繼續出發！</p>
                
                <div className="flex flex-col gap-2.5">
                  <button
                    onClick={togglePause}
                    className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center justify-center gap-2 shadow border-b-2 border-emerald-800"
                  >
                    <Play className="w-4 h-4" /> 繼續遊戲
                  </button>
                  <button
                    onClick={startGame}
                    className="w-full py-2.5 px-4 rounded-xl bg-amber-200 hover:bg-amber-300 text-amber-950 font-bold flex items-center justify-center gap-2 shadow border border-amber-400"
                  >
                    <RotateCcw className="w-4 h-4" /> 重新開始
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Game Over Overlay */}
          {gameState === 'GAMEOVER' && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
              <div className="w-full max-w-sm bg-amber-50 border-4 border-red-600 rounded-3xl p-6 text-center shadow-2xl animate-in zoom-in-95 duration-200">
                <span className="text-4xl block mb-1">🤠💥</span>
                <h2 className="text-2xl font-black text-red-600 mb-1 tracking-tight">GAME OVER</h2>
                <p className="text-xs text-amber-900/80 mb-4 font-bold">帽子被打翻了！本次冒險結算：</p>

                {/* Score Big Display */}
                <div className="bg-amber-100/90 border-2 border-amber-400 rounded-2xl p-3 mb-4">
                  <div className="text-xs text-amber-800 font-bold">最終得分</div>
                  <div className="text-3xl font-black text-amber-950 tabular-nums">{score}</div>

                  {score >= highScore && score > 0 && (
                    <div className="text-xs text-emerald-700 font-black mt-1 flex items-center justify-center gap-1">
                      <Sparkles className="w-3.5 h-3.5" /> 恭喜創下歷史新高紀錄！
                    </div>
                  )}
                </div>

                {/* Detailed Stats */}
                <div className="grid grid-cols-2 gap-2 text-xs mb-5 font-bold">
                  <div className="bg-white/80 p-2 rounded-xl border border-amber-200 flex justify-between items-center">
                    <span className="text-amber-900">🪙 金幣接取</span>
                    <span className="text-amber-700 tabular-nums">{stats.coinsCaught}</span>
                  </div>
                  <div className="bg-white/80 p-2 rounded-xl border border-amber-200 flex justify-between items-center">
                    <span className="text-emerald-900">👽 三眼怪拯救</span>
                    <span className="text-emerald-700 tabular-nums">{stats.aliensRescued}</span>
                  </div>
                  <div className="bg-white/80 p-2 rounded-xl border border-amber-200 flex justify-between items-center">
                    <span className="text-purple-900">🚀 巴斯頭盔</span>
                    <span className="text-purple-700 tabular-nums">{stats.buzzHelmets}</span>
                  </div>
                  <div className="bg-white/80 p-2 rounded-xl border border-amber-200 flex justify-between items-center">
                    <span className="text-red-900">🔥 最高連擊</span>
                    <span className="text-red-600 tabular-nums">{stats.maxCombo} 次</span>
                  </div>
                </div>

                <button
                  onClick={startGame}
                  className="w-full py-3.5 px-6 rounded-2xl bg-amber-600 hover:bg-amber-500 active:scale-95 text-white font-black text-lg tracking-wide shadow-lg shadow-amber-700/40 border-b-4 border-amber-800 transition-all flex items-center justify-center gap-2"
                >
                  <RotateCcw className="w-5 h-5" /> 再玩一次 (RETRY)
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Mobile On-Screen Direction Buttons for comfortable thumb tapping */}
        <footer className="relative z-20 flex items-center justify-between px-4 py-2.5 bg-amber-600 border-t-2 border-amber-700 text-amber-100 text-xs">
          {/* Left Arrow Button */}
          <button
            onPointerDown={() => {
              keysRef.current.left = true;
            }}
            onPointerUp={() => {
              keysRef.current.left = false;
            }}
            onPointerLeave={() => {
              keysRef.current.left = false;
            }}
            className="flex items-center gap-1.5 px-4 py-2 bg-amber-700 hover:bg-amber-800 active:bg-amber-900 active:scale-95 rounded-xl border border-amber-500 font-bold select-none touch-none shadow"
            aria-label="向左移動"
          >
            <ArrowLeft className="w-4 h-4" /> 向左
          </button>

          {/* Quick instructions / highscore badge */}
          <div className="text-center font-bold text-[11px] text-amber-200">
            最高分: <span className="text-white font-black">{highScore}</span>
          </div>

          {/* Right Arrow Button */}
          <button
            onPointerDown={() => {
              keysRef.current.right = true;
            }}
            onPointerUp={() => {
              keysRef.current.right = false;
            }}
            onPointerLeave={() => {
              keysRef.current.right = false;
            }}
            className="flex items-center gap-1.5 px-4 py-2 bg-amber-700 hover:bg-amber-800 active:bg-amber-900 active:scale-95 rounded-xl border border-amber-500 font-bold select-none touch-none shadow"
            aria-label="向右移動"
          >
            向右 <ArrowRight className="w-4 h-4" />
          </button>
        </footer>
      </div>
    </div>
  );
}
