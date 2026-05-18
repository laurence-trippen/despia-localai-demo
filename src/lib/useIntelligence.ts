import { useEffect, useState } from "react";

export type UseIntelligenceAPI = {
  availableModels: Model[];
  installedModels: Model[];

  getAllModels: () => void;
  getInstalledModels: () => void;

  isModelInstalledById: (id: string) => void;
  isModelInstalledByName: (name: string) => void;
};

function useIntelligence(): UseIntelligenceAPI {
  const [installedModels, setInstalledModels] = useState<Model[]>([]);
  const [availableModels, setAvailableModels] = useState<Model[]>([]);

  useEffect(() => {
    window.intelligence.onInstalledModelsLoaded = (models) => {
      setInstalledModels(models);
    };

    window.intelligence.onAvailableModelsLoaded = (models) => {
      setAvailableModels(models);
    };

    return () => {
      window.intelligence.onInstalledModelsLoaded = undefined;
      window.intelligence.onAvailableModelsLoaded = undefined;
    };
  }, []);

  const getAllModels = () => window.intelligence.listModels({ query: "all" });

  const getInstalledModels = () =>
    window.intelligence.listModels({ query: "installed" });

  const isModelInstalledById = (id: string) =>
    installedModels.some((model) => model.id === id);

  const isModelInstalledByName = (name: string) =>
    installedModels.some((model) => model.name === name);

  return {
    availableModels,
    installedModels,

    getAllModels,
    getInstalledModels,

    isModelInstalledById,
    isModelInstalledByName,
  };
}

export default useIntelligence;
