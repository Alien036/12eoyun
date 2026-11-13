"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import {
  ArrowLeft,
  RotateCcw,
  Undo2,
  Sparkles,
  Trophy,
  Flag,
} from "lucide-react";
import {
  SUIT_ORDER,
  canAutoComplete,
  canPlaceOnFoundation,
  canPlaceOnTableauColumn,
  cloneKlondikeState,
  dealNewKlondike,
  formatRank,
  isKlondikeWon,
  isRedSuit,
  stepAutoComplete,
  type KlondikeState,
  type PlayingCard,
  type Suit,
} from "./klondike";
import { CardBackPattern, CardFaceVisual, SuitSvg } from "./CardVisual";
import { recordSoloGameResult, type PlayerDoc } from "@/lib/firestore";
import { sound } from "@/lib/sound";
import RollingScore from "@/components/ui/RollingScore";

interface SolitaireViewProps {
  player: PlayerDoc;
  allPlayers: PlayerDoc[];
  onBackToHub: () => void;
  onRequestNewGameWithGate: () => void;
}

interface SelectedSource {
  from: "waste" | "tableau";
  colIndex?: number;
  cardIndex?: number;
}

interface CardDragState {
  from: "waste" | "tableau";
  colIndex?: number;
  cardIndex?: number;
  cards: PlayingCard[];
  pointerId: number;
  startX: number;
  startY: number;
  clientX: number;
  clientY: number;
  offsetX: number;
  offsetY: number;
  cardWidth: number;
  tiltDeg: number;
  movedEnough: boolean;
}

const CARD_STACK_STEP_PX = 22;

