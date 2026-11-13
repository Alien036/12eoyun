"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import confetti from "canvas-confetti";
import { Dices, Star, Sparkles } from "lucide-react";
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

// 15x15 Klasik Kızma Birader Ana Yolu (52 Kare, Saat Yönünde)
const MAIN_PATH_COORDS: [number, number][] = [
  // Oyuncu 1 (Mavi - Sol Kol Üst Sıra -> Yukarı)
  [6, 1], [6, 2], [6, 3], [6, 4], [6, 5],
  [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6],
  [0, 7],
  // Oyuncu 2 (Kırmızı - Üst Kol Sağ Sıra -> Sağa)
  [0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8],
  [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14],
  [7, 14],
  // Oyuncu 3 (Yeşil - Sağ Kol Alt Sıra -> Aşağı)
  [8, 14], [8, 13], [8, 12], [8, 11], [8, 10], [8, 9],
  [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8],
  [14, 7],
  // Oyuncu 4 (Altın - Alt Kol Sol Sıra -> Sola)
  [14, 6], [13, 6], [12, 6], [11, 6], [10, 6], [9, 6],
  [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0],
  [7, 0], [6, 0],
];

// Her oyuncunun kendi renkli bitiş koridoru (5 kare + 6. adım merkez zafer üçgeni)
const HOME_LANES: Record<number, [number, number][]> = {
  0: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6]], // Mavi (Soldan merkeze)
  1: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7]], // Kırmızı (Üstten merkeze)
  2: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9], [7, 8]], // Yeşil (Sağdan merkeze)
  3: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7], [8, 7]], // Altın (Alttan merkeze)
};

// Kaledeki başlangıç yuvaları (4 köşe)
const BASE_PADS: Record<number, [number, number][]> = {
  0: [[2, 2], [2, 3], [3, 2], [3, 3]],
  1: [[2, 11], [2, 12], [3, 11], [3, 12]],
  2: [[11, 11], [11, 12], [12, 11], [12, 12]],
  3: [[11, 2], [11, 3], [12, 2], [12, 3]],
};

// Her koltuğun 52 karelik ana yola giriş indeksi
const START_TRACK_INDEX: Record<number, number> = {
  0: 0,
  1: 13,
  2: 26,
  3: 39,
};

// Yıldızlı güvenli kareler (0, 8, 13, 21, 26, 34, 39, 47)
const SAFE_TRACK_INDICES = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

// Klasik Kızma Birader Doygun Tahta Renk Paleti
const CLASSIC_LUDO_COLORS: Record<
  number,
  {
    name: string;
    main: string;
    light: string;
    dark: string;
    rim: string;
    laneBg: string;
  }
> = {
  0: {
    name: "Mavi",
    main: "#3B82F6",
    light: "#93C5FD",
    dark: "#1D4ED8",
    rim: "#1E3A8A",
    laneBg: "#DBEAFE",
  },
  1: {
    name: "Kırmızı",
    main: "#EF4444",
    light: "#FCA5A5",
    dark: "#B91C1C",
    rim: "#7F1D1D",
    laneBg: "#FEE2E2",
  },
  2: {
    name: "Yeşil",
    main: "#22C55E",
    light: "#86EFAC",
    dark: "#15803D",
    rim: "#14532D",
    laneBg: "#DCFCE7",
  },
  3: {
    name: "Sarı",
    main: "#FACC15",
    light: "#FEF08A",
    dark: "#CA8A04",
    rim: "#713F12",
    laneBg: "#FEF9C3",
  },
};

export interface LudoPawn {
  id: string;
  slotIndex: number;
  pawnIndex: number;
  // progress: -1 = Kalede (Base), 0..50 = Ana yol adımı, 51..55 = Ev koridoru, 56 = Merkez Hedefe Ulaştı!
  progress: number;
}

const GOAL_STEP = 56;

