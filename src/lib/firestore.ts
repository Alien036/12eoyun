import {
  collection,
  doc,
  getDoc,
  setDoc,
  addDoc,
  onSnapshot,
  query,
  limit,
} from "firebase/firestore";
import { db } from "./firebase";

export type GameKey =
  | "blockBlast"
  | "chess"
  | "billiards"
  | "solitaire"
  | "sudoku"
  | "chainReaction"
  | "ludo"
  | "dotsSos"
  | "tanks"
  | "memoryMatch";

export type MultiplayerGameKey =
  | "chainReaction"
  | "ludo"
  | "dotsSos"
  | "tanks"
  | "memoryMatch";

export const ALL_GAME_KEYS: GameKey[] = [
  "blockBlast",
  "chess",
  "billiards",
  "solitaire",
  "sudoku",
  "chainReaction",
  "ludo",
  "dotsSos",
  "tanks",
  "memoryMatch",
];

export const MULTIPLAYER_GAME_KEYS: MultiplayerGameKey[] = [
  "chainReaction",
  "ludo",
  "dotsSos",
  "tanks",
  "memoryMatch",
];

export function isSmartboardMultiplayerGame(
  key: GameKey
): key is MultiplayerGameKey {
  return (MULTIPLAYER_GAME_KEYS as string[]).includes(key);
}

export type LeaderboardTabKey = "overall" | GameKey;

export type FrameColorKey =
  | "cyan"
  | "gold"
  | "fuchsia"
  | "emerald"
  | "crimson"
  | "indigo";

export interface FrameTheme {
  key: FrameColorKey;
  label: string;
  ringClass: string;
  bgClass: string;
  swatchClass: string;
}

export const FRAME_THEMES: Record<FrameColorKey, FrameTheme> = {
  cyan: {
    key: "cyan",
    label: "Neon Siyan",
    ringClass:
      "ring-2 ring-cyan-400 shadow-[0_0_14px_rgba(34,211,238,0.55)]",
    bgClass: "from-cyan-500/30 to-sky-700/40",
    swatchClass: "bg-cyan-400",
  },
  gold: {
    key: "gold",
    label: "Altın Alev",
    ringClass:
      "ring-2 ring-amber-400 shadow-[0_0_14px_rgba(251,191,36,0.6)]",
    bgClass: "from-amber-400/30 to-orange-600/40",
    swatchClass: "bg-amber-400",
  },
  fuchsia: {
    key: "fuchsia",
    label: "Siber Fuşya",
    ringClass:
      "ring-2 ring-fuchsia-400 shadow-[0_0_14px_rgba(232,121,249,0.55)]",
    bgClass: "from-fuchsia-500/30 to-purple-700/40",
    swatchClass: "bg-fuchsia-400",
  },
  emerald: {
    key: "emerald",
    label: "Zümrüt",
    ringClass:
      "ring-2 ring-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.55)]",
    bgClass: "from-emerald-400/30 to-teal-700/40",
    swatchClass: "bg-emerald-400",
  },
  crimson: {
    key: "crimson",
    label: "Kızıl Nova",
    ringClass:
      "ring-2 ring-rose-500 shadow-[0_0_14px_rgba(244,63,94,0.55)]",
    bgClass: "from-rose-500/30 to-red-700/40",
    swatchClass: "bg-rose-500",
  },
  indigo: {
    key: "indigo",
    label: "Galaksi",
    ringClass:
      "ring-2 ring-indigo-400 shadow-[0_0_14px_rgba(129,140,248,0.55)]",
    bgClass: "from-indigo-500/30 to-blue-800/40",
    swatchClass: "bg-indigo-400",
  },
};

export const AVATAR_OPTIONS = [
  "🚀",
  "⚡",
  "👑",
  "🔥",
  "👾",
  "💎",
  "🐉",
  "🦊",
  "🎯",
  "🧠",
  "🦁",
  "🌟",
  "♟️",
  "🎱",
  "🃏",
  "🔢",
];

export const GAME_LABELS: Record<
  GameKey,
  { title: string; icon: string; accent: string }
> = {
  blockBlast: {
    title: "Block Blast",
    icon: "🧱",
    accent: "text-cyan-300",
  },
  chess: {
    title: "Satranç",
    icon: "♟️",
    accent: "text-amber-300",
  },
  billiards: {
    title: "Bilardo",
    icon: "🎱",
    accent: "text-emerald-300",
  },
  solitaire: {
    title: "Solitaire",
    icon: "🃏",
    accent: "text-rose-300",
  },
  sudoku: {
    title: "Sudoku",
    icon: "🔢",
    accent: "text-indigo-300",
  },
  chainReaction: {
    title: "Zincirleme Patlama",
    icon: "⚛️",
    accent: "text-sky-300",
  },
  ludo: {
    title: "Kızma Birader",
    icon: "🎲",
    accent: "text-amber-300",
  },
  dotsSos: {
    title: "Kare & SOS Arenası",
    icon: "✨",
    accent: "text-fuchsia-300",
  },
  tanks: {
    title: "Topçu Tanklar",
    icon: "💥",
    accent: "text-rose-300",
  },
  memoryMatch: {
    title: "Hafıza Arenası",
    icon: "🧠",
    accent: "text-emerald-300",
  },
};

export interface SmartboardSlotTheme {
  slotIndex: number; // 0..3
  label: string;
  colorName: string;
  hex: string;
  lightHex: string;
  darkHex: string;
  borderClass: string;
  frameGlowClass: string;
  badgeClass: string;
  textClass: string;
  bgSoftClass: string;
  buttonGradient: string;
}

