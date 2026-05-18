import { useContext, useEffect, useRef, useState } from "react";
import {
  Box,
  Button,
  Card,
  Container,
  Flex,
  IconButton,
  Progress,
  Text,
  TextArea,
} from "@radix-ui/themes";
import { PaperPlaneIcon } from "@radix-ui/react-icons";
import { IntelligenceContext } from "./lib/IntelligenceContext";
import { defineTool } from "./lib/intelligence";

const MODEL_ID = "lfm2_vl_450m";

function ModelDownloadBar() {
  const ctx = useContext(IntelligenceContext);
  const [downloadStatus, setDownloadStatus] = useState<
    "idle" | "downloading" | "done"
  >("idle");
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    ctx?.getInstalledModels();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    window.intelligence.onDownloadStart = () => {
      setDownloadStatus("downloading");
      setProgress(0);
    };
    window.intelligence.onDownloadProgress = (_id, p) => setProgress(p);
    window.intelligence.onDownloadEnd = () => setDownloadStatus("done");
    window.intelligence.onDownloadError = () => setDownloadStatus("idle");

    return () => {
      window.intelligence.onDownloadStart = undefined;
      window.intelligence.onDownloadProgress = undefined;
      window.intelligence.onDownloadEnd = undefined;
      window.intelligence.onDownloadError = undefined;
    };
  }, []);

  const isInstalled =
    ctx?.installedModels.some((m) => m.id === MODEL_ID) ?? false;
  const status = isInstalled ? "done" : downloadStatus;

  return (
    <Flex
      align="center"
      gap="2"
      pb="2"
      mb="1"
      style={{ borderBottom: "1px solid var(--gray-4)" }}
    >
      <Text size="1" weight="medium" style={{ flex: 1, color: "var(--gray-11)" }}>
        LFM2-VL-450M
      </Text>

      {status === "idle" && (
        <Button
          size="1"
          variant="soft"
          onClick={() => window.intelligence.downloadModel({ model: MODEL_ID })}
        >
          ↓ Download
        </Button>
      )}

      {status === "downloading" && (
        <Flex align="center" gap="2">
          <Progress value={progress} size="1" style={{ width: "80px" }} />
          <Text size="1" color="gray">
            {progress}%
          </Text>
        </Flex>
      )}

      {status === "done" && (
        <Text size="1" style={{ color: "var(--green-11)" }}>
          ● Bereit
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
        ? `Führt ${block.name} aus…`
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
  const [jobId] = useState(() => crypto.randomUUID());
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  // Authoritative conversation history sent to native. Parallel to `messages`
  // state which is UI-only (carries extra React `id` fields).
  const conversationRef = useRef<CompletionMessage[]>([]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    window.intelligence.tools.get_weather_by_city = defineTool(
      async (args: { location: string }) => {
        try {
          const params = new URLSearchParams();
          params.append("q", args.location);
          params.append("appId", prompt("Enter OpenWeatherMap API Key") ?? "");

          const res = await fetch(
            `https://api.openweathermap.org/data/2.5/weather?${params}`,
          );

          const data = await res.json();
          return data["weather"][0] ?? "N/A";
        } catch {
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

    window.intelligence.onMLComplete = async (_jobId, finalSnapshot) => {
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

      if (pendingTools.length === 0) {
        conversationRef.current = [
          ...conversationRef.current,
          { role: "assistant", content: finalSnapshot },
        ];
        return;
      }

      // Execute all pending tools in parallel.
      await Promise.all(
        pendingTools.map(async (tool) => {
          try {
            const fn = window.intelligence.tools[tool.name];
            if (!fn) throw new Error(`Tool not registered: ${tool.name}`);
            tool.result = await fn(tool.arguments ?? {});
            tool.status = "done";
          } catch (e) {
            tool.error = (e as Error).message;
            tool.status = "failed";
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
          tool_call_id: tool.id,
          content: JSON.stringify(tool.error ? { error: tool.error } : tool.result),
        })),
      ];

      window.intelligence.completion({
        id: jobId + "_" + Date.now(),
        messages: conversationRef.current,
        stream: true,
        model: "qwen3_0_6b",
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

    const userMsg: CompletionMessage = { role: "user", content: trimmed };
    conversationRef.current = [...conversationRef.current, userMsg];

    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", content: trimmed },
    ]);

    window.intelligence.completion({
      id: jobId,
      messages: conversationRef.current,
      stream: true,
      model: "qwen3_0_6b",
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
      <ModelDownloadBar />

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
        style={{ borderTop: "1px solid var(--gray-4)" }}
      >
        <TextArea
          style={{ flex: 1, resize: "none", fontSize: "16px" }}
          placeholder="Nachricht eingeben…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
        />
        <IconButton
          size="3"
          variant="solid"
          disabled={!input.trim()}
          onClick={sendMessage}
        >
          <PaperPlaneIcon />
        </IconButton>
      </Flex>
    </Container>
  );
}

export default ChatApp;