// 3D Parlak Kızma Birader Piyonu SVG Figürü (Alt taban + konik gövde + küresel baş + parlak specular highlight)
function Classic3DPawnSvg({
  slotIndex,
  pawnNumber,
}: {
  slotIndex: number;
  pawnNumber: number;
}) {
  const c = CLASSIC_LUDO_COLORS[slotIndex % 4];
  const gradId = `ludo_pawn_grad_${slotIndex}_${pawnNumber}`;
  const headId = `ludo_pawn_head_${slotIndex}_${pawnNumber}`;

  return (
    <svg
      viewBox="0 0 44 52"
      className="h-11 w-11 drop-shadow-[0_5px_6px_rgba(15,23,42,0.55)] select-none"
    >
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={c.light} />
          <stop offset="45%" stopColor={c.main} />
          <stop offset="100%" stopColor={c.dark} />
        </linearGradient>
        <radialGradient id={headId} cx="32%" cy="28%" r="68%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="28%" stopColor={c.light} />
          <stop offset="68%" stopColor={c.main} />
          <stop offset="100%" stopColor={c.dark} />
        </radialGradient>
      </defs>
      {/* Alt gölge halkası */}
      <ellipse cx="22" cy="47" rx="15" ry="4" fill="rgba(15,23,42,0.38)" />
      {/* Beyaz çerçeveli piyon kaidesi */}
      <ellipse
        cx="22"
        cy="44"
        rx="14"
        ry="4.5"
        fill={`url(#${gradId})`}
        stroke="#FFFFFF"
        strokeWidth="2"
      />
      {/* Konik piyon gövdesi */}
      <path
        d="M11 43 C13 31, 15 24, 17 20 L27 20 C29 24, 31 31, 33 43 Z"
        fill={`url(#${gradId})`}
        stroke="#FFFFFF"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      {/* Boyun bileziği */}
      <ellipse
        cx="22"
        cy="20"
        rx="7.2"
        ry="2.5"
        fill={c.light}
        stroke="#FFFFFF"
        strokeWidth="1.4"
      />
      {/* 3D Küresel Piyon Başı */}
      <circle
        cx="22"
        cy="12"
        r="8.5"
        fill={`url(#${headId})`}
        stroke="#FFFFFF"
        strokeWidth="2"
      />
      {/* Parlak ışık yansıması (Specular Highlight) */}
      <ellipse
        cx="19"
        cy="9"
        rx="3.2"
        ry="1.9"
        transform="rotate(-24 19 9)"
        fill="rgba(255,255,255,0.82)"
      />
      <path
        d="M15 38 C16 30, 17.5 25, 18.5 22"
        stroke="rgba(255,255,255,0.55)"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      {/* Piyon numarası */}
      <text
        x="22"
        y="37"
        textAnchor="middle"
        fill="#FFFFFF"
        fontSize="11"
        fontWeight="900"
        style={{ paintOrder: "stroke", stroke: c.rim, strokeWidth: "2.5px" }}
      >
        {pawnNumber}
      </text>
    </svg>
  );
}

function getPawnGlobalTrackIndex(pawn: LudoPawn): number | null {
  if (pawn.progress < 0 || pawn.progress > 50) return null;
  const startOffset = START_TRACK_INDEX[pawn.slotIndex] || 0;
  return (startOffset + pawn.progress) % 52;
}

function getPawnBoardCoord(pawn: LudoPawn): [number, number] {
  if (pawn.progress === -1) {
    const pads = BASE_PADS[pawn.slotIndex] || BASE_PADS[0];
    return pads[pawn.pawnIndex % pads.length];
  }
  if (pawn.progress <= 50) {
    const gIdx = getPawnGlobalTrackIndex(pawn) ?? 0;
    return MAIN_PATH_COORDS[gIdx];
  }
  const laneIdx = Math.min(5, pawn.progress - 51);
  return HOME_LANES[pawn.slotIndex][laneIdx];
}

interface LudoViewProps {
  seats: MultiplayerSeat[];
  initialSubMode?: string; // "fast2" | "classic4"
  onBackToHub: () => void;
  onRequestNewGameWithGate: () => void;
  onComboEnergyChange?: (level: number) => void;
}

