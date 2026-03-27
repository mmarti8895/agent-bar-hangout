'use strict';

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/* ───────── DOM refs ───────── */
const canvas = document.getElementById('barCanvas');
const dom = {
  assignForm: document.getElementById('assignForm'),
  taskLabel: document.getElementById('taskLabel'),
  taskNotes: document.getElementById('taskNotes'),
  taskEta: document.getElementById('taskEta'),
  taskList: document.getElementById('taskList'),
  historyList: document.getElementById('historyList'),
  selectedName: document.getElementById('selectedAgentName'),
  selectedRole: document.getElementById('selectedAgentRole'),
  selectedMood: document.getElementById('selectedAgentMood'),
  selectedStatus: document.getElementById('selectedAgentStatus'),
  activeSummary: document.getElementById('activeSummary'),
  rosterGrid: document.getElementById('rosterGrid'),
  toastStack: document.querySelector('.toast-stack'),
  tooltip: document.getElementById('hoverTooltip'),
  mcpCheckboxes: document.getElementById('mcpCheckboxes'),
  mcpAdapterList: document.getElementById('mcpAdapterList'),
  mcpCount: document.getElementById('mcpCount'),
};
const stageElement = document.querySelector('.bar-stage');

/* ───────── Agent definitions ───────── */
const baseAgents = [
  {
    id: 'nova', name: 'Nova', role: 'Logistics Lead', mood: 'Cheerful',
    color: 0xf5a25d, position: { x: -2.5, y: 0, z: 1.2 },
    motto: 'Keeps the supply lines humming.',
  },
  {
    id: 'quinn', name: 'Quinn', role: 'Data Whisperer', mood: 'Focused',
    color: 0x7ad3f7, position: { x: -0.8, y: 0, z: 0.5 },
    motto: 'Reads the signals nobody else sees.',
  },
  {
    id: 'rune', name: 'Rune', role: 'Ops Alchemist', mood: 'Calm',
    color: 0xb28ffc, position: { x: 1.0, y: 0, z: 1.0 },
    motto: 'Turns chaos into flow.',
  },
  {
    id: 'sol', name: 'Sol', role: 'Field Liaison', mood: 'Upbeat',
    color: 0xf7d96f, position: { x: 2.6, y: 0, z: -0.3 },
    motto: 'Keeps every client smiling.',
  },
];

const state = {
  agents: baseAgents.map((a, i) => ({
    ...a, tasks: [], history: [], status: 'idle', swayOffset: i * 0.8,
    mesh: null, labelSprite: null, ringMesh: null,
  })),
  selectedAgentId: baseAgents[0].id,
  hoveredAgentId: null,
};

/* ───────── MCP Adapter Registry ───────── */
const mcpAdapters = [
  {
    id: 'github', name: 'GitHub', icon: '🐙',
    description: 'Repos, issues, PRs, code search',
    tools: ['create_issue', 'search_code', 'open_pr', 'list_commits', 'review_pr'],
  },
  {
    id: 'filesystem', name: 'Filesystem', icon: '📁',
    description: 'Read, write, search local files',
    tools: ['read_file', 'write_file', 'list_dir', 'grep_search', 'delete_file'],
  },
  {
    id: 'web', name: 'Web Fetch', icon: '🌐',
    description: 'Fetch & parse web content',
    tools: ['fetch_url', 'search_web', 'extract_text', 'screenshot_page'],
  },
  {
    id: 'database', name: 'Database', icon: '🗄️',
    description: 'Query & manage SQL/NoSQL stores',
    tools: ['run_query', 'list_tables', 'describe_schema', 'insert_row', 'update_row'],
  },
  {
    id: 'slack', name: 'Slack', icon: '💬',
    description: 'Post messages, read channels',
    tools: ['send_message', 'read_channel', 'list_channels', 'search_messages'],
  },
  {
    id: 'terminal', name: 'Terminal', icon: '⚡',
    description: 'Run shell commands & scripts',
    tools: ['run_command', 'run_script', 'read_output', 'kill_process'],
  },
];

/* ───────── Three.js setup ───────── */
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.6;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1428);
scene.fog = new THREE.FogExp2(0x1a1428, 0.04);

