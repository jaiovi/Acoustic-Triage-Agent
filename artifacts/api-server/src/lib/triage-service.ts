import { AnalyzeAudioTicketResponse } from "@workspace/api-zod";
import { db, triageTicketsTable } from "@workspace/db";
import { classifyTranscript } from "./triage-engine";

export async function createClassifiedTicket(input: {
  fileName: string;
  transcript: string;
}) {
  const triage = classifyTranscript(input.transcript);
  const tag =
    triage.category === "UNKNOWN_NEEDS_HUMAN"
      ? "Needs human review"
      : "Sugerencia de Resolución Automática";
  const [ticket] = await db
    .insert(triageTicketsTable)
    .values({
      fileName: input.fileName,
      transcript: input.transcript,
      category: triage.category,
      priority: triage.priority,
      status: "CATEGORIZED",
      tag,
      recommendation: triage.recommendation,
    })
    .returning();

  if (!ticket) {
    throw new Error("The ticket could not be saved.");
  }

  return AnalyzeAudioTicketResponse.parse({
    ...ticket,
    createdAt: ticket.createdAt.toISOString(),
  });
}
