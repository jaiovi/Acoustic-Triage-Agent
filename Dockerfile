FROM node:24-slim AS deps
WORKDIR /workspace
RUN corepack enable
RUN corepack prepare pnpm@10.26.1 --activate
COPY . .
RUN pnpm install --frozen-lockfile

FROM node:24-slim AS builder
WORKDIR /workspace
RUN corepack enable
RUN corepack prepare pnpm@10.26.1 --activate
COPY --from=deps /workspace /workspace
ENV PORT=5000
ENV BASE_PATH=/
RUN pnpm run typecheck \
  && pnpm --filter @workspace/acoustic-triage-agent run build \
  && pnpm --filter @workspace/api-server run build

FROM node:24-slim AS runner
WORKDIR /workspace
ENV NODE_ENV=production
ENV PORT=5000
ENV WEB_DIST_DIR=/workspace/artifacts/acoustic-triage-agent/dist/public
COPY --from=deps /workspace/node_modules ./node_modules
COPY --from=builder /workspace/artifacts/api-server/package.json ./artifacts/api-server/package.json
COPY --from=builder /workspace/artifacts/api-server/dist ./artifacts/api-server/dist
COPY --from=builder /workspace/artifacts/acoustic-triage-agent/dist/public ./artifacts/acoustic-triage-agent/dist/public
COPY --from=builder /workspace/lib/api-zod/package.json ./lib/api-zod/package.json
COPY --from=builder /workspace/lib/api-zod/src ./lib/api-zod/src
COPY --from=builder /workspace/lib/db/package.json ./lib/db/package.json
COPY --from=builder /workspace/lib/db/src ./lib/db/src
RUN chown -R node:node /workspace
USER node
EXPOSE 5000
CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]
