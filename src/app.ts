import './style.css';
import { Landscape } from './scene';
import { World } from './world';
import { Player } from './player';
import { Interface, inventory, type Config, type Screen } from './interface';
import { icon } from './art';
import { Ambience } from './sound';
import { saveView } from './capture';

function preferences(): Config {
  let saved: Partial<Config> = {};
  try {
    saved = JSON.parse(localStorage.getItem('bracken:settings') || '{}') ?? {};
  } catch {
    /* Storage is optional. */
  }
  const radius = Number(saved.radius),
    sens = Number(saved.sensitivity);
  return {
    radius: Number.isFinite(radius) ? Math.max(3, Math.min(9, Math.round(radius))) : 8,
    sensitivity: Number.isFinite(sens) ? Math.max(0.3, Math.min(2, sens)) : 1,
  };
}
function boot(parent: HTMLElement) {
  const canvas = document.createElement('canvas');
  canvas.id = 'landscape';
  canvas.tabIndex = -1;
  canvas.setAttribute('aria-label', 'First-person voxel landscape: Alder Basin');
  parent.append(canvas);
  const world = new World(),
    cfg = preferences(),
    scene = new Landscape(world, canvas),
    ui = new Interface(parent),
    sound = new Ambience();
  const player = new Player(20.5, world.height(20, 36) + 1, 36.5);
  player.yaw = 0.25;
  player.pitch = -0.095;
  scene.radius = cfg.radius;
  let screen: Screen = 'menu',
    origin: 'menu' | 'pause' = 'menu',
    slot = 0,
    raf = 0,
    last = 0,
    lastUI = 0,
    lastSpace = -Infinity,
    animClock = 0;
  let saving = false,
    locked = false,
    lockAttempt = 0;
  const keys = new Set<string>(),
    events = new AbortController(),
    opt = { signal: events.signal };
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function menuPose() {
    scene.pose(9.5, 36, 44.5, 0.11, -0.075);
  }
  function show(next: Screen) {
    if (next === 'settings' || next === 'guide') origin = screen === 'pause' ? 'pause' : 'menu';
    screen = next;
    keys.clear();
    lastSpace = -Infinity;
    if (next !== 'play') {
      lockAttempt++;
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      scene.select(undefined);
    }
    if (next === 'menu' || next === 'play') canvas.dataset.ready = 'false';
    if (next === 'menu') menuPose();
    if (next === 'play') scene.pose(player.x, player.eyeY, player.z, player.yaw, player.pitch);
    ui.show(next, cfg, sound.on);
    if (next === 'play') {
      ui.select(slot);
      ui.telemetry(player.x, player.y, player.z, player.yaw, player.flying);
    }
  }
  function enter() {
    show('play');
    canvas.focus({ preventScroll: true });
    const stamp = ++lockAttempt;
    try {
      const req = canvas.requestPointerLock();
      if (req)
        void req.catch(() => {
          if (screen === 'play' && stamp === lockAttempt)
            ui.toast('Cursor unlocked · use arrow keys to look');
        });
    } catch {
      ui.toast('Use the arrow keys to look around');
    }
  }
  async function capture() {
    if (saving) return;
    saving = true;
    try {
      const name =
        screen === 'play' ? 'in-game.png' : screen === 'menu' ? 'main-menu.png' : `${screen}.png`;
      await saveView(scene, ui.root, name);
      ui.toast(`Saved ${name}`);
    } catch {
      ui.toast('Capture unavailable · use the Bun screenshot command');
    } finally {
      saving = false;
    }
  }
  async function action(act: string) {
    switch (act) {
      case 'start':
      case 'resume':
        enter();
        break;
      case 'pause':
      case 'menu':
      case 'guide':
      case 'settings':
        show(act);
        break;
      case 'back':
        show(origin);
        ui.root
          .querySelector<HTMLElement>(`[data-act="${origin === 'menu' ? 'start' : 'resume'}"]`)
          ?.focus();
        break;
      case 'capture':
        await capture();
        break;
      case 'sound': {
        try {
          const on = await sound.toggle();
          const btn = ui.root.querySelector<HTMLElement>('[data-act=sound]');
          if (btn) {
            btn.innerHTML = icon(on ? 'sound' : 'mute');
            btn.title = on ? 'Mute ambience' : 'Enable ambience';
            btn.setAttribute('aria-label', btn.title);
            btn.setAttribute('aria-pressed', `${on}`);
          }
        } catch {
          ui.toast('Audio unavailable in this browser');
        }
        break;
      }
      case 'full':
        try {
          if (document.fullscreenElement) await document.exitFullscreen();
          else await document.documentElement.requestFullscreen();
        } catch {
          ui.toast('Fullscreen unavailable in this window');
        }
        break;
    }
  }
  const select = (n: number) => {
    slot = (n + inventory.length) % inventory.length;
    ui.select(slot);
  };
  ui.root.addEventListener(
    'click',
    (e) => {
      const b = (e.target as Element).closest<HTMLButtonElement>('button');
      if (!b) return;
      if (b.dataset.act) void action(b.dataset.act);
      else if (b.dataset.slot) select(+b.dataset.slot);
    },
    opt,
  );
  ui.root.addEventListener(
    'input',
    (e) => {
      const input = e.target as HTMLInputElement;
      if (input.id === 'distance') {
        canvas.dataset.ready = 'false';
        scene.radius = cfg.radius = +input.value;
        ui.root.querySelector('#distance-out')!.textContent = `${cfg.radius} chunks`;
      } else if (input.id === 'sense') {
        cfg.sensitivity = +input.value;
        ui.root.querySelector('#sense-out')!.textContent = `${cfg.sensitivity.toFixed(1)}×`;
      }
      try {
        localStorage.setItem('bracken:settings', JSON.stringify(cfg));
      } catch {
        /* Preferences still apply this session. */
      }
    },
    opt,
  );
  document.addEventListener(
    'pointerlockchange',
    () => {
      const was = locked;
      locked = document.pointerLockElement === canvas;
      if (was && !locked && screen === 'play') show('pause');
      if (locked && screen !== 'play') document.exitPointerLock();
    },
    opt,
  );
  document.addEventListener(
    'mousemove',
    (e) => {
      if (screen === 'play' && (locked || e.buttons === 4))
        player.look(e.movementX, e.movementY, cfg.sensitivity);
    },
    opt,
  );
  canvas.addEventListener(
    'mousedown',
    (e) => {
      if (screen !== 'play') return;
      e.preventDefault();
      if (e.button !== 0 && e.button !== 2) return;
      const cell = player.edit(world, e.button === 0 ? 'break' : 'place', inventory[slot]![0]);
      if (cell) scene.edited(cell[0], cell[2]);
    },
    opt,
  );
  window.addEventListener(
    'contextmenu',
    (e) => {
      if (screen === 'play') e.preventDefault();
    },
    opt,
  );
  window.addEventListener(
    'wheel',
    (e) => {
      if (screen === 'play' && e.deltaY) {
        e.preventDefault();
        select(slot + Math.sign(e.deltaY));
      }
    },
    { ...opt, passive: false },
  );
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === 'KeyP') {
        if (!e.repeat) void capture();
        e.preventDefault();
        return;
      }
      if (e.code === 'Escape' && !e.repeat) {
        if (screen === 'play') show('pause');
        else if (screen === 'guide' || screen === 'settings') void action('back');
        e.preventDefault();
        return;
      }
      if (screen !== 'play') {
        if (
          e.code === 'Enter' &&
          (screen === 'menu' || screen === 'pause') &&
          !e.repeat &&
          !(e.target as HTMLElement).closest('button,input')
        ) {
          e.preventDefault();
          enter();
        }
        return;
      }
      if (/^Arrow|^Space|^Shift|^Key[WASDF]|^Digit[1-8]$/.test(e.code)) e.preventDefault();
      keys.add(e.code);
      if (e.repeat) return;
      if (e.code === 'KeyF') player.toggleFlight();
      if (e.code === 'Space') {
        const now = performance.now();
        if (now - lastSpace < 280) {
          player.toggleFlight();
          lastSpace = -Infinity;
        } else {
          player.jump();
          lastSpace = now;
        }
      }
      if (/^Digit[1-8]$/.test(e.code)) select(+e.code.slice(-1) - 1);
    },
    opt,
  );
  window.addEventListener('keyup', (e) => keys.delete(e.code), opt);
  const loseFocus = () => {
    keys.clear();
    if (screen === 'play') show('pause');
  };
  window.addEventListener('blur', loseFocus, opt);
  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.hidden) loseFocus();
      last = 0;
    },
    opt,
  );
  window.addEventListener('resize', () => scene.resize(), opt);
  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    if (document.hidden || (screen !== 'play' && scene.ready && now - last < 45)) return;
    const dt = Math.min(0.08, (now - (last || now)) / 1000);
    last = now;
    if (!still) animClock += dt;
    if (screen === 'play') {
      player.look(
        (+keys.has('ArrowRight') - +keys.has('ArrowLeft')) * dt * 650,
        (+keys.has('ArrowDown') - +keys.has('ArrowUp')) * dt * 650,
        1,
      );
      player.move(dt, keys, world);
      scene.pose(player.x, player.eyeY, player.z, player.yaw, player.pitch);
      const hit = player.target(world)?.hit;
      scene.select(hit);
      ui.aim(hit, hit ? world.get(...hit) : undefined);
      if (now - lastUI > 120) {
        ui.telemetry(player.x, player.y, player.z, player.yaw, player.flying);
        lastUI = now;
      }
    }
    scene.draw(animClock);
    const ready = String(scene.ready);
    if (canvas.dataset.ready !== ready) canvas.dataset.ready = ready;
  }
  show('menu');
  raf = requestAnimationFrame(frame);
  return () => {
    cancelAnimationFrame(raf);
    events.abort();
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    sound.dispose();
    scene.dispose();
    ui.dispose();
    canvas.remove();
  };
}
const root = document.querySelector<HTMLElement>('#app')!;
try {
  const dispose = boot(root);
  if (import.meta.hot) import.meta.hot.dispose(dispose);
} catch (error) {
  root.innerHTML =
    '<section class="error"><h2>Unable to open the valley.</h2><p>This game needs WebGL 2. Enable hardware acceleration or try a current desktop browser.</p></section>';
  console.error(error);
}
