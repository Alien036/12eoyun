"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Chess, type Move, type PieceSymbol, type Square } from "chess.js";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import {
  ArrowLeft,
  RotateCcw,
  Clock,
  Trophy,
  Bot,
  Swords,
  AlertTriangle,
} from "lucide-react";
import {
  chooseBotMove,
  computeMaterialSummary,
  type BotDifficulty,
} from "./chessBot";
import {
  FRAME_THEMES,
  recordDuelGameResult,
  recordSoloGameResult,
  type PlayerDoc,
} from "@/lib/firestore";
import { sound } from "@/lib/sound";
import RollingScore from "@/components/ui/RollingScore";

interface ChessViewProps {
  mode: "solo" | "duel";
  player1: PlayerDoc;
  player2?: PlayerDoc;
  allPlayers: PlayerDoc[];
  onBackToHub: () => void;
  onRequestNewGameWithGate: () => void;
}

type TimeControlKey = "3m" | "5m" | "10m" | "unlimited";

interface AnimatedGlide {
  id: number;
  from: Square;
  to: Square;
  pieceType: PieceSymbol;
  rookFrom?: Square;
  rookTo?: Square;
  captured: boolean;
}

const TIME_CONTROLS: {
  key: TimeControlKey;
  label: string;
  seconds: number | null;
}[] = [
  { key: "3m", label: "3 dk Blitz", seconds: 180 },
  { key: "5m", label: "5 dk Hızlı", seconds: 300 },
  { key: "10m", label: "10 dk Klasik", seconds: 600 },
  { key: "unlimited", label: "Süresiz", seconds: null },
];

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

function getPieceSvgSrc(color: "w" | "b", type: PieceSymbol): string {
  return `/assets/chess/${color}${type.toUpperCase()}.svg`;
}

function squareToCoords(sq: Square): { row: number; col: number } {
  const col = FILES.indexOf(sq[0]);
  const rank = parseInt(sq[1], 10);
  return { row: 8 - rank, col };
}

