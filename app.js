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

/* ───────── Three.js setup ───────── */
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0812);
scene.fog = new THREE.FogExp2(0x0a0812, 0.08);

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
const ambientLight = new THREE.AmbientLight(0x332244, 0.6);
scene.add(ambientLight);

const mainLight = new THREE.DirectionalLight(0xffe8c0, 1.2);
mainLight.position.set(3, 6, 4);
mainLight.castShadow = true;
mainLight.shadow.mapSize.set(1024, 1024);
scene.add(mainLight);

// Warm bar lamps
[
  { x: -3, y: 3.5, z: 0, color: 0xffcc66 },
  { x: 0, y: 3.5, z: 0, color: 0xff9944 },
  { x: 3, y: 3.5, z: 0, color: 0xffcc66 },
].forEach((lp) => {
  const light = new THREE.PointLight(lp.color, 2.5, 12);
  light.position.set(lp.x, lp.y, lp.z);
  light.castShadow = true;
  scene.add(light);
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 8, 8),
    new THREE.MeshBasicMaterial({ color: lp.color })
  );
  bulb.position.copy(light.position);
  scene.add(bulb);
});

// Neon accent strips
[0xff2266, 0x22ccff, 0xff8800].forEach((col, i) => {
  const neon = new THREE.PointLight(col, 0.8, 6);
  neon.position.set(-3 + i * 3, 2.8, -2.5);
  scene.add(neon);
});

/* ───────── Raycasting ───────── */
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

/* ───────── Load GLB bar scene ───────── */
const loader = new GLTFLoader();

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

  // Body
  const bodyMat = new THREE.MeshStandardMaterial({
    color: agent.color, roughness: 0.5, metalness: 0.1,
    emissive: agent.color, emissiveIntensity: 0.15,
  });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.6, 8, 16), bodyMat);
  body.position.y = 0.6;
  body.castShadow = true;
  group.add(body);

  // Head
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0xf9efe5, roughness: 0.6 })
  );
  head.position.y = 1.25;
  head.castShadow = true;
  group.add(head);

  // Eyes
  const eyeGeo = new THREE.SphereGeometry(0.04, 8, 8);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x1a1a2e });
  const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
  leftEye.position.set(-0.08, 1.28, 0.18);
  group.add(leftEye);
  const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
  rightEye.position.set(0.08, 1.28, 0.18);
  group.add(rightEye);

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
    const bob = Math.sin(elapsed * 1.5 + agent.swayOffset) * 0.06;
    const sway = Math.sin(elapsed * 0.8 + agent.swayOffset) * 0.04;
    agent.mesh.position.y = agent.position.y + bob;
    agent.mesh.rotation.y = sway;

    // Selection ring
    const isSelected = agent.id === state.selectedAgentId;
    const isHovered = agent.id === state.hoveredAgentId;
    const targetOpacity = isSelected ? 0.9 : isHovered ? 0.5 : 0;
    const ring = agent.ringMesh;
    if (ring) {
      ring.material.opacity += (targetOpacity - ring.material.opacity) * 0.15;
      ring.material.color.set(isSelected ? 0xffd166 : 0xffffff);
      if (isSelected) {
        ring.rotation.z = elapsed * 0.5;
        ring.scale.setScalar(1 + Math.sin(elapsed * 2) * 0.05);
      }
    }

    // Emissive pulse when busy
    const body = agent.mesh.children[0];
    if (body && body.material) {
      body.material.emissiveIntensity = agent.status === 'busy'
        ? 0.15 + Math.sin(elapsed * 3 + agent.swayOffset) * 0.1
        : 0.15;
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
    meta.appendChild(stamp);
    item.appendChild(meta);

    if (showActions) {
      const actions = document.createElement('div');
      actions.className = 'task-actions';
      const statusPill = document.createElement('span');
      statusPill.className = 'pill';
      statusPill.textContent = task.status === 'done' ? 'Done' : 'In progress';
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
  const etaMinutes = etaRaw ? Math.max(1, Math.min(240, Number(etaRaw))) : null;
  addTaskToAgent(agent.id, { label, notes, etaMinutes });
  dom.assignForm.reset();
  dom.taskLabel.focus();
}

function addTaskToAgent(agentId, payload) {
  const agent = state.agents.find((a) => a.id === agentId);
  if (!agent) return;
  const task = {
    id: 'task-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 999),
    label: payload.label,
    notes: payload.notes,
    etaMinutes: payload.etaMinutes,
    status: 'in-progress',
    createdAt: new Date().toISOString(),
    completedAt: null,
  };
  agent.tasks.push(task);
  agent.status = 'busy';
  renderSidebar();
  pushToast('Assigned "' + task.label + '" to ' + agent.name + '.');
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