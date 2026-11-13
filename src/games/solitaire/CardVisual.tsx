"use client";

import React from "react";
import { motion } from "framer-motion";
import { formatRank, isRedSuit, type Suit } from "./klondike";

export function SuitSvg({
  suit,
  className = "h-3.5 w-3.5",
}: {
  suit: Suit;
  className?: string;
}) {
  const color = isRedSuit(suit) ? "#e11d48" : "#0f172a";

  if (suit === "hearts") {
    return (
      <svg viewBox="0 0 24 24" fill={color} className={className}>
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
      </svg>
    );
  }

  if (suit === "diamonds") {
    return (
      <svg viewBox="0 0 24 24" fill={color} className={className}>
        <path d="M12 2L20.5 12L12 22L3.5 12L12 2Z" />
      </svg>
    );
  }

  if (suit === "spades") {
    return (
      <svg viewBox="0 0 24 24" fill={color} className={className}>
        <path d="M12 2C8.5 6.8 3.5 10.4 3.5 14.5C3.5 17.5 5.9 19.5 8.5 19.5C10.1 19.5 11.3 18.7 12 17.6C12.7 18.7 13.9 19.5 15.5 19.5C18.1 19.5 20.5 17.5 20.5 14.5C20.5 10.4 15.5 6.8 12 2ZM10.8 18.2L9.2 22H14.8L13.2 18.2H10.8Z" />
      </svg>
    );
  }

  // clubs (Sinek)
  return (
    <svg viewBox="0 0 24 24" fill={color} className={className}>
      <circle cx="12" cy="7.2" r="4.3" />
      <circle cx="7.4" cy="13.5" r="4.3" />
      <circle cx="16.6" cy="13.5" r="4.3" />
      <path d="M10.7 15.5L9 22H15L13.3 15.5H10.7Z" />
    </svg>
  );
}

function RoyalCourtEmblem({
  rank,
  suit,
}: {
  rank: number;
  suit: Suit;
}) {
  const red = isRedSuit(suit);
  const primary = red ? "#e11d48" : "#1e293b";
  const accent = "#d97706";

  if (rank === 13) {
    // K - Papaz Kraliyet Tacı
    return (
      <div className="relative flex flex-col items-center justify-center rounded-md border border-amber-400/50 bg-gradient-to-b from-amber-50 to-amber-100/70 px-1 py-0.5">
        <svg viewBox="0 0 32 24" className="h-5 w-6 sm:h-7 sm:w-8">
          <path
            d="M3 19L5 7L11 13L16 4L21 13L27 7L29 19H3Z"
            fill={accent}
            stroke={primary}
            strokeWidth="1.5"
          />
          <rect x="4" y="19" width="24" height="3" rx="1" fill={primary} />
        </svg>
      </div>
    );
  }

  if (rank === 12) {
    // Q - Kız Zarif Taç & Mücevher
    return (
      <div className="relative flex flex-col items-center justify-center rounded-md border border-rose-300/60 bg-gradient-to-b from-rose-50 to-amber-50 px-1 py-0.5">
        <svg viewBox="0 0 32 24" className="h-5 w-6 sm:h-7 sm:w-8">
          <path
            d="M4 19C6 10 11 6 16 5C21 6 26 10 28 19H4Z"
            fill={primary}
            fillOpacity="0.16"
            stroke={primary}
            strokeWidth="1.5"
          />
          <path d="M16 4L21 12L16 18L11 12L16 4Z" fill={accent} />
          <circle cx="16" cy="11" r="2.2" fill="#ffffff" />
        </svg>
      </div>
    );
  }

  // J - Vale Şövalye Kalkanı
  return (
    <div className="relative flex flex-col items-center justify-center rounded-md border border-slate-300 bg-gradient-to-b from-slate-50 to-indigo-50 px-1 py-0.5">
      <svg viewBox="0 0 32 24" className="h-5 w-6 sm:h-7 sm:w-8">
        <path
          d="M8 4H24V12C24 17 16 21 16 21C16 21 8 17 8 12V4Z"
          fill={primary}
          fillOpacity="0.88"
          stroke={accent}
          strokeWidth="1.5"
        />
        <path d="M16 6V18M11 11H21" stroke="#fde68a" strokeWidth="1.8" />
      </svg>
    </div>
  );
}

export function CardBackPattern() {
  return (
    <div className="h-full w-full rounded-xl bg-gradient-to-br from-indigo-700 via-indigo-900 to-slate-950 p-[3px] shadow-md border border-indigo-300/40">
      <div
        className="h-full w-full rounded-[9px] border border-amber-300/35 flex items-center justify-center"
        style={{
          backgroundImage:
            "radial-gradient(rgba(251,191,36,0.24) 1px, transparent 1px)",
          backgroundSize: "7px 7px",
        }}
      >
        <div className="h-4 w-4 rounded-full border border-amber-300/50 bg-indigo-500/30" />
      </div>
    </div>
  );
}

interface CardFaceVisualProps {
  suit: Suit;
  rank: number;
  showCenterArt?: boolean;
  justFlipped?: boolean;
  selected?: boolean;
}

export function CardFaceVisual({
  suit,
  rank,
  showCenterArt = true,
  justFlipped = false,
  selected = false,
}: CardFaceVisualProps) {
  const red = isRedSuit(suit);
  const rankStr = formatRank(rank);

  return (
    <motion.div
      initial={justFlipped ? { rotateY: 180, scale: 1.05 } : false}
      animate={{ rotateY: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 360, damping: 26 }}
      style={{ transformStyle: "preserve-3d" }}
      className={`h-full w-full rounded-xl bg-gradient-to-b from-white via-slate-50 to-slate-100 border p-1 sm:p-1.5 flex flex-col justify-between shadow-[0_4px_12px_rgba(0,0,0,0.35)] ${
        selected
          ? "border-cyan-400 ring-2 ring-cyan-400"
          : "border-slate-300/95"
      }`}
    >
      {/* Sol Üst Köşe Değer + Vektörel Sembol */}
      <div className="flex items-center justify-between leading-none">
        <span
          className={`text-[10px] sm:text-xs font-black tracking-tighter ${
            red ? "text-rose-600" : "text-slate-900"
          }`}
        >
          {rankStr}
        </span>
        <SuitSvg suit={suit} className="h-2.5 w-2.5 sm:h-3.5 sm:w-3.5" />
      </div>

      {/* Merkez Vektörel Kraliyet Deseni veya As / Sembol */}
      {showCenterArt && (
        <div className="flex flex-1 items-center justify-center py-0.5">
          {rank >= 11 ? (
            <RoyalCourtEmblem rank={rank} suit={suit} />
          ) : rank === 1 ? (
            <div className="rounded-full bg-amber-500/10 p-1 ring-1 ring-amber-400/40">
              <SuitSvg suit={suit} className="h-5 w-5 sm:h-7 sm:w-7" />
            </div>
          ) : (
            <SuitSvg suit={suit} className="h-4 w-4 sm:h-6 sm:w-6 opacity-90" />
          )}
        </div>
      )}

      {/* Sağ Alt Ters Köşe (Yalnızca tam kart görünürken) */}
      {showCenterArt && (
        <div className="hidden sm:flex items-center justify-between leading-none rotate-180 opacity-85">
          <span
            className={`text-[10px] font-black tracking-tighter ${
              red ? "text-rose-600" : "text-slate-900"
            }`}
          >
            {rankStr}
          </span>
          <SuitSvg suit={suit} className="h-3 w-3" />
        </div>
      )}
    </motion.div>
  );
}

