export const TABLE_W = 800;
export const TABLE_H = 420;
export const RAIL_MARGIN = 34;
export const BALL_RADIUS = 11.5;
export const POCKET_RADIUS = 22;

export interface Ball {
  id: number; // 0 = Beyaz İstaka Topu, 1-7 Düz, 8 Siyah, 9-15 Çizgili
  x: number;
  y: number;
  vx: number;
  vy: number;
  rollPhase: number;
  rollAngle: number;
  pocketed: boolean;
}

export interface PocketedDetail {
  id: number;
  fromX: number;
  fromY: number;
  pocketX: number;
  pocketY: number;
}

export interface TrajectoryHit {
  endX: number;
  endY: number;
  targetBallId: number | null;
  targetDirX: number;
  targetDirY: number;
  cueDeflectX: number;
  cueDeflectY: number;
}

export const POCKETS: { x: number; y: number }[] = [
  { x: RAIL_MARGIN, y: RAIL_MARGIN },
  { x: TABLE_W / 2, y: RAIL_MARGIN - 4 },
  { x: TABLE_W - RAIL_MARGIN, y: RAIL_MARGIN },
  { x: RAIL_MARGIN, y: TABLE_H - RAIL_MARGIN },
  { x: TABLE_W / 2, y: TABLE_H - RAIL_MARGIN + 4 },
  { x: TABLE_W - RAIL_MARGIN, y: TABLE_H - RAIL_MARGIN },
];

export const BALL_COLORS: Record<number, string> = {
  0: "#f8fafc",
  1: "#facc15",
  2: "#2563eb",
  3: "#ef4444",
  4: "#9333ea",
  5: "#f97316",
  6: "#16a34a",
  7: "#991b1b",
  8: "#0f172a",
  9: "#facc15",
  10: "#2563eb",
  11: "#ef4444",
  12: "#9333ea",
  13: "#f97316",
  14: "#16a34a",
  15: "#991b1b",
};

export function createInitialRack(): Ball[] {
  const balls: Ball[] = [
    {
      id: 0,
      x: 215,
      y: TABLE_H / 2,
      vx: 0,
      vy: 0,
      rollPhase: 0,
      rollAngle: 0,
      pocketed: false,
    },
  ];

  // Standart 8-Top üçgen dizilimi (8 numara tam merkezde: 3. sıra ortası)
  const rackOrder = [1, 9, 2, 10, 8, 3, 11, 4, 12, 5, 13, 6, 14, 7, 15];
  const apexX = 565;
  const apexY = TABLE_H / 2;
  const rowStepX = BALL_RADIUS * 2 * 0.875;
  const colStepY = BALL_RADIUS * 2.04;

  let idx = 0;
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col <= row; col++) {
      const id = rackOrder[idx++];
      const x = apexX + row * rowStepX;
      const y = apexY + (col - row / 2) * colStepY;
      balls.push({
        id,
        x,
        y,
        vx: 0,
        vy: 0,
        rollPhase: (id * 0.45) % (Math.PI * 2),
        rollAngle: (id * 0.7) % (Math.PI * 2),
        pocketed: false,
      });
    }
  }

  return balls;
}

export function areBallsMoving(balls: Ball[]): boolean {
  return balls.some(
    (b) => !b.pocketed && (Math.abs(b.vx) > 0.04 || Math.abs(b.vy) > 0.04)
  );
}

export function canPlaceCueBall(
  balls: Ball[],
  x: number,
  y: number
): { x: number; y: number; valid: boolean } {
  const minX = RAIL_MARGIN + BALL_RADIUS + 2;
  const maxX = TABLE_W - RAIL_MARGIN - BALL_RADIUS - 2;
  const minY = RAIL_MARGIN + BALL_RADIUS + 2;
  const maxY = TABLE_H - RAIL_MARGIN - BALL_RADIUS - 2;

  const cx = Math.min(maxX, Math.max(minX, x));
  const cy = Math.min(maxY, Math.max(minY, y));

  for (const b of balls) {
    if (b.id === 0 || b.pocketed) continue;
    const dist = Math.hypot(cx - b.x, cy - b.y);
    if (dist < BALL_RADIUS * 2.15) {
      return { x: cx, y: cy, valid: false };
    }
  }
  for (const p of POCKETS) {
    if (Math.hypot(cx - p.x, cy - p.y) < POCKET_RADIUS + 4) {
      return { x: cx, y: cy, valid: false };
    }
  }

  return { x: cx, y: cy, valid: true };
}

