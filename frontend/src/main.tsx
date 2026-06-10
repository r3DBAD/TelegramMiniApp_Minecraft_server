import React from "react";
import ReactDOM from "react-dom/client";
import { MantineProvider, createTheme } from "@mantine/core";

import App from "./App";
import "@mantine/core/styles.css";
import "./styles.css";

window.Telegram?.WebApp?.ready();
window.Telegram?.WebApp?.expand();
window.Telegram?.WebApp?.enableClosingConfirmation?.();

const theme = createTheme({
  fontFamily: "Manrope, Inter, Aptos, Segoe UI, system-ui, sans-serif",
  primaryColor: "green",
  defaultRadius: "md",
  colors: {
    green: [
      "#e6fff3",
      "#c5ffe1",
      "#8affc2",
      "#4dffa3",
      "#00ff85",
      "#00d96f",
      "#00ad5a",
      "#008447",
      "#005c33",
      "#00391f"
    ],
    violet: [
      "#f0edff",
      "#ded8ff",
      "#b9adff",
      "#9684ff",
      "#7a5cff",
      "#6548e6",
      "#5037b8",
      "#3d298b",
      "#291c60",
      "#171037"
    ]
  }
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <App />
    </MantineProvider>
  </React.StrictMode>
);
