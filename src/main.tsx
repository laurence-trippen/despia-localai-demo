import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { Theme } from "@radix-ui/themes";

import App from "./App.tsx";

import "@radix-ui/themes/styles.css";
import { defineTool } from "./lib/intelligence.ts";

window.intelligence.tools.get_weather_by_city = defineTool(
  async (args: { cityName: string }) => {
    try {
      const params = new URLSearchParams()
      params.append("q", args.cityName)
      params.append("appId", prompt("Enter OpenWeatherMap API Key") ?? "")

      const response = await fetch(`https://api.openweathermap.org/data/2.5/weather?${params}`)
      const data = await response.json()

      return data["weather"][0] ?? "N/A"
    } catch {
      return "N/A"
    }
  },
  {
    description: "Get weather for a city.",
    parameters: {
      type: "object",
      properties: {
        location: {
          type: "string",
          description: "city"
        }
      },
      required: ["location"],
    },
  },
)

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Theme>
      <App />
    </Theme>
  </StrictMode>,
);
