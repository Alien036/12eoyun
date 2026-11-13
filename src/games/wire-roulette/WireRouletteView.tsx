"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import {
  ArrowLeft,
  RotateCcw,
  Zap,
  Scissors,
  Eye,
  Shield,
  Shuffle,
  Sparkles,
  AlertTriangle,
} from "lucide-react";
import {
  clampGameScore,
  recordDuelGameResult,
  recordSoloGameResult,
  type PlayerDoc,
} from "@/lib/firestore";
import { sound } from "@/lib/sound";

export type WireStateType = "explosive" | "safe" | "overload";

export type WireToolKey =
  | "voltmeter"
  | "doubleCut"
  | "insulatorGlove"
  | "wireShuffler";

interface WireToolMeta {
  key: WireToolKey;
  name: string;
  icon: string;
  desc: string;
  badgeClass: string;
}

const WIRE_TOOLS: Record<WireToolKey, WireToolMeta> = {
  voltmeter: {
    key: "voltmeter",
    name: "Voltmetre",
    icon: "📟",
    desc: "Seçtiğin 2 kabloyu ölçer; içlerinde akım (Patlayıcı/Aşırı Yük) olup olmadığını gizlice söyler.",
    badgeClass: "border-cyan-400/50 bg-cyan-500/15 text-cyan-200",
  },
  doubleCut: {
    key: "doubleCut",
    name: "Çift Kesim Zorlaması",
    icon: "✂️",
    desc: "Rakibini sıradaki turunda 1 yerine 2 kablo birden kesmeye zorlar!",
    badgeClass: "border-red-400/50 bg-red-500/20 text-red-200",
  },
  insulatorGlove: {
    key: "insulatorGlove",
    name: "İzolatör Eldiven",
    icon: "🧤",
    desc: "Bu turda patlayıcı kabloyu kessen bile hasarı yarıya indirir (2⚡ → 1⚡).",
    badgeClass: "border-emerald-400/50 bg-emerald-500/15 text-emerald-200",
  },
  wireShuffler: {
    key: "wireShuffler",
    name: "Hat Değiştirici",
    icon: "🔀",
    desc: "Kesilmemiş kalan tüm kabloların iç akım dizilimini baştan karıştırır!",
    badgeClass: "border-amber-400/50 bg-amber-500/15 text-amber-200",
  },
};

const ALL_TOOL_KEYS: WireToolKey[] = [
  "voltmeter",
  "doubleCut",
  "insulatorGlove",
  "wireShuffler",
];

interface WireSlot {
  id: number; // 0..7
  label: string;
  colorHex: string;
  glowHex: string;
  type: WireStateType;
  cut: boolean;
  cutBySeat?: 1 | 2;
}

const WIRE_COLORS: { label: string; colorHex: string; glowHex: string }[] = [
  { label: "KIRMIZI HAT", colorHex: "#ef4444", glowHex: "rgba(239,68,68,0.6)" },
  { label: "MAVİ HAT", colorHex: "#38bdf8", glowHex: "rgba(56,189,248,0.6)" },
  { label: "SARI HAT", colorHex: "#facc15", glowHex: "rgba(250,204,21,0.6)" },
  { label: "YEŞİL HAT", colorHex: "#22c55e", glowHex: "rgba(34,197,94,0.6)" },
  { label: "MOR HAT", colorHex: "#c084fc", glowHex: "rgba(192,132,252,0.6)" },
  {
    label: "TURUNCU HAT",
    colorHex: "#fb923c",
    glowHex: "rgba(251,146,60,0.6)",
  },
  {
    label: "BEYAZ HAT",
    colorHex: "#f1f5f9",
    glowHex: "rgba(241,245,249,0.6)",
  },
  {
    label: "TURKUAZ HAT",
    colorHex: "#2dd4bf",
    glowHex: "rgba(45,212,191,0.6)",
  },
];

function shuffleFisherYates<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function buildEightWires(): WireSlot[] {
  // 3 Patlayıcı Faz, 4 Boş Hat, 1 Aşırı Yük
  const states: WireStateType[] = shuffleFisherYates([
    "explosive",
    "explosive",
    "explosive",
    "safe",
    "safe",
    "safe",
    "safe",
    "overload",
  ]);
  return WIRE_COLORS.map((c, idx) => ({
    id: idx,
    label: `#${idx + 1} ${c.label}`,
    colorHex: c.colorHex,
    glowHex: c.glowHex,
    type: states[idx],
    cut: false,
  }));
}

interface WireRouletteViewProps {
  mode: "solo" | "duel";
  player1: PlayerDoc;
  player2?: PlayerDoc;
  allPlayers: PlayerDoc[];
  onBackToHub: () => void;
  onRequestNewGameWithGate: () => void;
  onComboEnergyChange?: (energy: number) => void;
}

