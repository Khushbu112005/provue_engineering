import { Mastra } from "@mastra/core";
import { taraAgent } from "./agent.js";

export const mastra = new Mastra({
  agents: {
    tara: taraAgent
  }
});
export type AppMastra = typeof mastra;
export default mastra;
