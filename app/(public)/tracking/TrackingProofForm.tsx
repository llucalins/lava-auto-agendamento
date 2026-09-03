"use client";

import { useState } from "react";

export default function TrackingProofForm() {
  const [credential, setCredential] = useState("");
  const [state, setState] = useState<"idle" | "submitting" | "established" | "failed">("idle");

  async function prove(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "submitting") return;
    setState("submitting");
    try {
      const response = await fetch("/api/public/tracking/proof", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ credential }),
      });
      setCredential("");
      setState(response.ok ? "established" : "failed");
    } catch {
      setCredential("");
      setState("failed");
    }
  }

  return <form onSubmit={(event) => void prove(event)} autoComplete="off"><label htmlFor="tracking-credential">Código de acompanhamento</label><input id="tracking-credential" name="trackingCredential" type="password" value={credential} onChange={(event) => setCredential(event.target.value)} required minLength={1} maxLength={128} autoCapitalize="none" autoCorrect="off" spellCheck={false} /><button className="primary" type="submit" disabled={state === "submitting"}>{state === "submitting" ? "Verificando…" : "Acompanhar"}</button>{state === "established" && <><p role="status">Acesso de acompanhamento confirmado.</p><a href="/tracking/status">Ver status</a></>}{state === "failed" && <p role="alert">Não foi possível validar o código de acompanhamento.</p>}</form>;
}
