const FAKE_AVAILABLE_MODELS: Model[] = [
  { id: "llama-3.2-1b", name: "Llama 3.2 1B", category: "language" },
  { id: "llama-3.2-3b", name: "Llama 3.2 3B", category: "language" },
  { id: "mistral-7b", name: "Mistral 7B", category: "language" },
  { id: "phi-3-mini", name: "Phi-3 Mini", category: "language" },
];

const FAKE_INSTALLED_MODELS: Model[] = [
  { id: "llama-3.2-1b", name: "Llama 3.2 1B", category: "language" },
];

function streamTokens(
  jobId: string,
  tokens: string[],
  onDone: (final: Block[]) => void,
) {
  let accumulated = "";
  let i = 0;
  const iv = setInterval(() => {
    if (i >= tokens.length) {
      clearInterval(iv);
      onDone([{ type: "content", format: "string", content: accumulated }]);
      return;
    }
    accumulated += tokens[i++];
    window.intelligence.onMLToken?.(jobId, [
      { type: "content", format: "string", content: accumulated },
    ]);
  }, 120);
}

function simulateToolCall(
  jobId: string,
  toolName: string,
  args: Record<string, unknown>,
) {
  // Phase 1: stream intro text up to tool invocation.
  const introTokens = ["Let", " me", " check", " the", " weather", "."];
  let accumulated = "";
  let i = 0;

  const introInterval = setInterval(() => {
    if (i >= introTokens.length) {
      clearInterval(introInterval);

      // Phase 2: add tool block with status 'loading'.
      window.intelligence.onMLToken?.(jobId, [
        { type: "content", format: "string", content: accumulated },
        { type: "tool", id: "call_0", name: toolName, status: "loading" },
      ]);

      // Phase 3: after short delay, emit 'ready' with parsed args.
      setTimeout(() => {
        const finalSnapshot: Block[] = [
          { type: "content", format: "string", content: accumulated },
          {
            type: "tool",
            id: "call_0",
            name: toolName,
            status: "ready",
            arguments: args,
          },
        ];
        window.intelligence.onMLComplete?.(jobId, finalSnapshot);
      }, 300);

      return;
    }
    accumulated += introTokens[i++];
    window.intelligence.onMLToken?.(jobId, [
      { type: "content", format: "string", content: accumulated },
    ]);
  }, 120);
}

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

      const lastMsg = payload.messages[payload.messages.length - 1];
      const isToolFollowUp = lastMsg?.role === "tool";

      if (isToolFollowUp) {
        // Model sees tool result, produces final answer.
        const toolResult = JSON.parse((lastMsg as { content: string }).content);
        const city = toolResult?.city ?? "Dubai";
        const temp = toolResult?.temp ?? "32°C";
        const tokens = [`It's`, ` ${temp}`, ` in`, ` ${city}.`];
        streamTokens(payload.id, tokens, (finalSnapshot) => {
          window.intelligence.onMLComplete?.(payload.id, finalSnapshot);
        });
        return;
      }

      // Check if any registered weather tool should be triggered.
      const userMsg = [...payload.messages]
        .reverse()
        .find((m) => m.role === "user");
      const userContent =
        typeof userMsg?.content === "string" ? userMsg.content : "";
      const weatherToolName = Object.keys(window.intelligence.tools).find(
        (name) => /weather/i.test(name),
      );

      if (weatherToolName && /weather/i.test(userContent)) {
        simulateToolCall(payload.id, weatherToolName, { city: "Dubai" });
        return;
      }

      // Default: stream plain text response.
      const fakeTokens = ["Hello", " from", " the", " FakeBridge", "."];
      streamTokens(payload.id, fakeTokens, (finalSnapshot) => {
        window.intelligence.onMLComplete?.(payload.id, finalSnapshot);
      });
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

    cancel(payload) {
      console.log("[FakeBridge] cancel called", payload);
    },
  };
}
