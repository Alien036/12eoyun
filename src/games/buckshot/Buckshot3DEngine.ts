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
  revealShells: ShellType[] | null; // Doluysa kameralar mermi tepsisine yakın çekim yapar
  gunAim: "neutral" | "p1" | "p2";
  gunPickedUpBy: 1 | 2 | null;
  adrenalineStealSeat: 1 | 2 | null;
  currentChamberShell?: ShellType | null; // Tahliye penceresinde (Ejection Port) görünecek fişek
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
// PROSEDÜREL KİRLİ / RETRO PS1 DOKULAR (THREE.CanvasTexture)
// ============================================================================

function createFeltTableTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d")!;

  // Koyulaşmış, aşınmış yeraltı yeşil çuha zemin
  ctx.fillStyle = "#13281c";
  ctx.fillRect(0, 0, 1024, 1024);

  // Radyal kirli gölgeleme
  const grad = ctx.createRadialGradient(512, 512, 90, 512, 512, 680);
  grad.addColorStop(0, "rgba(38, 86, 55, 0.5)");
  grad.addColorStop(0.65, "rgba(15, 35, 24, 0.58)");
  grad.addColorStop(1, "rgba(5, 10, 7, 0.92)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1024, 1024);

  // Prosedürel gürültü (grunge / leke / aşınma)
  for (let i = 0; i < 22000; i++) {
    const x = Math.random() * 1024;
    const y = Math.random() * 1024;
    const dark = Math.random() < 0.58;
    ctx.fillStyle = dark
      ? `rgba(4, 9, 6, ${Math.random() * 0.28})`
      : `rgba(68, 128, 86, ${Math.random() * 0.15})`;
    ctx.fillRect(x, y, 2 + Math.random() * 3, 2 + Math.random() * 3);
  }

  // Koyu yağ ve barut lekeleri
  for (let s = 0; s < 26; s++) {
    const sx = 120 + Math.random() * 780;
    const sy = 120 + Math.random() * 780;
    const r = 18 + Math.random() * 55;
    const sg = ctx.createRadialGradient(sx, sy, 2, sx, sy, r);
    sg.addColorStop(0, "rgba(6, 10, 7, 0.42)");
    sg.addColorStop(1, "rgba(6, 10, 7, 0)");
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Tebeşir / Aşınmış Beyaz Boya Çizgileri
  ctx.strokeStyle = "rgba(226, 232, 220, 0.72)";
  ctx.lineWidth = 4;

  // Dış çerçeve çizgisi
  ctx.strokeRect(42, 42, 940, 940);

  // Orta Tüfek Dikdörtgeni ve Nişangah Çizgileri
  ctx.strokeStyle = "rgba(235, 240, 230, 0.78)";
  ctx.lineWidth = 3.5;
  ctx.strokeRect(262, 430, 500, 164);

  ctx.beginPath();
  ctx.moveTo(230, 512);
  ctx.lineTo(794, 512);
  ctx.moveTo(512, 405);
  ctx.lineTo(512, 619);
  ctx.stroke();

  // Sol Kenar: 8'li Mermi Dizilim Kutucukları (Mermi Tepsisi Yeri)
  ctx.strokeStyle = "rgba(245, 158, 11, 0.7)";
  ctx.strokeRect(68, 360, 145, 304);
  for (let m = 0; m < 8; m++) {
    const my = 374 + m * 35;
    ctx.strokeRect(84, my, 112, 26);
  }

  // Oyuncu 1 (+Z / Alt Yarı) ve Oyuncu 2 (-Z / Üst Yarı) için 8'li Eşya Kutucukları
  ctx.strokeStyle = "rgba(236, 242, 232, 0.85)";
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
      ctx.fillStyle = "rgba(232, 238, 228, 0.28)";
      ctx.font = "bold 18px monospace";
      ctx.fillText(`${idx + 1}`, pt.x + 8, pt.y + 22);
    });
  };

  drawPlayerItemGrid(false); // Oyuncu 2 (-Z)
  drawPlayerItemGrid(true); // Oyuncu 1 (+Z)

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

function createGrungeBrickTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#180d0b";
  ctx.fillRect(0, 0, 512, 512);

  const rows = 16;
  const cols = 8;
  const brickH = 512 / rows;
  const brickW = 512 / cols;

  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * (brickW / 2);
    for (let c = -1; c <= cols; c++) {
      const x = c * brickW + offset;
      const y = r * brickH;
      const shade = 24 + Math.floor(Math.random() * 24);
      const red = shade + 18 + Math.floor(Math.random() * 16);
      ctx.fillStyle = `rgb(${red}, ${shade}, ${shade - 4})`;
      ctx.fillRect(x + 2, y + 2, brickW - 4, brickH - 4);
    }
  }

  for (let i = 0; i < 6500; i++) {
    ctx.fillStyle =
      Math.random() < 0.7 ? "rgba(0,0,0,0.35)" : "rgba(90,45,30,0.18)";
    ctx.fillRect(Math.random() * 512, Math.random() * 512, 3, 3);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 2);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

function createRustyMetalTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#1f1b18";
  ctx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 5000; i++) {
    const rust = Math.random() < 0.32;
    ctx.fillStyle = rust
      ? `rgba(120, 53, 18, ${Math.random() * 0.35})`
      : `rgba(55, 60, 68, ${Math.random() * 0.25})`;
    ctx.fillRect(
      Math.random() * 256,
      Math.random() * 256,
      2 + Math.random() * 4,
      2
    );
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

function createWalnutWoodTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#4a220d";
  ctx.fillRect(0, 0, 256, 256);

  // Koyu ceviz ağacı damarları
  for (let y = 0; y < 256; y += 2) {
    const wave = Math.sin(y * 0.08) * 12;
    ctx.strokeStyle =
      y % 6 === 0 ? "rgba(28, 11, 4, 0.55)" : "rgba(92, 46, 18, 0.35)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(85, y + wave, 170, y - wave, 256, y);
    ctx.stroke();
  }

  for (let i = 0; i < 1800; i++) {
    ctx.fillStyle =
      Math.random() < 0.5 ? "rgba(18, 7, 2, 0.22)" : "rgba(120, 62, 24, 0.16)";
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 6, 1.5);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

function createBrushedSteelTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#26313f";
  ctx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 3200; i++) {
    const bright = Math.random() < 0.45;
    ctx.fillStyle = bright
      ? `rgba(148, 163, 184, ${Math.random() * 0.16})`
      : `rgba(15, 23, 42, ${Math.random() * 0.28})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 14, 1.2);
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

  // Kirli eskitme lekeleri
  for (let i = 0; i < 3000; i++) {
    ctx.fillStyle =
      Math.random() < 0.65
        ? `rgba(68, 60, 52, ${Math.random() * 0.14})`
        : `rgba(250, 246, 238, ${Math.random() * 0.2})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 3, 3);
  }

  // Keskin siyah/kahverengi porselen çatlakları
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

  // Sargı bezi şerit çizgileri
  ctx.strokeStyle = "rgba(75, 65, 54, 0.45)";
  ctx.lineWidth = 2;
  for (let y = 0; y < 128; y += 14) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(128, y + 6);
    ctx.stroke();
  }

  // Kir / pas lekeleri
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

  // Koyu yarı-saydam diegetic masa etiketi tabanı
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
// 9 FİZİKSEL 3D EŞYA MODELİ ÜRETİCİSİ (%25+ BÜYÜTÜLMÜŞ & NET AYDINLATMALI)
// ============================================================================

