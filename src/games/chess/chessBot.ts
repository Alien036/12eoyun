import { Chess, type Move, type PieceSymbol, type Square } from "chess.js";

export type BotDifficulty = "easy" | "medium" | "hard";

const PIECE_VALUES: Record<PieceSymbol, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
};

// Konumsal Ağırlık Matrisleri (Piece-Square Tables — Beyaz perspektifi, satır 0 = 8. yatay)
const PAWN_PST = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [50, 50, 50, 50, 50, 50, 50, 50],
  [10, 10, 20, 30, 30, 20, 10, 10],
  [5, 5, 10, 25, 25, 10, 5, 5],
  [0, 0, 0, 20, 20, 0, 0, 0],
  [5, -5, -10, 0, 0, -10, -5, 5],
  [5, 10, 10, -20, -20, 10, 10, 5],
  [0, 0, 0, 0, 0, 0, 0, 0],
];

const KNIGHT_PST = [
  [-50, -40, -30, -30, -30, -30, -40, -50],
  [-40, -20, 0, 0, 0, 0, -20, -40],
  [-30, 0, 10, 15, 15, 10, 0, -30],
  [-30, 5, 15, 20, 20, 15, 5, -30],
  [-30, 0, 15, 20, 20, 15, 0, -30],
  [-30, 5, 10, 15, 15, 10, 5, -30],
  [-40, -20, 0, 5, 5, 0, -20, -40],
  [-50, -40, -30, -30, -30, -30, -40, -50],
];

const BISHOP_PST = [
  [-20, -10, -10, -10, -10, -10, -10, -20],
  [-10, 0, 0, 0, 0, 0, 0, -10],
  [-10, 0, 5, 10, 10, 5, 0, -10],
  [-10, 5, 5, 10, 10, 5, 5, -10],
  [-10, 0, 10, 10, 10, 10, 0, -10],
  [-10, 10, 10, 10, 10, 10, 10, -10],
  [-10, 5, 0, 0, 0, 0, 5, -10],
  [-20, -10, -10, -10, -10, -10, -10, -20],
];

const ROOK_PST = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [5, 10, 10, 10, 10, 10, 10, 5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [0, 0, 0, 5, 5, 0, 0, 0],
];

const QUEEN_PST = [
  [-20, -10, -10, -5, -5, -10, -10, -20],
  [-10, 0, 0, 0, 0, 0, 0, -10],
  [-10, 0, 5, 5, 5, 5, 0, -10],
  [-5, 0, 5, 5, 5, 5, 0, -5],
  [0, 0, 5, 5, 5, 5, 0, -5],
  [-10, 5, 5, 5, 5, 5, 0, -10],
  [-10, 0, 5, 0, 0, 0, 0, -10],
  [-20, -10, -10, -5, -5, -10, -10, -20],
];

const KING_PST = [
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-20, -30, -30, -40, -40, -30, -30, -20],
  [-10, -20, -20, -20, -20, -20, -20, -10],
  [20, 20, 0, 0, 0, 0, 20, 20],
  [20, 30, 10, 0, 0, 10, 30, 20],
];

function getPositionalBonus(
  type: PieceSymbol,
  color: "w" | "b",
  row: number,
  col: number
): number {
  const r = color === "w" ? row : 7 - row;
  switch (type) {
    case "p":
      return PAWN_PST[r][col];
    case "n":
      return KNIGHT_PST[r][col];
    case "b":
      return BISHOP_PST[r][col];
    case "r":
      return ROOK_PST[r][col];
    case "q":
      return QUEEN_PST[r][col];
    case "k":
      return KING_PST[r][col];
  }
}

export function evaluateBoard(game: Chess): number {
  if (game.isCheckmate()) {
    return game.turn() === "w" ? -99999 : 99999;
  }
  if (game.isDraw()) return 0;

  const grid = game.board();
  let score = 0;

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = grid[r][c];
      if (!piece) continue;
      const val =
        PIECE_VALUES[piece.type] +
        getPositionalBonus(piece.type, piece.color, r, c);
      score += piece.color === "w" ? val : -val;
    }
  }
  return score;
}

function orderMoves(moves: Move[]): Move[] {
  return [...moves].sort((a, b) => {
    const scoreA =
      (a.captured ? PIECE_VALUES[a.captured] * 10 - PIECE_VALUES[a.piece] : 0) +
      (a.promotion ? 800 : 0);
    const scoreB =
      (b.captured ? PIECE_VALUES[b.captured] * 10 - PIECE_VALUES[b.piece] : 0) +
      (b.promotion ? 800 : 0);
    return scoreB - scoreA;
  });
}

