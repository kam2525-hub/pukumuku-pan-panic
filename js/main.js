import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { BREAD_CATALOG, CUSTOMERS } from './data.js';
import { sound } from './audio.js';

// ==========================================
// 1. STATE & PERSISTENCE (手描きPOPぱん図鑑 ＆ ハイスコア・職人称号)
// ==========================================
const STORAGE_KEY = 'pukumuku_unlocked_pops_v1';
const HIGHSCORE_KEY = 'pukumuku_highscores_v1';

let unlockedBreadIds = new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '["cream_pan"]'));

let highScores = {
  bestTimed: 0,
  bestSurvival: 0,
  totalMiracles: 0
};
try {
  const savedHS = JSON.parse(localStorage.getItem(HIGHSCORE_KEY) || 'null');
  if (savedHS && typeof savedHS === 'object') {
    highScores = { ...highScores, ...savedHS };
  }
} catch (_) {}

function getBakerRank(bestTimed, unlockedCount, miracles) {
  if (bestTimed >= 9000 || (unlockedCount >= 13 && miracles >= 5)) {
    return '🌟 伝説の純利益マスター';
  }
  if (bestTimed >= 5500 || unlockedCount >= 10) {
    return '👑 プクムク看板従業員';
  }
  if (bestTimed >= 3000 || unlockedCount >= 6) {
    return '🥖 早起きパン職人';
  }
  if (bestTimed >= 1200 || unlockedCount >= 3) {
    return '🌻 南台のルーキー';
  }
  return '🐣 見習いバイト';
}

function saveProgress() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...unlockedBreadIds]));
  localStorage.setItem(HIGHSCORE_KEY, JSON.stringify(highScores));
  updateZukanCountUI();
  updateHighScoreUI();
}

function updateHighScoreUI() {
  const rank = getBakerRank(highScores.bestTimed, unlockedBreadIds.size, highScores.totalMiracles);
  const elTimed = document.getElementById('title-high-profit');
  const elSurv = document.getElementById('title-high-survival');
  const elRank = document.getElementById('title-baker-rank');
  if (elTimed) elTimed.textContent = `${highScores.bestTimed.toLocaleString()} プク`;
  if (elSurv) elSurv.textContent = `${highScores.bestSurvival} 個連続`;
  if (elRank) elRank.textContent = rank;
}

const SHIP_WINDOW_SECONDS = 1.15; // 注入ボタンを離してから自動出荷されるまでの猶予時間（追い注入・ガス抜き・即出荷が可能）

const gameState = {
  phase: 'TITLE', // TITLE | PLAYING | JUDGING | RESULT
  mode: 'TIMED',  // TIMED (60s) | SURVIVAL (1-miss sudden death)
  timeRemaining: 60,
  profit: 0,
  combo: 0,
  isFever: false,
  feverTimeLeft: 0,
  isMorningRush: false,
  completedBreads: [],
  pukumukuCount: 0,
  miracleCount: 0,
  burstCount: 0,
  currentBread: BREAD_CATALOG[0],
  currentCustomer: null,
  fillPercent: 0,
  isInjecting: false,
  hasStartedFilling: false,
  inertiaVelocity: 0,
  shipCountdown: 0,
  slapAnimTimer: 0,
  reactAnimType: 'NONE', // NONE | HAPPY | BURST
  reactAnimTimer: 0,
  lastHighlightPoem: BREAD_CATALOG[0].poemSuccess
};

// ==========================================
// 2. THREE.JS 3D SCENE & BAKERY ENVIRONMENT
// ==========================================
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xfff3bf);
scene.fog = new THREE.Fog(0xfff3bf, 14, 32);

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 2.55, 6.6);
camera.lookAt(0, 1.95, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

// Warm Bakery Lighting
const ambientLight = new THREE.AmbientLight(0xfff8e7, 1.35);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xfff4d2, 2.0);
dirLight.position.set(4, 8, 6);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(1024, 1024);
scene.add(dirLight);

const rimLight = new THREE.DirectionalLight(0x74c0fc, 0.7);
rimLight.position.set(-5, 4, -4);
scene.add(rimLight);

// Bakery Counter, Sunflower Wall & Glass Showcase
const bakeryGroup = new THREE.Group();
scene.add(bakeryGroup);

function createSignboardTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  // Sunflower yellow & sky blue retro stripes
  ctx.fillStyle = '#ffd43b';
  ctx.fillRect(0, 0, 1024, 512);

  ctx.fillStyle = '#ffec99';
  for (let x = 0; x < 1024; x += 64) {
    ctx.fillRect(x, 0, 32, 512);
  }

  // Colorful border frame
  ctx.strokeStyle = '#4a2511';
  ctx.lineWidth = 14;
  ctx.strokeRect(20, 20, 984, 472);

  // Hand-drawn style signboard banner
  ctx.fillStyle = '#ee2e31';
  ctx.fillRect(160, 45, 704, 110);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 6;
  ctx.strokeRect(168, 53, 688, 94);

  ctx.fillStyle = '#ffffff';
  ctx.font = '900 58px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('パン工房 プクムク', 512, 120);

  // Quirky Pukkun & Mukkun style pop illustrations on wall
  ctx.fillStyle = '#fff9db';
  ctx.beginPath();
  ctx.arc(190, 290, 85, 0, Math.PI * 2);
  ctx.arc(834, 290, 85, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#4a2511';
  ctx.stroke();

  ctx.fillStyle = '#4a2511';
  ctx.font = 'bold 28px sans-serif';
  ctx.fillText('朝6:30 OPEN!', 190, 285);
  ctx.fillText('具がぎっしり!', 190, 322);
  ctx.fillText('中野区南台', 834, 285);
  ctx.fillText('純利益 従業員', 834, 322);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Back wall with Pukumuku art
const wallMat = new THREE.MeshStandardMaterial({
  map: createSignboardTexture(),
  roughness: 0.85
});
const backWall = new THREE.Mesh(new THREE.PlaneGeometry(14, 7), wallMat);
backWall.position.set(0, 3.2, -2.6);
bakeryGroup.add(backWall);

// Wooden Counter Table in front of Jun-kun
const counterMat = new THREE.MeshStandardMaterial({ color: 0xc87d3b, roughness: 0.6 });
const counterMesh = new THREE.Mesh(new THREE.BoxGeometry(10, 1.3, 1.8), counterMat);
counterMesh.position.set(0, 0.45, 1.35);
counterMesh.receiveShadow = true;
bakeryGroup.add(counterMesh);

// Counter Wooden Top Board
const topBoardMat = new THREE.MeshStandardMaterial({ color: 0xe6a968, roughness: 0.45 });
const topBoard = new THREE.Mesh(new THREE.BoxGeometry(10.2, 0.12, 1.95), topBoardMat);
topBoard.position.set(0, 1.12, 1.35);
topBoard.receiveShadow = true;
bakeryGroup.add(topBoard);

// Wooden Baking Tray under active bread
const trayGroup = new THREE.Group();
trayGroup.position.set(0, 1.21, 1.35);
bakeryGroup.add(trayGroup);
const trayMesh = new THREE.Mesh(
  new THREE.CylinderGeometry(0.75, 0.7, 0.06, 28),
  new THREE.MeshStandardMaterial({ color: 0x8d5524, roughness: 0.65 })
);
trayMesh.receiveShadow = true;
trayGroup.add(trayMesh);

// Glowing Aura Ring on the tray (Visual indicator for 95% Pukumuku & 98% Miracle zones!)
const auraRingMat = new THREE.MeshBasicMaterial({
  color: 0xffd43b,
  transparent: true,
  opacity: 0.0,
  side: THREE.DoubleSide
});
const auraRingMesh = new THREE.Mesh(new THREE.RingGeometry(0.52, 0.72, 32), auraRingMat);
auraRingMesh.rotation.x = -Math.PI / 2;
auraRingMesh.position.y = 0.04;
trayGroup.add(auraRingMesh);

// Glass Showcase on the right side of the counter where completed breads line up
const showcaseGroup = new THREE.Group();
showcaseGroup.position.set(2.35, 1.18, 1.35);
bakeryGroup.add(showcaseGroup);

const glassMat = new THREE.MeshPhysicalMaterial({
  color: 0xffffff,
  transparent: true,
  opacity: 0.28,
  roughness: 0.1,
  transmission: 0.6
});
const glassBox = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.1, 1.1), glassMat);
glassBox.position.set(0, 0.55, 0);
showcaseGroup.add(glassBox);

