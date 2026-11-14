import * as THREE from "three";
import type { BuckshotItemKey, ShellType } from "./BuckshotView";
import {
  ITEM_3D_LABELS,
  RetroBayerPostProcessor,
  buildDetailedHand,
  buildIndustrialRespiratorHead,
  buildPorcelainNightmareHead,
  buildRivetedWelderBallisticHead,
  buildSovietGasMaskHead,
  create3DItemModel,
  createBrushedSteelTexture,
  createChalkLabelTexture,
  createGrungeBrickTextures,
  createRustyMetalTextures,
  createTargetBadgeTexture,
  createWalnutWoodTextures,
} from "./Buckshot3DEngine";
import { sound } from "@/lib/sound";

export type OctagonSeat = 1 | 2 | 3 | 4;

export interface OctagonPlayerSnapshot {
  seat: OctagonSeat;
  name: string;
  hp: number;
  maxHp: number;
  alive: boolean;
  jammed: boolean;
  items: (BuckshotItemKey | null)[];
}

export interface BuckshotOctagon3DStateSnapshot {
  playerCount: 3 | 4;
  viewMode: "quad" | "active_fullscreen";
  turnSeat: OctagonSeat;
  turnDirection: 1 | -1; // 1 = Saat Yönü (1->2->3->4), -1 = Ters Yön (1->4->3->2)
  isSawedOff: boolean;
  players: OctagonPlayerSnapshot[];
  revealShells: ShellType[] | null;
  gunPickedUpBy: OctagonSeat | null;
  gunAimSeat: OctagonSeat | null;
  jammerPendingBy: OctagonSeat | null;
  adrenalineStealBy: OctagonSeat | null;
  currentChamberShell?: ShellType | null;
}

export interface OctagonRaycastHitResult {
  viewportSeat: OctagonSeat;
  hitType:
    | "shotgun"
    | "item"
    | "target_opponent"
    | "target_self"
    | "table_cancel"
    | "none";
  targetSeat?: OctagonSeat;
  trayOwner?: OctagonSeat;
  slotIndex?: number;
  itemKey?: BuckshotItemKey;
}

export interface OctagonCrateDealEntry {
  ownerSeat: OctagonSeat;
  slotIndex: number;
  itemKey: BuckshotItemKey;
}

interface OctagonCrateDealFlight {
  ownerSeat: OctagonSeat;
  slotIndex: number;
  itemKey: BuckshotItemKey;
  mesh: THREE.Group;
  curve: THREE.QuadraticBezierCurve3;
  targetPos: THREE.Vector3;
  targetRotY: number;
  startTime: number;
  duration: number;
  landed: boolean;
}

interface OctagonCrateRig {
  root: THREE.Group;
  lidPivot: THREE.Group;
  frontLatch: THREE.Mesh;
}

interface OctagonAvatarRig {
  seat: OctagonSeat;
  root: THREE.Group;
  torsoGroup: THREE.Group;
  maskGroup: THREE.Group;
  leftHand: THREE.Group;
  rightHand: THREE.Group;
  jammedSparkMesh: THREE.Mesh;
  targetReticleGroup: THREE.Group;
  targetBadgeMat: THREE.MeshBasicMaterial;
  baseLeftHandPos: THREE.Vector3;
  baseRightHandPos: THREE.Vector3;
  stationSpotlight: THREE.SpotLight;
  spotConeMesh: THREE.Mesh;
  monitorLeds: THREE.Mesh[];
  monitorJammedLight: THREE.Mesh;
}

interface EjectedOctagonShell {
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

// İstasyon Açıları (Saat Yönü: 1=Güney +Z, 2=Batı -X, 3=Kuzey -Z, 4=Doğu +X)
// Birinci şahıs kamerasından bakıldığında:
// Solunda bir sonraki saat yönü koltuk, Karşısında +2 koltuk, Sağında bir önceki koltuk oturur!
const SEAT_ANGLES: Record<OctagonSeat, number> = {
  1: 0, // Güney (+Z, merkeze -Z yönünde bakar)
  2: -Math.PI / 2, // Batı (-X, merkeze +X yönünde bakar)
  3: Math.PI, // Kuzey (-Z, merkeze +Z yönünde bakar)
  4: Math.PI / 2, // Doğu (+X, merkeze -X yönünde bakar)
};

function createOctagonFeltTextures(): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d")!;

  const bumpCanvas = document.createElement("canvas");
  bumpCanvas.width = 512;
  bumpCanvas.height = 512;
  const bCtx = bumpCanvas.getContext("2d")!;

  ctx.fillStyle = "#0e2217";
  ctx.fillRect(0, 0, 1024, 1024);

  bCtx.fillStyle = "#808080";
  bCtx.fillRect(0, 0, 512, 512);

