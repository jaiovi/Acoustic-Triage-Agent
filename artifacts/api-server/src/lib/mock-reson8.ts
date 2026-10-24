type AudioFileLike = {
  name: string;
};

const transcriptSamples = [
  {
    matches: ["crash", "tauri", "desktop"],
    text: "La aplicación tuvo un crash y se cerró después de mostrar una pantalla azul.",
  },
  {
    matches: ["sync", "nube", "offline"],
    text: "El equipo está offline y no sincroniza los cambios con la nube.",
  },
  {
    matches: ["mic", "micro", "audio", "estatica", "estática"],
    text: "El micrófono tiene estática y el audio no se graba correctamente.",
  },
  {
    matches: [],
    text: "Necesito ayuda con un problema técnico que no puedo describir con claridad.",
  },
] as const;

/**
 * Simulates Reson8 transcription. Audio bytes are intentionally not decoded.
 * A filename hint selects a canned transcript so each triage rule can be tried.
 */
export async function transcribeWithMockReson8(
  file: AudioFileLike,
): Promise<string> {
  await new Promise<void>((resolve) => setTimeout(resolve, 500));
  const normalizedName = file.name.toLocaleLowerCase("es");
  const sample = transcriptSamples.find(({ matches }) =>
    matches.some((hint) => normalizedName.includes(hint)),
  );
  return sample?.text ?? transcriptSamples[transcriptSamples.length - 1].text;
}
