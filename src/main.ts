import { registerSW } from "virtual:pwa-register";
import { mount } from "./app";
import "./styles.css";

registerSW({ immediate: true });

const app = document.querySelector("#app");
if (!(app instanceof HTMLElement)) {
  throw new Error("Missing #app");
}

mount(app);