const showcaseBreads3D = new THREE.Group();
showcaseGroup.add(showcaseBreads3D);

// Filling Nozzle Pipe coming from top-left toward the bread
const nozzleGroup = new THREE.Group();
scene.add(nozzleGroup);
const pipeMat = new THREE.MeshStandardMaterial({ color: 0xadb5bd, metalness: 0.6, roughness: 0.3 });
const nozzleTip = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.45, 16), pipeMat);
nozzleTip.rotation.z = Math.PI * 0.75;
nozzleTip.position.set(-0.68, 2.38, 1.35);
nozzleGroup.add(nozzleTip);

// Stream of filling while injecting
const streamMat = new THREE.MeshStandardMaterial({ color: 0xffd43b, roughness: 0.3 });
const streamMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.55, 12), streamMat);
streamMesh.position.set(-0.35, 2.12, 1.35);
streamMesh.rotation.z = -Math.PI * 0.22;
streamMesh.visible = false;
scene.add(streamMesh);

// ==========================================
// 3. LOAD ORIGINAL BLENDER MODEL: JUN-KUN (純くん一時保存.blend)
// ==========================================
const junkunRoot = new THREE.Group();
junkunRoot.position.set(0, 0.92, -0.15);
scene.add(junkunRoot);

// Group for facial splatters / yakisobaリーゼント / saba katsu on Jun-kun
const junkunGagGroup = new THREE.Group();
junkunRoot.add(junkunGagGroup);

let junkunModel = null;
let junkunParts = {
  body: null,
  head: null,
  rightArm: null,
  leftArm: null,
  rightArmBaseRot: null,
  leftArmBaseRot: null
};
const junkunBaseRotY = -Math.PI * 0.5 + 0.22; // Iconic Pukumuku slightly sideways glance!

const gltfLoader = new GLTFLoader();
gltfLoader.load(
  './models/junkun.glb',
  (gltf) => {
    junkunModel = gltf.scene;
    junkunModel.rotation.y = junkunBaseRotY;
    junkunModel.scale.set(0.42, 0.42, 0.42);
    junkunModel.position.set(0, 0, 0);

    junkunModel.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
      if (child.name === '胴体') junkunParts.body = child;
      if (child.name === '顔') junkunParts.head = child;
      if (child.name === '右腕') {
        junkunParts.rightArm = child;
        junkunParts.rightArmBaseRot = child.rotation.clone();
      }
      if (child.name === '左腕') {
        junkunParts.leftArm = child;
        junkunParts.leftArmBaseRot = child.rotation.clone();
      }
    });

    junkunRoot.add(junkunModel);
  },
  undefined,
  (err) => {
    console.error('Failed to load junkun.glb:', err);
  }
);

// ==========================================
// 4. PROCEDURAL DEFORMABLE 3D BREAD MESHES (全13種のプクムク実在パン完全再現)
// ==========================================
const activeBreadGroup = new THREE.Group();
activeBreadGroup.position.set(0, 1.68, 1.35);
scene.add(activeBreadGroup);

let activeDoughMesh = null;
let activeInnerGlowMesh = null;
let activeToppingGroup = null;
let basePositions = null;