export interface StepEvents {
  pocketedIds: number[];
  pocketedDetails: PocketedDetail[];
  firstContactId: number | null;
  maxBallImpact: number;
  maxRailImpact: number;
}

// 1 Frame içi 4 alt adımlı (4x sub-stepping) tünellemesiz elastik 2D vektör fiziği
export function stepPhysicsFrame(balls: Ball[]): StepEvents {
  const SUBSTEPS = 4;
  const pocketedIds: number[] = [];
  const pocketedDetails: PocketedDetail[] = [];
  let firstContactId: number | null = null;
  let maxBallImpact = 0;
  let maxRailImpact = 0;

  const minX = RAIL_MARGIN + BALL_RADIUS;
  const maxX = TABLE_W - RAIL_MARGIN - BALL_RADIUS;
  const minY = RAIL_MARGIN + BALL_RADIUS;
  const maxY = TABLE_H - RAIL_MARGIN - BALL_RADIUS;

  for (let s = 0; s < SUBSTEPS; s++) {
    // 1. İlerleme + Yuvarlanma Fazı Güncellemesi
    for (const b of balls) {
      if (b.pocketed) continue;
      const stepDx = b.vx / SUBSTEPS;
      const stepDy = b.vy / SUBSTEPS;
      b.x += stepDx;
      b.y += stepDy;

      const stepDist = Math.hypot(stepDx, stepDy);
      if (stepDist > 0.002) {
        b.rollPhase = (b.rollPhase + stepDist / BALL_RADIUS) % (Math.PI * 2);
        b.rollAngle = Math.atan2(stepDy, stepDx);
      }

      // Cep kontrolü
      for (const p of POCKETS) {
        if (Math.hypot(b.x - p.x, b.y - p.y) < POCKET_RADIUS) {
          pocketedDetails.push({
            id: b.id,
            fromX: b.x,
            fromY: b.y,
            pocketX: p.x,
            pocketY: p.y,
          });
          b.pocketed = true;
          b.vx = 0;
          b.vy = 0;
          pocketedIds.push(b.id);
          break;
        }
      }
      if (b.pocketed) continue;

      // Bant sekmesi
      if (b.x < minX) {
        b.x = minX;
        maxRailImpact = Math.max(maxRailImpact, Math.abs(b.vx) / 16);
        b.vx = -b.vx * 0.82;
      } else if (b.x > maxX) {
        b.x = maxX;
        maxRailImpact = Math.max(maxRailImpact, Math.abs(b.vx) / 16);
        b.vx = -b.vx * 0.82;
      }

      if (b.y < minY) {
        b.y = minY;
        maxRailImpact = Math.max(maxRailImpact, Math.abs(b.vy) / 16);
        b.vy = -b.vy * 0.82;
      } else if (b.y > maxY) {
        b.y = maxY;
        maxRailImpact = Math.max(maxRailImpact, Math.abs(b.vy) / 16);
        b.vy = -b.vy * 0.82;
      }
    }

    // 2. Elastik top-top çarpışmaları
    for (let i = 0; i < balls.length; i++) {
      const b1 = balls[i];
      if (b1.pocketed) continue;
      for (let j = i + 1; j < balls.length; j++) {
        const b2 = balls[j];
        if (b2.pocketed) continue;

        const dx = b2.x - b1.x;
        const dy = b2.y - b1.y;
        const dist = Math.hypot(dx, dy);
        const minDist = BALL_RADIUS * 2;

        if (dist > 0 && dist < minDist) {
          const nx = dx / dist;
          const ny = dy / dist;

          // Konum ayrıştırma (örtüşmeyi engelle)
          const overlap = (minDist - dist) / 2;
          b1.x -= nx * overlap;
          b1.y -= ny * overlap;
          b2.x += nx * overlap;
          b2.y += ny * overlap;

          // Bağıl hız (normal yönünde)
          const rvx = b1.vx - b2.vx;
          const rvy = b1.vy - b2.vy;
          const velAlongNormal = rvx * nx + rvy * ny;

          if (velAlongNormal > 0) {
            if (firstContactId === null && (b1.id === 0 || b2.id === 0)) {
              firstContactId = b1.id === 0 ? b2.id : b1.id;
            }

            const restitution = 0.95;
            const impulse = ((1 + restitution) * velAlongNormal) / 2;
            b1.vx -= impulse * nx;
            b1.vy -= impulse * ny;
            b2.vx += impulse * nx;
            b2.vy += impulse * ny;

            maxBallImpact = Math.max(
              maxBallImpact,
              Math.min(1, velAlongNormal / 15)
            );
          }
        }
      }
    }
  }

  // 3. Çuha sürtünmesi ve durma eşiği
  for (const b of balls) {
    if (b.pocketed) continue;
    b.vx *= 0.986;
    b.vy *= 0.986;
    if (Math.hypot(b.vx, b.vy) < 0.045) {
      b.vx = 0;
      b.vy = 0;
    }
  }

  return {
    pocketedIds,
    pocketedDetails,
    firstContactId,
    maxBallImpact,
    maxRailImpact,
  };
}