export const SMARTBOARD_SLOTS: SmartboardSlotTheme[] = [
  {
    slotIndex: 0,
    label: "1. Oyuncu",
    colorName: "Mavi",
    hex: "#38bdf8",
    lightHex: "#bae6fd",
    darkHex: "#0369a1",
    borderClass: "border-sky-400",
    frameGlowClass:
      "border-sky-400/80 shadow-[0_0_40px_rgba(56,189,248,0.45),inset_0_0_28px_rgba(56,189,248,0.18)]",
    badgeClass: "bg-sky-500/25 border-sky-400/60 text-sky-200",
    textClass: "text-sky-300",
    bgSoftClass: "bg-sky-500/15",
    buttonGradient: "from-sky-500 to-blue-600",
  },
  {
    slotIndex: 1,
    label: "2. Oyuncu",
    colorName: "Kırmızı",
    hex: "#f43f5e",
    lightHex: "#fecdd3",
    darkHex: "#be123c",
    borderClass: "border-rose-500",
    frameGlowClass:
      "border-rose-500/80 shadow-[0_0_40px_rgba(244,63,94,0.45),inset_0_0_28px_rgba(244,63,94,0.18)]",
    badgeClass: "bg-rose-500/25 border-rose-400/60 text-rose-200",
    textClass: "text-rose-300",
    bgSoftClass: "bg-rose-500/15",
    buttonGradient: "from-rose-500 to-red-600",
  },
  {
    slotIndex: 2,
    label: "3. Oyuncu",
    colorName: "Yeşil",
    hex: "#10b981",
    lightHex: "#a7f3d0",
    darkHex: "#047857",
    borderClass: "border-emerald-400",
    frameGlowClass:
      "border-emerald-400/80 shadow-[0_0_40px_rgba(16,185,129,0.45),inset_0_0_28px_rgba(16,185,129,0.18)]",
    badgeClass: "bg-emerald-500/25 border-emerald-400/60 text-emerald-200",
    textClass: "text-emerald-300",
    bgSoftClass: "bg-emerald-500/15",
    buttonGradient: "from-emerald-500 to-teal-600",
  },
  {
    slotIndex: 3,
    label: "4. Oyuncu",
    colorName: "Altın Sarısı",
    hex: "#f59e0b",
    lightHex: "#fde68a",
    darkHex: "#b45309",
    borderClass: "border-amber-400",
    frameGlowClass:
      "border-amber-400/80 shadow-[0_0_40px_rgba(245,158,11,0.48),inset_0_0_28px_rgba(245,158,11,0.18)]",
    badgeClass: "bg-amber-500/25 border-amber-400/60 text-amber-200",
    textClass: "text-amber-300",
    bgSoftClass: "bg-amber-500/15",
    buttonGradient: "from-amber-400 to-orange-500",
  },
];

export interface BlockBlastStats {
  highScore: number;
  gamesPlayed: number;
  maxCombo: number;
}

export interface ChessStats {
  highScore: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
}

export interface BilliardsStats {
  highScore: number;
  gamesPlayed: number;
  wins: number;
  bestStreak: number;
}

export interface SolitaireStats {
  highScore: number;
  gamesPlayed: number;
  wins: number;
  bestTimeSec: number | null;
}

export interface SudokuStats {
  highScore: number;
  gamesPlayed: number;
  wins: number;
  bestTimeSec: number | null;
}

export interface MultiplayerArenaStats {
  highScore: number;
  gamesPlayed: number;
  wins: number;
}

export interface PlayerGamesMap {
  blockBlast: BlockBlastStats;
  chess: ChessStats;
  billiards: BilliardsStats;
  solitaire: SolitaireStats;
  sudoku: SudokuStats;
  chainReaction: MultiplayerArenaStats;
  ludo: MultiplayerArenaStats;
  dotsSos: MultiplayerArenaStats;
  tanks: MultiplayerArenaStats;
  memoryMatch: MultiplayerArenaStats;
}

export interface PlayerDoc {
  id: string;
  name: string;
  avatar: string;
  frameColor: FrameColorKey;
  statusText: string;
  pinHash: string;
  createdAt: number;
  updatedAt: number;
  overallBestScore: number;
  games: PlayerGamesMap;
  isBot?: boolean;
}

export interface MultiplayerSeat {
  slotIndex: number; // 0..3
  player: PlayerDoc;
  isBot: boolean;
}

export interface ActivityFeedEvent {
  id: string;
  playerId: string;
  playerName: string;
  avatar: string;
  game?: GameKey;
  score?: number;
  message: string;
  createdAt: number;
}

const PLAYERS_COL = "players";
const FEED_COL = "activityFeed";

// Tek maçta kazanılabilecek maksimum tavan puan (Hard Clamp: 0 - 10.000 / Block Blast için 12.000)
export function getGameScoreCap(game: GameKey): number {
  return game === "blockBlast" ? 12000 : 10000;
}

export function clampGameScore(game: GameKey, rawScore: number): number {
  const cap = getGameScoreCap(game);
  return Math.min(cap, Math.max(0, Math.round(Number(rawScore) || 0)));
}

// Eski testlerden kalan 10.000+ (Block Blast için 12.000+) şişik skorları 4.500'e otomatik normalize eder
export function sanitizeStoredHighScore(game: GameKey, rawHigh: unknown): {
  value: number;
  wasInflated: boolean;
} {
  const num = Math.max(0, Math.round(Number(rawHigh) || 0));
  const cap = getGameScoreCap(game);
  if (num > cap) {
    return { value: 4500, wasInflated: true };
  }
  return { value: num, wasInflated: false };
}

const sanitizedPlayerIdsInSession = new Set<string>();

