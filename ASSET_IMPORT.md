# Quaternius Cyberpunk Bar Import Guide

## Download (Manual Step)
1. Visit https://quaternius.com/packs/cyberpunkcity.html and download the "Cyberpunk City" pack (free, CC0).
2. Extract the archive locally; inside you'll find `Models/Interior/Bar.glb` plus texture folders.

## Prepare Repo Structure
1. In this repo, create `public/assets/bar/` (and `public/assets/bar/textures/` if textures are external).
2. Copy `Bar.glb` into that folder and rename it to `cyberpunk-bar.glb`.
3. If the GLB references external textures, copy the associated PNG files into `public/assets/bar/textures/`.

## Verification
- Expected GLB size: roughly 8–10 MB.
- Open the GLB in an online viewer (e.g., https://gltf-viewer.donmccurdy.com/) to confirm it loads correctly before committing.
- Note any unused submeshes so we can optionally delete them later for performance.

## Repo Notes
- Do **not** commit the entire Quaternius pack—only the files used by this project.
- Update README/attribution if desired (CC0 means not required).
- After copying, we can proceed with wiring up Three.js to load `public/assets/bar/cyberpunk-bar.glb`.