function create3DItemModel(itemKey: BuckshotItemKey): THREE.Group {
  const group = new THREE.Group();

  switch (itemKey) {
    case "soda": {
      // 1. Teneke İçecek Kutusu (Silindir 3D Kutu + Gümüş Kapak + Açma Halkası)
      const bodyGeo = new THREE.CylinderGeometry(0.165, 0.165, 0.45, 14);
      const bodyMat = new THREE.MeshStandardMaterial({
        color: 0x0284c7,
        roughness: 0.3,
        metalness: 0.65,
      });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.y = 0.225;
      body.castShadow = true;
      group.add(body);

      const stripeGeo = new THREE.CylinderGeometry(0.169, 0.169, 0.15, 14);
      const stripeMat = new THREE.MeshStandardMaterial({
        color: 0xe11d48,
        roughness: 0.35,
      });
      const stripe = new THREE.Mesh(stripeGeo, stripeMat);
      stripe.position.y = 0.24;
      group.add(stripe);

      const topGeo = new THREE.CylinderGeometry(0.15, 0.16, 0.035, 14);
      const topMat = new THREE.MeshStandardMaterial({
        color: 0xe2e8f0,
        metalness: 0.9,
        roughness: 0.18,
      });
      const top = new THREE.Mesh(topGeo, topMat);
      top.position.y = 0.455;
      group.add(top);
      break;
    }

    case "handcuffs": {
      // 2. Metal Kelepçe (Çift Çelik Halka + Kilit Gövdesi + Zincir Baklaları)
      const metalMat = new THREE.MeshStandardMaterial({
        color: 0xcbd5e1,
        metalness: 0.88,
        roughness: 0.22,
      });
      const cuffGeo = new THREE.TorusGeometry(0.145, 0.03, 10, 20);

      const leftCuff = new THREE.Mesh(cuffGeo, metalMat);
      leftCuff.rotation.x = Math.PI / 2;
      leftCuff.position.set(-0.16, 0.05, 0);
      leftCuff.castShadow = true;
      group.add(leftCuff);

      const rightCuff = new THREE.Mesh(cuffGeo, metalMat);
      rightCuff.rotation.x = Math.PI / 2;
      rightCuff.position.set(0.16, 0.05, 0);
      rightCuff.castShadow = true;
      group.add(rightCuff);

      const linkGeo = new THREE.BoxGeometry(0.14, 0.035, 0.05);
      const link = new THREE.Mesh(linkGeo, metalMat);
      link.position.set(0, 0.05, 0);
      group.add(link);
      break;
    }

    case "handsaw": {
      // 3. Katlanır El Testeresi (Ergonomik Ahşap Sap + Dişli Çelik Bıçak)
      const handleGeo = new THREE.BoxGeometry(0.16, 0.1, 0.3);
      const handleMat = new THREE.MeshStandardMaterial({
        color: 0x9a3412,
        roughness: 0.6,
      });
      const handle = new THREE.Mesh(handleGeo, handleMat);
      handle.position.set(-0.13, 0.07, 0.05);
      handle.rotation.y = 0.25;
      handle.castShadow = true;
      group.add(handle);

      const bladeGeo = new THREE.BoxGeometry(0.38, 0.022, 0.1);
      const bladeMat = new THREE.MeshStandardMaterial({
        color: 0xe2e8f0,
        metalness: 0.92,
        roughness: 0.18,
      });
      const blade = new THREE.Mesh(bladeGeo, bladeMat);
      blade.position.set(0.12, 0.07, -0.02);
      blade.castShadow = true;
      group.add(blade);
      break;
    }

    case "magnifier": {
      // 4. Büyüteç (Pirinç Çerçeve + Parlak Cam Mercek + Sap)
      const rimGeo = new THREE.TorusGeometry(0.165, 0.028, 10, 20);
      const rimMat = new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        metalness: 0.85,
        roughness: 0.25,
      });
      const rim = new THREE.Mesh(rimGeo, rimMat);
      rim.rotation.x = Math.PI / 2;
      rim.position.set(0, 0.07, -0.06);
      rim.castShadow = true;
      group.add(rim);

      const lensGeo = new THREE.CylinderGeometry(0.155, 0.155, 0.02, 18);
      const lensMat = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0284c7,
        emissiveIntensity: 0.35,
        transparent: true,
        opacity: 0.62,
        roughness: 0.1,
      });
      const lens = new THREE.Mesh(lensGeo, lensMat);
      lens.position.set(0, 0.07, -0.06);
      group.add(lens);

      const stickGeo = new THREE.CylinderGeometry(0.03, 0.036, 0.24, 10);
      const stickMat = new THREE.MeshStandardMaterial({
        color: 0x292524,
        roughness: 0.55,
      });
      const stick = new THREE.Mesh(stickGeo, stickMat);
      stick.rotation.x = Math.PI / 2;
      stick.position.set(0, 0.07, 0.19);
      group.add(stick);
      break;
    }

    case "sedative": {
      // 5. Sigara Paketi / Şarj Tüpü (+1⚡ Yeşil Parlayan Kapsül)
      const packGeo = new THREE.BoxGeometry(0.25, 0.35, 0.15);
      const packMat = new THREE.MeshStandardMaterial({
        color: 0x065f46,
        roughness: 0.38,
      });
      const pack = new THREE.Mesh(packGeo, packMat);
      pack.position.y = 0.175;
      pack.castShadow = true;
      group.add(pack);

      const coreGeo = new THREE.BoxGeometry(0.17, 0.17, 0.16);
      const coreMat = new THREE.MeshStandardMaterial({
        color: 0x10b981,
        emissive: 0x10b981,
        emissiveIntensity: 0.8,
      });
      const core = new THREE.Mesh(coreGeo, coreMat);
      core.position.y = 0.2;
      group.add(core);
      break;
    }

    case "inverter": {
      // 6. Dönüştürücü (Endüstriyel Kutu + Parlayan Mor Bobinler)
      const boxGeo = new THREE.BoxGeometry(0.29, 0.21, 0.25);
      const boxMat = new THREE.MeshStandardMaterial({
        color: 0x312e81,
        metalness: 0.65,
        roughness: 0.35,
      });
      const box = new THREE.Mesh(boxGeo, boxMat);
      box.position.y = 0.105;
      box.castShadow = true;
      group.add(box);

      const coilGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.15, 12);
      const coilMat = new THREE.MeshStandardMaterial({
        color: 0xc084fc,
        emissive: 0x9333ea,
        emissiveIntensity: 0.85,
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
      const bodyGeo = new THREE.BoxGeometry(0.22, 0.075, 0.37);
      const bodyMat = new THREE.MeshStandardMaterial({
        color: 0x292524,
        roughness: 0.45,
      });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.y = 0.04;
      body.castShadow = true;
      group.add(body);

      const scrGeo = new THREE.BoxGeometry(0.16, 0.018, 0.13);
      const scrMat = new THREE.MeshStandardMaterial({
        color: 0xfbbf24,
        emissive: 0xd97706,
        emissiveIntensity: 0.85,
      });
      const scr = new THREE.Mesh(scrGeo, scrMat);
      scr.position.set(0, 0.08, -0.07);
      group.add(scr);

      const antGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.24, 8);
      const ant = new THREE.Mesh(antGeo, bodyMat);
      ant.position.set(0.075, 0.15, -0.15);
      group.add(ant);
      break;
    }

    case "adrenaline": {
      // 8. Adrenalin Şırıngası (3D Enjektör + Parlayan Kırmızı Sıvı + İğne)
      const tubeGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.34, 12);
      const tubeMat = new THREE.MeshStandardMaterial({
        color: 0xfef2f2,
        transparent: true,
        opacity: 0.7,
      });
      const tube = new THREE.Mesh(tubeGeo, tubeMat);
      tube.rotation.z = Math.PI / 2;
      tube.position.y = 0.09;
      group.add(tube);

      const liqGeo = new THREE.CylinderGeometry(0.046, 0.046, 0.22, 12);
      const liqMat = new THREE.MeshStandardMaterial({
        color: 0xef4444,
        emissive: 0xdc2626,
        emissiveIntensity: 0.9,
      });
      const liq = new THREE.Mesh(liqGeo, liqMat);
      liq.rotation.z = Math.PI / 2;
      liq.position.y = 0.09;
      group.add(liq);

      const needleGeo = new THREE.CylinderGeometry(0.01, 0.01, 0.17, 8);
      const needleMat = new THREE.MeshStandardMaterial({
        color: 0xe2e8f0,
        metalness: 0.92,
      });
      const needle = new THREE.Mesh(needleGeo, needleMat);
      needle.rotation.z = Math.PI / 2;
      needle.position.set(0.23, 0.09, 0);
      group.add(needle);
      break;
    }

    case "expiredMed": {
      // 9. Bozuk İlaç Kutusu (Kehribar Hap Şişesi + Beyaz Kapak)
      const botGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.31, 14);
      const botMat = new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        emissive: 0xb45309,
        emissiveIntensity: 0.25,
        roughness: 0.28,
      });
      const bot = new THREE.Mesh(botGeo, botMat);
      bot.position.y = 0.155;
      bot.castShadow = true;
      group.add(bot);

      const capGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.075, 14);
      const capMat = new THREE.MeshStandardMaterial({
        color: 0xf8fafc,
        roughness: 0.35,
      });
      const cap = new THREE.Mesh(capGeo, capMat);
      cap.position.y = 0.33;
      group.add(cap);
      break;
    }
  }

  // Tüm 3D eşyaları %28 büyüt (Akıllı tahtada uzaktan bile net seçilsin)
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
    color: 0x2c3329, // Koyu haki / kömür kauçuk
    roughness: 0.62,
    metalness: 0.12,
  });
  const darkMetalMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    metalness: 0.85,
    roughness: 0.28,
  });
  const lensMat = new THREE.MeshStandardMaterial({
    color: 0xd97706,
    emissive: 0x78350f,
    emissiveIntensity: 0.55,
    metalness: 0.9,
    roughness: 0.1,
  });
  const hoseMat = new THREE.MeshStandardMaterial({
    color: 0x141614,
    roughness: 0.78,
  });
  const filterCanMat = new THREE.MeshStandardMaterial({
    color: 0x364935,
    metalness: 0.65,
    roughness: 0.42,
  });

  // 1. Yuvarlak Hatlı GP-5 Kauçuk Başlık (Küre + Elmacık/Çene kubbesi)
  const cranium = new THREE.Mesh(
    new THREE.SphereGeometry(0.62, 20, 18),
    rubberMat
  );
  cranium.scale.set(0.95, 1.12, 1.02);
  cranium.castShadow = true;
  head.add(cranium);

  // Alt yüz / çene kauçuk uzantısı
  const jawCone = new THREE.Mesh(
    new THREE.CylinderGeometry(0.46, 0.34, 0.55, 16),
    rubberMat
  );
  jawCone.position.set(0, -0.32, 0.12);
  head.add(jawCone);

  // 2. Dışa Çıkık Metal Çerçeveli İki Büyük Yuvarlak Cam Mercek
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

  // 3. Burun-Ağız Metal Solunum Valfi Izgarası (Snout)
  const snout = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.22, 0.34, 16),
    darkMetalMat
  );
  snout.rotation.x = Math.PI / 2 + 0.32;
  snout.position.set(0, -0.26, 0.58);
  head.add(snout);

  // Solunum ızgarası halkaları
  for (let r = -1; r <= 1; r++) {
    const slot = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.025, 0.04),
      hoseMat
    );
    slot.position.set(0, -0.32 + r * 0.055, 0.74);
    head.add(slot);
  }

  // 4. Kıvrımlı Siyah Solunum Hortumu (TubeGeometry)
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

  // 5. Yana/Aşağı Sarkan Silindirik Metal Hava Filtresi Tüpü
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

  // 1. Pürüzsüz Kavisli Oval Porselen Yüz (Küre + Elmacık & Çene)
  const faceDome = new THREE.Mesh(
    new THREE.SphereGeometry(0.6, 22, 20),
    porcelainMat
  );
  faceDome.scale.set(0.92, 1.18, 0.88);
  faceDome.castShadow = true;
  head.add(faceDome);

  // Sivri elmacık kemikleri
  [-0.32, 0.32].forEach((cx) => {
    const cheek = new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 14, 12),
      porcelainMat
    );
    cheek.scale.set(1.1, 0.75, 0.9);
    cheek.position.set(cx, -0.06, 0.34);
    head.add(cheek);
  });

  // Kavisli burun sırtı
  const nose = new THREE.Mesh(
    new THREE.ConeGeometry(0.11, 0.36, 10),
    porcelainMat
  );
  nose.position.set(0, 0.04, 0.54);
  nose.rotation.x = 0.22;
  head.add(nose);

  // 2. Çukur Karanlık Göz Oyukları + Minik Soluk Işık Parıltısı
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

  // 3. Geniş Karanlık Sırıtış + 3D Konik Sivri Dişler
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

    // Üst sivri diş
    const upperTooth = new THREE.Mesh(
      new THREE.ConeGeometry(0.032, 0.11, 8),
      toothMat
    );
    upperTooth.rotation.x = Math.PI;
    upperTooth.position.set(tx, -0.24, tz);
    head.add(upperTooth);

    // Alt sivri diş
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

  // Yuvarlatılmış Avuç Gövdesi
  const palm = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 14, 12),
    mainMat
  );
  palm.scale.set(0.95, 0.45, 1.15);
  palm.castShadow = true;
  hGroup.add(palm);

  // Taktik eklem koruyucu veya sargı şeridi
  const knuckleGuard = new THREE.Mesh(
    new THREE.BoxGeometry(0.38, 0.06, 0.12),
    accentMat
  );
  knuckleGuard.position.set(0, 0.08, 0.16);
  hGroup.add(knuckleGuard);

  // Bilek / Manşet
  const wrist = new THREE.Mesh(
    new THREE.CylinderGeometry(0.17, 0.2, 0.34, 12),
    accentMat
  );
  wrist.rotation.x = Math.PI / 2;
  wrist.position.set(0, 0.02, -0.32);
  hGroup.add(wrist);

  // 4 Boğumlu Yuvarlak Parmak
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

  // Başparmak
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
    root.rotation.y = Math.PI; // +Z'deki oyuncu -Z'ye (masaya) bakar
  }

  const isGasMaskDefault = !isP1AtPlusZ; // -Z (Oyuncu 2): Gaz Maskeli Savaşçı, +Z (Oyuncu 1): Porselen Maskeli

  // 1. Omuzlar ve Gövde (Ağır Dik Yakalı Palto veya Krupiye Yeleği)
  const torsoGroup = new THREE.Group();
  torsoGroup.position.set(0, 1.85, -0.15);

  const coatMat = new THREE.MeshStandardMaterial({
    color: isGasMaskDefault ? 0x1f241d : 0x1c1917,
    roughness: 0.82,
    metalness: 0.1,
  });
  const collarMat = new THREE.MeshStandardMaterial({
    color: isGasMaskDefault ? 0x2b3328 : 0x292524,
    roughness: 0.75,
  });

  // Göğüs ve Yuvarlak Omuzlar
  const chest = new THREE.Mesh(
    new THREE.CylinderGeometry(0.72, 0.88, 1.65, 16),
    coatMat
  );
  chest.scale.set(1.25, 1, 0.68);
  chest.castShadow = true;
  torsoGroup.add(chest);

  // Dik Yaka / Omuz Apoletleri
  const collar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.48, 0.58, 0.42, 16, 1, true),
    collarMat
  );
  collar.position.set(0, 0.78, 0.05);
  torsoGroup.add(collar);

  root.add(torsoGroup);

  // 2. Kafa / Maske Grubu
  const maskGroup = new THREE.Group();
  maskGroup.position.set(0, 2.98, 0.08);

  let gasMaskHeadGroup: THREE.Group | undefined;
  let porcelainHeadGroup: THREE.Group | undefined;

  if (!isP1AtPlusZ) {
    // -Z'deki karakter (Oyuncu 1'in karşısında gördüğü):
    // 2 Kişilik Düelloda Sovyet Gaz Maskeli Savaşçı, Solo modda AI Krupiye veya Gaz Maskeli!
    gasMaskHeadGroup = buildSovietGasMaskHead();
    porcelainHeadGroup = buildPorcelainNightmareHead();
    porcelainHeadGroup.visible = false;
    maskGroup.add(gasMaskHeadGroup, porcelainHeadGroup);
  } else {
    // +Z'deki karakter (Oyuncu 2'nin karşısında gördüğü): Çatlak Porselen Maskeli
    porcelainHeadGroup = buildPorcelainNightmareHead();
    maskGroup.add(porcelainHeadGroup);
  }

  root.add(maskGroup);

  // 3. 3D Eldivenli Eller
  const handStyle = isGasMaskDefault ? "tactical_leather" : "bandaged_dealer";
  const leftHand = buildDetailedHand(-1, handStyle);
  const rightHand = buildDetailedHand(1, handStyle);
  const baseLeftHandPos = new THREE.Vector3(-1.02, 1.34, 1.18);
  const baseRightHandPos = new THREE.Vector3(1.02, 1.34, 1.18);
  leftHand.position.copy(baseLeftHandPos);
  rightHand.position.copy(baseRightHandPos);
  root.add(leftHand, rightHand);

  // 4. Bileklerde 3D Kelepçe Modeli
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

  // 5. Tüfek Eldeyken Karşıdaki Rakip Maskesi Üzerinde Beliren 3D Kırmızı Hedef Nişangahı + Geniş Hitbox
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
  const badgePlane = new THREE.Mesh(new THREE.PlaneGeometry(1.85, 0.46), badgeMat);
  badgePlane.position.set(0, -0.92, 0.15);
  badgePlane.renderOrder = 10;
  targetReticleGroup.add(badgePlane);

  targetReticleGroup.visible = false;
  root.add(targetReticleGroup);

  // Rakip Gövde + Maske Geniş Dokunma Kutusu (Tüfek eldeyken doğrudan rakibe dokunarak ateşleme!)
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

  private muzzleLight: THREE.PointLight;
  private spot1: THREE.SpotLight;
  private spot2: THREE.SpotLight;

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

  // Kendi Göğüs Bölgesi 3D "KENDİNE DOĞRULT & SIK" Nişangah Hedefleri
  private selfTargetP1!: THREE.Group;
  private selfTargetP2!: THREE.Group;
  private tableCancelHitBox!: THREE.Mesh;

  // 8'li 3D Eşya Yuvaları
  private p1SlotPositions: THREE.Vector3[] = [];
  private p2SlotPositions: THREE.Vector3[] = [];
  private p1ItemMeshes: (THREE.Group | null)[] = Array(8).fill(null);
  private p2ItemMeshes: (THREE.Group | null)[] = Array(8).fill(null);
  private p1GlowPads: THREE.Mesh[] = [];
  private p2GlowPads: THREE.Mesh[] = [];
  private interactiveTargets: THREE.Object3D[] = [];

  // Dinamik Parçacık ve Kovan Listeleri
  private ejectedShells: Ejected3DShell[] = [];
  private sparks: SparkParticle[] = [];
  private activeItemAnim: ActiveItemAnim | null = null;

  // Kamera ve Karakter Sarsıntı / Geri Tepme Durumları
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
    this.scene.fog = new THREE.FogExp2(0x0b0706, 0.068);

    // Kamera 1 (Oyuncu 1: +Z ucunda oturur, -Z'ye bakar — Split-Screen için geniş FOV 74!)
    this.camP1 = new THREE.PerspectiveCamera(74, 1, 0.1, 45);
    this.camP1.layers.enable(0);
    this.camP1.layers.enable(1); // Karşıdaki Oyuncu 2 (Gaz Maskeli) ve kendi hedeflerini görür

    // Kamera 2 (Oyuncu 2: -Z ucunda oturur, +Z'ye bakar — Split-Screen için geniş FOV 74!)
    this.camP2 = new THREE.PerspectiveCamera(74, 1, 0.1, 45);
    this.camP2.layers.enable(0);
    this.camP2.layers.enable(2); // Karşıdaki Oyuncu 1 (Porselen Maskeli) ve kendi hedeflerini görür

    // Güçlendirilmiş Işıklandırma + Karakter Arka Rim Light Spotları
    const ambient = new THREE.AmbientLight(0x4a2e20, 1.45);
    this.scene.add(ambient);

    this.spot1 = new THREE.SpotLight(
      0xffbe64,
      26,
      22,
      Math.PI / 2.6,
      0.5,
      1.1
    );
    this.spot1.position.set(-1.2, 5.6, 0.5);
    this.spot1.castShadow = true;
    this.scene.add(this.spot1);
    this.scene.add(this.spot1.target);

    this.spot2 = new THREE.SpotLight(
      0xffa94d,
      24,
      22,
      Math.PI / 2.6,
      0.5,
      1.1
    );
    this.spot2.position.set(1.2, 5.6, -0.5);
    this.spot2.castShadow = true;
    this.scene.add(this.spot2);
    this.scene.add(this.spot2.target);

    // 2 Karakterin Üzerine Düşen Arka-Üst Rim Light (Maske ve omuz detaylarını parlatır)
    const rimLightP2 = new THREE.PointLight(0xffb454, 10, 8);
    rimLightP2.position.set(0, 4.1, -3.55);
    this.scene.add(rimLightP2);

    const rimLightP1 = new THREE.PointLight(0x93c5fd, 10, 8);
    rimLightP1.position.set(0, 4.1, 3.55);
    this.scene.add(rimLightP1);

    this.muzzleLight = new THREE.PointLight(0xff7700, 0, 12);
    this.muzzleLight.position.set(0, 1.4, 0);
    this.scene.add(this.muzzleLight);

    // Oda, Masa, Kablolar, Hoparlörler ve Monitörü İnşa Et
    this.initSlotCoordinates();
    this.buildUndergroundRoom();
    this.shotgunGroup = this.build3DShotgun();
    this.scene.add(this.shotgunGroup);

    // Kesilen namlu ucu (El testeresi kullanıldığında masada duran çift borulu parça)
    this.severedBarrelOnTable = this.buildSeveredBarrelPiece();
    this.severedBarrelOnTable.position.set(0.68, 0.99, 0.36);
    this.severedBarrelOnTable.rotation.y = 0.48;
    this.severedBarrelOnTable.visible = false;
    this.scene.add(this.severedBarrelOnTable);

    // Sol Kenarda 8'li Mermi Dizilim Tepsisi
    this.shellTrayGroup = new THREE.Group();
    this.shellTrayGroup.position.set(-2.32, 0.98, 0);
    this.scene.add(this.shellTrayGroup);

    // Karşıdaki Karakter Modelleri (Biri Gaz Maskeli, Diğeri Çatlak Porselen Maskeli!)
    this.avatarP2 = createAvatarRig(false, 1); // -Z'de, Layer 1 (camP1 görür)
    this.avatarP1 = createAvatarRig(true, 2); // +Z'de, Layer 2 (camP2 görür)
    this.scene.add(this.avatarP2.root);
    this.scene.add(this.avatarP1.root);

    // Kendi Göğüs Bölgesinde Beliren "KENDİNE DOĞRULT & SIK" 3D Hedef Halkaları
    this.selfTargetP1 = this.buildSelfTargetReticle(1);
    this.selfTargetP2 = this.buildSelfTargetReticle(2);
    this.scene.add(this.selfTargetP1);
    this.scene.add(this.selfTargetP2);

    // Güvenli WebGL Başlatma (StrictMode ve ContextLost Korumalı)
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
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.BasicShadowMap;
      this.renderer.setClearColor(0x070504, 1);
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

  private initSlotCoordinates(): void {
    // 50/50 Split-Screen kadrajına kusursuz oturan 8'li eşya koordinatları
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
    // Oyuncunun kendi yakın masa kenarı / göğüs hizası
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
    const badge = new THREE.Mesh(new THREE.PlaneGeometry(1.75, 0.44), badgeMat);
    badge.position.set(0, 0.24, 0);
    badge.rotation.x = -0.35;
    badge.renderOrder = 12;
    group.add(badge);

    // Geniş Dokunma Hitbox'ı
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

  private buildUndergroundRoom(): void {
    const feltTex = createFeltTableTexture();
    const brickTex = createGrungeBrickTexture();
    const rustTex = createRustyMetalTexture();

    // 1. Masa Üstü (Kirli Yeşil Çuha + Tebeşir Çizgileri)
    const tableGeo = new THREE.BoxGeometry(6.2, 0.16, 6.2);
    const tableMaterials = [
      new THREE.MeshStandardMaterial({ map: rustTex, roughness: 0.8 }),
      new THREE.MeshStandardMaterial({ map: rustTex, roughness: 0.8 }),
      new THREE.MeshStandardMaterial({
        map: feltTex,
        roughness: 0.86,
        metalness: 0.05,
      }),
      new THREE.MeshStandardMaterial({ map: rustTex, roughness: 0.9 }),
      new THREE.MeshStandardMaterial({ map: rustTex, roughness: 0.8 }),
      new THREE.MeshStandardMaterial({ map: rustTex, roughness: 0.8 }),
    ];
    const tableMesh = new THREE.Mesh(tableGeo, tableMaterials);
    tableMesh.position.set(0, 0.88, 0);
    tableMesh.receiveShadow = true;
    tableMesh.userData = { hitType: "table_cancel" };
    this.tableCancelHitBox = tableMesh;
    this.scene.add(tableMesh);

    // Masa Kenar Metal Bordürleri
    const rimMat = new THREE.MeshStandardMaterial({
      map: rustTex,
      metalness: 0.7,
      roughness: 0.55,
    });
    const rimFB = new THREE.BoxGeometry(6.44, 0.24, 0.18);
    const rimNorth = new THREE.Mesh(rimFB, rimMat);
    rimNorth.position.set(0, 0.91, -3.15);
    const rimSouth = new THREE.Mesh(rimFB, rimMat);
    rimSouth.position.set(0, 0.91, 3.15);

    const rimLR = new THREE.BoxGeometry(0.18, 0.24, 6.44);
    const rimWest = new THREE.Mesh(rimLR, rimMat);
    rimWest.position.set(-3.15, 0.91, 0);
    const rimEast = new THREE.Mesh(rimLR, rimMat);
    rimEast.position.set(3.15, 0.91, 0);
    this.scene.add(rimNorth, rimSouth, rimWest, rimEast);

    // 2. Tuğla Oda Duvarları ve Zemin
    const roomGeo = new THREE.BoxGeometry(16, 9, 16);
    const roomMat = new THREE.MeshStandardMaterial({
      map: brickTex,
      side: THREE.BackSide,
      roughness: 0.92,
    });
    const roomMesh = new THREE.Mesh(roomGeo, roomMat);
    roomMesh.position.set(0, 3.8, 0);
    this.scene.add(roomMesh);

    // 3. Tavanda Çelik Kirişler & Endüstriyel Sahne Spot Kapakları
    const beamMat = new THREE.MeshStandardMaterial({
      color: 0x18181b,
      metalness: 0.8,
      roughness: 0.5,
    });
    for (let z = -4; z <= 4; z += 4) {
      const beam = new THREE.Mesh(
        new THREE.BoxGeometry(15.5, 0.28, 0.32),
        beamMat
      );
      beam.position.set(0, 6.2, z);
      this.scene.add(beam);
    }

    const hoodGeo = new THREE.ConeGeometry(0.42, 0.45, 10, 1, true);
    const hoodMat = new THREE.MeshStandardMaterial({
      color: 0x27272a,
      metalness: 0.7,
      roughness: 0.4,
      side: THREE.DoubleSide,
    });
    [-1.1, 1.1].forEach((lx) => {
      const hood = new THREE.Mesh(hoodGeo, hoodMat);
      hood.position.set(lx, 5.45, 0);
      this.scene.add(hood);

      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xffedd5 })
      );
      bulb.position.set(lx, 5.32, 0);
      this.scene.add(bulb);
    });

    // 4. Tavandan Sarkan Siyah Endüstriyel Kablolar
    const cableMat = new THREE.MeshStandardMaterial({
      color: 0x09090b,
      roughness: 0.7,
    });
    const cablePaths = [
      [
        new THREE.Vector3(-1.1, 6.2, 0),
        new THREE.Vector3(-1.35, 5.7, 0.3),
        new THREE.Vector3(-1.1, 5.45, 0),
      ],
      [
        new THREE.Vector3(1.1, 6.2, 0),
        new THREE.Vector3(1.4, 5.75, -0.25),
        new THREE.Vector3(1.1, 5.45, 0),
      ],
      [
        new THREE.Vector3(2.8, 6.2, 1.2),
        new THREE.Vector3(2.9, 3.6, 0.6),
        new THREE.Vector3(2.45, 1.75, 0),
      ],
      [
        new THREE.Vector3(-3.8, 6.2, -3.5),
        new THREE.Vector3(-4.2, 3.8, -4.1),
        new THREE.Vector3(-4.8, 1.5, -4.5),
      ],
    ];
    cablePaths.forEach((pts) => {
      const curve = new THREE.CatmullRomCurve3(pts);
      const tubeGeo = new THREE.TubeGeometry(curve, 16, 0.035, 6, false);
      const cable = new THREE.Mesh(tubeGeo, cableMat);
      this.scene.add(cable);
    });

    // 5. Köşelerde Eski Kabin Hoparlörler
    const speakerMat = new THREE.MeshStandardMaterial({
      color: 0x141210,
      roughness: 0.85,
    });
    const coneMat = new THREE.MeshStandardMaterial({
      color: 0x292524,
      roughness: 0.6,
    });
    const cornerCoords = [
      new THREE.Vector3(-5.2, 1.8, -5.2),
      new THREE.Vector3(5.2, 1.8, -5.2),
      new THREE.Vector3(-5.2, 1.8, 5.2),
      new THREE.Vector3(5.2, 1.8, 5.2),
    ];
    cornerCoords.forEach((pos) => {
      const cab = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 3.4, 1.2),
        speakerMat
      );
      cab.position.copy(pos);
      this.scene.add(cab);

      const woofer = new THREE.Mesh(
        new THREE.CylinderGeometry(0.42, 0.25, 0.15, 12),
        coneMat
      );
      woofer.rotation.x = Math.PI / 2;
      woofer.position.set(
        pos.x,
        pos.y + 0.5,
        pos.z > 0 ? pos.z - 0.62 : pos.z + 0.62
      );
      this.scene.add(woofer);
    });

    // 6. Masanın Sağ Kenarında (+X) 3D Defibrilatör / Şarj Monitörü (Yeşil LED Çubuklu)
    const monGroup = new THREE.Group();
    monGroup.position.set(2.46, 1.42, 0);

    const casing = new THREE.Mesh(
      new THREE.BoxGeometry(0.58, 0.9, 1.32),
      new THREE.MeshStandardMaterial({
        map: rustTex,
        metalness: 0.65,
        roughness: 0.45,
      })
    );
    casing.castShadow = true;
    monGroup.add(casing);

    const screenPlane = new THREE.Mesh(
      new THREE.BoxGeometry(0.62, 0.72, 1.12),
      new THREE.MeshBasicMaterial({ color: 0x050a07 })
    );
    monGroup.add(screenPlane);

    for (let i = 0; i < 5; i++) {
      const ledGeo = new THREE.BoxGeometry(0.66, 0.085, 0.4);
      const p1Mat = new THREE.MeshStandardMaterial({
        color: 0x22c55e,
        emissive: 0x22c55e,
        emissiveIntensity: 0.9,
      });
      const p1Led = new THREE.Mesh(ledGeo, p1Mat);
      p1Led.position.set(0, -0.24 + i * 0.12, 0.28);
      monGroup.add(p1Led);
      this.p1Leds.push(p1Led);

      const p2Mat = new THREE.MeshStandardMaterial({
        color: 0x22c55e,
        emissive: 0x22c55e,
        emissiveIntensity: 0.9,
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
    this.cutWireSparkMesh.position.set(0, 0.55, 0);
    this.cutWireSparkMesh.visible = false;
    monGroup.add(this.cutWireSparkMesh);

    this.scene.add(monGroup);
  }

  // ============================================================================
  // YÜKSEK DETAYLI 3D POMPALI TÜFEK (REMINGTON 870 / MOSSBERG STİLİ)
  // ============================================================================
  private build3DShotgun(): THREE.Group {
    const gun = new THREE.Group();
    gun.position.set(0, 1.07, 0);

    const walnutTex = createWalnutWoodTexture();
    const steelTex = createBrushedSteelTexture();

    const woodMat = new THREE.MeshStandardMaterial({
      map: walnutTex,
      color: 0x6b3410,
      roughness: 0.52,
      metalness: 0.08,
    });
    const rubberPadMat = new THREE.MeshStandardMaterial({
      color: 0x111315,
      roughness: 0.88,
    });
    const brushedSteelMat = new THREE.MeshStandardMaterial({
      map: steelTex,
      color: 0x3b4859,
      metalness: 0.86,
      roughness: 0.28,
    });
    const darkBarrelSteelMat = new THREE.MeshStandardMaterial({
      map: steelTex,
      color: 0x1e293b,
      metalness: 0.9,
      roughness: 0.26,
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

    // 1. CEVİZ AĞACI ERGONOMİK DİPÇİK (ExtrudeGeometry ile gerçek tüfek dipçiği kesiti)
    const stockShape = new THREE.Shape();
    stockShape.moveTo(-0.34, 0.04); // Gövde bağlantısı üst
    stockShape.lineTo(-0.52, -0.02); // Kabza (Pistol grip) üst kavis
    stockShape.quadraticCurveTo(-0.66, -0.02, -1.16, -0.08); // Üst yanak (Comb)
    stockShape.lineTo(-1.18, -0.34); // Dipçik arkası (Butt heel -> toe)
    stockShape.lineTo(-0.66, -0.22); // Alt kenar
    stockShape.quadraticCurveTo(-0.52, -0.24, -0.44, -0.14); // Kabza alt çıkıntısı
    stockShape.lineTo(-0.34, -0.08); // Gövde bağlantısı alt
    stockShape.closePath();

    const stockGeo = new THREE.ExtrudeGeometry(stockShape, {
      depth: 0.1,
      bevelEnabled: true,
      bevelThickness: 0.024,
      bevelSize: 0.022,
      bevelSegments: 3,
    });
    // Extrude X-Y düzlemindedir; Y=yukarı, Z=uzunluk olacak şekilde döndür
    stockGeo.rotateY(Math.PI / 2);
    stockGeo.center();

    const stockMesh = new THREE.Mesh(stockGeo, woodMat);
    stockMesh.position.set(0, -0.08, -0.78);
    stockMesh.castShadow = true;
    gun.add(stockMesh);

    // Siyah Kauçuk Dipçik Pedi (Recoil Pad)
    const recoilPad = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.28, 0.06),
      rubberPadMat
    );
    recoilPad.position.set(0, -0.12, -1.21);
    recoilPad.rotation.x = 0.08;
    gun.add(recoilPad);

    // 2. MEKANİZMA GÖVDESİ (RECEIVER) & FİŞEK TAHLİYE PENCERESİ (EJECTION PORT)
    const receiverGroup = new THREE.Group();
    receiverGroup.position.set(0, 0.02, -0.16);

    // Gövde alt ve sol blok
    const recBase = new THREE.Mesh(
      new THREE.BoxGeometry(0.165, 0.2, 0.62),
      brushedSteelMat
    );
    recBase.castShadow = true;
    receiverGroup.add(recBase);

    // Gövde üst kambur sırtı (Pah kırılmış profil)
    const recTop = new THREE.Mesh(
      new THREE.CylinderGeometry(0.082, 0.082, 0.62, 12),
      brushedSteelMat
    );
    recTop.rotation.x = Math.PI / 2;
    recTop.position.y = 0.08;
    receiverGroup.add(recTop);

    // Sağ Yanda Gerçek Fişek Tahliye Penceresi Oyuğu (Ejection Port)
    const portCavity = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, 0.09, 0.24),
      new THREE.MeshBasicMaterial({ color: 0x05070a })
    );
    portCavity.position.set(0.072, 0.04, 0.05);
    receiverGroup.add(portCavity);

    // Fişek Yatağı İçindeki 3D Fişek (Pompa çekildiğinde veya Büyüteç basıldığında görünür!)
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

    // Hareketli Krom Mekanizma Sürgüsü (Bolt Carrier — Kapalıyken fişeği örter, açıldığında geri kayar)
    this.boltCarrierMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.022, 0.086, 0.235),
      chromeBoltMat
    );
    this.boltCarrierMesh.position.set(0.078, 0.04, 0.05);
    receiverGroup.add(this.boltCarrierMesh);

    // Alt Tetik Korkuluğu Halkası (Trigger Guard) ve Kıvrımlı Metal Tetik
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

    // 3. ÇELİK ÇİFT BORU: ÜST NAMLU + HAVALANDIRMALI ŞERİT (VENT RIB) + ALT ŞARJÖR BORUSU
    // Arka Namlu Yarısı (Sabit Kalan Kısım: z = 0.14 .. 0.84)
    const rearBarrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.048, 0.054, 0.72, 16),
      darkBarrelSteelMat
    );
    rearBarrel.rotation.x = Math.PI / 2;
    rearBarrel.position.set(0, 0.088, 0.49);
    rearBarrel.castShadow = true;
    gun.add(rearBarrel);

    // Arka Havalandırmalı Üst Şerit (Vent Rib)
    const rearRib = new THREE.Mesh(
      new THREE.BoxGeometry(0.028, 0.022, 0.7),
      darkBarrelSteelMat
    );
    rearRib.position.set(0, 0.142, 0.49);
    gun.add(rearRib);

    // Kesik Namlu Ucunda Parlak Taze Metal Halka (Sawed-Off olduğunda kesim yerinde parlar!)
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

    // Alt Şarjör Borusu (Magazine Tube) + Tırtıklı Ön Kapak
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

    // Ön Namlu Grubu (El Testeresi kullanıldığında kesilip düşen kısım: z = 0.85 .. 1.53)
    this.frontBarrelGroup = new THREE.Group();

    const frontBarrelCyl = new THREE.Mesh(
      new THREE.CylinderGeometry(0.046, 0.048, 0.68, 16),
      darkBarrelSteelMat
    );
    frontBarrelCyl.rotation.x = Math.PI / 2;
    frontBarrelCyl.position.set(0, 0.088, 1.19);
    frontBarrelCyl.castShadow = true;
    this.frontBarrelGroup.add(frontBarrelCyl);

    // Namlu Ucunda Karanlık Oyuk (Hollow Bore)
    const muzzleHole = new THREE.Mesh(
      new THREE.CircleGeometry(0.038, 14),
      new THREE.MeshBasicMaterial({ color: 0x020202 })
    );
    muzzleHole.position.set(0, 0.088, 1.532);
    this.frontBarrelGroup.add(muzzleHole);

    // Ön Havalandırmalı Şerit (Vent Rib)
    const frontRib = new THREE.Mesh(
      new THREE.BoxGeometry(0.026, 0.022, 0.66),
      darkBarrelSteelMat
    );
    frontRib.position.set(0, 0.14, 1.18);
    this.frontBarrelGroup.add(frontRib);

    // Pirinç Arpacık (Brass Front Bead Sight)
    const beadSight = new THREE.Mesh(
      new THREE.SphereGeometry(0.018, 8, 8),
      brassBeadMat
    );
    beadSight.position.set(0, 0.16, 1.48);
    this.frontBarrelGroup.add(beadSight);

    // Namlu ile Alt Boruyu Bağlayan Metal Kelepçe (Barrel Clamp)
    const clamp = new THREE.Mesh(
      new THREE.BoxGeometry(0.11, 0.16, 0.06),
      brushedSteelMat
    );
    clamp.position.set(0, 0.045, 0.94);
    this.frontBarrelGroup.add(clamp);

    gun.add(this.frontBarrelGroup);

    // 4. OLUKLU CEVİZ POMPA EL KUNDAĞI (CORNCOB FOREND — İleri-Geri Kayar)
    this.shotgunPumpGroup = new THREE.Group();
    this.shotgunPumpGroup.position.set(0, -0.005, 0.54);

    const forendCore = new THREE.Mesh(
      new THREE.CylinderGeometry(0.068, 0.064, 0.44, 14),
      woodMat
    );
    forendCore.rotation.x = Math.PI / 2;
    forendCore.castShadow = true;
    this.shotgunPumpGroup.add(forendCore);

    // Yatay oluk halkaları (Ribbed grooves)
    for (let r = -3; r <= 3; r++) {
      const grooveRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.067, 0.007, 8, 16),
        woodMat
      );
      grooveRing.position.set(0, 0, r * 0.052);
      this.shotgunPumpGroup.add(grooveRing);
    }

    // Çift Çelik Kızak Çubuğu (Action Bars)
    [-0.048, 0.048].forEach((bx) => {
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(0.012, 0.022, 0.38),
        chromeBoltMat
      );
      bar.position.set(bx, 0.02, -0.26);
      this.shotgunPumpGroup.add(bar);
    });

    gun.add(this.shotgunPumpGroup);

    // Raycast için görünmez geniş dokunma kutusu (Akıllı tahtada kolay seçilsin)
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

  // React State Güncellemelerini 3D Sahneye Yansıt
  public syncState(next: Buckshot3DStateSnapshot): void {
    const prevSawed = this.currentState.isSawedOff;
    this.currentState = next;

    // 1. Kesik Namlu (Sawed-off) durumu (Testere animasyonu sürerken kesim sonunda gizlenir)
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

    // 2. Tahliye Penceresindeki (Ejection Port) Fişek Rengi
    if (next.currentChamberShell) {
      const isLive = next.currentChamberShell === "live";
      this.chamberShellMat.color.setHex(isLive ? 0xdc2626 : 0x2563eb);
      this.chamberShellMat.emissive.setHex(isLive ? 0x991b1b : 0x1d4ed8);
    }

    // 3. Karakter Modellerini Mod'a Göre Senkronize Et:
    // 2 Kişilik Düelloda: Oyuncu 1'in karşısında (avatarP2) Gaz Maskeli Savaşçı, Oyuncu 2'nin karşısında (avatarP1) Porselen Maskeli!
    // Tek Kişilik (Solo) Modda: AI Krupiye Çatlak Porselen Maskeli (veya her iki karakter de özgün)!
    if (this.avatarP2.gasMaskHeadGroup && this.avatarP2.porcelainHeadGroup) {
      const showGasMask = next.mode === "duel";
      this.avatarP2.gasMaskHeadGroup.visible = showGasMask;
      this.avatarP2.porcelainHeadGroup.visible = !showGasMask;
    }

    // 4. Kelepçe 3D modelleri
    this.avatarP1.cuffsGroup.visible = next.p1Cuffed;
    this.avatarP2.cuffsGroup.visible = next.p2Cuffed;

    // 5. Tüfek Eldeyken 3D Hedef Nişangahlarını (Rakip Maskesi & Kendi Göğsü) Göster
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

    // 6. 3D Defibrilatör Şarj Monitörü LED'leri
    for (let i = 0; i < 5; i++) {
      const p1On = i < next.p1Hp && i < next.maxHp;
      const p1Led = this.p1Leds[i];
      p1Led.visible = i < next.maxHp;
      const mat1 = p1Led.material as THREE.MeshStandardMaterial;
      if (p1On) {
        const col = next.wiresCutSuddenDeath ? 0xef4444 : 0x22c55e;
        mat1.color.setHex(col);
        mat1.emissive.setHex(col);
        mat1.emissiveIntensity = 0.95;
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
        mat2.emissiveIntensity = 0.95;
      } else {
        mat2.color.setHex(0x141e18);
        mat2.emissive.setHex(0x000000);
        mat2.emissiveIntensity = 0;
      }
    }
    this.cutWireSparkMesh.visible = next.wiresCutSuddenDeath;

    // 7. Mermi Dizilim Tepsisi (Yeni Şarjör Başlangıcında 3D Kırmızı/Mavi Fişekler)
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

    // 8. Masadaki 8'li 3D Eşya Modellerini, Kehribar Parlamalarını ve 3D Tebeşir Etiketlerini Senkronize Et
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

      // 3D Eşya Modeli (%28 büyütülmüş)
      const itemMesh = create3DItemModel(itemKey);
      wrapper.add(itemMesh);

      // Sıcak Kehribar / Kırmızı Taban Parlaması (Sırası gelen oyuncunun eşyalarında parlar)
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

      // Masa Yüzeyine Paralel Zarif 3D Tebeşir / Diegetic Etiket Yazısı (Örn: TESTERE, BÜYÜTEÇ, ADRENALİN)
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
      labelPlane.rotation.x = -Math.PI / 2.35; // Kameraya doğru hafif eğimli masa etiketi
      labelPlane.position.set(0, 0.06, 0.35);
      wrapper.add(labelPlane);

      // Akıllı Tahtada Parmakla Iskalamamak İçin Geniş Görünmez Hitbox (THREE.BoxGeometry)
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
      roughness: 0.4,
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

  // Pompalı *ŞAK-ŞAK* Kurma ve 3D Kovan Fırlatma Efekti
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
      rotVel: new THREE.Vector3(
        0.24,
        0.36 * (Math.random() - 0.5),
        0.28
      ),
      settled: false,
      bounces: 0,
    });

    if (this.ejectedShells.length > 10) {
      const oldest = this.ejectedShells.shift();
      if (oldest) this.scene.remove(oldest.mesh);
    }
  }

  // 3D Eşya Kullanım Animasyonu (3D El Uzanıp Kavrar + Testere Kesimi / Büyüteç Tahliye Penceresi)
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

    // Büyüteç kullanıldığında tüfeğin sağ yanındaki Fişek Tahliye Penceresini (Ejection Port) aç!
    if (itemKey === "magnifier") {
      this.inspectingChamberTimer = 2.4;
    }

    // El Testeresi kullanıldığında namlu ortasında ileri-geri sürtünme + kıvılcım + ön namlunun kopup düşmesi!
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

  // Ateşleme Sinematik Efekti (Namlu Alevi, Geri Tepme, Vurulan Karakterin ve Ekranın Savrulması)
  public triggerShotEffect(
    shooterSeat: 1 | 2,
    targetSeat: 1 | 2,
    shellType: ShellType,
    isSawedOff: boolean
  ): void {
    this.pumpOffsetZ = -0.25;

    if (shellType === "live") {
      this.muzzleFlashTimer = 0.24;
      this.muzzleLight.intensity = isSawedOff ? 40 : 28;

      const barrelTipZ = targetSeat === 1 ? 1.15 : -1.15;
      this.muzzleLight.position.set(0, 1.38, barrelTipZ);

      this.spawnSparks(
        new THREE.Vector3(0, 1.32, barrelTipZ),
        0xff6b00,
        isSawedOff ? 38 : 24
      );

      // Ateş eden kamerada geri tepme, vurulan kamerada ve 3D karakterde şiddetli savrulma!
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
      // BOŞ Fişek: hafif tetik titremesi
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

  // BÖLÜNMÜŞ EKRAN (DUAL-VIEWPORT) MILİMETRİK 3D RAYCASTING (FOV 74 / 66 SENKRONİZE)
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

    // Retro PS1 Dither Çözünürlük Çarpanı
    const retroScale = 0.68;
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

    // 1. Sallanan Sahne Spot Işıkları
    this.spot1.position.x = -1.2 + Math.sin(elapsed * 1.1) * 0.18;
    this.spot2.position.x = 1.2 + Math.cos(elapsed * 0.95) * 0.18;

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
      this.inspectingChamberTimer = Math.max(0, this.inspectingChamberTimer - dt);
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

        // Kopan namlu ucu döne döne masaya düşsün!
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
    let targetGunRotY = Math.PI / 2; // Masada yatay duruş
    let targetGunRotX = 0;

    if (st.gunAim === "p2") {
      // Namlu -Z'deki Oyuncu 2 / Krupiye yüzüne doğrulur!
      targetGunY = 1.54;
      targetGunZ = -0.25;
      targetGunRotY = Math.PI;
      targetGunRotX = -0.07;
    } else if (st.gunAim === "p1") {
      // Namlu +Z'deki Oyuncu 1 yüzüne doğrulur!
      targetGunY = 1.54;
      targetGunZ = 0.25;
      targetGunRotY = 0;
      targetGunRotX = -0.07;
    } else if (st.gunPickedUpBy === 1) {
      // Oyuncu 1 tüfeği eline aldı: ellerin kavrama hizasına yükselir
      targetGunY = 1.38;
      targetGunZ = 0.55;
      targetGunRotY = Math.PI * 0.92;
      targetGunRotX = -0.04;
    } else if (st.gunPickedUpBy === 2) {
      // Oyuncu 2 tüfeği eline aldı
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

    // 7. İki Farklı 3D Karakterin Canlı Tepkileri:
    // Nefes alma, sıra kendisindeyken masaya yaklaşma, tüfek doğrultulduğunda irkilme, vurulduğunda geriye savrulma, eşya/tüfek tutma!
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
      const hitRecoil = seat === 1 ? this.avatar1HitRecoil : this.avatar2HitRecoil;
      const zSign = seat === 1 ? 1 : -1;

      // Gövde ve Kafa Z/Y Konumu (Sırada öne eğilme, nişanda irkilme, vurulunca geriye savrulma)
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

      // 3D Hedef Nişangahı Halkası Dönüşü
      if (av.targetReticleGroup.visible) {
        av.targetReticleGroup.children[0].rotation.z = elapsed * 1.6;
        av.targetReticleGroup.children[1].rotation.z = -elapsed * 2.4;
      }

      // 3D Ellerin Canlı Konumu (Eşyaya uzanma, tüfeği kavrama, savunma veya masaya yaklaşma)
      let leftTarget = av.baseLeftHandPos.clone();
      let rightTarget = av.baseRightHandPos.clone();

      if (this.activeItemAnim && this.activeItemAnim.userSeat === seat) {
        // Masadaki 3D eşyaya dokunulduğu an el eşyaya uzanıp kavrar!
        const itemWorld = this.activeItemAnim.mesh.position.clone();
        const localTarget = av.root.worldToLocal(itemWorld);
        if (localTarget.x < 0) {
          leftTarget.copy(localTarget);
        } else {
          rightTarget.copy(localTarget);
        }
      } else if (isHoldingShotgun) {
        // Tüfek eldeyken 3D eller tüfeğin kabza ve pompa kundağına uzanır
        leftTarget.set(-0.32, 1.38, 2.75);
        rightTarget.set(0.32, 1.38, 2.45);
      } else if (isAimedAtMe) {
        // Yüzüne tüfek doğrultulduğunda ellerini hafifçe yukarı kaldırıp irkilir
        leftTarget.set(-0.78, 1.85, 0.92);
        rightTarget.set(0.78, 1.85, 0.92);
      } else if (isMyTurn) {
        // Sıra kendisindeyken ellerini masaya yaklaştırır
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

    // 11. Kameraların Konum, Bakış Açısı ve Head-Bob / Breathing (Genişletilmiş FOV 74 / 66 ile Tam Masa Hakimiyeti!)
    this.cam1Shake = Math.max(0, this.cam1Shake - dt * 1.1);
    this.cam2Shake = Math.max(0, this.cam2Shake - dt * 1.1);
    this.cam1Knockback = THREE.MathUtils.lerp(this.cam1Knockback, 0, dt * 4.5);
    this.cam2Knockback = THREE.MathUtils.lerp(this.cam2Knockback, 0, dt * 4.5);

    const isRevealing =
      st.revealShells !== null && st.revealShells.length > 0;

    // Oyuncu tüfeği eline aldığında veya eşya kullandığında hafif dinamik yakınlaşma/eğilme
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

    // Kamera 1 (+Z Oyuncu 1 Gözü — Geriye ve hafif yukarı çekilmiş tam masa kadrajı)
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

    // Kamera 2 (-Z Oyuncu 2 Gözü — Geriye ve hafif yukarı çekilmiş tam masa kadrajı)
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
      // Tek Kişilik Tam Ekran: FOV 66
      this.renderer.setScissorTest(false);
      this.renderer.setViewport(0, 0, w, h);
      this.camP1.fov = 66;
      this.camP1.aspect = w / h;
      this.camP1.updateProjectionMatrix();
      this.renderer.render(this.scene, this.camP1);
    } else {
      // 2 KİŞİLİK DÜELLO: %50 SOL (camP1) + %50 SAĞ (camP2) DUAL-POV SPLIT-SCREEN (FOV 74)!
      const halfW = Math.floor(w / 2);
      this.renderer.setScissorTest(true);

      // 1) Sol Yarı: Oyuncu 1 Gözü (+Z'den -Z'ye bakar, FOV 74)
      this.renderer.setViewport(0, 0, halfW, h);
      this.renderer.setScissor(0, 0, halfW, h);
      this.camP1.fov = 74;
      this.camP1.aspect = halfW / h;
      this.camP1.updateProjectionMatrix();
      this.renderer.render(this.scene, this.camP1);

      // 2) Sağ Yarı: Oyuncu 2 Gözü (-Z'den +Z'ye bakar, FOV 74)
      this.renderer.setViewport(halfW, 0, w - halfW, h);
      this.renderer.setScissor(halfW, 0, w - halfW, h);
      this.camP2.fov = 74;
      this.camP2.aspect = (w - halfW) / h;
      this.camP2.updateProjectionMatrix();
      this.renderer.render(this.scene, this.camP2);
    }
  }

  // Tam WebGL Bellek Temizliği (forceContextLoss kullanmadan dinamik canvas silinir)
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
          m.dispose();
        });
      }
    });

    this.renderer?.dispose();
    this.renderer = null;
    this.canvas.remove();
  }
}
