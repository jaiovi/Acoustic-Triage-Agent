import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { URL } from "node:url";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import { logger } from "./logger";
import { createClassifiedTicket } from "./triage-service";
import { z } from "zod";

const endpoint = "/api/realtime";
const maxSessionAudioBytes = 32 * 1024 * 1024;
const maxSessionsPerIp = 2;
const maxConcurrentSessions = 8;
const activeSessions = new Map<string, number>();
const connectionWindowMs = 60_000;
const maxConnectionsPerWindow = 10;
const connectionCounts = new Map<string, { count: number; resetAt: number }>();
const realtimeQuerySchema = z.object({
  language: z
    .string()
    .regex(/^[a-z]{2}(,[a-z]{2})*$/)
    .max(20)
    .default("es"),
});
const flushRequestSchema = z.object({
  type: z.literal("flush_request"),
  id: z.string().max(100).optional(),
});

function getClientIp(request: IncomingMessage): string {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return request.socket.remoteAddress || "unknown";
}

function rejectUpgrade(socket: Duplex, status: number, message: string): void {
  socket.end(
    `HTTP/1.1 ${status} ${message}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
  );
}

function countConnection(ip: string, now: number): boolean {
  for (const [key, value] of connectionCounts) {
    if (value.resetAt <= now) connectionCounts.delete(key);
  }
  const current = connectionCounts.get(ip);
  if (!current || current.resetAt <= now) {
    connectionCounts.set(ip, { count: 1, resetAt: now + connectionWindowMs });
    return false;
  }
  current.count += 1;
  return current.count > maxConnectionsPerWindow;
}

function activeSessionCount(): number {
  let total = 0;
  for (const count of activeSessions.values()) total += count;
  return total;
}

function sendJson(socket: WebSocket, value: unknown): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(value));
  }
}

function safeParseMessage(data: RawData): unknown {
  try {
    return JSON.parse(data.toString());
  } catch {
    return null;
  }
}

function rawDataLength(data: RawData): number {
  if (Array.isArray(data)) {
    return data.reduce((total, chunk) => total + chunk.byteLength, 0);
  }
  return data.byteLength;
}

export function attachRealtimeProxy(server: Server): void {
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 256 * 1024,
    perMessageDeflate: false,
  });

  server.on("upgrade", (request, socket, head) => {
    let requestUrl: URL;
    try {
      requestUrl = new URL(request.url ?? "/", "http://localhost");
    } catch {
      rejectUpgrade(socket, 400, "Bad Request");
      return;
    }
    if (requestUrl.pathname !== endpoint) {
      rejectUpgrade(socket, 404, "Not Found");
      return;
    }

    const apiKey = process.env["RESON8_API_KEY"];
    if (!apiKey) {
      rejectUpgrade(socket, 503, "Service Unavailable");
      return;
    }

    const origin = request.headers.origin;
    const requestHost =
      request.headers["x-forwarded-host"]?.toString().split(",")[0]?.trim() ??
      request.headers.host;
    if (origin && requestHost) {
      try {
        if (new URL(origin).host !== requestHost) {
          rejectUpgrade(socket, 403, "Forbidden");
          return;
        }
      } catch {
        rejectUpgrade(socket, 403, "Forbidden");
        return;
      }
    }

    const parsedQuery = realtimeQuerySchema.safeParse(
      Object.fromEntries(requestUrl.searchParams.entries()),
    );
    if (!parsedQuery.success) {
      rejectUpgrade(socket, 400, "Bad Request");
      return;
    }

    const ip = getClientIp(request);
    if (countConnection(ip, Date.now())) {
      rejectUpgrade(socket, 429, "Too Many Requests");
      return;
    }
    if ((activeSessions.get(ip) ?? 0) >= maxSessionsPerIp) {
      rejectUpgrade(socket, 429, "Too Many Requests");
      return;
    }
    if (activeSessionCount() >= maxConcurrentSessions) {
      rejectUpgrade(socket, 429, "Too Many Requests");
      return;
    }

    wss.handleUpgrade(request, socket, head, (client) => {
      wss.emit("connection", client, request, {
        apiKey,
        ip,
        language: parsedQuery.data.language,
      });
    });
  });

  wss.on(
    "connection",
    (
      client: WebSocket,
      _request: IncomingMessage,
      context: { apiKey: string; ip: string; language: string },
    ) => {
      activeSessions.set(context.ip, (activeSessions.get(context.ip) ?? 0) + 1);
      let sessionBytes = 0;
      let finalSegments: string[] = [];
      let finalizing = false;
      let released = false;
      const releaseSession = () => {
        if (released) return;
        released = true;
        const remaining = Math.max(0, (activeSessions.get(context.ip) ?? 1) - 1);
        if (remaining === 0) activeSessions.delete(context.ip);
        else activeSessions.set(context.ip, remaining);
      };

      const upstreamUrl = new URL(
        "wss://api.reson8.dev/v1/speech-to-text/realtime",
      );
      upstreamUrl.searchParams.set("encoding", "auto");
      upstreamUrl.searchParams.set("language", context.language);
      upstreamUrl.searchParams.set("include_interim", "true");
      upstreamUrl.searchParams.set("include_language", "true");
      upstreamUrl.searchParams.set("include_timestamps", "true");

      const upstream = new WebSocket(upstreamUrl, {
        headers: { Authorization: `ApiKey ${context.apiKey}` },
        maxPayload: 256 * 1024,
        perMessageDeflate: false,
      });

      const sessionTimer = setTimeout(
        () => client.close(1008, "session_timeout"),
        10 * 60 * 1000,
      );
      sessionTimer.unref();

      upstream.on("open", () => {
        sendJson(client, { type: "connection_ready" });
        logger.info({ event: "reson8_realtime_connected" });
      });

      client.on("message", (data, isBinary) => {
        if (isBinary) {
          sessionBytes += rawDataLength(data);
          if (sessionBytes > maxSessionAudioBytes) {
            client.close(1009, "audio_limit_exceeded");
            return;
          }
          if (upstream.readyState === WebSocket.OPEN) {
            upstream.send(data, { binary: true });
          }
          return;
        }

        const parsed = flushRequestSchema.safeParse(safeParseMessage(data));
        if (!parsed.success) {
          sendJson(client, {
            type: "error",
            message: "Only a flush request is accepted from the browser.",
          });
          return;
        }
        if (upstream.readyState === WebSocket.OPEN) {
          upstream.send(JSON.stringify(parsed.data));
        }
      });

      upstream.on("message", async (data, isBinary) => {
        if (isBinary) {
          if (client.readyState === WebSocket.OPEN) {
            client.send(data, { binary: true });
          }
          return;
        }

        const event = safeParseMessage(data);
        if (
          typeof event === "object" &&
          event !== null &&
          "type" in event &&
          event.type === "transcript" &&
          "text" in event &&
          typeof event.text === "string"
        ) {
          const isFinal =
            !("is_final" in event) || event.is_final !== false;
          if (isFinal && event.text.trim()) {
            finalSegments.push(event.text.trim());
          }
          sendJson(client, event);
          return;
        }

        if (
          typeof event === "object" &&
          event !== null &&
          "type" in event &&
          event.type === "flush_confirmation"
        ) {
          if (finalizing) return;
          finalizing = true;
          const transcript = finalSegments.join(" ").trim();
          finalSegments = [];
          try {
            if (!transcript) {
              sendJson(client, { type: "flush_complete", status: "empty" });
              return;
            }
            const ticket = await createClassifiedTicket({
              fileName: "live-microphone.webm",
              transcript,
            });
            logger.info(
              {
                event: "support_ticket_classified",
                source: "realtime",
                ticket: {
                  id: ticket.id,
                  category: ticket.category,
                  priority: ticket.priority,
                },
              },
              "Realtime voice transcript classified and saved",
            );
            sendJson(client, { type: "ticket_categorized", ticket });
            sendJson(client, { type: "flush_complete", status: "saved" });
          } catch (error) {
            logger.error(
              { err: error, event: "realtime_ticket_save_failed" },
              "Could not save realtime voice ticket",
            );
            sendJson(client, {
              type: "error",
              message: "The transcript was received but could not be saved.",
            });
            sendJson(client, { type: "flush_complete", status: "failed" });
          } finally {
            finalizing = false;
          }
          return;
        }

        if (typeof event === "object" && event !== null && "type" in event && event.type === "error") {
          logger.warn(
          { event: "reson8_realtime_error" },
            "Reson8 reported a realtime transcription error",
          );
          sendJson(client, {
            type: "error",
            message: "Reson8 could not transcribe this audio stream.",
          });
          return;
        }

        if (typeof event === "object" && event !== null) {
          sendJson(client, event);
        }
      });

      client.on("close", () => {
        clearTimeout(sessionTimer);
        releaseSession();
        if (upstream.readyState === WebSocket.OPEN) {
          upstream.close();
        } else if (upstream.readyState === WebSocket.CONNECTING) {
          upstream.terminate();
        }
      });
      upstream.on("close", (code) => {
        clearTimeout(sessionTimer);
        releaseSession();
        if (client.readyState === WebSocket.OPEN) {
          sendJson(client, { type: "error", message: "Realtime transcription disconnected." });
          client.close(code === 1000 ? 1000 : 1011, "upstream_disconnected");
        }
      });
      upstream.on("error", () => {
        logger.warn(
          { event: "reson8_realtime_connection_failed" },
          "Reson8 realtime connection failed",
        );
        sendJson(client, {
          type: "error",
          message: "Could not connect to the realtime transcription service.",
        });
        if (client.readyState === WebSocket.OPEN) {
          client.close(1011, "upstream_unavailable");
        }
        releaseSession();
      });
    },
  );
}
