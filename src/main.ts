import * as THREE from 'three';
import './style.css';
import { Block, blocks } from './blocks';
import { World } from './world';
import { Player } from './player';
import { UI, type Screen, type Settings } from './ui';

const canvas = document.querySelector<HTMLCanvasElement>('#world')!;
let renderer: THREE.WebGLRenderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
} catch {
  document.querySelector('#app')!.innerHTML = '<div class="fallback"><h1>A WebGL world awaits.</h1><p>Your browser could not start WebGL. Enable hardware acceleration and reload in a modern desktop browser.</p></div>';
  throw new Error('WebGL unavailable');
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor('#adcbd0');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#adcbd0');
scene.fog = new THREE.Fog('#adcbd0', 52, 112);
const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 240);
scene.add(new THREE.HemisphereLight('#eaf6f3', '#72633c', 1.6));
const sun = new THREE.DirectionalLight('#fff0cd', 1.7);
sun.position.set(-30, 70, 35); scene.add(sun);
const world = new World(); scene.add(world.group);
const player = new Player(camera, world);
let settings: Settings = { distance: 3, sensitivity: 1 };
try {
  const saved: unknown = JSON.parse(localStorage.getItem('verdant-settings') || 'null');
  if (saved && typeof saved === 'object' && 'distance' in saved && 'sensitivity' in saved) {
    settings = { distance: THREE.MathUtils.clamp(Number(saved.distance) || 3, 2, 5), sensitivity: THREE.MathUtils.clamp(Number(saved.sensitivity) || 1, 0.2, 2) };
  }
} catch { /* Storage may be unavailable in private browsing. */ }
world.radius = settings.distance;
(scene.fog as THREE.Fog).near = settings.distance * 16;
(scene.fog as THREE.Fog).far = settings.distance * 24 + 40;
world.warmup(8, 5);

// Original block-shaped cloud clusters, shared geometry/material and one draw call.
const cloudGeometry = new THREE.BoxGeometry(1,1,1);
const cloudMaterial = new THREE.MeshLambertMaterial({ color: '#f9f8ed' });
const clouds = new THREE.InstancedMesh(cloudGeometry, cloudMaterial, 48);
const dummy = new THREE.Object3D();
for (let i = 0; i < 48; i++) {
  const cluster = Math.floor(i / 4), part = i % 4;
  dummy.position.set((cluster % 4) * 39 - 65 + part * 5, 48 + (cluster % 3) * 4 + (part % 2), Math.floor(cluster / 4) * 46 - 55);
  dummy.scale.set(11 + part * 2, 1.7 + part % 2, 7 + part * 1.3);
  dummy.updateMatrix(); clouds.setMatrixAt(i, dummy.matrix);
}
scene.add(clouds);
const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.006,1.006,1.006)), new THREE.LineBasicMaterial({ color: '#f8edbc', transparent: true, opacity: 0.85 }));
outline.visible = false; scene.add(outline);
let screen: Screen = 'menu';
let selected = 0;
let target: ReturnType<World['raycast']> = null;
let hudHidden = false;
let hasEntered = false;

