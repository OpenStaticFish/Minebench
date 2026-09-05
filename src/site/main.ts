import "@fontsource/press-start-2p/latin-400.css";
import "./style.css";

// Footer year (keeps the legal line current without a build-time token).
const year = document.getElementById("year");
if (year) year.textContent = String(new Date().getFullYear());
