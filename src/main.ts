import * as THREE from "three";
import {
  BLOCKS,
  Block,
  CHUNK,
  DEFAULT_VIEW_DISTANCE,
  MAX_VIEW_DISTANCE,
  SEA,
  hash,
} from "./terrain";
import { World } from "./world";
import { Player } from "./player";
import { UI } from "./ui";
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-600.css";
import "@fontsource/dm-sans/latin-700.css";
import "./style.css";

const canvas = document.querySelector<HTMLCanvasElement>("#world")!;
const ui = new UI();
let renderer: THREE.WebGLRenderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    preserveDrawingBuffer: true,
    powerPreference: "high-performance",
  });
} catch {
  document.querySelector("#loading")!.textContent =
    "WebGL unavailable. Enable hardware acceleration and reload.";
  document.querySelector<HTMLButtonElement>("#play")!.disabled = true;
  throw new Error("Wildmere requires a browser with WebGL2 support.");
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.22;
const scene = new THREE.Scene();
scene.background = new THREE.Color("#a9cfc9");
scene.fog = new THREE.Fog("#b7cec2", 62, 127);
const camera = new THREE.PerspectiveCamera(
  65,
  innerWidth / innerHeight,
  0.08,
  600,
);
scene.add(new THREE.HemisphereLight(0xddeed9, 0x586644, 2.3));
const sunLight = new THREE.DirectionalLight(0xffecd0, 2.1);
sunLight.position.set(-60, 100, 40);
scene.add(sunLight);
const sun = new THREE.Mesh(
  new THREE.SphereGeometry(7, 32, 16),
  new THREE.MeshBasicMaterial({ color: 0xfff1c3, fog: false }),
);
sun.position.set(-105, 107, -165);
scene.add(sun);

const clouds = new THREE.InstancedMesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshLambertMaterial({
    color: 0xf5f2dc,
    transparent: true,
    opacity: 0.83,
  }),
  65,
);
const dummy = new THREE.Object3D();
for (let i = 0; i < 65; i++) {
  const cluster = Math.floor(i / 5);
  dummy.position.set(
    (hash(cluster, 2) - 0.5) * 310 + (i % 5) * 6,
    77 + hash(cluster, 7) * 20,
    (hash(cluster, 4) - 0.5) * 260,
  );
  dummy.scale.set(
    9 + hash(i, 8) * 12,
    1.5 + hash(i, 3) * 2,
    5 + hash(i, 9) * 10,
  );
  dummy.updateMatrix();
  clouds.setMatrixAt(i, dummy.matrix);
}
scene.add(clouds);
const world = new World();
scene.add(world.group);
const player = new Player(camera, world);
// Resolve foliage at the deterministic spawn without punching a hole in the world.
while (player.collides()) player.position.y += 1;
player.syncCamera();
const menuPosition = new THREE.Vector3(37, 39, 48);
let distance = DEFAULT_VIEW_DISTANCE;
try {
  const settings: unknown = JSON.parse(
    localStorage.getItem("wildmere-settings") ?? "null",
  );
  if (settings && typeof settings === "object") {
    const s = settings as Record<string, unknown>;
    if (typeof s.distance === "number" && Number.isFinite(s.distance)) {
      // Upgrade the old default once without overriding deliberately lower settings.
      distance =
        s.distanceVersion !== 1 && s.distance === 6
          ? DEFAULT_VIEW_DISTANCE
          : THREE.MathUtils.clamp(Math.round(s.distance), 2, MAX_VIEW_DISTANCE);
    }
    if (typeof s.sensitivity === "number" && Number.isFinite(s.sensitivity))
      player.sensitivity = THREE.MathUtils.clamp(s.sensitivity, 0.3, 2.5);
  }
} catch {
  /* Storage may be blocked; in-memory settings still work. */
}
const distanceInput = document.querySelector<HTMLInputElement>("#distance")!;
const sensitivityInput =
  document.querySelector<HTMLInputElement>("#sensitivity")!;
distanceInput.value = String(distance);
sensitivityInput.value = String(player.sensitivity);
function updateSettings() {
  distance = Number(distanceInput.value);
  player.sensitivity = Number(sensitivityInput.value);
  document.querySelector("#distance-value")!.textContent =
    `${distance} chunks / ${distance * CHUNK} blocks`;
  document.querySelector("#sensitivity-value")!.textContent =
    `${player.sensitivity.toFixed(1)}×`;
  scene.fog = new THREE.Fog(
    "#b7cec2",
    distance * CHUNK * 0.85,
    distance * CHUNK + 14,
  );
  world.stream(camera.position.x, camera.position.z, distance);
  try {
    localStorage.setItem(
      "wildmere-settings",
      JSON.stringify({
        distance,
        distanceVersion: 1,
        sensitivity: player.sensitivity,
      }),
    );
  } catch {
    /* Optional persistence. */
  }
}
distanceInput.oninput = sensitivityInput.oninput = updateSettings;
camera.position.copy(menuPosition);
camera.lookAt(-5, 23, -14);
updateSettings();

