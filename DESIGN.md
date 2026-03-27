# Agent Bar Hangout — Design Document

## Vision & Goals
- Provide a cozy, slightly whimsical 2D bar scene where worker agents can idle while waiting for assignments.
- Allow the user to click any agent sprite to select it and issue specific work tasks.
- Keep the entire experience lightweight (single-page app, no server) and under the $10 budget by relying exclusively on free assets and in-browser logic.
- Make it straightforward to extend (add agents, swap art, integrate real task systems later).

## Constraints & Guardrails
- Budget: $0 of paid services/assets (≤ $10 hard cap).
- Technology: static HTML/CSS/JS; no build tooling required.
- Deployment: open 'index.html' locally; no install.
- Privacy/Security: no device control, no external network requests beyond local assets.
- User approval required before any code is executed or tested.

## Layout Overview
1. Bar Canvas (left ~70%)
   - Rendered via <canvas> for free-form drawing and animation.
   - Displays background bar scene (wood floor plus bar counter via gradients) and agent sprites.
2. Control / Task Panel (right ~30%)
   - Shows selected agent details, queue of their tasks, and input controls to add work.
   - Includes a global agents list for quick selection and status indicators (Idle / Busy / Done).
3. Notification Toasts (floating)
   - Brief text popups acknowledging assignments or task completion.

## Interaction Flow
1. Page loads: background plus agent sprites placed at predefined coordinates with idle bobbing animation.
2. Hover over agent shows tooltip with name and specialty; click selects agent (highlight ring plus focus in sidebar).
3. Task panel displays selected agent's active tasks and history.
4. User types a task description and optional estimated duration, then presses Assign.
5. Task is appended to that agent's queue, status indicator updates to Busy, and a toast appears.
6. Agents can auto-progress tasks via simulated timers or manual Mark Done buttons.
7. Completed tasks show in a collapsible History section for each agent.

## Data Model
- agents: array of objects { id, name, role, mood, color, position: { x, y }, tasks: Task[], history: Task[] }.
- Task: { id, label, notes, status: 'pending' | 'in-progress' | 'done', startedAt, etaMinutes }.
- Global selectedAgentId plus derived getters for convenience.
- State persisted only in-memory for now; optional future localStorage hook.

## Rendering & Animation Strategy
- Canvas draws static background rectangles/gradients each frame, then loops through agents for sprite painting (simple rounded rectangles or custom PNG if added later).
- Idle animation: small vertical sine-wave offset per agent to create a subtle breathing effect.
- Selection ring drawn as a stroked circle or glow behind the sprite.
- Toasts and sidebar handled with regular DOM elements layered above the canvas.

## UI Components
1. Canvas Layer
   - Responsible for drawing environment and sprites.
2. Sidebar
   - Sections: (a) Selected Agent card, (b) Task List with inline status badges, (c) New Task form, (d) Agent Directory grid.
3. Toasts Container
   - Absolutely positioned bottom-left stack for ephemeral feedback.
4. Modal Placeholder
   - Hidden by default; potential future use to edit agent metadata without layout rewrite.

## Implementation Outline
### HTML Structure (using indentation instead of fenced code)
    <body>
      <main class="app-shell">
        <section class="bar-stage">
          <canvas id="barCanvas" width="960" height="540"></canvas>
        </section>
        <aside class="control-panel">
          <!-- selected agent, tasks, form, roster -->
        </aside>
        <div class="toast-stack" aria-live="polite"></div>
      </main>
    </body>

### CSS Themes
- Use CSS custom properties for palette: bar wood tones with neon accents for highlights.
- Flex layout for sidebar, grid for roster buttons.
- Reusable .pill badges for statuses.
- Media queries ensure workable layout down to roughly 900px width.

### JavaScript Modules
- state.js (or inline module) holding agent/task arrays and helper functions.
- render.js handling canvas drawing plus requestAnimationFrame loop.
- ui.js wiring DOM events (click select, submit task, mark done).
- toasts.js to enqueue/dequeue notifications.
- For simplicity, initial version may exist inside one <script type='module'> block with clear sections.

## Asset Plan
- Background assembled from gradients and simple rectangles (no external files).
- Agent sprites start as colored rounded rectangles with small icons drawn via Canvas.
- Provide hooks to swap sprite fill with Image objects if free PNGs are added later.

## Accessibility Considerations
- Ensure sidebar buttons have focus states and aria-pressed for selected roster entries.
- Provide ARIA live region for toasts.
- Allow keyboard navigation: arrow keys cycle agents, Enter assigns tasks when form is focused.

## Manual Testing Plan (after approval)
1. Open index.html in a modern browser (Chrome, Edge, Firefox).
2. Confirm agents render and animate.
3. Click each agent: selection highlight plus sidebar updates.
4. Assign tasks; ensure they appear immediately in the list.
5. Use Mark Done to move tasks into history and update status indicator.
6. Resize window moderately to ensure layout remains intact.
7. Refresh page to confirm state resets (expected).

## Future Enhancements (not in MVP)
- Persistence via localStorage.
- Drag-and-drop repositioning of agents.
- Audio ambience toggle.
- Integration with real task queues or API endpoints.
## 3D Scene Upgrade Plan (Deferred)

### Goals
**Status (2026-03-26):** Paused after asset import issues; sticking with the proven 2D canvas background + sprite overlay for now.
- Replace the improvised 2D painted environment with a true 3D bar interior while keeping budget at $0.
- Maintain the existing HUD/sidebar UX so users still assign work the same way.
- Keep agent sprites readable by layering them as 2D overlays on top of the rendered bar.

