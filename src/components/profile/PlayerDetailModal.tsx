"use client";

import React, { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Trophy,
  Award,
  Clock,
  Edit3,
  Lock,
  Check,
  X,
} from "lucide-react";
import {
  AVATAR_OPTIONS,
  FRAME_THEMES,
  GAME_LABELS,
  formatRelativeTime,
  getOverallRankTitle,
  updateProfileWithPinVerification,
  type FrameColorKey,
  type GameKey,
  type PlayerDoc,
} from "@/lib/firestore";

interface PlayerDetailModalProps {
  player: PlayerDoc | null;
  allPlayers: PlayerDoc[];
  onClose: () => void;
}

const ALL_GAME_KEYS: GameKey[] = [
  "blockBlast",
  "chess",
  "billiards",
  "solitaire",
  "sudoku",
];
const FRAME_KEYS = Object.keys(FRAME_THEMES) as FrameColorKey[];

export default function PlayerDetailModal({
  player,
  allPlayers,
  onClose,
}: PlayerDetailModalProps) {
  const [editMode, setEditMode] = useState(false);
  const [pin, setPin] = useState("");
  const [avatar, setAvatar] = useState("🚀");
  const [frameColor, setFrameColor] = useState<FrameColorKey>("cyan");
  const [statusText, setStatusText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const livePlayer = useMemo(() => {
    if (!player) return null;
    return allPlayers.find((p) => p.id === player.id) ?? player;
  }, [player, allPlayers]);

  useEffect(() => {
    if (livePlayer) {
      setAvatar(livePlayer.avatar);
      setFrameColor(livePlayer.frameColor);
      setStatusText(livePlayer.statusText);
    }
    setEditMode(false);
    setPin("");
    setError(null);
  }, [livePlayer?.id]);

  // Oyuncunun genel ve 5 oyunun tamamındaki sınıf sıralamasını hesapla
  const ranks = useMemo(() => {
    if (!livePlayer) return null;

    const overallSorted = [...allPlayers].sort(
      (a, b) => b.overallBestScore - a.overallBestScore
    );
    const overallRank =
      overallSorted.findIndex((p) => p.id === livePlayer.id) + 1;

    const perGameRank: Record<GameKey, number> = {
      blockBlast: 1,
      chess: 1,
      billiards: 1,
      solitaire: 1,
      sudoku: 1,
    };

    for (const gKey of ALL_GAME_KEYS) {
      const sorted = [...allPlayers].sort(
        (a, b) => b.games[gKey].highScore - a.games[gKey].highScore
      );
      const idx = sorted.findIndex((p) => p.id === livePlayer.id);
      perGameRank[gKey] = idx >= 0 ? idx + 1 : 1;
    }

    return {
      overallRank: overallRank > 0 ? overallRank : 1,
      perGameRank,
    };
  }, [livePlayer, allPlayers]);

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!livePlayer) return;
    setError(null);
    setSaving(true);
    try {
      const res = await updateProfileWithPinVerification({
        targetPlayer: livePlayer,
        enteredPin: pin,
        avatar,
        frameColor,
        statusText,
      });
      if (!res.ok) {
        setError(res.error || "PIN doğrulanamadı.");
      } else {
        setPin("");
        setEditMode(false);
      }
    } finally {
      setSaving(false);
    }
  };

  const renderGameExtraStat = (p: PlayerDoc, key: GameKey): string => {
    if (key === "blockBlast") {
      return `${p.games.blockBlast.gamesPlayed} oyun • Maks Combo x${Math.max(
        1,
        p.games.blockBlast.maxCombo
      )}`;
    }
    if (key === "chess") {
      return `${p.games.chess.wins}G / ${p.games.chess.losses}M • ${p.games.chess.gamesPlayed} maç`;
    }
    if (key === "billiards") {
      return `${p.games.billiards.wins} galibiyet • Seri x${Math.max(
        1,
        p.games.billiards.bestStreak
      )}`;
    }
    if (key === "solitaire") {
      const bestT = p.games.solitaire.bestTimeSec;
      return `${p.games.solitaire.wins} zafer${
        bestT !== null ? ` • En hızlı ${bestT} sn` : ""
      }`;
    }
    const bestT = p.games.sudoku.bestTimeSec;
    return `${p.games.sudoku.wins} çözüm${
      bestT !== null ? ` • En hızlı ${bestT} sn` : ""
    }`;
  };

  return (
    <AnimatePresence>
      {livePlayer && ranks && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-3 sm:p-4"
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 18 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 18 }}
            transition={{ type: "spring", stiffness: 360, damping: 28 }}
            className="relative w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-3xl border border-white/15 bg-slate-900/95 p-5 shadow-[0_0_55px_rgba(99,102,241,0.3)] text-slate-100"
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="Kapat"
              className="absolute right-4 top-4 rounded-xl bg-white/5 p-2 text-slate-400 hover:bg-white/10 hover:text-white transition cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Oyuncu Üst Başlığı */}
            <div className="flex items-center gap-4 pr-8">
              <div
                className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${
                  FRAME_THEMES[editMode ? frameColor : livePlayer.frameColor]
                    .bgClass
                } ${
                  FRAME_THEMES[editMode ? frameColor : livePlayer.frameColor]
                    .ringClass
                } text-3xl`}
              >
                {editMode ? avatar : livePlayer.avatar}
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-xl font-black text-white">
                    {livePlayer.name}
                  </h2>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-extrabold ${
                      getOverallRankTitle(livePlayer.overallBestScore).pillClass
                    }`}
                  >
                    <Award className="h-3 w-3" />
                    {getOverallRankTitle(livePlayer.overallBestScore).title}
                  </span>
                </div>
                <p className="mt-0.5 text-xs italic text-slate-300">
                  &ldquo;{editMode ? statusText : livePlayer.statusText}&rdquo;
                </p>
                <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-400">
                  <Clock className="h-3 w-3 text-cyan-400" />
                  {formatRelativeTime(livePlayer.updatedAt)}
                </div>
              </div>
            </div>

            {/* Genel Toplam Rekor ve Sınıf Sırası */}
            <div className="my-4 flex items-center justify-between rounded-2xl border border-amber-400/35 bg-gradient-to-r from-amber-500/20 via-indigo-500/10 to-fuchsia-600/15 px-4 py-3">
              <div>
                <div className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-amber-300">
                  <Trophy className="h-4 w-4" /> Genel Toplam Rekor (5 Oyun)
                </div>
                <div className="mt-0.5 text-3xl font-black text-white tabular-nums">
                  {livePlayer.overallBestScore.toLocaleString("tr-TR")}{" "}
                  <span className="text-sm font-bold text-amber-300">Puan</span>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[11px] font-bold text-slate-300">
                  Genel Sınıf Sırası
                </span>
                <div className="text-2xl font-black text-cyan-300 tabular-nums">
                  #{ranks.overallRank}
                </div>
              </div>
            </div>

            {editMode ? (
              /* PIN Doğrulamalı Düzenleme Modu */
              <form
                onSubmit={handleSaveEdit}
                className="space-y-3.5 rounded-2xl border border-indigo-400/30 bg-slate-950/70 p-4"
              >
                <div className="text-xs font-extrabold text-indigo-300">
                  Profil Düzenleme (PIN Doğrulamalı)
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
                        onClick={() => setAvatar(emo)}
                        className={`flex h-9 items-center justify-center rounded-xl text-base transition cursor-pointer ${
                          avatar === emo
                            ? "bg-indigo-600/40 border-2 border-indigo-400"
                            : "bg-white/5 border border-white/10"
                        }`}
                      >
                        {emo}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">
                    Çerçeve Rengi ({FRAME_THEMES[frameColor].label})
                  </label>
                  <div className="grid grid-cols-6 gap-2">
                    {FRAME_KEYS.map((fKey) => (
                      <button
                        key={fKey}
                        type="button"
                        onClick={() => setFrameColor(fKey)}
                        className={`flex h-8 items-center justify-center rounded-xl border bg-slate-900 cursor-pointer ${
                          frameColor === fKey
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
                    Durum Sözü
                  </label>
                  <input
                    type="text"
                    maxLength={48}
                    value={statusText}
                    onChange={(e) => setStatusText(e.target.value)}
                    className="w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-2 text-xs text-white focus:border-indigo-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="flex items-center gap-1 text-xs font-bold text-cyan-300 mb-1">
                    <Lock className="h-3.5 w-3.5" /> Onaylamak İçin Kendi 4
                    Haneli PIN Kodunu Gir
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    required
                    maxLength={4}
                    value={pin}
                    onChange={(e) =>
                      setPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))
                    }
                    placeholder="••••"
                    className="w-full rounded-xl border border-cyan-400/40 bg-slate-900 px-3.5 py-2 text-center text-lg font-black tracking-[0.5em] text-white focus:outline-none"
                  />
                </div>

                {error && (
                  <div className="rounded-xl border border-rose-500/40 bg-rose-500/15 px-3 py-2 text-xs text-rose-200">
                    {error}
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditMode(false);
                      setError(null);
                    }}
                    className="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-xs font-bold text-slate-300 cursor-pointer"
                  >
                    İptal
                  </button>
                  <button
                    type="submit"
                    disabled={saving || pin.length !== 4}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 py-2.5 text-xs font-black text-white disabled:opacity-50 cursor-pointer"
                  >
                    <Check className="h-4 w-4" />
                    {saving ? "Doğrulanıyor..." : "PIN Doğrula & Güncelle"}
                  </button>
                </div>
              </form>
            ) : (
              <>
                {/* 5 Oyunun Tamamındaki Kişisel En Yüksek Puanlar & Sınıf Sıralaması */}
                <div className="space-y-2">
                  <div className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
                    Oyun Bazlı Kişisel Rekorlar & Sınıf Sıralaması
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {ALL_GAME_KEYS.map((gKey) => {
                      const meta = GAME_LABELS[gKey];
                      const gScore = livePlayer.games[gKey].highScore;
                      const gRank = ranks.perGameRank[gKey];

                      return (
                        <div
                          key={gKey}
                          className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-base">{meta.icon}</span>
                              <span
                                className={`text-xs font-extrabold ${meta.accent}`}
                              >
                                {meta.title}
                              </span>
                            </div>
                            <div className="mt-0.5 text-[10px] text-slate-400 truncate">
                              {renderGameExtraStat(livePlayer, gKey)}
                            </div>
                          </div>

                          <div className="text-right shrink-0 pl-2">
                            <div className="text-sm font-black text-white tabular-nums">
                              {gScore.toLocaleString("tr-TR")} P
                            </div>
                            <div className="text-[10px] font-bold text-amber-300">
                              {gScore > 0 ? `Sınıf #${gRank}` : "Henüz skor yok"}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setEditMode(true)}
                  className="mt-4 w-full flex items-center justify-center gap-2 rounded-2xl border border-indigo-400/35 bg-indigo-500/15 hover:bg-indigo-500/25 py-3 text-xs font-extrabold text-indigo-200 transition cursor-pointer"
                >
                  <Edit3 className="h-4 w-4" /> Bu Profil Benim — PIN ile Avatar
                  & Durum Güncelle
                </button>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

