"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import confetti from "canvas-confetti";
import {
  Rocket,
  Zap,
  Crown,
  Flame,
  Gem,
  Shield,
  Swords,
  Trophy,
  Star,
  Cpu,
  Atom,
  Compass,
  Anchor,
  Feather,
  Music,
  Sun,
  type LucideIcon,
} from "lucide-react";
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

interface IconThemeDef {
  pairId: number;
  label: string;
  Icon: LucideIcon;
  colorHex: string;
}

const CARD_ICONS: IconThemeDef[] = [
  { pairId: 0, label: "Roket", Icon: Rocket, colorHex: "#38bdf8" },
  { pairId: 1, label: "Şimşek", Icon: Zap, colorHex: "#facc15" },
  { pairId: 2, label: "Taç", Icon: Crown, colorHex: "#f59e0b" },
  { pairId: 3, label: "Alev", Icon: Flame, colorHex: "#f43f5e" },
  { pairId: 4, label: "Elmas", Icon: Gem, colorHex: "#c084fc" },
  { pairId: 5, label: "Kalkan", Icon: Shield, colorHex: "#34d399" },
  { pairId: 6, label: "Kılıç", Icon: Swords, colorHex: "#fb7185" },
  { pairId: 7, label: "Kupa", Icon: Trophy, colorHex: "#fbbf24" },
  { pairId: 8, label: "Yıldız", Icon: Star, colorHex: "#fde047" },
  { pairId: 9, label: "Çip", Icon: Cpu, colorHex: "#22d3ee" },
  { pairId: 10, label: "Atom", Icon: Atom, colorHex: "#a78bfa" },
  { pairId: 11, label: "Pusula", Icon: Compass, colorHex: "#4ade80" },
  { pairId: 12, label: "Çapa", Icon: Anchor, colorHex: "#60a5fa" },
  { pairId: 13, label: "Tüy", Icon: Feather, colorHex: "#f472b6" },
  { pairId: 14, label: "Nota", Icon: Music, colorHex: "#e879f9" },
  { pairId: 15, label: "Güneş", Icon: Sun, colorHex: "#fb923c" },
];

export interface MemoryCardItem {
  id: string;
  index: number;
  pairId: number;
  label: string;
  colorHex: string;
  flipped: boolean;
  matchedBySlot: number | null;
}

function buildShuffledDeck(cols: 6 | 8): MemoryCardItem[] {
  const totalCards = cols * 4;
  const pairCount = totalCards / 2;
  const chosenIcons = CARD_ICONS.slice(0, pairCount);

  const raw: Omit<MemoryCardItem, "index">[] = [];
  chosenIcons.forEach((def) => {
    raw.push({
      id: `card_${def.pairId}_a`,
      pairId: def.pairId,
      label: def.label,
      colorHex: def.colorHex,
      flipped: false,
      matchedBySlot: null,
    });
    raw.push({
      id: `card_${def.pairId}_b`,
      pairId: def.pairId,
      label: def.label,
      colorHex: def.colorHex,
      flipped: false,
      matchedBySlot: null,
    });
  });

  // Fisher-Yates karıştırma
  for (let i = raw.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = raw[i];
    raw[i] = raw[j];
    raw[j] = tmp;
  }

  return raw.map((item, idx) => ({ ...item, index: idx }));
}

interface MemoryMatchViewProps {
  seats: MultiplayerSeat[];
  initialSubMode?: string; // "6x4" | "8x4"
  onBackToHub: () => void;
  onRequestNewGameWithGate: () => void;
  onComboEnergyChange?: (level: number) => void;
}