export default function LudoView({
  seats,
  initialSubMode = "fast2",
  onBackToHub,
  onRequestNewGameWithGate,
  onComboEnergyChange,
}: LudoViewProps) {
  const pawnsPerPlayer = initialSubMode === "classic4" ? 4 : 2;

  const [pawns, setPawns] = useState<LudoPawn[]>(() => {
    const list: LudoPawn[] = [];
    for (const s of seats) {
      for (let p = 0; p < pawnsPerPlayer; p++) {
        list.push({
          id: `p_${s.slotIndex}_${p}`,
          slotIndex: s.slotIndex,
          pawnIndex: p,
          progress: -1,
        });
      }
    }
    return list;
  });

  const [turnIndex, setTurnIndex] = useState<number>(0);
  const [phase, setPhase] = useState<"wait_roll" | "rolling" | "pick_pawn" | "moving">(
    "wait_roll"
  );
  const [diceValue, setDiceValue] = useState<number>(6);
  const [diceSpinKey, setDiceSpinKey] = useState<number>(0);
  const [movablePawnIds, setMovablePawnIds] = useState<string[]>([]);
  const [actionScores, setActionScores] = useState<number[]>(() =>
    seats.map(() => 0)
  );
  const [capturesCount, setCapturesCount] = useState<number[]>(() =>
    seats.map(() => 0)
  );
  const [boardShake, setBoardShake] = useState<boolean>(false);
  const [bannerMsg, setBannerMsg] = useState<string>(
    "Sırası gelen tek dokunuşla 3D zarı atar!"
  );
  const [finalStandings, setFinalStandings] = useState<
    MultiplayerFinalStanding[] | null
  >(null);

  const recordedRef = useRef(false);
  const unmountedRef = useRef(false);

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
    };
  }, []);

  // Oyuncunun zarına göre hangi piyonlarının oynayabileceğini hesapla
  const computeMovablePawns = useCallback(
    (allPawns: LudoPawn[], slotIndex: number, rolled: number): LudoPawn[] => {
      const myPawns = allPawns.filter((p) => p.slotIndex === slotIndex);
      const hasOpenPawnOnTrack = myPawns.some(
        (p) => p.progress >= 0 && p.progress < GOAL_STEP
      );

      return myPawns.filter((p) => {
        if (p.progress === GOAL_STEP) return false;
        if (p.progress === -1) {
          // Hızlı Teneffüs Kuralı: Zarda 6 (veya sahada hiç açık taşı yoksa 1 veya 6) gelen kaleden çıkar!
          return rolled === 6 || (!hasOpenPawnOnTrack && rolled === 1);
        }
        return p.progress + rolled <= GOAL_STEP;
      });
    },
    []
  );

  const finishLudoMatch = useCallback(
    async (
      winnerSlot: number,
      latestPawns: LudoPawn[],
      latestScores: number[],
      latestCaptures: number[]
    ) => {
      if (recordedRef.current) return;
      recordedRef.current = true;

      sound.playVictory();
      confetti({
        particleCount: 120,
        spread: 85,
        origin: { y: 0.55 },
      });

      // Sıralama: Tamamlanan piyon sayısı + toplam ilerleme + aksiyon puanı
      const slotMetrics = seats.map((s) => {
        const my = latestPawns.filter((p) => p.slotIndex === s.slotIndex);
        const finished = my.filter((p) => p.progress === GOAL_STEP).length;
        const totalProg = my.reduce(
          (acc, p) => acc + Math.max(0, p.progress + 1),
          0
        );
        return {
          slotIndex: s.slotIndex,
          seat: s,
          finished,
          totalProg,
          score: latestScores[s.slotIndex] || 0,
          captures: latestCaptures[s.slotIndex] || 0,
        };
      });

      slotMetrics.sort((a, b) => {
        if (a.slotIndex === winnerSlot) return -1;
        if (b.slotIndex === winnerSlot) return 1;
        if (b.finished !== a.finished) return b.finished - a.finished;
        if (b.totalProg !== a.totalProg) return b.totalProg - a.totalProg;
        return b.score - a.score;
      });

      const firstBonus = seats.length >= 3 ? 2800 : 2200;
      const standingsInput = slotMetrics.map((m, idx) => {
        const rank = idx + 1;
        const placeBonus =
          rank === 1
            ? firstBonus
            : rank === 2
            ? 1100
            : rank === 3
            ? 600
            : 400;
        return {
          slotIndex: m.slotIndex,
          player: m.seat.player,
          isBot: m.seat.isBot,
          rank,
          actionScore: m.score,
          customFinalScore: m.score + placeBonus,
          statSummary: `${m.finished}/${pawnsPerPlayer} Hedef • ${m.captures} Kırma`,
        };
      });

      const res = await recordMultiplayerMatchResult({
        game: "ludo",
        standings: standingsInput,
        modeLabel:
          pawnsPerPlayer === 2 ? "Teneffüs Modu 2 Piyon" : "Klasik 4 Piyon",
      });
      if (!unmountedRef.current) {
        setFinalStandings(res);
      }
    },
    [seats, pawnsPerPlayer]
  );

  // Seçilen piyonu adım adım ilerlet, kırma ve ekstra zar kontrolü yap
  const executePawnMove = useCallback(
    async (chosenPawn: LudoPawn, rolled: number) => {
      if (finalStandings) return;
      setPhase("moving");
      setMovablePawnIds([]);

      const slotIdx = chosenPawn.slotIndex;
      const workingPawns = pawns.map((p) => ({ ...p }));
      const target = workingPawns.find((p) => p.id === chosenPawn.id);
      if (!target) return;

      const workingScores = [...actionScores];
      const workingCaptures = [...capturesCount];

      if (target.progress === -1) {
        // Kaleden başlangıç karesine çıkış
        target.progress = 0;
        sound.playPawnStep(2);
        setPawns(workingPawns.map((p) => ({ ...p })));
        await new Promise((r) => window.setTimeout(r, 220));
      } else {
        // Adım adım zıplayarak ilerle
        for (let step = 1; step <= rolled; step++) {
          target.progress += 1;
          sound.playPawnStep(step);
          setPawns(workingPawns.map((p) => ({ ...p })));
          await new Promise((r) => window.setTimeout(r, 130));
          if (unmountedRef.current) return;
        }
      }

      if (unmountedRef.current) return;

      // Rakip taş kırma kontrolü (Güvenli yıldız karelerinde kırma olmaz!)
      let capturedEnemy = false;
      const landedGlobalIdx = getPawnGlobalTrackIndex(target);

      if (
        landedGlobalIdx !== null &&
        !SAFE_TRACK_INDICES.has(landedGlobalIdx)
      ) {
        for (const other of workingPawns) {
          if (other.slotIndex !== slotIdx) {
            const otherGlobal = getPawnGlobalTrackIndex(other);
            if (otherGlobal === landedGlobalIdx) {
              other.progress = -1; // Kalesine geri uçar!
              capturedEnemy = true;
            }
          }
        }
      }

      let reachedGoal = false;
      if (target.progress === GOAL_STEP) {
        reachedGoal = true;
        // Piyonu merkeze (eve) ulaştırma: +400 puan
        workingScores[slotIdx] = (workingScores[slotIdx] || 0) + 400;
        sound.playShimmerWave();
      }

      if (capturedEnemy) {
        sound.playLudoCapture();
        onComboEnergyChange?.(4);
        // Rakip piyon kırma: +250 puan
        workingScores[slotIdx] = (workingScores[slotIdx] || 0) + 250;
        workingCaptures[slotIdx] = (workingCaptures[slotIdx] || 0) + 1;
        setBoardShake(true);
        window.setTimeout(() => {
          if (!unmountedRef.current) setBoardShake(false);
        }, 420);
      }

      setPawns(workingPawns.map((p) => ({ ...p })));
      setActionScores([...workingScores]);
      setCapturesCount([...workingCaptures]);

      // Zafer Kontrolü: Bu oyuncunun tüm piyonları merkeze ulaştı mı?
      const myDone = workingPawns.filter(
        (p) => p.slotIndex === slotIdx && p.progress === GOAL_STEP
      ).length;

      if (myDone >= pawnsPerPlayer) {
        setBannerMsg(`🏆 ${seats[turnIndex].player.name} tüm piyonlarını hedefe ulaştırdı!`);
        await finishLudoMatch(
          slotIdx,
          workingPawns,
          workingScores,
          workingCaptures
        );
        return;
      }

      // Ekstra Zar Hakkı: 6 attıysa, rakip kırdıysa veya piyonu merkeze soktuysa sıra onda kalır!
      if (rolled === 6 || capturedEnemy || reachedGoal) {
        const reason = capturedEnemy
          ? "💥 Rakip Piyonu Kırdın! Ekstra Zar Hakkı!"
          : reachedGoal
          ? "🎯 Piyon Hedefe Ulaştı! Ekstra Zar Hakkı!"
          : "🎲 6 Geldi! Ekstra Zar Hakkı!";
        setBannerMsg(reason);
        setPhase("wait_roll");
        return;
      }

      // Sıradaki oyuncuya geç
      onComboEnergyChange?.(0);
      const nextTurn = (turnIndex + 1) % seats.length;
      sound.playTurnChange();
      setTurnIndex(nextTurn);
      setBannerMsg(`${seats[nextTurn].player.name} zar atmaya hazır!`);
      setPhase("wait_roll");
    },
    [
      finalStandings,
      pawns,
      actionScores,
      capturesCount,
      pawnsPerPlayer,
      seats,
      turnIndex,
      finishLudoMatch,
      onComboEnergyChange,
    ]
  );

  // 3D Zarı At
  const handleRollDice = useCallback(async () => {
    if (phase !== "wait_roll" || finalStandings) return;
    const activeSeat = seats[turnIndex];
    if (!activeSeat) return;

    setPhase("rolling");
    setDiceSpinKey((k) => k + 1);
    sound.playDiceRoll();

    // Teneffüs modunda oyunun kilitlenmemesi için hafif dengeli zar
    const myPawns = pawns.filter((p) => p.slotIndex === activeSeat.slotIndex);
    const allInBase = myPawns.every((p) => p.progress === -1);
    let rolled = Math.floor(Math.random() * 6) + 1;
    if (allInBase && Math.random() < 0.25) {
      rolled = 6;
    }

    await new Promise((r) => window.setTimeout(r, 520));
    if (unmountedRef.current) return;

    setDiceValue(rolled);
    const valid = computeMovablePawns(pawns, activeSeat.slotIndex, rolled);

    if (valid.length === 0) {
      setBannerMsg(`Zar ${rolled} geldi — oynanabilir piyon yok, sıra geçiyor...`);
      await new Promise((r) => window.setTimeout(r, 750));
      if (unmountedRef.current) return;
      const nextTurn = (turnIndex + 1) % seats.length;
      sound.playTurnChange();
      setTurnIndex(nextTurn);
      setBannerMsg(`${seats[nextTurn].player.name} zar atmaya hazır!`);
      setPhase("wait_roll");
      return;
    }

    if (valid.length === 1 || activeSeat.isBot) {
      // Tek seçenek varsa (veya Bot ise en mantıklı taşı) otomatik ilerlet!
      let pick = valid[0];
      if (activeSeat.isBot && valid.length > 1) {
        // Bot kaleden çıkmayı veya rakip kırmayı tercih eder
        const inBase = valid.find((p) => p.progress === -1);
        if (inBase) pick = inBase;
      }
      setBannerMsg(`Zar ${rolled}! Piyon otomatik ilerliyor...`);
      await new Promise((r) => window.setTimeout(r, 260));
      if (unmountedRef.current) return;
      await executePawnMove(pick, rolled);
      return;
    }

    setMovablePawnIds(valid.map((v) => v.id));
    setBannerMsg(`Zar ${rolled}! İlerletmek istediğin parlayan piyonuna dokun!`);
    setPhase("pick_pawn");
  }, [
    phase,
    finalStandings,
    seats,
    turnIndex,
    pawns,
    computeMovablePawns,
    executePawnMove,
  ]);

  // Yapay Zeka Bot Sırası Geldiğinde Otomatik Zar At
  useEffect(() => {
    if (phase !== "wait_roll" || finalStandings) return;
    const activeSeat = seats[turnIndex];
    if (!activeSeat || !activeSeat.isBot) return;

    const timer = window.setTimeout(() => {
      void handleRollDice();
    }, 620);
    return () => window.clearTimeout(timer);
  }, [phase, turnIndex, finalStandings, seats, handleRollDice]);

  const activeSeat = seats[turnIndex] ?? seats[0];
  const activeTheme =
    SMARTBOARD_SLOTS[activeSeat.slotIndex % SMARTBOARD_SLOTS.length];
  const isAnimating = phase === "rolling" || phase === "moving";

  const playersHud: SmartboardPlayerHudState[] = seats.map((seat, idx) => {
    const myDone = pawns.filter(
      (p) => p.slotIndex === seat.slotIndex && p.progress === GOAL_STEP
    ).length;
    return {
      seat,
      actionScore: actionScores[idx] || 0,
      statLabel: `${myDone}/${pawnsPerPlayer} Hedef`,
      extraBadge:
        capturesCount[idx] > 0 ? `💥${capturesCount[idx]}` : undefined,
    };
  });

  // 15x15 Klasik Kızma Birader Hücre Hesaplayıcı (Ferah Krem/Beyaz Yürüyüş Yolu + Canlı Renkli Koridorlar)
  const renderBoardGrid = () => {
    const cells: React.ReactNode[] = [];

    const trackCoordMap = new Map<string, number>();
    MAIN_PATH_COORDS.forEach(([r, c], idx) => {
      trackCoordMap.set(`${r}-${c}`, idx);
    });

    const homeLaneMap = new Map<string, number>();
    Object.entries(HOME_LANES).forEach(([sIdx, coords]) => {
      coords.slice(0, 5).forEach(([r, c]) => {
        homeLaneMap.set(`${r}-${c}`, Number(sIdx));
      });
    });

    for (let r = 0; r < 15; r++) {
      for (let c = 0; c < 15; c++) {
        const key = `${r}-${c}`;
        const trackIdx = trackCoordMap.get(key);
        const laneOwner = homeLaneMap.get(key);

        const isTopLeftBase = r < 6 && c < 6;
        const isTopRightBase = r < 6 && c > 8;
        const isBottomRightBase = r > 8 && c > 8;
        const isBottomLeftBase = r > 8 && c < 6;
        const isCenterGoal = r >= 6 && r <= 8 && c >= 6 && c <= 8;

        // Köşe kaleleri ve merkez 3x3 hedef alanı özel katman olarak üstte çizilir
        if (
          isTopLeftBase ||
          isTopRightBase ||
          isBottomRightBase ||
          isBottomLeftBase ||
          isCenterGoal
        ) {
          cells.push(<div key={key} className="pointer-events-none" />);
          continue;
        }

        let cellStyle: React.CSSProperties = {
          backgroundColor: "#F8FAFC",
          borderColor: "#CBD5E1",
        };
        let iconContent: React.ReactNode = null;

        if (laneOwner !== undefined) {
          const lc = CLASSIC_LUDO_COLORS[laneOwner % 4];
          cellStyle = {
            backgroundColor: lc.main,
            borderColor: "#FFFFFF",
            boxShadow: "inset 0 2px 4px rgba(255,255,255,0.35)",
          };
        } else if (trackIdx !== undefined) {
          if (trackIdx === 0) {
            cellStyle = {
              backgroundColor: CLASSIC_LUDO_COLORS[0].main,
              borderColor: "#FFFFFF",
            };
            iconContent = (
              <span className="text-[11px] font-black text-white drop-shadow">
                ➔
              </span>
            );
          } else if (trackIdx === 13) {
            cellStyle = {
              backgroundColor: CLASSIC_LUDO_COLORS[1].main,
              borderColor: "#FFFFFF",
            };
            iconContent = (
              <span className="text-[11px] font-black text-white drop-shadow">
                ↓
              </span>
            );
          } else if (trackIdx === 26) {
            cellStyle = {
              backgroundColor: CLASSIC_LUDO_COLORS[2].main,
              borderColor: "#FFFFFF",
            };
            iconContent = (
              <span className="text-[11px] font-black text-white drop-shadow">
                ←
              </span>
            );
          } else if (trackIdx === 39) {
            cellStyle = {
              backgroundColor: CLASSIC_LUDO_COLORS[3].main,
              borderColor: "#FFFFFF",
            };
            iconContent = (
              <span className="text-[11px] font-black text-slate-900 drop-shadow">
                ↑
              </span>
            );
          } else if (SAFE_TRACK_INDICES.has(trackIdx)) {
            cellStyle = {
              backgroundColor: "#FEF3C7",
              borderColor: "#F59E0B",
            };
            iconContent = (
              <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-400 drop-shadow-sm" />
            );
          }
        }

        cells.push(
          <div
            key={key}
            style={cellStyle}
            className="relative flex items-center justify-center rounded-[5px] border shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]"
          >
            {iconContent}
          </div>
        );
      }
    }
    return cells;
  };

  return (
    <SmartboardFrame
      gameTitle="Hızlı Kızma Birader • Teneffüs Modu"
      gameIcon="🎲"
      modeSubtitle={`${seats.length} Kişilik • Oyuncu Başı ${pawnsPerPlayer} Piyon • 1 veya 6 Çıkış Kuralı`}
      playersHud={playersHud}
      activeSlotIndex={activeSeat.slotIndex}
      isAnimating={isAnimating}
      statusBannerText={bannerMsg}
      finalStandings={finalStandings}
      onBackToHub={onBackToHub}
      onRestartWithGate={onRequestNewGameWithGate}
      bottomBarContent={
        <div className="flex items-center gap-2">
          {/* Alt barda doğrudan erişilebilir büyük Zar ve Piyon Seçim butonları */}
          <motion.button
            type="button"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.94 }}
            disabled={phase !== "wait_roll" || activeSeat.isBot}
            onClick={() => void handleRollDice()}
            className={`min-h-[54px] px-6 inline-flex items-center gap-2.5 rounded-2xl bg-gradient-to-r ${activeTheme.buttonGradient} text-sm font-black text-white shadow-lg disabled:opacity-40 cursor-pointer`}
          >
            <Dices className="h-5 w-5" />
            <span>3D ZARI AT ({activeSeat.player.name})</span>
          </motion.button>

          {phase === "pick_pawn" &&
            movablePawnIds.map((id) => {
              const pObj = pawns.find((p) => p.id === id);
              if (!pObj) return null;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => void executePawnMove(pObj, diceValue)}
                  className={`min-h-[54px] px-4 rounded-2xl border-2 ${activeTheme.borderClass} ${activeTheme.bgSoftClass} text-xs font-black text-white animate-pulse cursor-pointer`}
                >
                  Piyon #{pObj.pawnIndex + 1} İlerlet (+{diceValue})
                </button>
              );
            })}
        </div>
      }
    >
      <div className="flex h-full w-full flex-col lg:flex-row items-center justify-center gap-4 p-1 sm:p-2">
        {/* SOL / MERKEZ: 15x15 GERÇEK KLASİK KIZMA BİRADER TAHTASI */}
        <motion.div
          animate={
            boardShake ? { x: [-8, 8, -6, 6, -3, 3, 0] } : { x: 0 }
          }
          transition={{ duration: 0.38 }}
          className="relative aspect-square h-full max-h-[580px] w-auto max-w-[580px] rounded-3xl border-[6px] border-amber-900/90 bg-[#E2E8F0] p-2 shadow-[0_20px_50px_rgba(0,0,0,0.65),inset_0_2px_6px_rgba(255,255,255,0.8)]"
        >
          <div className="relative h-full w-full overflow-hidden rounded-2xl border-2 border-slate-400 bg-[#CBD5E1]">
            <div
              className="grid h-full w-full gap-[2px] p-[2px]"
              style={{
                gridTemplateColumns: "repeat(15, minmax(0, 1fr))",
                gridTemplateRows: "repeat(15, minmax(0, 1fr))",
              }}
            >
              {renderBoardGrid()}
            </div>

            {/* 4 KÖŞE EV KALESİ (Canlı Mavi, Kırmızı, Yeşil, Sarı + İçleri Beyaz Çerçeveli Yuvalı) */}
            {(
              [
                { slot: 0, top: "0%", left: "0%" },
                { slot: 1, top: "0%", left: "60%" },
                { slot: 2, top: "60%", left: "60%" },
                { slot: 3, top: "60%", left: "0%" },
              ] as const
            ).map(({ slot, top, left }) => {
              const lc = CLASSIC_LUDO_COLORS[slot];
              const seatObj = seats.find((s) => s.slotIndex === slot);
              return (
                <div
                  key={`yard-${slot}`}
                  style={{
                    top,
                    left,
                    width: "40%",
                    height: "40%",
                    backgroundColor: lc.main,
                  }}
                  className="pointer-events-none absolute p-2.5 sm:p-3.5 border-2 border-white/85 shadow-inner flex flex-col justify-between"
                >
                  {/* Beyaz İç Avlu */}
                  <div className="relative flex-1 w-full rounded-2xl border-[3px] border-white bg-[#F8FAFC] shadow-[inset_0_3px_8px_rgba(15,23,42,0.16)]">
                    {seatObj && (
                      <div
                        className="absolute inset-x-1.5 top-1 flex items-center justify-center gap-1 truncate rounded-full px-2 py-0.5 text-[9px] sm:text-[10px] font-black text-white shadow-sm"
                        style={{ backgroundColor: lc.dark }}
                      >
                        <span>{seatObj.player.avatar}</span>
                        <span className="truncate">{seatObj.player.name}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Kaledeki 4 Yuvarlak Piyon Yuvası (Beyaz Çerçeveli Renkli Soketler) */}
            {Object.entries(BASE_PADS).map(([sKey, coords]) => {
              const slotNum = Number(sKey);
              const lc = CLASSIC_LUDO_COLORS[slotNum % 4];
              return coords.map(([pr, pc], idx) => {
                const leftPct = ((pc + 0.5) / 15) * 100;
                const topPct = ((pr + 0.5) / 15) * 100;
                return (
                  <div
                    key={`pad-${slotNum}-${idx}`}
                    style={{
                      left: `${leftPct}%`,
                      top: `${topPct}%`,
                      backgroundColor: lc.laneBg,
                      borderColor: lc.main,
                    }}
                    className="pointer-events-none absolute z-10 -ml-4 -mt-4 h-8 w-8 rounded-full border-[3px] shadow-[inset_0_2px_4px_rgba(15,23,42,0.22)]"
                  />
                );
              });
            })}

            {/* TAM MERKEZDE 4 RENKTEN OLUŞAN KLASİK ÜÇGEN BİTİŞ HEDEFİ (r: 6..8, c: 6..8) */}
            <div
              style={{
                left: "40%",
                top: "40%",
                width: "20%",
                height: "20%",
              }}
              className="pointer-events-none absolute z-10 overflow-hidden border-2 border-white shadow-md"
            >
              <svg viewBox="0 0 100 100" className="h-full w-full">
                {/* Sol Üçgen: Mavi (#3B82F6) */}
                <polygon
                  points="0,0 50,50 0,100"
                  fill="#3B82F6"
                  stroke="#FFFFFF"
                  strokeWidth="2"
                />
                {/* Üst Üçgen: Kırmızı (#EF4444) */}
                <polygon
                  points="0,0 100,0 50,50"
                  fill="#EF4444"
                  stroke="#FFFFFF"
                  strokeWidth="2"
                />
                {/* Sağ Üçgen: Yeşil (#22C55E) */}
                <polygon
                  points="100,0 100,100 50,50"
                  fill="#22C55E"
                  stroke="#FFFFFF"
                  strokeWidth="2"
                />
                {/* Alt Üçgen: Sarı (#FACC15) */}
                <polygon
                  points="0,100 100,100 50,50"
                  fill="#FACC15"
                  stroke="#FFFFFF"
                  strokeWidth="2"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="17"
                  fill="#FFFBEB"
                  stroke="#F59E0B"
                  strokeWidth="2.5"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center text-sm sm:text-base">
                👑
              </div>
            </div>

            {/* PİYONLAR KATMANI (Yay Fiziği ile Hareket Eden 3D Parlak Kızma Birader Piyonları) */}
            {pawns.map((pawn) => {
              const [r, c] = getPawnBoardCoord(pawn);
              const isMovable =
                phase === "pick_pawn" && movablePawnIds.includes(pawn.id);

              // Aynı karedeki birden fazla piyonu hafif kaydır
              const sameSquarePawns = pawns.filter((other) => {
                const [or, oc] = getPawnBoardCoord(other);
                return or === r && oc === c;
              });
              const stackIdx = sameSquarePawns.findIndex(
                (o) => o.id === pawn.id
              );
              const stackOffset =
                sameSquarePawns.length > 1 ? (stackIdx - 0.5) * 7 : 0;

              const leftPct = ((c + 0.5) / 15) * 100;
              const topPct = ((r + 0.5) / 15) * 100;

              return (
                <motion.button
                  key={pawn.id}
                  type="button"
                  disabled={!isMovable}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    if (isMovable) {
                      void executePawnMove(pawn, diceValue);
                    }
                  }}
                  animate={{
                    left: `calc(${leftPct}% + ${stackOffset}px)`,
                    top: `calc(${topPct}% + ${stackOffset}px)`,
                    scale: isMovable ? [1, 1.22, 1] : 1,
                    y: isMovable ? [0, -5, 0] : 0,
                  }}
                  transition={{
                    left: { type: "spring", stiffness: 360, damping: 26 },
                    top: { type: "spring", stiffness: 360, damping: 26 },
                    scale: isMovable
                      ? { repeat: Infinity, duration: 0.72 }
                      : { duration: 0.2 },
                    y: isMovable
                      ? { repeat: Infinity, duration: 0.72 }
                      : { duration: 0.2 },
                  }}
                  className={`absolute z-30 -ml-[22px] -mt-[32px] flex h-12 w-11 items-center justify-center rounded-full ${
                    isMovable
                      ? "cursor-pointer z-40 drop-shadow-[0_0_12px_rgba(255,255,255,0.95)]"
                      : "pointer-events-none"
                  }`}
                >
                  {isMovable && (
                    <span className="pointer-events-none absolute -bottom-1 h-4 w-8 rounded-full border-2 border-white bg-amber-300/60 animate-ping" />
                  )}
                  <Classic3DPawnSvg
                    slotIndex={pawn.slotIndex}
                    pawnNumber={pawn.pawnIndex + 1}
                  />
                </motion.button>
              );
            })}
          </div>
        </motion.div>

        {/* SAĞ / YAN: AKILLI TAHTA ERİŞİLEBİLİR DEV 3D FİLDİŞİ ZAR KULESİ */}
        <div className="flex w-full max-w-[300px] flex-col items-center justify-center gap-3 rounded-3xl border border-amber-300/25 bg-slate-900/92 p-4 shadow-xl">
          <div className="text-center">
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-3 py-0.5 text-[10px] font-black uppercase ${activeTheme.badgeClass}`}
            >
              <Sparkles className="h-3 w-3" /> {activeTheme.label} •{" "}
              {CLASSIC_LUDO_COLORS[activeSeat.slotIndex % 4].name}
            </span>
            <h3 className="mt-1 text-base font-black text-white">
              {activeSeat.player.avatar} {activeSeat.player.name}
            </h3>
          </div>

          {/* 3D YUVARLATILMIŞ FİLDİŞİ ZAR KÜPÜ (Dokunmatik Hedef >= 112x112px) */}
          <motion.button
            key={diceSpinKey}
            type="button"
            disabled={phase !== "wait_roll" || activeSeat.isBot}
            onPointerDown={(e) => {
              e.preventDefault();
              if (phase === "wait_roll" && !activeSeat.isBot) {
                void handleRollDice();
              }
            }}
            animate={
              phase === "rolling"
                ? {
                    rotateX: [0, 360, 720],
                    rotateY: [0, -360, -720],
                    rotateZ: [0, 180, 360],
                    scale: [1, 1.22, 1],
                  }
                : { rotateX: 0, rotateY: 0, rotateZ: 0, scale: 1 }
            }
            transition={{ duration: 0.5, ease: "easeOut" }}
            className={`relative flex h-28 w-28 items-center justify-center rounded-[28px] border-[3px] text-slate-950 ${
              phase === "wait_roll" && !activeSeat.isBot
                ? "cursor-pointer hover:scale-105"
                : "cursor-default"
            }`}
            style={{
              borderColor: CLASSIC_LUDO_COLORS[activeSeat.slotIndex % 4].main,
              background:
                "radial-gradient(circle at 28% 24%, #FFFFFF 0%, #FDFBF7 48%, #E6DEC8 100%)",
              boxShadow: `0 12px 26px rgba(0,0,0,0.45), inset 0 3px 6px #FFFFFF, inset 0 -5px 10px rgba(180,165,135,0.65), 0 0 26px ${
                CLASSIC_LUDO_COLORS[activeSeat.slotIndex % 4].main
              }66`,
            }}
          >
            {/* Zar Noktaları (1 ve 6 Kırmızı, Diğerleri Klasik Siyah Çukur Noktalı) */}
            <div className="grid h-20 w-20 grid-cols-3 grid-rows-3 place-items-center p-1">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((cellIdx) => {
                const pipMap: Record<number, number[]> = {
                  1: [4],
                  2: [0, 8],
                  3: [0, 4, 8],
                  4: [0, 2, 6, 8],
                  5: [0, 2, 4, 6, 8],
                  6: [0, 2, 3, 5, 6, 8],
                };
                const show = (pipMap[diceValue] || [4]).includes(cellIdx);
                const isRedPip = diceValue === 1 || diceValue === 6;
                return (
                  <span
                    key={cellIdx}
                    className={` rounded-full transition-transform ${
                      diceValue === 1 && cellIdx === 4
                        ? "h-5 w-5"
                        : "h-3.5 w-3.5"
                    } ${
                      show
                        ? isRedPip
                          ? "bg-gradient-to-b from-red-500 to-red-700 scale-110 shadow-[inset_0_1px_2px_rgba(0,0,0,0.45)]"
                          : "bg-gradient-to-b from-slate-800 to-slate-950 shadow-[inset_0_1px_2px_rgba(0,0,0,0.6)]"
                        : "opacity-0"
                    }`}
                  />
                );
              })}
            </div>
          </motion.button>

          <div className="text-center text-xs font-bold text-slate-300">
            {phase === "wait_roll"
              ? "Fildişi zara veya aşağıdaki butona dokun!"
              : phase === "rolling"
              ? "3D Fildişi Zar dönüyor..."
              : phase === "pick_pawn"
              ? "Tahtadaki parlayan 3D piyonuna dokun!"
              : "Piyon ilerliyor..."}
          </div>

          <div className="w-full rounded-2xl border border-white/10 bg-slate-950/75 p-2.5 text-[11px] text-slate-300 space-y-1">
            <div>
              ⭐ <strong className="text-amber-300">Yıldızlı Kareler:</strong>{" "}
              Güvenli bölge (taş kırılmaz).
            </div>
            <div>
              🎯 <strong className="text-emerald-300">Hedefe Ulaşma:</strong>{" "}
              Eve giren piyon <strong>+400 Puan + Ekstra Zar!</strong>
            </div>
            <div>
              💥 <strong className="text-rose-300">Kırma Ödülü:</strong> Rakip
              kırana <strong>+250 Puan + Ekstra Zar!</strong>
            </div>
          </div>
        </div>
      </div>
    </SmartboardFrame>
  );
}

