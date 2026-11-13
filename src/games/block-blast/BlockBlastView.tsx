"use client";

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import { Flame, Crown, RotateCcw, ArrowLeft, Trophy } from "lucide-react";
import {
  BLOCK_THEMES,
  generateTraySet,
  type ShapeFamily,
  type TrayPiece,
} from "./blocks";
import {
  BOARD_SIZE,
  canPieceFitAnywhere,
  checkIsGameOver,
  createEmptyBoard,
  executePlacement,
  getPreviewInfo,
  type BoardGrid,
  type PreviewInfo,
} from "./engine";
import {
  FRAME_THEMES,
  recordSoloGameResult,
  type PlayerDoc,
} from "@/lib/firestore";
import { sound } from "@/lib/sound";
import RollingScore from "@/components/ui/RollingScore";

interface BlockBlastViewProps {
  player: PlayerDoc;
  allPlayers: PlayerDoc[];
  onBackToHub: () => void;
  onRequestNewGameWithGate: () => void;
  onComboEnergyChange?: (combo: number) => void;
}

interface DragState {
  trayIndex: number;
  piece: TrayPiece;
  pointerId: number;
  isTouch: boolean;
  clientX: number;
  clientY: number;
  tiltDeg: number;
}

interface DominoFlashCell {
  key: string;
  row: number;
  col: number;
  family: ShapeFamily;
  delayMs: number;
}

interface GravitySpark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  color: string;
  delayMs: number;
  bornAt: number;
}

const TOUCH_OFFSET_Y = 75;
const GRID_GAP_PX = 4;
const BOARD_PADDING_PX = 8;

const SPRING_SNAP = {
  type: "spring" as const,
  stiffness: 380,
  damping: 28,
};

