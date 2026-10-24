import { existsSync } from "node:fs";
import path from "node:path";
import express, { type Express } from "express";
import cors from "cors";
import multer from "multer";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
const allowedOrigins = process.env["CORS_ORIGIN"]
  ?.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
app.use(
  cors({
    origin: allowedOrigins?.length ? allowedOrigins : false,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  }),
);
const apiContentSecurityPolicy =
  "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";
const webContentSecurityPolicy =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' ws: wss:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";
app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    req.path.startsWith("/api/")
      ? apiContentSecurityPolicy
      : webContentSecurityPolicy,
  );
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "microphone=(self)");
  next();
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);
const webDistDir = process.env["WEB_DIST_DIR"];
if (webDistDir && existsSync(path.join(webDistDir, "index.html"))) {
  app.use(express.static(webDistDir, { index: false }));
  app.get("/{*splat}", (req, res, next) => {
    if (req.path.startsWith("/api/")) {
      next();
      return;
    }
    res.sendFile(path.join(webDistDir, "index.html"));
  });
}
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "API route not found." });
});
app.use(
  (
    error: unknown,
    req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    if (error instanceof multer.MulterError) {
      const tooLarge = error.code === "LIMIT_FILE_SIZE";
      res.status(tooLarge ? 413 : 400).json({
        error: tooLarge
          ? "Audio files must be 8 MB or smaller."
          : "The audio upload could not be processed.",
      });
      return;
    }
    if (
      error instanceof Error &&
      error.message === "Only WAV and MP3 audio files are accepted."
    ) {
      res.status(400).json({ error: error.message });
      return;
    }

    req.log.error({ err: error }, "Unhandled API request error");
    res.status(500).json({ error: "An unexpected server error occurred." });
  },
);

export default app;
