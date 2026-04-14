import { useContext } from "react";
import { RadarContext } from "./radarContext";

export function useRadar() {
  const ctx = useContext(RadarContext);
  if (!ctx) throw new Error("useRadar must be used inside RadarProvider");
  return ctx;
}