export default function ChessView({
  mode,
  player1,
  player2,
  allPlayers,
  onBackToHub,
  onRequestNewGameWithGate,
}: ChessViewProps) {
  const [started, setStarted] = useState(false);
  const [botDiff, setBotDiff] = useState<BotDifficulty>("medium");
  const [timeKey, setTimeKey] = useState<TimeControlKey>(
    mode === "duel" ? "5m" : "unlimited"
  );

  const [fen, setFen] = useState(() => new Chess().fen());
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [selectedSq, setSelectedSq] = useState<Square | null>(null);
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(
    null
  );
  const [glide, setGlide] = useState<AnimatedGlide | null>(null);
  const [checkmateSquare, setCheckmateSquare] = useState<Square | null>(null);
  const [pendingPromo, setPendingPromo] = useState<{
    from: Square;
    to: Square;
  } | null>(null);

  const [whiteTime, setWhiteTime] = useState<number | null>(null);
  const [blackTime, setBlackTime] = useState<number | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [botThinking, setBotThinking] = useState(false);

  const [resultModal, setResultModal] = useState<{
    headline: string;
    reason: string;
    p1Score: number;
    p2Score?: number;
  } | null>(null);

  const glideIdRef = useRef(1);
  const gameOverTriggeredRef = useRef(false);

  const game = useMemo(() => new Chess(fen), [fen]);
  const turn = game.turn();
  const inCheck = game.inCheck();
  const material = useMemo(() => computeMaterialSummary(game), [game]);

  const legalMovesForSelected = useMemo<Move[]>(() => {
    if (!selectedSq) return [];
    return game.moves({ square: selectedSq, verbose: true });
  }, [game, selectedSq]);

  const legalTargetMap = useMemo(() => {
    const map = new Map<string, Move[]>();
    for (const m of legalMovesForSelected) {
      const existing = map.get(m.to) || [];
      existing.push(m);
      map.set(m.to, existing);
    }
    return map;
  }, [legalMovesForSelected]);

  const recordGlideFromMove = useCallback((moveRes: Move) => {
    let rookFrom: Square | undefined;
    let rookTo: Square | undefined;
    if (moveRes.flags.includes("k")) {
      const rank = moveRes.color === "w" ? "1" : "8";
      rookFrom = `h${rank}` as Square;
      rookTo = `f${rank}` as Square;
    } else if (moveRes.flags.includes("q")) {
      const rank = moveRes.color === "w" ? "1" : "8";
      rookFrom = `a${rank}` as Square;
      rookTo = `d${rank}` as Square;
    }

    setGlide({
      id: glideIdRef.current++,
      from: moveRes.from,
      to: moveRes.to,
      pieceType: moveRes.piece,
      rookFrom,
      rookTo,
      captured: Boolean(moveRes.captured),
    });
  }, []);

  const finalizeMatch = useCallback(
    async (
      winner: "w" | "b" | "draw",
      reasonText: string,
      finalGame: Chess,
      delayModalMs: number = 0
    ) => {
      if (gameOverTriggeredRef.current) return;
      gameOverTriggeredRef.current = true;

      const mat = computeMaterialSummary(finalGame);
      const speedBonus = Math.max(0, 600 - elapsedSec * 2);

      if (mode === "solo") {
        const baseMap: Record<BotDifficulty, number> = {
          easy: 1500,
          medium: 3500,
          hard: 6000,
        };
        const diffLabels: Record<BotDifficulty, string> = {
          easy: "Kolay Bot",
          medium: "Orta Bot",
          hard: "Zor Bot",
        };

        let earned = 0;
        if (winner === "w") {
          earned =
            baseMap[botDiff] +
            Math.max(0, mat.advantageWhite) * 75 +
            mat.whiteMaterial * 25 +
            speedBonus;
          sound.playVictory();
          confetti({ particleCount: 95, spread: 75, origin: { y: 0.58 } });
        } else if (winner === "draw") {
          earned = Math.round(baseMap[botDiff] * 0.35);
          sound.playClick();
        } else {
          earned = Math.max(150, mat.whiteMaterial * 20);
          sound.playGameOver();
        }

        await recordSoloGameResult(
          player1,
          {
            game: "chess",
            score: earned,
            won: winner === "w" ? true : winner === "b" ? false : undefined,
            durationSec: elapsedSec,
            modeLabel: diffLabels[botDiff],
          },
          allPlayers
        );

        window.setTimeout(() => {
          setResultModal({
            headline:
              winner === "w"
                ? `${player1.name} Kazandı!`
                : winner === "b"
                ? "Yapay Zeka Kazandı!"
                : "Maç Berabere!",
            reason: reasonText,
            p1Score: earned,
          });
        }, delayModalMs);
      } else if (player2) {
        let p1Earned = 0;
        let p2Earned = 0;

        if (winner === "w") {
          p1Earned = 4000 + mat.whiteMaterial * 55 + speedBonus;
          p2Earned = Math.max(200, mat.blackMaterial * 30);
          sound.playVictory();
          confetti({ particleCount: 95, spread: 75, origin: { y: 0.58 } });
        } else if (winner === "b") {
          p2Earned = 4000 + mat.blackMaterial * 55 + speedBonus;
          p1Earned = Math.max(200, mat.whiteMaterial * 30);
          sound.playVictory();
          confetti({ particleCount: 95, spread: 75, origin: { y: 0.58 } });
        } else {
          p1Earned = 1500 + mat.whiteMaterial * 35;
          p2Earned = 1500 + mat.blackMaterial * 35;
          sound.playClick();
        }

        await recordDuelGameResult({
          game: "chess",
          player1,
          player2,
          winner: winner === "w" ? 1 : winner === "b" ? 2 : "draw",
          p1Score: p1Earned,
          p2Score: p2Earned,
        });

        window.setTimeout(() => {
          setResultModal({
            headline:
              winner === "w"
                ? `${player1.name} Düelloyu Kazandı!`
                : winner === "b"
                ? `${player2.name} Düelloyu Kazandı!`
                : "Düello Berabere!",
            reason: reasonText,
            p1Score: p1Earned,
            p2Score: p2Earned,
          });
        }, delayModalMs);
      }
    },
    [mode, botDiff, elapsedSec, player1, player2, allPlayers]
  );

  const checkGameStateAfterMove = useCallback(
    (nextChess: Chess, landingSq: Square) => {
      if (!nextChess.isGameOver()) return false;

      if (nextChess.isCheckmate()) {
        const winColor = nextChess.turn() === "w" ? "b" : "w";
        // Slow-Mo Şah-Mat Vurgusu: Önce kazanan kareyi parlat, 650ms sonra sonuç ekranını aç
        setCheckmateSquare(landingSq);
        finalizeMatch(winColor, "Şah-Mat!", nextChess, 680);
      } else if (nextChess.isStalemate()) {
        finalizeMatch("draw", "Pat (Geçerli hamle kalmadı)", nextChess, 250);
      } else if (nextChess.isInsufficientMaterial()) {
        finalizeMatch("draw", "Yetersiz Materyal Beraberliği", nextChess, 250);
      } else if (nextChess.isThreefoldRepetition()) {
        finalizeMatch("draw", "Üç Konum Tekrarı Beraberliği", nextChess, 250);
      } else {
        finalizeMatch("draw", "50 Hamle Kuralı / Beraberlik", nextChess, 250);
      }
      return true;
    },
    [finalizeMatch]
  );

  // Saat ve geçen süre sayacı
  useEffect(() => {
    if (!started || resultModal || gameOverTriggeredRef.current) return;
    const timer = setInterval(() => {
      setElapsedSec((s) => s + 1);

      if (turn === "w" && whiteTime !== null) {
        setWhiteTime((prev) => {
          if (prev === null) return null;
          if (prev <= 1) {
            finalizeMatch("b", "Beyazın Süresi Doldu!", game);
            return 0;
          }
          return prev - 1;
        });
      } else if (turn === "b" && blackTime !== null) {
        setBlackTime((prev) => {
          if (prev === null) return null;
          if (prev <= 1) {
            finalizeMatch("w", "Siyahın Süresi Doldu!", game);
            return 0;
          }
          return prev - 1;
        });
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [started, resultModal, turn, whiteTime, blackTime, finalizeMatch, game]);

  // Solo modda Siyah (Yapay Zeka) hamlesi
  useEffect(() => {
    if (
      !started ||
      mode !== "solo" ||
      turn !== "b" ||
      resultModal ||
      gameOverTriggeredRef.current
    ) {
      return;
    }
    setBotThinking(true);

    const timeout = setTimeout(() => {
      const botDecision = chooseBotMove(fen, botDiff);
      setBotThinking(false);
      if (!botDecision) return;

      const clone = new Chess(fen);
      const moveRes = clone.move(botDecision);
      if (moveRes) {
        sound.playChessMove(Boolean(moveRes.captured), clone.inCheck());
        recordGlideFromMove(moveRes);
        setFen(clone.fen());
        setMoveHistory((prev) => [...prev, moveRes.san]);
        setLastMove({ from: moveRes.from, to: moveRes.to });
        setSelectedSq(null);
        checkGameStateAfterMove(clone, moveRes.to);
      }
    }, 280);

    return () => clearTimeout(timeout);
  }, [
    started,
    mode,
    turn,
    fen,
    botDiff,
    resultModal,
    recordGlideFromMove,
    checkGameStateAfterMove,
  ]);

  const executePlayerMove = (
    from: Square,
    to: Square,
    promotion?: PieceSymbol
  ) => {
    const clone = new Chess(fen);
    try {
      const moveRes = clone.move({ from, to, promotion });
      if (!moveRes) return;
      sound.playChessMove(Boolean(moveRes.captured), clone.inCheck());
      recordGlideFromMove(moveRes);
      setFen(clone.fen());
      setMoveHistory((prev) => [...prev, moveRes.san]);
      setLastMove({ from: moveRes.from, to: moveRes.to });
      setSelectedSq(null);
      setPendingPromo(null);
      checkGameStateAfterMove(clone, moveRes.to);
    } catch {
      sound.playInvalid();
    }
  };

  const handleSquareTap = (sq: Square) => {
    if (!started || resultModal || botThinking || gameOverTriggeredRef.current)
      return;
    if (mode === "solo" && turn === "b") return;

    const movesToSq = legalTargetMap.get(sq);
    if (selectedSq && movesToSq && movesToSq.length > 0) {
      const isPromo = movesToSq.some((m) => Boolean(m.promotion));
      if (isPromo) {
        setPendingPromo({ from: selectedSq, to: sq });
        return;
      }
      executePlayerMove(selectedSq, sq);
      return;
    }

    const pieceOnSq = game.get(sq);
    if (pieceOnSq && pieceOnSq.color === turn) {
      sound.playClick();
      setSelectedSq(sq === selectedSq ? null : sq);
    } else {
      setSelectedSq(null);
    }
  };

  const startMatch = () => {
    sound.playClick();
    const chosenCtrl = TIME_CONTROLS.find((t) => t.key === timeKey);
    const secs = chosenCtrl?.seconds ?? null;
    gameOverTriggeredRef.current = false;
    setFen(new Chess().fen());
    setMoveHistory([]);
    setSelectedSq(null);
    setLastMove(null);
    setGlide(null);
    setCheckmateSquare(null);
    setWhiteTime(secs);
    setBlackTime(secs);
    setElapsedSec(0);
    setResultModal(null);
    setStarted(true);
  };

  const formatClock = (secs: number | null): string => {
    if (secs === null) return "∞";
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  if (!started) {
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
            <span className="inline-flex items-center gap-1.5 text-xs font-black text-amber-300">
              <img
                src="/assets/chess/wN.svg"
                alt=""
                className="h-5 w-5 drop-shadow"
              />
              SATRANÇ ARENASI
            </span>
          </div>

          {mode === "solo" ? (
            <div>
              <label className="flex items-center gap-1.5 text-xs font-extrabold text-slate-200 mb-2">
                <Bot className="h-4 w-4 text-cyan-400" /> Yapay Zeka Zorluğu Seç
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { key: "easy", label: "Kolay", pts: "1.500+ P" },
                    { key: "medium", label: "Orta", pts: "3.500+ P" },
                    { key: "hard", label: "Zor", pts: "6.000+ P" },
                  ] as const
                ).map((d) => (
                  <motion.button
                    key={d.key}
                    type="button"
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.94 }}
                    onClick={() => {
                      sound.playClick();
                      setBotDiff(d.key);
                    }}
                    className={`rounded-2xl border p-3 text-center transition-colors cursor-pointer ${
                      botDiff === d.key
                        ? "border-amber-400 bg-amber-500/20 text-white shadow-[0_0_16px_rgba(251,191,36,0.25)]"
                        : "border-white/10 bg-white/5 text-slate-400"
                    }`}
                  >
                    <div className="text-sm font-black">{d.label}</div>
                    <div className="text-[10px] font-bold text-amber-300 mt-0.5">
                      {d.pts}
                    </div>
                  </motion.button>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-3 text-xs text-amber-200 flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 font-bold">
                <img src="/assets/chess/wK.svg" alt="" className="h-5 w-5" />
                {player1.name}
              </span>
              <Swords className="h-4 w-4 text-amber-300" />
              <span className="inline-flex items-center gap-1.5 font-bold">
                <img src="/assets/chess/bK.svg" alt="" className="h-5 w-5" />
                {player2?.name}
              </span>
            </div>
          )}

          <div>
            <label className="flex items-center gap-1.5 text-xs font-extrabold text-slate-200 mb-2">
              <Clock className="h-4 w-4 text-indigo-400" /> Satranç Saati Seçimi
            </label>
            <div className="grid grid-cols-2 gap-2">
              {TIME_CONTROLS.map((tc) => (
                <motion.button
                  key={tc.key}
                  type="button"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    sound.playClick();
                    setTimeKey(tc.key);
                  }}
                  className={`rounded-xl border py-2.5 text-xs font-extrabold transition-colors cursor-pointer ${
                    timeKey === tc.key
                      ? "border-indigo-400 bg-indigo-600/35 text-white"
                      : "border-white/10 bg-white/5 text-slate-400"
                  }`}
                >
                  {tc.label}
                </motion.button>
              ))}
            </div>
          </div>

          <motion.button
            type="button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.95 }}
            onClick={startMatch}
            className="w-full rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 py-3.5 text-sm font-black text-slate-950 shadow-lg hover:brightness-110 transition cursor-pointer"
          >
            Maçı Başlat!
          </motion.button>
        </motion.div>
      </div>
    );
  }

  const boardMatrix = game.board();
  const recentMoves = moveHistory.slice(-8);

  return (
    <div className="relative flex h-full w-full max-w-[460px] flex-col items-center justify-between touch-none select-none py-1">
      {/* Üst Menü */}
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

        {checkmateSquare ? (
          <motion.span
            initial={{ scale: 0.7 }}
            animate={{ scale: [1, 1.12, 1] }}
            transition={{ repeat: Infinity, duration: 0.8 }}
            className="inline-flex items-center gap-1 rounded-full bg-amber-500/30 border border-amber-300/80 px-3 py-0.5 text-xs font-black text-amber-200 shadow-[0_0_20px_rgba(251,191,36,0.6)]"
          >
            👑 ŞAH-MAT!
          </motion.span>
        ) : inCheck ? (
          <motion.span
            animate={{ scale: [1, 1.08, 1] }}
            transition={{ repeat: Infinity, duration: 0.9 }}
            className="inline-flex items-center gap-1 rounded-full bg-rose-500/25 border border-rose-400/60 px-3 py-0.5 text-xs font-black text-rose-300 shadow-[0_0_16px_rgba(244,63,94,0.45)]"
          >
            <AlertTriangle className="h-3.5 w-3.5" /> ŞAH!
          </motion.span>
        ) : (
          <span className="text-[11px] font-bold text-slate-400">
            Hamle #{Math.floor(moveHistory.length / 2) + 1}
          </span>
        )}

        <motion.button
          type="button"
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.94 }}
          onClick={onRequestNewGameWithGate}
          className="inline-flex items-center gap-1 rounded-xl border border-indigo-400/30 bg-indigo-500/15 px-3 py-1.5 text-xs font-extrabold text-indigo-200 cursor-pointer"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Yeni Maç
        </motion.button>
      </div>

      {/* Üst Rakip (Siyah) Barı */}
      <div
        className={`w-full flex items-center justify-between rounded-2xl border px-3.5 py-1.5 mt-1 shrink-0 transition-colors ${
          turn === "b"
            ? "border-amber-400/65 bg-slate-900/95 shadow-[0_0_18px_rgba(251,191,36,0.22)]"
            : "border-white/10 bg-slate-900/65"
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-800 border border-white/15 text-lg">
            {mode === "solo" ? "🤖" : player2?.avatar || "♚"}
          </div>
          <div className="min-w-0">
            <div className="truncate text-xs font-black text-white">
              {mode === "solo"
                ? `Yapay Zeka (${
                    botDiff === "easy"
                      ? "Kolay"
                      : botDiff === "medium"
                      ? "Orta"
                      : "Zor"
                  })`
                : player2?.name || "Siyah"}
              {botThinking && (
                <span className="ml-1.5 text-[10px] text-cyan-300 animate-pulse">
                  hamle hesaplıyor...
                </span>
              )}
            </div>
            <div className="flex items-center gap-0.5 h-4 overflow-hidden">
              {material.blackCaptured.length > 0 ? (
                material.blackCaptured.map((sym, idx) => (
                  <img
                    key={`bc-${idx}`}
                    src={getPieceSvgSrc("w", sym)}
                    alt=""
                    className="h-3.5 w-3.5 -ml-0.5 first:ml-0 drop-shadow"
                  />
                ))
              ) : (
                <span className="text-[10px] text-slate-500">Alınan taş yok</span>
              )}
              {material.advantageWhite < 0 && (
                <span className="ml-1 text-[10px] font-black text-emerald-400">
                  +{Math.abs(material.advantageWhite)}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-slate-950 px-3 py-1 font-mono text-sm font-black text-amber-300 tabular-nums">
          {formatClock(blackTime)}
        </div>
      </div>

      {/* 8x8 Turnuva Satranç Tahtası (cburnett SVG + 180ms Spring Glide + Knight Arc + Capture Dust) */}
      <div className="my-1 flex flex-1 w-full items-center justify-center min-h-0">
        <div className="grid w-full max-w-[min(92vw,52dvh,420px)] aspect-square grid-cols-8 grid-rows-8 overflow-hidden rounded-2xl border-2 border-amber-400/40 shadow-[0_18px_48px_rgba(0,0,0,0.75)]">
          {boardMatrix.map((rowArr, rIdx) =>
            rowArr.map((piece, cIdx) => {
              const sq = `${FILES[cIdx]}${8 - rIdx}` as Square;
              const isLight = (rIdx + cIdx) % 2 === 0;
              const isSelected = selectedSq === sq;
              const isLast = lastMove?.from === sq || lastMove?.to === sq;
              const targetMoves = legalTargetMap.get(sq);
              const isLegalTarget = Boolean(targetMoves?.length);
              const isCheckedKing =
                inCheck && piece?.type === "k" && piece.color === turn;
              const isMatingSq = checkmateSquare === sq;

              // Kayan taş (180ms spring glide) ofset hesabı
              let glideDxPct = 0;
              let glideDyPct = 0;
              let isGlidingMain = false;
              let isGlidingKnight = false;
              let isGlidingRook = false;

              if (glide && glide.to === sq) {
                const fromPos = squareToCoords(glide.from);
                glideDxPct = (fromPos.col - cIdx) * 100;
                glideDyPct = (fromPos.row - rIdx) * 100;
                isGlidingMain = true;
                isGlidingKnight = glide.pieceType === "n";
              } else if (glide?.rookFrom && glide.rookTo === sq) {
                const fromPos = squareToCoords(glide.rookFrom);
                glideDxPct = (fromPos.col - cIdx) * 100;
                glideDyPct = (fromPos.row - rIdx) * 100;
                isGlidingRook = true;
              }

              const showCaptureBurst =
                glide && glide.captured && glide.to === sq;

              return (
                <button
                  key={sq}
                  type="button"
                  onClick={() => handleSquareTap(sq)}
                  className={`relative flex items-center justify-center select-none cursor-pointer transition-colors ${
                    isSelected
                      ? "bg-cyan-400/75"
                      : isLast
                      ? isLight
                        ? "bg-amber-200"
                        : "bg-amber-600/80"
                      : isLight
                      ? "bg-[#eae9d2]"
                      : "bg-[#4b7399]"
                  }`}
                >
                  {/* Radyal Nabızlı Şah (Check) Işığı */}
                  {isCheckedKing && (
                    <motion.span
                      animate={{
                        opacity: [0.65, 1, 0.65],
                        scale: [0.92, 1.06, 0.92],
                      }}
                      transition={{ repeat: Infinity, duration: 0.95 }}
                      className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle,rgba(244,63,94,0.95)_0%,rgba(190,18,60,0.65)_62%,transparent_100%)]"
                    />
                  )}

                  {/* Şah-Mat Altın Vurgu Halkası */}
                  {isMatingSq && (
                    <motion.span
                      initial={{ scale: 0.5, opacity: 1 }}
                      animate={{ scale: [0.8, 1.35, 1.1], opacity: [1, 0.85, 1] }}
                      transition={{ duration: 0.65 }}
                      className="pointer-events-none absolute inset-0 z-20 ring-4 ring-amber-300 bg-amber-400/35 shadow-[0_0_28px_rgba(251,191,36,0.95)]"
                    />
                  )}

                  {/* Taş Yeme (Capture) Toz / Parçacık Halkası */}
                  {showCaptureBurst && (
                    <motion.span
                      key={`cap-${glide.id}`}
                      initial={{ scale: 0.25, opacity: 0.95 }}
                      animate={{ scale: 1.45, opacity: 0 }}
                      transition={{ duration: 0.34, ease: "easeOut" }}
                      className="pointer-events-none absolute inset-1 z-20 rounded-full border-2 border-amber-200/90 shadow-[0_0_14px_rgba(251,191,36,0.85)]"
                    />
                  )}

                  {/* Koordinat etiketleri */}
                  {cIdx === 0 && (
                    <span
                      className={`pointer-events-none absolute left-1 top-0.5 text-[9px] font-extrabold ${
                        isLight ? "text-[#4b7399]" : "text-[#eae9d2]"
                      }`}
                    >
                      {8 - rIdx}
                    </span>
                  )}
                  {rIdx === 7 && (
                    <span
                      className={`pointer-events-none absolute right-1 bottom-0 text-[9px] font-extrabold ${
                        isLight ? "text-[#4b7399]" : "text-[#eae9d2]"
                      }`}
                    >
                      {FILES[cIdx]}
                    </span>
                  )}

                  {/* Geçerli hamle hedefi */}
                  {isLegalTarget && !piece && (
                    <span className="pointer-events-none h-3.5 w-3.5 rounded-full bg-slate-950/35 ring-2 ring-white/40" />
                  )}
                  {isLegalTarget && piece && (
                    <span className="pointer-events-none absolute inset-1 z-20 rounded-full ring-[3.5px] ring-rose-500/85" />
                  )}

                  {/* Lichess cburnett Staunton SVG Satranç Taşı */}
                  {piece && (
                    <motion.img
                      key={
                        isGlidingMain || isGlidingRook
                          ? `glide-${glide?.id}-${sq}`
                          : `static-${sq}-${piece.color}${piece.type}`
                      }
                      src={getPieceSvgSrc(piece.color, piece.type)}
                      alt=""
                      draggable={false}
                      initial={
                        isGlidingMain || isGlidingRook
                          ? {
                              x: `${glideDxPct}%`,
                              y: `${glideDyPct}%`,
                              scale: isGlidingKnight ? 0.95 : 1,
                            }
                          : false
                      }
                      animate={
                        isGlidingKnight
                          ? {
                              x: "0%",
                              y: "0%",
                              scale: [1, 1.26, 1],
                            }
                          : {
                              x: "0%",
                              y: "0%",
                              scale: isSelected ? 1.08 : 1,
                            }
                      }
                      transition={
                        isGlidingKnight
                          ? {
                              x: {
                                type: "spring",
                                stiffness: 390,
                                damping: 28,
                              },
                              y: {
                                type: "spring",
                                stiffness: 390,
                                damping: 28,
                              },
                              scale: { duration: 0.24, ease: "easeOut" },
                            }
                          : {
                              type: "spring",
                              stiffness: 440,
                              damping: 32,
                            }
                      }
                      className={`pointer-events-none w-[84%] h-[84%] select-none will-change-transform ${
                        isGlidingKnight
                          ? "z-30 drop-shadow-[0_12px_12px_rgba(0,0,0,0.65)]"
                          : isGlidingMain
                          ? "z-20 drop-shadow-[0_5px_6px_rgba(0,0,0,0.5)]"
                          : "z-10 drop-shadow-[0_3px_4px_rgba(0,0,0,0.42)]"
                      }`}
                    />
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Canlı SAN Hamle Notasyon Şeridi */}
      <div className="w-full flex items-center gap-1.5 overflow-x-auto rounded-xl border border-white/10 bg-slate-950/75 px-2.5 py-1 text-[11px] no-scrollbar shrink-0 mb-1">
        <span className="font-bold text-slate-500 shrink-0">Hamleler:</span>
        {recentMoves.length === 0 ? (
          <span className="text-slate-500 italic">Açılış hamlesi bekleniyor...</span>
        ) : (
          recentMoves.map((san, idx) => {
            const globalIdx = moveHistory.length - recentMoves.length + idx;
            const moveNo = Math.floor(globalIdx / 2) + 1;
            const isWhiteMove = globalIdx % 2 === 0;
            return (
              <span
                key={`${globalIdx}-${san}`}
                className="shrink-0 rounded-md bg-white/5 px-1.5 py-0.5 font-mono font-bold text-slate-200"
              >
                {isWhiteMove ? `${moveNo}. ${san}` : san}
              </span>
            );
          })
        )}
      </div>

      {/* Alt Oyuncu (Beyaz - 1. Oyuncu) Barı */}
      <div
        className={`w-full flex items-center justify-between rounded-2xl border px-3.5 py-1.5 shrink-0 transition-colors ${
          turn === "w"
            ? "border-cyan-400/65 bg-slate-900/95 shadow-[0_0_18px_rgba(34,211,238,0.22)]"
            : "border-white/10 bg-slate-900/65"
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${
              FRAME_THEMES[player1.frameColor].bgClass
            } ${FRAME_THEMES[player1.frameColor].ringClass} text-lg`}
          >
            {player1.avatar}
          </div>
          <div className="min-w-0">
            <div className="truncate text-xs font-black text-white">
              {player1.name} (Beyaz)
            </div>
            <div className="flex items-center gap-0.5 h-4 overflow-hidden">
              {material.whiteCaptured.length > 0 ? (
                material.whiteCaptured.map((sym, idx) => (
                  <img
                    key={`wc-${idx}`}
                    src={getPieceSvgSrc("b", sym)}
                    alt=""
                    className="h-3.5 w-3.5 -ml-0.5 first:ml-0 drop-shadow"
                  />
                ))
              ) : (
                <span className="text-[10px] text-slate-500">Alınan taş yok</span>
              )}
              {material.advantageWhite > 0 && (
                <span className="ml-1 text-[10px] font-black text-emerald-400">
                  +{material.advantageWhite}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-slate-950 px-3 py-1 font-mono text-sm font-black text-cyan-300 tabular-nums">
          {formatClock(whiteTime)}
        </div>
      </div>

      {/* Piyon Terfisi Seçim Penceresi (cburnett SVG ile) */}
      <AnimatePresence>
        {pendingPromo && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.9, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              className="rounded-3xl border border-white/15 bg-slate-900 p-5 text-center shadow-2xl"
            >
              <div className="text-sm font-black text-white mb-3">
                Piyon Terfisi — Yeni Taşını Seç
              </div>
              <div className="grid grid-cols-4 gap-2.5">
                {(["q", "r", "b", "n"] as PieceSymbol[]).map((sym) => (
                  <motion.button
                    key={sym}
                    type="button"
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.92 }}
                    onClick={() =>
                      executePlayerMove(pendingPromo.from, pendingPromo.to, sym)
                    }
                    className="flex h-15 w-15 items-center justify-center rounded-2xl border border-white/15 bg-slate-800 hover:bg-indigo-600 p-2 transition-colors cursor-pointer"
                  >
                    <img
                      src={getPieceSvgSrc(turn, sym)}
                      alt=""
                      className="h-11 w-11 drop-shadow"
                    />
                  </motion.button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Maç Sonu Modalı */}
      <AnimatePresence>
        {resultModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-4"
          >
            <motion.div
              initial={{ scale: 0.88, y: 18, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              transition={{ type: "spring", stiffness: 360, damping: 28 }}
              className="w-full max-w-sm rounded-3xl border border-white/15 bg-slate-900 p-6 text-center shadow-2xl"
            >
              <Trophy className="h-10 w-10 mx-auto text-amber-400 mb-2" />
              <h3 className="text-xl font-black text-white">
                {resultModal.headline}
              </h3>
              <p className="mt-1 text-xs font-semibold text-amber-300">
                {resultModal.reason}
              </p>

              <div className="my-4 space-y-2 rounded-2xl border border-white/10 bg-slate-950/80 p-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-300 font-bold">
                    {player1.name}:
                  </span>
                  <span className="font-black text-cyan-300 tabular-nums">
                    +
                    <RollingScore
                      value={resultModal.p1Score}
                      className="font-black text-cyan-300 tabular-nums"
                      showDeltaPopup={false}
                    />{" "}
                    P
                  </span>
                </div>
                {player2 && typeof resultModal.p2Score === "number" && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300 font-bold">
                      {player2.name}:
                    </span>
                    <span className="font-black text-amber-300 tabular-nums">
                      +
                      <RollingScore
                        value={resultModal.p2Score}
                        className="font-black text-amber-300 tabular-nums"
                        showDeltaPopup={false}
                      />{" "}
                      P
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
                  className="w-full flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 py-3.5 text-sm font-black text-slate-950 cursor-pointer"
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
