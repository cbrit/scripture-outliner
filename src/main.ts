import { registerSW } from "virtual:pwa-register";
import "./styles.css";

registerSW({ immediate: true });

const app = document.querySelector("#app");
if (app) {
  app.innerHTML = `
    <div class="shell">
      <header class="header">
        <div class="brand">
          <h1>Scripture Outliner</h1>
        </div>
      </header>
      <main class="main">
        <section class="empty">
          <h2>Installable PWA shell</h2>
          <p>Vite + TypeScript + offline-capable service worker. Import and outlining come next.</p>
        </section>
      </main>
    </div>
  `;
}
