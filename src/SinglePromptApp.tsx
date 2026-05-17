import { useContext, useEffect, useRef, useState } from "react";
import { defineTool } from "./lib/intelligence";
import {
  Badge,
  Box,
  Button,
  Callout,
  Container,
  Flex,
  Heading,
  Progress,
  Select,
  Spinner,
  Text,
  TextArea,
} from "@radix-ui/themes";
import { IntelligenceContext } from "./lib/IntelligenceContext";

function SinglePromptApp() {
  const { availableModels, installedModels, getAllModels, getInstalledModels } =
    useContext(IntelligenceContext)!;

  const [selectedModelId, setSelectedModelId] = useState("");
  const [promptText, setPromptText] = useState("");
  const [response, setResponse] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const jobIdRef = useRef("");

  useEffect(() => {
    getAllModels();

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
      const textBlock = snapshot.find(
        (b): b is ContentBlock => b.type === "content" && b.format === "string",
      );
      if (textBlock) setResponse(textBlock.content as string);
    };

    window.intelligence.onMLComplete = (_jobId, snapshot) => {
      const textBlock = snapshot.find(
        (b): b is ContentBlock => b.type === "content" && b.format === "string",
      );
      if (textBlock) setResponse(textBlock.content as string);
      setIsStreaming(false);
    };

    window.intelligence.onMLError = (err) => {
      setError(err.errorMessage);
      setIsStreaming(false);
    };

    window.intelligence.onDownloadStart = () => {
      setIsDownloading(true);
      setDownloadProgress(0);
      setError(null);
    };

    window.intelligence.onDownloadProgress = (_modelId, progress) => {
      setDownloadProgress(progress);
    };

    window.intelligence.onDownloadEnd = () => {
      setIsDownloading(false);
      getInstalledModels();
    };

    window.intelligence.onDownloadError = (_modelId, err) => {
      setError(err);
      setIsDownloading(false);
    };

    return () => {
      window.intelligence.onMLToken = undefined;
      window.intelligence.onMLComplete = undefined;
      window.intelligence.onMLError = undefined;
      window.intelligence.onDownloadStart = undefined;
      window.intelligence.onDownloadProgress = undefined;
      window.intelligence.onDownloadEnd = undefined;
      window.intelligence.onDownloadError = undefined;
    };
  }, [getAllModels, getInstalledModels]);

  const isInstalled = installedModels.some((m) => m.id === selectedModelId);

  function handleDownload() {
    if (!selectedModelId) return;
    setError(null);
    window.intelligence.downloadModel({ model: selectedModelId });
  }

  function handleSubmit() {
    if (!selectedModelId || !promptText.trim() || isStreaming) return;
    const id = crypto.randomUUID();
    jobIdRef.current = id;
    setResponse("");
    setError(null);
    setIsStreaming(true);
    window.intelligence.completion({
      id,
      model: selectedModelId,
      messages: [{ role: "user", content: promptText }],
      stream: true,
    });
  }

  function handleCancel() {
    window.intelligence.cancel({ id: jobIdRef.current });
    setIsStreaming(false);
  }

  const selectedModel = availableModels.find((m) => m.id === selectedModelId);

  return (
    <Container size="2" p="6">
      <Flex direction="column" gap="5">
        <Heading size="6">Local AI Demo</Heading>

        {/* Model selector */}
        <Flex direction="column" gap="1">
          <Text size="2" weight="medium">
            Modell
          </Text>
          <Select.Root
            value={selectedModelId}
            onValueChange={(val) => {
              setSelectedModelId(val);
              setResponse("");
              setError(null);
            }}
          >
            <Select.Trigger placeholder="Modell wählen..." />
            <Select.Content>
              {availableModels.map((model) => {
                const installed = installedModels.some(
                  (m) => m.id === model.id,
                );
                return (
                  <Select.Item key={model.id} value={model.id}>
                    <Flex align="center" gap="2">
                      {model.name}
                      {installed && (
                        <Badge color="green" size="1">
                          Installiert
                        </Badge>
                      )}
                    </Flex>
                  </Select.Item>
                );
              })}
            </Select.Content>
          </Select.Root>
          {selectedModel && (
            <Text size="1" color="gray">
              {selectedModel.category}
            </Text>
          )}
        </Flex>

        {/* Download area */}
        {selectedModelId && !isInstalled && (
          <Box
            p="4"
            style={{
              border: "1px solid var(--gray-5)",
              borderRadius: "var(--radius-3)",
            }}
          >
            <Flex direction="column" gap="3">
              <Text size="2">Dieses Modell ist noch nicht installiert.</Text>
              <Button
                onClick={handleDownload}
                disabled={isDownloading}
                variant="soft"
              >
                {isDownloading ? (
                  <>
                    <Spinner /> Wird heruntergeladen...
                  </>
                ) : (
                  "Herunterladen"
                )}
              </Button>
              {isDownloading && <Progress value={downloadProgress} />}
            </Flex>
          </Box>
        )}

        {/* Prompt input */}
        {selectedModelId && isInstalled && (
          <Flex direction="column" gap="2">
            <Text size="2" weight="medium">
              Prompt
            </Text>
            <TextArea
              placeholder="Prompt eingeben..."
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              rows={4}
              disabled={isStreaming}
            />
            <Flex gap="2" justify="end">
              {isStreaming && (
                <Button variant="soft" color="red" onClick={handleCancel}>
                  Abbrechen
                </Button>
              )}
              <Button
                onClick={handleSubmit}
                disabled={isStreaming || !promptText.trim()}
              >
                {isStreaming ? (
                  <>
                    <Spinner /> Generiert...
                  </>
                ) : (
                  "Senden"
                )}
              </Button>
            </Flex>
          </Flex>
        )}

        {/* Response output */}
        {(response || isStreaming) && (
          <Box
            p="4"
            style={{
              border: "1px solid var(--gray-5)",
              borderRadius: "var(--radius-3)",
              minHeight: "6rem",
              whiteSpace: "pre-wrap",
              fontFamily: "var(--font-family-mono, monospace)",
            }}
          >
            {response || <Text color="gray">Warte auf Antwort...</Text>}
            {isStreaming && <span style={{ opacity: 0.5 }}>▌</span>}
          </Box>
        )}

        {/* Error */}
        {error && (
          <Callout.Root color="red">
            <Callout.Text>{error}</Callout.Text>
          </Callout.Root>
        )}
      </Flex>
    </Container>
  );
}

export default SinglePromptApp;
