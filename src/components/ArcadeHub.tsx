"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Gamepad2,
  Trophy,
  Users,
  Volume2,
  VolumeX,
  Play,
  Crown,
  Swords,
  Sparkles,
  Tv,
} from "lucide-react";
import {
  ALL_GAME_KEYS,
  FRAME_THEMES,
  getOverallRankTitle,
  subscribeActivityFeedRealtime,
  subscribeAllPlayersRealtime,
  type ActivityFeedEvent,
  type GameKey,
  type MultiplayerSeat,
  type PlayerDoc,
} from "@/lib/firestore";
import { initAnalytics } from "@/lib/firebase";
import { sound } from "@/lib/sound";
import ProfileGateModal, {
  type GameLaunchSession,
} from "./profile/ProfileGateModal";
import PlayerDetailModal from "./profile/PlayerDetailModal";
import LeaderboardHub from "./leaderboard/LeaderboardHub";
import BlockBlastView from "@/games/block-blast/BlockBlastView";
import ChessView from "@/games/chess/ChessView";
import BilliardsView from "@/games/billiards/BilliardsView";
import SolitaireView from "@/games/solitaire/SolitaireView";
import SudokuView from "@/games/sudoku/SudokuView";
import ChainReactionView from "@/games/chain-reaction/ChainReactionView";
import LudoView from "@/games/ludo/LudoView";
import DotsSosView from "@/games/dots-sos/DotsSosView";
import TanksView from "@/games/tanks/TanksView";
import MemoryMatchView from "@/games/memory-match/MemoryMatchView";
import BuckshotView from "@/games/buckshot/BuckshotView";
import LiarsRouletteView from "@/games/liars-roulette/LiarsRouletteView";
import WireRouletteView from "@/games/wire-roulette/WireRouletteView";

interface GameCardConfig {
  key: GameKey;
  title: string;
  icon: string;
  badge: string;
  category: "psychological" | "smartboard" | "classic";
  playerCountTag: string;
  description: string;
  gradient: string;
  borderGlow: string;
}

const SPRING_LIQUID = {
  type: "spring" as const,
  stiffness: 380,
  damping: 28,
};