function buildBread3D(bread) {
  while (activeBreadGroup.children.length > 0) {
    activeBreadGroup.remove(activeBreadGroup.children[0]);
  }
  activeToppingGroup = new THREE.Group();

  // Base deformable sphere geometry with high segments for smooth "ぷくぷく" swelling
  const geo = new THREE.SphereGeometry(0.38, 36, 28);
  const posAttr = geo.attributes.position;

  for (let i = 0; i < posAttr.count; i++) {
    let x = posAttr.getX(i);
    let y = posAttr.getY(i);
    let z = posAttr.getZ(i);

    if (bread.shape === 'oval_bun' || bread.shape === 'curry_oval') {
      x *= 1.28;
      y *= 0.78;
      z *= 0.96;
      // Cream pan signature 3 glove notches along the front edge
      if (bread.id === 'cream_pan' && z > 0.15) {
        const notch = Math.cos(x * 16) * 0.035;
        z += notch;
      }
    } else if (bread.shape === 'koppe_roll' || bread.shape === 'oblong_bun') {
      x *= 1.58;
      y *= 0.72;
      z *= 0.8;
    } else if (bread.shape === 'shokupan_loaf') {
      // Mountain-top loaf shape (2 mountains)
      const mountainBump = y > 0 ? Math.abs(Math.cos(x * 6.5)) * 0.12 : 0;
      x *= 0.98 + (y > 0 ? 0.12 : 0);
      y = y * 1.22 + mountainBump;
      z *= 0.92;
    } else if (bread.shape === 'bone_tiny') {
      // Cute dog bone shape
      const endBulge = 1.0 + Math.pow(Math.abs(x) / 0.38, 2) * 0.75;
      x *= 0.92;
      y *= 0.46 * endBulge;
      z *= 0.56 * endBulge;
    } else if (bread.shape === 'lumpy_bun') {
      // Potato bread bumpy surface
      const bump = 1 + 0.085 * Math.sin(x * 14) * Math.cos(y * 14);
      x *= 1.12 * bump;
      y *= 0.85 * bump;
      z *= 1.06 * bump;
    } else {
      y *= 0.82;
    }

    // Flatten bottom slightly so it sits on the wooden tray
    if (y < -0.18) y = -0.18 + (y + 0.18) * 0.3;

    posAttr.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();

  basePositions = new Float32Array(posAttr.array);

  const doughMat = new THREE.MeshStandardMaterial({
    color: bread.doughColor,
    roughness: bread.shape === 'curry_oval' ? 0.88 : bread.shape === 'glossy_bun' ? 0.32 : 0.55,
    metalness: bread.shape === 'glossy_bun' ? 0.12 : 0.05,
    transparent: true,
    opacity: 1.0
  });

  activeDoughMesh = new THREE.Mesh(geo, doughMat);
  activeDoughMesh.castShadow = true;
  activeBreadGroup.add(activeDoughMesh);

  // Inner filling core that becomes visible as the dough stretches thin (>85%)
  const innerGeo = new THREE.SphereGeometry(0.28, 20, 16);
  const innerMat = new THREE.MeshStandardMaterial({
    color: bread.fillingColor,
    roughness: 0.28,
    emissive: bread.fillingColor,
    emissiveIntensity: 0.35
  });
  activeInnerGlowMesh = new THREE.Mesh(innerGeo, innerMat);
  activeInnerGlowMesh.visible = false;
  activeBreadGroup.add(activeInnerGlowMesh);

  // Add distinct, authentic 3D toppings for all 13 Pukumuku breads!
  switch (bread.id) {
    case 'cream_pan': {
      // Custard peek-hole & almond slice on top
      const hole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.065, 0.065, 0.04, 14),
        new THREE.MeshStandardMaterial({ color: 0xfcc419, roughness: 0.25 })
      );
      hole.position.set(0, 0.28, 0.05);
      activeToppingGroup.add(hole);
      break;
    }
    case 'choco_pan': {
      // Rich glossy dark chocolate glaze cap & gold leaf speck
      const glaze = new THREE.Mesh(
        new THREE.SphereGeometry(0.32, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.45),
        new THREE.MeshStandardMaterial({ color: 0x2b1204, roughness: 0.15, metalness: 0.2 })
      );
      glaze.position.set(0, 0.06, 0);
      activeToppingGroup.add(glaze);
      break;
    }
    case 'pukumuku_burger': {
      // Thick patty + melted yellow cheese slice + green pepper ring + sesame seeds
      const patty = new THREE.Mesh(
        new THREE.CylinderGeometry(0.36, 0.36, 0.11, 20),
        new THREE.MeshStandardMaterial({ color: 0x5c2314, roughness: 0.7 })
      );
      patty.position.set(0, 0.02, 0.06);
      activeToppingGroup.add(patty);

      const cheese = new THREE.Mesh(
        new THREE.BoxGeometry(0.54, 0.025, 0.54),
        new THREE.MeshStandardMaterial({ color: 0xffd43b, roughness: 0.3 })
      );
      cheese.rotation.y = Math.PI / 4;
      cheese.position.set(0, 0.08, 0.07);
      activeToppingGroup.add(cheese);

      const pepper = new THREE.Mesh(
        new THREE.TorusGeometry(0.09, 0.022, 8, 16),
        new THREE.MeshStandardMaterial({ color: 0x2b8a3e })
      );
      pepper.rotation.x = Math.PI / 2;
      pepper.position.set(0.12, 0.11, 0.22);
      activeToppingGroup.add(pepper);
      break;
    }
    case 'cream_melon': {
      // Crisp diamond lattice lines across the biscuit dome + white whipped cream peek
      const lineMat = new THREE.MeshStandardMaterial({ color: 0xd99b26, roughness: 0.7 });
      for (let i = -2; i <= 2; i++) {
        const arc1 = new THREE.Mesh(new THREE.TorusGeometry(0.31 - Math.abs(i) * 0.02, 0.01, 6, 20, Math.PI), lineMat);
        arc1.position.set(0, 0, i * 0.08);
        arc1.rotation.y = Math.PI / 6;
        activeToppingGroup.add(arc1);
      }
      const whip = new THREE.Mesh(
        new THREE.SphereGeometry(0.085, 12, 12),
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 })
      );
      whip.position.set(0.22, 0.08, 0.22);
      activeToppingGroup.add(whip);
      break;
    }
    case 'jagaimo_pan': {
      // Golden potato chunks + crisscross mayonnaise lines + parsley
      const potatoMat = new THREE.MeshStandardMaterial({ color: 0xffe066, roughness: 0.6 });
      for (let i = 0; i < 4; i++) {
        const chunk = new THREE.Mesh(new THREE.DodecahedronGeometry(0.085, 0), potatoMat);
        chunk.position.set((i - 1.5) * 0.12, 0.24, (i % 2 === 0 ? 1 : -1) * 0.06);
        activeToppingGroup.add(chunk);
      }
      const mayoMat = new THREE.MeshStandardMaterial({ color: 0xfff9db, roughness: 0.25 });
      for (let i = -2; i <= 2; i++) {
        const strip = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.42, 8), mayoMat);
        strip.rotation.z = Math.PI / 2;
        strip.rotation.y = 0.25;
        strip.position.set(0, 0.29, i * 0.06);
        activeToppingGroup.add(strip);
      }
      break;
    }
    case 'kinoko_pan': {
      // 3 distinct mushroom caps (shiitake, shimeji, eringi) on white béchamel sauce
      const sauce = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28, 0.3, 0.04, 16),
        new THREE.MeshStandardMaterial({ color: 0xfff9db, roughness: 0.3 })
      );
      sauce.position.set(0, 0.23, 0);
      activeToppingGroup.add(sauce);

      const capMat = new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.6 });
      const stemMat = new THREE.MeshStandardMaterial({ color: 0xf1f3f5 });
      [-0.12, 0, 0.13].forEach((ox, idx) => {
        const mushroom = new THREE.Group();
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), capMat);
        cap.position.y = 0.04;
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.06, 8), stemMat);
        mushroom.add(cap, stem);
        mushroom.position.set(ox, 0.26, (idx - 1) * 0.06);
        mushroom.rotation.z = (idx - 1) * 0.25;
        activeToppingGroup.add(mushroom);
      });
      break;
    }
    case 'negi_pan': {
      // Green Kujo negi rings + bonito flakes
      const negiMat = new THREE.MeshStandardMaterial({ color: 0x37b24d });
      for (let i = 0; i < 10; i++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.048, 0.018, 8, 12), negiMat);
        ring.position.set((Math.random() - 0.5) * 0.42, 0.24, (Math.random() - 0.5) * 0.28);
        ring.rotation.x = Math.PI / 2 + (Math.random() - 0.5) * 0.3;
        activeToppingGroup.add(ring);
      }
      break;
    }
    case 'tomato_curry_pan': {
      // Crunchy fried panko crumbs + red tomato curry core spot
      const pankoMat = new THREE.MeshStandardMaterial({ color: 0xd96b27, roughness: 0.9 });
      for (let i = 0; i < 18; i++) {
        const crumb = new THREE.Mesh(new THREE.TetrahedronGeometry(0.045), pankoMat);
        const angle = (i / 18) * Math.PI * 2;
        crumb.position.set(Math.cos(angle) * 0.28, 0.18 + (i % 3) * 0.04, Math.sin(angle) * 0.2);
        crumb.rotation.set(i, i * 2, 0);
        activeToppingGroup.add(crumb);
      }
      break;
    }
    case 'sabakatsu_burger':
    case 'shake_burger': {
      const isSaba = bread.id === 'sabakatsu_burger';
      const katsuColor = isSaba ? 0x9c5219 : 0xe87a5d;
      const katsuMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.72, 0.14, 0.5),
        new THREE.MeshStandardMaterial({ color: katsuColor, roughness: 0.85 })
      );
      katsuMesh.position.set(0, 0.04, 0.09);
      activeToppingGroup.add(katsuMesh);

      // Sauce or tartar dollop on top of the cutlet
      const sauceColor = isSaba ? 0x3b1704 : 0xfff9db;
      const sauceMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 12, 10),
        new THREE.MeshStandardMaterial({ color: sauceColor, roughness: 0.25 })
      );
      sauceMesh.scale.set(1.8, 0.4, 1.1);
      sauceMesh.position.set(0, 0.12, 0.24);
      activeToppingGroup.add(sauceMesh);
      break;
    }
    case 'yakisoba_pan': {
      // Braided yakisoba noodles + bright red pickled ginger (紅生姜)
      const noodleMat = new THREE.MeshStandardMaterial({ color: 0x6b3410, roughness: 0.45 });
      for (let i = 0; i < 7; i++) {
        const tube = new THREE.Mesh(new THREE.TorusKnotGeometry(0.08, 0.022, 24, 6), noodleMat);
        tube.position.set((i - 3) * 0.09, 0.22, 0);
        activeToppingGroup.add(tube);
      }
      const gingerMat = new THREE.MeshStandardMaterial({ color: 0xf03e3e });
      for (let i = 0; i < 4; i++) {
        const g = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.03), gingerMat);
        g.position.set((i - 1.5) * 0.06, 0.29, 0.04);
        g.rotation.z = i * 0.5;
        activeToppingGroup.add(g);
      }
      break;
    }
    case 'raisin_shokupan': {
      const raisinMat = new THREE.MeshStandardMaterial({ color: 0x3b154a, roughness: 0.35 });
      for (let i = 0; i < 12; i++) {
        const r = new THREE.Mesh(new THREE.SphereGeometry(0.038, 8, 8), raisinMat);
        r.position.set((Math.random() - 0.5) * 0.44, (Math.random() - 0.2) * 0.4, 0.27);
        activeToppingGroup.add(r);
      }
      break;
    }
    case 'dog_pan': {
      // Cute brown paw-print stamp (🐾) in the center of the bone bread!
      const pawMat = new THREE.MeshStandardMaterial({ color: 0x8d5524 });
      const mainPad = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.02, 12), pawMat);
      mainPad.position.set(0, 0.16, 0);
      activeToppingGroup.add(mainPad);
      [-0.045, 0, 0.045].forEach((ox, idx) => {
        const toe = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.02, 10), pawMat);
        toe.position.set(ox, 0.16, -0.055 - (idx === 1 ? 0.015 : 0));
        activeToppingGroup.add(toe);
      });
      break;
    }
  }

  activeBreadGroup.add(activeToppingGroup);
}

