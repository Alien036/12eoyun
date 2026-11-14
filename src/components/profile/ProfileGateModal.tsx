"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users,
  UserPlus,
  Lock,
  Search,
  ChevronLeft,
  Check,
  Swords,
  Bot,
  X,
  Sparkles,
  Zap,
  ShieldAlert,
  Delete,
  Shuffle,
} from "lucide-react";
import {
  AVATAR_OPTIONS,
  FRAME_THEMES,
  GAME_LABELS,
  SMARTBOARD_SLOTS,
  createBotPlayerDoc,
  createClassProfile,
  getOverallRankTitle,
  isSmartboardMultiplayerGame,
  verifyAndSelectProfile,
  type FrameColorKey,
  type GameKey,
  type MultiplayerSeat,
  type PlayerDoc,
} from "@/lib/firestore";
import { sound } from "@/lib/sound";

export interface GameLaunchSession {
  game: GameKey;
  mode: "solo" | "duel" | "multiplayer";
  player1: PlayerDoc;
  player2?: PlayerDoc;
  seats?: MultiplayerSeat[];
  subMode?: string;
}

interface ProfileGateModalProps {
  isOpen: boolean;
  targetGame: GameKey | null;
  players: PlayerDoc[];
  onCancel: () => void;
  onConfirmLaunch: (session: GameLaunchSession) => void;
}

const FRAME_KEYS = Object.keys(FRAME_THEMES) as FrameColorKey[];

const SPRING_GATE = {
  type: "spring" as const,
  stiffness: 380,
  damping: 28,
};

