import {
  AnalyzeAudioTicketBody,
  GetTriageDashboardSummaryResponse,
  GetTriageTicketParams,
  GetTriageTicketResponse,
  ListTriageTicketsQueryParams,
  ListTriageTicketsResponse,
} from "@workspace/api-zod";
import { count, desc, eq } from "drizzle-orm";
import multer from "multer";
import { Router, type IRouter } from "express";
import { db, triageTicketsTable } from "@workspace/db";
import { z } from "zod";
import { transcribeWithMockReson8 } from "../lib/mock-reson8";
import { triageCategories, type TriageCategory } from "../lib/triage-engine";
import { createClassifiedTicket } from "../lib/triage-service";

const router: IRouter = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    const extension = file.originalname.toLocaleLowerCase("en").split(".").pop();
    const acceptedExtension = extension === "wav" || extension === "mp3";
    const acceptedMimeType = [
      "audio/wav",
      "audio/x-wav",
      "audio/mpeg",
      "audio/mp3",
      "audio/x-mpeg",
    ].includes(file.mimetype.toLocaleLowerCase("en"));

    if (!acceptedExtension || !acceptedMimeType) {
      callback(new Error("Only WAV and MP3 audio files are accepted."));
      return;
    }

    callback(null, true);
  },
});

const uploadRateLimit = {
  windowMs: 60_000,
  maxRequests: 10,
};
const requestCounts = new Map<string, { count: number; resetAt: number }>();
const audioMetadataSchema = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.enum(["audio/wav", "audio/x-wav", "audio/mpeg", "audio/mp3", "audio/x-mpeg"]),
  size: z.number().int().min(1).max(8 * 1024 * 1024),
});

function isRateLimited(ip: string, now: number): boolean {
  if (requestCounts.size > 1_000) {
    for (const [key, value] of requestCounts) {
      if (value.resetAt <= now) {
        requestCounts.delete(key);
      }
    }
    while (requestCounts.size > 5_000) {
      const oldestKey = requestCounts.keys().next().value;
      if (oldestKey === undefined) break;
      requestCounts.delete(oldestKey);
    }
  }
  const existing = requestCounts.get(ip);
  if (!existing || existing.resetAt <= now) {
    requestCounts.set(ip, {
      count: 1,
      resetAt: now + uploadRateLimit.windowMs,
    });
    return false;
  }
  existing.count += 1;
  return existing.count > uploadRateLimit.maxRequests;
}

router.get("/tickets", async (req, res): Promise<void> => {
  const parsedQuery = ListTriageTicketsQueryParams.safeParse(req.query);
  if (!parsedQuery.success) {
    res.status(400).json({ error: parsedQuery.error.message });
    return;
  }

  const rows = await db
    .select()
    .from(triageTicketsTable)
    .orderBy(desc(triageTicketsTable.createdAt))
    .limit(parsedQuery.data.limit);

  res.json(
    ListTriageTicketsResponse.parse(
      rows.map((ticket) => ({
        ...ticket,
        createdAt: ticket.createdAt.toISOString(),
      })),
    ),
  );
});

router.get("/tickets/:id", async (req, res): Promise<void> => {
  const parsedParams = GetTriageTicketParams.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(400).json({ error: parsedParams.error.message });
    return;
  }

  const [ticket] = await db
    .select()
    .from(triageTicketsTable)
    .where(eq(triageTicketsTable.id, parsedParams.data.id))
    .limit(1);

  if (!ticket) {
    res.status(404).json({ error: "Ticket not found." });
    return;
  }

  res.json(
    GetTriageTicketResponse.parse({
      ...ticket,
      createdAt: ticket.createdAt.toISOString(),
    }),
  );
});

router.post(
  "/tickets/analyze",
  (req, res, next) => {
    if (isRateLimited(req.ip || "unknown", Date.now())) {
      res.setHeader("Retry-After", "60");
      res.status(429).json({ error: "Upload limit reached. Try again in one minute." });
      return;
    }
    next();
  },
  upload.single("audio"),
  async (req, res): Promise<void> => {
    const uploadedFile = req.file;
    if (!uploadedFile) {
      res.status(400).json({ error: "Choose a WAV or MP3 file to analyze." });
      return;
    }

    const fileName = uploadedFile.originalname.split(/[\\/]/).pop() ?? "";
    const parsedMetadata = audioMetadataSchema.safeParse({
      fileName,
      mimeType: uploadedFile.mimetype.toLocaleLowerCase("en"),
      size: uploadedFile.size,
    });
    if (!parsedMetadata.success) {
      res.status(400).json({ error: "The audio file metadata is invalid." });
      return;
    }

    const parsedAudio = AnalyzeAudioTicketBody.safeParse({
      audio: new Blob([Uint8Array.from(uploadedFile.buffer)], {
        type: uploadedFile.mimetype,
      }),
    });
    if (!parsedAudio.success) {
      res.status(400).json({ error: parsedAudio.error.message });
      return;
    }

    const transcript = await transcribeWithMockReson8({
      name: parsedMetadata.data.fileName,
    });
    let response;
    try {
      response = await createClassifiedTicket({ fileName, transcript });
    } catch (error) {
      req.log.error({ err: error }, "The ticket could not be saved");
      res.status(500).json({ error: "The ticket could not be saved." });
      return;
    }

    req.log.info(
      {
        event: "support_ticket_classified",
        ticket: {
          id: response.id,
          category: response.category,
          priority: response.priority,
        },
      },
      "Voice ticket classified and proactively routed",
    );
    res.status(201).json(response);
  },
);

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const [totalResult, groupedResults] = await Promise.all([
    db.select({ value: count() }).from(triageTicketsTable),
    db
      .select({
        category: triageTicketsTable.category,
        value: count(),
      })
      .from(triageTicketsTable)
      .groupBy(triageTicketsTable.category),
  ]);

  const categoryCounts: Record<TriageCategory, number> = {
    HARDWARE_AUDIO_CAPTURE: 0,
    DESKTOP_CLIENT_CRASH: 0,
    SYNC_INFRASTRUCTURE: 0,
    UNKNOWN_NEEDS_HUMAN: 0,
  };
  for (const row of groupedResults) {
    const category = triageCategories.find((item) => item === row.category);
    if (category) {
      categoryCounts[category] = Number(row.value);
    }
  }

  const totalTickets = Number(totalResult[0]?.value ?? 0);
  const needsHuman = categoryCounts.UNKNOWN_NEEDS_HUMAN;
  res.json(
    GetTriageDashboardSummaryResponse.parse({
      totalTickets,
      autoRouted: totalTickets - needsHuman,
      needsHuman,
      categoryCounts,
    }),
  );
});

export default router;
