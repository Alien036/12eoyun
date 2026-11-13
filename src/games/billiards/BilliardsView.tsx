"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import { ArrowLeft, RotateCcw, Trophy, Flame, AlertCircle } from "lucide-react";
import {
  BALL_COLORS,
  BALL_RADIUS,
  POCKETS,
  POCKET_RADIUS,
  RAIL_MARGIN,
  TABLE_H,
  TABLE_W,
  areBallsMoving,
  canPlaceCueBall,
  computeTrajectoryPreview,
  createInitialRack,
  stepPhysicsFrame,
  type Ball,
} from "./physics";
import {
  recordDuelGameResult,
  recordSoloGameResult,
  type PlayerDoc,
} from "@/lib/firestore";
import { sound } from "@/lib/sound";
import RollingScore from "@/components/ui/RollingScore";

interface BilliardsViewProps {
  mode: "solo" | "duel";
  player1: PlayerDoc;
  player2?: PlayerDoc;
  allPlayers: PlayerDoc[];
  onBackToHub: () => void;
  onRequestNewGameWithGate: () => void;
  onComboEnergyChange?: (combo: number) => void;
}

type BallGroup = "solids" | "stripes" | null;

interface SinkingBallAnim {
  id: number;
  fromX: number;
  fromY: number;
  pocketX: number;
  pocketY: number;
  progress: number; // 0 -> 1
}

