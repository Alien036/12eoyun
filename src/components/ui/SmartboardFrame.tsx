"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  RotateCcw,
  Trophy,
  Sparkles,
  Lock,
  Hand,
} from "lucide-react";
import {
  SMARTBOARD_SLOTS,
  type MultiplayerFinalStanding,
  type MultiplayerSeat,
} from "@/lib/firestore";
import RollingScore from "./RollingScore";

export interface SmartboardPlayerHudState {
  seat: MultiplayerSeat;
  actionScore: number;
  statLabel: string;
  eliminated?: boolean;
  extraBadge?: string;
}

interface SmartboardFrameProps {
  gameTitle: string;
  gameIcon: string;
  modeSubtitle: string;
  playersHud: SmartboardPlayerHudState[];
  activeSlotIndex: number;
  isAnimating: boolean;
  statusBannerText?: string;
  finalStandings: MultiplayerFinalStanding[] | null;
  onBackToHub: () => void;
  onRestartWithGate: () => void;
  bottomBarContent?: React.ReactNode;
  children: React.ReactNode;
}

export default function SmartboardFrame({
  gameTitle,
  gameIcon,
  modeSubtitle,
  playersHud,
  activeSlotIndex,
  isAnimating,
  statusBannerText,
  finalStandings,
  onBackToHub,
  onRestartWithGate,
  bottomBarContent,
  children,
}: SmartboardFrameProps) {
  const activeSlotTheme =
    SMARTBOARD_SLOTS[activeSlotIndex % SMARTBOARD_SLOTS.length];
  const activeEntry =
    playersHud.find((p) => p.seat.slotIndex === activeSlotIndex) ??
    playersHud[0];

  return (
    <div
      className={`relative flex h-full w-full max-w-[1560px] flex-col justify-between overflow-hidden rounded-3xl border-2 bg-slate-950/90 p-2 sm:p-3 transition-shadow duration-300 select-none touch-none ${activeSlotTheme.frameGlowClass}`}
    >
      {/* ÜST KOMPAKT DURUM & DEV SIRA GÖSTERGESİ */}
      <div className="relative z-20 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 bg-slate-900/90 px-3 py-1.5 backdrop-blur-md shrink-0">
        {/* Sol: Oyun Başlığı */}
        <div className="flex items-center gap-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950 border border-white/10 text-xl">
            {gameIcon}
          </span>
          <div>
            <div className="text-xs sm:text-sm font-black text-white leading-tight">
              {gameTitle}
            </div>
            <div className="text-[10px] font-bold text-slate-400">
              {modeSubtitle}
            </div>
          </div>
        </div>

        {/* Merkez: DEV SIRA GÖSTERGESİ (Aktif Oyuncu Rengi + Avatar + Durum) */}
        {activeEntry && (
          <motion.div
            key={`turn-${activeSlotIndex}`}
            initial={{ scale: 0.9, opacity: 0.7 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 420, damping: 26 }}
            className={`flex items-center gap-2.5 rounded-2xl border-2 px-3.5 py-1.5 shadow-lg ${activeSlotTheme.borderClass} ${activeSlotTheme.bgSoftClass}`}
          >
            <span className="text-2xl leading-none">
              {activeEntry.seat.player.avatar}
            </span>
            <div>
              <div className="flex items-center gap-1.5">
                <span
                  className={`text-[10px] font-black uppercase tracking-wider ${activeSlotTheme.textClass}`}
                >
                  {activeSlotTheme.label} ({activeSlotTheme.colorName})
                </span>
                {isAnimating ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/25 border border-amber-400/50 px-2 py-0.5 text-[9px] font-black text-amber-200">
                    <Lock className="h-2.5 w-2.5" /> HAMLE KİLİDİ
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/25 border border-emerald-400/50 px-2 py-0.5 text-[9px] font-black text-emerald-200">
                    <Hand className="h-2.5 w-2.5" /> SIRA SENDE
                  </span>
                )}
              </div>
              <div className="text-xs sm:text-sm font-black text-white leading-tight">
                {activeEntry.seat.player.name}
                {statusBannerText ? (
                  <span className="ml-2 text-[11px] font-bold text-slate-200">
                    • {statusBannerText}
                  </span>
                ) : null}
              </div>
            </div>
          </motion.div>
        )}

        {/* Sağ: 2-4 Oyuncu Canlı Kartları */}
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {playersHud.map((item) => {
            const sTheme =
              SMARTBOARD_SLOTS[item.seat.slotIndex % SMARTBOARD_SLOTS.length];
            const isTurn = item.seat.slotIndex === activeSlotIndex;
            return (
              <div
                key={item.seat.slotIndex}
                className={`flex items-center gap-2 rounded-xl border px-2.5 py-1 transition-all ${
                  item.eliminated
                    ? "border-white/5 bg-slate-950/40 opacity-40 grayscale"
                    : isTurn
                    ? `${sTheme.borderClass} ${sTheme.bgSoftClass} scale-[1.03] shadow`
                    : "border-white/10 bg-slate-950/75"
                }`}
              >
                <span className="text-lg leading-none">
                  {item.seat.player.avatar}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1">
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: sTheme.hex }}
                    />
                    <span className="truncate max-w-[78px] text-[11px] font-black text-white">
                      {item.seat.player.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px]">
                    <RollingScore
                      value={item.actionScore}
                      className={`font-black ${sTheme.textClass}`}
                    />
                    <span className="text-slate-400">• {item.statLabel}</span>
                    {item.extraBadge && (
                      <span className="rounded bg-white/10 px-1 font-bold text-amber-300">
                        {item.extraBadge}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ORTA: 16:9 ANA OYUN SAHNESİ (Sıkı Sıra Kilidi ile) */}
      <div className="relative flex-1 min-h-0 w-full flex items-center justify-center overflow-hidden my-1.5">
        {children}
      </div>

      {/* ALT-YAN ERİŞİLEBİLİR AKILLI TAHTA KONTROL BARI (Min 52x52px Dokunma Hedefleri) */}
      <div className="relative z-20 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 bg-slate-900/90 px-3 py-1.5 backdrop-blur-md shrink-0">
        <button
          type="button"
          onClick={onBackToHub}
          className="inline-flex min-h-[52px] min-w-[52px] items-center justify-center gap-2 rounded-2xl border border-white/15 bg-slate-950/85 hover:bg-slate-800 px-4 text-xs font-extrabold text-slate-200 transition cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4 text-cyan-400" />
          <span>Ana Menü</span>
        </button>

        {/* Oyun Özel Alt Kontroller (S / O seçimi, Tank silah barı, Zar butonu vb.) */}
        <div className="flex flex-1 items-center justify-center gap-2">
          {bottomBarContent}
        </div>

        <button
          type="button"
          onClick={onRestartWithGate}
          className="inline-flex min-h-[52px] min-w-[52px] items-center justify-center gap-2 rounded-2xl border border-indigo-400/35 bg-indigo-500/15 hover:bg-indigo-500/25 px-4 text-xs font-extrabold text-indigo-200 transition cursor-pointer"
        >
          <RotateCcw className="h-4 w-4 text-indigo-300" />
          <span>Yeni Maç (Profil Seç)</span>
        </button>
      </div>

      {/* MAÇ SONU 2-4 KİŞİLİK ZAFER & ADİL PUAN DAĞILIMI EKRANI */}
      <AnimatePresence>
        {finalStandings && finalStandings.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-4"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              transition={{ type: "spring", stiffness: 360, damping: 28 }}
              className="w-full max-w-xl rounded-3xl border border-amber-400/40 bg-slate-900/95 p-5 sm:p-6 shadow-[0_0_60px_rgba(251,191,36,0.3)] text-center"
            >
              <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/45 bg-amber-500/20 px-3.5 py-1 text-xs font-black uppercase tracking-wider text-amber-300">
                <Trophy className="h-4 w-4" /> {gameTitle} • MAÇ SONUCU
              </div>

              {(() => {
                const champ =
                  finalStandings.find((s) => s.rank === 1) ?? finalStandings[0];
                const cTheme =
                  SMARTBOARD_SLOTS[
                    champ.slotIndex % SMARTBOARD_SLOTS.length
                  ];
                return (
                  <div className="mt-3">
                    <div className="text-4xl">{champ.player.avatar}</div>
                    <h2 className="mt-1 text-xl sm:text-2xl font-black text-white">
                      🏆 Şampiyon: {champ.player.name}!
                    </h2>
                    <p className={`text-xs font-bold ${cTheme.textClass}`}>
                      {cTheme.label} ({cTheme.colorName}) •{" "}
                      {champ.finalScore.toLocaleString("tr-TR")} Puan Kazandı
                    </p>
                  </div>
                );
              })()}

              {/* Tüm Oyuncuların Sıralama ve Firestore Puan Tablosu */}
              <div className="mt-4 space-y-2 text-left">
                {finalStandings
                  .slice()
                  .sort((a, b) => a.rank - b.rank)
                  .map((st) => {
                    const sTheme =
                      SMARTBOARD_SLOTS[st.slotIndex % SMARTBOARD_SLOTS.length];
                    return (
                      <div
                        key={st.slotIndex}
                        className={`flex items-center justify-between rounded-2xl border px-3.5 py-2.5 ${
                          st.rank === 1
                            ? "border-amber-400/60 bg-amber-500/15"
                            : "border-white/10 bg-slate-950/75"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-base font-black text-amber-300 w-7">
                            {st.rank === 1
                              ? "🥇"
                              : st.rank === 2
                              ? "🥈"
                              : st.rank === 3
                              ? "🥉"
                              : `#${st.rank}`}
                          </span>
                          <span className="text-2xl">{st.player.avatar}</span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate text-sm font-black text-white">
                                {st.player.name}
                              </span>
                              <span
                                className={`rounded-full border px-2 py-0.5 text-[9px] font-black ${sTheme.badgeClass}`}
                              >
                                {sTheme.colorName}
                              </span>
                              {st.isNewPersonalBest && (
                                <span className="inline-flex items-center gap-0.5 rounded-full bg-fuchsia-500/25 border border-fuchsia-400/50 px-2 py-0.5 text-[9px] font-black text-fuchsia-200">
                                  <Sparkles className="h-2.5 w-2.5" /> YENİ REKOR
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {st.statSummary ||
                                `Aksiyon: ${st.actionScore.toLocaleString(
                                  "tr-TR"
                                )} P`}
                              {st.isBot
                                ? " • Yapay Zeka Bot"
                                : " • Firestore'a Kaydedildi"}
                            </div>
                          </div>
                        </div>

                        <div className="text-right shrink-0 pl-2">
                          <div className="text-base font-black text-amber-300 tabular-nums">
                            +{st.finalScore.toLocaleString("tr-TR")} P
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {st.rank === 1
                              ? "Şampiyonluk Bonusu Dahil"
                              : "Performans Puanı"}
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={onBackToHub}
                  className="min-h-[54px] flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 hover:bg-white/10 text-xs sm:text-sm font-extrabold text-slate-200 transition cursor-pointer"
                >
                  <ArrowLeft className="h-4 w-4" /> Ana Menüye Dön
                </button>
                <button
                  type="button"
                  onClick={onRestartWithGate}
                  className="min-h-[54px] flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500 text-xs sm:text-sm font-black text-slate-950 shadow-lg hover:brightness-110 transition cursor-pointer"
                >
                  <RotateCcw className="h-4 w-4" /> Yeni Maç Başlat (Profil Seç)
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
