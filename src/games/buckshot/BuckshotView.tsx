"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import {
  ArrowLeft,
  RotateCcw,
  Eye,
  Sparkles,
  Crosshair,
  User,
  Lock,
  Hand,
} from "lucide-react";
import {
  clampGameScore,
  recordDuelGameResult,
  recordSoloGameResult,
  type PlayerDoc,
} from "@/lib/firestore";
import { sound } from "@/lib/sound";
import { Buckshot3DEngine } from "./Buckshot3DEngine";

export type ShellType = "live" | "blank";

export type BuckshotItemKey =
  | "magnifier"
  | "handsaw"
  | "handcuffs"
  | "soda"
  | "sedative"
  | "inverter"
  | "burnerPhone"
  | "adrenaline"
  | "expiredMed";

export interface BuckshotItemMeta {
  key: BuckshotItemKey;
  name: string;
  shortName: string;
  icon: string;
  desc: string;
  accentClass: string;
}

export const BUCKSHOT_ITEMS: Record<BuckshotItemKey, BuckshotItemMeta> = {
  magnifier: {
    key: "magnifier",
    name: "Büyüteç",
    shortName: "Büyüteç",
    icon: "🔍",
    desc: "Namludaki sıradaki fişeğin DOLU mu BOŞ mu olduğunu gizlice gösterir.",
    accentClass: "border-cyan-400/60 bg-cyan-950/70 text-cyan-200",
  },
  handsaw: {
    key: "handsaw",
    name: "El Testeresi",
    shortName: "Testere",
    icon: "🪚",
    desc: "Namluyu keser! Bu atış DOLU çıkarsa 2x Hasar (2⚡) verir.",
    accentClass: "border-red-500/70 bg-red-950/75 text-red-200",
  },
  handcuffs: {
    key: "handcuffs",
    name: "Kelepçe",
    shortName: "Kelepçe",
    icon: "🔗",
    desc: "Rakibin 3D bileklerini kelepçeler; rakip sıradaki 1 tam turunu pas geçer.",
    accentClass: "border-slate-300/60 bg-slate-900/80 text-slate-200",
  },
  soda: {
    key: "soda",
    name: "Teneke İçecek",
    shortName: "Teneke",
    icon: "🥫",
    desc: "Pompalıyı kurup namludaki 3D fişeği ateşlemeden masaya fırlatır; sıran sende kalır!",
    accentClass: "border-sky-400/60 bg-sky-950/75 text-sky-200",
  },
  sedative: {
    key: "sedative",
    name: "Şarj Tüpü (+1⚡)",
    shortName: "+1⚡ Tüp",
    icon: "🔋",
    desc: "3D monitöre +1⚡ yeşil LED şarj barı ekler (Kesik Kablo modunda çalışmaz).",
    accentClass: "border-emerald-400/60 bg-emerald-950/75 text-emerald-200",
  },
  inverter: {
    key: "inverter",
    name: "Dönüştürücü",
    shortName: "Inverter",
    icon: "🔄",
    desc: "Namludaki fişeğin kutbunu gizlice tersine çevirir (DOLU ↔ BOŞ)!",
    accentClass: "border-purple-400/60 bg-purple-950/75 text-purple-200",
  },
  burnerPhone: {
    key: "burnerPhone",
    name: "Gizli Telefon",
    shortName: "Telefon",
    icon: "📱",
    desc: "Şarjördeki gelecekteki rastgele bir fişeğin sırasını ve rengini fısıldar.",
    accentClass: "border-amber-400/60 bg-amber-950/75 text-amber-200",
  },
  adrenaline: {
    key: "adrenaline",
    name: "Adrenalin",
    shortName: "Adrenalin",
    icon: "💉",
    desc: "10 sn içinde masanın karşı tarafındaki rakip 3D eşyalardan birini çalıp anında kullanmanı sağlar!",
    accentClass: "border-rose-400/70 bg-rose-950/75 text-rose-200",
  },
  expiredMed: {
    key: "expiredMed",
    name: "Bozuk İlaç",
    shortName: "Bozuk İlaç",
    icon: "💊",
    desc: "%50 ihtimalle +2⚡ şarj verir, %50 ihtimalle sarsıntıyla -1⚡ can götürür!",
    accentClass: "border-lime-400/60 bg-lime-950/75 text-lime-200",
  },
};

const ALL_ITEM_KEYS: BuckshotItemKey[] = [
  "magnifier",
  "handsaw",
  "handcuffs",
  "soda",
  "sedative",
  "inverter",
  "burnerPhone",
  "adrenaline",
  "expiredMed",
];

function shuffleArrayFisherYates<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

interface SecretPeekData {
  ownerSeat: 1 | 2;
  title: string;
  secretText: string;
  shellColor?: ShellType;
}

interface BuckshotViewProps {
  mode: "solo" | "duel";
  player1: PlayerDoc;
  player2?: PlayerDoc;
  initialSubMode?: string; // "series3" | "fast1"
  allPlayers: PlayerDoc[];
  onBackToHub: () => void;
  onRequestNewGameWithGate: () => void;
  onComboEnergyChange?: (energy: number) => void;
}