const ARCADE_GAMES: GameCardConfig[] = [
  // --- 3 YENİ YÜKSEK GERİLİMLİ PSİKOLOJİK DÜELLO OYUNU ---
  {
    key: "buckshot",
    title: "3D Buckshot Roulette",
    icon: "🔫",
    badge: "Three.js 3D • 1-4 Kişilik Sekizgen Masa",
    category: "psychological",
    playerCountTag: "Krupiye AI • 2P Düello • 3-4P Masa",
    description:
      "Tam 3D yeraltı odası, 1-2 kişilik düello veya 3-4 kişilik sekizgen masa, döner tüfek halkası, 4 ikonik maske ve 3D demir eşya sandığı!",
    gradient: "from-red-600/35 via-amber-900/25 to-stone-950/95",
    borderGlow: "hover:border-red-400/75",
  },
  {
    key: "liarsRoulette",
    title: "Blöf Ruleti (Liar's Table)",
    icon: "💀",
    badge: "Gizli Zar Kupası • Altıpatlar",
    category: "psychological",
    playerCountTag: "2-4 Kişilik Psikolojik Masa",
    description:
      "Kupanın altındaki 5 zara gizlice bak, iddiayı yükselt ya da 'YALANCI! KUPALARI AÇ!' diyerek rakibine tetik çektir!",
    gradient: "from-amber-600/30 via-stone-800/25 to-stone-950/95",
    borderGlow: "hover:border-amber-400/75",
  },
  {
    key: "wireRoulette",
    title: "Yüksek Gerilim (Kablo Ruleti)",
    icon: "⚡",
    badge: "8 Gergin Kablo • Voltmetre",
    category: "psychological",
    playerCountTag: "1-2 Kişilik Gerilim Düellosu",
    description:
      "3 Patlayıcı Faz, 4 Boş Hat, 1 Aşırı Yük! Yan keskiyle kabloları kes; Voltmetre, Çift Kesim ve İzolatör Eldiven kullan!",
    gradient: "from-yellow-500/25 via-rose-900/20 to-slate-950/95",
    borderGlow: "hover:border-yellow-400/75",
  },
  // --- 5 AKILLI TAHTA (2-4 KİŞİ) OYUNU ---
  {
    key: "chainReaction",
    title: "Chain Reaction (Zincirleme)",
    icon: "⚛️",
    badge: "10x6 Izgara • Kritik Kütle",
    category: "smartboard",
    playerCountTag: "2-4 Kişilik Akıllı Tahta",
    description:
      "Titreyen 3D atom küreleri, komşu kareleri kendi rengine çeviren zincirleme patlama dalgaları!",
    gradient: "from-sky-500/25 via-blue-600/15 to-slate-900/90",
    borderGlow: "hover:border-sky-400/60",
  },
  {
    key: "ludo",
    title: "Hızlı Kızma Birader",
    icon: "🎲",
    badge: "Teneffüs Modu (2 Piyon)",
    category: "smartboard",
    playerCountTag: "2-4 Kişilik Akıllı Tahta",
    description:
      "10 dk teneffüse uygun 2 piyonlu hızlı kurallar, 3D zar kulesi, yıldızlı güvenli kareler ve taş kırma şovu!",
    gradient: "from-amber-500/25 via-orange-600/15 to-slate-900/90",
    borderGlow: "hover:border-amber-400/60",
  },
  {
    key: "dotsSos",
    title: "Kare Kapmaca & SOS Arenası",
    icon: "✨",
    badge: "Çift Modlu • Lazer Çizgi",
    category: "smartboard",
    playerCountTag: "2-4 Kişilik Akıllı Tahta",
    description:
      "İster neon çizgilerle kareleri avatarınla mühürle, ister S-O-S dizip parlayan lazerlerle kombo yap!",
    gradient: "from-fuchsia-500/25 via-purple-600/15 to-slate-900/90",
    borderGlow: "hover:border-fuchsia-400/60",
  },
  {
    key: "tanks",
    title: "Topçu Tanklar (Worms Tarzı)",
    icon: "💥",
    badge: "Parçalanabilir Arazi • Sapan",
    category: "smartboard",
    playerCountTag: "2-4 Kişilik Akıllı Tahta",
    description:
      "Gerçek zamanlı krater açan mermiler, rüzgar fiziği, 3'lü saçma, zıplayan bomba ve tek parmakla sapan nişanı!",
    gradient: "from-rose-500/25 via-red-600/15 to-slate-900/90",
    borderGlow: "hover:border-rose-400/60",
  },
  {
    key: "memoryMatch",
    title: "Hafıza Arenası (Eşleştirme)",
    icon: "🧠",
    badge: "6x4 & 8x4 • 3D Kart Çevirme",
    category: "smartboard",
    playerCountTag: "2-4 Kişilik Akıllı Tahta",
    description:
      "Geniş ekran 3D vektörel kartlar, 900ms sıra kilidi; eşleşme bulan oyuncu kombo çarpanıyla oynamaya devam eder!",
    gradient: "from-emerald-500/25 via-teal-600/15 to-slate-900/90",
    borderGlow: "hover:border-emerald-400/60",
  },
  // --- MEVCUT 5 KLASİK & DÜELLO OYUNU ---
  {
    key: "blockBlast",
    title: "Block Blast",
    icon: "🧱",
    badge: "Bulmaca & Kombo",
    category: "classic",
    playerCountTag: "Tek Kişilik Rekor",
    description:
      "3D jel/akrilik bloklar, hıza duyarlı sürükleme, domino patlama ve kıvılcım fiziği!",
    gradient: "from-cyan-500/25 via-indigo-600/15 to-slate-900/90",
    borderGlow: "hover:border-cyan-400/60",
  },
  {
    key: "chess",
    title: "Satranç",
    icon: "♟️",
    badge: "Yapay Zeka & 2 Kişilik Düello",
    category: "classic",
    playerCountTag: "1-2 Kişilik Düello",
    description:
      "Lichess Staunton turnuva taşları, kayan hamleler, Minimax AI veya saatli sınıf düellosu!",
    gradient: "from-amber-500/25 via-yellow-600/15 to-slate-900/90",
    borderGlow: "hover:border-amber-400/60",
  },
  {
    key: "billiards",
    title: "Bilardo (8-Top)",
    icon: "🎱",
    badge: "3D Işıklı Küre & 2 Kişilik",
    category: "classic",
    playerCountTag: "1-2 Kişilik Düello",
    description:
      "4x alt-adımlı fizik, speküler 3D top ışıklandırması, yaylı istaka ve 8-Top düellosu!",
    gradient: "from-emerald-500/25 via-green-600/15 to-slate-900/90",
    borderGlow: "hover:border-emerald-400/60",
  },
  {
    key: "solitaire",
    title: "Solitaire",
    icon: "🃏",
    badge: "3D Kart & Zafer Şelalesi",
    category: "classic",
    playerCountTag: "Tek Kişilik Rekor",
    description:
      "Keskin vektörel kartlar, 3D çevirme, yaylı uçuş, otomatik tamamlama ve zafer şelalesi!",
    gradient: "from-rose-500/25 via-pink-600/15 to-slate-900/90",
    borderGlow: "hover:border-rose-400/60",
  },
  {
    key: "sudoku",
    title: "Sudoku",
    icon: "🔢",
    badge: "4 Zorluk • Işık Dalgası",
    category: "classic",
    playerCountTag: "Tek Kişilik Rekor",
    description:
      "Benzersiz 9x9 üretici, kalem/not modu, satır-kutu tamamlama parıltı dalgası!",
    gradient: "from-indigo-500/25 via-purple-600/15 to-slate-900/90",
    borderGlow: "hover:border-indigo-400/60",
  },
];