const raycaster = new THREE.Raycaster();
raycaster.far = 7;
const outline = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.006, 1.006, 1.006)),
  new THREE.LineBasicMaterial({
    color: 0xf2f6ce,
    transparent: true,
    opacity: 0.8,
  }),
);
outline.visible = false;
scene.add(outline);
let target: { break: THREE.Vector3; place: THREE.Vector3 } | undefined;
let started = false,
  ready = false,
  last = performance.now(),
  hudTime = 0,
  lockedAt = 0,
  skipNextLook = false,
  mouseActive = false;
const playButton = document.querySelector<HTMLButtonElement>("#play")!;
playButton.disabled = true;

function pause() {
  if (ui.screen !== "playing") return;
  player.clearInput();
  ui.setScreen("paused");
  outline.visible = false;
  document.exitPointerLock();
}
async function play() {
  if (!ready) return;
  mouseActive = false;
  ui.setScreen("playing");
  player.syncCamera();
  started = true;
  try {
    await canvas.requestPointerLock();
  } catch {
    ui.setScreen("paused");
    ui.toast("Mouse capture was blocked. Click Keep exploring to try again.");
  }
}
playButton.onclick = play;
document.querySelector<HTMLButtonElement>("#resume")!.onclick = play;
document.querySelector<HTMLButtonElement>("#pause-button")!.onclick = pause;
document.querySelector<HTMLButtonElement>("#main-menu")!.onclick = () => {
  document.exitPointerLock();
  player.clearInput();
  ui.setScreen("menu");
  document.body.classList.remove("hide-hud");
};
document.addEventListener("pointerlockchange", () => {
  mouseActive = document.pointerLockElement === canvas;
  if (document.pointerLockElement === canvas) {
    lockedAt = performance.now();
    skipNextLook = true;
  }
  if (document.pointerLockElement !== canvas && ui.screen === "playing")
    pause();
});
document.addEventListener("pointerlockerror", () => {
  pause();
  ui.toast("Mouse capture unavailable. Click Keep exploring to retry.");
});
document.addEventListener("mousemove", (event) => {
  // Some browsers report the cursor recentering as motion when acquiring lock.
  if (
    !mouseActive ||
    document.pointerLockElement !== canvas ||
    ui.screen !== "playing"
  )
    return;
  if (skipNextLook) {
    skipNextLook = false;
    return;
  }
  if (performance.now() - lockedAt > 120)
    player.look(event.movementX, event.movementY);
});
window.addEventListener("blur", pause);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) pause();
});
document.addEventListener("contextmenu", (event) => {
  if (ui.screen === "playing") event.preventDefault();
});

function aim() {
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const hit = raycaster
    .intersectObjects(world.group.children, true)
    .find((hit) => !hit.object.userData.water);
  target = undefined;
  outline.visible = false;
  if (hit?.face) {
    const normal = hit.face.normal;
    const broken = hit.point.clone().addScaledVector(normal, -0.01).floor();
    target = {
      break: broken,
      place: hit.point.clone().addScaledVector(normal, 0.01).floor(),
    };
    outline.position.copy(broken).addScalar(0.5);
    outline.visible = true;
  }
}
function edit(button: number) {
  aim();
  if (!target) return;
  const p = button === 0 ? target.break : target.place;
  if (button === 2 && player.overlaps(p.x, p.y, p.z)) {
    ui.toast("Give yourself a little more room to place that.");
    return;
  }
  if (button !== 0 && button !== 2) return;
  if (
    !world.set(
      p.x,
      p.y,
      p.z,
      button === 0 ? Block.Air : BLOCKS[ui.selected]!.id,
    )
  )
    ui.toast(
      "The bedrock and build ceiling are the limits of this little world.",
    );
}
document.addEventListener("mousedown", (event) => {
  if (ui.screen === "playing" && document.pointerLockElement === canvas)
    edit(event.button);
});
document.addEventListener(
  "wheel",
  (event) => {
    if (ui.screen !== "playing") return;
    event.preventDefault();
    ui.select(ui.selected + Math.sign(event.deltaY));
  },
  { passive: false },
);
document.addEventListener("keydown", (event) => {
  if (document.querySelector("dialog[open]")) return;
  if (event.code === "KeyP" && !event.repeat) {
    void capture();
    return;
  }
  if (ui.screen !== "playing") return;
  if (
    [
      "Space",
      "KeyW",
      "KeyA",
      "KeyS",
      "KeyD",
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "Tab",
      "ControlLeft",
    ].includes(event.code)
  )
    event.preventDefault();
  player.keys.add(event.code);
  if (event.repeat) return;
  if (
    event.code === "KeyF" ||
    (event.code === "Space" && player.pressSpace(event.timeStamp))
  ) {
    if (event.code === "KeyF") player.toggleFlight();
    ui.toast(
      player.flying
        ? "Flight on / Space up, Shift down, Left Ctrl faster"
        : "Flight off / Feet back on the ground",
    );
  }
  if (event.code === "Escape") pause();
  if (event.code === "KeyH") document.body.classList.toggle("hide-hud");
  if (/^Digit[1-8]$/.test(event.code))
    ui.select(Number(event.code.slice(-1)) - 1);
});
document.addEventListener("keyup", (event) => player.keys.delete(event.code));

