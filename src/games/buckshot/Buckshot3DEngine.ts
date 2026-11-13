import * as THREE from "three";
import type { BuckshotItemKey, ShellType } from "./BuckshotView";
import { sound } from "@/lib/sound";

export interface Buckshot3DStateSnapshot {
  mode: "solo" | "duel";
  turn: 1 | 2;
  maxHp: number;
  p1Hp: number;
  p2Hp: number;
  wiresCutSuddenDeath: boolean;
  isSawedOff: boolean;
  p1Items: (BuckshotItemKey | null)[];
  p2Items: (BuckshotItemKey | null)[];
  p1Cuffed: boolean;
  p2Cuffed: boolean;
  revealShells: ShellType[] | null;
  gunAim: "neutral" | "p1" | "p2";
  gunPickedUpBy: 1 | 2 | null;
  adrenalineStealSeat: 1 | 2 | null;
  currentChamberShell?: ShellType | null;
}

export interface RaycastHitResult {
  viewportSeat: 1 | 2;
  hitType:
    | "shotgun"
    | "item"
    | "target_opponent"
    | "target_self"
    | "table_cancel"
    | "none";
  trayOwner?: 1 | 2;
  slotIndex?: number;
}

interface Ejected3DShell {
  mesh: THREE.Group;
  vel: THREE.Vector3;
  rotVel: THREE.Vector3;
  settled: boolean;
  bounces: number;
}

interface SparkParticle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
}

interface ActiveItemAnim {
  mesh: THREE.Group;
  userSeat: 1 | 2;
  itemKey: BuckshotItemKey;
  startPos: THREE.Vector3;
  targetPos: THREE.Vector3;
  progress: number;
}

interface FallingBarrelPiece {
  mesh: THREE.Group;
  vel: THREE.Vector3;
  rotVel: THREE.Vector3;
  bounces: number;
  settled: boolean;
}

const ITEM_3D_LABELS: Record<BuckshotItemKey, string> = {
  soda: "İÇECEK",
  handcuffs: "KELEPÇE",
  handsaw: "TESTERE",
  magnifier: "BÜYÜTEÇ",
  sedative: "SİGARA +1⚡",
  inverter: "DÖNÜŞTÜRÜCÜ",
  burnerPhone: "TELEFON",
  adrenaline: "ADRENALİN",
  expiredMed: "BOZUK İLAÇ",
};

// ============================================================================
// PROSEDÜREL RENK (MAP), KABARTMA (BUMPMAP) VE PÜRÜZLÜLÜK (ROUGHNESSMAP) DOKULARI
// ============================================================================

function createFeltTableTextures(): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
} {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d")!;

  const bumpCanvas = document.createElement("canvas");
  bumpCanvas.width = 512;
  bumpCanvas.height = 512;
  const bCtx = bumpCanvas.getContext("2d")!;

  // 1. Eskitilmiş koyu yeşil yeraltı çuha zemini
  ctx.fillStyle = "#102318";
  ctx.fillRect(0, 0, 1024, 1024);

  bCtx.fillStyle = "#808080";
  bCtx.fillRect(0, 0, 512, 512);

  // Radyal kirli chiaroscuro gölgeleme (kenarlar çok koyu)
  const grad = ctx.createRadialGradient(512, 512, 80, 512, 512, 660);
  grad.addColorStop(0, "rgba(38, 86, 56, 0.55)");
  grad.addColorStop(0.58, "rgba(14, 33, 22, 0.65)");
  grad.addColorStop(1, "rgba(3, 6, 4, 0.96)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1024, 1024);

  // Çuha dokuma lifleri ve aşınma gürültüsü
  for (let i = 0; i < 26000; i++) {
    const x = Math.random() * 1024;
    const y = Math.random() * 1024;
    const dark = Math.random() < 0.6;
    ctx.fillStyle = dark
      ? `rgba(2, 6, 4, ${Math.random() * 0.34})`
      : `rgba(64, 124, 82, ${Math.random() * 0.14})`;
    ctx.fillRect(x, y, 2 + Math.random() * 3, 2 + Math.random() * 3);

    if (i < 14000) {
      const bx = Math.random() * 512;
      const by = Math.random() * 512;
      const bVal = 95 + Math.floor(Math.random() * 65);
      bCtx.fillStyle = `rgb(${bVal},${bVal},${bVal})`;
      bCtx.fillRect(bx, by, 2, 2);
    }
  }

  // Yağ, kan/pas ve barut lekeleri
  for (let s = 0; s < 34; s++) {
    const sx = 100 + Math.random() * 824;
    const sy = 100 + Math.random() * 824;
    const r = 20 + Math.random() * 65;
    const sg = ctx.createRadialGradient(sx, sy, 2, sx, sy, r);
    sg.addColorStop(0, "rgba(4, 7, 5, 0.55)");
    sg.addColorStop(1, "rgba(4, 7, 5, 0)");
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();

    // Yağ lekeleri daha pürüzsüz/parlak (roughnessMap'te daha koyu)
    const bg = bCtx.createRadialGradient(
      sx * 0.5,
      sy * 0.5,
      1,
      sx * 0.5,
      sy * 0.5,
      r * 0.5
    );
    bg.addColorStop(0, "rgba(50, 50, 50, 0.65)");
    bg.addColorStop(1, "rgba(128, 128, 128, 0)");
    bCtx.fillStyle = bg;
    bCtx.beginPath();
    bCtx.arc(sx * 0.5, sy * 0.5, r * 0.5, 0, Math.PI * 2);
    bCtx.fill();
  }

  // Bıçak / testere çizikleri
  ctx.strokeStyle = "rgba(5, 10, 7, 0.65)";
  bCtx.strokeStyle = "rgba(40, 40, 40, 0.8)";
  for (let c = 0; c < 18; c++) {
    const x1 = 140 + Math.random() * 740;
    const y1 = 140 + Math.random() * 740;
    const x2 = x1 + (Math.random() - 0.5) * 90;
    const y2 = y1 + (Math.random() - 0.5) * 90;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    bCtx.lineWidth = 1.5;
    bCtx.beginPath();
    bCtx.moveTo(x1 * 0.5, y1 * 0.5);
    bCtx.lineTo(x2 * 0.5, y2 * 0.5);
    bCtx.stroke();
  }

  // Yer yer silinmiş tebeşir beyazı masa çizgileri
  ctx.strokeStyle = "rgba(218, 226, 212, 0.62)";
  ctx.lineWidth = 4;
  ctx.strokeRect(42, 42, 940, 940);

  // Orta Tüfek Dikdörtgeni ve Nişangah Çizgileri
  ctx.strokeStyle = "rgba(228, 235, 222, 0.72)";
  ctx.lineWidth = 3.5;
  ctx.strokeRect(262, 430, 500, 164);

  ctx.beginPath();
  ctx.moveTo(230, 512);
  ctx.lineTo(794, 512);
  ctx.moveTo(512, 405);
  ctx.moveTo(512, 619);
  ctx.stroke();

  // Sol Kenar: 8'li Mermi Dizilim Kutucukları
  ctx.strokeStyle = "rgba(245, 158, 11, 0.65)";
  ctx.strokeRect(68, 360, 145, 304);
  for (let m = 0; m < 8; m++) {
    const my = 374 + m * 35;
    ctx.strokeRect(84, my, 112, 26);
  }

  // Oyuncu 1 (+Z) ve Oyuncu 2 (-Z) için 8'li Eşya Kutucukları
  ctx.strokeStyle = "rgba(232, 238, 226, 0.8)";
  ctx.lineWidth = 4;

  const drawPlayerItemGrid = (isP1Bottom: boolean) => {
    const rowY1 = isP1Bottom ? 662 : 138;
    const rowY2 = isP1Bottom ? 792 : 268;
    const xColsLeft = [194, 322];
    const xColsRight = [598, 726];
    const boxSize = 104;

    const allCoords: { x: number; y: number }[] = [
      { x: xColsLeft[0], y: rowY1 },
      { x: xColsLeft[1], y: rowY1 },
      { x: xColsLeft[0], y: rowY2 },
      { x: xColsLeft[1], y: rowY2 },
      { x: xColsRight[0], y: rowY1 },
      { x: xColsRight[1], y: rowY1 },
      { x: xColsRight[0], y: rowY2 },
      { x: xColsRight[1], y: rowY2 },
    ];

    allCoords.forEach((pt, idx) => {
      ctx.strokeRect(pt.x, pt.y, boxSize, boxSize);
      // Tebeşir aşınma darbeleri
      ctx.fillStyle = "rgba(16, 35, 24, 0.45)";
      ctx.fillRect(pt.x + 28, pt.y - 2, 16, 5);
      ctx.fillStyle = "rgba(232, 238, 228, 0.25)";
      ctx.font = "bold 18px monospace";
      ctx.fillText(`${idx + 1}`, pt.x + 8, pt.y + 22);
    });
  };

  drawPlayerItemGrid(false);
  drawPlayerItemGrid(true);

  const map = new THREE.CanvasTexture(canvas);
  map.magFilter = THREE.NearestFilter;
  map.minFilter = THREE.NearestFilter;
  map.needsUpdate = true;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.magFilter = THREE.LinearFilter;
  bumpMap.minFilter = THREE.LinearFilter;
  bumpMap.needsUpdate = true;

  return { map, bumpMap, roughnessMap: bumpMap };
}

function createGrungeBrickTextures(): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
} {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;

  const bumpCanvas = document.createElement("canvas");
  bumpCanvas.width = 512;
  bumpCanvas.height = 512;
  const bCtx = bumpCanvas.getContext("2d")!;

  // Derz araları koyu ve içeri gömülü (bumpMap'te siyah)
  ctx.fillStyle = "#090505";
  ctx.fillRect(0, 0, 512, 512);

  bCtx.fillStyle = "#181818";
  bCtx.fillRect(0, 0, 512, 512);

  const rows = 16;
  const cols = 8;
  const brickH = 512 / rows;
  const brickW = 512 / cols;

  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * (brickW / 2);
    for (let c = -1; c <= cols; c++) {
      const x = c * brickW + offset;
      const y = r * brickH;
      const shade = 18 + Math.floor(Math.random() * 20);
      const red = shade + 14 + Math.floor(Math.random() * 16);
      ctx.fillStyle = `rgb(${red}, ${shade}, ${shade - 3})`;
      ctx.fillRect(x + 3, y + 3, brickW - 6, brickH - 6);

      const bHeight = 145 + Math.floor(Math.random() * 75);
      bCtx.fillStyle = `rgb(${bHeight}, ${bHeight}, ${bHeight})`;
      bCtx.fillRect(x + 3, y + 3, brickW - 6, brickH - 6);
    }
  }

  // Tavandan aşağı doğru süzülen rutubet ve is lekeleri
  for (let s = 0; s < 24; s++) {
    const sx = Math.random() * 512;
    const sw = 12 + Math.random() * 28;
    const sh = 140 + Math.random() * 340;
    const streakGrad = ctx.createLinearGradient(sx, 0, sx, sh);
    streakGrad.addColorStop(0, "rgba(2, 2, 2, 0.78)");
    streakGrad.addColorStop(0.6, "rgba(8, 12, 9, 0.42)");
    streakGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = streakGrad;
    ctx.fillRect(sx, 0, sw, sh);
  }

  // Tuğla pürüzleri
  for (let i = 0; i < 8000; i++) {
    const rx = Math.random() * 512;
    const ry = Math.random() * 512;
    ctx.fillStyle =
      Math.random() < 0.72 ? "rgba(0,0,0,0.38)" : "rgba(85,40,28,0.16)";
    ctx.fillRect(rx, ry, 3, 3);

    const bv = Math.random() < 0.5 ? 60 : 210;
    bCtx.fillStyle = `rgba(${bv},${bv},${bv},0.28)`;
    bCtx.fillRect(rx, ry, 3, 3);
  }

  const map = new THREE.CanvasTexture(canvas);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(3, 2);
  map.magFilter = THREE.NearestFilter;
  map.minFilter = THREE.NearestFilter;
  map.needsUpdate = true;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(3, 2);
  bumpMap.needsUpdate = true;

  return { map, bumpMap, roughnessMap: bumpMap };
}

function createRustyMetalTextures(): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;

  const bumpCanvas = document.createElement("canvas");
  bumpCanvas.width = 512;
  bumpCanvas.height = 512;
  const bCtx = bumpCanvas.getContext("2d")!;

  ctx.fillStyle = "#181514";
  ctx.fillRect(0, 0, 512, 512);

  bCtx.fillStyle = "#707070";
  bCtx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 9000; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const w = 2 + Math.random() * 8;
    const rust = Math.random() < 0.36;
    ctx.fillStyle = rust
      ? `rgba(115, 48, 16, ${Math.random() * 0.38})`
      : `rgba(52, 58, 66, ${Math.random() * 0.26})`;
    ctx.fillRect(x, y, w, 2);

    const bv = rust ? 185 : 95;
    bCtx.fillStyle = `rgba(${bv},${bv},${bv},0.35)`;
    bCtx.fillRect(x, y, w, 2);
  }

  const map = new THREE.CanvasTexture(canvas);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.magFilter = THREE.NearestFilter;
  map.minFilter = THREE.NearestFilter;
  map.needsUpdate = true;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.needsUpdate = true;

  return { map, bumpMap };
}

function createWalnutWoodTextures(): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;

  const bumpCanvas = document.createElement("canvas");
  bumpCanvas.width = 512;
  bumpCanvas.height = 512;
  const bCtx = bumpCanvas.getContext("2d")!;

  ctx.fillStyle = "#421d0a";
  ctx.fillRect(0, 0, 512, 512);

  bCtx.fillStyle = "#888888";
  bCtx.fillRect(0, 0, 512, 512);

  for (let y = 0; y < 512; y += 2) {
    const wave = Math.sin(y * 0.05) * 16;
    ctx.strokeStyle =
      y % 6 === 0 ? "rgba(22, 8, 3, 0.62)" : "rgba(92, 44, 16, 0.38)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(170, y + wave, 340, y - wave, 512, y);
    ctx.stroke();

    bCtx.strokeStyle = y % 6 === 0 ? "#484848" : "#b8b8b8";
    bCtx.lineWidth = 1.4;
    bCtx.beginPath();
    bCtx.moveTo(0, y);
    bCtx.bezierCurveTo(170, y + wave, 340, y - wave, 512, y);
    bCtx.stroke();
  }

  const map = new THREE.CanvasTexture(canvas);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.magFilter = THREE.NearestFilter;
  map.minFilter = THREE.NearestFilter;
  map.needsUpdate = true;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.needsUpdate = true;

  return { map, bumpMap };
}

function createBrushedSteelTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#222c38";
  ctx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 5000; i++) {
    const bright = Math.random() < 0.45;
    ctx.fillStyle = bright
      ? `rgba(148, 163, 184, ${Math.random() * 0.18})`
      : `rgba(12, 18, 28, ${Math.random() * 0.32})`;
    ctx.fillRect(Math.random() * 512, Math.random() * 512, 18, 1.2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

function createCrackedPorcelainTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#dfd9ce";
  ctx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 3000; i++) {
    ctx.fillStyle =
      Math.random() < 0.65
        ? `rgba(68, 60, 52, ${Math.random() * 0.14})`
        : `rgba(250, 246, 238, ${Math.random() * 0.2})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 3, 3);
  }

  ctx.strokeStyle = "#1c1917";
  ctx.lineWidth = 2.2;
  const cracks = [
    [
      [62, 18],
      [78, 56],
      [66, 98],
      [92, 134],
      [84, 178],
    ],
    [
      [188, 32],
      [172, 74],
      [195, 112],
      [168, 162],
    ],
    [
      [78, 56],
      [112, 68],
      [126, 92],
    ],
  ];
  cracks.forEach((path) => {
    ctx.beginPath();
    path.forEach(([x, y], idx) => {
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

function createBandageTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#cbc3b4";
  ctx.fillRect(0, 0, 128, 128);

  ctx.strokeStyle = "rgba(75, 65, 54, 0.45)";
  ctx.lineWidth = 2;
  for (let y = 0; y < 128; y += 14) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(128, y + 6);
    ctx.stroke();
  }

  for (let i = 0; i < 600; i++) {
    ctx.fillStyle =
      Math.random() < 0.25
        ? "rgba(120, 38, 28, 0.18)"
        : "rgba(58, 50, 42, 0.15)";
    ctx.fillRect(Math.random() * 128, Math.random() * 128, 3, 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

function createChalkLabelTexture(
  text: string,
  active: boolean,
  stealMode: boolean
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;

  ctx.clearRect(0, 0, 256, 64);

  ctx.fillStyle = stealMode
    ? "rgba(68, 10, 24, 0.88)"
    : active
    ? "rgba(28, 22, 12, 0.86)"
    : "rgba(12, 16, 14, 0.72)";
  ctx.fillRect(6, 8, 244, 48);

  ctx.strokeStyle = stealMode
    ? "rgba(251, 113, 133, 0.95)"
    : active
    ? "rgba(251, 191, 36, 0.92)"
    : "rgba(148, 163, 184, 0.4)";
  ctx.lineWidth = 3;
  ctx.strokeRect(6, 8, 244, 48);

  ctx.font = "900 24px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = stealMode
    ? "#fecdd3"
    : active
    ? "#fde68a"
    : "rgba(203, 213, 225, 0.65)";
  ctx.fillText(text, 128, 33);

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

function createTargetBadgeTexture(
  title: string,
  subtitle: string,
  isEnemy: boolean
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 384;
  canvas.height = 96;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = isEnemy ? "rgba(69, 10, 10, 0.9)" : "rgba(8, 47, 73, 0.9)";
  ctx.fillRect(8, 8, 368, 80);

  ctx.strokeStyle = isEnemy ? "#ef4444" : "#38bdf8";
  ctx.lineWidth = 4;
  ctx.strokeRect(8, 8, 368, 80);

  ctx.font = "900 26px monospace";
  ctx.textAlign = "center";
  ctx.fillStyle = isEnemy ? "#fecaca" : "#bae6fd";
  ctx.fillText(title, 192, 42);

  ctx.font = "bold 18px monospace";
  ctx.fillStyle = isEnemy ? "#fca5a5" : "#fde68a";
  ctx.fillText(subtitle, 192, 70);

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

// ============================================================================
// 9 YÜKSEK DETAYLI FİZİKSEL 3D EŞYA MODELİ (%28 BÜYÜTÜLMÜŞ)
// ============================================================================

function create3DItemModel(itemKey: BuckshotItemKey): THREE.Group {
  const group = new THREE.Group();

  switch (itemKey) {
    case "soda": {
      // 1. Teneke İçecek Kutusu (Yıpranmış Metal Etiket + Gümüş Kapak + Açma Halkası Pull-Tab)
      const bodyGeo = new THREE.CylinderGeometry(0.165, 0.165, 0.45, 16);
      const bodyMat = new THREE.MeshStandardMaterial({
        color: 0x0284c7,
        roughness: 0.28,
        metalness: 0.72,
      });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.y = 0.225;
      body.castShadow = true;
      group.add(body);

      const stripeGeo = new THREE.CylinderGeometry(0.169, 0.169, 0.16, 16);
      const stripeMat = new THREE.MeshStandardMaterial({
        color: 0xe11d48,
        roughness: 0.35,
      });
      const stripe = new THREE.Mesh(stripeGeo, stripeMat);
      stripe.position.y = 0.24;
      group.add(stripe);

      const silverMat = new THREE.MeshStandardMaterial({
        color: 0xe2e8f0,
        metalness: 0.92,
        roughness: 0.16,
      });
      const top = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.162, 0.035, 16),
        silverMat
      );
      top.position.y = 0.455;
      group.add(top);

      // Metal Açma Halkası (Pull-tab ring)
      const pullTab = new THREE.Mesh(
        new THREE.TorusGeometry(0.038, 0.008, 6, 12),
        silverMat
      );
      pullTab.rotation.x = Math.PI / 2;
      pullTab.position.set(0.02, 0.478, 0);
      group.add(pullTab);
      break;
    }

    case "handcuffs": {
      // 2. Metal Kelepçe (Çift Dişli Çelik Halka + Kilit Kutusu + Gerçek Zincir Halkaları)
      const metalMat = new THREE.MeshStandardMaterial({
        color: 0xcbd5e1,
        metalness: 0.9,
        roughness: 0.2,
      });
      const cuffGeo = new THREE.TorusGeometry(0.145, 0.028, 10, 20);

      const leftCuff = new THREE.Mesh(cuffGeo, metalMat);
      leftCuff.rotation.x = Math.PI / 2;
      leftCuff.position.set(-0.17, 0.05, 0);
      leftCuff.castShadow = true;
      group.add(leftCuff);

      const rightCuff = new THREE.Mesh(cuffGeo, metalMat);
      rightCuff.rotation.x = Math.PI / 2;
      rightCuff.position.set(0.17, 0.05, 0);
      rightCuff.castShadow = true;
      group.add(rightCuff);

      // Kilit mekanizması blokları ve 3 halkalı metal zincir
      [-0.06, 0, 0.06].forEach((cx, idx) => {
        const chainLink = new THREE.Mesh(
          new THREE.TorusGeometry(0.036, 0.009, 6, 12),
          metalMat
        );
        chainLink.rotation.x = idx % 2 === 0 ? Math.PI / 2 : 0.35;
        chainLink.position.set(cx, 0.05, 0);
        group.add(chainLink);
      });
      break;
    }

    case "handsaw": {
      // 3. El Testeresi (Vidalı Ahşap Kabza + Parlak Çelik Bıçak + Tek Tek Modellenmiş Testere Dişleri)
      const handleMat = new THREE.MeshStandardMaterial({
        color: 0x7c2d12,
        roughness: 0.58,
      });
      const handle = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.1, 0.3),
        handleMat
      );
      handle.position.set(-0.13, 0.07, 0.05);
      handle.rotation.y = 0.25;
      handle.castShadow = true;
      group.add(handle);

      const steelMat = new THREE.MeshStandardMaterial({
        color: 0xe2e8f0,
        metalness: 0.94,
        roughness: 0.16,
      });
      // Kabza vidaları
      [-0.04, 0.04].forEach((vz) => {
        const screw = new THREE.Mesh(
          new THREE.CylinderGeometry(0.018, 0.018, 0.11, 8),
          steelMat
        );
        screw.position.set(-0.13, 0.07, 0.05 + vz);
        group.add(screw);
      });

      const blade = new THREE.Mesh(
        new THREE.BoxGeometry(0.38, 0.022, 0.095),
        steelMat
      );
      blade.position.set(0.12, 0.07, -0.02);
      blade.castShadow = true;
      group.add(blade);

      // Testere dişleri
      const toothGeo = new THREE.ConeGeometry(0.018, 0.032, 4);
      for (let t = 0; t < 7; t++) {
        const tooth = new THREE.Mesh(toothGeo, steelMat);
        tooth.rotation.x = Math.PI / 2;
        tooth.position.set(-0.02 + t * 0.048, 0.07, 0.038);
        group.add(tooth);
      }
      break;
    }

    case "magnifier": {
      // 4. Büyüteç (Kalın Pirinç Çerçeve + Kırılmalı Yarı Saydam Cam Mercek + Sap)
      const rimMat = new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        metalness: 0.88,
        roughness: 0.22,
      });
      const rim = new THREE.Mesh(
        new THREE.TorusGeometry(0.165, 0.028, 10, 22),
        rimMat
      );
      rim.rotation.x = Math.PI / 2;
      rim.position.set(0, 0.07, -0.06);
      rim.castShadow = true;
      group.add(rim);

      const lensMat = new THREE.MeshStandardMaterial({
        color: 0x7dd3fc,
        emissive: 0x0284c7,
        emissiveIntensity: 0.38,
        transparent: true,
        opacity: 0.65,
        roughness: 0.08,
        metalness: 0.2,
      });
      const lens = new THREE.Mesh(
        new THREE.CylinderGeometry(0.155, 0.155, 0.024, 18),
        lensMat
      );
      lens.position.set(0, 0.07, -0.06);
      group.add(lens);

      const stick = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.038, 0.24, 10),
        new THREE.MeshStandardMaterial({ color: 0x292524, roughness: 0.55 })
      );
      stick.rotation.x = Math.PI / 2;
      stick.position.set(0, 0.07, 0.19);
      group.add(stick);
      break;
    }

    case "sedative": {
      // 5. Sigara Paketi / Şarj Tüpü (+1⚡ Yeşil Parlayan Kapsül)
      const pack = new THREE.Mesh(
        new THREE.BoxGeometry(0.25, 0.35, 0.15),
        new THREE.MeshStandardMaterial({ color: 0x065f46, roughness: 0.38 })
      );
      pack.position.y = 0.175;
      pack.castShadow = true;
      group.add(pack);

      const core = new THREE.Mesh(
        new THREE.BoxGeometry(0.17, 0.17, 0.16),
        new THREE.MeshStandardMaterial({
          color: 0x10b981,
          emissive: 0x10b981,
          emissiveIntensity: 0.85,
        })
      );
      core.position.y = 0.2;
      group.add(core);
      break;
    }

    case "inverter": {
      // 6. Dönüştürücü (Endüstriyel Kutu + Parlayan Mor Bobinler)
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(0.29, 0.21, 0.25),
        new THREE.MeshStandardMaterial({
          color: 0x312e81,
          metalness: 0.68,
          roughness: 0.32,
        })
      );
      box.position.y = 0.105;
      box.castShadow = true;
      group.add(box);

      const coilGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.15, 12);
      const coilMat = new THREE.MeshStandardMaterial({
        color: 0xc084fc,
        emissive: 0x9333ea,
        emissiveIntensity: 0.9,
      });
      const c1 = new THREE.Mesh(coilGeo, coilMat);
      c1.position.set(-0.065, 0.25, 0);
      const c2 = new THREE.Mesh(coilGeo, coilMat);
      c2.position.set(0.065, 0.25, 0);
      group.add(c1, c2);
      break;
    }

    case "burnerPhone": {
      // 7. Gizli Telefon (3D Tuşlu Retro Telefon + Parlak Kehribar Ekran + Anten)
      const bodyMat = new THREE.MeshStandardMaterial({
        color: 0x292524,
        roughness: 0.45,
      });
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.075, 0.37),
        bodyMat
      );
      body.position.y = 0.04;
      body.castShadow = true;
      group.add(body);

      const scr = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.018, 0.13),
        new THREE.MeshStandardMaterial({
          color: 0xfbbf24,
          emissive: 0xd97706,
          emissiveIntensity: 0.9,
        })
      );
      scr.position.set(0, 0.08, -0.07);
      group.add(scr);

      const ant = new THREE.Mesh(
        new THREE.CylinderGeometry(0.014, 0.014, 0.24, 8),
        bodyMat
      );
      ant.position.set(0.075, 0.15, -0.15);
      group.add(ant);
      break;
    }

    case "adrenaline": {
      // 8. Adrenalin Şırıngası (Saydam Tüp + Parlayan Kırmızı Sıvı + Piston Kolu + İğne Ucu)
      const tube = new THREE.Mesh(
        new THREE.CylinderGeometry(0.062, 0.062, 0.34, 14),
        new THREE.MeshStandardMaterial({
          color: 0xfef2f2,
          transparent: true,
          opacity: 0.68,
          roughness: 0.12,
        })
      );
      tube.rotation.z = Math.PI / 2;
      tube.position.y = 0.095;
      group.add(tube);

      const liq = new THREE.Mesh(
        new THREE.CylinderGeometry(0.048, 0.048, 0.22, 12),
        new THREE.MeshStandardMaterial({
          color: 0xef4444,
          emissive: 0xdc2626,
          emissiveIntensity: 0.95,
        })
      );
      liq.rotation.z = Math.PI / 2;
      liq.position.y = 0.095;
      group.add(liq);

      const metalMat = new THREE.MeshStandardMaterial({
        color: 0xe2e8f0,
        metalness: 0.92,
        roughness: 0.2,
      });
      const plunger = new THREE.Mesh(
        new THREE.CylinderGeometry(0.018, 0.018, 0.16, 8),
        metalMat
      );
      plunger.rotation.z = Math.PI / 2;
      plunger.position.set(-0.22, 0.095, 0);
      group.add(plunger);

      const thumbRest = new THREE.Mesh(
        new THREE.CylinderGeometry(0.055, 0.055, 0.018, 10),
        metalMat
      );
      thumbRest.rotation.z = Math.PI / 2;
      thumbRest.position.set(-0.29, 0.095, 0);
      group.add(thumbRest);

      const needle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.008, 0.012, 0.18, 8),
        metalMat
      );
      needle.rotation.z = Math.PI / 2;
      needle.position.set(0.24, 0.095, 0);
      group.add(needle);
      break;
    }

    case "expiredMed": {
      // 9. Bozuk İlaç Kutusu (Kehribar Hap Şişesi + Beyaz Kapak)
      const bot = new THREE.Mesh(
        new THREE.CylinderGeometry(0.14, 0.14, 0.31, 14),
        new THREE.MeshStandardMaterial({
          color: 0xf59e0b,
          emissive: 0xb45309,
          emissiveIntensity: 0.28,
          roughness: 0.28,
        })
      );
      bot.position.y = 0.155;
      bot.castShadow = true;
      group.add(bot);

      const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.15, 0.075, 14),
        new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.35 })
      );
      cap.position.y = 0.33;
      group.add(cap);
      break;
    }
  }

  group.scale.setScalar(1.28);
  return group;
}

// ============================================================================
// İKİ FARKLI 3D KARAKTER MODELİ:
// 1) SOVYET / ENDÜSTRİYEL GAZ MASKELİ SAVAŞÇI (GP-5 / Stalker Stili)
// 2) ÇATLAK PORSELEN MASKELİ YERALTI KRUPİYESİ
// ============================================================================

interface AvatarRig {
  root: THREE.Group;
  torsoGroup: THREE.Group;
  maskGroup: THREE.Group;
  leftHand: THREE.Group;
  rightHand: THREE.Group;
  cuffsGroup: THREE.Group;
  targetReticleGroup: THREE.Group;
  baseLeftHandPos: THREE.Vector3;
  baseRightHandPos: THREE.Vector3;
  gasMaskHeadGroup?: THREE.Group;
  porcelainHeadGroup?: THREE.Group;
}

function buildSovietGasMaskHead(): THREE.Group {
  const head = new THREE.Group();

  const rubberMat = new THREE.MeshStandardMaterial({
    color: 0x282f25,
    roughness: 0.58,
    metalness: 0.14,
  });
  const darkMetalMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    metalness: 0.88,
    roughness: 0.26,
  });
  const lensMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    emissive: 0x92400e,
    emissiveIntensity: 0.65,
    metalness: 0.9,
    roughness: 0.08,
  });
  const hoseMat = new THREE.MeshStandardMaterial({
    color: 0x111311,
    roughness: 0.78,
  });
  const filterCanMat = new THREE.MeshStandardMaterial({
    color: 0x364935,
    metalness: 0.68,
    roughness: 0.4,
  });

  const cranium = new THREE.Mesh(
    new THREE.SphereGeometry(0.62, 20, 18),
    rubberMat
  );
  cranium.scale.set(0.95, 1.12, 1.02);
  cranium.castShadow = true;
  head.add(cranium);

  const jawCone = new THREE.Mesh(
    new THREE.CylinderGeometry(0.46, 0.34, 0.55, 16),
    rubberMat
  );
  jawCone.position.set(0, -0.32, 0.12);
  head.add(jawCone);

  [-0.24, 0.24].forEach((lx, i) => {
    const eyeGroup = new THREE.Group();
    eyeGroup.position.set(lx, 0.12, 0.52);
    eyeGroup.rotation.y = i === 0 ? -0.18 : 0.18;
    eyeGroup.rotation.x = 0.08;

    const bezel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.185, 0.195, 0.12, 18),
      darkMetalMat
    );
    bezel.rotation.x = Math.PI / 2;
    eyeGroup.add(bezel);

    const rimRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.18, 0.024, 8, 20),
      darkMetalMat
    );
    rimRing.position.z = 0.06;
    eyeGroup.add(rimRing);

    const glass = new THREE.Mesh(
      new THREE.CylinderGeometry(0.165, 0.165, 0.03, 18),
      lensMat
    );
    glass.rotation.x = Math.PI / 2;
    glass.position.z = 0.055;
    eyeGroup.add(glass);

    head.add(eyeGroup);
  });

  const snout = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.22, 0.34, 16),
    darkMetalMat
  );
  snout.rotation.x = Math.PI / 2 + 0.32;
  snout.position.set(0, -0.26, 0.58);
  head.add(snout);

  for (let r = -1; r <= 1; r++) {
    const slot = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.025, 0.04),
      hoseMat
    );
    slot.position.set(0, -0.32 + r * 0.055, 0.74);
    head.add(slot);
  }

  const hoseCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -0.35, 0.68),
    new THREE.Vector3(0.12, -0.58, 0.66),
    new THREE.Vector3(0.32, -0.72, 0.45),
    new THREE.Vector3(0.45, -0.62, 0.18),
  ]);
  const hoseMesh = new THREE.Mesh(
    new THREE.TubeGeometry(hoseCurve, 18, 0.075, 10, false),
    hoseMat
  );
  hoseMesh.castShadow = true;
  head.add(hoseMesh);

  const filterCan = new THREE.Mesh(
    new THREE.CylinderGeometry(0.19, 0.19, 0.48, 16),
    filterCanMat
  );
  filterCan.position.set(0.48, -0.65, 0.08);
  filterCan.rotation.z = -0.35;
  filterCan.castShadow = true;
  head.add(filterCan);

  const filterCap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.205, 0.205, 0.06, 16),
    darkMetalMat
  );
  filterCap.position.set(0.42, -0.45, 0.1);
  filterCap.rotation.z = -0.35;
  head.add(filterCap);

  return head;
}

function buildPorcelainNightmareHead(): THREE.Group {
  const head = new THREE.Group();
  const porcelainTex = createCrackedPorcelainTexture();

  const porcelainMat = new THREE.MeshStandardMaterial({
    map: porcelainTex,
    color: 0xe7e2d8,
    roughness: 0.32,
    metalness: 0.08,
  });
  const darkVoidMat = new THREE.MeshBasicMaterial({ color: 0x040303 });
  const eeriePupilMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });

  const faceDome = new THREE.Mesh(
    new THREE.SphereGeometry(0.6, 22, 20),
    porcelainMat
  );
  faceDome.scale.set(0.92, 1.18, 0.88);
  faceDome.castShadow = true;
  head.add(faceDome);

  [-0.32, 0.32].forEach((cx) => {
    const cheek = new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 14, 12),
      porcelainMat
    );
    cheek.scale.set(1.1, 0.75, 0.9);
    cheek.position.set(cx, -0.06, 0.34);
    head.add(cheek);
  });

  const nose = new THREE.Mesh(
    new THREE.ConeGeometry(0.11, 0.36, 10),
    porcelainMat
  );
  nose.position.set(0, 0.04, 0.54);
  nose.rotation.x = 0.22;
  head.add(nose);

  [-0.22, 0.22].forEach((ex) => {
    const socket = new THREE.Mesh(
      new THREE.SphereGeometry(0.145, 14, 12),
      darkVoidMat
    );
    socket.scale.set(1.15, 0.88, 0.6);
    socket.position.set(ex, 0.18, 0.45);
    head.add(socket);

    const pinLight = new THREE.Mesh(
      new THREE.SphereGeometry(0.028, 8, 8),
      eeriePupilMat
    );
    pinLight.position.set(ex, 0.18, 0.52);
    head.add(pinLight);
  });

  const grinCavity = new THREE.Mesh(
    new THREE.SphereGeometry(0.34, 16, 12),
    darkVoidMat
  );
  grinCavity.scale.set(1.15, 0.52, 0.55);
  grinCavity.position.set(0, -0.32, 0.38);
  head.add(grinCavity);

  const toothMat = new THREE.MeshStandardMaterial({
    color: 0xfef3c7,
    roughness: 0.35,
  });
  for (let t = -4; t <= 4; t++) {
    const angle = t * 0.11;
    const tx = Math.sin(angle) * 0.52;
    const tz = 0.44 + Math.cos(angle) * 0.08;

    const upperTooth = new THREE.Mesh(
      new THREE.ConeGeometry(0.032, 0.11, 8),
      toothMat
    );
    upperTooth.rotation.x = Math.PI;
    upperTooth.position.set(tx, -0.24, tz);
    head.add(upperTooth);

    const lowerTooth = new THREE.Mesh(
      new THREE.ConeGeometry(0.028, 0.095, 8),
      toothMat
    );
    lowerTooth.position.set(tx, -0.39, tz);
    head.add(lowerTooth);
  }

  return head;
}

function buildDetailedHand(
  side: -1 | 1,
  style: "tactical_leather" | "bandaged_dealer"
): THREE.Group {
  const hGroup = new THREE.Group();
  const bandageTex = style === "bandaged_dealer" ? createBandageTexture() : null;

  const mainMat = new THREE.MeshStandardMaterial({
    map: bandageTex,
    color: style === "tactical_leather" ? 0x18181b : 0xd6cfc2,
    roughness: style === "tactical_leather" ? 0.55 : 0.82,
    metalness: style === "tactical_leather" ? 0.25 : 0.05,
  });

  const accentMat = new THREE.MeshStandardMaterial({
    color: style === "tactical_leather" ? 0x27272a : 0x78716c,
    roughness: 0.6,
    metalness: 0.3,
  });

  const palm = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 14, 12),
    mainMat
  );
  palm.scale.set(0.95, 0.45, 1.15);
  palm.castShadow = true;
  hGroup.add(palm);

  const knuckleGuard = new THREE.Mesh(
    new THREE.BoxGeometry(0.38, 0.06, 0.12),
    accentMat
  );
  knuckleGuard.position.set(0, 0.08, 0.16);
  hGroup.add(knuckleGuard);

  const wrist = new THREE.Mesh(
    new THREE.CylinderGeometry(0.17, 0.2, 0.34, 12),
    accentMat
  );
  wrist.rotation.x = Math.PI / 2;
  wrist.position.set(0, 0.02, -0.32);
  hGroup.add(wrist);

  for (let f = 0; f < 4; f++) {
    const fingerGroup = new THREE.Group();
    fingerGroup.position.set(-0.15 + f * 0.1, -0.01, 0.22);
    fingerGroup.rotation.x = 0.32;

    const seg1 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.038, 0.042, 0.18, 10),
      mainMat
    );
    seg1.rotation.x = Math.PI / 2;
    seg1.position.z = 0.09;
    fingerGroup.add(seg1);

    const seg2 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.032, 0.038, 0.14, 10),
      mainMat
    );
    seg2.rotation.x = Math.PI / 2 + 0.28;
    seg2.position.set(0, -0.03, 0.22);
    fingerGroup.add(seg2);

    hGroup.add(fingerGroup);
  }

  const thumb = new THREE.Mesh(
    new THREE.CylinderGeometry(0.042, 0.048, 0.24, 10),
    mainMat
  );
  thumb.rotation.x = Math.PI / 2;
  thumb.rotation.y = side * -0.48;
  thumb.position.set(side * -0.22, -0.02, 0.1);
  hGroup.add(thumb);

  return hGroup;
}

function createAvatarRig(isP1AtPlusZ: boolean, layerIndex: 1 | 2): AvatarRig {
  const root = new THREE.Group();
  const zSign = isP1AtPlusZ ? 1 : -1;
  root.position.set(0, 0, zSign * 4.18);
  if (isP1AtPlusZ) {
    root.rotation.y = Math.PI;
  }

  const isGasMaskDefault = !isP1AtPlusZ;

  const torsoGroup = new THREE.Group();
  torsoGroup.position.set(0, 1.85, -0.15);

  const coatMat = new THREE.MeshStandardMaterial({
    color: isGasMaskDefault ? 0x161a14 : 0x141210,
    roughness: 0.84,
    metalness: 0.12,
  });
  const collarMat = new THREE.MeshStandardMaterial({
    color: isGasMaskDefault ? 0x232a20 : 0x221e1c,
    roughness: 0.76,
  });

  const chest = new THREE.Mesh(
    new THREE.CylinderGeometry(0.72, 0.88, 1.65, 16),
    coatMat
  );
  chest.scale.set(1.25, 1, 0.68);
  chest.castShadow = true;
  torsoGroup.add(chest);

  const collar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.48, 0.58, 0.42, 16, 1, true),
    collarMat
  );
  collar.position.set(0, 0.78, 0.05);
  torsoGroup.add(collar);

  root.add(torsoGroup);

  const maskGroup = new THREE.Group();
  maskGroup.position.set(0, 2.98, 0.08);

  let gasMaskHeadGroup: THREE.Group | undefined;
  let porcelainHeadGroup: THREE.Group | undefined;

  if (!isP1AtPlusZ) {
    gasMaskHeadGroup = buildSovietGasMaskHead();
    porcelainHeadGroup = buildPorcelainNightmareHead();
    porcelainHeadGroup.visible = false;
    maskGroup.add(gasMaskHeadGroup, porcelainHeadGroup);
  } else {
    porcelainHeadGroup = buildPorcelainNightmareHead();
    maskGroup.add(porcelainHeadGroup);
  }

  root.add(maskGroup);

  const handStyle = isGasMaskDefault ? "tactical_leather" : "bandaged_dealer";
  const leftHand = buildDetailedHand(-1, handStyle);
  const rightHand = buildDetailedHand(1, handStyle);
  const baseLeftHandPos = new THREE.Vector3(-1.02, 1.34, 1.18);
  const baseRightHandPos = new THREE.Vector3(1.02, 1.34, 1.18);
  leftHand.position.copy(baseLeftHandPos);
  rightHand.position.copy(baseRightHandPos);
  root.add(leftHand, rightHand);

  const cuffsGroup = new THREE.Group();
  const steelMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    metalness: 0.9,
    roughness: 0.2,
  });
  const ringGeo = new THREE.TorusGeometry(0.24, 0.04, 8, 18);
  const lRing = new THREE.Mesh(ringGeo, steelMat);
  lRing.position.set(-1.02, 1.36, 0.95);
  const rRing = new THREE.Mesh(ringGeo, steelMat);
  rRing.position.set(1.02, 1.36, 0.95);
  const chainBar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.025, 2.04, 8),
    steelMat
  );
  chainBar.rotation.z = Math.PI / 2;
  chainBar.position.set(0, 1.36, 0.95);
  cuffsGroup.add(lRing, rRing, chainBar);
  cuffsGroup.visible = false;
  root.add(cuffsGroup);

  const targetReticleGroup = new THREE.Group();
  targetReticleGroup.position.set(0, 2.55, 0.65);

  const redRingMat = new THREE.MeshBasicMaterial({
    color: 0xef4444,
    transparent: true,
    opacity: 0.88,
  });
  const outerRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.72, 0.032, 8, 28),
    redRingMat
  );
  targetReticleGroup.add(outerRing);

  const innerRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.42, 0.02, 8, 24),
    redRingMat
  );
  targetReticleGroup.add(innerRing);

  const badgeTex = createTargetBadgeTexture(
    "🎯 RAKİBE DOĞRULT & SIK",
    "MASKEYE DOKUN = ATEŞLE",
    true
  );
  const badgeMat = new THREE.MeshBasicMaterial({
    map: badgeTex,
    transparent: true,
    depthTest: false,
  });
  const badgePlane = new THREE.Mesh(
    new THREE.PlaneGeometry(1.85, 0.46),
    badgeMat
  );
  badgePlane.position.set(0, -0.92, 0.15);
  badgePlane.renderOrder = 10;
  targetReticleGroup.add(badgePlane);

  targetReticleGroup.visible = false;
  root.add(targetReticleGroup);

  const opponentHitBox = new THREE.Mesh(
    new THREE.BoxGeometry(2.3, 2.7, 1.8),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  opponentHitBox.position.set(0, 2.45, 0.35);
  opponentHitBox.userData = { hitType: "target_opponent" };
  root.add(opponentHitBox);

  root.traverse((obj) => {
    obj.layers.set(layerIndex);
    if (!obj.userData?.hitType) {
      obj.userData = { hitType: "target_opponent" };
    }
  });

  return {
    root,
    torsoGroup,
    maskGroup,
    leftHand,
    rightHand,
    cuffsGroup,
    targetReticleGroup,
    baseLeftHandPos,
    baseRightHandPos,
    gasMaskHeadGroup,
    porcelainHeadGroup,
  };
}

// ============================================================================
// ANA 3D MOTOR SINIFI (Buckshot3DEngine)
// ============================================================================

export class Buckshot3DEngine {
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer | null = null;
  public initError: string | null = null;
  private scene: THREE.Scene;
  private camP1: THREE.PerspectiveCamera;
  private camP2: THREE.PerspectiveCamera;
  private raycaster: THREE.Raycaster;

  private animFrameId: number | null = null;
  private clock: THREE.Clock;
  private disposed: boolean = false;

  // Sahne ve Pompalı Tüfek Referansları
  private shotgunGroup: THREE.Group;
  private shotgunPumpGroup!: THREE.Group;
  private frontBarrelGroup!: THREE.Group;
  private cutBarrelRingMesh!: THREE.Mesh;
  private boltCarrierMesh!: THREE.Mesh;
  private chamberShellMesh!: THREE.Mesh;
  private chamberShellMat!: THREE.MeshStandardMaterial;

  // Sinematik Işıklandırma, God-Rays ve Uçuşan Tozlar
  private mainSpot!: THREE.SpotLight;
  private fillLight1!: THREE.PointLight;
  private fillLight2!: THREE.PointLight;
  private muzzleLight!: THREE.PointLight;
  private dustPoints!: THREE.Points;
  private warningLedMeshes: THREE.Mesh[] = [];

  private severedBarrelOnTable: THREE.Group;
  private fallingBarrelPiece: FallingBarrelPiece | null = null;
  private sawingHandsawMesh: THREE.Group | null = null;
  private sawingTimer: number = 0;
  private inspectingChamberTimer: number = 0;

  private shellTrayGroup: THREE.Group;
  private p1Leds: THREE.Mesh[] = [];
  private p2Leds: THREE.Mesh[] = [];
  private cutWireSparkMesh!: THREE.Mesh;

  private avatarP1: AvatarRig;
  private avatarP2: AvatarRig;

  private selfTargetP1!: THREE.Group;
  private selfTargetP2!: THREE.Group;
  private tableCancelHitBox!: THREE.Mesh;

  private p1SlotPositions: THREE.Vector3[] = [];
  private p2SlotPositions: THREE.Vector3[] = [];
  private p1ItemMeshes: (THREE.Group | null)[] = Array(8).fill(null);
  private p2ItemMeshes: (THREE.Group | null)[] = Array(8).fill(null);
  private p1GlowPads: THREE.Mesh[] = [];
  private p2GlowPads: THREE.Mesh[] = [];
  private interactiveTargets: THREE.Object3D[] = [];

  private ejectedShells: Ejected3DShell[] = [];
  private sparks: SparkParticle[] = [];
  private activeItemAnim: ActiveItemAnim | null = null;

  private cam1Shake: number = 0;
  private cam2Shake: number = 0;
  private cam1Knockback: number = 0;
  private cam2Knockback: number = 0;
  private avatar1HitRecoil: number = 0;
  private avatar2HitRecoil: number = 0;
  private pumpOffsetZ: number = 0;
  private muzzleFlashTimer: number = 0;

  private currentState: Buckshot3DStateSnapshot = {
    mode: "solo",
    turn: 1,
    maxHp: 2,
    p1Hp: 2,
    p2Hp: 2,
    wiresCutSuddenDeath: false,
    isSawedOff: false,
    p1Items: [],
    p2Items: [],
    p1Cuffed: false,
    p2Cuffed: false,
    revealShells: null,
    gunAim: "neutral",
    gunPickedUpBy: null,
    adrenalineStealSeat: null,
    currentChamberShell: null,
  };

  private lastItemsHashP1: string = "";
  private lastItemsHashP2: string = "";
  private lastRevealHash: string = "";
  private lastTurnAndStealHash: string = "";

  constructor(container: HTMLElement) {
    this.canvas = document.createElement("canvas");
    this.canvas.className = "w-full h-full block";
    this.canvas.style.imageRendering = "pixelated";
    container.appendChild(this.canvas);

    this.clock = new THREE.Clock();
    this.raycaster = new THREE.Raycaster();

    this.scene = new THREE.Scene();
    // 1. Yoğun Karanlık Üstel Sis (Duvar köşeleri ve tavan derinlikleri zifiri karanlıkta kaybolur)
    this.scene.fog = new THREE.FogExp2(0x050304, 0.095);

    this.camP1 = new THREE.PerspectiveCamera(74, 1, 0.1, 45);
    this.camP1.layers.enable(0);
    this.camP1.layers.enable(1);

    this.camP2 = new THREE.PerspectiveCamera(74, 1, 0.1, 45);
    this.camP2.layers.enable(0);
    this.camP2.layers.enable(2);

    // 2. Kısılmış Ortam Işığı + Ana Tungsten Spot + Kontur (Rim) Işıkları
    this.setupCinematicLighting();

    // 3. Oda, Masa, Her İki Cephede Zengin Endüstriyel Dekor, God-Rays ve Uçuşan Tozlar
    this.initSlotCoordinates();
    this.buildUndergroundRoom();
    this.buildVolumetricGodRaysAndDust();

    this.shotgunGroup = this.build3DShotgun();
    this.scene.add(this.shotgunGroup);

    this.severedBarrelOnTable = this.buildSeveredBarrelPiece();
    this.severedBarrelOnTable.position.set(0.68, 0.99, 0.36);
    this.severedBarrelOnTable.rotation.y = 0.48;
    this.severedBarrelOnTable.visible = false;
    this.scene.add(this.severedBarrelOnTable);

    this.shellTrayGroup = new THREE.Group();
    this.shellTrayGroup.position.set(-2.32, 0.98, 0);
    this.scene.add(this.shellTrayGroup);

    this.avatarP2 = createAvatarRig(false, 1);
    this.avatarP1 = createAvatarRig(true, 2);
    this.scene.add(this.avatarP2.root);
    this.scene.add(this.avatarP1.root);

    this.selfTargetP1 = this.buildSelfTargetReticle(1);
    this.selfTargetP2 = this.buildSelfTargetReticle(2);
    this.scene.add(this.selfTargetP1);
    this.scene.add(this.selfTargetP2);

    // Güvenli WebGL Başlatma + PCFSoftShadowMap + ACESFilmicToneMapping
    try {
      const gl = (this.canvas.getContext("webgl2", { antialias: false }) ||
        this.canvas.getContext("webgl", { antialias: false })) as
        | WebGLRenderingContext
        | WebGL2RenderingContext
        | null;

      if (!gl || gl.isContextLost()) {
        throw new Error(
          "WebGL grafik bağlamı (context) oluşturulamadı veya kayboldu."
        );
      }

      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        context: gl as WebGLRenderingContext,
        antialias: false,
        powerPreference: "default",
      });
      this.renderer.setPixelRatio(
        Math.min(
          typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
          1.35
        )
      );
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 0.92;
      this.renderer.setClearColor(0x050304, 1);
    } catch (err) {
      this.initError =
        err instanceof Error
          ? err.message
          : "WebGL 3D motoru başlatılırken beklenmeyen bir hata oluştu.";
      this.disposed = true;
      return;
    }

    this.resize();
    this.animate();
  }

  private setupCinematicLighting(): void {
    // Düşük ortam ışığı (Sahnenin düz ve aydınlık görünmesini engeller)
    const ambient = new THREE.AmbientLight(0x120a08, 0.14);
    this.scene.add(ambient);

    // Masanın tam tepesinden sarkan ana tungsten SpotLight (1024x1024 PCFSoftShadowMap)
    this.mainSpot = new THREE.SpotLight(
      0xffb469,
      46,
      14,
      Math.PI / 2.25,
      0.82,
      1.9
    );
    this.mainSpot.position.set(0, 5.15, 0);
    this.mainSpot.castShadow = true;
    this.mainSpot.shadow.mapSize.set(1024, 1024);
    this.mainSpot.shadow.camera.near = 1.2;
    this.mainSpot.shadow.camera.far = 10;
    this.mainSpot.shadow.bias = -0.0005;
    this.scene.add(this.mainSpot);
    this.scene.add(this.mainSpot.target);

    // Masadaki 3D eşya yuvalarını aydınlatan kısa menzilli sıcak dolgu ışıkları (Duvarlara ulaşmaz!)
    this.fillLight1 = new THREE.PointLight(0xffa94d, 4.2, 5.2, 2.0);
    this.fillLight1.position.set(0, 2.45, 1.55);
    this.scene.add(this.fillLight1);

    this.fillLight2 = new THREE.PointLight(0xffa94d, 4.2, 5.2, 2.0);
    this.fillLight2.position.set(0, 2.45, -1.55);
    this.scene.add(this.fillLight2);

    // Karakterlerin Gaz Maskesi / Porselen Maskesi ve omuzlarına düşen soğuk-kızıl Kontur Işıkları (Rim Lights)
    // (Menzili 4.5 birim olduğu için arka duvara patlamaz, karakterleri karanlığın içinden çıkarır!)
    const rimConfigs = [
      { pos: new THREE.Vector3(-1.85, 3.85, -3.55), col: 0xff5a36, int: 11 },
      { pos: new THREE.Vector3(1.85, 3.85, -3.55), col: 0x60a5fa, int: 9 },
      { pos: new THREE.Vector3(-1.85, 3.85, 3.55), col: 0x60a5fa, int: 9 },
      { pos: new THREE.Vector3(1.85, 3.85, 3.55), col: 0xff5a36, int: 11 },
    ];
    rimConfigs.forEach((rc) => {
      const rl = new THREE.PointLight(rc.col, rc.int, 4.4, 2.1);
      rl.position.copy(rc.pos);
      this.scene.add(rl);
    });

    this.muzzleLight = new THREE.PointLight(0xff7700, 0, 12);
    this.muzzleLight.position.set(0, 1.4, 0);
    this.scene.add(this.muzzleLight);
  }

  private buildVolumetricGodRaysAndDust(): void {
    // 1. Tavan Lambasından ve 4 Sahne Spotundan İnen Hacimsel Işık Hüzmeleri (God-Rays)
    const rayMat = new THREE.MeshBasicMaterial({
      color: 0xffbe76,
      transparent: true,
      opacity: 0.045,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const centerCone = new THREE.Mesh(
      new THREE.ConeGeometry(3.35, 4.3, 24, 1, true),
      rayMat
    );
    centerCone.position.set(0, 3.05, 0);
    centerCone.matrixAutoUpdate = false;
    centerCone.updateMatrix();
    this.scene.add(centerCone);

    const sideRayMat = new THREE.MeshBasicMaterial({
      color: 0xff8a4c,
      transparent: true,
      opacity: 0.032,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const spotPositions = [
      new THREE.Vector3(-2.35, 4.5, -3.2),
      new THREE.Vector3(2.35, 4.5, -3.2),
      new THREE.Vector3(-2.35, 4.5, 3.2),
      new THREE.Vector3(2.35, 4.5, 3.2),
    ];
    spotPositions.forEach((sp) => {
      const beam = new THREE.Mesh(
        new THREE.ConeGeometry(1.15, 3.1, 14, 1, true),
        sideRayMat
      );
      beam.position.set(sp.x * 0.72, 3.25, sp.z * 0.88);
      beam.rotation.z = sp.x < 0 ? -0.35 : 0.35;
      beam.matrixAutoUpdate = false;
      beam.updateMatrix();
      this.scene.add(beam);
    });

    // 2. Işığın İçinde Yavaşça Süzülen 60 Adet Mikro Toz Zerreciği (THREE.Points)
    const dustCount = 60;
    const positions = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 6.2;
      positions[i * 3 + 1] = 1.15 + Math.random() * 3.8;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 6.2;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const dustMat = new THREE.PointsMaterial({
      color: 0xffdfa8,
      size: 0.045,
      transparent: true,
      opacity: 0.48,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.dustPoints = new THREE.Points(dustGeo, dustMat);
    this.scene.add(this.dustPoints);
  }

  private initSlotCoordinates(): void {
    const p1Rows = [1.4, 2.2];
    const colsLeft = [-1.72, -0.94];
    const colsRight = [0.94, 1.72];

    this.p1SlotPositions = [
      new THREE.Vector3(colsLeft[0], 0.96, p1Rows[0]),
      new THREE.Vector3(colsLeft[1], 0.96, p1Rows[0]),
      new THREE.Vector3(colsLeft[0], 0.96, p1Rows[1]),
      new THREE.Vector3(colsLeft[1], 0.96, p1Rows[1]),
      new THREE.Vector3(colsRight[0], 0.96, p1Rows[0]),
      new THREE.Vector3(colsRight[1], 0.96, p1Rows[0]),
      new THREE.Vector3(colsRight[0], 0.96, p1Rows[1]),
      new THREE.Vector3(colsRight[1], 0.96, p1Rows[1]),
    ];

    const p2Rows = [-1.4, -2.2];
    this.p2SlotPositions = [
      new THREE.Vector3(colsLeft[0], 0.96, p2Rows[0]),
      new THREE.Vector3(colsLeft[1], 0.96, p2Rows[0]),
      new THREE.Vector3(colsLeft[0], 0.96, p2Rows[1]),
      new THREE.Vector3(colsLeft[1], 0.96, p2Rows[1]),
      new THREE.Vector3(colsRight[0], 0.96, p2Rows[0]),
      new THREE.Vector3(colsRight[1], 0.96, p2Rows[0]),
      new THREE.Vector3(colsRight[0], 0.96, p2Rows[1]),
      new THREE.Vector3(colsRight[1], 0.96, p2Rows[1]),
    ];
  }

  private buildSelfTargetReticle(ownerSeat: 1 | 2): THREE.Group {
    const group = new THREE.Group();
    const zSign = ownerSeat === 1 ? 1 : -1;
    group.position.set(0, 1.24, zSign * 2.58);
    if (ownerSeat === 2) {
      group.rotation.y = Math.PI;
    }

    const cyanMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
    });

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.28, 0.35, 24),
      cyanMat
    );
    ring.rotation.x = -Math.PI / 3;
    group.add(ring);

    const badgeTex = createTargetBadgeTexture(
      "🛡️ KENDİNE DOĞRULT & SIK",
      "BOŞSA SIRA SENDE KALIR",
      false
    );
    const badgeMat = new THREE.MeshBasicMaterial({
      map: badgeTex,
      transparent: true,
      depthTest: false,
    });
    const badge = new THREE.Mesh(
      new THREE.PlaneGeometry(1.75, 0.44),
      badgeMat
    );
    badge.position.set(0, 0.24, 0);
    badge.rotation.x = -0.35;
    badge.renderOrder = 12;
    group.add(badge);

    const hitBox = new THREE.Mesh(
      new THREE.BoxGeometry(1.9, 0.9, 1.05),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    hitBox.position.set(0, 0.15, 0);
    hitBox.userData = { hitType: "target_self" };
    group.add(hitBox);

    const layerIdx = ownerSeat === 1 ? 1 : 2;
    group.traverse((obj) => {
      obj.layers.set(layerIdx);
      obj.userData = { hitType: "target_self" };
    });

    group.visible = false;
    return group;
  }

  // ============================================================================
  // ZENGİN ENDÜSTRİYEL YERALTI ODASI (HER İKİ KAMERA YÖNÜ İÇİN DOLU ARKA PLAN)
  // ============================================================================
  private buildUndergroundRoom(): void {
    const feltTex = createFeltTableTextures();
    const brickTex = createGrungeBrickTextures();
    const rustTex = createRustyMetalTextures();

    // Ortak (Shared) Materyaller
    const rustMetalMat = new THREE.MeshStandardMaterial({
      map: rustTex.map,
      bumpMap: rustTex.bumpMap,
      bumpScale: 0.035,
      metalness: 0.75,
      roughness: 0.52,
    });
    const darkIronMat = new THREE.MeshStandardMaterial({
      color: 0x16181b,
      bumpMap: rustTex.bumpMap,
      bumpScale: 0.025,
      metalness: 0.82,
      roughness: 0.46,
    });
    const pipeRustMat = new THREE.MeshStandardMaterial({
      color: 0x3b2316,
      bumpMap: rustTex.bumpMap,
      bumpScale: 0.04,
      metalness: 0.68,
      roughness: 0.58,
    });
    const cableRubberMat = new THREE.MeshStandardMaterial({
      color: 0x09090b,
      roughness: 0.72,
    });

    // 1. MASA ÜSTÜ (Kabartmalı Kirli Yeşil Çuha + Perçinli Ağır Demir Çerçeve)
    const tableGeo = new THREE.BoxGeometry(6.2, 0.16, 6.2);
    const feltSurfaceMat = new THREE.MeshStandardMaterial({
      map: feltTex.map,
      bumpMap: feltTex.bumpMap,
      bumpScale: 0.025,
      roughnessMap: feltTex.roughnessMap,
      roughness: 0.88,
      metalness: 0.05,
    });
    const tableMaterials = [
      rustMetalMat,
      rustMetalMat,
      feltSurfaceMat,
      rustMetalMat,
      rustMetalMat,
      rustMetalMat,
    ];
    const tableMesh = new THREE.Mesh(tableGeo, tableMaterials);
    tableMesh.position.set(0, 0.88, 0);
    tableMesh.receiveShadow = true;
    tableMesh.userData = { hitType: "table_cancel" };
    tableMesh.matrixAutoUpdate = false;
    tableMesh.updateMatrix();
    this.tableCancelHitBox = tableMesh;
    this.scene.add(tableMesh);

    // Sabit arka plan objelerini tek grupta topla ve matrixAutoUpdate = false ile FPS koru
    const staticDecor = new THREE.Group();

    // Masa Kenar Demir Bordürleri ve Metal Perçinler (Rivets)
    const rimFB = new THREE.BoxGeometry(6.48, 0.24, 0.2);
    const rimNorth = new THREE.Mesh(rimFB, rustMetalMat);
    rimNorth.position.set(0, 0.91, -3.16);
    const rimSouth = new THREE.Mesh(rimFB, rustMetalMat);
    rimSouth.position.set(0, 0.91, 3.16);

    const rimLR = new THREE.BoxGeometry(0.2, 0.24, 6.48);
    const rimWest = new THREE.Mesh(rimLR, rustMetalMat);
    rimWest.position.set(-3.16, 0.91, 0);
    const rimEast = new THREE.Mesh(rimLR, rustMetalMat);
    rimEast.position.set(3.16, 0.91, 0);
    staticDecor.add(rimNorth, rimSouth, rimWest, rimEast);

    const rivetGeo = new THREE.CylinderGeometry(0.028, 0.028, 0.03, 8);
    for (let r = -2.8; r <= 2.8; r += 0.7) {
      [-3.16, 3.16].forEach((rz) => {
        const rv = new THREE.Mesh(rivetGeo, darkIronMat);
        rv.position.set(r, 1.035, rz);
        staticDecor.add(rv);
      });
      [-3.16, 3.16].forEach((rx) => {
        const rv = new THREE.Mesh(rivetGeo, darkIronMat);
        rv.position.set(rx, 1.035, r);
        staticDecor.add(rv);
      });
    }

    // 2. KABARTMALI KİRLİ TUĞLA DUVARLAR VE ZEMİN (bumpScale: 0.06)
    const roomGeo = new THREE.BoxGeometry(15.6, 8.8, 15.6);
    const roomMat = new THREE.MeshStandardMaterial({
      map: brickTex.map,
      bumpMap: brickTex.bumpMap,
      bumpScale: 0.06,
      roughnessMap: brickTex.roughnessMap,
      roughness: 0.92,
      side: THREE.BackSide,
    });
    const roomMesh = new THREE.Mesh(roomGeo, roomMat);
    roomMesh.position.set(0, 3.8, 0);
    staticDecor.add(roomMesh);

    // 3. TAVAN ÇELİK I-KİRİŞLER, OLUKLU SAC PANELLER VE SARKAN ANA TUNGSTEN LAMBA
    for (let z = -6; z <= 6; z += 3) {
      const iBeamWeb = new THREE.Mesh(
        new THREE.BoxGeometry(15.2, 0.34, 0.14),
        darkIronMat
      );
      iBeamWeb.position.set(0, 6.25, z);
      const iBeamFlange = new THREE.Mesh(
        new THREE.BoxGeometry(15.2, 0.06, 0.36),
        rustMetalMat
      );
      iBeamFlange.position.set(0, 6.08, z);
      staticDecor.add(iBeamWeb, iBeamFlange);
    }

    // Merkez tungsten tavan lambası şapkası
    const centerHood = new THREE.Mesh(
      new THREE.ConeGeometry(0.55, 0.48, 14, 1, true),
      darkIronMat
    );
    centerHood.position.set(0, 5.28, 0);
    const centerBulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xffe4b5 })
    );
    centerBulb.position.set(0, 5.12, 0);
    staticDecor.add(centerHood, centerBulb);

    // 4. 4 KAPAKLI BÜYÜK SAHNE SPOTLARI (BARN-DOOR STAGE SPOTLIGHTS — Her iki cephede 2'şer adet!)
    const buildBarnDoorSpotlight = (
      pos: THREE.Vector3,
      lookTarget: THREE.Vector3
    ): THREE.Group => {
      const spotGroup = new THREE.Group();
      spotGroup.position.copy(pos);
      spotGroup.lookAt(lookTarget);

      // Tavan çelik askı çubuğu ve U-kelepçe
      const yoke = new THREE.Mesh(
        new THREE.BoxGeometry(0.56, 0.42, 0.08),
        darkIronMat
      );
      yoke.position.set(0, 0.22, -0.1);
      spotGroup.add(yoke);

      // Silindirik soğutma kanallı metal gövde
      const housing = new THREE.Mesh(
        new THREE.CylinderGeometry(0.24, 0.28, 0.68, 14),
        darkIronMat
      );
      housing.rotation.x = Math.PI / 2;
      spotGroup.add(housing);

      // Soğutma halkaları (Cooling fins)
      for (let f = -0.2; f <= 0.2; f += 0.1) {
        const fin = new THREE.Mesh(
          new THREE.TorusGeometry(0.26, 0.018, 6, 14),
          rustMetalMat
        );
        fin.position.z = f;
        spotGroup.add(fin);
      }

      // Buğulu cam mercek
      const lens = new THREE.Mesh(
        new THREE.CircleGeometry(0.22, 14),
        new THREE.MeshBasicMaterial({ color: 0xffcc88 })
      );
      lens.position.z = 0.345;
      spotGroup.add(lens);

      // 4 Adet Açık Açılı Siyah Metal Işık Kapağı (Barn-Doors)
      const flapGeo = new THREE.BoxGeometry(0.36, 0.02, 0.26);
      const topFlap = new THREE.Mesh(flapGeo, darkIronMat);
      topFlap.position.set(0, 0.25, 0.44);
      topFlap.rotation.x = -0.45;

      const botFlap = new THREE.Mesh(flapGeo, darkIronMat);
      botFlap.position.set(0, -0.25, 0.44);
      botFlap.rotation.x = 0.45;

      const leftFlap = new THREE.Mesh(flapGeo, darkIronMat);
      leftFlap.rotation.z = Math.PI / 2;
      leftFlap.position.set(-0.25, 0, 0.44);
      leftFlap.rotation.y = 0.45;

      const rightFlap = new THREE.Mesh(flapGeo, darkIronMat);
      rightFlap.rotation.z = Math.PI / 2;
      rightFlap.position.set(0.25, 0, 0.44);
      rightFlap.rotation.y = -0.45;

      spotGroup.add(topFlap, botFlap, leftFlap, rightFlap);
      return spotGroup;
    };

    // Kuzey (-Z) ve Güney (+Z) cephelerindeki 4 sahne spotu
    staticDecor.add(
      buildBarnDoorSpotlight(
        new THREE.Vector3(-2.35, 4.85, -3.25),
        new THREE.Vector3(0, 2.2, -3.9)
      ),
      buildBarnDoorSpotlight(
        new THREE.Vector3(2.35, 4.85, -3.25),
        new THREE.Vector3(0, 2.2, -3.9)
      ),
      buildBarnDoorSpotlight(
        new THREE.Vector3(-2.35, 4.85, 3.25),
        new THREE.Vector3(0, 2.2, 3.9)
      ),
      buildBarnDoorSpotlight(
        new THREE.Vector3(2.35, 4.85, 3.25),
        new THREE.Vector3(0, 2.2, 3.9)
      )
    );

    // 5. TAVANDAN VE SPOTLARDAN SARKAN 12 ADET KALIN SİYAH ELEKTRİK KABLOSU (CatmullRomCurve3 + TubeGeometry)
    const cableCurves: THREE.Vector3[][] = [
      [
        new THREE.Vector3(0, 6.25, 0),
        new THREE.Vector3(0.18, 5.7, 0.12),
        new THREE.Vector3(0, 5.28, 0),
      ],
      [
        new THREE.Vector3(-2.35, 6.2, -3.25),
        new THREE.Vector3(-2.7, 5.2, -3.5),
        new THREE.Vector3(-2.35, 4.85, -3.25),
      ],
      [
        new THREE.Vector3(2.35, 6.2, -3.25),
        new THREE.Vector3(2.7, 5.2, -3.5),
        new THREE.Vector3(2.35, 4.85, -3.25),
      ],
      [
        new THREE.Vector3(-2.35, 6.2, 3.25),
        new THREE.Vector3(-2.7, 5.2, 3.5),
        new THREE.Vector3(-2.35, 4.85, 3.25),
      ],
      [
        new THREE.Vector3(2.35, 6.2, 3.25),
        new THREE.Vector3(2.7, 5.2, 3.5),
        new THREE.Vector3(2.35, 4.85, 3.25),
      ],
      [
        new THREE.Vector3(2.46, 6.2, 0.8),
        new THREE.Vector3(2.85, 3.6, 0.45),
        new THREE.Vector3(2.46, 1.85, 0),
      ],
      [
        new THREE.Vector3(-3.8, 6.2, -2.5),
        new THREE.Vector3(-4.2, 4.1, -4.2),
        new THREE.Vector3(-4.5, 2.4, -5.6),
      ],
      [
        new THREE.Vector3(3.8, 6.2, -2.5),
        new THREE.Vector3(4.2, 4.1, -4.2),
        new THREE.Vector3(4.5, 2.4, -5.6),
      ],
      [
        new THREE.Vector3(-3.8, 6.2, 2.5),
        new THREE.Vector3(-4.2, 4.1, 4.2),
        new THREE.Vector3(-4.5, 2.4, 5.6),
      ],
      [
        new THREE.Vector3(3.8, 6.2, 2.5),
        new THREE.Vector3(4.2, 4.1, 4.2),
        new THREE.Vector3(4.5, 2.4, 5.6),
      ],
      [
        new THREE.Vector3(-1.6, 6.2, -6.2),
        new THREE.Vector3(0, 4.85, -6.5),
        new THREE.Vector3(1.6, 6.2, -6.2),
      ],
      [
        new THREE.Vector3(-1.6, 6.2, 6.2),
        new THREE.Vector3(0, 4.85, 6.5),
        new THREE.Vector3(1.6, 6.2, 6.2),
      ],
    ];
    cableCurves.forEach((pts) => {
      const curve = new THREE.CatmullRomCurve3(pts);
      const cableMesh = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 14, 0.036, 6, false),
        cableRubberMat
      );
      staticDecor.add(cableMesh);
    });

    // 6. HER İKİ KAMERA YÖNÜ (-Z VE +Z CEPHESİ) İÇİN ZENGİN ENDÜSTRİYEL ODA DEKORU
    const buildEndWallSet = (zDir: -1 | 1) => {
      const wallGroup = new THREE.Group();
      if (zDir === 1) {
        wallGroup.rotation.y = Math.PI;
      }

      // A) SOL ARKA KÖŞE: Üst Üste Kabin Hoparlörler + Amfi Katı (VU-Metre LED + Düğmeler) + Metal Raf & Bant Makaraları
      const speakerCabinetMat = new THREE.MeshStandardMaterial({
        color: 0x161311,
        roughness: 0.85,
      });
      const speakerConeMat = new THREE.MeshStandardMaterial({
        color: 0x262220,
        roughness: 0.55,
      });

      // Alt büyük kabin
      const lowerCab = new THREE.Mesh(
        new THREE.BoxGeometry(1.45, 2.2, 1.15),
        speakerCabinetMat
      );
      lowerCab.position.set(-3.85, 1.1, -5.85);
      lowerCab.rotation.y = 0.28;
      wallGroup.add(lowerCab);

      // Çift yuvarlak woofer konisi
      [0.65, 1.55].forEach((wy) => {
        const wooferRing = new THREE.Mesh(
          new THREE.TorusGeometry(0.34, 0.04, 8, 16),
          darkIronMat
        );
        wooferRing.position.set(-3.68, wy, -5.28);
        wooferRing.rotation.y = 0.28;
        wallGroup.add(wooferRing);

        const cone = new THREE.Mesh(
          new THREE.CylinderGeometry(0.32, 0.12, 0.14, 14),
          speakerConeMat
        );
        cone.rotation.x = Math.PI / 2;
        cone.rotation.z = -0.28;
        cone.position.set(-3.7, wy, -5.32);
        wallGroup.add(cone);
      });

      // Üst Amfi Katı (VU-metre LED ışıkları ve çevirme düğmeleri)
      const ampHead = new THREE.Mesh(
        new THREE.BoxGeometry(1.32, 0.62, 0.95),
        darkIronMat
      );
      ampHead.position.set(-3.85, 2.52, -5.85);
      ampHead.rotation.y = 0.28;
      wallGroup.add(ampHead);

      const vuColors = [0x22c55e, 0x22c55e, 0xf59e0b, 0xef4444];
      vuColors.forEach((vc, idx) => {
        const vuLed = new THREE.Mesh(
          new THREE.BoxGeometry(0.09, 0.08, 0.04),
          new THREE.MeshBasicMaterial({ color: vc })
        );
        vuLed.position.set(-4.05 + idx * 0.14, 2.56, -5.36);
        wallGroup.add(vuLed);
      });

      // Metal Raf + Karton Kutular & Manyetik Bant Makaraları
      for (let sy = 0.8; sy <= 3.2; sy += 1.2) {
        const shelf = new THREE.Mesh(
          new THREE.BoxGeometry(1.5, 0.06, 0.75),
          rustMetalMat
        );
        shelf.position.set(-2.15, sy, -6.35);
        wallGroup.add(shelf);
      }
      [-2.85, -1.45].forEach((px) => {
        const post = new THREE.Mesh(
          new THREE.BoxGeometry(0.07, 3.6, 0.07),
          darkIronMat
        );
        post.position.set(px, 1.8, -6.02);
        wallGroup.add(post);
      });

      const boxMat = new THREE.MeshStandardMaterial({
        color: 0x5c4028,
        roughness: 0.88,
      });
      const carton1 = new THREE.Mesh(
        new THREE.BoxGeometry(0.58, 0.48, 0.52),
        boxMat
      );
      carton1.position.set(-2.35, 2.28, -6.32);
      carton1.rotation.y = 0.18;
      wallGroup.add(carton1);

      const tapeReel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.24, 0.24, 0.06, 14),
        rustMetalMat
      );
      tapeReel.rotation.x = Math.PI / 2;
      tapeReel.position.set(-1.75, 2.25, -6.25);
      wallGroup.add(tapeReel);

      // B) SAĞ ARKA KÖŞE: Endüstriyel Elektrik/Jeneratör Panosu + Kırmızı Basınçlı Gaz Tüpü + Eski Sandalye
      const panelBox = new THREE.Mesh(
        new THREE.BoxGeometry(1.35, 1.85, 0.42),
        rustMetalMat
      );
      panelBox.position.set(2.45, 2.45, -6.45);
      wallGroup.add(panelBox);

      // Analog İbreli Kadranlar
      [-0.3, 0.3].forEach((gx) => {
        const dial = new THREE.Mesh(
          new THREE.CylinderGeometry(0.18, 0.18, 0.05, 14),
          new THREE.MeshBasicMaterial({ color: 0xd6d3d1 })
        );
        dial.rotation.x = Math.PI / 2;
        dial.position.set(2.45 + gx, 2.85, -6.22);
        wallGroup.add(dial);
      });

      // Yanıp sönen kırmızı uyarı LED'i
      const warnLed = new THREE.Mesh(
        new THREE.SphereGeometry(0.075, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xef4444 })
      );
      warnLed.position.set(2.45, 3.22, -6.2);
      wallGroup.add(warnLed);
      this.warningLedMeshes.push(warnLed);

      // Vanalı Kırmızı Basınçlı Gaz Tüpü
      const gasTankMat = new THREE.MeshStandardMaterial({
        color: 0x991b1b,
        metalness: 0.55,
        roughness: 0.42,
      });
      const gasTank = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28, 0.28, 1.85, 14),
        gasTankMat
      );
      gasTank.position.set(3.65, 0.92, -5.85);
      wallGroup.add(gasTank);

      const gasDome = new THREE.Mesh(
        new THREE.SphereGeometry(0.28, 14, 10),
        gasTankMat
      );
      gasDome.position.set(3.65, 1.85, -5.85);
      wallGroup.add(gasDome);

      const valveWheel = new THREE.Mesh(
        new THREE.TorusGeometry(0.11, 0.02, 6, 12),
        rustMetalMat
      );
      valveWheel.rotation.x = Math.PI / 2;
      valveWheel.position.set(3.65, 2.22, -5.85);
      wallGroup.add(valveWheel);

      // Gölgede Duran Eski Metal/Ahşap Sandalye Silüeti
      const chairGroup = new THREE.Group();
      chairGroup.position.set(1.55, 0, -5.25);
      chairGroup.rotation.y = -0.42;
      const seatMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.68, 0.07, 0.68),
        boxMat
      );
      seatMesh.position.y = 0.78;
      const backMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.68, 0.85, 0.07),
        boxMat
      );
      backMesh.position.set(0, 1.22, -0.31);
      chairGroup.add(seatMesh, backMesh);
      wallGroup.add(chairGroup);

      // C) TUĞLA DUVARLAR BOYUNCA PASLI BUHAR BORULARI, HAVALANDIRMA IZGARASI VE ZİNCİRLER
      const hPipe1 = new THREE.Mesh(
        new THREE.CylinderGeometry(0.095, 0.095, 12.5, 10),
        pipeRustMat
      );
      hPipe1.rotation.z = Math.PI / 2;
      hPipe1.position.set(0, 4.35, -6.65);

      const hPipe2 = new THREE.Mesh(
        new THREE.CylinderGeometry(0.065, 0.065, 12.5, 10),
        rustMetalMat
      );
      hPipe2.rotation.z = Math.PI / 2;
      hPipe2.position.set(0, 3.95, -6.68);
      wallGroup.add(hPipe1, hPipe2);

      // Havalandırma Izgarası (Vent Grille)
      const ventFrame = new THREE.Mesh(
        new THREE.BoxGeometry(1.25, 0.75, 0.12),
        darkIronMat
      );
      ventFrame.position.set(-0.65, 3.35, -6.72);
      wallGroup.add(ventFrame);

      return wallGroup;
    };

    staticDecor.add(buildEndWallSet(-1));
    staticDecor.add(buildEndWallSet(1));

    // Yan duvarlarda (-X ve +X) boydan boya uzanan çelik borular
    [-6.8, 6.8].forEach((wx) => {
      const sidePipe = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.09, 14.5, 10),
        pipeRustMat
      );
      sidePipe.rotation.x = Math.PI / 2;
      sidePipe.position.set(wx, 3.65, 0);
      staticDecor.add(sidePipe);
    });

    // Tüm sabit dekor objelerinde matrixAutoUpdate = false uygulayarak akıllı tahtada 60 FPS hızı koru
    staticDecor.traverse((obj) => {
      const m = obj as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = false;
        m.receiveShadow = true;
      }
      obj.updateMatrix();
      obj.matrixAutoUpdate = false;
    });
    this.scene.add(staticDecor);

    // 7. MASANIN YANINDAKİ 3D DEFİBRİLATÖR & YÜKSEK GERİLİM ŞARJ ÜNİTESİ
    const monGroup = new THREE.Group();
    monGroup.position.set(2.46, 1.42, 0);

    const casing = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.94, 1.38),
      rustMetalMat
    );
    casing.castShadow = true;
    monGroup.add(casing);

    // Üst yüksek gerilim bakır bobinleri / izolatörleri ve metal şalterler
    const copperMat = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      metalness: 0.85,
      roughness: 0.25,
    });
    [-0.38, 0.38].forEach((cz) => {
      const coil = new THREE.Mesh(
        new THREE.CylinderGeometry(0.11, 0.13, 0.32, 12),
        copperMat
      );
      coil.position.set(0, 0.62, cz);
      monGroup.add(coil);

      const switchLever = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.04, 0.04),
        darkIronMat
      );
      switchLever.position.set(-0.32, 0.32, cz);
      switchLever.rotation.z = 0.4;
      monGroup.add(switchLever);
    });

    const screenPlane = new THREE.Mesh(
      new THREE.BoxGeometry(0.64, 0.74, 1.14),
      new THREE.MeshBasicMaterial({ color: 0x040806 })
    );
    monGroup.add(screenPlane);

    for (let i = 0; i < 5; i++) {
      const ledGeo = new THREE.BoxGeometry(0.68, 0.085, 0.4);
      const p1Mat = new THREE.MeshStandardMaterial({
        color: 0x22c55e,
        emissive: 0x22c55e,
        emissiveIntensity: 1.15,
      });
      const p1Led = new THREE.Mesh(ledGeo, p1Mat);
      p1Led.position.set(0, -0.24 + i * 0.12, 0.28);
      monGroup.add(p1Led);
      this.p1Leds.push(p1Led);

      const p2Mat = new THREE.MeshStandardMaterial({
        color: 0x22c55e,
        emissive: 0x22c55e,
        emissiveIntensity: 1.15,
      });
      const p2Led = new THREE.Mesh(ledGeo, p2Mat);
      p2Led.position.set(0, -0.24 + i * 0.12, -0.28);
      monGroup.add(p2Led);
      this.p2Leds.push(p2Led);
    }

    this.cutWireSparkMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xef4444 })
    );
    this.cutWireSparkMesh.position.set(0, 0.58, 0);
    this.cutWireSparkMesh.visible = false;
    monGroup.add(this.cutWireSparkMesh);

    this.scene.add(monGroup);
  }

  // ============================================================================
  // YÜKSEK DETAYLI 3D POMPALI TÜFEK (REMINGTON 870 / MOSSBERG STİLİ + BUMPMAP)
  // ============================================================================
  private build3DShotgun(): THREE.Group {
    const gun = new THREE.Group();
    gun.position.set(0, 1.07, 0);

    const walnutTex = createWalnutWoodTextures();
    const steelTex = createBrushedSteelTexture();

    const woodMat = new THREE.MeshStandardMaterial({
      map: walnutTex.map,
      bumpMap: walnutTex.bumpMap,
      bumpScale: 0.022,
      color: 0x6b3410,
      roughness: 0.48,
      metalness: 0.08,
    });
    const rubberPadMat = new THREE.MeshStandardMaterial({
      color: 0x111315,
      roughness: 0.88,
    });
    const brushedSteelMat = new THREE.MeshStandardMaterial({
      map: steelTex,
      bumpMap: steelTex,
      bumpScale: 0.012,
      color: 0x3b4859,
      metalness: 0.88,
      roughness: 0.26,
    });
    const darkBarrelSteelMat = new THREE.MeshStandardMaterial({
      map: steelTex,
      bumpMap: steelTex,
      bumpScale: 0.012,
      color: 0x1e293b,
      metalness: 0.92,
      roughness: 0.24,
    });
    const chromeBoltMat = new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      metalness: 0.94,
      roughness: 0.16,
    });
    const brassBeadMat = new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      metalness: 0.92,
      roughness: 0.18,
    });

    const stockShape = new THREE.Shape();
    stockShape.moveTo(-0.34, 0.04);
    stockShape.lineTo(-0.52, -0.02);
    stockShape.quadraticCurveTo(-0.66, -0.02, -1.16, -0.08);
    stockShape.lineTo(-1.18, -0.34);
    stockShape.lineTo(-0.66, -0.22);
    stockShape.quadraticCurveTo(-0.52, -0.24, -0.44, -0.14);
    stockShape.lineTo(-0.34, -0.08);
    stockShape.closePath();

    const stockGeo = new THREE.ExtrudeGeometry(stockShape, {
      depth: 0.1,
      bevelEnabled: true,
      bevelThickness: 0.024,
      bevelSize: 0.022,
      bevelSegments: 3,
    });
    stockGeo.rotateY(Math.PI / 2);
    stockGeo.center();

    const stockMesh = new THREE.Mesh(stockGeo, woodMat);
    stockMesh.position.set(0, -0.08, -0.78);
    stockMesh.castShadow = true;
    gun.add(stockMesh);

    const recoilPad = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.28, 0.06),
      rubberPadMat
    );
    recoilPad.position.set(0, -0.12, -1.21);
    recoilPad.rotation.x = 0.08;
    gun.add(recoilPad);

    const receiverGroup = new THREE.Group();
    receiverGroup.position.set(0, 0.02, -0.16);

    const recBase = new THREE.Mesh(
      new THREE.BoxGeometry(0.165, 0.2, 0.62),
      brushedSteelMat
    );
    recBase.castShadow = true;
    receiverGroup.add(recBase);

    const recTop = new THREE.Mesh(
      new THREE.CylinderGeometry(0.082, 0.082, 0.62, 12),
      brushedSteelMat
    );
    recTop.rotation.x = Math.PI / 2;
    recTop.position.y = 0.08;
    receiverGroup.add(recTop);

    const portCavity = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, 0.09, 0.24),
      new THREE.MeshBasicMaterial({ color: 0x05070a })
    );
    portCavity.position.set(0.072, 0.04, 0.05);
    receiverGroup.add(portCavity);

    this.chamberShellMat = new THREE.MeshStandardMaterial({
      color: 0xdc2626,
      emissive: 0x991b1b,
      emissiveIntensity: 0.4,
      roughness: 0.3,
    });
    this.chamberShellMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.036, 0.036, 0.2, 10),
      this.chamberShellMat
    );
    this.chamberShellMesh.rotation.x = Math.PI / 2;
    this.chamberShellMesh.position.set(0.068, 0.04, 0.05);
    receiverGroup.add(this.chamberShellMesh);

    this.boltCarrierMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.022, 0.086, 0.235),
      chromeBoltMat
    );
    this.boltCarrierMesh.position.set(0.078, 0.04, 0.05);
    receiverGroup.add(this.boltCarrierMesh);

    const triggerGuard = new THREE.Mesh(
      new THREE.TorusGeometry(0.075, 0.015, 8, 16),
      darkBarrelSteelMat
    );
    triggerGuard.rotation.y = Math.PI / 2;
    triggerGuard.scale.set(1.35, 0.9, 1);
    triggerGuard.position.set(0, -0.12, -0.16);
    receiverGroup.add(triggerGuard);

    const triggerBlade = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.014, 0.07, 8),
      chromeBoltMat
    );
    triggerBlade.position.set(0, -0.11, -0.15);
    triggerBlade.rotation.x = -0.35;
    receiverGroup.add(triggerBlade);

    gun.add(receiverGroup);

    const rearBarrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.048, 0.054, 0.72, 16),
      darkBarrelSteelMat
    );
    rearBarrel.rotation.x = Math.PI / 2;
    rearBarrel.position.set(0, 0.088, 0.49);
    rearBarrel.castShadow = true;
    gun.add(rearBarrel);

    const rearRib = new THREE.Mesh(
      new THREE.BoxGeometry(0.028, 0.022, 0.7),
      darkBarrelSteelMat
    );
    rearRib.position.set(0, 0.142, 0.49);
    gun.add(rearRib);

    this.cutBarrelRingMesh = new THREE.Mesh(
      new THREE.RingGeometry(0.032, 0.05, 16),
      new THREE.MeshBasicMaterial({
        color: 0xf8fafc,
        side: THREE.DoubleSide,
      })
    );
    this.cutBarrelRingMesh.position.set(0, 0.088, 0.852);
    this.cutBarrelRingMesh.visible = false;
    gun.add(this.cutBarrelRingMesh);

    const magTube = new THREE.Mesh(
      new THREE.CylinderGeometry(0.042, 0.042, 0.86, 14),
      brushedSteelMat
    );
    magTube.rotation.x = Math.PI / 2;
    magTube.position.set(0, 0.0, 0.56);
    magTube.castShadow = true;
    gun.add(magTube);

    const magCap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.046, 0.046, 0.07, 14),
      darkBarrelSteelMat
    );
    magCap.rotation.x = Math.PI / 2;
    magCap.position.set(0, 0.0, 1.01);
    gun.add(magCap);

    this.frontBarrelGroup = new THREE.Group();

    const frontBarrelCyl = new THREE.Mesh(
      new THREE.CylinderGeometry(0.046, 0.048, 0.68, 16),
      darkBarrelSteelMat
    );
    frontBarrelCyl.rotation.x = Math.PI / 2;
    frontBarrelCyl.position.set(0, 0.088, 1.19);
    frontBarrelCyl.castShadow = true;
    this.frontBarrelGroup.add(frontBarrelCyl);

    const muzzleHole = new THREE.Mesh(
      new THREE.CircleGeometry(0.038, 14),
      new THREE.MeshBasicMaterial({ color: 0x020202 })
    );
    muzzleHole.position.set(0, 0.088, 1.532);
    this.frontBarrelGroup.add(muzzleHole);

    const frontRib = new THREE.Mesh(
      new THREE.BoxGeometry(0.026, 0.022, 0.66),
      darkBarrelSteelMat
    );
    frontRib.position.set(0, 0.14, 1.18);
    this.frontBarrelGroup.add(frontRib);

    const beadSight = new THREE.Mesh(
      new THREE.SphereGeometry(0.018, 8, 8),
      brassBeadMat
    );
    beadSight.position.set(0, 0.16, 1.48);
    this.frontBarrelGroup.add(beadSight);

    const clamp = new THREE.Mesh(
      new THREE.BoxGeometry(0.11, 0.16, 0.06),
      brushedSteelMat
    );
    clamp.position.set(0, 0.045, 0.94);
    this.frontBarrelGroup.add(clamp);

    gun.add(this.frontBarrelGroup);

    this.shotgunPumpGroup = new THREE.Group();
    this.shotgunPumpGroup.position.set(0, -0.005, 0.54);

    const forendCore = new THREE.Mesh(
      new THREE.CylinderGeometry(0.068, 0.064, 0.44, 14),
      woodMat
    );
    forendCore.rotation.x = Math.PI / 2;
    forendCore.castShadow = true;
    this.shotgunPumpGroup.add(forendCore);

    for (let r = -3; r <= 3; r++) {
      const grooveRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.067, 0.007, 8, 16),
        woodMat
      );
      grooveRing.position.set(0, 0, r * 0.052);
      this.shotgunPumpGroup.add(grooveRing);
    }

    [-0.048, 0.048].forEach((bx) => {
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(0.012, 0.022, 0.38),
        chromeBoltMat
      );
      bar.position.set(bx, 0.02, -0.26);
      this.shotgunPumpGroup.add(bar);
    });

    gun.add(this.shotgunPumpGroup);

    const hitBox = new THREE.Mesh(
      new THREE.BoxGeometry(0.85, 0.55, 2.65),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    hitBox.position.set(0, 0.05, 0.2);
    hitBox.userData = { hitType: "shotgun" };
    gun.add(hitBox);

    gun.traverse((child) => {
      if (!child.userData?.hitType) {
        child.userData = { hitType: "shotgun" };
      }
    });

    return gun;
  }

  private buildSeveredBarrelPiece(): THREE.Group {
    const piece = new THREE.Group();
    const steelMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.9,
      roughness: 0.26,
    });
    const cyl = new THREE.Mesh(
      new THREE.CylinderGeometry(0.046, 0.048, 0.68, 14),
      steelMat
    );
    cyl.rotation.z = Math.PI / 2;
    piece.add(cyl);

    const rib = new THREE.Mesh(
      new THREE.BoxGeometry(0.66, 0.022, 0.026),
      steelMat
    );
    rib.position.set(0, 0.05, 0);
    piece.add(rib);

    const cutRing = new THREE.Mesh(
      new THREE.RingGeometry(0.03, 0.048, 14),
      new THREE.MeshBasicMaterial({ color: 0xf8fafc, side: THREE.DoubleSide })
    );
    cutRing.rotation.y = Math.PI / 2;
    cutRing.position.set(-0.34, 0, 0);
    piece.add(cutRing);

    return piece;
  }

  public syncState(next: Buckshot3DStateSnapshot): void {
    const prevSawed = this.currentState.isSawedOff;
    this.currentState = next;

    if (this.sawingTimer <= 0) {
      this.frontBarrelGroup.visible = !next.isSawedOff;
      this.cutBarrelRingMesh.visible = next.isSawedOff;
      if (!this.fallingBarrelPiece) {
        this.severedBarrelOnTable.visible = next.isSawedOff;
      }
    }
    if (!next.isSawedOff && prevSawed) {
      this.fallingBarrelPiece = null;
      this.severedBarrelOnTable.visible = false;
    }

    if (next.currentChamberShell) {
      const isLive = next.currentChamberShell === "live";
      this.chamberShellMat.color.setHex(isLive ? 0xdc2626 : 0x2563eb);
      this.chamberShellMat.emissive.setHex(isLive ? 0x991b1b : 0x1d4ed8);
    }

    if (this.avatarP2.gasMaskHeadGroup && this.avatarP2.porcelainHeadGroup) {
      const showGasMask = next.mode === "duel";
      this.avatarP2.gasMaskHeadGroup.visible = showGasMask;
      this.avatarP2.porcelainHeadGroup.visible = !showGasMask;
    }

    this.avatarP1.cuffsGroup.visible = next.p1Cuffed;
    this.avatarP2.cuffsGroup.visible = next.p2Cuffed;

    const p1HoldingGun =
      next.gunPickedUpBy === 1 && next.turn === 1 && next.gunAim === "neutral";
    const p2HoldingGun =
      next.gunPickedUpBy === 2 &&
      next.turn === 2 &&
      next.mode === "duel" &&
      next.gunAim === "neutral";

    this.avatarP2.targetReticleGroup.visible = p1HoldingGun;
    this.selfTargetP1.visible = p1HoldingGun;

    this.avatarP1.targetReticleGroup.visible = p2HoldingGun;
    this.selfTargetP2.visible = p2HoldingGun;

    for (let i = 0; i < 5; i++) {
      const p1On = i < next.p1Hp && i < next.maxHp;
      const p1Led = this.p1Leds[i];
      p1Led.visible = i < next.maxHp;
      const mat1 = p1Led.material as THREE.MeshStandardMaterial;
      if (p1On) {
        const col = next.wiresCutSuddenDeath ? 0xef4444 : 0x22c55e;
        mat1.color.setHex(col);
        mat1.emissive.setHex(col);
        mat1.emissiveIntensity = 1.15;
      } else {
        mat1.color.setHex(0x141e18);
        mat1.emissive.setHex(0x000000);
        mat1.emissiveIntensity = 0;
      }

      const p2On = i < next.p2Hp && i < next.maxHp;
      const p2Led = this.p2Leds[i];
      p2Led.visible = i < next.maxHp;
      const mat2 = p2Led.material as THREE.MeshStandardMaterial;
      if (p2On) {
        const col = next.wiresCutSuddenDeath ? 0xef4444 : 0x22c55e;
        mat2.color.setHex(col);
        mat2.emissive.setHex(col);
        mat2.emissiveIntensity = 1.15;
      } else {
        mat2.color.setHex(0x141e18);
        mat2.emissive.setHex(0x000000);
        mat2.emissiveIntensity = 0;
      }
    }
    this.cutWireSparkMesh.visible = next.wiresCutSuddenDeath;

    const revHash = next.revealShells ? next.revealShells.join(",") : "none";
    if (revHash !== this.lastRevealHash) {
      this.lastRevealHash = revHash;
      while (this.shellTrayGroup.children.length > 0) {
        const ch = this.shellTrayGroup.children[0];
        this.shellTrayGroup.remove(ch);
      }
      if (next.revealShells && next.revealShells.length > 0) {
        next.revealShells.forEach((shType, idx) => {
          const shMesh = this.create3DShellMesh(shType);
          shMesh.position.set(0, 0.08, -0.82 + idx * 0.24);
          this.shellTrayGroup.add(shMesh);
        });
      }
    }

    const hash1 = next.p1Items.map((x) => x || "_").join(",");
    const hash2 = next.p2Items.map((x) => x || "_").join(",");
    const turnStealHash = `${next.turn}_${next.adrenalineStealSeat || 0}_${next.mode}`;
    if (
      hash1 !== this.lastItemsHashP1 ||
      hash2 !== this.lastItemsHashP2 ||
      turnStealHash !== this.lastTurnAndStealHash
    ) {
      this.lastItemsHashP1 = hash1;
      this.lastItemsHashP2 = hash2;
      this.lastTurnAndStealHash = turnStealHash;
      this.rebuildTableItems(next.p1Items, next.p2Items);
    }
  }

  private rebuildTableItems(
    p1List: (BuckshotItemKey | null)[],
    p2List: (BuckshotItemKey | null)[]
  ): void {
    this.p1ItemMeshes.forEach((m) => {
      if (m) this.scene.remove(m);
    });
    this.p2ItemMeshes.forEach((m) => {
      if (m) this.scene.remove(m);
    });
    this.p1ItemMeshes = Array(8).fill(null);
    this.p2ItemMeshes = Array(8).fill(null);
    this.p1GlowPads = [];
    this.p2GlowPads = [];

    this.interactiveTargets = [
      this.shotgunGroup,
      this.avatarP1.root,
      this.avatarP2.root,
      this.selfTargetP1,
      this.selfTargetP2,
      this.tableCancelHitBox,
    ];

    const st = this.currentState;
    const p1Active =
      (st.turn === 1 && st.adrenalineStealSeat === null) ||
      st.adrenalineStealSeat === 2;
    const p2Active =
      (st.turn === 2 &&
        st.mode === "duel" &&
        st.adrenalineStealSeat === null) ||
      st.adrenalineStealSeat === 1;

    const buildSlotGroup = (
      itemKey: BuckshotItemKey,
      slotIdx: number,
      trayOwner: 1 | 2,
      pos: THREE.Vector3,
      isUsableNow: boolean,
      isStealTarget: boolean
    ): THREE.Group => {
      const wrapper = new THREE.Group();
      wrapper.position.copy(pos);
      if (trayOwner === 2) {
        wrapper.rotation.y = Math.PI;
      }

      const itemMesh = create3DItemModel(itemKey);
      wrapper.add(itemMesh);

      const glowColor = isStealTarget
        ? 0xf43f5e
        : isUsableNow
        ? 0xf59e0b
        : 0x334155;
      const glowMat = new THREE.MeshBasicMaterial({
        color: glowColor,
        transparent: true,
        opacity: isUsableNow || isStealTarget ? 0.42 : 0.1,
        side: THREE.DoubleSide,
      });
      const glowPad = new THREE.Mesh(
        new THREE.PlaneGeometry(0.64, 0.64),
        glowMat
      );
      glowPad.rotation.x = -Math.PI / 2;
      glowPad.position.y = 0.012;
      wrapper.add(glowPad);
      if (trayOwner === 1) this.p1GlowPads.push(glowPad);
      else this.p2GlowPads.push(glowPad);

      const labelTex = createChalkLabelTexture(
        ITEM_3D_LABELS[itemKey],
        isUsableNow,
        isStealTarget
      );
      const labelMat = new THREE.MeshBasicMaterial({
        map: labelTex,
        transparent: true,
        depthWrite: false,
      });
      const labelPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(0.72, 0.19),
        labelMat
      );
      labelPlane.rotation.x = -Math.PI / 2.35;
      labelPlane.position.set(0, 0.06, 0.35);
      wrapper.add(labelPlane);

      const hitBox = new THREE.Mesh(
        new THREE.BoxGeometry(0.76, 0.75, 0.76),
        new THREE.MeshBasicMaterial({ visible: false })
      );
      hitBox.position.y = 0.28;
      wrapper.add(hitBox);

      wrapper.traverse((obj) => {
        obj.userData = {
          type: "item",
          hitType: "item",
          slot: slotIdx,
          slotIndex: slotIdx,
          owner: trayOwner,
          trayOwner,
          itemKey,
        };
      });

      return wrapper;
    };

    for (let i = 0; i < 8; i++) {
      const k1 = p1List[i];
      if (k1) {
        const isSteal = st.adrenalineStealSeat === 2 && k1 !== "adrenaline";
        const model = buildSlotGroup(
          k1,
          i,
          1,
          this.p1SlotPositions[i],
          p1Active,
          isSteal
        );
        this.scene.add(model);
        this.p1ItemMeshes[i] = model;
        this.interactiveTargets.push(model);
      }

      const k2 = p2List[i];
      if (k2) {
        const isSteal = st.adrenalineStealSeat === 1 && k2 !== "adrenaline";
        const model = buildSlotGroup(
          k2,
          i,
          2,
          this.p2SlotPositions[i],
          p2Active,
          isSteal
        );
        this.scene.add(model);
        this.p2ItemMeshes[i] = model;
        this.interactiveTargets.push(model);
      }
    }
  }

  private create3DShellMesh(type: ShellType): THREE.Group {
    const g = new THREE.Group();
    const hullColor = type === "live" ? 0xdc2626 : 0x2563eb;
    const hullGeo = new THREE.CylinderGeometry(0.048, 0.048, 0.22, 10);
    const hullMat = new THREE.MeshStandardMaterial({
      color: hullColor,
      roughness: 0.38,
    });
    const hull = new THREE.Mesh(hullGeo, hullMat);
    hull.rotation.z = Math.PI / 2;

    const brassGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.065, 10);
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      metalness: 0.88,
      roughness: 0.22,
    });
    const brass = new THREE.Mesh(brassGeo, brassMat);
    brass.rotation.z = Math.PI / 2;
    brass.position.x = -0.11;

    g.add(hull, brass);
    return g;
  }

  public triggerPumpEjectShell(type: ShellType): void {
    this.pumpOffsetZ = -0.25;
    const shellMesh = this.create3DShellMesh(type);
    shellMesh.position.set(0.08, 1.15, 0);
    this.scene.add(shellMesh);

    this.ejectedShells.push({
      mesh: shellMesh,
      vel: new THREE.Vector3(
        0.045 + Math.random() * 0.04,
        0.08 + Math.random() * 0.03,
        (Math.random() - 0.5) * 0.06
      ),
      rotVel: new THREE.Vector3(0.24, 0.36 * (Math.random() - 0.5), 0.28),
      settled: false,
      bounces: 0,
    });

    if (this.ejectedShells.length > 10) {
      const oldest = this.ejectedShells.shift();
      if (oldest) this.scene.remove(oldest.mesh);
    }
  }

  public triggerItemUse3DAnimation(
    userSeat: 1 | 2,
    itemKey: BuckshotItemKey,
    slotIndex: number
  ): void {
    const startVec =
      userSeat === 1
        ? this.p1SlotPositions[slotIndex] ?? new THREE.Vector3(0, 1.1, 1.5)
        : this.p2SlotPositions[slotIndex] ?? new THREE.Vector3(0, 1.1, -1.5);

    const animModel = create3DItemModel(itemKey);
    animModel.position.copy(startVec);
    this.scene.add(animModel);

    const targetVec =
      itemKey === "handsaw" || itemKey === "magnifier" || itemKey === "inverter"
        ? new THREE.Vector3(0, 1.32, 0.25)
        : new THREE.Vector3(0, 1.62, userSeat === 1 ? 1.85 : -1.85);

    this.activeItemAnim = {
      mesh: animModel,
      userSeat,
      itemKey,
      startPos: startVec.clone(),
      targetPos: targetVec,
      progress: 0,
    };

    if (itemKey === "magnifier") {
      this.inspectingChamberTimer = 2.4;
    }

    if (itemKey === "handsaw") {
      this.sawingTimer = 0.72;
      if (this.sawingHandsawMesh) {
        this.scene.remove(this.sawingHandsawMesh);
      }
      this.sawingHandsawMesh = create3DItemModel("handsaw");
      this.scene.add(this.sawingHandsawMesh);

      this.spawnSparks(new THREE.Vector3(0, 1.22, 0.45), 0xf97316, 32);
    } else if (itemKey === "inverter") {
      this.spawnSparks(new THREE.Vector3(0, 1.2, 0), 0xa855f7, 24);
    }
  }

  public triggerShotEffect(
    shooterSeat: 1 | 2,
    targetSeat: 1 | 2,
    shellType: ShellType,
    isSawedOff: boolean
  ): void {
    this.pumpOffsetZ = -0.25;

    if (shellType === "live") {
      this.muzzleFlashTimer = 0.24;
      this.muzzleLight.intensity = isSawedOff ? 44 : 30;

      const barrelTipZ = targetSeat === 1 ? 1.15 : -1.15;
      this.muzzleLight.position.set(0, 1.38, barrelTipZ);

      this.spawnSparks(
        new THREE.Vector3(0, 1.32, barrelTipZ),
        0xff6b00,
        isSawedOff ? 38 : 24
      );

      if (shooterSeat === 1) this.cam1Shake = 0.22;
      if (shooterSeat === 2) this.cam2Shake = 0.22;

      if (targetSeat === 1) {
        this.cam1Shake = isSawedOff ? 0.72 : 0.5;
        this.cam1Knockback = isSawedOff ? 1.25 : 0.88;
        this.avatar1HitRecoil = isSawedOff ? 1.45 : 1.05;
      } else {
        this.cam2Shake = isSawedOff ? 0.72 : 0.5;
        this.cam2Knockback = isSawedOff ? 1.25 : 0.88;
        this.avatar2HitRecoil = isSawedOff ? 1.45 : 1.05;
      }
    } else {
      if (shooterSeat === 1) this.cam1Shake = 0.06;
      else this.cam2Shake = 0.06;
    }

    setTimeout(() => {
      if (!this.disposed) {
        this.triggerPumpEjectShell(shellType);
      }
    }, 320);
  }

  private spawnSparks(
    origin: THREE.Vector3,
    hexColor: number,
    count: number
  ): void {
    const geo = new THREE.BoxGeometry(0.045, 0.045, 0.045);
    const mat = new THREE.MeshBasicMaterial({ color: hexColor });
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.position.copy(origin);
      this.scene.add(m);
      this.sparks.push({
        mesh: m,
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 0.2,
          0.04 + Math.random() * 0.16,
          (Math.random() - 0.5) * 0.2
        ),
        life: 0,
        maxLife: 18 + Math.random() * 14,
      });
    }
  }

  public raycastFromPointer(
    clientX: number,
    clientY: number
  ): RaycastHitResult {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return { viewportSeat: 1, hitType: "none" };
    }

    const relX = clientX - rect.left;
    const relY = clientY - rect.top;

    let viewportSeat: 1 | 2 = 1;
    let ndcX = 0;
    const ndcY = -(relY / rect.height) * 2 + 1;

    if (this.currentState.mode === "duel") {
      const halfW = rect.width / 2;
      if (relX < halfW) {
        viewportSeat = 1;
        ndcX = (relX / halfW) * 2 - 1;
      } else {
        viewportSeat = 2;
        ndcX = ((relX - halfW) / (rect.width - halfW)) * 2 - 1;
      }
    } else {
      viewportSeat = 1;
      ndcX = (relX / rect.width) * 2 - 1;
    }

    const activeCam = viewportSeat === 1 ? this.camP1 : this.camP2;
    this.raycaster.layers.mask = activeCam.layers.mask;
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), activeCam);

    const intersects = this.raycaster.intersectObjects(
      this.interactiveTargets,
      true
    );

    const isHoldingGun =
      this.currentState.gunPickedUpBy === viewportSeat &&
      this.currentState.turn === viewportSeat;

    for (const hit of intersects) {
      let curr: THREE.Object3D | null = hit.object;
      while (curr) {
        const ht = curr.userData?.hitType;
        if (ht === "item") {
          return {
            viewportSeat,
            hitType: "item",
            trayOwner: curr.userData.trayOwner,
            slotIndex: curr.userData.slotIndex,
          };
        }
        if (ht === "target_self" && isHoldingGun) {
          return { viewportSeat, hitType: "target_self" };
        }
        if (ht === "target_opponent" && isHoldingGun) {
          return { viewportSeat, hitType: "target_opponent" };
        }
        if (ht === "shotgun") {
          return { viewportSeat, hitType: "shotgun" };
        }
        if (ht === "table_cancel" && isHoldingGun) {
          return { viewportSeat, hitType: "table_cancel" };
        }
        curr = curr.parent;
      }
    }

    return { viewportSeat, hitType: "none" };
  }

  public resize(): void {
    if (this.disposed || !this.renderer) return;
    const parent = this.canvas.parentElement;
    const w = parent ? parent.clientWidth : window.innerWidth;
    const h = parent ? parent.clientHeight : window.innerHeight;
    if (w <= 0 || h <= 0) return;

    this.renderer.setPixelRatio(
      Math.min(
        typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
        1.35
      )
    );
    const retroScale = 0.72;
    this.renderer.setSize(
      Math.max(320, Math.floor(w * retroScale)),
      Math.max(200, Math.floor(h * retroScale)),
      false
    );
  }

  private animate = (): void => {
    if (this.disposed) return;
    this.animFrameId = requestAnimationFrame(this.animate);

    const dt = Math.min(0.1, this.clock.getDelta());
    const elapsed = this.clock.getElapsedTime();

    this.updateSceneKinematics(dt, elapsed);
    this.renderDualViewports();
  };

  private updateSceneKinematics(dt: number, elapsed: number): void {
    const st = this.currentState;

    // 1. Ana Tungsten Tavan Lambası Sallanma ve Voltaj Titremesi (Flicker)
    this.mainSpot.position.x = Math.sin(elapsed * 0.95) * 0.14;
    this.mainSpot.position.z = Math.cos(elapsed * 0.8) * 0.14;
    const flicker =
      Math.sin(elapsed * 23) * Math.sin(elapsed * 41) > 0.86 ? -6 : 0;
    this.mainSpot.intensity = 46 + Math.sin(elapsed * 3.2) * 2.5 + flicker;

    // Jeneratör panosu uyarı LED'i yanıp sönmesi
    const ledOn = Math.sin(elapsed * 5.5) > 0;
    this.warningLedMeshes.forEach((led) => {
      (led.material as THREE.MeshBasicMaterial).color.setHex(
        ledOn ? 0xef4444 : 0x3b0a0a
      );
    });

    // Uçuşan mikro toz zerrecikleri süzülmesi
    if (this.dustPoints) {
      this.dustPoints.rotation.y = elapsed * 0.04;
      this.dustPoints.position.y = Math.sin(elapsed * 0.7) * 0.08;
    }

    // 2. Eşya Taban Parlaması Nabız Efekti
    const pulseOpacity = 0.32 + Math.sin(elapsed * 4.2) * 0.14;
    const activeGlowList = st.turn === 1 ? this.p1GlowPads : this.p2GlowPads;
    activeGlowList.forEach((pad) => {
      const mat = pad.material as THREE.MeshBasicMaterial;
      mat.opacity = pulseOpacity;
    });

    // 3. Namlu Alevi Sönümlenmesi
    if (this.muzzleFlashTimer > 0) {
      this.muzzleFlashTimer -= dt;
      if (this.muzzleFlashTimer <= 0) {
        this.muzzleLight.intensity = 0;
      }
    }

    // 4. Pompa El Kundağı (Forend) ve Fişek Tahliye Penceresi (Ejection Port) Kayan Mekanizması
    this.pumpOffsetZ = THREE.MathUtils.lerp(this.pumpOffsetZ, 0, dt * 11);
    this.shotgunPumpGroup.position.z = 0.54 + this.pumpOffsetZ;

    if (this.inspectingChamberTimer > 0) {
      this.inspectingChamberTimer = Math.max(
        0,
        this.inspectingChamberTimer - dt
      );
    }
    const boltOpenOffset =
      this.inspectingChamberTimer > 0
        ? -0.18
        : Math.min(0, this.pumpOffsetZ * 0.85);
    this.boltCarrierMesh.position.z = 0.05 + boltOpenOffset;

    // 5. El Testeresi Namlu Kesme Sürtünmesi + Kopan Namlunun Masaya Düşüş Fiziği
    if (this.sawingTimer > 0) {
      this.sawingTimer -= dt;
      if (this.sawingHandsawMesh) {
        const stroke = Math.sin(elapsed * 42) * 0.16;
        this.sawingHandsawMesh.position.set(stroke, 1.25, 0.35);
        this.sawingHandsawMesh.rotation.set(0, Math.PI / 2, -0.2);
      }
      if (Math.random() < 0.65) {
        this.spawnSparks(new THREE.Vector3(0, 1.2, 0.35), 0xf97316, 3);
      }
      if (this.sawingTimer <= 0) {
        if (this.sawingHandsawMesh) {
          this.scene.remove(this.sawingHandsawMesh);
          this.sawingHandsawMesh = null;
        }
        this.frontBarrelGroup.visible = false;
        this.cutBarrelRingMesh.visible = true;

        const fallingMesh = this.buildSeveredBarrelPiece();
        fallingMesh.position.set(0.35, 1.25, 0.15);
        this.scene.add(fallingMesh);
        this.fallingBarrelPiece = {
          mesh: fallingMesh,
          vel: new THREE.Vector3(0.025, 0.055, 0.018),
          rotVel: new THREE.Vector3(0.18, 0.22, 0.28),
          bounces: 0,
          settled: false,
        };
      }
    }

    if (this.fallingBarrelPiece && !this.fallingBarrelPiece.settled) {
      const fb = this.fallingBarrelPiece;
      fb.mesh.position.add(fb.vel);
      fb.vel.y -= 0.0065;
      fb.mesh.rotation.x += fb.rotVel.x;
      fb.mesh.rotation.y += fb.rotVel.y;
      fb.mesh.rotation.z += fb.rotVel.z;

      if (fb.mesh.position.y <= 0.99) {
        fb.mesh.position.y = 0.99;
        fb.bounces += 1;
        if (fb.bounces === 1) {
          sound.playShellCasingDrop();
        }
        if (fb.bounces >= 3) {
          fb.settled = true;
          this.scene.remove(fb.mesh);
          this.fallingBarrelPiece = null;
          this.severedBarrelOnTable.visible = this.currentState.isSawedOff;
        } else {
          fb.vel.y = Math.abs(fb.vel.y) * 0.38;
          fb.vel.x *= 0.6;
          fb.vel.z *= 0.6;
        }
      }
    }

    // 6. Pompalı Tüfek Konum ve Hedef Doğrultma Fiziği
    let targetGunX = 0;
    let targetGunY = 1.07;
    let targetGunZ = 0;
    let targetGunRotY = Math.PI / 2;
    let targetGunRotX = 0;

    if (st.gunAim === "p2") {
      targetGunY = 1.54;
      targetGunZ = -0.25;
      targetGunRotY = Math.PI;
      targetGunRotX = -0.07;
    } else if (st.gunAim === "p1") {
      targetGunY = 1.54;
      targetGunZ = 0.25;
      targetGunRotY = 0;
      targetGunRotX = -0.07;
    } else if (st.gunPickedUpBy === 1) {
      targetGunY = 1.38;
      targetGunZ = 0.55;
      targetGunRotY = Math.PI * 0.92;
      targetGunRotX = -0.04;
    } else if (st.gunPickedUpBy === 2) {
      targetGunY = 1.38;
      targetGunZ = -0.55;
      targetGunRotY = Math.PI * 0.08;
      targetGunRotX = -0.04;
    }

    this.shotgunGroup.position.x = THREE.MathUtils.lerp(
      this.shotgunGroup.position.x,
      targetGunX,
      dt * 9
    );
    this.shotgunGroup.position.y = THREE.MathUtils.lerp(
      this.shotgunGroup.position.y,
      targetGunY,
      dt * 9
    );
    this.shotgunGroup.position.z = THREE.MathUtils.lerp(
      this.shotgunGroup.position.z,
      targetGunZ,
      dt * 9
    );
    this.shotgunGroup.rotation.y = THREE.MathUtils.lerp(
      this.shotgunGroup.rotation.y,
      targetGunRotY,
      dt * 9
    );
    this.shotgunGroup.rotation.x = THREE.MathUtils.lerp(
      this.shotgunGroup.rotation.x,
      targetGunRotX,
      dt * 9
    );

    // 7. İki Farklı 3D Karakterin Canlı Tepkileri
    this.avatar1HitRecoil = THREE.MathUtils.lerp(
      this.avatar1HitRecoil,
      0,
      dt * 4.2
    );
    this.avatar2HitRecoil = THREE.MathUtils.lerp(
      this.avatar2HitRecoil,
      0,
      dt * 4.2
    );

    const updateAvatarBehavior = (av: AvatarRig, seat: 1 | 2) => {
      const phaseOff = seat === 1 ? 0 : 2.1;
      const isMyTurn = st.turn === seat;
      const isAimedAtMe =
        (seat === 1 && st.gunAim === "p1") ||
        (seat === 2 && st.gunAim === "p2");
      const isHoldingShotgun =
        st.gunPickedUpBy === seat ||
        (st.turn === seat && st.gunAim !== "neutral");
      const hitRecoil =
        seat === 1 ? this.avatar1HitRecoil : this.avatar2HitRecoil;
      const zSign = seat === 1 ? 1 : -1;

      const leanZ = isAimedAtMe ? 0.36 : isMyTurn ? -0.18 : 0;
      const targetRootZ = zSign * (4.18 + leanZ + hitRecoil * 1.45);
      av.root.position.z = THREE.MathUtils.lerp(
        av.root.position.z,
        targetRootZ,
        dt * 7
      );

      const flinchTremor = isAimedAtMe ? Math.sin(elapsed * 30) * 0.025 : 0;
      const flinchTiltZ = isAimedAtMe ? 0.14 : 0;

      av.maskGroup.position.y =
        2.98 +
        Math.sin(elapsed * 2.2 + phaseOff) * 0.05 -
        hitRecoil * 0.35;
      av.maskGroup.position.x = flinchTremor;
      av.maskGroup.rotation.z =
        Math.sin(elapsed * 1.4 + phaseOff) * 0.035 + flinchTiltZ;
      av.maskGroup.rotation.x = -hitRecoil * 0.65 + (isAimedAtMe ? -0.12 : 0);

      av.torsoGroup.position.y =
        1.85 + Math.sin(elapsed * 2.2 + phaseOff) * 0.03;
      av.torsoGroup.rotation.x = -hitRecoil * 0.38;

      if (av.targetReticleGroup.visible) {
        av.targetReticleGroup.children[0].rotation.z = elapsed * 1.6;
        av.targetReticleGroup.children[1].rotation.z = -elapsed * 2.4;
      }

      const leftTarget = av.baseLeftHandPos.clone();
      const rightTarget = av.baseRightHandPos.clone();

      if (this.activeItemAnim && this.activeItemAnim.userSeat === seat) {
        const itemWorld = this.activeItemAnim.mesh.position.clone();
        const localTarget = av.root.worldToLocal(itemWorld);
        if (localTarget.x < 0) {
          leftTarget.copy(localTarget);
        } else {
          rightTarget.copy(localTarget);
        }
      } else if (isHoldingShotgun) {
        leftTarget.set(-0.32, 1.38, 2.75);
        rightTarget.set(0.32, 1.38, 2.45);
      } else if (isAimedAtMe) {
        leftTarget.set(-0.78, 1.85, 0.92);
        rightTarget.set(0.78, 1.85, 0.92);
      } else if (isMyTurn) {
        leftTarget.z += 0.32;
        rightTarget.z += 0.32;
      }

      leftTarget.y += Math.sin(elapsed * 2.6 + phaseOff) * 0.035;
      rightTarget.y += Math.cos(elapsed * 2.6 + phaseOff) * 0.035;

      av.leftHand.position.lerp(leftTarget, dt * 10);
      av.rightHand.position.lerp(rightTarget, dt * 10);
    };

    updateAvatarBehavior(this.avatarP1, 1);
    updateAvatarBehavior(this.avatarP2, 2);

    // 8. Aktif 3D Eşya Kullanım Animasyonu
    if (this.activeItemAnim) {
      this.activeItemAnim.progress += dt * 1.85;
      const p = Math.min(1, this.activeItemAnim.progress);
      this.activeItemAnim.mesh.position.lerpVectors(
        this.activeItemAnim.startPos,
        this.activeItemAnim.targetPos,
        p
      );
      this.activeItemAnim.mesh.rotation.y += dt * 5;
      if (this.activeItemAnim.progress >= 1.15) {
        this.scene.remove(this.activeItemAnim.mesh);
        this.activeItemAnim = null;
      }
    }

    // 9. Masaya Fırlatılan 3D Kovan Fiziği
    this.ejectedShells.forEach((sh) => {
      if (sh.settled) return;
      sh.mesh.position.add(sh.vel);
      sh.vel.y -= 0.0055;
      sh.mesh.rotation.x += sh.rotVel.x;
      sh.mesh.rotation.y += sh.rotVel.y;
      sh.mesh.rotation.z += sh.rotVel.z;

      if (sh.mesh.position.y <= 0.99) {
        sh.mesh.position.y = 0.99;
        sh.bounces += 1;
        if (sh.bounces === 1) {
          sound.playShellCasingDrop();
        }
        if (sh.bounces >= 3 || Math.abs(sh.vel.y) < 0.015) {
          sh.settled = true;
          sh.mesh.rotation.x = 0;
          sh.mesh.rotation.z = 0;
        } else {
          sh.vel.y = Math.abs(sh.vel.y) * 0.42;
          sh.vel.x *= 0.6;
          sh.vel.z *= 0.6;
        }
      }
    });

    // 10. Kıvılcım Parçacıkları
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const sp = this.sparks[i];
      sp.life += 1;
      sp.mesh.position.add(sp.vel);
      sp.vel.y -= 0.006;
      if (sp.life >= sp.maxLife) {
        this.scene.remove(sp.mesh);
        this.sparks.splice(i, 1);
      }
    }

    // 11. Kameraların Konum, Bakış Açısı ve Head-Bob / Breathing (FOV 74 / 66)
    this.cam1Shake = Math.max(0, this.cam1Shake - dt * 1.1);
    this.cam2Shake = Math.max(0, this.cam2Shake - dt * 1.1);
    this.cam1Knockback = THREE.MathUtils.lerp(this.cam1Knockback, 0, dt * 4.5);
    this.cam2Knockback = THREE.MathUtils.lerp(this.cam2Knockback, 0, dt * 4.5);

    const isRevealing =
      st.revealShells !== null && st.revealShells.length > 0;

    const p1ActionLean =
      st.gunPickedUpBy === 1 ||
      (st.turn === 1 && st.gunAim !== "neutral") ||
      this.activeItemAnim?.userSeat === 1
        ? 1
        : 0;
    const p2ActionLean =
      st.gunPickedUpBy === 2 ||
      (st.turn === 2 && st.gunAim !== "neutral") ||
      this.activeItemAnim?.userSeat === 2
        ? 1
        : 0;

    const bobY1 = Math.sin(elapsed * 1.8) * 0.032;
    const bobX1 = Math.cos(elapsed * 0.9) * 0.022;
    const bobY2 = Math.sin(elapsed * 1.8 + 1.5) * 0.032;
    const bobX2 = Math.cos(elapsed * 0.9 + 1.5) * 0.022;

    const p1BasePos = isRevealing
      ? new THREE.Vector3(-1.35, 2.38, 1.92)
      : new THREE.Vector3(
          bobX1,
          3.48 + bobY1 - p1ActionLean * 0.14 + this.cam1Knockback * 0.55,
          4.88 - p1ActionLean * 0.36 + this.cam1Knockback * 1.35
        );
    const p1LookTarget = isRevealing
      ? new THREE.Vector3(-2.32, 1.02, 0)
      : new THREE.Vector3(
          bobX1 * 0.4,
          1.42 + p1ActionLean * 0.12 + this.cam1Knockback * 1.4,
          -0.35
        );

    if (this.cam1Shake > 0) {
      p1BasePos.x += (Math.random() - 0.5) * this.cam1Shake;
      p1BasePos.y += (Math.random() - 0.5) * this.cam1Shake;
    }
    this.camP1.position.lerp(p1BasePos, dt * 7.5);
    this.camP1.lookAt(p1LookTarget);

    const p2BasePos = isRevealing
      ? new THREE.Vector3(-1.35, 2.38, -1.92)
      : new THREE.Vector3(
          bobX2,
          3.48 + bobY2 - p2ActionLean * 0.14 + this.cam2Knockback * 0.55,
          -4.88 + p2ActionLean * 0.36 - this.cam2Knockback * 1.35
        );
    const p2LookTarget = isRevealing
      ? new THREE.Vector3(-2.32, 1.02, 0)
      : new THREE.Vector3(
          bobX2 * 0.4,
          1.42 + p2ActionLean * 0.12 + this.cam2Knockback * 1.4,
          0.35
        );

    if (this.cam2Shake > 0) {
      p2BasePos.x += (Math.random() - 0.5) * this.cam2Shake;
      p2BasePos.y += (Math.random() - 0.5) * this.cam2Shake;
    }
    this.camP2.position.lerp(p2BasePos, dt * 7.5);
    this.camP2.lookAt(p2LookTarget);
  }

  private renderDualViewports(): void {
    if (!this.renderer) return;
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (w <= 0 || h <= 0) return;

    if (this.currentState.mode === "solo") {
      this.renderer.setScissorTest(false);
      this.renderer.setViewport(0, 0, w, h);
      this.camP1.fov = 66;
      this.camP1.aspect = w / h;
      this.camP1.updateProjectionMatrix();
      this.renderer.render(this.scene, this.camP1);
    } else {
      const halfW = Math.floor(w / 2);
      this.renderer.setScissorTest(true);

      this.renderer.setViewport(0, 0, halfW, h);
      this.renderer.setScissor(0, 0, halfW, h);
      this.camP1.fov = 74;
      this.camP1.aspect = halfW / h;
      this.camP1.updateProjectionMatrix();
      this.renderer.render(this.scene, this.camP1);

      this.renderer.setViewport(halfW, 0, w - halfW, h);
      this.renderer.setScissor(halfW, 0, w - halfW, h);
      this.camP2.fov = 74;
      this.camP2.aspect = (w - halfW) / h;
      this.camP2.updateProjectionMatrix();
      this.renderer.render(this.scene, this.camP2);
    }
  }

  public dispose(): void {
    this.disposed = true;
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) {
        mesh.geometry.dispose();
      }
      if (mesh.material) {
        const mats = Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material];
        mats.forEach((m) => {
          const std = m as THREE.MeshStandardMaterial;
          if (std.map) std.map.dispose();
          if (std.bumpMap) std.bumpMap.dispose();
          if (std.roughnessMap) std.roughnessMap.dispose();
          m.dispose();
        });
      }
    });

    this.renderer?.dispose();
    this.renderer = null;
    this.canvas.remove();
  }
}