export function createEmptyGamesMap(): PlayerGamesMap {
  return {
    blockBlast: { highScore: 0, gamesPlayed: 0, maxCombo: 0 },
    chess: { highScore: 0, gamesPlayed: 0, wins: 0, losses: 0 },
    billiards: { highScore: 0, gamesPlayed: 0, wins: 0, bestStreak: 0 },
    solitaire: { highScore: 0, gamesPlayed: 0, wins: 0, bestTimeSec: null },
    sudoku: { highScore: 0, gamesPlayed: 0, wins: 0, bestTimeSec: null },
    chainReaction: { highScore: 0, gamesPlayed: 0, wins: 0 },
    ludo: { highScore: 0, gamesPlayed: 0, wins: 0 },
    dotsSos: { highScore: 0, gamesPlayed: 0, wins: 0 },
    tanks: { highScore: 0, gamesPlayed: 0, wins: 0 },
    memoryMatch: { highScore: 0, gamesPlayed: 0, wins: 0 },
  };
}

export function cloneGamesMap(games?: Partial<PlayerGamesMap>): PlayerGamesMap {
  const empty = createEmptyGamesMap();
  if (!games) return empty;
  return {
    blockBlast: { ...empty.blockBlast, ...games.blockBlast },
    chess: { ...empty.chess, ...games.chess },
    billiards: { ...empty.billiards, ...games.billiards },
    solitaire: { ...empty.solitaire, ...games.solitaire },
    sudoku: { ...empty.sudoku, ...games.sudoku },
    chainReaction: { ...empty.chainReaction, ...games.chainReaction },
    ludo: { ...empty.ludo, ...games.ludo },
    dotsSos: { ...empty.dotsSos, ...games.dotsSos },
    tanks: { ...empty.tanks, ...games.tanks },
    memoryMatch: { ...empty.memoryMatch, ...games.memoryMatch },
  };
}

export function createBotPlayerDoc(slotIndex: number): PlayerDoc {
  const botNames = ["Siber Bot α", "Robo-Tank β", "Neon Zeka γ", "Kuantum Bot δ"];
  const botAvatars = ["🤖", "👾", "🛸", "⚡"];
  const frames: FrameColorKey[] = ["cyan", "crimson", "emerald", "gold"];
  const now = Date.now();
  return {
    id: `__bot_seat_${slotIndex}__`,
    name: botNames[slotIndex % botNames.length],
    avatar: botAvatars[slotIndex % botAvatars.length],
    frameColor: frames[slotIndex % frames.length],
    statusText: "Akıllı Tahta Yapay Zeka Rakibi",
    pinHash: "",
    createdAt: now,
    updatedAt: now,
    overallBestScore: 0,
    games: createEmptyGamesMap(),
    isBot: true,
  };
}

export function calculateOverallScore(games: Partial<PlayerGamesMap>): number {
  return (
    (Number(games?.blockBlast?.highScore) || 0) +
    (Number(games?.chess?.highScore) || 0) +
    (Number(games?.billiards?.highScore) || 0) +
    (Number(games?.solitaire?.highScore) || 0) +
    (Number(games?.sudoku?.highScore) || 0) +
    (Number(games?.chainReaction?.highScore) || 0) +
    (Number(games?.ludo?.highScore) || 0) +
    (Number(games?.dotsSos?.highScore) || 0) +
    (Number(games?.tanks?.highScore) || 0) +
    (Number(games?.memoryMatch?.highScore) || 0)
  );
}

