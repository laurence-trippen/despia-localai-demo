import { useContext, useEffect, useRef, useState } from "react";
import {
  Box,
  Button,
  Card,
  Container,
  Flex,
  IconButton,
  Progress,
  Select,
  Text,
  TextArea,
  TextField,
} from "@radix-ui/themes";
import { PaperPlaneIcon } from "@radix-ui/react-icons";
import { IntelligenceContext } from "./lib/IntelligenceContext";
import { defineTool } from "./lib/intelligence";

// Owns the model picker + download/install UI. It also owns the global download
// callback slots on window.intelligence — keep this responsibility in a single
// component so the slots are not overwritten by another mount.
//
// The selected model id is lifted to ChatApp (it is needed by completion()),
// passed in as `selectedModel` with `onSelect` to change it. Only installed
// models can be used for chat; the rest expose a Download button.
function ModelSelector({
  selectedModel,
  onSelect,
}: {
  selectedModel: string;
  onSelect: (id: string) => void;
}) {
  const ctx = useContext(IntelligenceContext);
  // The model id currently downloading ("" when idle). Keyed by id — not a
  // generic flag — so switching the picker to a different not-installed model
  // does not inherit a stale "downloading"/"done" state from another model.
  const [downloadingId, setDownloadingId] = useState("");
  const [progress, setProgress] = useState(0);
  const lastLoggedDecile = useRef(-1);

  // Ask the native runtime for both the installed list and the full catalog.
  // Results are delivered asynchronously and surfaced through the
  // IntelligenceProvider context (useIntelligence wires the *ModelsLoaded slots).
  useEffect(() => {
    ctx?.getInstalledModels();
    ctx?.getAllModels();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Download lifecycle callbacks. These are single global slots on the bridge,
  // not an event emitter: assign on mount, clear on unmount (return cleanup)
  // so a remount does not leak a stale handler.
  useEffect(() => {
    window.intelligence.onDownloadStart = (modelId) => {
      console.log("[ModelSelector] download start:", modelId);
      lastLoggedDecile.current = -1;
      setDownloadingId(modelId);
      setProgress(0);
    };
    window.intelligence.onDownloadProgress = (modelId, p) => {
      // Native emits a 0–1 fraction, FakeBridge a 0–100 value — normalize
      // to a percentage so the throttled log reads correctly either way.
      const pct = Math.round(p <= 1 ? p * 100 : p);
      const decile = Math.floor(pct / 10);
      if (decile !== lastLoggedDecile.current) {
        lastLoggedDecile.current = decile;
        console.log(
          `[ModelSelector] download progress: ${modelId} ${pct}% (raw ${p})`,
        );
      }
      setProgress(p * 100);
    };
    window.intelligence.onDownloadEnd = (modelId) => {
      console.log("[ModelSelector] download end:", modelId);
      setDownloadingId("");
      // Refresh the installed list so the just-downloaded model flips to "Ready"
      // and becomes selectable for chat.
      ctx?.getInstalledModels();
    };
    window.intelligence.onDownloadError = (modelId, error) => {
      console.error("[ModelSelector] download error:", modelId, error);
      setDownloadingId("");
    };

    return () => {
      window.intelligence.onDownloadStart = undefined;
      window.intelligence.onDownloadProgress = undefined;
      window.intelligence.onDownloadEnd = undefined;
      window.intelligence.onDownloadError = undefined;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const models = ctx?.availableModels ?? [];
  const isInstalled =
    ctx?.installedModels.some((m) => m.id === selectedModel) ?? false;
  const status = isInstalled
    ? "done"
    : downloadingId === selectedModel && selectedModel
      ? "downloading"
      : "idle";

  return (
    <Flex
      align="center"
      gap="2"
      pb="2"
      mb="1"
      style={{ borderBottom: "1px solid var(--gray-4)" }}
    >
      <Select.Root
        value={selectedModel || undefined}
        onValueChange={onSelect}
        size="1"
      >
        <Select.Trigger
          placeholder="Select a model…"
          style={{ flex: 1 }}
        />
        <Select.Content>
          {models.map((m) => {
            const installed =
              ctx?.installedModels.some((im) => im.id === m.id) ?? false;
            return (
              <Select.Item key={m.id} value={m.id}>
                {m.name}
                {installed ? " ●" : ""}
              </Select.Item>
            );
          })}
        </Select.Content>
      </Select.Root>

      {status === "idle" && (
        <Button
          size="1"
          variant="soft"
          disabled={!selectedModel}
          onClick={() =>
            window.intelligence.downloadModel({ model: selectedModel })
          }
        >
          ↓ Download
        </Button>
      )}

      {status === "downloading" && (
        <Flex align="center" gap="2">
          <Progress value={progress} size="1" style={{ width: "80px" }} />
          <Text size="1" color="gray">
            {Math.round(progress)}%
          </Text>
        </Flex>
      )}

      {status === "done" && (
        <Text size="1" style={{ color: "var(--green-11)" }}>
          ● Ready
        </Text>
      )}
    </Flex>
  );
}

export interface Message {
  id: string; // React key only — not sent to completion()
  role: "system" | "user" | "assistant";
  content: string | Block[];
}

const toolStatusConfig = {
  loading: { icon: "⟳", bg: "var(--gray-3)", fg: "var(--gray-11)" },
  ready: { icon: "⟳", bg: "var(--blue-3)", fg: "var(--blue-11)" },
  done: { icon: "✓", bg: "var(--green-3)", fg: "var(--green-11)" },
  failed: { icon: "✗", bg: "var(--red-3)", fg: "var(--red-11)" },
} as const;

function ToolBubble({ block }: { block: ToolBlock }) {
  const { icon, bg, fg } = toolStatusConfig[block.status];
  const label =
    block.status === "loading"
      ? `${block.name}…`
      : block.status === "ready"
        ? `Running ${block.name}…`
        : block.name;

  return (
    <Flex justify="center">
      <Box
        style={{
          backgroundColor: bg,
          borderRadius: "8px",
          padding: "8px 12px",
          maxWidth: "75%",
          minWidth: "160px",
        }}
      >
        <Flex direction="column" gap="1">
          <Text
            size="1"
            weight="bold"
            style={{ color: fg, fontFamily: "monospace" }}
          >
            {icon} {label}
          </Text>

          {block.arguments && block.status !== "loading" && (
            <Text
              size="1"
              style={{ color: "var(--gray-11)", fontFamily: "monospace" }}
            >
              {JSON.stringify(block.arguments)}
            </Text>
          )}

          {block.result !== undefined && (
            <Text
              size="1"
              style={{ color: "var(--gray-10)", fontFamily: "monospace" }}
            >
              → {JSON.stringify(block.result)}
            </Text>
          )}

          {block.error && (
            <Text
              size="1"
              style={{ color: "var(--red-11)", fontFamily: "monospace" }}
            >
              {block.error}
            </Text>
          )}
        </Flex>
      </Box>
    </Flex>
  );
}

function ChatBubble({ message }: { message: Message & { content: string } }) {
  const isUser = message.role === "user";
  return (
    <Flex justify={isUser ? "start" : "end"}>
      <Card
        style={{
          maxWidth: "75%",
          backgroundColor: isUser ? "var(--accent-3)" : "var(--gray-3)",
        }}
      >
        <Text size="2">{message.content}</Text>
      </Card>
    </Flex>
  );
}

// Splits a message with Block[] content into individual renderable elements.
function renderMessage(msg: Message): React.ReactNode[] {
  if (typeof msg.content === "string") {
    return [
      <ChatBubble
        key={msg.id}
        message={msg as Message & { content: string }}
      />,
    ];
  }
  return msg.content
    .map((block, i): React.ReactNode | null => {
      if (block.type === "content" && block.format === "string") {
        const text = block.content as string;
        if (!text) return null;
        return (
          <ChatBubble
            key={`${msg.id}-c${i}`}
            message={{ ...msg, content: text }}
          />
        );
      }
      if (block.type === "tool") {
        return <ToolBubble key={`${msg.id}-${block.id}`} block={block} />;
      }
      return null;
    })
    .filter((el): el is React.ReactNode => el !== null);
}

function ChatApp() {
  const [messages, setMessages] = useState<Message[]>([]);
  // Correlation id sent with completion() and echoed back as the first arg of
  // onMLToken / onMLComplete, so a handler can tell which request a snapshot
  // belongs to. Stable for the lifetime of this chat session.
  const [jobId] = useState(() => crypto.randomUUID());
  const [input, setInput] = useState("");
  const [owmApiKey, setOwmApiKey] = useState("");
  const owmApiKeyRef = useRef("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const ctx = useContext(IntelligenceContext);

  // The user's explicit model choice ("" until they pick one). The effective
  // selection is derived below so we can fall back to a sensible default once
  // the model lists arrive without storing it via a setState-in-effect.
  const [modelChoice, setModelChoice] = useState("");

  // Effective model id sent to native on every completion() call: the explicit
  // choice if any, otherwise an installed model, otherwise the first in the
  // catalog. Derived (not stored) so it tracks the lists automatically.
  const selectedModel =
    modelChoice ||
    ctx?.installedModels[0]?.id ||
    ctx?.availableModels[0]?.id ||
    "";

  // The ref mirrors the effective selection so the onMLComplete closure (which
  // only depends on [jobId]) always reads the latest model instead of a stale
  // capture — same pattern as owmApiKeyRef below.
  const selectedModelRef = useRef("");
  useEffect(() => {
    selectedModelRef.current = selectedModel;
  }, [selectedModel]);

  const isSelectedInstalled =
    ctx?.installedModels.some((m) => m.id === selectedModel) ?? false;

  // Authoritative conversation history sent to native. Parallel to `messages`
  // state which is UI-only (carries extra React `id` fields).
  const conversationRef = useRef<CompletionMessage[]>([]);

  // Keep ref in sync so the tool closure always reads the latest key
  // without needing to re-register on every keystroke.
  useEffect(() => {
    owmApiKeyRef.current = owmApiKey;
  }, [owmApiKey]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Register a tool into window.intelligence.tools — the registry the native
  // runtime reads at completion() time. defineTool attaches the JSON-schema the
  // model sees to the function the app runs when the model calls the tool. The
  // closure reads owmApiKeyRef (not owmApiKey) so the latest key is used
  // without re-registering on every keystroke.
  useEffect(() => {
    console.log("[ChatApp] registering get_weather_by_city");
    window.intelligence.tools.get_weather_by_city = defineTool(
      async (args: { location: string }) => {
        console.log("[Tool] get_weather_by_city called, args:", args);
        try {
          const params = new URLSearchParams();
          params.append("q", args.location);
          params.append("appId", owmApiKeyRef.current);

          const res = await fetch(
            `https://api.openweathermap.org/data/2.5/weather?${params}`,
          );

          const data = await res.json();
          console.log("[Tool] weather response:", data);
          return data["weather"][0] ?? "N/A";
        } catch (e) {
          console.error("[Tool] fetch error:", e);
          return "N/A";
        }
      },
      {
        description: "Get weather for a city.",
        parameters: {
          type: "object",
          properties: {
            location: { type: "string", description: "city" },
          },
          required: ["location"],
        },
      },
    );
    console.log(
      "[ChatApp] tools after register:",
      Object.keys(window.intelligence.tools),
    );
  }, []);

  // Inference callbacks. Native streams the FULL Block[] snapshot on every
  // token (not deltas), so each update replaces the last assistant bubble
  // rather than appending. onMLComplete then drives the tool round-trip below.
  useEffect(() => {
    window.intelligence.onMLToken = (_jobId, snapshot) => {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return [...prev.slice(0, -1), { ...last, content: snapshot }];
        }
        return [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant" as const,
            content: snapshot,
          },
        ];
      });
    };

    // Turn complete. The tool round-trip works like this:
    //   1. Native emits ToolBlock(s) with status "ready" (parsed call + args).
    //   2. We execute each registered tool and set status "done"/"failed".
    //   3. We append the assistant turn plus one { role: "tool" } message per
    //      result to the conversation, then call completion() again so the
    //      model can produce its final answer from the tool output.
    // A turn with no pending tools is final and just gets recorded.
    window.intelligence.onMLComplete = async (_jobId, finalSnapshot) => {
      console.log(
        "[ChatApp] onMLComplete snapshot:",
        JSON.stringify(finalSnapshot),
      );
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return [...prev.slice(0, -1), { ...last, content: finalSnapshot }];
        }
        return [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant" as const,
            content: finalSnapshot,
          },
        ];
      });

      const pendingTools = finalSnapshot.filter(
        (b): b is ToolBlock => b.type === "tool" && b.status === "ready",
      );

      console.log(
        "[ChatApp] pendingTools:",
        pendingTools.length,
        pendingTools.map((t) => t.name),
      );
      console.log(
        "[ChatApp] registered tools:",
        Object.keys(window.intelligence.tools),
      );

      if (pendingTools.length === 0) {
        // Skip empty/degenerate turns: a single bad generation appended here
        // would poison every subsequent request's context.
        const hasMeaningfulContent = finalSnapshot.some(
          (b) =>
            b.type === "tool" ||
            (b.type === "content" &&
              typeof b.content === "string" &&
              b.content.trim() !== ""),
        );
        if (hasMeaningfulContent) {
          conversationRef.current = [
            ...conversationRef.current,
            { role: "assistant", content: finalSnapshot },
          ];
        }
        return;
      }

      // Execute all pending tools in parallel.
      await Promise.all(
        pendingTools.map(async (tool) => {
          console.log(
            "[ChatApp] dispatching:",
            tool.name,
            "args:",
            tool.arguments,
          );
          try {
            const fn = window.intelligence.tools[tool.name];
            if (!fn) throw new Error(`Tool not registered: ${tool.name}`);
            tool.result = await fn(tool.arguments ?? {});
            tool.status = "done";
            console.log(
              "[ChatApp] tool done:",
              tool.name,
              "result:",
              tool.result,
            );
          } catch (e) {
            tool.error = (e as Error).message;
            tool.status = "failed";
            console.error("[ChatApp] tool failed:", tool.name, e);
          }
        }),
      );

      // Re-render all bubbles with done/failed status (snapshot mutated in place above).
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return [
            ...prev.slice(0, -1),
            { ...last, content: [...finalSnapshot] },
          ];
        }
        return prev;
      });

      conversationRef.current = [
        ...conversationRef.current,
        { role: "assistant", content: finalSnapshot },
        ...pendingTools.map((tool) => ({
          role: "tool" as const,
          content: JSON.stringify({
            name: tool.name,
            content: tool.error ? { error: tool.error } : tool.result,
          }),
        })),
      ];

      // Continue the same logical turn with tool results in context. A fresh
      // id per round keeps native treating it as a new job while the messages
      // array carries the full accumulated history.
      window.intelligence.completion({
        id: jobId + "_" + Date.now(),
        messages: conversationRef.current,
        stream: true,
        model: selectedModelRef.current,
        temperature: 0,
      });
    };

    return () => {
      window.intelligence.onMLToken = undefined;
      window.intelligence.onMLComplete = undefined;
    };
  }, [jobId]);

  const sendMessage = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    // Guard: never call completion() with a model that is not installed.
    if (!isSelectedInstalled) return;

    const userMsg: CompletionMessage = { role: "user", content: trimmed };

    // Prepend system prompt on the very first message.
    if (conversationRef.current.length === 0) {
      conversationRef.current = [
        {
          role: "system",
          content:
            "You are a helpful assistant. Answer general knowledge questions directly " +
            "from your own knowledge. Only call tools for real-time data you cannot know " +
            "yourself, such as current weather.",
        },
      ];
    }

    conversationRef.current = [...conversationRef.current, userMsg];

    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", content: trimmed },
    ]);

    // Entry point of a turn. tools is omitted, so every tool registered in
    // window.intelligence.tools is exposed to the model. Streamed output
    // arrives via onMLToken; the turn ends in onMLComplete.
    window.intelligence.completion({
      id: jobId,
      messages: conversationRef.current,
      stream: true,
      model: selectedModelRef.current,
      temperature: 0,
    });

    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <Container
      size="2"
      style={{
        height: "100dvh",
        display: "flex",
        flexDirection: "column",
        padding: "16px",
      }}
    >
      <ModelSelector
        selectedModel={selectedModel}
        onSelect={setModelChoice}
      />

      {/* API Key input */}
      <Box
        mb="2"
        style={{
          border: "1px solid var(--gray-5)",
          borderRadius: "8px",
          padding: "10px 12px",
        }}
      >
        <Flex align="center" gap="2" mb="2">
          <Box
            style={{
              backgroundColor: "var(--blue-4)",
              borderRadius: "4px",
              padding: "2px 6px",
            }}
          >
            <Text size="1" weight="bold" style={{ color: "var(--blue-11)" }}>
              🔧 Tool
            </Text>
          </Box>
          <Text size="2" weight="medium" style={{ color: "var(--gray-12)" }}>
            OpenWeatherMap Weather
          </Text>
        </Flex>
        <TextField.Root
          size="2"
          type="password"
          placeholder="Enter API key…"
          value={owmApiKey}
          onChange={(e) => setOwmApiKey(e.target.value)}
          style={{ width: "100%", fontSize: "16px" }}
        />
        <Text size="1" mt="1" style={{ color: "var(--gray-10)", display: "block" }}>
          Required for live weather queries
        </Text>
      </Box>

      {/* Message list */}
      <Box style={{ flex: 1, overflowY: "auto", paddingBottom: "8px" }}>
        <Flex direction="column" gap="3">
          {messages.flatMap((msg) => renderMessage(msg))}
          <div ref={bottomRef} />
        </Flex>
      </Box>

      {/* Input row */}
      <Flex
        gap="2"
        align="end"
        pt="3"
        style={{
          borderTop: "1px solid var(--gray-4)",
          paddingBottom: "env(safe-area-inset-bottom, 12px)",
        }}
      >
        <TextArea
          style={{ flex: 1, resize: "none", fontSize: "16px" }}
          placeholder="Type a message…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
        />
        <IconButton
          size="4"
          variant="solid"
          disabled={!input.trim() || !isSelectedInstalled}
          onClick={sendMessage}
        >
          <PaperPlaneIcon />
        </IconButton>
      </Flex>
    </Container>
  );
}

export default ChatApp;
