type ImpactStyle = "light" | "medium" | "heavy" | "rigid" | "soft";
type NotificationType = "error" | "success" | "warning";

export function hapticImpact(style: ImpactStyle = "light") {
  window.Telegram?.WebApp?.HapticFeedback?.impactOccurred(style);
}

export function hapticNotify(type: NotificationType) {
  window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred(type);
}
