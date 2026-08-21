import "./style.css";
import { Game } from "./game/game";

const app = document.getElementById("app")!;
app.innerHTML = `<div id="game-root" style="position:absolute; inset:0;"></div>`;

const root = document.getElementById("game-root")!;
const game = new Game(root);

// expose for debugging / screenshot script
// @ts-ignore
window.__VOX_GAME__ = game;

console.log("Vox Crest booted • seed", (game as any).seed);