// ==========================================
// 5. REAL-TIME DEFORMATION & BURST PARTICLES
// ==========================================
const particles = [];

function spawnBurstParticles(bread) {
  const color = new THREE.Color(bread.fillingColor);
  for (let i = 0; i < 45; i++) {
    const pGeo = new THREE.SphereGeometry(0.045 + Math.random() * 0.06, 8, 8);
    const pMat = new THREE.MeshStandardMaterial({ color, roughness: 0.3 });
    const mesh = new THREE.Mesh(pGeo, pMat);
    mesh.position.copy(activeBreadGroup.position);

    const toFace = i < 18;
    const vx = toFace ? (Math.random() - 0.5) * 2.2 : (Math.random() - 0.5) * 7;
    const vy = toFace ? 2.5 + Math.random() * 2.5 : 1.5 + Math.random() * 5;
    const vz = toFace ? -2.8 - Math.random() * 1.5 : (Math.random() - 0.5) * 6;

    scene.add(mesh);
    particles.push({ mesh, velocity: new THREE.Vector3(vx, vy, vz), life: 1.6 });
  }

  addJunkunFaceGag(bread);
  triggerScreenSplatter(bread.splatColor);
}

function addJunkunFaceGag(bread) {
  if (junkunGagGroup.children.length > 18) {
    junkunGagGroup.clear();
  }

  const gagMat = new THREE.MeshStandardMaterial({
    color: bread.fillingColor,
    roughness: 0.25
  });

  if (bread.id === 'yakisoba_pan') {
    const pompadour = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.9, 12), gagMat);
    pompadour.rotation.x = Math.PI * 0.35;
    pompadour.position.set(0, 2.22, 0.25);
    junkunGagGroup.add(pompadour);
  } else if (bread.id === 'sabakatsu_burger') {
    const katsu = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.25, 0.08), gagMat);
    katsu.position.set(0.22, 1.62, 0.42);
    katsu.rotation.z = 0.3;
    junkunGagGroup.add(katsu);
  } else {
    for (let i = 0; i < 5; i++) {
      const blob = new THREE.Mesh(new THREE.SphereGeometry(0.09 + Math.random() * 0.08, 12, 12), gagMat);
      blob.scale.z = 0.35;
      blob.position.set(
        (Math.random() - 0.5) * 0.42,
        1.52 + (Math.random() - 0.5) * 0.38,
        0.38
      );
      junkunGagGroup.add(blob);
    }
  }
}

function triggerScreenSplatter(hexColor) {
  const overlay = document.getElementById('splatter-overlay');
  overlay.innerHTML = '';
  overlay.classList.remove('hidden');

  for (let i = 0; i < 7; i++) {
    const blob = document.createElement('div');
    blob.className = 'splat-blob';
    const size = 90 + Math.random() * 140;
    blob.style.width = `${size}px`;
    blob.style.height = `${size * (0.8 + Math.random() * 0.4)}px`;
    blob.style.left = `${20 + Math.random() * 60}%`;
    blob.style.top = `${18 + Math.random() * 55}%`;
    blob.style.background = hexColor;
    overlay.appendChild(blob);
  }

  setTimeout(() => {
    overlay.classList.add('hidden');
  }, 1550);
}

function updateBreadDeformation(fillPct, elapsedTime) {
  if (!activeDoughMesh || !basePositions) return;

  const ratio = Math.min(fillPct / 100, 1.15);
  const bread = gameState.currentBread;
  const posAttr = activeDoughMesh.geometry.attributes.position;

  // Squash effect when player uses "👋 ペシッ！ガス抜き"
  const slapSquash = gameState.slapAnimTimer > 0 ? Math.sin(gameState.slapAnimTimer * 25) * 0.16 : 0;

  // Calculate "ぷくぷく・むくむく" expansion scale
  const swell = (1.0 + Math.pow(ratio, 1.25) * 0.95) * (1.0 + slapSquash * 0.5);
  const sag = Math.pow(ratio, 2.0) * 0.18 * bread.gravitySag;

  for (let i = 0; i < posAttr.count; i++) {
    const bx = basePositions[i * 3];
    const by = basePositions[i * 3 + 1];
    const bz = basePositions[i * 3 + 2];

    let nx = bx * swell;
    let ny = by * (1.0 + ratio * 0.72) * (1.0 - slapSquash) - (by < 0 ? 0 : sag * 0.35);
    let nz = bz * swell;

    if (bread.wobbleType === 'lumpy' && ratio > 0.3) {
      const lump = 1 + 0.14 * ratio * Math.sin(bx * 18 + ratio * 8) * Math.cos(bz * 18);
      nx *= lump;
      nz *= lump;
    }

    if (fillPct >= 90) {
      const tremorIntensity = (fillPct - 88) * 0.0024;
      nx += Math.sin(elapsedTime * 55 + by * 12) * tremorIntensity;
      ny += Math.cos(elapsedTime * 60 + bx * 12) * tremorIntensity;
    }

    posAttr.setXYZ(i, nx, ny, nz);
  }
  posAttr.needsUpdate = true;
  activeDoughMesh.geometry.computeVertexNormals();

  if (activeToppingGroup) {
    activeToppingGroup.scale.set(
      1.0 + ratio * 0.65,
      (1.0 + ratio * 0.65) * (1.0 - slapSquash),
      1.0 + ratio * 0.65
    );
  }

  // Thinning dough transparency above 88% so inner filling glows through!
  if (fillPct >= 88) {
    activeDoughMesh.material.opacity = Math.max(0.55, 1.0 - (fillPct - 88) * 0.034);
    activeInnerGlowMesh.visible = true;
    activeInnerGlowMesh.scale.setScalar(0.8 + ratio * 0.85);
  } else {
    activeDoughMesh.material.opacity = 1.0;
    activeInnerGlowMesh.visible = false;
  }

  // Update 3D Tray Aura Ring (Critical visual feedback especially when steam blind is active!)
  if (fillPct >= 98.0 && fillPct < 100) {
    auraRingMat.opacity = 0.88;
    auraRingMat.color.setHex(Math.sin(elapsedTime * 40) > 0 ? 0xf06595 : 0xffd43b);
    auraRingMesh.scale.setScalar(1.08 + Math.sin(elapsedTime * 30) * 0.06);
  } else if (fillPct >= 95.0 && fillPct < 98.0) {
    auraRingMat.opacity = 0.72;
    auraRingMat.color.setHex(0xffd43b);
    auraRingMesh.scale.setScalar(1.0 + Math.sin(elapsedTime * 15) * 0.04);
  } else if (fillPct >= 70.0) {
    auraRingMat.opacity = 0.28;
    auraRingMat.color.setHex(0x51cf66);
    auraRingMesh.scale.setScalar(0.95);
  } else {
    auraRingMat.opacity = 0.0;
  }
}

