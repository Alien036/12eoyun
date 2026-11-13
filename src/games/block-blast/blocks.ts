export type ShapeFamily =
  | "dot"
  | "square2"
  | "square3"
  | "bar"
  | "l_shape"
  | "t_shape"
  | "z_shape"
  | "s_shape"
  | "corner";

export interface BlockTheme {
  id: ShapeFamily;
  gradient: string;
  border: string;
  glow: string;
  particleHex: string;
}

export const BLOCK_THEMES: Record<ShapeFamily, BlockTheme> = {
  dot: {
    id: "dot",
    gradient: "from-cyan-300 via-cyan-400 to-sky-600",
    border: "border-cyan-200/70",
    glow: "shadow-[0_0_12px_rgba(34,211,238,0.5)]",
    particleHex: "#22d3ee",
  },
  square2: {
    id: "square2",
    gradient: "from-amber-300 via-yellow-400 to-orange-500",
    border: "border-yellow-200/70",
    glow: "shadow-[0_0_12px_rgba(250,204,21,0.5)]",
    particleHex: "#facc15",
  },
  square3: {
    id: "square3",
    gradient: "from-fuchsia-400 via-pink-500 to-rose-600",
    border: "border-pink-200/70",
    glow: "shadow-[0_0_14px_rgba(236,72,153,0.55)]",
    particleHex: "#ec4899",
  },
  bar: {
    id: "bar",
    gradient: "from-blue-400 via-indigo-500 to-blue-700",
    border: "border-blue-200/70",
    glow: "shadow-[0_0_12px_rgba(99,102,241,0.5)]",
    particleHex: "#6366f1",
  },
  l_shape: {
    id: "l_shape",
    gradient: "from-orange-400 via-amber-500 to-red-500",
    border: "border-orange-200/70",
    glow: "shadow-[0_0_12px_rgba(249,115,22,0.5)]",
    particleHex: "#f97316",
  },
  t_shape: {
    id: "t_shape",
    gradient: "from-violet-400 via-purple-500 to-indigo-700",
    border: "border-violet-200/70",
    glow: "shadow-[0_0_12px_rgba(168,85,247,0.5)]",
    particleHex: "#a855f7",
  },
  z_shape: {
    id: "z_shape",
    gradient: "from-rose-400 via-red-500 to-rose-700",
    border: "border-rose-200/70",
    glow: "shadow-[0_0_12px_rgba(244,63,94,0.5)]",
    particleHex: "#f43f5e",
  },
  s_shape: {
    id: "s_shape",
    gradient: "from-emerald-300 via-emerald-500 to-teal-700",
    border: "border-emerald-200/70",
    glow: "shadow-[0_0_12px_rgba(16,185,129,0.5)]",
    particleHex: "#10b981",
  },
  corner: {
    id: "corner",
    gradient: "from-teal-300 via-cyan-500 to-emerald-600",
    border: "border-teal-200/70",
    glow: "shadow-[0_0_12px_rgba(20,184,166,0.5)]",
    particleHex: "#14b8a6",
  },
};

export interface ShapeDefinition {
  key: string;
  family: ShapeFamily;
  matrix: number[][];
  weight: number;
}

export interface TrayPiece {
  uid: string;
  key: string;
  family: ShapeFamily;
  matrix: number[][];
  cellCount: number;
}

