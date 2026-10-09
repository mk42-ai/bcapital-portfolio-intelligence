# syntax=docker/dockerfile:1
# B Capital Portfolio Intelligence API — OnDemand serverless container.
# Same pattern as the account's other serverless apps (unity-webgl-agent-api / atrium-fp-pipeline):
# single container, listens on PORT (3000), served behind https://serverless.on-demand.io/apps/<endpoint-name>.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json drizzle.config.ts ./
COPY src/ src/
COPY scripts/ scripts/
COPY drizzle/ drizzle/
COPY data/seed.json data/seed.json
RUN npx tsc -p tsconfig.json \
 && npx tsx scripts/migrate.ts \
 && npx tsx scripts/seed.ts data/seed.json \
 && npx tsx scripts/write-openapi.ts

FROM node:22-alpine
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY --from=build /app/dist/ dist/
COPY --from=build /app/data/portfolio.sqlite data/portfolio.sqlite
COPY --from=build /app/openapi.json openapi.json
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/health" || exit 1
CMD ["node", "dist/server.js"]