export default function WireRouletteView({
  mode,
  player1,
  player2,
  allPlayers,
  onBackToHub,
  onRequestNewGameWithGate,
  onComboEnergyChange,
}: WireRouletteViewProps) {
  const [roundNum, setRoundNum] = useState<number>(1);
  const [p1Hp, setP1Hp] = useState<number>(4);
  const [p2Hp, setP2Hp] = useState<number>(4);

  const [turn, setTurn] = useState<1 | 2>(1);
  const [cutsRequiredThisTurn, setCutsRequiredThisTurn] = useState<number>(1);
  const [pendingNextTurnDouble, setPendingNextTurnDouble] =
    useState<boolean>(false);
  const [gloveActiveThisTurn, setGloveActiveThisTurn] =
    useState<boolean>(false);

  const [wires, setWires] = useState<WireSlot[]>(() => buildEightWires());
  const [p1Tools, setP1Tools] = useState<WireToolKey[]>([]);
  const [p2Tools, setP2Tools] = useState<WireToolKey[]>([]);

  // Voltmetre 2 kablo seçme modu
  const [voltmeterSelectMode, setVoltmeterSelectMode] =
    useState<boolean>(false);
  const [voltmeterPickedIds, setVoltmeterPickedIds] = useState<number[]>([]);
  const [secretVoltmeterPeek, setSecretVoltmeterPeek] = useState<{
    title: string;
    message: string;
    hasDanger: boolean;
  } | null>(null);
  const [isHoldingPeek, setIsHoldingPeek] = useState<boolean>(false);

  const [isAnimating, setIsAnimating] = useState<boolean>(false);
  const [lastCutWireId, setLastCutWireId] = useState<number | null>(null);
  const [screenShakeKey, setScreenShakeKey] = useState<number>(0);
  const [flashColor, setFlashColor] = useState<"none" | "red" | "amber">(
    "none"
  );

  const [panelBanner, setPanelBanner] = useState<string>(
    "YÜKSEK GERİLİM KUTUSU AÇILDI: 3 PATLAYICI FAZ • 4 BOŞ HAT • 1 AŞIRI YÜK"
  );
  const [panelSubText, setPanelSubText] = useState<string>(
    "Sırayla yan keskiyle 1 kablo kes veya taktiksel aletlerini kullan!"
  );

  const [p1SafeCuts, setP1SafeCuts] = useState<number>(0);
  const [p2SafeCuts, setP2SafeCuts] = useState<number>(0);

  const [matchResult, setMatchResult] = useState<{
    winner: 1 | 2;
    p1Score: number;
    p2Score: number;
    isNewBest: boolean;
    summaryText: string;
  } | null>(null);

  const savedRef = useRef<boolean>(false);

  const p2Name =
    mode === "duel" && player2 ? player2.name : "BAŞMÜHENDİS BOT";
  const p2Avatar = mode === "duel" && player2 ? player2.avatar : "🤖";

  const dealTwoTools = useCallback((existing: WireToolKey[]): WireToolKey[] => {
    const next = [...existing];
    for (let i = 0; i < 2; i++) {
      if (next.length >= 4) break;
      const pick =
        ALL_TOOL_KEYS[Math.floor(Math.random() * ALL_TOOL_KEYS.length)];
      next.push(pick);
    }
    return next;
  }, []);

  // İlk açılışta alet dağıt
  useEffect(() => {
    setP1Tools(dealTwoTools([]));
    setP2Tools(dealTwoTools([]));
  }, [dealTwoTools]);

  // Maç Sonunu Kaydet
  const finalizeWireMatch = useCallback(
    async (winnerSeat: 1 | 2, finalHp1: number, finalHp2: number) => {
      if (savedRef.current) return;
      savedRef.current = true;
      setIsAnimating(true);

      const baseChamp = 3200;
      const p1Bonus = Math.min(900, finalHp1 * 150 + p1SafeCuts * 85);
      const p2Bonus = Math.min(900, finalHp2 * 150 + p2SafeCuts * 85);

      const rawP1 =
        winnerSeat === 1
          ? baseChamp + p1Bonus
          : Math.min(1350, 500 + Math.round(p1Bonus * 0.55));
      const rawP2 =
        winnerSeat === 2
          ? baseChamp + p2Bonus
          : Math.min(1350, 500 + Math.round(p2Bonus * 0.55));

      const cleanP1 = clampGameScore("wireRoulette", rawP1);
      const cleanP2 = clampGameScore("wireRoulette", rawP2);

      onComboEnergyChange?.(winnerSeat === 1 ? 5 : 2);

      if (winnerSeat === 1 || mode === "duel") {
        sound.playVictory();
        try {
          confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
        } catch {
          // ignore
        }
      } else {
        sound.playGameOver();
      }

      const winnerName = winnerSeat === 1 ? player1.name : p2Name;
      const winScore = winnerSeat === 1 ? cleanP1 : cleanP2;
      const customMsg = `${winnerName}, Yüksek Gerilim Kablo Ruleti düellosundan sağ çıktı! (${winScore.toLocaleString(
        "tr-TR"
      )} P)`;

      setMatchResult({
        winner: winnerSeat,
        p1Score: cleanP1,
        p2Score: cleanP2,
        isNewBest: false,
        summaryText: customMsg,
      });

      if (mode === "solo") {
        const res = await recordSoloGameResult(
          player1,
          {
            game: "wireRoulette",
            score: cleanP1,
            won: winnerSeat === 1,
            modeLabel: "Yüksek Gerilim",
            customFeedMessage: winnerSeat === 1 ? customMsg : undefined,
          },
          allPlayers
        );
        setMatchResult((prev) =>
          prev ? { ...prev, isNewBest: res.isNewPersonalBest } : prev
        );
      } else if (mode === "duel" && player2) {
        const prev1 = player1.games?.wireRoulette?.highScore ?? 0;
        const prev2 = player2.games?.wireRoulette?.highScore ?? 0;
        const isBest =
          (winnerSeat === 1 && cleanP1 > prev1) ||
          (winnerSeat === 2 && cleanP2 > prev2);
        await recordDuelGameResult({
          game: "wireRoulette",
          player1,
          player2,
          winner: winnerSeat,
          p1Score: cleanP1,
          p2Score: cleanP2,
          customFeedMessage: customMsg,
        });
        setMatchResult((prev) =>
          prev ? { ...prev, isNewBest: isBest } : prev
        );
      }
    },
    [
      p1SafeCuts,
      p2SafeCuts,
      onComboEnergyChange,
      mode,
      player1,
      p2Name,
      allPlayers,
      player2,
    ]
  );

  // Yeni Kutu / Raunt Yükle
  const startNextWireBox = useCallback(
    (nextStarter: 1 | 2, nextRound: number) => {
      sound.playCrtBeep(920);
      setWires(buildEightWires());
      setP1Tools((t) => dealTwoTools(t));
      setP2Tools((t) => dealTwoTools(t));
      setRoundNum(nextRound);
      setTurn(nextStarter);
      setCutsRequiredThisTurn(1);
      setPendingNextTurnDouble(false);
      setGloveActiveThisTurn(false);
      setVoltmeterSelectMode(false);
      setVoltmeterPickedIds([]);
      setSecretVoltmeterPeek(null);
      setLastCutWireId(null);
      setIsAnimating(false);

      setPanelBanner(
        `RAUNT #${nextRound}: YENİ 8 KABLO BAĞLANDI (3 PATLAYICI • 4 BOŞ • 1 AŞIRI YÜK)`
      );
      setPanelSubText("Her iki oyuncuya +2 yeni taktiksel alet verildi.");
    },
    [dealTwoTools]
  );

  // KABLO KESME AKSİYONU
  const handleCutWire = useCallback(
    (wireId: number) => {
      if (isAnimating || matchResult) return;
      const targetWire = wires.find((w) => w.id === wireId);
      if (!targetWire || targetWire.cut) return;

      // Eğer Voltmetre seçim modundaysa kabloyu kesme, ölçüm listesine ekle!
      if (voltmeterSelectMode) {
        sound.playClick();
        if (voltmeterPickedIds.includes(wireId)) {
          setVoltmeterPickedIds((prev) => prev.filter((id) => id !== wireId));
          return;
        }
        const nextPicked = [...voltmeterPickedIds, wireId];
        setVoltmeterPickedIds(nextPicked);

        if (nextPicked.length === 2) {
          const wA = wires.find((w) => w.id === nextPicked[0])!;
          const wB = wires.find((w) => w.id === nextPicked[1])!;
          const hasLive =
            wA.type === "explosive" ||
            wB.type === "explosive" ||
            wA.type === "overload" ||
            wB.type === "overload";

          sound.playCrtBeep(hasLive ? 520 : 1240);
          setVoltmeterSelectMode(false);
          setVoltmeterPickedIds([]);

          const msg = hasLive
            ? `⚠️ DİKKAT: #${wA.id + 1} ve #${
                wB.id + 1
              } kablolarından EN AZ BİRİNDE YÜKSEK AKIM VAR!`
            : `✅ TEMİZ: #${wA.id + 1} ve #${
                wB.id + 1
              } kablolarının İKİSİ DE GÜVENLİ BOŞ HAT!`;

          setSecretVoltmeterPeek({
            title: `📟 VOLTMETRE ÖLÇÜMÜ (#${wA.id + 1} & #${wB.id + 1})`,
            message: msg,
            hasDanger: hasLive,
          });
          setIsHoldingPeek(mode === "solo");
        }
        return;
      }

      setIsAnimating(true);
      setSecretVoltmeterPeek(null);
      setLastCutWireId(wireId);

      const cutterSeat = turn;
      const cutterName = cutterSeat === 1 ? player1.name : p2Name;

      const updatedWires = wires.map((w) =>
        w.id === wireId ? { ...w, cut: true, cutBySeat: cutterSeat } : w
      );
      setWires(updatedWires);

      let nextHp1 = p1Hp;
      let nextHp2 = p2Hp;

      if (targetWire.type === "explosive") {
        // === PATLAYICI FAZ (-2⚡ veya Eldivenle -1⚡) ===
        sound.playWireCut("explosion");
        setScreenShakeKey((k) => k + 1);
        setFlashColor("red");
        setTimeout(() => setFlashColor("none"), 500);

        const dmg = gloveActiveThisTurn ? 1 : 2;
        if (cutterSeat === 1) nextHp1 = Math.max(0, p1Hp - dmg);
        else nextHp2 = Math.max(0, p2Hp - dmg);

        setP1Hp(nextHp1);
        setP2Hp(nextHp2);

        setPanelBanner(
          `💥 PATLAYICI FAZ KESİLDİ! ${cutterName.toUpperCase()} -${dmg}⚡ HASAR ALDI!`
        );
        setPanelSubText(
          gloveActiveThisTurn
            ? "🧤 İzolatör Eldiven hasarı yarıya indirdi (2⚡ → 1⚡)!"
            : "Yüksek voltaj arkı sigorta kutusunu sarstı!"
        );
      } else if (targetWire.type === "overload") {
        // === AŞIRI YÜK (-1⚡ veya Eldivenle 0⚡) ===
        sound.playWireCut("overload");
        setScreenShakeKey((k) => k + 1);
        setFlashColor("amber");
        setTimeout(() => setFlashColor("none"), 450);

        const dmg = gloveActiveThisTurn ? 0 : 1;
        if (cutterSeat === 1) nextHp1 = Math.max(0, p1Hp - dmg);
        else nextHp2 = Math.max(0, p2Hp - dmg);

        setP1Hp(nextHp1);
        setP2Hp(nextHp2);

        setPanelBanner(
          `⚡ AŞIRI YÜK HATTI! ${cutterName.toUpperCase()} ${
            dmg > 0 ? "-1⚡ ÇARPILDI!" : "ELDİVENLE KORUNDU!"
          }`
        );
        setPanelSubText("Kıvılcımlar saçıldı, sıra karşı tarafa geçiyor.");
      } else {
        // === GÜVENLİ BOŞ HAT ===
        sound.playWireCut("safe");
        if (cutterSeat === 1) setP1SafeCuts((c) => c + 1);
        else setP2SafeCuts((c) => c + 1);

        setPanelBanner(
          `✅ *ÇIT!* #${wireId + 1} GÜVENLİ BOŞ HAT! (${cutterName.toUpperCase()} KURTULDU)`
        );
        setPanelSubText("Akım yok, temiz kesim!");
      }

      setTimeout(() => {
        if (nextHp1 <= 0) {
          finalizeWireMatch(2, nextHp1, nextHp2);
          return;
        }
        if (nextHp2 <= 0) {
          finalizeWireMatch(1, nextHp1, nextHp2);
          return;
        }

        // Eğer bu turda 2 kesim zorunluluğu varsa ve ilk kesim GÜVENLİ çıktıysa 1 kablo daha kesmeli!
        const remainingUncut = updatedWires.filter((w) => !w.cut);
        const remainingExplosive = remainingUncut.filter(
          (w) => w.type === "explosive"
        );

        if (remainingUncut.length === 0 || remainingExplosive.length === 0) {
          const nextSeat: 1 | 2 = cutterSeat === 1 ? 2 : 1;
          startNextWireBox(nextSeat, roundNum + 1);
          return;
        }

        if (cutsRequiredThisTurn > 1 && targetWire.type === "safe") {
          setCutsRequiredThisTurn(1);
          setIsAnimating(false);
          setPanelBanner(
            `✂️ ÇİFT KESİM DEVAM EDİYOR: ${cutterName.toUpperCase()} 1 KABLO DAHA KESMELİ!`
          );
          return;
        }

        // Sıra karşıya geçer
        const nextSeat: 1 | 2 = cutterSeat === 1 ? 2 : 1;
        const nextCuts = pendingNextTurnDouble ? 2 : 1;
        setTurn(nextSeat);
        setCutsRequiredThisTurn(nextCuts);
        setPendingNextTurnDouble(false);
        setGloveActiveThisTurn(false);
        setIsAnimating(false);

        const nextName = nextSeat === 1 ? player1.name : p2Name;
        setPanelBanner(
          `SIRA: ${nextName.toUpperCase()} ${
            nextCuts === 2 ? "(⚠️ 2 KABLO KESMEK ZORUNDA!)" : ""
          }`
        );
      }, 950);
    },
    [
      isAnimating,
      matchResult,
      wires,
      voltmeterSelectMode,
      voltmeterPickedIds,
      mode,
      turn,
      player1.name,
      p2Name,
      p1Hp,
      p2Hp,
      gloveActiveThisTurn,
      finalizeWireMatch,
      cutsRequiredThisTurn,
      pendingNextTurnDouble,
      startNextWireBox,
      roundNum,
    ]
  );

  // TAKTİKSEL ALET KULLANIMI
  const handleUseTool = useCallback(
    (ownerSeat: 1 | 2, toolIdx: number) => {
      if (isAnimating || matchResult || ownerSeat !== turn) return;
      const list = ownerSeat === 1 ? p1Tools : p2Tools;
      const toolKey = list[toolIdx];
      if (!toolKey) return;

      const uncutWires = wires.filter((w) => !w.cut);

      if (toolKey === "voltmeter") {
        if (uncutWires.length < 2) {
          sound.playInvalid();
          setPanelSubText("Ölçüm için en az 2 kesilmemiş kablo olmalı!");
          return;
        }
        sound.playCrtBeep(1080);
        setVoltmeterSelectMode(true);
        setVoltmeterPickedIds([]);
        setPanelBanner(
          "📟 VOLTMETRE AKTİF: ÖLÇMEK İSTEDİĞİN 2 KABLOYA DOKUN!"
        );
        setPanelSubText("Seçtiğin 2 kabloda tehlikeli akım olup olmadığı ölçülecek.");
      } else if (toolKey === "doubleCut") {
        if (pendingNextTurnDouble) {
          sound.playInvalid();
          return;
        }
        sound.playHandcuffs();
        setPendingNextTurnDouble(true);
        setPanelBanner(
          "✂️ ÇİFT KESİM ZORLAMASI AKTİF! RAKİP SIRADAKİ TURDA 2 KABLO KESECEK!"
        );
      } else if (toolKey === "insulatorGlove") {
        if (gloveActiveThisTurn) {
          sound.playInvalid();
          return;
        }
        sound.playDefibShock(true);
        setGloveActiveThisTurn(true);
        setPanelBanner(
          "🧤 İZOLATÖR ELDİVEN GİYİLDİ! BU TUR PATLAMA HASARI YARIYA İNDİ!"
        );
      } else if (toolKey === "wireShuffler") {
        sound.playShotgunRack();
        const uncutStates = shuffleFisherYates(uncutWires.map((w) => w.type));
        let ptr = 0;
        const reshuffled = wires.map((w) => {
          if (w.cut) return w;
          const nextType = uncutStates[ptr++];
          return { ...w, type: nextType };
        });
        setWires(reshuffled);
        setSecretVoltmeterPeek(null);
        setPanelBanner(
          "🔀 HAT DEĞİŞTİRİCİ! KALAN KABLOLARIN AKIM DİZİLİMİ KARIŞTIRILDI!"
        );
      }

      if (ownerSeat === 1) {
        setP1Tools((prev) => prev.filter((_, i) => i !== toolIdx));
      } else {
        setP2Tools((prev) => prev.filter((_, i) => i !== toolIdx));
      }
    },
    [
      isAnimating,
      matchResult,
      turn,
      p1Tools,
      p2Tools,
      wires,
      pendingNextTurnDouble,
      gloveActiveThisTurn,
    ]
  );

  // BAŞMÜHENDİS BOT YAPAY ZEKASI (Solo Modda Sıra 2'deyken)
  useEffect(() => {
    if (mode !== "solo" || turn !== 2 || isAnimating || matchResult) return;

    const botTimer = setTimeout(() => {
      const uncut = wires.filter((w) => !w.cut);
      if (uncut.length === 0) return;

      // Eldiven varsa ve patlayıcı oranı yüksekse önce eldiven giy
      const expLeft = uncut.filter((w) => w.type === "explosive").length;
      if (!gloveActiveThisTurn && expLeft / uncut.length >= 0.45) {
        const gloveIdx = p2Tools.indexOf("insulatorGlove");
        if (gloveIdx !== -1) {
          handleUseTool(2, gloveIdx);
          return;
        }
      }

      // Çift kesim varsa kullan
      if (!pendingNextTurnDouble && uncut.length >= 3) {
        const dcIdx = p2Tools.indexOf("doubleCut");
        if (dcIdx !== -1) {
          handleUseTool(2, dcIdx);
          return;
        }
      }

      // Rastgele kesilmemiş bir kabloyu kes
      const pick = uncut[Math.floor(Math.random() * uncut.length)];
      handleCutWire(pick.id);
    }, 1000);

    return () => clearTimeout(botTimer);
  }, [
    mode,
    turn,
    isAnimating,
    matchResult,
    wires,
    gloveActiveThisTurn,
    p2Tools,
    pendingNextTurnDouble,
    handleUseTool,
    handleCutWire,
  ]);

  const uncutList = wires.filter((w) => !w.cut);
  const expCount = uncutList.filter((w) => w.type === "explosive").length;
  const safeCount = uncutList.filter((w) => w.type === "safe").length;
  const overCount = uncutList.filter((w) => w.type === "overload").length;

  return (
    <motion.div
      key={screenShakeKey}
      animate={
        screenShakeKey > 0
          ? { x: [-14, 14, -10, 10, -4, 4, 0], y: [-6, 6, -4, 4, 0] }
          : {}
      }
      transition={{ duration: 0.36 }}
      className="relative flex h-full w-full max-w-6xl flex-col justify-between overflow-hidden rounded-3xl border-2 border-yellow-500/40 bg-[#0e1116] p-2.5 sm:p-4 shadow-2xl select-none"
      style={{
        backgroundImage:
          "radial-gradient(circle at 50% 45%, rgba(234, 179, 8, 0.14) 0%, rgba(15, 23, 42, 0.94) 62%, rgba(7, 10, 15, 0.99) 100%)",
      }}
    >
      {/* Patlama Ekran Flaşı */}
      <AnimatePresence>
        {flashColor !== "none" && (
          <motion.div
            initial={{ opacity: 0.75 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            className={`pointer-events-none absolute inset-0 z-40 ${
              flashColor === "red" ? "bg-red-600/55" : "bg-amber-400/50"
            }`}
          />
        )}
      </AnimatePresence>

      {/* ÜST BAR */}
      <div className="relative z-20 flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBackToHub}
            className="min-h-[46px] inline-flex items-center gap-1.5 rounded-2xl border border-slate-700 bg-slate-900/90 px-3.5 py-2 text-xs font-black text-slate-200 hover:border-yellow-400 transition cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4 text-yellow-400" /> Lobiye Dön
          </button>
          <button
            type="button"
            onClick={onRequestNewGameWithGate}
            className="min-h-[46px] inline-flex items-center gap-1.5 rounded-2xl border border-slate-700 bg-slate-900/90 px-3 py-2 text-xs font-extrabold text-yellow-300 hover:border-yellow-400 transition cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Yeni Kutu Kur
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="rounded-full border border-yellow-400/40 bg-yellow-500/15 px-3 py-1 text-xs font-black text-yellow-300">
            ⚡ YÜKSEK GERİLİM: KABLO RULETİ • KUTU #{roundNum}
          </span>
        </div>
      </div>

      {/* ORTA BÖLGE: Sol Durum & Oyuncu Panelleri — Sağ 8 Gergin Kablolu Sigorta Kutusu */}
      <div className="relative z-10 grid flex-1 grid-cols-1 lg:grid-cols-12 gap-3 items-stretch min-h-0 py-1.5">
        {/* SOL PANEL (5 Sütun): Oyuncu Şarjları, Taktiksel Kemerler & Gizli Voltmetre */}
        <div className="lg:col-span-5 flex flex-col justify-between gap-2 rounded-2xl border-2 border-slate-800 bg-slate-950/90 p-3">
          {/* Oyuncu 2 / Bot */}
          <div
            className={`rounded-2xl border p-2.5 transition ${
              turn === 2
                ? "border-rose-500 bg-rose-950/25 shadow-[0_0_20px_rgba(244,63,94,0.25)]"
                : "border-slate-800 bg-slate-900/70"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{p2Avatar}</span>
                <div>
                  <div className="text-xs sm:text-sm font-black text-white">
                    {p2Name}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {turn === 2 ? "⚡ Kesim Sırası Onda" : "Beklemede"}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {Array.from({ length: 4 }).map((_, i) => (
                  <span
                    key={i}
                    className={`flex h-6 w-6 items-center justify-center rounded-lg border text-xs font-black ${
                      i < p2Hp
                        ? "border-rose-400 bg-rose-500/30 text-rose-200"
                        : "border-slate-800 bg-slate-950 text-slate-700"
                    }`}
                  >
                    ⚡
                  </span>
                ))}
              </div>
            </div>

            {/* Oyuncu 2 Alet Kemeri */}
            <div className="mt-2 grid grid-cols-4 gap-1.5">
              {Array.from({ length: 4 }).map((_, idx) => {
                const tKey = p2Tools[idx];
                const meta = tKey ? WIRE_TOOLS[tKey] : null;
                const canClick =
                  Boolean(meta) &&
                  mode === "duel" &&
                  turn === 2 &&
                  !isAnimating;
                return (
                  <button
                    key={idx}
                    type="button"
                    disabled={!canClick}
                    onClick={() => handleUseTool(2, idx)}
                    title={meta ? `${meta.name}: ${meta.desc}` : "Boş Kemer"}
                    className={`min-h-[48px] flex flex-col items-center justify-center rounded-xl border p-1 text-center ${
                      meta
                        ? `${meta.badgeClass} ${
                            canClick
                              ? "cursor-pointer hover:brightness-125"
                              : "opacity-75"
                          }`
                        : "border-slate-800 bg-slate-950/60 text-slate-700"
                    }`}
                  >
                    {meta ? (
                      <>
                        <span className="text-base leading-none">
                          {meta.icon}
                        </span>
                        <span className="mt-0.5 text-[9px] font-black truncate max-w-full">
                          {meta.name.split(" ")[0]}
                        </span>
                      </>
                    ) : (
                      <span className="text-[9px] opacity-40">Boş</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Kutu İçerik Özeti & Dijital Anons */}
          <div className="rounded-2xl border border-yellow-500/35 bg-black/80 p-3">
            <div className="flex items-center justify-between text-[11px] font-black text-slate-300 border-b border-slate-800 pb-1.5">
              <span>KALAN AKIM DAĞILIMI:</span>
              <div className="flex items-center gap-2">
                <span className="text-red-400">💥 {expCount} Patlayıcı</span>
                <span className="text-emerald-400">✅ {safeCount} Boş</span>
                <span className="text-amber-300">⚡ {overCount} Aşırı Yük</span>
              </div>
            </div>
            <div className="mt-2 text-xs font-black text-yellow-300 leading-snug">
              {panelBanner}
            </div>
            <div className="mt-0.5 text-[11px] text-slate-300">
              {panelSubText}
            </div>
          </div>

          {/* AVUÇ İÇİ GİZLİ VOLTMETRE KUTUSU (180x90px) */}
          <AnimatePresence>
            {secretVoltmeterPeek && (
              <motion.div
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.92 }}
                className="flex flex-col items-center rounded-2xl border-2 border-cyan-400/70 bg-slate-950 p-2.5"
              >
                <div className="flex w-full items-center justify-between text-[10px] font-black text-cyan-300 mb-1">
                  <span>{secretVoltmeterPeek.title}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSecretVoltmeterPeek(null);
                      setIsHoldingPeek(false);
                    }}
                    className="rounded bg-white/10 px-2 py-0.5 text-white hover:bg-white/20 cursor-pointer"
                  >
                    Kapat ✕
                  </button>
                </div>

                <div
                  onPointerDown={() => setIsHoldingPeek(true)}
                  onPointerUp={() => {
                    if (mode === "duel") setIsHoldingPeek(false);
                  }}
                  onPointerLeave={() => {
                    if (mode === "duel") setIsHoldingPeek(false);
                  }}
                  onPointerCancel={() => {
                    if (mode === "duel") setIsHoldingPeek(false);
                  }}
                  className="flex h-[90px] w-[180px] flex-col items-center justify-center rounded-xl border border-cyan-400/50 bg-[#05080d] px-2 text-center select-none cursor-pointer"
                >
                  {isHoldingPeek ? (
                    <div
                      className={`text-[11px] font-black leading-snug ${
                        secretVoltmeterPeek.hasDanger
                          ? "text-red-400"
                          : "text-emerald-400"
                      }`}
                    >
                      {secretVoltmeterPeek.message}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1 text-cyan-200">
                      <Eye className="h-5 w-5 text-cyan-400 animate-pulse" />
                      <span className="text-[10px] font-black leading-tight">
                        ELİNLE KAPAT VE GÖRMEK İÇİN BASILI TUT
                      </span>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Oyuncu 1 */}
          <div
            className={`rounded-2xl border p-2.5 transition ${
              turn === 1
                ? "border-cyan-400 bg-cyan-950/25 shadow-[0_0_20px_rgba(34,211,238,0.25)]"
                : "border-slate-800 bg-slate-900/70"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{player1.avatar}</span>
                <div>
                  <div className="text-xs sm:text-sm font-black text-white">
                    {player1.name}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {turn === 1 ? "⚡ Kesim Sırası Sende!" : "Beklemede"}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {Array.from({ length: 4 }).map((_, i) => (
                  <span
                    key={i}
                    className={`flex h-6 w-6 items-center justify-center rounded-lg border text-xs font-black ${
                      i < p1Hp
                        ? "border-cyan-400 bg-cyan-500/30 text-cyan-200"
                        : "border-slate-800 bg-slate-950 text-slate-700"
                    }`}
                  >
                    ⚡
                  </span>
                ))}
              </div>
            </div>

            {/* Oyuncu 1 Alet Kemeri */}
            <div className="mt-2 grid grid-cols-4 gap-1.5">
              {Array.from({ length: 4 }).map((_, idx) => {
                const tKey = p1Tools[idx];
                const meta = tKey ? WIRE_TOOLS[tKey] : null;
                const canClick =
                  Boolean(meta) && turn === 1 && !isAnimating;
                return (
                  <button
                    key={idx}
                    type="button"
                    disabled={!canClick}
                    onClick={() => handleUseTool(1, idx)}
                    title={meta ? `${meta.name}: ${meta.desc}` : "Boş Kemer"}
                    className={`min-h-[48px] flex flex-col items-center justify-center rounded-xl border p-1 text-center ${
                      meta
                        ? `${meta.badgeClass} ${
                            canClick
                              ? "cursor-pointer hover:brightness-125"
                              : "opacity-75"
                          }`
                        : "border-slate-800 bg-slate-950/60 text-slate-700"
                    }`}
                  >
                    {meta ? (
                      <>
                        <span className="text-base leading-none">
                          {meta.icon}
                        </span>
                        <span className="mt-0.5 text-[9px] font-black truncate max-w-full">
                          {meta.name.split(" ")[0]}
                        </span>
                      </>
                    ) : (
                      <span className="text-[9px] opacity-40">Boş</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* SAĞ PANEL (7 Sütun): ENDÜSTRİYEL SİGORTA KUTUSU VE 8 GERGİN RENKLİ KABLO */}
        <div className="lg:col-span-7 flex flex-col justify-between rounded-2xl border-2 border-slate-700 bg-gradient-to-b from-slate-900 via-[#111622] to-slate-950 p-3.5 sm:p-4 shadow-[inset_0_0_50px_rgba(0,0,0,0.9)]">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center gap-2">
              <Scissors className="h-4 w-4 text-yellow-400" />
              <span className="text-xs sm:text-sm font-black text-white">
                {voltmeterSelectMode
                  ? "📟 ÖLÇMEK İÇİN 2 KABLO SEÇ"
                  : "✂️ KESMEK İSTEDİĞİN KABLOYA DOKUN"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {gloveActiveThisTurn && (
                <span className="rounded-full bg-emerald-500/20 border border-emerald-400/50 px-2.5 py-0.5 text-[10px] font-black text-emerald-300">
                  🧤 Eldiven Koruyor
                </span>
              )}
              {cutsRequiredThisTurn === 2 && (
                <span className="rounded-full bg-red-500/25 border border-red-400/50 px-2.5 py-0.5 text-[10px] font-black text-red-200 animate-pulse">
                  ✂️ 2 Kablo Kesilecek!
                </span>
              )}
            </div>
          </div>

          {/* 8 Gergin Kablo Listesi */}
          <div className="my-2 flex-1 flex flex-col justify-around gap-1.5">
            {wires.map((w) => {
              const isVoltPicked = voltmeterPickedIds.includes(w.id);
              const disabled =
                w.cut ||
                isAnimating ||
                (mode === "solo" && turn === 2);

              return (
                <motion.button
                  key={w.id}
                  type="button"
                  disabled={disabled}
                  whileHover={disabled ? undefined : { scale: 1.01 }}
                  whileTap={disabled ? undefined : { scale: 0.98 }}
                  onClick={() => handleCutWire(w.id)}
                  className={`relative min-h-[48px] flex items-center justify-between rounded-xl border px-3 py-2 transition ${
                    w.cut
                      ? "border-slate-800/80 bg-slate-950/60 cursor-default"
                      : isVoltPicked
                      ? "border-cyan-400 bg-cyan-950/40 ring-2 ring-cyan-400/50 cursor-pointer"
                      : "border-slate-700/80 bg-slate-900/80 hover:border-yellow-400/60 cursor-pointer"
                  }`}
                >
                  {/* Sol Terminal Somunu */}
                  <div className="flex items-center gap-2.5 z-10">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-600 bg-slate-800 text-[11px] font-black text-slate-200">
                      #{w.id + 1}
                    </span>
                    <span className="text-xs font-black text-white">
                      {w.label.replace(`#${w.id + 1} `, "")}
                    </span>
                  </div>

                  {/* Ortadaki Gergin Kablo Çizgisi (Kesilince İkiye Ayrılır!) */}
                  <div className="relative flex-1 mx-4 flex items-center justify-center h-4">
                    {!w.cut ? (
                      <div
                        className="w-full h-2.5 rounded-full"
                        style={{
                          backgroundColor: w.colorHex,
                          boxShadow: `0 0 12px ${w.glowHex}`,
                        }}
                      />
                    ) : (
                      <div className="w-full flex items-center justify-between">
                        <div
                          className="w-[42%] h-2.5 rounded-l-full opacity-55 rotate-3"
                          style={{ backgroundColor: w.colorHex }}
                        />
                        <span className="text-xs">
                          {w.type === "explosive"
                            ? "💥"
                            : w.type === "overload"
                            ? "⚡"
                            : "✂️"}
                        </span>
                        <div
                          className="w-[42%] h-2.5 rounded-r-full opacity-55 -rotate-3"
                          style={{ backgroundColor: w.colorHex }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Sağ Durum / Kes Butonu */}
                  <div className="z-10 text-right">
                    {w.cut ? (
                      <span
                        className={`rounded-lg px-2 py-0.5 text-[10px] font-black ${
                          w.type === "explosive"
                            ? "bg-red-500/25 text-red-300"
                            : w.type === "overload"
                            ? "bg-amber-500/25 text-amber-300"
                            : "bg-emerald-500/20 text-emerald-300"
                        }`}
                      >
                        {w.type === "explosive"
                          ? "PATLAYICI FAZ"
                          : w.type === "overload"
                          ? "AŞIRI YÜK"
                          : "BOŞ HAT"}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1 text-[10px] font-black text-yellow-300">
                        {voltmeterSelectMode ? "📟 Ölç" : "✂️ Kes"}
                      </span>
                    )}
                  </div>
                </motion.button>
              );
            })}
          </div>
        </div>
      </div>

      {/* MAÇ SONU MODALI */}
      <AnimatePresence>
        {matchResult && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.9, y: 14 }}
              animate={{ scale: 1, y: 0 }}
              className="w-full max-w-md rounded-3xl border-2 border-yellow-400/50 bg-slate-950 p-6 text-center shadow-2xl"
            >
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-yellow-500/20 border border-yellow-400/40 text-4xl">
                ⚡
              </div>
              <h2 className="mt-3 text-xl font-black text-white">
                {matchResult.winner === 1
                  ? `${player1.name} Yüksek Gerilimden Sağ Çıktı!`
                  : `${p2Name} Düelloyu Kazandı!`}
              </h2>
              <p className="mt-1 text-xs text-slate-300">
                {matchResult.summaryText}
              </p>

              {matchResult.isNewBest && (
                <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-amber-400/20 border border-amber-400/50 px-3 py-1 text-xs font-black text-amber-300">
                  <Sparkles className="h-3.5 w-3.5" /> YENİ KİŞİSEL REKOR!
                </div>
              )}

              <div className="mt-4 grid grid-cols-2 gap-2.5 rounded-2xl border border-slate-800 bg-slate-900/90 p-3 text-left">
                <div>
                  <div className="text-[11px] text-slate-400">
                    {player1.avatar} {player1.name}
                  </div>
                  <div className="text-base font-black text-cyan-300 tabular-nums">
                    {matchResult.p1Score.toLocaleString("tr-TR")} P
                  </div>
                </div>
                {mode === "duel" && player2 ? (
                  <div>
                    <div className="text-[11px] text-slate-400">
                      {player2.avatar} {player2.name}
                    </div>
                    <div className="text-base font-black text-rose-300 tabular-nums">
                      {matchResult.p2Score.toLocaleString("tr-TR")} P
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="text-[11px] text-slate-400">
                      🤖 Başmühendis Bot
                    </div>
                    <div className="text-xs font-bold text-slate-300">
                      {matchResult.winner === 1 ? "Kısa Devre" : "Kazandı"}
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-5 flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={onRequestNewGameWithGate}
                  className="min-h-[52px] flex-1 rounded-2xl bg-gradient-to-r from-yellow-400 to-orange-500 py-3 text-xs sm:text-sm font-black text-slate-950 shadow-lg cursor-pointer"
                >
                  🔄 Yeni Düello Başlat
                </button>
                <button
                  type="button"
                  onClick={onBackToHub}
                  className="min-h-[52px] rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-xs font-extrabold text-slate-300 hover:text-white cursor-pointer"
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
