import "@fontsource/pixelify-sans/400.css";
import "@fontsource/pixelify-sans/600.css";
import "@fontsource/pixelify-sans/700.css";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/700.css";
import "./style.css";
import { App } from "./app/app";
import { seedFromString } from "./world/worldgen";

const canvas = document.getElementById("game-canvas");
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error("Cubewild: #game-canvas not found");
}

const params = new URLSearchParams(window.location.search);
const shotParam = params.get("shot");
const initialShot = shotParam === "game" ? "game" : shotParam === "menu" ? "menu" : null;
const seedParam = params.get("seed");

new App({
  canvas,
  initialShot,
  initialSeed: seedParam === null ? undefined : seedFromString(seedParam),
});