export function normalizePlayerDoc(
  id: string,
  raw: Record<string, unknown>
): PlayerDoc {
  const rawGames = (raw.games as Partial<PlayerGamesMap> | undefined) ?? {};
  // Eski tek oyunlu ve 5 oyunlu kayıtlarla tam geriye dönük uyumluluk (Safe Migration)
  const legacyHighScore = Number(raw.highScore) || 0;
  const legacyTotalGames = Number(raw.totalGames) || 0;
  const legacyMaxCombo = Number(raw.maxCombo) || 0;

  const bbRaw = Number(rawGames.blockBlast?.highScore) || legacyHighScore || 0;
  const bbSan = sanitizeStoredHighScore("blockBlast", bbRaw);
  const chSan = sanitizeStoredHighScore("chess", rawGames.chess?.highScore);
  const biSan = sanitizeStoredHighScore(
    "billiards",
    rawGames.billiards?.highScore
  );
  const soSan = sanitizeStoredHighScore(
    "solitaire",
    rawGames.solitaire?.highScore
  );
  const suSan = sanitizeStoredHighScore("sudoku", rawGames.sudoku?.highScore);
  const crSan = sanitizeStoredHighScore(
    "chainReaction",
    rawGames.chainReaction?.highScore
  );
  const luSan = sanitizeStoredHighScore("ludo", rawGames.ludo?.highScore);
  const dsSan = sanitizeStoredHighScore("dotsSos", rawGames.dotsSos?.highScore);
  const tkSan = sanitizeStoredHighScore("tanks", rawGames.tanks?.highScore);
  const mmSan = sanitizeStoredHighScore(
    "memoryMatch",
    rawGames.memoryMatch?.highScore
  );

  const games: PlayerGamesMap = {
    blockBlast: {
      highScore: bbSan.value,
      gamesPlayed:
        Number(rawGames.blockBlast?.gamesPlayed) || legacyTotalGames || 0,
      maxCombo: Number(rawGames.blockBlast?.maxCombo) || legacyMaxCombo || 0,
    },
    chess: {
      highScore: chSan.value,
      gamesPlayed: Number(rawGames.chess?.gamesPlayed) || 0,
      wins: Number(rawGames.chess?.wins) || 0,
      losses: Number(rawGames.chess?.losses) || 0,
    },
    billiards: {
      highScore: biSan.value,
      gamesPlayed: Number(rawGames.billiards?.gamesPlayed) || 0,
      wins: Number(rawGames.billiards?.wins) || 0,
      bestStreak: Number(rawGames.billiards?.bestStreak) || 0,
    },
    solitaire: {
      highScore: soSan.value,
      gamesPlayed: Number(rawGames.solitaire?.gamesPlayed) || 0,
      wins: Number(rawGames.solitaire?.wins) || 0,
      bestTimeSec:
        typeof rawGames.solitaire?.bestTimeSec === "number"
          ? rawGames.solitaire.bestTimeSec
          : null,
    },
    sudoku: {
      highScore: suSan.value,
      gamesPlayed: Number(rawGames.sudoku?.gamesPlayed) || 0,
      wins: Number(rawGames.sudoku?.wins) || 0,
      bestTimeSec:
        typeof rawGames.sudoku?.bestTimeSec === "number"
          ? rawGames.sudoku.bestTimeSec
          : null,
    },
    chainReaction: {
      highScore: crSan.value,
      gamesPlayed: Number(rawGames.chainReaction?.gamesPlayed) || 0,
      wins: Number(rawGames.chainReaction?.wins) || 0,
    },
    ludo: {
      highScore: luSan.value,
      gamesPlayed: Number(rawGames.ludo?.gamesPlayed) || 0,
      wins: Number(rawGames.ludo?.wins) || 0,
    },
    dotsSos: {
      highScore: dsSan.value,
      gamesPlayed: Number(rawGames.dotsSos?.gamesPlayed) || 0,
      wins: Number(rawGames.dotsSos?.wins) || 0,
    },
    tanks: {
      highScore: tkSan.value,
      gamesPlayed: Number(rawGames.tanks?.gamesPlayed) || 0,
      wins: Number(rawGames.tanks?.wins) || 0,
    },
    memoryMatch: {
      highScore: mmSan.value,
      gamesPlayed: Number(rawGames.memoryMatch?.gamesPlayed) || 0,
      wins: Number(rawGames.memoryMatch?.wins) || 0,
    },
  };

  const overallBestScore = calculateOverallScore(games);
  const fc = String(raw.frameColor || "cyan") as FrameColorKey;

  const anyInflated =
    bbSan.wasInflated ||
    chSan.wasInflated ||
    biSan.wasInflated ||
    soSan.wasInflated ||
    suSan.wasInflated ||
    crSan.wasInflated ||
    luSan.wasInflated ||
    dsSan.wasInflated ||
    tkSan.wasInflated ||
    mmSan.wasInflated ||
    Number(raw.overallBestScore) !== overallBestScore;

  // Eğer Firestore'da eski testlerden kalan 10.000+ şişik skor varsa profili silmeden otomatik 4.500'e çekip güncelle
  if (
    anyInflated &&
    typeof window !== "undefined" &&
    id &&
    !id.startsWith("__bot_") &&
    !sanitizedPlayerIdsInSession.has(id)
  ) {
    sanitizedPlayerIdsInSession.add(id);
    setDoc(
      doc(db, PLAYERS_COL, id),
      {
        games,
        overallBestScore,
        updatedAt: Date.now(),
      },
      { merge: true }
    ).catch((err) => {
      console.error("Otomatik skor sanitizasyon hatası:", err);
    });
  }

  return {
    id,
    name: String(raw.name || "Oyuncu"),
    avatar: String(raw.avatar || "🚀"),
    frameColor: FRAME_THEMES[fc] ? fc : "cyan",
    statusText: String(raw.statusText || "12-E Arcade Oyuncusu"),
    pinHash: String(raw.pinHash || ""),
    createdAt: Number(raw.createdAt) || Date.now(),
    updatedAt: Number(raw.updatedAt) || Date.now(),
    overallBestScore,
    games,
  };
}

// Web Crypto API ile SHA-256 PIN Hash
export async function hashPinSHA256(pin: string): Promise<string> {
  const salted = `bb12e_pin_v1:${pin.trim()}`;
  if (typeof window !== "undefined" && window.crypto?.subtle) {
    const buf = new TextEncoder().encode(salted);
    const digest = await window.crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  let h = 0x811c9dc5;
  for (let i = 0; i < salted.length; i++) {
    h ^= salted.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function slugifyPlayerId(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/ğ/g, "g")
      .replace(/ü/g, "u")
      .replace(/ş/g, "s")
      .replace(/ı/g, "i")
      .replace(/ö/g, "o")
      .replace(/ç/g, "c")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 28) || `oyuncu_${Date.now().toString(36)}`
  );
}

export function getOverallRankTitle(overallScore: number): {
  title: string;
  colorClass: string;
  pillClass: string;
} {
  if (overallScore >= 30000) {
    return {
      title: "Sınıf Efsanesi",
      colorClass: "text-fuchsia-300",
      pillClass:
        "bg-fuchsia-500/20 border-fuchsia-400/40 text-fuchsia-200 shadow-[0_0_12px_rgba(232,121,249,0.35)]",
    };
  }
  if (overallScore >= 15000) {
    return {
      title: "Arcade Ustası",
      colorClass: "text-amber-300",
      pillClass: "bg-amber-500/20 border-amber-400/40 text-amber-200",
    };
  }
  if (overallScore >= 5000) {
    return {
      title: "Rekor Avcısı",
      colorClass: "text-cyan-300",
      pillClass: "bg-cyan-500/20 border-cyan-400/40 text-cyan-200",
    };
  }
  return {
    title: "Çaylak Oyuncu",
    colorClass: "text-slate-300",
    pillClass: "bg-slate-500/20 border-slate-400/30 text-slate-200",
  };
}