const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
camera.position.set(0, 4, 7);
camera.lookAt(0, 1, 0);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI / 2.1;
controls.minDistance = 3;
controls.maxDistance = 15;
controls.target.set(0, 1, 0);

/* ───────── Lighting ───────── */
const ambientLight = new THREE.AmbientLight(0x665577, 1.4);
scene.add(ambientLight);

const mainLight = new THREE.DirectionalLight(0xfff0d0, 2.0);
mainLight.position.set(3, 6, 4);
mainLight.castShadow = true;
mainLight.shadow.mapSize.set(1024, 1024);
scene.add(mainLight);

// Fill light from the front
const fillLight = new THREE.DirectionalLight(0xc8d8ff, 0.6);
fillLight.position.set(-2, 3, 6);
scene.add(fillLight);

// Warm bar lamps
[
  { x: -4, y: 3.5, z: 0, color: 0xffdd88 },
  { x: -1.5, y: 3.5, z: 0, color: 0xffaa55 },
  { x: 1.5, y: 3.5, z: 0, color: 0xffdd88 },
  { x: 4, y: 3.5, z: 0, color: 0xffaa55 },
].forEach((lp) => {
  const light = new THREE.PointLight(lp.color, 4.0, 14);
  light.position.set(lp.x, lp.y, lp.z);
  light.castShadow = true;
  scene.add(light);
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 8, 8),
    new THREE.MeshBasicMaterial({ color: lp.color })
  );
  bulb.position.copy(light.position);
  scene.add(bulb);
});

// Neon accent strips — brighter
[
  { color: 0xff2266, x: -3.5, y: 2.8, z: -2.5 },
  { color: 0x22ccff, x: 0, y: 2.8, z: -2.5 },
  { color: 0xff8800, x: 3.5, y: 2.8, z: -2.5 },
  { color: 0x44ff88, x: -1.5, y: 3.2, z: -3.0 },
  { color: 0xcc44ff, x: 1.5, y: 3.2, z: -3.0 },
].forEach((n) => {
  const neon = new THREE.PointLight(n.color, 2.0, 8);
  neon.position.set(n.x, n.y, n.z);
  scene.add(neon);
  // Neon tube visual
  const tube = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, 0.8, 8),
    new THREE.MeshBasicMaterial({ color: n.color })
  );
  tube.rotation.z = Math.PI / 2;
  tube.position.copy(neon.position);
  scene.add(tube);
});

/* ───────── Raycasting ───────── */
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

/* ───────── Load GLB assets ───────── */
const loader = new GLTFLoader();
let beerTemplate = null;

// Load beer GLB to clone per agent
loader.load(
  'public/assets/bar/BEER.glb',
  (gltf) => {
    beerTemplate = gltf.scene;
    beerTemplate.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
      }
    });
    // Attach beer to all existing agents
    state.agents.forEach((agent) => attachBeerToAgent(agent));
  },
  undefined,
  () => {
    // BEER.glb not found — create procedural beer mugs
    state.agents.forEach((agent) => attachProceduralBeer(agent));
  }
);

function attachBeerToAgent(agent) {
  if (!agent.mesh || !beerTemplate) return;
  const beer = beerTemplate.clone();
  // Scale & position in agent's hand
  const box = new THREE.Box3().setFromObject(beer);
  const size = box.getSize(new THREE.Vector3());
  const beerScale = 0.4 / Math.max(size.x, size.y, size.z);
  beer.scale.setScalar(beerScale);
  beer.position.set(0.35, 0.7, 0.1);
  beer.rotation.z = -0.15;
  agent.mesh.add(beer);
}

function attachProceduralBeer(agent) {
  if (!agent.mesh) return;
  const mugGroup = new THREE.Group();
  // Glass body
  const glass = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.06, 0.18, 12),
    new THREE.MeshPhysicalMaterial({
      color: 0xffcc44, roughness: 0.1, metalness: 0,
      transmission: 0.6, thickness: 0.5, transparent: true, opacity: 0.8,
    })
  );
  glass.position.y = 0.09;
  mugGroup.add(glass);
  // Foam head
  const foam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.075, 0.07, 0.04, 12),
    new THREE.MeshStandardMaterial({ color: 0xfff8e8, roughness: 0.9 })
  );
  foam.position.y = 0.2;
  mugGroup.add(foam);
  // Handle
  const handle = new THREE.Mesh(
    new THREE.TorusGeometry(0.05, 0.015, 8, 12, Math.PI),
    new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.3, metalness: 0.4 })
  );
  handle.position.set(0.09, 0.09, 0);
  handle.rotation.z = -Math.PI / 2;
  mugGroup.add(handle);

  mugGroup.position.set(0.35, 0.7, 0.1);
  mugGroup.rotation.z = -0.15;
  agent.mesh.add(mugGroup);
}

