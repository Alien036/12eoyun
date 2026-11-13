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
}

export interface RaycastHitResult {
  viewportSeat: 1 | 2;
  hitType: "shotgun" | "item" | "none";
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
  grad.addColorStop(0, "rgba(34, 78, 50, 0.45)");
  grad.addColorStop(0.65, "rgba(15, 35, 24, 0.55)");
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
      : `rgba(62, 118, 80, ${Math.random() * 0.14})`;
    ctx.fillRect(x, y, 2 + Math.random() * 3, 2 + Math.random() * 3);
  }

  // Koyu yağ ve barut lekeleri
  for (let s = 0; s < 28; s++) {
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
  ctx.strokeStyle = "rgba(226, 232, 220, 0.68)";
  ctx.lineWidth = 4;

  // Dış çerçeve çizgisi
  ctx.strokeRect(42, 42, 940, 940);

  // Orta Tüfek Dikdörtgeni ve Nişangah Çizgileri
  ctx.strokeStyle = "rgba(235, 240, 230, 0.75)";
  ctx.lineWidth = 3.5;
  ctx.strokeRect(272, 430, 480, 164);

  ctx.beginPath();
  ctx.moveTo(240, 512);
  ctx.lineTo(784, 512);
  ctx.moveTo(512, 405);
  ctx.lineTo(512, 619);
  ctx.stroke();

  // Sol Kenar: 8'li Mermi Dizilim Kutucukları (Mermi Tepsisi Yeri)
  ctx.strokeStyle = "rgba(245, 158, 11, 0.65)";
  ctx.strokeRect(68, 360, 145, 304);
  for (let m = 0; m < 8; m++) {
    const my = 374 + m * 35;
    ctx.strokeRect(84, my, 112, 26);
  }

  // Oyuncu 1 (+Z / Alt Yarı) ve Oyuncu 2 (-Z / Üst Yarı) için 8'li Eşya Kutucukları
  // Her oyuncunun solunda 4 (2x2), sağında 4 (2x2) tebeşir kare
  ctx.strokeStyle = "rgba(232, 238, 228, 0.78)";
  ctx.lineWidth = 3.5;

  const drawPlayerItemGrid = (isP1Bottom: boolean) => {
    const rowY1 = isP1Bottom ? 670 : 140;
    const rowY2 = isP1Bottom ? 790 : 260;
    const xColsLeft = [180, 305];
    const xColsRight = [615, 740];
    const boxSize = 98;

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
      // Köşe çentikleri
      ctx.fillStyle = "rgba(232, 238, 228, 0.25)";
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

  // Kir ve is lekeleri
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

// ============================================================================
// 9 FİZİKSEL 3D EŞYA MODELİ ÜRETİCİSİ
// ============================================================================

function create3DItemModel(itemKey: BuckshotItemKey): THREE.Group {
  const group = new THREE.Group();

  switch (itemKey) {
    case "soda": {
      // 1. Teneke İçecek Kutusu (Silindir 3D Kutu + Gümüş Kapak)
      const bodyGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.44, 12);
      const bodyMat = new THREE.MeshStandardMaterial({
        color: 0x0284c7,
        roughness: 0.35,
        metalness: 0.65,
      });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.y = 0.22;
      body.castShadow = true;
      group.add(body);

      const stripeGeo = new THREE.CylinderGeometry(0.163, 0.163, 0.14, 12);
      const stripeMat = new THREE.MeshStandardMaterial({
        color: 0xe11d48,
        roughness: 0.4,
      });
      const stripe = new THREE.Mesh(stripeGeo, stripeMat);
      stripe.position.y = 0.24;
      group.add(stripe);

      const topGeo = new THREE.CylinderGeometry(0.145, 0.155, 0.03, 12);
      const topMat = new THREE.MeshStandardMaterial({
        color: 0xcbd5e1,
        metalness: 0.85,
        roughness: 0.2,
      });
      const top = new THREE.Mesh(topGeo, topMat);
      top.position.y = 0.445;
      group.add(top);
      break;
    }

    case "handcuffs": {
      // 2. Metal Kelepçe (Çift Halka + Zincir)
      const metalMat = new THREE.MeshStandardMaterial({
        color: 0x94a3b8,
        metalness: 0.85,
        roughness: 0.28,
      });
      const cuffGeo = new THREE.TorusGeometry(0.14, 0.028, 8, 16);

      const leftCuff = new THREE.Mesh(cuffGeo, metalMat);
      leftCuff.rotation.x = Math.PI / 2;
      leftCuff.position.set(-0.15, 0.04, 0);
      leftCuff.castShadow = true;
      group.add(leftCuff);

      const rightCuff = new THREE.Mesh(cuffGeo, metalMat);
      rightCuff.rotation.x = Math.PI / 2;
      rightCuff.position.set(0.15, 0.04, 0);
      rightCuff.castShadow = true;
      group.add(rightCuff);

      const linkGeo = new THREE.BoxGeometry(0.12, 0.025, 0.04);
      const link = new THREE.Mesh(linkGeo, metalMat);
      link.position.set(0, 0.04, 0);
      group.add(link);
      break;
    }

    case "handsaw": {
      // 3. Katlanır El Testeresi (Kıvrımlı Ahşap Sap + Dişli Çelik Bıçak)
      const handleGeo = new THREE.BoxGeometry(0.14, 0.09, 0.28);
      const handleMat = new THREE.MeshStandardMaterial({
        color: 0x7c2d12,
        roughness: 0.7,
      });
      const handle = new THREE.Mesh(handleGeo, handleMat);
      handle.position.set(-0.12, 0.06, 0.05);
      handle.rotation.y = 0.25;
      handle.castShadow = true;
      group.add(handle);

      const bladeGeo = new THREE.BoxGeometry(0.36, 0.018, 0.09);
      const bladeMat = new THREE.MeshStandardMaterial({
        color: 0xd1d5db,
        metalness: 0.9,
        roughness: 0.2,
      });
      const blade = new THREE.Mesh(bladeGeo, bladeMat);
      blade.position.set(0.11, 0.06, -0.02);
      blade.castShadow = true;
      group.add(blade);
      break;
    }

    case "magnifier": {
      // 4. Büyüteç (Pirinç Çerçeve + Yarı Saydam Mercek + Sap)
      const rimGeo = new THREE.TorusGeometry(0.16, 0.025, 8, 18);
      const rimMat = new THREE.MeshStandardMaterial({
        color: 0xd97706,
        metalness: 0.8,
        roughness: 0.3,
      });
      const rim = new THREE.Mesh(rimGeo, rimMat);
      rim.rotation.x = Math.PI / 2;
      rim.position.set(0, 0.06, -0.06);
      rim.castShadow = true;
      group.add(rim);

      const lensGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.015, 16);
      const lensMat = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.52,
        roughness: 0.1,
      });
      const lens = new THREE.Mesh(lensGeo, lensMat);
      lens.position.set(0, 0.06, -0.06);
      group.add(lens);

      const stickGeo = new THREE.CylinderGeometry(0.026, 0.032, 0.22, 8);
      const stickMat = new THREE.MeshStandardMaterial({
        color: 0x292524,
        roughness: 0.6,
      });
      const stick = new THREE.Mesh(stickGeo, stickMat);
      stick.rotation.x = Math.PI / 2;
      stick.position.set(0, 0.06, 0.18);
      group.add(stick);
      break;
    }

    case "sedative": {
      // 5. Şarj Tüpü / Sigara Paketi (+1⚡ Yeşil Parlayan Kapsül)
      const packGeo = new THREE.BoxGeometry(0.24, 0.34, 0.14);
      const packMat = new THREE.MeshStandardMaterial({
        color: 0x065f46,
        roughness: 0.4,
      });
      const pack = new THREE.Mesh(packGeo, packMat);
      pack.position.y = 0.17;
      pack.castShadow = true;
      group.add(pack);

      const coreGeo = new THREE.BoxGeometry(0.16, 0.16, 0.15);
      const coreMat = new THREE.MeshStandardMaterial({
        color: 0x10b981,
        emissive: 0x10b981,
        emissiveIntensity: 0.65,
      });
      const core = new THREE.Mesh(coreGeo, coreMat);
      core.position.y = 0.2;
      group.add(core);
      break;
    }

    case "inverter": {
      // 6. Dönüştürücü (Endüstriyel Kutu + Bakır Bobinler)
      const boxGeo = new THREE.BoxGeometry(0.28, 0.2, 0.24);
      const boxMat = new THREE.MeshStandardMaterial({
        color: 0x1e1b4b,
        metalness: 0.6,
        roughness: 0.4,
      });
      const box = new THREE.Mesh(boxGeo, boxMat);
      box.position.y = 0.1;
      box.castShadow = true;
      group.add(box);

      const coilGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.14, 10);
      const coilMat = new THREE.MeshStandardMaterial({
        color: 0xa855f7,
        emissive: 0x9333ea,
        emissiveIntensity: 0.7,
      });
      const c1 = new THREE.Mesh(coilGeo, coilMat);
      c1.position.set(-0.06, 0.24, 0);
      const c2 = new THREE.Mesh(coilGeo, coilMat);
      c2.position.set(0.06, 0.24, 0);
      group.add(c1, c2);
      break;
    }

    case "burnerPhone": {
      // 7. Gizli Telefon (3D Tuşlu Retro Telefon + Anten)
      const bodyGeo = new THREE.BoxGeometry(0.2, 0.07, 0.36);
      const bodyMat = new THREE.MeshStandardMaterial({
        color: 0x1c1917,
        roughness: 0.5,
      });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.y = 0.04;
      body.castShadow = true;
      group.add(body);

      const scrGeo = new THREE.BoxGeometry(0.15, 0.015, 0.12);
      const scrMat = new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        emissive: 0xd97706,
        emissiveIntensity: 0.65,
      });
      const scr = new THREE.Mesh(scrGeo, scrMat);
      scr.position.set(0, 0.078, -0.07);
      group.add(scr);

      const antGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.22, 6);
      const ant = new THREE.Mesh(antGeo, bodyMat);
      ant.position.set(0.07, 0.14, -0.15);
      group.add(ant);
      break;
    }

    case "adrenaline": {
      // 8. Adrenalin Şırıngası (3D Enjektör + Parlayan Kırmızı Sıvı)
      const tubeGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.32, 10);
      const tubeMat = new THREE.MeshStandardMaterial({
        color: 0xfef2f2,
        transparent: true,
        opacity: 0.65,
      });
      const tube = new THREE.Mesh(tubeGeo, tubeMat);
      tube.rotation.z = Math.PI / 2;
      tube.position.y = 0.08;
      group.add(tube);

      const liqGeo = new THREE.CylinderGeometry(0.042, 0.042, 0.2, 10);
      const liqMat = new THREE.MeshStandardMaterial({
        color: 0xef4444,
        emissive: 0xdc2626,
        emissiveIntensity: 0.7,
      });
      const liq = new THREE.Mesh(liqGeo, liqMat);
      liq.rotation.z = Math.PI / 2;
      liq.position.y = 0.08;
      group.add(liq);

      const needleGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.16, 6);
      const needleMat = new THREE.MeshStandardMaterial({
        color: 0xe2e8f0,
        metalness: 0.9,
      });
      const needle = new THREE.Mesh(needleGeo, needleMat);
      needle.rotation.z = Math.PI / 2;
      needle.position.set(0.22, 0.08, 0);
      group.add(needle);
      break;
    }

    case "expiredMed": {
      // 9. Bozuk İlaç Kutusu (Kehribar Hap Şişesi + Beyaz Kapak)
      const botGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.3, 12);
      const botMat = new THREE.MeshStandardMaterial({
        color: 0xd97706,
        roughness: 0.3,
      });
      const bot = new THREE.Mesh(botGeo, botMat);
      bot.position.y = 0.15;
      bot.castShadow = true;
      group.add(bot);

      const capGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.07, 12);
      const capMat = new THREE.MeshStandardMaterial({
        color: 0xf8fafc,
        roughness: 0.4,
      });
      const cap = new THREE.Mesh(capGeo, capMat);
      cap.position.y = 0.32;
      group.add(cap);
      break;
    }
  }

  return group;
}

