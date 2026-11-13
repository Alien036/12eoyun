"use client";

import React, { useState, useEffect, useMemo } from "react";
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
} from "lucide-react";
import {
  AVATAR_OPTIONS,
  FRAME_THEMES,
  GAME_LABELS,
  createClassProfile,
  getOverallRankTitle,
  verifyAndSelectProfile,
  type FrameColorKey,
  type GameKey,
  type PlayerDoc,
} from "@/lib/firestore";
import { sound } from "@/lib/sound";

export interface GameLaunchSession {
  game: GameKey;
  mode: "solo" | "duel";
  player1: PlayerDoc;
  player2?: PlayerDoc;
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

export default function ProfileGateModal({
  isOpen,
  targetGame,
  players,
  onCancel,
  onConfirmLaunch,
}: ProfileGateModalProps) {
  const supportsDuel = targetGame === "chess" || targetGame === "billiards";

  const [step, setStep] = useState<
    "mode" | "pick_p1" | "pick_p2" | "vs_clash"
  >("pick_p1");
  const [selectedMode, setSelectedMode] = useState<"solo" | "duel">("solo");
  const [verifiedP1, setVerifiedP1] = useState<PlayerDoc | null>(null);
  const [verifiedP2, setVerifiedP2] = useState<PlayerDoc | null>(null);

  const [subView, setSubView] = useState<"list" | "pin" | "create">("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [candidate, setCandidate] = useState<PlayerDoc | null>(null);
  const [pinInput, setPinInput] = useState("");

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
      const duelCapable = targetGame === "chess" || targetGame === "billiards";
      setStep(duelCapable ? "mode" : "pick_p1");
      setSelectedMode("solo");
      setVerifiedP1(null);
      setVerifiedP2(null);
      setSubView(players.length > 0 ? "list" : "create");
      setSearchQuery("");
      setCandidate(null);
      setPinInput("");
      setNewName("");
      setNewPin("");
      setError(null);
      setLoading(false);
    }
  }, [isOpen, targetGame, players.length]);

  // 2 Kişilik "VS" Karşılaşma ekranından sonra oyunu otomatik başlat
  useEffect(() => {
    if (step !== "vs_clash" || !targetGame || !verifiedP1 || !verifiedP2) {
      return;
    }
    const timer = window.setTimeout(() => {
      onConfirmLaunch({
        game: targetGame,
        mode: "duel",
        player1: verifiedP1,
        player2: verifiedP2,
      });
    }, 1450);
    return () => window.clearTimeout(timer);
  }, [step, targetGame, verifiedP1, verifiedP2, onConfirmLaunch]);

  const availablePlayers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return players.filter((p) => {
      if (step === "pick_p2" && verifiedP1 && p.id === verifiedP1.id) {
        return false;
      }
      if (!q) return true;
      return p.name.toLowerCase().includes(q);
    });
  }, [players, searchQuery, step, verifiedP1]);

  if (!targetGame) return null;
  const gameMeta = GAME_LABELS[targetGame];

  const completePlayerSelection = (chosen: PlayerDoc) => {
    if (selectedMode === "solo") {
      sound.playClick();
      onConfirmLaunch({
        game: targetGame,
        mode: "solo",
        player1: chosen,
      });
      return;
    }

    if (step === "pick_p1") {
      sound.playClick();
      setVerifiedP1(chosen);
      setStep("pick_p2");
      setSubView(players.length > 1 ? "list" : "create");
      setCandidate(null);
      setPinInput("");
      setSearchQuery("");
      setError(null);
    } else if (step === "pick_p2" && verifiedP1) {
      // Heyecanlı VS Karşılaşma Ekranını tetikle!
      sound.playDuelClash();
      setVerifiedP2(chosen);
      setStep("vs_clash");
    }
  };

  const handleVerifyPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!candidate) return;
    setError(null);
    setLoading(true);
    try {
      const res = await verifyAndSelectProfile(candidate, pinInput);
      if (!res.ok || !res.player) {
        sound.playInvalid();
        setError(res.error || "Hatalı PIN kodu.");
      } else {
        completePlayerSelection(res.player);
      }
    } finally {
      setLoading(false);
    }
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
        completePlayerSelection(res.player);
      }
    } finally {
      setLoading(false);
    }
  };

  const headerTitle =
    step === "mode"
      ? `${gameMeta.icon} ${gameMeta.title} — Oyun Modunu Seç`
      : step === "vs_clash"
      ? "Sınıf Düellosu Başlıyor!"
      : selectedMode === "duel"
      ? step === "pick_p1"
        ? "1. Oyuncu: Kim Oynuyor? Profilini Seç"
        : `2. Oyuncu (${verifiedP1?.name}'in Rakibi): Profilini Seç`
      : "Kim Oynuyor? Profilini Seç";

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-lg p-3 sm:p-4"
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 18 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 18 }}
            transition={SPRING_GATE}
            className="relative flex flex-col w-full max-w-md max-h-[92dvh] overflow-hidden rounded-3xl border border-white/15 bg-slate-900/95 shadow-[0_0_60px_rgba(99,102,241,0.35)] text-slate-100"
          >
            {step !== "vs_clash" && (
              <motion.button
                type="button"
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.92 }}
                onClick={onCancel}
                aria-label="Vazgeç"
                className="absolute right-4 top-4 z-10 rounded-xl bg-white/5 p-2 text-slate-400 hover:bg-white/10 hover:text-white transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </motion.button>
            )}

            {step === "vs_clash" && verifiedP1 && verifiedP2 ? (
              /* HEYECANLI 2 KİŞİLİK "VS KARŞILAŞMA" EKRANI */
              <div className="relative overflow-hidden px-5 py-9 text-center">
                <div className="pointer-events-none absolute -left-16 top-1/2 -translate-y-1/2 h-48 w-48 rounded-full bg-cyan-500/30 blur-3xl" />
                <div className="pointer-events-none absolute -right-16 top-1/2 -translate-y-1/2 h-48 w-48 rounded-full bg-amber-500/30 blur-3xl" />

                <motion.div
                  initial={{ opacity: 0, y: -12 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/45 bg-amber-500/20 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-amber-300"
                >
                  <Swords className="h-3.5 w-3.5" /> {gameMeta.title} • SINIF
                  DÜELLOSU
                </motion.div>

                <div className="mt-6 grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-3">
                  {/* 1. Oyuncu Kartı (Soldan Fırlayarak Gelir) */}
                  <motion.div
                    initial={{ x: -110, opacity: 0, rotate: -8 }}
                    animate={{ x: 0, opacity: 1, rotate: 0 }}
                    transition={SPRING_GATE}
                    className="flex flex-col items-center rounded-2xl border border-cyan-400/40 bg-slate-950/85 p-3 shadow-[0_0_25px_rgba(34,211,238,0.22)]"
                  >
                    <div
                      className={`flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br ${
                        FRAME_THEMES[verifiedP1.frameColor].bgClass
                      } ${
                        FRAME_THEMES[verifiedP1.frameColor].ringClass
                      } text-3xl`}
                    >
                      {verifiedP1.avatar}
                    </div>
                    <div className="mt-2 w-full truncate text-sm font-black text-white">
                      {verifiedP1.name}
                    </div>
                    <div className="text-[10px] font-bold text-cyan-300">
                      {verifiedP1.games[targetGame].highScore.toLocaleString(
                        "tr-TR"
                      )}{" "}
                      P
                    </div>
                  </motion.div>

                  {/* Merkez VS Rozeti */}
                  <motion.div
                    initial={{ scale: 0, rotate: -35 }}
                    animate={{ scale: [0, 1.32, 1], rotate: 0 }}
                    transition={{
                      duration: 0.48,
                      times: [0, 0.65, 1],
                      ease: "easeOut",
                    }}
                    className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 via-orange-500 to-rose-600 text-lg font-black text-slate-950 shadow-[0_0_32px_rgba(251,191,36,0.75)]"
                  >
                    VS
                  </motion.div>

                  {/* 2. Oyuncu Kartı (Sağdan Fırlayarak Gelir) */}
                  <motion.div
                    initial={{ x: 110, opacity: 0, rotate: 8 }}
                    animate={{ x: 0, opacity: 1, rotate: 0 }}
                    transition={SPRING_GATE}
                    className="flex flex-col items-center rounded-2xl border border-amber-400/40 bg-slate-950/85 p-3 shadow-[0_0_25px_rgba(251,191,36,0.22)]"
                  >
                    <div
                      className={`flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br ${
                        FRAME_THEMES[verifiedP2.frameColor].bgClass
                      } ${
                        FRAME_THEMES[verifiedP2.frameColor].ringClass
                      } text-3xl`}
                    >
                      {verifiedP2.avatar}
                    </div>
                    <div className="mt-2 w-full truncate text-sm font-black text-white">
                      {verifiedP2.name}
                    </div>
                    <div className="text-[10px] font-bold text-amber-300">
                      {verifiedP2.games[targetGame].highScore.toLocaleString(
                        "tr-TR"
                      )}{" "}
                      P
                    </div>
                  </motion.div>
                </div>

                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.35 }}
                  className="mt-6 inline-flex items-center gap-1.5 text-xs font-extrabold text-amber-200"
                >
                  <Zap className="h-4 w-4 text-amber-400" /> Arena hazırlanıyor,
                  iyi olan kazansın!
                </motion.p>
              </div>
            ) : (
              <>
                {/* Üst Başlık */}
                <div className="border-b border-white/10 px-5 pt-5 pb-4">
                  <div className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/30 bg-cyan-500/15 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-cyan-300 mb-1.5">
                    <Sparkles className="h-3 w-3" /> ZORUNLU PROFİL KAPISI •{" "}
                    {gameMeta.title}
                  </div>
                  <h2 className="pr-8 text-base sm:text-lg font-black tracking-tight text-white">
                    {headerTitle}
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {step === "mode"
                      ? "Yapay zekaya karşı tek başına mı yoksa sıra arkadaşınla aynı ekranda düello mu?"
                      : "Paylaşımlı sınıf cihazı koruması aktif: 4 haneli PIN kodunla kendi kartını doğrula."}
                  </p>

                  {step !== "mode" && subView !== "pin" && (
                    <div className="mt-3.5 grid grid-cols-2 gap-2 rounded-2xl bg-slate-950/70 p-1 border border-white/10">
                      <button
                        type="button"
                        onClick={() => {
                          sound.playClick();
                          setSubView("list");
                          setError(null);
                        }}
                        className={`relative flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-extrabold transition-colors cursor-pointer ${
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
                          <Users className="h-3.5 w-3.5" /> Sınıf Listesi (
                          {availablePlayers.length})
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          sound.playClick();
                          setSubView("create");
                          setError(null);
                        }}
                        className={`relative flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-extrabold transition-colors cursor-pointer ${
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
                          <UserPlus className="h-3.5 w-3.5" /> + Yeni Sınıf
                          Profili
                        </span>
                      </button>
                    </div>
                  )}
                </div>

                {/* İçerik Gövdesi */}
                <div className="flex-1 overflow-y-auto p-5">
                  {step === "mode" ? (
                    <div className="space-y-3">
                      <motion.button
                        type="button"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.96 }}
                        transition={SPRING_GATE}
                        onClick={() => {
                          sound.playClick();
                          setSelectedMode("solo");
                          setStep("pick_p1");
                          setSubView(players.length > 0 ? "list" : "create");
                        }}
                        className="w-full flex items-center gap-4 rounded-2xl border border-cyan-400/35 bg-gradient-to-r from-cyan-500/15 to-indigo-600/15 hover:border-cyan-300 p-4 text-left transition-colors cursor-pointer"
                      >
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-cyan-500/25 text-cyan-300">
                          <Bot className="h-6 w-6" />
                        </div>
                        <div>
                          <div className="text-sm font-black text-white">
                            Tek Kişilik (Yapay Zeka / Arcade)
                          </div>
                          <p className="mt-0.5 text-xs text-slate-300">
                            {targetGame === "chess"
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
                            setStep("pick_p1");
                            setSubView(players.length > 0 ? "list" : "create");
                          }}
                          className="w-full flex items-center gap-4 rounded-2xl border border-amber-400/40 bg-gradient-to-r from-amber-500/15 to-fuchsia-600/15 hover:border-amber-300 p-4 text-left transition-colors cursor-pointer"
                        >
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500/25 text-amber-300">
                            <Swords className="h-6 w-6" />
                          </div>
                          <div>
                            <div className="text-sm font-black text-white">
                              Sınıf Arkadaşıyla Düello (2 Kişilik - Aynı Cihaz)
                            </div>
                            <p className="mt-0.5 text-xs text-slate-300">
                              İki oyuncu da PIN ile kendi profilini açar; VS
                              arenasında kapışır ve puanlar her iki profile
                              işlenir!
                            </p>
                          </div>
                        </motion.button>
                      )}
                    </div>
                  ) : subView === "pin" && candidate ? (
                    /* 4 Haneli PIN Giriş Formu */
                    <form onSubmit={handleVerifyPin} className="space-y-4">
                      <button
                        type="button"
                        onClick={() => {
                          setSubView("list");
                          setCandidate(null);
                          setPinInput("");
                          setError(null);
                        }}
                        className="inline-flex items-center gap-1 text-xs font-bold text-cyan-400 hover:text-cyan-300 cursor-pointer"
                      >
                        <ChevronLeft className="h-4 w-4" /> Sınıf Listesine Dön
                      </button>

                      <div className="flex flex-col items-center rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-center">
                        <div
                          className={`flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br ${
                            FRAME_THEMES[candidate.frameColor].bgClass
                          } ${
                            FRAME_THEMES[candidate.frameColor].ringClass
                          } text-3xl mb-2`}
                        >
                          {candidate.avatar}
                        </div>
                        <h3 className="text-base font-black text-white">
                          {candidate.name}
                        </h3>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {gameMeta.title} Rekoru:{" "}
                          <strong className="text-amber-300">
                            {candidate.games[
                              targetGame
                            ].highScore.toLocaleString("tr-TR")}
                          </strong>{" "}
                          • Genel:{" "}
                          {candidate.overallBestScore.toLocaleString("tr-TR")} P
                        </p>
                      </div>

                      <div>
                        <label className="flex items-center justify-center gap-1.5 text-xs font-bold text-slate-300 mb-2">
                          <Lock className="h-3.5 w-3.5 text-cyan-400" /> 4 Haneli
                          PIN Kodunu Gir
                        </label>
                        <input
                          type="password"
                          inputMode="numeric"
                          autoFocus
                          required
                          maxLength={4}
                          value={pinInput}
                          onChange={(e) =>
                            setPinInput(
                              e.target.value.replace(/[^0-9]/g, "").slice(0, 4)
                            )
                          }
                          placeholder="••••"
                          className="w-full rounded-2xl border border-cyan-400/40 bg-slate-950 px-4 py-3 text-center text-2xl font-black tracking-[0.65em] text-white placeholder:tracking-widest placeholder:text-slate-600 focus:border-cyan-300 focus:outline-none"
                        />
                      </div>

                      {error && (
                        <motion.div
                          initial={{ x: -6 }}
                          animate={{ x: [-6, 6, -4, 4, 0] }}
                          transition={{ duration: 0.28 }}
                          className="rounded-xl border border-rose-500/40 bg-rose-500/15 px-3.5 py-2.5 text-xs text-rose-200 text-center"
                        >
                          {error}
                        </motion.div>
                      )}

                      <motion.button
                        type="submit"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.95 }}
                        disabled={loading || pinInput.length !== 4}
                        className="w-full flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-500 to-indigo-600 py-3.5 text-sm font-black text-white shadow-lg hover:brightness-110 transition disabled:opacity-50 cursor-pointer"
                      >
                        <Check className="h-4 w-4" />
                        {loading
                          ? "Doğrulanıyor..."
                          : selectedMode === "duel" && step === "pick_p1"
                          ? "1. Oyuncuyu Onayla → Rakip Seçimine Geç"
                          : selectedMode === "duel"
                          ? "PIN Doğrula ve VS Düellosunu Başlat!"
                          : "PIN Doğrula ve Oyunu Başlat!"}
                      </motion.button>
                    </form>
                  ) : subView === "list" ? (
                    /* Sınıf Listesi */
                    <div className="space-y-3">
                      {supportsDuel && step === "pick_p1" && (
                        <button
                          type="button"
                          onClick={() => setStep("mode")}
                          className="inline-flex items-center gap-1 text-xs font-bold text-slate-400 hover:text-white cursor-pointer"
                        >
                          <ChevronLeft className="h-4 w-4" /> Mod Seçimine Dön
                        </button>
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

                      {availablePlayers.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-6 text-center">
                          <p className="text-sm font-semibold text-slate-300">
                            {players.length === 0
                              ? "Henüz sınıfta oluşturulmuş profil yok."
                              : "Seçilebilecek profil bulunamadı."}
                          </p>
                          <button
                            type="button"
                            onClick={() => setSubView("create")}
                            className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-fuchsia-600 px-4 py-2 text-xs font-bold text-white hover:bg-fuchsia-500 transition cursor-pointer"
                          >
                            <UserPlus className="h-3.5 w-3.5" /> + Yeni Sınıf
                            Profili Oluştur
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {availablePlayers.map((p) => {
                            const frame = FRAME_THEMES[p.frameColor];
                            const rankTitle = getOverallRankTitle(
                              p.overallBestScore
                            );
                            return (
                              <motion.button
                                key={p.id}
                                type="button"
                                whileHover={{ scale: 1.015, x: 2 }}
                                whileTap={{ scale: 0.97 }}
                                transition={SPRING_GATE}
                                onClick={() => {
                                  sound.playClick();
                                  setCandidate(p);
                                  setSubView("pin");
                                  setPinInput("");
                                  setError(null);
                                }}
                                className="w-full flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.09] hover:border-indigo-400/40 px-3.5 py-2.5 text-left transition-colors cursor-pointer"
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  <div
                                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${frame.bgClass} ${frame.ringClass} text-xl`}
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
                                      {rankTitle.title}
                                    </div>
                                  </div>
                                </div>
                                <div className="text-right shrink-0 pl-2">
                                  <div className="text-xs font-black text-amber-300 tabular-nums">
                                    {p.games[
                                      targetGame
                                    ].highScore.toLocaleString("tr-TR")}{" "}
                                    P
                                  </div>
                                  <div className="inline-flex items-center gap-1 text-[10px] text-slate-400">
                                    <Lock className="h-2.5 w-2.5" /> PIN ile Seç
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
                              className={`flex h-9 items-center justify-center rounded-xl text-base transition cursor-pointer ${
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
                              className={`flex h-8 items-center justify-center rounded-xl border bg-slate-950 transition cursor-pointer ${
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
                        className="w-full flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 py-3.5 text-sm font-black text-white shadow-lg hover:brightness-110 transition disabled:opacity-50 cursor-pointer"
                      >
                        <Check className="h-4 w-4" />
                        {loading
                          ? "Oluşturuluyor..."
                          : "Profili Oluştur ve Oyuna Gir!"}
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