  const grad = ctx.createRadialGradient(512, 512, 90, 512, 512, 500);
  grad.addColorStop(0, "rgba(38, 88, 58, 0.55)");
  grad.addColorStop(0.65, "rgba(13, 33, 21, 0.72)");
  grad.addColorStop(1, "rgba(3, 7, 5, 0.96)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1024, 1024);

  for (let i = 0; i < 18000; i++) {
    const x = Math.random() * 1024;
    const y = Math.random() * 1024;
    ctx.fillStyle =
      Math.random() < 0.6
        ? `rgba(2, 6, 4, ${Math.random() * 0.32})`
        : `rgba(62, 122, 82, ${Math.random() * 0.14})`;
    ctx.fillRect(x, y, 2.5, 2.5);
  }

  // Sekizgen dış tebeşir çerçevesi
  ctx.save();
  ctx.translate(512, 512);
  ctx.strokeStyle = "rgba(226, 232, 220, 0.65)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const ang = (i * Math.PI) / 4 + Math.PI / 8;
    const r = 455;
    const px = Math.cos(ang) * r;
    const py = Math.sin(ang) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.stroke();

  // Merkez beyaz tebeşir çember ve taret halkası şablon çizgileri
  ctx.strokeStyle = "rgba(236, 240, 232, 0.85)";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(0, 0, 152, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = "rgba(245, 158, 11, 0.62)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, 138, 0, Math.PI * 2);
  ctx.stroke();

  // 4 İstasyon için Beyaz Eşya Izgaraları, Gömülü Siyah Sandık Kapağı (Recessed Black Hatch) ve "DO NOT CROSS" şablon baskıları
  for (let s = 0; s < 4; s++) {
    ctx.save();
    ctx.rotate((s * Math.PI) / 2);

    // "DO NOT CROSS" sarı-beyaz endüstriyel uyarı şeridi
    ctx.fillStyle = "rgba(245, 158, 11, 0.16)";
    ctx.fillRect(-165, 165, 330, 30);
    ctx.strokeStyle = "rgba(251, 191, 36, 0.65)";
    ctx.lineWidth = 2;
    ctx.strokeRect(-165, 165, 330, 30);

    ctx.font = "900 18px monospace";
    ctx.fillStyle = "rgba(253, 230, 138, 0.78)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("⚠ DO NOT CROSS ⚠", 0, 180);

    // Her oyuncunun tam ön ortasında gömülü siyah dikdörtgen sandık kapağı (Recessed Black Hatch)
    ctx.fillStyle = "#040507";
    ctx.fillRect(-38, 226, 76, 114);
    ctx.strokeStyle = "rgba(232, 238, 226, 0.72)";
    ctx.lineWidth = 3;
    ctx.strokeRect(-38, 226, 76, 114);

    // Sol 4 ve Sağ 4 beyaz eşya yuvası
    ctx.strokeStyle = "rgba(232, 238, 226, 0.78)";
    ctx.lineWidth = 3.5;
    const cols = [-168, -98, 42, 112];
    const rows = [218, 292];
    cols.forEach((cx) => {
      rows.forEach((ry) => {
        ctx.strokeRect(cx, ry, 56, 56);
      });
    });

    ctx.restore();
  }
  ctx.restore();

  const map = new THREE.CanvasTexture(canvas);
  map.magFilter = THREE.NearestFilter;
  map.minFilter = THREE.NearestFilter;
  map.needsUpdate = true;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.needsUpdate = true;

  return { map, bumpMap };
}

export class BuckshotOctagon3DEngine {
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer | null = null;
  private postProcessor!: RetroBayerPostProcessor;
  public initError: string | null = null;
  private scene: THREE.Scene;

  // 4 Oyuncu Kamerası + 1 CCTV Tepe Kamerası + 1 Tam Ekran Yumuşak Geçiş Kamerası
  private playerCams: Record<OctagonSeat, THREE.PerspectiveCamera>;
  private cctvCam: THREE.PerspectiveCamera;
  private activeFullCam: THREE.PerspectiveCamera;
  private fullCamCurrentPos = new THREE.Vector3(0, 2.88, 4.78);
  private fullCamCurrentLook = new THREE.Vector3(0, 1.15, 0);

  private raycaster: THREE.Raycaster;
  private clock: THREE.Clock;
  private animFrameId: number | null = null;
  private disposed = false;

  // Merkezi Döner Taret Halkası & Pompalı Tüfek
  private turretRingGroup!: THREE.Group;
  private turretDirectionChevrons: THREE.Mesh[] = [];
  private turretTargetAngle = 0;
  private turretCurrentAngle = 0;

  private shotgunGroup!: THREE.Group;
  private shotgunPumpGroup!: THREE.Group;
  private frontBarrelGroup!: THREE.Group;
  private cutBarrelRingMesh!: THREE.Mesh;
  private boltCarrierMesh!: THREE.Mesh;
  private chamberShellMesh!: THREE.Mesh;
  private chamberShellMat!: THREE.MeshStandardMaterial;
  private pumpOffsetZ = 0;
  private muzzleLight!: THREE.PointLight;
  private muzzleFlashTimer = 0;
  private flashFramesRemaining = 0;

  // 4 İstasyon Avatarları, Demir Eşya Sandıkları, Eşya Yuvaları ve Göğüs Hedef Halkaları
  private avatars: Record<OctagonSeat, OctagonAvatarRig> = {} as Record<
    OctagonSeat,
    OctagonAvatarRig
  >;
  private crates: Record<OctagonSeat, OctagonCrateRig> = {} as Record<
    OctagonSeat,
    OctagonCrateRig
  >;
  private selfTargets: Record<OctagonSeat, THREE.Group> = {} as Record<
    OctagonSeat,
    THREE.Group
  >;
  private slotPositions: Record<OctagonSeat, THREE.Vector3[]> = {
    1: [],
    2: [],
    3: [],
    4: [],
  };
  private itemMeshes: Record<OctagonSeat, (THREE.Group | null)[]> = {
    1: Array(8).fill(null),
    2: Array(8).fill(null),
    3: Array(8).fill(null),
    4: Array(8).fill(null),
  };
  private glowPads: Record<OctagonSeat, THREE.Mesh[]> = {
    1: [],
    2: [],
    3: [],
    4: [],
  };

  private interactiveTargets: THREE.Object3D[] = [];
  private tableCancelHitBox!: THREE.Mesh;

  // 3D Mermi Gösterim Kutusu
  private shellTrayGroup!: THREE.Group;
  private shellTrayBoxGroup!: THREE.Group;

  // Sandık Eşya Dağıtım Sekansı
  private crateSequenceActive = false;
  private crateSequenceElapsed = 0;
  private crateRiseDur = 0.45;
  private crateLidOpenDur = 0.3;
  private crateRetractDur = 0.45;
  private crateTotalItemsDur = 0;
  private crateLidSoundPlayed = false;
  private crateSlamSoundPlayed = false;
  private crateFlights: OctagonCrateDealFlight[] = [];
  private onCrateItemLandedCb:
    | ((
        ownerSeat: OctagonSeat,
        slotIndex: number,
        itemKey: BuckshotItemKey
      ) => void)
    | null = null;
  private onCrateAllDoneCb: (() => void) | null = null;

  private ejectedShells: EjectedOctagonShell[] = [];
  private sparks: SparkParticle[] = [];
  private smokeClouds: {
    mesh: THREE.Mesh;
    vel: THREE.Vector3;
    life: number;
    maxLife: number;
    baseScale: number;
  }[] = [];
  private camShake: Record<OctagonSeat, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  private avatarHitRecoil: Record<OctagonSeat, number> = {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
  };

  private currentState: BuckshotOctagon3DStateSnapshot = {
    playerCount: 4,
    viewMode: "quad",
    turnSeat: 1,
    turnDirection: 1,
    isSawedOff: false,
    players: [
      {
        seat: 1,
        name: "OYUNCU 1",
        hp: 4,
        maxHp: 4,
        alive: true,
        jammed: false,
        items: Array(8).fill(null),
      },
      {
        seat: 2,
        name: "OYUNCU 2",
        hp: 4,
        maxHp: 4,
        alive: true,
        jammed: false,
        items: Array(8).fill(null),
      },
      {
        seat: 3,
        name: "OYUNCU 3",
        hp: 4,
        maxHp: 4,
        alive: true,
        jammed: false,
        items: Array(8).fill(null),
      },
      {
        seat: 4,
        name: "OYUNCU 4",
        hp: 4,
        maxHp: 4,
        alive: true,
        jammed: false,
        items: Array(8).fill(null),
      },
    ],
    revealShells: null,
    gunPickedUpBy: null,
    gunAimSeat: null,
    jammerPendingBy: null,
    adrenalineStealBy: null,
    currentChamberShell: null,
  };

  private lastItemsHash = "";
  private lastRevealHash = "";

  constructor(container: HTMLElement) {
    this.canvas = document.createElement("canvas");
    this.canvas.className = "w-full h-full block";
    this.canvas.style.imageRendering = "pixelated";
    container.appendChild(this.canvas);

    this.clock = new THREE.Clock();
    this.raycaster = new THREE.Raycaster();

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x020203, 0.095);

    // 4 Oyuncu Kamerası (THREE.Layers ile kendi kafasını gizler, diğer 3 rakibin kafasını ve kendi göğüs hedef halkasını gösterir!)
    // Layer 0: Ortak sahne, masa, tüfek, eller, gövdeler
    // Layer 1..4: Koltuk 1..4'ün 3D Korku/Endüstriyel Kafa Maskesi (Sadece rakipler görür!)
    // Layer 11..14: Koltuk 1..4'ün "KENDİNE SIK" göğüs nişangahı (Sadece o koltuğun kamerası görür!)
    this.playerCams = {
      1: new THREE.PerspectiveCamera(68, 1, 0.1, 45),
      2: new THREE.PerspectiveCamera(68, 1, 0.1, 45),
      3: new THREE.PerspectiveCamera(68, 1, 0.1, 45),
      4: new THREE.PerspectiveCamera(68, 1, 0.1, 45),
    };

    ([1, 2, 3, 4] as OctagonSeat[]).forEach((seat) => {
      const cam = this.playerCams[seat];
      cam.layers.enable(0);
      cam.layers.enable(10 + seat); // Kendi göğüs hedef halkası
      ([1, 2, 3, 4] as OctagonSeat[]).forEach((otherSeat) => {
        if (otherSeat !== seat) {
          cam.layers.enable(otherSeat); // Rakiplerin 3D maskeleri
        }
      });
    });

    // 3 Kişilik modun 4. karesindeki Canlı CCTV Tepe Kamerası (Tüm 3D maskeleri görür)
    this.cctvCam = new THREE.PerspectiveCamera(58, 1, 0.1, 45);
    this.cctvCam.position.set(0, 7.35, 0.01);
    this.cctvCam.lookAt(0, 0.95, 0);
    this.cctvCam.layers.enable(0);
    this.cctvCam.layers.enable(1);
    this.cctvCam.layers.enable(2);
    this.cctvCam.layers.enable(3);
    this.cctvCam.layers.enable(4);

    // Tam Ekran Aktif Sıra Kamerası
    this.activeFullCam = new THREE.PerspectiveCamera(68, 1, 0.1, 45);

    this.initStationSlotCoordinates();
    this.setupLightingAndRoom();
    this.buildOctagonalTableAndTurret();
    this.shotgunGroup = this.build3DShotgun();
    this.scene.add(this.shotgunGroup);

    this.shellTrayGroup = this.build3DShellTrayBox();
    this.shellTrayGroup.position.set(0, 1.09, 0);
    this.scene.add(this.shellTrayGroup);

    ([1, 2, 3, 4] as OctagonSeat[]).forEach((seat) => {
      this.crates[seat] = this.buildStationItemCrate(seat);
      this.scene.add(this.crates[seat].root);

      this.avatars[seat] = this.buildStationAvatarAndMonitor(seat);
      this.scene.add(this.avatars[seat].root);

      this.selfTargets[seat] = this.buildSelfTargetReticle(seat);
      this.scene.add(this.selfTargets[seat]);
    });

    this.postProcessor = new RetroBayerPostProcessor(640, 360);

    try {
      const gl = (this.canvas.getContext("webgl2", { antialias: false }) ||
        this.canvas.getContext("webgl", { antialias: false })) as
        | WebGLRenderingContext
        | WebGL2RenderingContext
        | null;

      if (!gl || gl.isContextLost()) {
        throw new Error("WebGL grafik bağlamı oluşturulamadı.");
      }

      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        context: gl as WebGLRenderingContext,
        antialias: false,
        powerPreference: "default",
      });
      this.renderer.setPixelRatio(1);
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 0.94;
      this.renderer.setClearColor(0x000000, 1);
    } catch (err) {
      this.initError =
        err instanceof Error
          ? err.message
          : "WebGL 3D motoru başlatılırken hata oluştu.";
      this.disposed = true;
      return;
    }

