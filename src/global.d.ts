export {};

declare global {
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

  interface CompletionToolSchema {
    type: string | "function";
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

  interface Model {
    id: string,
    name: string,
    category: string,
  }

  interface Window {
    intelligence: {
      // === State

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools: Record<string, Tool<any, any>>;

      // === Methods

      completion: (payload: {
        id: string;
        model: string;
        messages: { role: "system" | "user" | string; content: string }[];
        stream: boolean;
        tools?: CompletionToolSchema[];
      }) => void;

      listModels: (payload: { query: "all" | "installed" }) => void;
      downloadModel: (payload: { model: string }) => void;
      removeModel: (payload: { model: "all" | string }) => void;
      cancel: () => void;

      // === Callbacks

      onMLToken?: (jobId: string) => void;
      onMLComplete?: (jobId: string) => void;
      onMLError?: (error: string) => void;

      onInstalledModelsLoaded?: (models: Model[]) => void;
      onAvailableModelsLoaded?: (models: Model[]) => void;

      onDownloadStart?: (modelId: string) => void;
      onDownloadProgress?: (modelId: string, progress: number) => void;
      onDownloadEnd?: (modelId: string) => void;
      onDownloadError?: (modelId: string, error: string) => void;

      onRemoveSuccess?: (modelId: string) => void;
      onRemoveError?: (modelId: string, error: string) => void;
      onRemoveAllSuccess?: () => void;
      onRemoveAllError?: (error: string) => void;
    };
  }
}
