import { useContext, useEffect, useRef, useState } from "react";
import {
  Badge,
  Box,
  Card,
  Container,
  Flex,
  IconButton,
  Text,
  TextArea,
} from "@radix-ui/themes";
import { PaperPlaneIcon } from "@radix-ui/react-icons";
import { IntelligenceContext } from "./lib/IntelligenceContext";

export interface Message {
  id: string; // React key only — not sent to completion()
  role: "system" | "user" | "assistant";
  content: string | Block[];
}

function ToolPill({ block }: { block: ToolBlock }) {
  const icon =
    block.status === "done"
      ? "✓"
      : block.status === "failed"
        ? "✗"
        : "⟳";

  const label =
    block.status === "failed"
      ? `${block.name}: ${block.error ?? "error"}`
      : block.status === "ready"
        ? `Führt ${block.name} aus…`
        : block.status === "loading"
          ? `${block.name}…`
          : block.name;

  const color =
    block.status === "done"
      ? "green"
      : block.status === "failed"
        ? "red"
        : "gray";

  return (
    <Badge color={color} size="1">
      {icon} {label}
    </Badge>
  );
}

function ChatBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";

  const renderContent = () => {
    if (typeof message.content === "string") {
      return <Text size="2">{message.content}</Text>;
    }
    return (
      <Flex direction="column" gap="1">
        {message.content.map((block, i) => {
          if (block.type === "content" && block.format === "string") {
            return (
              <Text key={i} size="2">
                {block.content as string}
              </Text>
            );
          }
          if (block.type === "tool") {
            return <ToolPill key={block.id} block={block} />;
          }
          return null;
        })}
      </Flex>
    );
  };

  return (
    <Flex justify={isUser ? "start" : "end"}>
      <Card
        style={{
          maxWidth: "75%",
          backgroundColor: isUser ? "var(--accent-3)" : "var(--gray-3)",
        }}
      >
        {renderContent()}
      </Card>
    </Flex>
  );
}

function ChatApp() {
  useContext(IntelligenceContext);

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
    window.intelligence.onMLToken = (_jobId, snapshot) => {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return [...prev.slice(0, -1), { ...last, content: snapshot }];
        }
        return [
          ...prev,
          { id: crypto.randomUUID(), role: "assistant" as const, content: snapshot },
        ];
      });
    };

    window.intelligence.onMLComplete = async (_jobId, finalSnapshot) => {
      // Update UI with final snapshot for this turn.
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return [...prev.slice(0, -1), { ...last, content: finalSnapshot }];
        }
        return [
          ...prev,
          { id: crypto.randomUUID(), role: "assistant" as const, content: finalSnapshot },
        ];
      });

      const pendingTool = finalSnapshot.find(
        (b): b is ToolBlock => b.type === "tool" && b.status === "ready",
      );

      if (!pendingTool) {
        // No tool to run — turn is done, commit to history.
        conversationRef.current = [
          ...conversationRef.current,
          { role: "assistant", content: finalSnapshot },
        ];
        return;
      }

      // Execute the registered tool.
      let result: unknown;
      let error: string | undefined;
      try {
        const fn = window.intelligence.tools[pendingTool.name];
        if (!fn) throw new Error(`Tool not registered: ${pendingTool.name}`);
        result = await fn(pendingTool.arguments ?? {});
        pendingTool.status = "done";
        (pendingTool as ToolBlock).result = result;
      } catch (e) {
        error = (e as Error).message;
        pendingTool.status = "failed";
        (pendingTool as ToolBlock).error = error;
      }

      // Re-render pill with done/failed status (snapshot mutated in place above).
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return [...prev.slice(0, -1), { ...last, content: [...finalSnapshot] }];
        }
        return prev;
      });

      // Commit assistant turn + tool result to history, then continue.
      conversationRef.current = [
        ...conversationRef.current,
        { role: "assistant", content: finalSnapshot },
        {
          role: "tool",
          tool_call_id: pendingTool.id,
          content: JSON.stringify(error ? { error } : result),
        },
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

    // Add to authoritative history first so completion() sees it.
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
      {/* Message list */}
      <Box style={{ flex: 1, overflowY: "auto", paddingBottom: "8px" }}>
        <Flex direction="column" gap="3">
          {messages.map((msg) => (
            <ChatBubble key={msg.id} message={msg} />
          ))}
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