// Fisher-Yates Shuffle: 0-9 rakamlarını her açılışta kriptografik/rastgele karıştırır
export function shuffleDigitsFisherYates(): number[] {
  const arr = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

export default function ProfileGateModal({
  isOpen,
  targetGame,
  players,
  onCancel,
  onConfirmLaunch,
}: ProfileGateModalProps) {
  const isMultiArena = targetGame
    ? isSmartboardMultiplayerGame(targetGame)
    : false;
  const supportsDuel =
    targetGame === "chess" ||
    targetGame === "billiards" ||
    targetGame === "buckshot" ||
    targetGame === "wireRoulette";

  const [step, setStep] = useState<
    "mode" | "multi_setup" | "pick_player" | "vs_clash"
  >("pick_player");
  const [selectedMode, setSelectedMode] = useState<
    "solo" | "duel" | "multiplayer"
  >("solo");

  // Çok oyunculu (2-4 Kişi) Lobi Durumu
  const [targetSeatCount, setTargetSeatCount] = useState<2 | 3 | 4>(2);
  const [currentSeatIndex, setCurrentSeatIndex] = useState<number>(0);
  const [verifiedSeats, setVerifiedSeats] = useState<MultiplayerSeat[]>([]);
  const [selectedSubMode, setSelectedSubMode] = useState<string>("");

  const [subView, setSubView] = useState<"list" | "pin" | "create">("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [candidate, setCandidate] = useState<PlayerDoc | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [shuffledDigits, setShuffledDigits] = useState<number[]>(() =>
    shuffleDigitsFisherYates()
  );
  const [pinShakeKey, setPinShakeKey] = useState(0);

  // Yeni profil form durumu
  const [newName, setNewName] = useState("");
  const [newAvatar, setNewAvatar] = useState("🚀");
  const [newFrame, setNewFrame] = useState<FrameColorKey>("cyan");
  const [newStatus, setNewStatus] = useState("Rekorumu kırabilen çıkmadı!");
  const [newPin, setNewPin] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Her açılışta oturumu tamamen sıfırla (Kesinlikle hatırlama yok!)
  useEffect(() => {
    if (isOpen && targetGame) {
      const multi = isSmartboardMultiplayerGame(targetGame);
      const duelCapable =
        targetGame === "chess" ||
        targetGame === "billiards" ||
        targetGame === "buckshot" ||
        targetGame === "wireRoulette";

      if (multi) {
        setStep("multi_setup");
        setSelectedMode("multiplayer");
        setTargetSeatCount(2);
        if (targetGame === "ludo") setSelectedSubMode("fast2");
        else if (targetGame === "dotsSos") setSelectedSubMode("dots");
        else if (targetGame === "memoryMatch") setSelectedSubMode("6x4");
        else setSelectedSubMode("");
      } else if (duelCapable) {
        setStep("mode");
        setSelectedMode("solo");
        setTargetSeatCount(1 as unknown as 2);
        setSelectedSubMode(targetGame === "buckshot" ? "series3" : "");
      } else {
        setStep("pick_player");
        setSelectedMode("solo");
        setTargetSeatCount(1 as unknown as 2);
        setSelectedSubMode("");
      }

      setCurrentSeatIndex(0);
      setVerifiedSeats([]);
      setSubView(players.length > 0 ? "list" : "create");
      setSearchQuery("");
      setCandidate(null);
      setPinInput("");
      setShuffledDigits(shuffleDigitsFisherYates());
      setNewName("");
      setNewPin("");
      setError(null);
      setLoading(false);
    }
  }, [isOpen, targetGame, players.length]);

  // PIN ekranı her açıldığında rakam dizilimini Fisher-Yates ile tekrar karıştır
  useEffect(() => {
    if (subView === "pin") {
      setShuffledDigits(shuffleDigitsFisherYates());
      setPinInput("");
    }
  }, [subView, candidate?.id]);

  // VS / Çok Oyunculu Karşılaşma ekranından sonra oyunu otomatik başlat
  useEffect(() => {
    if (step !== "vs_clash" || !targetGame || verifiedSeats.length === 0) {
      return;
    }
    const timer = window.setTimeout(() => {
      if (selectedMode === "multiplayer") {
        onConfirmLaunch({
          game: targetGame,
          mode: "multiplayer",
          player1: verifiedSeats[0].player,
          player2: verifiedSeats[1]?.player,
          seats: verifiedSeats,
          subMode: selectedSubMode || undefined,
        });
      } else if (selectedMode === "duel" && verifiedSeats.length >= 2) {
        onConfirmLaunch({
          game: targetGame,
          mode: "duel",
          player1: verifiedSeats[0].player,
          player2: verifiedSeats[1].player,
          subMode: selectedSubMode || undefined,
        });
      }
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [
    step,
    targetGame,
    verifiedSeats,
    selectedMode,
    selectedSubMode,
    onConfirmLaunch,
  ]);

  const alreadySelectedMap = useMemo(() => {
    const map = new Map<string, number>();
    verifiedSeats.forEach((s) => {
      if (!s.isBot) {
        map.set(s.player.id, s.slotIndex + 1);
      }
    });
    return map;
  }, [verifiedSeats]);

  const filteredPlayers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return players.filter((p) => {
      if (!q) return true;
      return p.name.toLowerCase().includes(q);
    });
  }, [players, searchQuery]);

  const advanceOrFinishSeat = useCallback(
    (chosenPlayer: PlayerDoc, isBot: boolean) => {
      if (!targetGame) return;

      if (selectedMode === "solo") {
        sound.playClick();
        onConfirmLaunch({
          game: targetGame,
          mode: "solo",
          player1: chosenPlayer,
          subMode: selectedSubMode || undefined,
        });
        return;
      }

      const nextSeats: MultiplayerSeat[] = [
        ...verifiedSeats,
        {
          slotIndex: currentSeatIndex,
          player: chosenPlayer,
          isBot,
        },
      ];
      setVerifiedSeats(nextSeats);

      const neededTotal = selectedMode === "duel" ? 2 : targetSeatCount;

      if (nextSeats.length < neededTotal) {
        sound.playClick();
        setCurrentSeatIndex(nextSeats.length);
        setSubView(players.length > 0 ? "list" : "create");
        setCandidate(null);
        setPinInput("");
        setSearchQuery("");
        setError(null);
      } else {
        sound.playDuelClash();
        setStep("vs_clash");
      }
    },
    [
      targetGame,
      selectedMode,
      selectedSubMode,
      verifiedSeats,
      currentSeatIndex,
      targetSeatCount,
      players.length,
      onConfirmLaunch,
    ]
  );

  // 4 haneli PIN tamamlandığında veya onaylandığında doğrula
  const verifyPinCode = useCallback(
    async (codeToVerify: string) => {
      if (!candidate || codeToVerify.length !== 4 || loading) return;
      setError(null);
      setLoading(true);
      try {
        const res = await verifyAndSelectProfile(candidate, codeToVerify);
        if (!res.ok || !res.player) {
          sound.playInvalid();
          setPinShakeKey((k) => k + 1);
          setPinInput("");
          setShuffledDigits(shuffleDigitsFisherYates());
          setError(res.error || "Hatalı PIN kodu! Rakamlar yeniden karıştırıldı.");
        } else {
          advanceOrFinishSeat(res.player, false);
        }
      } finally {
        setLoading(false);
      }
    },
    [candidate, loading, advanceOrFinishSeat]
  );

  const handleGhostDigitTap = (digit: number) => {
    if (loading || pinInput.length >= 4) return;
    const nextPin = `${pinInput}${digit}`.slice(0, 4);
    setPinInput(nextPin);
    setError(null);
    if (nextPin.length === 4) {
      void verifyPinCode(nextPin);
    }
  };

  const handleGhostBackspace = () => {
    if (loading || pinInput.length === 0) return;
    setPinInput((prev) => prev.slice(0, -1));
    setError(null);
  };

  const handleCreateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await createClassProfile({
        name: newName,
        avatar: newAvatar,
        frameColor: newFrame,
        statusText: newStatus,
        pin: newPin,
      });
      if (!res.ok || !res.player) {
        sound.playInvalid();
        setError(res.error || "Profil oluşturulamadı.");
      } else {
        setNewName("");
        setNewPin("");
        advanceOrFinishSeat(res.player, false);
      }
    } finally {
      setLoading(false);
    }
  };

  if (!targetGame) return null;
  const gameMeta = GAME_LABELS[targetGame];
  const activeSlotTheme =
    SMARTBOARD_SLOTS[currentSeatIndex % SMARTBOARD_SLOTS.length];
  const neededSeats = selectedMode === "duel" ? 2 : targetSeatCount;
  const hasAtLeastOneHuman = verifiedSeats.some((s) => !s.isBot);

  const headerTitle =
    step === "mode"
      ? `${gameMeta.icon} ${gameMeta.title} — Oyun Modunu Seç`
      : step === "multi_setup"
      ? `${gameMeta.icon} ${gameMeta.title} — Akıllı Tahta Lobisi (2-4 Kişi)`
      : step === "vs_clash"
      ? selectedMode === "multiplayer"
        ? `${verifiedSeats.length} Kişilik Akıllı Tahta Arenası Başlıyor!`
        : "Sınıf Düellosu Başlıyor!"
      : selectedMode === "solo"
      ? "Kim Oynuyor? Profilini Seç"
      : `${currentSeatIndex + 1}. Oyuncu (${activeSlotTheme.colorName}): Profilini Seç`;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/92 backdrop-blur-lg p-3 sm:p-4 select-none"
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 18 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 18 }}
            transition={SPRING_GATE}
            className={`relative flex flex-col w-full ${
              step === "vs_clash" && verifiedSeats.length >= 3
                ? "max-w-2xl"
                : "max-w-lg"
            } max-h-[94dvh] overflow-hidden rounded-3xl border bg-slate-900/95 text-slate-100 ${
              step === "pick_player" && selectedMode !== "solo"
                ? activeSlotTheme.frameGlowClass
                : "border-white/15 shadow-[0_0_60px_rgba(99,102,241,0.35)]"
            }`}
          >
            {step !== "vs_clash" && (
              <motion.button
                type="button"
                whileHover={{ scale: 1.06 }}
                whileTap={{ scale: 0.92 }}
                onClick={onCancel}
                aria-label="Vazgeç"
                className="absolute right-3.5 top-3.5 z-10 flex h-[52px] w-[52px] items-center justify-center rounded-2xl bg-white/5 text-slate-300 hover:bg-white/12 hover:text-white transition cursor-pointer"
              >
                <X className="h-6 w-6" />
              </motion.button>
            )}

            {step === "vs_clash" && verifiedSeats.length >= 2 ? (
              /* HEYECANLI 2-4 KİŞİLİK KARŞILAŞMA EKRANI */
              <div className="relative overflow-hidden px-5 py-8 text-center">
                <div className="pointer-events-none absolute -left-16 top-1/2 -translate-y-1/2 h-48 w-48 rounded-full bg-cyan-500/30 blur-3xl" />
                <div className="pointer-events-none absolute -right-16 top-1/2 -translate-y-1/2 h-48 w-48 rounded-full bg-amber-500/30 blur-3xl" />

                <motion.div
                  initial={{ opacity: 0, y: -12 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/45 bg-amber-500/20 px-3.5 py-1 text-xs font-black uppercase tracking-wider text-amber-300"
                >
                  <Swords className="h-4 w-4" /> {gameMeta.title} •{" "}
                  {verifiedSeats.length} KİŞİLİK SINIF ARENASI
                </motion.div>

                <div
                  className={`mt-6 grid gap-3 ${
                    verifiedSeats.length === 2
                      ? "grid-cols-2"
                      : verifiedSeats.length === 3
                      ? "grid-cols-3"
                      : "grid-cols-2 sm:grid-cols-4"
                  }`}
                >
                  {verifiedSeats.map((seat, idx) => {
                    const slotTheme = SMARTBOARD_SLOTS[idx];
                    const p = seat.player;
                    const high = p.games?.[targetGame]?.highScore ?? 0;
                    return (
                      <motion.div
                        key={`${p.id}-${idx}`}
                        initial={{ scale: 0.7, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        transition={{ ...SPRING_GATE, delay: idx * 0.08 }}
                        className={`flex flex-col items-center rounded-2xl border ${slotTheme.borderClass} bg-slate-950/90 p-3.5 shadow-lg`}
                      >
                        <span
                          className={`rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase ${slotTheme.badgeClass}`}
                        >
                          {slotTheme.label} • {slotTheme.colorName}
                        </span>
                        <div
                          className={`mt-2.5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br ${
                            FRAME_THEMES[p.frameColor]?.bgClass ??
                            FRAME_THEMES.cyan.bgClass
                          } ${
                            FRAME_THEMES[p.frameColor]?.ringClass ??
                            FRAME_THEMES.cyan.ringClass
                          } text-3xl`}
                        >
                          {p.avatar}
                        </div>
                        <div className="mt-2 w-full truncate text-sm font-black text-white">
                          {p.name}
                        </div>
                        <div
                          className={`text-[11px] font-bold ${slotTheme.textClass}`}
                        >
                          {seat.isBot
                            ? "Yapay Zeka Bot"
                            : `Rekor: ${high.toLocaleString("tr-TR")} P`}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>

                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.35 }}
                  className="mt-6 inline-flex items-center gap-1.5 text-sm font-extrabold text-amber-200"
                >
                  <Zap className="h-4 w-4 text-amber-400" /> Akıllı tahta
                  hazırlanıyor, sırası gelen tek parmakla hamle yapar!
                </motion.p>
              </div>
            ) : (
              <>
                {/* Üst Başlık */}
                <div className="border-b border-white/10 px-5 pt-4 pb-3.5">
                  <div className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/30 bg-cyan-500/15 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-cyan-300 mb-1">
                    <Sparkles className="h-3 w-3" /> ZORUNLU PROFİL KAPISI •{" "}
                    {gameMeta.title}
                  </div>
                  <h2 className="pr-14 text-base sm:text-lg font-black tracking-tight text-white">
                    {headerTitle}
                  </h2>

                  {/* Çok oyunculu koltuk ilerleme göstergesi */}
                  {step === "pick_player" && selectedMode !== "solo" && (
                    <div className="mt-2.5 flex items-center gap-1.5 overflow-x-auto pb-0.5">
                      {Array.from({ length: neededSeats }).map((_, sIdx) => {
                        const sTheme = SMARTBOARD_SLOTS[sIdx];
                        const filled = verifiedSeats[sIdx];
                        const isCurrent = sIdx === currentSeatIndex;
                        return (
                          <div
                            key={sIdx}
                            className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-[11px] font-extrabold transition ${
                              filled
                                ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-200"
                                : isCurrent
                                ? `${sTheme.badgeClass} ring-2 ring-white/40`
                                : "border-white/10 bg-slate-950/60 text-slate-500"
                            }`}
                          >
                            <span>
                              {filled
                                ? filled.player.avatar
                                : `${sIdx + 1}.`}
                            </span>
                            <span className="truncate max-w-[85px]">
                              {filled
                                ? filled.player.name
                                : sTheme.colorName}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {step === "pick_player" && subView !== "pin" && (
                    <div className="mt-3 grid grid-cols-2 gap-2 rounded-2xl bg-slate-950/70 p-1 border border-white/10">
                      <button
                        type="button"
                        onClick={() => {
                          sound.playClick();
                          setSubView("list");
                          setError(null);
                        }}
                        className={`relative flex min-h-[48px] items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-extrabold transition-colors cursor-pointer ${
                          subView === "list"
                            ? "text-white"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        {subView === "list" && (
                          <motion.span
                            layoutId="gateSubTabPill"
                            transition={SPRING_GATE}
                            className="absolute inset-0 rounded-xl bg-indigo-600 shadow"
                          />
                        )}
                        <span className="relative z-10 flex items-center gap-1.5">
                          <Users className="h-4 w-4" /> Sınıf Listesi (
                          {players.length})
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          sound.playClick();
                          setSubView("create");
                          setError(null);
                        }}
                        className={`relative flex min-h-[48px] items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-extrabold transition-colors cursor-pointer ${
                          subView === "create"
                            ? "text-white"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        {subView === "create" && (
                          <motion.span
                            layoutId="gateSubTabPill"
                            transition={SPRING_GATE}
                            className="absolute inset-0 rounded-xl bg-fuchsia-600 shadow"
                          />
                        )}
                        <span className="relative z-10 flex items-center gap-1.5">
                          <UserPlus className="h-4 w-4" /> + Yeni Sınıf Profili
                        </span>
                      </button>
                    </div>
                  )}
                </div>

                {/* İçerik Gövdesi */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-5">
                  {step === "multi_setup" && isMultiArena ? (
                    /* 2-4 KİŞİLİK AKILLI TAHTA LOBİ KURULUMU */
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-300 mb-2">
                          1. Akıllı Tahtada Kaç Kişi Oynayacak?
                        </label>
                        <div className="grid grid-cols-3 gap-2.5">
                          {([2, 3, 4] as const).map((cnt) => {
                            const active = targetSeatCount === cnt;
                            return (
                              <button
                                key={cnt}
                                type="button"
                                onClick={() => {
                                  sound.playClick();
                                  setTargetSeatCount(cnt);
                                }}
                                className={`flex min-h-[64px] flex-col items-center justify-center rounded-2xl border p-3 transition cursor-pointer ${
                                  active
                                    ? "border-cyan-300 bg-gradient-to-b from-cyan-500/30 to-indigo-600/30 text-white shadow-[0_0_24px_rgba(34,211,238,0.3)]"
                                    : "border-white/12 bg-slate-950/70 text-slate-300 hover:border-white/30"
                                }`}
                              >
                                <span className="text-lg font-black">
                                  {cnt} Kişi
                                </span>
                                <span className="text-[10px] font-bold text-cyan-300">
                                  Sırayla Dokunmatik
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Oyun Özel Alt Mod Seçimi */}
                      {targetGame === "ludo" && (
                        <div>
                          <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-300 mb-2">
                            2. Kızma Birader Modu Seç
                          </label>
                          <div className="grid grid-cols-2 gap-2.5">
                            <button
                              type="button"
                              onClick={() => {
                                sound.playClick();
                                setSelectedSubMode("fast2");
                              }}
                              className={`flex min-h-[58px] flex-col items-start justify-center rounded-2xl border p-3 text-left transition cursor-pointer ${
                                selectedSubMode === "fast2"
                                  ? "border-amber-400 bg-amber-500/20 text-white"
                                  : "border-white/12 bg-slate-950/70 text-slate-300"
                              }`}
                            >
                              <span className="text-xs font-black text-amber-300">
                                ⚡ Teneffüs Modu (2 Piyon)
                              </span>
                              <span className="text-[10px] text-slate-300">
                                10 dk teneffüse uygun hızlı maç
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                sound.playClick();
                                setSelectedSubMode("classic4");
                              }}
                              className={`flex min-h-[58px] flex-col items-start justify-center rounded-2xl border p-3 text-left transition cursor-pointer ${
                                selectedSubMode === "classic4"
                                  ? "border-amber-400 bg-amber-500/20 text-white"
                                  : "border-white/12 bg-slate-950/70 text-slate-300"
                              }`}
                            >
                              <span className="text-xs font-black text-amber-300">
                                🎲 Klasik Mod (4 Piyon)
                              </span>
                              <span className="text-[10px] text-slate-300">
                                Geleneksel 4 taşlı uzun mücadele
                              </span>
                            </button>
                          </div>
                        </div>
                      )}

                      {targetGame === "dotsSos" && (
                        <div>
                          <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-300 mb-2">
                            2. Arena Oyun Modunu Seç
                          </label>
                          <div className="grid grid-cols-2 gap-2.5">
                            <button
                              type="button"
                              onClick={() => {
                                sound.playClick();
                                setSelectedSubMode("dots");
                              }}
                              className={`flex min-h-[58px] flex-col items-start justify-center rounded-2xl border p-3 text-left transition cursor-pointer ${
                                selectedSubMode === "dots"
                                  ? "border-fuchsia-400 bg-fuchsia-500/20 text-white"
                                  : "border-white/12 bg-slate-950/70 text-slate-300"
                              }`}
                            >
                              <span className="text-xs font-black text-fuchsia-300">
                                🟦 Neon Kare Kapmaca
                              </span>
                              <span className="text-[10px] text-slate-300">
                                Çizgi çek, kareyi avatarınla mühürle!
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                sound.playClick();
                                setSelectedSubMode("sos");
                              }}
                              className={`flex min-h-[58px] flex-col items-start justify-center rounded-2xl border p-3 text-left transition cursor-pointer ${
                                selectedSubMode === "sos"
                                  ? "border-fuchsia-400 bg-fuchsia-500/20 text-white"
                                  : "border-white/12 bg-slate-950/70 text-slate-300"
                              }`}
                            >
                              <span className="text-xs font-black text-cyan-300">
                                ⚡ SOS Lazer Arenası
                              </span>
                              <span className="text-[10px] text-slate-300">
                                S ve O yerleştir, lazerle puan topla!
                              </span>
                            </button>
                          </div>
                        </div>
                      )}

                      {targetGame === "memoryMatch" && (
                        <div>
                          <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-300 mb-2">
                            2. Kart Tablosu Boyutu Seç
                          </label>
                          <div className="grid grid-cols-2 gap-2.5">
                            <button
                              type="button"
                              onClick={() => {
                                sound.playClick();
                                setSelectedSubMode("6x4");
                              }}
                              className={`flex min-h-[58px] flex-col items-start justify-center rounded-2xl border p-3 text-left transition cursor-pointer ${
                                selectedSubMode === "6x4"
                                  ? "border-emerald-400 bg-emerald-500/20 text-white"
                                  : "border-white/12 bg-slate-950/70 text-slate-300"
                              }`}
                            >
                              <span className="text-xs font-black text-emerald-300">
                                🃏 6x4 Hızlı Tablo (24 Kart)
                              </span>
                              <span className="text-[10px] text-slate-300">
                                12 çift • Teneffüs için ideal
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                sound.playClick();
                                setSelectedSubMode("8x4");
                              }}
                              className={`flex min-h-[58px] flex-col items-start justify-center rounded-2xl border p-3 text-left transition cursor-pointer ${
                                selectedSubMode === "8x4"
                                  ? "border-emerald-400 bg-emerald-500/20 text-white"
                                  : "border-white/12 bg-slate-950/70 text-slate-300"
                              }`}
                            >
                              <span className="text-xs font-black text-emerald-300">
                                🧠 8x4 Dev Tablo (32 Kart)
                              </span>
                              <span className="text-[10px] text-slate-300">
                                16 çift • Tam hafıza meydan okuması
                              </span>
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="rounded-2xl border border-cyan-400/25 bg-cyan-500/10 p-3 text-xs text-slate-200 flex items-center gap-2.5">
                        <ShieldAlert className="h-5 w-5 shrink-0 text-cyan-300" />
                        <span>
                          <strong>Hayalet PIN Koruması Aktif:</strong> Akıllı
                          tahtada PIN girerken rakamların yeri her seferinde
                          karışır ve basılan tuş parlamaz!
                        </span>
                      </div>

                      <motion.button
                        type="button"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.96 }}
                        onClick={() => {
                          sound.playClick();
                          setCurrentSeatIndex(0);
                          setVerifiedSeats([]);
                          setStep("pick_player");
                          setSubView(players.length > 0 ? "list" : "create");
                        }}
                        className="w-full min-h-[56px] flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-500 via-indigo-600 to-fuchsia-600 py-3.5 text-sm font-black text-white shadow-lg cursor-pointer"
                      >
                        <Users className="h-5 w-5" /> Oyuncu Seçimine Geç (1.
                        Oyuncu → {targetSeatCount}. Oyuncu)
                      </motion.button>
                    </div>
                  ) : step === "mode" ? (
                    /* SATRANÇ, BİLARDO, BUCKSHOT ROULETTE & YÜKSEK GERİLİM MOD SEÇİMİ */
                    <div className="space-y-3">
                      {targetGame === "buckshot" && (
                        <div className="rounded-2xl border border-amber-500/35 bg-stone-950/90 p-3">
                          <div className="text-xs font-black text-amber-300 mb-2">
                            ⚡ Maç Formatı Seç:
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                sound.playClick();
                                setSelectedSubMode("series3");
                              }}
                              className={`min-h-[48px] rounded-xl border p-2 text-left transition cursor-pointer ${
                                selectedSubMode !== "fast1"
                                  ? "border-amber-400 bg-amber-500/20 text-white"
                                  : "border-white/10 bg-white/5 text-slate-400"
                              }`}
                            >
                              <div className="text-xs font-black">
                                3 Rauntluk Seri
                              </div>
                              <div className="text-[10px] text-slate-300">
                                2⚡ • 4⚡ • 5⚡ (Kesik Kablo Finali)
                              </div>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                sound.playClick();
                                setSelectedSubMode("fast1");
                              }}
                              className={`min-h-[48px] rounded-xl border p-2 text-left transition cursor-pointer ${
                                selectedSubMode === "fast1"
                                  ? "border-red-400 bg-red-500/25 text-white"
                                  : "border-white/10 bg-white/5 text-slate-400"
                              }`}
                            >
                              <div className="text-xs font-black">
                                Hızlı Hayatta Kalma (Tek Raunt)
                              </div>
                              <div className="text-[10px] text-slate-300">
                                5⚡ • Son Kalan Kazanır
                              </div>
                            </button>
                          </div>
                        </div>
                      )}

                      {targetGame === "buckshot" ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <motion.button
                            type="button"
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.96 }}
                            transition={SPRING_GATE}
                            onClick={() => {
                              sound.playClick();
                              setSelectedMode("solo");
                              setStep("pick_player");
                              setSubView(players.length > 0 ? "list" : "create");
                            }}
                            className="min-h-[76px] flex items-center gap-3 rounded-2xl border border-cyan-400/35 bg-gradient-to-r from-cyan-500/15 to-indigo-600/15 hover:border-cyan-300 p-3.5 text-left transition-colors cursor-pointer"
                          >
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-cyan-500/25 text-cyan-300">
                              <Bot className="h-5 w-5" />
                            </div>
                            <div>
                              <div className="text-xs sm:text-sm font-black text-white">
                                Krupiye (1P)
                              </div>
                              <p className="mt-0.5 text-[11px] text-slate-300 leading-snug">
                                Eldivenli yeraltı Krupiyesine karşı 3D düello!
                              </p>
                            </div>
                          </motion.button>

                          <motion.button
                            type="button"
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.96 }}
                            transition={SPRING_GATE}
                            onClick={() => {
                              sound.playClick();
                              setSelectedMode("duel");
                              setTargetSeatCount(2);
                              setCurrentSeatIndex(0);
                              setVerifiedSeats([]);
                              setStep("pick_player");
                              setSubView(players.length > 0 ? "list" : "create");
                            }}
                            className="min-h-[76px] flex items-center gap-3 rounded-2xl border border-amber-400/40 bg-gradient-to-r from-amber-500/15 to-red-600/15 hover:border-amber-300 p-3.5 text-left transition-colors cursor-pointer"
                          >
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/25 text-amber-300">
                              <Swords className="h-5 w-5" />
                            </div>
                            <div>
                              <div className="text-xs sm:text-sm font-black text-white">
                                2 Kişi Düello
                              </div>
                              <p className="mt-0.5 text-[11px] text-slate-300 leading-snug">
                                %50 / %50 Bölünmüş Çift Kamera (Dual-POV)
                              </p>
                            </div>
                          </motion.button>

                          <motion.button
                            type="button"
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.96 }}
                            transition={SPRING_GATE}
                            onClick={() => {
                              sound.playClick();
                              setSelectedMode("multiplayer");
                              setTargetSeatCount(3);
                              setCurrentSeatIndex(0);
                              setVerifiedSeats([]);
                              setStep("pick_player");
                              setSubView(players.length > 0 ? "list" : "create");
                            }}
                            className="min-h-[76px] flex items-center gap-3 rounded-2xl border border-emerald-400/40 bg-gradient-to-r from-emerald-500/15 to-teal-700/15 hover:border-emerald-300 p-3.5 text-left transition-colors cursor-pointer"
                          >
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/25 text-emerald-300">
                              <Users className="h-5 w-5" />
                            </div>
                            <div>
                              <div className="text-xs sm:text-sm font-black text-white">
                                3 Kişi Masa
                              </div>
                              <p className="mt-0.5 text-[11px] text-slate-300 leading-snug">
                                3D Sekizgen Masa • 3 Kamera + CCTV Tepe Kamerası
                              </p>
                            </div>
                          </motion.button>

                          <motion.button
                            type="button"
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.96 }}
                            transition={SPRING_GATE}
                            onClick={() => {
                              sound.playClick();
                              setSelectedMode("multiplayer");
                              setTargetSeatCount(4);
                              setCurrentSeatIndex(0);
                              setVerifiedSeats([]);
                              setStep("pick_player");
                              setSubView(players.length > 0 ? "list" : "create");
                            }}
                            className="min-h-[76px] flex items-center gap-3 rounded-2xl border border-rose-400/45 bg-gradient-to-r from-rose-500/20 to-amber-600/20 hover:border-rose-300 p-3.5 text-left transition-colors cursor-pointer"
                          >
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-500/25 text-rose-300">
                              <Zap className="h-5 w-5" />
                            </div>
                            <div>
                              <div className="text-xs sm:text-sm font-black text-white">
                                4 Kişi Kaos
                              </div>
                              <p className="mt-0.5 text-[11px] text-slate-300 leading-snug">
                                2x2 Quad Split-Screen • Döner Tüfek Halkası & Jammer
                              </p>
                            </div>
                          </motion.button>
                        </div>
                      ) : (
                        <>
                          <motion.button
                            type="button"
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.96 }}
                            transition={SPRING_GATE}
                            onClick={() => {
                              sound.playClick();
                              setSelectedMode("solo");
                              setStep("pick_player");
                              setSubView(players.length > 0 ? "list" : "create");
                            }}
                            className="w-full min-h-[64px] flex items-center gap-4 rounded-2xl border border-cyan-400/35 bg-gradient-to-r from-cyan-500/15 to-indigo-600/15 hover:border-cyan-300 p-4 text-left transition-colors cursor-pointer"
                          >
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-cyan-500/25 text-cyan-300">
                              <Bot className="h-6 w-6" />
                            </div>
                            <div>
                              <div className="text-sm font-black text-white">
                                Tek Kişilik (Yapay Zeka / Arcade)
                              </div>
                              <p className="mt-0.5 text-xs text-slate-300">
                                {targetGame === "wireRoulette"
                                  ? "Başmühendis Bot'a karşı 8 gergin kablolu sigorta kutusunda hayatta kalma mücadelesi."
                                  : targetGame === "chess"
                                  ? "Kolay, Orta veya Zor seviyeli akıllı satranç botuna karşı oyna."
                                  : "15 topu en az vuruşla ve seri kombosuyla deliklere sokarak rekor kır."}
                              </p>
                            </div>
                          </motion.button>

                          {supportsDuel && (
                            <motion.button
                              type="button"
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.96 }}
                              transition={SPRING_GATE}
                              onClick={() => {
                                sound.playClick();
                                setSelectedMode("duel");
                                setTargetSeatCount(2);
                                setCurrentSeatIndex(0);
                                setVerifiedSeats([]);
                                setStep("pick_player");
                                setSubView(players.length > 0 ? "list" : "create");
                              }}
                              className="w-full min-h-[64px] flex items-center gap-4 rounded-2xl border border-amber-400/40 bg-gradient-to-r from-amber-500/15 to-fuchsia-600/15 hover:border-amber-300 p-4 text-left transition-colors cursor-pointer"
                            >
                              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500/25 text-amber-300">
                                <Swords className="h-6 w-6" />
                              </div>
                              <div>
                                <div className="text-sm font-black text-white">
                                  Sınıf Arkadaşıyla Düello (2 Kişilik - Aynı Cihaz)
                                </div>
                                <p className="mt-0.5 text-xs text-slate-300">
                                  İki oyuncu da Hayalet PIN ile kendi profilini
                                  açar; VS arenasında kapışır!
                                </p>
                              </div>
                            </motion.button>
                          )}
                        </>
                      )}
                    </div>
                  ) : subView === "pin" && candidate ? (
                    /* ARKADAN GÖRÜNMEZ "HAYALET PIN" TUŞ TAKIMI (ANTI-PEEK KEYPAD) */
                    <div className="space-y-3">
                      <button
                        type="button"
                        onClick={() => {
                          setSubView("list");
                          setCandidate(null);
                          setPinInput("");
                          setError(null);
                        }}
                        className="inline-flex min-h-[44px] items-center gap-1 text-xs font-bold text-cyan-400 hover:text-cyan-300 cursor-pointer"
                      >
                        <ChevronLeft className="h-4 w-4" /> Sınıf Listesine Dön
                      </button>

                      {/* Seçilen Oyuncu Özeti */}
                      <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5">
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${
                              FRAME_THEMES[candidate.frameColor].bgClass
                            } ${
                              FRAME_THEMES[candidate.frameColor].ringClass
                            } text-2xl`}
                          >
                            {candidate.avatar}
                          </div>
                          <div className="min-w-0">
                            <h3 className="truncate text-sm font-black text-white">
                              {candidate.name}
                            </h3>
                            <p className="text-[11px] text-slate-400">
                              {gameMeta.title}:{" "}
                              <strong className="text-amber-300">
                                {(
                                  candidate.games?.[targetGame]?.highScore ?? 0
                                ).toLocaleString("tr-TR")}{" "}
                                P
                              </strong>
                            </p>
                          </div>
                        </div>
                        <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/15 border border-cyan-400/30 px-2.5 py-1 text-[10px] font-black text-cyan-300">
                          <Lock className="h-3 w-3" /> Hayalet PIN
                        </span>
                      </div>

                      {/* Şifre Noktaları (• • • •) - Sadece burası dolar, tuşlar parlamaz! */}
                      <motion.div
                        key={pinShakeKey}
                        animate={
                          pinShakeKey > 0 ? { x: [-10, 10, -8, 8, -4, 4, 0] } : {}
                        }
                        transition={{ duration: 0.32 }}
                        className="mx-auto max-w-[260px] rounded-2xl border border-cyan-400/35 bg-slate-950 px-4 py-3 text-center"
                      >
                        <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1.5">
                          Eliyle Kapatarak 4 Haneli PIN Gir
                        </div>
                        <div className="flex items-center justify-center gap-3.5 py-1">
                          {[0, 1, 2, 3].map((dotIdx) => {
                            const filled = pinInput.length > dotIdx;
                            return (
                              <span
                                key={dotIdx}
                                className={`h-4 w-4 rounded-full transition-colors duration-75 ${
                                  filled
                                    ? "bg-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.8)]"
                                    : "bg-slate-800 border border-white/20"
                                }`}
                              />
                            );
                          })}
                        </div>
                      </motion.div>

                      {error && (
                        <div className="mx-auto max-w-[260px] rounded-xl border border-rose-500/40 bg-rose-500/15 px-3 py-2 text-[11px] font-bold text-rose-200 text-center">
                          {error}
                        </div>
                      )}

                      {/* KOMPAKT HAYALET TUŞ TAKIMI (max-w-[260px], Fisher-Yates Karışık, SIFIR Basılma Parlaması!) */}
                      <div className="mx-auto w-full max-w-[260px] rounded-2xl border border-white/12 bg-slate-950/95 p-2.5">
                        <div className="grid grid-cols-3 gap-1.5">
                          {shuffledDigits.slice(0, 9).map((digit) => (
                            <button
                              key={digit}
                              type="button"
                              disabled={loading}
                              onPointerDown={(e) => {
                                e.preventDefault();
                                handleGhostDigitTap(digit);
                              }}
                              className="flex h-[54px] min-w-[52px] items-center justify-center rounded-xl border border-white/10 bg-slate-900 text-lg font-black text-slate-100 select-none cursor-pointer focus:outline-none active:bg-slate-900 hover:bg-slate-900 transition-none"
                              style={{
                                WebkitTapHighlightColor: "transparent",
                              }}
                            >
                              {digit}
                            </button>
                          ))}

                          {/* Sol Alt: Yeniden Karıştır */}
                          <button
                            type="button"
                            disabled={loading}
                            onPointerDown={(e) => {
                              e.preventDefault();
                              setShuffledDigits(shuffleDigitsFisherYates());
                            }}
                            title="Tuş Dizilimini Karıştır"
                            className="flex h-[54px] min-w-[52px] items-center justify-center rounded-xl border border-white/10 bg-slate-900 text-xs font-extrabold text-slate-400 select-none cursor-pointer focus:outline-none active:bg-slate-900 hover:bg-slate-900 transition-none"
                            style={{
                              WebkitTapHighlightColor: "transparent",
                            }}
                          >
                            <Shuffle className="h-4 w-4" />
                          </button>

                          {/* Orta Alt: 10. Rakam */}
                          <button
                            type="button"
                            disabled={loading}
                            onPointerDown={(e) => {
                              e.preventDefault();
                              handleGhostDigitTap(shuffledDigits[9]);
                            }}
                            className="flex h-[54px] min-w-[52px] items-center justify-center rounded-xl border border-white/10 bg-slate-900 text-lg font-black text-slate-100 select-none cursor-pointer focus:outline-none active:bg-slate-900 hover:bg-slate-900 transition-none"
                            style={{
                              WebkitTapHighlightColor: "transparent",
                            }}
                          >
                            {shuffledDigits[9]}
                          </button>

                          {/* Sağ Alt: Sil (Backspace) */}
                          <button
                            type="button"
                            disabled={loading}
                            onPointerDown={(e) => {
                              e.preventDefault();
                              handleGhostBackspace();
                            }}
                            title="Sil"
                            className="flex h-[54px] min-w-[52px] items-center justify-center rounded-xl border border-white/10 bg-slate-900 text-xs font-extrabold text-slate-300 select-none cursor-pointer focus:outline-none active:bg-slate-900 hover:bg-slate-900 transition-none"
                            style={{
                              WebkitTapHighlightColor: "transparent",
                            }}
                          >
                            <Delete className="h-4 w-4" />
                          </button>
                        </div>

                        <div className="mt-2 text-center text-[10px] text-slate-500">
                          {loading
                            ? "Firestore üzerinden PIN doğrulanıyor..."
                            : "Gizli Basış: Tuşlar parlamaz, 4. rakamda otomatik onaylanır"}
                        </div>
                      </div>
                    </div>
                  ) : subView === "list" ? (
                    /* Sınıf Listesi */
                    <div className="space-y-3">
                      {((supportsDuel && currentSeatIndex === 0) ||
                        (isMultiArena && currentSeatIndex === 0)) && (
                        <button
                          type="button"
                          onClick={() =>
                            setStep(isMultiArena ? "multi_setup" : "mode")
                          }
                          className="inline-flex min-h-[44px] items-center gap-1 text-xs font-bold text-slate-400 hover:text-white cursor-pointer"
                        >
                          <ChevronLeft className="h-4 w-4" />{" "}
                          {isMultiArena
                            ? "Oyuncu Sayısı & Mod Seçimine Dön"
                            : "Mod Seçimine Dön"}
                        </button>
                      )}

                      {/* Çok oyunculu lobide boş koltuğa Yapay Zeka Bot ekleme seçeneği */}
                      {selectedMode === "multiplayer" && hasAtLeastOneHuman && (
                        <motion.button
                          type="button"
                          whileHover={{ scale: 1.01 }}
                          whileTap={{ scale: 0.97 }}
                          onClick={() => {
                            const botDoc =
                              createBotPlayerDoc(currentSeatIndex);
                            advanceOrFinishSeat(botDoc, true);
                          }}
                          className="w-full min-h-[54px] flex items-center justify-between rounded-2xl border border-cyan-400/40 bg-gradient-to-r from-cyan-500/15 to-indigo-600/20 px-4 py-2.5 text-left hover:border-cyan-300 transition cursor-pointer"
                        >
                          <div className="flex items-center gap-3">
                            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/25 text-xl">
                              🤖
                            </span>
                            <div>
                              <div className="text-xs sm:text-sm font-black text-cyan-200">
                                + Bu Koltuğa Yapay Zeka Bot Ekle
                              </div>
                              <div className="text-[11px] text-slate-300">
                                {currentSeatIndex + 1}. Oyuncu (
                                {activeSlotTheme.colorName}) koltuğunu akıllı bot
                                yönetir
                              </div>
                            </div>
                          </div>
                          <span className="rounded-xl bg-cyan-400/20 px-2.5 py-1 text-[10px] font-black text-cyan-200">
                            PIN Gerekmez
                          </span>
                        </motion.button>
                      )}

                      {players.length > 4 && (
                        <div className="relative">
                          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                          <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Sınıf listesinde ismini ara..."
                            className="w-full rounded-2xl border border-white/12 bg-slate-950/80 pl-10 pr-4 py-2.5 text-xs text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none"
                          />
                        </div>
                      )}

                      {filteredPlayers.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-6 text-center">
                          <p className="text-sm font-semibold text-slate-300">
                            {players.length === 0
                              ? "Henüz sınıfta oluşturulmuş profil yok."
                              : "Aramana uygun profil bulunamadı."}
                          </p>
                          <button
                            type="button"
                            onClick={() => setSubView("create")}
                            className="mt-3 min-h-[48px] inline-flex items-center gap-1.5 rounded-xl bg-fuchsia-600 px-4 py-2 text-xs font-bold text-white hover:bg-fuchsia-500 transition cursor-pointer"
                          >
                            <UserPlus className="h-4 w-4" /> + Yeni Sınıf
                            Profili Oluştur
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {filteredPlayers.map((p) => {
                            const frame = FRAME_THEMES[p.frameColor];
                            const rankTitle = getOverallRankTitle(
                              p.overallBestScore
                            );
                            const lockedBySeat = alreadySelectedMap.get(p.id);
                            const isLocked = lockedBySeat !== undefined;
                            const pScore =
                              p.games?.[targetGame]?.highScore ?? 0;

                            return (
                              <motion.button
                                key={p.id}
                                type="button"
                                disabled={isLocked}
                                whileHover={
                                  isLocked ? undefined : { scale: 1.012, x: 2 }
                                }
                                whileTap={
                                  isLocked ? undefined : { scale: 0.97 }
                                }
                                transition={SPRING_GATE}
                                onClick={() => {
                                  if (isLocked) return;
                                  sound.playClick();
                                  setCandidate(p);
                                  setShuffledDigits(shuffleDigitsFisherYates());
                                  setSubView("pin");
                                  setPinInput("");
                                  setError(null);
                                }}
                                className={`w-full min-h-[56px] flex items-center justify-between rounded-2xl border px-3.5 py-2.5 text-left transition-colors ${
                                  isLocked
                                    ? "border-white/5 bg-slate-950/40 opacity-45 cursor-not-allowed"
                                    : "border-white/10 bg-white/[0.04] hover:bg-white/[0.09] hover:border-indigo-400/40 cursor-pointer"
                                }`}
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  <div
                                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${frame.bgClass} ${frame.ringClass} text-xl`}
                                  >
                                    {p.avatar}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="truncate text-sm font-extrabold text-white">
                                      {p.name}
                                    </div>
                                    <div
                                      className={`text-[11px] font-semibold ${rankTitle.colorClass}`}
                                    >
                                      {isLocked
                                        ? `🔒 ${lockedBySeat}. Oyuncu Olarak Lobide`
                                        : rankTitle.title}
                                    </div>
                                  </div>
                                </div>
                                <div className="text-right shrink-0 pl-2">
                                  <div className="text-xs font-black text-amber-300 tabular-nums">
                                    {pScore.toLocaleString("tr-TR")} P
                                  </div>
                                  <div className="inline-flex items-center gap-1 text-[10px] text-slate-400">
                                    <Lock className="h-2.5 w-2.5" />{" "}
                                    {isLocked ? "Kilitli" : "Hayalet PIN"}
                                  </div>
                                </div>
                              </motion.button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ) : (
                    /* + Yeni Sınıf Profili Oluştur */
                    <form onSubmit={handleCreateProfile} className="space-y-3.5">
                      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/60 p-3">
                        <div
                          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${FRAME_THEMES[newFrame].bgClass} ${FRAME_THEMES[newFrame].ringClass} text-2xl`}
                        >
                          {newAvatar}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-black text-white">
                            {newName.trim() || "Ad Soyad / Lakap"}
                          </div>
                          <div className="truncate text-xs text-slate-400 italic">
                            &ldquo;{newStatus.trim() || "Durum sözün..."}&rdquo;
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-300 mb-1">
                          Ad / Lakap
                        </label>
                        <input
                          type="text"
                          required
                          maxLength={24}
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                          placeholder="Örn: Mehmet K."
                          className="w-full rounded-xl border border-white/15 bg-slate-950/80 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-fuchsia-400 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-300 mb-1.5">
                          Avatar Seç
                        </label>
                        <div className="grid grid-cols-8 gap-1.5">
                          {AVATAR_OPTIONS.map((emo) => (
                            <button
                              key={emo}
                              type="button"
                              onClick={() => setNewAvatar(emo)}
                              className={`flex h-10 items-center justify-center rounded-xl text-base transition cursor-pointer ${
                                newAvatar === emo
                                  ? "bg-fuchsia-600/40 border-2 border-fuchsia-400 scale-105"
                                  : "bg-white/5 border border-white/10 hover:bg-white/10"
                              }`}
                            >
                              {emo}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-300 mb-1.5">
                          Çerçeve Rengi ({FRAME_THEMES[newFrame].label})
                        </label>
                        <div className="grid grid-cols-6 gap-2">
                          {FRAME_KEYS.map((fKey) => (
                            <button
                              key={fKey}
                              type="button"
                              onClick={() => setNewFrame(fKey)}
                              className={`flex h-9 items-center justify-center rounded-xl border bg-slate-950 transition cursor-pointer ${
                                newFrame === fKey
                                  ? "border-white scale-105"
                                  : "border-white/15 opacity-75"
                              }`}
                            >
                              <span
                                className={`h-4 w-4 rounded-full ${FRAME_THEMES[fKey].swatchClass}`}
                              />
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-300 mb-1">
                          Kısa Durum Sözü
                        </label>
                        <input
                          type="text"
                          maxLength={48}
                          value={newStatus}
                          onChange={(e) => setNewStatus(e.target.value)}
                          placeholder="Rekorumu kırabilen çıkmadı!"
                          className="w-full rounded-xl border border-white/15 bg-slate-950/80 px-3.5 py-2 text-xs text-white placeholder:text-slate-500 focus:border-fuchsia-400 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="flex items-center justify-between text-xs font-bold text-slate-300 mb-1">
                          <span className="flex items-center gap-1">
                            <Lock className="h-3.5 w-3.5 text-cyan-400" /> 4
                            Haneli PIN Belirle
                          </span>
                          <span className="text-[10px] font-normal text-cyan-300">
                            SHA-256 Hash
                          </span>
                        </label>
                        <input
                          type="password"
                          inputMode="numeric"
                          required
                          maxLength={4}
                          value={newPin}
                          onChange={(e) =>
                            setNewPin(
                              e.target.value.replace(/[^0-9]/g, "").slice(0, 4)
                            )
                          }
                          placeholder="4 haneli gizli PIN (Örn: 1453)"
                          className="w-full rounded-xl border border-white/15 bg-slate-950/80 px-3.5 py-2.5 text-sm font-bold tracking-widest text-white placeholder:tracking-normal placeholder:font-normal placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
                        />
                      </div>

                      {error && (
                        <div className="rounded-xl border border-rose-500/40 bg-rose-500/15 px-3.5 py-2.5 text-xs text-rose-200">
                          {error}
                        </div>
                      )}

                      <motion.button
                        type="submit"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.95 }}
                        disabled={loading || newPin.length !== 4}
                        className="w-full min-h-[54px] flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 py-3.5 text-sm font-black text-white shadow-lg hover:brightness-110 transition disabled:opacity-50 cursor-pointer"
                      >
                        <Check className="h-4 w-4" />
                        {loading
                          ? "Oluşturuluyor..."
                          : selectedMode !== "solo"
                          ? `Profili Oluştur ve ${
                              currentSeatIndex + 1
                            }. Koltuğa Yerleş`
                          : "Profili Oluştur ve Oyuna Başla!"}
                      </motion.button>
                    </form>
                  )}
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
