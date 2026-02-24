import { useState, useEffect, useCallback } from "react";
import { postMessage, onMessage } from "../vscodeApi";

/** Ollama status: availability, configured model name, and whether that model is pulled. */
export interface OllamaStatus {
  available: boolean | null;
  model: string | null;
  modelPulled: boolean | null;
  check: () => void;
}

/**
 * Ollama status driven by extension. On mount calls check() which posts GET_OLLAMA_STATUS;
 * OLLAMA_STATUS updates available, model, and modelPulled. check() can be called again
 * (e.g. "Check again" in IndexFirstCard) to re-request status.
 *
 * @returns available, model, modelPulled, and check function.
 */
export function useOllamaStatus(): OllamaStatus {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [modelPulled, setModelPulled] = useState<boolean | null>(null);

  const check = useCallback(() => {
    setAvailable(null);
    setModel(null);
    setModelPulled(null);
    postMessage({ type: "GET_OLLAMA_STATUS" });
  }, []);

  useEffect(() => {
    check();
    const unsubscribe = onMessage((message) => {
      if (message.type === "OLLAMA_STATUS") {
        setAvailable(message.payload.available);
        setModel(message.payload.model ?? null);
        setModelPulled(message.payload.modelPulled ?? null);
      }
    });
    return unsubscribe;
  }, [check]);

  return { available, model, modelPulled, check };
}
