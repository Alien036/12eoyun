"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import confetti from "canvas-confetti";
import { Flame, Wind, Crosshair } from "lucide-react";
import {
  SMARTBOARD_SLOTS,
  recordMultiplayerMatchResult,
  type MultiplayerFinalStanding,
  type MultiplayerSeat,
} from "@/lib/firestore";
import { sound } from "@/lib/sound";
import SmartboardFrame, {
  type SmartboardPlayerHudState,
} from "@/components/ui/SmartboardFrame";

const CANVAS_W = 1200;
const CANVAS_H = 560;
const GRAVITY = 380; // px/s^2

export type WeaponKey = "heavy" | "triple" | "bouncer";

interface TankEntity {
  slotIndex: number;
  x: number;
  y: number;
  hp: number;
  angleDeg: number; // 0 = sağa yatay, 90 = tam yukarı, 180 = sola yatay
  power: number; // 25..100
  ammoTriple: number; // Maç başı 2 adet
  ammoBouncer: number; // Maç başı 2 adet
  eliminated: boolean;
  eliminatedOrder: number;
}

interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  weapon: WeaponKey;
  bouncesLeft: number;
  ownerSlot: number;
  trail: { x: number; y: number }[];
  active: boolean;
}

interface BlastParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  alpha: number;
  decay: number;
}

interface FloatingDamage {
  x: number;
  y: number;
  vy: number;
  text: string;
  color: string;
  alpha: number;
}

function generateTerrainHeightmap(): Float32Array {
  const map = new Float32Array(CANVAS_W);
  const p1 = Math.random() * Math.PI * 2;
  const p2 = Math.random() * Math.PI * 2;
  const p3 = Math.random() * Math.PI * 2;

  for (let x = 0; x < CANVAS_W; x++) {
    const nx = x / CANVAS_W;
    const h =
      355 +
      Math.sin(nx * Math.PI * 2.4 + p1) * 62 +
      Math.sin(nx * Math.PI * 5.2 + p2) * 32 +
      Math.cos(nx * Math.PI * 9.5 + p3) * 14;
    map[x] = Math.min(CANVAS_H - 45, Math.max(195, h));
  }
  return map;
}

function getGroundY(terrain: Float32Array, x: number): number {
  const ix = Math.min(CANVAS_W - 1, Math.max(0, Math.round(x)));
  return terrain[ix];
}

interface TanksViewProps {
  seats: MultiplayerSeat[];
  onBackToHub: () => void;
  onRequestNewGameWithGate: () => void;
  onComboEnergyChange?: (level: number) => void;
}

