import { useState, useEffect, useCallback } from "react";
import { postMessage, onMessage } from "../vscodeApi";

export interface OllamaStatus {
  available: boolean | null;
  model: string | null;
  modelPulled: boolean | null;
  check: () => void;
}

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
