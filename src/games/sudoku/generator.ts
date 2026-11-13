export type SudokuDifficulty = "easy" | "medium" | "hard" | "expert";

export const SUDOKU_CONFIG: Record<
  SudokuDifficulty,
  {
    label: string;
    blanksTarget: number;
    cellPoints: number;
    completionReward: number;
  }
> = {
  easy: {
    label: "Kolay",
    blanksTarget: 34,
    cellPoints: 15,
    completionReward: 500,
  },
  medium: {
    label: "Orta",
    blanksTarget: 43,
    cellPoints: 25,
    completionReward: 900,
  },
  hard: {
    label: "Zor",
    blanksTarget: 50,
    cellPoints: 35,
    completionReward: 1400,
  },
  expert: {
    label: "Uzman",
    blanksTarget: 55,
    cellPoints: 45,
    completionReward: 2000,
  },
};

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function isValidPlacement(
  grid: number[][],
  row: number,
  col: number,
  val: number
): boolean {
  for (let i = 0; i < 9; i++) {
    if (grid[row][i] === val || grid[i][col] === val) return false;
  }
  const br = Math.floor(row / 3) * 3;
  const bc = Math.floor(col / 3) * 3;
  for (let r = br; r < br + 3; r++) {
    for (let c = bc; c < bc + 3; c++) {
      if (grid[r][c] === val) return false;
    }
  }
  return true;
}

function fillCompleteBoard(grid: number[][]): boolean {
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (grid[r][c] === 0) {
        const candidates = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
        for (const num of candidates) {
          if (isValidPlacement(grid, r, c, num)) {
            grid[r][c] = num;
            if (fillCompleteBoard(grid)) return true;
            grid[r][c] = 0;
          }
        }
        return false;
      }
    }
  }
  return true;
}

// Tek ve kesin çözüm kontrolü (2 çözüm bulduğu an erken çıkar)
function countSolutions(grid: number[][], limitCount: number = 2): number {
  let bestR = -1;
  let bestC = -1;
  let bestOptions: number[] | null = null;

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (grid[r][c] === 0) {
        const opts: number[] = [];
        for (let v = 1; v <= 9; v++) {
          if (isValidPlacement(grid, r, c, v)) opts.push(v);
        }
        if (opts.length === 0) return 0;
        if (!bestOptions || opts.length < bestOptions.length) {
          bestOptions = opts;
          bestR = r;
          bestC = c;
          if (opts.length === 1) break;
        }
      }
    }
    if (bestOptions?.length === 1) break;
  }

  if (bestR === -1 || !bestOptions) {
    return 1; // Tamamlandı
  }

  let total = 0;
  for (const val of bestOptions) {
    grid[bestR][bestC] = val;
    total += countSolutions(grid, limitCount - total);
    grid[bestR][bestC] = 0;
    if (total >= limitCount) return total;
  }
  return total;
}

export interface GeneratedSudoku {
  puzzle: number[][];
  solution: number[][];
}

// Backtracking ile her seferinde sıfırdan tek çözümlü 9x9 Sudoku üretir
export function generateUniqueSudoku(
  difficulty: SudokuDifficulty
): GeneratedSudoku {
  const solution: number[][] = Array.from({ length: 9 }, () =>
    Array(9).fill(0)
  );
  fillCompleteBoard(solution);

  const puzzle = solution.map((row) => [...row]);
  const coords: [number, number][] = [];
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      coords.push([r, c]);
    }
  }

  const shuffledCoords = shuffle(coords);
  const targetBlanks = SUDOKU_CONFIG[difficulty].blanksTarget;
  let removed = 0;

  for (const [r, c] of shuffledCoords) {
    if (removed >= targetBlanks) break;
    const backup = puzzle[r][c];
    puzzle[r][c] = 0;

    const testCopy = puzzle.map((row) => [...row]);
    if (countSolutions(testCopy, 2) === 1) {
      removed++;
    } else {
      puzzle[r][c] = backup;
    }
  }

  return { puzzle, solution };
}

