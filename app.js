'use strict';

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/* ───────── DOM refs ───────── */
const canvas = document.getElementById('barCanvas');
const dom = {
  assignForm: document.getElementById('assignForm'),
  taskTitle: document.getElementById('taskTitle'),
  taskInstructions: document.getElementById('taskInstructions'),
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
  responsePane: document.getElementById('responsePane'),
  clearResponsePane: document.getElementById('clearResponsePane'),
  activityLogBody: document.getElementById('activityLogBody'),
  logCount: document.getElementById('logCount'),
  agentOutputPane: document.getElementById('agentOutputPane'),
  agentOutputLabel: document.getElementById('agentOutputLabel'),
  clearAgentOutput: document.getElementById('clearAgentOutput'),
  clearLogBtn: document.getElementById('clearLogBtn'),
  mcpConfigBtn: document.getElementById('mcpConfigBtn'),
  mcpConfigModal: document.getElementById('mcpConfigModal'),
  mcpModalClose: document.getElementById('mcpModalClose'),
  mcpConfigList: document.getElementById('mcpConfigList'),
  mcpAddForm: document.getElementById('mcpAddForm'),
  mcpNewName: document.getElementById('mcpNewName'),
  mcpNewIcon: document.getElementById('mcpNewIcon'),
  mcpNewDesc: document.getElementById('mcpNewDesc'),
  mcpNewTools: document.getElementById('mcpNewTools'),
  mcpNewConfigFields: document.getElementById('mcpNewConfigFields'),
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

/* ───────── Agent context helpers (server-side engine) ───────── */
function clearServerContext(agentId) {
  fetch('/api/context/clear', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentId }),
  }).catch(() => {}); // fire-and-forget
}

/* ───────── MCP Adapter Registry ───────── */
const defaultMcpAdapters = [
  {
    id: 'github', name: 'GitHub', icon: '🐙',
    description: 'Repos, issues, PRs, code search',
    tools: ['create_issue', 'search_code', 'open_pr', 'list_commits', 'review_pr', 'list_repos'],
    isDefault: true,
    configFields: [
      { key: 'owner', label: 'Owner / Org', type: 'text', required: true, placeholder: 'e.g., mmarti8895' },
      { key: 'token', label: 'Personal Access Token', type: 'password', required: true, placeholder: 'ghp_…' },
      { key: 'apiUrl', label: 'API URL', type: 'url', required: false, placeholder: 'https://api.github.com' },
    ],
    configValues: {},
  },
  {
    id: 'filesystem', name: 'Filesystem', icon: '📁',
    description: 'Read, write, search local files',
    tools: ['read_file', 'write_file', 'list_dir', 'grep_search', 'delete_file'],
    isDefault: true,
    configFields: [
      { key: 'rootDir', label: 'Root Directory', type: 'text', required: true, placeholder: 'C:\\Users\\you\\projects' },
      { key: 'allowedExts', label: 'Allowed Extensions', type: 'text', required: false, placeholder: '.js, .ts, .json (blank = all)' },
    ],
    configValues: {},
  },
  {
    id: 'web', name: 'AI Query', icon: '🤖',
    description: 'LLM-powered queries via ChatGPT',
    tools: ['ask_llm', 'search_web', 'summarize', 'analyze'],
    isDefault: true,
    configFields: [],
    configValues: {},
  },
  {
    id: 'database', name: 'Database', icon: '🗄️',
    description: 'Query & manage SQL/NoSQL stores',
    tools: ['run_query', 'list_tables', 'describe_schema', 'insert_row', 'update_row'],
    isDefault: true,
    configFields: [
      { key: 'host', label: 'Host', type: 'text', required: true, placeholder: 'localhost' },
      { key: 'port', label: 'Port', type: 'text', required: true, placeholder: '5432' },
      { key: 'dbName', label: 'Database Name', type: 'text', required: true, placeholder: 'mydb' },
      { key: 'username', label: 'Username', type: 'text', required: true, placeholder: 'admin' },
      { key: 'password', label: 'Password', type: 'password', required: true, placeholder: '••••••' },
      { key: 'dialect', label: 'Dialect', type: 'text', required: false, placeholder: 'postgres, mysql, sqlite' },
    ],
    configValues: {},
  },
  {
    id: 'slack', name: 'Slack', icon: '💬',
    description: 'Post messages, read channels',
    tools: ['send_message', 'read_channel', 'list_channels', 'search_messages'],
    isDefault: true,
    configFields: [
      { key: 'workspaceUrl', label: 'Workspace URL', type: 'url', required: true, placeholder: 'https://your-team.slack.com' },
      { key: 'botToken', label: 'Bot OAuth Token', type: 'password', required: true, placeholder: 'xoxb-…' },
      { key: 'signingSecret', label: 'Signing Secret', type: 'password', required: false, placeholder: 'Optional' },
    ],
    configValues: {},
  },
  {
    id: 'terminal', name: 'Terminal', icon: '⚡',
    description: 'Run shell commands & scripts',
    tools: ['run_command', 'run_script', 'read_output', 'kill_process'],
    isDefault: true,
    configFields: [
      { key: 'shell', label: 'Shell', type: 'text', required: false, placeholder: 'powershell, bash, cmd' },
      { key: 'workingDir', label: 'Working Directory', type: 'text', required: false, placeholder: 'C:\\Users\\you\\projects' },
    ],
    configValues: {},
  },
  {
    id: 'atlassian', name: 'Atlassian', icon: '🔷',
    description: 'Jira issues, Confluence pages, Bitbucket',
    tools: ['create_jira_issue', 'search_issues', 'update_issue', 'get_board', 'create_confluence_page', 'search_confluence'],
    isDefault: true,
    configFields: [
      { key: 'domain', label: 'Atlassian Domain', type: 'url', required: true, placeholder: 'https://yoursite.atlassian.net' },
      { key: 'email', label: 'Account Email', type: 'email', required: true, placeholder: 'you@company.com' },
      { key: 'apiToken', label: 'API Token', type: 'password', required: true, placeholder: 'Atlassian API token' },
    ],
    configValues: {},
  },
  {
    id: 'hubspot', name: 'HubSpot', icon: '🟠',
    description: 'CRM contacts, deals, tickets & marketing',
    tools: ['create_contact', 'search_contacts', 'create_deal', 'update_deal', 'list_tickets', 'send_email'],
    isDefault: true,
    configFields: [
      { key: 'apiKey', label: 'Private App Access Token', type: 'password', required: true, placeholder: 'pat-…' },
      { key: 'portalId', label: 'Portal ID', type: 'text', required: true, placeholder: '12345678' },
    ],
    configValues: {},
  },
];

const MCP_STORAGE_KEY = 'agentBarHangout_mcpAdapters';

function loadMcpAdapters() {
  try {
    const saved = localStorage.getItem(MCP_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length) {
        // Merge saved config with defaults to pick up any new configFields
        return parsed.map((saved) => {
          const def = defaultMcpAdapters.find((d) => d.id === saved.id);
          return {
            ...saved,
            configFields: saved.configFields || (def ? def.configFields : []) || [],
            configValues: saved.configValues || {},
          };
        });
      }
    }
  } catch (_) { /* ignore corrupt data */ }
  return defaultMcpAdapters.map((a) => ({ ...a, configValues: { ...(a.configValues || {}) } }));
}

function saveMcpAdapters() {
  localStorage.setItem(MCP_STORAGE_KEY, JSON.stringify(mcpAdapters));
}