export function formatRelativeTime(timestampMs: number): string {
  if (!timestampMs) return "Az önce";
  const diffSec = Math.max(0, Math.floor((Date.now() - timestampMs) / 1000));
  if (diffSec < 60) return "Az önce aktif";
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins} dk önce`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} saat önce`;
  return `${Math.floor(hrs / 24)} gün önce`;
}

// Yeni Sınıf Profili Oluştur — Doğrudan Firestore `players/{playerId}` koleksiyonuna yazar
export async function createClassProfile(params: {
  name: string;
  avatar: string;
  frameColor: FrameColorKey;
  statusText: string;
  pin: string;
}): Promise<{ ok: boolean; player?: PlayerDoc; error?: string }> {
  const cleanName = params.name.trim().slice(0, 24);
  if (cleanName.length < 2) {
    return { ok: false, error: "Ad/Lakap en az 2 karakter olmalıdır." };
  }
  if (!/^\d{4}$/.test(params.pin)) {
    return { ok: false, error: "4 haneli sayısal bir PIN kodu girmelisin." };
  }

  const playerId = slugifyPlayerId(cleanName);
  const pinHash = await hashPinSHA256(params.pin);
  const now = Date.now();

  const newPlayer: PlayerDoc = {
    id: playerId,
    name: cleanName,
    avatar: params.avatar || "🚀",
    frameColor: params.frameColor || "cyan",
    statusText:
      params.statusText.trim().slice(0, 48) || "Rekorumu kırabilen çıkmadı!",
    pinHash,
    createdAt: now,
    updatedAt: now,
    overallBestScore: 0,
    games: createEmptyGamesMap(),
  };

  try {
    const ref = doc(db, PLAYERS_COL, playerId);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      return {
        ok: false,
        error:
          "Bu isimde bir sınıf profili zaten var! Sınıf listesinden seçip PIN kodunla girebilirsin.",
      };
    }
    const { id: _omit, ...payload } = newPlayer;
    void _omit;
    await setDoc(ref, payload);

    // Canlı akışa (activityFeed) yeni oyuncuyu duyur
    await addDoc(collection(db, FEED_COL), {
      playerId: newPlayer.id,
      playerName: newPlayer.name,
      avatar: newPlayer.avatar,
      message: `${newPlayer.name} 12-E Sınıf Oyun Merkezi'ne katıldı!`,
      createdAt: now,
    }).catch(() => {});

    return { ok: true, player: newPlayer };
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Bilinmeyen veritabanı hatası";
    return {
      ok: false,
      error: `Firestore kayıt hatası: ${msg}`,
    };
  }
}

// Mevcut Sınıf Profilini Doğrudan Firestore Üzerinden 4 Haneli PIN ile Doğrula
export async function verifyAndSelectProfile(
  candidate: PlayerDoc,
  enteredPin: string
): Promise<{ ok: boolean; player?: PlayerDoc; error?: string }> {
  if (!/^\d{4}$/.test(enteredPin)) {
    return { ok: false, error: "Lütfen 4 haneli PIN kodunu eksiksiz gir." };
  }

  const enteredHash = await hashPinSHA256(enteredPin);

  try {
    const ref = doc(db, PLAYERS_COL, candidate.id);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      return {
        ok: false,
        error: "Bu profil Firestore veritabanında bulunamadı.",
      };
    }

    const current = normalizePlayerDoc(
      snap.id,
      snap.data() as Record<string, unknown>
    );

    if (current.pinHash && current.pinHash !== enteredHash) {
      return {
        ok: false,
        error: "Hatalı PIN kodu! Başkasının profiliyle oyun başlatılamaz.",
      };
    }
    return { ok: true, player: current };
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Veritabanına ulaşılamadı";
    return {
      ok: false,
      error: `Firestore doğrulama hatası: ${msg}`,
    };
  }
}

// Profil Penceresinden PIN Doğrulayarak Firestore Üzerinde Avatar / Çerçeve / Durum Güncelleme
export async function updateProfileWithPinVerification(params: {
  targetPlayer: PlayerDoc;
  enteredPin: string;
  avatar: string;
  frameColor: FrameColorKey;
  statusText: string;
}): Promise<{ ok: boolean; updated?: PlayerDoc; error?: string }> {
  const verify = await verifyAndSelectProfile(
    params.targetPlayer,
    params.enteredPin
  );
  if (!verify.ok || !verify.player) {
    return { ok: false, error: verify.error || "PIN doğrulanamadı." };
  }

  const now = Date.now();
  const updated: PlayerDoc = {
    ...verify.player,
    avatar: params.avatar || verify.player.avatar,
    frameColor: params.frameColor || verify.player.frameColor,
    statusText:
      params.statusText.trim().slice(0, 48) || verify.player.statusText,
    updatedAt: now,
  };

  try {
    const ref = doc(db, PLAYERS_COL, updated.id);
    await setDoc(
      ref,
      {
        avatar: updated.avatar,
        frameColor: updated.frameColor,
        statusText: updated.statusText,
        updatedAt: now,
      },
      { merge: true }
    );
    return { ok: true, updated };
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Güncelleme kaydedilemedi";
    return { ok: false, error: `Firestore güncelleme hatası: ${msg}` };
  }
}

export interface SoloResultPayload {
  game: GameKey;
  score: number;
  won?: boolean;
  maxCombo?: number;
  bestStreak?: number;
  durationSec?: number;
  modeLabel?: string;
}

