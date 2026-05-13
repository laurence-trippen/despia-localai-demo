export {};

declare global {
  interface Window {
    intelligence: {
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
