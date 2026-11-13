"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import {
  ArrowLeft,
  RotateCcw,
  ShieldAlert,
  Zap,
  Eye,
  Skull,
  Sparkles,
  Crosshair,
  User,
  Lock,
} from "lucide-react";
import {
  clampGameScore,
  recordDuelGameResult,
  recordSoloGameResult,
  type PlayerDoc,
} from "@/lib/firestore";
import { sound } from "@/lib/sound";

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
    accentClass: "border-cyan-400/50 bg-cyan-500/15 text-cyan-200",
  },
  handsaw: {
    key: "handsaw",
    name: "El Testeresi",
    shortName: "Testere",
    icon: "🪚",
    desc: "Namluyu keser! Bu atış DOLU çıkarsa 2x Hasar (2⚡) verir.",
    accentClass: "border-red-500/60 bg-red-500/20 text-red-200",
  },
  handcuffs: {
    key: "handcuffs",
    name: "Kelepçe",
    shortName: "Kelepçe",
    icon: "🔗",
    desc: "Rakibin bileklerini kelepçeler; rakip sıradaki 1 tam turunu pas geçer.",
    accentClass: "border-slate-300/50 bg-slate-400/15 text-slate-200",
  },
  soda: {
    key: "soda",
    name: "Teneke İçecek",
    shortName: "Teneke",
    icon: "🥫",
    desc: "Pompalıyı kurup namludaki fişeği ateşlemeden dışarı fırlatır; sıran sende kalır!",
    accentClass: "border-sky-400/50 bg-sky-500/15 text-sky-200",
  },
  sedative: {
    key: "sedative",
    name: "Şarj Tüpü (+1⚡)",
    shortName: "+1⚡ Tüp",
    icon: "🔋",
    desc: "+1⚡ defibrilatör şarjı yeniler (Kesik Kablo modunda çalışmaz).",
    accentClass: "border-emerald-400/50 bg-emerald-500/15 text-emerald-200",
  },
  inverter: {
    key: "inverter",
    name: "Dönüştürücü",
    shortName: "Inverter",
    icon: "🔄",
    desc: "Namludaki fişeğin kutbunu gizlice tersine çevirir (DOLU ↔ BOŞ)!",
    accentClass: "border-purple-400/50 bg-purple-500/15 text-purple-200",
  },
  burnerPhone: {
    key: "burnerPhone",
    name: "Gizli Telefon",
    shortName: "Telefon",
    icon: "📱",
    desc: "Şarjördeki gelecekteki rastgele bir fişeğin sırasını ve rengini fısıldar.",
    accentClass: "border-amber-400/50 bg-amber-500/15 text-amber-200",
  },
  adrenaline: {
    key: "adrenaline",
    name: "Adrenalin",
    shortName: "Adrenalin",
    icon: "💉",
    desc: "10 sn içinde rakibin tepsisinden 1 eşyayı çalıp anında kullanmanı sağlar!",
    accentClass: "border-rose-400/60 bg-rose-500/20 text-rose-200",
  },
  expiredMed: {
    key: "expiredMed",
    name: "Bozuk İlaç",
    shortName: "Bozuk İlaç",
    icon: "💊",
    desc: "%50 ihtimalle +2⚡ şarj verir, %50 ihtimalle zehirleyip -1⚡ götürür!",
    accentClass: "border-lime-400/50 bg-lime-500/15 text-lime-200",
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

interface EjectedShellRecord {
  id: number;
  type: ShellType;
  angle: number;
  offsetX: number;
  offsetY: number;
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
  const [loadingRackCount, setLoadingRackCount] = useState<number>(0);
  const [ejectedShells, setEjectedShells] = useState<EjectedShellRecord[]>([]);

  // Tüfek yönü ve namlu durumu
  const [gunAim, setGunAim] = useState<"neutral" | "p1" | "p2">("neutral");
  const [isSawedOff, setIsSawedOff] = useState<boolean>(false);
  const [muzzleFlash, setMuzzleFlash] = useState<"none" | "p1" | "p2">("none");
  const [screenFlash, setScreenFlash] = useState<"none" | "red" | "amber">(
    "none"
  );
  const [screenShakeKey, setScreenShakeKey] = useState<number>(0);

  // 8 Yuvalı Metal Eşya Tepsileri
  const [p1Items, setP1Items] = useState<BuckshotItemKey[]>([]);
  const [p2Items, setP2Items] = useState<BuckshotItemKey[]>([]);

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

  // Akıllı Tahta "Avuç İçi Gizli Bakış" (180x90px basılı tutarak görme kutusu)
  const [secretPeek, setSecretPeek] = useState<SecretPeekData | null>(null);
  const [isHoldingPeek, setIsHoldingPeek] = useState<boolean>(false);

  // CRT Anons ve Hikaye Günlüğü
  const [crtBanner, setCrtBanner] = useState<string>(
    "SİSTEM BAŞLATILIYOR... FİŞEKLER YÜKLENİYOR"
  );
  const [crtSubText, setCrtSubText] = useState<string>(
    "Dikkatli say, tetiği kime çekeceğine karar ver."
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

  const shellIdCounterRef = useRef<number>(1);
  const savedToFirestoreRef = useRef<boolean>(false);

  const p2Name =
    mode === "duel" && player2 ? player2.name : "KRUPIYE (DEALER)";
  const p2Avatar = mode === "duel" && player2 ? player2.avatar : "👹";

  // Yeni Şarjör + Eşya Dağıtımı Başlat
  const startNewLoad = useCallback(
    (
      nextTurn: 1 | 2,
      roundNum: number,
      currentP1Items: BuckshotItemKey[],
      currentP2Items: BuckshotItemKey[],
      isFirstLoadOfRound: boolean
    ) => {
      setIsAnimating(true);
      setGunAim("neutral");
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
        : 2 + Math.floor(Math.random() * 7); // 2..8
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

      // Her oyuncuya 2 ila 4 rastgele eşya dağıt (Maksimum 8 yuva)
      const itemCountToDeal =
        roundNum === 1 && isFirstLoadOfRound
          ? 2
          : 2 + Math.floor(Math.random() * 3); // 2..4

      const dealForTray = (existing: BuckshotItemKey[]): BuckshotItemKey[] => {
        const next = [...existing];
        for (let i = 0; i < itemCountToDeal; i++) {
          if (next.length >= 8) break;
          const pick =
            ALL_ITEM_KEYS[Math.floor(Math.random() * ALL_ITEM_KEYS.length)];
          next.push(pick);
        }
        return next;
      };

      const nextP1Tray = dealForTray(currentP1Items);
      const nextP2Tray = dealForTray(currentP2Items);
      setP1Items(nextP1Tray);
      setP2Items(nextP2Tray);

      setRevealPreview({
        live: liveCount,
        blank: blankCount,
        shells: orderedDisplay,
      });
      setCrtBanner(
        `YENİ ŞARJÖR: ${liveCount} DOLU (KIRMIZI) • ${blankCount} BOŞ (MAVİ)`
      );
      setCrtSubText(
        `Her iki tepsiye +${itemCountToDeal} taktiksel eşya bırakıldı (Maks 8 Yuva).`
      );
      sound.playCrtBeep(840);

      // 3.5 Saniye Mermi Dizilimi Şovu -> Fisher-Yates Karıştırma -> Tek Tek *ŞAK-ŞAK* Sürme
      const timer1 = setTimeout(() => {
        setRevealPreview(null);
        const shuffled = shuffleArrayFisherYates(orderedDisplay);
        setChamber(shuffled);
        setCrtBanner("FİŞEKLER KARIŞTIRILDI VE NAMLlUYA SÜRÜLÜYOR...");

        const rackSteps = Math.min(4, shuffled.length);
        for (let s = 0; s < rackSteps; s++) {
          setTimeout(() => {
            setLoadingRackCount(s + 1);
            sound.playShotgunRack();
          }, s * 240);
        }

        setTimeout(() => {
          setLoadingRackCount(0);
          setTurn(nextTurn);
          setIsAnimating(false);
          const activeName = nextTurn === 1 ? player1.name : p2Name;
          setCrtBanner(`SIRA SENDE: ${activeName.toUpperCase()}`);
          setCrtSubText(
            "Eşya kullanabilir veya tüfeği KENDİNE ya da RAKİBE doğrultup ateşleyebilirsin."
          );
        }, rackSteps * 240 + 260);
      }, 3500);

      return () => clearTimeout(timer1);
    },
    [player1.name, p2Name]
  );

  // Raunt Başlatıcı
  const initRound = useCallback(
    (roundNum: number, sMode: "series3" | "fast1", startSeat: 1 | 2 = 1) => {
      const roundHp =
        sMode === "fast1" ? 5 : roundNum === 1 ? 2 : roundNum === 2 ? 4 : 5;
      setCurrentRound(roundNum);
      setMaxHp(roundHp);
      setP1Hp(roundHp);
      setP2Hp(roundHp);
      setWiresCutSuddenDeath(false);
      setP1Items([]);
      setP2Items([]);
      setP1Cuffed(false);
      setP2Cuffed(false);
      setP1CuffCooldown(false);
      setP2CuffCooldown(false);
      setEjectedShells([]);
      setIsSawedOff(false);
      setGunAim("neutral");
      startNewLoad(startSeat, roundNum, [], [], true);
    },
    [startNewLoad]
  );

  // İlk açılış
  useEffect(() => {
    const cleanTimer = setTimeout(() => {
      initRound(1, seriesMode, 1);
    }, 60);
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
          ? `${winnerName}, Buckshot Roulette düellosunda namluyu kesip maçı aldı! (${(winnerSeat === 1
              ? cleanP1
              : cleanP2
            ).toLocaleString("tr-TR")} P)`
          : `${winnerName}, Buckshot Roulette masasında hayatta kalarak zafere ulaştı! (${(winnerSeat === 1
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
            modeLabel: isFast ? "Tek Raunt" : "3 Raunt Seri",
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

  // Raunt Bitişini Kontrol Et (Birinin şarjı 0⚡ olduğunda)
  const handlePlayerZeroHp = useCallback(
    (deadSeat: 1 | 2, latestP1Hp: number, latestP2Hp: number) => {
      const roundWinner: 1 | 2 = deadSeat === 1 ? 2 : 1;
      const nextP1Wins = roundWinner === 1 ? p1RoundsWon + 1 : p1RoundsWon;
      const nextP2Wins = roundWinner === 2 ? p2RoundsWon + 1 : p2RoundsWon;
      setP1RoundsWon(nextP1Wins);
      setP2RoundsWon(nextP2Wins);

      const winnerLabel = roundWinner === 1 ? player1.name : p2Name;

      // Hızlı Tek Raunt veya 3. Raunt bittiyse ya da biri 2 raunt aldıysa (veya 3. raunda ulaştıysa)
      if (seriesMode === "fast1" || currentRound >= 3) {
        const finalWinner: 1 | 2 =
          seriesMode === "fast1"
            ? roundWinner
            : nextP1Wins >= nextP2Wins
            ? 1
            : 2;
        setTimeout(() => {
          finalizeMatch(finalWinner, latestP1Hp, latestP2Hp);
        }, 900);
        return;
      }

      // Sonraki Raunda Geçiş
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
      latestP1Items: BuckshotItemKey[],
      latestP2Items: BuckshotItemKey[],
      cuffed1: boolean,
      cuffed2: boolean
    ) => {
      if (remainingChamber.length === 0) {
        // Şarjör bitti! Yeni yükleme başlat
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
        }, 750);
        return;
      }

      // Hedef oyuncu kelepçeliyse kelepçesi kırılır ve sıra mevcut oyuncuda kalır!
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

      // Normal sıra değişimi
      if (desiredNextSeat === 1) setP1CuffCooldown(false);
      if (desiredNextSeat === 2) setP2CuffCooldown(false);

      setTurn(desiredNextSeat);
      setIsAnimating(false);
      const nextName = desiredNextSeat === 1 ? player1.name : p2Name;
      setCrtBanner(`SIRA: ${nextName.toUpperCase()}`);
    },
    [currentRound, player1.name, p2Name, startNewLoad]
  );

  // Fişeği Masaya Fırlat (Görsel Kovan)
  const spawnEjectedShell = useCallback((type: ShellType) => {
    const id = shellIdCounterRef.current++;
    const angle = -35 + Math.random() * 70;
    const offsetX = -90 + Math.random() * 180;
    const offsetY = -28 + Math.random() * 56;
    setEjectedShells((prev) => [
      ...prev.slice(-7),
      { id, type, angle, offsetX, offsetY },
    ]);
  }, []);

  // ATEŞLEME MEKANİĞİ (KENDİNE VEYA RAKİBE SIK)
  const handleFireShotgun = useCallback(
    (targetSeat: 1 | 2) => {
      if (isAnimating || chamber.length === 0 || matchOver) return;
      setIsAnimating(true);
      setSecretPeek(null);
      setAdrenalineStealSeat(null);

      const shooterSeat = turn;
      const currentShell = chamber[0];
      const nextChamber = chamber.slice(1);
      const shotDamage = isSawedOff ? 2 : 1;

      // Krupiye hafızasını kaydır
      const shiftedFuture: Record<number, ShellType> = {};
      Object.entries(aiMemoryRef.current.knownFuture).forEach(([idxStr, val]) => {
        const idx = Number(idxStr);
        if (idx > 1) shiftedFuture[idx - 1] = val;
      });
      aiMemoryRef.current = {
        knownCurrent: shiftedFuture[0] ?? null,
        knownFuture: shiftedFuture,
        invertedCurrent: false,
      };

      // 1) Tüfeği Hedefe Doğrult
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
        `${shooterLabel.toUpperCase()} NAMLlUYU ${targetLabel.toUpperCase()} DOĞRULTTU...`
      );
      setCrtSubText("Nefesler tutuldu...");

      // 2) Gerilim Beklemesi (0.6sn)
      setTimeout(() => {
        if (currentShell === "live") {
          // === DOLU (KIRMIZI) PATLAMA ===
          sound.playShotgunBlast(isSawedOff);
          setTimeout(() => sound.playDefibShock(false), 180);
          setMuzzleFlash(targetSeat === 1 ? "p1" : "p2");
          setScreenFlash("red");
          setScreenShakeKey((k) => k + 1);
          spawnEjectedShell("live");

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

          // 3. Rauntta herhangi birinin canı 1⚡'e düşerse KESİK KABLO (Sudden Death) devreye girer!
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
              ? "⚠️ DİKKAT: DEFİBRİLATÖR KABLOLARI KESİLDİ! İYİLEŞME DEVRE DIŞI!"
              : `${
                  targetSeat === 1 ? player1.name : p2Name
                } sarsıldı! Pompalı kovanı tahliye etti.`
          );

          setTimeout(() => {
            setMuzzleFlash("none");
            setScreenFlash("none");
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

            // DOLU atıştan sonra sıra karşı tarafa geçer
            const nextSeat: 1 | 2 = shooterSeat === 1 ? 2 : 1;
            advanceTurnOrReload(
              nextSeat,
              nextChamber,
              p1Items,
              p2Items,
              p1Cuffed,
              p2Cuffed
            );
          }, 950);
        } else {
          // === BOŞ (MAVİ-GRİ) *KLİK!* ===
          sound.playDryClick();
          spawnEjectedShell("blank");
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
              ? `💨 *KLİK!* BOŞ FİŞEK! ${shooterLabel.toUpperCase()} KENDİNE SIKTI — SIRA DEVAM EDİYOR!`
              : `💨 *KLİK!* BOŞ FİŞEK! SIRA KARŞIYA GEÇİYOR.`
          );
          setCrtSubText(
            shotSelf
              ? "Cesur hamle ödüllendirildi: Ekstra hamle hakkı kazandın!"
              : "Mavi-gri boş fişek masaya fırlatıldı."
          );

          setTimeout(() => {
            setGunAim("neutral");
            setIsSawedOff(false);
            sound.playShotgunRack();

            // Kritik Kural: Kendine BOŞ sıkarsa sırası devam eder! Rakibe BOŞ sıkarsa sıra geçer.
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
          }, 780);
        }
      }, 620);
    },
    [
      isAnimating,
      chamber,
      matchOver,
      turn,
      isSawedOff,
      player1.name,
      p2Name,
      spawnEjectedShell,
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

  // EŞYA KULLANIM MEKANİĞİ (9 Orijinal Eşya + Adrenalin Hırsızlığı)
  const executeItemEffect = useCallback(
    (
      userSeat: 1 | 2,
      itemKey: BuckshotItemKey,
      newP1Tray: BuckshotItemKey[],
      newP2Tray: BuckshotItemKey[]
    ) => {
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
            // Krupiye AI büyüteç kullandı
            aiMemoryRef.current.knownCurrent = currentShell;
            setCrtBanner("🔍 KRUPIYE BÜYÜTEÇLE NAMLUYA BAKTI...");
            setCrtSubText("Krupiye gülümsüyor... Namludaki fişeği gördü.");
          } else {
            // İnsan oyuncu için Gizli Bakış Kutusu
            const label =
              currentShell === "live"
                ? "🔴 DOLU FİŞEK (KIRMIZI)"
                : "🔵 BOŞ FİŞEK (MAVİ-GRİ)";
            setSecretPeek({
              ownerSeat: userSeat,
              title: "🔍 BÜYÜTEÇ — NAMLlU İÇİ",
              secretText: label,
              shellColor: currentShell,
            });
            setIsHoldingPeek(mode === "solo");
            setCrtBanner(`🔍 ${actorName.toUpperCase()} BÜYÜTEÇ KULLANDI`);
            setCrtSubText(
              mode === "duel"
                ? "Rakibin görmemesi için gizli kutuya elinle kapatıp basılı tut!"
                : "Namludaki fişeğin rengi tespit edildi."
            );
          }
          break;
        }

        case "handsaw": {
          sound.playHandSaw();
          setIsSawedOff(true);
          setScreenShakeKey((k) => k + 1);
          setCrtBanner(
            `🪚 ${actorName.toUpperCase()} NAMLUYU KESTİ! (2x HASAR = 2⚡)`
          );
          setCrtSubText(
            "Bu atış DOLU çıkarsa hedef 2⚡ defibrilatör şarjı kaybedecek!"
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
            `🔗 ${victimName.toUpperCase()} KELEPÇELENDİ! (1 TUR PAS GEÇECEK)`
          );
          setCrtSubText(
            `${victimName} sıradaki hamle hakkını kaybetti.`
          );
          break;
        }

        case "soda": {
          sound.playSodaEject();
          const ejected = chamber[0];
          const remaining = chamber.slice(1);
          spawnEjectedShell(ejected);
          setChamber(remaining);

          // Krupiye hafızasını kaydır
          const shifted: Record<number, ShellType> = {};
          Object.entries(aiMemoryRef.current.knownFuture).forEach(([k, v]) => {
            const idx = Number(k);
            if (idx > 1) shifted[idx - 1] = v;
          });
          aiMemoryRef.current.knownCurrent = shifted[0] ?? null;
          aiMemoryRef.current.knownFuture = shifted;

          const colorText =
            ejected === "live" ? "KIRMIZI (DOLU)" : "MAVİ-GRİ (BOŞ)";
          setCrtBanner(
            `🥫 TENEKE İÇECEK! DIŞARI FIRLAYAN FİŞEK: ${colorText}`
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
            }, 900);
          }
          break;
        }

        case "sedative": {
          if (wiresCutSuddenDeath) {
            sound.playInvalid();
            setCrtBanner("⚠️ KESİK KABLO: DEFİBRİLATÖR ŞARJ KABUL ETMİYOR!");
            setCrtSubText("Son rauntta kablolar koptuğu için iyileşme yapılamaz.");
          } else {
            sound.playDefibShock(true);
            if (userSeat === 1) {
              setP1Hp((h) => Math.min(maxHp, h + 1));
            } else {
              setP2Hp((h) => Math.min(maxHp, h + 1));
            }
            setCrtBanner(
              `🔋 ${actorName.toUpperCase()} +1⚡ DEFİBRİLATÖR ŞARJI YÜKLEDİ!`
            );
            setCrtSubText("Yaşam belirtileri güçlendi.");
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
            `🔄 ${actorName.toUpperCase()} DÖNÜŞTÜRÜCÜ ÇALIŞTIRDI!`
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
            // 1..chamber.length-1 arası gelecekteki bir fişeği seç
            const futureIdx =
              1 + Math.floor(Math.random() * (chamber.length - 1));
            const futureShell = chamber[futureIdx];
            const ordinal = futureIdx + 1; // 2. fişek, 3. fişek vb.
            const colorWord =
              futureShell === "live"
                ? "🔴 KIRMIZI (DOLU)"
                : "🔵 MAVİ-GRİ (BOŞ)";
            const msg = `Şarjördeki ${ordinal}. fişek... ${colorWord}!`;

            if (userSeat === 2 && mode === "solo") {
              aiMemoryRef.current.knownFuture[futureIdx] = futureShell;
              setCrtBanner("📱 KRUPIYE GİZLİ TELEFONU KULAĞINA GÖTÜRDÜ...");
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
                `📱 ${actorName.toUpperCase()} GİZLİ TELEFONU AÇTI`
              );
              setCrtSubText(
                mode === "duel"
                  ? "Mesajı okumak için avuç içi gizli kutuya basılı tut!"
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
            `💉 ADRENALİN AKTİF! 10 SN İÇİNDE RAKİP TEPSİDEN 1 EŞYA ÇAL!`
          );
          setCrtSubText(
            "Rakibin tepsisindeki herhangi bir eşyaya (Adrenalin hariç) dokunarak anında kullan!"
          );
          break;
        }

        case "expiredMed": {
          if (wiresCutSuddenDeath) {
            sound.playInvalid();
            setCrtBanner("⚠️ KESİK KABLO: BOZUK İLAÇ ETKİSİZ KALDI!");
            setCrtSubText("Kablolar kesik olduğu için ilaç etki etmedi.");
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
            setCrtSubText("Bozuk ilaç mucizevi şekilde işe yaradı!");
          } else {
            sound.playDefibShock(false);
            setScreenFlash("amber");
            setScreenShakeKey((k) => k + 1);
            setTimeout(() => setScreenFlash("none"), 450);

            const nextHp1 = userSeat === 1 ? Math.max(0, p1Hp - 1) : p1Hp;
            const nextHp2 = userSeat === 2 ? Math.max(0, p2Hp - 1) : p2Hp;
            setP1Hp(nextHp1);
            setP2Hp(nextHp2);

            setCrtBanner(
              `☠️ ZEHİRLİ İLAÇ! ${actorName.toUpperCase()} -1⚡ ŞARJ KAYBETTİ!`
            );
            setCrtSubText("İlaç bozuk çıktı, mide kramplarıyla -1⚡ düştü!");

            if (nextHp1 <= 0) {
              setTimeout(() => handlePlayerZeroHp(1, nextHp1, nextHp2), 700);
            } else if (nextHp2 <= 0) {
              setTimeout(() => handlePlayerZeroHp(2, nextHp1, nextHp2), 700);
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
      spawnEjectedShell,
      startNewLoad,
      currentRound,
      wiresCutSuddenDeath,
      maxHp,
      p1Hp,
      p2Hp,
      handlePlayerZeroHp,
    ]
  );

  // Kendi tepsisinden veya Adrenalin ile rakip tepsiden eşyaya tıklama
  const handleUseTrayItem = useCallback(
    (trayOwner: 1 | 2, itemIndex: number) => {
      if (isAnimating || matchOver || chamber.length === 0) return;

      const tray = trayOwner === 1 ? p1Items : p2Items;
      const itemKey = tray[itemIndex];
      if (!itemKey) return;

      // Adrenalin hırsızlığı aktifse:
      if (adrenalineStealSeat !== null) {
        if (trayOwner === adrenalineStealSeat) {
          sound.playInvalid();
          setCrtSubText("Adrenalin etkinken RAKİBİN tepsisinden eşya seçmelisin!");
          return;
        }
        if (itemKey === "adrenaline") {
          sound.playInvalid();
          setCrtSubText("Adrenalin ile başka bir Adrenalin çalınamaz!");
          return;
        }
        if (itemKey === "handsaw" && isSawedOff) {
          sound.playInvalid();
          setCrtSubText("Namlu zaten kesik! Aynı atışta iki testere kullanılamaz.");
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

        // Rakibin tepsisinden eşyayı sil ve aktif oyuncu adına uygula
        const nextP1 =
          trayOwner === 1
            ? p1Items.filter((_, idx) => idx !== itemIndex)
            : p1Items;
        const nextP2 =
          trayOwner === 2
            ? p2Items.filter((_, idx) => idx !== itemIndex)
            : p2Items;
        setP1Items(nextP1);
        setP2Items(nextP2);
        setAdrenalineStealSeat(null);
        executeItemEffect(adrenalineStealSeat, itemKey, nextP1, nextP2);
        return;
      }

      // Normal kullanım: Sadece sırası gelen oyuncu kendi tepsisinden kullanabilir
      if (trayOwner !== turn) {
        sound.playInvalid();
        return;
      }

      if (itemKey === "handsaw" && isSawedOff) {
        sound.playInvalid();
        setCrtSubText("Namlu zaten kesik! Aynı atışta iki testere kullanılamaz.");
        return;
      }

      if (
        itemKey === "handcuffs" &&
        ((turn === 1 && (p2Cuffed || p2CuffCooldown)) ||
          (turn === 2 && (p1Cuffed || p1CuffCooldown)))
      ) {
        sound.playInvalid();
        setCrtSubText("Rakip zaten kelepçeli veya bu tur kelepçeden yeni çıktı!");
        return;
      }

      if (itemKey === "adrenaline") {
        const oppTray = turn === 1 ? p2Items : p1Items;
        const stealable = oppTray.some((k) => k !== "adrenaline");
        if (!stealable) {
          sound.playInvalid();
          setCrtSubText("Rakibin tepsisinde çalınabilecek uygun eşya yok!");
          return;
        }
      }

      const nextP1 =
        turn === 1 ? p1Items.filter((_, idx) => idx !== itemIndex) : p1Items;
      const nextP2 =
        turn === 2 ? p2Items.filter((_, idx) => idx !== itemIndex) : p2Items;
      setP1Items(nextP1);
      setP2Items(nextP2);
      executeItemEffect(turn, itemKey, nextP1, nextP2);
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

  // AKILLI KRUPIYE (DEALER) YAPAY ZEKA MOTORU (Tek Kişilik Modda Sıra 2'deyken)
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

      // Eğer tek tip fişek kaldıysa Krupiye kesin biliyor demektir
      if (liveLeft === 0) aiMemoryRef.current.knownCurrent = "blank";
      if (blankLeft === 0) aiMemoryRef.current.knownCurrent = "live";

      const known = aiMemoryRef.current.knownCurrent;

      // 0) Eğer Adrenalin çalma modundaysa oyuncu1 tepsisinden en değerli eşyayı çal
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

      // 1) Canı azsa ve Kesik Kablo yoksa önce Şarj Tüpü veya Bozuk İlaç kullan
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

      // 2) Namludaki fişeği bilmiyorsa Büyüteç veya Gizli Telefon kullan
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

      // 3) Adrenalin varsa ve oyuncuda işe yarar eşya varsa çal
      const adrIdx = p2Items.indexOf("adrenaline");
      if (
        adrIdx !== -1 &&
        p1Items.some(
          (k) =>
            k !== "adrenaline" &&
            !(k === "handsaw" && isSawedOff) &&
            !(k === "handcuffs" && (p1Cuffed || p1CuffCooldown))
        )
      ) {
        handleUseTrayItem(2, adrIdx);
        return;
      }

      // 4) Eğer namludaki fişeğin BOŞ olduğunu biliyorsa ve Dönüştürücü (Inverter) varsa DOLU'ya çevir!
      if (known === "blank") {
        const invIdx = p2Items.indexOf("inverter");
        if (invIdx !== -1) {
          handleUseTrayItem(2, invIdx);
          return;
        }
      }

      // 5) Eğer DOLU olduğunu biliyorsa (veya olasılık >= %60 ise) Kelepçe + El Testeresi kombosu yap!
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

      // 6) Belirsiz durumda Teneke İçecek varsa ve fazla eşyası biriktiyse kullan
      if (known === null && p2Items.length >= 6) {
        const sodaIdx = p2Items.indexOf("soda");
        if (sodaIdx !== -1) {
          handleUseTrayItem(2, sodaIdx);
          return;
        }
      }

      // 7) KARAR ANI: KENDİNE Mİ SIKACAK, OYUNCUYA MI?
      if (known === "blank") {
        // Kesin boş -> Kendine sıkarak sırasını korur!
        handleFireShotgun(2);
      } else if (known === "live") {
        // Kesin dolu -> Oyuncuya sıkar!
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

  // Pompalı Tüfek Dönüş Açısı (Derece)
  const gunRotationDeg =
    gunAim === "p1" ? 90 : gunAim === "p2" ? -90 : 0;

  return (
    <motion.div
      key={screenShakeKey}
      animate={
        screenShakeKey > 0
          ? {
              x: [-14, 14, -10, 10, -5, 5, 0],
              y: [-8, 8, -5, 5, 0],
            }
          : {}
      }
      transition={{ duration: 0.38 }}
      className="relative flex h-full w-full max-w-6xl flex-col justify-between overflow-hidden rounded-3xl border-2 border-stone-700/80 bg-[#120e0c] p-2.5 sm:p-4 shadow-[0_0_80px_rgba(0,0,0,0.95)] select-none"
      style={{
        backgroundImage:
          "radial-gradient(circle at 50% 48%, rgba(217, 119, 6, 0.16) 0%, rgba(28, 22, 18, 0.88) 54%, rgba(10, 8, 7, 0.98) 100%)",
      }}
    >
      {/* Tepeden Sallanan Tungsten Lamba Vignette Gölgelendirmesi */}
      <motion.div
        animate={{
          x: [-18, 18, -18],
          opacity: [0.22, 0.3, 0.22],
        }}
        transition={{ repeat: Infinity, duration: 7.5, ease: "easeInOut" }}
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            "radial-gradient(circle at 50% 42%, rgba(251, 191, 36, 0.19), transparent 60%)",
        }}
      />

      {/* Kan Kırmızısı veya Kehribar Hasar Ekran Flaşı */}
      <AnimatePresence>
        {screenFlash !== "none" && (
          <motion.div
            initial={{ opacity: 0.75 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.55 }}
            className={`pointer-events-none absolute inset-0 z-40 ${
              screenFlash === "red" ? "bg-red-600/55" : "bg-amber-500/45"
            }`}
          />
        )}
      </AnimatePresence>

      {/* ÜST BAR: Çıkış, Seri Modu Seçici, CRT Monitör Durumu */}
      <div className="relative z-20 flex flex-wrap items-center justify-between gap-2 border-b border-stone-800/90 pb-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBackToHub}
            className="min-h-[46px] inline-flex items-center gap-1.5 rounded-2xl border border-stone-700 bg-stone-900/90 px-3.5 py-2 text-xs font-black text-stone-200 hover:border-amber-500/50 hover:text-white transition cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4 text-amber-400" /> Lobiye Dön
          </button>

          <button
            type="button"
            onClick={onRequestNewGameWithGate}
            className="min-h-[46px] inline-flex items-center gap-1.5 rounded-2xl border border-stone-700 bg-stone-900/90 px-3 py-2 text-xs font-extrabold text-amber-300 hover:border-amber-400 transition cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Yeni Maç / Mod
          </button>
        </div>

        {/* Seri Modu Gösterge / Hızlı Geçiş */}
        <div className="flex items-center gap-1.5 rounded-2xl border border-stone-700/80 bg-stone-950/90 p-1">
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
            className={`min-h-[38px] rounded-xl px-2.5 py-1 text-[11px] font-black transition cursor-pointer ${
              seriesMode === "series3"
                ? "bg-amber-500 text-stone-950 shadow"
                : "text-stone-400 hover:text-stone-200"
            }`}
          >
            Tam 3 Rauntluk Seri (2⚡•4⚡•5⚡)
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
            className={`min-h-[38px] rounded-xl px-2.5 py-1 text-[11px] font-black transition cursor-pointer ${
              seriesMode === "fast1"
                ? "bg-red-600 text-white shadow"
                : "text-stone-400 hover:text-stone-200"
            }`}
          >
            Hızlı Tek Raunt (5⚡ Teneffüs)
          </button>
        </div>
      </div>

      {/* ORTA ANA ALAN: Sol/Üst Rakip & Tepsi — Merkez Pompalı & CRT — Sağ/Alt Oyuncu 1 & Tepsi */}
      <div className="relative z-10 grid flex-1 grid-cols-1 lg:grid-cols-12 gap-2.5 items-stretch min-h-0 py-1">
        {/* SOL PANEL (3 Sütun): CRT MONİTÖR & ŞARJÖR / DURUM EKRANI */}
        <div className="lg:col-span-4 flex flex-col justify-between rounded-2xl border-2 border-stone-700 bg-[#0b0d0a] p-3 shadow-[inset_0_0_32px_rgba(0,0,0,0.95)]">
          {/* Pikselli Yeşil/Kehribar/Kırmızı CRT Monitör */}
          <div
            className={`flex-1 flex flex-col justify-between rounded-xl border-2 p-3 font-mono transition-colors ${
              wiresCutSuddenDeath
                ? "border-red-500/80 bg-red-950/30 text-red-300 shadow-[inset_0_0_25px_rgba(239,68,68,0.28)]"
                : "border-emerald-500/45 bg-emerald-950/20 text-emerald-300 shadow-[inset_0_0_25px_rgba(16,185,129,0.16)]"
            }`}
          >
            <div>
              <div className="flex items-center justify-between border-b border-current/25 pb-1.5 text-[11px] font-bold uppercase tracking-widest">
                <span className="flex items-center gap-1.5">
                  <span
                    className={`h-2.5 w-2.5 rounded-full animate-pulse ${
                      wiresCutSuddenDeath ? "bg-red-500" : "bg-emerald-400"
                    }`}
                  />
                  CRT-DEFIB OS v3.4
                </span>
                <span>
                  {seriesMode === "fast1"
                    ? "TEK RAUNT (5⚡)"
                    : `RAUNT ${currentRound} / 3`}
                </span>
              </div>

              {wiresCutSuddenDeath && (
                <div className="mt-2 rounded-lg border border-red-500/60 bg-red-600/20 px-2.5 py-1 text-[10px] font-black text-red-200 animate-pulse">
                  ⚡ KESİK KABLO (SUDDEN DEATH): ŞARJ CİHAZLARI KOPTU! İYİLEŞME YOK!
                </div>
              )}

              {/* Oyuncu 2 / Krupiye Defibrilatör Şarj Göstergesi */}
              <div className="mt-2.5 rounded-xl border border-current/25 bg-black/55 p-2.5">
                <div className="flex items-center justify-between text-xs font-black">
                  <span className="truncate flex items-center gap-1.5">
                    <span>{p2Avatar}</span>
                    <span>{p2Name}</span>
                    {p2Cuffed && (
                      <span className="rounded bg-rose-500/30 px-1.5 py-0.5 text-[10px] text-rose-200">
                        🔗 KELEPÇELİ
                      </span>
                    )}
                  </span>
                  {seriesMode === "series3" && (
                    <span className="text-[10px] text-amber-300">
                      Zafer: {p2RoundsWon}/2
                    </span>
                  )}
                </div>
                <div className="mt-1.5 flex items-center gap-1">
                  {Array.from({ length: maxHp }).map((_, i) => {
                    const active = i < p2Hp;
                    return (
                      <span
                        key={i}
                        className={`flex h-6 flex-1 items-center justify-center rounded border text-xs font-black transition-all ${
                          active
                            ? wiresCutSuddenDeath
                              ? "border-red-400 bg-red-500/35 text-red-200 shadow-[0_0_8px_rgba(239,68,68,0.6)]"
                              : "border-amber-400 bg-amber-400/30 text-amber-200 shadow-[0_0_8px_rgba(251,191,36,0.5)]"
                            : "border-stone-800 bg-stone-950/80 text-stone-700"
                        }`}
                      >
                        ⚡
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* Oyuncu 1 Defibrilatör Şarj Göstergesi */}
              <div className="mt-2 rounded-xl border border-current/25 bg-black/55 p-2.5">
                <div className="flex items-center justify-between text-xs font-black">
                  <span className="truncate flex items-center gap-1.5">
                    <span>{player1.avatar}</span>
                    <span>{player1.name}</span>
                    {p1Cuffed && (
                      <span className="rounded bg-rose-500/30 px-1.5 py-0.5 text-[10px] text-rose-200">
                        🔗 KELEPÇELİ
                      </span>
                    )}
                  </span>
                  {seriesMode === "series3" && (
                    <span className="text-[10px] text-amber-300">
                      Zafer: {p1RoundsWon}/2
                    </span>
                  )}
                </div>
                <div className="mt-1.5 flex items-center gap-1">
                  {Array.from({ length: maxHp }).map((_, i) => {
                    const active = i < p1Hp;
                    return (
                      <span
                        key={i}
                        className={`flex h-6 flex-1 items-center justify-center rounded border text-xs font-black transition-all ${
                          active
                            ? wiresCutSuddenDeath
                              ? "border-red-400 bg-red-500/35 text-red-200 shadow-[0_0_8px_rgba(239,68,68,0.6)]"
                              : "border-emerald-400 bg-emerald-500/30 text-emerald-200 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                            : "border-stone-800 bg-stone-950/80 text-stone-700"
                        }`}
                      >
                        ⚡
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* CRT Canlı Anons Ekranı */}
            <div className="mt-2.5 rounded-xl border border-amber-400/35 bg-black/80 p-2.5">
              <div className="text-[11px] font-black tracking-wide text-amber-300 leading-snug">
                &gt; {crtBanner}
              </div>
              <div className="mt-1 text-[10px] text-stone-300 leading-relaxed">
                {crtSubText}
              </div>
            </div>

            {/* Kalan Fişek Sayacı & Adrenalin Sayacı */}
            <div className="mt-2 flex items-center justify-between rounded-xl border border-stone-800 bg-stone-950/90 px-3 py-2 text-[11px]">
              <span className="font-bold text-stone-400">
                Namluda Kalan:{" "}
                <strong className="text-white">{chamber.length} Fişek</strong>
              </span>
              <div className="flex items-center gap-2 font-black">
                <span className="text-red-400">🔴 {liveRemaining}</span>
                <span className="text-sky-300">🔵 {blankRemaining}</span>
              </div>
            </div>
          </div>

          {/* AKILLI TAHTA "AVUÇ İÇİ GİZLİ BAKIŞ" KUTUSU (180x90px, Basılı Tutunca Gösterir!) */}
          <AnimatePresence>
            {secretPeek && (
              <motion.div
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.92 }}
                className="mt-2.5 flex flex-col items-center justify-between rounded-2xl border-2 border-cyan-400/70 bg-slate-950 p-2.5 shadow-[0_0_28px_rgba(34,211,238,0.35)]"
              >
                <div className="flex w-full items-center justify-between text-[10px] font-black text-cyan-300">
                  <span>{secretPeek.title}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSecretPeek(null);
                      setIsHoldingPeek(false);
                    }}
                    className="rounded-lg bg-white/10 px-2 py-0.5 text-[10px] text-white hover:bg-white/20 cursor-pointer"
                  >
                    Kapat ✕
                  </button>
                </div>

                {/* 180x90px Kompakt Avuç İçi Gizli Kutu */}
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
                  className="mt-1.5 flex h-[90px] w-[180px] flex-col items-center justify-center rounded-xl border border-cyan-400/50 bg-[#05080c] px-2.5 text-center select-none cursor-pointer"
                >
                  {isHoldingPeek ? (
                    <div className="space-y-1">
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
                      <div className="text-[9px] text-slate-400">
                        {mode === "duel"
                          ? "Parmağını çekince gizlenir"
                          : "Gizli istihbarat"}
                      </div>
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
        </div>

        {/* SAĞ / MERKEZ YERALTl MASASI (8 Sütun): Rakip Tepsi -> Pompalı Tüfek -> Oyuncu 1 Tepsi & Tetik */}
        <div className="lg:col-span-8 flex flex-col justify-between rounded-2xl border-2 border-stone-700/90 bg-gradient-to-b from-[#1c1512] via-[#231a15] to-[#17110e] p-3 sm:p-4 shadow-[inset_0_0_55px_rgba(0,0,0,0.9)] relative overflow-hidden">
          {/* ÜST BÖLGE: KRUPIYE / OYUNCU 2 VE 8 YUVALI METAL EŞYA TEPSİSİ */}
          <div className="relative z-10 flex flex-col gap-2 rounded-2xl border border-stone-700/80 bg-stone-950/75 p-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <motion.div
                  animate={
                    turn === 2 && !isAnimating
                      ? { scale: [1, 1.08, 1] }
                      : { scale: 1 }
                  }
                  transition={{ repeat: Infinity, duration: 1.6 }}
                  className={`flex h-11 w-11 items-center justify-center rounded-2xl border-2 text-2xl shadow-lg ${
                    turn === 2
                      ? "border-red-500 bg-red-950/70 shadow-[0_0_18px_rgba(239,68,68,0.5)]"
                      : "border-stone-700 bg-stone-900"
                  }`}
                >
                  {p2Avatar}
                </motion.div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-black text-white">
                      {p2Name}
                    </span>
                    {turn === 2 && (
                      <span className="rounded-full bg-red-500/25 border border-red-400/50 px-2 py-0.5 text-[10px] font-black text-red-300">
                        SIRA ONDA
                      </span>
                    )}
                    {adrenalineStealSeat === 1 && (
                      <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-black text-white animate-bounce">
                        💉 ÇALMAK İÇİN BİR EŞYAYA DOKUN! ({adrenalineSecondsLeft}s)
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-stone-400">
                    {mode === "solo"
                      ? "Eldivenli Yeraltı Krupiyesi • Olasılık Hesaplayıcı AI"
                      : "2. Oyuncu • 8 Yuvalı Metal Tepsi"}
                  </p>
                </div>
              </div>

              <div className="text-right text-xs font-black text-amber-300">
                Tepsi: {p2Items.length}/8
              </div>
            </div>

            {/* Oyuncu 2 / Krupiye 8 Yuvalı Metal Eşya Tepsisi */}
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
              {Array.from({ length: 8 }).map((_, slotIdx) => {
                const itemKey = p2Items[slotIdx];
                const meta = itemKey ? BUCKSHOT_ITEMS[itemKey] : null;
                const canClick =
                  Boolean(meta) &&
                  !isAnimating &&
                  ((mode === "duel" && turn === 2 && adrenalineStealSeat === null) ||
                    (adrenalineStealSeat === 1 && itemKey !== "adrenaline"));

                return (
                  <motion.button
                    key={slotIdx}
                    type="button"
                    disabled={!canClick}
                    whileHover={canClick ? { scale: 1.05, y: -2 } : undefined}
                    whileTap={canClick ? { scale: 0.94 } : undefined}
                    onClick={() => handleUseTrayItem(2, slotIdx)}
                    title={meta ? `${meta.name}: ${meta.desc}` : "Boş Metal Yuva"}
                    className={`min-h-[54px] flex flex-col items-center justify-center rounded-xl border p-1 text-center transition ${
                      meta
                        ? `${meta.accentClass} ${
                            canClick
                              ? "cursor-pointer hover:brightness-125 ring-1 ring-white/20"
                              : "opacity-80 cursor-default"
                          }`
                        : "border-stone-800/80 bg-stone-900/50 text-stone-700 cursor-default"
                    }`}
                  >
                    {meta ? (
                      <>
                        <span className="text-lg leading-none">{meta.icon}</span>
                        <span className="mt-1 text-[9px] font-black leading-tight truncate max-w-full">
                          {meta.shortName}
                        </span>
                      </>
                    ) : (
                      <span className="text-[10px] font-mono opacity-40">
                        #{slotIdx + 1}
                      </span>
                    )}
                  </motion.button>
                );
              })}
            </div>
          </div>

          {/* MERKEZ SAHNE: CANLI POMPALI TÜFEK (SVG), KOVANLAR VE MERMİ DİZİLİM ŞOVU */}
          <div className="relative my-2 flex flex-1 flex-col items-center justify-center min-h-[175px] rounded-2xl border border-amber-500/20 bg-black/45 px-4 py-3 overflow-hidden">
            {/* Masaya Fırlayan Boş/Dolu Kovanlar */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              {ejectedShells.map((sh) => (
                <motion.div
                  key={sh.id}
                  initial={{ opacity: 0, scale: 1.4, x: 0, y: 0, rotate: 0 }}
                  animate={{
                    opacity: 0.85,
                    scale: 1,
                    x: sh.offsetX,
                    y: sh.offsetY,
                    rotate: sh.angle,
                  }}
                  transition={{ type: "spring", stiffness: 220, damping: 18 }}
                  className={`absolute left-1/2 top-1/2 h-3.5 w-8 -translate-x-1/2 -translate-y-1/2 rounded-sm border shadow-md flex items-center justify-end pr-0.5 ${
                    sh.type === "live"
                      ? "border-red-400 bg-gradient-to-r from-red-700 to-red-600"
                      : "border-sky-400 bg-gradient-to-r from-slate-600 to-sky-700"
                  }`}
                >
                  <span className="h-full w-2 bg-amber-400 rounded-r-sm" />
                </motion.div>
              ))}
            </div>

            {/* Namlu Kesik (2x Hasar) Uyarı Rozeti */}
            <AnimatePresence>
              {isSawedOff && (
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="mb-1 inline-flex items-center gap-1.5 rounded-full border border-red-400 bg-red-600/30 px-3 py-0.5 text-[11px] font-black text-red-200 shadow-[0_0_18px_rgba(239,68,68,0.5)]"
                >
                  🪚 KESİK NAMLU AKTİF: BU ATIŞ 2x HASAR (2⚡) VERİR!
                </motion.div>
              )}
            </AnimatePresence>

            {/* Yay Fiziğiyle Dönen Detaylı Pompalı Tüfek (SVG) */}
            <motion.div
              animate={{
                rotate: gunRotationDeg,
                scale: muzzleFlash !== "none" ? 1.14 : 1,
              }}
              transition={{ type: "spring", stiffness: 240, damping: 20 }}
              className="relative flex items-center justify-center py-2"
            >
              {/* Namlu Alevi (Muzzle Flash) */}
              <AnimatePresence>
                {muzzleFlash !== "none" && (
                  <motion.div
                    initial={{ opacity: 1, scale: 0.5 }}
                    animate={{ opacity: 0, scale: 2.2 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.35 }}
                    className="pointer-events-none absolute right-[-45px] h-24 w-24 rounded-full bg-gradient-radial from-yellow-200 via-orange-500 to-transparent blur-sm"
                  />
                )}
              </AnimatePresence>

              <svg
                viewBox="0 0 420 96"
                className="w-[270px] sm:w-[360px] h-auto drop-shadow-[0_12px_18px_rgba(0,0,0,0.85)]"
              >
                <defs>
                  <linearGradient id="woodStock" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#6b3410" />
                    <stop offset="50%" stopColor="#4a2208" />
                    <stop offset="100%" stopColor="#2c1304" />
                  </linearGradient>
                  <linearGradient id="steelBody" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#64748b" />
                    <stop offset="50%" stopColor="#334155" />
                    <stop offset="100%" stopColor="#0f172a" />
                  </linearGradient>
                </defs>

                {/* Ahşap Dipçik (Stock) */}
                <path
                  d="M14,38 L108,34 L118,58 L22,68 C12,68 8,46 14,38 Z"
                  fill="url(#woodStock)"
                  stroke="#1c0d06"
                  strokeWidth="2.5"
                />

                {/* Tetik Korkuluğu & Tetik */}
                <path
                  d="M118,54 Q132,74 148,54"
                  fill="none"
                  stroke="#475569"
                  strokeWidth="3"
                />
                <path
                  d="M132,52 L128,63"
                  stroke="#fbbf24"
                  strokeWidth="3"
                  strokeLinecap="round"
                />

                {/* Çelik Gövde (Receiver) */}
                <rect
                  x="108"
                  y="28"
                  width="92"
                  height="28"
                  rx="4"
                  fill="url(#steelBody)"
                  stroke="#1e293b"
                  strokeWidth="2.5"
                />
                {/* Kovan Tahliye Penceresi */}
                <rect
                  x="142"
                  y="33"
                  width="34"
                  height="10"
                  rx="2"
                  fill="#090d16"
                  stroke="#475569"
                  strokeWidth="1.2"
                />

                {/* Üst Namlu (Normal veya El Testeresiyle Kesilmiş!) */}
                <rect
                  x="200"
                  y="29"
                  width={isSawedOff ? "105" : "195"}
                  height="12"
                  rx="2"
                  fill="url(#steelBody)"
                  stroke={isSawedOff ? "#ef4444" : "#1e293b"}
                  strokeWidth="2"
                />
                {/* Alt Şarjör Borusu */}
                <rect
                  x="200"
                  y="42"
                  width={isSawedOff ? "98" : "165"}
                  height="10"
                  rx="2"
                  fill="#1e293b"
                  stroke="#0f172a"
                  strokeWidth="1.8"
                />

                {/* Pompa Kurma Kolu (Forend — *ŞAK-ŞAK* Hareketli) */}
                <motion.g
                  animate={{
                    x: loadingRackCount % 2 === 1 ? -18 : 0,
                  }}
                  transition={{ duration: 0.12 }}
                >
                  <rect
                    x="228"
                    y="39"
                    width="68"
                    height="17"
                    rx="4"
                    fill="url(#woodStock)"
                    stroke="#1c0d06"
                    strokeWidth="2"
                  />
                  <line
                    x1="240"
                    y1="40"
                    x2="240"
                    y2="55"
                    stroke="#2c1304"
                    strokeWidth="2"
                  />
                  <line
                    x1="254"
                    y1="40"
                    x2="254"
                    y2="55"
                    stroke="#2c1304"
                    strokeWidth="2"
                  />
                  <line
                    x1="268"
                    y1="40"
                    x2="268"
                    y2="55"
                    stroke="#2c1304"
                    strokeWidth="2"
                  />
                  <line
                    x1="282"
                    y1="40"
                    x2="282"
                    y2="55"
                    stroke="#2c1304"
                    strokeWidth="2"
                  />
                </motion.g>

                {/* Arpacık veya Kesik Namlu Kıvılcım İzi */}
                {!isSawedOff ? (
                  <polygon points="388,29 394,22 396,29" fill="#f59e0b" />
                ) : (
                  <path
                    d="M305,28 L311,33 L303,37 L309,42"
                    stroke="#f87171"
                    strokeWidth="2.5"
                    fill="none"
                  />
                )}
              </svg>
            </motion.div>

            {/* TETİK AKSİYON BUTONLARI (KENDİNE SIK vs RAKİBE SIK) */}
            <div className="mt-1 flex flex-wrap items-center justify-center gap-3 w-full">
              <motion.button
                type="button"
                disabled={
                  isAnimating ||
                  chamber.length === 0 ||
                  (mode === "solo" && turn === 2)
                }
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => handleFireShotgun(turn)}
                className="min-h-[54px] flex-1 max-w-[240px] flex items-center justify-center gap-2 rounded-2xl border-2 border-sky-400/60 bg-gradient-to-r from-sky-600/30 to-indigo-900/50 px-4 py-2.5 text-xs sm:text-sm font-black text-sky-100 shadow-lg hover:border-sky-300 disabled:opacity-40 transition cursor-pointer"
              >
                <User className="h-4 w-4 text-sky-300" />
                <span>KENDİNE SIK (Boşsa Sıra Sende)</span>
              </motion.button>

              <motion.button
                type="button"
                disabled={
                  isAnimating ||
                  chamber.length === 0 ||
                  (mode === "solo" && turn === 2)
                }
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => handleFireShotgun(turn === 1 ? 2 : 1)}
                className="min-h-[54px] flex-1 max-w-[240px] flex items-center justify-center gap-2 rounded-2xl border-2 border-red-500/70 bg-gradient-to-r from-red-600/45 to-rose-900/60 px-4 py-2.5 text-xs sm:text-sm font-black text-red-100 shadow-[0_0_24px_rgba(239,68,68,0.3)] hover:border-red-300 disabled:opacity-40 transition cursor-pointer"
              >
                <Crosshair className="h-4 w-4 text-red-300" />
                <span>
                  {turn === 1
                    ? `${p2Name.split(" ")[0].toUpperCase()} HEDEFİNE SIK`
                    : `${player1.name.toUpperCase()} HEDEFİNE SIK`}
                </span>
              </motion.button>
            </div>

            {/* 3.5 SANİYELİK AÇIK MERMİ KUTUSU ŞOVU OVERLAY */}
            <AnimatePresence>
              {revealPreview && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.92 }}
                  className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/92 p-4 text-center backdrop-blur-md"
                >
                  <div className="text-xs font-black uppercase tracking-widest text-amber-400">
                    MERMİ KUTUSU AÇILDI — DİKKATLİ SAY (3.5 SN)
                  </div>
                  <div className="mt-1 text-base sm:text-lg font-black text-white">
                    <span className="text-red-400">
                      {revealPreview.live} KIRMIZI (DOLU)
                    </span>{" "}
                    •{" "}
                    <span className="text-sky-300">
                      {revealPreview.blank} MAVİ-GRİ (BOŞ)
                    </span>
                  </div>

                  <div className="mt-3 flex items-center justify-center gap-2.5 rounded-2xl border-2 border-stone-600 bg-stone-900 px-5 py-3 shadow-inner">
                    {revealPreview.shells.map((sh, idx) => (
                      <motion.div
                        key={idx}
                        initial={{ y: 16, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: idx * 0.08 }}
                        className="flex flex-col items-center gap-1"
                      >
                        <div
                          className={`h-14 w-6 rounded-t-md border-2 shadow-lg flex flex-col justify-end overflow-hidden ${
                            sh === "live"
                              ? "border-red-400 bg-gradient-to-b from-red-500 to-red-800 shadow-[0_0_14px_rgba(239,68,68,0.55)]"
                              : "border-sky-300 bg-gradient-to-b from-sky-400 to-slate-700 shadow-[0_0_14px_rgba(56,189,248,0.45)]"
                          }`}
                        >
                          <div className="h-3.5 w-full bg-amber-400 border-t border-amber-200" />
                        </div>
                        <span className="text-[9px] font-black uppercase text-stone-300">
                          {sh === "live" ? "DOLU" : "BOŞ"}
                        </span>
                      </motion.div>
                    ))}
                  </div>

                  {/* 3.5 sn geri sayım çubuğu */}
                  <div className="mt-3 h-1.5 w-56 overflow-hidden rounded-full bg-stone-800">
                    <motion.div
                      initial={{ width: "100%" }}
                      animate={{ width: "0%" }}
                      transition={{ duration: 3.4, ease: "linear" }}
                      className="h-full bg-amber-400"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ALT BÖLGE: OYUNCU 1 VE 8 YUVALI METAL EŞYA TEPSİSİ */}
          <div className="relative z-10 flex flex-col gap-2 rounded-2xl border border-stone-700/80 bg-stone-950/80 p-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <motion.div
                  animate={
                    turn === 1 && !isAnimating
                      ? { scale: [1, 1.08, 1] }
                      : { scale: 1 }
                  }
                  transition={{ repeat: Infinity, duration: 1.6 }}
                  className={`flex h-11 w-11 items-center justify-center rounded-2xl border-2 text-2xl shadow-lg ${
                    turn === 1
                      ? "border-emerald-400 bg-emerald-950/70 shadow-[0_0_18px_rgba(16,185,129,0.5)]"
                      : "border-stone-700 bg-stone-900"
                  }`}
                >
                  {player1.avatar}
                </motion.div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-black text-white">
                      {player1.name}
                    </span>
                    {turn === 1 && (
                      <span className="rounded-full bg-emerald-500/25 border border-emerald-400/50 px-2 py-0.5 text-[10px] font-black text-emerald-300">
                        SIRA SENDE
                      </span>
                    )}
                    {adrenalineStealSeat === 2 && (
                      <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-black text-white animate-bounce">
                        💉 BU TEPSİDEN BİR EŞYA ÇAL! ({adrenalineSecondsLeft}s)
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-stone-400">
                    1. Oyuncu • Eşyaya dokunarak anında kullanabilirsin
                  </p>
                </div>
              </div>

              <div className="text-right text-xs font-black text-emerald-300">
                Tepsi: {p1Items.length}/8
              </div>
            </div>

            {/* Oyuncu 1 8 Yuvalı Metal Eşya Tepsisi */}
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
              {Array.from({ length: 8 }).map((_, slotIdx) => {
                const itemKey = p1Items[slotIdx];
                const meta = itemKey ? BUCKSHOT_ITEMS[itemKey] : null;
                const canClick =
                  Boolean(meta) &&
                  !isAnimating &&
                  ((turn === 1 && adrenalineStealSeat === null) ||
                    (adrenalineStealSeat === 2 &&
                      mode === "duel" &&
                      itemKey !== "adrenaline"));

                return (
                  <motion.button
                    key={slotIdx}
                    type="button"
                    disabled={!canClick}
                    whileHover={canClick ? { scale: 1.05, y: -2 } : undefined}
                    whileTap={canClick ? { scale: 0.94 } : undefined}
                    onClick={() => handleUseTrayItem(1, slotIdx)}
                    title={meta ? `${meta.name}: ${meta.desc}` : "Boş Metal Yuva"}
                    className={`min-h-[54px] flex flex-col items-center justify-center rounded-xl border p-1 text-center transition ${
                      meta
                        ? `${meta.accentClass} ${
                            canClick
                              ? "cursor-pointer hover:brightness-125 ring-1 ring-white/25"
                              : "opacity-75 cursor-default"
                          }`
                        : "border-stone-800/80 bg-stone-900/50 text-stone-700 cursor-default"
                    }`}
                  >
                    {meta ? (
                      <>
                        <span className="text-lg leading-none">{meta.icon}</span>
                        <span className="mt-1 text-[9px] font-black leading-tight truncate max-w-full">
                          {meta.shortName}
                        </span>
                      </>
                    ) : (
                      <span className="text-[10px] font-mono opacity-40">
                        #{slotIdx + 1}
                      </span>
                    )}
                  </motion.button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* MAÇ SONU ZAFER / YENİLGİ MODALI */}
      <AnimatePresence>
        {matchOver && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.9, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              className="w-full max-w-md rounded-3xl border-2 border-amber-500/50 bg-stone-950 p-6 text-center shadow-[0_0_60px_rgba(245,158,11,0.3)]"
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
                      👹 Krupiye (Dealer)
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
                  🔄 Yeni Düello (Profil Seç)
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
    </motion.div>
  );
}
