import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Force update stale service workers to fix OAuth issues on mobile PWA
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(registrations => {
    registrations.forEach(reg => {
      reg.update();
    });
  });
}

createRoot(document.getElementById("root")!).render(<App />);