// Tek Kişilik Oyun Sonucunu Firestore'a İşle & Rekor Kırıldıysa activityFeed'e Yaz
export async function recordSoloGameResult(
  player: PlayerDoc,
  result: SoloResultPayload,
  allPlayers: PlayerDoc[]
): Promise<{ updatedPlayer: PlayerDoc; isNewPersonalBest: boolean }> {
  const now = Date.now();
  let baseDoc = player;

  try {
    const snap = await getDoc(doc(db, PLAYERS_COL, player.id));
    if (snap.exists()) {
      baseDoc = normalizePlayerDoc(
        snap.id,
        snap.data() as Record<string, unknown>
      );
    }
  } catch (err) {
    console.error("Firestore oyuncu okuma hatası:", err);
  }

  const nextGames: PlayerGamesMap = cloneGamesMap(baseDoc.games);

  const prevHigh = nextGames[result.game]?.highScore ?? 0;
  const cleanScore = clampGameScore(result.game, result.score);
  const isNewPersonalBest = cleanScore > prevHigh && cleanScore > 0;

  if (result.game === "blockBlast") {
    nextGames.blockBlast.gamesPlayed += 1;
    nextGames.blockBlast.highScore = Math.max(prevHigh, cleanScore);
    nextGames.blockBlast.maxCombo = Math.max(
      nextGames.blockBlast.maxCombo,
      result.maxCombo || 0
    );
  } else if (result.game === "chess") {
    nextGames.chess.gamesPlayed += 1;
    nextGames.chess.highScore = Math.max(prevHigh, cleanScore);
    if (result.won === true) nextGames.chess.wins += 1;
    else if (result.won === false) nextGames.chess.losses += 1;
  } else if (result.game === "billiards") {
    nextGames.billiards.gamesPlayed += 1;
    nextGames.billiards.highScore = Math.max(prevHigh, cleanScore);
    if (result.won) nextGames.billiards.wins += 1;
    nextGames.billiards.bestStreak = Math.max(
      nextGames.billiards.bestStreak,
      result.bestStreak || 0
    );
  } else if (result.game === "solitaire") {
    nextGames.solitaire.gamesPlayed += 1;
    nextGames.solitaire.highScore = Math.max(prevHigh, cleanScore);
    if (result.won) {
      nextGames.solitaire.wins += 1;
      if (typeof result.durationSec === "number") {
        nextGames.solitaire.bestTimeSec =
          nextGames.solitaire.bestTimeSec === null
            ? result.durationSec
            : Math.min(nextGames.solitaire.bestTimeSec, result.durationSec);
      }
    }
  } else if (result.game === "sudoku") {
    nextGames.sudoku.gamesPlayed += 1;
    nextGames.sudoku.highScore = Math.max(prevHigh, cleanScore);
    if (result.won) {
      nextGames.sudoku.wins += 1;
      if (typeof result.durationSec === "number") {
        nextGames.sudoku.bestTimeSec =
          nextGames.sudoku.bestTimeSec === null
            ? result.durationSec
            : Math.min(nextGames.sudoku.bestTimeSec, result.durationSec);
      }
    }
  } else if (isSmartboardMultiplayerGame(result.game)) {
    const gKey = result.game;
    nextGames[gKey].gamesPlayed += 1;
    nextGames[gKey].highScore = Math.max(prevHigh, cleanScore);
    if (result.won) nextGames[gKey].wins += 1;
  }

  const overallBestScore = calculateOverallScore(nextGames);
  const updatedPlayer: PlayerDoc = {
    ...baseDoc,
    games: nextGames,
    overallBestScore,
    updatedAt: now,
  };

  try {
    const { id: _omit, ...payload } = updatedPlayer;
    void _omit;
    await setDoc(doc(db, PLAYERS_COL, updatedPlayer.id), payload, {
      merge: true,
    });

    if (isNewPersonalBest) {
      const others = allPlayers.filter((p) => p.id !== updatedPlayer.id);
      const rankInGame =
        others.filter((p) => (p.games?.[result.game]?.highScore ?? 0) > cleanScore)
          .length + 1;
      const gameMeta = GAME_LABELS[result.game];
      const modeSuffix = result.modeLabel ? ` (${result.modeLabel})` : "";

      const message =
        rankInGame === 1
          ? `${updatedPlayer.name}, ${gameMeta.title}${modeSuffix} oyununda ${cleanScore.toLocaleString("tr-TR")} puanla 1. sıraya yerleşti!`
          : `${updatedPlayer.name}, ${gameMeta.title}${modeSuffix} oyununda ${cleanScore.toLocaleString("tr-TR")} puanla yeni rekor kırdı! (#${rankInGame})`;

      await addDoc(collection(db, FEED_COL), {
        playerId: updatedPlayer.id,
        playerName: updatedPlayer.name,
        avatar: updatedPlayer.avatar,
        game: result.game,
        score: cleanScore,
        message,
        createdAt: now,
      });
    }
  } catch (err) {
    console.error("Firestore skor kaydetme hatası:", err);
  }

  return { updatedPlayer, isNewPersonalBest };
}