// Beyaz toptan hedef topa ve çarpışma sonrası yönlere kılavuz çizgi (Trajectory Preview)
export function computeTrajectoryPreview(
  balls: Ball[],
  aimAngle: number
): TrajectoryHit | null {
  const cue = balls.find((b) => b.id === 0 && !b.pocketed);
  if (!cue) return null;

  const dirX = Math.cos(aimAngle);
  const dirY = Math.sin(aimAngle);

  const minX = RAIL_MARGIN + BALL_RADIUS;
  const maxX = TABLE_W - RAIL_MARGIN - BALL_RADIUS;
  const minY = RAIL_MARGIN + BALL_RADIUS;
  const maxY = TABLE_H - RAIL_MARGIN - BALL_RADIUS;

  // Bant kesişim mesafesi
  let bestT = 1200;
  if (dirX > 0.0001) bestT = Math.min(bestT, (maxX - cue.x) / dirX);
  else if (dirX < -0.0001) bestT = Math.min(bestT, (minX - cue.x) / dirX);

  if (dirY > 0.0001) bestT = Math.min(bestT, (maxY - cue.y) / dirY);
  else if (dirY < -0.0001) bestT = Math.min(bestT, (minY - cue.y) / dirY);

  let hitBall: Ball | null = null;
  const twoR = BALL_RADIUS * 2;

  for (const b of balls) {
    if (b.id === 0 || b.pocketed) continue;
    const ocX = b.x - cue.x;
    const ocY = b.y - cue.y;
    const proj = ocX * dirX + ocY * dirY;
    if (proj <= 0) continue;

    const perpSq = ocX * ocX + ocY * ocY - proj * proj;
    if (perpSq >= twoR * twoR) continue;

    const t = proj - Math.sqrt(twoR * twoR - perpSq);
    if (t > 0 && t < bestT) {
      bestT = t;
      hitBall = b;
    }
  }

  const endX = cue.x + dirX * bestT;
  const endY = cue.y + dirY * bestT;

  if (!hitBall) {
    return {
      endX,
      endY,
      targetBallId: null,
      targetDirX: 0,
      targetDirY: 0,
      cueDeflectX: 0,
      cueDeflectY: 0,
    };
  }

  // Hedef topun gideceği yön (merkezler birleşim vektörü)
  const normLen = Math.hypot(hitBall.x - endX, hitBall.y - endY) || 1;
  const targetDirX = (hitBall.x - endX) / normLen;
  const targetDirY = (hitBall.y - endY) / normLen;

  // Beyaz topun çarpışma sonrası teğet sapma yönü
  const dot = dirX * targetDirX + dirY * targetDirY;
  const tangX = dirX - dot * targetDirX;
  const tangY = dirY - dot * targetDirY;
  const tangLen = Math.hypot(tangX, tangY);

  return {
    endX,
    endY,
    targetBallId: hitBall.id,
    targetDirX,
    targetDirY,
    cueDeflectX: tangLen > 0.01 ? tangX / tangLen : 0,
    cueDeflectY: tangLen > 0.01 ? tangY / tangLen : 0,
  };
}