loader.load(
  'public/assets/bar/bar-scene.glb',
  (gltf) => {
    const barModel = gltf.scene;
    barModel.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    const box = new THREE.Box3().setFromObject(barModel);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const scale = 8 / maxDim;
    barModel.scale.setScalar(scale);
    const center = box.getCenter(new THREE.Vector3());
    barModel.position.sub(center.multiplyScalar(scale));
    barModel.position.y = 0;
    scene.add(barModel);
  },
  undefined,
  () => {
    buildFallbackBar();
  }
);

function buildFallbackBar() {
  // Floor
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 10),
    new THREE.MeshStandardMaterial({ color: 0x2c1b16, roughness: 0.85 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Bar counter
  const counter = new THREE.Mesh(
    new THREE.BoxGeometry(10, 1.1, 1.2),
    new THREE.MeshStandardMaterial({ color: 0x4c2e1f, roughness: 0.6 })
  );
  counter.position.set(0, 0.55, -2.5);
  counter.castShadow = true;
  counter.receiveShadow = true;
  scene.add(counter);

  // Counter top
  const top = new THREE.Mesh(
    new THREE.BoxGeometry(10.4, 0.08, 1.6),
    new THREE.MeshStandardMaterial({ color: 0x3b2418, roughness: 0.4, metalness: 0.1 })
  );
  top.position.set(0, 1.14, -2.5);
  top.receiveShadow = true;
  scene.add(top);

  // Back wall
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(14, 5, 0.2),
    new THREE.MeshStandardMaterial({ color: 0x1c1230, roughness: 0.9 })
  );
  wall.position.set(0, 2.5, -3.5);
  wall.receiveShadow = true;
  scene.add(wall);

  // Shelves
  for (let i = 0; i < 3; i++) {
    const shelf = new THREE.Mesh(
      new THREE.BoxGeometry(3, 0.06, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x5a3a28 })
    );
    shelf.position.set(-3.5 + i * 3.5, 2.0 + (i % 2) * 0.4, -3.3);
    scene.add(shelf);
  }

  // Bar stools
  for (let i = 0; i < 5; i++) {
    const seat = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.25, 0.08, 16),
      new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.7 })
    );
    seat.position.set(-3.2 + i * 1.6, 0.7, -1.3);
    seat.castShadow = true;
    scene.add(seat);
    const leg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 0.7, 8),
      new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.6 })
    );
    leg.position.set(-3.2 + i * 1.6, 0.35, -1.3);
    scene.add(leg);
  }
}

