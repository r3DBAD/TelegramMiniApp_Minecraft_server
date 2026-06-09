import { Link } from "lucide-react";
import { useState } from "react";

import { api } from "../lib/api";

export function AccessRequestForm() {
  const [minecraftUsername, setMinecraftUsername] = useState("");
  const [message, setMessage] = useState("");

  async function submit() {
    if (!minecraftUsername.trim()) return;

    await api("/auth/access-request", {
      method: "POST",
      body: JSON.stringify({ minecraft_username: minecraftUsername.trim() })
    });
    setMessage("Ник отправлен владельцу на подтверждение.");
  }

  return (
    <div className="access-form">
      <label className="field-label">
        Minecraft ник
        <input
          name="minecraftUsername"
          value={minecraftUsername}
          placeholder="Например, r3dbad…"
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setMinecraftUsername(event.target.value)}
        />
      </label>
      <button onClick={submit}>
        <Link size={16} /> Отправить ник
      </button>
      {message && <p aria-live="polite">{message}</p>}
    </div>
  );
}