const NAV_ITEMS: {
  key: "arcade" | "leaderboard" | "profiles";
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  pillClass: string;
  textActiveClass: string;
}[] = [
  {
    key: "arcade",
    label: "13 Oyun",
    Icon: Gamepad2,
    pillClass: "bg-indigo-600 shadow-[0_0_16px_rgba(99,102,241,0.55)]",
    textActiveClass: "text-white",
  },
  {
    key: "leaderboard",
    label: "Sıralama",
    Icon: Trophy,
    pillClass: "bg-amber-400 shadow-[0_0_16px_rgba(251,191,36,0.55)]",
    textActiveClass: "text-slate-950",
  },
  {
    key: "profiles",
    label: "Profiller",
    Icon: Users,
    pillClass: "bg-fuchsia-600 shadow-[0_0_16px_rgba(217,70,239,0.55)]",
    textActiveClass: "text-white",
  },
];

export default function ArcadeHub() {
  const [navSection, setNavSection] = useState<
    "arcade" | "leaderboard" | "profiles"
  >("arcade");
  const [filterCategory, setFilterCategory] = useState<
    "all" | "psychological" | "smartboard" | "classic"
  >("all");

  // Aktif çalışan oyun oturumu (Sadece RAM'de tutulur; kesinlikle localStorage/cookie kullanılmaz!)
  const [activeSession, setActiveSession] = useState<GameLaunchSession | null>(
    null
  );
  const [sessionInstanceId, setSessionInstanceId] = useState(0);

  // Kombo enerjisi arttıkça dinamik arka plan aurora ışığı canlanır
  const [comboEnergy, setComboEnergy] = useState(0);

  // Zorunlu Profil Kapısı durumu
  const [gateTargetGame, setGateTargetGame] = useState<GameKey | null>(null);

  // Detaylı Oyuncu Kartı Modalı
  const [inspectedPlayer, setInspectedPlayer] = useState<PlayerDoc | null>(
    null
  );

  // Firestore Canlı Verileri
  const [players, setPlayers] = useState<PlayerDoc[]>([]);
  const [feedEvents, setFeedEvents] = useState<ActivityFeedEvent[]>([]);
  const [connStatus, setConnStatus] = useState<"connected" | "offline">(
    "connected"
  );
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    setMuted(sound.isMuted());
    initAnalytics().catch(() => {});

    const unsubPlayers = subscribeAllPlayersRealtime((list) => {
      setPlayers(list);
    }, setConnStatus);

    const unsubFeed = subscribeActivityFeedRealtime((events) => {
      setFeedEvents(events);
    });

    return () => {
      unsubPlayers();
      unsubFeed();
    };
  }, []);

  const handleComboEnergy = useCallback((comboLevel: number) => {
    setComboEnergy(Math.min(6, Math.max(0, comboLevel)));
  }, []);

  // Her oyunun o anki #1 Sınıf Liderini güvenli şekilde hesapla
  const gameChampions = useMemo(() => {
    const map = {} as Record<GameKey, PlayerDoc | null>;
    for (const gKey of ALL_GAME_KEYS) {
      let best: PlayerDoc | null = null;
      for (const p of players) {
        const sc = p.games?.[gKey]?.highScore ?? 0;
        if (sc > 0 && (!best || sc > (best.games?.[gKey]?.highScore ?? 0))) {
          best = p;
        }
      }
      map[gKey] = best;
    }
    return map;
  }, [players]);

  const filteredGames = useMemo(() => {
    if (filterCategory === "all") return ARCADE_GAMES;
    return ARCADE_GAMES.filter((g) => g.category === filterCategory);
  }, [filterCategory]);

  const openProfileGateForGame = (gameKey: GameKey) => {
    sound.playClick();
    setGateTargetGame(gameKey);
  };

  const handleConfirmLaunch = (session: GameLaunchSession) => {
    setGateTargetGame(null);
    setComboEnergy(0);
    setSessionInstanceId((n) => n + 1);
    setActiveSession(session);
  };

  const handleExitGameToHub = () => {
    sound.playClick();
    setComboEnergy(0);
    setActiveSession(null);
  };

  // Oyun içinden "Yeni Oyun Başlat" denildiğinde aktif oturumu kapatıp tekrar Zorunlu Profil Kapısını açar!
  const handleRestartViaGate = () => {
    if (!activeSession) return;
    const gameToReopen = activeSession.game;
    setComboEnergy(0);
    setActiveSession(null);
    setGateTargetGame(gameToReopen);
  };

  const handleToggleSound = () => {
    setMuted(sound.toggleMute());
  };

  // Aktif oyun içindeki oyuncuların güncel kopyalarını canlı listeden bul
  const syncedP1 = activeSession
    ? players.find((p) => p.id === activeSession.player1.id) ??
      activeSession.player1
    : null;
  const syncedP2 = activeSession?.player2
    ? players.find((p) => p.id === activeSession.player2!.id) ??
      activeSession.player2
    : undefined;

  const syncedSeats: MultiplayerSeat[] = useMemo(() => {
    if (!activeSession?.seats) return [];
    return activeSession.seats.map((seat) => {
      if (seat.isBot) return seat;
      const fresh = players.find((p) => p.id === seat.player.id);
      return fresh ? { ...seat, player: fresh } : seat;
    });
  }, [activeSession?.seats, players]);

  const auroraBoost = 1 + comboEnergy * 0.14;
  const auroraOpacityTop = Math.min(0.55, 0.22 + comboEnergy * 0.06);
  const auroraOpacityBottom = Math.min(0.5, 0.17 + comboEnergy * 0.055);

  return (
    <div
      className={`relative flex h-dvh w-full flex-col items-center overflow-hidden select-none px-2.5 py-2 sm:px-4 sm:py-3 ${
        activeSession ? "touch-none" : ""
      }`}
    >
      {/* Dinamik GPU Hızlandırmalı Neon / Aurora Ortam Işığı */}
      <motion.div
        animate={{
          x: [-24, 28, -24],
          y: [-10, 18, -10],
          scale: [auroraBoost, auroraBoost * 1.08, auroraBoost],
          opacity: auroraOpacityTop,
        }}
        transition={{
          x: { repeat: Infinity, duration: 14, ease: "easeInOut" },
          y: { repeat: Infinity, duration: 11, ease: "easeInOut" },
          scale: { duration: 0.45 },
          opacity: { duration: 0.45 },
        }}
        className={`pointer-events-none absolute -top-28 left-1/4 h-80 w-[28rem] rounded-full blur-[115px] will-change-transform ${
          comboEnergy >= 3
            ? "bg-amber-500"
            : comboEnergy >= 1
            ? "bg-cyan-400"
            : "bg-indigo-600"
        }`}
      />
      <motion.div
        animate={{
          x: [24, -30, 24],
          y: [12, -16, 12],
          scale: [auroraBoost, auroraBoost * 1.1, auroraBoost],
          opacity: auroraOpacityBottom,
        }}
        transition={{
          x: { repeat: Infinity, duration: 16, ease: "easeInOut" },
          y: { repeat: Infinity, duration: 13, ease: "easeInOut" },
          scale: { duration: 0.45 },
          opacity: { duration: 0.45 },
        }}
        className={`pointer-events-none absolute -bottom-28 right-1/5 h-80 w-96 rounded-full blur-[115px] will-change-transform ${
          comboEnergy >= 3 ? "bg-rose-500" : "bg-fuchsia-600"
        }`}
      />

      {/* ÜST BAR (Oyun içindeyken akıllı tahtada daha fazla alan bırakmak için kompaktlaşır) */}
      {!activeSession && (
        <header className="relative z-20 flex w-full max-w-6xl items-center justify-between gap-2 pb-2 shrink-0">
          <motion.button
            type="button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.95 }}
            transition={SPRING_LIQUID}
            onClick={() => {
              sound.playClick();
              setComboEnergy(0);
              setActiveSession(null);
              setNavSection("arcade");
            }}
            className="flex items-center gap-2.5 text-left cursor-pointer"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 via-indigo-500 to-fuchsia-600 text-xl shadow-[0_0_22px_rgba(99,102,241,0.5)]">
              🕹️
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="text-sm sm:text-lg font-black tracking-tight text-white">
                  12-E Sınıf Oyun Merkezi
                </h1>
                <span className="hidden sm:inline-block rounded-full bg-indigo-500/25 border border-indigo-400/35 px-2.5 py-0.5 text-[10px] font-black text-indigo-300">
                  13 OYUN • AKILLI TAHTA & PSİKOLOJİK DÜELLO
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden xs:block">
                Buckshot Roulette • Akıllı Tahta Oyunları • Hayalet PIN Koruması
              </p>
            </div>
          </motion.button>

          {/* Orta / Sağ Navigasyon + Ses Aç/Kapat */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <div className="flex items-center gap-1 rounded-2xl border border-white/12 bg-slate-900/85 p-1 backdrop-blur-md">
              {NAV_ITEMS.map((item) => {
                const isActive = navSection === item.key;
                const IconComp = item.Icon;
                return (
                  <motion.button
                    key={item.key}
                    type="button"
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.94 }}
                    transition={SPRING_LIQUID}
                    onClick={() => {
                      sound.playClick();
                      setNavSection(item.key);
                    }}
                    className={`relative min-h-[44px] flex items-center gap-1.5 rounded-xl px-3 sm:px-4 py-1.5 text-xs font-extrabold transition-colors cursor-pointer ${
                      isActive
                        ? item.textActiveClass
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="hubNavPill"
                        transition={SPRING_LIQUID}
                        className={`absolute inset-0 rounded-xl ${item.pillClass}`}
                      />
                    )}
                    <span className="relative z-10 flex items-center gap-1.5">
                      <IconComp className="h-4 w-4" />
                      <span className="hidden md:inline">{item.label}</span>
                    </span>
                  </motion.button>
                );
              })}
            </div>

            <motion.button
              type="button"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.92 }}
              transition={SPRING_LIQUID}
              onClick={handleToggleSound}
              aria-label={muted ? "Sesi Aç" : "Sesi Kapat"}
              title={muted ? "Sesi Aç" : "Sesi Kapat"}
              className="flex h-[48px] w-[48px] items-center justify-center rounded-2xl border border-white/12 bg-slate-900/85 hover:bg-slate-800 text-slate-200 transition cursor-pointer"
            >
              {muted ? (
                <VolumeX className="h-5 w-5 text-rose-400" />
              ) : (
                <Volume2 className="h-5 w-5 text-cyan-300" />
              )}
            </motion.button>
          </div>
        </header>
      )}

      {/* ANA GÖVDE */}
      {activeSession && syncedP1 ? (
        <motion.main
          key={`${activeSession.game}_${sessionInstanceId}`}
          initial={{ opacity: 0, scale: 0.97, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={SPRING_LIQUID}
          className="relative z-10 flex flex-1 w-full items-center justify-center min-h-0 overflow-hidden"
        >
          {/* MEVCUT 5 OYUN */}
          {activeSession.game === "blockBlast" && (
            <BlockBlastView
              player={syncedP1}
              allPlayers={players}
              onBackToHub={handleExitGameToHub}
              onRequestNewGameWithGate={handleRestartViaGate}
              onComboEnergyChange={handleComboEnergy}
            />
          )}

          {activeSession.game === "chess" && (
            <ChessView
              mode={activeSession.mode === "duel" ? "duel" : "solo"}
              player1={syncedP1}
              player2={syncedP2}
              allPlayers={players}
              onBackToHub={handleExitGameToHub}
              onRequestNewGameWithGate={handleRestartViaGate}
            />
          )}

          {activeSession.game === "billiards" && (
            <BilliardsView
              mode={activeSession.mode === "duel" ? "duel" : "solo"}
              player1={syncedP1}
              player2={syncedP2}
              allPlayers={players}
              onBackToHub={handleExitGameToHub}
              onRequestNewGameWithGate={handleRestartViaGate}
              onComboEnergyChange={handleComboEnergy}
            />
          )}

          {activeSession.game === "solitaire" && (
            <SolitaireView
              player={syncedP1}
              allPlayers={players}
              onBackToHub={handleExitGameToHub}
              onRequestNewGameWithGate={handleRestartViaGate}
            />
          )}

          {activeSession.game === "sudoku" && (
            <SudokuView
              player={syncedP1}
              allPlayers={players}
              onBackToHub={handleExitGameToHub}
              onRequestNewGameWithGate={handleRestartViaGate}
            />
          )}

          {/* YENİ 5 AKILLI TAHTA ÇOK OYUNCULU (2-4 KİŞİ) OYUN */}
          {activeSession.game === "chainReaction" &&
            syncedSeats.length >= 2 && (
              <ChainReactionView
                seats={syncedSeats}
                onBackToHub={handleExitGameToHub}
                onRequestNewGameWithGate={handleRestartViaGate}
                onComboEnergyChange={handleComboEnergy}
              />
            )}

          {activeSession.game === "ludo" && syncedSeats.length >= 2 && (
            <LudoView
              seats={syncedSeats}
              initialSubMode={activeSession.subMode}
              onBackToHub={handleExitGameToHub}
              onRequestNewGameWithGate={handleRestartViaGate}
              onComboEnergyChange={handleComboEnergy}
            />
          )}

          {activeSession.game === "dotsSos" && syncedSeats.length >= 2 && (
            <DotsSosView
              seats={syncedSeats}
              initialSubMode={activeSession.subMode}
              onBackToHub={handleExitGameToHub}
              onRequestNewGameWithGate={handleRestartViaGate}
              onComboEnergyChange={handleComboEnergy}
            />
          )}

          {activeSession.game === "tanks" && syncedSeats.length >= 2 && (
            <TanksView
              seats={syncedSeats}
              onBackToHub={handleExitGameToHub}
              onRequestNewGameWithGate={handleRestartViaGate}
              onComboEnergyChange={handleComboEnergy}
            />
          )}

          {activeSession.game === "memoryMatch" && syncedSeats.length >= 2 && (
            <MemoryMatchView
              seats={syncedSeats}
              initialSubMode={activeSession.subMode}
              onBackToHub={handleExitGameToHub}
              onRequestNewGameWithGate={handleRestartViaGate}
              onComboEnergyChange={handleComboEnergy}
            />
          )}

          {/* YENİ 3 YÜKSEK GERİLİMLİ PSİKOLOJİK DÜELLO OYUNU */}
          {activeSession.game === "buckshot" && (
            <BuckshotView
              mode={activeSession.mode}
              player1={syncedP1}
              player2={syncedP2}
              seats={syncedSeats}
              initialSubMode={activeSession.subMode}
              allPlayers={players}
              onBackToHub={handleExitGameToHub}
              onRequestNewGameWithGate={handleRestartViaGate}
              onComboEnergyChange={handleComboEnergy}
            />
          )}

          {activeSession.game === "liarsRoulette" &&
            syncedSeats.length >= 2 && (
              <LiarsRouletteView
                seats={syncedSeats}
                onBackToHub={handleExitGameToHub}
                onRequestNewGameWithGate={handleRestartViaGate}
                onComboEnergyChange={handleComboEnergy}
              />
            )}

          {activeSession.game === "wireRoulette" && (
            <WireRouletteView
              mode={activeSession.mode === "duel" ? "duel" : "solo"}
              player1={syncedP1}
              player2={syncedP2}
              allPlayers={players}
              onBackToHub={handleExitGameToHub}
              onRequestNewGameWithGate={handleRestartViaGate}
              onComboEnergyChange={handleComboEnergy}
            />
          )}
        </motion.main>
      ) : (
        <main className="relative z-10 flex-1 w-full max-w-6xl overflow-y-auto pr-0.5 pb-6 min-h-0">
          <AnimatePresence mode="wait">
            {navSection === "arcade" ? (
              <motion.div
                key="sec-arcade"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={SPRING_LIQUID}
                className="space-y-3.5"
              >
                {/* Canlı Akış Kayan Bant + Kategori Filtresi */}
                <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2.5">
                  <div className="flex-1 overflow-hidden rounded-2xl border border-amber-400/25 bg-slate-900/85 backdrop-blur-md">
                    <div className="flex items-center gap-2.5 px-3.5 py-2">
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-amber-500/20 border border-amber-400/35 px-2 py-0.5 text-[10px] font-black uppercase text-amber-300">
                        <Sparkles className="h-3 w-3" /> Canlı Akış
                      </span>
                      <div className="relative flex-1 overflow-hidden whitespace-nowrap">
                        {feedEvents.length > 0 ? (
                          <motion.div
                            animate={{ x: ["0%", "-50%"] }}
                            transition={{
                              repeat: Infinity,
                              ease: "linear",
                              duration: Math.max(18, feedEvents.length * 5.5),
                            }}
                            className="inline-flex items-center gap-8 text-xs font-semibold text-slate-200 will-change-transform"
                          >
                            {[...feedEvents, ...feedEvents].map((ev, i) => (
                              <span
                                key={`${ev.id}-${i}`}
                                className="inline-flex items-center gap-1.5"
                              >
                                <span>{ev.avatar || "🔥"}</span>
                                <span>{ev.message}</span>
                                <span className="text-amber-400/60">•</span>
                              </span>
                            ))}
                          </motion.div>
                        ) : (
                          <span className="text-xs text-slate-400">
                            10 oyun hazır! Akıllı tahta veya bireysel oyunlardan
                            birini seçip rekor kır.
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Kategori Seçici Haplar */}
                  <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-white/12 bg-slate-900/85 p-1 shrink-0">
                    {[
                      { key: "all", label: "🔥 Tüm Oyunlar (13)" },
                      {
                        key: "psychological",
                        label: "💀 Psikolojik Düello (3)",
                      },
                      {
                        key: "smartboard",
                        label: "🖥️ Akıllı Tahta (5)",
                      },
                      { key: "classic", label: "🎮 Klasik & Düello (5)" },
                    ].map((tab) => {
                      const active = filterCategory === tab.key;
                      return (
                        <button
                          key={tab.key}
                          type="button"
                          onClick={() => {
                            sound.playClick();
                            setFilterCategory(
                              tab.key as
                                | "all"
                                | "psychological"
                                | "smartboard"
                                | "classic"
                            );
                          }}
                          className={`min-h-[40px] rounded-xl px-3 py-1.5 text-xs font-extrabold transition cursor-pointer ${
                            active
                              ? "bg-gradient-to-r from-cyan-500 to-indigo-600 text-white shadow"
                              : "text-slate-400 hover:text-white"
                          }`}
                        >
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 10 Oyun Kartı Izgarası */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {filteredGames.map((g, idx) => {
                    const champ = gameChampions[g.key];
                    const champScore = champ?.games?.[g.key]?.highScore ?? 0;
                    const isSmartboard = g.category === "smartboard";

                    return (
                      <motion.div
                        key={g.key}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                          ...SPRING_LIQUID,
                          delay: idx * 0.025,
                        }}
                        whileHover={{ y: -3, scale: 1.01 }}
                        className={`flex flex-col justify-between rounded-3xl border border-white/12 bg-gradient-to-br ${g.gradient} ${g.borderGlow} p-4 shadow-xl transition-colors will-change-transform`}
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950/70 border border-white/10 text-2xl shadow-inner">
                              {g.icon}
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              <span
                                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black ${
                                  isSmartboard
                                    ? "bg-cyan-500/20 border-cyan-400/40 text-cyan-200"
                                    : "bg-amber-500/20 border-amber-400/35 text-amber-200"
                                }`}
                              >
                                {isSmartboard ? (
                                  <Tv className="h-3 w-3" />
                                ) : (
                                  <Swords className="h-3 w-3" />
                                )}
                                {g.playerCountTag}
                              </span>
                              <span className="rounded-full border border-white/15 bg-slate-950/60 px-2 py-0.5 text-[9px] font-extrabold text-slate-300">
                                {g.badge}
                              </span>
                            </div>
                          </div>

                          <h2 className="mt-2.5 text-base font-black text-white">
                            {g.title}
                          </h2>
                          <p className="mt-1 text-[11px] leading-relaxed text-slate-300 line-clamp-2">
                            {g.description}
                          </p>
                        </div>

                        <div className="mt-3 pt-2.5 border-t border-white/10 space-y-2.5">
                          {/* Bu Oyunun Sınıf Şampiyonu */}
                          <div className="flex items-center justify-between text-xs">
                            <span className="inline-flex items-center gap-1 text-slate-400 font-semibold">
                              <Crown className="h-3.5 w-3.5 text-amber-400" />{" "}
                              Lider:
                            </span>
                            {champ ? (
                              <button
                                type="button"
                                onClick={() => setInspectedPlayer(champ)}
                                className="inline-flex items-center gap-1 font-extrabold text-amber-300 hover:underline cursor-pointer"
                              >
                                <span>{champ.avatar}</span>
                                <span className="truncate max-w-[95px]">
                                  {champ.name}
                                </span>
                                <span className="tabular-nums text-white">
                                  ({champScore.toLocaleString("tr-TR")})
                                </span>
                              </button>
                            ) : (
                              <span className="text-slate-500 italic text-[11px]">
                                Henüz rekor yok
                              </span>
                            )}
                          </div>

                          <motion.button
                            type="button"
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.95 }}
                            transition={SPRING_LIQUID}
                            onClick={() => openProfileGateForGame(g.key)}
                            className="w-full min-h-[52px] flex items-center justify-center gap-2 rounded-2xl bg-white/14 hover:bg-white/22 border border-white/20 py-2.5 text-xs sm:text-sm font-black text-white shadow transition-colors cursor-pointer"
                          >
                            <Play className="h-4 w-4 fill-current" /> Oyna
                            (Profil Seç)
                          </motion.button>
                        </div>
                      </motion.div>
                    );
                  })}

                  {/* Genel Sınıf Sıralaması Hızlı Özet Kartı */}
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...SPRING_LIQUID, delay: 0.18 }}
                    whileHover={{ y: -3, scale: 1.01 }}
                    className="flex flex-col justify-between rounded-3xl border border-amber-400/35 bg-gradient-to-br from-amber-500/20 via-slate-900/90 to-fuchsia-900/25 p-4 shadow-xl will-change-transform xl:col-span-2"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-2xl">🏆</span>
                        <span className="rounded-full bg-amber-500/20 border border-amber-400/40 px-2.5 py-0.5 text-[10px] font-black text-amber-300">
                          13 OYUN TOPLAMI • CANLI LİDERLİK
                        </span>
                      </div>
                      <h2 className="mt-2 text-base font-black text-white">
                        Genel Sınıf Krallığı (13 Oyun Rekor Toplamı)
                      </h2>
                      <p className="mt-0.5 text-xs text-slate-300">
                        Psikolojik düello, akıllı tahta ve klasik oyunlardaki en
                        yüksek rekorlarının toplamı Genel Sınıf Sıralamanı
                        belirler!
                      </p>

                      <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {players.slice(0, 3).map((p, idx) => (
                          <motion.button
                            key={p.id}
                            type="button"
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.96 }}
                            onClick={() => setInspectedPlayer(p)}
                            className="flex items-center justify-between rounded-xl bg-slate-950/70 border border-white/10 px-3 py-2 text-xs hover:border-amber-400/40 transition-colors cursor-pointer"
                          >
                            <span className="flex items-center gap-1.5 font-bold text-white truncate">
                              <span>
                                {idx === 0 ? "👑" : idx === 1 ? "🥈" : "🥉"}
                              </span>
                              <span>{p.avatar}</span>
                              <span className="truncate">{p.name}</span>
                            </span>
                            <span className="font-black text-amber-300 tabular-nums ml-1">
                              {(p.overallBestScore ?? 0).toLocaleString(
                                "tr-TR"
                              )}{" "}
                              P
                            </span>
                          </motion.button>
                        ))}
                      </div>
                    </div>

                    <motion.button
                      type="button"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.95 }}
                      transition={SPRING_LIQUID}
                      onClick={() => {
                        sound.playClick();
                        setNavSection("leaderboard");
                      }}
                      className="mt-3 min-h-[52px] w-full flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 py-2.5 text-xs sm:text-sm font-black text-slate-950 shadow cursor-pointer"
                    >
                      <Trophy className="h-4 w-4" /> 🏆 Genel Toplam + 10 Oyun
                      Sıralamasını Aç
                    </motion.button>
                  </motion.div>
                </div>
              </motion.div>
            ) : navSection === "leaderboard" ? (
              <motion.div
                key="sec-leaderboard"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={SPRING_LIQUID}
                className="flex justify-center"
              >
                <LeaderboardHub
                  players={players}
                  events={feedEvents}
                  connectionStatus={connStatus}
                  onSelectPlayer={(p) => setInspectedPlayer(p)}
                />
              </motion.div>
            ) : (
              /* Sınıf Profilleri Dizini */
              <motion.div
                key="sec-profiles"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={SPRING_LIQUID}
                className="space-y-3"
              >
                <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3">
                  <div>
                    <h2 className="text-base font-black text-white">
                      12-E Sınıf Profilleri ({players.length})
                    </h2>
                    <p className="text-xs text-slate-400">
                      Herhangi bir arkadaşının kartına tıklayarak 10 oyundaki
                      tüm rekorlarını inceleyebilirsin.
                    </p>
                  </div>
                </div>

                {players.length === 0 ? (
                  <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-10 text-center text-sm text-slate-400">
                    Henüz oluşturulmuş profil yok. Herhangi bir oyunda
                    &ldquo;Oyna&rdquo; butonuna tıklayarak ilk profili
                    oluşturabilirsin!
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {players.map((p, idx) => {
                      const frame = FRAME_THEMES[p.frameColor];
                      const rankMeta = getOverallRankTitle(
                        p.overallBestScore ?? 0
                      );
                      return (
                        <motion.button
                          key={p.id}
                          type="button"
                          whileHover={{ scale: 1.02, y: -2 }}
                          whileTap={{ scale: 0.96 }}
                          transition={SPRING_LIQUID}
                          onClick={() => setInspectedPlayer(p)}
                          className="flex items-center justify-between rounded-2xl border border-white/12 bg-slate-900/85 hover:bg-slate-800/90 hover:border-indigo-400/50 p-3.5 text-left transition-colors cursor-pointer"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div
                              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${frame.bgClass} ${frame.ringClass} text-2xl`}
                            >
                              {p.avatar}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-black text-amber-300">
                                  #{idx + 1}
                                </span>
                                <span className="truncate text-sm font-black text-white">
                                  {p.name}
                                </span>
                              </div>
                              <div
                                className={`text-[11px] font-bold ${rankMeta.colorClass}`}
                              >
                                {rankMeta.title}
                              </div>
                              <div className="truncate text-[11px] italic text-slate-400">
                                &ldquo;{p.statusText}&rdquo;
                              </div>
                            </div>
                          </div>

                          <div className="text-right shrink-0 pl-2">
                            <div className="text-sm font-black text-white tabular-nums">
                              {(p.overallBestScore ?? 0).toLocaleString(
                                "tr-TR"
                              )}
                            </div>
                            <div className="text-[10px] text-cyan-300 font-semibold">
                              10 Oyun P
                            </div>
                          </div>
                        </motion.button>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      )}

      {/* ZORUNLU PROFİL SEÇİM KAPISI (Oturum Hatırlanmaz — Her Oyunda Sorulur) */}
      <ProfileGateModal
        isOpen={Boolean(gateTargetGame)}
        targetGame={gateTargetGame}
        players={players}
        onCancel={() => setGateTargetGame(null)}
        onConfirmLaunch={handleConfirmLaunch}
      />

      {/* DETAYLI OYUNCU KARTI VE PIN DOĞRULAMALI PROFİL GÜNCELLEME */}
      <PlayerDetailModal
        player={inspectedPlayer}
        allPlayers={players}
        onClose={() => setInspectedPlayer(null)}
      />
    </div>
  );
}