/* ───────── Create 3D agent sprites ───────── */
function createAgentMesh(agent) {
  const group = new THREE.Group();
  group.userData.agentId = agent.id;

  // Body — sleek jacket look with metallic sheen
  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: agent.color, roughness: 0.25, metalness: 0.35,
    emissive: agent.color, emissiveIntensity: 0.2,
    clearcoat: 0.4, clearcoatRoughness: 0.2,
  });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.6, 8, 16), bodyMat);
  body.position.y = 0.6;
  body.castShadow = true;
  group.add(body);

  // Jacket collar / shoulder pads
  const collarMat = new THREE.MeshStandardMaterial({
    color: 0x111111, roughness: 0.4, metalness: 0.5,
  });
  const leftCollar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.18), collarMat);
  leftCollar.position.set(-0.24, 1.0, 0.06);
  leftCollar.rotation.z = 0.3;
  group.add(leftCollar);
  const rightCollar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.18), collarMat);
  rightCollar.position.set(0.24, 1.0, 0.06);
  rightCollar.rotation.z = -0.3;
  group.add(rightCollar);

  // Head
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0xf9efe5, roughness: 0.5 })
  );
  head.position.y = 1.25;
  head.castShadow = true;
  group.add(head);

  // Sunglasses — cool shades
  const lensMat = new THREE.MeshPhysicalMaterial({
    color: 0x111122, roughness: 0.05, metalness: 0.9,
    clearcoat: 1.0, clearcoatRoughness: 0.05,
  });
  const leftLens = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 12), lensMat);
  leftLens.scale.set(1, 0.7, 0.4);
  leftLens.position.set(-0.08, 1.28, 0.18);
  group.add(leftLens);
  const rightLens = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 12), lensMat);
  rightLens.scale.set(1, 0.7, 0.4);
  rightLens.position.set(0.08, 1.28, 0.18);
  group.add(rightLens);
  // Bridge
  const bridge = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 0.1, 6),
    new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8, roughness: 0.2 })
  );
  bridge.rotation.z = Math.PI / 2;
  bridge.position.set(0, 1.28, 0.2);
  group.add(bridge);
  // Arms of glasses
  const armMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.7, roughness: 0.3 });
  const leftArm = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.18, 6), armMat);
  leftArm.rotation.x = Math.PI / 2;
  leftArm.position.set(-0.14, 1.28, 0.08);
  group.add(leftArm);
  const rightArm = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.18, 6), armMat);
  rightArm.rotation.x = Math.PI / 2;
  rightArm.position.set(0.14, 1.28, 0.08);
  group.add(rightArm);

  // Mouth — cool smirk
  const smirk = new THREE.Mesh(
    new THREE.TorusGeometry(0.06, 0.012, 8, 12, Math.PI * 0.6),
    new THREE.MeshBasicMaterial({ color: 0xcc6666 })
  );
  smirk.position.set(0.02, 1.18, 0.19);
  smirk.rotation.x = -0.1;
  smirk.rotation.z = 0.15;
  group.add(smirk);

  // Selection ring
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xffd166, side: THREE.DoubleSide, transparent: true, opacity: 0,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.58, 32), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  group.add(ring);
  agent.ringMesh = ring;

  // Name label sprite
  const labelCanvas = document.createElement('canvas');
  labelCanvas.width = 256;
  labelCanvas.height = 64;
  const lctx = labelCanvas.getContext('2d');
  lctx.fillStyle = 'rgba(10, 8, 18, 0.75)';
  roundRect(lctx, 0, 0, 256, 64, 12);
  lctx.fill();
  lctx.fillStyle = '#fefcf7';
  lctx.font = 'bold 28px Inter, Segoe UI, sans-serif';
  lctx.textAlign = 'center';
  lctx.fillText(agent.name, 128, 30);
  lctx.fillStyle = '#a9b3c1';
  lctx.font = '18px Inter, Segoe UI, sans-serif';
  lctx.fillText(agent.role, 128, 54);

  const labelTexture = new THREE.CanvasTexture(labelCanvas);
  const labelSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture, transparent: true }));
  labelSprite.scale.set(1.4, 0.35, 1);
  labelSprite.position.y = 1.7;
  group.add(labelSprite);
  agent.labelSprite = labelSprite;

  group.position.set(agent.position.x, agent.position.y, agent.position.z);
  agent.mesh = group;
  scene.add(group);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

state.agents.forEach(createAgentMesh);