    this.resize();
    this.animate();
  }

  private getSeatTransform(
    seat: OctagonSeat,
    localX: number,
    localY: number,
    localZ: number
  ): THREE.Vector3 {
    const angle = SEAT_ANGLES[seat];
    const v = new THREE.Vector3(localX, localY, localZ);
    v.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
    return v;
  }

  private initStationSlotCoordinates(): void {
    // Her istasyonun önünde (lokal koordinatlarda) Sol 4 ve Sağ 4 olmak üzere 8 eşya yuvası
    const rows = [1.88, 2.48];
    const cols = [-1.26, -0.68, 0.68, 1.26];

    ([1, 2, 3, 4] as OctagonSeat[]).forEach((seat) => {
      const coords: THREE.Vector3[] = [
        this.getSeatTransform(seat, cols[0], 0.97, rows[0]),
        this.getSeatTransform(seat, cols[1], 0.97, rows[0]),
        this.getSeatTransform(seat, cols[0], 0.97, rows[1]),
        this.getSeatTransform(seat, cols[1], 0.97, rows[1]),
        this.getSeatTransform(seat, cols[2], 0.97, rows[0]),
        this.getSeatTransform(seat, cols[3], 0.97, rows[0]),
        this.getSeatTransform(seat, cols[2], 0.97, rows[1]),
        this.getSeatTransform(seat, cols[3], 0.97, rows[1]),
      ];
      this.slotPositions[seat] = coords;
    });
  }

  private setupLightingAndRoom(): void {
    const ambient = new THREE.AmbientLight(0x140c0a, 0.18);
    this.scene.add(ambient);

    const centerSpot = new THREE.SpotLight(
      0xffb469,
      44,
      16,
      Math.PI / 2.1,
      0.8,
      1.8
    );
    centerSpot.position.set(0, 5.6, 0);
    centerSpot.castShadow = true;
    centerSpot.shadow.mapSize.set(1024, 1024);
    this.scene.add(centerSpot);
    this.scene.add(centerSpot.target);

    this.muzzleLight = new THREE.PointLight(0xff7700, 0, 14);
    this.muzzleLight.position.set(0, 1.45, 0);
    this.scene.add(this.muzzleLight);

    const brickTex = createGrungeBrickTextures();
    const rustTex = createRustyMetalTextures();

    const roomGeo = new THREE.BoxGeometry(17.5, 9.2, 17.5);
    const roomMat = new THREE.MeshStandardMaterial({
      map: brickTex.map,
      bumpMap: brickTex.bumpMap,
      bumpScale: 0.06,
      roughnessMap: brickTex.roughnessMap,
      roughness: 0.92,
      side: THREE.BackSide,
    });
    const roomMesh = new THREE.Mesh(roomGeo, roomMat);
    roomMesh.position.set(0, 4.0, 0);
    this.scene.add(roomMesh);

    // Tavan çelik kirişler ve merkez lamba şapkası
    const darkIronMat = new THREE.MeshStandardMaterial({
      color: 0x16181b,
      bumpMap: rustTex.bumpMap,
      bumpScale: 0.025,
      metalness: 0.84,
      roughness: 0.45,
    });
    for (let z = -6; z <= 6; z += 4) {
      const beam = new THREE.Mesh(
        new THREE.BoxGeometry(17.2, 0.34, 0.18),
        darkIronMat
      );
      beam.position.set(0, 6.5, z);
      this.scene.add(beam);
    }
  }

  private buildOctagonalTableAndTurret(): void {
    const feltTex = createOctagonFeltTextures();
    const rustTex = createRustyMetalTextures();

    const rustMetalMat = new THREE.MeshStandardMaterial({
      map: rustTex.map,
      bumpMap: rustTex.bumpMap,
      bumpScale: 0.035,
      metalness: 0.78,
      roughness: 0.48,
    });
    const darkIronMat = new THREE.MeshStandardMaterial({
      color: 0x18181b,
      bumpMap: rustTex.bumpMap,
      bumpScale: 0.025,
      metalness: 0.86,
      roughness: 0.42,
    });
    const feltMat = new THREE.MeshStandardMaterial({
      map: feltTex.map,
      bumpMap: feltTex.bumpMap,
      bumpScale: 0.024,
      roughness: 0.86,
      metalness: 0.05,
    });

    // Sekizgen Masa Üstü (CylinderGeometry 8 kenarlı)
    const octRadius = 3.85;
    const tableGeo = new THREE.CylinderGeometry(octRadius, octRadius, 0.18, 8);
    tableGeo.rotateY(Math.PI / 8);
    const tableMesh = new THREE.Mesh(tableGeo, [
      rustMetalMat,
      feltMat,
      rustMetalMat,
    ]);
    tableMesh.position.set(0, 0.88, 0);
    tableMesh.receiveShadow = true;
    tableMesh.userData = { hitType: "table_cancel" };
    this.tableCancelHitBox = tableMesh;
    this.scene.add(tableMesh);

    // 8 Kenar Demir Bordür ve Köşe Aralarında (45°, 135°, 225°, 315°) Oluklu Demir Radyatör Bariyerleri
    for (let i = 0; i < 8; i++) {
      const ang = (i * Math.PI) / 4;
      const edgeDist = octRadius * Math.cos(Math.PI / 8);
      const edgeGroup = new THREE.Group();
      edgeGroup.rotation.y = ang;

      const rim = new THREE.Mesh(
        new THREE.BoxGeometry(2.95, 0.24, 0.18),
        rustMetalMat
      );
      rim.position.set(0, 0.91, edgeDist);
      edgeGroup.add(rim);

      // Köşe kenarlarında (i % 2 === 1) oluklu kaburgalı demir radyatör bariyeri
      if (i % 2 === 1) {
        const radBarrier = new THREE.Group();
        radBarrier.position.set(0, 1.04, edgeDist - 0.34);

        const baseBar = new THREE.Mesh(
          new THREE.BoxGeometry(2.05, 0.16, 0.28),
          darkIronMat
        );
        radBarrier.add(baseBar);

        for (let r = -0.85; r <= 0.85; r += 0.17) {
          const rib = new THREE.Mesh(
            new THREE.BoxGeometry(0.07, 0.24, 0.34),
            rustMetalMat
          );
          rib.position.set(r, 0.03, 0);
          radBarrier.add(rib);
        }
        edgeGroup.add(radBarrier);
      }

      this.scene.add(edgeGroup);
    }

    // MERKEZİ DÖNER TÜFEK HALKASI (Rotating Turret Ring) + LED YÖN OKLARI
    this.turretRingGroup = new THREE.Group();
    this.turretRingGroup.position.set(0, 0.98, 0);

    const basePedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(0.95, 1.06, 0.08, 28),
      darkIronMat
    );
    basePedestal.receiveShadow = true;
    this.turretRingGroup.add(basePedestal);

    const outerGearRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.98, 0.055, 10, 32),
      rustMetalMat
    );
    outerGearRing.rotation.x = Math.PI / 2;
    outerGearRing.position.y = 0.02;
    this.turretRingGroup.add(outerGearRing);

    // Dairesel platformun çevresinde 8 adet parlayan LED yön oku
    const chevronGeo = new THREE.ConeGeometry(0.065, 0.18, 4);
    for (let c = 0; c < 8; c++) {
      const cAng = (c * Math.PI) / 4;
      const chevMat = new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        emissive: 0xd97706,
        emissiveIntensity: 1.1,
      });
      const chev = new THREE.Mesh(chevronGeo, chevMat);
      const r = 0.84;
      chev.position.set(Math.sin(cAng) * r, 0.055, Math.cos(cAng) * r);
      chev.rotation.x = Math.PI / 2;
      chev.rotation.z = -cAng - Math.PI / 2;
      this.turretRingGroup.add(chev);
      this.turretDirectionChevrons.push(chev);
    }

    this.scene.add(this.turretRingGroup);

    // Her oyuncunun 8 eşya yuvasına parlak altlık plakaları ekle
    ([1, 2, 3, 4] as OctagonSeat[]).forEach((seat) => {
      const pads: THREE.Mesh[] = [];
      this.slotPositions[seat].forEach((pos) => {
        const padMat = new THREE.MeshBasicMaterial({
          color: 0xf59e0b,
          transparent: true,
          opacity: 0.1,
        });
        const pad = new THREE.Mesh(
          new THREE.PlaneGeometry(0.46, 0.46),
          padMat
        );
        pad.rotation.x = -Math.PI / 2;
        pad.rotation.z = SEAT_ANGLES[seat];
        pad.position.set(pos.x, 0.974, pos.z);
        this.scene.add(pad);
        pads.push(pad);
      });
      this.glowPads[seat] = pads;
    });
  }

  private build3DShotgun(): THREE.Group {
    const gun = new THREE.Group();
    gun.position.set(0, 1.12, 0);

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

    const stockMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.22, 0.72),
      woodMat
    );
    stockMesh.position.set(0, -0.06, -0.72);
    stockMesh.rotation.x = 0.12;
    stockMesh.castShadow = true;
    gun.add(stockMesh);

    const recBase = new THREE.Mesh(
      new THREE.BoxGeometry(0.165, 0.2, 0.62),
      brushedSteelMat
    );
    recBase.position.set(0, 0.02, -0.16);
    recBase.castShadow = true;
    gun.add(recBase);

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
    this.chamberShellMesh.position.set(0.068, 0.06, -0.11);
    gun.add(this.chamberShellMesh);

    this.boltCarrierMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.022, 0.086, 0.235),
      chromeBoltMat
    );
    this.boltCarrierMesh.position.set(0.078, 0.06, -0.11);
    gun.add(this.boltCarrierMesh);

    const rearBarrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.048, 0.054, 0.72, 16),
      darkBarrelSteelMat
    );
    rearBarrel.rotation.x = Math.PI / 2;
    rearBarrel.position.set(0, 0.088, 0.49);
    rearBarrel.castShadow = true;
    gun.add(rearBarrel);

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
    gun.add(magTube);

    this.frontBarrelGroup = new THREE.Group();
    const frontBarrelCyl = new THREE.Mesh(
      new THREE.CylinderGeometry(0.046, 0.048, 0.68, 16),
      darkBarrelSteelMat
    );
    frontBarrelCyl.rotation.x = Math.PI / 2;
    frontBarrelCyl.position.set(0, 0.088, 1.19);
    this.frontBarrelGroup.add(frontBarrelCyl);
    gun.add(this.frontBarrelGroup);

    this.shotgunPumpGroup = new THREE.Group();
    this.shotgunPumpGroup.position.set(0, -0.005, 0.54);
    const forendCore = new THREE.Mesh(
      new THREE.CylinderGeometry(0.068, 0.064, 0.44, 14),
      woodMat
    );
    forendCore.rotation.x = Math.PI / 2;
    this.shotgunPumpGroup.add(forendCore);
    gun.add(this.shotgunPumpGroup);

    const hitBox = new THREE.Mesh(
      new THREE.BoxGeometry(0.95, 0.65, 2.7),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    hitBox.position.set(0, 0.06, 0.2);
    hitBox.userData = { hitType: "shotgun" };
    gun.add(hitBox);

    gun.traverse((child) => {
      if (!child.userData?.hitType) {
        child.userData = { hitType: "shotgun" };
      }
    });

    return gun;
  }

  private build3DShellTrayBox(): THREE.Group {
    const root = new THREE.Group();
    const frameGroup = new THREE.Group();
    const darkMetal = new THREE.MeshStandardMaterial({
      color: 0x1c1917,
      metalness: 0.85,
      roughness: 0.42,
    });
    const baseBox = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.08, 1.92),
      darkMetal
    );
    baseBox.position.set(-1.12, 0.02, 0);
    frameGroup.add(baseBox);
    this.shellTrayBoxGroup = frameGroup;
    root.add(frameGroup);
    root.visible = false;
    return root;
  }

  private buildStationItemCrate(seat: OctagonSeat): OctagonCrateRig {
    const root = new THREE.Group();
    const pos = this.getSeatTransform(seat, 0, 0.22, 2.86);
    root.position.copy(pos);
    root.rotation.y = SEAT_ANGLES[seat];
    root.visible = false;

    const rustTex = createRustyMetalTextures();
    const outerSteelMat = new THREE.MeshStandardMaterial({
      map: rustTex.map,
      bumpMap: rustTex.bumpMap,
      bumpScale: 0.03,
      color: 0x292524,
      metalness: 0.82,
      roughness: 0.48,
    });
    const brassLatchMat = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      metalness: 0.86,
      roughness: 0.28,
    });

    const crateW = 0.84;
    const crateH = 0.38;
    const crateD = 0.56;
    const wallT = 0.05;

    const bottomPlate = new THREE.Mesh(
      new THREE.BoxGeometry(crateW, wallT, crateD),
      outerSteelMat
    );
    bottomPlate.position.y = -crateH / 2;
    root.add(bottomPlate);

    const frontWall = new THREE.Mesh(
      new THREE.BoxGeometry(crateW, crateH, wallT),
      outerSteelMat
    );
    frontWall.position.set(0, 0, crateD / 2 - wallT / 2);
    const backWall = new THREE.Mesh(
      new THREE.BoxGeometry(crateW, crateH, wallT),
      outerSteelMat
    );
    backWall.position.set(0, 0, -crateD / 2 + wallT / 2);
    const leftWall = new THREE.Mesh(
      new THREE.BoxGeometry(wallT, crateH, crateD - wallT * 2),
      outerSteelMat
    );
    leftWall.position.set(-crateW / 2 + wallT / 2, 0, 0);
    const rightWall = new THREE.Mesh(
      new THREE.BoxGeometry(wallT, crateH, crateD - wallT * 2),
      outerSteelMat
    );
    rightWall.position.set(crateW / 2 - wallT / 2, 0, 0);
    root.add(frontWall, backWall, leftWall, rightWall);

    const frontLatch = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.12, 0.04),
      brassLatchMat
    );
    frontLatch.position.set(0, crateH / 2 - 0.03, crateD / 2 + 0.02);
    root.add(frontLatch);

    const lidPivot = new THREE.Group();
    lidPivot.position.set(0, crateH / 2, -crateD / 2 + 0.02);
    const lidTop = new THREE.Mesh(
      new THREE.BoxGeometry(crateW + 0.02, 0.05, crateD + 0.02),
      outerSteelMat
    );
    lidTop.position.set(0, 0.025, crateD / 2 - 0.02);
    lidPivot.add(lidTop);
    root.add(lidPivot);

    return { root, lidPivot, frontLatch };
  }

  private buildStationAvatarAndMonitor(seat: OctagonSeat): OctagonAvatarRig {
    const root = new THREE.Group();
    const pos = this.getSeatTransform(seat, 0, 0, 4.35);
    root.position.copy(pos);
    // Merkeze doğru baksın (Koltuk 1 +Z'de olduğu için Math.PI ile -Z'ye bakar)
    root.rotation.y = SEAT_ANGLES[seat] + Math.PI;

    // 4 Farklı İkonik Korku/Endüstriyel Kostüm & Maske
    const coatColors: Record<OctagonSeat, number> = {
      1: 0x171311, // Porselen Kabus Maskeli
      2: 0x151b14, // Sovyet Gaz Maskeli
      3: 0x1e2022, // Beyaz Endüstriyel Solunum Maskeli
      4: 0x171c26, // Perçinli Demir Kaynakçı / Balistik Maskeli
    };
    const handStyles: Record<
      OctagonSeat,
      | "bandaged_dealer"
      | "tactical_leather"
      | "industrial_work"
      | "armored_welder"
    > = {
      1: "bandaged_dealer",
      2: "tactical_leather",
      3: "industrial_work",
      4: "armored_welder",
    };

    const torsoGroup = new THREE.Group();
    torsoGroup.position.set(0, 1.82, -0.12);

    const coatMat = new THREE.MeshStandardMaterial({
      color: coatColors[seat],
      roughness: 0.82,
      metalness: 0.14,
    });
    const chest = new THREE.Mesh(
      new THREE.CylinderGeometry(0.68, 0.84, 1.62, 16),
      coatMat
    );
    chest.scale.set(1.22, 1, 0.68);
    chest.castShadow = true;
    torsoGroup.add(chest);
    root.add(torsoGroup);

    // Kafa Maskesi (Sadece diğer 3 rakibin kameralarında görünmesi için Layer = seat!)
    const maskGroup = new THREE.Group();
    maskGroup.position.set(0, 2.96, 0.08);

    let headModel: THREE.Group;
    if (seat === 1) headModel = buildPorcelainNightmareHead();
    else if (seat === 2) headModel = buildSovietGasMaskHead();
    else if (seat === 3) headModel = buildIndustrialRespiratorHead();
    else headModel = buildRivetedWelderBallisticHead();

    maskGroup.add(headModel);
    maskGroup.traverse((obj) => {
      obj.layers.set(seat);
    });
    root.add(maskGroup);

    // Eller (Layer 0 — herkes görür)
    const leftHand = buildDetailedHand(-1, handStyles[seat]);
    const rightHand = buildDetailedHand(1, handStyles[seat]);
    const baseLeftHandPos = new THREE.Vector3(-0.78, 1.12, 1.15);
    const baseRightHandPos = new THREE.Vector3(0.78, 1.12, 1.15);
    leftHand.position.copy(baseLeftHandPos);
    rightHand.position.copy(baseRightHandPos);
    root.add(leftHand, rightHand);

    // İstasyonun Sol Yanında Kişisel 3D Defibrilatör Monitörü (6 yeşil LED bar + Jammer uyarı ışığı)
    const rustTex = createRustyMetalTextures();
    const monGroup = new THREE.Group();
    // Oyuncunun sağ-ön/sol-ön masa köşesinde herkesin görebileceği açıda durur
    monGroup.position.set(-1.72, 1.28, 1.65);
    monGroup.rotation.y = 0.42;

    const monCase = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.68, 0.34),
      new THREE.MeshStandardMaterial({
        map: rustTex.map,
        bumpMap: rustTex.bumpMap,
        bumpScale: 0.03,
        color: 0x27272a,
        metalness: 0.78,
        roughness: 0.45,
      })
    );
    monGroup.add(monCase);

    const screenMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.52, 0.36),
      new THREE.MeshBasicMaterial({ color: 0x040906 })
    );
    monGroup.add(screenMesh);

    const monitorLeds: THREE.Mesh[] = [];
    for (let i = 0; i < 6; i++) {
      const ledMat = new THREE.MeshStandardMaterial({
        color: 0x22c55e,
        emissive: 0x22c55e,
        emissiveIntensity: 1.2,
      });
      const ledBar = new THREE.Mesh(
        new THREE.BoxGeometry(0.26, 0.055, 0.38),
        ledMat
      );
      ledBar.position.set(0, -0.18 + i * 0.072, 0);
      monGroup.add(ledBar);
      monitorLeds.push(ledBar);
    }

    const monitorJammedLight = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xef4444 })
    );
    monitorJammedLight.position.set(0, 0.42, 0);
    monitorJammedLight.visible = false;
    monGroup.add(monitorJammedLight);

    root.add(monGroup);

    // Sinyal Kesici (Jammer) kıvılcım küresi
    const jammedSparkMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 8, 8),
      new THREE.MeshBasicMaterial({
        color: 0xef4444,
        wireframe: true,
      })
    );
    jammedSparkMesh.position.set(0, 1.35, 1.15);
    jammedSparkMesh.visible = false;
    root.add(jammedSparkMesh);

    // Rakip Seçim Hedef Halkası ve Rozeti (Tüfek veya Sinyal Kesici doğrultulurken çıkar)
    const targetReticleGroup = new THREE.Group();
    targetReticleGroup.position.set(0, 2.35, 0.65);

    const redRing = new THREE.Mesh(
      new THREE.RingGeometry(0.52, 0.62, 24),
      new THREE.MeshBasicMaterial({
        color: 0xef4444,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
      })
    );
    targetReticleGroup.add(redRing);

    const badgeTex = createTargetBadgeTexture(
      `🎯 ${seat}. OYUNCUYU SEÇ`,
      "DOKUN VE ATEŞLE",
      true
    );
    const targetBadgeMat = new THREE.MeshBasicMaterial({
      map: badgeTex,
      transparent: true,
      depthTest: false,
      side: THREE.DoubleSide,
    });
    const badgePlane = new THREE.Mesh(
      new THREE.PlaneGeometry(1.95, 0.5),
      targetBadgeMat
    );
    badgePlane.position.set(0, 0.85, 0);
    badgePlane.renderOrder = 15;
    targetReticleGroup.add(badgePlane);

    const hitBox = new THREE.Mesh(
      new THREE.BoxGeometry(1.85, 2.55, 1.45),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    hitBox.position.set(0, 0.1, 0);
    hitBox.userData = { hitType: "target_opponent", targetSeat: seat };
    targetReticleGroup.add(hitBox);

    targetReticleGroup.traverse((obj) => {
      obj.userData = { hitType: "target_opponent", targetSeat: seat };
    });
    targetReticleGroup.visible = false;
    root.add(targetReticleGroup);

    // Ayrıca karakterin maskesine/gövdesine doğrudan dokunulabilmesi için görünmez hitBox
    const bodyHitBox = new THREE.Mesh(
      new THREE.BoxGeometry(1.75, 2.6, 1.35),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    bodyHitBox.position.set(0, 2.35, 0.35);
    bodyHitBox.userData = { hitType: "target_opponent", targetSeat: seat };
    root.add(bodyHitBox);

    // İstasyon Tepe Spot Işığı (Oyuncu elendiğinde *ÇAT!* diye söner!)
    const stationSpotlight = new THREE.SpotLight(
      0xffbe76,
      26,
      10,
      Math.PI / 3.2,
      0.65,
      1.8
    );
    const spotWorldPos = this.getSeatTransform(seat, 0, 4.95, 3.85);
    const spotTargetPos = this.getSeatTransform(seat, 0, 1.8, 3.95);
    stationSpotlight.position.copy(spotWorldPos);
    stationSpotlight.target.position.copy(spotTargetPos);
    this.scene.add(stationSpotlight);
    this.scene.add(stationSpotlight.target);

    const coneMat = new THREE.MeshBasicMaterial({
      color: 0xffbe76,
      transparent: true,
      opacity: 0.04,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const spotConeMesh = new THREE.Mesh(
      new THREE.ConeGeometry(1.35, 3.4, 16, 1, true),
      coneMat
    );
    spotConeMesh.position.set(0, 3.3, 0.1);
    root.add(spotConeMesh);

    return {
      seat,
      root,
      torsoGroup,
      maskGroup,
      leftHand,
      rightHand,
      jammedSparkMesh,
      targetReticleGroup,
      targetBadgeMat,
      baseLeftHandPos,
      baseRightHandPos,
      stationSpotlight,
      spotConeMesh,
      monitorLeds,
      monitorJammedLight,
    };
  }

  private buildSelfTargetReticle(seat: OctagonSeat): THREE.Group {
    const group = new THREE.Group();
    const pos = this.getSeatTransform(seat, 0, 1.24, 3.05);
    group.position.copy(pos);
    group.rotation.y = SEAT_ANGLES[seat];

    const cyanMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.28, 0.36, 24),
      cyanMat
    );
    ring.rotation.x = -Math.PI / 3;
    group.add(ring);

    const badgeTex = createTargetBadgeTexture(
      "🛡️ KENDİNE DOĞRULT & SIK",
      "BOŞSA SIRA SENDE KALIR",
      false
    );
    const badge = new THREE.Mesh(
      new THREE.PlaneGeometry(1.75, 0.44),
      new THREE.MeshBasicMaterial({
        map: badgeTex,
        transparent: true,
        depthTest: false,
      })
    );
    badge.position.set(0, 0.24, 0);
    badge.rotation.x = -0.35;
    badge.renderOrder = 14;
    group.add(badge);

    const hitBox = new THREE.Mesh(
      new THREE.BoxGeometry(1.85, 0.9, 1.05),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    hitBox.position.set(0, 0.15, 0);
    hitBox.userData = { hitType: "target_self", targetSeat: seat };
    group.add(hitBox);

    const layerIdx = 10 + seat;
    group.traverse((obj) => {
      obj.layers.set(layerIdx);
      obj.userData = { hitType: "target_self", targetSeat: seat };
    });

    group.visible = false;
    return group;
  }

  public syncState(state: BuckshotOctagon3DStateSnapshot): void {
    if (this.disposed) return;
    this.currentState = state;

    this.frontBarrelGroup.visible = !state.isSawedOff;
    this.cutBarrelRingMesh.visible = state.isSawedOff;

    // Taret Yön Oklarını Güncelle (Saat Yönü ↻ = Kehribar, Ters Yön ↺ = Mavi/Yeşil)
    this.turretDirectionChevrons.forEach((chev, idx) => {
      const cAng = (idx * Math.PI) / 4;
      chev.rotation.z =
        state.turnDirection === 1
          ? -cAng - Math.PI / 2
          : -cAng + Math.PI / 2;
      const mat = chev.material as THREE.MeshStandardMaterial;
      if (state.turnDirection === 1) {
        mat.color.setHex(0xf59e0b);
        mat.emissive.setHex(0xd97706);
      } else {
        mat.color.setHex(0x38bdf8);
        mat.emissive.setHex(0x0284c7);
      }
    });

    // Taret hedef açısı: Nişan alınan koltuk varsa ona, yoksa sırası gelen oyuncuya döner
    const focusSeat = state.gunAimSeat ?? state.turnSeat;
    this.turretTargetAngle = SEAT_ANGLES[focusSeat];

    // 4 İstasyonun Monitör LED'lerini, Spot Işıklarını ve Hedef Halkalarını Güncelle
    const aimingActive = state.gunPickedUpBy !== null;
    const jammerActive = state.jammerPendingBy !== null;
    const actionOwner = state.gunPickedUpBy ?? state.jammerPendingBy;

    ([1, 2, 3, 4] as OctagonSeat[]).forEach((seat) => {
      const pSnap = state.players.find((p) => p.seat === seat);
      const rig = this.avatars[seat];
      const selfRet = this.selfTargets[seat];

      const isParticipating = seat <= state.playerCount;
      rig.root.visible = isParticipating;
      if (!isParticipating) {
        rig.stationSpotlight.intensity = 0;
        selfRet.visible = false;
        return;
      }

      const alive = pSnap ? pSnap.alive && pSnap.hp > 0 : false;
      const hp = pSnap ? pSnap.hp : 0;
      const maxHp = pSnap ? pSnap.maxHp : 4;

      // Elenme Efekti: Canı 0⚡ olan oyuncunun tepesindeki spot ışığı söner ve karakter karanlığa gömülür
      rig.stationSpotlight.intensity = alive ? 26 : 0;
      rig.spotConeMesh.visible = alive;
      rig.jammedSparkMesh.visible = Boolean(alive && pSnap?.jammed);
      rig.monitorJammedLight.visible = Boolean(alive && pSnap?.jammed);

      rig.monitorLeds.forEach((led, idx) => {
        led.visible = idx < maxHp;
        const mat = led.material as THREE.MeshStandardMaterial;
        if (alive && idx < hp) {
          mat.color.setHex(hp === 1 ? 0xef4444 : 0x22c55e);
          mat.emissive.setHex(hp === 1 ? 0xdc2626 : 0x16a34a);
          mat.emissiveIntensity = 1.2;
        } else {
          mat.color.setHex(0x18181b);
          mat.emissive.setHex(0x000000);
          mat.emissiveIntensity = 0;
        }
      });

      // Rakip seçim halkası görünürlüğü
      const canTargetThisOpponent =
        alive &&
        actionOwner !== null &&
        seat !== actionOwner &&
        (aimingActive || (jammerActive && !pSnap?.jammed));

      rig.targetReticleGroup.visible = canTargetThisOpponent;

      // Kendi göğüs hedef halkası (sadece tüfek elindeyken kendi kamerasında)
      selfRet.visible = Boolean(
        alive && aimingActive && state.gunPickedUpBy === seat
      );
    });

    // Mermi Tepsisi (Reveal Shells)
    const revHash = state.revealShells ? state.revealShells.join(",") : "";
    if (revHash !== this.lastRevealHash) {
      this.lastRevealHash = revHash;
      this.rebuildRevealShells(state.revealShells);
    }

    // Eşya Tepsileri
    const itemsHash = state.players
      .map(
        (p) =>
          `${p.seat}:${p.items.map((i) => i ?? "_").join(",")}:${state.turnSeat}:${state.adrenalineStealBy ?? 0}`
      )
      .join("|");
    if (itemsHash !== this.lastItemsHash) {
      this.lastItemsHash = itemsHash;
      this.rebuildAllTrays();
    }

    this.refreshInteractiveTargets();
  }

  private rebuildRevealShells(shells: ShellType[] | null): void {
    while (this.shellTrayGroup.children.length > 1) {
      const ch = this.shellTrayGroup.children[1];
      this.shellTrayGroup.remove(ch);
    }
    if (!shells || shells.length === 0) {
      this.shellTrayGroup.visible = false;
      return;
    }
    // Yeni şarjör geldiğinde önceki şarjörden masada biriken kovanları temizle
    this.ejectedShells.forEach((es) => this.scene.remove(es.mesh));
    this.ejectedShells = [];

    this.shellTrayGroup.visible = true;
    const count = shells.length;
    shells.forEach((sh, idx) => {
      const sMesh = this.create3DShellMesh(sh);
      const offsetZ = (idx - (count - 1) / 2) * 0.21;
      sMesh.position.set(-1.12, 0.08, offsetZ);
      this.shellTrayGroup.add(sMesh);
    });
  }

  private create3DShellMesh(type: ShellType): THREE.Group {
    const g = new THREE.Group();
    const hullMat = new THREE.MeshStandardMaterial({
      color: type === "live" ? 0xdc2626 : 0x2563eb,
      roughness: 0.32,
    });
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      metalness: 0.88,
      roughness: 0.2,
    });
    const hull = new THREE.Mesh(
      new THREE.CylinderGeometry(0.048, 0.048, 0.17, 12),
      hullMat
    );
    hull.position.y = 0.085;
    const brass = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 0.06, 12),
      brassMat
    );
    brass.position.y = 0.03;
    g.add(hull, brass);
    return g;
  }

  private rebuildAllTrays(): void {
    ([1, 2, 3, 4] as OctagonSeat[]).forEach((seat) => {
      const pSnap = this.currentState.players.find((p) => p.seat === seat);
      const items = pSnap ? pSnap.items : [];
      const isTurnOwner =
        this.currentState.turnSeat === seat &&
        this.currentState.adrenalineStealBy === null;
      const isStealTarget =
        this.currentState.adrenalineStealBy !== null &&
        this.currentState.adrenalineStealBy !== seat &&
        Boolean(pSnap?.alive);

      for (let i = 0; i < 8; i++) {
        const old = this.itemMeshes[seat][i];
        if (old) {
          this.scene.remove(old);
          this.itemMeshes[seat][i] = null;
        }
        const key = items[i] ?? null;
        const pad = this.glowPads[seat][i];
        if (pad) {
          const padMat = pad.material as THREE.MeshBasicMaterial;
          if (key && isStealTarget && key !== "adrenaline") {
            padMat.color.setHex(0xf43f5e);
            padMat.opacity = 0.42;
          } else if (key && isTurnOwner) {
            padMat.color.setHex(0xf59e0b);
            padMat.opacity = 0.28;
          } else {
            padMat.color.setHex(0x94a3b8);
            padMat.opacity = key ? 0.12 : 0.05;
          }
        }

        if (!key) continue;

        const wrapper = new THREE.Group();
        const pos = this.slotPositions[seat][i];
        wrapper.position.copy(pos);
        wrapper.rotation.y = SEAT_ANGLES[seat];

        const model = create3DItemModel(key);
        wrapper.add(model);

        const labelTex = createChalkLabelTexture(
          ITEM_3D_LABELS[key],
          isTurnOwner,
          isStealTarget && key !== "adrenaline"
        );
        const labelPlane = new THREE.Mesh(
          new THREE.PlaneGeometry(0.56, 0.14),
          new THREE.MeshBasicMaterial({
            map: labelTex,
            transparent: true,
            depthWrite: false,
          })
        );
        labelPlane.rotation.x = -Math.PI / 2;
        labelPlane.position.set(0, 0.01, 0.24);
        wrapper.add(labelPlane);

        const hitBox = new THREE.Mesh(
          new THREE.BoxGeometry(0.55, 0.58, 0.55),
          new THREE.MeshBasicMaterial({ visible: false })
        );
        hitBox.position.y = 0.24;
        hitBox.userData = {
          hitType: "item",
          trayOwner: seat,
          slotIndex: i,
          itemKey: key,
        };
        wrapper.add(hitBox);

        wrapper.traverse((child) => {
          child.userData = {
            hitType: "item",
            trayOwner: seat,
            slotIndex: i,
            itemKey: key,
          };
        });

        this.scene.add(wrapper);
        this.itemMeshes[seat][i] = wrapper;
      }
    });
  }

  private refreshInteractiveTargets(): void {
    this.interactiveTargets = [this.shotgunGroup, this.tableCancelHitBox];
    ([1, 2, 3, 4] as OctagonSeat[]).forEach((seat) => {
      if (seat <= this.currentState.playerCount) {
        this.interactiveTargets.push(this.avatars[seat].root);
        this.interactiveTargets.push(this.selfTargets[seat]);
        this.itemMeshes[seat].forEach((m) => {
          if (m) this.interactiveTargets.push(m);
        });
      }
    });
  }

  public triggerCrateItemDealSequence(
    deals: OctagonCrateDealEntry[],
    onItemLanded?: (
      ownerSeat: OctagonSeat,
      slotIndex: number,
      itemKey: BuckshotItemKey
    ) => void,
    onAllDone?: () => void
  ): void {
    if (this.disposed) return;
    if (deals.length === 0) {
      onAllDone?.();
      return;
    }

    this.crateFlights.forEach((f) => this.scene.remove(f.mesh));
    this.crateFlights = [];

    this.crateSequenceActive = true;
    this.crateSequenceElapsed = 0;
    this.crateLidSoundPlayed = false;
    this.crateSlamSoundPlayed = false;
    this.onCrateItemLandedCb = onItemLanded ?? null;
    this.onCrateAllDoneCb = onAllDone ?? null;

    ([1, 2, 3, 4] as OctagonSeat[]).forEach((seat) => {
      const crate = this.crates[seat];
      crate.root.visible = seat <= this.currentState.playerCount;
      const startPos = this.getSeatTransform(seat, 0, 0.22, 2.86);
      crate.root.position.copy(startPos);
      crate.lidPivot.rotation.x = 0;
    });

    sound.playCrateHydraulic();

    const firstLaunchDelay = this.crateRiseDur + this.crateLidOpenDur + 0.05;
    const launchInterval = 0.22;
    const flightDuration = 0.38;

    deals.forEach((entry, idx) => {
      const startPos = this.getSeatTransform(entry.ownerSeat, 0, 0.94, 2.86);
      const targetPos =
        this.slotPositions[entry.ownerSeat][entry.slotIndex]?.clone() ??
        new THREE.Vector3();
      const midPoint = startPos.clone().lerp(targetPos, 0.5);
      midPoint.y += 0.52;

      const curve = new THREE.QuadraticBezierCurve3(
        startPos,
        midPoint,
        targetPos
      );
      const mesh = create3DItemModel(entry.itemKey);
      mesh.visible = false;
      this.scene.add(mesh);

      this.crateFlights.push({
        ownerSeat: entry.ownerSeat,
        slotIndex: entry.slotIndex,
        itemKey: entry.itemKey,
        mesh,
        curve,
        targetPos,
        targetRotY: SEAT_ANGLES[entry.ownerSeat],
        startTime: firstLaunchDelay + idx * launchInterval,
        duration: flightDuration,
        landed: false,
      });
    });

    this.crateTotalItemsDur =
      firstLaunchDelay + (deals.length - 1) * launchInterval + flightDuration;
  }

  public triggerPumpAndEject(shellType: ShellType): void {
    if (this.disposed) return;
    this.pumpOffsetZ = -0.22;
    const sMesh = this.create3DShellMesh(shellType);
    sMesh.position.set(0, 1.18, 0);
    this.scene.add(sMesh);
    this.ejectedShells.push({
      mesh: sMesh,
      vel: new THREE.Vector3(
        (Math.random() - 0.5) * 2.4,
        2.3,
        (Math.random() - 0.5) * 2.4
      ),
      rotVel: new THREE.Vector3(9, 6, 11),
      settled: false,
      bounces: 0,
    });
  }

  public triggerMuzzleBlast(targetSeat: OctagonSeat, isLive: boolean): void {
    if (this.disposed) return;
    this.pumpOffsetZ = -0.26;
    if (isLive) {
      this.muzzleFlashTimer = 0.16;
      this.flashFramesRemaining = 2;
      this.muzzleLight.intensity = 32;
      this.camShake[targetSeat] = 0.48;
      this.avatarHitRecoil[targetSeat] = 0.85;

      // Hacimsel barut dumanı bulutu
      const smokeGeo = new THREE.DodecahedronGeometry(0.15, 0);
      for (let i = 0; i < 14; i++) {
        const mat = new THREE.MeshBasicMaterial({
          color: i % 3 === 0 ? 0x78716c : 0x57534e,
          transparent: true,
          opacity: 0.76,
          depthWrite: false,
        });
        const m = new THREE.Mesh(smokeGeo, mat);
        m.position.set(
          (Math.random() - 0.5) * 0.25,
          1.35 + (Math.random() - 0.5) * 0.16,
          (Math.random() - 0.5) * 0.25
        );
        const baseScale = 0.65 + Math.random() * 0.7;
        m.scale.setScalar(baseScale);
        this.scene.add(m);
        this.smokeClouds.push({
          mesh: m,
          vel: new THREE.Vector3(
            (Math.random() - 0.5) * 0.6,
            0.7 + Math.random() * 0.8,
            (Math.random() - 0.5) * 0.6
          ),
          life: 0,
          maxLife: 0.95 + Math.random() * 0.45,
          baseScale,
        });
      }

      const hitPos = this.getSeatTransform(targetSeat, 0, 2.2, 3.6);
      for (let i = 0; i < 18; i++) {
        const sp = new THREE.Mesh(
          new THREE.BoxGeometry(0.045, 0.045, 0.045),
          new THREE.MeshBasicMaterial({
            color: i % 2 === 0 ? 0xfbbf24 : 0xef4444,
          })
        );
        sp.position.copy(hitPos);
        this.scene.add(sp);
        this.sparks.push({
          mesh: sp,
          vel: new THREE.Vector3(
            (Math.random() - 0.5) * 5,
            1 + Math.random() * 3.5,
            (Math.random() - 0.5) * 5
          ),
          life: 0,
          maxLife: 0.35 + Math.random() * 0.25,
        });
      }
    } else {
      this.camShake[targetSeat] = 0.07;
    }
  }

  public getInteractiveHitAtPointer(
    clientX: number,
    clientY: number
  ): OctagonRaycastHitResult {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return { viewportSeat: 1, hitType: "none" };
    }

    const relX = clientX - rect.left;
    const relY = clientY - rect.top;

    let viewportSeat: OctagonSeat = this.currentState.turnSeat;
    let ndcX = 0;
    let ndcY = 0;
    let activeCam: THREE.PerspectiveCamera =
      this.playerCams[this.currentState.turnSeat];

    if (this.currentState.viewMode === "active_fullscreen") {
      viewportSeat = this.currentState.turnSeat;
      ndcX = (relX / rect.width) * 2 - 1;
      ndcY = -(relY / rect.height) * 2 + 1;
      activeCam = this.activeFullCam;
    } else {
      // 2x2 Quad Split-Screen:
      // Sol-Üst: 1. Oyuncu | Sağ-Üst: 2. Oyuncu
      // Sol-Alt: 3. Oyuncu | Sağ-Alt: 4. Oyuncu (3P modda Sağ-Alt CCTV'dir)
      const halfW = rect.width / 2;
      const halfH = rect.height / 2;
      const isRight = relX >= halfW;
      const isBottom = relY >= halfH;

      if (!isRight && !isBottom) viewportSeat = 1;
      else if (isRight && !isBottom) viewportSeat = 2;
      else if (!isRight && isBottom) viewportSeat = 3;
      else viewportSeat = 4;

      // 3 Kişilik modda 4. kare CCTV ise tıklamayı aktif sıradaki oyuncuya veya iptale yönlendir
      if (this.currentState.playerCount === 3 && viewportSeat === 4) {
        return { viewportSeat: this.currentState.turnSeat, hitType: "none" };
      }

      const localX = isRight ? relX - halfW : relX;
      const localY = isBottom ? relY - halfH : relY;
      ndcX = (localX / halfW) * 2 - 1;
      ndcY = -(localY / halfH) * 2 + 1;
      activeCam = this.playerCams[viewportSeat];
    }

    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), activeCam);
    this.raycaster.layers.mask = activeCam.layers.mask;

    const hits = this.raycaster.intersectObjects(this.interactiveTargets, true);
    for (const hit of hits) {
      let obj: THREE.Object3D | null = hit.object;
      while (obj) {
        if (obj.visible === false) break;
        const ud = obj.userData;
        if (ud?.hitType) {
          return {
            viewportSeat,
            hitType: ud.hitType,
            targetSeat: ud.targetSeat,
            trayOwner: ud.trayOwner,
            slotIndex: ud.slotIndex,
            itemKey: ud.itemKey,
          };
        }
        obj = obj.parent;
      }
    }

    return { viewportSeat, hitType: "none" };
  }

  public resize(): void {
    if (this.disposed || !this.renderer) return;
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const w = Math.max(1, parent.clientWidth);
    const h = Math.max(1, parent.clientHeight);
    this.renderer.setPixelRatio(1);
    const aspect = w / h;
    const rtH = 420;
    const rtW = Math.max(520, Math.min(980, Math.round(rtH * aspect)));
    this.postProcessor.setSize(rtW, rtH);
    this.renderer.setSize(rtW, rtH, false);
  }

  private animate = (): void => {
    if (this.disposed) return;
    this.animFrameId = requestAnimationFrame(this.animate);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const elapsed = this.clock.getElapsedTime();

    this.updatePhysicsAndTurret(dt, elapsed);
    this.renderViewports();
  };

  private updatePhysicsAndTurret(dt: number, elapsed: number): void {
    // 1. Merkezi Döner Taret Halkası & Pompalı Tüfek Animasyonu
    let angleDiff = this.turretTargetAngle - this.turretCurrentAngle;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    this.turretCurrentAngle += angleDiff * Math.min(1, dt * 8.5);
    this.turretRingGroup.rotation.y = this.turretCurrentAngle;

    const pickedBy = this.currentState.gunPickedUpBy;
    const aimSeat = this.currentState.gunAimSeat;

    if (pickedBy !== null) {
      // Tüfek aktif oyuncunun elinde yükselir ve hedef koltuğa döner
      const holderPos = this.getSeatTransform(pickedBy, 0, 1.38, 1.35);
      this.shotgunGroup.position.lerp(holderPos, Math.min(1, dt * 9));
      const targetYaw =
        aimSeat !== null
          ? SEAT_ANGLES[aimSeat]
          : SEAT_ANGLES[pickedBy] + Math.PI;
      this.shotgunGroup.rotation.y = targetYaw;
    } else {
      this.shotgunGroup.position.lerp(
        new THREE.Vector3(0, 1.12, 0),
        Math.min(1, dt * 8)
      );
      this.shotgunGroup.rotation.y = this.turretCurrentAngle + Math.PI;
    }

    this.pumpOffsetZ = THREE.MathUtils.lerp(this.pumpOffsetZ, 0, dt * 10);
    this.shotgunPumpGroup.position.z = 0.54 + this.pumpOffsetZ;

    if (this.muzzleFlashTimer > 0) {
      this.muzzleFlashTimer -= dt;
      if (this.muzzleFlashTimer <= 0) {
        this.muzzleLight.intensity = 0;
      }
    }

    for (let i = this.smokeClouds.length - 1; i >= 0; i--) {
      const sc = this.smokeClouds[i];
      sc.life += dt;
      const p = sc.life / sc.maxLife;
      sc.mesh.position.addScaledVector(sc.vel, dt);
      sc.mesh.scale.setScalar(sc.baseScale * (1 + p * 2.2));
      (sc.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(
        0,
        0.76 * (1 - p)
      );
      if (sc.life >= sc.maxLife) {
        this.scene.remove(sc.mesh);
        sc.mesh.geometry.dispose();
        (sc.mesh.material as THREE.Material).dispose();
        this.smokeClouds.splice(i, 1);
      }
    }

    // 2. Demir Eşya Sandığı Dağıtım Sekansı
    if (this.crateSequenceActive) {
      this.crateSequenceElapsed += dt;
      const t = this.crateSequenceElapsed;

      if (t <= this.crateRiseDur) {
        const p = Math.min(1, t / this.crateRiseDur);
        const ease = 1 - Math.pow(1 - p, 3);
        ([1, 2, 3, 4] as OctagonSeat[]).forEach((seat) => {
          const pos = this.getSeatTransform(
            seat,
            0,
            0.22 + ease * 0.72,
            2.86
          );
          this.crates[seat].root.position.copy(pos);
        });
      } else if (t <= this.crateRiseDur + this.crateLidOpenDur) {
        if (!this.crateLidSoundPlayed) {
          this.crateLidSoundPlayed = true;
          sound.playCrateLidOpen();
        }
        const p = Math.min(
          1,
          (t - this.crateRiseDur) / this.crateLidOpenDur
        );
        ([1, 2, 3, 4] as OctagonSeat[]).forEach((seat) => {
          this.crates[seat].lidPivot.rotation.x = -p * 1.95;
        });
      }

      this.crateFlights.forEach((fl) => {
        if (fl.landed || t < fl.startTime) return;
        const fp = Math.min(1, (t - fl.startTime) / fl.duration);
        fl.mesh.visible = true;
        fl.curve.getPoint(fp, fl.mesh.position);
        fl.mesh.rotation.y = fl.targetRotY + (1 - fp) * Math.PI;
        if (fp >= 1) {
          fl.landed = true;
          this.scene.remove(fl.mesh);
          sound.playItemPlaceThud();
          this.onCrateItemLandedCb?.(fl.ownerSeat, fl.slotIndex, fl.itemKey);
        }
      });

      if (t >= this.crateTotalItemsDur) {
        if (!this.crateSlamSoundPlayed) {
          this.crateSlamSoundPlayed = true;
          sound.playCrateLidSlam();
        }
        const rp = Math.min(
          1,
          (t - this.crateTotalItemsDur) / this.crateRetractDur
        );
        ([1, 2, 3, 4] as OctagonSeat[]).forEach((seat) => {
          this.crates[seat].lidPivot.rotation.x = -1.95 * (1 - rp);
          const pos = this.getSeatTransform(
            seat,
            0,
            0.94 - rp * 0.72,
            2.86
          );
          this.crates[seat].root.position.copy(pos);
        });
        if (rp >= 1) {
          this.crateSequenceActive = false;
          ([1, 2, 3, 4] as OctagonSeat[]).forEach((seat) => {
            this.crates[seat].root.visible = false;
          });
          this.onCrateAllDoneCb?.();
        }
      }
    }

    // 3. 4 İstasyon Kamera ve Karakter Animasyonları
    ([1, 2, 3, 4] as OctagonSeat[]).forEach((seat) => {
      const rig = this.avatars[seat];
      const pSnap = this.currentState.players.find((p) => p.seat === seat);
      const alive = pSnap ? pSnap.alive && pSnap.hp > 0 : false;

      this.camShake[seat] = Math.max(0, this.camShake[seat] - dt * 1.4);
      this.avatarHitRecoil[seat] = Math.max(
        0,
        this.avatarHitRecoil[seat] - dt * 1.8
      );

      // Karakter nefes alma veya elenince başın öne düşmesi
      if (alive) {
        rig.maskGroup.position.y =
          2.96 + Math.sin(elapsed * 2.1 + seat) * 0.035;
        rig.maskGroup.rotation.x = -this.avatarHitRecoil[seat] * 0.55;
      } else {
        // Elenen oyuncunun başı karanlıkta öne düşer
        rig.maskGroup.position.y = 2.68;
        rig.maskGroup.rotation.x = 0.58;
      }

      if (rig.jammedSparkMesh.visible) {
        rig.jammedSparkMesh.rotation.y += dt * 8;
        rig.jammedSparkMesh.rotation.x += dt * 6;
      }

      // Birinci şahıs kamerası konumu (Koltuk açısından masaya ve diğer 3 rakibe bakar)
      const cam = this.playerCams[seat];
      const isPicking = this.currentState.gunPickedUpBy === seat;
      const camBase = this.getSeatTransform(
        seat,
        0,
        isPicking ? 2.68 : 2.86,
        isPicking ? 4.28 : 4.72
      );
      const shakeVec = new THREE.Vector3(
        (Math.random() - 0.5) * this.camShake[seat],
        (Math.random() - 0.5) * this.camShake[seat],
        0
      );
      cam.position.copy(camBase).add(shakeVec);
      const lookTarget = this.getSeatTransform(seat, 0, 1.38, -0.55);
      cam.lookAt(lookTarget);
    });

    // Tam Ekran Aktif Sıra Kamerası (Sıra değiştikçe masanın etrafında yumuşakça yeni oyuncunun koltuğuna süzülür)
    const activeSeat = this.currentState.turnSeat;
    const desiredPos = this.playerCams[activeSeat].position;
    const desiredLook = this.getSeatTransform(activeSeat, 0, 1.38, -0.55);
    this.fullCamCurrentPos.lerp(desiredPos, Math.min(1, dt * 6.5));
    this.fullCamCurrentLook.lerp(desiredLook, Math.min(1, dt * 6.5));
    this.activeFullCam.position.copy(this.fullCamCurrentPos);
    this.activeFullCam.lookAt(this.fullCamCurrentLook);
    this.activeFullCam.layers.mask = this.playerCams[activeSeat].layers.mask;

    // 4. Fırlayan Boş Kovanlar & Kıvılcımlar
    this.ejectedShells.forEach((sh) => {
      if (sh.settled) return;
      sh.vel.y -= 9.8 * dt;
      sh.mesh.position.addScaledVector(sh.vel, dt);
      sh.mesh.rotation.x += sh.rotVel.x * dt;
      sh.mesh.rotation.z += sh.rotVel.z * dt;
      if (sh.mesh.position.y <= 0.99) {
        sh.mesh.position.y = 0.99;
        sh.vel.y = Math.abs(sh.vel.y) * 0.35;
        sh.bounces++;
        if (sh.bounces >= 3) sh.settled = true;
      }
    });

    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const sp = this.sparks[i];
      sp.life += dt;
      sp.mesh.position.addScaledVector(sp.vel, dt);
      if (sp.life >= sp.maxLife) {
        this.scene.remove(sp.mesh);
        this.sparks.splice(i, 1);
      }
    }
  }

  private renderViewports(): void {
    if (!this.renderer) return;
    const w = this.postProcessor.renderTarget.width;
    const h = this.postProcessor.renderTarget.height;
    if (w <= 0 || h <= 0) return;

    if (this.flashFramesRemaining > 0) {
      this.postProcessor.setFlash(0.85);
      this.flashFramesRemaining -= 1;
    } else {
      this.postProcessor.setFlash(0.0);
    }

    this.renderer.setRenderTarget(this.postProcessor.renderTarget);

    if (this.currentState.viewMode === "active_fullscreen") {
      this.renderer.setScissorTest(false);
      this.renderer.setViewport(0, 0, w, h);
      this.activeFullCam.aspect = w / h;
      this.activeFullCam.updateProjectionMatrix();
      this.renderer.render(this.scene, this.activeFullCam);
    } else {
      // 2x2 Dörtlü Bölünmüş Ekran (Quad Split-Screen)
      this.renderer.setScissorTest(true);
      const halfW = Math.floor(w / 2);
      const halfH = Math.floor(h / 2);
      const aspect = halfW / Math.max(1, halfH);

      const quadrants: {
        seat: OctagonSeat;
        x: number;
        y: number;
        w: number;
        h: number;
      }[] = [
        { seat: 1, x: 0, y: halfH, w: halfW, h: h - halfH },
        { seat: 2, x: halfW, y: halfH, w: w - halfW, h: h - halfH },
        { seat: 3, x: 0, y: 0, w: halfW, h: halfH },
        { seat: 4, x: halfW, y: 0, w: w - halfW, h: halfH },
      ];

      quadrants.forEach((q) => {
        this.renderer!.setViewport(q.x, q.y, q.w, q.h);
        this.renderer!.setScissor(q.x, q.y, q.w, q.h);

        if (this.currentState.playerCount === 3 && q.seat === 4) {
          this.cctvCam.aspect = aspect;
          this.cctvCam.updateProjectionMatrix();
          this.renderer!.render(this.scene, this.cctvCam);
        } else {
          const cam = this.playerCams[q.seat];
          cam.aspect = aspect;
          cam.updateProjectionMatrix();
          this.renderer!.render(this.scene, cam);
        }
      });
    }

    this.renderer.setScissorTest(false);
    this.renderer.setRenderTarget(null);
    this.renderer.setViewport(0, 0, this.canvas.width, this.canvas.height);
    this.postProcessor.renderToScreen(this.renderer);
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    this.postProcessor?.dispose();

    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
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

    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = null;
    }
    if (this.canvas.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
  }
}
