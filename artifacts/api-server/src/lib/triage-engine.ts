export const triageCategories = [
  "HARDWARE_AUDIO_CAPTURE",
  "DESKTOP_CLIENT_CRASH",
  "SYNC_INFRASTRUCTURE",
  "UNKNOWN_NEEDS_HUMAN",
] as const;

export type TriageCategory = (typeof triageCategories)[number];
export type TriagePriority = "HIGH" | "NORMAL";

const keywordGroups: ReadonlyArray<{
  category: TriageCategory;
  keywords: readonly string[];
}> = [
  {
    category: "HARDWARE_AUDIO_CAPTURE",
    keywords: ["micrófono", "microfono", "audio", "estática", "estatica", "no graba"],
  },
  {
    category: "DESKTOP_CLIENT_CRASH",
    keywords: ["crash", "pantalla azul", "se cerró", "se cerro", "tauri"],
  },
  {
    category: "SYNC_INFRASTRUCTURE",
    keywords: ["no sincroniza", "nube", "offline"],
  },
];

const resolutionByCategory: Record<TriageCategory, string> = {
  HARDWARE_AUDIO_CAPTURE:
    "Check microphone permissions and input device selection, then record a short test clip.",
  DESKTOP_CLIENT_CRASH:
    "Collect the desktop client crash log and restart the app; escalate with the Tauri build version.",
  SYNC_INFRASTRUCTURE:
    "Check network connectivity and sync service health, then retry the pending sync.",
  UNKNOWN_NEEDS_HUMAN:
    "No matching rule was found. Review the transcript and route this ticket to a support specialist.",
};

export function classifyTranscript(transcript: string): {
  category: TriageCategory;
  priority: TriagePriority;
  recommendation: string;
} {
  const normalized = transcript.toLocaleLowerCase("es");
  const match = keywordGroups.find(({ keywords }) =>
    keywords.some((keyword) => normalized.includes(keyword)),
  );
  const category = match?.category ?? "UNKNOWN_NEEDS_HUMAN";

  return {
    category,
    priority:
      category === "DESKTOP_CLIENT_CRASH" ||
      category === "UNKNOWN_NEEDS_HUMAN"
        ? "HIGH"
        : "NORMAL",
    recommendation: resolutionByCategory[category],
  };
}
