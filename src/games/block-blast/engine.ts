import { type ShapeFamily, type TrayPiece } from "./blocks";

export const BOARD_SIZE = 8;
export type BoardCell = ShapeFamily | null;
export type BoardGrid = BoardCell[][];

export interface PreviewInfo {
  valid: boolean;
  anchorRow: number;
  anchorCol: number;
  ghostCells: { row: number; col: number }[];
  clearingRows: number[];
  clearingCols: number[];
  family: ShapeFamily;
}

export interface MoveResult {
  board: BoardGrid;
  placedPoints: number;
  blastPoints: number;
  totalEarned: number;
  linesCleared: number;
  clearedCells: { row: number; col: number; family: ShapeFamily }[];
  newCombo: number;
  newGraceMoves: number;
  praiseText: string | null;
}

export function createEmptyBoard(): BoardGrid {
  return Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () => null)
  );
}

export function canPlacePiece(
  board: BoardGrid,
  matrix: number[][],
  anchorRow: number,
  anchorCol: number
): boolean {
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < matrix[r].length; c++) {
      if (matrix[r][c] === 1) {
        const tr = anchorRow + r;
        const tc = anchorCol + c;
        if (tr < 0 || tr >= BOARD_SIZE || tc < 0 || tc >= BOARD_SIZE) {
          return false;
        }
        if (board[tr][tc] !== null) return false;
      }
    }
  }
  return true;
}

export function getPreviewInfo(
  board: BoardGrid,
  piece: TrayPiece,
  anchorRow: number,
  anchorCol: number
): PreviewInfo | null {
  if (!canPlacePiece(board, piece.matrix, anchorRow, anchorCol)) return null;

  const temp = board.map((row) => [...row]);
  const ghostCells: { row: number; col: number }[] = [];

  for (let r = 0; r < piece.matrix.length; r++) {
    for (let c = 0; c < piece.matrix[r].length; c++) {
      if (piece.matrix[r][c] === 1) {
        const tr = anchorRow + r;
        const tc = anchorCol + c;
        temp[tr][tc] = piece.family;
        ghostCells.push({ row: tr, col: tc });
      }
    }
  }

  const clearingRows: number[] = [];
  const clearingCols: number[] = [];

  for (let r = 0; r < BOARD_SIZE; r++) {
    if (temp[r].every((cell) => cell !== null)) clearingRows.push(r);
  }
  for (let c = 0; c < BOARD_SIZE; c++) {
    let full = true;
    for (let r = 0; r < BOARD_SIZE; r++) {
      if (temp[r][c] === null) {
        full = false;
        break;
      }
    }
    if (full) clearingCols.push(c);
  }

  return {
    valid: true,
    anchorRow,
    anchorCol,
    ghostCells,
    clearingRows,
    clearingCols,
    family: piece.family,
  };
}

// Dengeli Puanlama:
// Yerleşen kare başına +10 puan
// Patlayan 1/2/3/4+ satır-sütun için 100 / 300 / 600 / 1200 x Kombo Çarpanı
function getBaseBlastPoints(lines: number): number {
  if (lines <= 0) return 0;
  if (lines === 1) return 100;
  if (lines === 2) return 300;
  if (lines === 3) return 600;
  return 1200;
}

export function executePlacement(
  board: BoardGrid,
  piece: TrayPiece,
  anchorRow: number,
  anchorCol: number,
  currentCombo: number,
  graceMovesLeft: number
): MoveResult {
  const nextBoard = board.map((row) => [...row]);

  for (let r = 0; r < piece.matrix.length; r++) {
    for (let c = 0; c < piece.matrix[r].length; c++) {
      if (piece.matrix[r][c] === 1) {
        nextBoard[anchorRow + r][anchorCol + c] = piece.family;
      }
    }
  }

  // Eşzamanlı satır & sütun kontrolü
  const clearedRows: number[] = [];
  const clearedCols: number[] = [];

  for (let r = 0; r < BOARD_SIZE; r++) {
    if (nextBoard[r].every((cell) => cell !== null)) clearedRows.push(r);
  }
  for (let c = 0; c < BOARD_SIZE; c++) {
    let full = true;
    for (let r = 0; r < BOARD_SIZE; r++) {
      if (nextBoard[r][c] === null) {
        full = false;
        break;
      }
    }
    if (full) clearedCols.push(c);
  }

  const linesCleared = clearedRows.length + clearedCols.length;
  const placedPoints = piece.cellCount * 10;

  const clearedCells: { row: number; col: number; family: ShapeFamily }[] = [];
  const seen = new Set<string>();

  for (const r of clearedRows) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const k = `${r}-${c}`;
      if (!seen.has(k) && nextBoard[r][c]) {
        seen.add(k);
        clearedCells.push({ row: r, col: c, family: nextBoard[r][c]! });
      }
    }
  }
  for (const c of clearedCols) {
    for (let r = 0; r < BOARD_SIZE; r++) {
      const k = `${r}-${c}`;
      if (!seen.has(k) && nextBoard[r][c]) {
        seen.add(k);
        clearedCells.push({ row: r, col: c, family: nextBoard[r][c]! });
      }
    }
  }

  for (const item of clearedCells) {
    nextBoard[item.row][item.col] = null;
  }

  let newCombo = currentCombo;
  let newGraceMoves = graceMovesLeft;
  let blastPoints = 0;

  if (linesCleared > 0) {
    newCombo = currentCombo > 0 && graceMovesLeft > 0 ? currentCombo + 1 : 1;
    newGraceMoves = 3;
    blastPoints = getBaseBlastPoints(linesCleared) * Math.max(1, newCombo);
  } else {
    const rem = graceMovesLeft - 1;
    if (rem <= 0) {
      newCombo = 0;
      newGraceMoves = 0;
    } else {
      newGraceMoves = rem;
    }
  }

  let praiseText: string | null = null;
  if (linesCleared >= 4 || (linesCleared >= 3 && newCombo >= 3)) {
    praiseText = "EFSANE!";
  } else if (linesCleared === 3 || newCombo >= 4) {
    praiseText = "MÜKEMMEL!";
  } else if (linesCleared === 2 || newCombo >= 2) {
    praiseText = "HARİKA!";
  } else if (linesCleared === 1) {
    praiseText = "SÜPER!";
  }

  return {
    board: nextBoard,
    placedPoints,
    blastPoints,
    totalEarned: placedPoints + blastPoints,
    linesCleared,
    clearedCells,
    newCombo,
    newGraceMoves,
    praiseText,
  };
}

export function canPieceFitAnywhere(board: BoardGrid, piece: TrayPiece): boolean {
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (canPlacePiece(board, piece.matrix, r, c)) return true;
    }
  }
  return false;
}

export function checkIsGameOver(
  board: BoardGrid,
  tray: (TrayPiece | null)[]
): boolean {
  const remaining = tray.filter((p): p is TrayPiece => p !== null);
  if (remaining.length === 0) return false;
  return !remaining.some((p) => canPieceFitAnywhere(board, p));
}

