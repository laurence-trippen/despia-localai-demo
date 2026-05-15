const FAKE_AVAILABLE_MODELS: Model[] = [
  { id: "llama-3.2-1b", name: "Llama 3.2 1B", category: "language" },
  { id: "llama-3.2-3b", name: "Llama 3.2 3B", category: "language" },
  { id: "mistral-7b", name: "Mistral 7B", category: "language" },
  { id: "phi-3-mini", name: "Phi-3 Mini", category: "language" },
];

const FAKE_INSTALLED_MODELS: Model[] = [
  { id: "llama-3.2-1b", name: "Llama 3.2 1B", category: "language" },
];

export function installFakeBridge() {
  if (window.intelligence) {
    console.warn("[FakeBridge] window.intelligence already exists, skipping.");
    return;
  }

  console.info("[FakeBridge] Installing fake window.intelligence bridge.");

  window.intelligence = {
    tools: {},

    completion(payload) {
      console.log("[FakeBridge] completion called", payload);

      setTimeout(() => {
        window.intelligence.onMLToken?.(payload.id);
        window.intelligence.onMLComplete?.(payload.id);
      }, 500);
    },

    listModels(payload) {
      console.log("[FakeBridge] listModels called", payload);

      setTimeout(() => {
        if (payload.query === "installed") {
          window.intelligence.onInstalledModelsLoaded?.(FAKE_INSTALLED_MODELS);
        } else {
          window.intelligence.onAvailableModelsLoaded?.(FAKE_AVAILABLE_MODELS);
        }
      }, 200);
    },

    downloadModel(payload) {
      console.log("[FakeBridge] downloadModel called", payload);

      window.intelligence.onDownloadStart?.(payload.model);

      let progress = 0;
      const interval = setInterval(() => {
        progress += 25;
        window.intelligence.onDownloadProgress?.(payload.model, progress);

        if (progress >= 100) {
          clearInterval(interval);
          window.intelligence.onDownloadEnd?.(payload.model);
        }
      }, 300);
    },

    removeModel(payload) {
      console.log("[FakeBridge] removeModel called", payload);

      setTimeout(() => {
        if (payload.model === "all") {
          window.intelligence.onRemoveAllSuccess?.();
        } else {
          window.intelligence.onRemoveSuccess?.(payload.model);
        }
      }, 200);
    },

    cancel() {
      console.log("[FakeBridge] cancel called");
    },
  };
}
