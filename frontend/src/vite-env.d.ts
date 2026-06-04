/// <reference types="vite/client" />

interface Window {
  Telegram?: {
    WebApp?: {
      initData: string;
      ready: () => void;
      expand: () => void;
      close: () => void;
      enableClosingConfirmation?: () => void;
      colorScheme?: "light" | "dark";
    };
  };
}
