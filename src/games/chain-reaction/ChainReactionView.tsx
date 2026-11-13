"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import confetti from "canvas-confetti";
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

const ROWS = 6;
const COLS = 10;

export interface AtomCell {
  r: number;
  c: number;
  owner: number | null; // slotIndex 0..3
  count: number;
  capacity: number; // Köşe: 2, Kenar: 3, Orta: 4
}

interface FlyingOrb {
  id: string;
  fromR: number;
  fromC: number;
  toR: number;
  toC: number;
  colorHex: string;
  lightHex: string;
}

export function getCellCapacity(r: number, c: number): number {
  const isRowEdge = r === 0 || r === ROWS - 1;
  const isColEdge = c === 0 || c === COLS - 1;
  if (isRowEdge && isColEdge) return 2;
  if (isRowEdge || isColEdge) return 3;
  return 4;
}

function createInitialBoard(): AtomCell[][] {
  const grid: AtomCell[][] = [];
  for (let r = 0; r < ROWS; r++) {
    const row: AtomCell[] = [];
    for (let c = 0; c < COLS; c++) {
      row.push({
        r,
        c,
        owner: null,
        count: 0,
        capacity: getCellCapacity(r, c),
      });
    }
    grid.push(row);
  }
  return grid;
}

function cloneBoard(board: AtomCell[][]): AtomCell[][] {
  return board.map((row) => row.map((cell) => ({ ...cell })));
}

function getNeighbors(r: number, c: number): [number, number][] {
  const res: [number, number][] = [];
  if (r > 0) res.push([r - 1, c]);
  if (r < ROWS - 1) res.push([r + 1, c]);
  if (c > 0) res.push([r, c - 1]);
  if (c < COLS - 1) res.push([r, c + 1]);
  return res;
}

interface ChainReactionViewProps {
  seats: MultiplayerSeat[];
  onBackToHub: () => void;
  onRequestNewGameWithGate: () => void;
  onComboEnergyChange?: (level: number) => void;
}