/* ───────── Animation loop ───────── */
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const elapsed = clock.getElapsedTime();

  state.agents.forEach((agent) => {
    if (!agent.mesh) return;

    // Working agents hunch forward and bob faster; idle agents sway casually
    const isWorking = agent.status === 'busy';
    const bobSpeed = isWorking ? 3.0 : 1.5;
    const bobAmp = isWorking ? 0.02 : 0.06;
    const bob = Math.sin(elapsed * bobSpeed + agent.swayOffset) * bobAmp;
    const sway = isWorking ? 0 : Math.sin(elapsed * 0.8 + agent.swayOffset) * 0.04;

    // Working agents lean forward slightly
    const targetLean = isWorking ? 0.15 : 0;
    agent.mesh.rotation.x += (targetLean - agent.mesh.rotation.x) * 0.05;

    agent.mesh.position.y = agent.position.y + bob;
    agent.mesh.rotation.y = sway;

    // Body opacity/emissive for working state
    const body = agent.mesh.children[0];
    if (body && body.material) {
      const targetEmissive = isWorking
        ? 0.35 + Math.sin(elapsed * 4 + agent.swayOffset) * 0.2
        : 0.2;
      body.material.emissiveIntensity += (targetEmissive - body.material.emissiveIntensity) * 0.1;
    }

    // Selection ring
    const isSelected = agent.id === state.selectedAgentId;
    const isHovered = agent.id === state.hoveredAgentId;
    const targetOpacity = isSelected ? 0.9 : isHovered ? 0.5 : 0;
    const ring = agent.ringMesh;
    if (ring) {
      ring.material.opacity += (targetOpacity - ring.material.opacity) * 0.15;
      ring.material.color.set(isSelected ? (isWorking ? 0x22ccff : 0xffd166) : 0xffffff);
      if (isSelected) {
        ring.rotation.z = elapsed * (isWorking ? 1.5 : 0.5);
        ring.scale.setScalar(1 + Math.sin(elapsed * 2) * 0.05);
      }
    }

    // Sunglasses lens reflection shimmer
    const leftLens = agent.mesh.children[3];
    const rightLens = agent.mesh.children[4];
    if (leftLens && leftLens.material && leftLens.material.clearcoat !== undefined) {
      const shimmer = 0.85 + Math.sin(elapsed * 2.5 + agent.swayOffset) * 0.15;
      leftLens.material.clearcoat = shimmer;
      rightLens.material.clearcoat = shimmer;
    }
  });

  controls.update();
  renderer.render(scene, camera);
}

/* ───────── Resizing ───────── */
function onResize() {
  const rect = stageElement.getBoundingClientRect();
  renderer.setSize(rect.width, rect.height);
  camera.aspect = rect.width / rect.height;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', onResize);
onResize();

/* ───────── Interaction ───────── */
function getAgentFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);

  const meshes = [];
  state.agents.forEach((a) => {
    if (a.mesh) a.mesh.traverse((c) => { if (c.isMesh) meshes.push(c); });
  });
  const hits = raycaster.intersectObjects(meshes, false);
  if (!hits.length) return null;

  let obj = hits[0].object;
  while (obj) {
    if (obj.userData && obj.userData.agentId) {
      return state.agents.find((a) => a.id === obj.userData.agentId) || null;
    }
    obj = obj.parent;
  }
  return null;
}

canvas.addEventListener('click', (event) => {
  const agent = getAgentFromEvent(event);
  if (agent) selectAgent(agent.id);
});

canvas.addEventListener('mousemove', (event) => {
  const agent = getAgentFromEvent(event);
  if (agent) {
    state.hoveredAgentId = agent.id;
    canvas.style.cursor = 'pointer';
    updateTooltip(agent, event);
  } else {
    state.hoveredAgentId = null;
    canvas.style.cursor = 'grab';
    hideTooltip();
  }
});

canvas.addEventListener('mouseleave', () => {
  state.hoveredAgentId = null;
  hideTooltip();
});

/* ───────── Tooltip ───────── */
function updateTooltip(agent, event) {
  const stageRect = stageElement.getBoundingClientRect();
  const x = event.clientX - stageRect.left;
  const y = event.clientY - stageRect.top;
  dom.tooltip.textContent = agent.name + ' — ' + agent.role;
  dom.tooltip.style.left = x + 'px';
  dom.tooltip.style.top = y + 'px';
  dom.tooltip.classList.add('visible');
}

function hideTooltip() {
  dom.tooltip.classList.remove('visible');
}

/* ───────── Agent selection & sidebar ───────── */
function selectAgent(agentId) {
  if (!agentId || state.selectedAgentId === agentId) return;
  state.selectedAgentId = agentId;
  renderSidebar();
  updateRosterSelection();
}

function getSelectedAgent() {
  return state.agents.find((a) => a.id === state.selectedAgentId) || null;
}