export default function TanksView({
  seats,
  onBackToHub,
  onRequestNewGameWithGate,
  onComboEnergyChange,
}: TanksViewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const terrainRef = useRef<Float32Array>(generateTerrainHeightmap());

  // Başlangıç tank konumları
  const createInitialTanks = useCallback((): TankEntity[] => {
    const tMap = terrainRef.current;
    const count = seats.length;
    return seats.map((s, idx) => {
      const margin = 125;
      const usableW = CANVAS_W - margin * 2;
      const x = Math.round(
        margin + (usableW * (idx + 0.5)) / count + (Math.random() - 0.5) * 45
      );
      // Tankın durduğu yeri hafif düzleştir
      const baseH = getGroundY(tMap, x);
      for (let dx = -24; dx <= 24; dx++) {
        const xx = Math.min(CANVAS_W - 1, Math.max(0, x + dx));
        tMap[xx] = baseH;
      }
      const lookLeft = x > CANVAS_W / 2;
      return {
        slotIndex: s.slotIndex,
        x,
        y: baseH,
        hp: 100,
        angleDeg: lookLeft ? 132 : 48,
        power: 68,
        ammoTriple: 2,
        ammoBouncer: 2,
        eliminated: false,
        eliminatedOrder: 0,
      };
    });
  }, [seats]);

  const [tanks, setTanks] = useState<TankEntity[]>(() => createInitialTanks());
  const tanksRef = useRef<TankEntity[]>(tanks);
  tanksRef.current = tanks;

  const [turnIndex, setTurnIndex] = useState<number>(0);
  const [selectedWeapon, setSelectedWeapon] = useState<WeaponKey>("heavy");
  const [wind, setWind] = useState<number>(() =>
    Math.round((Math.random() - 0.5) * 44)
  );
  const [actionScores, setActionScores] = useState<number[]>(() =>
    seats.map(() => 0)
  );
  const actionScoresRef = useRef<number[]>(actionScores);
  actionScoresRef.current = actionScores;

  const [isAnimating, setIsAnimating] = useState<boolean>(false);
  const [bannerText, setBannerText] = useState<string>(
    "Tankın çevresinden sapan gibi çekerek açıyı ayarla ve ATEŞ ET!"
  );
  const [finalStandings, setFinalStandings] = useState<
    MultiplayerFinalStanding[] | null
  >(null);

  const projectilesRef = useRef<Projectile[]>([]);
  const particlesRef = useRef<BlastParticle[]>([]);
  const floatTextsRef = useRef<FloatingDamage[]>([]);
  const dragOriginRef = useRef<{ x: number; y: number } | null>(null);
  const elimCounterRef = useRef<number>(0);
  const recordedRef = useRef<boolean>(false);
  const unmountedRef = useRef<boolean>(false);

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
    };
  }, []);

  const finishMatch = useCallback(
    async (finalTanks: TankEntity[], finalScores: number[]) => {
      if (recordedRef.current) return;
      recordedRef.current = true;

      sound.playVictory();
      confetti({
        particleCount: 115,
        spread: 85,
        origin: { y: 0.55 },
      });

      // Sıralama: Hayatta kalan 1., diğerleri en son elenenden ilk elenene göre
      const sorted = [...finalTanks].sort((a, b) => {
        if (!a.eliminated && b.eliminated) return -1;
        if (a.eliminated && !b.eliminated) return 1;
        if (a.hp !== b.hp) return b.hp - a.hp;
        if (a.eliminatedOrder !== b.eliminatedOrder) {
          return b.eliminatedOrder - a.eliminatedOrder;
        }
        return (
          (finalScores[b.slotIndex] || 0) - (finalScores[a.slotIndex] || 0)
        );
      });

      const standingsInput = sorted.map((t, idx) => {
        const seat = seats[t.slotIndex];
        return {
          slotIndex: t.slotIndex,
          player: seat.player,
          isBot: seat.isBot,
          rank: idx + 1,
          actionScore: finalScores[t.slotIndex] || 0,
          statSummary: `${Math.max(0, t.hp)} HP Kaldı • Hasar Puanı: ${(
            finalScores[t.slotIndex] || 0
          ).toLocaleString("tr-TR")} P`,
        };
      });

      const res = await recordMultiplayerMatchResult({
        game: "tanks",
        standings: standingsInput,
      });
      if (!unmountedRef.current) {
        setFinalStandings(res);
      }
    },
    [seats]
  );

  // Araziyi oy (Gerçek zamanlı krater açma) ve patlama hasarını uygula
  const detonateAt = useCallback(
    (
      cx: number,
      cy: number,
      weapon: WeaponKey,
      attackerSlot: number
    ) => {
      const blastRadius =
        weapon === "bouncer" ? 62 : weapon === "triple" ? 36 : 48;
      const maxDmg =
        weapon === "bouncer" ? 48 : weapon === "triple" ? 24 : 38;

      sound.playTankExplosion(weapon === "bouncer");

      // 1. Arazi yükseklik haritasında dairesel krater aç
      const terrain = terrainRef.current;
      const xStart = Math.max(0, Math.floor(cx - blastRadius));
      const xEnd = Math.min(CANVAS_W - 1, Math.ceil(cx + blastRadius));

      for (let x = xStart; x <= xEnd; x++) {
        const dx = x - cx;
        const depth = Math.sqrt(Math.max(0, blastRadius * blastRadius - dx * dx));
        const craterFloor = cy + depth;
        if (craterFloor > terrain[x]) {
          terrain[x] = Math.min(CANVAS_H - 18, craterFloor);
        }
      }

      // 2. Patlama parçacıkları üret
      const ownerTheme =
        SMARTBOARD_SLOTS[attackerSlot % SMARTBOARD_SLOTS.length];
      for (let i = 0; i < 36; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 40 + Math.random() * 220;
        particlesRef.current.push({
          x: cx,
          y: cy,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd - 60,
          radius: 3 + Math.random() * 6,
          color: i % 2 === 0 ? ownerTheme.hex : "#fbbf24",
          alpha: 1,
          decay: 1.4 + Math.random() * 0.9,
        });
      }

      // 3. Yakındaki tanklara mesafe bazlı hasar uygula
      const nextTanks = tanksRef.current.map((t) => ({ ...t }));
      const nextScores = [...actionScoresRef.current];
      let totalDealt = 0;

      for (const t of nextTanks) {
        if (t.eliminated) continue;
        const dist = Math.hypot(t.x - cx, t.y - 10 - cy);
        const dmgRange = blastRadius + 28;
        if (dist <= dmgRange) {
          const ratio = 1 - dist / dmgRange;
          const dmg = Math.max(6, Math.round(maxDmg * (0.35 + ratio * 0.65)));
          t.hp = Math.max(0, t.hp - dmg);

          if (t.slotIndex !== attackerSlot) {
            totalDealt += dmg;
          }

          floatTextsRef.current.push({
            x: t.x,
            y: t.y - 36,
            vy: -42,
            text: `-${dmg} HP`,
            color: "#fb7185",
            alpha: 1,
          });

          if (t.hp <= 0 && !t.eliminated) {
            t.eliminated = true;
            elimCounterRef.current += 1;
            t.eliminatedOrder = elimCounterRef.current;
            if (t.slotIndex !== attackerSlot) {
              nextScores[attackerSlot] = (nextScores[attackerSlot] || 0) + 550;
            }
          }
        }
      }

      if (totalDealt > 0) {
        nextScores[attackerSlot] =
          (nextScores[attackerSlot] || 0) + totalDealt * 11;
        onComboEnergyChange?.(totalDealt >= 35 ? 4 : 2);
      }

      tanksRef.current = nextTanks;
      actionScoresRef.current = nextScores;
      setTanks(nextTanks);
      setActionScores(nextScores);
    },
    [onComboEnergyChange]
  );

  // ATEŞ ET!
  const handleFireShot = useCallback(
    (
      overrideWeapon?: WeaponKey,
      overrideAngle?: number,
      overridePower?: number
    ) => {
      if (isAnimating || finalStandings) return;
      const activeTank = tanksRef.current[turnIndex];
      if (!activeTank || activeTank.eliminated) return;

      const weap = overrideWeapon ?? selectedWeapon;
      const angDeg = overrideAngle ?? activeTank.angleDeg;
      const pwr = overridePower ?? activeTank.power;

      // Cephane azalt
      const updatedTanks = tanksRef.current.map((t, idx) => {
        if (idx !== turnIndex) return t;
        return {
          ...t,
          angleDeg: angDeg,
          power: pwr,
          ammoTriple:
            weap === "triple" ? Math.max(0, t.ammoTriple - 1) : t.ammoTriple,
          ammoBouncer:
            weap === "bouncer" ? Math.max(0, t.ammoBouncer - 1) : t.ammoBouncer,
        };
      });
      tanksRef.current = updatedTanks;
      setTanks(updatedTanks);

      setIsAnimating(true);
      sound.playTankFire();

      const speedBase = 240 + pwr * 5.2;
      const spreads = weap === "triple" ? [-7, 0, 7] : [0];
      const spawned: Projectile[] = spreads.map((deltaDeg) => {
        const rad = ((angDeg + deltaDeg) * Math.PI) / 180;
        const muzzleX = activeTank.x + Math.cos(rad) * 28;
        const muzzleY = activeTank.y - 14 - Math.sin(rad) * 28;
        return {
          x: muzzleX,
          y: muzzleY,
          vx: Math.cos(rad) * speedBase,
          vy: -Math.sin(rad) * speedBase,
          weapon: weap,
          bouncesLeft: weap === "bouncer" ? 2 : 0,
          ownerSlot: activeTank.slotIndex,
          trail: [],
          active: true,
        };
      });

      projectilesRef.current = spawned;
    },
    [isAnimating, finalStandings, turnIndex, selectedWeapon]
  );

  // 60 FPS Canvas Fizik, Parçalanabilir Arazi & Tank Yerçekimi Döngüsü
  useEffect(() => {
    let rafId = 0;
    let lastTime = performance.now();

    const stepLoop = (now: number) => {
      const dt = Math.min(0.035, (now - lastTime) / 1000);
      lastTime = now;

      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      const terrain = terrainRef.current;

      // 1. Tank Yerçekimi (Altındaki toprak oyulan tank aşağı düşer)
      let tankMoved = false;
      for (const t of tanksRef.current) {
        const groundY = getGroundY(terrain, t.x);
        if (t.y < groundY) {
          t.y = Math.min(groundY, t.y + 240 * dt);
          tankMoved = true;
        } else if (t.y > groundY) {
          t.y = groundY;
        }

        // Canı 55'in altındaki tanklardan duman çıkar
        if (!t.eliminated && t.hp < 55 && Math.random() < 0.22) {
          particlesRef.current.push({
            x: t.x + (Math.random() - 0.5) * 16,
            y: t.y - 22,
            vx: wind * 0.5 + (Math.random() - 0.5) * 15,
            vy: -28 - Math.random() * 25,
            radius: 4 + Math.random() * 5,
            color: t.hp < 25 ? "#475569" : "#94a3b8",
            alpha: 0.55,
            decay: 0.7,
          });
        }
      }
      if (tankMoved) {
        setTanks([...tanksRef.current]);
      }

      // 2. Aktif Mermileri Güncelle
      const projs = projectilesRef.current;
      if (projs.length > 0) {
        for (const p of projs) {
          if (!p.active) continue;

          p.trail.push({ x: p.x, y: p.y });
          if (p.trail.length > 22) p.trail.shift();

          p.vx += wind * 1.45 * dt;
          p.vy += GRAVITY * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;

          // Ekran dışına çıktı mı?
          if (p.x < 0 || p.x >= CANVAS_W || p.y > CANVAS_H + 40) {
            p.active = false;
            continue;
          }

          // Tankla doğrudan çarpışma kontrolü
          let hitTank = false;
          for (const t of tanksRef.current) {
            if (!t.eliminated && Math.hypot(p.x - t.x, p.y - (t.y - 12)) < 22) {
              hitTank = true;
              break;
            }
          }

          const gY = getGroundY(terrain, p.x);
          if (hitTank || p.y >= gY) {
            if (!hitTank && p.bouncesLeft > 0) {
              // Zıplayan Bomba sekmesi!
              p.bouncesLeft -= 1;
              p.y = gY - 3;
              p.vy = -Math.abs(p.vy) * 0.62;
              p.vx *= 0.82;
              sound.playCushionBounce(0.8);
            } else {
              p.active = false;
              detonateAt(p.x, Math.min(gY, p.y), p.weapon, p.ownerSlot);
            }
          }
        }

        // Tüm mermiler bitti mi?
        if (projs.every((p) => !p.active)) {
          projectilesRef.current = [];

          // Zafer kontrolü: Ayakta kalan son tank!
          const aliveTanks = tanksRef.current.filter((t) => !t.eliminated);
          if (aliveTanks.length <= 1) {
            setIsAnimating(false);
            setBannerText(
              aliveTanks.length === 1
                ? `🏆 ${seats[aliveTanks[0].slotIndex].player.name} Son Kalan Tank Oldu!`
                : "💥 Tüm Tanklar İmha Oldu!"
            );
            void finishMatch(tanksRef.current, actionScoresRef.current);
          } else {
            // Sıradaki hayatta olan tanka geç
            let nextIdx = (turnIndex + 1) % seats.length;
            for (let s = 0; s < seats.length; s++) {
              const cand = (turnIndex + 1 + s) % seats.length;
              if (!tanksRef.current[cand].eliminated) {
                nextIdx = cand;
                break;
              }
            }
            // Yeni turda rüzgar hafif değişsin ve silah varsayılan ağır topa dönsün
            setWind(Math.round((Math.random() - 0.5) * 46));
            setSelectedWeapon("heavy");
            sound.playTurnChange();
            setTurnIndex(nextIdx);
            setBannerText(
              `${seats[nextIdx].player.name} nişan alıyor — Sapanla çek ve ATEŞ ET!`
            );
            setIsAnimating(false);
          }
        }
      }

      // 3. Parçacıkları ve Hasar Yazılarını Güncelle
      particlesRef.current = particlesRef.current.filter((pt) => {
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.vy += 180 * dt;
        pt.alpha -= pt.decay * dt;
        return pt.alpha > 0.02;
      });

      floatTextsRef.current = floatTextsRef.current.filter((ft) => {
        ft.y += ft.vy * dt;
        ft.alpha -= 0.85 * dt;
        return ft.alpha > 0.02;
      });

      // 4. SAHNEYİ ÇİZ (16:9 Siber Arazi + Tanklar + Kesikli Yörünge)
      if (ctx) {
        ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

        // Arka plan siber ızgara
        ctx.strokeStyle = "rgba(99, 102, 241, 0.08)";
        ctx.lineWidth = 1;
        for (let gx = 0; gx < CANVAS_W; gx += 60) {
          ctx.beginPath();
          ctx.moveTo(gx, 0);
          ctx.lineTo(gx, CANVAS_H);
          ctx.stroke();
        }
        for (let gy = 0; gy < CANVAS_H; gy += 60) {
          ctx.beginPath();
          ctx.moveTo(0, gy);
          ctx.lineTo(CANVAS_W, gy);
          ctx.stroke();
        }

        // Parçalanabilir Arazi Dolgusu
        const grad = ctx.createLinearGradient(0, 200, 0, CANVAS_H);
        grad.addColorStop(0, "rgba(30, 41, 59, 0.96)");
        grad.addColorStop(0.4, "rgba(15, 23, 42, 0.98)");
        grad.addColorStop(1, "rgba(2, 6, 23, 1)");

        ctx.beginPath();
        ctx.moveTo(0, CANVAS_H);
        for (let x = 0; x < CANVAS_W; x++) {
          ctx.lineTo(x, terrain[x]);
        }
        ctx.lineTo(CANVAS_W, CANVAS_H);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();

        // Arazi Üst Neon Sırt Çizgisi
        ctx.beginPath();
        for (let x = 0; x < CANVAS_W; x++) {
          if (x === 0) ctx.moveTo(x, terrain[x]);
          else ctx.lineTo(x, terrain[x]);
        }
        ctx.strokeStyle = "#38bdf8";
        ctx.lineWidth = 3;
        ctx.stroke();

        // Aktif Tank İçin Kesikli Yörünge Önizlemesi (Trajectory Preview)
        const activeT = tanksRef.current[turnIndex];
        if (activeT && !activeT.eliminated && !isAnimating) {
          const rad = (activeT.angleDeg * Math.PI) / 180;
          const spd = 240 + activeT.power * 5.2;
          let px = activeT.x + Math.cos(rad) * 28;
          let py = activeT.y - 14 - Math.sin(rad) * 28;
          let pvx = Math.cos(rad) * spd;
          let pvy = -Math.sin(rad) * spd;
          const aTheme =
            SMARTBOARD_SLOTS[activeT.slotIndex % SMARTBOARD_SLOTS.length];

          ctx.save();
          for (let step = 0; step < 26; step++) {
            const simDt = 0.045;
            pvx += wind * 1.45 * simDt;
            pvy += GRAVITY * simDt;
            px += pvx * simDt;
            py += pvy * simDt;
            if (py >= getGroundY(terrain, px)) break;

            ctx.beginPath();
            ctx.arc(px, py, 3.2, 0, Math.PI * 2);
            ctx.fillStyle = aTheme.hex;
            ctx.globalAlpha = Math.max(0.12, 0.85 - step * 0.03);
            ctx.fill();
          }
          ctx.restore();
        }

        // Tankları Çiz
        for (let idx = 0; idx < tanksRef.current.length; idx++) {
          const t = tanksRef.current[idx];
          if (t.eliminated) continue;
          const tTheme =
            SMARTBOARD_SLOTS[t.slotIndex % SMARTBOARD_SLOTS.length];
          const isTurn = idx === turnIndex;

          ctx.save();
          ctx.translate(t.x, t.y);

          // Sırası gelen tankın altında neon halka
          if (isTurn && !isAnimating) {
            ctx.beginPath();
            ctx.ellipse(0, 2, 30, 8, 0, 0, Math.PI * 2);
            ctx.fillStyle = `${tTheme.hex}44`;
            ctx.fill();
            ctx.strokeStyle = tTheme.hex;
            ctx.lineWidth = 2;
            ctx.stroke();
          }

          // Namlu (Turret Barrel)
          const rad = (t.angleDeg * Math.PI) / 180;
          ctx.beginPath();
          ctx.moveTo(0, -14);
          ctx.lineTo(Math.cos(rad) * 28, -14 - Math.sin(rad) * 28);
          ctx.strokeStyle = "#f8fafc";
          ctx.lineWidth = 6;
          ctx.lineCap = "round";
          ctx.stroke();

          // Palet Gövdesi
          ctx.fillStyle = "#1e293b";
          ctx.strokeStyle = tTheme.hex;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.roundRect(-20, -10, 40, 12, 6);
          ctx.fill();
          ctx.stroke();

          // Tank Kubbesi
          ctx.beginPath();
          ctx.arc(0, -12, 13, Math.PI, 0);
          ctx.fillStyle = tTheme.hex;
          ctx.fill();

          // Üst Can Barı (100 HP) ve İsim Etiketi
          const barW = 54;
          const hpRatio = Math.max(0, t.hp) / 100;
          ctx.fillStyle = "rgba(2, 6, 23, 0.85)";
          ctx.fillRect(-barW / 2, -46, barW, 8);
          ctx.fillStyle =
            hpRatio > 0.5 ? "#10b981" : hpRatio > 0.25 ? "#f59e0b" : "#f43f5e";
          ctx.fillRect(-barW / 2 + 1, -45, (barW - 2) * hpRatio, 6);

          ctx.font = "bold 11px sans-serif";
          ctx.fillStyle = "#ffffff";
          ctx.textAlign = "center";
          ctx.fillText(
            `${seats[t.slotIndex]?.player.name || "Tank"} (${t.hp})`,
            0,
            -52
          );

          ctx.restore();
        }

        // Uçan Mermileri Çiz
        for (const p of projectilesRef.current) {
          if (!p.active) continue;
          const pTheme =
            SMARTBOARD_SLOTS[p.ownerSlot % SMARTBOARD_SLOTS.length];

          // İz
          ctx.beginPath();
          p.trail.forEach((pt, i) => {
            if (i === 0) ctx.moveTo(pt.x, pt.y);
            else ctx.lineTo(pt.x, pt.y);
          });
          ctx.strokeStyle = `${pTheme.hex}88`;
          ctx.lineWidth = 3;
          ctx.stroke();

          // Mermi Çekirdeği
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.weapon === "bouncer" ? 7 : 5.5, 0, Math.PI * 2);
          ctx.fillStyle = "#ffffff";
          ctx.fill();
          ctx.lineWidth = 3;
          ctx.strokeStyle = pTheme.hex;
          ctx.stroke();
        }

        // Patlama ve Duman Parçacıkları
        for (const pt of particlesRef.current) {
          ctx.save();
          ctx.globalAlpha = Math.max(0, pt.alpha);
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, pt.radius, 0, Math.PI * 2);
          ctx.fillStyle = pt.color;
          ctx.fill();
          ctx.restore();
        }

        // Uçan Hasar Yazıları (-38 HP)
        for (const ft of floatTextsRef.current) {
          ctx.save();
          ctx.globalAlpha = Math.max(0, ft.alpha);
          ctx.font = "900 16px sans-serif";
          ctx.fillStyle = ft.color;
          ctx.textAlign = "center";
          ctx.fillText(ft.text, ft.x, ft.y);
          ctx.restore();
        }
      }

      rafId = window.requestAnimationFrame(stepLoop);
    };

    rafId = window.requestAnimationFrame(stepLoop);
    return () => window.cancelAnimationFrame(rafId);
  }, [turnIndex, isAnimating, wind, seats, detonateAt, finishMatch]);

  // Yapay Zeka Bot Sırası Geldiğinde Otomatik Nişan Alıp Ateş Etsin
  useEffect(() => {
    if (isAnimating || finalStandings) return;
    const activeSeat = seats[turnIndex];
    if (!activeSeat || !activeSeat.isBot) return;

    const timer = window.setTimeout(() => {
      const me = tanksRef.current[turnIndex];
      const targets = tanksRef.current.filter(
        (t, idx) => idx !== turnIndex && !t.eliminated
      );
      if (!me || targets.length === 0) return;

      // En yakın rakibi hedef al
      targets.sort(
        (a, b) => Math.abs(a.x - me.x) - Math.abs(b.x - me.x)
      );
      const enemy = targets[0];
      const dx = enemy.x - me.x;
      const aimAngle = dx >= 0 ? 52 : 128;
      const distRatio = Math.min(1, Math.abs(dx) / (CANVAS_W * 0.72));
      const estPower = Math.min(
        95,
        Math.max(35, Math.round(42 + distRatio * 48 + (Math.random() - 0.5) * 12))
      );
      const botWeap: WeaponKey =
        me.ammoTriple > 0 && Math.random() < 0.4 ? "triple" : "heavy";

      handleFireShot(botWeap, aimAngle, estPower);
    }, 850);

    return () => window.clearTimeout(timer);
  }, [turnIndex, isAnimating, finalStandings, seats, handleFireShot]);

  // Tek Parmakla Sapan (Slingshot) Nişan Alma Olayları
  const getCanvasPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * CANVAS_W,
      y: ((e.clientY - rect.top) / rect.height) * CANVAS_H,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isAnimating || finalStandings || seats[turnIndex]?.isBot) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const pt = getCanvasPoint(e);
    dragOriginRef.current = pt;
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragOriginRef.current || isAnimating || finalStandings) return;
    const pt = getCanvasPoint(e);
    const activeTank = tanksRef.current[turnIndex];
    if (!activeTank) return;

    // Parmağı tanktan geriye çekme (sapan) veya doğrudan açı vektörü
    const pullX = dragOriginRef.current.x - pt.x;
    const pullY = dragOriginRef.current.y - pt.y;
    const pullDist = Math.hypot(pullX, pullY);

    if (pullDist > 8) {
      let deg = Math.round((Math.atan2(pullY, pullX) * 180) / Math.PI);
      if (deg < 10) deg = 10;
      if (deg > 170) deg = 170;
      const pwr = Math.min(100, Math.max(25, Math.round(25 + pullDist * 0.42)));

      const next = tanksRef.current.map((t, idx) =>
        idx === turnIndex ? { ...t, angleDeg: deg, power: pwr } : t
      );
      tanksRef.current = next;
      setTanks(next);
    }
  };

  const handlePointerUp = () => {
    dragOriginRef.current = null;
  };

  const adjustTankParam = (deltaAngle: number, deltaPower: number) => {
    if (isAnimating || finalStandings) return;
    const next = tanksRef.current.map((t, idx) => {
      if (idx !== turnIndex) return t;
      return {
        ...t,
        angleDeg: Math.min(170, Math.max(10, t.angleDeg + deltaAngle)),
        power: Math.min(100, Math.max(25, t.power + deltaPower)),
      };
    });
    tanksRef.current = next;
    setTanks(next);
  };

  const activeSeat = seats[turnIndex] ?? seats[0];
  const activeTank = tanks[turnIndex] ?? tanks[0];
  const activeTheme =
    SMARTBOARD_SLOTS[activeSeat.slotIndex % SMARTBOARD_SLOTS.length];

  const playersHud: SmartboardPlayerHudState[] = seats.map((seat, idx) => {
    const tk = tanks[idx];
    return {
      seat,
      actionScore: actionScores[idx] || 0,
      statLabel: `${Math.max(0, tk?.hp ?? 0)} HP`,
      eliminated: tk?.eliminated,
    };
  });

  return (
    <SmartboardFrame
      gameTitle="Topçu Tanklar • Parçalanabilir Arazi"
      gameIcon="💥"
      modeSubtitle={`${seats.length} Kişilik • Sapan Nişan & Krater Fiziği`}
      playersHud={playersHud}
      activeSlotIndex={activeSeat.slotIndex}
      isAnimating={isAnimating}
      statusBannerText={bannerText}
      finalStandings={finalStandings}
      onBackToHub={onBackToHub}
      onRestartWithGate={onRequestNewGameWithGate}
      bottomBarContent={
        <div className="flex flex-wrap items-center justify-center gap-2">
          {/* Hassas Açı & Güç Dokunmatik Butonları (>=52x52px) */}
          <div className="flex items-center gap-1 rounded-2xl border border-white/12 bg-slate-950/90 px-2 py-1">
            <button
              type="button"
              disabled={isAnimating || activeSeat.isBot}
              onClick={() => adjustTankParam(5, 0)}
              className="min-h-[48px] min-w-[48px] rounded-xl bg-white/5 hover:bg-white/15 text-xs font-black text-white cursor-pointer"
            >
              Açı +
            </button>
            <span className="px-2 text-xs font-black text-cyan-300 tabular-nums">
              <Crosshair className="inline h-3.5 w-3.5 mr-0.5" />
              {activeTank?.angleDeg ?? 45}° • %{activeTank?.power ?? 70}
            </span>
            <button
              type="button"
              disabled={isAnimating || activeSeat.isBot}
              onClick={() => adjustTankParam(-5, 0)}
              className="min-h-[48px] min-w-[48px] rounded-xl bg-white/5 hover:bg-white/15 text-xs font-black text-white cursor-pointer"
            >
              Açı -
            </button>
          </div>

          {/* 3 Silah Seçici (Standart Ağır Top, 3'lü Saçma, Zıplayan Bomba) */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={isAnimating || activeSeat.isBot}
              onClick={() => {
                sound.playClick();
                setSelectedWeapon("heavy");
              }}
              className={`min-h-[52px] px-3.5 rounded-2xl border text-xs font-black transition cursor-pointer ${
                selectedWeapon === "heavy"
                  ? "border-amber-400 bg-amber-500/25 text-white"
                  : "border-white/12 bg-slate-950/80 text-slate-300"
              }`}
            >
              💣 Ağır Top (∞)
            </button>

            <button
              type="button"
              disabled={
                isAnimating ||
                activeSeat.isBot ||
                (activeTank?.ammoTriple ?? 0) <= 0
              }
              onClick={() => {
                sound.playClick();
                setSelectedWeapon("triple");
              }}
              className={`min-h-[52px] px-3.5 rounded-2xl border text-xs font-black transition cursor-pointer disabled:opacity-40 ${
                selectedWeapon === "triple"
                  ? "border-cyan-400 bg-cyan-500/25 text-white"
                  : "border-white/12 bg-slate-950/80 text-slate-300"
              }`}
            >
              ☄️ 3&apos;lü Saçma ({activeTank?.ammoTriple ?? 0})
            </button>

            <button
              type="button"
              disabled={
                isAnimating ||
                activeSeat.isBot ||
                (activeTank?.ammoBouncer ?? 0) <= 0
              }
              onClick={() => {
                sound.playClick();
                setSelectedWeapon("bouncer");
              }}
              className={`min-h-[52px] px-3.5 rounded-2xl border text-xs font-black transition cursor-pointer disabled:opacity-40 ${
                selectedWeapon === "bouncer"
                  ? "border-fuchsia-400 bg-fuchsia-500/25 text-white"
                  : "border-white/12 bg-slate-950/80 text-slate-300"
              }`}
            >
              🧨 Zıplayan ({activeTank?.ammoBouncer ?? 0})
            </button>
          </div>

          {/* DEV "ATEŞ ET!" BUTONU */}
          <button
            type="button"
            disabled={isAnimating || activeSeat.isBot}
            onClick={() => handleFireShot()}
            className={`min-h-[54px] px-7 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r ${activeTheme.buttonGradient} text-sm font-black text-white shadow-[0_0_24px_rgba(244,63,94,0.5)] hover:brightness-110 transition disabled:opacity-40 cursor-pointer`}
          >
            <Flame className="h-5 w-5" />
            <span>ATEŞ ET!</span>
          </button>
        </div>
      }
    >
      <div className="relative flex h-full w-full items-center justify-center p-1">
        {/* Üst Orta Rüzgar Göstergesi */}
        <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 rounded-full border border-cyan-400/35 bg-slate-950/85 px-4 py-1.5 text-xs font-black text-cyan-300 shadow-lg">
          <Wind className="h-4 w-4" />
          <span>
            RÜZGAR:{" "}
            {wind === 0
              ? "Sakin (0)"
              : wind > 0
              ? `${wind} ►► (Sağa)`
              : `◄◄ ${Math.abs(wind)} (Sola)`}
          </span>
        </div>

        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="h-full w-full max-w-[1260px] max-h-[580px] rounded-3xl border-2 border-white/15 bg-slate-950 shadow-2xl cursor-crosshair touch-none"
        />
      </div>
    </SmartboardFrame>
  );
}
