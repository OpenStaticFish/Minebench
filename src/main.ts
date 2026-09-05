import "@fontsource/press-start-2p";
import "./ui/style.css";
import { Game } from "./game/Game";

const app = document.getElementById("app")!;
let game: Game | null = null;

function boot(): void {
  game = new Game(app);
  // Automation/test hook used by scripts/screenshots.ts.
  (window as unknown as Record<string, unknown>).__blockvale = game.debug;
}

// WebGL support check with a friendly fallback.
try {
  const test = document.createElement("canvas");
  const gl = test.getContext("webgl2") ?? test.getContext("webgl");
  if (!gl) throw new Error("no webgl");
  boot();
} catch (err) {
  app.innerHTML =
    `<div class="webgl-error"><h1>Blockvale</h1>` +
    `<p>WebGL is not available in this browser, so the game cannot start.</p>` +
    `<p class="mono">${String(err)}</p></div>`;
}

// Dev convenience: hot-reload destroys and recreates the game cleanly.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    game?.dispose();
    game = null;
    app.innerHTML = "";
  });
  import.meta.hot.accept(() => {
    game?.dispose();
    game = null;
    app.innerHTML = "";
    boot();
  });
}