function renderSidebar() {
  const agent = getSelectedAgent();
  if (!agent) {
    dom.selectedName.textContent = 'Choose an agent';
    dom.selectedRole.textContent = 'Click a sprite in the bar or use the roster.';
    dom.selectedMood.textContent = 'Mood —';
    dom.selectedStatus.textContent = 'Status —';
    renderTaskList(dom.taskList, [], 'Select an agent to assign work.', true);
    renderTaskList(dom.historyList, [], 'No history yet.', false);
    dom.activeSummary.textContent = '0 tasks';
    return;
  }
  dom.selectedName.textContent = agent.name;
  dom.selectedRole.textContent = agent.role;
  dom.selectedMood.textContent = 'Mood ' + agent.mood;
  const statusLabel = agent.tasks.length ? 'Busy' : 'Idle';
  dom.selectedStatus.textContent = 'Status ' + statusLabel;
  renderTaskList(dom.taskList, agent.tasks, 'No active tasks.', true);
  renderTaskList(dom.historyList, agent.history, 'No completed tasks yet.', false);
  dom.activeSummary.textContent = agent.tasks.length ? agent.tasks.length + ' task(s)' : 'No active tasks';
}

function renderTaskList(listElement, tasks, emptyMessage, showActions) {
  listElement.innerHTML = '';
  if (!tasks.length) {
    const emptyItem = document.createElement('li');
    emptyItem.className = 'empty';
    emptyItem.textContent = emptyMessage;
    listElement.appendChild(emptyItem);
    return;
  }
  tasks.forEach((task) => {
    const item = document.createElement('li');
    item.className = 'task-card';

    const meta = document.createElement('div');
    meta.className = 'task-meta';
    const title = document.createElement('strong');
    title.textContent = task.label;
    const notes = document.createElement('span');
    notes.className = 'subtle';
    notes.textContent = task.notes || 'No extra notes';
    const stamp = document.createElement('span');
    stamp.className = 'eyebrow';
    const etaText = task.etaMinutes ? task.etaMinutes + ' min ETA' : 'ETA n/a';
    const timeText = task.status === 'done' && task.completedAt
      ? 'Done ' + formatTime(task.completedAt)
      : 'Since ' + formatTime(task.createdAt);
    stamp.textContent = etaText + ' • ' + timeText;
    meta.appendChild(title);
    meta.appendChild(notes);

    // Show MCP badges on task
    if (task.mcpIds && task.mcpIds.length) {
      const mcpRow = document.createElement('div');
      mcpRow.style.cssText = 'display:flex;gap:0.3rem;flex-wrap:wrap;margin-top:0.2rem;';
      task.mcpIds.forEach((mcpId) => {
        const adapter = mcpAdapters.find((m) => m.id === mcpId);
        if (!adapter) return;
        const badge = document.createElement('span');
        badge.className = 'pill';
        badge.style.fontSize = '0.65rem';
        badge.textContent = adapter.icon + ' ' + adapter.name;
        mcpRow.appendChild(badge);
      });
      meta.appendChild(mcpRow);
    }

    meta.appendChild(stamp);
    item.appendChild(meta);

    if (showActions) {
      const actions = document.createElement('div');
      actions.className = 'task-actions';
      const statusPill = document.createElement('span');
      const statusClass = task.status === 'done' ? 'status-done'
        : task.status === 'verifying' ? 'status-verifying'
        : task.status === 'in-progress' ? 'status-working' : '';
      statusPill.className = 'pill ' + statusClass;
      const statusText = task.status === 'done' ? 'Done'
        : task.status === 'verifying' ? 'Verifying'
        : 'Working';
      statusPill.textContent = statusText;
      actions.appendChild(statusPill);
      if (task.status !== 'done') {
        const doneButton = document.createElement('button');
        doneButton.type = 'button';
        doneButton.dataset.action = 'done';
        doneButton.dataset.taskId = task.id;
        doneButton.textContent = 'Mark done';
        actions.appendChild(doneButton);
      }
      item.appendChild(actions);
    }

    // Progress log
    if (task.log && task.log.length) {
      const progress = document.createElement('div');
      progress.className = 'task-progress';

      // Progress bar
      const track = document.createElement('div');
      track.className = 'progress-bar-track';
      const fill = document.createElement('div');
      fill.className = 'progress-bar-fill';
      const pct = task.status === 'done' ? 100 : Math.min(95, (task.log.length / (task.totalSteps || 6)) * 100);
      fill.style.width = pct + '%';
      track.appendChild(fill);
      progress.appendChild(track);

      const logList = document.createElement('ul');
      logList.className = 'task-log';
      task.log.forEach((entry) => {
        const li = document.createElement('li');
        li.className = 'log-' + entry.type;
        const icon = document.createElement('span');
        icon.className = 'log-icon';
        icon.textContent = entry.type === 'mcp' ? '⚡' : entry.type === 'verify' ? '✓' : entry.type === 'done' ? '🍺' : '✗';
        li.appendChild(icon);
        const text = document.createElement('span');
        text.textContent = entry.message;
        li.appendChild(text);
        logList.appendChild(li);
      });
      progress.appendChild(logList);
      item.appendChild(progress);
    }

    listElement.appendChild(item);
  });
}

