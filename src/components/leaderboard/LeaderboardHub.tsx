"use client";

import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Crown, Sparkles, Wifi, WifiOff } from "lucide-react";
import {
  FRAME_THEMES,
  formatRelativeTime,
  getOverallRankTitle,
  isSmartboardMultiplayerGame,
  type ActivityFeedEvent,
  type LeaderboardTabKey,
  type PlayerDoc,
} from "@/lib/firestore";
import { sound } from "@/lib/sound";

interface LeaderboardHubProps {
  players: PlayerDoc[];
  events: ActivityFeedEvent[];
  connectionStatus: "connected" | "offline";
  initialTab?: LeaderboardTabKey;
  onSelectPlayer: (player: PlayerDoc) => void;
}

const SPRING_TAB = {
  type: "spring" as const,
  stiffness: 380,
  damping: 28,
};

const TABS: { key: LeaderboardTabKey; label: string; icon: string }[] = [
  { key: "overall", label: "Genel Toplam", icon: "🏆" },
  { key: "blockBlast", label: "Block Blast", icon: "🧱" },
  { key: "chess", label: "Satranç", icon: "♟️" },
  { key: "billiards", label: "Bilardo", icon: "🎱" },
  { key: "solitaire", label: "Solitaire", icon: "🃏" },
  { key: "sudoku", label: "Sudoku", icon: "🔢" },
  { key: "chainReaction", label: "Zincirleme Patlama", icon: "⚛️" },
  { key: "ludo", label: "Kızma Birader", icon: "🎲" },
  { key: "dotsSos", label: "Kare & SOS", icon: "✨" },
  { key: "tanks", label: "Topçu Tanklar", icon: "💥" },
  { key: "memoryMatch", label: "Hafıza Arenası", icon: "🧠" },
];