const mcpAdapters = loadMcpAdapters();

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
    notes.textContent = task.instructions || 'No instructions';
    const stamp = document.createElement('span');
    stamp.className = 'eyebrow';
    const etaText = task.etaMinutes ? task.etaMinutes + ' min ETA' : 'ETA n/a';
    const timeText = task.status === 'done' && task.completedAt
      ? 'Done ' + formatIsoTime(task.completedAt)
      : 'Since ' + formatIsoTime(task.createdAt);
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
  const title = dom.taskTitle.value.trim();
  const instructions = dom.taskInstructions.value.trim();
  const etaRaw = dom.taskEta.value.trim();
  if (!title) {
    pushToast('Task title cannot be empty.');
    return;
  }
  const mcpIds = getSelectedMcpIds();
  const etaMinutes = etaRaw ? Math.max(1, Math.min(240, Number(etaRaw))) : null;
  addTaskToAgent(agent.id, { title, instructions, etaMinutes, mcpIds });
  dom.assignForm.reset();
  // Reset checkboxes with AI Query checked by default
  renderMcpCheckboxes();
  dom.taskTitle.focus();
}

function addTaskToAgent(agentId, payload) {
  const agent = state.agents.find((a) => a.id === agentId);
  if (!agent) return;
  // Clear server context if switching to a different agent
  const lastMemAgent = state._lastTaskAgentId;
  if (lastMemAgent && lastMemAgent !== agentId) {
    clearServerContext(lastMemAgent);
  }
  state._lastTaskAgentId = agentId;

  const mcpIds = payload.mcpIds || [];
  const task = {
    id: 'task-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 999),
    label: payload.title,
    title: payload.title,
    instructions: payload.instructions,
    etaMinutes: payload.etaMinutes,
    mcpIds: mcpIds,
    status: 'in-progress',
    createdAt: new Date().toISOString(),
    completedAt: null,
    log: [],
    totalSteps: 2 + mcpIds.length * 2 + 2,
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
/* ───────── Response pane helpers ───────── */
function formatTime() {
  const d = new Date();
  return String(d.getHours()).padStart(2, '0') + ':' +
         String(d.getMinutes()).padStart(2, '0') + ':' +
         String(d.getSeconds()).padStart(2, '0');
}

let activityLogCount = 0;

/* ───────── Agent Output pane (main column) ───────── */
let agentOutputCount = 0;

function appendToAgentOutput(agentName, type, message) {
  const block = document.createElement('div');
  block.className = 'ao-entry ao-' + type;

  const header = document.createElement('div');
  header.className = 'ao-header';

  const badge = document.createElement('span');
  badge.className = 'ao-agent';
  badge.textContent = agentName;

  const typePill = document.createElement('span');
  typePill.className = 'ao-type ao-type-' + type;
  typePill.textContent = type;

  const time = document.createElement('span');
  time.className = 'ao-time';
  time.textContent = formatTime();

  header.appendChild(badge);
  header.appendChild(typePill);
  header.appendChild(time);

  const body = document.createElement('div');
  body.className = 'ao-body';
  body.textContent = message;

  block.appendChild(header);
  block.appendChild(body);

  dom.agentOutputPane.prepend(block);
  agentOutputCount++;
  dom.agentOutputLabel.textContent = agentOutputCount + ' result' + (agentOutputCount === 1 ? '' : 's');
}

function appendToResponsePane(agentName, type, message) {
  const line = document.createElement('div');
  line.className = 'response-line resp-' + type;

  const time = document.createElement('span');
  time.className = 'resp-time';
  time.textContent = formatTime();

  const name = document.createElement('span');
  name.className = 'resp-agent';
  name.textContent = agentName;

  const msg = document.createElement('span');
  msg.className = 'resp-msg';
  msg.textContent = message;

  line.appendChild(time);
  line.appendChild(name);
  line.appendChild(msg);
  dom.responsePane.appendChild(line);

  // Auto-scroll to bottom
  dom.responsePane.scrollTop = dom.responsePane.scrollHeight;
}

function appendToActivityLog(agentName, type, taskLabel, details, statusClass) {
  const row = document.createElement('tr');

  const tdTime = document.createElement('td');
  tdTime.className = 'log-time';
  tdTime.textContent = formatTime();

  const tdAgent = document.createElement('td');
  tdAgent.className = 'log-agent';
  tdAgent.textContent = agentName;

  const tdType = document.createElement('td');
  const typePill = document.createElement('span');
  typePill.className = 'log-type-pill type-' + type;
  typePill.textContent = type;
  tdType.appendChild(typePill);

  const tdTask = document.createElement('td');
  tdTask.textContent = taskLabel || '—';
  tdTask.title = taskLabel || '';

  const tdDetails = document.createElement('td');
  tdDetails.className = 'log-details';
  tdDetails.textContent = details;
  tdDetails.title = details;

  const tdStatus = document.createElement('td');
  const dot = document.createElement('span');
  dot.className = 'log-status-dot ' + (statusClass || 'status-ok');
  tdStatus.appendChild(dot);

  row.appendChild(tdTime);
  row.appendChild(tdAgent);
  row.appendChild(tdType);
  row.appendChild(tdTask);
  row.appendChild(tdDetails);
  row.appendChild(tdStatus);

  // Insert at top so newest entries are first
  dom.activityLogBody.prepend(row);
  activityLogCount++;
  dom.logCount.textContent = activityLogCount + ' entr' + (activityLogCount === 1 ? 'y' : 'ies');
}

async function runTaskExecution(agent, task) {
  const steps = await buildExecutionSteps(agent, task);
  let stepIndex = 0;

  // Opening entry in log panes (not Agent Output)
  appendToResponsePane(agent.name, 'system', 'Starting task: "' + task.label + '"');
  appendToActivityLog(agent.name, 'assign', task.label, 'Task assigned' + (task.mcpIds.length ? ' with ' + task.mcpIds.length + ' MCP(s)' : ''), 'status-busy');

  function nextStep() {
    if (stepIndex >= steps.length) return;
    // Task may have been manually completed
    if (task.status === 'done') return;

    const step = steps[stepIndex];
    task.log.push(step);

    // Send results to Agent Output, everything to Response Pane & Activity Log
    appendToResponsePane(agent.name, step.type, step.message);
    if (step.type === 'result') {
      appendToAgentOutput(agent.name, step.type, step.message);
    }
    const logStatus = (step.type === 'done' || step.type === 'result') ? 'status-ok' : step.type === 'verify' ? 'status-ok' : 'status-busy';
    appendToActivityLog(agent.name, step.type, task.label, step.message, logStatus);

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

async function buildExecutionSteps(agent, task) {
  const steps = [];
  const mcpIds = task.mcpIds || [];

  // Phase 1: Connect to MCPs
  if (mcpIds.length) {
    steps.push({ type: 'mcp', message: 'Connecting to ' + mcpIds.length + ' MCP adapter(s)...' });
  } else {
    steps.push({ type: 'mcp', message: 'Planning approach (no MCPs selected)...' });
  }

  // Phase 2: Use each MCP's tools — generate realistic output
  mcpIds.forEach((mcpId) => {
    const adapter = mcpAdapters.find((m) => m.id === mcpId);
    if (!adapter) return;

    const ok = isMcpConfigured(adapter);
    if (!ok) {
      steps.push({
        type: 'fail',
        message: adapter.icon + ' ' + adapter.name + ' — missing required configuration. Open Configure to set up.',
      });
      return;
    }

    // Connection step
    steps.push({
      type: 'mcp',
      message: adapter.icon + ' Connecting to ' + adapter.name + '...',
    });

    // Per-adapter realistic output
    const simulated = generateMcpSimulatedOutput(adapter, task.label);
    simulated.forEach((line) => {
      steps.push({ type: 'mcp', message: line });
    });
  });

  // Phase 3: Working on the actual task
  steps.push({ type: 'mcp', message: 'Processing "' + truncate(task.label, 30) + '"...' });

  // Phase 4: Generate the actual task result (may involve real API calls)
  // Build a full prompt from title + instructions
  const fullPrompt = task.instructions
    ? task.label + '\n\nInstructions: ' + task.instructions
    : task.label;

  // Pass agent.id for server-side context engine
  const resultText = await generateTaskResult(fullPrompt, task.mcpIds, agent.id);
  steps.push({ type: 'result', message: resultText });

  // Phase 5: Verification
  steps.push({ type: 'verify', message: 'Running verification checks...' });
  if (Math.random() > 0.5) {
    steps.push({ type: 'verify', message: 'Double-checking output quality...' });
  }
  steps.push({ type: 'verify', message: 'All checks passed ✓' });

  // Phase 6: Done
  steps.push({ type: 'done', message: 'Task complete — heading back to the bar! 🍺' });
  return steps;
}

/* Generate realistic simulated output per MCP adapter type */
function generateMcpSimulatedOutput(adapter, taskLabel) {
  const cv = adapter.configValues || {};
  const lines = [];

  switch (adapter.id) {
    case 'github': {
      const owner = cv.owner || 'user';
      lines.push('🐙 GitHub.list_repos() → fetching repos for ' + owner + '...');
      const repos = ['api-service', 'web-dashboard', 'data-pipeline', 'mobile-app', 'infra-config', 'docs-site'];
      const count = 2 + Math.floor(Math.random() * 4);
      const picked = repos.sort(() => Math.random() - 0.5).slice(0, count);
      lines.push('  Found ' + picked.length + ' repos: ' + picked.map((r) => owner + '/' + r).join(', '));
      const tool = adapter.tools[Math.floor(Math.random() * adapter.tools.length)];
      lines.push('🐙 GitHub.' + tool + '() → OK');
      break;
    }
    case 'terminal': {
      const shell = cv.shell || 'powershell';
      const cwd = cv.workingDir || 'C:\\Users\\user';
      lines.push('⚡ Terminal.run_command() → shell=' + shell + ', cwd=' + cwd);
      const outputs = [
        '  $ git status → On branch main, 3 files modified',
        '  $ npm run build → Build succeeded (4.2s)',
        '  $ dir /b → 12 items listed',
        '  $ node --version → v20.11.1',
        '  $ Get-Process | Measure → 127 processes running',
      ];
      lines.push(outputs[Math.floor(Math.random() * outputs.length)]);
      lines.push('⚡ Terminal.read_output() → OK (exit code 0)');
      break;
    }
    case 'filesystem': {
      const root = cv.rootDir || '.';
      lines.push('📁 Filesystem.list_dir() → scanning ' + root);
      lines.push('  Found 23 files across 5 directories');
      const tool = Math.random() > 0.5 ? 'read_file' : 'grep_search';
      lines.push('📁 Filesystem.' + tool + '() → OK');
      break;
    }
    case 'database': {
      const host = cv.host || 'localhost';
      const db = cv.dbName || 'mydb';
      lines.push('🗄️ Database.run_query() → connecting to ' + host + '/' + db);
      const rows = 5 + Math.floor(Math.random() * 50);
      lines.push('  Query returned ' + rows + ' rows in 0.' + (10 + Math.floor(Math.random() * 90)) + 's');
      lines.push('🗄️ Database.list_tables() → 12 tables found');
      break;
    }
    case 'slack': {
      const ws = cv.workspaceUrl || 'team.slack.com';
      lines.push('💬 Slack.list_channels() → ' + ws);
      lines.push('  Found 8 channels: #general, #dev, #random, #alerts, …');
      lines.push('💬 Slack.send_message() → posted to #general');
      break;
    }
    case 'web': {
      lines.push('🌐 Web.fetch_url() → fetching content...');
      lines.push('  200 OK — received 24.3 KB, extracted 1,247 words');
      lines.push('🌐 Web.extract_text() → OK');
      break;
    }
    case 'atlassian': {
      const domain = cv.domain || 'site.atlassian.net';
      lines.push('🔷 Atlassian.search_issues() → ' + domain);
      const count = 3 + Math.floor(Math.random() * 10);
      lines.push('  Found ' + count + ' Jira issues matching query');
      lines.push('🔷 Atlassian.get_board() → Sprint 14 active, 6 items in progress');
      break;
    }
    case 'hubspot': {
      const portal = cv.portalId || '?';
      lines.push('🟠 HubSpot.search_contacts() → portal ' + portal);
      const contacts = 10 + Math.floor(Math.random() * 100);
      lines.push('  Found ' + contacts + ' contacts matching criteria');
      lines.push('🟠 HubSpot.list_tickets() → 4 open tickets');
      break;
    }
    default: {
      // Custom adapters
      const toolCount = 1 + Math.floor(Math.random() * Math.min(2, adapter.tools.length));
      for (let i = 0; i < toolCount; i++) {
        const tool = adapter.tools[Math.floor(Math.random() * adapter.tools.length)];
        lines.push(adapter.icon + ' ' + adapter.name + '.' + tool + '() → OK');
      }
      break;
    }
  }
  return lines;
}

/* Generate a realistic simulated result based on MCPs used and task label */
async function generateTaskResult(taskLabel, mcpIds, agentId) {
  const label = taskLabel.toLowerCase();
  const sections = [];

  for (const mcpId of mcpIds) {
    const adapter = mcpAdapters.find((m) => m.id === mcpId);
    if (!adapter) continue;
    const cv = adapter.configValues || {};
    const result = await generateMcpResult(adapter, cv, label, taskLabel, agentId);
    if (result) sections.push(result);
  }

  // If no MCPs produced a result, generate a task-label-based fallback
  if (!sections.length) {
    sections.push(await generateFallbackResult(label, taskLabel, agentId));
  }

  return sections.join('\n\n');
}

/* ───────── ChatGPT API helper ───────── */
async function askChatGPT(query, agentId) {
  try {
    const payload = { prompt: query };
    if (agentId) payload.agentId = agentId;
    const resp = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: 'HTTP ' + resp.status }));
      throw new Error(err.error || err.details || 'HTTP ' + resp.status);
    }
    const data = await resp.json();
    return '📋 RESULT — ' + data.answer;
  } catch (e) {
    return '❌ ChatGPT error: ' + e.message;
  }
}