// ============================================================================
// KARŞIDAKİ KARAKTER MODELİ (ÜRKTÜCÜ SIRITAN MASKE + 3D ELDİVENLİ ELLER)
// ============================================================================

interface AvatarRig {
  root: THREE.Group;
  maskGroup: THREE.Group;
  leftHand: THREE.Group;
  rightHand: THREE.Group;
  cuffsGroup: THREE.Group;
  baseLeftHandPos: THREE.Vector3;
  baseRightHandPos: THREE.Vector3;
}

function createAvatarRig(isP1AtPlusZ: boolean, layerIndex: 1 | 2): AvatarRig {
  const root = new THREE.Group();
  const zSign = isP1AtPlusZ ? 1 : -1;
  root.position.set(0, 0, zSign * 4.25);
  if (isP1AtPlusZ) {
    root.rotation.y = Math.PI; // +Z'deki oyuncu -Z'ye (masaya) bakar
  }

  // Maske Grubu
  const maskGroup = new THREE.Group();
  maskGroup.position.set(0, 3.05, 0);

  const boneMat = new THREE.MeshStandardMaterial({
    color: isP1AtPlusZ ? 0xd6d3d1 : 0xe7e5e4,
    roughness: 0.65,
    metalness: 0.12,
  });
  const darkHoleMat = new THREE.MeshBasicMaterial({ color: 0x050505 });
  const eyeGlowMat = new THREE.MeshBasicMaterial({
    color: isP1AtPlusZ ? 0x38bdf8 : 0xef4444,
  });

  // Kafatası / Maske ana yüzeyi
  const headGeo = new THREE.BoxGeometry(1.15, 1.42, 0.75);
  const headMesh = new THREE.Mesh(headGeo, boneMat);
  headMesh.castShadow = true;
  maskGroup.add(headMesh);

  // Çene / Elmacık çıkıntıları
  const cheekGeo = new THREE.BoxGeometry(1.26, 0.42, 0.62);
  const cheekMesh = new THREE.Mesh(cheekGeo, boneMat);
  cheekMesh.position.set(0, -0.1, 0.1);
  maskGroup.add(cheekMesh);

  // Oyuk Göz Çukurları + Parlayan Gözbebekleri
  const eyeSocketGeo = new THREE.BoxGeometry(0.32, 0.24, 0.14);
  const leftSocket = new THREE.Mesh(eyeSocketGeo, darkHoleMat);
  leftSocket.position.set(-0.28, 0.22, 0.34);
  const rightSocket = new THREE.Mesh(eyeSocketGeo, darkHoleMat);
  rightSocket.position.set(0.28, 0.22, 0.34);
  maskGroup.add(leftSocket, rightSocket);

  const pupilGeo = new THREE.SphereGeometry(0.045, 8, 8);
  const leftPupil = new THREE.Mesh(pupilGeo, eyeGlowMat);
  leftPupil.position.set(-0.28, 0.22, 0.39);
  const rightPupil = new THREE.Mesh(pupilGeo, eyeGlowMat);
  rightPupil.position.set(0.28, 0.22, 0.39);
  maskGroup.add(leftPupil, rightPupil);

  // Korkunç Sırıtan Ağız ve Keskin Dişler
  const mouthGeo = new THREE.BoxGeometry(0.76, 0.28, 0.14);
  const mouth = new THREE.Mesh(mouthGeo, darkHoleMat);
  mouth.position.set(0, -0.36, 0.35);
  maskGroup.add(mouth);

  const toothGeo = new THREE.BoxGeometry(0.075, 0.22, 0.06);
  const toothMat = new THREE.MeshStandardMaterial({
    color: 0xfef3c7,
    roughness: 0.4,
  });
  for (let t = -3; t <= 3; t++) {
    const tooth = new THREE.Mesh(toothGeo, toothMat);
    tooth.position.set(t * 0.1, -0.36, 0.39);
    maskGroup.add(tooth);
  }

  root.add(maskGroup);

  // 3D Eldivenli Eller (Sol ve Sağ El)
  const buildGlovedHand = (side: -1 | 1): THREE.Group => {
    const hGroup = new THREE.Group();
    const gloveMat = new THREE.MeshStandardMaterial({
      color: 0x1c1917,
      roughness: 0.75,
      metalness: 0.15,
    });
    const cuffTrimMat = new THREE.MeshStandardMaterial({
      color: 0x44403c,
      roughness: 0.6,
    });

    const palm = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.16, 0.48),
      gloveMat
    );
    palm.castShadow = true;
    hGroup.add(palm);

    const wrist = new THREE.Mesh(
      new THREE.BoxGeometry(0.38, 0.18, 0.22),
      cuffTrimMat
    );
    wrist.position.set(0, 0.02, -0.32);
    hGroup.add(wrist);

    // 4 Parmak
    for (let f = 0; f < 4; f++) {
      const finger = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.12, 0.28),
        gloveMat
      );
      finger.position.set(-0.15 + f * 0.1, -0.02, 0.34);
      finger.rotation.x = 0.25;
      hGroup.add(finger);
    }

    // Başparmak
    const thumb = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.12, 0.22),
      gloveMat
    );
    thumb.position.set(side * -0.24, -0.02, 0.12);
    thumb.rotation.y = side * -0.4;
    hGroup.add(thumb);

    return hGroup;
  };

  const leftHand = buildGlovedHand(-1);
  const rightHand = buildGlovedHand(1);
  const baseLeftHandPos = new THREE.Vector3(-1.05, 1.38, 1.15);
  const baseRightHandPos = new THREE.Vector3(1.05, 1.38, 1.15);
  leftHand.position.copy(baseLeftHandPos);
  rightHand.position.copy(baseRightHandPos);
  root.add(leftHand, rightHand);

  // Bileklerde 3D Kelepçe Modeli (Kelepçelendiğinde görünür olur)
  const cuffsGroup = new THREE.Group();
  const steelMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    metalness: 0.9,
    roughness: 0.2,
  });
  const ringGeo = new THREE.TorusGeometry(0.24, 0.04, 8, 18);
  const lRing = new THREE.Mesh(ringGeo, steelMat);
  lRing.position.set(-1.05, 1.4, 0.95);
  const rRing = new THREE.Mesh(ringGeo, steelMat);
  rRing.position.set(1.05, 1.4, 0.95);
  const chainBar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.025, 2.1, 8),
    steelMat
  );
  chainBar.rotation.z = Math.PI / 2;
  chainBar.position.set(0, 1.4, 0.95);
  cuffsGroup.add(lRing, rRing, chainBar);
  cuffsGroup.visible = false;
  root.add(cuffsGroup);

  // Tüm alt objeleri ilgili THREE.Layers katmanına ata
  root.traverse((obj) => {
    obj.layers.set(layerIndex);
  });

  return {
    root,
    maskGroup,
    leftHand,
    rightHand,
    cuffsGroup,
    baseLeftHandPos,
    baseRightHandPos,
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

  // Sahne Referansları
  private shotgunGroup: THREE.Group;
  private shotgunPumpMesh!: THREE.Mesh;
  private frontBarrelMesh!: THREE.Mesh;
  private muzzleLight: THREE.PointLight;
  private spot1: THREE.SpotLight;
  private spot2: THREE.SpotLight;

  private severedBarrelOnTable: THREE.Mesh;
  private shellTrayGroup: THREE.Group;
  private p1Leds: THREE.Mesh[] = [];
  private p2Leds: THREE.Mesh[] = [];
  private cutWireSparkMesh!: THREE.Mesh;

  private avatarP1: AvatarRig;
  private avatarP2: AvatarRig;

  // 8'li 3D Eşya Yuvaları
  private p1SlotPositions: THREE.Vector3[] = [];
  private p2SlotPositions: THREE.Vector3[] = [];
  private p1ItemMeshes: (THREE.Group | null)[] = Array(8).fill(null);
  private p2ItemMeshes: (THREE.Group | null)[] = Array(8).fill(null);
  private interactiveTargets: THREE.Object3D[] = [];

  // Dinamik Parçacık ve Kovan Listeleri
  private ejectedShells: Ejected3DShell[] = [];
  private sparks: SparkParticle[] = [];
  private activeItemAnim: ActiveItemAnim | null = null;

  // Kamera Sarsıntı / Geri Tepme Durumları
  private cam1Shake: number = 0;
  private cam2Shake: number = 0;
  private cam1Knockback: number = 0;
  private cam2Knockback: number = 0;
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
  };

  private lastItemsHashP1: string = "";
  private lastItemsHashP2: string = "";
  private lastRevealHash: string = "";

  constructor(container: HTMLElement) {
    this.canvas = document.createElement("canvas");
    this.canvas.className = "w-full h-full block";
    this.canvas.style.imageRendering = "pixelated";
    container.appendChild(this.canvas);

    this.clock = new THREE.Clock();
    this.raycaster = new THREE.Raycaster();

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x0b0706, 0.085);

    // Kamera 1 (Oyuncu 1: +Z ucunda oturur, -Z'ye bakar)
    this.camP1 = new THREE.PerspectiveCamera(50, 1, 0.1, 45);
    this.camP1.layers.enable(0);
    this.camP1.layers.enable(1); // Karşıdaki Oyuncu 2 / Krupiye maskesini görür

    // Kamera 2 (Oyuncu 2: -Z ucunda oturur, +Z'ye bakar)
    this.camP2 = new THREE.PerspectiveCamera(50, 1, 0.1, 45);
    this.camP2.layers.enable(0);
    this.camP2.layers.enable(2); // Karşıdaki Oyuncu 1 maskesini görür

    // Işıklandırma
    const ambient = new THREE.AmbientLight(0x3a2318, 1.15);
    this.scene.add(ambient);

    this.spot1 = new THREE.SpotLight(0xffb454, 18, 18, Math.PI / 3.2, 0.55, 1.2);
    this.spot1.position.set(-1.1, 5.4, 0);
    this.spot1.castShadow = true;
    this.scene.add(this.spot1);
    this.scene.add(this.spot1.target);

    this.spot2 = new THREE.SpotLight(0xff9e44, 16, 18, Math.PI / 3.2, 0.55, 1.2);
    this.spot2.position.set(1.1, 5.4, 0);
    this.spot2.castShadow = true;
    this.scene.add(this.spot2);
    this.scene.add(this.spot2.target);

    this.muzzleLight = new THREE.PointLight(0xff7700, 0, 10);
    this.muzzleLight.position.set(0, 1.4, 0);
    this.scene.add(this.muzzleLight);

    // Oda, Masa, Kablolar, Hoparlörler ve Monitörü İnşa Et
    this.initSlotCoordinates();
    this.buildUndergroundRoom();
    this.shotgunGroup = this.build3DShotgun();
    this.scene.add(this.shotgunGroup);

    // Kesilen namlu ucu (El testeresi kullanıldığında masada görünür)
    const sevGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.65, 10);
    const sevMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.85,
      roughness: 0.3,
    });
    this.severedBarrelOnTable = new THREE.Mesh(sevGeo, sevMat);
    this.severedBarrelOnTable.rotation.z = Math.PI / 2;
    this.severedBarrelOnTable.rotation.y = 0.42;
    this.severedBarrelOnTable.position.set(0.65, 0.99, 0.35);
    this.severedBarrelOnTable.visible = false;
    this.scene.add(this.severedBarrelOnTable);

    // Sol Kenarda 8'li Mermi Dizilim Tepsisi
    this.shellTrayGroup = new THREE.Group();
    this.shellTrayGroup.position.set(-2.32, 0.98, 0);
    this.scene.add(this.shellTrayGroup);

    // Karşıdaki Karakter Modelleri (Maske + Eldivenli Eller)
    this.avatarP2 = createAvatarRig(false, 1); // -Z'de, Layer 1 (camP1 görür)
    this.avatarP1 = createAvatarRig(true, 2); // +Z'de, Layer 2 (camP2 görür)
    this.scene.add(this.avatarP2.root);
    this.scene.add(this.avatarP1.root);

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
        antialias: false, // Retro PS1 piksel keskinliği için antialias kapalı!
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
    // Oyuncu 1 (+Z tarafı) 8 eşya yuvası (Sol 4, Sağ 4)
    const p1Rows = [1.45, 2.28];
    const p1ColsLeft = [-1.92, -1.08];
    const p1ColsRight = [1.08, 1.92];

    this.p1SlotPositions = [
      new THREE.Vector3(p1ColsLeft[0], 0.96, p1Rows[0]),
      new THREE.Vector3(p1ColsLeft[1], 0.96, p1Rows[0]),
      new THREE.Vector3(p1ColsLeft[0], 0.96, p1Rows[1]),
      new THREE.Vector3(p1ColsLeft[1], 0.96, p1Rows[1]),
      new THREE.Vector3(p1ColsRight[0], 0.96, p1Rows[0]),
      new THREE.Vector3(p1ColsRight[1], 0.96, p1Rows[0]),
      new THREE.Vector3(p1ColsRight[0], 0.96, p1Rows[1]),
      new THREE.Vector3(p1ColsRight[1], 0.96, p1Rows[1]),
    ];

    // Oyuncu 2 (-Z tarafı) 8 eşya yuvası
    const p2Rows = [-1.45, -2.28];
    this.p2SlotPositions = [
      new THREE.Vector3(p1ColsLeft[0], 0.96, p2Rows[0]),
      new THREE.Vector3(p1ColsLeft[1], 0.96, p2Rows[0]),
      new THREE.Vector3(p1ColsLeft[0], 0.96, p2Rows[1]),
      new THREE.Vector3(p1ColsLeft[1], 0.96, p2Rows[1]),
      new THREE.Vector3(p1ColsRight[0], 0.96, p2Rows[0]),
      new THREE.Vector3(p1ColsRight[1], 0.96, p2Rows[0]),
      new THREE.Vector3(p1ColsRight[0], 0.96, p2Rows[1]),
      new THREE.Vector3(p1ColsRight[1], 0.96, p2Rows[1]),
    ];
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
        roughness: 0.88,
        metalness: 0.05,
      }),
      new THREE.MeshStandardMaterial({ map: rustTex, roughness: 0.9 }),
      new THREE.MeshStandardMaterial({ map: rustTex, roughness: 0.8 }),
      new THREE.MeshStandardMaterial({ map: rustTex, roughness: 0.8 }),
    ];
    const tableMesh = new THREE.Mesh(tableGeo, tableMaterials);
    tableMesh.position.set(0, 0.88, 0);
    tableMesh.receiveShadow = true;
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

    // 4. Tavandan Sarkan Siyah Endüstriyel Kablolar (CatmullRomCurve3 + TubeGeometry)
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
        new THREE.Vector3(2.55, 1.75, 0),
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

    // 5. Köşelerde Eski Kabin Hoparlörler & Cihaz Rafları
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
      woofer.position.set(pos.x, pos.y + 0.5, pos.z > 0 ? pos.z - 0.62 : pos.z + 0.62);
      this.scene.add(woofer);
    });

    // 6. Masanın Sağ Kenarında (+X) 3D Defibrilatör / Şarj Monitörü (Yeşil LED Çubuklu)
    const monGroup = new THREE.Group();
    monGroup.position.set(2.58, 1.42, 0);

    const casing = new THREE.Mesh(
      new THREE.BoxGeometry(0.62, 0.92, 1.35),
      new THREE.MeshStandardMaterial({
        map: rustTex,
        metalness: 0.65,
        roughness: 0.45,
      })
    );
    casing.castShadow = true;
    monGroup.add(casing);

    // Sol ve sağ ekran çerçevesi (her iki açıdan da LED'ler net görünsün)
    const screenPlane = new THREE.Mesh(
      new THREE.BoxGeometry(0.66, 0.74, 1.15),
      new THREE.MeshBasicMaterial({ color: 0x050a07 })
    );
    monGroup.add(screenPlane);

    // P1 (+Z tarafı) ve P2 (-Z tarafı) için 5'er adet 3D Parlayan LED Şarj Çubuğu
    for (let i = 0; i < 5; i++) {
      const ledGeo = new THREE.BoxGeometry(0.7, 0.085, 0.42);
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

    // Kesik Kablo (Sudden Death) kıvılcım göstergesi
    this.cutWireSparkMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xef4444 })
    );
    this.cutWireSparkMesh.position.set(0, 0.55, 0);
    this.cutWireSparkMesh.visible = false;
    monGroup.add(this.cutWireSparkMesh);

    this.scene.add(monGroup);
  }

  private build3DShotgun(): THREE.Group {
    const gun = new THREE.Group();
    gun.position.set(0, 1.05, 0);

    const woodMat = new THREE.MeshStandardMaterial({
      color: 0x5c2d0c,
      roughness: 0.65,
    });
    const steelMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.88,
      roughness: 0.28,
    });
    const darkSteelMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      metalness: 0.9,
      roughness: 0.35,
    });

    // Dipçik (Stock)
    const stock = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.22, 0.78),
      woodMat
    );
    stock.position.set(0, -0.04, -0.82);
    stock.rotation.x = 0.12;
    stock.castShadow = true;
    gun.add(stock);

    // Çelik Gövde (Receiver)
    const receiver = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.18, 0.58),
      steelMat
    );
    receiver.position.set(0, 0.02, -0.18);
    receiver.castShadow = true;
    gun.add(receiver);

    // Ana Namlu (Arka Yarı — Her zaman sabit)
    const rearBarrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.052, 0.055, 0.72, 12),
      darkSteelMat
    );
    rearBarrel.rotation.x = Math.PI / 2;
    rearBarrel.position.set(0, 0.075, 0.45);
    rearBarrel.castShadow = true;
    gun.add(rearBarrel);

    // Ön Namlu (El Testeresi kullanıldığında kesilip düşen kısım!)
    this.frontBarrelMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.052, 0.68, 12),
      darkSteelMat
    );
    this.frontBarrelMesh.rotation.x = Math.PI / 2;
    this.frontBarrelMesh.position.set(0, 0.075, 1.12);
    this.frontBarrelMesh.castShadow = true;
    gun.add(this.frontBarrelMesh);

    // Alt Şarjör Borusu
    const magTube = new THREE.Mesh(
      new THREE.CylinderGeometry(0.042, 0.042, 0.85, 10),
      steelMat
    );
    magTube.rotation.x = Math.PI / 2;
    magTube.position.set(0, 0.0, 0.52);
    gun.add(magTube);

    // Ahşap Pompa Kolu (Forend — *ŞAK-ŞAK* Hareketli)
    this.shotgunPumpMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.068, 0.068, 0.46, 10),
      woodMat
    );
    this.shotgunPumpMesh.rotation.x = Math.PI / 2;
    this.shotgunPumpMesh.position.set(0, -0.01, 0.52);
    this.shotgunPumpMesh.castShadow = true;
    gun.add(this.shotgunPumpMesh);

    // Raycast için görünmez geniş dokunma kutusu (Akıllı tahtada kolay seçilsin)
    const hitBox = new THREE.Mesh(
      new THREE.BoxGeometry(0.75, 0.5, 2.5),
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

  // React State Güncellemelerini 3D Sahneye Yansıt
  public syncState(next: Buckshot3DStateSnapshot): void {
    this.currentState = next;

    // 1. Kesik Namlu (Sawed-off) durumu
    this.frontBarrelMesh.visible = !next.isSawedOff;
    this.severedBarrelOnTable.visible = next.isSawedOff;

    // 2. Kelepçe 3D modelleri
    this.avatarP1.cuffsGroup.visible = next.p1Cuffed;
    this.avatarP2.cuffsGroup.visible = next.p2Cuffed;

    // 3. 3D Defibrilatör Şarj Monitörü LED'leri
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

    // 4. Mermi Dizilim Tepsisi (Yeni Şarjör Başlangıcında 3D Kırmızı/Mavi Fişekler)
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

    // 5. Masadaki 8'li 3D Eşya Modellerini Senkronize Et
    const hash1 = next.p1Items.map((x) => x || "_").join(",");
    const hash2 = next.p2Items.map((x) => x || "_").join(",");
    if (hash1 !== this.lastItemsHashP1 || hash2 !== this.lastItemsHashP2) {
      this.lastItemsHashP1 = hash1;
      this.lastItemsHashP2 = hash2;
      this.rebuildTableItems(next.p1Items, next.p2Items);
    }
  }

  private rebuildTableItems(
    p1List: (BuckshotItemKey | null)[],
    p2List: (BuckshotItemKey | null)[]
  ): void {
    // Mevcut eşya modellerini sahneden temizle
    this.p1ItemMeshes.forEach((m) => {
      if (m) this.scene.remove(m);
    });
    this.p2ItemMeshes.forEach((m) => {
      if (m) this.scene.remove(m);
    });
    this.p1ItemMeshes = Array(8).fill(null);
    this.p2ItemMeshes = Array(8).fill(null);
    this.interactiveTargets = [this.shotgunGroup];

    for (let i = 0; i < 8; i++) {
      const k1 = p1List[i];
      if (k1) {
        const model = create3DItemModel(k1);
        model.position.copy(this.p1SlotPositions[i]);
        // Dokunmayı kolaylaştıran görünmez hit-box
        const hitBox = new THREE.Mesh(
          new THREE.BoxGeometry(0.56, 0.56, 0.56),
          new THREE.MeshBasicMaterial({ visible: false })
        );
        hitBox.position.y = 0.22;
        model.add(hitBox);

        model.traverse((obj) => {
          obj.userData = {
            hitType: "item",
            trayOwner: 1,
            slotIndex: i,
            itemKey: k1,
          };
        });
        this.scene.add(model);
        this.p1ItemMeshes[i] = model;
        this.interactiveTargets.push(model);
      }

      const k2 = p2List[i];
      if (k2) {
        const model = create3DItemModel(k2);
        model.position.copy(this.p2SlotPositions[i]);
        model.rotation.y = Math.PI;
        const hitBox = new THREE.Mesh(
          new THREE.BoxGeometry(0.56, 0.56, 0.56),
          new THREE.MeshBasicMaterial({ visible: false })
        );
        hitBox.position.y = 0.22;
        model.add(hitBox);

        model.traverse((obj) => {
          obj.userData = {
            hitType: "item",
            trayOwner: 2,
            slotIndex: i,
            itemKey: k2,
          };
        });
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
    this.pumpOffsetZ = -0.22;
    const shellMesh = this.create3DShellMesh(type);
    shellMesh.position.set(0.08, 1.15, 0);
    this.scene.add(shellMesh);

    this.ejectedShells.push({
      mesh: shellMesh,
      vel: new THREE.Vector3(
        0.04 + Math.random() * 0.04,
        0.075 + Math.random() * 0.03,
        (Math.random() - 0.5) * 0.06
      ),
      rotVel: new THREE.Vector3(
        0.22,
        0.35 * (Math.random() - 0.5),
        0.28
      ),
      settled: false,
      bounces: 0,
    });

    // Fazla kovanları sınırla
    if (this.ejectedShells.length > 10) {
      const oldest = this.ejectedShells.shift();
      if (oldest) this.scene.remove(oldest.mesh);
    }
  }

  // 3D Eşya Kullanım Animasyonu (3D El Uzanıp Alır + Kıvılcım)
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
        ? new THREE.Vector3(0, 1.32, 0)
        : new THREE.Vector3(0, 1.55, userSeat === 1 ? 1.65 : -1.65);

    this.activeItemAnim = {
      mesh: animModel,
      userSeat,
      itemKey,
      startPos: startVec.clone(),
      targetPos: targetVec,
      progress: 0,
    };

    if (itemKey === "handsaw" || itemKey === "inverter") {
      this.spawnSparks(
        new THREE.Vector3(0, 1.18, 0.4),
        itemKey === "handsaw" ? 0xf97316 : 0xa855f7,
        22
      );
    }
  }

  // Ateşleme Sinematik Efekti (Namlu Alevi, Geri Tepme, Vurulan Ekranın Savrulması)
  public triggerShotEffect(
    shooterSeat: 1 | 2,
    targetSeat: 1 | 2,
    shellType: ShellType,
    isSawedOff: boolean
  ): void {
    this.pumpOffsetZ = -0.24;

    if (shellType === "live") {
      this.muzzleFlashTimer = 0.22;
      this.muzzleLight.intensity = isSawedOff ? 36 : 24;

      const barrelTipZ = targetSeat === 1 ? 1.15 : -1.15;
      this.muzzleLight.position.set(0, 1.35, barrelTipZ);

      this.spawnSparks(
        new THREE.Vector3(0, 1.28, barrelTipZ),
        0xff6b00,
        isSawedOff ? 34 : 22
      );

      // Ateş eden kamerada geri tepme, vurulan kamerada şiddetli sarsıntı ve geriye savrulma!
      if (shooterSeat === 1) this.cam1Shake = 0.22;
      if (shooterSeat === 2) this.cam2Shake = 0.22;

      if (targetSeat === 1) {
        this.cam1Shake = isSawedOff ? 0.68 : 0.48;
        this.cam1Knockback = isSawedOff ? 1.15 : 0.82;
      } else {
        this.cam2Shake = isSawedOff ? 0.68 : 0.48;
        this.cam2Knockback = isSawedOff ? 1.15 : 0.82;
      }
    } else {
      // BOŞ Fişek: hafif tetik titremesi
      if (shooterSeat === 1) this.cam1Shake = 0.05;
      else this.cam2Shake = 0.05;
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
          (Math.random() - 0.5) * 0.18,
          0.04 + Math.random() * 0.14,
          (Math.random() - 0.5) * 0.18
        ),
        life: 0,
        maxLife: 18 + Math.random() * 14,
      });
    }
  }

  // BÖLÜNMÜŞ EKRAN (DUAL-VIEWPORT) 3D RAYCASTING
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
        ndcX = ((relX - halfW) / halfW) * 2 - 1;
      }
    } else {
      viewportSeat = 1;
      ndcX = (relX / rect.width) * 2 - 1;
    }

    const activeCam = viewportSeat === 1 ? this.camP1 : this.camP2;
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), activeCam);

    const intersects = this.raycaster.intersectObjects(
      this.interactiveTargets,
      true
    );

    for (const hit of intersects) {
      let curr: THREE.Object3D | null = hit.object;
      while (curr) {
        if (curr.userData?.hitType === "shotgun") {
          return { viewportSeat, hitType: "shotgun" };
        }
        if (curr.userData?.hitType === "item") {
          return {
            viewportSeat,
            hitType: "item",
            trayOwner: curr.userData.trayOwner,
            slotIndex: curr.userData.slotIndex,
          };
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

    // Retro PS1 Dither Çözünürlük Çarpanı (Hem otantik piksel hissi hem de akıllı tahtada 60fps hız!)
    const retroScale = 0.65;
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
    this.spot1.position.x = -1.1 + Math.sin(elapsed * 1.1) * 0.18;
    this.spot2.position.x = 1.1 + Math.cos(elapsed * 0.95) * 0.18;

    // 2. Namlu Alevi Sönümlenmesi
    if (this.muzzleFlashTimer > 0) {
      this.muzzleFlashTimer -= dt;
      if (this.muzzleFlashTimer <= 0) {
        this.muzzleLight.intensity = 0;
      }
    }

    // 3. Pompa Kolu Geri Gelme Yay Fiziği
    this.pumpOffsetZ = THREE.MathUtils.lerp(this.pumpOffsetZ, 0, dt * 12);
    this.shotgunPumpMesh.position.z = 0.52 + this.pumpOffsetZ;

    // 4. Pompalı Tüfek Konum ve Hedef Doğrultma Fiziği
    let targetGunY = 1.05;
    let targetGunRotY = Math.PI / 2; // Masada yatay duruş
    let targetGunRotX = 0;

    if (st.gunAim === "p2") {
      // Namlu -Z'deki Oyuncu 2 / Krupiye yüzüne doğrulur!
      targetGunY = 1.48;
      targetGunRotY = Math.PI;
      targetGunRotX = -0.06;
    } else if (st.gunAim === "p1") {
      // Namlu +Z'deki Oyuncu 1 yüzüne doğrulur!
      targetGunY = 1.48;
      targetGunRotY = 0;
      targetGunRotX = -0.06;
    } else if (st.gunPickedUpBy === 1) {
      targetGunY = 1.32;
      targetGunRotY = Math.PI * 0.85;
    } else if (st.gunPickedUpBy === 2) {
      targetGunY = 1.32;
      targetGunRotY = Math.PI * 0.15;
    }

    this.shotgunGroup.position.y = THREE.MathUtils.lerp(
      this.shotgunGroup.position.y,
      targetGunY,
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

    // 5. Karşıdaki Maskelerin ve Eldivenli Ellerin Canlı Nefes Alma & Uzanma Hareketi
    [this.avatarP1, this.avatarP2].forEach((av, idx) => {
      const phaseOff = idx * 2.1;
      av.maskGroup.position.y =
        3.05 + Math.sin(elapsed * 2.2 + phaseOff) * 0.055;
      av.maskGroup.rotation.z = Math.sin(elapsed * 1.4 + phaseOff) * 0.035;

      av.leftHand.position.y =
        av.baseLeftHandPos.y + Math.sin(elapsed * 2.6 + phaseOff) * 0.04;
      av.rightHand.position.y =
        av.baseRightHandPos.y + Math.cos(elapsed * 2.6 + phaseOff) * 0.04;
    });

    // 6. Aktif 3D Eşya Kullanım Animasyonu
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

    // 7. Masaya Fırlatılan 3D Kovan Fiziği
    this.ejectedShells.forEach((sh) => {
      if (sh.settled) return;
      sh.mesh.position.add(sh.vel);
      sh.vel.y -= 0.0055; // Yerçekimi
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

    // 8. Kıvılcım Parçacıkları
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

    // 9. Kameraların Konum ve Bakış Noktası (Mermi Şovunda Yakın Çekim + Hasar Savrulması)
    this.cam1Shake = Math.max(0, this.cam1Shake - dt * 1.1);
    this.cam2Shake = Math.max(0, this.cam2Shake - dt * 1.1);
    this.cam1Knockback = THREE.MathUtils.lerp(this.cam1Knockback, 0, dt * 4.5);
    this.cam2Knockback = THREE.MathUtils.lerp(this.cam2Knockback, 0, dt * 4.5);

    const isRevealing =
      st.revealShells !== null && st.revealShells.length > 0;

    // Kamera 1 (+Z Oyuncu 1 Gözü)
    const p1BasePos = isRevealing
      ? new THREE.Vector3(-1.35, 2.35, 1.85)
      : new THREE.Vector3(0, 3.15 + this.cam1Knockback * 0.55, 4.55 + this.cam1Knockback * 1.35);
    const p1LookTarget = isRevealing
      ? new THREE.Vector3(-2.32, 1.02, 0)
      : new THREE.Vector3(0, 1.25 + this.cam1Knockback * 1.4, -0.4);

    if (this.cam1Shake > 0) {
      p1BasePos.x += (Math.random() - 0.5) * this.cam1Shake;
      p1BasePos.y += (Math.random() - 0.5) * this.cam1Shake;
    }
    this.camP1.position.lerp(p1BasePos, dt * 8);
    this.camP1.lookAt(p1LookTarget);

    // Kamera 2 (-Z Oyuncu 2 Gözü)
    const p2BasePos = isRevealing
      ? new THREE.Vector3(-1.35, 2.35, -1.85)
      : new THREE.Vector3(0, 3.15 + this.cam2Knockback * 0.55, -4.55 - this.cam2Knockback * 1.35);
    const p2LookTarget = isRevealing
      ? new THREE.Vector3(-2.32, 1.02, 0)
      : new THREE.Vector3(0, 1.25 + this.cam2Knockback * 1.4, 0.4);

    if (this.cam2Shake > 0) {
      p2BasePos.x += (Math.random() - 0.5) * this.cam2Shake;
      p2BasePos.y += (Math.random() - 0.5) * this.cam2Shake;
    }
    this.camP2.position.lerp(p2BasePos, dt * 8);
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
      this.camP1.aspect = w / h;
      this.camP1.updateProjectionMatrix();
      this.renderer.render(this.scene, this.camP1);
    } else {
      // 2 KİŞİLİK DÜELLO: %50 SOL (camP1) + %50 SAĞ (camP2) DUAL-POV SPLIT-SCREEN!
      const halfW = Math.floor(w / 2);
      this.renderer.setScissorTest(true);

      // 1) Sol Yarı: Oyuncu 1 Gözü (+Z'den -Z'ye bakar)
      this.renderer.setViewport(0, 0, halfW, h);
      this.renderer.setScissor(0, 0, halfW, h);
      this.camP1.aspect = halfW / h;
      this.camP1.updateProjectionMatrix();
      this.renderer.render(this.scene, this.camP1);

      // 2) Sağ Yarı: Oyuncu 2 Gözü (-Z'den +Z'ye bakar)
      this.renderer.setViewport(halfW, 0, w - halfW, h);
      this.renderer.setScissor(halfW, 0, w - halfW, h);
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

