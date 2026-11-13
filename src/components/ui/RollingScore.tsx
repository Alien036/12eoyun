"use client";

import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

interface ScoreBurst {
  id: number;
  delta: number;
}

interface RollingScoreProps {
  value: number;
  className?: string;
  popupColorClass?: string;
  showDeltaPopup?: boolean;
}

/**
 * Canlı Skor Sayacı (Rolling Score Ticker):
 * Sayı aniden değişmez; yay/akış enterpolasyonu ile yukarı doğru akarak artar
 * ve yanında GPU hızlandırmalı (+350 gibi) uçup kaybolan puan balonları çıkarır.
 */
export default function RollingScore({
  value,
  className = "text-sm font-black text-white tabular-nums",
  popupColorClass = "text-emerald-300",
  showDeltaPopup = true,
}: RollingScoreProps) {
  const [displayed, setDisplayed] = useState<number>(value);
  const [bursts, setBursts] = useState<ScoreBurst[]>([]);
  const prevTargetRef = useRef<number>(value);
  const currentRef = useRef<number>(value);
  const rafRef = useRef<number | null>(null);
  const burstIdRef = useRef<number>(1);

  useEffect(() => {
    const prevTarget = prevTargetRef.current;
    const delta = value - prevTarget;
    prevTargetRef.current = value;

    if (showDeltaPopup && delta > 0) {
      const id = burstIdRef.current++;
      setBursts((prev) => [...prev.slice(-3), { id, delta }]);
      const timer = window.setTimeout(() => {
        setBursts((prev) => prev.filter((b) => b.id !== id));
      }, 850);
      return () => window.clearTimeout(timer);
    }
  }, [value, showDeltaPopup]);

  useEffect(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
    }

    const animate = () => {
      const diff = value - currentRef.current;
      if (Math.abs(diff) < 0.8) {
        currentRef.current = value;
        setDisplayed(value);
        rafRef.current = null;
        return;
      }
      // Hızlı ve yumuşak yay benzeri yaklaşım (60/120 FPS akıcı)
      currentRef.current += diff * 0.22;
      setDisplayed(Math.round(currentRef.current));
      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [value]);

  return (
    <span className="relative inline-flex items-center">
      <motion.span
        key={value > 0 ? "active" : "zero"}
        animate={value > 0 ? { scale: [1, 1.08, 1] } : { scale: 1 }}
        transition={{ duration: 0.22 }}
        className={className}
      >
        {displayed.toLocaleString("tr-TR")}
      </motion.span>

      <AnimatePresence>
        {bursts.map((b) => (
          <motion.span
            key={b.id}
            initial={{ opacity: 0, y: 4, scale: 0.78 }}
            animate={{ opacity: [0, 1, 1, 0], y: -22, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className={`pointer-events-none absolute -top-1 left-full ml-1.5 whitespace-nowrap text-[11px] font-black drop-shadow-[0_2px_6px_rgba(0,0,0,0.75)] ${popupColorClass}`}
          >
            +{b.delta.toLocaleString("tr-TR")}
          </motion.span>
        ))}
      </AnimatePresence>
    </span>
  );
}

