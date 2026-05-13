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
    TResult = unknown
  > = {
    (args: TArgs): TResult | Promise<TResult>;
    schema: ToolSchema;
  };

  interface Window {
    intelligence: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools: Record<string, Tool<any, any>>;

      completion: (payload: {
        id: string;
        model: string;
        messages: { role: "system" | "user" | string; content: string }[];
        stream: boolean;
      }) => void;

      listModels: (payload: { query: "all" | "installed" }) => void;
      downloadModel: (payload: { model: string }) => void;
      removeModel: (payload: { model: "all" | string }) => void;
      cancel: () => void;
    };
  }
}