/* ───────── Roster ───────── */
function renderRoster() {
  dom.rosterGrid.innerHTML = '';
  state.agents.forEach((agent) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.agentId = agent.id;
    button.setAttribute('role', 'option');

    const nameSpan = document.createElement('span');
    nameSpan.className = 'agent-name';
    nameSpan.textContent = agent.name;
    const roleSpan = document.createElement('span');
    roleSpan.className = 'agent-role';
    roleSpan.textContent = agent.role;
    button.appendChild(nameSpan);
    button.appendChild(roleSpan);

    button.addEventListener('click', () => selectAgent(agent.id));
    dom.rosterGrid.appendChild(button);
  });
  updateRosterSelection();
}

function updateRosterSelection() {
  const buttons = dom.rosterGrid.querySelectorAll('button[data-agent-id]');
  buttons.forEach((button) => {
    const isActive = button.dataset.agentId === state.selectedAgentId;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-selected', String(isActive));
  });
}

/* ───────── Task management ───────── */
function getSelectedMcpIds() {
  const checked = dom.mcpCheckboxes.querySelectorAll('input[type="checkbox"]:checked');
  return Array.from(checked).map((cb) => cb.value);
}

function handleAssignSubmit(event) {
  event.preventDefault();
  const agent = getSelectedAgent();
  if (!agent) {
    pushToast('Select an agent before assigning work.');
    return;
  }
  const label = dom.taskLabel.value.trim();
  const notes = dom.taskNotes.value.trim();
  const etaRaw = dom.taskEta.value.trim();
  if (!label) {
    pushToast('Task label cannot be empty.');
    return;
  }
  const mcpIds = getSelectedMcpIds();
  const etaMinutes = etaRaw ? Math.max(1, Math.min(240, Number(etaRaw))) : null;
  addTaskToAgent(agent.id, { label, notes, etaMinutes, mcpIds });
  dom.assignForm.reset();
  dom.taskLabel.focus();
}

function addTaskToAgent(agentId, payload) {
  const agent = state.agents.find((a) => a.id === agentId);
  if (!agent) return;
  const mcpIds = payload.mcpIds || [];
  const task = {
    id: 'task-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 999),
    label: payload.label,
    notes: payload.notes,
    etaMinutes: payload.etaMinutes,
    mcpIds: mcpIds,
    status: 'in-progress',
    createdAt: new Date().toISOString(),
    completedAt: null,
    log: [],
    totalSteps: 2 + mcpIds.length * 2 + 2, // connect + per-mcp work + verify + done
  };
  agent.tasks.push(task);
  agent.status = 'busy';
  renderSidebar();
  const mcpNames = mcpIds.map((id) => {
    const a = mcpAdapters.find((m) => m.id === id);
    return a ? a.name : id;
  });
  const mcpNote = mcpNames.length ? ' using ' + mcpNames.join(', ') : '';
  pushToast(agent.name + ' is on it' + mcpNote + '!');

  // Start simulated execution
  runTaskExecution(agent, task);
}

/* ───────── Simulated MCP execution pipeline ───────── */
function runTaskExecution(agent, task) {
  const steps = buildExecutionSteps(task);
  let stepIndex = 0;

  function nextStep() {
    if (stepIndex >= steps.length) return;
    // Task may have been manually completed
    if (task.status === 'done') return;

    const step = steps[stepIndex];
    task.log.push(step);

    // Update task status based on phase
    if (step.type === 'verify') {
      task.status = 'verifying';
    } else if (step.type === 'done') {
      finishTask(agent, task);
      return;
    }

    renderSidebar();
    stepIndex++;

    // Random delay (800-2500ms) to simulate real MCP responses
    const delay = 800 + Math.floor(Math.random() * 1700);
    setTimeout(nextStep, delay);
  }

  // Kick off after a short initial delay
  setTimeout(nextStep, 600);
}