// ==========================================
// 6. TACTICAL GAMEPLAY FLOW & CUSTOMER REQUESTS
// ==========================================
const hudClock = document.getElementById('hud-clock');
const clockBox = document.getElementById('clock-box');
const hudProfit = document.getElementById('hud-profit');
const hudCombo = document.getElementById('hud-combo');
const fillPercentEl = document.getElementById('fill-percent');
const gaugeFillEl = document.getElementById('gauge-fill');
const gaugeTrackEl = document.getElementById('gauge-track');
const gaugeSteamEl = document.getElementById('gauge-steam');
const shipTimerBarEl = document.getElementById('ship-timer-bar');
const momentumIndicatorEl = document.getElementById('momentum-indicator');
const doughStatePillEl = document.getElementById('dough-state-pill');

const btnInject = document.getElementById('btn-inject');
const btnSlap = document.getElementById('btn-slap');
const btnShip = document.getElementById('btn-ship');

function formatMorningClock(secLeft) {
  const elapsedMinutes = Math.floor(60 - Math.max(0, secLeft));
  const totalMinutes = 5 * 60 + 30 + elapsedMinutes;
  const hh = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const mm = String(totalMinutes % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

function pickNextOrder(forcedBread = null) {
  gameState.fillPercent = 0;
  gameState.isInjecting = false;
  gameState.hasStartedFilling = false;
  gameState.inertiaVelocity = 0;
  gameState.shipCountdown = 0;
  sound.stopPump();

  // Regular customer appearance (55% normal, 80% during 6:15 AM Morning Rush!)
  const customerChance = gameState.isMorningRush ? 0.8 : 0.52;
  if (!forcedBread && Math.random() < customerChance) {
    const cust = CUSTOMERS[Math.floor(Math.random() * CUSTOMERS.length)];
    gameState.currentCustomer = cust;
    const favId = cust.favoriteIds[Math.floor(Math.random() * cust.favoriteIds.length)];
    gameState.currentBread = BREAD_CATALOG.find((b) => b.id === favId) || BREAD_CATALOG[0];
    showCustomerBanner(cust);
  } else {
    gameState.currentCustomer = null;
    hideCustomerBanner();
    gameState.currentBread =
      forcedBread || BREAD_CATALOG[Math.floor(Math.random() * BREAD_CATALOG.length)];
  }

  const b = gameState.currentBread;
  document.getElementById('bread-badge').textContent = b.tagBadge;
  document.getElementById('bread-name').textContent = b.name;
  document.getElementById('bread-subname').textContent = b.subName || '';
  document.getElementById('bread-price').textContent = `定価 ${b.basePrice}プク`;
  document.getElementById('bread-filling').textContent = `具材：${b.fillingName}`;
  document.getElementById('bread-hint').textContent = b.mechanicHint;

  // Enable Steam Blind on high combo (>= 3) or during Morning Rush so player watches 3D bread & aura!
  if (gaugeSteamEl) {
    const isSteamy = gameState.combo >= 3 || gameState.isMorningRush;
    gaugeSteamEl.classList.toggle('hidden', !isSteamy);
  }

  streamMat.color.setHex(b.fillingColor);
  buildBread3D(b);
  updateGaugeUI(0);

  gameState.phase = 'PLAYING';
  btnInject.disabled = false;
  btnSlap.disabled = true;
  btnShip.disabled = true;
}

function showCustomerBanner(cust) {
  const banner = document.getElementById('customer-banner');
  document.getElementById('customer-icon').textContent = cust.icon;
  document.getElementById('customer-name').textContent = cust.name;
  document.getElementById('customer-speech').textContent = cust.speech;
  banner.classList.remove('hidden');
  if (cust.id === 'dog_walker') {
    sound.playBark();
  }
}

function hideCustomerBanner() {
  document.getElementById('customer-banner').classList.add('hidden');
}

function updateGaugeUI(pct) {
  const clamped = Math.min(100, Math.max(0, pct));
  const isSteamy = gaugeSteamEl && !gaugeSteamEl.classList.contains('hidden');

  if (isSteamy && pct >= 82) {
    // Partially obscure exact decimal in steamy high-combo rush so player reads 3D bread cues!
    fillPercentEl.textContent = `${Math.floor(pct / 10)}?.?`;
  } else {
    fillPercentEl.textContent = pct.toFixed(1);
  }

  gaugeFillEl.style.width = `${clamped}%`;

  if (pct >= 93) {
    gaugeTrackEl.classList.add('danger-shake');
  } else {
    gaugeTrackEl.classList.remove('danger-shake');
  }

  // Update live dough tension pill
  if (doughStatePillEl) {
    if (pct >= 98.0 && pct < 100) {
      doughStatePillEl.textContent = '🌟 神プク臨界点！今すぐ並べる(Enter)かペシッ(X)！';
      doughStatePillEl.style.background = '#f06595';
      doughStatePillEl.style.color = '#fff';
    } else if (pct >= 95.0) {
      doughStatePillEl.textContent = '✨ 極上プクムク圏内！余韻膨張に注意！';
      doughStatePillEl.style.background = '#ffd43b';
      doughStatePillEl.style.color = '#4a2511';
    } else if (pct >= 70.0) {
      doughStatePillEl.textContent = '🍞 いい感じ！あと少しで極上プクムク(95%)！';
      doughStatePillEl.style.background = '#d3f9d8';
      doughStatePillEl.style.color = '#2b8a3e';
    } else if (pct > 0) {
      doughStatePillEl.textContent = '🥖 具材注入中… 長押しでぷくぷく膨らませよう';
      doughStatePillEl.style.background = '#fff9db';
      doughStatePillEl.style.color = '#4a2511';
    } else {
      doughStatePillEl.textContent = '生地の状態：スタンバイ';
      doughStatePillEl.style.background = '#fff9db';
      doughStatePillEl.style.color = '#4a2511';
    }
  }
}

function startInjecting() {
  if (gameState.phase !== 'PLAYING') return;
  gameState.isInjecting = true;
  gameState.hasStartedFilling = true;
  gameState.shipCountdown = SHIP_WINDOW_SECONDS;
  btnInject.classList.add('pressing');
  btnSlap.disabled = false;
  btnShip.disabled = false;
  streamMesh.visible = true;
  sound.startPump();
}

function stopInjecting() {
  if (!gameState.isInjecting || gameState.phase !== 'PLAYING') return;
  gameState.isInjecting = false;
  btnInject.classList.remove('pressing');
  streamMesh.visible = false;
  sound.stopPump();

  // Give residual swelling velocity based on bread viscosity + natural fermentation!
  const baseInertia = Math.max(0.28, gameState.currentBread.inertia);
  gameState.inertiaVelocity = Math.max(gameState.inertiaVelocity, baseInertia * 0.9);
  gameState.shipCountdown = SHIP_WINDOW_SECONDS;
}

// Tactical Action 1: 👋 ペシッ！ガス抜き (-4.5% & kill excess momentum)
function performDoughSlap() {
  if (gameState.phase !== 'PLAYING' || !gameState.hasStartedFilling || gameState.fillPercent <= 0) return;
  sound.playSlap();
  gameState.fillPercent = Math.max(2, gameState.fillPercent - 4.5);
  gameState.inertiaVelocity *= 0.15; // Kills 85% of residual swelling inertia!
  gameState.slapAnimTimer = 0.25;
  // Reset auto-ship timer slightly so player can decide whether to ship or pump more
  gameState.shipCountdown = Math.max(gameState.shipCountdown, 0.85);
  updateGaugeUI(gameState.fillPercent);
}

// Tactical Action 2: 🛎️ 今すぐ並べる！ (Instant lock-in before momentum bursts the bread)
function performInstantShip() {
  if (gameState.phase !== 'PLAYING' || !gameState.hasStartedFilling) return;
  sound.playShipBell();
  gameState.isInjecting = false;
  gameState.inertiaVelocity = 0;
  gameState.shipCountdown = 0;
  finalizeBreadJudgment();
}

function finalizeBreadJudgment() {
  if (gameState.phase !== 'PLAYING') return;
  gameState.phase = 'JUDGING';
  gameState.isInjecting = false;
  gameState.inertiaVelocity = 0;
  gameState.shipCountdown = 0;

  btnInject.disabled = true;
  btnSlap.disabled = true;
  btnShip.disabled = true;
  btnInject.classList.remove('pressing');
  streamMesh.visible = false;
  if (shipTimerBarEl) shipTimerBarEl.classList.add('hidden');
  if (momentumIndicatorEl) momentumIndicatorEl.classList.add('hidden');
  sound.stopPump();

  const pct = gameState.fillPercent;
  const bread = gameState.currentBread;
  const isCustomerMatch =
    gameState.currentCustomer && gameState.currentCustomer.favoriteIds.includes(bread.id);
  const custMultiplier = isCustomerMatch ? gameState.currentCustomer.bonusMultiplier : 1.0;
  const feverMultiplier = gameState.isFever ? 3.0 : 1.0;

  let grade = 'UNDER';
  let titleText = '💨 スカスカ…';
  let earnedProfit = 0;

  if (pct >= 100) {
    grade = 'BURST';
    titleText = '💥 大破裂！！ 💥';
    earnedProfit = 0;
    gameState.combo = 0;
    gameState.burstCount++;
    gameState.isFever = false;
    gameState.reactAnimType = 'BURST';
    gameState.reactAnimTimer = 1.0;
    document.getElementById('fever-box').classList.add('hidden');
    gameState.lastHighlightPoem = bread.poemBurst;

    activeBreadGroup.visible = false;
    spawnBurstParticles(bread);
    sound.playResult('BURST');
  } else if (pct >= 98.0 && pct < 100) {
    // 🌟 MIRACLE PUKUMUKU! (98.0% - 99.9%)
    grade = 'MIRACLE';
    titleText = '🌟 神プクムク！！ (奇跡のギリギリ充填!) 🌟';
    gameState.combo += 2;
    gameState.pukumukuCount++;
    gameState.miracleCount++;
    highScores.totalMiracles++;
    gameState.reactAnimType = 'HAPPY';
    gameState.reactAnimTimer = 1.0;

    const comboBonus = 1 + Math.min(gameState.combo * 0.2, 2.0);
    earnedProfit = Math.round(bread.basePrice * 4.0 * custMultiplier * comboBonus * feverMultiplier);
    gameState.profit += earnedProfit;
    gameState.lastHighlightPoem = bread.poemSuccess;

    if (gameState.mode === 'TIMED') {
      gameState.timeRemaining += 3.5;
    }

    if (gameState.combo >= 3 && !gameState.isFever) {
      triggerFeverMode();
    }

    unlockedBreadIds.add(bread.id);
    saveProgress();
    addBreadToShowcase3D(bread, true);
    gameState.completedBreads.push({ name: bread.name, grade: 'MIRACLE' });
    sound.playResult('MIRACLE', bread.id === 'dog_pan');
  } else if (pct >= 95.0) {
    grade = 'PUKUMUKU';
    titleText = '✨ 極上プクムク！！ ✨';
    gameState.combo++;
    gameState.pukumukuCount++;
    gameState.reactAnimType = 'HAPPY';
    gameState.reactAnimTimer = 0.85;

    const comboBonus = 1 + Math.min(gameState.combo * 0.15, 1.5);
    earnedProfit = Math.round(bread.basePrice * 2.0 * custMultiplier * comboBonus * feverMultiplier);
    gameState.profit += earnedProfit;
    gameState.lastHighlightPoem = bread.poemSuccess;

    if (gameState.combo >= 3 && !gameState.isFever) {
      triggerFeverMode();
    }

    unlockedBreadIds.add(bread.id);
    saveProgress();
    addBreadToShowcase3D(bread, true);
    gameState.completedBreads.push({ name: bread.name, grade: 'PUKUMUKU' });
    sound.playResult('PUKUMUKU', bread.id === 'dog_pan');
  } else if (pct >= 70.0) {
    grade = 'GOOD';
    titleText = '🍞 いい感じ！';
    earnedProfit = Math.round(bread.basePrice * custMultiplier * feverMultiplier);
    gameState.profit += earnedProfit;

    addBreadToShowcase3D(bread, false);
    gameState.completedBreads.push({ name: bread.name, grade: 'GOOD' });
    sound.playResult('GOOD');
  } else {
    grade = 'UNDER';
    titleText = '💨 スカスカ（プクムクじゃない）';
    earnedProfit = Math.round(bread.basePrice * 0.2);
    gameState.profit += earnedProfit;
    gameState.combo = 0;
    gameState.isFever = false;
    document.getElementById('fever-box').classList.add('hidden');
    gameState.completedBreads.push({ name: bread.name, grade: 'UNDER' });
    sound.playResult('UNDER');
  }

  hudProfit.textContent = gameState.profit.toLocaleString();
  hudCombo.textContent = gameState.combo;

  const popup = document.getElementById('judgment-popup');
  const jTitle = document.getElementById('judgment-title');
  const jDetail = document.getElementById('judgment-detail');

  jTitle.textContent = titleText;
  jTitle.style.background =
    grade === 'MIRACLE'
      ? 'linear-gradient(135deg, #f06595 0%, #fcc419 100%)'
      : grade === 'PUKUMUKU'
      ? '#fcc419'
      : grade === 'BURST'
      ? '#e03131'
      : grade === 'GOOD'
      ? '#40c057'
      : '#868e96';

  if (grade === 'BURST') {
    jDetail.textContent = bread.burstMessage;
  } else {
    const feverText = gameState.isFever ? '【フィーバー3倍!】' : '';
    const bonusNote = isCustomerMatch && grade !== 'UNDER' ? '【常連2倍!】' : '';
    const timeBonusNote = grade === 'MIRACLE' && gameState.mode === 'TIMED' ? '【時間+3.5秒!】' : '';
    jDetail.textContent = `充填度 ${pct.toFixed(1)}% / +${earnedProfit}プク ${feverText}${bonusNote}${timeBonusNote}`;
  }

  popup.classList.remove('hidden');

  const isSurvivalFail = gameState.mode === 'SURVIVAL' && (grade === 'BURST' || grade === 'UNDER');

  setTimeout(() => {
    popup.classList.add('hidden');
    activeBreadGroup.visible = true;

    if (isSurvivalFail) {
      finishGameAt630('サバイバル終了！極限のプクムク職人チャレンジ！');
    } else if (gameState.mode === 'SURVIVAL' || gameState.timeRemaining > 0) {
      pickNextOrder();
    }
  }, 1100);
}

function triggerFeverMode() {
  gameState.isFever = true;
  gameState.feverTimeLeft = 8.5;
  document.getElementById('fever-box').classList.remove('hidden');
}

function addBreadToShowcase3D(bread, isPukumuku) {
  const idx = showcaseBreads3D.children.length;
  if (idx >= 12) return;
  const mini = new THREE.Mesh(
    new THREE.SphereGeometry(isPukumuku ? 0.16 : 0.12, 12, 10),
    new THREE.MeshStandardMaterial({ color: bread.doughColor, roughness: 0.5 })
  );
  const col = idx % 4;
  const row = Math.floor(idx / 4);
  mini.position.set(-0.75 + col * 0.5, 0.18 + row * 0.28, 0);
  showcaseBreads3D.add(mini);
}

function startNewGame(practiceBread = null) {
  sound.init();
  sound.startBGM();

  gameState.timeRemaining = 60;
  gameState.profit = 0;
  gameState.combo = 0;
  gameState.isFever = false;
  gameState.isMorningRush = false;
  gameState.completedBreads = [];
  gameState.pukumukuCount = 0;
  gameState.miracleCount = 0;
  gameState.burstCount = 0;
  gameState.lastHighlightPoem = BREAD_CATALOG[0].poemSuccess;

  hudProfit.textContent = '0';
  hudCombo.textContent = '0';
  clockBox.classList.remove('urgent');
  document.getElementById('fever-box').classList.add('hidden');
  showcaseBreads3D.clear();
  junkunGagGroup.clear();

  document.getElementById('modal-title').classList.add('hidden');
  document.getElementById('modal-result').classList.add('hidden');
  document.getElementById('modal-zukan').classList.add('hidden');

  pickNextOrder(practiceBread);
}

function finishGameAt630() {
  gameState.phase = 'RESULT';
  gameState.isInjecting = false;
  btnInject.disabled = true;
  btnSlap.disabled = true;
  btnShip.disabled = true;
  streamMesh.visible = false;
  sound.stopPump();
  sound.playOpeningBell();

  // Check for New High Score!
  let isNewRecord = false;
  if (gameState.mode === 'TIMED' && gameState.profit > highScores.bestTimed) {
    highScores.bestTimed = gameState.profit;
    isNewRecord = true;
  } else if (gameState.mode === 'SURVIVAL' && gameState.completedBreads.length > highScores.bestSurvival) {
    highScores.bestSurvival = gameState.completedBreads.length;
    isNewRecord = true;
  }
  saveProgress();

  document.getElementById('res-profit').textContent = gameState.profit.toLocaleString();
  document.getElementById('res-total-breads').textContent = gameState.completedBreads.length;
  document.getElementById('res-pukumuku-count').textContent = `${gameState.pukumukuCount} (神:${gameState.miracleCount})`;
  document.getElementById('res-burst-count').textContent = gameState.burstCount;
  document.getElementById('res-poem-text').textContent = gameState.lastHighlightPoem;

  const resRankEl = document.getElementById('res-rank-badge');
  if (resRankEl) {
    resRankEl.textContent = getBakerRank(highScores.bestTimed, unlockedBreadIds.size, highScores.totalMiracles);
  }
  const newRecEl = document.getElementById('res-new-record');
  if (newRecEl) {
    newRecEl.classList.toggle('hidden', !isNewRecord);
  }

  const tagsContainer = document.getElementById('res-bread-tags');
  tagsContainer.innerHTML = '';
  if (gameState.completedBreads.length === 0) {
    tagsContainer.innerHTML = '<span class="bread-tag-chip">まだぱんが並んでいません</span>';
  } else {
    gameState.completedBreads.forEach((item) => {
      const span = document.createElement('span');
      const isSpecial = item.grade === 'PUKUMUKU' || item.grade === 'MIRACLE';
      span.className = `bread-tag-chip ${isSpecial ? 'pukumuku' : ''}`;
      const prefix = item.grade === 'MIRACLE' ? '🌟' : item.grade === 'PUKUMUKU' ? '✨' : '';
      span.textContent = `${prefix}${item.name}`;
      tagsContainer.appendChild(span);
    });
  }

  document.getElementById('modal-result').classList.remove('hidden');
}

// ==========================================
// 7. HANDWRITTEN POP ENCYCLOPEDIA (ぱん図鑑)
// ==========================================
function updateZukanCountUI() {
  document.getElementById('zukan-count').textContent = unlockedBreadIds.size;
}

function renderZukanModal() {
  const grid = document.getElementById('zukan-grid');
  grid.innerHTML = '';

  BREAD_CATALOG.forEach((bread) => {
    const isUnlocked = unlockedBreadIds.has(bread.id);
    const card = document.createElement('div');
    card.className = `pop-item-card ${isUnlocked ? '' : 'locked'}`;

    card.innerHTML = `
      <span class="pop-card-badge">${bread.category} | 定価 ${bread.basePrice}プク</span>
      <div class="pop-card-name">${bread.name} ${bread.subName || ''}</div>
      <div class="pop-card-title">${isUnlocked ? `★ ${bread.popTitle}` : '🔒 『極上プクムク！』達成でPOP解放'}</div>
      <p class="pop-card-desc">${
        isUnlocked
          ? bread.popText
          : `ヒント：${bread.mechanicHint}（クリックするとこのパンから仕込みスタートできます！）`
      }</p>
      <div class="pop-card-try">👉 このぱんから仕込みを始める</div>
    `;

    card.addEventListener('click', () => {
      startNewGame(bread);
    });

    grid.appendChild(card);
  });

  document.getElementById('modal-zukan').classList.remove('hidden');
}

// ==========================================
// 8. EVENT LISTENERS & TACTICAL INPUT HANDLING
// ==========================================
btnInject.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  startInjecting();
});
window.addEventListener('pointerup', () => {
  stopInjecting();
});