/* ───────── Real GitHub API helper ───────── */
function timeAgo(dateStr) {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return seconds + 's';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes + 'm';
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + 'h';
  const days = Math.floor(hours / 24);
  if (days < 30) return days + 'd';
  const months = Math.floor(days / 30);
  return months + 'mo';
}

async function fetchGitHubReal(cv, label) {
  const owner = cv.owner || 'user';
  const token = cv.token || '';
  const apiUrl = (cv.apiUrl || 'https://api.github.com').replace(/\/+$/, '');
  const headers = { 'Accept': 'application/vnd.github.v3+json' };
  if (token) headers['Authorization'] = 'token ' + token;

  try {
    if (label.includes('repo') || label.includes('list') || label.includes('project')) {
      const resp = await fetch(apiUrl + '/users/' + encodeURIComponent(owner) + '/repos?sort=updated&per_page=30', { headers });
      if (!resp.ok) throw new Error('HTTP ' + resp.status + ' ' + resp.statusText);
      const repos = await resp.json();
      if (!repos.length) return '📋 RESULT — GitHub Repositories for ' + owner + ':\n  No repositories found.';
      return '📋 RESULT — GitHub Repositories for ' + owner + ':\n' +
        repos.map((r, i) => '  ' + (i + 1) + '. ' + r.full_name + '  ★' + (r.stargazers_count || 0) + '  ' + (r.language || 'N/A') + '  updated ' + timeAgo(r.updated_at) + ' ago').join('\n');
    }

    if (label.includes('issue') || label.includes('bug') || label.includes('ticket')) {
      const resp = await fetch(apiUrl + '/search/issues?q=' + encodeURIComponent('user:' + owner + ' is:issue is:open') + '&per_page=15&sort=updated', { headers });
      if (!resp.ok) throw new Error('HTTP ' + resp.status + ' ' + resp.statusText);
      const data = await resp.json();
      const items = data.items || [];
      if (!items.length) return '📋 RESULT — GitHub Issues for ' + owner + ':\n  No open issues found.';
      return '📋 RESULT — GitHub Issues for ' + owner + ':\n' +
        items.map((it) => '  #' + it.number + '  ' + it.title + '  [' + it.state + ']  ' + it.repository_url.split('/').pop() + '  ' + timeAgo(it.updated_at) + ' ago').join('\n');
    }

    if (label.includes('pr') || label.includes('pull')) {
      const resp = await fetch(apiUrl + '/search/issues?q=' + encodeURIComponent('user:' + owner + ' is:pr is:open') + '&per_page=15&sort=updated', { headers });
      if (!resp.ok) throw new Error('HTTP ' + resp.status + ' ' + resp.statusText);
      const data = await resp.json();
      const items = data.items || [];
      if (!items.length) return '📋 RESULT — Open Pull Requests for ' + owner + ':\n  No open PRs found.';
      return '📋 RESULT — Open Pull Requests for ' + owner + ':\n' +
        items.map((it) => '  PR #' + it.number + '  ' + it.title + '  [' + it.state + ']  ' + it.repository_url.split('/').pop() + '  ' + timeAgo(it.updated_at) + ' ago').join('\n');
    }

    // Generic: fetch repos as a summary
    const resp = await fetch(apiUrl + '/users/' + encodeURIComponent(owner) + '/repos?sort=updated&per_page=10', { headers });
    if (!resp.ok) throw new Error('HTTP ' + resp.status + ' ' + resp.statusText);
    const repos = await resp.json();
    return '📋 RESULT — GitHub (' + owner + '):\n' +
      '  Repos: ' + repos.map(r => r.full_name).join(', ') + '\n' +
      '  Total public repos: ' + (repos.length >= 10 ? '10+' : repos.length);
  } catch (e) {
    return '❌ GitHub API error: ' + e.message + '\n  Check your token and owner in MCP configuration.';
  }
}

