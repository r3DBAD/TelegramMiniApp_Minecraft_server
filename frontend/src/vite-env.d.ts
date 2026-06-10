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
      HapticFeedback?: {
        impactOccurred: (style: "light" | "medium" | "heavy" | "rigid" | "soft") => void;
        notificationOccurred: (type: "error" | "success" | "warning") => void;
        selectionChanged: () => void;
      };
    };
  };
}

interface ImportMetaEnv {
  readonly VITE_MINECRAFT_SERVER_ADDRESS?: string;
  readonly VITE_MINECRAFT_VERSION?: string;
}
