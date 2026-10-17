import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { BREAD_CATALOG, CUSTOMERS } from './data.js';
import { sound } from './audio.js';

// ==========================================
// 1. STATE & PERSISTENCE (手描きPOPぱん図鑑)
// ==========================================
const STORAGE_KEY = 'pukumuku_unlocked_pops_v1';
let unlockedBreadIds = new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '["cream_pan"]'));

function saveUnlocked() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...unlockedBreadIds]));
  updateZukanCountUI();
}

const gameState = {
  phase: 'TITLE', // TITLE | PLAYING | JUDGING | RESULT
  timeRemaining: 60, // 60 seconds = 5:30 AM to 6:30 AM (1 sec = 1 min)
  profit: 0,
  combo: 0,
  completedBreads: [],
  pukumukuCount: 0,
  burstCount: 0,
  currentBread: BREAD_CATALOG[0],
  currentCustomer: null,
  fillPercent: 0,
  isInjecting: false,
  inertiaVelocity: 0,
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
// 3. LOAD UPGRADED BLENDER MODEL: JUN-KUN
// ==========================================
const junkunRoot = new THREE.Group();
junkunRoot.position.set(0, 0.92, -0.15);
scene.add(junkunRoot);

// Group for facial splatters / yakisobaリーゼント / saba katsu on Jun-kun
const junkunGagGroup = new THREE.Group();
junkunRoot.add(junkunGagGroup);

let junkunModel = null;
let junkunBaseRotY = -Math.PI * 0.5 + 0.22; // Iconic Pukumuku slightly sideways glance!

const gltfLoader = new GLTFLoader();
gltfLoader.load(
  './models/junkun.glb',
  (gltf) => {
    junkunModel = gltf.scene;
    // In Blender, Jun-kun faces -X. Rotating -90 deg (+ slight sideways angle) makes him face the counter & camera!
    junkunModel.rotation.y = junkunBaseRotY;
    junkunModel.scale.set(0.42, 0.42, 0.42);
    junkunModel.position.set(0, 0, 0);

    junkunModel.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
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
// 4. PROCEDURAL DEFORMABLE 3D BREAD MESHES
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
  const geo = new THREE.SphereGeometry(0.38, 32, 24);
  const posAttr = geo.attributes.position;

  // Shape the base geometry according to the authentic Pukumuku bread type
  for (let i = 0; i < posAttr.count; i++) {
    let x = posAttr.getX(i);
    let y = posAttr.getY(i);
    let z = posAttr.getZ(i);

    if (bread.shape === 'oval_bun' || bread.shape === 'curry_oval') {
      x *= 1.25;
      y *= 0.78;
      z *= 0.95;
    } else if (bread.shape === 'koppe_roll' || bread.shape === 'oblong_bun') {
      x *= 1.55;
      y *= 0.72;
      z *= 0.78;
    } else if (bread.shape === 'shokupan_loaf') {
      // Mountain-top loaf shape
      x *= 0.95 + (y > 0 ? 0.15 : 0);
      y *= 1.25;
      z *= 0.9;
    } else if (bread.shape === 'bone_tiny') {
      // Cute dog bone shape
      const endBulge = 1.0 + Math.pow(Math.abs(x) / 0.38, 2) * 0.65;
      x *= 0.85;
      y *= 0.45 * endBulge;
      z *= 0.55 * endBulge;
    } else if (bread.shape === 'lumpy_bun') {
      // Potato bread bumpy surface
      const bump = 1 + 0.08 * Math.sin(x * 14) * Math.cos(y * 14);
      x *= 1.1 * bump;
      y *= 0.85 * bump;
      z *= 1.05 * bump;
    } else {
      y *= 0.82;
    }

    // Flatten bottom slightly so it sits on the tray
    if (y < -0.18) y = -0.18 + (y + 0.18) * 0.3;

    posAttr.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();

  // Save base vertex positions for real-time "ぷくぷく・むくむく" deformation
  basePositions = new Float32Array(posAttr.array);

  const doughMat = new THREE.MeshStandardMaterial({
    color: bread.doughColor,
    roughness: bread.shape === 'curry_oval' ? 0.85 : 0.55,
    metalness: 0.05,
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
    roughness: 0.3,
    emissive: bread.fillingColor,
    emissiveIntensity: 0.25
  });
  activeInnerGlowMesh = new THREE.Mesh(innerGeo, innerMat);
  activeInnerGlowMesh.visible = false;
  activeBreadGroup.add(activeInnerGlowMesh);

  // Add signature visual toppings per bread
  if (bread.id === 'negi_pan') {
    const negiMat = new THREE.MeshStandardMaterial({ color: 0x40c057 });
    for (let i = 0; i < 8; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.018, 8, 12), negiMat);
      ring.position.set((Math.random() - 0.5) * 0.35, 0.24, (Math.random() - 0.5) * 0.25);
      ring.rotation.x = Math.PI / 2;
      activeToppingGroup.add(ring);
    }
  } else if (bread.id === 'yakisoba_pan') {
    const noodleMat = new THREE.MeshStandardMaterial({ color: 0x6b3410, roughness: 0.5 });
    for (let i = 0; i < 7; i++) {
      const tube = new THREE.Mesh(new THREE.TorusKnotGeometry(0.08, 0.022, 24, 6), noodleMat);
      tube.position.set((i - 3) * 0.09, 0.22, 0);
      activeToppingGroup.add(tube);
    }
  } else if (bread.id === 'sabakatsu_burger' || bread.id === 'shake_burger') {
    const katsuColor = bread.id === 'sabakatsu_burger' ? 0xa65e26 : 0xe87a5d;
    const katsuMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.68, 0.14, 0.48),
      new THREE.MeshStandardMaterial({ color: katsuColor, roughness: 0.8 })
    );
    katsuMesh.position.set(0, 0.04, 0.08);
    activeToppingGroup.add(katsuMesh);
  } else if (bread.id === 'pukumuku_burger') {
    // Patty + green pepper slice peeking out
    const patty = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34, 0.34, 0.12, 18),
      new THREE.MeshStandardMaterial({ color: 0x6e2c1b })
    );
    patty.position.set(0, 0.05, 0.06);
    activeToppingGroup.add(patty);
  } else if (bread.id === 'raisin_shokupan') {
    const raisinMat = new THREE.MeshStandardMaterial({ color: 0x3b154a });
    for (let i = 0; i < 10; i++) {
      const r = new THREE.Mesh(new THREE.SphereGeometry(0.038, 8, 8), raisinMat);
      r.position.set((Math.random() - 0.5) * 0.42, (Math.random() - 0.2) * 0.38, 0.26);
      activeToppingGroup.add(r);
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
  for (let i = 0; i < 42; i++) {
    const pGeo = new THREE.SphereGeometry(0.045 + Math.random() * 0.06, 8, 8);
    const pMat = new THREE.MeshStandardMaterial({ color, roughness: 0.3 });
    const mesh = new THREE.Mesh(pGeo, pMat);
    mesh.position.copy(activeBreadGroup.position);

    // Shoot toward Jun-kun's face (0, 3.0, 0) and outward!
    const toFace = i < 18;
    const vx = toFace ? (Math.random() - 0.5) * 2.2 : (Math.random() - 0.5) * 7;
    const vy = toFace ? 2.5 + Math.random() * 2.5 : 1.5 + Math.random() * 5;
    const vz = toFace ? -2.8 - Math.random() * 1.5 : (Math.random() - 0.5) * 6;

    scene.add(mesh);
    particles.push({ mesh, velocity: new THREE.Vector3(vx, vy, vz), life: 1.6 });
  }

  // Stick comical 3D gag onto Jun-kun!
  addJunkunFaceGag(bread);
  // Show 2D lens splatter on screen
  triggerScreenSplatter(bread.splatColor);
}

function addJunkunFaceGag(bread) {
  // Clear previous gags if too many
  if (junkunGagGroup.children.length > 18) {
    junkunGagGroup.clear();
  }

  const gagMat = new THREE.MeshStandardMaterial({
    color: bread.fillingColor,
    roughness: 0.25
  });

  if (bread.id === 'yakisoba_pan') {
    // Yakisoba Regent Pompadour on top of Jun-kun's toast head!
    const pompadour = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.9, 12), gagMat);
    pompadour.rotation.x = Math.PI * 0.35;
    pompadour.position.set(0, 2.22, 0.25);
    junkunGagGroup.add(pompadour);
  } else if (bread.id === 'sabakatsu_burger') {
    // Saba katsu stuck to Jun-kun's cheek!
    const katsu = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.25, 0.08), gagMat);
    katsu.position.set(0.22, 1.62, 0.42);
    katsu.rotation.z = 0.3;
    junkunGagGroup.add(katsu);
  } else {
    // Custard / Choco / Curry / Mayo splat blobs right on Jun-kun's face!
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

  // Calculate "ぷくぷく・むくむく" expansion scale
  const swell = 1.0 + Math.pow(ratio, 1.25) * 0.95;
  const sag = Math.pow(ratio, 2.0) * 0.18 * bread.gravitySag;

  for (let i = 0; i < posAttr.count; i++) {
    const bx = basePositions[i * 3];
    const by = basePositions[i * 3 + 1];
    const bz = basePositions[i * 3 + 2];

    let nx = bx * swell;
    let ny = by * (1.0 + ratio * 0.72) - (by < 0 ? 0 : sag * 0.35);
    let nz = bz * swell;

    // Extra lumpy distortion for jagaimo_pan or stepped pulse for kinoko_pan
    if (bread.wobbleType === 'lumpy' && ratio > 0.3) {
      const lump = 1 + 0.14 * ratio * Math.sin(bx * 18 + ratio * 8) * Math.cos(bz * 18);
      nx *= lump;
      nz *= lump;
    }

    // High-tension trembling at >= 90% ("プルプル…ッ！")
    if (fillPct >= 90) {
      const tremorIntensity = (fillPct - 88) * 0.0022;
      nx += Math.sin(elapsedTime * 55 + by * 12) * tremorIntensity;
      ny += Math.cos(elapsedTime * 60 + bx * 12) * tremorIntensity;
    }

    posAttr.setXYZ(i, nx, ny, nz);
  }
  posAttr.needsUpdate = true;
  activeDoughMesh.geometry.computeVertexNormals();

  if (activeToppingGroup) {
    activeToppingGroup.scale.setScalar(1.0 + ratio * 0.65);
  }

  // Thinning dough transparency above 88% so inner filling glows through!
  if (fillPct >= 88) {
    activeDoughMesh.material.opacity = Math.max(0.58, 1.0 - (fillPct - 88) * 0.032);
    activeInnerGlowMesh.visible = true;
    activeInnerGlowMesh.scale.setScalar(0.8 + ratio * 0.85);
  } else {
    activeDoughMesh.material.opacity = 1.0;
    activeInnerGlowMesh.visible = false;
  }
}