export default function ChainReactionView({
  seats,
  onBackToHub,
  onRequestNewGameWithGate,
  onComboEnergyChange,
}: ChainReactionViewProps) {
  const [board, setBoard] = useState<AtomCell[][]>(() => createInitialBoard());
  const [turnIndex, setTurnIndex] = useState<number>(0); // index in `seats`
  const [movesMade, setMovesMade] = useState<number[]>(() =>
    seats.map(() => 0)
  );
  const [actionScores, setActionScores] = useState<number[]>(() =>
    seats.map(() => 0)
  );
  const [eliminatedSlots, setEliminatedSlots] = useState<number[]>([]);
  const [isAnimating, setIsAnimating] = useState<boolean>(false);
  const [flyingOrbs, setFlyingOrbs] = useState<FlyingOrb[]>([]);
  const [explodingCoords, setExplodingCoords] = useState<Set<string>>(
    () => new Set()
  );
  const [waveBanner, setWaveBanner] = useState<string>("");
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

  const countOrbsPerSlot = useCallback(
    (grid: AtomCell[][]): number[] => {
      const counts = seats.map(() => 0);
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const cell = grid[r][c];
          if (cell.owner !== null && cell.count > 0) {
            counts[cell.owner] = (counts[cell.owner] || 0) + cell.count;
          }
        }
      }
      return counts;
    },
    [seats]
  );

  const finishMatch = useCallback(
    async (
      winnerSlot: number,
      latestScores: number[],
      elimOrder: number[],
      finalGrid: AtomCell[][]
    ) => {
      if (recordedRef.current) return;
      recordedRef.current = true;

      sound.playVictory();
      confetti({
        particleCount: 110,
        spread: 80,
        origin: { y: 0.55 },
      });

      const orbCounts = countOrbsPerSlot(finalGrid);
      // Sıralama: 1. winnerSlot, diğerleri en son elenenden ilk elenene (veya aksiyon puanına) göre
      const others = seats
        .map((s) => s.slotIndex)
        .filter((idx) => idx !== winnerSlot);

      others.sort((a, b) => {
        const orbDiff = (orbCounts[b] || 0) - (orbCounts[a] || 0);
        if (orbDiff !== 0) return orbDiff;
        const idxA = elimOrder.indexOf(a);
        const idxB = elimOrder.indexOf(b);
        if (idxA !== -1 && idxB !== -1) return idxB - idxA; // Daha geç elenen üstte
        return (latestScores[b] || 0) - (latestScores[a] || 0);
      });

      const orderedSlots = [winnerSlot, ...others];
      const standingInputs = orderedSlots.map((slotIdx, rankZero) => {
        const seat = seats[slotIdx];
        return {
          slotIndex: slotIdx,
          player: seat.player,
          isBot: seat.isBot,
          rank: rankZero + 1,
          actionScore: latestScores[slotIdx] || 0,
          statSummary: `${orbCounts[slotIdx] || 0} Atom Küresi • Aksiyon: ${(
            latestScores[slotIdx] || 0
          ).toLocaleString("tr-TR")} P`,
        };
      });

      const res = await recordMultiplayerMatchResult({
        game: "chainReaction",
        standings: standingInputs,
      });
      if (!unmountedRef.current) {
        setFinalStandings(res);
      }
    },
    [seats, countOrbsPerSlot]
  );

  // Sıradaki hücreye küre bırak ve zincirleme reaksiyonu çalıştır (Sonsuz döngü korumalı!)
  const executeMove = useCallback(
    async (r: number, c: number) => {
      if (isAnimating || finalStandings) return;
      const activeSeat = seats[turnIndex];
      if (!activeSeat) return;
      const slotIdx = activeSeat.slotIndex;

      const currentCell = board[r][c];
      if (currentCell.owner !== null && currentCell.owner !== slotIdx) {
        sound.playInvalid();
        return;
      }

      setIsAnimating(true);
      sound.playChainOrbPlace();

      const nextMoves = [...movesMade];
      nextMoves[slotIdx] = (nextMoves[slotIdx] || 0) + 1;
      setMovesMade(nextMoves);

      const everyoneHasPlayedOnce = nextMoves.every((m) => m >= 1);

      let workingGrid = cloneBoard(board);
      workingGrid[r][c].owner = slotIdx;
      workingGrid[r][c].count += 1;
      setBoard(cloneBoard(workingGrid));

      const workingScores = [...actionScores];
      workingScores[slotIdx] = (workingScores[slotIdx] || 0) + 35;
      setActionScores([...workingScores]);

      let workingEliminated = [...eliminatedSlots];
      let waveDepth = 0;
      const MAX_SAFE_WAVES = 55; // Sonsuz döngü emniyet kilidi

      while (waveDepth < MAX_SAFE_WAVES) {
        // Patlayacak hücreleri bul
        const unstable: AtomCell[] = [];
        for (let rr = 0; rr < ROWS; rr++) {
          for (let cc = 0; cc < COLS; cc++) {
            const cell = workingGrid[rr][cc];
            if (cell.count >= cell.capacity) {
              unstable.push(cell);
            }
          }
        }

        if (unstable.length === 0) break;

        waveDepth += 1;
        onComboEnergyChange?.(Math.min(6, waveDepth));
        setWaveBanner(
          waveDepth >= 2 ? `⚡ ZİNCİRLEME DALGA x${waveDepth}!` : "💥 PATLAMA!"
        );
        sound.playChainExplosion(waveDepth);

        const expSet = new Set<string>();
        const projectiles: FlyingOrb[] = [];
        const theme = SMARTBOARD_SLOTS[slotIdx % SMARTBOARD_SLOTS.length];

        for (const u of unstable) {
          expSet.add(`${u.r}-${u.c}`);
          const neighbors = getNeighbors(u.r, u.c);
          for (const [nr, nc] of neighbors) {
            projectiles.push({
              id: `${waveDepth}-${u.r}-${u.c}->${nr}-${nc}`,
              fromR: u.r,
              fromC: u.c,
              toR: nr,
              toC: nc,
              colorHex: theme.hex,
              lightHex: theme.lightHex,
            });
          }
        }

        setExplodingCoords(expSet);
        setFlyingOrbs(projectiles);

        await new Promise((res) => window.setTimeout(res, 210));
        if (unmountedRef.current) return;

        // Patlamaları komşulara dağıt ve rakip küreleri kendi rengine dönüştür
        let convertedOrbs = 0;
        for (const u of unstable) {
          const cell = workingGrid[u.r][u.c];
          cell.count -= cell.capacity;
          if (cell.count <= 0) {
            cell.count = 0;
            cell.owner = null;
          }
        }

        for (const u of unstable) {
          const neighbors = getNeighbors(u.r, u.c);
          for (const [nr, nc] of neighbors) {
            const target = workingGrid[nr][nc];
            if (target.owner !== null && target.owner !== slotIdx) {
              convertedOrbs += target.count;
            }
            target.owner = slotIdx;
            target.count += 1;
          }
        }

        workingScores[slotIdx] +=
          unstable.length * 85 * Math.min(5, waveDepth) + convertedOrbs * 45;

        setFlyingOrbs([]);
        setExplodingCoords(new Set());
        setBoard(cloneBoard(workingGrid));
        setActionScores([...workingScores]);

        // KRİTİK KURAL: Herkes ilk hamlesini yaptıysa elenenleri kontrol et;
        // tahtada tek bir oyuncunun rengi kaldığı AN zincirleme döngüyü ANINDA durdur!
        if (everyoneHasPlayedOnce) {
          const orbCounts = countOrbsPerSlot(workingGrid);
          const aliveSlots: number[] = [];

          for (let s = 0; s < seats.length; s++) {
            if (orbCounts[s] > 0) {
              aliveSlots.push(s);
            } else if (!workingEliminated.includes(s)) {
              workingEliminated.push(s);
            }
          }

          setEliminatedSlots([...workingEliminated]);

          if (aliveSlots.length === 1) {
            // Tek oyuncu kaldı -> Sonsuz döngüyü anında kes ve zafer ekranını aç!
            setWaveBanner("🏆 TÜM TAHTA ELE GEÇİRİLDİ!");
            setIsAnimating(false);
            onComboEnergyChange?.(0);
            await finishMatch(
              aliveSlots[0],
              workingScores,
              workingEliminated,
              workingGrid
            );
            return;
          }
        }

        await new Promise((res) => window.setTimeout(res, 75));
        if (unmountedRef.current) return;
      }

      onComboEnergyChange?.(0);
      setWaveBanner("");

      // Hamle sonu elenme ve zafer kontrolü
      if (everyoneHasPlayedOnce) {
        const orbCounts = countOrbsPerSlot(workingGrid);
        const aliveSlots: number[] = [];
        for (let s = 0; s < seats.length; s++) {
          if (orbCounts[s] > 0) {
            aliveSlots.push(s);
          } else if (!workingEliminated.includes(s)) {
            workingEliminated.push(s);
          }
        }
        setEliminatedSlots([...workingEliminated]);

        if (aliveSlots.length === 1) {
          setIsAnimating(false);
          await finishMatch(
            aliveSlots[0],
            workingScores,
            workingEliminated,
            workingGrid
          );
          return;
        }
      }

      // Sırayı hayatta olan bir sonraki oyuncuya geçir
      let nextTurn = (turnIndex + 1) % seats.length;
      if (everyoneHasPlayedOnce) {
        const orbCounts = countOrbsPerSlot(workingGrid);
        for (let step = 0; step < seats.length; step++) {
          const candidateIdx = (turnIndex + 1 + step) % seats.length;
          if (
            orbCounts[candidateIdx] > 0 &&
            !workingEliminated.includes(candidateIdx)
          ) {
            nextTurn = candidateIdx;
            break;
          }
        }
      }

      sound.playTurnChange();
      setTurnIndex(nextTurn);
      setIsAnimating(false);
    },
    [
      isAnimating,
      finalStandings,
      seats,
      turnIndex,
      board,
      movesMade,
      actionScores,
      eliminatedSlots,
      countOrbsPerSlot,
      finishMatch,
      onComboEnergyChange,
    ]
  );

  // Yapay Zeka Bot Sırası Geldiğinde Otomatik Hamle Yap
  useEffect(() => {
    if (isAnimating || finalStandings) return;
    const activeSeat = seats[turnIndex];
    if (!activeSeat || !activeSeat.isBot) return;

    const timer = window.setTimeout(() => {
      const slotIdx = activeSeat.slotIndex;
      // Geçerli hücreleri topla ve stratejik puanla
      const candidates: { r: number; c: number; weight: number }[] = [];

      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const cell = board[r][c];
          if (cell.owner === null || cell.owner === slotIdx) {
            let weight = Math.random() * 10;
            // Kapasiteye 1 kalmış kendi hücresi + komşuda rakip varsa çok yüksek öncelik
            if (cell.owner === slotIdx && cell.count === cell.capacity - 1) {
              weight += 45;
              for (const [nr, nc] of getNeighbors(r, c)) {
                const nb = board[nr][nc];
                if (nb.owner !== null && nb.owner !== slotIdx) {
                  weight += nb.count * 25;
                }
              }
            } else if (cell.owner === null && cell.capacity === 2) {
              weight += 22; // Köşeler değerli
            } else if (cell.owner === slotIdx) {
              weight += 14;
            }
            candidates.push({ r, c, weight });
          }
        }
      }

      if (candidates.length > 0) {
        candidates.sort((a, b) => b.weight - a.weight);
        const pick = candidates[0];
        void executeMove(pick.r, pick.c);
      }
    }, 580);

    return () => window.clearTimeout(timer);
  }, [turnIndex, isAnimating, finalStandings, seats, board, executeMove]);

  const orbCountsNow = countOrbsPerSlot(board);
  const allPlayedOnce = movesMade.every((m) => m >= 1);

  const playersHud: SmartboardPlayerHudState[] = seats.map((seat, idx) => ({
    seat,
    actionScore: actionScores[idx] || 0,
    statLabel: `${orbCountsNow[idx] || 0} Küre`,
    eliminated: allPlayedOnce && eliminatedSlots.includes(idx),
  }));

  const activeSeat = seats[turnIndex] ?? seats[0];
  const activeTheme =
    SMARTBOARD_SLOTS[activeSeat.slotIndex % SMARTBOARD_SLOTS.length];

  return (
    <SmartboardFrame
      gameTitle="Chain Reaction • Zincirleme Patlama"
      gameIcon="⚛️"
      modeSubtitle={`${seats.length} Kişilik Akıllı Tahta • 10x6 Yatay Izgara`}
      playersHud={playersHud}
      activeSlotIndex={activeSeat.slotIndex}
      isAnimating={isAnimating}
      statusBannerText={
        waveBanner ||
        "Boş kareye veya kendi rengindeki kareye tek parmakla dokun!"
      }
      finalStandings={finalStandings}
      onBackToHub={onBackToHub}
      onRestartWithGate={onRequestNewGameWithGate}
      bottomBarContent={
        <div className="flex items-center gap-3 text-xs font-bold text-slate-300">
          <span className="rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2">
            Köşe Kapasite: <strong className="text-cyan-300">2</strong> • Kenar:{" "}
            <strong className="text-amber-300">3</strong> • Orta:{" "}
            <strong className="text-rose-300">4</strong>
          </span>
        </div>
      }
    >
      {/* 10 SÜTUN x 6 SATIR YATAY AKILLI TAHTA IZGARASI */}
      <div className="relative flex h-full w-full items-center justify-center p-1 sm:p-2">
        <div
          className="relative grid w-full max-w-[1180px] h-full max-h-[620px] gap-1.5 sm:gap-2 rounded-3xl border-2 bg-slate-950/95 p-2 sm:p-3 shadow-2xl"
          style={{
            gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${ROWS}, minmax(0, 1fr))`,
            borderColor: `${activeTheme.hex}66`,
          }}
        >
          {board.map((row) =>
            row.map((cell) => {
              const key = `${cell.r}-${cell.c}`;
              const isCritical =
                cell.count > 0 && cell.count === cell.capacity - 1;
              const isExploding = explodingCoords.has(key);
              const cellTheme =
                cell.owner !== null
                  ? SMARTBOARD_SLOTS[cell.owner % SMARTBOARD_SLOTS.length]
                  : null;
              const canTap =
                !isAnimating &&
                !activeSeat.isBot &&
                (cell.owner === null || cell.owner === activeSeat.slotIndex);

              return (
                <button
                  key={key}
                  type="button"
                  disabled={!canTap}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    if (canTap) {
                      void executeMove(cell.r, cell.c);
                    }
                  }}
                  className={`relative flex min-h-[52px] min-w-[52px] items-center justify-center rounded-2xl border transition-colors overflow-hidden select-none ${
                    isExploding
                      ? "border-white bg-white/30 scale-95"
                      : cellTheme
                      ? "bg-slate-900/90"
                      : "border-white/10 bg-slate-900/55 hover:border-white/25"
                  } ${canTap ? "cursor-pointer" : "cursor-default"}`}
                  style={{
                    borderColor: cellTheme ? `${cellTheme.hex}77` : undefined,
                    boxShadow: isCritical && cellTheme
                      ? `inset 0 0 18px ${cellTheme.hex}55`
                      : undefined,
                  }}
                >
                  {/* Köşe / Kenar Kapasite Noktacıkları */}
                  <span className="pointer-events-none absolute right-1.5 top-1 text-[9px] font-black text-slate-600">
                    /{cell.capacity}
                  </span>

                  {/* 3D PARLAK ATOM KÜRELERİ (Kritik Kütlede Hızla Titrer) */}
                  {cell.count > 0 && cellTheme && (
                    <motion.div
                      animate={
                        isCritical
                          ? {
                              x: [-2.5, 2.5, -2, 2, -2.5],
                              y: [2, -2, 2.5, -2.5, 2],
                              rotate: [-6, 6, -6],
                            }
                          : {
                              rotate: [0, 360],
                            }
                      }
                      transition={
                        isCritical
                          ? {
                              repeat: Infinity,
                              duration: 0.24,
                              ease: "linear",
                            }
                          : {
                              repeat: Infinity,
                              duration: 9,
                              ease: "linear",
                            }
                      }
                      className="relative flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center will-change-transform"
                    >
                      {Array.from({ length: Math.min(cell.count, 4) }).map(
                        (_, orbIdx) => {
                          const offsets =
                            cell.count === 1
                              ? [{ x: 0, y: 0 }]
                              : cell.count === 2
                              ? [
                                  { x: -7, y: 0 },
                                  { x: 7, y: 0 },
                                ]
                              : [
                                  { x: 0, y: -6 },
                                  { x: -7, y: 6 },
                                  { x: 7, y: 6 },
                                  { x: 0, y: 0 },
                                ];
                          const pos = offsets[orbIdx] || { x: 0, y: 0 };

                          return (
                            <span
                              key={orbIdx}
                              className="absolute h-5 w-5 sm:h-6 sm:w-6 rounded-full"
                              style={{
                                transform: `translate3d(${pos.x}px, ${pos.y}px, 0)`,
                                background: `radial-gradient(circle at 32% 28%, #ffffff 0%, ${cellTheme.lightHex} 24%, ${cellTheme.hex} 62%, ${cellTheme.darkHex} 100%)`,
                                boxShadow: `0 0 12px ${cellTheme.hex}`,
                              }}
                            />
                          );
                        }
                      )}
                    </motion.div>
                  )}
                </button>
              );
            })
          )}

          {/* Patlama Anında Komşu Karelere Fırlayan Küre Efektleri */}
          {flyingOrbs.map((proj) => {
            const leftPct = ((proj.fromC + 0.5) / COLS) * 100;
            const topPct = ((proj.fromR + 0.5) / ROWS) * 100;
            const dxPct = ((proj.toC - proj.fromC) / COLS) * 100;
            const dyPct = ((proj.toR - proj.fromR) / ROWS) * 100;

            return (
              <motion.div
                key={proj.id}
                initial={{
                  left: `${leftPct}%`,
                  top: `${topPct}%`,
                  scale: 1.15,
                }}
                animate={{
                  left: `${leftPct + dxPct}%`,
                  top: `${topPct + dyPct}%`,
                  scale: 0.9,
                }}
                transition={{ duration: 0.19, ease: "easeOut" }}
                className="pointer-events-none absolute z-30 -ml-3 -mt-3 h-6 w-6 rounded-full"
                style={{
                  background: `radial-gradient(circle at 30% 30%, #fff, ${proj.lightHex}, ${proj.colorHex})`,
                  boxShadow: `0 0 18px ${proj.colorHex}`,
                }}
              />
            );
          })}
        </div>
      </div>
    </SmartboardFrame>
  );
}
