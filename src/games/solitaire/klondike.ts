export type Suit = "spades" | "hearts" | "clubs" | "diamonds";

export interface PlayingCard {
  id: string;
  suit: Suit;
  rank: number; // 1 (As) .. 13 (Papaz)
  faceUp: boolean;
}

export interface KlondikeState {
  stock: PlayingCard[];
  waste: PlayingCard[];
  foundations: Record<Suit, PlayingCard[]>;
  tableau: PlayingCard[][]; // 7 sütun
  score: number;
  moves: number;
}

export const SUIT_ORDER: Suit[] = ["spades", "hearts", "clubs", "diamonds"];

export const SUIT_META: Record<
  Suit,
  { symbol: string; isRed: boolean; colorClass: string }
> = {
  spades: { symbol: "♠", isRed: false, colorClass: "text-slate-900" },
  hearts: { symbol: "♥", isRed: true, colorClass: "text-rose-600" },
  clubs: { symbol: "♣", isRed: false, colorClass: "text-slate-900" },
  diamonds: { symbol: "♦", isRed: true, colorClass: "text-rose-600" },
};

export function formatRank(rank: number): string {
  if (rank === 1) return "A";
  if (rank === 11) return "J";
  if (rank === 12) return "Q";
  if (rank === 13) return "K";
  return String(rank);
}

export function isRedSuit(suit: Suit): boolean {
  return suit === "hearts" || suit === "diamonds";
}

export function cloneKlondikeState(st: KlondikeState): KlondikeState {
  return {
    stock: st.stock.map((c) => ({ ...c })),
    waste: st.waste.map((c) => ({ ...c })),
    foundations: {
      spades: st.foundations.spades.map((c) => ({ ...c })),
      hearts: st.foundations.hearts.map((c) => ({ ...c })),
      clubs: st.foundations.clubs.map((c) => ({ ...c })),
      diamonds: st.foundations.diamonds.map((c) => ({ ...c })),
    },
    tableau: st.tableau.map((col) => col.map((c) => ({ ...c }))),
    score: st.score,
    moves: st.moves,
  };
}

export function dealNewKlondike(): KlondikeState {
  const deck: PlayingCard[] = [];
  for (const suit of SUIT_ORDER) {
    for (let rank = 1; rank <= 13; rank++) {
      deck.push({
        id: `${suit}_${rank}`,
        suit,
        rank,
        faceUp: false,
      });
    }
  }

  // Fisher-Yates karıştırma
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  const tableau: PlayingCard[][] = Array.from({ length: 7 }, () => []);
  let cursor = 0;

  for (let col = 0; col < 7; col++) {
    for (let row = 0; row <= col; row++) {
      const card = { ...deck[cursor++], faceUp: row === col };
      tableau[col].push(card);
    }
  }

  const stock = deck.slice(cursor).map((c) => ({ ...c, faceUp: false }));

  return {
    stock,
    waste: [],
    foundations: {
      spades: [],
      hearts: [],
      clubs: [],
      diamonds: [],
    },
    tableau,
    score: 0,
    moves: 0,
  };
}

export function canPlaceOnFoundation(
  card: PlayingCard,
  pile: PlayingCard[],
  targetSuit: Suit
): boolean {
  if (card.suit !== targetSuit) return false;
  if (pile.length === 0) return card.rank === 1;
  return pile[pile.length - 1].rank === card.rank - 1;
}

export function canPlaceOnTableauColumn(
  movingBottomCard: PlayingCard,
  targetColumn: PlayingCard[]
): boolean {
  if (targetColumn.length === 0) {
    return movingBottomCard.rank === 13; // Boş sütuna sadece Papaz (K)
  }
  const topTarget = targetColumn[targetColumn.length - 1];
  if (!topTarget.faceUp) return false;
  const altColor = isRedSuit(movingBottomCard.suit) !== isRedSuit(topTarget.suit);
  return altColor && movingBottomCard.rank === topTarget.rank - 1;
}

export function isKlondikeWon(st: KlondikeState): boolean {
  return (
    st.foundations.spades.length === 13 &&
    st.foundations.hearts.length === 13 &&
    st.foundations.clubs.length === 13 &&
    st.foundations.diamonds.length === 13
  );
}

// Tüm kapalı kartlar açıldığında ve çekme/atık destesi boşaldığında Otomatik Tamamla aktif olur
export function canAutoComplete(st: KlondikeState): boolean {
  if (isKlondikeWon(st)) return false;
  if (st.stock.length > 0 || st.waste.length > 0) return false;
  return st.tableau.every((col) => col.every((card) => card.faceUp));
}

// Otomatik tamamlama için sıradaki tek adımı uygular
export function stepAutoComplete(st: KlondikeState): KlondikeState | null {
  const next = cloneKlondikeState(st);

  for (let colIdx = 0; colIdx < 7; colIdx++) {
    const col = next.tableau[colIdx];
    if (col.length === 0) continue;
    const top = col[col.length - 1];
    const fPile = next.foundations[top.suit];
    if (canPlaceOnFoundation(top, fPile, top.suit)) {
      col.pop();
      fPile.push({ ...top, faceUp: true });
      next.score += 40;
      next.moves += 1;
      return next;
    }
  }
  return null;
}

