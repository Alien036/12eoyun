"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import {
  ArrowLeft,
  RotateCcw,
  Eye,
  Skull,
  AlertTriangle,
  Sparkles,
  CheckCircle2,
  Flame,
} from "lucide-react";
import {
  SMARTBOARD_SLOTS,
  recordMultiplayerMatchResult,
  type MultiplayerFinalStanding,
  type MultiplayerSeat,
} from "@/lib/firestore";
import { sound } from "@/lib/sound";

interface LiarPlayerState {
  seatIndex: number; // 0..seats.length-1
  seat: MultiplayerSeat;
  alive: boolean;
  dice: number[]; // 5 zar (1 = Joker)
  shotsTaken: number; // 0..5 (1/6 -> 2/6 -> 3/6...)
  liveChamberIdx: number; // 0..5 arası rastgele dolu mermi yuvası
  bluffsCaught: number;
  survivedClicks: number;
  eliminationOrder: number | null; // Elendiği sıra
}

interface CurrentBid {
  bidderIdx: number;
  quantity: number;
  face: number; // 2..6 (1'ler Joker olduğu için iddialar 2..6 üzerinden yapılır)
}

interface LiarsRouletteViewProps {
  seats: MultiplayerSeat[];
  onBackToHub: () => void;
  onRequestNewGameWithGate: () => void;
  onComboEnergyChange?: (energy: number) => void;
}

function rollFiveDice(): number[] {
  return Array.from({ length: 5 }, () => 1 + Math.floor(Math.random() * 6));
}