btnSlap.addEventListener('click', (e) => {
  e.preventDefault();
  performDoughSlap();
});

btnShip.addEventListener('click', (e) => {
  e.preventDefault();
  performInstantShip();
});

window.addEventListener('keydown', (e) => {
  if (gameState.phase !== 'PLAYING') return;
  if (e.code === 'Space' && !e.repeat) {
    e.preventDefault();
    startInjecting();
  } else if (e.code === 'KeyX' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
    e.preventDefault();
    performDoughSlap();
  } else if (e.code === 'Enter') {
    e.preventDefault();
    performInstantShip();
  }
});

window.addEventListener('keyup', (e) => {
  if (e.code === 'Space' && gameState.phase === 'PLAYING') {
    e.preventDefault();
    stopInjecting();
  }
});

document.getElementById('btn-start-game').addEventListener('click', () => startNewGame());
document.getElementById('btn-retry').addEventListener('click', () => startNewGame());

const btnBackTitle = document.getElementById('btn-back-title');
if (btnBackTitle) {
  btnBackTitle.addEventListener('click', () => {
    document.getElementById('modal-result').classList.add('hidden');
    document.getElementById('modal-title').classList.remove('hidden');
    gameState.phase = 'TITLE';
    updateHighScoreUI();
  });
}

document.getElementById('btn-zukan').addEventListener('click', () => renderZukanModal());
document.getElementById('btn-open-zukan-title').addEventListener('click', () => renderZukanModal());
document.getElementById('btn-open-zukan-result').addEventListener('click', () => renderZukanModal());
document.getElementById('btn-close-zukan').addEventListener('click', () => {
  document.getElementById('modal-zukan').classList.add('hidden');
});