### Rendering Stack
- Three.js (MIT) for WebGL scene management plus post-processing.
- GLTFLoader from the Three.js examples bundle to import a .glb/.gltf bar interior.
- Dual-canvas approach:
  1. #threeCanvas for the 3D scene rendered by Three.js.
  2. Existing #barCanvas repurposed as a transparent overlay for agent sprites and hover highlights.
- UI + Forms remain regular DOM nodes so no change to sidebar markup.

### Integration Steps
1. Asset approval: pick one of the candidates in ASSETS.md (all CC0) and confirm licensing fits.
2. Asset ingestion: add the .glb file under public/assets/ (new folder) and document attribution in README.
3. Scene bootstrap:
   - Import Three.js + GLTFLoader via CDN (e.g., https://unpkg.com/three@0.162.0/build/three.module.js).
   - Create a scene.js module responsible for camera, renderer, and resize handling.
   - Configure warm ambient + spot lights to showcase the bar counter and seating.
4. Sprite overlay alignment:
   - Keep agent model data in normalized coordinates (0–1).
   - Convert to screen space each frame by projecting positions with the active camera and place sprites on the overlay canvas.
   - Maintain current click/hover logic by testing the overlay coordinates.
5. Interaction updates:
   - When users click/hover, use the overlay sprite positions (already scaled).
   - Optional future enhancement: add raycasting for 3D awareness.
6. Performance considerations:
   - Target 60 fps; fall back to lower renderer pixel ratio on low-power devices.
   - Lazy-load GLTF to avoid blocking the rest of the UI.
7. Testing:
   - Update manual QA steps to include verifying the 3D scene loads, any camera orbit works, and sprites stay aligned during resize.

### Outstanding Decisions Before Coding
- Choose which CC0 3D bar asset to use (see ASSETS.md).
- Confirm whether we want a fixed cinematic camera or limited orbit controls for exploration.
- Decide if agent sprites should stay 2D overlays (recommended for clarity) or become 3D billboards later.

### 3D Asset Decisions (2026-03-26)
- **Asset**: Quaternius — Cyberpunk Bar Interior (GLB). We'll place the trimmed GLB in `public/assets/bar/quaternius-cyberpunk-bar.glb` and reference textures packaged in the download.
- **Camera**: Fixed cinematic framing (no orbit controls) aimed slightly downward toward the bar counter. We will expose a small helper to tweak position/target via constants.
- **Sprites**: Agent avatars stay 2D overlays on the secondary canvas, preserving existing hover/click logic.
- **Next Implementation Steps**:
  1. Add Three.js + GLTFLoader modules via CDN imports.
  2. Create `scene.js` (or inline module section) to initialize the renderer, load the GLB, and lock the camera pose.
  3. Update `index.html` to include stacked canvases (`threeCanvas` for 3D, `spriteCanvas` for agents).
  4. Ensure resize logic keeps both canvases aligned and that sprites project correctly to screen coordinates.

## Selected 3D Asset Implementation

### Asset Overview
- **Name**: Quaternius — Cyberpunk Bar Interior (from the Cyberpunk City pack).
- **Files to keep**: `Models/Interior/Bar.glb` (renamed to `cyberpunk-bar.glb`) plus any referenced textures.
- **Repo location**: `public/assets/bar/cyberpunk-bar.glb` with textures in `public/assets/bar/textures/`.
- **License**: CC0 — attribution appreciated but not required.

### Scene Bootstrap Plan
1. Add a Three.js renderer targeting a fixed-size `<canvas id="threeCanvas">` that sits directly under the existing sprite canvas.
2. Use `GLTFLoader` to load `public/assets/bar/cyberpunk-bar.glb` asynchronously. Show a subtle loading indicator until the promise resolves.
3. Position the GLTF root so the bar counter fills the lower third of the frame; hide unused nodes if necessary for performance.
4. Create a dedicated `scene.js` (or inline module section) responsible for renderer, camera, lights, resize handler, and animation loop.
5. Keep our existing agent overlay logic untouched, but switch `#barCanvas` to `pointer-events: none` + transparent background so it can float above the 3D canvas.
6. Maintain the HUD/sidebar DOM exactly as-is to minimize churn.

### Camera & Lighting
- **Camera**: use a fixed cinematic framing (e.g., perspective camera positioned around `(x=4, y=3, z=7)` looking toward the bar center) with no orbit controls exposed to users.
- **Posture**: slight downward tilt (lookAt target around the bar counter) to showcase seated area.
- **Lighting**: combine a warm ambient light plus a few rect/spot lights aimed at the counter and booths; reuse emissive textures baked into the GLB for neon glow.
- **Renderer settings**: enable tone mapping + sRGB output to preserve the neon palette while keeping performance reasonable.

### Sprite Overlay Alignment
1. Store nominal agent positions as 3D coordinates roughly aligned with the GLB layout (e.g., normalized stage positions).
2. Each frame, convert those positions to screen space using `Vector3.project(camera)` from Three.js.
3. Translate the projected coordinates into pixel locations on the overlay canvas and draw the same 2D sprites there.
4. Input hit-testing remains on the overlay since pointer events occur on the transparent canvas; no raycasting needed.
5. When window resizes, update both the Three.js renderer + camera aspect and the overlay canvas dimensions so sprites stay locked to their seats.

### Build & Deployment Notes
- Host assets locally to avoid any CDN reliance.
- Document asset provenance (see `ASSETS.md`) for future compliance checks.
- Ensure the final bundle still works by opening `index.html` directly; no build tooling introduced.