function buildExecutionSteps(task) {
  const steps = [];
  const mcpIds = task.mcpIds || [];

  // Phase 1: Connect to MCPs
  if (mcpIds.length) {
    steps.push({ type: 'mcp', message: 'Connecting to ' + mcpIds.length + ' MCP adapter(s)...' });
  } else {
    steps.push({ type: 'mcp', message: 'Planning approach (no MCPs selected)...' });
  }

  // Phase 2: Use each MCP's tools
  mcpIds.forEach((mcpId) => {
    const adapter = mcpAdapters.find((m) => m.id === mcpId);
    if (!adapter) return;
    // Pick 1-2 random tools from this adapter
    const toolCount = 1 + Math.floor(Math.random() * Math.min(2, adapter.tools.length));
    for (let i = 0; i < toolCount; i++) {
      const tool = adapter.tools[Math.floor(Math.random() * adapter.tools.length)];
      steps.push({
        type: 'mcp',
        message: adapter.icon + ' ' + adapter.name + '.' + tool + '() → OK',
      });
    }
  });

  // Phase 3: Working on the actual task
  steps.push({ type: 'mcp', message: 'Processing "' + truncate(task.label, 30) + '"...' });

  // Phase 4: Verification (the goal — do a great job so they can get back to the bar)
  steps.push({ type: 'verify', message: 'Running verification checks...' });

  // Sometimes there's a re-check
  if (Math.random() > 0.5) {
    steps.push({ type: 'verify', message: 'Double-checking output quality...' });
  }

  steps.push({ type: 'verify', message: 'All checks passed ✓' });

  // Phase 5: Done — back to the bar!
  steps.push({ type: 'done', message: 'Task complete — heading back to the bar! 🍺' });

  return steps;
}

function truncate(str, max) {
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

function finishTask(agent, task) {
  const index = agent.tasks.findIndex((t) => t.id === task.id);
  if (index === -1) return;
  agent.tasks.splice(index, 1);
  task.status = 'done';
  task.completedAt = new Date().toISOString();
  agent.history.unshift(task);
  agent.status = agent.tasks.length ? 'busy' : 'idle';
  renderSidebar();
  pushToast(agent.name + ' finished "' + task.label + '" and is back at the bar! 🍺');
}

function markTaskDone(agentId, taskId) {
  const agent = state.agents.find((a) => a.id === agentId);
  if (!agent) return;
  const index = agent.tasks.findIndex((t) => t.id === taskId);
  if (index === -1) return;
  const [task] = agent.tasks.splice(index, 1);
  task.status = 'done';
  task.completedAt = new Date().toISOString();
  agent.history.unshift(task);
  agent.status = agent.tasks.length ? 'busy' : 'idle';
  renderSidebar();
  pushToast(agent.name + ' wrapped "' + task.label + '".');
}

/* ───────── Toast ───────── */
function pushToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  dom.toastStack.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('visible'));
  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 300);
  }, 2600);
}

function formatTime(isoString) {
  const date = new Date(isoString);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/* ───────── Keyboard nav ───────── */
function handleKeyNavigation(event) {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
  if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') return;
  event.preventDefault();
  const direction = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
  const currentIndex = state.agents.findIndex((a) => a.id === state.selectedAgentId);
  const nextIndex = currentIndex === -1 ? 0 : (currentIndex + direction + state.agents.length) % state.agents.length;
  selectAgent(state.agents[nextIndex].id);
}

/* ───────── Init ───────── */
function init() {
  renderRoster();
  renderSidebar();
  dom.assignForm.addEventListener('submit', handleAssignSubmit);
  dom.taskList.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action="done"]');
    if (!button || !state.selectedAgentId) return;
    markTaskDone(state.selectedAgentId, button.dataset.taskId);
  });
  document.addEventListener('keydown', handleKeyNavigation);
  animate();
}

init();