export default function BilliardsView({
  mode,
  player1,
  player2,
  allPlayers,
  onBackToHub,
  onRequestNewGameWithGate,
  onComboEnergyChange,
}: BilliardsViewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ballsRef = useRef<Ball[]>(createInitialRack());
  const sinkingBallsRef = useRef<SinkingBallAnim[]>([]);
  const strikeLungeRef = useRef<{
    active: boolean;
    startAt: number;
    angle: number;
    power: number;
  } | null>(null);

  // Nişan & Güç kontrolü
  const [aimAngle, setAimAngle] = useState(0);
  const [power, setPower] = useState(58);
  const [moving, setMoving] = useState(false);
  const [ballInHand, setBallInHand] = useState(false);

  // Solo & Düello Durumu
  const [p1Score, setP1Score] = useState(0);
  const [p2Score, setP2Score] = useState(0);
  const [shotsCount, setShotsCount] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [p2BestStreak, setP2BestStreak] = useState(0);
  const [turnPlayer, setTurnPlayer] = useState<1 | 2>(1);
  const [p1Group, setP1Group] = useState<BallGroup>(null);
  const [statusBanner, setStatusBanner] = useState<string>(
    mode === "solo"
      ? "Nişan al ve vuruş yap! Ardışık toplar seriyi katlar."
      : `${player1.name} açılış vuruşunu yapıyor!`
  );
  const [elapsedSec, setElapsedSec] = useState(0);
  const [pocketedSnapshot, setPocketedSnapshot] = useState<number[]>([]);

  const [gameOverInfo, setGameOverInfo] = useState<{
    title: string;
    subtitle: string;
    finalP1: number;
    finalP2?: number;
  } | null>(null);

  // Vuruş esnasında toplanan olaylar
  const shotTrackerRef = useRef<{
    active: boolean;
    firstHit: number | null;
    pocketedThisShot: number[];
  }>({ active: false, firstHit: null, pocketedThisShot: [] });

  // Zamanlayıcı
  useEffect(() => {
    if (gameOverInfo) return;
    const t = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [gameOverInfo]);

  const isBallInGroup = (id: number, grp: BallGroup): boolean => {
    if (grp === "solids") return id >= 1 && id <= 7;
    if (grp === "stripes") return id >= 9 && id <= 15;
    return false;
  };

  const countRemainingInGroup = (balls: Ball[], grp: BallGroup): number => {
    if (!grp) return 7;
    return balls.filter((b) => !b.pocketed && isBallInGroup(b.id, grp)).length;
  };

  // Vuruş tamamlandığında kuralları değerlendir
  const evaluateCompletedShot = useCallback(async () => {
    const balls = ballsRef.current;
    const { firstHit, pocketedThisShot } = shotTrackerRef.current;
    shotTrackerRef.current = {
      active: false,
      firstHit: null,
      pocketedThisShot: [],
    };

    const scratched = pocketedThisShot.includes(0);
    const numberedPocketed = pocketedThisShot.filter((id) => id > 0);

    // Beyaz top deliğe girdiyse masaya geri hazırla (Ball-in-Hand)
    if (scratched) {
      const cue = balls.find((b) => b.id === 0);
      if (cue) {
        cue.pocketed = false;
        const spot = canPlaceCueBall(balls, 215, TABLE_H / 2);
        cue.x = spot.x;
        cue.y = spot.y;
        cue.vx = 0;
        cue.vy = 0;
      }
    }

    setPocketedSnapshot(
      balls.filter((b) => b.id > 0 && b.pocketed).map((b) => b.id)
    );

    if (mode === "solo") {
      let nextScore = p1Score;
      let nextStreak = streak;
      let nextBest = bestStreak;

      if (scratched) {
        nextScore = Math.max(0, nextScore - 150);
        nextStreak = 0;
        onComboEnergyChange?.(0);
        setBallInHand(true);
        setStatusBanner(
          "Faul! Beyaz top deliğe girdi (-150 P). Beyaz topu istediğin yere koy."
        );
      } else if (numberedPocketed.length > 0) {
        nextStreak = streak + numberedPocketed.length;
        nextBest = Math.max(bestStreak, nextStreak);
        onComboEnergyChange?.(nextStreak);
        // Sokulan her top +150 (seri çarpanı maksimum 2x)
        const streakMult = Math.min(2, 1 + (nextStreak - 1) * 0.25);
        const pts = Math.round(numberedPocketed.length * 150 * streakMult);
        nextScore += pts;
        setStatusBanner(
          `Harika Vuruş! +${pts.toLocaleString("tr-TR")} Puan (Seri x${nextStreak})`
        );
      } else {
        nextStreak = 0;
        onComboEnergyChange?.(0);
        setStatusBanner("Boş vuruş — Seri sıfırlandı.");
      }

      setP1Score(nextScore);
      setStreak(nextStreak);
      setBestStreak(nextBest);

      // 15 topun tamamı bitti mi?
      const remainingObj = balls.filter((b) => b.id > 0 && !b.pocketed).length;
      if (remainingObj === 0) {
        // Maç Galibiyeti +2.000 + süre/isabet bonusu (maks +800)
        const accuracyTimeBonus = Math.min(
          800,
          Math.max(0, Math.round(800 - Math.max(0, shotsCount - 15) * 28 - elapsedSec * 1.5))
        );
        const winReward = 2000 + accuracyTimeBonus;
        const total = nextScore + winReward;
        setP1Score(total);
        sound.playVictory();
        confetti({ particleCount: 95, spread: 75, origin: { y: 0.6 } });

        await recordSoloGameResult(
          player1,
          {
            game: "billiards",
            score: total,
            won: true,
            bestStreak: nextBest,
            durationSec: elapsedSec,
            modeLabel: "Arcade 15-Top",
          },
          allPlayers
        );

        setGameOverInfo({
          title: "Tüm Masayı Temizledin!",
          subtitle: `${shotsCount} vuruş • Galibiyet & İsabet Bonusu +${winReward.toLocaleString(
            "tr-TR"
          )} P`,
          finalP1: total,
        });
      }
      return;
    }

    // 2 KİŞİLİK 8-TOP SINIF DÜELLOSU KURALLARI
    if (!player2) return;
    const activePlayerNum = turnPlayer;
    const otherPlayerNum: 1 | 2 = activePlayerNum === 1 ? 2 : 1;
    const p2Group: BallGroup =
      p1Group === "solids"
        ? "stripes"
        : p1Group === "stripes"
        ? "solids"
        : null;
    const myGroup = activePlayerNum === 1 ? p1Group : p2Group;
    const remainingMyBalls = countRemainingInGroup(balls, myGroup);

    const eightPocketed = numberedPocketed.includes(8);

    // 8 Numaralı Siyah Top Deliğe Girdiyse Maç Biter!
    if (eightPocketed) {
      const legalEightWin =
        !scratched && myGroup !== null && remainingMyBalls === 0;
      const winnerNum: 1 | 2 = legalEightWin ? activePlayerNum : otherPlayerNum;

      // Maç Galibiyeti +2.000 + süre/isabet bonusu (maks +800)
      const duelTimeBonus = Math.min(
        800,
        Math.max(0, Math.round(800 - elapsedSec * 2))
      );
      const final1 =
        p1Score + (winnerNum === 1 ? 2000 + duelTimeBonus : 250);
      const final2 =
        p2Score + (winnerNum === 2 ? 2000 + duelTimeBonus : 250);

      sound.playVictory();
      confetti({ particleCount: 95, spread: 75, origin: { y: 0.6 } });

      await recordDuelGameResult({
        game: "billiards",
        player1,
        player2,
        winner: winnerNum,
        p1Score: final1,
        p2Score: final2,
        p1Streak: bestStreak,
        p2Streak: p2BestStreak,
      });

      const winName = winnerNum === 1 ? player1.name : player2.name;
      setGameOverInfo({
        title: `${winName} 8-Top Düellosunu Kazandı!`,
        subtitle: legalEightWin
          ? "Grubunu tamamlayıp 8 numarayı nizami soktu!"
          : "Erken 8-top veya faullü 8-top nedeniyle rakip kazandı!",
        finalP1: final1,
        finalP2: final2,
      });
      return;
    }

    // Grup henüz belirlenmemişse (Açık Masa)
    let updatedP1Group = p1Group;
    let newlyAssigned = false;
    if (!p1Group && !scratched && numberedPocketed.length > 0) {
      const firstPock = numberedPocketed[0];
      const chosenGrp: BallGroup = firstPock <= 7 ? "solids" : "stripes";
      updatedP1Group =
        activePlayerNum === 1
          ? chosenGrp
          : chosenGrp === "solids"
          ? "stripes"
          : "solids";
      setP1Group(updatedP1Group);
      newlyAssigned = true;
    }

    const effectiveMyGroup =
      activePlayerNum === 1
        ? updatedP1Group
        : updatedP1Group === "solids"
        ? "stripes"
        : updatedP1Group === "stripes"
        ? "solids"
        : null;

    // Faul kontrolü
    let foul = scratched || firstHit === null;
    if (!foul && !newlyAssigned && effectiveMyGroup && firstHit !== null) {
      const needEight = countRemainingInGroup(balls, effectiveMyGroup) === 0;
      if (needEight && firstHit !== 8) foul = true;
      if (!needEight && !isBallInGroup(firstHit, effectiveMyGroup)) foul = true;
    }

    const myPocketedCount = effectiveMyGroup
      ? numberedPocketed.filter((id) => isBallInGroup(id, effectiveMyGroup))
          .length
      : numberedPocketed.length;

    if (foul) {
      setStreak(0);
      onComboEnergyChange?.(0);
      setBallInHand(true);
      setTurnPlayer(otherPlayerNum);
      const nextName = otherPlayerNum === 1 ? player1.name : player2.name;
      setStatusBanner(
        `Faul! Sıra ve Beyaz Top (Ball-in-Hand) ${nextName}'de.`
      );
    } else if (myPocketedCount > 0) {
      const newStr = streak + myPocketedCount;
      setStreak(newStr);
      onComboEnergyChange?.(newStr);
      const streakMult = Math.min(2, 1 + (newStr - 1) * 0.25);
      const gained = Math.round(myPocketedCount * 150 * streakMult);
      if (activePlayerNum === 1) {
        setP1Score((s) => s + gained);
        setBestStreak((b) => Math.max(b, newStr));
      } else {
        setP2Score((s) => s + gained);
        setP2BestStreak((b) => Math.max(b, newStr));
      }
      const curName = activePlayerNum === 1 ? player1.name : player2.name;
      setStatusBanner(
        `${curName} seriye devam ediyor! (+${gained} P • Seri x${newStr})`
      );
    } else {
      setStreak(0);
      onComboEnergyChange?.(0);
      setTurnPlayer(otherPlayerNum);
      const nextName = otherPlayerNum === 1 ? player1.name : player2.name;
      setStatusBanner(`Sıra ${nextName}'e geçti.`);
    }
  }, [
    mode,
    p1Score,
    p2Score,
    streak,
    bestStreak,
    p2BestStreak,
    shotsCount,
    elapsedSec,
    player1,
    player2,
    allPlayers,
    turnPlayer,
    p1Group,
    onComboEnergyChange,
  ]);

  // 3D Küre Işıklandırmalı Top Çizici (Hem masadaki toplar hem cebe süzülen toplar için)
  const draw3DSphereBall = (
    ctx: CanvasRenderingContext2D,
    id: number,
    x: number,
    y: number,
    rollPhase: number,
    rollAngle: number,
    scale: number = 1,
    alpha: number = 1,
    highlightRing: boolean = false
  ) => {
    const r = BALL_RADIUS * scale;
    if (r <= 0.6) return;

    ctx.save();
    ctx.globalAlpha = alpha;

    // 1. Çuha temas gölgesi
    if (scale > 0.7) {
      ctx.beginPath();
      ctx.arc(x + 2.4 * scale, y + 3.2 * scale, r * 1.02, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0, 0, 0, 0.42)";
      ctx.fill();
    }

    const baseColor = BALL_COLORS[id] || "#ffffff";
    const isStripe = id >= 9;

    // 2. Küre gövdesi + Dönen şerit illüzyonu
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.clip();

    if (isStripe) {
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(x - r, y - r, r * 2, r * 2);

      // Hareket yönüne göre dönen renkli şerit bandı
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rollAngle);
      const stripeOffset = Math.sin(rollPhase) * (r * 0.35);
      ctx.fillStyle = baseColor;
      ctx.fillRect(-r * 1.2, stripeOffset - r * 0.56, r * 2.4, r * 1.12);
      ctx.restore();
    } else {
      ctx.fillStyle = baseColor;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }

    // 3. Dönen numara diski (rollPhase ile küre üzerinde kayma hissi)
    if (id > 0) {
      const badgeShiftX = Math.cos(rollAngle) * Math.sin(rollPhase) * (r * 0.34);
      const badgeShiftY = Math.sin(rollAngle) * Math.sin(rollPhase) * (r * 0.34);
      const bx = x + badgeShiftX;
      const by = y + badgeShiftY;

      ctx.beginPath();
      ctx.arc(bx, by, 5.1 * scale, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.fill();

      if (scale > 0.55) {
        ctx.fillStyle = "#0f172a";
        ctx.font = `900 ${Math.max(5, 7.5 * scale)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(id), bx, by + 0.4 * scale);
      }
    } else {
      // Beyaz top (Cue ball) üzerinde yuvarlanmayı hissettiren kırmızı antrenman noktası
      const dotX = x + Math.cos(rollAngle) * Math.sin(rollPhase) * (r * 0.48);
      const dotY = y + Math.sin(rollAngle) * Math.sin(rollPhase) * (r * 0.48);
      ctx.beginPath();
      ctx.arc(dotX, dotY, 1.9 * scale, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(239, 68, 68, 0.85)";
      ctx.fill();
    }

    // 4. 3D Küre Çevresel Kararma (Ambient Rim Occlusion) + Speküler Işıklandırma
    const shadeGrad = ctx.createRadialGradient(
      x - r * 0.32,
      y - r * 0.34,
      r * 0.08,
      x,
      y,
      r
    );
    shadeGrad.addColorStop(0, "rgba(255, 255, 255, 0.58)");
    shadeGrad.addColorStop(0.32, "rgba(255, 255, 255, 0.08)");
    shadeGrad.addColorStop(0.75, "rgba(0, 0, 0, 0.12)");
    shadeGrad.addColorStop(1, "rgba(0, 0, 0, 0.48)");
    ctx.fillStyle = shadeGrad;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);

    // 5. Keskin Parlak Speküler Nokta (Glossy Fenolik Reçine Yansıması)
    ctx.beginPath();
    ctx.ellipse(
      x - r * 0.34,
      y - r * 0.36,
      r * 0.26,
      r * 0.16,
      -Math.PI / 4,
      0,
      Math.PI * 2
    );
    ctx.fillStyle = "rgba(255, 255, 255, 0.78)";
    ctx.fill();

    ctx.restore();

    if (highlightRing) {
      ctx.beginPath();
      ctx.arc(x, y, r + 4.5, 0, Math.PI * 2);
      ctx.strokeStyle = "#22d3ee";
      ctx.lineWidth = 2.2;
      ctx.stroke();
    }

    ctx.restore();
  };

  // 60 FPS Canvas Render & Fizik Döngüsü
  useEffect(() => {
    let animId = 0;

    const renderLoop = (now: number) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      const balls = ballsRef.current;

      // Yaylı İstaka İleri Atılımı (85ms Lunge -> Çarpışma Anı)
      if (strikeLungeRef.current?.active) {
        const lunge = strikeLungeRef.current;
        const t = (now - lunge.startAt) / 85;
        if (t >= 1) {
          strikeLungeRef.current = null;
          const cue = balls.find((b) => b.id === 0 && !b.pocketed);
          if (cue) {
            const speed = 4 + (lunge.power / 100) * 19.5;
            cue.vx = Math.cos(lunge.angle) * speed;
            cue.vy = Math.sin(lunge.angle) * speed;
            sound.playCueStrike(lunge.power / 100);
            shotTrackerRef.current = {
              active: true,
              firstHit: null,
              pocketedThisShot: [],
            };
          }
        }
      }

      if (shotTrackerRef.current.active) {
        const stepEv = stepPhysicsFrame(balls);
        if (
          shotTrackerRef.current.firstHit === null &&
          stepEv.firstContactId !== null
        ) {
          shotTrackerRef.current.firstHit = stepEv.firstContactId;
        }
        if (stepEv.pocketedDetails.length > 0) {
          sound.playPocketDrop();
          for (const d of stepEv.pocketedDetails) {
            shotTrackerRef.current.pocketedThisShot.push(d.id);
            sinkingBallsRef.current.push({
              id: d.id,
              fromX: d.fromX,
              fromY: d.fromY,
              pocketX: d.pocketX,
              pocketY: d.pocketY,
              progress: 0,
            });
          }
        }
        if (stepEv.maxBallImpact > 0.05) {
          sound.playBallHit(stepEv.maxBallImpact);
        } else if (stepEv.maxRailImpact > 0.08) {
          sound.playCushionBounce(stepEv.maxRailImpact);
        }

        if (!areBallsMoving(balls) && sinkingBallsRef.current.length === 0) {
          setMoving(false);
          evaluateCompletedShot();
        }
      }

      // Cebe süzülen topların animasyon ilerlemesi
      if (sinkingBallsRef.current.length > 0) {
        sinkingBallsRef.current = sinkingBallsRef.current
          .map((sb) => ({ ...sb, progress: sb.progress + 0.075 }))
          .filter((sb) => sb.progress < 1);
      }

      if (canvas && ctx) {
        ctx.clearRect(0, 0, TABLE_W, TABLE_H);

        // 1. Cilalı Ceviz / Maun Kasa Kenarı
        const railGrad = ctx.createLinearGradient(0, 0, TABLE_W, TABLE_H);
        railGrad.addColorStop(0, "#3b1d11");
        railGrad.addColorStop(0.5, "#5c2d16");
        railGrad.addColorStop(1, "#29140b");
        ctx.fillStyle = railGrad;
        ctx.beginPath();
        ctx.roundRect(0, 0, TABLE_W, TABLE_H, 22);
        ctx.fill();

        // Altın-Bronz dış çerçeve şeridi
        ctx.strokeStyle = "rgba(251, 191, 36, 0.32)";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Kasa Üzeri Elmas Nişan Noktaları (Diamond Sights)
        ctx.fillStyle = "rgba(254, 243, 199, 0.72)";
        const sightXs = [140, 232, 324, 476, 568, 660];
        for (const sx of sightXs) {
          for (const sy of [RAIL_MARGIN / 2, TABLE_H - RAIL_MARGIN / 2]) {
            ctx.beginPath();
            ctx.moveTo(sx, sy - 3.2);
            ctx.lineTo(sx + 3.2, sy);
            ctx.lineTo(sx, sy + 3.2);
            ctx.lineTo(sx - 3.2, sy);
            ctx.closePath();
            ctx.fill();
          }
        }
        const sightYs = [125, 210, 295];
        for (const sy of sightYs) {
          for (const sx of [RAIL_MARGIN / 2, TABLE_W - RAIL_MARGIN / 2]) {
            ctx.beginPath();
            ctx.moveTo(sx, sy - 3.2);
            ctx.lineTo(sx + 3.2, sy);
            ctx.lineTo(sx, sy + 3.2);
            ctx.lineTo(sx - 3.2, sy);
            ctx.closePath();
            ctx.fill();
          }
        }

        // 2. Zümrüt Çuha Yüzeyi + İnce Dokuma Deseni
        const feltGrad = ctx.createRadialGradient(
          TABLE_W / 2,
          TABLE_H / 2,
          30,
          TABLE_W / 2,
          TABLE_H / 2,
          TABLE_W * 0.65
        );
        feltGrad.addColorStop(0, "#059669");
        feltGrad.addColorStop(0.65, "#047857");
        feltGrad.addColorStop(1, "#064e3b");
        ctx.fillStyle = feltGrad;
        ctx.beginPath();
        ctx.roundRect(
          RAIL_MARGIN - 5,
          RAIL_MARGIN - 5,
          TABLE_W - (RAIL_MARGIN - 5) * 2,
          TABLE_H - (RAIL_MARGIN - 5) * 2,
          12
        );
        ctx.fill();

        // Çuha dokusu ince paralel çizgileri
        ctx.save();
        ctx.strokeStyle = "rgba(255,255,255,0.022)";
        ctx.lineWidth = 1;
        for (let y = RAIL_MARGIN; y < TABLE_H - RAIL_MARGIN; y += 8) {
          ctx.beginPath();
          ctx.moveTo(RAIL_MARGIN, y);
          ctx.lineTo(TABLE_W - RAIL_MARGIN, y);
          ctx.stroke();
        }
        ctx.restore();

        // Bant Gölgesi (İç Derinlik Çerçevesi)
        ctx.strokeStyle = "rgba(0, 0, 0, 0.38)";
        ctx.lineWidth = 5;
        ctx.strokeRect(
          RAIL_MARGIN,
          RAIL_MARGIN,
          TABLE_W - RAIL_MARGIN * 2,
          TABLE_H - RAIL_MARGIN * 2
        );

        // Başlangıç çizgisi (Head string) ve Foot spot
        ctx.strokeStyle = "rgba(255,255,255,0.16)";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(215, RAIL_MARGIN);
        ctx.lineTo(215, TABLE_H - RAIL_MARGIN);
        ctx.stroke();

        ctx.fillStyle = "rgba(255,255,255,0.28)";
        ctx.beginPath();
        ctx.arc(565, TABLE_H / 2, 2.8, 0, Math.PI * 2);
        ctx.fill();

        // 3. 6 Cep (Derinlik Gölgeli Delikler)
        for (const p of POCKETS) {
          // Deri cep ağzı halkası
          ctx.beginPath();
          ctx.arc(p.x, p.y, POCKET_RADIUS + 3.5, 0, Math.PI * 2);
          ctx.fillStyle = "#1c1917";
          ctx.fill();

          const pGrad = ctx.createRadialGradient(
            p.x + 2,
            p.y + 2,
            2,
            p.x,
            p.y,
            POCKET_RADIUS
          );
          pGrad.addColorStop(0, "#000000");
          pGrad.addColorStop(0.75, "#020617");
          pGrad.addColorStop(1, "#0f172a");
          ctx.beginPath();
          ctx.arc(p.x, p.y, POCKET_RADIUS, 0, Math.PI * 2);
          ctx.fillStyle = pGrad;
          ctx.fill();

          ctx.lineWidth = 1.6;
          ctx.strokeStyle = "rgba(251,191,36,0.45)";
          ctx.stroke();
        }

        // 4. Cebe Süzülerek Küçülen Toplar (Pocket Sink Animation)
        for (const sb of sinkingBallsRef.current) {
          const ease = 1 - Math.pow(1 - sb.progress, 2);
          const sx = sb.fromX + (sb.pocketX - sb.fromX) * ease;
          const sy = sb.fromY + (sb.pocketY - sb.fromY) * ease;
          const sc = Math.max(0.1, 1 - ease * 0.88);
          const al = Math.max(0, 1 - ease * 0.85);
          draw3DSphereBall(ctx, sb.id, sx, sy, ease * 5, 0, sc, al, false);
        }

        // 5. Kılavuz Çizgi (Trajectory Preview) ve Yaylı İstaka Çizimi
        const cueBall = balls.find((b) => b.id === 0 && !b.pocketed);
        const lunge = strikeLungeRef.current;

        if (
          cueBall &&
          !shotTrackerRef.current.active &&
          !ballInHand
        ) {
          const activeAngle = lunge ? lunge.angle : aimAngle;
          const activePower = lunge ? lunge.power : power;

          if (!lunge) {
            const preview = computeTrajectoryPreview(balls, activeAngle);
            if (preview) {
              ctx.save();
              ctx.setLineDash([7, 6]);
              ctx.strokeStyle = "rgba(255,255,255,0.78)";
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.moveTo(cueBall.x, cueBall.y);
              ctx.lineTo(preview.endX, preview.endY);
              ctx.stroke();

              // Hayalet temas dairesi (Ghost Ball)
              ctx.setLineDash([]);
              ctx.beginPath();
              ctx.arc(
                preview.endX,
                preview.endY,
                BALL_RADIUS,
                0,
                Math.PI * 2
              );
              ctx.fillStyle = "rgba(34,211,238,0.16)";
              ctx.fill();
              ctx.strokeStyle = "rgba(34,211,238,0.9)";
              ctx.lineWidth = 1.8;
              ctx.stroke();

              // Hedef topun gideceği yön vektörü
              if (preview.targetBallId !== null) {
                const target = balls.find(
                  (b) => b.id === preview.targetBallId
                );
                if (target) {
                  ctx.strokeStyle = "#facc15";
                  ctx.lineWidth = 2.6;
                  ctx.beginPath();
                  ctx.moveTo(target.x, target.y);
                  ctx.lineTo(
                    target.x + preview.targetDirX * 78,
                    target.y + preview.targetDirY * 78
                  );
                  ctx.stroke();
                }

                // Beyaz top sapma çizgisi
                ctx.strokeStyle = "rgba(248,250,252,0.52)";
                ctx.lineWidth = 1.6;
                ctx.beginPath();
                ctx.moveTo(preview.endX, preview.endY);
                ctx.lineTo(
                  preview.endX + preview.cueDeflectX * 44,
                  preview.endY + preview.cueDeflectY * 44
                );
                ctx.stroke();
              }
              ctx.restore();
            }
          }

          // İstaka (Cue Stick) — Yüksek güçte mikro gerilim titremesi + İleri atılım!
          const maxPull = 18 + (activePower / 100) * 52;
          let currentPull = maxPull;
          if (lunge) {
            const p = Math.min(1, (now - lunge.startAt) / 85);
            // Yay hızlanması ile beyaz topun tam kenarına (BALL_RADIUS + 2) atılır
            currentPull = maxPull - (maxPull - (BALL_RADIUS + 2)) * (p * p);
          }

          // Yüksek güç (>75%) gerilim titremesi
          const tremor =
            !lunge && activePower >= 75
              ? ((activePower - 75) / 25) * 1.45 * Math.sin(now * 0.08)
              : 0;

          const stickLen = 162;
          const dirX = Math.cos(activeAngle);
          const dirY = Math.sin(activeAngle);
          const perpX = -dirY * tremor;
          const perpY = dirX * tremor;

          const tipX = cueBall.x - dirX * currentPull + perpX;
          const tipY = cueBall.y - dirY * currentPull + perpY;
          const buttX = cueBall.x - dirX * (currentPull + stickLen) + perpX;
          const buttY = cueBall.y - dirY * (currentPull + stickLen) + perpY;

          ctx.save();
          // İstaka gölgesi
          ctx.lineCap = "round";
          ctx.lineWidth = 7;
          ctx.strokeStyle = "rgba(0,0,0,0.35)";
          ctx.beginPath();
          ctx.moveTo(tipX + 3, tipY + 5);
          ctx.lineTo(buttX + 4, buttY + 6);
          ctx.stroke();

          // İstaka gövdesi
          ctx.lineWidth = 6;
          const cueGrad = ctx.createLinearGradient(tipX, tipY, buttX, buttY);
          cueGrad.addColorStop(0, "#38bdf8"); // Tebeşirli mavi uç
          cueGrad.addColorStop(0.04, "#ffffff"); // Beyaz yüksük
          cueGrad.addColorStop(0.45, "#fde68a"); // Akçaağaç şaft
          cueGrad.addColorStop(1, "#78350f"); // Koyu dipçik
          ctx.strokeStyle = cueGrad;
          ctx.beginPath();
          ctx.moveTo(tipX, tipY);
          ctx.lineTo(buttX, buttY);
          ctx.stroke();
          ctx.restore();
        }

        // 6. Masadaki Topların 3D Speküler Çizimi
        for (const b of balls) {
          if (b.pocketed) continue;
          draw3DSphereBall(
            ctx,
            b.id,
            b.x,
            b.y,
            b.rollPhase,
            b.rollAngle,
            1,
            1,
            b.id === 0 && ballInHand
          );
        }
      }

      animId = requestAnimationFrame(renderLoop);
    };

    animId = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(animId);
  }, [aimAngle, power, ballInHand, evaluateCompletedShot]);

  // Masa Üzerinde Dokunma/Fare ile Nişan Alma veya Ball-in-Hand Yerleştirme
  const pointToTableCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * TABLE_W,
      y: ((e.clientY - rect.top) / rect.height) * TABLE_H,
    };
  };

  const handleCanvasPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (moving || gameOverInfo) return;
    const pt = pointToTableCoords(e);
    const balls = ballsRef.current;
    const cue = balls.find((b) => b.id === 0);
    if (!cue) return;

    if (ballInHand) {
      const check = canPlaceCueBall(balls, pt.x, pt.y);
      cue.x = check.x;
      cue.y = check.y;
      if (e.type === "pointerup" && check.valid) {
        sound.playClick();
        setBallInHand(false);
        setStatusBanner("Beyaz top yerleştirildi! Nişan al ve vur.");
      }
      return;
    }

    const angle = Math.atan2(pt.y - cue.y, pt.x - cue.x);
    setAimAngle(angle);
  };

  const handleStrikeShot = () => {
    if (moving || ballInHand || gameOverInfo || strikeLungeRef.current?.active)
      return;
    const cue = ballsRef.current.find((b) => b.id === 0 && !b.pocketed);
    if (!cue) return;

    setShotsCount((c) => c + 1);
    setMoving(true);
    // Önce yaylı istakanın ileri atılımını başlat (85ms sonra darbe aktarılır)
    strikeLungeRef.current = {
      active: true,
      startAt: performance.now(),
      angle: aimAngle,
      power,
    };
  };

  const p2Group: BallGroup =
    p1Group === "solids"
      ? "stripes"
      : p1Group === "stripes"
      ? "solids"
      : null;

  return (
    <div className="relative flex h-full w-full max-w-3xl flex-col items-center justify-between touch-none select-none py-1">
      {/* Üst Başlık ve Skor Kartları */}
      <div className="w-full flex items-center justify-between gap-2 shrink-0">
        <motion.button
          type="button"
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.94 }}
          onClick={onBackToHub}
          className="inline-flex items-center gap-1 rounded-xl border border-white/12 bg-slate-900/80 px-3 py-1.5 text-xs font-extrabold text-slate-200 cursor-pointer"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Lobi
        </motion.button>

        <div className="flex items-center gap-2 text-xs font-black text-emerald-300">
          <span>🎱 3D Fizik Bilardo</span>
          {streak >= 2 && (
            <motion.span
              key={`str-${streak}`}
              initial={{ scale: 0.75 }}
              animate={{ scale: [1.18, 1] }}
              className="inline-flex items-center gap-0.5 rounded-full bg-orange-500/25 border border-orange-400/50 px-2 py-0.5 text-[11px] text-amber-200 shadow-[0_0_14px_rgba(251,146,60,0.4)]"
            >
              <Flame className="h-3 w-3 text-orange-400" /> Seri x{streak}
            </motion.span>
          )}
        </div>

        <motion.button
          type="button"
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.94 }}
          onClick={onRequestNewGameWithGate}
          className="inline-flex items-center gap-1 rounded-xl border border-indigo-400/30 bg-indigo-500/15 px-3 py-1.5 text-xs font-extrabold text-indigo-200 cursor-pointer"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Yeni
        </motion.button>
      </div>

      {/* Oyuncu Puan Panosu (Canlı Rolling Score Ticker ile) */}
      <div className="w-full grid grid-cols-2 gap-2 mt-1.5 shrink-0">
        <div
          className={`flex items-center justify-between rounded-2xl border px-3 py-2 transition-colors ${
            mode === "solo" || turnPlayer === 1
              ? "border-cyan-400/60 bg-slate-900/95 shadow-[0_0_16px_rgba(34,211,238,0.16)]"
              : "border-white/10 bg-slate-900/60 opacity-75"
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-lg">{player1.avatar}</span>
            <div className="min-w-0">
              <div className="truncate text-xs font-black text-white">
                {player1.name}
              </div>
              <div className="text-[10px] text-cyan-300 font-semibold">
                {mode === "solo"
                  ? `${shotsCount} vuruş • ${
                      15 - pocketedSnapshot.length
                    } top kaldı`
                  : p1Group === "solids"
                  ? "Düz Toplar (1-7)"
                  : p1Group === "stripes"
                  ? "Çizgili Toplar (9-15)"
                  : "Grup Açık"}
              </div>
            </div>
          </div>
          <div className="pr-2">
            <RollingScore
              value={p1Score}
              className="text-base font-black text-white tabular-nums"
              popupColorClass="text-emerald-300"
            />
          </div>
        </div>

        {mode === "duel" && player2 ? (
          <div
            className={`flex items-center justify-between rounded-2xl border px-3 py-2 transition-colors ${
              turnPlayer === 2
                ? "border-amber-400/60 bg-slate-900/95 shadow-[0_0_16px_rgba(251,191,36,0.16)]"
                : "border-white/10 bg-slate-900/60 opacity-75"
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-lg">{player2.avatar}</span>
              <div className="min-w-0">
                <div className="truncate text-xs font-black text-white">
                  {player2.name}
                </div>
                <div className="text-[10px] text-amber-300 font-semibold">
                  {p2Group === "solids"
                    ? "Düz Toplar (1-7)"
                    : p2Group === "stripes"
                    ? "Çizgili Toplar (9-15)"
                    : "Grup Açık"}
                </div>
              </div>
            </div>
            <div className="pr-2">
              <RollingScore
                value={p2Score}
                className="text-base font-black text-white tabular-nums"
                popupColorClass="text-amber-300"
              />
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-900/75 px-3 py-2">
            <span className="text-xs text-slate-400 font-semibold">
              Kişisel Rekorun
            </span>
            <span className="text-base font-black text-amber-300 tabular-nums">
              {Math.max(
                player1.games.billiards.highScore,
                p1Score
              ).toLocaleString("tr-TR")}
            </span>
          </div>
        )}
      </div>

      {/* Durum Şeridi */}
      <div className="w-full mt-1 flex items-center justify-center gap-1.5 rounded-xl bg-slate-900/70 border border-white/8 px-3 py-1 text-[11px] font-semibold text-slate-200 text-center shrink-0">
        <AlertCircle className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
        <span className="truncate">{statusBanner}</span>
      </div>

      {/* Bilardo Masası Canvas */}
      <div className="my-1 flex flex-1 w-full items-center justify-center min-h-0">
        <canvas
          ref={canvasRef}
          width={TABLE_W}
          height={TABLE_H}
          onPointerDown={handleCanvasPointer}
          onPointerMove={(e) => {
            if (e.buttons > 0 || ballInHand) handleCanvasPointer(e);
          }}
          onPointerUp={handleCanvasPointer}
          className="w-full max-h-[48dvh] aspect-[800/420] rounded-2xl border-2 border-amber-500/35 shadow-[0_14px_45px_rgba(5,150,105,0.32)] cursor-crosshair touch-none"
        />
      </div>

      {/* İstaka Hassas Açı, Güç Çekme Barı ve Vuruş Tetikleyicisi */}
      <div className="w-full rounded-2xl border border-white/12 bg-slate-900/90 p-3 space-y-2 shrink-0">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <motion.button
              type="button"
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.94 }}
              disabled={moving}
              onClick={() => setAimAngle((a) => a - 0.032)}
              className="rounded-xl border border-white/15 bg-slate-800 px-3 py-1.5 text-xs font-black text-white hover:bg-slate-700 disabled:opacity-40 cursor-pointer"
            >
              ↺ İnce Sol
            </motion.button>
            <motion.button
              type="button"
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.94 }}
              disabled={moving}
              onClick={() => setAimAngle((a) => a + 0.032)}
              className="rounded-xl border border-white/15 bg-slate-800 px-3 py-1.5 text-xs font-black text-white hover:bg-slate-700 disabled:opacity-40 cursor-pointer"
            >
              İnce Sağ ↻
            </motion.button>
          </div>

          <span
            className={`text-xs font-black tabular-nums ${
              power >= 80 ? "text-rose-400" : "text-amber-300"
            }`}
          >
            Güç: %{power}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="range"
            min={12}
            max={100}
            value={power}
            disabled={moving}
            onChange={(e) => setPower(Number(e.target.value))}
            className="flex-1 accent-emerald-400 h-2.5 rounded-lg cursor-pointer"
          />

          <motion.button
            type="button"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.94 }}
            disabled={moving || ballInHand}
            onClick={handleStrikeShot}
            className="rounded-2xl bg-gradient-to-r from-emerald-500 to-cyan-600 px-5 py-2.5 text-xs sm:text-sm font-black text-white shadow-lg hover:brightness-110 disabled:opacity-40 transition cursor-pointer"
          >
            {ballInHand
              ? "Beyaz Topu Masaya Koy"
              : moving
              ? "Toplar Hareket Halinde..."
              : "İstakayla Vur!"}
          </motion.button>
        </div>
      </div>

      {/* Oyun Sonu Penceresi */}
      <AnimatePresence>
        {gameOverInfo && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-4"
          >
            <motion.div
              initial={{ scale: 0.88, y: 16, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              transition={{ type: "spring", stiffness: 360, damping: 28 }}
              className="w-full max-w-sm rounded-3xl border border-white/15 bg-slate-900 p-6 text-center shadow-2xl"
            >
              <Trophy className="h-10 w-10 mx-auto text-emerald-400 mb-2" />
              <h3 className="text-xl font-black text-white">
                {gameOverInfo.title}
              </h3>
              <p className="mt-1 text-xs text-slate-300">
                {gameOverInfo.subtitle}
              </p>

              <div className="my-4 space-y-2 rounded-2xl border border-white/10 bg-slate-950/80 p-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-300">
                    {player1.name}:
                  </span>
                  <span className="font-black text-emerald-300 tabular-nums">
                    {gameOverInfo.finalP1.toLocaleString("tr-TR")} P
                  </span>
                </div>
                {player2 && typeof gameOverInfo.finalP2 === "number" && (
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-300">
                      {player2.name}:
                    </span>
                    <span className="font-black text-amber-300 tabular-nums">
                      {gameOverInfo.finalP2.toLocaleString("tr-TR")} P
                    </span>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.94 }}
                  onClick={onRequestNewGameWithGate}
                  className="w-full flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-cyan-600 py-3.5 text-sm font-black text-white cursor-pointer"
                >
                  <RotateCcw className="h-4 w-4" /> Yeni Oyun Başlat (Profil
                  Seç)
                </motion.button>
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={onBackToHub}
                  className="w-full rounded-2xl border border-white/15 bg-white/5 py-3 text-xs font-bold text-slate-300 hover:text-white cursor-pointer"
                >
                  Ana Menüye Dön
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
