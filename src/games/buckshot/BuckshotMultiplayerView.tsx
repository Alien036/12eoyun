"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import {
  ArrowLeft,
  RotateCcw,
  Crosshair,
  Maximize2,
  Grid,
  Radio,
  RefreshCw,
} from "lucide-react";
import {
  recordMultiplayerMatchResult,
  type MultiplayerSeat,
  type PlayerDoc,
} from "@/lib/firestore";
import { sound } from "@/lib/sound";
import {
  BUCKSHOT_ITEMS,
  type BuckshotItemKey,
  type ShellType,
} from "./BuckshotView";
import {
  BuckshotOctagon3DEngine,
  type OctagonCrateDealEntry,
  type OctagonPlayerSnapshot,
  type OctagonSeat,
} from "./BuckshotOctagon3DEngine";

// Kriptografik Rastgelelik Yardımcıları
function cryptoRandom(): number {
  if (typeof window !== "undefined" && window.crypto?.getRandomValues) {
    const buf = new Uint32Array(1);
    window.crypto.getRandomValues(buf);
    return buf[0] / 0x100000000;
  }
  return Math.random();
}

function cryptoRandomInt(min: number, max: number): number {
  return min + Math.floor(cryptoRandom() * (max - min + 1));
}

function cryptoShuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(cryptoRandom() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

const MULTIPLAYER_ITEM_POOL: BuckshotItemKey[] = [
  "magnifier",
  "handsaw",
  "jammer", // 3-4P modda Kelepçe yerine Sinyal Kesici!
  "remote", // 3-4P modda Uzaktan Kumanda (↻ ⇄ ↺)!
  "soda",
  "sedative",
  "inverter",
  "burnerPhone",
  "adrenaline",
  "expiredMed",
];

const MASK_LABELS: Record<OctagonSeat, string> = {
  1: "PORSELEN KABUS MASKESİ",
  2: "SOVYET GAZ MASKESİ",
  3: "ENDÜSTRİYEL SOLUNUM MASKESİ",
  4: "PERÇİNLİ KAYNAKÇI MASKESİ",
};

interface BuckshotMultiplayerViewProps {
  seats: MultiplayerSeat[];
  initialSubMode?: string;
  onBackToMenu: () => void;
  onRequireAuth: (callback: () => void) => void;
}

export default function BuckshotMultiplayerView({
  seats,
  initialSubMode,
  onBackToMenu,
}: BuckshotMultiplayerViewProps) {
  const playerCount: 3 | 4 = seats.length === 3 ? 3 : 4;
  const activeSeatList: OctagonSeat[] =
    playerCount === 3 ? [1, 2, 3] : [1, 2, 3, 4];

  // Oyun Modu: Hızlı Hayatta Kalma (Tek Raunt) veya 3 Rauntluk Seri
  const [seriesFormat, setSeriesFormat] = useState<"single" | "series3">(
    initialSubMode === "series3" ? "series3" : "single"
  );
  const [roundIdx, setRoundIdx] = useState<number>(0);
  const [roundWins, setRoundWins] = useState<Record<OctagonSeat, number>>({
    1: 0,
    2: 0,
    3: 0,
    4: 0,
  });

  // Kamera Görünüm Modu: 2x2 Dörtlü Ekran vs Aktif Sıra Tam Ekran
  const [viewMode, setViewMode] = useState<"quad" | "active_fullscreen">(
    "quad"
  );
  const [showCompactGuide, setShowCompactGuide] = useState<boolean>(true);

  const [players, setPlayers] = useState<OctagonPlayerSnapshot[]>(() =>
    ([1, 2, 3, 4] as OctagonSeat[]).map((s) => ({
      seat: s,
      name: seats[s - 1]?.player?.name ?? `${s}. OYUNCU`,
      hp: 4,
      maxHp: 4,
      alive: s <= playerCount,
      jammed: false,
      items: Array(8).fill(null),
    }))
  );

  const [turnSeat, setTurnSeat] = useState<OctagonSeat>(1);
  const [turnDirection, setTurnDirection] = useState<1 | -1>(1);
  const [chamber, setChamber] = useState<ShellType[]>([]);
  const [revealShells, setRevealShells] = useState<ShellType[] | null>(null);
  const [isSawedOff, setIsSawedOff] = useState<boolean>(false);

  const [gunPickedUpBy, setGunPickedUpBy] = useState<OctagonSeat | null>(null);
  const [gunAimSeat, setGunAimSeat] = useState<OctagonSeat | null>(null);
  const [jammerPendingBy, setJammerPendingBy] = useState<OctagonSeat | null>(
    null
  );
  const [adrenalineStealBy, setAdrenalineStealBy] =
    useState<OctagonSeat | null>(null);

  const [knownCurrentShell, setKnownCurrentShell] =
    useState<ShellType | null>(null);
  const [secretHint, setSecretHint] = useState<{
    seat: OctagonSeat;
    title: string;
    text: string;
    accent: "red" | "blue" | "amber";
  } | null>(null);

  const [bannerText, setBannerText] = useState<string>(
    "SEKİZGEN YERALTI MASASI HAZIRLANIYOR..."
  );
  const [busy, setBusy] = useState<boolean>(true);
  const [matchFinished, setMatchFinished] = useState<boolean>(false);
  const [finalStandings, setFinalStandings] = useState<
    {
      seat: OctagonSeat;
      name: string;
      rank: number;
      score: number;
      isAi: boolean;
      player?: PlayerDoc;
    }[]
  >([]);

  // Elenme Sırası (1. elenen en son sıra alır)
  const eliminationOrderRef = useRef<OctagonSeat[]>([]);
  const savedResultRef = useRef<boolean>(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<BuckshotOctagon3DEngine | null>(null);
  const [webglError, setWebglError] = useState<string | null>(null);
  const [engineEpoch, setEngineEpoch] = useState<number>(0);

  // WebGL 3D Motor Başlatma ve Temizleme
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const eng = new BuckshotOctagon3DEngine(container);
    if (eng.initError) {
      setWebglError(eng.initError);
      eng.dispose();
      return;
    }

    setWebglError(null);
    engineRef.current = eng;

    const onResize = () => eng.resize();
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      eng.dispose();
      engineRef.current = null;
    };
  }, [engineEpoch]);

  // 3D Motor Durum Senkronizasyonu
  useEffect(() => {
    engineRef.current?.syncState({
      playerCount,
      viewMode,
      turnSeat,
      turnDirection,
      isSawedOff,
      players,
      revealShells,
      gunPickedUpBy,
      gunAimSeat,
      jammerPendingBy,
      adrenalineStealBy,
      currentChamberShell: chamber[0] ?? null,
    });
  }, [
    playerCount,
    viewMode,
    turnSeat,
    turnDirection,
    isSawedOff,
    players,
    revealShells,
    gunPickedUpBy,
    gunAimSeat,
    jammerPendingBy,
    adrenalineStealBy,
    chamber,
  ]);

  // Bir sonraki hayattaki (ve Sinyal Kesici yememiş) oyuncuyu bul
  const computeNextTurnSeat = useCallback(
    (
      fromSeat: OctagonSeat,
      dir: 1 | -1,
      currentPlayers: OctagonPlayerSnapshot[]
    ): {
      nextSeat: OctagonSeat;
      skippedSeats: OctagonSeat[];
      updatedPlayers: OctagonPlayerSnapshot[];
    } => {
      const nextPlayers = currentPlayers.map((p) => ({ ...p }));
      const skippedSeats: OctagonSeat[] = [];
      let cursor = fromSeat;

      for (let step = 0; step < 8; step++) {
        const idx = activeSeatList.indexOf(cursor);
        const nextIdx =
          (idx + dir + activeSeatList.length) % activeSeatList.length;
        cursor = activeSeatList[nextIdx];

        const pObj = nextPlayers.find((p) => p.seat === cursor);
        if (!pObj || !pObj.alive || pObj.hp <= 0) continue;

        if (pObj.jammed) {
          pObj.jammed = false;
          skippedSeats.push(cursor);
          continue;
        }

        return {
          nextSeat: cursor,
          skippedSeats,
          updatedPlayers: nextPlayers,
        };
      }

      return {
        nextSeat: fromSeat,
        skippedSeats,
        updatedPlayers: nextPlayers,
      };
    },
    [activeSeatList]
  );

  // Yeni Şarjör ve Demir Sandıktan Eşya Dağıtımı
  const loadNewMagazine = useCallback(
    (
      currentRound: number,
      currentPlayers: OctagonPlayerSnapshot[],
      keepTurnSeat: OctagonSeat
    ) => {
      setBusy(true);
      setIsSawedOff(false);
      setGunPickedUpBy(null);
      setGunAimSeat(null);
      setJammerPendingBy(null);
      setAdrenalineStealBy(null);
      setKnownCurrentShell(null);
      setSecretHint(null);

      const totalShells =
        currentRound === 0 ? cryptoRandomInt(4, 7) : cryptoRandomInt(5, 8);
      const minLive = Math.max(1, Math.floor(totalShells * 0.35));
      const maxLive = Math.min(
        totalShells - 1,
        Math.ceil(totalShells * 0.65)
      );
      const liveCount = cryptoRandomInt(minLive, maxLive);
      const blankCount = totalShells - liveCount;

      const unshuffled: ShellType[] = [
        ...Array(liveCount).fill("live"),
        ...Array(blankCount).fill("blank"),
      ];
      const displayOrder = cryptoShuffle(unshuffled);
      const hiddenChamber = cryptoShuffle(unshuffled);

      // Her hayattaki oyuncuya 2 veya 3 rastgele eşya dağıt
      const itemCount = currentRound === 0 ? 2 : 3;
      const crateDeals: OctagonCrateDealEntry[] = [];

      activeSeatList.forEach((seat) => {
        const p = currentPlayers.find((x) => x.seat === seat);
        if (!p || !p.alive || p.hp <= 0) return;

        const virtualTray = [...p.items];
        for (let k = 0; k < itemCount; k++) {
          const emptyIdx = virtualTray.findIndex((sl) => sl === null);
          if (emptyIdx === -1) break;
          const picked =
            MULTIPLAYER_ITEM_POOL[
              cryptoRandomInt(0, MULTIPLAYER_ITEM_POOL.length - 1)
            ];
          virtualTray[emptyIdx] = picked;
          crateDeals.push({
            ownerSeat: seat,
            slotIndex: emptyIdx,
            itemKey: picked,
          });
        }
      });

      setBannerText(
        `📦 DEMİR SANDIKLAR AÇILIYOR • ${liveCount} DOLU (KIRMIZI) / ${blankCount} BOŞ (MAVİ)`
      );

      const startShellReveal = () => {
        setRevealShells(displayOrder);
        sound.playShotgunRack();

        setTimeout(() => {
          setRevealShells(null);
          setChamber(hiddenChamber);
          setTurnSeat(keepTurnSeat);
          setBusy(false);
          const turnP = currentPlayers.find((x) => x.seat === keepTurnSeat);
          setBannerText(
            `🎯 SIRA: ${turnP?.name ?? `${keepTurnSeat}. OYUNCU`} • TÜFEĞE VEYA EŞYAYA DOKUN`
          );
        }, 2200);
      };

      if (engineRef.current && crateDeals.length > 0) {
        engineRef.current.triggerCrateItemDealSequence(
          crateDeals,
          (ownerSeat, slotIndex, itemKey) => {
            setPlayers((prev) =>
              prev.map((pl) => {
                if (pl.seat !== ownerSeat) return pl;
                const nextItems = [...pl.items];
                nextItems[slotIndex] = itemKey;
                return { ...pl, items: nextItems };
              })
            );
          },
          () => {
            startShellReveal();
          }
        );
      } else {
        startShellReveal();
      }
    },
    [activeSeatList]
  );

  // Raunt Başlat
  const startRound = useCallback(
    (rIdx: number, format: "single" | "series3") => {
      const hpPerPlayer = format === "single" ? 4 : rIdx === 0 ? 3 : 4;
      eliminationOrderRef.current = [];

      const freshPlayers: OctagonPlayerSnapshot[] = (
        [1, 2, 3, 4] as OctagonSeat[]
      ).map((s) => ({
        seat: s,
        name: seats[s - 1]?.player?.name ?? `${s}. OYUNCU`,
        hp: hpPerPlayer,
        maxHp: hpPerPlayer,
        alive: s <= playerCount,
        jammed: false,
        items: Array(8).fill(null),
      }));

      setPlayers(freshPlayers);
      setRoundIdx(rIdx);
      setTurnDirection(1);
      setTurnSeat(1);
      loadNewMagazine(rIdx, freshPlayers, 1);
    },
    [seats, playerCount, loadNewMagazine]
  );

  useEffect(() => {
    startRound(0, seriesFormat);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Maç Sonu Sıralama ve Firestore Kaydı (0 - 10.000 Puan Tavanı)
  const finishMatch = useCallback(
    (
      winnerSeat: OctagonSeat,
      finalPlayers: OctagonPlayerSnapshot[],
      finalWins: Record<OctagonSeat, number>
    ) => {
      setMatchFinished(true);
      setBusy(true);
      sound.playVictory();
      confetti({ particleCount: 95, spread: 75, origin: { y: 0.6 } });

      // Sıralamayı hesapla (Kazanan 1., diğerleri kalan can / kazanılan raunt / elenme sırasına göre)
      const rankedSeats = [...activeSeatList].sort((a, b) => {
        if (a === winnerSeat) return -1;
        if (b === winnerSeat) return 1;
        const wDiff = (finalWins[b] ?? 0) - (finalWins[a] ?? 0);
        if (wDiff !== 0) return wDiff;
        const pA = finalPlayers.find((p) => p.seat === a);
        const pB = finalPlayers.find((p) => p.seat === b);
        const hpDiff = (pB?.hp ?? 0) - (pA?.hp ?? 0);
        if (hpDiff !== 0) return hpDiff;
        // Daha geç elenen daha üst sırada yer alır
        const elimA = eliminationOrderRef.current.indexOf(a);
        const elimB = eliminationOrderRef.current.indexOf(b);
        return elimB - elimA;
      });

      const winnerSnap = finalPlayers.find((p) => p.seat === winnerSeat);
      const remainingHp = Math.max(1, winnerSnap?.hp ?? 1);
      const firstPlaceScore = Math.min(10000, 3800 + remainingHp * 175);
      const rankScores = [firstPlaceScore, 2000, 1100, 500];

      const standings = rankedSeats.map((s, idx) => {
        const seatMeta = seats[s - 1];
        return {
          seat: s,
          name: seatMeta?.player?.name ?? `${s}. OYUNCU`,
          rank: idx + 1,
          score: rankScores[idx] ?? 500,
          isAi: Boolean(seatMeta?.isBot),
          player: seatMeta?.player,
        };
      });

      setFinalStandings(standings);

      if (!savedResultRef.current) {
        savedResultRef.current = true;
        void recordMultiplayerMatchResult({
          game: "buckshot",
          standings: standings
            .filter((st): st is typeof st & { player: PlayerDoc } => Boolean(st.player))
            .map((st) => ({
              slotIndex: st.seat - 1,
              player: st.player,
              isBot: st.isAi,
              rank: st.rank,
              actionScore: remainingHp * 175,
              customFinalScore: st.score,
            })),
          modeLabel: `${playerCount} Kişilik Sekizgen Masa`,
        });
      }
    },
    [activeSeatList, seats, playerCount]
  );

  // Hayatta kalan son kişiyi kontrol et
  const checkRoundSurvivor = useCallback(
    (updatedPlayers: OctagonPlayerSnapshot[]): boolean => {
      const aliveList = updatedPlayers.filter(
        (p) => p.seat <= playerCount && p.alive && p.hp > 0
      );
      if (aliveList.length > 1) return false;

      const survivorSeat: OctagonSeat = aliveList[0]?.seat ?? turnSeat;
      const nextWins = {
        ...roundWins,
        [survivorSeat]: (roundWins[survivorSeat] ?? 0) + 1,
      };
      setRoundWins(nextWins);

      const survivorName =
        updatedPlayers.find((p) => p.seat === survivorSeat)?.name ??
        `${survivorSeat}. OYUNCU`;

      if (
        seriesFormat === "single" ||
        nextWins[survivorSeat] >= 2 ||
        roundIdx >= 2
      ) {
        setBannerText(`🏆 ${survivorName} MASADAN SAĞ ÇIKTI!`);
        setTimeout(() => {
          finishMatch(survivorSeat, updatedPlayers, nextWins);
        }, 1200);
      } else {
        setBannerText(
          `⚡ ${survivorName} ${roundIdx + 1}. RAUNDU KAZANDI! YENİ RAUNT BAŞLIYOR...`
        );
        setTimeout(() => {
          startRound(roundIdx + 1, seriesFormat);
        }, 2000);
      }
      return true;
    },
    [playerCount, turnSeat, roundWins, seriesFormat, roundIdx, finishMatch, startRound]
  );

  // Eşya Kullanımı
  const handleUseItem = useCallback(
    (
      actorSeat: OctagonSeat,
      trayOwnerSeat: OctagonSeat,
      slotIdx: number
    ) => {
      if (busy || matchFinished) return;
      const trayOwner = players.find((p) => p.seat === trayOwnerSeat);
      const itemKey = trayOwner?.items[slotIdx] ?? null;
      if (!itemKey) return;

      // Adrenalin çalma modundaysa rakibin eşyasını sil ve anında uygula
      if (adrenalineStealBy === actorSeat) {
        if (trayOwnerSeat === actorSeat || itemKey === "adrenaline") return;
        setAdrenalineStealBy(null);
      } else if (trayOwnerSeat !== actorSeat) {
        return;
      }

      // Eşyayı tepsiden kaldır
      const nextPlayers = players.map((p) => {
        if (p.seat !== trayOwnerSeat) return p;
        const copy = [...p.items];
        copy[slotIdx] = null;
        return { ...p, items: copy };
      });
      setPlayers(nextPlayers);

      const actorName =
        players.find((p) => p.seat === actorSeat)?.name ??
        `${actorSeat}. OYUNCU`;

      switch (itemKey) {
        case "magnifier": {
          sound.playCrtBeep(1180);
          const current = chamber[0] ?? "blank";
          setKnownCurrentShell(current);
          const isAi = Boolean(seats[actorSeat - 1]?.isBot);
          if (!isAi) {
            setSecretHint({
              seat: actorSeat,
              title: "🔍 BÜYÜTEÇ İNCELEMESİ",
              text:
                current === "live"
                  ? "NAMLUDAKİ FİŞEK: 🔴 DOLU (KIRMIZI)"
                  : "NAMLUDAKİ FİŞEK: 🔵 BOŞ (MAVİ)",
              accent: current === "live" ? "red" : "blue",
            });
            setTimeout(() => setSecretHint(null), 2600);
          }
          setBannerText(`🔍 ${actorName} BÜYÜTEÇLE NAMLUYA BAKTI!`);
          break;
        }

        case "handsaw": {
          if (isSawedOff) return;
          sound.playHandSaw();
          setIsSawedOff(true);
          setBannerText(
            `🪚 ${actorName} NAMLUYU KESTİ! BU ATIŞ DOLU ÇIKARSA 2⚡ HASAR VURUR!`
          );
          break;
        }

        case "soda": {
          if (chamber.length === 0) return;
          const popped = chamber[0];
          const remaining = chamber.slice(1);
          sound.playSodaEject();
          engineRef.current?.triggerPumpAndEject(popped);
          setChamber(remaining);
          setKnownCurrentShell(null);
          setBannerText(
            `🥫 ${actorName} FİŞEĞİ TAHLİYE ETTİ: ${
              popped === "live" ? "🔴 DOLU" : "🔵 BOŞ"
            } DIŞARI FIRLADI!`
          );
          if (remaining.length === 0) {
            setTimeout(() => {
              loadNewMagazine(roundIdx, nextPlayers, actorSeat);
            }, 1200);
          }
          break;
        }

        case "sedative": {
          sound.playDefibShock(true);
          const healed = nextPlayers.map((p) =>
            p.seat === actorSeat
              ? { ...p, hp: Math.min(p.maxHp, p.hp + 1) }
              : p
          );
          setPlayers(healed);
          setBannerText(`🔋 ${actorName} +1⚡ ŞARJ DOLDURDU!`);
          break;
        }

        case "inverter": {
          if (chamber.length === 0) return;
          sound.playCrtBeep(680);
          const flipped: ShellType = chamber[0] === "live" ? "blank" : "live";
          setChamber([flipped, ...chamber.slice(1)]);
          if (knownCurrentShell) {
            setKnownCurrentShell(flipped);
          }
          setBannerText(
            `🔄 ${actorName} DÖNÜŞTÜRÜCÜ KULLANDI! NAMLUDAKİ FİŞEK TERSİNE DÖNDÜ!`
          );
          break;
        }

        case "burnerPhone": {
          sound.playCrtBeep(960);
          const isAi = Boolean(seats[actorSeat - 1]?.isBot);
          if (chamber.length <= 1) {
            if (!isAi) {
              setSecretHint({
                seat: actorSeat,
                title: "📱 GİZLİ TELEFON",
                text: "NAMLUDA SADECE SON FİŞEK KALDI...",
                accent: "amber",
              });
              setTimeout(() => setSecretHint(null), 2600);
            }
          } else {
            const pickIdx = cryptoRandomInt(1, chamber.length - 1);
            const targetShell = chamber[pickIdx];
            if (!isAi) {
              setSecretHint({
                seat: actorSeat,
                title: "📱 GİZLİ TELEFON FISILTISI",
                text: `${pickIdx + 1}. SIRADAKİ FİŞEK: ${
                  targetShell === "live" ? "🔴 DOLU (KIRMIZI)" : "🔵 BOŞ (MAVİ)"
                }`,
                accent: targetShell === "live" ? "red" : "blue",
              });
              setTimeout(() => setSecretHint(null), 2800);
            }
          }
          setBannerText(`📱 ${actorName} GİZLİ TELEFONU DİNLEDİ...`);
          break;
        }

        case "expiredMed": {
          const lucky = cryptoRandom() < 0.5;
          if (lucky) {
            sound.playDefibShock(true);
            const medPlayers = nextPlayers.map((p) =>
              p.seat === actorSeat
                ? { ...p, hp: Math.min(p.maxHp, p.hp + 2) }
                : p
            );
            setPlayers(medPlayers);
            setBannerText(`💊 ${actorName} İLAÇTAN +2⚡ ŞARJ KAZANDI!`);
          } else {
            sound.playDefibShock(false);
            const damagedPlayers = nextPlayers.map((p) => {
              if (p.seat !== actorSeat) return p;
              const newHp = Math.max(0, p.hp - 1);
              if (newHp === 0 && !eliminationOrderRef.current.includes(actorSeat)) {
                eliminationOrderRef.current.push(actorSeat);
                sound.playSpotlightOff();
              }
              return { ...p, hp: newHp, alive: newHp > 0 };
            });
            setPlayers(damagedPlayers);
            setBannerText(`☠️ BOZUK İLAÇ ZEHİRLEDİ! ${actorName} -1⚡ KAYBETTİ!`);
            if (!checkRoundSurvivor(damagedPlayers)) {
              const actorStillAlive = damagedPlayers.find(
                (p) => p.seat === actorSeat
              )?.alive;
              if (!actorStillAlive) {
                const { nextSeat, updatedPlayers } = computeNextTurnSeat(
                  actorSeat,
                  turnDirection,
                  damagedPlayers
                );
                setPlayers(updatedPlayers);
                setTurnSeat(nextSeat);
              }
            }
          }
          break;
        }

        case "remote": {
          // 🎛️ Uzaktan Kumanda: Merkez taret LED oklarını ve sıra dönüş yönünü tersine çevirir!
          sound.playTurretReverse();
          const newDir: 1 | -1 = turnDirection === 1 ? -1 : 1;
          setTurnDirection(newDir);
          setBannerText(
            `🎛️ ${actorName} UZAKTAN KUMANDA BASILDI! SIRA YÖNÜ: ${
              newDir === 1 ? "SAAT YÖNÜ ↻" : "TERS YÖN ↺"
            }`
          );
          break;
        }

        case "jammer": {
          // 📡 Sinyal Kesici: Hangi rakibin monitörünü kilitleyeceğini seçtirir!
          const validTargets = nextPlayers.filter(
            (p) =>
              p.seat <= playerCount &&
              p.seat !== actorSeat &&
              p.alive &&
              p.hp > 0 &&
              !p.jammed
          );
          if (validTargets.length === 0) {
            setBannerText(`📡 KİLİTLENECEK UYGUN RAKİP YOK!`);
            return;
          }
          if (validTargets.length === 1) {
            const target = validTargets[0];
            sound.playHandcuffs();
            const jammedPlayers = nextPlayers.map((p) =>
              p.seat === target.seat ? { ...p, jammed: true } : p
            );
            setPlayers(jammedPlayers);
            setBannerText(
              `📡 ${actorName} SİNYAL KESİCİ İLE ${target.name} MONİTÖRÜNÜ KİLİTLEDİ!`
            );
          } else {
            setJammerPendingBy(actorSeat);
            setBannerText(
              `📡 SİNYAL KESİCİ AKTİF: KİLİTLEMEK İSTEDİĞİN RAKİBİN 3D MASKESİNE DOKUN!`
            );
          }
          break;
        }

        case "adrenaline": {
          // 💉 Adrenalin: Diğer hayattaki rakiplerin masalarındaki herhangi bir eşyaya dokunup çal!
          const hasStealable = nextPlayers.some(
            (p) =>
              p.seat <= playerCount &&
              p.seat !== actorSeat &&
              p.alive &&
              p.items.some((it) => it !== null && it !== "adrenaline")
          );
          if (!hasStealable) {
            setBannerText(`💉 RAKİPLERİN MASASINDA ÇALINACAK EŞYA YOK!`);
            return;
          }
          sound.playClick();
          setAdrenalineStealBy(actorSeat);
          setBannerText(
            `💉 ADRENALİN AKTİF: DİĞER OYUNCULARIN MASASINDAN BİR 3D EŞYAYA DOKUN VE ÇAL!`
          );
          break;
        }
      }
    },
    [
      busy,
      matchFinished,
      players,
      adrenalineStealBy,
      chamber,
      seats,
      isSawedOff,
      roundIdx,
      loadNewMagazine,
      knownCurrentShell,
      checkRoundSurvivor,
      computeNextTurnSeat,
      turnDirection,
      playerCount,
    ]
  );

  // Ateş Etme (Taret Hedefe Döner -> Ateş -> Kovan Fırlatma -> Sıra Yönetimi)
  const handleFireAtSeat = useCallback(
    (shooterSeat: OctagonSeat, targetSeat: OctagonSeat) => {
      if (busy || matchFinished || chamber.length === 0) return;

      setBusy(true);
      setGunPickedUpBy(shooterSeat);
      setGunAimSeat(targetSeat);
      sound.playTurretRotate();

      const currentShell = chamber[0];
      const nextChamber = chamber.slice(1);
      const damage = isSawedOff ? 2 : 1;

      const shooterName =
        players.find((p) => p.seat === shooterSeat)?.name ??
        `${shooterSeat}. OYUNCU`;
      const targetName =
        players.find((p) => p.seat === targetSeat)?.name ??
        `${targetSeat}. OYUNCU`;

      setTimeout(() => {
        if (currentShell === "live") {
          sound.playShotgunBlast(isSawedOff);
          engineRef.current?.triggerMuzzleBlast(targetSeat, true);
        } else {
          sound.playDryClick();
          engineRef.current?.triggerMuzzleBlast(targetSeat, false);
        }

        setTimeout(() => {
          sound.playShellCasingDrop();
          engineRef.current?.triggerPumpAndEject(currentShell);

          const afterShotPlayers = players.map((p) => {
            if (p.seat !== targetSeat || currentShell !== "live") return p;
            const newHp = Math.max(0, p.hp - damage);
            if (
              newHp === 0 &&
              !eliminationOrderRef.current.includes(targetSeat)
            ) {
              eliminationOrderRef.current.push(targetSeat);
              sound.playSpotlightOff();
            }
            return {
              ...p,
              hp: newHp,
              alive: newHp > 0,
            };
          });

          setPlayers(afterShotPlayers);
          setChamber(nextChamber);
          setIsSawedOff(false);
          setGunPickedUpBy(null);
          setGunAimSeat(null);
          setKnownCurrentShell(null);

          // Raunt bitti mi kontrol et
          if (checkRoundSurvivor(afterShotPlayers)) {
            return;
          }

          // Sıra kuralı: Kendine BOŞ (Mavi) sıkarsa sıra kendisinde kalır!
          const keepTurn =
            targetSeat === shooterSeat && currentShell === "blank";

          let nextTurnSeat = shooterSeat;
          let updatedPlayers = afterShotPlayers;

          if (keepTurn) {
            setBannerText(
              `🔵 BOŞ FİŞEK! ${shooterName} KENDİNE BOŞ SIKTI, SIRA KENDİSİNDE KALDI!`
            );
          } else {
            const res = computeNextTurnSeat(
              shooterSeat,
              turnDirection,
              afterShotPlayers
            );
            nextTurnSeat = res.nextSeat;
            updatedPlayers = res.updatedPlayers;
            setPlayers(updatedPlayers);

            const nextName =
              updatedPlayers.find((p) => p.seat === nextTurnSeat)?.name ??
              `${nextTurnSeat}. OYUNCU`;

            if (currentShell === "live") {
              setBannerText(
                `💥 DOLU FİŞEK! ${targetName} -${damage}⚡ HASAR ALDI! SIRA: ${nextName}`
              );
            } else {
              setBannerText(
                `🔵 BOŞ FİŞEK! ${targetName} KURTULDU! SIRA: ${nextName}`
              );
            }
          }

          if (nextChamber.length === 0) {
            setTimeout(() => {
              loadNewMagazine(roundIdx, updatedPlayers, nextTurnSeat);
            }, 1100);
          } else {
            setTurnSeat(nextTurnSeat);
            setBusy(false);
          }
        }, 550);
      }, 480);
    },
    [
      busy,
      matchFinished,
      chamber,
      isSawedOff,
      players,
      checkRoundSurvivor,
      computeNextTurnSeat,
      turnDirection,
      roundIdx,
      loadNewMagazine,
    ]
  );

  // Zeki Bot (AI) Sırası Otomasyonu
  useEffect(() => {
    if (busy || matchFinished) return;
    const seatMeta = seats[turnSeat - 1];
    if (!seatMeta?.isBot) return;

    const timer = setTimeout(() => {
      const botPlayer = players.find((p) => p.seat === turnSeat);
      if (!botPlayer || !botPlayer.alive) return;

      // Jammer hedef seçimi bekliyorsa rastgele bir rakibi kilitle
      if (jammerPendingBy === turnSeat) {
        const opp = players.filter(
          (p) =>
            p.seat <= playerCount &&
            p.seat !== turnSeat &&
            p.alive &&
            !p.jammed
        );
        if (opp.length > 0) {
          const chosen = opp[cryptoRandomInt(0, opp.length - 1)];
          sound.playHandcuffs();
          setPlayers((prev) =>
            prev.map((p) =>
              p.seat === chosen.seat ? { ...p, jammed: true } : p
            )
          );
          setJammerPendingBy(null);
          setBannerText(
            `📡 ${botPlayer.name} SİNYAL KESİCİ İLE ${chosen.name} MONİTÖRÜNÜ KİLİTLEDİ!`
          );
          return;
        }
      }

      // Adrenalin çalma modundaysa rakip masasından ilk uygun eşyayı çal
      if (adrenalineStealBy === turnSeat) {
        for (const opp of players) {
          if (opp.seat <= playerCount && opp.seat !== turnSeat && opp.alive) {
            const sIdx = opp.items.findIndex(
              (it) => it !== null && it !== "adrenaline"
            );
            if (sIdx !== -1) {
              handleUseItem(turnSeat, opp.seat, sIdx);
              return;
            }
          }
        }
        setAdrenalineStealBy(null);
      }

      // Bot Eşya Kullanımı
      const sedIdx = botPlayer.items.indexOf("sedative");
      if (sedIdx !== -1 && botPlayer.hp < botPlayer.maxHp) {
        handleUseItem(turnSeat, turnSeat, sedIdx);
        return;
      }

      const magIdx = botPlayer.items.indexOf("magnifier");
      if (magIdx !== -1 && knownCurrentShell === null) {
        handleUseItem(turnSeat, turnSeat, magIdx);
        return;
      }

      const jamIdx = botPlayer.items.indexOf("jammer");
      if (
        jamIdx !== -1 &&
        players.some(
          (p) =>
            p.seat <= playerCount &&
            p.seat !== turnSeat &&
            p.alive &&
            !p.jammed
        )
      ) {
        handleUseItem(turnSeat, turnSeat, jamIdx);
        return;
      }

      const sawIdx = botPlayer.items.indexOf("handsaw");
      if (sawIdx !== -1 && !isSawedOff && knownCurrentShell === "live") {
        handleUseItem(turnSeat, turnSeat, sawIdx);
        return;
      }

      // Ateş Kararı
      if (knownCurrentShell === "blank") {
        handleFireAtSeat(turnSeat, turnSeat);
        return;
      }

      const livingOpponents = players.filter(
        (p) => p.seat <= playerCount && p.seat !== turnSeat && p.alive && p.hp > 0
      );
      if (livingOpponents.length === 0) return;

      // En yüksek canlı rakibi veya rastgele bir rakibi hedef al
      livingOpponents.sort((a, b) => b.hp - a.hp);
      const targetOpp = livingOpponents[0];
      handleFireAtSeat(turnSeat, targetOpp.seat);
    }, 1050);

    return () => clearTimeout(timer);
  }, [
    busy,
    matchFinished,
    turnSeat,
    seats,
    players,
    jammerPendingBy,
    adrenalineStealBy,
    playerCount,
    knownCurrentShell,
    isSawedOff,
    handleUseItem,
    handleFireAtSeat,
  ]);

  // 3D Sahne Üzerinde Doğrudan Dokunma (Raycaster)
  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (busy || matchFinished || !engineRef.current) return;
    if (seats[turnSeat - 1]?.isBot) return;

    const hit = engineRef.current.getInteractiveHitAtPointer(
      e.clientX,
      e.clientY
    );

    // 2x2 Quad modda sadece aktif sıradaki oyuncunun kadrajı (veya Adrenalin çalma modunda rakip masası) kabul edilir
    if (
      viewMode === "quad" &&
      hit.viewportSeat !== turnSeat &&
      adrenalineStealBy !== turnSeat
    ) {
      return;
    }

    // Sinyal Kesici (Jammer) hedef seçimi aktifse
    if (jammerPendingBy === turnSeat) {
      if (
        hit.hitType === "target_opponent" &&
        hit.targetSeat &&
        hit.targetSeat !== turnSeat
      ) {
        const targetP = players.find((p) => p.seat === hit.targetSeat);
        if (targetP && targetP.alive && !targetP.jammed) {
          sound.playHandcuffs();
          setPlayers((prev) =>
            prev.map((p) =>
              p.seat === hit.targetSeat ? { ...p, jammed: true } : p
            )
          );
          setJammerPendingBy(null);
          setBannerText(
            `📡 ${targetP.name} SİNYAL KESİCİ İLE KİLİTLENDİ! SIRADAKİ TURUNU PAS GEÇECEK!`
          );
        }
      }
      return;
    }

    if (hit.hitType === "shotgun") {
      sound.playShotgunRack();
      setGunPickedUpBy((prev) => (prev === turnSeat ? null : turnSeat));
      setBannerText(
        "🎯 HEDEF SEÇ: SOL, KARŞI VEYA SAĞ RAKİBİN 3D MASKESİNE (VEYA KENDİ GÖĞSÜNE) DOKUN!"
      );
      return;
    }

    if (hit.hitType === "target_self" && gunPickedUpBy === turnSeat) {
      handleFireAtSeat(turnSeat, turnSeat);
      return;
    }

    if (
      hit.hitType === "target_opponent" &&
      hit.targetSeat &&
      hit.targetSeat !== turnSeat &&
      gunPickedUpBy === turnSeat
    ) {
      const targetP = players.find((p) => p.seat === hit.targetSeat);
      if (targetP && targetP.alive && targetP.hp > 0) {
        handleFireAtSeat(turnSeat, hit.targetSeat);
      }
      return;
    }

    if (
      hit.hitType === "item" &&
      hit.trayOwner !== undefined &&
      hit.slotIndex !== undefined
    ) {
      handleUseItem(turnSeat, hit.trayOwner, hit.slotIndex);
      return;
    }

    if (hit.hitType === "table_cancel" && gunPickedUpBy === turnSeat) {
      setGunPickedUpBy(null);
      setGunAimSeat(null);
    }
  };

  // Aktif oyuncunun benzersiz eşyaları (Kompakt Eşya Rehberi için)
  const activePlayerObj = players.find((p) => p.seat === turnSeat);
  const activeUniqueItems = Array.from(
    new Set(
      (activePlayerObj?.items ?? []).filter(
        (k): k is BuckshotItemKey => k !== null
      )
    )
  );

  // Canlı mermi sayıları (CCTV Tepe Kamerası ve Üst Bar için)
  const liveRemaining = chamber.filter((s) => s === "live").length;
  const blankRemaining = chamber.filter((s) => s === "blank").length;

  return (
    <div className="relative w-full h-screen bg-[#050304] text-amber-100 overflow-hidden select-none font-mono">
      {/* 3D WebGL Sekizgen Masa Sahnesi */}
      <div
        ref={containerRef}
        onPointerDown={handleCanvasPointerDown}
        className="w-full h-full relative cursor-crosshair"
      />

      {/* WebGL Hatası Koruması */}
      {webglError && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-6 text-center">
          <p className="text-red-400 font-bold mb-3">{webglError}</p>
          <button
            onClick={() => setEngineEpoch((e) => e + 1)}
            className="px-4 py-2 rounded-lg bg-amber-500 text-black font-black"
          >
            3D Sahneyi Yeniden Başlat
          </button>
        </div>
      )}

      {/* 2x2 Dörtlü Ekran Ayırıcı Çizgiler ve Kadraj Etiketleri */}
      {viewMode === "quad" && (
        <div className="pointer-events-none absolute inset-0 z-10">
          {/* Dikey ve Yatay 50/50 Bölme Çizgileri */}
          <div className="absolute left-1/2 top-0 bottom-0 w-[2px] bg-amber-500/30" />
          <div className="absolute top-1/2 left-0 right-0 h-[2px] bg-amber-500/30" />

          {/* 4 Kadraj Köşe HUD Çerçevesi */}
          {(
            [
              { seat: 1 as OctagonSeat, posClass: "left-0 top-0 w-1/2 h-1/2" },
              { seat: 2 as OctagonSeat, posClass: "right-0 top-0 w-1/2 h-1/2" },
              {
                seat: 3 as OctagonSeat,
                posClass: "left-0 bottom-0 w-1/2 h-1/2",
              },
              {
                seat: 4 as OctagonSeat,
                posClass: "right-0 bottom-0 w-1/2 h-1/2",
              },
            ] as const
          ).map(({ seat, posClass }) => {
            // 3 Kişilik Modda Sağ-Alt 4. Kare: Yeşil Gece Görüşlü Canlı CCTV Tepe Kamerası!
            if (playerCount === 3 && seat === 4) {
              return (
                <div
                  key="cctv-quadrant"
                  className={`absolute ${posClass} border-2 border-emerald-500/50 overflow-hidden`}
                  style={{
                    background:
                      "radial-gradient(circle, rgba(16,185,129,0.08) 0%, rgba(2,18,10,0.42) 100%)",
                  }}
                >
                  {/* Yeşil CRT Tarama Çizgileri */}
                  <div
                    className="absolute inset-0 opacity-25"
                    style={{
                      backgroundImage:
                        "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(16, 185, 129, 0.25) 3px)",
                    }}
                  />
                  <div className="absolute top-3 left-3 right-3 flex items-center justify-between bg-black/75 border border-emerald-500/50 rounded-lg px-3 py-1.5 text-emerald-300">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-ping" />
                      <span className="text-xs font-black tracking-wider">
                        📹 CANLI CCTV TEPE KAMERASI (CAM-04)
                      </span>
                    </div>
                    <span className="text-[11px] font-bold text-emerald-400">
                      YÖN: {turnDirection === 1 ? "SAAT YÖNÜ ↻" : "TERS YÖN ↺"}
                    </span>
                  </div>

                  {/* CCTV Alt Durum Özeti */}
                  <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between bg-black/80 border border-emerald-500/40 rounded-lg px-3 py-2 text-[11px] text-emerald-200">
                    <div>
                      NAMLU:{" "}
                      <span className="text-red-400 font-black">
                        {liveRemaining} DOLU
                      </span>{" "}
                      /{" "}
                      <span className="text-sky-400 font-black">
                        {blankRemaining} BOŞ
                      </span>
                    </div>
                    <div className="font-black text-amber-300">
                      AKTİF SIRA:{" "}
                      {players.find((p) => p.seat === turnSeat)?.name}
                    </div>
                  </div>
                </div>
              );
            }

            const pObj = players.find((p) => p.seat === seat);
            const isTurn = turnSeat === seat && !matchFinished;
            const alive = pObj ? pObj.alive && pObj.hp > 0 : false;

            return (
              <div
                key={seat}
                className={`absolute ${posClass} transition-all duration-300 ${
                  isTurn
                    ? "border-[3px] border-amber-400 shadow-[inset_0_0_28px_rgba(245,158,11,0.32)]"
                    : !alive
                    ? "border border-red-950/60 bg-black/55"
                    : "border border-stone-800/70"
                }`}
              >
                {/* Oyuncu İsim, Maske ve ⚡ Şarj Etiketi */}
                <div className="absolute top-14 left-3 flex items-center gap-2 bg-black/80 border border-amber-500/35 rounded-lg px-2.5 py-1 backdrop-blur-sm">
                  <span
                    className={`text-xs font-black ${
                      isTurn
                        ? "text-amber-300"
                        : alive
                        ? "text-stone-300"
                        : "text-red-500 line-through"
                    }`}
                  >
                    {seat}. {pObj?.name}
                  </span>
                  <span className="text-[10px] text-stone-400 hidden sm:inline">
                    ({MASK_LABELS[seat]})
                  </span>
                  <div className="flex items-center gap-0.5 ml-1">
                    {Array.from({ length: pObj?.maxHp ?? 4 }).map((_, idx) => (
                      <span
                        key={idx}
                        className={`text-xs ${
                          idx < (pObj?.hp ?? 0)
                            ? "text-emerald-400"
                            : "text-stone-700"
                        }`}
                      >
                        ⚡
                      </span>
                    ))}
                  </div>
                  {pObj?.jammed && (
                    <span className="px-1.5 py-0.5 rounded bg-red-950 border border-red-500 text-[10px] font-black text-red-300 animate-pulse">
                      📡 KİLİTLİ
                    </span>
                  )}
                  {isTurn && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-500 text-black text-[10px] font-black">
                      SIRA SENDE
                    </span>
                  )}
                </div>

                {/* Elenen Oyuncu Damgası */}
                {!alive && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="px-4 py-2 rounded-xl bg-red-950/85 border border-red-500/60 text-red-200 font-black text-xs tracking-widest uppercase">
                      💡 SPOT SÖNDÜ • ELENDİ (0⚡)
                    </div>
                  </div>
                )}

                {/* Sadece Sırası Gelen Oyuncunun Kadrajında Kompakt Eşya Rehberi */}
                {isTurn && showCompactGuide && activeUniqueItems.length > 0 && (
                  <div className="absolute bottom-3 left-3 max-w-[270px] bg-black/80 border border-amber-500/40 rounded-lg p-2 backdrop-blur-sm">
                    <div className="text-[10px] font-black text-amber-400 mb-1 uppercase tracking-wider">
                      📦 MASADAKİ EŞYALARIN ({activeUniqueItems.length})
                    </div>
                    <div className="space-y-1">
                      {activeUniqueItems.slice(0, 4).map((k) => {
                        const meta = BUCKSHOT_ITEMS[k];
                        return (
                          <div
                            key={k}
                            className="flex items-start gap-1.5 text-[10px] leading-tight"
                          >
                            <span>{meta.icon}</span>
                            <div>
                              <span className="font-black text-amber-200">
                                {meta.shortName}:
                              </span>{" "}
                              <span className="text-stone-300">{meta.desc}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Üst Kontrol ve Kamera Modu Değiştirici Bar */}
      <div className="absolute top-2 left-3 right-3 z-30 flex flex-wrap items-center justify-between gap-2 bg-black/85 border border-amber-500/40 rounded-xl px-3 py-2 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <button
            onClick={onBackToMenu}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 border border-stone-700 text-xs font-bold text-stone-200"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Lobiye Dön
          </button>

          {/* Oyun Formatı Seçici: Tek Raunt Hayatta Kalma vs 3 Rauntluk Seri */}
          <button
            onClick={() => {
              const nextFmt =
                seriesFormat === "single" ? "series3" : "single";
              setSeriesFormat(nextFmt);
              startRound(0, nextFmt);
            }}
            className="px-2.5 py-1.5 rounded-lg bg-amber-950/70 hover:bg-amber-900/80 border border-amber-500/40 text-[11px] font-black text-amber-200"
          >
            {seriesFormat === "single"
              ? "⚡ HIZLI HAYATTA KALMA (TEK RAUNT)"
              : `🏆 3 RAUNTLUK SERİ (RAUNT ${roundIdx + 1}/3)`}
          </button>

          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-stone-900/90 border border-stone-700 text-[11px]">
            <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-stone-300">SIRA YÖNÜ:</span>
            <span className="font-black text-amber-300">
              {turnDirection === 1 ? "SAAT YÖNÜ ↻" : "TERS YÖN ↺"}
            </span>
          </div>
        </div>

        {/* Ortadaki Canlı Durum Mesajı */}
        <div className="text-xs font-black text-amber-300 tracking-wide text-center truncate max-w-xl">
          {bannerText}
        </div>

        {/* Sağ Kontroller: [4'lü Ekran] ⇄ [Aktif Sıra Tam Ekran] + Rehber + Yeniden Başlat */}
        <div className="flex items-center gap-2">
          <button
            onClick={() =>
              setViewMode((v) =>
                v === "quad" ? "active_fullscreen" : "quad"
              )
            }
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-black text-xs shadow-lg"
          >
            {viewMode === "quad" ? (
              <>
                <Maximize2 className="w-3.5 h-3.5" />
                [4&apos;lü Ekran] ⇄ [Aktif Sıra Tam Ekran]
              </>
            ) : (
              <>
                <Grid className="w-3.5 h-3.5" />
                [Aktif Tam Ekran] ⇄ [4&apos;lü Ekran]
              </>
            )}
          </button>

          <button
            onClick={() => setShowCompactGuide((s) => !s)}
            className="px-2.5 py-1.5 rounded-lg bg-stone-900 border border-stone-700 text-[11px] font-bold text-amber-200"
          >
            {showCompactGuide ? "Rehberi Gizle" : "Eşya Rehberi"}
          </button>

          <button
            onClick={() => startRound(0, seriesFormat)}
            className="p-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 border border-stone-700 text-stone-200"
            title="Masayı Sıfırla"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Hızlı Hedef Seçim Barı (Tüfek veya Sinyal Kesici Seçildiğinde Akıllı Tahtada Tek Dokunuş Kolaylığı) */}
      {(gunPickedUpBy === turnSeat || jammerPendingBy === turnSeat) &&
        !busy &&
        !matchFinished && (
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-30 flex flex-wrap items-center justify-center gap-2 bg-black/90 border-2 border-amber-400 rounded-2xl px-4 py-2.5 shadow-2xl">
            <span className="text-xs font-black text-amber-300 mr-1 flex items-center gap-1">
              {jammerPendingBy === turnSeat ? (
                <>
                  <Radio className="w-4 h-4 text-red-400" />
                  KİLİTLENECEK RAKİBİ SEÇ:
                </>
              ) : (
                <>
                  <Crosshair className="w-4 h-4 text-red-400" />
                  NAMLU HEDEFİNİ SEÇ:
                </>
              )}
            </span>

            {gunPickedUpBy === turnSeat && (
              <button
                onClick={() => handleFireAtSeat(turnSeat, turnSeat)}
                className="px-3 py-1.5 rounded-xl bg-sky-950 hover:bg-sky-900 border border-sky-400 text-sky-200 font-black text-xs"
              >
                🛡️ KENDİNE SIK (Boşsa Sıra Sende)
              </button>
            )}

            {players
              .filter(
                (p) =>
                  p.seat <= playerCount &&
                  p.seat !== turnSeat &&
                  p.alive &&
                  p.hp > 0
              )
              .map((opp) => (
                <button
                  key={opp.seat}
                  onClick={() => {
                    if (jammerPendingBy === turnSeat) {
                      if (opp.jammed) return;
                      sound.playHandcuffs();
                      setPlayers((prev) =>
                        prev.map((pl) =>
                          pl.seat === opp.seat ? { ...pl, jammed: true } : pl
                        )
                      );
                      setJammerPendingBy(null);
                      setBannerText(
                        `📡 ${opp.name} SİNYAL KESİCİ İLE KİLİTLENDİ!`
                      );
                    } else {
                      handleFireAtSeat(turnSeat, opp.seat);
                    }
                  }}
                  className="px-3 py-1.5 rounded-xl bg-red-950 hover:bg-red-900 border border-red-500 text-red-200 font-black text-xs"
                >
                  🎯 {opp.seat}. {opp.name} ({opp.hp}⚡)
                </button>
              ))}
          </div>
        )}

      {/* Büyüteç / Gizli Telefon Gizli Bilgi Kutusu */}
      <AnimatePresence>
        {secretHint && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="absolute top-20 left-1/2 -translate-x-1/2 z-40 px-5 py-3 rounded-2xl bg-black/95 border-2 border-amber-400 text-center shadow-2xl"
          >
            <div className="text-xs font-black text-amber-400">
              {secretHint.title}
            </div>
            <div className="text-sm font-black text-white mt-1">
              {secretHint.text}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Maç Sonu Sıralama ve Firestore Puan Tablosu (Max 10.000) */}
      <AnimatePresence>
        {matchFinished && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4"
          >
            <div className="w-full max-w-lg rounded-2xl bg-stone-950 border-2 border-amber-500/70 p-6 shadow-2xl">
              <h2 className="text-xl font-black text-amber-400 text-center">
                🏆 SEKİZGEN MASA SONUÇLARI
              </h2>
              <p className="text-xs text-stone-400 text-center mt-1">
                Firestore (e-block-blast) Liderlik Puanları (0 - 10.000 Tavanı)
              </p>

              <div className="mt-4 space-y-2.5">
                {finalStandings.map((st) => (
                  <div
                    key={st.seat}
                    className={`flex items-center justify-between px-4 py-3 rounded-xl border ${
                      st.rank === 1
                        ? "bg-amber-950/45 border-amber-400 text-amber-200"
                        : "bg-stone-900/80 border-stone-800 text-stone-300"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-black">#{st.rank}</span>
                      <div>
                        <div className="font-black text-sm">{st.name}</div>
                        <div className="text-[11px] text-stone-400">
                          {MASK_LABELS[st.seat]}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-black text-emerald-400">
                        +{st.score.toLocaleString("tr-TR")} PUAN
                      </div>
                      <div className="text-[10px] text-stone-400">
                        {st.isAi ? "Zeki Bot" : "Firestore Kaydedildi"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex items-center justify-center gap-3">
                <button
                  onClick={() => {
                    savedResultRef.current = false;
                    setMatchFinished(false);
                    setRoundWins({ 1: 0, 2: 0, 3: 0, 4: 0 });
                    startRound(0, seriesFormat);
                  }}
                  className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs"
                >
                  🔄 Aynı Masada Tekrar Oyna
                </button>
                <button
                  onClick={onBackToMenu}
                  className="px-5 py-2.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 font-bold text-xs"
                >
                  Lobiye Dön
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
