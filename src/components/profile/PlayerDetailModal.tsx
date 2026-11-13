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
  ALL_GAME_KEYS,
  AVATAR_OPTIONS,
  FRAME_THEMES,
  GAME_LABELS,
  formatRelativeTime,
  getOverallRankTitle,
  isSmartboardMultiplayerGame,
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

  // Oyuncunun genel ve 10 oyunun tamamındaki sınıf sıralamasını güvenli hesapla
  const ranks = useMemo(() => {
    if (!livePlayer) return null;

    const overallSorted = [...allPlayers].sort(
      (a, b) => (b.overallBestScore ?? 0) - (a.overallBestScore ?? 0)
    );
    const overallRank =
      overallSorted.findIndex((p) => p.id === livePlayer.id) + 1;

    const perGameRank = {} as Record<GameKey, number>;

    for (const gKey of ALL_GAME_KEYS) {
      const sorted = [...allPlayers].sort(
        (a, b) =>
          (b.games?.[gKey]?.highScore ?? 0) -
          (a.games?.[gKey]?.highScore ?? 0)
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
      const st = p.games?.blockBlast;
      return `${st?.gamesPlayed ?? 0} oyun • Maks Combo x${Math.max(
        1,
        st?.maxCombo ?? 1
      )}`;
    }
    if (key === "chess") {
      const st = p.games?.chess;
      return `${st?.wins ?? 0}G / ${st?.losses ?? 0}M • ${
        st?.gamesPlayed ?? 0
      } maç`;
    }
    if (key === "billiards") {
      const st = p.games?.billiards;
      return `${st?.wins ?? 0} galibiyet • Seri x${Math.max(
        1,
        st?.bestStreak ?? 1
      )}`;
    }
    if (key === "solitaire") {
      const st = p.games?.solitaire;
      const bestT = st?.bestTimeSec ?? null;
      return `${st?.wins ?? 0} zafer${
        bestT !== null ? ` • En hızlı ${bestT} sn` : ""
      }`;
    }
    if (key === "sudoku") {
      const st = p.games?.sudoku;
      const bestT = st?.bestTimeSec ?? null;
      return `${st?.wins ?? 0} çözüm${
        bestT !== null ? ` • En hızlı ${bestT} sn` : ""
      }`;
    }
    if (key === "buckshot" || key === "wireRoulette") {
      const st = p.games?.[key];
      return `${st?.wins ?? 0} zafer • ${st?.gamesPlayed ?? 0} düello`;
    }
    if (isSmartboardMultiplayerGame(key)) {
      const st = p.games?.[key];
      return `${st?.wins ?? 0} şampiyonluk • ${st?.gamesPlayed ?? 0} maç`;
    }
    return "";
  };

  return (
    <AnimatePresence>
      {livePlayer && ranks && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-3 sm:p-4 select-none"
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 18 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 18 }}
            transition={{ type: "spring", stiffness: 360, damping: 28 }}
            className="relative w-full max-w-xl max-h-[92dvh] overflow-y-auto rounded-3xl border border-white/15 bg-slate-900/95 p-5 shadow-[0_0_55px_rgba(99,102,241,0.3)] text-slate-100"
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="Kapat"
              className="absolute right-4 top-4 flex h-12 w-12 items-center justify-center rounded-xl bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white transition cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Oyuncu Üst Başlığı */}
            <div className="flex items-center gap-4 pr-12">
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

            {/* Genel Toplam Rekor ve Sınıf Sırası (10 Oyun) */}
            <div className="my-4 flex items-center justify-between rounded-2xl border border-amber-400/35 bg-gradient-to-r from-amber-500/20 via-indigo-500/10 to-fuchsia-600/15 px-4 py-3">
              <div>
                <div className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-amber-300">
                  <Trophy className="h-4 w-4" /> Genel Toplam Rekor (13 Oyun)
                </div>
                <div className="mt-0.5 text-3xl font-black text-white tabular-nums">
                  {(livePlayer.overallBestScore ?? 0).toLocaleString("tr-TR")}{" "}
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
                        className={`flex h-10 items-center justify-center rounded-xl text-base transition cursor-pointer ${
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
                        className={`flex h-9 items-center justify-center rounded-xl border bg-slate-900 cursor-pointer ${
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
                    className="min-h-[48px] rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-xs font-bold text-slate-300 cursor-pointer"
                  >
                    İptal
                  </button>
                  <button
                    type="submit"
                    disabled={saving || pin.length !== 4}
                    className="min-h-[48px] flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 py-2.5 text-xs font-black text-white disabled:opacity-50 cursor-pointer"
                  >
                    <Check className="h-4 w-4" />
                    {saving ? "Doğrulanıyor..." : "PIN Doğrula & Güncelle"}
                  </button>
                </div>
              </form>
            ) : (
              <>
                {/* 10 Oyunun Tamamındaki Kişisel En Yüksek Puanlar & Sınıf Sıralaması (2 Sütunlu Izgara) */}
                <div className="space-y-2">
                  <div className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
                    10 Oyun Bazlı Kişisel Rekorlar & Sınıf Sıralaması
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {ALL_GAME_KEYS.map((gKey) => {
                      const meta = GAME_LABELS[gKey];
                      const gScore = livePlayer.games?.[gKey]?.highScore ?? 0;
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
                  className="mt-4 min-h-[52px] w-full flex items-center justify-center gap-2 rounded-2xl border border-indigo-400/35 bg-indigo-500/15 hover:bg-indigo-500/25 py-3 text-xs font-extrabold text-indigo-200 transition cursor-pointer"
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
