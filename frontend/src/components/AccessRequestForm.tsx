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
      <input
        value={minecraftUsername}
        placeholder="Minecraft ник"
        onChange={(event) => setMinecraftUsername(event.target.value)}
      />
      <button onClick={submit}>
        <Link size={16} /> Отправить ник
      </button>
      {message && <p>{message}</p>}
    </div>
  );
}