// 2 Kişilik Sınıf Düellosu Sonucunu Her İki Oyuncunun Firestore Profiline ve activityFeed'e İşle
export async function recordDuelGameResult(params: {
  game: "chess" | "billiards";
  player1: PlayerDoc;
  player2: PlayerDoc;
  winner: 1 | 2 | "draw";
  p1Score: number;
  p2Score: number;
  p1Streak?: number;
  p2Streak?: number;
}): Promise<void> {
  const now = Date.now();

  const applyForOne = async (
    p: PlayerDoc,
    myScore: number,
    outcome: "win" | "loss" | "draw",
    streak?: number
  ) => {
    if (p.isBot) return;
    let base = p;
    try {
      const snap = await getDoc(doc(db, PLAYERS_COL, p.id));
      if (snap.exists()) {
        base = normalizePlayerDoc(
          snap.id,
          snap.data() as Record<string, unknown>
        );
      }
    } catch (err) {
      console.error("Firestore düello oyuncusu okuma hatası:", err);
    }

    const nextGames: PlayerGamesMap = cloneGamesMap(base.games);

    const cleanScore = clampGameScore(params.game, myScore);
    if (params.game === "chess") {
      nextGames.chess.gamesPlayed += 1;
      nextGames.chess.highScore = Math.max(
        nextGames.chess.highScore,
        cleanScore
      );
      if (outcome === "win") nextGames.chess.wins += 1;
      if (outcome === "loss") nextGames.chess.losses += 1;
    } else {
      nextGames.billiards.gamesPlayed += 1;
      nextGames.billiards.highScore = Math.max(
        nextGames.billiards.highScore,
        cleanScore
      );
      if (outcome === "win") nextGames.billiards.wins += 1;
      nextGames.billiards.bestStreak = Math.max(
        nextGames.billiards.bestStreak,
        streak || 0
      );
    }

    const overallBestScore = calculateOverallScore(nextGames);
    const { id: _omit, ...payload } = {
      ...base,
      games: nextGames,
      overallBestScore,
      updatedAt: now,
    };
    void _omit;

    try {
      await setDoc(doc(db, PLAYERS_COL, base.id), payload, { merge: true });
    } catch (err) {
      console.error("Firestore düello skoru yazma hatası:", err);
    }
  };

  const p1Outcome =
    params.winner === 1 ? "win" : params.winner === 2 ? "loss" : "draw";
  const p2Outcome =
    params.winner === 2 ? "win" : params.winner === 1 ? "loss" : "draw";

  await Promise.all([
    applyForOne(params.player1, params.p1Score, p1Outcome, params.p1Streak),
    applyForOne(params.player2, params.p2Score, p2Outcome, params.p2Streak),
  ]);

  // activityFeed duyurusu
  try {
    const gameTitle = GAME_LABELS[params.game].title;
    let message = "";
    let hero = params.player1;
    let bestDuelScore = Math.max(params.p1Score, params.p2Score);

    if (params.winner === 1) {
      hero = params.player1;
      bestDuelScore = params.p1Score;
      message = `${params.player1.name}, ${gameTitle} düellosunda ${params.player2.name}'i yendi! (${params.p1Score.toLocaleString("tr-TR")} P)`;
    } else if (params.winner === 2) {
      hero = params.player2;
      bestDuelScore = params.p2Score;
      message = `${params.player2.name}, ${gameTitle} düellosunda ${params.player1.name}'i yendi! (${params.p2Score.toLocaleString("tr-TR")} P)`;
    } else {
      message = `${params.player1.name} ve ${params.player2.name} arasındaki ${gameTitle} düellosu berabere bitti!`;
    }

    await addDoc(collection(db, FEED_COL), {
      playerId: hero.id,
      playerName: hero.name,
      avatar: hero.avatar,
      game: params.game,
      score: Math.round(bestDuelScore),
      message,
      createdAt: now,
    });
  } catch (err) {
    console.error("Firestore activityFeed yazma hatası:", err);
  }
}

export interface MultiplayerStandingInput {
  slotIndex: number;
  player: PlayerDoc;
  isBot?: boolean;
  rank: number; // 1 = Şampiyon, 2 = İkinci, 3 = Üçüncü, 4 = Dördüncü
  actionScore: number; // Oyun içi topladığı aksiyon puanı
  customFinalScore?: number; // Oyuna özel hesaplanmış net maç sonu puanı (0 - 10.000)
  statSummary?: string;
}

export interface MultiplayerFinalStanding extends MultiplayerStandingInput {
  finalScore: number;
  isNewPersonalBest: boolean;
}