/* ───────── Real Weather API helper (wttr.in) ───────── */
function extractLocationFromQuery(query) {
  const lower = query.toLowerCase().trim();

  // Strategy 1: Look for "in/for/at/near/of" + location (most reliable)
  const trailingNoise = /\s+(?:right now|currently|today|tonight|this week|please|thanks|thank you)[\s?.!]*$/i;
  const prepMatch = lower.match(/(?:weather|forecast|temperature|temp|conditions)\s+(?:in|for|at|near|of)\s+(.+)/i)
    || lower.match(/\b(?:in|for|at|near|of)\s+([a-z][\w\s,.-]+?)(?:\s*(?:weather|forecast|temperature|temp|conditions|right now|currently|today|tonight|please|thanks|\?|$))/i);
  if (prepMatch) {
    const loc = prepMatch[1].replace(trailingNoise, '').replace(/[?.!]+$/, '').trim();
    if (loc.length >= 2) return loc;
  }

  // Strategy 2: Strip known noise words and see what's left
  const noise = /\b(what(?:'?s| is| are)?|the|tell|me|get|can|you|could|show|look|up|find|fetch|check|give|please|thanks|thank|i|need|want|know|like|how|about|right now|currently|today|tonight|this week|weather|forecast|temperature|temp|conditions|current)\b/gi;
  const cleaned = lower.replace(noise, ' ').replace(/[?.!]+/g, '').replace(/\s+/g, ' ').trim();
  // Remove leading prepositions that survived
  const loc2 = cleaned.replace(/^(in|for|at|of|near)\s+/i, '').trim();
  if (loc2.length >= 2) return loc2;

  return 'your location';
}

async function fetchWeatherReal(taskLabel) {
  const location = extractLocationFromQuery(taskLabel);
  const url = 'https://wttr.in/' + encodeURIComponent(location) + '?format=j1';
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();
    const cur = data.current_condition && data.current_condition[0];
    if (!cur) throw new Error('No weather data returned');
    const area = (data.nearest_area && data.nearest_area[0]) || {};
    const areaName = (area.areaName && area.areaName[0] && area.areaName[0].value) || location;
    const region = (area.region && area.region[0] && area.region[0].value) || '';
    const country = (area.country && area.country[0] && area.country[0].value) || '';
    const displayLoc = areaName + (region ? ', ' + region : '') + (country ? ', ' + country : '');
    const tempF = cur.temp_F || 'N/A';
    const tempC = cur.temp_C || 'N/A';
    const desc = (cur.weatherDesc && cur.weatherDesc[0] && cur.weatherDesc[0].value) || 'N/A';
    const humidity = cur.humidity || 'N/A';
    const windMph = cur.windspeedMiles || 'N/A';
    const windDir = cur.winddir16Point || '';
    const uvIndex = cur.uvIndex || 'N/A';
    const feelsF = cur.FeelsLikeF || tempF;
    const feelsC = cur.FeelsLikeC || tempC;

    // Tomorrow forecast
    let tomorrowStr = '';
    if (data.weather && data.weather[1]) {
      const tmrw = data.weather[1];
      tomorrowStr = '\n  Tomorrow: High ' + tmrw.maxtempF + '°F, Low ' + tmrw.mintempF + '°F — ' +
        ((tmrw.hourly && tmrw.hourly[4] && tmrw.hourly[4].weatherDesc && tmrw.hourly[4].weatherDesc[0] && tmrw.hourly[4].weatherDesc[0].value) || 'N/A');
    }

    return '📋 RESULT — Weather for ' + displayLoc + ':\n' +
      '  Conditions: ' + desc + '\n' +
      '  Temperature: ' + tempF + '°F (' + tempC + '°C)\n' +
      '  Feels Like: ' + feelsF + '°F (' + feelsC + '°C)\n' +
      '  Humidity: ' + humidity + '%\n' +
      '  Wind: ' + windMph + ' mph ' + windDir + '\n' +
      '  UV Index: ' + uvIndex +
      tomorrowStr;
  } catch (e) {
    return '❌ Weather fetch error: ' + e.message + '\n  Could not retrieve weather for "' + location + '".';
  }
}

async function generateMcpResult(adapter, cv, label, taskLabel, agentId) {
  switch (adapter.id) {
    case 'github': {
      return await fetchGitHubReal(cv, label);
    }

    case 'terminal': {
      const shell = cv.shell || 'powershell';
      if (label.includes('dir') || label.includes('ls') || label.includes('list') || label.includes('directory') || label.includes('folder') || label.includes('file')) {
        const files = ['index.html', 'app.js', 'style.css', 'package.json', 'README.md', 'tsconfig.json', '.gitignore', 'vite.config.ts', 'LICENSE', 'Dockerfile'];
        const dirs = ['src/', 'public/', 'node_modules/', 'dist/', 'tests/', '.git/', 'assets/', 'config/'];
        const pickedFiles = files.sort(() => Math.random() - 0.5).slice(0, 3 + Math.floor(Math.random() * 5));
        const pickedDirs = dirs.sort(() => Math.random() - 0.5).slice(0, 2 + Math.floor(Math.random() * 3));
        return '📋 RESULT — Directory listing (' + shell + '):\n' +
          pickedDirs.map(d => '  📁 ' + d).join('\n') + '\n' +
          pickedFiles.map(f => '  📄 ' + f + '  ' + (Math.random() * 50).toFixed(1) + ' KB').join('\n') + '\n' +
          '  Total: ' + pickedDirs.length + ' directories, ' + pickedFiles.length + ' files';
      }
      if (label.includes('git') || label.includes('status') || label.includes('branch')) {
        const branches = ['main', 'develop', 'feature/auth-v2', 'fix/memory-leak', 'chore/deps-update'];
        const picked = branches.sort(() => Math.random() - 0.5).slice(0, 3 + Math.floor(Math.random() * 2));
        const modified = ['src/app.js', 'package.json', 'README.md', 'src/utils.ts'];
        const pickedMod = modified.sort(() => Math.random() - 0.5).slice(0, 1 + Math.floor(Math.random() * 3));
        return '📋 RESULT — Git status:\n' +
          '  Branch: ' + picked[0] + '\n' +
          '  Modified files:\n' +
          pickedMod.map(f => '    M  ' + f).join('\n') + '\n' +
          '  Branches: ' + picked.join(', ') + '\n' +
          '  Last commit: ' + ['fix: typo in docs', 'feat: add caching layer', 'chore: update deps', 'refactor: clean up utils'][Math.floor(Math.random() * 4)] + ' (' + (1 + Math.floor(Math.random() * 48)) + 'h ago)';
      }
      if (label.includes('process') || label.includes('ps') || label.includes('running')) {
        const procs = [
          { name: 'node.exe', pid: 4120 + Math.floor(Math.random() * 1000), mem: '45.2 MB' },
          { name: 'code.exe', pid: 2000 + Math.floor(Math.random() * 1000), mem: '312.8 MB' },
          { name: 'chrome.exe', pid: 5000 + Math.floor(Math.random() * 1000), mem: '521.4 MB' },
          { name: 'powershell.exe', pid: 7000 + Math.floor(Math.random() * 1000), mem: '78.1 MB' },
          { name: 'explorer.exe', pid: 1200 + Math.floor(Math.random() * 100), mem: '95.6 MB' },
        ];
        return '📋 RESULT — Running processes:\n' +
          '  PID      NAME               MEMORY\n' +
          procs.map(p => '  ' + String(p.pid).padEnd(9) + p.name.padEnd(19) + p.mem).join('\n') + '\n' +
          '  Total: ' + (80 + Math.floor(Math.random() * 80)) + ' processes active';
      }
      // generic terminal
      return '📋 RESULT — Command output (' + shell + '):\n' +
        '  Exit code: 0\n' +
        '  stdout: Command executed successfully.\n' +
        '  ' + (1 + Math.floor(Math.random() * 20)) + ' line(s) of output captured.\n' +
        '  Duration: ' + (0.1 + Math.random() * 3).toFixed(2) + 's';
    }

    case 'filesystem': {
      const root = cv.rootDir || '.';
      if (label.includes('dir') || label.includes('ls') || label.includes('list') || label.includes('directory') || label.includes('folder') || label.includes('what')) {
        const files = ['index.html', 'app.js', 'style.css', 'DESIGN.md', 'ASSETS.md', 'ASSET_IMPORT.md', 'LICENSE', 'package.json', 'README.md', '.gitignore'];
        const dirs = ['public/', 'src/', 'node_modules/', 'dist/', 'config/'];
        const pickedFiles = files.sort(() => Math.random() - 0.5).slice(0, 4 + Math.floor(Math.random() * 4));
        const pickedDirs = dirs.sort(() => Math.random() - 0.5).slice(0, 1 + Math.floor(Math.random() * 3));
        return '📋 RESULT — Contents of ' + root + ':\n' +
          pickedDirs.map(d => '  📁 ' + d).join('\n') + '\n' +
          pickedFiles.map(f => '  📄 ' + f + '  (' + (0.1 + Math.random() * 100).toFixed(1) + ' KB)').join('\n') + '\n' +
          '  ───\n' +
          '  ' + pickedDirs.length + ' folder(s), ' + pickedFiles.length + ' file(s)';
      }
      if (label.includes('search') || label.includes('find') || label.includes('grep') || label.includes('look')) {
        const matches = [
          { file: 'src/app.js', line: 42, text: 'const config = loadConfig();' },
          { file: 'src/utils.ts', line: 17, text: 'export function parseQuery(q: string) {' },
          { file: 'README.md', line: 8, text: '## Getting Started' },
          { file: 'config/default.json', line: 3, text: '"apiEndpoint": "https://api.example.com"' },
          { file: 'tests/app.test.js', line: 55, text: 'expect(result).toBe(true);' },
          { file: 'package.json', line: 12, text: '"start": "node src/app.js"' },
        ];
        const picked = matches.sort(() => Math.random() - 0.5).slice(0, 3 + Math.floor(Math.random() * 3));
        return '📋 RESULT — File search in ' + root + ':\n' +
          picked.map(m => '  ' + m.file + ':' + m.line + '  →  ' + m.text).join('\n') + '\n' +
          '  ───\n' +
          '  ' + picked.length + ' match(es) found';
      }
      if (label.includes('read') || label.includes('content') || label.includes('open')) {
        return '📋 RESULT — File contents:\n' +
          '  ─── (first 10 lines) ───\n' +
          '  1 │ // Main application entry\n' +
          '  2 │ import { init } from "./core";\n' +
          '  3 │ import config from "./config.json";\n' +
          '  4 │\n' +
          '  5 │ const app = init(config);\n' +
          '  6 │ app.start();\n' +
          '  7 │ console.log("Server running on port", config.port);\n' +
          '  ───\n' +
          '  File size: ' + (0.5 + Math.random() * 20).toFixed(1) + ' KB, ' + (10 + Math.floor(Math.random() * 300)) + ' lines total';
      }
      // generic filesystem
      const count = 3 + Math.floor(Math.random() * 15);
      const files = ['app.js', 'config.json', 'README.md', 'index.html', 'style.css', 'utils.ts'];
      const picked = files.sort(() => Math.random() - 0.5).slice(0, Math.min(count, files.length));
      return '📋 RESULT — Filesystem operation complete:\n' +
        '  Scanned: ' + root + '\n' +
        picked.map(f => '  📄 ' + f).join('\n') + '\n' +
        '  ' + count + ' item(s) processed';
    }

    case 'database': {
      const host = cv.host || 'localhost';
      const db = cv.dbName || 'mydb';
      if (label.includes('query') || label.includes('select') || label.includes('data') || label.includes('sql')) {
        const cols = ['id', 'name', 'email', 'status', 'created_at'];
        const rows = [
          ['1', 'Alice Johnson', 'alice@corp.com', 'active', '2025-11-02'],
          ['2', 'Bob Martinez', 'bob@corp.com', 'active', '2025-11-15'],
          ['3', 'Carol Chen', 'carol@corp.com', 'inactive', '2025-08-20'],
          ['4', 'Dave Kumar', 'dave@corp.com', 'active', '2026-01-03'],
          ['5', 'Eve Santos', 'eve@corp.com', 'pending', '2026-02-14'],
        ];
        const picked = rows.slice(0, 3 + Math.floor(Math.random() * 2));
        return '📋 RESULT — Query on ' + host + '/' + db + ':\n' +
          '  ' + cols.join('  |  ') + '\n' +
          '  ' + '─'.repeat(55) + '\n' +
          picked.map(r => '  ' + r.join('  |  ')).join('\n') + '\n' +
          '  ───\n' +
          '  ' + picked.length + ' row(s) returned in ' + (Math.random() * 0.5).toFixed(3) + 's';
      }
      if (label.includes('table') || label.includes('schema') || label.includes('list')) {
        const tables = ['users', 'orders', 'products', 'sessions', 'audit_log', 'settings', 'invoices', 'notifications'];
        const picked = tables.sort(() => Math.random() - 0.5).slice(0, 4 + Math.floor(Math.random() * 4));
        return '📋 RESULT — Tables in ' + db + ':\n' +
          picked.map((t, i) => '  ' + (i + 1) + '. ' + t + '  (' + (10 + Math.floor(Math.random() * 10000)) + ' rows, ' + (2 + Math.floor(Math.random() * 12)) + ' columns)').join('\n');
      }
      // generic db
      const rows = 5 + Math.floor(Math.random() * 50);
      return '📋 RESULT — Database (' + db + '@' + host + '):\n' +
        '  Returned ' + rows + ' row(s) in ' + (Math.random() * 0.8).toFixed(3) + 's\n' +
        '  Status: Operation completed successfully';
    }

    case 'slack': {
      const ws = cv.workspaceUrl || 'team.slack.com';
      if (label.includes('channel') || label.includes('list')) {
        const channels = [
          { name: '#general', members: 42, unread: 3 },
          { name: '#development', members: 18, unread: 7 },
          { name: '#design', members: 12, unread: 0 },
          { name: '#random', members: 38, unread: 15 },
          { name: '#alerts', members: 25, unread: 1 },
          { name: '#marketing', members: 9, unread: 4 },
        ];
        return '📋 RESULT — Slack channels (' + ws + '):\n' +
          channels.map(c => '  ' + c.name.padEnd(16) + c.members + ' members  ' + (c.unread ? c.unread + ' unread' : '✓ caught up')).join('\n');
      }
      if (label.includes('message') || label.includes('read') || label.includes('search')) {
        const msgs = [
          { user: 'alice', text: 'Deployed v2.3 to staging', time: '10:42 AM' },
          { user: 'bob', text: 'PR #87 is ready for review', time: '10:38 AM' },
          { user: 'carol', text: 'Updated the onboarding docs', time: '10:15 AM' },
          { user: 'dave', text: 'CI is green on main 🟢', time: '9:55 AM' },
        ];
        return '📋 RESULT — Recent messages:\n' +
          msgs.map(m => '  [' + m.time + '] @' + m.user + ': ' + m.text).join('\n');
      }
      if (label.includes('send') || label.includes('post') || label.includes('notify')) {
        return '📋 RESULT — Message sent to Slack:\n' +
          '  Channel: #' + ['general', 'development', 'alerts'][Math.floor(Math.random() * 3)] + '\n' +
          '  Status: Delivered ✓\n' +
          '  Timestamp: ' + new Date().toISOString();
      }
      return '📋 RESULT — Slack (' + ws + '):\n' +
        '  6 channels available, 3 with unread messages\n' +
        '  Most active: #development (7 new messages)';
    }

    case 'web': {
      return await askChatGPT(taskLabel, agentId);
    }

    case 'atlassian': {
      const domain = cv.domain || 'site.atlassian.net';
      if (label.includes('issue') || label.includes('jira') || label.includes('ticket') || label.includes('bug')) {
        const issues = [
          { key: 'PROJ-142', summary: 'Refactor authentication module', status: 'In Progress', assignee: 'alice' },
          { key: 'PROJ-139', summary: 'Fix broken export to CSV', status: 'Open', assignee: 'bob' },
          { key: 'PROJ-155', summary: 'Add unit tests for payment flow', status: 'In Review', assignee: 'carol' },
          { key: 'PROJ-148', summary: 'Optimize database queries on dashboard', status: 'Open', assignee: 'unassigned' },
          { key: 'PROJ-160', summary: 'Upgrade React to v19', status: 'To Do', assignee: 'dave' },
        ];
        const picked = issues.sort(() => Math.random() - 0.5).slice(0, 3 + Math.floor(Math.random() * 2));
        return '📋 RESULT — Jira Issues (' + domain + '):\n' +
          picked.map(i => '  ' + i.key + '  ' + i.summary + '\n         Status: ' + i.status + '  |  Assignee: @' + i.assignee).join('\n') + '\n' +
          '  ───\n' +
          '  Sprint 14: ' + (3 + Math.floor(Math.random() * 6)) + ' items in progress';
      }
      if (label.includes('confluence') || label.includes('page') || label.includes('doc')) {
        const pages = ['Onboarding Guide', 'Architecture Overview', 'API Standards', 'Sprint Retrospective', 'Release Notes v2.3'];
        const picked = pages.sort(() => Math.random() - 0.5).slice(0, 3);
        return '📋 RESULT — Confluence pages:\n' +
          picked.map((p, i) => '  ' + (i + 1) + '. ' + p + '  (updated ' + (1 + Math.floor(Math.random() * 30)) + 'd ago by @' + ['alice', 'bob', 'carol'][i % 3] + ')').join('\n');
      }
      return '📋 RESULT — Atlassian (' + domain + '):\n' +
        '  Jira: ' + (3 + Math.floor(Math.random() * 10)) + ' open issues\n' +
        '  Sprint 14: ' + (3 + Math.floor(Math.random() * 6)) + ' items in progress\n' +
        '  Confluence: 5 pages updated this week';
    }

    case 'hubspot': {
      const portal = cv.portalId || 'unknown';
      if (label.includes('contact') || label.includes('customer') || label.includes('lead')) {
        const contacts = [
          { name: 'Acme Corp', email: 'info@acme.com', stage: 'Customer', value: '$24,000' },
          { name: 'Globex Inc', email: 'sales@globex.com', stage: 'Lead', value: '$8,500' },
          { name: 'Initech LLC', email: 'hello@initech.com', stage: 'Opportunity', value: '$15,200' },
          { name: 'Umbrella Co', email: 'biz@umbrella.io', stage: 'Customer', value: '$42,000' },
        ];
        const picked = contacts.sort(() => Math.random() - 0.5).slice(0, 3);
        return '📋 RESULT — HubSpot Contacts (portal ' + portal + '):\n' +
          picked.map(c => '  ' + c.name.padEnd(16) + c.email.padEnd(24) + c.stage.padEnd(14) + c.value).join('\n') + '\n' +
          '  Total: ' + (50 + Math.floor(Math.random() * 200)) + ' contacts in CRM';
      }
      if (label.includes('deal') || label.includes('pipeline') || label.includes('revenue')) {
        return '📋 RESULT — HubSpot Deals:\n' +
          '  Pipeline: ' + (3 + Math.floor(Math.random() * 10)) + ' active deals\n' +
          '  Total value: $' + (50 + Math.floor(Math.random() * 200)) + 'K\n' +
          '  Closing this month: ' + (1 + Math.floor(Math.random() * 5)) + ' deals ($' + (10 + Math.floor(Math.random() * 50)) + 'K)\n' +
          '  Win rate: ' + (35 + Math.floor(Math.random() * 40)) + '%';
      }
      return '📋 RESULT — HubSpot (portal ' + portal + '):\n' +
        '  Contacts: ' + (50 + Math.floor(Math.random() * 200)) + '\n' +
        '  Open deals: ' + (3 + Math.floor(Math.random() * 10)) + '\n' +
        '  Tickets: ' + (2 + Math.floor(Math.random() * 8)) + ' open';
    }

    default: {
      // Custom / unknown MCP adapters
      const toolCount = 1 + Math.floor(Math.random() * Math.min(2, adapter.tools.length));
      const lines = ['📋 RESULT — ' + adapter.name + ':'];
      for (let i = 0; i < toolCount; i++) {
        const tool = adapter.tools[Math.floor(Math.random() * adapter.tools.length)];
        lines.push('  ' + adapter.icon + ' ' + tool + '() → completed (' + (1 + Math.floor(Math.random() * 20)) + ' item(s) returned)');
      }
      return lines.join('\n');
    }
  }
}

async function generateWebSearchResult(taskLabel) {
  const query = taskLabel;
  try {
    const searchUrl = 'https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=' +
      encodeURIComponent(query) + '&srlimit=5&format=json&origin=*';
    const resp = await fetch(searchUrl);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();
    const items = (data.query && data.query.search) || [];
    if (!items.length) throw new Error('No results found');

    const results = items.map((item, i) => {
      // Strip HTML tags from snippet
      const snippet = item.snippet.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
      const url = 'https://en.wikipedia.org/wiki/' + encodeURIComponent(item.title.replace(/ /g, '_'));
      return '  ' + (i + 1) + '. ' + item.title + '\n     ' + url + '\n     ' + snippet;
    });

    const total = (data.query.searchinfo && data.query.searchinfo.totalhits) || items.length;
    return '📋 RESULT — Web Search: "' + truncate(query, 50) + '"\n' +
      '  Found ' + total + ' results. Top ' + items.length + ':\n\n' +
      results.join('\n\n');
  } catch (e) {
    return '❌ Web search error: ' + e.message + '\n  Could not retrieve results for "' + truncate(query, 40) + '".';
  }
}

async function generateFallbackResult(label, taskLabel, agentId) {
  // Always forward fallback queries to ChatGPT via AI Query
  return await askChatGPT(taskLabel, agentId);
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

function formatIsoTime(isoString) {
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
/* ───────── MCP rendering ───────── */
function renderMcpCheckboxes() {
  dom.mcpCheckboxes.innerHTML = '';
  mcpAdapters.forEach((adapter) => {
    const label = document.createElement('label');
    label.className = 'mcp-checkbox-label';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = adapter.id;
    checkbox.name = 'mcpAdapter';

    // AI Query is checked by default
    if (adapter.id === 'web') {
      checkbox.checked = true;
    }

    // When any adapter is toggled, update AI Query state
    checkbox.addEventListener('change', () => {
      updateAiQueryState();
    });

    const iconSpan = document.createElement('span');
    iconSpan.className = 'mcp-icon';
    iconSpan.textContent = adapter.icon;
    const text = document.createTextNode(' ' + adapter.name);
    label.appendChild(checkbox);
    label.appendChild(iconSpan);
    label.appendChild(text);
    dom.mcpCheckboxes.appendChild(label);
  });
}

function updateAiQueryState() {
  const checkboxes = dom.mcpCheckboxes.querySelectorAll('input[type="checkbox"]');
  const aiQueryCb = Array.from(checkboxes).find(cb => cb.value === 'web');
  if (!aiQueryCb) return;
  const othersChecked = Array.from(checkboxes).some(cb => cb.value !== 'web' && cb.checked);
  // Uncheck AI Query when another adapter is selected, check it when none are
  aiQueryCb.checked = !othersChecked;
}

function isMcpConfigured(adapter) {
  const fields = adapter.configFields || [];
  const vals = adapter.configValues || {};
  const required = fields.filter((f) => f.required);
  if (!required.length) return true; // no required fields = always OK
  return required.every((f) => vals[f.key] && String(vals[f.key]).trim().length > 0);
}

function renderMcpAdapterPanel() {
  dom.mcpAdapterList.innerHTML = '';
  const configured = mcpAdapters.filter(isMcpConfigured).length;
  dom.mcpCount.textContent = configured + '/' + mcpAdapters.length + ' configured';
  mcpAdapters.forEach((adapter) => {
    const card = document.createElement('div');
    const ok = isMcpConfigured(adapter);
    card.className = 'mcp-adapter-card' + (ok ? '' : ' unconfigured');
    card.style.cursor = 'pointer';
    card.addEventListener('click', () => {
      openMcpConfigModal();
      // Auto-expand the edit form for this adapter after a tick
      setTimeout(() => startEditMcp(adapter.id), 50);
    });

    const icon = document.createElement('span');
    icon.className = 'mcp-icon';
    icon.textContent = adapter.icon;

    const info = document.createElement('div');
    info.className = 'mcp-info';
    const name = document.createElement('strong');
    name.textContent = adapter.name;
    const desc = document.createElement('span');
    desc.textContent = adapter.description;
    const statusLine = document.createElement('span');
    statusLine.className = 'mcp-config-status ' + (ok ? 'cfg-ok' : 'cfg-missing');
    statusLine.textContent = ok ? '✓ Configured' : '⚠ Needs configuration';
    info.appendChild(name);
    info.appendChild(desc);
    info.appendChild(statusLine);

    const dot = document.createElement('span');
    dot.className = 'mcp-status-dot ' + (ok ? 'online' : 'offline');

    card.appendChild(icon);
    card.appendChild(info);
    card.appendChild(dot);
    dom.mcpAdapterList.appendChild(card);
  });
}

/* ───────── MCP Configuration Modal ───────── */
function openMcpConfigModal() {
  renderMcpConfigList();
  dom.mcpConfigModal.showModal();
}

function closeMcpConfigModal() {
  dom.mcpConfigModal.close();
}

function renderMcpConfigList() {
  dom.mcpConfigList.innerHTML = '';
  mcpAdapters.forEach((adapter) => {
    const item = document.createElement('div');
    const ok = isMcpConfigured(adapter);
    item.className = 'mcp-config-item' + (adapter.isDefault ? ' is-default' : '') + (ok ? ' cfg-ok' : ' cfg-missing');
    item.dataset.mcpId = adapter.id;

    const icon = document.createElement('span');
    icon.className = 'mcp-icon';
    icon.textContent = adapter.icon;

    const info = document.createElement('div');
    info.className = 'mcp-config-info';
    const name = document.createElement('strong');
    name.textContent = adapter.name;
    const desc = document.createElement('span');
    desc.textContent = adapter.description;
    const toolsLine = document.createElement('span');
    toolsLine.textContent = adapter.tools.join(', ');

    // Config status
    const cfgStatus = document.createElement('span');
    cfgStatus.className = 'mcp-cfg-badge ' + (ok ? 'badge-ok' : 'badge-needs');
    const reqFields = (adapter.configFields || []).filter((f) => f.required);
    const filledFields = reqFields.filter((f) => adapter.configValues && adapter.configValues[f.key] && String(adapter.configValues[f.key]).trim());
    cfgStatus.textContent = ok
      ? '✓ Ready'
      : '⚠ ' + filledFields.length + '/' + reqFields.length + ' fields configured';

    info.appendChild(name);
    info.appendChild(desc);
    info.appendChild(toolsLine);
    info.appendChild(cfgStatus);

    const actions = document.createElement('div');
    actions.className = 'mcp-config-actions';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.textContent = ok ? 'Edit' : '⚙ Configure';
    editBtn.className = ok ? '' : 'configure-btn';
    editBtn.addEventListener('click', () => startEditMcp(adapter.id));
    actions.appendChild(editBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'delete-btn';
    deleteBtn.textContent = 'Remove';
    deleteBtn.addEventListener('click', () => removeMcpAdapter(adapter.id));
    actions.appendChild(deleteBtn);

    item.appendChild(icon);
    item.appendChild(info);
    item.appendChild(actions);
    dom.mcpConfigList.appendChild(item);
  });
}

function startEditMcp(mcpId) {
  const adapter = mcpAdapters.find((a) => a.id === mcpId);
  if (!adapter) return;

  const existing = dom.mcpConfigList.querySelector('[data-mcp-id="' + mcpId + '"]');
  if (!existing) return;

  const editRow = document.createElement('div');
  editRow.className = 'mcp-edit-row';
  editRow.dataset.mcpId = mcpId;

  // Header row: icon + name
  const iconInput = document.createElement('input');
  iconInput.type = 'text';
  iconInput.value = adapter.icon;
  iconInput.maxLength = 4;
  iconInput.placeholder = '🔌';
  iconInput.style.textAlign = 'center';

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.value = adapter.name;
  nameInput.maxLength = 30;
  nameInput.placeholder = 'Name';

  editRow.appendChild(iconInput);
  editRow.appendChild(nameInput);

  // Description
  const descLabel = document.createElement('span');
  descLabel.className = 'mcp-edit-label';
  descLabel.textContent = 'Description:';

  const descInput = document.createElement('input');
  descInput.type = 'text';
  descInput.value = adapter.description;
  descInput.maxLength = 80;
  descInput.placeholder = 'Description';
  descInput.style.gridColumn = '1 / -1';

  editRow.appendChild(descLabel);
  editRow.appendChild(descInput);

  // Tools
  const toolsLabel = document.createElement('span');
  toolsLabel.className = 'mcp-edit-label';
  toolsLabel.textContent = 'Tools (comma-separated):';

  const toolsInput = document.createElement('input');
  toolsInput.type = 'text';
  toolsInput.value = adapter.tools.join(', ');
  toolsInput.placeholder = 'tool_a, tool_b';
  toolsInput.style.gridColumn = '1 / -1';

  editRow.appendChild(toolsLabel);
  editRow.appendChild(toolsInput);

  // Per-adapter config fields (the real juice)
  const configFields = adapter.configFields || [];
  const configInputs = {};

  if (configFields.length) {
    const configHeader = document.createElement('div');
    configHeader.className = 'mcp-edit-config-header';
    configHeader.textContent = '🔑 Configuration — required fields for ' + adapter.name;
    editRow.appendChild(configHeader);

    configFields.forEach((field) => {
      const fieldWrap = document.createElement('div');
      fieldWrap.className = 'mcp-edit-field';

      const label = document.createElement('label');
      label.className = 'mcp-edit-field-label';
      label.textContent = field.label + (field.required ? ' *' : '');

      const input = document.createElement('input');
      input.type = field.type || 'text';
      input.placeholder = field.placeholder || '';
      input.value = (adapter.configValues && adapter.configValues[field.key]) || '';
      if (field.required) input.required = true;
      input.autocomplete = 'off';

      fieldWrap.appendChild(label);
      fieldWrap.appendChild(input);
      editRow.appendChild(fieldWrap);
      configInputs[field.key] = input;
    });
  }

  // Actions
  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'mcp-edit-actions';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => renderMcpConfigList());

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'save-edit-btn';
  saveBtn.textContent = 'Save Configuration';
  saveBtn.addEventListener('click', () => {
    const newName = nameInput.value.trim();
    if (!newName) { pushToast('Name cannot be empty.'); return; }

    // Validate required config fields
    for (const field of configFields) {
      if (field.required) {
        const val = configInputs[field.key] ? configInputs[field.key].value.trim() : '';
        if (!val) {
          pushToast(field.label + ' is required.');
          configInputs[field.key].focus();
          return;
        }
      }
    }

    adapter.name = newName;
    adapter.icon = iconInput.value.trim() || '🔌';
    adapter.description = descInput.value.trim();
    adapter.tools = toolsInput.value.split(',').map((t) => t.trim()).filter(Boolean);

    // Save config values
    if (!adapter.configValues) adapter.configValues = {};
    for (const field of configFields) {
      const val = configInputs[field.key] ? configInputs[field.key].value.trim() : '';
      adapter.configValues[field.key] = val;
    }

    saveMcpAdapters();
    refreshMcpUI();
    pushToast('Saved "' + adapter.name + '" configuration.');
  });

  actionsDiv.appendChild(cancelBtn);
  actionsDiv.appendChild(saveBtn);
  editRow.appendChild(actionsDiv);

  existing.replaceWith(editRow);
}

function removeMcpAdapter(mcpId) {
  const idx = mcpAdapters.findIndex((a) => a.id === mcpId);
  if (idx === -1) return;
  const adapter = mcpAdapters[idx];
  if (adapter.isDefault) {
    pushToast('Cannot remove built-in adapter.');
    return;
  }
  mcpAdapters.splice(idx, 1);
  saveMcpAdapters();
  refreshMcpUI();
  pushToast('Removed "' + adapter.name + '".');
}

function handleAddMcp(event) {
  event.preventDefault();
  const name = dom.mcpNewName.value.trim();
  if (!name) { pushToast('Server name is required.'); return; }
  const id = 'custom-' + Date.now().toString(36);
  const icon = dom.mcpNewIcon.value.trim() || '🔌';
  const description = dom.mcpNewDesc.value.trim() || '';
  const tools = dom.mcpNewTools.value.split(',').map((t) => t.trim()).filter(Boolean);

  // Parse custom config fields from the new fields textarea
  const cfgRaw = dom.mcpNewConfigFields ? dom.mcpNewConfigFields.value.trim() : '';
  const configFields = [];
  if (cfgRaw) {
    cfgRaw.split('\n').forEach((line) => {
      const parts = line.split(':').map((s) => s.trim());
      if (parts[0]) {
        const key = parts[0].replace(/[^a-zA-Z0-9_]/g, '');
        const label = parts[1] || parts[0];
        const isSecret = /token|key|secret|password/i.test(key);
        configFields.push({
          key, label, type: isSecret ? 'password' : 'text',
          required: true, placeholder: 'Enter ' + label,
        });
      }
    });
  }

  mcpAdapters.push({ id, name, icon, description, tools, isDefault: false, configFields, configValues: {} });
  saveMcpAdapters();
  refreshMcpUI();
  dom.mcpAddForm.reset();
  pushToast('Added "' + name + '" — click Configure to set it up.');
}

function refreshMcpUI() {
  renderMcpCheckboxes();
  renderMcpAdapterPanel();
  renderMcpConfigList();
}

function init() {
  renderRoster();
  renderSidebar();
  renderMcpCheckboxes();
  renderMcpAdapterPanel();
  dom.assignForm.addEventListener('submit', handleAssignSubmit);
  dom.clearResponsePane.addEventListener('click', () => {
    dom.responsePane.innerHTML = '';
  });
  dom.clearAgentOutput.addEventListener('click', () => {
    dom.agentOutputPane.innerHTML = '';
    agentOutputCount = 0;
    dom.agentOutputLabel.textContent = 'No output yet';
  });
  dom.taskList.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action="done"]');
    if (!button || !state.selectedAgentId) return;
    markTaskDone(state.selectedAgentId, button.dataset.taskId);
  });

  // Activity log clear button
  dom.clearLogBtn.addEventListener('click', () => {
    dom.activityLogBody.innerHTML = '';
    activityLogCount = 0;
    dom.logCount.textContent = '0 entries';
  });

  // MCP configuration modal
  dom.mcpConfigBtn.addEventListener('click', openMcpConfigModal);
  dom.mcpModalClose.addEventListener('click', closeMcpConfigModal);
  dom.mcpConfigModal.addEventListener('click', (e) => {
    if (e.target === dom.mcpConfigModal) closeMcpConfigModal();
  });
  dom.mcpAddForm.addEventListener('submit', handleAddMcp);

  document.addEventListener('keydown', handleKeyNavigation);
  animate();
}

init();