export default function SolitaireView({
  player,
  allPlayers,
  onBackToHub,
  onRequestNewGameWithGate,
}: SolitaireViewProps) {
  const [state, setState] = useState<KlondikeState>(() => dealNewKlondike());
  const [history, setHistory] = useState<KlondikeState[]>([]);
  const [selected, setSelected] = useState<SelectedSource | null>(null);
  const [flippedIds, setFlippedIds] = useState<Set<string>>(() => new Set());
  const [elapsedSec, setElapsedSec] = useState(0);
  const [autoRunning, setAutoRunning] = useState(false);
  const [drag, setDrag] = useState<CardDragState | null>(null);

  const [finishedModal, setFinishedModal] = useState<{
    won: boolean;
    finalScore: number;
    speedBonus: number;
  } | null>(null);

  const waterfallCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const foundationRefs = useRef<Record<Suit, HTMLButtonElement | null>>({
    spades: null,
    hearts: null,
    clubs: null,
    diamonds: null,
  });
  const columnRefs = useRef<(HTMLDivElement | null)[]>([]);
  const lastDragXRef = useRef<number>(0);
  const autoStepIndexRef = useRef<number>(0);

  useEffect(() => {
    if (finishedModal) return;
    const t = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [finishedModal]);

  // Klasik Zıplayan İskambil Kartı Şelalesi (Victory Card Waterfall Canvas)
  useEffect(() => {
    if (!finishedModal?.won) return;
    const cvs = waterfallCanvasRef.current;
    const ctx = cvs?.getContext("2d");
    if (!cvs || !ctx) return;

    const resize = () => {
      cvs.width = window.innerWidth;
      cvs.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const ranks = ["K", "Q", "J", "10", "9", "8", "7", "6", "5", "4", "3", "2", "A"];
    const suits = [
      { sym: "♠", color: "#0f172a" },
      { sym: "♥", color: "#e11d48" },
      { sym: "♣", color: "#0f172a" },
      { sym: "♦", color: "#e11d48" },
    ];

    let cardSeq = 0;
    let activeCard = {
      x: cvs.width * 0.65,
      y: 90,
      vx: -4.5,
      vy: -2,
      rank: "K",
      suitSym: "♠",
      color: "#0f172a",
    };

    const spawnNext = () => {
      const s = suits[cardSeq % 4];
      const r = ranks[Math.floor(cardSeq / 4) % ranks.length];
      cardSeq++;
      activeCard = {
        x: cvs.width * (0.48 + (cardSeq % 4) * 0.11),
        y: 85,
        vx: (Math.random() > 0.5 ? 1 : -1) * (3.2 + Math.random() * 3.8),
        vy: -1.5 - Math.random() * 2.5,
        rank: r,
        suitSym: s.sym,
        color: s.color,
      };
    };
    spawnNext();

    let rafId = 0;
    let frameCount = 0;
    const cardW = 64;
    const cardH = 92;

    const loop = () => {
      frameCount++;
      // Klasik Solitaire iz bırakma efekti: ekranı silmiyoruz, zıplayan kartlar iz bırakarak dolduruyor!
      for (let step = 0; step < 2; step++) {
        activeCard.x += activeCard.vx;
        activeCard.y += activeCard.vy;
        activeCard.vy += 0.38;

        if (activeCard.y + cardH >= cvs.height - 8) {
          activeCard.y = cvs.height - 8 - cardH;
          activeCard.vy = -Math.abs(activeCard.vy) * 0.82;
          if (Math.abs(activeCard.vy) < 1.8) {
            activeCard.vy = -6.5;
          }
        }

        // Kart çizimi
        ctx.save();
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = "#cbd5e1";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(activeCard.x, activeCard.y, cardW, cardH, 8);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = activeCard.color;
        ctx.font = "900 13px sans-serif";
        ctx.fillText(
          `${activeCard.rank}${activeCard.suitSym}`,
          activeCard.x + 6,
          activeCard.y + 17
        );
        ctx.font = "24px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(
          activeCard.suitSym,
          activeCard.x + cardW / 2,
          activeCard.y + cardH / 2 + 9
        );
        ctx.restore();

        if (
          activeCard.x < -cardW - 20 ||
          activeCard.x > cvs.width + 20 ||
          frameCount % 85 === 0
        ) {
          spawnNext();
        }
      }

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
    };
  }, [finishedModal?.won]);

  const markFlipped = (cardId: string) => {
    setFlippedIds((prev) => {
      const next = new Set(prev);
      next.add(cardId);
      return next;
    });
    window.setTimeout(() => {
      setFlippedIds((prev) => {
        const next = new Set(prev);
        next.delete(cardId);
        return next;
      });
    }, 450);
  };

  const finishGame = useCallback(
    async (won: boolean, baseScore: number) => {
      // 0 - 10.000 Ölçeği: Oyunu tamamlama ödülü +1.000 + süre bonusu Math.max(0, Math.round(900 - elapsedSec * 2.5))
      const timeBonus = won
        ? Math.max(0, Math.round(900 - elapsedSec * 2.5))
        : 0;
      const speedBonus = won ? 1000 + timeBonus : 0;
      const finalScore = baseScore + speedBonus;

      if (won) {
        sound.playVictory();
        confetti({ particleCount: 100, spread: 75, origin: { y: 0.6 } });
      } else {
        sound.playGameOver();
      }

      await recordSoloGameResult(
        player,
        {
          game: "solitaire",
          score: finalScore,
          won,
          durationSec: elapsedSec,
          modeLabel: "Klondike",
        },
        allPlayers
      );

      setFinishedModal({ won, finalScore, speedBonus });
    },
    [elapsedSec, player, allPlayers]
  );

  // Otomatik Tamamla Animasyonu (Yükselen Müzikal Notalarla!)
  useEffect(() => {
    if (!autoRunning || finishedModal) return;
    const timer = setTimeout(() => {
      const next = stepAutoComplete(state);
      if (next) {
        sound.playCardFoundation(autoStepIndexRef.current++);
        setState(next);
        if (isKlondikeWon(next)) {
          setAutoRunning(false);
          finishGame(true, next.score);
        }
      } else {
        setAutoRunning(false);
      }
    }, 80);
    return () => clearTimeout(timer);
  }, [autoRunning, state, finishedModal, finishGame]);

  const pushAndApply = useCallback(
    (next: KlondikeState) => {
      setHistory((h) => [...h.slice(-29), cloneKlondikeState(state)]);
      setState(next);
      setSelected(null);
      if (isKlondikeWon(next)) {
        finishGame(true, next.score);
      }
    },
    [state, finishGame]
  );

  const handleUndo = () => {
    if (history.length === 0 || autoRunning || finishedModal) return;
    sound.playCardFlip();
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setState(prev);
    setSelected(null);
  };

  // Deste Çekme (1 Kart Modu + 3D Çevirme Efekti)
  const handleDrawStock = () => {
    if (autoRunning || finishedModal) return;
    const next = cloneKlondikeState(state);

    if (next.stock.length > 0) {
      const drawn = next.stock.pop()!;
      drawn.faceUp = true;
      next.waste.push(drawn);
      next.moves += 1;
      markFlipped(drawn.id);
      sound.playCardFlip();
      pushAndApply(next);
    } else if (next.waste.length > 0) {
      next.stock = next.waste
        .reverse()
        .map((c) => ({ ...c, faceUp: false }));
      next.waste = [];
      next.moves += 1;
      sound.playCardFlip();
      pushAndApply(next);
    }
  };

  // Sütun sonunda kapalı kart açıldıysa 3D çevir ve +20 puan ver
  const revealTopIfNeeded = (col: PlayingCard[]): number => {
    if (col.length > 0 && !col[col.length - 1].faceUp) {
      const top = col[col.length - 1];
      top.faceUp = true;
      markFlipped(top.id);
      return 20;
    }
    return 0;
  };

  // Tek dokunuşla (Tap-to-Move) en mantıklı yuvaya otomatik taşıma
  const trySmartTapMove = useCallback(
    (from: "waste" | "tableau", colIdx?: number, cardIdx?: number): boolean => {
      const next = cloneKlondikeState(state);

      if (from === "waste") {
        if (next.waste.length === 0) return false;
        const card = next.waste[next.waste.length - 1];

        const fPile = next.foundations[card.suit];
        if (canPlaceOnFoundation(card, fPile, card.suit)) {
          next.waste.pop();
          fPile.push(card);
          next.score += 40;
          next.moves += 1;
          sound.playCardFoundation(fPile.length);
          pushAndApply(next);
          return true;
        }

        for (let t = 0; t < 7; t++) {
          if (canPlaceOnTableauColumn(card, next.tableau[t])) {
            next.waste.pop();
            next.tableau[t].push(card);
            next.score += 5;
            next.moves += 1;
            sound.playCardFlip();
            pushAndApply(next);
            return true;
          }
        }
        return false;
      }

      if (from === "tableau" && colIdx !== undefined && cardIdx !== undefined) {
        const sourceCol = next.tableau[colIdx];
        const movingSlice = sourceCol.slice(cardIdx);
        if (movingSlice.length === 0 || !movingSlice[0].faceUp) return false;

        if (movingSlice.length === 1) {
          const card = movingSlice[0];
          const fPile = next.foundations[card.suit];
          if (canPlaceOnFoundation(card, fPile, card.suit)) {
            sourceCol.pop();
            fPile.push(card);
            next.score += 40 + revealTopIfNeeded(sourceCol);
            next.moves += 1;
            sound.playCardFoundation(fPile.length);
            pushAndApply(next);
            return true;
          }
        }

        const targetOrder = [0, 1, 2, 3, 4, 5, 6]
          .filter((i) => i !== colIdx)
          .sort((a, b) => next.tableau[b].length - next.tableau[a].length);

        for (const targetColIdx of targetOrder) {
          if (
            cardIdx === 0 &&
            movingSlice[0].rank === 13 &&
            next.tableau[targetColIdx].length === 0
          ) {
            continue;
          }

          if (
            canPlaceOnTableauColumn(movingSlice[0], next.tableau[targetColIdx])
          ) {
            next.tableau[colIdx] = sourceCol.slice(0, cardIdx);
            next.tableau[targetColIdx].push(...movingSlice);
            const flipPts = revealTopIfNeeded(next.tableau[colIdx]);
            next.score += flipPts > 0 ? flipPts : 5;
            next.moves += 1;
            sound.playCardFlip();
            pushAndApply(next);
            return true;
          }
        }
      }

      return false;
    },
    [state, pushAndApply]
  );

  const moveSourceToFoundation = useCallback(
    (src: SelectedSource, suit: Suit): boolean => {
      const next = cloneKlondikeState(state);

      if (src.from === "waste" && next.waste.length > 0) {
        const card = next.waste[next.waste.length - 1];
        if (canPlaceOnFoundation(card, next.foundations[suit], suit)) {
          next.waste.pop();
          next.foundations[suit].push(card);
          next.score += 40;
          next.moves += 1;
          sound.playCardFoundation(next.foundations[suit].length);
          pushAndApply(next);
          return true;
        }
      } else if (
        src.from === "tableau" &&
        src.colIndex !== undefined &&
        src.cardIndex !== undefined
      ) {
        const col = next.tableau[src.colIndex];
        if (src.cardIndex === col.length - 1) {
          const card = col[col.length - 1];
          if (canPlaceOnFoundation(card, next.foundations[suit], suit)) {
            col.pop();
            next.foundations[suit].push(card);
            next.score += 40 + revealTopIfNeeded(col);
            next.moves += 1;
            sound.playCardFoundation(next.foundations[suit].length);
            pushAndApply(next);
            return true;
          }
        }
      }
      return false;
    },
    [state, pushAndApply]
  );

  const moveSourceToColumn = useCallback(
    (src: SelectedSource, targetColIdx: number): boolean => {
      const next = cloneKlondikeState(state);

      if (src.from === "waste" && next.waste.length > 0) {
        const card = next.waste[next.waste.length - 1];
        if (canPlaceOnTableauColumn(card, next.tableau[targetColIdx])) {
          next.waste.pop();
          next.tableau[targetColIdx].push(card);
          next.score += 5;
          next.moves += 1;
          sound.playCardFlip();
          pushAndApply(next);
          return true;
        }
      } else if (
        src.from === "tableau" &&
        src.colIndex !== undefined &&
        src.cardIndex !== undefined &&
        src.colIndex !== targetColIdx
      ) {
        const srcCol = next.tableau[src.colIndex];
        const moving = srcCol.slice(src.cardIndex);
        if (
          moving.length > 0 &&
          canPlaceOnTableauColumn(moving[0], next.tableau[targetColIdx])
        ) {
          next.tableau[src.colIndex] = srcCol.slice(0, src.cardIndex);
          next.tableau[targetColIdx].push(...moving);
          const flipPts = revealTopIfNeeded(next.tableau[src.colIndex]);
          next.score += flipPts > 0 ? flipPts : 5;
          next.moves += 1;
          sound.playCardFlip();
          pushAndApply(next);
          return true;
        }
      }
      return false;
    },
    [state, pushAndApply]
  );

  const handleCardTap = useCallback(
    (from: "waste" | "tableau", colIdx?: number, cardIdx?: number) => {
      if (autoRunning || finishedModal) return;

      if (
        selected &&
        from === "tableau" &&
        colIdx !== undefined &&
        (selected.from !== "tableau" || selected.colIndex !== colIdx)
      ) {
        if (!moveSourceToColumn(selected, colIdx)) {
          setSelected(null);
        }
        return;
      }

      const moved = trySmartTapMove(from, colIdx, cardIdx);
      if (moved) return;

      sound.playClick();
      setSelected({ from, colIndex: colIdx, cardIndex: cardIdx });
    },
    [autoRunning, finishedModal, selected, moveSourceToColumn, trySmartTapMove]
  );

  // PointerEvents ile Hıza Duyarlı Sürükleme + Tap-to-Move Hibrit Kontrolü
  const startCardPointerDrag = (
    e: React.PointerEvent<HTMLElement>,
    from: "waste" | "tableau",
    cards: PlayingCard[],
    colIndex?: number,
    cardIndex?: number
  ) => {
    if (autoRunning || finishedModal || cards.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    lastDragXRef.current = e.clientX;
    setDrag({
      from,
      colIndex,
      cardIndex,
      cards,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      clientX: e.clientX,
      clientY: e.clientY,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      cardWidth: rect.width,
      tiltDeg: 0,
      movedEnough: false,
    });
  };

  useEffect(() => {
    if (!drag) return;

    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== drag.pointerId) return;
      const dist = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY);
      const dx = e.clientX - lastDragXRef.current;
      lastDragXRef.current = e.clientX;
      const targetTilt = Math.max(-7, Math.min(7, dx * 0.45));

      setDrag((prev) =>
        prev
          ? {
              ...prev,
              clientX: e.clientX,
              clientY: e.clientY,
              tiltDeg: prev.tiltDeg * 0.55 + targetTilt * 0.45,
              movedEnough: prev.movedEnough || dist > 7,
            }
          : null
      );
    };

    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== drag.pointerId) return;
      const done = drag;
      setDrag(null);
      if (e.type === "pointercancel") return;

      // Eğer sürüklenmediyse (sadece tıklandıysa) Tap-to-Move çalıştır
      if (!done.movedEnough) {
        handleCardTap(done.from, done.colIndex, done.cardIndex);
        return;
      }

      const src: SelectedSource = {
        from: done.from,
        colIndex: done.colIndex,
        cardIndex: done.cardIndex,
      };

      // 1. Foundation yuvaları üzerine mi bırakıldı?
      if (done.cards.length === 1) {
        for (const suit of SUIT_ORDER) {
          const el = foundationRefs.current[suit];
          if (!el) continue;
          const r = el.getBoundingClientRect();
          if (
            e.clientX >= r.left - 8 &&
            e.clientX <= r.right + 8 &&
            e.clientY >= r.top - 8 &&
            e.clientY <= r.bottom + 8
          ) {
            if (moveSourceToFoundation(src, suit)) return;
          }
        }
      }

      // 2. Hangi Tableau sütunu üzerine bırakıldı?
      for (let cIdx = 0; cIdx < 7; cIdx++) {
        const el = columnRefs.current[cIdx];
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (
          e.clientX >= r.left - 6 &&
          e.clientX <= r.right + 6 &&
          e.clientY >= r.top - 10 &&
          e.clientY <= r.bottom + 40
        ) {
          if (moveSourceToColumn(src, cIdx)) return;
        }
      }

      sound.playInvalid();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [drag, handleCardTap, moveSourceToFoundation, moveSourceToColumn]);

  const autoReady = canAutoComplete(state);
  const topWaste =
    state.waste.length > 0 ? state.waste[state.waste.length - 1] : null;

  const formatTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(
      2,
      "0"
    )}`;

  return (
    <div className="relative flex h-full w-full max-w-2xl flex-col justify-between touch-none select-none rounded-3xl border-[6px] border-[#5C3A21] bg-gradient-to-b from-[#065f46] via-[#047857] to-[#064e3b] p-2.5 sm:p-3.5 shadow-[0_20px_50px_rgba(0,0,0,0.7),inset_0_0_40px_rgba(0,0,0,0.35)]">
      {/* Üst Kontrol ve Canlı Skor Sayacı Barı */}
      <div className="flex items-center justify-between gap-2 shrink-0">
        <motion.button
          type="button"
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.94 }}
          onClick={onBackToHub}
          className="inline-flex items-center gap-1 rounded-xl border border-white/12 bg-slate-900/80 px-3 py-1.5 text-xs font-extrabold text-slate-200 cursor-pointer"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Lobi
        </motion.button>

        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/85 px-3.5 py-1.5 text-xs">
          <span className="font-extrabold text-white truncate max-w-[100px]">
            {player.name}
          </span>
          <span className="inline-flex items-center gap-0.5 font-black text-amber-300">
            <RollingScore
              value={state.score}
              className="font-black text-amber-300 tabular-nums"
              popupColorClass="text-emerald-300"
            />
            <span>P</span>
          </span>
          <span className="font-mono text-slate-400 tabular-nums">
            {formatTime(elapsedSec)}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <motion.button
            type="button"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.94 }}
            disabled={history.length === 0 || autoRunning}
            onClick={handleUndo}
            title="Hamleyi Geri Al"
            className="inline-flex items-center gap-1 rounded-xl border border-white/12 bg-slate-900/80 px-2.5 py-1.5 text-xs font-bold text-slate-200 disabled:opacity-40 cursor-pointer"
          >
            <Undo2 className="h-3.5 w-3.5" /> Geri
          </motion.button>

          <motion.button
            type="button"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.94 }}
            onClick={() => finishGame(false, state.score)}
            title="Mevcut Skoru Kaydet ve Bitir"
            className="inline-flex items-center gap-1 rounded-xl border border-rose-400/30 bg-rose-500/15 px-2.5 py-1.5 text-xs font-bold text-rose-200 cursor-pointer"
          >
            <Flag className="h-3.5 w-3.5" /> Bitir
          </motion.button>
        </div>
      </div>

      {/* Otomatik Tamamla Butonu */}
      {autoReady && !autoRunning && (
        <motion.button
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.96 }}
          type="button"
          onClick={() => {
            autoStepIndexRef.current = 0;
            setAutoRunning(true);
          }}
          className="mt-1.5 w-full flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 via-cyan-500 to-indigo-600 py-2 text-xs font-black text-white shadow-[0_0_24px_rgba(34,211,238,0.4)] cursor-pointer shrink-0"
        >
          <Sparkles className="h-4 w-4" /> Tüm Kapalı Kartlar Açıldı — Otomatik
          Tamamla!
        </motion.button>
      )}

      {/* Üst Yuvalar: Sol Çekme/Atık Destesi | Sağ 4 Foundation Yuvası */}
      <div
        style={{ perspective: "1000px" }}
        className="mt-2 grid grid-cols-7 gap-1.5 sm:gap-2.5 shrink-0"
      >
        {/* Stock (Çekme Destesi) */}
        <motion.button
          type="button"
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.94 }}
          onClick={handleDrawStock}
          className="relative aspect-[2.5/3.6] rounded-xl cursor-pointer"
        >
          {state.stock.length > 0 ? (
            <div className="relative h-full w-full">
              <CardBackPattern />
              <span className="absolute bottom-1 right-1.5 rounded-md bg-slate-950/85 px-1.5 py-0.5 text-[9px] font-black text-amber-300 tabular-nums">
                {state.stock.length}
              </span>
            </div>
          ) : (
            <div className="h-full w-full rounded-xl border-2 border-dashed border-indigo-400/40 bg-slate-900/70 flex flex-col items-center justify-center text-indigo-300">
              <span className="text-lg font-black">↻</span>
              <span className="text-[9px] font-bold">Yenile</span>
            </div>
          )}
        </motion.button>

        {/* Waste (Açılan Kart) */}
        <div className="aspect-[2.5/3.6]">
          {topWaste &&
          !(drag?.movedEnough && drag.from === "waste") ? (
            <div
              onPointerDown={(e) => startCardPointerDrag(e, "waste", [topWaste])}
              className="h-full w-full cursor-grab active:cursor-grabbing"
            >
              <CardFaceVisual
                suit={topWaste.suit}
                rank={topWaste.rank}
                justFlipped={flippedIds.has(topWaste.id)}
                selected={selected?.from === "waste"}
              />
            </div>
          ) : (
            <div className="h-full w-full rounded-xl border border-dashed border-white/15 bg-white/[0.02]" />
          )}
        </div>

        {/* Boşluk */}
        <div />

        {/* 4 Renk Foundation Yuvası (As -> Papaz) */}
        {SUIT_ORDER.map((suit) => {
          const pile = state.foundations[suit];
          const topCard = pile.length > 0 ? pile[pile.length - 1] : null;

          return (
            <motion.button
              key={suit}
              ref={(el) => {
                foundationRefs.current[suit] = el;
              }}
              type="button"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                if (selected) moveSourceToFoundation(selected, suit);
              }}
              className="aspect-[2.5/3.6] rounded-xl border border-amber-400/35 bg-slate-900/80 flex items-center justify-center shadow-inner cursor-pointer hover:border-amber-300"
            >
              {topCard ? (
                <CardFaceVisual suit={topCard.suit} rank={topCard.rank} />
              ) : (
                <SuitSvg
                  suit={suit}
                  className="h-5 w-5 sm:h-7 sm:w-7 opacity-30"
                />
              )}
            </motion.button>
          );
        })}
      </div>

      {/* 7 Sütunlu Tableau Alanı (SADECE GPU translate3d yığınlama — top YOK!) */}
      <div
        style={{ perspective: "1100px" }}
        className="mt-2.5 flex-1 grid grid-cols-7 gap-1.5 sm:gap-2.5 overflow-y-auto pb-2 min-h-0"
      >
        {state.tableau.map((col, colIdx) => (
          <div
            key={colIdx}
            ref={(el) => {
              columnRefs.current[colIdx] = el;
            }}
            className="relative min-h-[250px]"
          >
            {col.length === 0 ? (
              <button
                type="button"
                onClick={() => {
                  if (selected) moveSourceToColumn(selected, colIdx);
                }}
                className="w-full aspect-[2.5/3.6] rounded-xl border border-dashed border-white/20 bg-white/[0.03] flex items-center justify-center text-[11px] font-black text-slate-500 cursor-pointer hover:border-cyan-400/50"
              >
                K
              </button>
            ) : (
              col.map((card, cardIdx) => {
                const isBeingDragged =
                  drag?.movedEnough &&
                  drag.from === "tableau" &&
                  drag.colIndex === colIdx &&
                  drag.cardIndex !== undefined &&
                  cardIdx >= drag.cardIndex;

                if (isBeingDragged) return null;

                const isTop = cardIdx === col.length - 1;
                const isSelected =
                  selected?.from === "tableau" &&
                  selected.colIndex === colIdx &&
                  selected.cardIndex !== undefined &&
                  cardIdx >= selected.cardIndex;
                const offsetY = cardIdx * CARD_STACK_STEP_PX;

                return (
                  <div
                    key={card.id}
                    style={{
                      top: 0,
                      transform: `translate3d(0, ${
                        isSelected ? offsetY - 4 : offsetY
                      }px, 0)`,
                    }}
                    onPointerDown={(e) => {
                      if (card.faceUp) {
                        startCardPointerDrag(
                          e,
                          "tableau",
                          col.slice(cardIdx),
                          colIdx,
                          cardIdx
                        );
                      }
                    }}
                    className={`absolute inset-x-0 aspect-[2.5/3.6] will-change-transform ${
                      card.faceUp
                        ? "cursor-grab active:cursor-grabbing"
                        : "pointer-events-none"
                    }`}
                  >
                    {card.faceUp ? (
                      <CardFaceVisual
                        suit={card.suit}
                        rank={card.rank}
                        showCenterArt={isTop}
                        justFlipped={flippedIds.has(card.id)}
                        selected={isSelected}
                      />
                    ) : (
                      <CardBackPattern />
                    )}
                  </div>
                );
              })
            )}
          </div>
        ))}
      </div>

      {/* Hıza Duyarlı Yüzen Kart Yığını (GPU translate3d + Velocity Tilt) */}
      {drag && drag.movedEnough && (
        <div
          style={{
            position: "fixed",
            left: 0,
            top: 0,
            width: `${drag.cardWidth}px`,
            transform: `translate3d(${drag.clientX - drag.offsetX}px, ${
              drag.clientY - drag.offsetY
            }px, 0) rotate(${drag.tiltDeg.toFixed(2)}deg) scale(1.05)`,
            zIndex: 70,
            pointerEvents: "none",
          }}
          className="drop-shadow-[0_18px_28px_rgba(0,0,0,0.65)] will-change-transform"
        >
          {drag.cards.map((c, idx) => (
            <div
              key={`drag-${c.id}`}
              style={{
                top: 0,
                transform: `translate3d(0, ${idx * CARD_STACK_STEP_PX}px, 0)`,
              }}
              className="absolute inset-x-0 aspect-[2.5/3.6]"
            >
              <CardFaceVisual
                suit={c.suit}
                rank={c.rank}
                showCenterArt={idx === drag.cards.length - 1}
                selected
              />
            </div>
          ))}
        </div>
      )}

      {/* Alt Bilgi */}
      <div className="text-center text-[11px] text-slate-400 shrink-0">
        Kartları sürükleyip bırakabilir veya tek dokunuşla otomatik yuvaya
        uçurabilirsin!
      </div>

      {/* Oyun Sonu Penceresi + Klasik Zıplayan Kart Şelalesi (Waterfall Canvas) */}
      <AnimatePresence>
        {finishedModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4"
          >
            {finishedModal.won && (
              <canvas
                ref={waterfallCanvasRef}
                className="pointer-events-none fixed inset-0 z-0 h-full w-full"
              />
            )}

            <motion.div
              initial={{ scale: 0.88, y: 16, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              transition={{ type: "spring", stiffness: 360, damping: 28 }}
              className="relative z-10 w-full max-w-sm rounded-3xl border border-white/20 bg-slate-900/95 p-6 text-center shadow-2xl backdrop-blur-xl"
            >
              <Trophy className="h-10 w-10 mx-auto text-rose-400 mb-2" />
              <h3 className="text-xl font-black text-white">
                {finishedModal.won
                  ? "Zafer Şelalesi! Solitaire Tamamlandı!"
                  : "Oyun Sonlandırıldı"}
              </h3>
              <p className="mt-1 text-xs text-slate-400">
                Süre: {formatTime(elapsedSec)} • {state.moves} hamle
              </p>

              <div className="my-4 rounded-2xl border border-white/10 bg-slate-950/85 p-4">
                <div className="text-xs text-slate-400">Toplam Skor</div>
                <div className="text-4xl font-black text-rose-300 tabular-nums">
                  {finishedModal.finalScore.toLocaleString("tr-TR")}
                </div>
                {finishedModal.speedBonus > 0 && (
                  <div className="mt-1 text-xs font-bold text-emerald-400">
                    Hız Bonusu: +
                    {finishedModal.speedBonus.toLocaleString("tr-TR")} P
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.94 }}
                  onClick={onRequestNewGameWithGate}
                  className="w-full flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-rose-500 to-indigo-600 py-3.5 text-sm font-black text-white cursor-pointer"
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
