export {};

declare global {
  // --- Block types (snapshot elements emitted by onMLToken / onMLComplete) ---

  interface ContentBlock {
    type: "content";
    format: "string" | "json";
    content: string | Record<string, unknown>;
  }

  interface ToolBlock {
    type: "tool";
    id: string;
    name: string;
    /** Native emits 'loading' | 'ready'. JS sets 'done' | 'failed' after execution. */
    status: "loading" | "ready" | "done" | "failed";
    arguments?: Record<string, unknown>;
    result?: unknown;
    error?: string;
  }

  type Block = ContentBlock | ToolBlock;

  // --- Tool registration types ---

  interface ToolParameterProperty {
    type: string;
    description?: string;
  }

  interface ToolSchema {
    description: string;
    parameters: {
      type: string;
      properties: Record<string, ToolParameterProperty>;
      required?: string[];
    };
  }

  type Tool<
    TArgs extends Record<string, unknown> = Record<string, unknown>,
    TResult = unknown,
  > = {
    (args: TArgs): TResult | Promise<TResult>;
    schema: ToolSchema;
  };

  /** Full OpenAI-shaped tool schema — used as escape hatch in completion({ tools: [...] }). */
  interface CompletionToolSchema {
    type: "function";
    function: {
      name: string;
      description: string;
      parameters: {
        type: string;
        properties: Record<string, ToolParameterProperty>;
        required?: string[];
      };
    };
  }

  // --- Message types ---

  type CompletionMessage =
    | { role: "system" | "user"; content: string }
    | { role: "assistant"; content: string | Block[] }
    | { role: "tool"; tool_call_id: string; content: string };

  // --- Model ---

  interface Model {
    id: string;
    name: string;
    category: string;
  }

  // --- MLError payload ---

  interface MLError {
    jobId: string;
    errorCode: number;
    errorMessage: string;
  }

  // --- Window ---

  interface Window {
    intelligence: {
      // Tool registry. Register via Object.assign or defineTool helper.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools: Record<string, Tool<any, any>>;

      // Cached model lists (set by native after list callbacks fire).
      installedModels?: Model[];
      availableModels?: Model[];

      // --- Methods ---

      /**
       * Run a completion. Tools are auto-included from window.intelligence.tools.
       * Pass tools: [] to disable, tools: ['name'] to restrict, or omit for all.
       */
      completion: (payload: {
        id: string;
        model: string;
        messages: CompletionMessage[];
        stream?: boolean;
        /** Omit = all registered tools. [] = disabled. string[] = by name. Schema[] = raw. */
        tools?: Array<string | CompletionToolSchema>;
        response_format?: {
          type: "json_schema";
          schema: Record<string, unknown>;
        };
        max_tokens?: number;
        temperature?: number;
        top_p?: number;
        top_k?: number;
        min_p?: number;
        repetition_penalty?: number;
        stop_sequences?: unknown[];
        include_stop_sequences?: boolean;
        force_tools?: boolean;
        tool_rag_top_k?: number;
        confidence_threshold?: number;
        auto_handoff?: boolean;
        cloud_timeout_ms?: number;
        handoff_with_images?: boolean;
        enable_thinking_if_supported?: boolean;
      }) => void;

      listModels: (payload: { query: "all" | "installed" }) => void;
      downloadModel: (payload: { model: string }) => void;
      removeModel: (payload: { model: "all" | string }) => void;
      cancel: (payload: { id: string }) => void;

      // --- Inference callbacks ---

      /** Fires on every streaming token. snapshot is the full current blocks array. */
      onMLToken?: (jobId: string, snapshot: Block[]) => void;
      /** Fires when the turn is complete. snapshot is the final blocks array. */
      onMLComplete?: (jobId: string, snapshot: Block[]) => void;
      onMLError?: (error: MLError) => void;

      // --- Model list callbacks ---

      onInstalledModelsLoaded?: (models: Model[]) => void;
      onAvailableModelsLoaded?: (models: Model[]) => void;

      // --- Download callbacks ---

      onDownloadStart?: (modelId: string) => void;
      onDownloadProgress?: (modelId: string, progress: number) => void;
      onDownloadEnd?: (modelId: string) => void;
      onDownloadError?: (modelId: string, error: string) => void;

      // --- Remove callbacks ---

      onRemoveSuccess?: (modelId: string) => void;
      onRemoveError?: (modelId: string, error: string) => void;
      onRemoveAllSuccess?: () => void;
      onRemoveAllError?: (error: string) => void;
    };
  }
}