// 2-4 Kişilik Akıllı Tahta Maçı Bittiğinde Tüm Gerçek Oyuncuların Firestore İstatistiklerini Güncelle
export async function recordMultiplayerMatchResult(params: {
  game: MultiplayerGameKey;
  standings: MultiplayerStandingInput[];
  modeLabel?: string;
}): Promise<MultiplayerFinalStanding[]> {
  const now = Date.now();
  const totalPlayers = params.standings.length;

  // Her koltuk için 0 - 10.000 ölçeğinde dengelenmiş puan hesaplama
  const computed: MultiplayerFinalStanding[] = params.standings.map((st) => {
    const cleanAction = Math.max(0, Math.round(st.actionScore));
    let rawFinal = 0;

    if (typeof st.customFinalScore === "number") {
      rawFinal = st.customFinalScore;
    } else if (params.game === "chainReaction") {
      if (st.rank === 1) {
        rawFinal = 2400 + totalPlayers * 250 + Math.min(2200, cleanAction);
      } else if (st.rank === 2) {
        rawFinal = Math.min(1400, 900 + Math.round(cleanAction * 0.45));
      } else if (st.rank === 3) {
        rawFinal = Math.min(950, 600 + Math.round(cleanAction * 0.35));
      } else {
        rawFinal = Math.min(650, 400 + Math.round(cleanAction * 0.25));
      }
    } else if (params.game === "ludo") {
      const firstPrize = totalPlayers >= 3 ? 2800 : 2200;
      if (st.rank === 1) rawFinal = cleanAction + firstPrize;
      else if (st.rank === 2) rawFinal = cleanAction + 1100;
      else if (st.rank === 3) rawFinal = cleanAction + 600;
      else rawFinal = cleanAction + 400;
    } else if (params.game === "dotsSos") {
      const cappedInGame = Math.min(2200, cleanAction);
      if (st.rank === 1) rawFinal = cappedInGame + 2000;
      else if (st.rank === 2) rawFinal = cappedInGame + 850;
      else if (st.rank === 3) rawFinal = cappedInGame + 500;
      else rawFinal = cappedInGame + 350;
    } else if (params.game === "tanks") {
      if (st.rank === 1) rawFinal = cleanAction + 2200;
      else if (st.rank === 2) rawFinal = cleanAction + 950;
      else if (st.rank === 3) rawFinal = cleanAction + 550;
      else rawFinal = cleanAction + 350;
    } else {
      // memoryMatch
      if (st.rank === 1) rawFinal = cleanAction + 1800;
      else if (st.rank === 2) rawFinal = cleanAction + 800;
      else if (st.rank === 3) rawFinal = cleanAction + 500;
      else rawFinal = cleanAction + 350;
    }

    const finalScore = clampGameScore(params.game, rawFinal);
    const prevHigh = st.player.games?.[params.game]?.highScore ?? 0;
    const isNewPersonalBest =
      !st.isBot && !st.player.isBot && finalScore > prevHigh;
    return {
      ...st,
      finalScore,
      isNewPersonalBest,
    };
  });

  // Gerçek oyuncuların Firestore dökümanlarını tek seferde paralel güncelle
  const humanStandings = computed.filter((s) => !s.isBot && !s.player.isBot);

  await Promise.all(
    humanStandings.map(async (entry) => {
      let base = entry.player;
      try {
        const snap = await getDoc(doc(db, PLAYERS_COL, entry.player.id));
        if (snap.exists()) {
          base = normalizePlayerDoc(
            snap.id,
            snap.data() as Record<string, unknown>
          );
        }
      } catch (err) {
        console.error("Firestore çok oyunculu profil okuma hatası:", err);
      }

      const nextGames: PlayerGamesMap = cloneGamesMap(base.games);
      const gStats = nextGames[params.game];
      const prevHigh = gStats.highScore ?? 0;

      gStats.gamesPlayed = (gStats.gamesPlayed || 0) + 1;
      if (entry.rank === 1) {
        gStats.wins = (gStats.wins || 0) + 1;
      }
      if (entry.finalScore > prevHigh) {
        gStats.highScore = entry.finalScore;
        entry.isNewPersonalBest = true;
      }

      const overallBestScore = calculateOverallScore(nextGames);
      const { id: _omit, isBot: _omitBot, ...payload } = {
        ...base,
        games: nextGames,
        overallBestScore,
        updatedAt: now,
      };
      void _omit;
      void _omitBot;

      try {
        await setDoc(doc(db, PLAYERS_COL, base.id), payload, { merge: true });
      } catch (err) {
        console.error("Firestore çok oyunculu skor yazma hatası:", err);
      }
    })
  );

  // activityFeed kayan bandına canlı maç sonucu düşür
  try {
    const winner =
      computed.find((c) => c.rank === 1) ?? computed[0];
    if (winner) {
      const gameTitle = GAME_LABELS[params.game].title;
      const subSuffix = params.modeLabel ? ` (${params.modeLabel})` : "";
      const message = `${totalPlayers} kişilik ${gameTitle}${subSuffix} savaşını ${winner.player.name} kazandı! (${winner.finalScore.toLocaleString("tr-TR")} P)`;

      await addDoc(collection(db, FEED_COL), {
        playerId: winner.player.id,
        playerName: winner.player.name,
        avatar: winner.player.avatar,
        game: params.game,
        score: winner.finalScore,
        message,
        createdAt: now,
      });
    }
  } catch (err) {
    console.error("Firestore çok oyunculu activityFeed yazma hatası:", err);
  }

  return computed;
}

// Composite Index gerektirmeyen gerçek zamanlı Firestore onSnapshot dinleyicileri
export function subscribeAllPlayersRealtime(
  onUpdate: (players: PlayerDoc[]) => void,
  onStatus?: (status: "connected" | "offline") => void
): () => void {
  const q = query(collection(db, PLAYERS_COL), limit(250));
  return onSnapshot(
    q,
    (snap) => {
      const list: PlayerDoc[] = [];
      snap.forEach((docSnap) => {
        const raw = docSnap.data() as Record<string, unknown>;
        if (raw && raw.name) {
          list.push(normalizePlayerDoc(docSnap.id, raw));
        }
      });
      list.sort((a, b) => {
        if (b.overallBestScore !== a.overallBestScore) {
          return b.overallBestScore - a.overallBestScore;
        }
        return b.updatedAt - a.updatedAt;
      });
      onStatus?.("connected");
      onUpdate(list);
    },
    (err) => {
      console.error("Firestore players onSnapshot hatası:", err);
      onStatus?.("offline");
    }
  );
}

export function subscribeActivityFeedRealtime(
  onUpdate: (events: ActivityFeedEvent[]) => void
): () => void {
  const q = query(collection(db, FEED_COL), limit(40));
  return onSnapshot(
    q,
    (snap) => {
      const list: ActivityFeedEvent[] = [];
      snap.forEach((docSnap) => {
        const d = docSnap.data() as Omit<ActivityFeedEvent, "id">;
        if (d && d.message) {
          list.push({ id: docSnap.id, ...d });
        }
      });
      list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      onUpdate(list.slice(0, 15));
    },
    (err) => {
      console.error("Firestore activityFeed onSnapshot hatası:", err);
    }
  );
}