function minimaxAlphaBeta(
  game: Chess,
  depth: number,
  alpha: number,
  beta: number,
  maximizingWhite: boolean
): number {
  if (depth === 0 || game.isGameOver()) {
    return evaluateBoard(game);
  }

  const moves = orderMoves(game.moves({ verbose: true }));

  if (maximizingWhite) {
    let maxEval = -Infinity;
    for (const m of moves) {
      game.move(m);
      const ev = minimaxAlphaBeta(game, depth - 1, alpha, beta, false);
      game.undo();
      if (ev > maxEval) maxEval = ev;
      if (ev > alpha) alpha = ev;
      if (beta <= alpha) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const m of moves) {
      game.move(m);
      const ev = minimaxAlphaBeta(game, depth - 1, alpha, beta, true);
      game.undo();
      if (ev < minEval) minEval = ev;
      if (ev < beta) beta = ev;
      if (beta <= alpha) break;
    }
    return minEval;
  }
}

// Bot hamlesi seçici (Siyah oynar)
export function chooseBotMove(
  fen: string,
  difficulty: BotDifficulty
): { from: Square; to: Square; promotion?: PieceSymbol } | null {
  const game = new Chess(fen);
  const legal = game.moves({ verbose: true });
  if (legal.length === 0) return null;

  // Kolay: %55 rastgele, %45 tek derinlik açgözlü hamle
  if (difficulty === "easy") {
    if (Math.random() < 0.55) {
      const rnd = legal[Math.floor(Math.random() * legal.length)];
      return { from: rnd.from, to: rnd.to, promotion: rnd.promotion };
    }
  }

  const depth = difficulty === "easy" ? 1 : difficulty === "medium" ? 2 : 3;
  const isWhite = game.turn() === "w";
  const ordered = orderMoves(legal);

  let bestMove = ordered[0];
  let bestEval = isWhite ? -Infinity : Infinity;

  for (const m of ordered) {
    game.move(m);
    const ev = minimaxAlphaBeta(
      game,
      depth - 1,
      -Infinity,
      Infinity,
      !isWhite
    );
    game.undo();

    // Eşit pozisyonlarda küçük varyasyon için mikro gürültü
    const jitter = (Math.random() - 0.5) * 8;
    const totalEv = ev + jitter;

    if (isWhite ? totalEv > bestEval : totalEv < bestEval) {
      bestEval = totalEv;
      bestMove = m;
    }
  }

  return {
    from: bestMove.from,
    to: bestMove.to,
    promotion: bestMove.promotion || "q",
  };
}

export function computeMaterialSummary(game: Chess): {
  whiteCaptured: PieceSymbol[];
  blackCaptured: PieceSymbol[];
  whiteMaterial: number;
  blackMaterial: number;
  advantageWhite: number;
} {
  const startCounts: Record<PieceSymbol, number> = {
    p: 8,
    n: 2,
    b: 2,
    r: 2,
    q: 1,
    k: 1,
  };
  const currentW: Record<PieceSymbol, number> = {
    p: 0,
    n: 0,
    b: 0,
    r: 0,
    q: 0,
    k: 0,
  };
  const currentB: Record<PieceSymbol, number> = {
    p: 0,
    n: 0,
    b: 0,
    r: 0,
    q: 0,
    k: 0,
  };

  const unitValues: Record<PieceSymbol, number> = {
    p: 1,
    n: 3,
    b: 3,
    r: 5,
    q: 9,
    k: 0,
  };

  for (const row of game.board()) {
    for (const sq of row) {
      if (!sq) continue;
      if (sq.color === "w") currentW[sq.type]++;
      else currentB[sq.type]++;
    }
  }

  const whiteCaptured: PieceSymbol[] = [];
  const blackCaptured: PieceSymbol[] = [];
  const order: PieceSymbol[] = ["q", "r", "b", "n", "p"];

  for (const sym of order) {
    const lostByBlack = Math.max(0, startCounts[sym] - currentB[sym]);
    for (let i = 0; i < lostByBlack; i++) whiteCaptured.push(sym);

    const lostByWhite = Math.max(0, startCounts[sym] - currentW[sym]);
    for (let i = 0; i < lostByWhite; i++) blackCaptured.push(sym);
  }

  let whiteMaterial = 0;
  let blackMaterial = 0;
  for (const sym of order) {
    whiteMaterial += currentW[sym] * unitValues[sym];
    blackMaterial += currentB[sym] * unitValues[sym];
  }

  return {
    whiteCaptured,
    blackCaptured,
    whiteMaterial,
    blackMaterial,
    advantageWhite: whiteMaterial - blackMaterial,
  };
}

