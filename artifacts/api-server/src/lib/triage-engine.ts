export const triageCategories = [
  "HARDWARE_AUDIO_CAPTURE",
  "DESKTOP_CLIENT_CRASH",
  "SYNC_INFRASTRUCTURE",
  "UNKNOWN_NEEDS_HUMAN",
] as const;

export type TriageCategory = (typeof triageCategories)[number];
export type TriagePriority = "HIGH" | "NORMAL";

type RulebookEntry = {
  category: TriageCategory;
  title: string;
  priority: TriagePriority;
  description: string;
  matchTerms: readonly string[];
  examples: readonly string[];
  recommendation: string;
};

/**
 * This is the single source of truth for transcript routing and the UI rulebook.
 * Rules are evaluated top-to-bottom. The final entry is the no-match fallback.
 */
export const triageRulebook = [
  {
    category: "DESKTOP_CLIENT_CRASH",
    title: "Desktop client crash",
    priority: "HIGH",
    description:
      "The desktop app crashes, closes unexpectedly, freezes, or shows a system error.",
    matchTerms: [
      "crash",
      "crashes",
      "crashed",
      "crashing",
      "blue screen",
      "pantalla azul",
      "se cerró",
      "se cerro",
      "se cierra",
      "shuts down",
      "shut down",
      "keeps closing",
      "app closes",
      "application closes",
      "freeze",
      "freezes",
      "frozen",
      "tauri",
    ],
    examples: [
      "The desktop app keeps crashing after launch.",
      "La aplicación se cierra y muestra una pantalla azul.",
    ],
    recommendation:
      "Collect the desktop client crash log and restart the app; escalate with the Tauri build version.",
  },
  {
    category: "HARDWARE_AUDIO_CAPTURE",
    title: "Microphone and audio capture",
    priority: "NORMAL",
    description:
      "A microphone, headset, recording, audio input, sound quality, or capture permission is failing.",
    matchTerms: [
      "microphone",
      "mic",
      "micrófono",
      "microfono",
      "headset",
      "headphones",
      "audio",
      "static",
      "estática",
      "estatica",
      "no sound",
      "no audio",
      "can't hear",
      "cannot hear",
      "not recording",
      "won't record",
      "wont record",
      "no graba",
      "no se graba",
      "no captura",
      "sin sonido",
      "ruido",
    ],
    examples: [
      "My microphone is not recording and there is static.",
      "El micrófono tiene estática y no graba correctamente.",
    ],
    recommendation:
      "Check microphone permissions and input device selection, then record a short test clip.",
  },
  {
    category: "SYNC_INFRASTRUCTURE",
    title: "Sync and cloud infrastructure",
    priority: "NORMAL",
    description:
      "Changes are offline, out of sync, or are not reaching the cloud service.",
    matchTerms: [
      "sync",
      "synchroniz",
      "sincroniza",
      "sincronización",
      "sincronizacion",
      "nube",
      "cloud",
      "offline",
      "out of sync",
      "not syncing",
      "doesn't sync",
      "doesnt sync",
      "won't sync",
      "wont sync",
      "pending changes",
      "pending sync",
      "no se sincronizan",
    ],
    examples: [
      "The team is offline and the changes are not syncing to the cloud.",
      "El equipo está offline y no sincroniza los cambios con la nube.",
    ],
    recommendation:
      "Check network connectivity and sync service health, then retry the pending sync.",
  },
  {
    category: "UNKNOWN_NEEDS_HUMAN",
    title: "Human review fallback",
    priority: "HIGH",
    description:
      "No earlier rule matched, or the transcript does not contain enough detail to route safely.",
    matchTerms: [],
    examples: [
      "A vague report with no identifiable audio, crash, or sync issue.",
    ],
    recommendation:
      "Review the transcript and route the ticket to a support specialist.",
  },
] as const satisfies readonly RulebookEntry[];

export function classifyTranscript(transcript: string): {
  category: TriageCategory;
  priority: TriagePriority;
  recommendation: string;
} {
  const normalized = transcript
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[’‘]/g, "'");

  const matchedRule = triageRulebook.find(
    (rule) =>
      rule.matchTerms.length > 0 &&
      rule.matchTerms.some((term) => normalized.includes(term)),
  );
  const rule =
    matchedRule ??
    triageRulebook.find(
      (entry) => entry.category === "UNKNOWN_NEEDS_HUMAN",
    );

  if (!rule) {
    throw new Error("The triage rulebook must include a human-review fallback.");
  }

  return {
    category: rule.category,
    priority: rule.priority,
    recommendation: rule.recommendation,
  };
}