export default function LeaderboardHub({
  players,
  events,
  connectionStatus,
  initialTab = "overall",
  onSelectPlayer,
}: LeaderboardHubProps) {
  const [activeTab, setActiveTab] = useState<LeaderboardTabKey>(initialTab);

  const getScoreForTab = (p: PlayerDoc, tab: LeaderboardTabKey): number => {
    if (tab === "overall") return p.overallBestScore ?? 0;
    return p.games?.[tab]?.highScore ?? 0;
  };

  const getSubInfoForTab = (p: PlayerDoc, tab: LeaderboardTabKey): string => {
    if (tab === "overall") {
      return getOverallRankTitle(p.overallBestScore ?? 0).title;
    }
    if (tab === "blockBlast") {
      const st = p.games?.blockBlast;
      return `${st?.gamesPlayed ?? 0} oyun • Combo x${Math.max(
        1,
        st?.maxCombo ?? 1
      )}`;
    }
    if (tab === "chess") {
      const st = p.games?.chess;
      return `${st?.wins ?? 0} Galibiyet • ${st?.gamesPlayed ?? 0} maç`;
    }
    if (tab === "billiards") {
      const st = p.games?.billiards;
      return `${st?.wins ?? 0} Galibiyet • Seri x${Math.max(
        1,
        st?.bestStreak ?? 1
      )}`;
    }
    if (tab === "solitaire") {
      const st = p.games?.solitaire;
      return `${st?.wins ?? 0} Zafer • ${st?.gamesPlayed ?? 0} oyun`;
    }
    if (tab === "sudoku") {
      const st = p.games?.sudoku;
      return `${st?.wins ?? 0} Çözüm • ${st?.gamesPlayed ?? 0} oyun`;
    }
    if (isSmartboardMultiplayerGame(tab)) {
      const st = p.games?.[tab];
      return `${st?.wins ?? 0} Şampiyonluk • ${st?.gamesPlayed ?? 0} maç`;
    }
    return "";
  };

  const sortedPlayers = useMemo(() => {
    const copy = [...players];
    copy.sort((a, b) => {
      const sA = getScoreForTab(a, activeTab);
      const sB = getScoreForTab(b, activeTab);
      if (sB !== sA) return sB - sA;
      if (b.overallBestScore !== a.overallBestScore) {
        return b.overallBestScore - a.overallBestScore;
      }
      return b.updatedAt - a.updatedAt;
    });
    return copy;
  }, [players, activeTab]);

  const top3 = sortedPlayers.slice(0, 3);
  const rest = sortedPlayers.slice(3);

  return (
    <div className="flex w-full max-w-5xl flex-col gap-3">
      {/* 1. Canlı "Son Rekorlar & Düellolar" Kayan Bant (activityFeed) */}
      <div className="overflow-hidden rounded-2xl border border-amber-400/25 bg-slate-900/85 backdrop-blur-md">
        <div className="flex items-center gap-2.5 px-3.5 py-2">
          <span className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-amber-400/35 bg-amber-500/20 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-300">
            <Sparkles className="h-3 w-3" /> Canlı Akış
          </span>

          <div className="relative flex-1 overflow-hidden whitespace-nowrap">
            {events.length > 0 ? (
              <motion.div
                animate={{ x: ["0%", "-50%"] }}
                transition={{
                  repeat: Infinity,
                  ease: "linear",
                  duration: Math.max(18, events.length * 5.5),
                }}
                className="inline-flex items-center gap-8 text-xs font-semibold text-slate-100 will-change-transform"
              >
                {[...events, ...events].map((ev, idx) => (
                  <span
                    key={`${ev.id}-${idx}`}
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
                Yeni rekorlar ve akıllı tahta düello sonuçları canlı olarak
                burada kayacak!
              </span>
            )}
          </div>

          <span
            className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
              connectionStatus === "connected"
                ? "bg-emerald-500/20 text-emerald-300"
                : "bg-amber-500/20 text-amber-300"
            }`}
          >
            {connectionStatus === "connected" ? (
              <>
                <Wifi className="h-2.5 w-2.5" /> CANLI
              </>
            ) : (
              <>
                <WifiOff className="h-2.5 w-2.5" /> YEREL
              </>
            )}
          </span>
        </div>
      </div>

      {/* 2. 🏆 Genel Toplam + 10 Ayrı Oyun Sekmeli Sıralama Seçicisi (Yatay Kaydırılabilir Hap Butonlar) */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 no-scrollbar">
        {TABS.map((t) => {
          const active = activeTab === t.key;
          return (
            <motion.button
              key={t.key}
              type="button"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.94 }}
              transition={SPRING_TAB}
              onClick={() => {
                sound.playClick();
                setActiveTab(t.key);
              }}
              className={`relative shrink-0 min-h-[46px] inline-flex items-center gap-1.5 rounded-2xl border px-3.5 py-2 text-xs font-extrabold transition-colors cursor-pointer ${
                active
                  ? "border-indigo-300/60 text-white"
                  : "border-white/10 bg-slate-900/75 text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
            >
              {active && (
                <motion.span
                  layoutId="leaderboardTabPill"
                  transition={SPRING_TAB}
                  className="absolute inset-0 rounded-2xl bg-gradient-to-r from-indigo-600 to-fuchsia-600 shadow-[0_0_22px_rgba(99,102,241,0.45)]"
                />
              )}
              <span className="relative z-10">{t.icon}</span>
              <span className="relative z-10">{t.label}</span>
            </motion.button>
          );
        })}
      </div>

      {/* 3. Podyum & Sıralı Liste */}
      {sortedPlayers.length === 0 ? (
        <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-10 text-center">
          <p className="text-base font-black text-white">
            Henüz Sınıfta Kayıtlı Skor Yok!
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Ana menüden bir oyun seçip PIN kodunla ilk rekoru sen kır.
          </p>
        </div>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={SPRING_TAB}
            className="space-y-4"
          >
            {/* İlk 3 Podyum (Altın / Gümüş / Bronz) */}
            <div className="grid grid-cols-3 items-end gap-2.5 sm:gap-4 pt-2">
              {/* #2 Gümüş */}
              <div>
                {top3[1] ? (
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.03, y: -3 }}
                    whileTap={{ scale: 0.96 }}
                    transition={SPRING_TAB}
                    onClick={() => onSelectPlayer(top3[1])}
                    className="w-full flex flex-col items-center rounded-3xl border border-slate-300/35 bg-gradient-to-b from-slate-300/20 via-slate-900/85 to-slate-950 p-3 sm:p-4 text-center shadow-[0_0_22px_rgba(203,213,225,0.14)] cursor-pointer"
                  >
                    <span className="text-xs font-black text-slate-200">
                      🥈 #2
                    </span>
                    <div
                      className={`my-2 flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${
                        FRAME_THEMES[top3[1].frameColor].bgClass
                      } ${FRAME_THEMES[top3[1].frameColor].ringClass} text-2xl sm:text-3xl`}
                    >
                      {top3[1].avatar}
                    </div>
                    <div className="w-full truncate text-xs sm:text-sm font-extrabold text-white">
                      {top3[1].name}
                    </div>
                    <div className="mt-0.5 text-sm font-black text-slate-200 tabular-nums">
                      {getScoreForTab(top3[1], activeTab).toLocaleString(
                        "tr-TR"
                      )}
                    </div>
                    <div className="mt-0.5 truncate w-full text-[10px] text-slate-400">
                      {getSubInfoForTab(top3[1], activeTab)}
                    </div>
                  </motion.button>
                ) : (
                  <div className="h-32 rounded-3xl border border-white/5 bg-white/[0.02]" />
                )}
              </div>

              {/* #1 Altın Şampiyon */}
              <div>
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.04, y: -4 }}
                  whileTap={{ scale: 0.96 }}
                  transition={SPRING_TAB}
                  onClick={() => onSelectPlayer(top3[0])}
                  className="w-full flex flex-col items-center rounded-3xl border-2 border-amber-300/75 bg-gradient-to-b from-amber-400/30 via-amber-500/10 to-slate-950 p-3.5 sm:p-5 text-center shadow-[0_0_34px_rgba(251,191,36,0.38)] cursor-pointer"
                >
                  <motion.div
                    animate={{ y: [0, -3, 0] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                    className="flex items-center gap-1 text-xs font-black text-amber-300"
                  >
                    <Crown className="h-4 w-4 fill-amber-300 text-amber-300" />{" "}
                    #1
                  </motion.div>
                  <div
                    className={`my-2 flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-2xl bg-gradient-to-br ${
                      FRAME_THEMES[top3[0].frameColor].bgClass
                    } ring-2 ring-amber-300 shadow-[0_0_22px_rgba(251,191,36,0.65)] text-3xl sm:text-4xl`}
                  >
                    {top3[0].avatar}
                  </div>
                  <div className="w-full truncate text-xs sm:text-base font-black text-white">
                    {top3[0].name}
                  </div>
                  <div className="mt-0.5 text-base sm:text-lg font-black text-amber-300 tabular-nums">
                    {getScoreForTab(top3[0], activeTab).toLocaleString("tr-TR")}
                  </div>
                  <div className="mt-0.5 truncate w-full text-[10px] font-semibold text-amber-200/80">
                    {getSubInfoForTab(top3[0], activeTab)}
                  </div>
                </motion.button>
              </div>

              {/* #3 Bronz */}
              <div>
                {top3[2] ? (
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.03, y: -3 }}
                    whileTap={{ scale: 0.96 }}
                    transition={SPRING_TAB}
                    onClick={() => onSelectPlayer(top3[2])}
                    className="w-full flex flex-col items-center rounded-3xl border border-orange-400/35 bg-gradient-to-b from-orange-500/20 via-slate-900/85 to-slate-950 p-3 sm:p-4 text-center shadow-[0_0_22px_rgba(251,146,60,0.14)] cursor-pointer"
                  >
                    <span className="text-xs font-black text-orange-300">
                      🥉 #3
                    </span>
                    <div
                      className={`my-2 flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${
                        FRAME_THEMES[top3[2].frameColor].bgClass
                      } ${FRAME_THEMES[top3[2].frameColor].ringClass} text-2xl sm:text-3xl`}
                    >
                      {top3[2].avatar}
                    </div>
                    <div className="w-full truncate text-xs sm:text-sm font-extrabold text-white">
                      {top3[2].name}
                    </div>
                    <div className="mt-0.5 text-sm font-black text-orange-300 tabular-nums">
                      {getScoreForTab(top3[2], activeTab).toLocaleString(
                        "tr-TR"
                      )}
                    </div>
                    <div className="mt-0.5 truncate w-full text-[10px] text-slate-400">
                      {getSubInfoForTab(top3[2], activeTab)}
                    </div>
                  </motion.button>
                ) : (
                  <div className="h-32 rounded-3xl border border-white/5 bg-white/[0.02]" />
                )}
              </div>
            </div>

            {/* 4. Sıradan İtibaren Tam Sınıf Listesi */}
            {rest.length > 0 && (
              <div className="space-y-2">
                {rest.map((p, idx) => {
                  const rank = idx + 4;
                  const frame = FRAME_THEMES[p.frameColor];
                  const tabScore = getScoreForTab(p, activeTab);
                  return (
                    <motion.button
                      key={p.id}
                      type="button"
                      whileHover={{ scale: 1.012, x: 3 }}
                      whileTap={{ scale: 0.98 }}
                      transition={SPRING_TAB}
                      onClick={() => onSelectPlayer(p)}
                      className="w-full flex items-center justify-between rounded-2xl border border-white/10 bg-slate-900/80 hover:bg-slate-800/85 hover:border-indigo-400/40 px-4 py-3 text-left transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="w-7 text-center text-xs font-black text-slate-400 tabular-nums">
                          #{rank}
                        </span>
                        <div
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${frame.bgClass} ${frame.ringClass} text-xl`}
                        >
                          {p.avatar}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-extrabold text-white">
                            {p.name}
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-slate-400">
                            <span>{getSubInfoForTab(p, activeTab)}</span>
                            <span className="hidden sm:inline">
                              • {formatRelativeTime(p.updatedAt)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0 pl-2">
                        <div className="text-sm sm:text-base font-black text-white tabular-nums">
                          {tabScore.toLocaleString("tr-TR")} P
                        </div>
                        <div className="text-[10px] font-semibold text-cyan-300">
                          10 Oyun Profilini İncele
                        </div>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}