export default function MemoryMatchView({
  seats,
  initialSubMode = "6x4",
  onBackToHub,
  onRequestNewGameWithGate,
  onComboEnergyChange,
}: MemoryMatchViewProps) {
  const [cols, setCols] = useState<6 | 8>(initialSubMode === "8x4" ? 8 : 6);
  const [deck, setDeck] = useState<MemoryCardItem[]>(() =>
    buildShuffledDeck(initialSubMode === "8x4" ? 8 : 6)
  );
  const [turnIndex, setTurnIndex] = useState<number>(0);
  const [firstPickIdx, setFirstPickIdx] = useState<number | null>(null);
  const [secondPickIdx, setSecondPickIdx] = useState<number | null>(null);
  const [isAnimating, setIsAnimating] = useState<boolean>(false);

  const [pairsPerSlot, setPairsPerSlot] = useState<number[]>(() =>
    seats.map(() => 0)
  );
  const [streaksPerSlot, setStreaksPerSlot] = useState<number[]>(() =>
    seats.map(() => 0)
  );
  const [actionScores, setActionScores] = useState<number[]>(() =>
    seats.map(() => 0)
  );
  const [bannerText, setBannerText] = useState<string>(
    "Sırası gelen tek tek 2 kart açar — eşleşme bulursan sıra sende kalır!"
  );
  const [finalStandings, setFinalStandings] = useState<
    MultiplayerFinalStanding[] | null
  >(null);

  // Yapay Zeka Bot için açılan kartları hatırlama belleği (pairId -> görülen kart indeksleri)
  const seenMemoryRef = useRef<Map<number, Set<number>>>(new Map());
  const recordedRef = useRef<boolean>(false);
  const unmountedRef = useRef<boolean>(false);

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
    };
  }, []);

  const switchGridSize = (nextCols: 6 | 8) => {
    if (isAnimating || finalStandings) return;
    sound.playClick();
    setCols(nextCols);
    setDeck(buildShuffledDeck(nextCols));
    setTurnIndex(0);
    setFirstPickIdx(null);
    setSecondPickIdx(null);
    setPairsPerSlot(seats.map(() => 0));
    setStreaksPerSlot(seats.map(() => 0));
    setActionScores(seats.map(() => 0));
    seenMemoryRef.current.clear();
    setBannerText("Yeni kart dizilimi hazır!");
  };

  const finishMatch = useCallback(
    async (latestPairs: number[], latestScores: number[]) => {
      if (recordedRef.current) return;
      recordedRef.current = true;

      sound.playVictory();
      confetti({
        particleCount: 115,
        spread: 85,
        origin: { y: 0.55 },
      });

      const ranked = seats
        .map((seat, idx) => ({
          seat,
          slotIndex: seat.slotIndex,
          pairs: latestPairs[idx] || 0,
          score: latestScores[idx] || 0,
        }))
        .sort((a, b) => {
          if (b.pairs !== a.pairs) return b.pairs - a.pairs;
          return b.score - a.score;
        });

      const standingsInput = ranked.map((r, i) => {
        const rank = i + 1;
        // 0 - 10.000 Ölçeği: Maç Galibiyeti +1.800
        const matchBonus =
          rank === 1 ? 1800 : rank === 2 ? 800 : rank === 3 ? 500 : 350;
        return {
          slotIndex: r.slotIndex,
          player: r.seat.player,
          isBot: r.seat.isBot,
          rank,
          actionScore: r.score,
          customFinalScore: r.score + matchBonus,
          statSummary: `${r.pairs} Çift Buldu • ${r.score.toLocaleString("tr-TR")} P`,
        };
      });

      const res = await recordMultiplayerMatchResult({
        game: "memoryMatch",
        standings: standingsInput,
        modeLabel: `${cols}x4 Tablo`,
      });
      if (!unmountedRef.current) {
        setFinalStandings(res);
      }
    },
    [seats, cols]
  );

  // Kart Açma (2. kart açıldığında 900ms boyunca tüm ekran tıklamaya kilitlenir!)
  const handleFlipCard = useCallback(
    async (cardIdx: number) => {
      if (isAnimating || finalStandings) return;
      const card = deck[cardIdx];
      if (!card || card.flipped || card.matchedBySlot !== null) return;

      const activeSeat = seats[turnIndex];
      if (!activeSeat) return;
      const slotIdx = activeSeat.slotIndex;

      sound.playCardFlip();

      // Belleğe kaydet
      if (!seenMemoryRef.current.has(card.pairId)) {
        seenMemoryRef.current.set(card.pairId, new Set());
      }
      seenMemoryRef.current.get(card.pairId)!.add(cardIdx);

      const nextDeck = deck.map((c, idx) =>
        idx === cardIdx ? { ...c, flipped: true } : c
      );
      setDeck(nextDeck);

      if (firstPickIdx === null) {
        setFirstPickIdx(cardIdx);
        setBannerText(
          `${activeSeat.player.name} 1. kartı açtı (${card.label}) — şimdi eşini bul!`
        );
        return;
      }

      // 2. KART AÇILDI -> 900ms SIKI EKRAN KİLİDİ BAŞLAR!
      const firstCard = nextDeck[firstPickIdx];
      setSecondPickIdx(cardIdx);
      setIsAnimating(true);

      const isMatch = firstCard.pairId === card.pairId;

      if (isMatch) {
        const nextStreak = (streaksPerSlot[slotIdx] || 0) + 1;
        sound.playMemoryMatch(nextStreak);
        onComboEnergyChange?.(Math.min(6, nextStreak));

        await new Promise((r) => window.setTimeout(r, 650));
        if (unmountedRef.current) return;

        const matchedDeck = nextDeck.map((c, idx) =>
          idx === firstPickIdx || idx === cardIdx
            ? { ...c, flipped: true, matchedBySlot: slotIdx }
            : c
        );

        const nextPairs = [...pairsPerSlot];
        const nextScores = [...actionScores];
        const nextStreaks = [...streaksPerSlot];

        nextPairs[slotIdx] = (nextPairs[slotIdx] || 0) + 1;
        nextStreaks[slotIdx] = nextStreak;
        // Eşleşen çift +140 + seri bonusu (çift başına maksimum +100)
        const streakBonus = Math.min(100, (nextStreak - 1) * 35);
        nextScores[slotIdx] =
          (nextScores[slotIdx] || 0) + 140 + streakBonus;

        setDeck(matchedDeck);
        setPairsPerSlot(nextPairs);
        setStreaksPerSlot(nextStreaks);
        setActionScores(nextScores);
        setFirstPickIdx(null);
        setSecondPickIdx(null);

        setBannerText(
          `🎯 EŞLEŞME! ${activeSeat.player.name} Kombo x${nextStreak} yaptı — Sıra Sende Kalmaya Devam Ediyor!`
        );

        // Tüm kartlar eşleşti mi?
        const allMatched = matchedDeck.every((c) => c.matchedBySlot !== null);
        setIsAnimating(false);
        if (allMatched) {
          onComboEnergyChange?.(0);
          await finishMatch(nextPairs, nextScores);
        }
      } else {
        // Eşleşmedi -> 900ms boyunca iki kartı göster (tıklamalar kilitli), sonra kapat ve sırayı geçir!
        onComboEnergyChange?.(0);
        setBannerText("Eşleşmedi! Kartlar kapanıyor ve sıra geçiyor...");
        await new Promise((r) => window.setTimeout(r, 900));
        if (unmountedRef.current) return;

        const closedDeck = nextDeck.map((c, idx) =>
          idx === firstPickIdx || idx === cardIdx
            ? { ...c, flipped: false }
            : c
        );
        const nextStreaks = [...streaksPerSlot];
        nextStreaks[slotIdx] = 0;

        const nextTurn = (turnIndex + 1) % seats.length;
        sound.playTurnChange();

        setDeck(closedDeck);
        setStreaksPerSlot(nextStreaks);
        setFirstPickIdx(null);
        setSecondPickIdx(null);
        setTurnIndex(nextTurn);
        setBannerText(`${seats[nextTurn].player.name} 1. kartını seçiyor!`);
        setIsAnimating(false);
      }
    },
    [
      isAnimating,
      finalStandings,
      deck,
      seats,
      turnIndex,
      firstPickIdx,
      streaksPerSlot,
      pairsPerSlot,
      actionScores,
      finishMatch,
      onComboEnergyChange,
    ]
  );

  // Yapay Zeka Bot Sırası Geldiğinde Kart Aç
  useEffect(() => {
    if (isAnimating || finalStandings) return;
    const activeSeat = seats[turnIndex];
    if (!activeSeat || !activeSeat.isBot) return;

    const timer = window.setTimeout(() => {
      const available = deck.filter(
        (c) => !c.flipped && c.matchedBySlot === null
      );
      if (available.length === 0) return;

      if (firstPickIdx === null) {
        // Bilinen bir çift var mı kontrol et
        for (const [, indices] of seenMemoryRef.current.entries()) {
          const validIndices = Array.from(indices).filter(
            (i) => !deck[i].flipped && deck[i].matchedBySlot === null
          );
          if (validIndices.length >= 2 && Math.random() < 0.65) {
            void handleFlipCard(validIndices[0]);
            return;
          }
        }
        const pick =
          available[Math.floor(Math.random() * available.length)];
        void handleFlipCard(pick.index);
      } else {
        const firstCard = deck[firstPickIdx];
        const knownSet = seenMemoryRef.current.get(firstCard.pairId);
        if (knownSet) {
          const partner = Array.from(knownSet).find(
            (i) =>
              i !== firstPickIdx &&
              !deck[i].flipped &&
              deck[i].matchedBySlot === null
          );
          if (partner !== undefined && Math.random() < 0.75) {
            void handleFlipCard(partner);
            return;
          }
        }
        const pick =
          available[Math.floor(Math.random() * available.length)];
        void handleFlipCard(pick.index);
      }
    }, 620);

    return () => window.clearTimeout(timer);
  }, [
    isAnimating,
    finalStandings,
    seats,
    turnIndex,
    deck,
    firstPickIdx,
    handleFlipCard,
  ]);

  const activeSeat = seats[turnIndex] ?? seats[0];

  const playersHud: SmartboardPlayerHudState[] = seats.map((seat, idx) => ({
    seat,
    actionScore: actionScores[idx] || 0,
    statLabel: `${pairsPerSlot[idx] || 0} Çift`,
    extraBadge:
      (streaksPerSlot[idx] || 0) >= 2
        ? `x${streaksPerSlot[idx]}`
        : undefined,
  }));

  return (
    <SmartboardFrame
      gameTitle="Hafıza Arenası • Çok Oyunculu Eşleştirme"
      gameIcon="🧠"
      modeSubtitle={`${seats.length} Kişilik Akıllı Tahta • ${cols}x4 (${
        cols * 4
      } Kart) • Eşleştiren Devam Eder`}
      playersHud={playersHud}
      activeSlotIndex={activeSeat.slotIndex}
      isAnimating={isAnimating}
      statusBannerText={bannerText}
      finalStandings={finalStandings}
      onBackToHub={onBackToHub}
      onRestartWithGate={onRequestNewGameWithGate}
      bottomBarContent={
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={isAnimating}
            onClick={() => switchGridSize(6)}
            className={`min-h-[48px] px-4 rounded-2xl border text-xs font-black transition cursor-pointer ${
              cols === 6
                ? "border-emerald-400 bg-emerald-500/25 text-white"
                : "border-white/12 bg-slate-950/80 text-slate-400"
            }`}
          >
            6x4 Tablo (24 Kart)
          </button>
          <button
            type="button"
            disabled={isAnimating}
            onClick={() => switchGridSize(8)}
            className={`min-h-[48px] px-4 rounded-2xl border text-xs font-black transition cursor-pointer ${
              cols === 8
                ? "border-emerald-400 bg-emerald-500/25 text-white"
                : "border-white/12 bg-slate-950/80 text-slate-400"
            }`}
          >
            8x4 Geniş Tablo (32 Kart)
          </button>
        </div>
      }
    >
      {/* 16:9 YATAY EKRANA TAM OTURAN 6x4 VEYA 8x4 3D KART DİZİLİMİ */}
      <div className="flex h-full w-full items-center justify-center p-1 sm:p-2">
        <div
          className="grid h-full max-h-[560px] w-full max-w-[1220px] gap-2 sm:gap-2.5"
          style={{
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            gridTemplateRows: "repeat(4, minmax(0, 1fr))",
          }}
        >
          {deck.map((card) => {
            const def = CARD_ICONS[card.pairId] ?? CARD_ICONS[0];
            const IconComp = def.Icon;
            const isOpen = card.flipped || card.matchedBySlot !== null;
            const ownerTheme =
              card.matchedBySlot !== null
                ? SMARTBOARD_SLOTS[
                    card.matchedBySlot % SMARTBOARD_SLOTS.length
                  ]
                : null;
            const ownerSeat =
              card.matchedBySlot !== null
                ? seats.find((s) => s.slotIndex === card.matchedBySlot)
                : null;
            const canTap =
              !isAnimating &&
              !activeSeat.isBot &&
              !card.flipped &&
              card.matchedBySlot === null &&
              secondPickIdx === null;

            return (
              <div
                key={card.id}
                className="relative h-full w-full min-h-[58px] min-w-[58px]"
                style={{ perspective: "1000px" }}
              >
                <motion.button
                  type="button"
                  disabled={!canTap}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    if (canTap) {
                      void handleFlipCard(card.index);
                    }
                  }}
                  animate={{
                    rotateY: isOpen ? 180 : 0,
                    scale: card.matchedBySlot !== null ? 0.96 : 1,
                  }}
                  transition={{
                    type: "spring",
                    stiffness: 320,
                    damping: 26,
                  }}
                  className={`relative h-full w-full rounded-2xl ${
                    canTap ? "cursor-pointer" : "cursor-default"
                  }`}
                  style={{
                    transformStyle: "preserve-3d",
                  }}
                >
                  {/* KART ARKA YÜZÜ (Kapalı - Neşeli Canlı Gradyan Tasarım) */}
                  <div
                    className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl border-2 border-amber-300/75 bg-gradient-to-br from-fuchsia-600 via-indigo-600 to-cyan-500 shadow-[0_8px_20px_rgba(0,0,0,0.4),inset_0_2px_6px_rgba(255,255,255,0.45)] hover:brightness-110 transition-all"
                    style={{
                      backfaceVisibility: "hidden",
                      WebkitBackfaceVisibility: "hidden",
                    }}
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/50 bg-white/20 shadow-inner">
                      <span className="text-xl sm:text-2xl drop-shadow">⭐</span>
                    </div>
                    <span className="mt-1 text-[10px] font-black tracking-widest uppercase text-white drop-shadow">
                      12-E ARENA
                    </span>
                  </div>

                  {/* KART ÖN YÜZÜ (Açık - Ferah Krem/Beyaz Zemin & Keskin Vektörel İkon) */}
                  <div
                    className={`absolute inset-0 flex flex-col items-center justify-center rounded-2xl border-[3px] p-2 shadow-xl ${
                      ownerTheme
                        ? `${ownerTheme.borderClass} bg-gradient-to-b from-white to-slate-100`
                        : "border-amber-400 bg-gradient-to-b from-white to-amber-50"
                    }`}
                    style={{
                      backfaceVisibility: "hidden",
                      WebkitBackfaceVisibility: "hidden",
                      transform: "rotateY(180deg)",
                      boxShadow: ownerTheme
                        ? `0 0 24px ${ownerTheme.hex}88, inset 0 2px 6px rgba(255,255,255,0.9)`
                        : `0 8px 22px rgba(0,0,0,0.35)`,
                    }}
                  >
                    <IconComp
                      className="h-8 w-8 sm:h-11 sm:w-11"
                      style={{
                        color: card.colorHex,
                        filter: `drop-shadow(0 2px 6px ${card.colorHex}66)`,
                      }}
                    />
                    <span className="mt-1 text-[10px] sm:text-xs font-black text-slate-900">
                      {card.label}
                    </span>

                    {ownerSeat && ownerTheme && (
                      <span
                        className={`absolute right-1.5 top-1.5 rounded-full border px-1.5 py-0.5 text-[10px] font-black shadow-sm bg-slate-900 text-white`}
                        style={{ borderColor: ownerTheme.hex }}
                      >
                        {ownerSeat.player.avatar}
                      </span>
                    )}
                  </div>
                </motion.button>
              </div>
            );
          })}
        </div>
      </div>
    </SmartboardFrame>
  );
}

