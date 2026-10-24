import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyTranscript,
  triageRulebook,
} from "../src/lib/triage-engine.ts";

const cases = [
  {
    name: "routes English microphone complaints to audio capture",
    transcript: "The microphone is not recording and I hear static.",
    category: "HARDWARE_AUDIO_CAPTURE",
  },
  {
    name: "routes Spanish microphone complaints to audio capture",
    transcript: "El micrófono tiene estática y no graba correctamente.",
    category: "HARDWARE_AUDIO_CAPTURE",
  },
  {
    name: "routes English app crashes to the desktop client rule",
    transcript: "The desktop app crashes when it opens and shows a blue screen.",
    category: "DESKTOP_CLIENT_CRASH",
  },
  {
    name: "routes Spanish app crashes to the desktop client rule",
    transcript: "La aplicación se cerró con una pantalla azul.",
    category: "DESKTOP_CLIENT_CRASH",
  },
  {
    name: "routes English sync issues to sync infrastructure",
    transcript: "The team is offline and changes are not syncing to the cloud.",
    category: "SYNC_INFRASTRUCTURE",
  },
  {
    name: "routes Spanish sync issues to sync infrastructure",
    transcript: "El equipo está offline y no sincroniza los cambios con la nube.",
    category: "SYNC_INFRASTRUCTURE",
  },
  {
    name: "uses the more urgent crash rule when terms overlap",
    transcript: "The app is crashing and the audio is static.",
    category: "DESKTOP_CLIENT_CRASH",
  },
  {
    name: "uses human review only when no routing rule matches",
    transcript: "I need help understanding my account details.",
    category: "UNKNOWN_NEEDS_HUMAN",
  },
];

for (const item of cases) {
  test(item.name, () => {
    assert.equal(classifyTranscript(item.transcript).category, item.category);
  });
}

test("the displayed rulebook contains the same ordered fallback rules", () => {
  assert.deepEqual(
    triageRulebook.map((rule) => rule.category),
    [
      "DESKTOP_CLIENT_CRASH",
      "HARDWARE_AUDIO_CAPTURE",
      "SYNC_INFRASTRUCTURE",
      "UNKNOWN_NEEDS_HUMAN",
    ],
  );
});