async function capture() {
  // The photo shortcut exports the render canvas; browser automation captures HTML HUD too.
  renderer.render(scene, camera);
  canvas.toBlob((blob) => {
    if (!blob) {
      ui.toast("Photo capture failed. Try your browser screenshot tool.");
      return;
    }
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = "wildmere-photo.png";
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    ui.toast(
      "Photo downloaded / Canvas only. Use bun run screenshots for menu + HUD.",
    );
  }, "image/png");
}
document.querySelector<HTMLButtonElement>("#photo")!.onclick = capture;
window.addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
ui.setScreen("menu");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
function frame(now: number) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  if (ui.screen === "menu") {
    camera.position.copy(menuPosition);
    camera.lookAt(-5, 23, -14);
  }
  if (ui.screen === "playing") {
    player.update(dt);
    aim();
  }
  world.stream(camera.position.x, camera.position.z, distance);
  world.tick();
  if (!ready && world.ready) {
    ready = true;
    playButton.disabled = false;
    document.querySelector("#loading")!.textContent =
      "Your wilderness is ready. Step inside.";
    document.body.dataset.ready = "true";
  }
  if (ui.screen === "playing" && now - hudTime > 120) {
    hudTime = now;
    document.querySelector("#mode")!.textContent = player.flying
      ? "FLYING"
      : "ON FOOT";
    document.querySelector("#coordinates")!.textContent =
      `${Math.floor(player.position.x)} / ${Math.floor(player.position.y)} / ${Math.floor(player.position.z)}`;
    const b = target
      ? world.get(target.break.x, target.break.y, target.break.z)
      : Block.Air;
    document.querySelector("#target")!.textContent =
      BLOCKS.find((block) => block.id === b)?.name ?? "";
  }
  const underwater =
    ui.screen === "playing" &&
    camera.position.y < SEA + 0.85 &&
    world.get(
      Math.floor(camera.position.x),
      Math.floor(camera.position.y),
      Math.floor(camera.position.z),
    ) === Block.Water;
  if (scene.fog instanceof THREE.Fog) {
    scene.fog.color.set(underwater ? "#448e87" : "#b7cec2");
    scene.fog.near = underwater ? 1 : distance * CHUNK * 0.85;
    scene.fog.far = underwater ? 18 : distance * CHUNK + 14;
  }
  if (ui.screen !== "paused" && !reducedMotion.matches)
    clouds.position.x = Math.sin(now * 0.000015) * 8;
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Read-only instrumentation for smoke tests; no separate screenshot scene or mocked gameplay.
Object.defineProperty(window, "__wildmere", {
  value: {
    blockAt(x: number, y: number, z: number) {
      return world.get(x, y, z);
    },
    get ready() {
      return ready && world.ready;
    },
    get state() {
      return {
        screen: ui.screen,
        started,
        flying: player.flying,
        position: player.position.toArray(),
        yaw: player.yaw,
        pitch: player.pitch,
        selected: ui.selected,
        chunks: world.meshes.size,
        edits: [...world.edits.values()].reduce(
          (n, edits) => n + edits.size,
          0,
        ),
        target: target?.break.toArray(),
        placement: target?.place.toArray(),
        calls: renderer.info.render.calls,
      };
    },
  },
});
