import { useContext, useEffect, useRef, useState } from "react";
import {
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

function ChatBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const text = typeof message.content === "string"
    ? message.content
    : (message.content as Block[])
        .filter((b): b is ContentBlock => b.type === "content" && b.format === "string")
        .map((b) => b.content as string)
        .join("");

  return (
    <Flex justify={isUser ? "start" : "end"}>
      <Card
        style={{
          maxWidth: "75%",
          backgroundColor: isUser ? "var(--accent-3)" : "var(--gray-3)",
        }}
      >
        <Text size="2">{text}</Text>
      </Card>
    </Flex>
  );
}

function ChatApp() {
  useContext(IntelligenceContext);

  const [messages, setMessages] = useState<Message[]>([
    // {
    //   id: crypto.randomUUID(),
    //   role: "user",
    //   content: "What is the weather in Paris?",
    // },
    // {
    //   id: crypto.randomUUID(),
    //   role: "system",
    //   content:
    //     "The weather in Paris is currently snowy with temperatures around 2°C.",
    // },
  ]);

  const [jobId] = useState(() => crypto.randomUUID());

  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    window.intelligence.onMLToken = (_jobId, snapshot) => {
      const textBlock = snapshot.find(
        (b): b is ContentBlock => b.type === "content" && b.format === "string",
      );
      if (!textBlock) return;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return [...prev.slice(0, -1), { ...last, content: textBlock.content as string }];
        }
        return [...prev, { id: crypto.randomUUID(), role: "assistant", content: textBlock.content as string }];
      });
    };

    window.intelligence.onMLComplete = (_jobId, snapshot) => {
      const textBlock = snapshot.find(
        (b): b is ContentBlock => b.type === "content" && b.format === "string",
      );
      if (!textBlock) return;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return [...prev.slice(0, -1), { ...last, content: textBlock.content as string }];
        }
        return [...prev, { id: crypto.randomUUID(), role: "assistant", content: textBlock.content as string }];
      });
    };

    return () => {
      window.intelligence.onMLToken = undefined;
      window.intelligence.onMLComplete = undefined;
    };
  }, []);

  const sendMessage = () => {
    const trimmed = input.trim();
    if (!trimmed) return;

    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", content: trimmed },
    ]);

    // Strip the local React `id` before sending to native
    window.intelligence.completion({
      id: jobId,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      messages: messages.map(({ id: _id, ...rest }) => rest as CompletionMessage),
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
          style={{ flex: 1, resize: "none" }}
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