export default function BlockBlastView({
  player,
  allPlayers,
  onBackToHub,
  onRequestNewGameWithGate,
  onComboEnergyChange,
}: BlockBlastViewProps) {
  const [board, setBoard] = useState<BoardGrid>(() => createEmptyBoard());
  const [tray, setTray] = useState<(TrayPiece | null)[]>(() =>
    generateTraySet()
  );
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [graceMoves, setGraceMoves] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [noMovesShake, setNoMovesShake] = useState(false);
  const [rejectedSlot, setRejectedSlot] = useState<number | null>(null);
  const [isGameOver, setIsGameOver] = useState(false);
  const [isNewRecord, setIsNewRecord] = useState(false);

  const [shakeKey, setShakeKey] = useState(0);
  const [placedBounceSet, setPlacedBounceSet] = useState<Set<string>>(
    () => new Set()
  );
  const [dominoMap, setDominoMap] = useState<Map<string, DominoFlashCell>>(
    () => new Map()
  );
  const [banner, setBanner] = useState<{
    id: string;
    title: string;
    subtitle?: string;
    points: number;
    tier: number;
    isAllClear?: boolean;
  } | null>(null);

  const [drag, setDrag] = useState<DragState | null>(null);
  const [boardMetrics, setBoardMetrics] = useState({
    left: 0,
    top: 0,
    width: 320,
    cellSize: 36,
  });

  const boardRef = useRef<HTMLDivElement | null>(null);
  const fxCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const sparksRef = useRef<GravitySpark[]>([]);
  const sparkRafRef = useRef<number | null>(null);
  const lastPointerXRef = useRef<number>(0);

  const personalBest = Math.max(player.games.blockBlast.highScore, score);

  const measureBoard = useCallback(() => {
    const el = boardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const inner =
      rect.width - BOARD_PADDING_PX * 2 - GRID_GAP_PX * (BOARD_SIZE - 1);
    setBoardMetrics({
      left: rect.left,
      top: rect.top,
      width: rect.width,
      cellSize: Math.max(22, inner / BOARD_SIZE),
    });

    const cvs = fxCanvasRef.current;
    if (cvs) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cvs.width = Math.round(rect.width * dpr);
      cvs.height = Math.round(rect.height * dpr);
    }
  }, []);

  useEffect(() => {
    const raf = requestAnimationFrame(measureBoard);
    window.addEventListener("resize", measureBoard);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measureBoard);
      if (sparkRafRef.current !== null) {
        cancelAnimationFrame(sparkRafRef.current);
      }
    };
  }, [measureBoard]);

  // HTML5 Canvas Yerçekimli Kıvılcım Döngüsü (Domino gecikmeli ateşleme)
  const startSparkLoop = useCallback(() => {
    if (sparkRafRef.current !== null) return;

    const tick = (now: number) => {
      const cvs = fxCanvasRef.current;
      const ctx = cvs?.getContext("2d");
      if (!cvs || !ctx) {
        sparkRafRef.current = null;
        return;
      }

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const cssW = cvs.width / dpr;
      const cssH = cvs.height / dpr;
      ctx.clearRect(0, 0, cssW, cssH);

      const list = sparksRef.current;
      const alive: GravitySpark[] = [];

      for (let i = 0; i < list.length; i++) {
        const sp = list[i];
        if (now - sp.bornAt < sp.delayMs) {
          alive.push(sp);
          continue;
        }
        sp.x += sp.vx;
        sp.y += sp.vy;
        sp.vy += 0.28; // Yerçekimi ivmesi
        sp.vx *= 0.975;
        sp.alpha -= 0.026;
        sp.size *= 0.985;

        if (sp.alpha > 0.02 && sp.size > 0.6) {
          ctx.save();
          ctx.globalAlpha = Math.max(0, sp.alpha);
          ctx.shadowBlur = 10;
          ctx.shadowColor = sp.color;
          ctx.fillStyle = sp.color;
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, sp.size, 0, Math.PI * 2);
          ctx.fill();

          // Parlak beyaz çekirdek
          ctx.fillStyle = "#ffffff";
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, sp.size * 0.42, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          alive.push(sp);
        }
      }

      sparksRef.current = alive;
      if (alive.length > 0) {
        sparkRafRef.current = requestAnimationFrame(tick);
      } else {
        ctx.clearRect(0, 0, cssW, cssH);
        sparkRafRef.current = null;
      }
    };

    sparkRafRef.current = requestAnimationFrame(tick);
  }, []);

  const triggerDominoExplosion = useCallback(
    (cells: { row: number; col: number; family: ShapeFamily }[]) => {
      // Soldan sağa ve yukarıdan aşağıya sırala -> 15ms domino dalgası!
      const ordered = [...cells].sort((a, b) =>
        a.col !== b.col ? a.col - b.col : a.row - b.row
      );

      const nextDomino = new Map<string, DominoFlashCell>();
      const now = performance.now();
      const stepPx = boardMetrics.cellSize + GRID_GAP_PX;

      ordered.forEach((cell, idx) => {
        const delayMs = idx * 15;
        const k = `${cell.row}-${cell.col}`;
        nextDomino.set(k, {
          key: k,
          row: cell.row,
          col: cell.col,
          family: cell.family,
          delayMs,
        });

        const cx =
          BOARD_PADDING_PX + cell.col * stepPx + boardMetrics.cellSize * 0.5;
        const cy =
          BOARD_PADDING_PX + cell.row * stepPx + boardMetrics.cellSize * 0.5;
        const hex = BLOCK_THEMES[cell.family].particleHex;

        for (let s = 0; s < 6; s++) {
          const angle = -Math.PI * 0.15 - Math.random() * Math.PI * 0.7 + (Math.random() - 0.5) * 2.2;
          const speed = 2.2 + Math.random() * 5.2;
          sparksRef.current.push({
            x: cx + (Math.random() - 0.5) * 10,
            y: cy + (Math.random() - 0.5) * 10,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 2.1,
            size: 3.2 + Math.random() * 3.4,
            alpha: 1,
            color: hex,
            delayMs,
            bornAt: now,
          });
        }
      });

      setDominoMap(nextDomino);
      startSparkLoop();

      const totalWaveMs = ordered.length * 15 + 260;
      window.setTimeout(() => {
        setDominoMap(new Map());
      }, totalWaveMs);
    },
    [boardMetrics.cellSize, startSparkLoop]
  );

  const trayFitStatus = useMemo(
    () => tray.map((p) => (p ? canPieceFitAnywhere(board, p) : false)),
    [board, tray]
  );

  const computeProjection = useCallback(
    (cur: DragState): {
      leftPx: number;
      topPx: number;
      preview: PreviewInfo | null;
    } => {
      const rows = cur.piece.matrix.length;
      const cols = cur.piece.matrix[0]?.length ?? 1;
      const step = boardMetrics.cellSize + GRID_GAP_PX;
      const pW = cols * boardMetrics.cellSize + (cols - 1) * GRID_GAP_PX;
      const pH = rows * boardMetrics.cellSize + (rows - 1) * GRID_GAP_PX;

      const offsetY = cur.isTouch ? TOUCH_OFFSET_Y : 18;
      const leftPx = cur.clientX - pW / 2;
      const topPx = cur.clientY - offsetY - pH / 2;

      const originX = boardMetrics.left + BOARD_PADDING_PX;
      const originY = boardMetrics.top + BOARD_PADDING_PX;
      const rawCol = (leftPx - originX) / step;
      const rawRow = (topPx - originY) / step;

      if (
        rawRow < -1.2 ||
        rawCol < -1.2 ||
        rawRow > BOARD_SIZE - 0.2 ||
        rawCol > BOARD_SIZE - 0.2
      ) {
        return { leftPx, topPx, preview: null };
      }

      const pr = Math.round(rawRow);
      const pc = Math.round(rawCol);
      const direct = getPreviewInfo(board, cur.piece, pr, pc);
      if (direct) return { leftPx, topPx, preview: direct };

      const candidates: { r: number; c: number; dist: number }[] = [];
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const r = pr + dr;
          const c = pc + dc;
          const dist = Math.hypot(r - rawRow, c - rawCol);
          if (dist <= 0.62) candidates.push({ r, c, dist });
        }
      }
      candidates.sort((a, b) => a.dist - b.dist);
      for (const cand of candidates) {
        const alt = getPreviewInfo(board, cur.piece, cand.r, cand.c);
        if (alt) return { leftPx, topPx, preview: alt };
      }
      return { leftPx, topPx, preview: null };
    },
    [board, boardMetrics]
  );

  const activeProjection = useMemo(
    () => (drag ? computeProjection(drag) : null),
    [drag, computeProjection]
  );

  const handleGameOver = useCallback(
    async (finalScore: number, finalMaxCombo: number) => {
      setNoMovesShake(true);
      sound.playGameOver();
      onComboEnergyChange?.(0);

      // Önce sığmayan taşların titreyip karardığını 480ms izlet, sonra modalı aç
      window.setTimeout(async () => {
        setIsGameOver(true);
        const { isNewPersonalBest } = await recordSoloGameResult(
          player,
          {
            game: "blockBlast",
            score: finalScore,
            maxCombo: finalMaxCombo,
          },
          allPlayers
        );
        setIsNewRecord(isNewPersonalBest);
        if (isNewPersonalBest) {
          sound.playVictory();
          confetti({
            particleCount: 90,
            spread: 75,
            origin: { y: 0.6 },
          });
        }
      }, 480);
    },
    [player, allPlayers, onComboEnergyChange]
  );

  const handlePointerDown = (
    idx: number,
    piece: TrayPiece,
    e: React.PointerEvent<HTMLDivElement>
  ) => {
    if (isGameOver || noMovesShake) return;
    if (!trayFitStatus[idx]) {
      sound.playInvalid();
      setRejectedSlot(idx);
      window.setTimeout(() => setRejectedSlot(null), 360);
      return;
    }
    e.preventDefault();
    measureBoard();
    sound.playPickup();
    lastPointerXRef.current = e.clientX;
    setDrag({
      trayIndex: idx,
      piece,
      pointerId: e.pointerId,
      isTouch: e.pointerType === "touch" || e.pointerType === "pen",
      clientX: e.clientX,
      clientY: e.clientY,
      tiltDeg: 0,
    });
  };

  useEffect(() => {
    if (!drag) return;

    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== drag.pointerId) return;
      e.preventDefault();
      const dx = e.clientX - lastPointerXRef.current;
      lastPointerXRef.current = e.clientX;
      // Hıza duyarlı eğim (velocity tilt: -6deg .. +6deg)
      const targetTilt = Math.max(-6, Math.min(6, dx * 0.45));

      setDrag((prev) =>
        prev
          ? {
              ...prev,
              clientX: e.clientX,
              clientY: e.clientY,
              tiltDeg: prev.tiltDeg * 0.55 + targetTilt * 0.45,
            }
          : null
      );
    };

    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== drag.pointerId) return;
      const done: DragState = {
        ...drag,
        clientX: e.clientX,
        clientY: e.clientY,
        tiltDeg: 0,
      };
      setDrag(null);
      if (e.type === "pointercancel") return;

      const { preview } = computeProjection(done);
      if (!preview || !preview.valid) {
        sound.playInvalid();
        return;
      }

      // Yerleşen karelerin yaylanarak (scale: [1.08, 0.96, 1]) oturması için işaretle
      const justPlacedKeys = new Set<string>(
        preview.ghostCells.map((c) => `${c.row}-${c.col}`)
      );
      setPlacedBounceSet(justPlacedKeys);
      window.setTimeout(() => setPlacedBounceSet(new Set()), 280);

      const move = executePlacement(
        board,
        done.piece,
        preview.anchorRow,
        preview.anchorCol,
        combo,
        graceMoves
      );

      const nextScore = score + move.totalEarned;
      const nextMaxCombo = Math.max(maxCombo, move.newCombo);
      onComboEnergyChange?.(move.newCombo);

      if (move.linesCleared > 0) {
        sound.playBlockClear(move.linesCleared, move.newCombo);
        sound.playHypeCheer(move.praiseTier);
        triggerDominoExplosion(move.clearedCells);
        if (move.isAllClear) {
          confetti({
            particleCount: 95,
            spread: 85,
            origin: { y: 0.52 },
          });
        }
        if (move.linesCleared >= 2 || move.newCombo >= 2 || move.isAllClear) {
          setShakeKey((k) => k + 1);
        }
        const comboSuffix =
          move.newCombo >= 2 && !move.isAllClear
            ? ` • KOMBO x${move.newCombo}`
            : "";
        const b = {
          id: `${Date.now()}`,
          title: move.praiseText || "HARİKASIN!",
          subtitle: move.isAllClear
            ? "Tüm Tahta Temizlendi! Muazzam Bonus!"
            : move.linesCleared >= 2
            ? `${move.linesCleared} Çizgi Patladı${comboSuffix}`
            : move.newCombo >= 2
            ? `Seri Patlatma • KOMBO x${move.newCombo}`
            : undefined,
          points: move.totalEarned,
          tier: move.praiseTier,
          isAllClear: move.isAllClear,
        };
        setBanner(b);
        window.setTimeout(() => {
          setBanner((cur) => (cur?.id === b.id ? null : cur));
        }, 1450);
      } else {
        sound.playBlockPlace(done.piece.cellCount);
      }

      const nextTray = [...tray];
      nextTray[done.trayIndex] = null;
      const finalTray = nextTray.every((item) => item === null)
        ? generateTraySet()
        : nextTray;

      setBoard(move.board);
      setTray(finalTray);
      setScore(nextScore);
      setCombo(move.newCombo);
      setGraceMoves(move.newGraceMoves);
      setMaxCombo(nextMaxCombo);

      if (checkIsGameOver(move.board, finalTray)) {
        window.setTimeout(() => {
          handleGameOver(nextScore, nextMaxCombo);
        }, 220);
      }
    };

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [
    drag,
    board,
    tray,
    score,
    combo,
    graceMoves,
    maxCombo,
    computeProjection,
    triggerDominoExplosion,
    handleGameOver,
    onComboEnergyChange,
  ]);

  const ghostSet = useMemo(() => {
    const s = new Set<string>();
    if (activeProjection?.preview) {
      for (const c of activeProjection.preview.ghostCells) {
        s.add(`${c.row}-${c.col}`);
      }
    }
    return s;
  }, [activeProjection]);

  const clearingRowSet = useMemo(
    () => new Set(activeProjection?.preview?.clearingRows ?? []),
    [activeProjection]
  );
  const clearingColSet = useMemo(
    () => new Set(activeProjection?.preview?.clearingCols ?? []),
    [activeProjection]
  );

  const frame = FRAME_THEMES[player.frameColor];

  return (
    <div className="relative flex h-full w-full max-w-[440px] flex-col items-center justify-between touch-none select-none py-1">
      {/* Üst Bilgi Çubuğu */}
      <div className="w-full flex items-center justify-between gap-2 shrink-0">
        <motion.button
          type="button"
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.94 }}
          onClick={onBackToHub}
          className="inline-flex items-center gap-1.5 rounded-2xl border border-white/12 bg-slate-900/80 hover:bg-slate-800 px-3 py-2 text-xs font-extrabold text-slate-200 transition-colors cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" /> Lobi
        </motion.button>

        <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/80 px-3 py-1.5">
          <span
            className={`flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br ${frame.bgClass} ${frame.ringClass} text-sm`}
          >
            {player.avatar}
          </span>
          <span className="truncate max-w-[120px] text-xs font-black text-white">
            {player.name}
          </span>
        </div>

        <motion.button
          type="button"
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.94 }}
          onClick={onRequestNewGameWithGate}
          title="Yeni Oyun (Profil Seçimi)"
          className="inline-flex items-center gap-1 rounded-2xl border border-indigo-400/30 bg-indigo-500/15 hover:bg-indigo-500/25 px-3 py-2 text-xs font-extrabold text-indigo-200 transition-colors cursor-pointer"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Yeni
        </motion.button>
      </div>

      {/* Canlı Skor Sayacı (Rolling Score Ticker) & Kombo Kartı */}
      <div className="w-full flex items-center justify-between rounded-2xl border border-white/12 bg-slate-900/85 backdrop-blur-md px-4 py-2 shadow-lg shrink-0 mt-1.5">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            SKOR
          </div>
          <RollingScore
            value={score}
            className="text-2xl font-black leading-none text-white tabular-nums"
            popupColorClass="text-cyan-300"
          />
        </div>

        <div className="flex flex-col items-center">
          {combo >= 2 ? (
            <motion.div
              key={`cmb-${combo}`}
              initial={{ scale: 0.75 }}
              animate={{ scale: [1.18, 1] }}
              transition={SPRING_SNAP}
              className="inline-flex items-center gap-1 rounded-full border border-orange-400/60 bg-gradient-to-r from-orange-500/30 to-amber-500/30 px-2.5 py-0.5 text-xs font-black text-amber-200 shadow-[0_0_16px_rgba(251,146,60,0.4)]"
            >
              <Flame className="h-3.5 w-3.5 text-orange-400" /> COMBO x{combo}
            </motion.div>
          ) : (
            <span className="text-[11px] font-bold text-cyan-300">
              🧱 Block Blast
            </span>
          )}
          {combo >= 1 && graceMoves > 0 && (
            <div className="mt-1 flex gap-1">
              {[1, 2, 3].map((d) => (
                <span
                  key={d}
                  className={`h-1.5 w-3 rounded-full transition-colors ${
                    d <= graceMoves ? "bg-amber-400" : "bg-white/15"
                  }`}
                />
              ))}
            </div>
          )}
        </div>

        <div className="text-right">
          <div className="flex items-center justify-end gap-1 text-[10px] font-bold text-amber-300">
            <Crown className="h-3 w-3" /> REKORUN
          </div>
          <div className="text-lg font-black leading-none text-amber-300 tabular-nums">
            {personalBest.toLocaleString("tr-TR")}
          </div>
        </div>
      </div>

      {/* 8x8 Jel/Akrilik Oyun Tahtası + Domino Patlama + Canvas Kıvılcım Katmanı */}
      <motion.div
        key={shakeKey}
        animate={
          shakeKey > 0 ? { x: [0, -7, 7, -4, 4, 0], y: [0, 3, -3, 2, 0] } : {}
        }
        transition={{ duration: 0.28 }}
        className="relative flex w-full flex-1 items-center justify-center my-1 min-h-0"
      >
        <div
          ref={boardRef}
          style={{ padding: `${BOARD_PADDING_PX}px` }}
          className="relative w-full max-w-[min(92vw,48dvh,400px)] aspect-square rounded-2xl border border-indigo-400/30 bg-slate-950/95 shadow-[0_0_45px_rgba(15,23,42,0.95)]"
        >
          <div
            style={{ gap: `${GRID_GAP_PX}px` }}
            className="grid h-full w-full grid-cols-8 grid-rows-8"
          >
            {board.map((rowArr, r) =>
              rowArr.map((cell, c) => {
                const key = `${r}-${c}`;
                const dominoCell = dominoMap.get(key);
                const isGhost = ghostSet.has(key);
                const willBlast =
                  clearingRowSet.has(r) || clearingColSet.has(c);
                const isJustPlaced = placedBounceSet.has(key);

                const gFam = activeProjection?.preview?.family;
                const activeFamily =
                  cell ?? dominoCell?.family ?? (isGhost ? gFam : null);
                const theme = activeFamily ? BLOCK_THEMES[activeFamily] : null;

                return (
                  <motion.div
                    key={key}
                    animate={
                      dominoCell
                        ? {
                            scale: [1, 1.24, 0],
                            opacity: [1, 1, 0],
                          }
                        : isJustPlaced && cell
                        ? { scale: [1.08, 0.96, 1] }
                        : willBlast
                        ? { scale: 1.03 }
                        : { scale: 1, opacity: 1 }
                    }
                    transition={
                      dominoCell
                        ? {
                            duration: 0.22,
                            delay: dominoCell.delayMs / 1000,
                            ease: "easeOut",
                          }
                        : { duration: 0.2 }
                    }
                    className={`relative rounded-[7px] will-change-transform ${
                      cell && theme
                        ? `bg-gradient-to-br ${theme.gradient} border ${theme.border} ${theme.glow}`
                        : dominoCell && theme
                        ? `bg-gradient-to-br ${theme.gradient} ring-2 ring-white brightness-150 shadow-[0_0_22px_rgba(255,255,255,0.95)] z-20`
                        : isGhost && theme
                        ? `bg-gradient-to-br ${theme.gradient} opacity-55 border border-white/70`
                        : "bg-slate-900/90 border border-slate-800/90 shadow-inner"
                    } ${
                      willBlast && !dominoCell
                        ? "ring-2 ring-white brightness-125 shadow-[0_0_18px_rgba(255,255,255,0.9)] z-10"
                        : ""
                    }`}
                  >
                    {/* 3D Jel / Akrilik Üst Işık Kırılması + Alt Derinlik Gölgesi */}
                    {(cell || isGhost || dominoCell) && (
                      <>
                        <div className="pointer-events-none absolute inset-[1.5px] rounded-[5px] border-t-2 border-l border-white/55 bg-gradient-to-br from-white/30 via-white/5 to-transparent" />
                        <div className="pointer-events-none absolute inset-[1px] rounded-[5px] border-b-2 border-r border-black/35" />
                        <div className="pointer-events-none absolute left-[16%] top-[14%] h-[22%] w-[36%] rounded-full bg-white/45 blur-[0.5px]" />
                      </>
                    )}
                  </motion.div>
                );
              })
            )}
          </div>

          {/* Yerçekimli Kıvılcım Canvas Katmanı */}
          <canvas
            ref={fxCanvasRef}
            className="pointer-events-none absolute inset-0 h-full w-full rounded-2xl z-20"
          />

          {/* Büyüyüp Yaylanan 3D Türkçe Gaza Getirici Söz (Hype Callout) */}
          <AnimatePresence>
            {banner && (
              <motion.div
                key={banner.id}
                initial={{ opacity: 0, y: 26, scale: 0.4, rotate: -6 }}
                animate={{
                  opacity: 1,
                  y: -16,
                  scale: [0.4, 1.25, 1],
                  rotate: [-6, 3, -2],
                }}
                exit={{ opacity: 0, y: -56, scale: 0.9, rotate: 0 }}
                transition={{
                  duration: 0.42,
                  ease: "easeOut",
                }}
                className="pointer-events-none absolute inset-x-0 top-1/3 z-30 flex justify-center px-2"
              >
                <div
                  className={`rounded-3xl border-2 px-6 py-3 text-center backdrop-blur-md ${
                    banner.tier >= 4
                      ? "border-amber-300 bg-gradient-to-b from-fuchsia-950/95 via-slate-950/95 to-amber-950/95 shadow-[0_0_45px_rgba(251,191,36,0.65)]"
                      : banner.tier >= 3
                      ? "border-rose-400 bg-gradient-to-b from-rose-950/95 to-slate-950/95 shadow-[0_0_40px_rgba(244,63,94,0.55)]"
                      : banner.tier >= 2
                      ? "border-cyan-300 bg-gradient-to-b from-indigo-950/95 to-slate-950/95 shadow-[0_0_38px_rgba(34,211,238,0.5)]"
                      : "border-emerald-300/80 bg-slate-950/92 shadow-[0_0_32px_rgba(52,211,153,0.45)]"
                  }`}
                >
                  <div
                    className={`text-2xl sm:text-3xl font-black italic tracking-wider uppercase ${
                      banner.tier >= 4
                        ? "text-amber-300"
                        : banner.tier >= 3
                        ? "text-rose-300"
                        : banner.tier >= 2
                        ? "text-cyan-200"
                        : "text-emerald-200"
                    }`}
                    style={{
                      WebkitTextStroke: "1.5px rgba(15, 23, 42, 0.95)",
                      textShadow:
                        "0 3px 0 #0f172a, 0 6px 14px rgba(0,0,0,0.85), 0 0 22px rgba(251,191,36,0.55)",
                    }}
                  >
                    {banner.title}
                  </div>
                  {banner.subtitle && (
                    <div className="mt-0.5 text-xs font-extrabold tracking-wide text-white/95 drop-shadow">
                      {banner.subtitle}
                    </div>
                  )}
                  <div className="mt-0.5 text-sm font-black text-amber-300 drop-shadow">
                    +{banner.points.toLocaleString("tr-TR")} Puan
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* 3'lü Blok Tepsisi */}
      <div className="w-full grid grid-cols-3 gap-2 rounded-2xl border border-white/12 bg-slate-900/85 p-2.5 min-h-[96px] items-center shrink-0">
        {tray.map((piece, idx) => {
          const dragging = drag?.trayIndex === idx;
          const fits = trayFitStatus[idx];
          const shouldShake =
            (!fits && noMovesShake) || rejectedSlot === idx;
          return (
            <motion.div
              key={piece?.uid ?? `slot-${idx}`}
              animate={
                shouldShake
                  ? { x: [-5, 5, -4, 4, -2, 2, 0] }
                  : { x: 0 }
              }
              transition={{ duration: 0.35 }}
              whileHover={piece && fits && !dragging ? { scale: 1.05 } : {}}
              onPointerDown={(e) => {
                if (piece) handlePointerDown(idx, piece, e);
              }}
              className={`flex h-full min-h-[78px] items-center justify-center rounded-xl border border-white/5 bg-slate-950/55 p-1 transition-opacity ${
                piece && !dragging
                  ? fits
                    ? "cursor-grab active:cursor-grabbing hover:border-indigo-400/45"
                    : "opacity-30 grayscale cursor-not-allowed"
                  : ""
              }`}
            >
              {piece && !dragging && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: `repeat(${piece.matrix[0].length}, 15px)`,
                    gap: "2px",
                  }}
                >
                  {piece.matrix.map((rArr, r) =>
                    rArr.map((v, c) =>
                      v === 1 ? (
                        <div
                          key={`${r}-${c}`}
                          className={`relative h-[15px] w-[15px] rounded-[4px] bg-gradient-to-br ${
                            BLOCK_THEMES[piece.family].gradient
                          } border ${BLOCK_THEMES[piece.family].border} shadow-sm`}
                        >
                          <div className="pointer-events-none absolute inset-[1px] rounded-[2.5px] border-t border-l border-white/50 bg-gradient-to-br from-white/25 to-transparent" />
                        </div>
                      ) : (
                        <div key={`${r}-${c}`} className="h-[15px] w-[15px]" />
                      )
                    )
                  )}
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* 1:1 Yüzen Blok — SADECE GPU transform: translate3d + velocity tilt (-6deg/+6deg), 75px parmak üstü */}
      {drag && activeProjection && (
        <div
          style={{
            position: "fixed",
            left: 0,
            top: 0,
            transform: `translate3d(${activeProjection.leftPx}px, ${activeProjection.topPx}px, 0) rotate(${drag.tiltDeg.toFixed(
              2
            )}deg) scale(1.04)`,
            zIndex: 60,
            pointerEvents: "none",
            display: "grid",
            gridTemplateColumns: `repeat(${drag.piece.matrix[0].length}, ${boardMetrics.cellSize}px)`,
            gridTemplateRows: `repeat(${drag.piece.matrix.length}, ${boardMetrics.cellSize}px)`,
            gap: `${GRID_GAP_PX}px`,
          }}
          className="drop-shadow-[0_18px_28px_rgba(0,0,0,0.78)] will-change-transform"
        >
          {drag.piece.matrix.map((rowArr, r) =>
            rowArr.map((v, c) =>
              v === 1 ? (
                <div
                  key={`d-${r}-${c}`}
                  className={`relative rounded-[7px] bg-gradient-to-br ${
                    BLOCK_THEMES[drag.piece.family].gradient
                  } border ${BLOCK_THEMES[drag.piece.family].border} ${
                    BLOCK_THEMES[drag.piece.family].glow
                  }`}
                >
                  <div className="pointer-events-none absolute inset-[1.5px] rounded-[5px] border-t-2 border-l border-white/60 bg-gradient-to-br from-white/35 via-white/5 to-transparent" />
                  <div className="pointer-events-none absolute inset-[1px] rounded-[5px] border-b-2 border-r border-black/35" />
                </div>
              ) : (
                <div key={`d-${r}-${c}`} />
              )
            )
          )}
        </div>
      )}

      {/* Hamle Kalmadı Modalı */}
      <AnimatePresence>
        {isGameOver && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-4"
          >
            <motion.div
              initial={{ scale: 0.88, y: 18, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              transition={SPRING_SNAP}
              className="w-full max-w-sm rounded-3xl border border-white/15 bg-slate-900 p-6 text-center shadow-2xl"
            >
              <div className="mx-auto mb-2 inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-3 py-1 text-xs font-black text-amber-300">
                <Trophy className="h-3.5 w-3.5" />
                {isNewRecord ? "YENİ KİŞİSEL REKOR!" : "HAMLE KALMADI!"}
              </div>
              <h3 className="text-2xl font-black text-white">{player.name}</h3>
              <div className="my-4 rounded-2xl border border-indigo-400/25 bg-slate-950/80 p-4">
                <div className="text-xs text-slate-400">Kazanılan Skor</div>
                <div className="text-4xl font-black text-cyan-300 tabular-nums">
                  {score.toLocaleString("tr-TR")}
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  Maksimum Kombo: <strong>x{Math.max(1, maxCombo)}</strong>
                </div>
              </div>

              <div className="space-y-2">
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.94 }}
                  onClick={onRequestNewGameWithGate}
                  className="w-full flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-500 to-indigo-600 py-3.5 text-sm font-black text-white cursor-pointer"
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