// ==========================================
// 6. GAMEPLAY FLOW & CUSTOMER REQUESTS
// ==========================================
const hudClock = document.getElementById('hud-clock');
const clockBox = document.getElementById('clock-box');
const hudProfit = document.getElementById('hud-profit');
const hudCombo = document.getElementById('hud-combo');
const fillPercentEl = document.getElementById('fill-percent');
const gaugeFillEl = document.getElementById('gauge-fill');
const gaugeTrackEl = document.getElementById('gauge-track');
const btnInject = document.getElementById('btn-inject');

function formatMorningClock(secLeft) {
  // 60 sec = 05:30, 0 sec = 06:30
  const elapsedMinutes = Math.floor(60 - Math.max(0, secLeft));
  const totalMinutes = 5 * 60 + 30 + elapsedMinutes;
  const hh = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const mm = String(totalMinutes % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

function pickNextOrder(forcedBread = null) {
  gameState.fillPercent = 0;
  gameState.isInjecting = false;
  gameState.inertiaVelocity = 0;
  sound.stopPump();

  // Decide customer appearance (45% chance of a regular customer request!)
  if (!forcedBread && Math.random() < 0.48) {
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

  // Update Bread Order Card UI
  const b = gameState.currentBread;
  document.getElementById('bread-badge').textContent = b.tagBadge;
  document.getElementById('bread-name').textContent = b.name;
  document.getElementById('bread-subname').textContent = b.subName || '';
  document.getElementById('bread-price').textContent = `定価 ${b.basePrice}プク`;
  document.getElementById('bread-filling').textContent = `具材：${b.fillingName}`;
  document.getElementById('bread-hint').textContent = b.mechanicHint;

  streamMat.color.setHex(b.fillingColor);
  buildBread3D(b);
  updateGaugeUI(0);

  gameState.phase = 'PLAYING';
  btnInject.disabled = false;
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
  fillPercentEl.textContent = pct.toFixed(1);
  gaugeFillEl.style.width = `${clamped}%`;

  if (pct >= 93) {
    gaugeTrackEl.classList.add('danger-shake');
  } else {
    gaugeTrackEl.classList.remove('danger-shake');
  }
}

function startInjecting() {
  if (gameState.phase !== 'PLAYING') return;
  gameState.isInjecting = true;
  btnInject.classList.add('pressing');
  streamMesh.visible = true;
  sound.startPump();
}

function stopInjecting() {
  if (!gameState.isInjecting || gameState.phase !== 'PLAYING') return;
  gameState.isInjecting = false;
  btnInject.classList.remove('pressing');
  streamMesh.visible = false;
  sound.stopPump();

  // If the bread has viscosity inertia (like 濃厚チョコクリームぱん), let inertia settle briefly before judging!
  if (gameState.currentBread.inertia > 0.2 && gameState.fillPercent > 10) {
    gameState.phase = 'JUDGING';
    btnInject.disabled = true;
    gameState.inertiaVelocity = gameState.currentBread.inertia;
  } else if (gameState.fillPercent > 2) {
    finalizeBreadJudgment();
  }
}

function finalizeBreadJudgment() {
  gameState.phase = 'JUDGING';
  btnInject.disabled = true;
  streamMesh.visible = false;
  sound.stopPump();

  const pct = gameState.fillPercent;
  const bread = gameState.currentBread;
  const isCustomerMatch =
    gameState.currentCustomer && gameState.currentCustomer.favoriteIds.includes(bread.id);
  const custMultiplier = isCustomerMatch ? gameState.currentCustomer.bonusMultiplier : 1.0;

  let grade = 'UNDER';
  let titleText = '💦 スカスカ…';
  let earnedProfit = 0;

  if (pct >= 100) {
    grade = 'BURST';
    titleText = '💥 大破裂！！ 💥';
    earnedProfit = 0;
    gameState.combo = 0;
    gameState.burstCount++;
    gameState.lastHighlightPoem = bread.poemBurst;

    activeBreadGroup.visible = false;
    spawnBurstParticles(bread);
    sound.playResult('BURST');
  } else if (pct >= 95) {
    grade = 'PUKUMUKU';
    titleText = '✨ 極上プクムク！！ ✨';
    gameState.combo++;
    gameState.pukumukuCount++;

    const comboBonus = 1 + Math.min(gameState.combo * 0.15, 1.5);
    earnedProfit = Math.round(bread.basePrice * 2.0 * custMultiplier * comboBonus);
    gameState.profit += earnedProfit;
    gameState.lastHighlightPoem = bread.poemSuccess;

    // Unlock Handwritten POP in Zukan!
    unlockedBreadIds.add(bread.id);
    saveUnlocked();

    addBreadToShowcase3D(bread, true);
    gameState.completedBreads.push({ name: bread.name, grade: 'PUKUMUKU' });
    sound.playResult('PUKUMUKU', bread.id === 'dog_pan');
  } else if (pct >= 70) {
    grade = 'GOOD';
    titleText = '🍞 いい感じ！';
    earnedProfit = Math.round(bread.basePrice * custMultiplier);
    gameState.profit += earnedProfit;

    addBreadToShowcase3D(bread, false);
    gameState.completedBreads.push({ name: bread.name, grade: 'GOOD' });
    sound.playResult('GOOD');
  } else {
    grade = 'UNDER';
    titleText = '💨 スカスカ（プクムクじゃない）';
    earnedProfit = Math.round(bread.basePrice * 0.25);
    gameState.profit += earnedProfit;
    gameState.combo = 0;
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
    grade === 'PUKUMUKU' ? '#fcc419' : grade === 'BURST' ? '#e03131' : grade === 'GOOD' ? '#40c057' : '#868e96';

  if (grade === 'BURST') {
    jDetail.textContent = bread.burstMessage;
  } else {
    const bonusNote = isCustomerMatch && grade !== 'UNDER' ? '（常連ボーナス2倍！）' : '';
    jDetail.textContent = `充填度 ${pct.toFixed(1)}% / +${earnedProfit}プク ${bonusNote}`;
  }

  popup.classList.remove('hidden');

  setTimeout(() => {
    popup.classList.add('hidden');
    activeBreadGroup.visible = true;
    if (gameState.timeRemaining > 0) {
      pickNextOrder();
    }
  }, 1150);
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
  gameState.completedBreads = [];
  gameState.pukumukuCount = 0;
  gameState.burstCount = 0;
  gameState.lastHighlightPoem = BREAD_CATALOG[0].poemSuccess;

  hudProfit.textContent = '0';
  hudCombo.textContent = '0';
  clockBox.classList.remove('urgent');
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
  streamMesh.visible = false;
  sound.stopPump();
  sound.playOpeningBell();

  document.getElementById('res-profit').textContent = gameState.profit.toLocaleString();
  document.getElementById('res-total-breads').textContent = gameState.completedBreads.length;
  document.getElementById('res-pukumuku-count').textContent = gameState.pukumukuCount;
  document.getElementById('res-burst-count').textContent = gameState.burstCount;
  document.getElementById('res-poem-text').textContent = gameState.lastHighlightPoem;

  const tagsContainer = document.getElementById('res-bread-tags');
  tagsContainer.innerHTML = '';
  if (gameState.completedBreads.length === 0) {
    tagsContainer.innerHTML = '<span class="bread-tag-chip">まだぱんが並んでいません</span>';
  } else {
    gameState.completedBreads.forEach((item) => {
      const span = document.createElement('span');
      span.className = `bread-tag-chip ${item.grade === 'PUKUMUKU' ? 'pukumuku' : ''}`;
      span.textContent = `${item.grade === 'PUKUMUKU' ? '✨' : ''}${item.name}`;
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
// 8. EVENT LISTENERS & INPUT HANDLING
// ==========================================
btnInject.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  startInjecting();
});
window.addEventListener('pointerup', () => {
  stopInjecting();
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !e.repeat && gameState.phase === 'PLAYING') {
    e.preventDefault();
    startInjecting();
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

document.getElementById('btn-zukan').addEventListener('click', () => renderZukanModal());
document.getElementById('btn-open-zukan-title').addEventListener('click', () => renderZukanModal());
document.getElementById('btn-open-zukan-result').addEventListener('click', () => renderZukanModal());
document.getElementById('btn-close-zukan').addEventListener('click', () => {
  document.getElementById('modal-zukan').classList.add('hidden');
});

document.getElementById('btn-unlock-all').addEventListener('click', () => {
  BREAD_CATALOG.forEach((b) => unlockedBreadIds.add(b.id));
  saveUnlocked();
  renderZukanModal();
});

document.getElementById('btn-sound').addEventListener('click', (e) => {
  const muted = sound.toggleMute();
  e.currentTarget.textContent = muted ? '🔇' : '🔊';
});

document.getElementById('btn-share').addEventListener('click', (e) => {
  const text = `【純くんの朝6:30！プクムク・パン詰めパニック】\n本日の純利益：${gameState.profit}プク（極上プクムク：${gameState.pukumukuCount}個）\n\n「${gameState.lastHighlightPoem.replace(/\n/g, ' ')}」\n#パン工房プクムク #純くん`;
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
// 9. MAIN ANIMATION & PHYSICS LOOP
// ==========================================
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);
  const elapsed = clock.getElapsedTime();

  // 1. Update morning countdown clock (05:30 -> 06:30)
  if (gameState.phase === 'PLAYING' || gameState.phase === 'JUDGING') {
    gameState.timeRemaining -= dt;
    hudClock.textContent = formatMorningClock(gameState.timeRemaining);

    if (gameState.timeRemaining <= 12) {
      clockBox.classList.add('urgent');
    }
    if (gameState.timeRemaining <= 0 && gameState.phase !== 'RESULT') {
      finishGameAt630();
    }
  }

  // 2. Update bread filling physics
  if (gameState.phase === 'PLAYING' && gameState.isInjecting) {
    const bread = gameState.currentBread;
    let speedMultiplier = 1.0;

    // 3種のきのこぱん stepped rhythmic swelling
    if (bread.wobbleType === 'stepped') {
      speedMultiplier = 1.0 + 0.65 * Math.max(0, Math.sin(elapsed * 10));
    } else if (bread.id === 'yakisoba_pan' && gameState.fillPercent >= 78) {
      // Mayo turbo boost at the end!
      speedMultiplier = 1.38;
    }

    gameState.fillPercent += bread.fillSpeed * speedMultiplier * dt;
    sound.updatePump(gameState.fillPercent);
    updateGaugeUI(gameState.fillPercent);

    if (gameState.fillPercent >= 100) {
      finalizeBreadJudgment();
    }
  } else if (gameState.phase === 'JUDGING' && gameState.inertiaVelocity > 0) {
    // Viscous chocolate inertia after releasing button
    const step = gameState.inertiaVelocity * dt * 7.5;
    gameState.fillPercent += step;
    gameState.inertiaVelocity = Math.max(0, gameState.inertiaVelocity - step);
    updateGaugeUI(gameState.fillPercent);

    if (gameState.fillPercent >= 100 || gameState.inertiaVelocity <= 0.08) {
      gameState.inertiaVelocity = 0;
      finalizeBreadJudgment();
    }
  }

  // 3. Deform active 3D bread
  updateBreadDeformation(gameState.fillPercent, elapsed);

  // 4. Animate Jun-kun 3D model!
  if (junkunModel) {
    if (gameState.isInjecting) {
      // Jun-kun tenses up, leans back slightly, and trembles as fill approaches 95%!
      const tension = gameState.fillPercent / 100;
      junkunModel.rotation.y = junkunBaseRotY - tension * 0.18 + Math.sin(elapsed * 45) * 0.025 * tension;
      junkunRoot.position.y = 0.92 + Math.abs(Math.sin(elapsed * 20)) * 0.05;
    } else {
      // Iconic Pukumuku sideways idle sway, watching customers pass by on Nakano-dori
      junkunModel.rotation.y = junkunBaseRotY + Math.sin(elapsed * 1.6) * 0.12;
      junkunRoot.position.y = 0.92 + Math.sin(elapsed * 2.4) * 0.03;
    }
  }

  // 5. Update burst particles
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
buildBread3D(BREAD_CATALOG[0]);
animate();
