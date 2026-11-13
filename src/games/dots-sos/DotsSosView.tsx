"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import confetti from "canvas-confetti";
import { Grid, Zap } from "lucide-react";
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

// Kare Kapmaca Boyutu: 6 Sütun Kutu x 4 Satır Kutu (7x5 Nokta Matrisi = 24 Kutu)
const BOX_COLS = 6;
const BOX_ROWS = 4;

// SOS Arenası Boyutu: 7 Sütun x 5 Satır Yatay Izgara (35 Kare)
const SOS_COLS = 7;
const SOS_ROWS = 5;

interface SosLaserLine {
  id: string;
  r1: number;
  c1: number;
  r2: number;
  c2: number;
  ownerSlot: number;
}

interface SosCell {
  letter: "S" | "O" | null;
  ownerSlot: number | null;
}

interface DotsSosViewProps {
  seats: MultiplayerSeat[];
  initialSubMode?: string; // "dots" | "sos"
  onBackToHub: () => void;
  onRequestNewGameWithGate: () => void;
  onComboEnergyChange?: (level: number) => void;
}

export default function DotsSosView({
  seats,
  initialSubMode = "dots",
  onBackToHub,
  onRequestNewGameWithGate,
  onComboEnergyChange,
}: DotsSosViewProps) {
  const [subMode, setSubMode] = useState<"dots" | "sos">(
    initialSubMode === "sos" ? "sos" : "dots"
  );

  // Ortak sıra ve skor durumu
  const [turnIndex, setTurnIndex] = useState<number>(0);
  const [actionScores, setActionScores] = useState<number[]>(() =>
    seats.map(() => 0)
  );
  const [capturedCounts, setCapturedCounts] = useState<number[]>(() =>
    seats.map(() => 0)
  );
  const [streaks, setStreaks] = useState<number[]>(() => seats.map(() => 0));
  const [isAnimating, setIsAnimating] = useState<boolean>(false);
  const [bannerText, setBannerText] = useState<string>("");
  const [finalStandings, setFinalStandings] = useState<
    MultiplayerFinalStanding[] | null
  >(null);

  // --- MOD A: KARE KAPMACA (DOTS & BOXES) DURUMU ---
  // Yatay çizgiler: (BOX_ROWS + 1) x BOX_COLS
  const [hLines, setHLines] = useState<(number | null)[][]>(() =>
    Array.from({ length: BOX_ROWS + 1 }, () => Array(BOX_COLS).fill(null))
  );
  // Dikey çizgiler: BOX_ROWS x (BOX_COLS + 1)
  const [vLines, setVLines] = useState<(number | null)[][]>(() =>
    Array.from({ length: BOX_ROWS }, () => Array(BOX_COLS + 1).fill(null))
  );
  // Tamamlanan kutular: BOX_ROWS x BOX_COLS -> ownerSlot
  const [boxes, setBoxes] = useState<(number | null)[][]>(() =>
    Array.from({ length: BOX_ROWS }, () => Array(BOX_COLS).fill(null))
  );

  // --- MOD B: SOS ARENASI DURUMU ---
  const [sosGrid, setSosGrid] = useState<SosCell[][]>(() =>
    Array.from({ length: SOS_ROWS }, () =>
      Array.from({ length: SOS_COLS }, () => ({ letter: null, ownerSlot: null }))
    )
  );
  const [selectedLetter, setSelectedLetter] = useState<"S" | "O">("S");
  const [sosLasers, setSosLasers] = useState<SosLaserLine[]>([]);

  const recordedRef = useRef(false);
  const unmountedRef = useRef(false);

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
    };
  }, []);

  // Mod değiştirildiğinde (henüz maç bitmemişse) sıfırla
  const switchArenaMode = (nextMode: "dots" | "sos") => {
    if (isAnimating || finalStandings) return;
    sound.playClick();
    setSubMode(nextMode);
    setTurnIndex(0);
    setActionScores(seats.map(() => 0));
    setCapturedCounts(seats.map(() => 0));
    setStreaks(seats.map(() => 0));
    setHLines(
      Array.from({ length: BOX_ROWS + 1 }, () => Array(BOX_COLS).fill(null))
    );
    setVLines(
      Array.from({ length: BOX_ROWS }, () => Array(BOX_COLS + 1).fill(null))
    );
    setBoxes(
      Array.from({ length: BOX_ROWS }, () => Array(BOX_COLS).fill(null))
    );
    setSosGrid(
      Array.from({ length: SOS_ROWS }, () =>
        Array.from({ length: SOS_COLS }, () => ({
          letter: null,
          ownerSlot: null,
        }))
      )
    );
    setSosLasers([]);
    setBannerText("");
  };

  const finishMatch = useCallback(
    async (latestCounts: number[], latestScores: number[]) => {
      if (recordedRef.current) return;
      recordedRef.current = true;

      sound.playVictory();
      confetti({
        particleCount: 110,
        spread: 80,
        origin: { y: 0.55 },
      });

      const ranked = seats
        .map((seat, idx) => ({
          seat,
          slotIndex: seat.slotIndex,
          count: latestCounts[idx] || 0,
          score: latestScores[idx] || 0,
        }))
        .sort((a, b) => {
          if (b.count !== a.count) return b.count - a.count;
          return b.score - a.score;
        });

      const standingsInput = ranked.map((r, i) => {
        const rank = i + 1;
        const cappedInGame = Math.min(2200, r.score);
        // Maç Galibiyeti +2.000, diğer sıralar dengeli teselli bonusu
        const matchBonus =
          rank === 1 ? 2000 : rank === 2 ? 850 : rank === 3 ? 500 : 350;
        return {
          slotIndex: r.slotIndex,
          player: r.seat.player,
          isBot: r.seat.isBot,
          rank,
          actionScore: cappedInGame,
          customFinalScore: cappedInGame + matchBonus,
          statSummary:
            subMode === "dots"
              ? `${r.count} Kare Mühürledi • ${cappedInGame.toLocaleString("tr-TR")} P`
              : `${r.count} SOS Yaptı • ${cappedInGame.toLocaleString("tr-TR")} P`,
        };
      });

      const res = await recordMultiplayerMatchResult({
        game: "dotsSos",
        standings: standingsInput,
        modeLabel: subMode === "dots" ? "Kare Kapmaca" : "SOS Arenası",
      });
      if (!unmountedRef.current) {
        setFinalStandings(res);
      }
    },
    [seats, subMode]
  );

  // --- KARE KAPMACA HAMLESİ ---
  const handleDrawEdge = useCallback(
    async (kind: "h" | "v", r: number, c: number) => {
      if (isAnimating || finalStandings || subMode !== "dots") return;
      const activeSeat = seats[turnIndex];
      if (!activeSeat) return;
      const slotIdx = activeSeat.slotIndex;

      if (kind === "h" && hLines[r][c] !== null) return;
      if (kind === "v" && vLines[r][c] !== null) return;

      setIsAnimating(true);
      sound.playLaserLine();

      const nextH = hLines.map((row) => [...row]);
      const nextV = vLines.map((row) => [...row]);
      const nextB = boxes.map((row) => [...row]);

      if (kind === "h") nextH[r][c] = slotIdx;
      else nextV[r][c] = slotIdx;

      // Yeni tamamlanan kutu var mı kontrol et
      let newlySealed = 0;
      for (let br = 0; br < BOX_ROWS; br++) {
        for (let bc = 0; bc < BOX_COLS; bc++) {
          if (nextB[br][bc] === null) {
            const top = nextH[br][bc] !== null;
            const bottom = nextH[br + 1][bc] !== null;
            const left = nextV[br][bc] !== null;
            const right = nextV[br][bc + 1] !== null;
            if (top && bottom && left && right) {
              nextB[br][bc] = slotIdx;
              newlySealed += 1;
            }
          }
        }
      }

      const nextScores = [...actionScores];
      const nextCounts = [...capturedCounts];
      const nextStreaks = [...streaks];

      if (newlySealed > 0) {
        const curStr = (nextStreaks[slotIdx] || 0) + newlySealed;
        nextStreaks[slotIdx] = curStr;
        // Tamamlanan kare başına +75 (seri çarpanı maksimum 1.5x, oyun içi tavan 2.200)
        const mult = Math.min(1.5, 1 + (curStr - 1) * 0.25);
        const pts = Math.round(newlySealed * 75 * mult);
        nextScores[slotIdx] = Math.min(
          2200,
          (nextScores[slotIdx] || 0) + pts
        );
      } else {
        nextStreaks[slotIdx] = 0;
      }
      nextCounts[slotIdx] = (nextCounts[slotIdx] || 0) + newlySealed;

      setHLines(nextH);
      setVLines(nextV);
      setBoxes(nextB);
      setActionScores(nextScores);
      setCapturedCounts(nextCounts);
      setStreaks(nextStreaks);

      if (newlySealed > 0) {
        sound.playLaserSos(newlySealed);
        onComboEnergyChange?.(Math.min(5, newlySealed + 1));
        setBannerText(
          `🔥 ${activeSeat.player.name} ${newlySealed} Kare Mühürledi! Ekstra Hamle Hakkı!`
        );
      } else {
        onComboEnergyChange?.(0);
        setBannerText("");
      }

      await new Promise((res) => window.setTimeout(res, 220));
      if (unmountedRef.current) return;

      // Tüm kutular doldu mu?
      const totalSealed = nextCounts.reduce((a, b) => a + b, 0);
      if (totalSealed >= BOX_ROWS * BOX_COLS) {
        setIsAnimating(false);
        await finishMatch(nextCounts, nextScores);
        return;
      }

      if (newlySealed === 0) {
        const nextTurn = (turnIndex + 1) % seats.length;
        sound.playTurnChange();
        setTurnIndex(nextTurn);
      }
      setIsAnimating(false);
    },
    [
      isAnimating,
      finalStandings,
      subMode,
      seats,
      turnIndex,
      hLines,
      vLines,
      boxes,
      actionScores,
      capturedCounts,
      streaks,
      finishMatch,
      onComboEnergyChange,
    ]
  );

  // --- SOS ARENASI HAMLESİ ---
  const handlePlaceSosLetter = useCallback(
    async (r: number, c: number, letterOverride?: "S" | "O") => {
      if (isAnimating || finalStandings || subMode !== "sos") return;
      const activeSeat = seats[turnIndex];
      if (!activeSeat) return;
      const slotIdx = activeSeat.slotIndex;

      if (sosGrid[r][c].letter !== null) return;

      const placedLetter = letterOverride ?? selectedLetter;
      setIsAnimating(true);
      sound.playLaserLine();

      const nextGrid = sosGrid.map((row) => row.map((cell) => ({ ...cell })));
      nextGrid[r][c] = { letter: placedLetter, ownerSlot: slotIdx };

      // Bu hamleyle oluşan yeni S-O-S dizilerini tespit et
      const newLasers: SosLaserLine[] = [];
      const inBounds = (rr: number, cc: number) =>
        rr >= 0 && rr < SOS_ROWS && cc >= 0 && cc < SOS_COLS;

      if (placedLetter === "S") {
        const dirs = [
          [-1, -1], [-1, 0], [-1, 1],
          [0, -1],           [0, 1],
          [1, -1],  [1, 0],  [1, 1],
        ];
        for (const [dr, dc] of dirs) {
          const r1 = r + dr;
          const c1 = c + dc;
          const r2 = r + 2 * dr;
          const c2 = c + 2 * dc;
          if (
            inBounds(r1, c1) &&
            inBounds(r2, c2) &&
            nextGrid[r1][c1].letter === "O" &&
            nextGrid[r2][c2].letter === "S"
          ) {
            newLasers.push({
              id: `sos_${r}_${c}_${r2}_${c2}_${Date.now()}_${dr}_${dc}`,
              r1: r,
              c1: c,
              r2,
              c2,
              ownerSlot: slotIdx,
            });
          }
        }
      } else {
        // 'O' harfi merkezde mi? 4 ekseni kontrol et
        const axes = [
          [0, 1],
          [1, 0],
          [1, 1],
          [1, -1],
        ];
        for (const [dr, dc] of axes) {
          const rA = r - dr;
          const cA = c - dc;
          const rB = r + dr;
          const cB = c + dc;
          if (
            inBounds(rA, cA) &&
            inBounds(rB, cB) &&
            nextGrid[rA][cA].letter === "S" &&
            nextGrid[rB][cB].letter === "S"
          ) {
            newLasers.push({
              id: `sos_${rA}_${cA}_${rB}_${cB}_${Date.now()}_${dr}_${dc}`,
              r1: rA,
              c1: cA,
              r2: rB,
              c2: cB,
              ownerSlot: slotIdx,
            });
          }
        }
      }

      const sosFormed = newLasers.length;
      const nextScores = [...actionScores];
      const nextCounts = [...capturedCounts];
      const nextStreaks = [...streaks];

      if (sosFormed > 0) {
        const curStr = (nextStreaks[slotIdx] || 0) + sosFormed;
        nextStreaks[slotIdx] = curStr;
        // Tamamlanan SOS başına +75 (seri çarpanı maksimum 1.5x, oyun içi tavan 2.200)
        const mult = Math.min(1.5, 1 + (curStr - 1) * 0.25);
        const pts = Math.round(sosFormed * 75 * mult);
        nextScores[slotIdx] = Math.min(
          2200,
          (nextScores[slotIdx] || 0) + pts
        );
      } else {
        nextStreaks[slotIdx] = 0;
      }
      nextCounts[slotIdx] = (nextCounts[slotIdx] || 0) + sosFormed;

      setSosGrid(nextGrid);
      setSosLasers((prev) => [...prev, ...newLasers]);
      setActionScores(nextScores);
      setCapturedCounts(nextCounts);
      setStreaks(nextStreaks);

      if (sosFormed > 0) {
        sound.playLaserSos(sosFormed);
        onComboEnergyChange?.(Math.min(6, sosFormed + 1));
        setBannerText(
          `⚡ ${activeSeat.player.name} ${sosFormed}x S-O-S Yaptı! Ekstra Hamle Hakkı!`
        );
      } else {
        onComboEnergyChange?.(0);
        setBannerText("");
      }

      await new Promise((res) => window.setTimeout(res, 260));
      if (unmountedRef.current) return;

      // Tablo tamamen doldu mu?
      const hasEmpty = nextGrid.some((row) =>
        row.some((cell) => cell.letter === null)
      );
      if (!hasEmpty) {
        setIsAnimating(false);
        await finishMatch(nextCounts, nextScores);
        return;
      }

      if (sosFormed === 0) {
        const nextTurn = (turnIndex + 1) % seats.length;
        sound.playTurnChange();
        setTurnIndex(nextTurn);
      }
      setIsAnimating(false);
    },
    [
      isAnimating,
      finalStandings,
      subMode,
      seats,
      turnIndex,
      sosGrid,
      selectedLetter,
      actionScores,
      capturedCounts,
      streaks,
      finishMatch,
      onComboEnergyChange,
    ]
  );

  // Yapay Zeka Bot Hamlesi
  useEffect(() => {
    if (isAnimating || finalStandings) return;
    const activeSeat = seats[turnIndex];
    if (!activeSeat || !activeSeat.isBot) return;

    const timer = window.setTimeout(() => {
      if (subMode === "dots") {
        // Önce 3 kenarı dolu kutuyu tamamlayacak çizgiyi ara
        const countSides = (br: number, bc: number) => {
          let s = 0;
          if (hLines[br][bc] !== null) s++;
          if (hLines[br + 1][bc] !== null) s++;
          if (vLines[br][bc] !== null) s++;
          if (vLines[br][bc + 1] !== null) s++;
          return s;
        };

        const allEdges: { kind: "h" | "v"; r: number; c: number; priority: number }[] = [];
        for (let r = 0; r <= BOX_ROWS; r++) {
          for (let c = 0; c < BOX_COLS; c++) {
            if (hLines[r][c] === null) {
              let p = Math.random() * 5;
              if (r > 0 && countSides(r - 1, c) === 3) p += 100;
              if (r < BOX_ROWS && countSides(r, c) === 3) p += 100;
              if (r > 0 && countSides(r - 1, c) === 2) p -= 30;
              if (r < BOX_ROWS && countSides(r, c) === 2) p -= 30;
              allEdges.push({ kind: "h", r, c, priority: p });
            }
          }
        }
        for (let r = 0; r < BOX_ROWS; r++) {
          for (let c = 0; c <= BOX_COLS; c++) {
            if (vLines[r][c] === null) {
              let p = Math.random() * 5;
              if (c > 0 && countSides(r, c - 1) === 3) p += 100;
              if (c < BOX_COLS && countSides(r, c) === 3) p += 100;
              if (c > 0 && countSides(r, c - 1) === 2) p -= 30;
              if (c < BOX_COLS && countSides(r, c) === 2) p -= 30;
              allEdges.push({ kind: "v", r, c, priority: p });
            }
          }
        }
        if (allEdges.length > 0) {
          allEdges.sort((a, b) => b.priority - a.priority);
          const pick = allEdges[0];
          void handleDrawEdge(pick.kind, pick.r, pick.c);
        }
      } else {
        // SOS Botu: Boş karelerden birine S veya O koy
        const empties: [number, number][] = [];
        for (let r = 0; r < SOS_ROWS; r++) {
          for (let c = 0; c < SOS_COLS; c++) {
            if (sosGrid[r][c].letter === null) empties.push([r, c]);
          }
        }
        if (empties.length > 0) {
          const [rr, cc] =
            empties[Math.floor(Math.random() * empties.length)];
          const botChar: "S" | "O" = Math.random() < 0.55 ? "S" : "O";
          setSelectedLetter(botChar);
          void handlePlaceSosLetter(rr, cc, botChar);
        }
      }
    }, 520);

    return () => window.clearTimeout(timer);
  }, [
    isAnimating,
    finalStandings,
    seats,
    turnIndex,
    subMode,
    hLines,
    vLines,
    sosGrid,
    handleDrawEdge,
    handlePlaceSosLetter,
  ]);

  const activeSeat = seats[turnIndex] ?? seats[0];
  const activeTheme =
    SMARTBOARD_SLOTS[activeSeat.slotIndex % SMARTBOARD_SLOTS.length];

  const playersHud: SmartboardPlayerHudState[] = seats.map((seat, idx) => ({
    seat,
    actionScore: actionScores[idx] || 0,
    statLabel:
      subMode === "dots"
        ? `${capturedCounts[idx] || 0} Kare`
        : `${capturedCounts[idx] || 0} SOS`,
  }));

  return (
    <SmartboardFrame
      gameTitle={
        subMode === "dots"
          ? "Neon Kare Kapmaca (Dots & Boxes)"
          : "SOS Lazer Arenası"
      }
      gameIcon="✨"
      modeSubtitle={`${seats.length} Kişilik Akıllı Tahta • ${
        subMode === "dots" ? "Kareyi Mühürleyen Ekstra Oynar" : "SOS Yapan Ekstra Oynar"
      }`}
      playersHud={playersHud}
      activeSlotIndex={activeSeat.slotIndex}
      isAnimating={isAnimating}
      statusBannerText={
        bannerText ||
        (subMode === "dots"
          ? "İki nokta arasındaki çizgiye dokunarak kareyi mühürle!"
          : `Alt bardan S veya O seç (${selectedLetter} seçili) ve boş kareye dokun!`)
      }
      finalStandings={finalStandings}
      onBackToHub={onBackToHub}
      onRestartWithGate={onRequestNewGameWithGate}
      bottomBarContent={
        <div className="flex flex-wrap items-center justify-center gap-2">
          {/* Mod Geçiş Butonları */}
          <div className="flex items-center gap-1 rounded-2xl border border-white/15 bg-slate-950/90 p-1">
            <button
              type="button"
              onClick={() => switchArenaMode("dots")}
              className={`min-h-[46px] px-3.5 rounded-xl text-xs font-black transition cursor-pointer ${
                subMode === "dots"
                  ? "bg-fuchsia-600 text-white shadow"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Grid className="inline h-3.5 w-3.5 mr-1" /> Kare Kapmaca
            </button>
            <button
              type="button"
              onClick={() => switchArenaMode("sos")}
              className={`min-h-[46px] px-3.5 rounded-xl text-xs font-black transition cursor-pointer ${
                subMode === "sos"
                  ? "bg-cyan-600 text-white shadow"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Zap className="inline h-3.5 w-3.5 mr-1" /> SOS Arenası
            </button>
          </div>

          {/* SOS Modunda Dev S ve O Seçim Butonları (Min 64x52px) */}
          {subMode === "sos" && (
            <div className="flex items-center gap-2">
              {(["S", "O"] as const).map((ch) => {
                const isSel = selectedLetter === ch;
                return (
                  <button
                    key={ch}
                    type="button"
                    onClick={() => {
                      sound.playClick();
                      setSelectedLetter(ch);
                    }}
                    className={`min-h-[52px] min-w-[74px] flex items-center justify-center gap-1.5 rounded-2xl border-2 text-lg font-black transition cursor-pointer ${
                      isSel
                        ? `${activeTheme.borderClass} bg-gradient-to-r ${activeTheme.buttonGradient} text-white shadow-lg scale-105`
                        : "border-white/15 bg-slate-950/80 text-slate-300"
                    }`}
                  >
                    <span>{ch}</span>
                    <span className="text-[10px] font-bold opacity-85">
                      HARFİ
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      }
    >
      {subMode === "dots" ? (
        /* MOD A: NEON KARE KAPMACA (CANLI RENKLİ TAHTA + PARLAK OYUNCU KUTULARI) */
        <div className="flex h-full w-full items-center justify-center p-2">
          <div className="relative w-full max-w-[960px] h-full max-h-[540px] rounded-3xl border-[4px] border-indigo-400/50 bg-gradient-to-br from-indigo-950/95 via-slate-900/95 to-purple-950/95 p-5 sm:p-7 shadow-[0_20px_50px_rgba(0,0,0,0.65)]">
            <div className="relative h-full w-full">
              {/* Tamamlanan Kareler (Oyuncu Avatarı ve Canlı Gradyan Rengiyle Mühürlenir) */}
              {boxes.map((row, br) =>
                row.map((ownerSlot, bc) => {
                  const leftPct = (bc / BOX_COLS) * 100;
                  const topPct = (br / BOX_ROWS) * 100;
                  const wPct = (1 / BOX_COLS) * 100;
                  const hPct = (1 / BOX_ROWS) * 100;
                  const ownerSeat =
                    ownerSlot !== null
                      ? seats.find((s) => s.slotIndex === ownerSlot)
                      : null;
                  const oTheme =
                    ownerSlot !== null
                      ? SMARTBOARD_SLOTS[ownerSlot % SMARTBOARD_SLOTS.length]
                      : null;

                  return (
                    <div
                      key={`box-${br}-${bc}`}
                      className="absolute flex items-center justify-center p-1.5"
                      style={{
                        left: `${leftPct}%`,
                        top: `${topPct}%`,
                        width: `${wPct}%`,
                        height: `${hPct}%`,
                      }}
                    >
                      {ownerSeat && oTheme ? (
                        <motion.div
                          initial={{ scale: 0.3, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{
                            type: "spring",
                            stiffness: 420,
                            damping: 24,
                          }}
                          className={`flex h-full w-full flex-col items-center justify-center rounded-2xl border-2 border-white/80 bg-gradient-to-br ${oTheme.buttonGradient} shadow-lg`}
                          style={{
                            boxShadow: `0 6px 20px ${oTheme.hex}66, inset 0 2px 6px rgba(255,255,255,0.45)`,
                          }}
                        >
                          <span className="text-2xl sm:text-3xl leading-none drop-shadow">
                            {ownerSeat.player.avatar}
                          </span>
                          <span className="mt-0.5 truncate max-w-[90%] text-[10px] font-black text-white drop-shadow">
                            {ownerSeat.player.name}
                          </span>
                        </motion.div>
                      ) : (
                        <div className="h-full w-full rounded-2xl bg-white/[0.04] border border-white/5" />
                      )}
                    </div>
                  );
                })
              )}

              {/* YATAY ÇİZGİLER (Geniş 52px+ Dokunmatik Hitbox) */}
              {hLines.map((row, hr) =>
                row.map((ownerSlot, hc) => {
                  const leftPct = (hc / BOX_COLS) * 100;
                  const topPct = (hr / BOX_ROWS) * 100;
                  const wPct = (1 / BOX_COLS) * 100;
                  const drawn = ownerSlot !== null;
                  const lTheme =
                    ownerSlot !== null
                      ? SMARTBOARD_SLOTS[ownerSlot % SMARTBOARD_SLOTS.length]
                      : null;

                  return (
                    <button
                      key={`h-${hr}-${hc}`}
                      type="button"
                      disabled={drawn || isAnimating || activeSeat.isBot}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        if (!drawn && !isAnimating && !activeSeat.isBot) {
                          void handleDrawEdge("h", hr, hc);
                        }
                      }}
                      className="group absolute z-20 -translate-y-1/2 flex h-[52px] items-center justify-center px-3 cursor-pointer disabled:cursor-default focus:outline-none"
                      style={{
                        left: `${leftPct}%`,
                        top: `${topPct}%`,
                        width: `${wPct}%`,
                      }}
                    >
                      <span
                        className={`h-3 w-full rounded-full transition-all ${
                          drawn
                            ? ""
                            : "bg-white/10 group-hover:bg-white/35"
                        }`}
                        style={
                          drawn && lTheme
                            ? {
                                backgroundColor: lTheme.hex,
                                boxShadow: `0 0 16px ${lTheme.hex}`,
                              }
                            : undefined
                        }
                      />
                    </button>
                  );
                })
              )}

              {/* DİKEY ÇİZGİLER (Geniş 52px+ Dokunmatik Hitbox) */}
              {vLines.map((row, vr) =>
                row.map((ownerSlot, vc) => {
                  const leftPct = (vc / BOX_COLS) * 100;
                  const topPct = (vr / BOX_ROWS) * 100;
                  const hPct = (1 / BOX_ROWS) * 100;
                  const drawn = ownerSlot !== null;
                  const lTheme =
                    ownerSlot !== null
                      ? SMARTBOARD_SLOTS[ownerSlot % SMARTBOARD_SLOTS.length]
                      : null;

                  return (
                    <button
                      key={`v-${vr}-${vc}`}
                      type="button"
                      disabled={drawn || isAnimating || activeSeat.isBot}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        if (!drawn && !isAnimating && !activeSeat.isBot) {
                          void handleDrawEdge("v", vr, vc);
                        }
                      }}
                      className="group absolute z-20 -translate-x-1/2 flex w-[52px] items-center justify-center py-3 cursor-pointer disabled:cursor-default focus:outline-none"
                      style={{
                        left: `${leftPct}%`,
                        top: `${topPct}%`,
                        height: `${hPct}%`,
                      }}
                    >
                      <span
                        className={`w-3 h-full rounded-full transition-all ${
                          drawn
                            ? ""
                            : "bg-white/10 group-hover:bg-white/35"
                        }`}
                        style={
                          drawn && lTheme
                            ? {
                                backgroundColor: lTheme.hex,
                                boxShadow: `0 0 16px ${lTheme.hex}`,
                              }
                            : undefined
                        }
                      />
                    </button>
                  );
                })
              )}

              {/* KÖŞE NOKTALARI (Neon Pim Noktaları) */}
              {Array.from({ length: BOX_ROWS + 1 }).map((_, dr) =>
                Array.from({ length: BOX_COLS + 1 }).map((__, dc) => {
                  const leftPct = (dc / BOX_COLS) * 100;
                  const topPct = (dr / BOX_ROWS) * 100;
                  return (
                    <span
                      key={`dot-${dr}-${dc}`}
                      className="pointer-events-none absolute z-30 -ml-2.5 -mt-2.5 h-5 w-5 rounded-full border-2 border-slate-900 bg-white shadow-[0_0_12px_rgba(255,255,255,0.8)]"
                      style={{
                        left: `${leftPct}%`,
                        top: `${topPct}%`,
                      }}
                    />
                  );
                })
              )}
            </div>
          </div>
        </div>
      ) : (
        /* MOD B: SOS LAZER ARENASI (CANLI RENKLİ KARTLAR + LAZER ÇİZGİ KATMANI) */
        <div className="flex h-full w-full items-center justify-center p-2">
          <div className="relative w-full max-w-[980px] h-full max-h-[540px] rounded-3xl border-[4px] border-indigo-400/50 bg-gradient-to-br from-indigo-950/95 via-slate-900/95 to-purple-950/95 p-3 sm:p-4 shadow-2xl">
            <div
              className="grid h-full w-full gap-2"
              style={{
                gridTemplateColumns: `repeat(${SOS_COLS}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${SOS_ROWS}, minmax(0, 1fr))`,
              }}
            >
              {sosGrid.map((row, r) =>
                row.map((cell, c) => {
                  const filled = cell.letter !== null;
                  const cTheme =
                    cell.ownerSlot !== null
                      ? SMARTBOARD_SLOTS[
                          cell.ownerSlot % SMARTBOARD_SLOTS.length
                        ]
                      : null;

                  return (
                    <button
                      key={`sos-${r}-${c}`}
                      type="button"
                      disabled={filled || isAnimating || activeSeat.isBot}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        if (!filled && !isAnimating && !activeSeat.isBot) {
                          void handlePlaceSosLetter(r, c);
                        }
                      }}
                      className={`relative flex min-h-[54px] min-w-[54px] items-center justify-center rounded-2xl border-2 text-2xl sm:text-3xl font-black transition select-none ${
                        filled && cTheme
                          ? `border-white/85 bg-gradient-to-br ${cTheme.buttonGradient} text-white shadow-lg`
                          : "border-indigo-300/25 bg-indigo-900/40 hover:border-cyan-300/70 hover:bg-indigo-800/55 text-white cursor-pointer shadow-inner"
                      }`}
                      style={
                        filled && cTheme
                          ? {
                              textShadow: "0 2px 6px rgba(0,0,0,0.45)",
                              boxShadow: `0 4px 16px ${cTheme.hex}66`,
                            }
                          : undefined
                      }
                    >
                      {cell.letter}
                    </button>
                  );
                })
              )}
            </div>

            {/* S-O-S ÜZERİNDEN GEÇEN PARLAYAN LAZER ÇİZGİLERİ */}
            <svg
              className="pointer-events-none absolute inset-3 sm:inset-4 h-[calc(100%-1.5rem)] w-[calc(100%-1.5rem)] sm:h-[calc(100%-2rem)] sm:w-[calc(100%-2rem)]"
              viewBox="0 0 700 500"
              preserveAspectRatio="none"
            >
              {sosLasers.map((line) => {
                const x1 = ((line.c1 + 0.5) / SOS_COLS) * 700;
                const y1 = ((line.r1 + 0.5) / SOS_ROWS) * 500;
                const x2 = ((line.c2 + 0.5) / SOS_COLS) * 700;
                const y2 = ((line.r2 + 0.5) / SOS_ROWS) * 500;
                const lTheme =
                  SMARTBOARD_SLOTS[line.ownerSlot % SMARTBOARD_SLOTS.length];

                return (
                  <g key={line.id}>
                    <line
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke={lTheme.hex}
                      strokeWidth="12"
                      strokeLinecap="round"
                      opacity="0.35"
                    />
                    <line
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke={lTheme.lightHex}
                      strokeWidth="5"
                      strokeLinecap="round"
                    />
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      )}
    </SmartboardFrame>
  );
}