export const SHAPE_CATALOG: ShapeDefinition[] = [
  { key: "1x1", family: "dot", matrix: [[1]], weight: 6 },
  { key: "2x2", family: "square2", matrix: [[1, 1], [1, 1]], weight: 9 },
  {
    key: "3x3",
    family: "square3",
    matrix: [[1, 1, 1], [1, 1, 1], [1, 1, 1]],
    weight: 4,
  },
  { key: "bar2_h", family: "bar", matrix: [[1, 1]], weight: 7 },
  { key: "bar2_v", family: "bar", matrix: [[1], [1]], weight: 7 },
  { key: "bar3_h", family: "bar", matrix: [[1, 1, 1]], weight: 8 },
  { key: "bar3_v", family: "bar", matrix: [[1], [1], [1]], weight: 8 },
  { key: "bar4_h", family: "bar", matrix: [[1, 1, 1, 1]], weight: 6 },
  { key: "bar4_v", family: "bar", matrix: [[1], [1], [1], [1]], weight: 6 },
  { key: "bar5_h", family: "bar", matrix: [[1, 1, 1, 1, 1]], weight: 4 },
  { key: "bar5_v", family: "bar", matrix: [[1], [1], [1], [1], [1]], weight: 4 },
  { key: "L_1", family: "l_shape", matrix: [[1, 0], [1, 0], [1, 1]], weight: 5 },
  { key: "L_2", family: "l_shape", matrix: [[0, 1], [0, 1], [1, 1]], weight: 5 },
  { key: "L_3", family: "l_shape", matrix: [[1, 1, 1], [1, 0, 0]], weight: 5 },
  { key: "L_4", family: "l_shape", matrix: [[1, 1, 1], [0, 0, 1]], weight: 5 },
  { key: "L_5", family: "l_shape", matrix: [[1, 1], [1, 0], [1, 0]], weight: 4 },
  { key: "L_6", family: "l_shape", matrix: [[1, 1], [0, 1], [0, 1]], weight: 4 },
  { key: "T_up", family: "t_shape", matrix: [[0, 1, 0], [1, 1, 1]], weight: 6 },
  { key: "T_down", family: "t_shape", matrix: [[1, 1, 1], [0, 1, 0]], weight: 6 },
  { key: "T_left", family: "t_shape", matrix: [[0, 1], [1, 1], [0, 1]], weight: 5 },
  { key: "T_right", family: "t_shape", matrix: [[1, 0], [1, 1], [1, 0]], weight: 5 },
  { key: "Z_h", family: "z_shape", matrix: [[1, 1, 0], [0, 1, 1]], weight: 6 },
  { key: "Z_v", family: "z_shape", matrix: [[0, 1], [1, 1], [1, 0]], weight: 5 },
  { key: "S_h", family: "s_shape", matrix: [[0, 1, 1], [1, 1, 0]], weight: 6 },
  { key: "S_v", family: "s_shape", matrix: [[1, 0], [1, 1], [0, 1]], weight: 5 },
  { key: "c_sm_1", family: "corner", matrix: [[1, 1], [1, 0]], weight: 6 },
  { key: "c_sm_2", family: "corner", matrix: [[1, 1], [0, 1]], weight: 6 },
  { key: "c_sm_3", family: "corner", matrix: [[1, 0], [1, 1]], weight: 6 },
  { key: "c_sm_4", family: "corner", matrix: [[0, 1], [1, 1]], weight: 6 },
  {
    key: "c_lg_1",
    family: "corner",
    matrix: [[1, 1, 1], [1, 0, 0], [1, 0, 0]],
    weight: 3,
  },
  {
    key: "c_lg_2",
    family: "corner",
    matrix: [[1, 1, 1], [0, 0, 1], [0, 0, 1]],
    weight: 3,
  },
  {
    key: "c_lg_3",
    family: "corner",
    matrix: [[1, 0, 0], [1, 0, 0], [1, 1, 1]],
    weight: 3,
  },
  {
    key: "c_lg_4",
    family: "corner",
    matrix: [[0, 0, 1], [0, 0, 1], [1, 1, 1]],
    weight: 3,
  },
];

function countCells(matrix: number[][]): number {
  let c = 0;
  for (const r of matrix) for (const v of r) if (v === 1) c++;
  return c;
}

export function generateTraySet(): (TrayPiece | null)[] {
  const totalW = SHAPE_CATALOG.reduce((a, b) => a + b.weight, 0);
  const pick = (): TrayPiece => {
    let r = Math.random() * totalW;
    let chosen = SHAPE_CATALOG[0];
    for (const s of SHAPE_CATALOG) {
      r -= s.weight;
      if (r <= 0) {
        chosen = s;
        break;
      }
    }
    return {
      uid: `${chosen.key}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      key: chosen.key,
      family: chosen.family,
      matrix: chosen.matrix,
      cellCount: countCells(chosen.matrix),
    };
  };
  return [pick(), pick(), pick()];
}