export default function BuckshotView({
  mode,
  player1,
  player2,
  initialSubMode,
  allPlayers,
  onBackToHub,
  onRequestNewGameWithGate,
  onComboEnergyChange,
}: BuckshotViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<Buckshot3DEngine | null>(null);
  const [webglError, setWebglError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState<number>(0);

  const [seriesMode, setSeriesMode] = useState<"series3" | "fast1">(
    initialSubMode === "fast1" ? "fast1" : "series3"
  );

  // Raunt bilgisi (1..3 veya Tek Raunt)
  const [currentRound, setCurrentRound] = useState<number>(1);
  const [p1RoundsWon, setP1RoundsWon] = useState<number>(0);
  const [p2RoundsWon, setP2RoundsWon] = useState<number>(0);

  // Şarj / Can (⚡) durumu
  const [maxHp, setMaxHp] = useState<number>(
    initialSubMode === "fast1" ? 5 : 2
  );
  const [p1Hp, setP1Hp] = useState<number>(initialSubMode === "fast1" ? 5 : 2);
  const [p2Hp, setP2Hp] = useState<number>(initialSubMode === "fast1" ? 5 : 2);
  const [wiresCutSuddenDeath, setWiresCutSuddenDeath] =
    useState<boolean>(false);

  // Sıra ve kilitler (1 = Oyuncu 1, 2 = Krupiye veya Oyuncu 2)
  const [turn, setTurn] = useState<1 | 2>(1);
  const [isAnimating, setIsAnimating] = useState<boolean>(true);

  // Pompalı ve Şarjör durumu
  const [chamber, setChamber] = useState<ShellType[]>([]);
  const [revealPreview, setRevealPreview] = useState<{
    live: number;
    blank: number;
    shells: ShellType[];
  } | null>(null);

  // 3D Tüfek Seçim ve Doğrultma Durumu
  const [gunAim, setGunAim] = useState<"neutral" | "p1" | "p2">("neutral");
  const [gunPickedUpBy, setGunPickedUpBy] = useState<1 | 2 | null>(null);
  const [isSawedOff, setIsSawedOff] = useState<boolean>(false);

  // Vurulan oyuncunun yarı ekranında kan/kararma flaşı
  const [hitScreenEffect, setHitScreenEffect] = useState<1 | 2 | null>(null);

  // 8 Yuvalı 3D Eşya Dizileri (Sabit 8 slot, boş yuvalar null)
  const [p1Items, setP1Items] = useState<(BuckshotItemKey | null)[]>(() =>
    Array(8).fill(null)
  );
  const [p2Items, setP2Items] = useState<(BuckshotItemKey | null)[]>(() =>
    Array(8).fill(null)
  );

  // Kelepçe durumları
  const [p1Cuffed, setP1Cuffed] = useState<boolean>(false);
  const [p2Cuffed, setP2Cuffed] = useState<boolean>(false);
  const [p1CuffCooldown, setP1CuffCooldown] = useState<boolean>(false);
  const [p2CuffCooldown, setP2CuffCooldown] = useState<boolean>(false);

  // Adrenalin (10 sn hırsızlık modu)
  const [adrenalineStealSeat, setAdrenalineStealSeat] = useState<1 | 2 | null>(
    null
  );
  const [adrenalineSecondsLeft, setAdrenalineSecondsLeft] = useState<number>(0);

  // Akıllı Tahta "Avuç İçi Gizli Bakış" (Sadece aktif oyuncunun kendi yarı ekranında açılır!)
  const [secretPeek, setSecretPeek] = useState<SecretPeekData | null>(null);
  const [isHoldingPeek, setIsHoldingPeek] = useState<boolean>(false);

  // CRT Anons ve Hikaye Günlüğü
  const [crtBanner, setCrtBanner] = useState<string>(
    "3D YERALTI ODASI BAŞLATILIYOR... FİŞEKLER DİZİLİYOR"
  );
  const [crtSubText, setCrtSubText] = useState<string>(
    "Masadaki 3D eşyalara veya ortadaki 3D pompalı tüfeğe dokunarak hamle yap."
  );

  // Cesur hamle & istatistik sayaçları (0 - 10.000 puan dengesi için)
  const [p1BraveStats, setP1BraveStats] = useState({
    selfBlankCount: 0,
    sawedHits: 0,
    itemsUsed: 0,
  });
  const [p2BraveStats, setP2BraveStats] = useState({
    selfBlankCount: 0,
    sawedHits: 0,
    itemsUsed: 0,
  });

  // Krupiye AI Hafızası
  const aiMemoryRef = useRef<{
    knownCurrent: ShellType | null;
    knownFuture: Record<number, ShellType>;
    invertedCurrent: boolean;
  }>({
    knownCurrent: null,
    knownFuture: {},
    invertedCurrent: false,
  });

  // Maç Sonu Durumu
  const [matchOver, setMatchOver] = useState<{
    winner: 1 | 2;
    p1Score: number;
    p2Score: number;
    isNewBest: boolean;
    summaryText: string;
  } | null>(null);

  const savedToFirestoreRef = useRef<boolean>(false);

  const p2Name =
    mode === "duel" && player2 ? player2.name : "KRUPIYE (DEALER)";
  const p2Avatar = mode === "duel" && player2 ? player2.avatar : "👹";

  // 1) THREE.JS MOTORUNU BAŞLAT VE WEBGL BELLEK TEMİZLİĞİNİ GARANTİ ALTINA AL
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    setWebglError(null);
    let engine: Buckshot3DEngine | null = null;

    try {
      engine = new Buckshot3DEngine(container);
      if (engine.initError) {
        setWebglError(engine.initError);
        engine.dispose();
        return;
      }
      engineRef.current = engine;
    } catch (err) {
      setWebglError(
        err instanceof Error
          ? err.message
          : "WebGL 3D sahnesi başlatılamadı."
      );
      return;
    }

    const handleResize = () => {
      engine?.resize();
    };
    window.addEventListener("resize", handleResize);

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => engine?.resize());
      observer.observe(container);
    }

    return () => {
      window.removeEventListener("resize", handleResize);
      observer?.disconnect();
      engine?.dispose();
      engineRef.current = null;
    };
  }, [retryKey]);

  // 2) REACT STATE DEĞİŞTİKÇE 3D SAHNE İLE SENKRONİZE ET
  useEffect(() => {
    engineRef.current?.syncState({
      mode,
      turn,
      maxHp,
      p1Hp,
      p2Hp,
      wiresCutSuddenDeath,
      isSawedOff,
      p1Items,
      p2Items,
      p1Cuffed,
      p2Cuffed,
      revealShells: revealPreview ? revealPreview.shells : null,
      gunAim,
      gunPickedUpBy,
      adrenalineStealSeat,
    });
  }, [
    mode,
    turn,
    maxHp,
    p1Hp,
    p2Hp,
    wiresCutSuddenDeath,
    isSawedOff,
    p1Items,
    p2Items,
    p1Cuffed,
    p2Cuffed,
    revealPreview,
    gunAim,
    gunPickedUpBy,
    adrenalineStealSeat,
  ]);

  // Yeni Şarjör + 3D Eşya Dağıtımı Başlat
  const startNewLoad = useCallback(
    (
      nextTurn: 1 | 2,
      roundNum: number,
      currentP1Items: (BuckshotItemKey | null)[],
      currentP2Items: (BuckshotItemKey | null)[],
      isFirstLoadOfRound: boolean
    ) => {
      setIsAnimating(true);
      setGunAim("neutral");
      setGunPickedUpBy(null);
      setIsSawedOff(false);
      setSecretPeek(null);
      setAdrenalineStealSeat(null);

      aiMemoryRef.current = {
        knownCurrent: null,
        knownFuture: {},
        invertedCurrent: false,
      };

      // Toplam 2 ila 8 fişek üret
      const totalShells = isFirstLoadOfRound
        ? Math.min(6, 3 + roundNum)
        : 2 + Math.floor(Math.random() * 7);
      const liveCount = Math.max(
        1,
        Math.min(
          totalShells - 1,
          Math.round(totalShells * (0.42 + Math.random() * 0.22))
        )
      );
      const blankCount = totalShells - liveCount;

      const orderedDisplay: ShellType[] = [
        ...Array(liveCount).fill("live"),
        ...Array(blankCount).fill("blank"),
      ];

      // Her oyuncunun 8'li tebeşir yuvasındaki boş yerlere 2 ila 4 rastgele 3D eşya yerleştir
      const itemCountToDeal =
        roundNum === 1 && isFirstLoadOfRound
          ? 2
          : 2 + Math.floor(Math.random() * 3);

      const dealInto8Slots = (
        existing: (BuckshotItemKey | null)[]
      ): (BuckshotItemKey | null)[] => {
        const next = [...existing];
        while (next.length < 8) next.push(null);
        let added = 0;
        for (let i = 0; i < 8 && added < itemCountToDeal; i++) {
          if (next[i] === null) {
            next[i] =
              ALL_ITEM_KEYS[Math.floor(Math.random() * ALL_ITEM_KEYS.length)];
            added++;
          }
        }
        return next;
      };

      const nextP1Tray = dealInto8Slots(currentP1Items);
      const nextP2Tray = dealInto8Slots(currentP2Items);
      setP1Items(nextP1Tray);
      setP2Items(nextP2Tray);

      setRevealPreview({
        live: liveCount,
        blank: blankCount,
        shells: orderedDisplay,
      });
      setCrtBanner(
        `YENİ ŞARJÖR: ${liveCount} KIRMIZI (DOLU) • ${blankCount} MAVİ (BOŞ)`
      );
      setCrtSubText(
        `Kameralar 3D mermi tepsisine odaklandı. Masaya +${itemCountToDeal} yeni 3D eşya bırakıldı.`
      );
      sound.playCrtBeep(840);

      // 3.2 Saniye 3D Mermi Tepsisi Yakın Çekimi -> Fisher-Yates Karıştırma -> Pompalıya Sürme
      const timer1 = setTimeout(() => {
        setRevealPreview(null);
        const shuffled = shuffleArrayFisherYates(orderedDisplay);
        setChamber(shuffled);
        setCrtBanner("FİŞEKLER KARIŞTIRILDI VE 3D POMPALIYA SÜRÜLÜYOR...");

        const rackSteps = Math.min(4, shuffled.length);
        for (let s = 0; s < rackSteps; s++) {
          setTimeout(() => {
            sound.playShotgunRack();
          }, s * 230);
        }

        setTimeout(() => {
          setTurn(nextTurn);
          setIsAnimating(false);
          const activeName = nextTurn === 1 ? player1.name : p2Name;
          setCrtBanner(`SIRA SENDE: ${activeName.toUpperCase()}`);
          setCrtSubText(
            "Masadaki 3D eşyalara dokunabilir veya 3D pompalı tüfeğe dokunup ateş edebilirsin!"
          );
        }, rackSteps * 230 + 260);
      }, 3200);

      return () => clearTimeout(timer1);
    },
    [player1.name, p2Name]
  );

  // Raunt Başlatıcı
  const initRound = useCallback(
    (roundNum: number, sMode: "series3" | "fast1", startSeat: 1 | 2 = 1) => {
      const roundHp =
        sMode === "fast1" ? 5 : roundNum === 1 ? 2 : roundNum === 2 ? 4 : 5;
      const emptySlots = Array(8).fill(null);
      setCurrentRound(roundNum);
      setMaxHp(roundHp);
      setP1Hp(roundHp);
      setP2Hp(roundHp);
      setWiresCutSuddenDeath(false);
      setP1Items(emptySlots);
      setP2Items(emptySlots);
      setP1Cuffed(false);
      setP2Cuffed(false);
      setP1CuffCooldown(false);
      setP2CuffCooldown(false);
      setIsSawedOff(false);
      setGunAim("neutral");
      setGunPickedUpBy(null);
      startNewLoad(startSeat, roundNum, emptySlots, emptySlots, true);
    },
    [startNewLoad]
  );

  // İlk açılış
  useEffect(() => {
    const cleanTimer = setTimeout(() => {
      initRound(1, seriesMode, 1);
    }, 80);
    return () => clearTimeout(cleanTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Adrenalin 10 saniye geri sayımı
  useEffect(() => {
    if (!adrenalineStealSeat) return;
    if (adrenalineSecondsLeft <= 0) {
      setAdrenalineStealSeat(null);
      setCrtSubText("Adrenalin süresi doldu!");
      return;
    }
    const t = setTimeout(() => {
      sound.playHeartbeat();
      setAdrenalineSecondsLeft((prev) => prev - 1);
    }, 1000);
    return () => clearTimeout(t);
  }, [adrenalineStealSeat, adrenalineSecondsLeft]);

  // Maç Bitişini Hesapla ve Firestore'a Kaydet
  const finalizeMatch = useCallback(
    async (winnerSeat: 1 | 2, finalP1Hp: number, finalP2Hp: number) => {
      if (savedToFirestoreRef.current) return;
      savedToFirestoreRef.current = true;
      setIsAnimating(true);

      const isFast = seriesMode === "fast1";
      const baseWin = isFast ? 2400 : mode === "solo" ? 3800 : 3400;

      const p1Bonus = Math.min(
        1200,
        finalP1Hp * 160 +
          p1BraveStats.selfBlankCount * 140 +
          p1BraveStats.sawedHits * 220 +
          p1BraveStats.itemsUsed * 45
      );
      const p2Bonus = Math.min(
        1200,
        finalP2Hp * 160 +
          p2BraveStats.selfBlankCount * 140 +
          p2BraveStats.sawedHits * 220 +
          p2BraveStats.itemsUsed * 45
      );

      const rawP1 =
        winnerSeat === 1
          ? baseWin + p1Bonus
          : Math.min(1450, 550 + Math.round(p1Bonus * 0.55));
      const rawP2 =
        winnerSeat === 2
          ? baseWin + p2Bonus
          : Math.min(1450, 550 + Math.round(p2Bonus * 0.55));

      const cleanP1 = clampGameScore("buckshot", rawP1);
      const cleanP2 = clampGameScore("buckshot", rawP2);

      onComboEnergyChange?.(winnerSeat === 1 ? 5 : 2);

      if (winnerSeat === 1 || mode === "duel") {
        sound.playVictory();
        try {
          confetti({
            particleCount: 85,
            spread: 70,
            origin: { y: 0.6 },
          });
        } catch {
          // ignore
        }
      } else {
        sound.playGameOver();
      }

      let isNewBest = false;
      const winnerName = winnerSeat === 1 ? player1.name : p2Name;
      const sawedCount =
        winnerSeat === 1 ? p1BraveStats.sawedHits : p2BraveStats.sawedHits;

      const customMsg =
        sawedCount > 0
          ? `${winnerName}, 3D Buckshot Roulette düellosunda namluyu kesip maçı aldı! (${(winnerSeat === 1
              ? cleanP1
              : cleanP2
            ).toLocaleString("tr-TR")} P)`
          : `${winnerName}, 3D Buckshot Roulette masasında hayatta kalarak zafere ulaştı! (${(winnerSeat === 1
              ? cleanP1
              : cleanP2
            ).toLocaleString("tr-TR")} P)`;

      setMatchOver({
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
            game: "buckshot",
            score: cleanP1,
            won: winnerSeat === 1,
            modeLabel: isFast ? "Tek Raunt 3D" : "3 Raunt 3D Seri",
            customFeedMessage: winnerSeat === 1 ? customMsg : undefined,
          },
          allPlayers
        );
        isNewBest = res.isNewPersonalBest;
        setMatchOver((prev) => (prev ? { ...prev, isNewBest } : prev));
      } else if (mode === "duel" && player2) {
        const prevBest1 = player1.games?.buckshot?.highScore ?? 0;
        const prevBest2 = player2.games?.buckshot?.highScore ?? 0;
        isNewBest =
          (winnerSeat === 1 && cleanP1 > prevBest1) ||
          (winnerSeat === 2 && cleanP2 > prevBest2);
        await recordDuelGameResult({
          game: "buckshot",
          player1,
          player2,
          winner: winnerSeat,
          p1Score: cleanP1,
          p2Score: cleanP2,
          customFeedMessage: customMsg,
        });
        setMatchOver((prev) => (prev ? { ...prev, isNewBest } : prev));
      }
    },
    [
      seriesMode,
      mode,
      p1BraveStats,
      p2BraveStats,
      onComboEnergyChange,
      player1,
      player2,
      p2Name,
      allPlayers,
    ]
  );

  // Raunt Bitişini Kontrol Et
  const handlePlayerZeroHp = useCallback(
    (deadSeat: 1 | 2, latestP1Hp: number, latestP2Hp: number) => {
      const roundWinner: 1 | 2 = deadSeat === 1 ? 2 : 1;
      const nextP1Wins = roundWinner === 1 ? p1RoundsWon + 1 : p1RoundsWon;
      const nextP2Wins = roundWinner === 2 ? p2RoundsWon + 1 : p2RoundsWon;
      setP1RoundsWon(nextP1Wins);
      setP2RoundsWon(nextP2Wins);

      const winnerLabel = roundWinner === 1 ? player1.name : p2Name;

      if (
        seriesMode === "fast1" ||
        currentRound >= 3 ||
        nextP1Wins >= 2 ||
        nextP2Wins >= 2
      ) {
        const finalWinner: 1 | 2 =
          seriesMode === "fast1"
            ? roundWinner
            : nextP1Wins >= nextP2Wins
            ? 1
            : 2;
        setTimeout(() => {
          finalizeMatch(finalWinner, latestP1Hp, latestP2Hp);
        }, 950);
        return;
      }

      setIsAnimating(true);
      setCrtBanner(
        `${currentRound}. RAUNT BİTTİ! KAZANAN: ${winnerLabel.toUpperCase()}`
      );
      setCrtSubText(`${currentRound + 1}. Raunt birazdan başlıyor...`);
      sound.playDuelClash();

      setTimeout(() => {
        initRound(currentRound + 1, seriesMode, roundWinner);
      }, 2200);
    },
    [
      p1RoundsWon,
      p2RoundsWon,
      player1.name,
      p2Name,
      seriesMode,
      currentRound,
      finalizeMatch,
      initRound,
    ]
  );

  // Sıra Geçişi (Kelepçe kontrolü ve şarjör bitiş kontrolü dahil)
  const advanceTurnOrReload = useCallback(
    (
      desiredNextSeat: 1 | 2,
      remainingChamber: ShellType[],
      latestP1Items: (BuckshotItemKey | null)[],
      latestP2Items: (BuckshotItemKey | null)[],
      cuffed1: boolean,
      cuffed2: boolean
    ) => {
      setGunPickedUpBy(null);
      setGunAim("neutral");

      if (remainingChamber.length === 0) {
        setP1Cuffed(false);
        setP2Cuffed(false);
        setP1CuffCooldown(false);
        setP2CuffCooldown(false);
        setTimeout(() => {
          startNewLoad(
            desiredNextSeat,
            currentRound,
            latestP1Items,
            latestP2Items,
            false
          );
        }, 800);
        return;
      }

      if (desiredNextSeat === 1 && cuffed1) {
        sound.playHandcuffs();
        setP1Cuffed(false);
        setP1CuffCooldown(true);
        setTurn(2);
        setIsAnimating(false);
        setCrtBanner(
          `🔗 ${player1.name.toUpperCase()} KELEPÇELİ! TURU PAS GEÇTİ!`
        );
        setCrtSubText(`Sıra tekrar ${p2Name} tarafında.`);
        return;
      }

      if (desiredNextSeat === 2 && cuffed2) {
        sound.playHandcuffs();
        setP2Cuffed(false);
        setP2CuffCooldown(true);
        setTurn(1);
        setIsAnimating(false);
        setCrtBanner(`🔗 ${p2Name.toUpperCase()} KELEPÇELİ! TURU PAS GEÇTİ!`);
        setCrtSubText(`Sıra tekrar ${player1.name} tarafında.`);
        return;
      }

      if (desiredNextSeat === 1) setP1CuffCooldown(false);
      if (desiredNextSeat === 2) setP2CuffCooldown(false);

      setTurn(desiredNextSeat);
      setIsAnimating(false);
      const nextName = desiredNextSeat === 1 ? player1.name : p2Name;
      setCrtBanner(`SIRA: ${nextName.toUpperCase()}`);
    },
    [currentRound, player1.name, p2Name, startNewLoad]
  );

  // 3D POMPALI ATEŞLEME MEKANİĞİ (KENDİNE DOĞRULT veya RAKİBE DOĞRULT)
  const handleFireShotgun = useCallback(
    (targetSeat: 1 | 2) => {
      if (isAnimating || chamber.length === 0 || matchOver) return;
      setIsAnimating(true);
      setSecretPeek(null);
      setAdrenalineStealSeat(null);
      setGunPickedUpBy(null);

      const shooterSeat = turn;
      const currentShell = chamber[0];
      const nextChamber = chamber.slice(1);
      const shotDamage = isSawedOff ? 2 : 1;

      // Krupiye hafızasını kaydır
      const shiftedFuture: Record<number, ShellType> = {};
      Object.entries(aiMemoryRef.current.knownFuture).forEach(
        ([idxStr, val]) => {
          const idx = Number(idxStr);
          if (idx > 1) shiftedFuture[idx - 1] = val;
        }
      );
      aiMemoryRef.current = {
        knownCurrent: shiftedFuture[0] ?? null,
        knownFuture: shiftedFuture,
        invertedCurrent: false,
      };

      // 1) 3D Tüfeği Hedefe Doğrult (Rakip kendi ekranında namluyu doğrudan yüzünde görür!)
      setGunAim(targetSeat === 1 ? "p1" : "p2");
      sound.playPickup();

      const targetLabel =
        targetSeat === shooterSeat
          ? "KENDİNE"
          : targetSeat === 1
          ? player1.name
          : p2Name;
      const shooterLabel = shooterSeat === 1 ? player1.name : p2Name;
      setCrtBanner(
        `${shooterLabel.toUpperCase()} 3D NAMLUYU ${targetLabel.toUpperCase()} DOĞRULTTU...`
      );
      setCrtSubText("Nefesler tutuldu...");

      // 2) Gerilim Beklemesi (0.65sn)
      setTimeout(() => {
        engineRef.current?.triggerShotEffect(
          shooterSeat,
          targetSeat,
          currentShell,
          isSawedOff
        );

        if (currentShell === "live") {
          // === DOLU (KIRMIZI) PATLAMA ===
          sound.playShotgunBlast(isSawedOff);
          setTimeout(() => sound.playDefibShock(false), 180);
          setHitScreenEffect(targetSeat);

          const newP1Hp =
            targetSeat === 1 ? Math.max(0, p1Hp - shotDamage) : p1Hp;
          const newP2Hp =
            targetSeat === 2 ? Math.max(0, p2Hp - shotDamage) : p2Hp;

          setP1Hp(newP1Hp);
          setP2Hp(newP2Hp);
          setChamber(nextChamber);

          if (isSawedOff && targetSeat !== shooterSeat) {
            if (shooterSeat === 1) {
              setP1BraveStats((s) => ({ ...s, sawedHits: s.sawedHits + 1 }));
            } else {
              setP2BraveStats((s) => ({ ...s, sawedHits: s.sawedHits + 1 }));
            }
          }

          const triggerCutWire =
            (currentRound === 3 || seriesMode === "fast1") &&
            !wiresCutSuddenDeath &&
            (newP1Hp <= 1 || newP2Hp <= 1) &&
            newP1Hp > 0 &&
            newP2Hp > 0;

          if (triggerCutWire) {
            setWiresCutSuddenDeath(true);
          }

          setCrtBanner(
            `💥 GÜM! KIRMIZI (DOLU) FİŞEK! (-${shotDamage}⚡ HASAR)`
          );
          setCrtSubText(
            triggerCutWire
              ? "⚠️ DİKKAT: DEFİBRİLATÖR KABLOLARI KOPTU! İYİLEŞME DEVRE DIŞI!"
              : `${
                  targetSeat === 1 ? player1.name : p2Name
                } elektroşokla geriye savruldu!`
          );

          setTimeout(() => {
            setHitScreenEffect(null);
            setGunAim("neutral");
            setIsSawedOff(false);
            sound.playShotgunRack();

            if (newP1Hp <= 0) {
              handlePlayerZeroHp(1, newP1Hp, newP2Hp);
              return;
            }
            if (newP2Hp <= 0) {
              handlePlayerZeroHp(2, newP1Hp, newP2Hp);
              return;
            }

            const nextSeat: 1 | 2 = shooterSeat === 1 ? 2 : 1;
            advanceTurnOrReload(
              nextSeat,
              nextChamber,
              p1Items,
              p2Items,
              p1Cuffed,
              p2Cuffed
            );
          }, 1050);
        } else {
          // === BOŞ (MAVİ) *KLİK!* ===
          sound.playDryClick();
          setChamber(nextChamber);

          const shotSelf = targetSeat === shooterSeat;
          if (shotSelf) {
            if (shooterSeat === 1) {
              setP1BraveStats((s) => ({
                ...s,
                selfBlankCount: s.selfBlankCount + 1,
              }));
            } else {
              setP2BraveStats((s) => ({
                ...s,
                selfBlankCount: s.selfBlankCount + 1,
              }));
            }
          }

          setCrtBanner(
            shotSelf
              ? `💨 *KLİK!* BOŞ FİŞEK! ${shooterLabel.toUpperCase()} KENDİNE SIKTI — SIRA SENDE KALDI!`
              : `💨 *KLİK!* BOŞ FİŞEK! SIRA KARŞIYA GEÇİYOR.`
          );
          setCrtSubText(
            shotSelf
              ? "Cesur hamle: Mavi boş kovan masaya fırlatıldı, ekstra hamle hakkı!"
              : "Mavi boş kovan masaya düştü."
          );

          setTimeout(() => {
            setGunAim("neutral");
            setIsSawedOff(false);
            sound.playShotgunRack();

            const nextSeat: 1 | 2 = shotSelf
              ? shooterSeat
              : shooterSeat === 1
              ? 2
              : 1;
            advanceTurnOrReload(
              nextSeat,
              nextChamber,
              p1Items,
              p2Items,
              p1Cuffed,
              p2Cuffed
            );
          }, 820);
        }
      }, 650);
    },
    [
      isAnimating,
      chamber,
      matchOver,
      turn,
      isSawedOff,
      player1.name,
      p2Name,
      p1Hp,
      p2Hp,
      currentRound,
      seriesMode,
      wiresCutSuddenDeath,
      handlePlayerZeroHp,
      advanceTurnOrReload,
      p1Items,
      p2Items,
      p1Cuffed,
      p2Cuffed,
    ]
  );

  // 9 ORİJİNAL 3D EŞYA ETKİSİ
  const executeItemEffect = useCallback(
    (
      userSeat: 1 | 2,
      itemKey: BuckshotItemKey,
      slotIdx: number,
      newP1Tray: (BuckshotItemKey | null)[],
      newP2Tray: (BuckshotItemKey | null)[]
    ) => {
      engineRef.current?.triggerItemUse3DAnimation(userSeat, itemKey, slotIdx);

      if (userSeat === 1) {
        setP1BraveStats((s) => ({ ...s, itemsUsed: s.itemsUsed + 1 }));
      } else {
        setP2BraveStats((s) => ({ ...s, itemsUsed: s.itemsUsed + 1 }));
      }

      const actorName = userSeat === 1 ? player1.name : p2Name;
      const currentShell = chamber[0];

      switch (itemKey) {
        case "magnifier": {
          sound.playCrtBeep(1180);
          if (userSeat === 2 && mode === "solo") {
            aiMemoryRef.current.knownCurrent = currentShell;
            setCrtBanner("🔍 KRUPIYE 3D BÜYÜTEÇLE NAMLUYA BAKTI...");
            setCrtSubText("Krupiye sırıtarak namludaki fişeği gördü.");
          } else {
            const label =
              currentShell === "live"
                ? "🔴 DOLU FİŞEK (KIRMIZI)"
                : "🔵 BOŞ FİŞEK (MAVİ)";
            setSecretPeek({
              ownerSeat: userSeat,
              title: "🔍 BÜYÜTEÇ — NAMLU İÇİ",
              secretText: label,
              shellColor: currentShell,
            });
            setIsHoldingPeek(mode === "solo");
            setCrtBanner(`🔍 ${actorName.toUpperCase()} BÜYÜTEÇ KULLANDI`);
            setCrtSubText(
              mode === "duel"
                ? "Sadece kendi yarı ekranındaki gizli kutuyu elinle siper edip basılı tut!"
                : "Namludaki 3D fişeğin rengi tespit edildi."
            );
          }
          break;
        }

        case "handsaw": {
          sound.playHandSaw();
          setIsSawedOff(true);
          setCrtBanner(
            `🪚 ${actorName.toUpperCase()} 3D NAMLUYU KESTİ! (2x HASAR = 2⚡)`
          );
          setCrtSubText(
            "Ön namlu parçası masaya düştü! Bu atış DOLU çıkarsa 2⚡ hasar verir."
          );
          break;
        }

        case "handcuffs": {
          sound.playHandcuffs();
          if (userSeat === 1) {
            setP2Cuffed(true);
          } else {
            setP1Cuffed(true);
          }
          const victimName = userSeat === 1 ? p2Name : player1.name;
          setCrtBanner(
            `🔗 ${victimName.toUpperCase()} 3D KELEPÇELENDİ! (1 TUR PAS)`
          );
          setCrtSubText(`${victimName} sıradaki hamle hakkını kaybetti.`);
          break;
        }

        case "soda": {
          sound.playSodaEject();
          const ejected = chamber[0];
          const remaining = chamber.slice(1);
          engineRef.current?.triggerPumpEjectShell(ejected);
          setChamber(remaining);

          const shifted: Record<number, ShellType> = {};
          Object.entries(aiMemoryRef.current.knownFuture).forEach(([k, v]) => {
            const idx = Number(k);
            if (idx > 1) shifted[idx - 1] = v;
          });
          aiMemoryRef.current.knownCurrent = shifted[0] ?? null;
          aiMemoryRef.current.knownFuture = shifted;

          const colorText =
            ejected === "live" ? "KIRMIZI (DOLU)" : "MAVİ (BOŞ)";
          setCrtBanner(
            `🥫 TENEKE İÇECEK! MASAYA FIRLAYAN 3D FİŞEK: ${colorText}`
          );
          setCrtSubText("Fişek ateşlenmeden tahliye edildi; sıra sende kalıyor!");

          if (remaining.length === 0) {
            setIsAnimating(true);
            setTimeout(() => {
              startNewLoad(
                userSeat,
                currentRound,
                newP1Tray,
                newP2Tray,
                false
              );
            }, 950);
          }
          break;
        }

        case "sedative": {
          if (wiresCutSuddenDeath) {
            sound.playInvalid();
            setCrtBanner("⚠️ KESİK KABLO: 3D MONİTÖR ŞARJ KABUL ETMİYOR!");
            setCrtSubText("Kablolar koptuğu için iyileşme yapılamaz.");
          } else {
            sound.playDefibShock(true);
            if (userSeat === 1) {
              setP1Hp((h) => Math.min(maxHp, h + 1));
            } else {
              setP2Hp((h) => Math.min(maxHp, h + 1));
            }
            setCrtBanner(
              `🔋 ${actorName.toUpperCase()} +1⚡ YEŞİL LED ŞARJ YÜKLEDİ!`
            );
            setCrtSubText("3D Şarj Monitöründe +1 bar yandı.");
          }
          break;
        }

        case "inverter": {
          sound.playCrtBeep(620);
          const flipped: ShellType =
            currentShell === "live" ? "blank" : "live";
          const nextChamber = [flipped, ...chamber.slice(1)];
          setChamber(nextChamber);

          if (userSeat === 2 && mode === "solo") {
            aiMemoryRef.current.knownCurrent = flipped;
            aiMemoryRef.current.invertedCurrent = true;
          }
          setCrtBanner(
            `🔄 ${actorName.toUpperCase()} 3D DÖNÜŞTÜRÜCÜ ÇALIŞTIRDI!`
          );
          setCrtSubText(
            "Namludaki fişeğin kutbu gizlice tersine çevrildi (DOLU ↔ BOŞ)!"
          );
          break;
        }

        case "burnerPhone": {
          sound.playCrtBeep(1320);
          if (chamber.length <= 1) {
            const msg = "Ne yazık ki sinyal yok... Son fişek zaten namluda.";
            if (userSeat === 2 && mode === "solo") {
              setCrtBanner("📱 KRUPIYE GİZLİ TELEFONU DİNLEDİ");
              setCrtSubText(msg);
            } else {
              setSecretPeek({
                ownerSeat: userSeat,
                title: "📱 GİZLİ TELEFON MESAJI",
                secretText: msg,
              });
              setIsHoldingPeek(mode === "solo");
            }
          } else {
            const futureIdx =
              1 + Math.floor(Math.random() * (chamber.length - 1));
            const futureShell = chamber[futureIdx];
            const ordinal = futureIdx + 1;
            const colorWord =
              futureShell === "live" ? "🔴 KIRMIZI (DOLU)" : "🔵 MAVİ (BOŞ)";
            const msg = `Şarjördeki ${ordinal}. fişek... ${colorWord}!`;

            if (userSeat === 2 && mode === "solo") {
              aiMemoryRef.current.knownFuture[futureIdx] = futureShell;
              setCrtBanner("📱 KRUPIYE 3D GİZLİ TELEFONU DİNLEDİ...");
              setCrtSubText("Gelecekteki bir fişeğin sırasını öğrendi.");
            } else {
              setSecretPeek({
                ownerSeat: userSeat,
                title: "📱 GİZLİ TELEFON FISILTISI",
                secretText: msg,
                shellColor: futureShell,
              });
              setIsHoldingPeek(mode === "solo");
              setCrtBanner(
                `📱 ${actorName.toUpperCase()} GİZLİ TELEFONU KULAĞINA GÖTÜRDÜ`
              );
              setCrtSubText(
                mode === "duel"
                  ? "Mesajı okumak için kendi ekranındaki gizli kutuya basılı tut!"
                  : "Telefondan gelen şifreli sinyal çözüldü."
              );
            }
          }
          break;
        }

        case "adrenaline": {
          sound.playHeartbeat();
          setAdrenalineStealSeat(userSeat);
          setAdrenalineSecondsLeft(10);
          setCrtBanner(
            `💉 ADRENALİN AKTİF! 10 SN İÇİNDE RAKİBİN 1 EŞYASINA DOKUN VE ÇAL!`
          );
          setCrtSubText(
            "Masanın karşı tarafındaki 3D eşyalardan birine dokunarak anında kullan!"
          );
          break;
        }

        case "expiredMed": {
          if (wiresCutSuddenDeath) {
            sound.playInvalid();
            setCrtBanner("⚠️ KESİK KABLO: BOZUK İLAÇ ETKİSİZ KALDI!");
            break;
          }
          const lucky = Math.random() < 0.5;
          if (lucky) {
            sound.playDefibShock(true);
            if (userSeat === 1) {
              setP1Hp((h) => Math.min(maxHp, h + 2));
            } else {
              setP2Hp((h) => Math.min(maxHp, h + 2));
            }
            setCrtBanner(
              `💊 ŞANSLI İLAÇ! ${actorName.toUpperCase()} +2⚡ ŞARJ KAZANDI!`
            );
          } else {
            sound.playDefibShock(false);
            setHitScreenEffect(userSeat);
            setTimeout(() => setHitScreenEffect(null), 500);

            const nextHp1 = userSeat === 1 ? Math.max(0, p1Hp - 1) : p1Hp;
            const nextHp2 = userSeat === 2 ? Math.max(0, p2Hp - 1) : p2Hp;
            setP1Hp(nextHp1);
            setP2Hp(nextHp2);

            setCrtBanner(
              `☠️ ZEHİRLİ İLAÇ! ${actorName.toUpperCase()} -1⚡ ŞARJ KAYBETTİ!`
            );

            if (nextHp1 <= 0) {
              setTimeout(() => handlePlayerZeroHp(1, nextHp1, nextHp2), 750);
            } else if (nextHp2 <= 0) {
              setTimeout(() => handlePlayerZeroHp(2, nextHp1, nextHp2), 750);
            }
          }
          break;
        }
      }
    },
    [
      player1.name,
      p2Name,
      chamber,
      mode,
      startNewLoad,
      currentRound,
      wiresCutSuddenDeath,
      maxHp,
      p1Hp,
      p2Hp,
      handlePlayerZeroHp,
    ]
  );

  // 3D Eşya Yuvası Kullanımı
  const handleUseTrayItem = useCallback(
    (trayOwner: 1 | 2, slotIdx: number) => {
      if (isAnimating || matchOver || chamber.length === 0) return;

      const tray = trayOwner === 1 ? p1Items : p2Items;
      const itemKey = tray[slotIdx];
      if (!itemKey) return;

      // Adrenalin hırsızlığı aktifse:
      if (adrenalineStealSeat !== null) {
        if (trayOwner === adrenalineStealSeat) {
          sound.playInvalid();
          setCrtSubText(
            "Adrenalin etkinken KARŞI TARAFTAKİ rakip eşyalardan birine dokunmalısın!"
          );
          return;
        }
        if (itemKey === "adrenaline") {
          sound.playInvalid();
          setCrtSubText("Adrenalin ile başka bir Adrenalin çalınamaz!");
          return;
        }
        if (itemKey === "handsaw" && isSawedOff) {
          sound.playInvalid();
          setCrtSubText("Namlu zaten kesik!");
          return;
        }
        if (
          itemKey === "handcuffs" &&
          ((adrenalineStealSeat === 1 && (p2Cuffed || p2CuffCooldown)) ||
            (adrenalineStealSeat === 2 && (p1Cuffed || p1CuffCooldown)))
        ) {
          sound.playInvalid();
          setCrtSubText("Rakip zaten kelepçeli veya yeni kurtuldu!");
          return;
        }

        const nextP1 = [...p1Items];
        const nextP2 = [...p2Items];
        if (trayOwner === 1) nextP1[slotIdx] = null;
        else nextP2[slotIdx] = null;

        setP1Items(nextP1);
        setP2Items(nextP2);
        setAdrenalineStealSeat(null);
        executeItemEffect(
          adrenalineStealSeat,
          itemKey,
          slotIdx,
          nextP1,
          nextP2
        );
        return;
      }

      if (trayOwner !== turn) {
        sound.playInvalid();
        return;
      }

      if (itemKey === "handsaw" && isSawedOff) {
        sound.playInvalid();
        setCrtSubText("Namlu zaten kesik!");
        return;
      }

      if (
        itemKey === "handcuffs" &&
        ((turn === 1 && (p2Cuffed || p2CuffCooldown)) ||
          (turn === 2 && (p1Cuffed || p1CuffCooldown)))
      ) {
        sound.playInvalid();
        setCrtSubText("Rakip zaten kelepçeli veya yeni kurtuldu!");
        return;
      }

      if (itemKey === "adrenaline") {
        const oppTray = turn === 1 ? p2Items : p1Items;
        const stealable = oppTray.some((k) => k !== null && k !== "adrenaline");
        if (!stealable) {
          sound.playInvalid();
          setCrtSubText("Rakibin masasında çalınabilecek uygun eşya yok!");
          return;
        }
      }

      const nextP1 = [...p1Items];
      const nextP2 = [...p2Items];
      if (turn === 1) nextP1[slotIdx] = null;
      else nextP2[slotIdx] = null;

      setP1Items(nextP1);
      setP2Items(nextP2);
      executeItemEffect(turn, itemKey, slotIdx, nextP1, nextP2);
    },
    [
      isAnimating,
      matchOver,
      chamber.length,
      p1Items,
      p2Items,
      adrenalineStealSeat,
      isSawedOff,
      p2Cuffed,
      p2CuffCooldown,
      p1Cuffed,
      p1CuffCooldown,
      turn,
      executeItemEffect,
    ]
  );

  // 3D KANVAS ÜZERİNDE BÖLÜNMÜŞ EKRAN (DUAL-VIEWPORT) RAYCAST DOKUNMA ALGILAMA
  const handleCanvasPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (isAnimating || matchOver || chamber.length === 0) return;
      if (mode === "solo" && turn === 2) return;

      const hit = engineRef.current?.raycastFromPointer(e.clientX, e.clientY);
      if (!hit) return;

      // 2 Kişilik Düelloda sadece sırası gelen oyuncunun yarı ekranı dokunmaları kabul eder!
      if (mode === "duel" && hit.viewportSeat !== turn) {
        sound.playInvalid();
        return;
      }

      if (hit.hitType === "shotgun") {
        sound.playPickup();
        setGunPickedUpBy((prev) => (prev === turn ? null : turn));
        return;
      }

      if (
        hit.hitType === "item" &&
        hit.trayOwner !== undefined &&
        hit.slotIndex !== undefined
      ) {
        handleUseTrayItem(hit.trayOwner, hit.slotIndex);
      }
    },
    [isAnimating, matchOver, chamber.length, mode, turn, handleUseTrayItem]
  );

  // AKILLI 3D KRUPIYE (DEALER) YAPAY ZEKA MOTORU
  useEffect(() => {
    if (
      mode !== "solo" ||
      turn !== 2 ||
      isAnimating ||
      matchOver ||
      chamber.length === 0
    ) {
      return;
    }

    const aiTimer = setTimeout(() => {
      const liveLeft = chamber.filter((s) => s === "live").length;
      const blankLeft = chamber.length - liveLeft;
      const liveProb = liveLeft / chamber.length;

      if (liveLeft === 0) aiMemoryRef.current.knownCurrent = "blank";
      if (blankLeft === 0) aiMemoryRef.current.knownCurrent = "live";

      const known = aiMemoryRef.current.knownCurrent;

      if (adrenalineStealSeat === 2) {
        const priority: BuckshotItemKey[] = [
          "handsaw",
          "magnifier",
          "handcuffs",
          "sedative",
          "inverter",
          "soda",
          "burnerPhone",
          "expiredMed",
        ];
        for (const pKey of priority) {
          const idx = p1Items.indexOf(pKey);
          if (idx !== -1) {
            if (pKey === "handsaw" && isSawedOff) continue;
            if (pKey === "handcuffs" && (p1Cuffed || p1CuffCooldown)) continue;
            handleUseTrayItem(1, idx);
            return;
          }
        }
        setAdrenalineStealSeat(null);
        return;
      }

      if (!wiresCutSuddenDeath && p2Hp < maxHp) {
        const sedIdx = p2Items.indexOf("sedative");
        if (sedIdx !== -1) {
          handleUseTrayItem(2, sedIdx);
          return;
        }
        if (p2Hp <= maxHp - 2) {
          const medIdx = p2Items.indexOf("expiredMed");
          if (medIdx !== -1) {
            handleUseTrayItem(2, medIdx);
            return;
          }
        }
      }

      if (known === null && chamber.length > 1) {
        const magIdx = p2Items.indexOf("magnifier");
        if (magIdx !== -1) {
          handleUseTrayItem(2, magIdx);
          return;
        }
        const phoneIdx = p2Items.indexOf("burnerPhone");
        if (phoneIdx !== -1) {
          handleUseTrayItem(2, phoneIdx);
          return;
        }
      }

      const adrIdx = p2Items.indexOf("adrenaline");
      if (
        adrIdx !== -1 &&
        p1Items.some(
          (k) =>
            k !== null &&
            k !== "adrenaline" &&
            !(k === "handsaw" && isSawedOff) &&
            !(k === "handcuffs" && (p1Cuffed || p1CuffCooldown))
        )
      ) {
        handleUseTrayItem(2, adrIdx);
        return;
      }

      if (known === "blank") {
        const invIdx = p2Items.indexOf("inverter");
        if (invIdx !== -1) {
          handleUseTrayItem(2, invIdx);
          return;
        }
      }

      if (known === "live" || (known === null && liveProb >= 0.6)) {
        if (!p1Cuffed && !p1CuffCooldown && chamber.length >= 2) {
          const cuffIdx = p2Items.indexOf("handcuffs");
          if (cuffIdx !== -1) {
            handleUseTrayItem(2, cuffIdx);
            return;
          }
        }
        if (!isSawedOff) {
          const sawIdx = p2Items.indexOf("handsaw");
          if (sawIdx !== -1) {
            handleUseTrayItem(2, sawIdx);
            return;
          }
        }
      }

      if (known === "blank") {
        handleFireShotgun(2);
      } else if (known === "live") {
        handleFireShotgun(1);
      } else if (liveProb >= 0.5) {
        handleFireShotgun(1);
      } else {
        handleFireShotgun(2);
      }
    }, 1050);

    return () => clearTimeout(aiTimer);
  }, [
    mode,
    turn,
    isAnimating,
    matchOver,
    chamber,
    adrenalineStealSeat,
    p1Items,
    p2Items,
    isSawedOff,
    p1Cuffed,
    p1CuffCooldown,
    wiresCutSuddenDeath,
    p2Hp,
    maxHp,
    handleUseTrayItem,
    handleFireShotgun,
  ]);

  const liveRemaining = chamber.filter((c) => c === "live").length;
  const blankRemaining = chamber.length - liveRemaining;

  // Her bir yarı ekran (veya tek ekran) için HUD ve Kontrolleri çizen yardımcı fonksiyon
  const renderViewportHUD = (seat: 1 | 2) => {
    const isP1 = seat === 1;
    const myPlayerName = isP1 ? player1.name : p2Name;
    const myAvatar = isP1 ? player1.avatar : p2Avatar;
    const oppName = isP1 ? p2Name : player1.name;
    const myHp = isP1 ? p1Hp : p2Hp;
    const myWins = isP1 ? p1RoundsWon : p2RoundsWon;
    const myCuffed = isP1 ? p1Cuffed : p2Cuffed;
    const myItems = isP1 ? p1Items : p2Items;
    const oppItems = isP1 ? p2Items : p1Items;
    const isMyTurn = turn === seat;
    const isStealingFromOpp = adrenalineStealSeat === seat;

    return (
      <div
        className={`relative flex h-full w-full flex-col justify-between p-2.5 sm:p-3.5 pointer-events-none transition-all duration-300 ${
          mode === "duel"
            ? isMyTurn
              ? "ring-2 ring-inset ring-amber-400/75 shadow-[inset_0_0_45px_rgba(245,158,11,0.18)]"
              : "opacity-80"
            : ""
        }`}
      >
        {/* Vurulan Oyuncunun Yarı Ekranında Kan Kırmızısı Elektroşok Kararması */}
        <AnimatePresence>
          {hitScreenEffect === seat && (
            <motion.div
              initial={{ opacity: 0.92 }}
              animate={{ opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.85 }}
              className="absolute inset-0 z-30 bg-gradient-to-b from-red-700/80 via-black/70 to-red-950/90"
            />
          )}
        </AnimatePresence>

        {/* ÜST HUD: Oyuncu Kimliği, 3D Şarj Barları ve Sıra Rozeti */}
        <div className="relative z-20 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-stone-700/80 bg-black/75 px-3 py-2 backdrop-blur-sm pointer-events-auto">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-amber-500/40 bg-stone-900 text-lg">
              {myAvatar}
            </span>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs sm:text-sm font-black text-white">
                  {myPlayerName}
                </span>
                <span className="rounded bg-stone-800 px-1.5 py-0.5 text-[9px] font-bold text-amber-300">
                  {mode === "duel"
                    ? `${seat}. OYUNCU KAMERASI`
                    : `RAUNT ${currentRound}`}
                </span>
                {myCuffed && (
                  <span className="rounded bg-rose-600/40 border border-rose-400 px-1.5 py-0.5 text-[9px] font-black text-rose-200">
                    🔗 KELEPÇELİ
                  </span>
                )}
              </div>
              <div className="mt-0.5 flex items-center gap-1">
                {Array.from({ length: maxHp }).map((_, i) => (
                  <span
                    key={i}
                    className={`px-1.5 py-0.2 rounded text-[10px] font-black border ${
                      i < myHp
                        ? wiresCutSuddenDeath
                          ? "border-red-400 bg-red-500/40 text-red-200"
                          : "border-emerald-400 bg-emerald-500/35 text-emerald-200"
                        : "border-stone-800 bg-stone-950 text-stone-700"
                    }`}
                  >
                    ⚡
                  </span>
                ))}
                {seriesMode === "series3" && (
                  <span className="ml-1.5 text-[10px] font-black text-amber-300">
                    Zafer: {myWins}/2
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end">
            <span
              className={`rounded-full px-2.5 py-0.5 text-[10px] font-black border ${
                isMyTurn
                  ? "border-emerald-400 bg-emerald-500/25 text-emerald-200 animate-pulse"
                  : "border-stone-700 bg-stone-900 text-stone-400"
              }`}
            >
              {isMyTurn ? "🔥 SIRA SENDE" : "⏳ RAKİP OYNUYOR"}
            </span>
            <span className="mt-1 text-[10px] font-mono font-bold text-stone-300">
              Namluda: <strong className="text-red-400">🔴{liveRemaining}</strong>{" "}
              <strong className="text-sky-300">🔵{blankRemaining}</strong>
            </span>
          </div>
        </div>

        {/* ORTA BÖLGE: 3D Pompalı Hedef Seçimi ([KENDİNE DOĞRULT] / [RAKİBE DOĞRULT]) & Adrenalin Hırsızlık Paneli */}
        <div className="relative z-20 flex flex-col items-center justify-center gap-2 my-auto">
          {/* Sıra Bekleyen Oyuncu İçin Dokunma Kilidi Uyarısı (Sadece 2P Düelloda) */}
          {mode === "duel" && !isMyTurn && !revealPreview && (
            <div className="rounded-2xl border border-stone-700/80 bg-black/70 px-4 py-2 text-center backdrop-blur-sm">
              <div className="flex items-center justify-center gap-1.5 text-xs font-black text-stone-300">
                <Lock className="h-3.5 w-3.5 text-amber-400" />
                <span>KARŞIDAKİ RAKİBİN HAMLESİNİ İZLE</span>
              </div>
              <p className="text-[10px] text-stone-400 mt-0.5">
                Tüfek namlusunun kime doğrulduğuna dikkat et!
              </p>
            </div>
          )}

          {/* Adrenalin ile Karşı Masadan Eşya Çalma Seçici */}
          {isMyTurn && isStealingFromOpp && !isAnimating && (
            <div className="pointer-events-auto w-full max-w-md rounded-2xl border-2 border-rose-500 bg-black/90 p-3 text-center shadow-[0_0_30px_rgba(244,63,94,0.45)]">
              <div className="text-xs font-black text-rose-300 animate-pulse">
                💉 ADRENALİN ({adrenalineSecondsLeft}s): ÇALMAK İSTEDİĞİN RAKİP 3D EŞYAYI SEÇ!
              </div>
              <div className="mt-2 grid grid-cols-4 gap-1.5">
                {oppItems.map((itKey, idx) => {
                  if (!itKey || itKey === "adrenaline") return null;
                  const meta = BUCKSHOT_ITEMS[itKey];
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleUseTrayItem(isP1 ? 2 : 1, idx)}
                      className="min-h-[46px] flex flex-col items-center justify-center rounded-xl border border-rose-400/60 bg-rose-950/60 p-1 text-white hover:bg-rose-800 cursor-pointer"
                    >
                      <span className="text-base">{meta.icon}</span>
                      <span className="text-[9px] font-black">
                        {meta.shortName}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 3D Pompalı Tüfek Doğrultma ve Ateşleme Butonları */}
          {isMyTurn &&
            !isAnimating &&
            chamber.length > 0 &&
            !(mode === "solo" && seat === 2) && (
              <div className="pointer-events-auto flex flex-col items-center gap-2">
                {isSawedOff && (
                  <div className="rounded-full border border-red-400 bg-red-600/35 px-3 py-0.5 text-[10px] font-black text-red-100 shadow-lg">
                    🪚 KESİK NAMLU AKTİF: BU ATIŞ 2x HASAR (2⚡) VURUR!
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-center gap-2">
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.94 }}
                    onClick={() => handleFireShotgun(seat)}
                    className="min-h-[50px] flex items-center gap-2 rounded-2xl border-2 border-sky-400/80 bg-sky-950/85 px-4 py-2 text-xs font-black text-sky-100 shadow-[0_0_24px_rgba(56,189,248,0.35)] hover:bg-sky-900 cursor-pointer"
                  >
                    <User className="h-4 w-4 text-sky-300" />
                    <span>[KENDİNE DOĞRULT & SIK]</span>
                  </motion.button>

                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.94 }}
                    onClick={() => handleFireShotgun(isP1 ? 2 : 1)}
                    className="min-h-[50px] flex items-center gap-2 rounded-2xl border-2 border-red-500/85 bg-red-950/90 px-4 py-2 text-xs font-black text-red-100 shadow-[0_0_26px_rgba(239,68,68,0.45)] hover:bg-red-900 cursor-pointer"
                  >
                    <Crosshair className="h-4 w-4 text-red-300" />
                    <span>
                      [{oppName.split(" ")[0].toUpperCase()} YÜZÜNE DOĞRULT & SIK]
                    </span>
                  </motion.button>
                </div>
              </div>
            )}
        </div>

        {/* ALT KÖŞE: SADECE AKTİF OYUNCUNUN KENDİ YARI EKRANINDA AÇILAN "AVUÇ İÇİ GİZLİ BAKIŞ" KUTUSU + 8'Lİ 3D EŞYA BARI */}
        <div className="relative z-20 flex flex-col gap-2 pointer-events-auto">
          {/* Avuç İçi Gizli Bakış Kutusu (Sadece bu yarı ekranın sahibine aitse görünür!) */}
          <AnimatePresence>
            {secretPeek && secretPeek.ownerSeat === seat && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.92 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.92 }}
                className="mx-auto flex flex-col items-center rounded-2xl border-2 border-cyan-400/80 bg-slate-950/95 p-2 shadow-[0_0_30px_rgba(34,211,238,0.45)]"
              >
                <div className="flex w-full items-center justify-between gap-3 text-[10px] font-black text-cyan-300 mb-1">
                  <span>{secretPeek.title}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSecretPeek(null);
                      setIsHoldingPeek(false);
                    }}
                    className="rounded bg-white/15 px-2 py-0.5 text-[10px] text-white hover:bg-white/25 cursor-pointer"
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
                  className="flex h-[84px] w-[195px] flex-col items-center justify-center rounded-xl border border-cyan-400/60 bg-[#04070b] px-2.5 text-center select-none cursor-pointer"
                >
                  {isHoldingPeek ? (
                    <div>
                      <div
                        className={`text-xs font-black ${
                          secretPeek.shellColor === "live"
                            ? "text-red-400"
                            : secretPeek.shellColor === "blank"
                            ? "text-sky-300"
                            : "text-amber-300"
                        }`}
                      >
                        {secretPeek.secretText}
                      </div>
                      <div className="mt-1 text-[9px] text-slate-400">
                        {mode === "duel"
                          ? "Parmağını çekince anında gizlenir"
                          : "Gizli istihbarat"}
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1 text-cyan-200">
                      <Eye className="h-4 w-4 text-cyan-400 animate-pulse" />
                      <span className="text-[10px] font-black leading-tight">
                        ELİNLE SİPER ET & GÖRMEK İÇİN BASILI TUT
                      </span>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Masadaki 8'li 3D Eşya Yuvalarıyla Senkronize Dokunmatik Bar */}
          <div className="rounded-2xl border border-stone-700/85 bg-black/80 p-1.5 backdrop-blur-md">
            <div className="mb-1 flex items-center justify-between px-1.5 text-[10px] font-bold text-stone-400">
              <span className="flex items-center gap-1">
                <Hand className="h-3 w-3 text-amber-400" />
                Masadaki 3D Eşyaya veya Aşağıdaki Yuvaya Dokun:
              </span>
              <span className="text-amber-300 font-black">
                {myItems.filter(Boolean).length}/8 Eşya
              </span>
            </div>

            <div className="grid grid-cols-4 sm:grid-cols-8 gap-1">
              {Array.from({ length: 8 }).map((_, slotIdx) => {
                const itemKey = myItems[slotIdx];
                const meta = itemKey ? BUCKSHOT_ITEMS[itemKey] : null;
                const canUse =
                  Boolean(meta) &&
                  !isAnimating &&
                  isMyTurn &&
                  adrenalineStealSeat === null &&
                  !(mode === "solo" && seat === 2);

                return (
                  <button
                    key={slotIdx}
                    type="button"
                    disabled={!canUse}
                    onClick={() => handleUseTrayItem(seat, slotIdx)}
                    title={meta ? `${meta.name}: ${meta.desc}` : "Boş 3D Yuva"}
                    className={`min-h-[48px] flex flex-col items-center justify-center rounded-xl border p-1 text-center transition ${
                      meta
                        ? `${meta.accentClass} ${
                            canUse
                              ? "cursor-pointer hover:brightness-125 ring-1 ring-white/20"
                              : "opacity-65 cursor-default"
                          }`
                        : "border-stone-800/80 bg-stone-950/60 text-stone-700 cursor-default"
                    }`}
                  >
                    {meta ? (
                      <>
                        <span className="text-base leading-none">
                          {meta.icon}
                        </span>
                        <span className="mt-0.5 text-[8px] font-black leading-tight truncate max-w-full">
                          {meta.shortName}
                        </span>
                      </>
                    ) : (
                      <span className="text-[9px] font-mono opacity-40">
                        #{slotIdx + 1}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="relative flex h-full w-full max-w-6xl flex-col justify-between overflow-hidden rounded-3xl border-2 border-stone-700/90 bg-[#090706] shadow-[0_0_90px_rgba(0,0,0,0.98)] select-none">
      {/* ÜST KONTROL ÇUBUĞU: Lobiye Dön, Maç Formatı, Canlı CRT Anons Bandı */}
      <div className="relative z-30 flex flex-wrap items-center justify-between gap-2 border-b border-stone-800 bg-stone-950/95 px-3 py-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBackToHub}
            className="min-h-[42px] inline-flex items-center gap-1.5 rounded-xl border border-stone-700 bg-stone-900 px-3 py-1.5 text-xs font-black text-stone-200 hover:border-amber-500/60 hover:text-white transition cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4 text-amber-400" /> Lobi
          </button>

          <button
            type="button"
            onClick={onRequestNewGameWithGate}
            className="min-h-[42px] inline-flex items-center gap-1.5 rounded-xl border border-stone-700 bg-stone-900 px-2.5 py-1.5 text-xs font-extrabold text-amber-300 hover:border-amber-400 transition cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Yeni Maç
          </button>
        </div>

        {/* Canlı CRT Durum Anonsu */}
        <div className="flex-1 min-w-[200px] rounded-xl border border-amber-500/35 bg-black/90 px-3 py-1.5 text-center font-mono">
          <div className="truncate text-[11px] font-black text-amber-300">
            &gt; {crtBanner}
          </div>
          <div className="truncate text-[10px] text-stone-400">
            {crtSubText}
          </div>
        </div>

        {/* 3 Rauntluk Seri vs Hızlı Tek Raunt Seçici */}
        <div className="flex items-center gap-1 rounded-xl border border-stone-700 bg-stone-900 p-1">
          <button
            type="button"
            disabled={isAnimating}
            onClick={() => {
              if (seriesMode === "series3") return;
              sound.playClick();
              setSeriesMode("series3");
              setP1RoundsWon(0);
              setP2RoundsWon(0);
              initRound(1, "series3", 1);
            }}
            className={`min-h-[34px] rounded-lg px-2 py-1 text-[10px] font-black transition cursor-pointer ${
              seriesMode === "series3"
                ? "bg-amber-500 text-stone-950"
                : "text-stone-400 hover:text-stone-200"
            }`}
          >
            3 Raunt Seri
          </button>
          <button
            type="button"
            disabled={isAnimating}
            onClick={() => {
              if (seriesMode === "fast1") return;
              sound.playClick();
              setSeriesMode("fast1");
              setP1RoundsWon(0);
              setP2RoundsWon(0);
              initRound(1, "fast1", 1);
            }}
            className={`min-h-[34px] rounded-lg px-2 py-1 text-[10px] font-black transition cursor-pointer ${
              seriesMode === "fast1"
                ? "bg-red-600 text-white"
                : "text-stone-400 hover:text-stone-200"
            }`}
          >
            Tek Raunt (5⚡)
          </button>
        </div>
      </div>

      {/* ANA 3D SAHNE & BÖLÜNMÜŞ ÇİFT EKRAN (DUAL-POV SPLIT-SCREEN) */}
      <div className="relative flex-1 w-full min-h-0 overflow-hidden">
        {/* Three.js Dinamik Kanvas Konteyneri (StrictMode ve ContextLost Korumalı) */}
        <div
          ref={containerRef}
          onPointerDown={handleCanvasPointerDown}
          className="w-full h-full relative cursor-crosshair"
        />

        {/* WebGL Başlatma Hatası / Yeniden Dene Ekranı */}
        {webglError && (
          <div className="  absolute inset-0 z-50 flex flex-col items-center justify-center bg-stone-950/95 p-6 text-center backdrop-blur-md">
            <div className="max-w-md rounded-3xl border-2 border-amber-500/60 bg-stone-900/95 p-6 shadow-[0_0_50px_rgba(245,158,11,0.3)]">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-400/40 bg-amber-500/20 text-3xl">
                ⚠️
              </div>
              <h3 className="text-lg font-black text-amber-300">
                3D WebGL Sahnesi Yenileniyor
              </h3>
              <p className="mt-1.5 text-xs text-stone-300">{webglError}</p>
              <div className="mt-5 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setRetryKey((k) => k + 1)}
                  className="min-h-[52px] rounded-2xl bg-gradient-to-r from-amber-500 to-red-600 px-5 py-2.5 text-xs font-black text-white shadow-lg hover:brightness-110 transition cursor-pointer"
                >
                  🔄 3D Sahneyi Yeniden Başlat
                </button>
                <button
                  type="button"
                  onClick={onBackToHub}
                  className="min-h-[52px] rounded-2xl border border-stone-700 bg-stone-800 px-4 py-2.5 text-xs font-bold text-stone-300 hover:text-white transition cursor-pointer"
                >
                  Lobiye Dön
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Retro PS1 Dither & CRT Scanline + Karanlık Köşe Karartması (Vignette) Katmanı */}
        <div
          className="pointer-events-none absolute inset-0 z-10"
          style={{
            backgroundImage:
              "radial-gradient(circle at 50% 50%, transparent 52%, rgba(0,0,0,0.72) 100%), repeating-linear-gradient(0deg, rgba(0,0,0,0.18) 0px, rgba(0,0,0,0.18) 1px, transparent 1px, transparent 3px)",
          }}
        />

        {/* 2 Kişilik Düelloda Ekranı Tam Ortadan İkiye Bölen Dikey Endüstriyel Metal Bariyer */}
        {mode === "duel" && (
          <div className="pointer-events-none absolute inset-y-0 left-1/2 z-30 w-2 -translate-x-1/2 bg-gradient-to-b from-stone-700 via-amber-600/80 to-stone-700 shadow-[0_0_20px_rgba(0,0,0,0.95)]" />
        )}

        {/* HUD Katmanı: Solo Modda Tam Ekran, 2P Düelloda %50 Sol (Oyuncu 1) + %50 Sağ (Oyuncu 2) */}
        {mode === "solo" ? (
          <div className="pointer-events-none absolute inset-0 z-20 h-full w-full">
            {renderViewportHUD(1)}
          </div>
        ) : (
          <div className="pointer-events-none absolute inset-0 z-20 grid h-full w-full grid-cols-2">
            {/* SOL YARI EKRAN (%50): 1. OYUNCU GÖZÜ (+Z Kamerası) */}
            <div className="h-full w-full overflow-hidden">
              {renderViewportHUD(1)}
            </div>
            {/* SAĞ YARI EKRAN (%50): 2. OYUNCU GÖZÜ (-Z Kamerası) */}
            <div className="h-full w-full overflow-hidden">
              {renderViewportHUD(2)}
            </div>
          </div>
        )}

        {/* Şarjör Başlangıcında 3D Mermi Dizilimi Yakın Çekim Bilgi Bandı */}
        <AnimatePresence>
          {revealPreview && (
            <motion.div
              initial={{ opacity: 0, y: -15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="pointer-events-none absolute top-16 left-1/2 z-40 -translate-x-1/2 rounded-2xl border-2 border-amber-400/80 bg-black/90 px-5 py-2.5 text-center shadow-[0_0_40px_rgba(245,158,11,0.5)] backdrop-blur-md"
            >
              <div className="text-[10px] font-black uppercase tracking-widest text-amber-400">
                3D MERMİ TEPSİSİ YAKIN ÇEKİM — DİKKATLİ SAY!
              </div>
              <div className="mt-0.5 text-sm sm:text-base font-black text-white">
                <span className="text-red-400">
                  🔴 {revealPreview.live} DOLU (KIRMIZI)
                </span>{" "}
                •{" "}
                <span className="text-sky-300">
                  🔵 {revealPreview.blank} BOŞ (MAVİ)
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* MAÇ SONU ZAFER / YENİLGİ MODALI */}
      <AnimatePresence>
        {matchOver && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/88 p-4 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.9, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              className="w-full max-w-md rounded-3xl border-2 border-amber-500/60 bg-stone-950 p-6 text-center shadow-[0_0_60px_rgba(245,158,11,0.35)]"
            >
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/20 border border-amber-400/40 text-4xl">
                {matchOver.winner === 1 ? "👑" : mode === "duel" ? "🔥" : "💀"}
              </div>

              <h2 className="mt-3 text-xl font-black text-white">
                {matchOver.winner === 1
                  ? `${player1.name} Hayatta Kaldı!`
                  : `${p2Name} Masayı Kazandı!`}
              </h2>
              <p className="mt-1 text-xs text-stone-300">
                {matchOver.summaryText}
              </p>

              {matchOver.isNewBest && (
                <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-amber-400/20 border border-amber-400/50 px-3 py-1 text-xs font-black text-amber-300">
                  <Sparkles className="h-3.5 w-3.5" /> YENİ KİŞİSEL REKOR!
                </div>
              )}

              <div className="mt-4 grid grid-cols-2 gap-2.5 rounded-2xl border border-stone-800 bg-stone-900/90 p-3 text-left">
                <div>
                  <div className="text-[11px] text-stone-400">
                    {player1.avatar} {player1.name}
                  </div>
                  <div className="text-base font-black text-emerald-400 tabular-nums">
                    {matchOver.p1Score.toLocaleString("tr-TR")} P
                  </div>
                </div>
                {mode === "duel" && player2 ? (
                  <div>
                    <div className="text-[11px] text-stone-400">
                      {player2.avatar} {player2.name}
                    </div>
                    <div className="text-base font-black text-amber-400 tabular-nums">
                      {matchOver.p2Score.toLocaleString("tr-TR")} P
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="text-[11px] text-stone-400">
                      👹 3D Krupiye (Dealer)
                    </div>
                    <div className="text-xs font-bold text-stone-300">
                      {matchOver.winner === 1 ? "Devre Dışı" : "Kazandı"}
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-5 flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={onRequestNewGameWithGate}
                  className="min-h-[52px] flex-1 rounded-2xl bg-gradient-to-r from-amber-500 to-red-600 py-3 text-xs sm:text-sm font-black text-white shadow-lg hover:brightness-110 transition cursor-pointer"
                >
                  🔄 Yeni 3D Düello (Profil Seç)
                </button>
                <button
                  type="button"
                  onClick={onBackToHub}
                  className="min-h-[52px] rounded-2xl border border-stone-700 bg-stone-900 px-4 py-3 text-xs font-extrabold text-stone-300 hover:text-white transition cursor-pointer"
                >
                  Lobi
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