export default function LiarsRouletteView({
  seats,
  onBackToHub,
  onRequestNewGameWithGate,
  onComboEnergyChange,
}: LiarsRouletteViewProps) {
  const [playerStates, setPlayerStates] = useState<LiarPlayerState[]>(() =>
    seats.map((seat, idx) => ({
      seatIndex: idx,
      seat,
      alive: true,
      dice: rollFiveDice(),
      shotsTaken: 0,
      liveChamberIdx: Math.floor(Math.random() * 6),
      bluffsCaught: 0,
      survivedClicks: 0,
      eliminationOrder: null,
    }))
  );

  const [turnIdx, setTurnIdx] = useState<number>(0);
  const [roundNum, setRoundNum] = useState<number>(1);
  const [currentBid, setCurrentBid] = useState<CurrentBid | null>(null);

  // Seçici (İddia Yükseltme) state'i
  const [draftQty, setDraftQty] = useState<number>(2);
  const [draftFace, setDraftFace] = useState<number>(3);

  // Gizli zar bakışı (Avuç İçi Koruması)
  const [isHoldingDicePeek, setIsHoldingDicePeek] = useState<boolean>(false);

  // Fazlar: "bidding" | "revealing_cups" | "revolver_roulette" | "gameover"
  const [phase, setPhase] = useState<
    "bidding" | "revealing_cups" | "revolver_roulette" | "gameover"
  >("bidding");
  const [isAnimating, setIsAnimating] = useState<boolean>(false);

  const [tableBanner, setTableBanner] = useState<string>(
    "KUPALAR SALLANDI! ZARLAR GİZLENDİ."
  );
  const [tableSubText, setTableSubText] = useState<string>(
    "1 (★) gelen zarlar JOKER sayılır ve her zar yüzünün yerine geçer!"
  );

  const [revealSummary, setRevealSummary] = useState<{
    challengerIdx: number;
    bidderIdx: number;
    bidQty: number;
    bidFace: number;
    matchingTotal: number;
    loserIdx: number;
    reasonText: string;
  } | null>(null);

  const [revolverOutcome, setRevolverOutcome] = useState<{
    victimIdx: number;
    shotNumber: number; // 1..6
    isLiveFatal: boolean;
  } | null>(null);

  const [screenShakeKey, setScreenShakeKey] = useState<number>(0);
  const [redFlash, setRedFlash] = useState<boolean>(false);
  const [finalStandings, setFinalStandings] = useState<
    MultiplayerFinalStanding[] | null
  >(null);

  const eliminationCounterRef = useRef<number>(0);
  const savedResultRef = useRef<boolean>(false);

  const activePlayerState = playerStates[turnIdx];
  const activeSlotTheme =
    SMARTBOARD_SLOTS[activePlayerState?.seat.slotIndex ?? 0] ??
    SMARTBOARD_SLOTS[0];

  // Hayatta kalan bir sonraki oyuncunun indeksini bul
  const findNextAliveIndex = useCallback(
    (fromIdx: number, list: LiarPlayerState[]): number => {
      const n = list.length;
      for (let step = 1; step <= n; step++) {
        const candidate = (fromIdx + step) % n;
        if (list[candidate]?.alive) return candidate;
      }
      return fromIdx;
    },
    []
  );

  // Yeni ZarEli Başlat
  const startNewDiceHand = useCallback(
    (starterIdx: number, nextRoundNum: number, updatedList: LiarPlayerState[]) => {
      sound.playDiceRoll();
      const rerolled = updatedList.map((st) =>
        st.alive ? { ...st, dice: rollFiveDice() } : st
      );
      setPlayerStates(rerolled);
      setCurrentBid(null);
      setDraftQty(2);
      setDraftFace(3);
      setRevealSummary(null);
      setRevolverOutcome(null);
      setIsHoldingDicePeek(false);
      setRoundNum(nextRoundNum);
      setTurnIdx(starterIdx);
      setPhase("bidding");
      setIsAnimating(false);

      const starterName = rerolled[starterIdx]?.seat.player.name ?? "Oyuncu";
      setTableBanner(
        `RAUNT #${nextRoundNum} — KUPALAR SALLANDI! SIRA: ${starterName.toUpperCase()}`
      );
      setTableSubText(
        "Elinle kapatıp zarlarına bak, ardından masadaki toplam zar tahmini yükselt!"
      );
    },
    []
  );

  // İddia geçerli mi kontrolü
  const isDraftBidValid = useCallback(
    (qty: number, face: number, prev: CurrentBid | null): boolean => {
      if (face < 2 || face > 6 || qty < 1 || qty > 20) return false;
      if (!prev) return true;
      if (qty > prev.quantity) return true;
      if (qty === prev.quantity && face > prev.face) return true;
      return false;
    },
    []
  );

  // İddia değiştiğinde draft değerlerini bir üst geçerli değere otomatik hazırla
  useEffect(() => {
    if (!currentBid) {
      setDraftQty(2);
      setDraftFace(3);
    } else if (currentBid.face < 6) {
      setDraftQty(currentBid.quantity);
      setDraftFace(currentBid.face + 1);
    } else {
      setDraftQty(currentBid.quantity + 1);
      setDraftFace(2);
    }
  }, [currentBid]);

  // Maç Bitişini Kaydet
  const finishMatch = useCallback(
    async (finalList: LiarPlayerState[]) => {
      if (savedResultRef.current) return;
      savedResultRef.current = true;
      setPhase("gameover");
      setIsAnimating(false);

      // Sıralama: Hayatta kalan #1, diğerleri elenme sırasının tersine göre
      const sorted = [...finalList].sort((a, b) => {
        if (a.alive !== b.alive) return a.alive ? -1 : 1;
        return (b.eliminationOrder ?? 0) - (a.eliminationOrder ?? 0);
      });

      const standingsInput = sorted.map((st, idx) => {
        const rank = idx + 1;
        const bonus = Math.min(
          900,
          st.bluffsCaught * 280 + st.survivedClicks * 190
        );
        return {
          slotIndex: st.seat.slotIndex,
          player: st.seat.player,
          isBot: st.seat.isBot,
          rank,
          actionScore: bonus,
          statSummary: `${st.bluffsCaught} Blöf Yakalama • ${st.survivedClicks} Tetik Sağ Çıkış`,
        };
      });

      const winner = sorted[0];
      onComboEnergyChange?.(5);
      sound.playVictory();
      try {
        confetti({ particleCount: 90, spread: 75, origin: { y: 0.6 } });
      } catch {
        // ignore
      }

      const customMsg = `${winner.seat.player.name}, Blöf Ruleti masasında tüm rakiplerini eleyip hayatta kalan tek isim oldu!`;

      const computed = await recordMultiplayerMatchResult({
        game: "liarsRoulette",
        standings: standingsInput,
        modeLabel: `${seats.length} Kişilik Blöf Masası`,
        customFeedMessage: customMsg,
      });
      setFinalStandings(computed);
    },
    [onComboEnergyChange, seats.length]
  );

  // İDDİA YÜKSELT (RAISE BID)
  const handlePlaceBid = useCallback(
    (qty: number, face: number) => {
      if (isAnimating || phase !== "bidding") return;
      if (!isDraftBidValid(qty, face, currentBid)) {
        sound.playInvalid();
        return;
      }

      sound.playClick();
      setIsHoldingDicePeek(false);
      const bidderName = activePlayerState.seat.player.name;
      const newBid: CurrentBid = {
        bidderIdx: turnIdx,
        quantity: qty,
        face,
      };
      setCurrentBid(newBid);

      const nextTurn = findNextAliveIndex(turnIdx, playerStates);
      setTurnIdx(nextTurn);
      const nextName = playerStates[nextTurn]?.seat.player.name ?? "Oyuncu";

      setTableBanner(
        `📢 ${bidderName.toUpperCase()} İDDİASI: "MASADA EN AZ ${qty} TANE [${face}] VAR!"`
      );
      setTableSubText(
        `Sıra ${nextName} oyuncusunda: İddiayı yükselt veya "YALANCI! KUPALARI AÇ!" butonuna bas!`
      );
    },
    [
      isAnimating,
      phase,
      isDraftBidValid,
      currentBid,
      activePlayerState,
      turnIdx,
      findNextAliveIndex,
      playerStates,
    ]
  );

  // "YALANCI! KUPALARI AÇ!" AKSİYONU
  const handleCallLiar = useCallback(() => {
    if (isAnimating || phase !== "bidding" || !currentBid) return;
    setIsAnimating(true);
    setIsHoldingDicePeek(false);
    setPhase("revealing_cups");
    sound.playDuelClash();

    const challengerIdx = turnIdx;
    const bidderIdx = currentBid.bidderIdx;
    const bidQty = currentBid.quantity;
    const bidFace = currentBid.face;

    // Tüm hayatta kalan oyuncuların zarlarında bidFace veya 1 (Joker) olanları say
    let matchingTotal = 0;
    playerStates.forEach((st) => {
      if (!st.alive) return;
      st.dice.forEach((d) => {
        if (d === bidFace || d === 1) {
          matchingTotal += 1;
        }
      });
    });

    // Eğer masadaki gerçek adet >= iddia edilen adet ise İddia Sahibi DOĞRU söylemiştir -> İtiraz eden (Challenger) kaybeder!
    // Eğer gerçek adet < iddia edilen adet ise İddia Sahibi YALAN söylemiştir -> Blöfçü (Bidder) kaybeder!
    const bidderToldTruth = matchingTotal >= bidQty;
    const loserIdx = bidderToldTruth ? challengerIdx : bidderIdx;
    const winnerOfCallIdx = bidderToldTruth ? bidderIdx : challengerIdx;

    const challengerName = playerStates[challengerIdx].seat.player.name;
    const bidderName = playerStates[bidderIdx].seat.player.name;
    const loserName = playerStates[loserIdx].seat.player.name;

    const reasonText = bidderToldTruth
      ? `Masada tam ${matchingTotal} adet (${bidFace} + ★ Joker) çıktı! ${bidderName} doğru söylüyormuş; ${challengerName} yanıldı!`
      : `Masada sadece ${matchingTotal} adet (${bidFace} + ★ Joker) çıktı! ${bidderName} BLÖF yaparken yakalandı!`;

    setRevealSummary({
      challengerIdx,
      bidderIdx,
      bidQty,
      bidFace,
      matchingTotal,
      loserIdx,
      reasonText,
    });

    setTableBanner(
      `🚨 "${challengerName.toUpperCase()}" YALANCI DEDİ! KUPALAR AÇILDI!`
    );
    setTableSubText(reasonText);

    // 2.8 sn kupaları inceleme -> ardından kaybeden kişi Altıpatlar Ruleti çeker!
    setTimeout(() => {
      setPhase("revolver_roulette");
      sound.playRevolverSpin();

      const victim = playerStates[loserIdx];
      const shotNumber = victim.shotsTaken + 1; // 1..6
      const isLiveFatal = victim.shotsTaken === victim.liveChamberIdx;

      setTableBanner(
        `🔫 ${loserName.toUpperCase()} ALTIPATLAR TETİĞİNİ ÇEKİYOR... (${shotNumber}/6 RİSK)`
      );
      setTableSubText("Silindir döndü... Namlu şakağa dayandı...");

      setTimeout(() => {
        if (isLiveFatal) {
          // === DOLU MERMİ: OYUNCU ELENDİ ===
          sound.playShotgunBlast(false);
          setScreenShakeKey((k) => k + 1);
          setRedFlash(true);
          setTimeout(() => setRedFlash(false), 550);
        } else {
          // === BOŞ YUVA (*KLİK!*): HAYATTA KALDI ===
          sound.playDryClick();
        }

        setRevolverOutcome({
          victimIdx: loserIdx,
          shotNumber,
          isLiveFatal,
        });

        eliminationCounterRef.current += isLiveFatal ? 1 : 0;
        const elimOrder = eliminationCounterRef.current;

        const nextList = playerStates.map((st, idx) => {
          let nextSt = { ...st };
          if (idx === winnerOfCallIdx && !bidderToldTruth) {
            nextSt.bluffsCaught += 1;
          }
          if (idx === loserIdx) {
            nextSt.shotsTaken = shotNumber;
            if (isLiveFatal) {
              nextSt.alive = false;
              nextSt.eliminationOrder = elimOrder;
            } else {
              nextSt.survivedClicks += 1;
            }
          }
          return nextSt;
        });

        setPlayerStates(nextList);

        if (isLiveFatal) {
          setTableBanner(
            `💥 GÜM! ${loserName.toUpperCase()} ELENDİ! (${shotNumber}/6 Yuva Dolu Çıktı)`
          );
          setTableSubText("Masadan bir sandalye eksildi...");
        } else {
          setTableBanner(
            `💨 *KLİK!* BOŞ YUVA! ${loserName.toUpperCase()} HAYATTA KALDI! (${shotNumber}/6)`
          );
          setTableSubText(
            `Bir sonraki hatasında riski ${shotNumber + 1}/6 olacak!`
          );
        }

        setTimeout(() => {
          const alivePlayers = nextList.filter((p) => p.alive);
          if (alivePlayers.length <= 1) {
            finishMatch(nextList);
          } else {
            const nextStarter = nextList[loserIdx].alive
              ? loserIdx
              : findNextAliveIndex(loserIdx, nextList);
            startNewDiceHand(nextStarter, roundNum + 1, nextList);
          }
        }, 2300);
      }, 1150);
    }, 2800);
  }, [
    isAnimating,
    phase,
    currentBid,
    turnIdx,
    playerStates,
    finishMatch,
    findNextAliveIndex,
    startNewDiceHand,
    roundNum,
  ]);

  // YAPAY ZEKA (BOT) HAMLESİ
  useEffect(() => {
    if (
      phase !== "bidding" ||
      isAnimating ||
      !activePlayerState ||
      !activePlayerState.seat.isBot
    ) {
      return;
    }

    const botTimer = setTimeout(() => {
      const aliveCount = playerStates.filter((p) => p.alive).length;
      const totalDiceOnTable = aliveCount * 5;
      const myDice = activePlayerState.dice;

      if (!currentBid) {
        // İlk iddiayı başlat
        const counts: Record<number, number> = { 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
        myDice.forEach((d) => {
          if (d >= 2) counts[d] = (counts[d] || 0) + 1;
        });
        let bestFace = 3;
        let maxC = -1;
        for (let f = 2; f <= 6; f++) {
          if (counts[f] > maxC) {
            maxC = counts[f];
            bestFace = f;
          }
        }
        const openQty = Math.max(1, Math.min(3, Math.round(totalDiceOnTable / 5)));
        handlePlaceBid(openQty, bestFace);
        return;
      }

      // Mevcut iddia çok yüksekse "YALANCI!" de
      const expectedAvg = totalDiceOnTable / 3; // 1'ler joker olduğu için her zarın gelme olasılığı 2/6 = 1/3
      if (
        currentBid.quantity > expectedAvg + 2.2 ||
        currentBid.quantity >= totalDiceOnTable - 1 ||
        (currentBid.quantity > expectedAvg + 0.8 && Math.random() < 0.58)
      ) {
        handleCallLiar();
        return;
      }

      // Aksi halde iddiayı 1 kademe yükselt
      if (currentBid.face < 6) {
        handlePlaceBid(currentBid.quantity, currentBid.face + 1);
      } else {
        handlePlaceBid(currentBid.quantity + 1, 2);
      }
    }, 1050);

    return () => clearTimeout(botTimer);
  }, [
    phase,
    isAnimating,
    activePlayerState,
    playerStates,
    currentBid,
    handlePlaceBid,
    handleCallLiar,
  ]);

  const totalAliveDice = playerStates.filter((p) => p.alive).length * 5;

  return (
    <motion.div
      key={screenShakeKey}
      animate={
        screenShakeKey > 0
          ? { x: [-14, 14, -10, 10, -4, 4, 0], y: [-6, 6, -4, 4, 0] }
          : {}
      }
      transition={{ duration: 0.36 }}
      className={`relative flex h-full w-full max-w-6xl flex-col justify-between overflow-hidden rounded-3xl border-2 bg-[#140f0d] p-2.5 sm:p-4 shadow-2xl select-none ${activeSlotTheme.frameGlowClass}`}
      style={{
        backgroundImage:
          "radial-gradient(circle at 50% 45%, rgba(180, 83, 9, 0.22) 0%, rgba(24, 17, 14, 0.94) 60%, rgba(9, 7, 6, 0.99) 100%)",
      }}
    >
      {/* Kırmızı Patlama Ekran Flaşı */}
      <AnimatePresence>
        {redFlash && (
          <motion.div
            initial={{ opacity: 0.8 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute inset-0 z-40 bg-red-600/55"
          />
        )}
      </AnimatePresence>

      {/* ÜST BAR */}
      <div className="relative z-20 flex flex-wrap items-center justify-between gap-2 border-b border-stone-800 pb-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBackToHub}
            className="min-h-[46px] inline-flex items-center gap-1.5 rounded-2xl border border-stone-700 bg-stone-900/90 px-3.5 py-2 text-xs font-black text-stone-200 hover:border-amber-400 transition cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4 text-amber-400" /> Lobiye Dön
          </button>
          <button
            type="button"
            onClick={onRequestNewGameWithGate}
            className="min-h-[46px] inline-flex items-center gap-1.5 rounded-2xl border border-stone-700 bg-stone-900/90 px-3 py-2 text-xs font-extrabold text-amber-300 hover:border-amber-400 transition cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Yeni Masa Kur
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="rounded-full border border-amber-400/40 bg-amber-500/15 px-3 py-1 text-xs font-black text-amber-300">
            💀 BLÖF RULETİ • RAUNT #{roundNum} • MASADA {totalAliveDice} ZAR
          </span>
          <span
            className={`rounded-full border px-3 py-1 text-xs font-black ${activeSlotTheme.badgeClass}`}
          >
            Sıra: {activePlayerState?.seat.player.avatar}{" "}
            {activePlayerState?.seat.player.name}
          </span>
        </div>
      </div>

      {/* ORTA BÖLGE: OYUNCU KUPALARI & ALTIPATLAR SİLİNDİRLERİ + MERKEZ İDDİA PANOSU */}
      <div className="relative z-10 grid flex-1 grid-cols-1 lg:grid-cols-12 gap-3 items-stretch min-h-0 py-1.5">
        {/* SOL/ÜST (7 Sütun): 2-4 OYUNCU ZAR KUPALARI VE ALTIPATLAR DURUMLARI */}
        <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-2.5 content-stretch">
          {playerStates.map((st, idx) => {
            const slotTheme =
              SMARTBOARD_SLOTS[st.seat.slotIndex] ?? SMARTBOARD_SLOTS[0];
            const isTurn = turnIdx === idx && phase === "bidding";
            const showCupsOpen =
              phase === "revealing_cups" || phase === "revolver_roulette";
            const isLoser = revealSummary?.loserIdx === idx;

            return (
              <motion.div
                key={st.seat.slotIndex}
                animate={
                  isTurn
                    ? { scale: [1, 1.015, 1] }
                    : isLoser && phase === "revolver_roulette"
                    ? { x: [-4, 4, -4, 4, 0] }
                    : {}
                }
                className={`flex flex-col justify-between rounded-2xl border-2 p-3 transition-all ${
                  !st.alive
                    ? "border-stone-800/70 bg-stone-950/45 opacity-50"
                    : isTurn
                    ? `${slotTheme.borderClass} bg-stone-900/90 shadow-lg`
                    : "border-stone-800 bg-stone-950/80"
                }`}
              >
                {/* Oyuncu Başlığı + Altıpatlar (6 Yuva) Risk Göstergesi */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-xl ${slotTheme.badgeClass}`}
                    >
                      {st.alive ? st.seat.player.avatar : "💀"}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-xs sm:text-sm font-black text-white">
                        {st.seat.player.name}
                      </div>
                      <div className="text-[10px] font-bold text-stone-400">
                        {!st.alive
                          ? "ELENDİ (Masadan Kalktı)"
                          : currentBid?.bidderIdx === idx
                          ? `Son İddia: ${currentBid.quantity}x [${currentBid.face}]`
                          : isTurn
                          ? "🔥 Sıra Sende!"
                          : "Kupası Kapalı"}
                      </div>
                    </div>
                  </div>

                  {/* 6 Yuvalı Altıpatlar Silindiri */}
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] font-black text-amber-300">
                      🔫 Risk: {st.shotsTaken}/6
                    </span>
                    <div className="mt-1 flex items-center gap-1">
                      {Array.from({ length: 6 }).map((_, chIdx) => {
                        const spent = chIdx < st.shotsTaken;
                        return (
                          <span
                            key={chIdx}
                            className={`h-2.5 w-2.5 rounded-full border ${
                              !st.alive
                                ? "border-red-500 bg-red-600"
                                : spent
                                ? "border-stone-600 bg-stone-700"
                                : "border-amber-400 bg-amber-400/35"
                            }`}
                          />
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Deri Zar Kupası veya Açılan 5 Zar */}
                <div className="mt-2.5 flex items-center justify-center rounded-xl border border-stone-800 bg-black/55 px-2.5 py-3 min-h-[66px]">
                  {!st.alive ? (
                    <span className="text-xs font-black text-red-400 uppercase tracking-widest">
                      💀 OYUN DIŞI
                    </span>
                  ) : showCupsOpen ? (
                    <div className="flex items-center gap-1.5">
                      {st.dice.map((d, dIdx) => {
                        const isMatch =
                          revealSummary &&
                          (d === revealSummary.bidFace || d === 1);
                        return (
                          <motion.div
                            key={dIdx}
                            initial={{ rotateY: 180, scale: 0.7 }}
                            animate={{ rotateY: 0, scale: 1 }}
                            transition={{ delay: dIdx * 0.06 }}
                            className={`flex h-10 w-10 flex-col items-center justify-center rounded-xl border-2 font-black shadow ${
                              isMatch
                                ? "border-amber-400 bg-amber-400 text-stone-950 shadow-[0_0_14px_rgba(251,191,36,0.75)] scale-105"
                                : "border-stone-700 bg-stone-900 text-stone-300"
                            }`}
                          >
                            <span className="text-sm leading-none">{d}</span>
                            {d === 1 && (
                              <span className="text-[8px] font-black uppercase">
                                ★JOKER
                              </span>
                            )}
                          </motion.div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-xs font-extrabold text-amber-200/80">
                      <span className="text-2xl">🥃</span>
                      <span>5 Zar Deri Kupa Altında Gizli</span>
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* SAĞ/ALT (5 Sütun): MERKEZ ANONS, AVUÇ İÇİ GİZLİ ZAR KUTUSU & İDDİA / YALANCI KONTROLLERİ */}
        <div className="lg:col-span-5 flex flex-col justify-between rounded-2xl border-2 border-stone-700 bg-stone-950/90 p-3.5 shadow-xl">
          {/* Masa Durum Ekranı */}
          <div className="rounded-xl border border-amber-500/35 bg-black/80 p-3">
            <div className="text-xs font-black text-amber-300 leading-snug">
              {tableBanner}
            </div>
            <div className="mt-1 text-[11px] text-stone-300 leading-relaxed">
              {tableSubText}
            </div>

            {currentBid && (
              <div className="mt-2.5 flex items-center justify-between rounded-xl border border-amber-400/40 bg-amber-500/15 px-3 py-2">
                <span className="text-xs font-bold text-amber-200">
                  Masadaki Son İddia:
                </span>
                <span className="text-sm font-black text-white">
                  {currentBid.quantity} Adet [{currentBid.face}]{" "}
                  <span className="text-[10px] text-amber-300">(+1★ Joker)</span>
                </span>
              </div>
            )}
          </div>

          {/* AKILLI TAHTA "AVUÇ İÇİ GİZLİ ZAR BAKIŞI" (180x90px Basılı Tutarak Görme) */}
          {phase === "bidding" &&
            activePlayerState &&
            !activePlayerState.seat.isBot && (
              <div className="my-2 flex flex-col items-center rounded-2xl border border-cyan-400/45 bg-slate-950/90 p-2.5">
                <div className="text-[10px] font-black uppercase tracking-wider text-cyan-300 mb-1">
                  {activePlayerState.seat.player.name} — Kupanın Altındaki 5 Zarın
                </div>

                <div
                  onPointerDown={() => {
                    sound.playCrtBeep(1020);
                    setIsHoldingDicePeek(true);
                  }}
                  onPointerUp={() => setIsHoldingDicePeek(false)}
                  onPointerLeave={() => setIsHoldingDicePeek(false)}
                  onPointerCancel={() => setIsHoldingDicePeek(false)}
                  className="flex h-[90px] w-[210px] flex-col items-center justify-center rounded-xl border-2 border-cyan-400/60 bg-[#05080d] px-2 text-center select-none cursor-pointer shadow-[0_0_20px_rgba(34,211,238,0.25)]"
                >
                  {isHoldingDicePeek ? (
                    <div>
                      <div className="flex items-center justify-center gap-1.5">
                        {activePlayerState.dice.map((d, i) => (
                          <span
                            key={i}
                            className={`flex h-9 w-8 flex-col items-center justify-center rounded-lg border font-black ${
                              d === 1
                                ? "border-amber-400 bg-amber-400 text-stone-950"
                                : "border-cyan-400 bg-cyan-950 text-white"
                            }`}
                          >
                            <span className="text-xs leading-none">{d}</span>
                            {d === 1 && (
                              <span className="text-[7px]">★JOKER</span>
                            )}
                          </span>
                        ))}
                      </div>
                      <div className="mt-1 text-[9px] text-slate-400">
                        Parmağını çekince anında gizlenir
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1 text-cyan-200">
                      <Eye className="h-5 w-5 text-cyan-400 animate-pulse" />
                      <span className="text-[10px] font-black leading-tight">
                        ELİMLE KAPATIP ZARLARIMA BAK (BASILI TUT)
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

          {/* İDDİA YÜKSELTME SEÇİCİSİ VE DEV KIRMIZI "YALANCI! KUPALARI AÇ!" BUTONU */}
          <div className="space-y-2.5">
            <div className="rounded-2xl border border-stone-800 bg-stone-900/90 p-2.5">
              <div className="flex items-center justify-between text-xs font-extrabold text-stone-300 mb-1.5">
                <span>1) Adet Seç ({draftQty} Tane):</span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={isAnimating || phase !== "bidding"}
                    onClick={() => setDraftQty((q) => Math.max(1, q - 1))}
                    className="h-9 w-9 rounded-xl border border-stone-700 bg-stone-950 text-sm font-black text-white hover:border-amber-400 cursor-pointer"
                  >
                    -
                  </button>
                  <span className="w-8 text-center text-sm font-black text-amber-300">
                    {draftQty}
                  </span>
                  <button
                    type="button"
                    disabled={isAnimating || phase !== "bidding"}
                    onClick={() =>
                      setDraftQty((q) => Math.min(totalAliveDice, q + 1))
                    }
                    className="h-9 w-9 rounded-xl border border-stone-700 bg-stone-950 text-sm font-black text-white hover:border-amber-400 cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="text-xs font-extrabold text-stone-300 mb-1.5">
                2) Zar Yüzü Seç (1★ Joker Otomatik Dahil):
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {[2, 3, 4, 5, 6].map((faceVal) => {
                  const selected = draftFace === faceVal;
                  const validWithCurrentQty = isDraftBidValid(
                    draftQty,
                    faceVal,
                    currentBid
                  );
                  return (
                    <button
                      key={faceVal}
                      type="button"
                      disabled={isAnimating || phase !== "bidding"}
                      onClick={() => setDraftFace(faceVal)}
                      className={`min-h-[44px] flex flex-col items-center justify-center rounded-xl border font-black transition cursor-pointer ${
                        selected
                          ? "border-amber-400 bg-amber-400 text-stone-950 shadow"
                          : validWithCurrentQty
                          ? "border-stone-700 bg-stone-950 text-white hover:border-amber-400/50"
                          : "border-stone-800 bg-stone-950/50 text-stone-600"
                      }`}
                    >
                      <span className="text-sm">[{faceVal}]</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <motion.button
                type="button"
                disabled={
                  isAnimating ||
                  phase !== "bidding" ||
                  activePlayerState?.seat.isBot ||
                  !isDraftBidValid(draftQty, draftFace, currentBid)
                }
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => handlePlaceBid(draftQty, draftFace)}
                className="min-h-[54px] flex items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 px-3 py-2.5 text-xs sm:text-sm font-black text-stone-950 shadow-lg disabled:opacity-40 cursor-pointer"
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>
                  İddia Et: {draftQty}x [{draftFace}]
                </span>
              </motion.button>

              <motion.button
                type="button"
                disabled={
                  isAnimating ||
                  phase !== "bidding" ||
                  !currentBid ||
                  activePlayerState?.seat.isBot
                }
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.94 }}
                onClick={handleCallLiar}
                className="min-h-[54px] flex items-center justify-center gap-1.5 rounded-2xl border-2 border-red-400 bg-gradient-to-r from-red-600 to-rose-700 px-3 py-2.5 text-xs sm:text-sm font-black text-white shadow-[0_0_25px_rgba(239,68,68,0.45)] disabled:opacity-35 cursor-pointer"
              >
                <Flame className="h-4 w-4" />
                <span>🚨 YALANCI! KUPALARI AÇ!</span>
              </motion.button>
            </div>
          </div>
        </div>
      </div>

      {/* MAÇ SONU SIRALAMA MODALI */}
      <AnimatePresence>
        {phase === "gameover" && finalStandings && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.9, y: 14 }}
              animate={{ scale: 1, y: 0 }}
              className="w-full max-w-md rounded-3xl border-2 border-amber-400/50 bg-stone-950 p-5 text-center shadow-2xl"
            >
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/20 border border-amber-400/40 text-3xl">
                👑
              </div>
              <h2 className="mt-2.5 text-lg font-black text-white">
                Blöf Ruleti Masası Sona Erdi!
              </h2>
              <p className="text-xs text-stone-400">
                Hayatta kalan son oyuncu şampiyonluk ödülünü kazandı!
              </p>

              <div className="mt-4 space-y-2 text-left">
                {finalStandings.map((st) => (
                  <div
                    key={st.slotIndex}
                    className="flex items-center justify-between rounded-2xl border border-stone-800 bg-stone-900/90 px-3.5 py-2.5"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-sm font-black text-amber-300">
                        #{st.rank}
                      </span>
                      <span className="text-lg">{st.player.avatar}</span>
                      <div>
                        <div className="text-xs font-black text-white">
                          {st.player.name}
                        </div>
                        <div className="text-[10px] text-stone-400">
                          {st.statSummary}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-black text-amber-300 tabular-nums">
                        {st.finalScore.toLocaleString("tr-TR")} P
                      </div>
                      {st.isNewPersonalBest && (
                        <span className="text-[9px] font-black text-emerald-400">
                          YENİ REKOR!
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-5 flex items-center gap-2">
                <button
                  type="button"
                  onClick={onRequestNewGameWithGate}
                  className="min-h-[52px] flex-1 rounded-2xl bg-gradient-to-r from-amber-500 to-red-600 py-3 text-xs sm:text-sm font-black text-white shadow-lg cursor-pointer"
                >
                  🔄 Yeni Oyun Başlat
                </button>
                <button
                  type="button"
                  onClick={onBackToHub}
                  className="min-h-[52px] rounded-2xl border border-stone-700 bg-stone-900 px-4 py-3 text-xs font-extrabold text-stone-300 hover:text-white cursor-pointer"
                >
                  Lobi
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

