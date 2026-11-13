"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import {
  ArrowLeft,
  RotateCcw,
  Pencil,
  Undo2,
  Lightbulb,
  Heart,
  Eraser,
  Trophy,
} from "lucide-react";
import {
  SUDOKU_CONFIG,
  generateUniqueSudoku,
  type SudokuDifficulty,
} from "./generator";
import { recordSoloGameResult, type PlayerDoc } from "@/lib/firestore";
import { sound } from "@/lib/sound";
import RollingScore from "@/components/ui/RollingScore";

interface SudokuViewProps {
  player: PlayerDoc;
  allPlayers: PlayerDoc[];
  onBackToHub: () => void;
  onRequestNewGameWithGate: () => void;
}

interface SudokuSnapshot {
  board: number[][];
  notes: number[][][];
  score: number;
}

export default function SudokuView({
  player,
  allPlayers,
  onBackToHub,
  onRequestNewGameWithGate,
}: SudokuViewProps) {
  const [difficulty, setDifficulty] = useState<SudokuDifficulty | null>(null);
  const [givenMask, setGivenMask] = useState<boolean[][]>([]);
  const [solution, setSolution] = useState<number[][]>([]);
  const [board, setBoard] = useState<number[][]>([]);
  const [notes, setNotes] = useState<number[][][]>([]);
  const [history, setHistory] = useState<SudokuSnapshot[]>([]);

  const [selected, setSelected] = useState<{ r: number; c: number }>({
    r: 0,
    c: 0,
  });
  const [noteMode, setNoteMode] = useState(false);
  const [hintsLeft, setHintsLeft] = useState(3);
  const [mistakes, setMistakes] = useState(0);
  const [score, setScore] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [wrongFlash, setWrongFlash] = useState<{
    key: string;
    nonce: number;
  } | null>(null);
  const [justSolvedKey, setJustSolvedKey] = useState<string | null>(null);
  // Satır / Sütun / 3x3 Kutu %100 tamamlandığında sıralı altın/turkuaz parıltı dalgası (cellKey -> delayMs)
  const [shimmerWaveMap, setShimmerWaveMap] = useState<Map<string, number>>(
    () => new Map()
  );

  const [endModal, setEndModal] = useState<{
    won: boolean;
    finalScore: number;
    bonus: number;
  } | null>(null);

  const startPuzzle = (diff: SudokuDifficulty) => {
    sound.playClick();
    const { puzzle, solution: sol } = generateUniqueSudoku(diff);
    setDifficulty(diff);
    setSolution(sol);
    setBoard(puzzle.map((r) => [...r]));
    setGivenMask(puzzle.map((r) => r.map((v) => v !== 0)));
    setNotes(
      Array.from({ length: 9 }, () =>
        Array.from({ length: 9 }, () => [] as number[])
      )
    );
    setHistory([]);
    setHintsLeft(3);
    setMistakes(0);
    setScore(0);
    setElapsedSec(0);
    setNoteMode(false);
    setShimmerWaveMap(new Map());
    setEndModal(null);

    outer: for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (puzzle[r][c] === 0) {
          setSelected({ r, c });
          break outer;
        }
      }
    }
  };

  useEffect(() => {
    if (!difficulty || endModal) return;
    const t = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [difficulty, endModal]);

  const concludeSudoku = useCallback(
    async (won: boolean, currentScore: number, currentMistakes: number) => {
      if (!difficulty) return;
      const cfg = SUDOKU_CONFIG[difficulty];
      const livesLeft = Math.max(0, 3 - currentMistakes);
      // 0 - 10.000 Ölçeği: Tamamlama ödülü (500 / 900 / 1.400 / 2.000) + kalan can (can * 150) + süre bonusu (maks +600)
      const speedBonus = won
        ? Math.min(600, Math.max(0, Math.round(600 - elapsedSec * 1.5)))
        : 0;
      const lifeBonus = won ? livesLeft * 150 : 0;
      const completionBonus = won ? cfg.completionReward : 0;
      const totalBonus = completionBonus + speedBonus + lifeBonus;
      const finalScore = currentScore + totalBonus;

      if (won) {
        sound.playVictory();
        confetti({ particleCount: 95, spread: 75, origin: { y: 0.6 } });
      } else {
        sound.playGameOver();
      }

      await recordSoloGameResult(
        player,
        {
          game: "sudoku",
          score: finalScore,
          won,
          durationSec: elapsedSec,
          modeLabel: `Sudoku ${cfg.label}`,
        },
        allPlayers
      );

      setEndModal({ won, finalScore, bonus: totalBonus });
    },
    [difficulty, elapsedSec, player, allPlayers]
  );

  const isBoardComplete = (b: number[][], sol: number[][]): boolean => {
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (b[r][c] !== sol[r][c]) return false;
      }
    }
    return true;
  };

  // Satır, Sütun veya 3x3 Kutu yeni tamamlandıysa sıralı ışık dalgası (Shimmer Wave) tetikle!
  const checkAndTriggerUnitShimmer = useCallback(
    (
      prevBoard: number[][],
      nextBoard: number[][],
      sol: number[][],
      placedR: number,
      placedC: number
    ) => {
      const wave = new Map<string, number>();

      // 1. Satır kontrolü
      const rowWasDone = prevBoard[placedR].every(
        (v, idx) => v === sol[placedR][idx]
      );
      const rowNowDone = nextBoard[placedR].every(
        (v, idx) => v === sol[placedR][idx]
      );
      if (!rowWasDone && rowNowDone) {
        for (let col = 0; col < 9; col++) {
          wave.set(`${placedR}-${col}`, Math.abs(col - placedC) * 38);
        }
      }

      // 2. Sütun kontrolü
      let colWasDone = true;
      let colNowDone = true;
      for (let row = 0; row < 9; row++) {
        if (prevBoard[row][placedC] !== sol[row][placedC]) colWasDone = false;
        if (nextBoard[row][placedC] !== sol[row][placedC]) colNowDone = false;
      }
      if (!colWasDone && colNowDone) {
        for (let row = 0; row < 9; row++) {
          const k = `${row}-${placedC}`;
          const d = Math.abs(row - placedR) * 38;
          wave.set(k, wave.has(k) ? Math.min(wave.get(k)!, d) : d);
        }
      }

      // 3. 3x3 Kutu kontrolü
      const br = Math.floor(placedR / 3) * 3;
      const bc = Math.floor(placedC / 3) * 3;
      let boxWasDone = true;
      let boxNowDone = true;
      for (let r = br; r < br + 3; r++) {
        for (let c = bc; c < bc + 3; c++) {
          if (prevBoard[r][c] !== sol[r][c]) boxWasDone = false;
          if (nextBoard[r][c] !== sol[r][c]) boxNowDone = false;
        }
      }
      if (!boxWasDone && boxNowDone) {
        let step = 0;
        for (let r = br; r < br + 3; r++) {
          for (let c = bc; c < bc + 3; c++) {
            const k = `${r}-${c}`;
            const d = step++ * 35;
            wave.set(k, wave.has(k) ? Math.min(wave.get(k)!, d) : d);
          }
        }
      }

      if (wave.size > 0) {
        sound.playShimmerWave();
        setShimmerWaveMap(wave);
        window.setTimeout(() => {
          setShimmerWaveMap(new Map());
        }, 720);
      }
    },
    []
  );

  const removePeerNotes = (
    notesGrid: number[][][],
    row: number,
    col: number,
    digit: number
  ) => {
    for (let i = 0; i < 9; i++) {
      notesGrid[row][i] = notesGrid[row][i].filter((n) => n !== digit);
      notesGrid[i][col] = notesGrid[i][col].filter((n) => n !== digit);
    }
    const br = Math.floor(row / 3) * 3;
    const bc = Math.floor(col / 3) * 3;
    for (let r = br; r < br + 3; r++) {
      for (let c = bc; c < bc + 3; c++) {
        notesGrid[r][c] = notesGrid[r][c].filter((n) => n !== digit);
      }
    }
  };

  const handleDigitInput = useCallback(
    (digit: number) => {
      if (!difficulty || endModal) return;
      const { r, c } = selected;
      if (givenMask[r]?.[c]) return;
      if (board[r][c] === solution[r][c] && board[r][c] !== 0) return;

      // Kalem / Not Modu
      if (noteMode) {
        sound.playClick();
        setHistory((h) => [
          ...h.slice(-24),
          {
            board: board.map((row) => [...row]),
            notes: notes.map((row) => row.map((arr) => [...arr])),
            score,
          },
        ]);
        const nextNotes = notes.map((row) => row.map((arr) => [...arr]));
        const cur = nextNotes[r][c];
        nextNotes[r][c] = cur.includes(digit)
          ? cur.filter((n) => n !== digit)
          : [...cur, digit].sort((a, b) => a - b);
        setNotes(nextNotes);
        return;
      }

      // Doğru rakam mı?
      if (solution[r][c] === digit) {
        sound.playSudokuCorrect();
        setHistory((h) => [
          ...h.slice(-24),
          {
            board: board.map((row) => [...row]),
            notes: notes.map((row) => row.map((arr) => [...arr])),
            score,
          },
        ]);

        const nextBoard = board.map((row) => [...row]);
        nextBoard[r][c] = digit;

        const nextNotes = notes.map((row) => row.map((arr) => [...arr]));
        nextNotes[r][c] = [];
        removePeerNotes(nextNotes, r, c, digit);

        const cellKey = `${r}-${c}`;
        setJustSolvedKey(cellKey);
        window.setTimeout(() => {
          setJustSolvedKey((cur) => (cur === cellKey ? null : cur));
        }, 320);

        checkAndTriggerUnitShimmer(board, nextBoard, solution, r, c);

        const gained = SUDOKU_CONFIG[difficulty].cellPoints;
        const nextScore = score + gained;
        setBoard(nextBoard);
        setNotes(nextNotes);
        setScore(nextScore);

        if (isBoardComplete(nextBoard, solution)) {
          concludeSudoku(true, nextScore, mistakes);
        }
      } else {
        // Hatalı rakam -> Keskin Yatay Titreme + Kırmızı Parlama + Haptic Titreşim
        sound.playInvalid();
        const key = `${r}-${c}`;
        setWrongFlash({ key, nonce: Date.now() });
        window.setTimeout(() => {
          setWrongFlash((cur) => (cur?.key === key ? null : cur));
        }, 520);

        const nextMistakes = mistakes + 1;
        setMistakes(nextMistakes);
        if (nextMistakes >= 3) {
          concludeSudoku(false, score, nextMistakes);
        }
      }
    },
    [
      difficulty,
      endModal,
      selected,
      givenMask,
      board,
      solution,
      noteMode,
      notes,
      score,
      mistakes,
      checkAndTriggerUnitShimmer,
      concludeSudoku,
    ]
  );

  const handleErase = useCallback(() => {
    if (!difficulty || endModal) return;
    const { r, c } = selected;
    if (givenMask[r]?.[c]) return;
    if (board[r][c] !== 0) return;
    if (notes[r][c].length === 0) return;

    sound.playClick();
    const nextNotes = notes.map((row) => row.map((arr) => [...arr]));
    nextNotes[r][c] = [];
    setNotes(nextNotes);
  }, [difficulty, endModal, selected, givenMask, board, notes]);

  const handleUndo = () => {
    if (history.length === 0 || endModal) return;
    sound.playClick();
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setBoard(prev.board);
    setNotes(prev.notes);
    setScore(prev.score);
  };

  const handleHint = () => {
    if (!difficulty || hintsLeft <= 0 || endModal) return;
    let targetR = selected.r;
    let targetC = selected.c;

    if (board[targetR][targetC] !== 0) {
      let found = false;
      for (let r = 0; r < 9 && !found; r++) {
        for (let c = 0; c < 9 && !found; c++) {
          if (board[r][c] === 0) {
            targetR = r;
            targetC = c;
            found = true;
          }
        }
      }
      if (!found) return;
    }

    sound.playSudokuCorrect();
    const ans = solution[targetR][targetC];
    const nextBoard = board.map((row) => [...row]);
    nextBoard[targetR][targetC] = ans;

    const nextNotes = notes.map((row) => row.map((arr) => [...arr]));
    nextNotes[targetR][targetC] = [];
    removePeerNotes(nextNotes, targetR, targetC, ans);

    const cellKey = `${targetR}-${targetC}`;
    setJustSolvedKey(cellKey);
    window.setTimeout(() => {
      setJustSolvedKey((cur) => (cur === cellKey ? null : cur));
    }, 320);

    checkAndTriggerUnitShimmer(board, nextBoard, solution, targetR, targetC);

    setHintsLeft((h) => h - 1);
    setSelected({ r: targetR, c: targetC });
    setBoard(nextBoard);
    setNotes(nextNotes);

    if (isBoardComplete(nextBoard, solution)) {
      concludeSudoku(true, score, mistakes);
    }
  };

  // Klavye rakam, yön ve kısayol desteği
  useEffect(() => {
    if (!difficulty || endModal) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key >= "1" && e.key <= "9") {
        e.preventDefault();
        handleDigitInput(Number(e.key));
      } else if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        handleErase();
      } else if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        setNoteMode((m) => !m);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelected((s) => ({ r: (s.r + 8) % 9, c: s.c }));
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelected((s) => ({ r: (s.r + 1) % 9, c: s.c }));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setSelected((s) => ({ r: s.r, c: (s.c + 8) % 9 }));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setSelected((s) => ({ r: s.r, c: (s.c + 1) % 9 }));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [difficulty, endModal, handleDigitInput, handleErase]);

  const digitCounts = useMemo(() => {
    const counts = Array(10).fill(0);
    for (const row of board) {
      for (const v of row) {
        if (v >= 1 && v <= 9) counts[v]++;
      }
    }
    return counts;
  }, [board]);

  if (!difficulty) {
    return (
      <div className="flex h-full w-full max-w-md flex-col justify-center gap-4 px-2">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 28 }}
          className="rounded-3xl border border-white/15 bg-slate-900/92 p-5 shadow-2xl space-y-4"
        >
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={onBackToHub}
              className="inline-flex items-center gap-1 text-xs font-bold text-slate-400 hover:text-white cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" /> Lobiye Dön
            </button>
            <span className="text-xs font-black text-indigo-300">
              🔢 GERÇEK SUDOKU ÜRETİCİ
            </span>
          </div>

          <div>
            <h3 className="text-lg font-black text-white">
              Zorluk Seviyesini Seç
            </h3>
            <p className="text-xs text-slate-400">
              Backtracking algoritmasıyla tek ve kesin çözümlü yeni bir 9x9
              tablo üretilecek.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {(["easy", "medium", "hard", "expert"] as SudokuDifficulty[]).map(
              (d) => {
                const cfg = SUDOKU_CONFIG[d];
                return (
                  <motion.button
                    key={d}
                    type="button"
                    whileHover={{ scale: 1.03, y: -2 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => startPuzzle(d)}
                    className="rounded-2xl border border-white/12 bg-white/[0.04] hover:border-indigo-400 hover:bg-indigo-600/20 p-4 text-left transition-colors cursor-pointer"
                  >
                    <div className="text-base font-black text-white">
                      {cfg.label}
                    </div>
                    <div className="mt-1 text-xs font-bold text-cyan-300">
                      Hücre başına +{cfg.cellPoints} P
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {cfg.blanksTarget} boş kutu
                    </div>
                  </motion.button>
                );
              }
            )}
          </div>
        </motion.div>
      </div>
    );
  }

  const selectedVal = board[selected.r]?.[selected.c] ?? 0;
  const formatTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(
      2,
      "0"
    )}`;

  return (
    <div className="relative flex h-full w-full max-w-[450px] flex-col items-center justify-between touch-none select-none py-1">
      {/* Üst Başlık */}
      <div className="w-full flex items-center justify-between shrink-0">
        <motion.button
          type="button"
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.94 }}
          onClick={onBackToHub}
          className="inline-flex items-center gap-1 rounded-xl border border-white/12 bg-slate-900/80 px-3 py-1.5 text-xs font-extrabold text-slate-200 cursor-pointer"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Lobi
        </motion.button>

        <div className="flex items-center gap-2 text-xs font-black text-indigo-300">
          <span>Sudoku • {SUDOKU_CONFIG[difficulty].label}</span>
          <span className="font-mono text-slate-400">
            {formatTime(elapsedSec)}
          </span>
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

      {/* Canlı Skor Sayacı (Rolling Score Ticker) ve 3 Hata Hakkı Göstergesi */}
      <div className="w-full flex items-center justify-between rounded-2xl border border-white/10 bg-slate-900/85 px-3.5 py-2 mt-1 shrink-0">
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-300">
          <span className="truncate max-w-[110px]">{player.name}:</span>
          <RollingScore
            value={score}
            className="text-amber-300 text-sm font-black tabular-nums"
            popupColorClass="text-cyan-300"
          />
          <span className="text-amber-300 font-black">P</span>
        </div>

        <div className="flex items-center gap-1">
          {[0, 1, 2].map((idx) => {
            const alive = idx < 3 - mistakes;
            return (
              <Heart
                key={idx}
                className={`h-4 w-4 transition-transform ${
                  alive
                    ? "fill-rose-500 text-rose-500 scale-100"
                    : "text-slate-700 scale-90"
                }`}
              />
            );
          })}
          <span className="ml-1 text-[11px] font-bold text-slate-400">
            ({mistakes}/3 Hata)
          </span>
        </div>
      </div>

      {/* 9x9 Sudoku Izgarası (Yumuşak Aydınlanma + Pop-In + Hata Titremesi + Shimmer Wave) */}
      <div className="my-1 flex flex-1 w-full items-center justify-center min-h-0">
        <div className="grid w-full max-w-[min(92vw,47dvh,396px)] aspect-square grid-cols-9 grid-rows-9 overflow-hidden rounded-2xl border-2 border-indigo-400/65 bg-slate-950 shadow-[0_16px_45px_rgba(30,27,75,0.65)]">
          {board.map((rowArr, r) =>
            rowArr.map((val, c) => {
              const cellKey = `${r}-${c}`;
              const isSel = selected.r === r && selected.c === c;
              const sameBox =
                Math.floor(r / 3) === Math.floor(selected.r / 3) &&
                Math.floor(c / 3) === Math.floor(selected.c / 3);
              const isPeer =
                !isSel && (r === selected.r || c === selected.c || sameBox);
              const isSameDigit =
                !isSel && selectedVal !== 0 && val === selectedVal;
              const isGiven = givenMask[r]?.[c];
              const cellNotes = notes[r]?.[c] ?? [];
              const isFlashingWrong = wrongFlash?.key === cellKey;
              const isPopIn = justSolvedKey === cellKey;
              const shimmerDelay = shimmerWaveMap.get(cellKey);

              return (
                <motion.button
                  key={
                    isFlashingWrong ? `${cellKey}-${wrongFlash.nonce}` : cellKey
                  }
                  type="button"
                  animate={
                    isFlashingWrong
                      ? { x: [-6, 6, -4, 4, 0] }
                      : { x: 0 }
                  }
                  transition={{ duration: 0.28 }}
                  onClick={() => setSelected({ r, c })}
                  className={`relative flex items-center justify-center border-slate-800 transition-colors duration-150 cursor-pointer ${
                    c % 3 === 2 && c !== 8
                      ? "border-r-2 border-r-indigo-400/60"
                      : "border-r"
                  } ${
                    r % 3 === 2 && r !== 8
                      ? "border-b-2 border-b-indigo-400/60"
                      : "border-b"
                  } ${
                    isFlashingWrong
                      ? "bg-rose-600/75"
                      : isSel
                      ? "bg-indigo-600/60 ring-1 ring-inset ring-cyan-300 shadow-[inset_0_0_14px_rgba(34,211,238,0.35)]"
                      : isSameDigit
                      ? "bg-cyan-500/30"
                      : isPeer
                      ? "bg-indigo-950/70"
                      : "bg-slate-950"
                  }`}
                >
                  {/* Satır / Sütun / 3x3 Kutu Tamamlanma Altın-Turkuaz Işık Dalgası (Shimmer Wave) */}
                  {shimmerDelay !== undefined && (
                    <motion.span
                      initial={{ opacity: 0, scale: 0.7 }}
                      animate={{
                        opacity: [0, 0.9, 0],
                        scale: [0.85, 1.08, 1],
                      }}
                      transition={{
                        duration: 0.48,
                        delay: shimmerDelay / 1000,
                        ease: "easeOut",
                      }}
                      className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-br from-amber-300/65 via-cyan-300/55 to-transparent"
                    />
                  )}

                  {val !== 0 ? (
                    <motion.span
                      initial={isPopIn ? { scale: 0.5, opacity: 0.5 } : false}
                      animate={
                        isPopIn
                          ? { scale: [0.55, 1.2, 1], opacity: 1 }
                          : { scale: 1, opacity: 1 }
                      }
                      transition={{ duration: 0.24, ease: "easeOut" }}
                      className={`relative z-20 text-lg sm:text-xl font-black leading-none will-change-transform ${
                        isGiven ? "text-slate-100" : "text-cyan-300 drop-shadow-[0_0_8px_rgba(34,211,238,0.45)]"
                      }`}
                    >
                      {val}
                    </motion.span>
                  ) : cellNotes.length > 0 ? (
                    <div className="relative z-20 grid h-full w-full grid-cols-3 grid-rows-3 p-[1px]">
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                        <span
                          key={n}
                          className="flex items-center justify-center text-[8px] leading-none font-bold text-amber-200/90"
                        >
                          {cellNotes.includes(n) ? n : ""}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </motion.button>
              );
            })
          )}
        </div>
      </div>

      {/* Araçlar (Geri Al, Silgi, Kalem/Not Modu, 3 İpucu) */}
      <div className="w-full grid grid-cols-4 gap-2 shrink-0">
        <motion.button
          type="button"
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.94 }}
          disabled={history.length === 0}
          onClick={handleUndo}
          className="flex flex-col items-center justify-center gap-0.5 rounded-xl border border-white/10 bg-slate-900/85 py-2 text-[11px] font-bold text-slate-200 disabled:opacity-40 cursor-pointer"
        >
          <Undo2 className="h-4 w-4 text-slate-300" /> Geri Al
        </motion.button>

        <motion.button
          type="button"
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.94 }}
          onClick={handleErase}
          className="flex flex-col items-center justify-center gap-0.5 rounded-xl border border-white/10 bg-slate-900/85 py-2 text-[11px] font-bold text-slate-200 cursor-pointer"
        >
          <Eraser className="h-4 w-4 text-rose-300" /> Not Sil
        </motion.button>

        <motion.button
          type="button"
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.94 }}
          onClick={() => {
            sound.playClick();
            setNoteMode((m) => !m);
          }}
          className={`flex flex-col items-center justify-center gap-0.5 rounded-xl border py-2 text-[11px] font-extrabold transition-colors cursor-pointer ${
            noteMode
              ? "border-amber-400 bg-amber-500/25 text-amber-200 shadow-[0_0_14px_rgba(251,191,36,0.25)]"
              : "border-white/10 bg-slate-900/85 text-slate-200"
          }`}
        >
          <Pencil className="h-4 w-4" />
          Kalem {noteMode ? "AÇIK" : "Kapalı"}
        </motion.button>

        <motion.button
          type="button"
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.94 }}
          disabled={hintsLeft <= 0}
          onClick={handleHint}
          className="flex flex-col items-center justify-center gap-0.5 rounded-xl border border-cyan-400/30 bg-cyan-500/15 py-2 text-[11px] font-extrabold text-cyan-200 disabled:opacity-40 cursor-pointer"
        >
          <Lightbulb className="h-4 w-4 text-cyan-300" /> İpucu ({hintsLeft})
        </motion.button>
      </div>

      {/* Büyük Dokunmatik Numpad (1-9) */}
      <div className="w-full grid grid-cols-9 gap-1 sm:gap-1.5 mt-1.5 shrink-0">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => {
          const exhausted = digitCounts[num] >= 9;
          return (
            <motion.button
              key={num}
              type="button"
              whileHover={!exhausted ? { scale: 1.06, y: -1 } : {}}
              whileTap={!exhausted ? { scale: 0.92 } : {}}
              disabled={exhausted}
              onClick={() => handleDigitInput(num)}
              className={`rounded-xl border py-2.5 sm:py-3 text-base sm:text-lg font-black transition-colors cursor-pointer ${
                exhausted
                  ? "border-white/5 bg-slate-900/40 text-slate-600 cursor-default"
                  : noteMode
                  ? "border-amber-400/40 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25"
                  : "border-indigo-400/35 bg-slate-900 hover:bg-indigo-600 text-white shadow"
              }`}
            >
              {num}
            </motion.button>
          );
        })}
      </div>

      {/* Oyun Sonu Penceresi */}
      <AnimatePresence>
        {endModal && (
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
              <Trophy className="h-10 w-10 mx-auto text-indigo-400 mb-2" />
              <h3 className="text-xl font-black text-white">
                {endModal.won ? "Sudoku Çözüldü!" : "3 Hata Hakkın Doldu!"}
              </h3>
              <p className="mt-1 text-xs text-slate-400">
                {SUDOKU_CONFIG[difficulty].label} • Süre:{" "}
                {formatTime(elapsedSec)}
              </p>

              <div className="my-4 rounded-2xl border border-white/10 bg-slate-950/80 p-4">
                <div className="text-xs text-slate-400">Toplam Skor</div>
                <div className="text-4xl font-black text-indigo-300 tabular-nums">
                  {endModal.finalScore.toLocaleString("tr-TR")}
                </div>
                {endModal.bonus > 0 && (
                  <div className="mt-1 text-xs font-bold text-emerald-400">
                    Hız & Can Bonusu: +{endModal.bonus.toLocaleString("tr-TR")}{" "}
                    P
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.94 }}
                  onClick={onRequestNewGameWithGate}
                  className="w-full flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-500 to-fuchsia-600 py-3.5 text-sm font-black text-white cursor-pointer"
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