document.getElementById('btn-unlock-all').addEventListener('click', () => {
  BREAD_CATALOG.forEach((b) => unlockedBreadIds.add(b.id));
  saveProgress();
  renderZukanModal();
});

const modeButtons = document.querySelectorAll('.mode-btn');
modeButtons.forEach((btn) => {
  btn.addEventListener('click', (e) => {
    modeButtons.forEach((b) => b.classList.remove('active'));
    e.currentTarget.classList.add('active');
    gameState.mode = e.currentTarget.dataset.mode;
  });
});

document.getElementById('btn-sound').addEventListener('click', (e) => {
  const muted = sound.toggleMute();
  e.currentTarget.textContent = muted ? '🔇' : '🔊';
});

document.getElementById('btn-share').addEventListener('click', (e) => {
  const modeText = gameState.mode === 'SURVIVAL' ? '【サバイバルモード】' : '【朝6:30開店アタック】';
  const rank = getBakerRank(highScores.bestTimed, unlockedBreadIds.size, highScores.totalMiracles);
  const text = `${modeText} 純くんの朝6:30！プクムク・パン詰めパニック\n本日の純利益：${gameState.profit}プク（極上：${gameState.pukumukuCount}個 / 神プク：${gameState.miracleCount}個）\n職人称号：${rank}\n\n「${gameState.lastHighlightPoem.replace(/\n/g, ' ')}」\n#パン工房プクムク #純くん`;
  navigator.clipboard.writeText(text).then(() => {
    const btn = e.currentTarget;
    const orig = btn.textContent;
    btn.textContent = '✅ コピーしました！';
    setTimeout(() => (btn.textContent = orig), 1800);
  });
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ==========================================
// 9. MAIN ANIMATION & TACTICAL PHYSICS LOOP
// ==========================================
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);
  const elapsed = clock.getElapsedTime();

  if (gameState.slapAnimTimer > 0) {
    gameState.slapAnimTimer = Math.max(0, gameState.slapAnimTimer - dt);
  }
  if (gameState.reactAnimTimer > 0) {
    gameState.reactAnimTimer = Math.max(0, gameState.reactAnimTimer - dt);
  }

  // 1. Update Fever timer
  if (gameState.isFever) {
    gameState.feverTimeLeft -= dt;
    if (gameState.feverTimeLeft <= 0) {
      gameState.isFever = false;
      document.getElementById('fever-box').classList.add('hidden');
    }
  }

  // 2. Update morning countdown clock (05:30 -> 06:30) or Survival badge
  if (gameState.phase === 'PLAYING' || gameState.phase === 'JUDGING') {
    if (gameState.mode === 'TIMED') {
      gameState.timeRemaining -= dt;
      hudClock.textContent = formatMorningClock(gameState.timeRemaining);

      // Trigger 6:15 AM (15s left) Morning Rush!
      if (gameState.timeRemaining <= 15 && !gameState.isMorningRush) {
        gameState.isMorningRush = true;
        clockBox.classList.add('urgent');
        sound.playRushAlert();
      }
      if (gameState.timeRemaining <= 0 && gameState.phase !== 'RESULT') {
        finishGameAt630();
      }
    } else {
      hudClock.textContent = `🔥 生存 ${gameState.completedBreads.length}個`;
    }
  }

  // 3. Update tactical bread filling & post-release settling physics
  if (gameState.phase === 'PLAYING') {
    const bread = gameState.currentBread;

    if (gameState.isInjecting) {
      if (shipTimerBarEl) shipTimerBarEl.classList.add('hidden');
      if (momentumIndicatorEl) momentumIndicatorEl.classList.add('hidden');

      let speedMultiplier = 1.0;
      if (bread.wobbleType === 'stepped') {
        speedMultiplier = 1.0 + 0.65 * Math.max(0, Math.sin(elapsed * 10));
      } else if (bread.id === 'yakisoba_pan' && gameState.fillPercent >= 76) {
        speedMultiplier = 1.38;
      }

      gameState.fillPercent += bread.fillSpeed * speedMultiplier * dt;
      // Build up injection momentum while pumping
      gameState.inertiaVelocity = Math.min(1.6, gameState.inertiaVelocity + dt * (0.45 + bread.inertia));

      sound.updatePump(gameState.fillPercent);
      updateGaugeUI(gameState.fillPercent);

      if (gameState.fillPercent >= 100) {
        finalizeBreadJudgment();
      }
    } else if (gameState.hasStartedFilling) {
      // Player released inject button: bread continues to swell from momentum + yeast fermentation creep!
      const yeastCreep = gameState.fillPercent >= 75 ? 1.85 : 0.4;
      const momentumStep = gameState.inertiaVelocity * 8.2;
      const totalRiseRate = momentumStep + yeastCreep;

      gameState.fillPercent += totalRiseRate * dt;
      gameState.inertiaVelocity = Math.max(0, gameState.inertiaVelocity - dt * 1.15);

      // Show residual swelling indicator
      if (momentumIndicatorEl) {
        momentumIndicatorEl.classList.toggle('hidden', totalRiseRate < 1.2);
      }

      // Countdown auto-ship timer bar
      gameState.shipCountdown -= dt;
      if (shipTimerBarEl) {
        shipTimerBarEl.classList.remove('hidden');
        const ratio = Math.max(0, gameState.shipCountdown / SHIP_WINDOW_SECONDS);
        shipTimerBarEl.style.width = `${ratio * 100}%`;
      }

      updateGaugeUI(gameState.fillPercent);

      if (gameState.fillPercent >= 100) {
        finalizeBreadJudgment();
      } else if (gameState.shipCountdown <= 0) {
        finalizeBreadJudgment();
      }
    }
  }

  // 4. Deform active 3D bread & tray aura
  updateBreadDeformation(gameState.fillPercent, elapsed);

  // 5. Expressive Animation on Jun-kun's 3D Model (models/junkun.glb)
  if (junkunModel) {
    if (gameState.reactAnimTimer > 0 && gameState.reactAnimType === 'HAPPY') {
      // Joyful jump & spin wave on Pukumuku / Miracle!
      junkunRoot.position.y = 0.92 + Math.abs(Math.sin(elapsed * 18)) * 0.22;
      junkunModel.rotation.y = junkunBaseRotY + Math.sin(elapsed * 14) * 0.25;
      junkunModel.rotation.z = 0;
    } else if (gameState.reactAnimTimer > 0 && gameState.reactAnimType === 'BURST') {
      // Comical knock-back shock when bread bursts!
      junkunRoot.position.y = 0.92;
      junkunModel.rotation.z = 0.24 * Math.sin(gameState.reactAnimTimer * 12);
      junkunModel.rotation.y = junkunBaseRotY - 0.3;
    } else if (gameState.isInjecting) {
      // Jun-kun leans in and trembles with excitement as fill approaches 95%!
      const tension = gameState.fillPercent / 100;
      junkunModel.rotation.y = junkunBaseRotY - tension * 0.18 + Math.sin(elapsed * 45) * 0.025 * tension;
      junkunModel.rotation.z = 0;
      junkunRoot.position.y = 0.92 + Math.abs(Math.sin(elapsed * 20)) * 0.05;
    } else {
      // Iconic Pukumuku sideways idle sway, watching customers pass by on Nakano-dori
      junkunModel.rotation.y = junkunBaseRotY + Math.sin(elapsed * 1.6) * 0.12;
      junkunModel.rotation.z = 0;
      junkunRoot.position.y = 0.92 + Math.sin(elapsed * 2.4) * 0.03;
    }

    // Animate Jun-kun's right arm when slapping dough ("ペシッ！ガス抜き")
    if (junkunParts.rightArm && junkunParts.rightArmBaseRot) {
      if (gameState.slapAnimTimer > 0) {
        junkunParts.rightArm.rotation.z =
          junkunParts.rightArmBaseRot.z - Math.sin(gameState.slapAnimTimer * Math.PI * 4) * 0.65;
      } else {
        junkunParts.rightArm.rotation.copy(junkunParts.rightArmBaseRot);
      }
    }
  }

  // 6. Update burst particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    p.velocity.y -= 9.8 * dt;
    p.mesh.position.addScaledVector(p.velocity, dt);
    if (p.life <= 0) {
      scene.remove(p.mesh);
      particles.splice(i, 1);
    }
  }

  renderer.render(scene, camera);
}

// Initialize UI & first preview bread
updateZukanCountUI();
updateHighScoreUI();
buildBread3D(BREAD_CATALOG[0]);
animate();