function select(i: number): void { selected = (i + blocks.length) % blocks.length; ui.select(selected); }
function setScreen(next: Screen): void {
  screen = next; ui.screen(next); player.keys.clear();
  outline.visible = false;
  if (next !== 'playing' && document.pointerLockElement) document.exitPointerLock();
  if (next === 'menu') world.update(8,5,true);
}
async function play(): Promise<void> {
  ui.dialog.close();
  hasEntered = true; setScreen('playing'); player.sync(); world.update(player.position.x, player.position.z);
  try { await canvas.requestPointerLock(); } catch { ui.toast('Click the world to enable mouse look.'); }
}
function capture(): void {
  renderer.render(scene, camera);
  canvas.toBlob(blob => {
    if (!blob) return ui.toast('Screenshot could not be created.');
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = screen === 'menu' ? 'main-menu-world.png' : 'in-game-world.png'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    ui.toast('World PNG downloaded. Use bun run screenshots for full UI captures.');
  }, 'image/png');
}
const ui = new UI({ play: () => { void play(); }, menu: () => setScreen('menu'), screenshot: capture, select,
  settings: s => {
    settings = { ...s }; world.radius = s.distance;
    (scene.fog as THREE.Fog).near = s.distance * 16; (scene.fog as THREE.Fog).far = s.distance * 24 + 40;
    try { localStorage.setItem('verdant-settings', JSON.stringify(s)); } catch { /* Optional persistence. */ }
  },
}, settings);
ui.screen('menu');
ui.el('pause').onclick = () => setScreen('paused');
canvas.addEventListener('click', () => { if (screen === 'playing' && !document.pointerLockElement) void play(); });
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  ui.el('explore-hint').hidden = locked;
  if (!locked && screen === 'playing' && !captureMode) setScreen('paused');
});
document.addEventListener('mousemove', event => { if (screen === 'playing' && document.pointerLockElement === canvas) player.look(event.movementX,event.movementY,settings.sensitivity); });
document.addEventListener('contextmenu', event => { if (screen === 'playing') event.preventDefault(); });
document.addEventListener('mousedown', event => {
  if (screen !== 'playing' || document.pointerLockElement !== canvas || !target) return;
  if (event.button === 0) {
    if (world.set(target.block.x,target.block.y,target.block.z,Block.Air)) ui.toast('Block removed');
  } else if (event.button === 2) {
    const p = target.block.clone().add(target.normal);
    if (player.intersects(p.x,p.y,p.z)) return ui.toast('A little more room — step back to place.');
    if (world.set(p.x,p.y,p.z,blocks[selected]!.id)) ui.toast(`${blocks[selected]!.name} placed`);
  }
});
document.addEventListener('keydown', event => {
  if (ui.dialog.open) return;
  if (event.code === 'KeyP') { if (!event.repeat) capture(); return; }
  if (event.code === 'Escape') {
    if (screen === 'playing') setScreen('paused');
    return;
  }
  if (screen !== 'playing') return;
  if (['Space','ArrowUp','ArrowDown'].includes(event.code)) event.preventDefault();
  if (!event.repeat && event.code === 'KeyF') { player.toggleFlight(); ui.toast(player.flying ? 'Creative flight enabled · Space ↑ Shift ↓' : 'Back on foot'); }
  if (!event.repeat && event.code === 'KeyH') { hudHidden = !hudHidden; ui.el('hud').classList.toggle('hidden-hud',hudHidden); }
  if (/^Digit[1-8]$/.test(event.code)) select(Number(event.code.slice(-1))-1);
  if (document.pointerLockElement === canvas) player.keys.add(event.code);
});
document.addEventListener('keyup', event => player.keys.delete(event.code));
document.addEventListener('wheel', event => {
  if (screen === 'playing' && document.pointerLockElement === canvas) { event.preventDefault(); select(selected + Math.sign(event.deltaY)); }
}, { passive: false });
window.addEventListener('blur', () => { player.keys.clear(); if (screen === 'playing' && !captureMode) setScreen('paused'); });
document.addEventListener('visibilitychange', () => { if (document.hidden) player.keys.clear(); });
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth,innerHeight);
});

const captureMode = new URLSearchParams(location.search).get('capture') === 'game';
if (captureMode) { hasEntered = true; setScreen('playing'); player.sync(); world.warmup(player.position.x,player.position.z); ui.el('explore-hint').hidden = true; }
let last = performance.now(), elapsed = 0, hudTime = 0;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const direction = new THREE.Vector3();
function frame(now: number): void {
  const dt = Math.min((now-last)/1000,0.04); last = now; elapsed += dt;
  if (screen === 'menu') {
    camera.position.set(43 + (reducedMotion.matches ? 0 : Math.sin(elapsed * 0.025) * 2), 34, 53);
    camera.lookAt(-8, 15, -13); world.update(8,5);
  } else {
    if (screen === 'playing' && document.pointerLockElement === canvas) player.update(dt);
    else if (hasEntered) player.sync();
    world.update(player.position.x, player.position.z);
    target = world.raycast(camera.position, camera.getWorldDirection(direction));
    outline.visible = !!target && screen === 'playing' && !hudHidden;
    if (target) outline.position.copy(target.block).addScalar(0.5);
    hudTime += dt;
    if (hudTime > .15) {
      hudTime = 0;
      ui.el('coords').textContent = `${Math.floor(player.position.x)} / ${Math.floor(player.position.y)} / ${Math.floor(player.position.z)} · ${world.count} CHUNKS`;
      ui.el('mode').textContent = player.flying ? '◇ CREATIVE FLIGHT' : '● ON FOOT';
      ui.el('mode').classList.toggle('flying',player.flying);
      ui.el('target').textContent = target ? `${Block[target.type].toUpperCase()} · ${Math.floor(camera.position.distanceTo(target.block))} M` : '';
    }
  }
  // Freeze clouds while paused; a gentle drift otherwise.
  if (screen !== 'paused' && !reducedMotion.matches) clouds.position.x = Math.sin(elapsed * .018) * 9;
  renderer.render(scene,camera);
  document.documentElement.dataset.ready = 'true';
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Small read-only diagnostic surface for smoke tests and benchmark measurements.
Object.defineProperty(window, 'verdant', { value: {
  get state() { return { screen, flying: player.flying, position: player.position.toArray(), yaw: player.yaw, pitch: player.pitch, chunks: world.count, drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles, selected, editedBlocks: world.editedBlocks, target: target ? { block: target.block.toArray(), type: target.type } : null, locked: document.pointerLockElement === canvas }; },
} });
