FROM node:22-bookworm-slim AS build

WORKDIR /app

RUN npm install -g pnpm@10.15.1

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.json tsconfig.base.json ./
COPY lib ./lib
COPY scripts ./scripts
COPY artifacts ./artifacts

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @workspace/api-server run build

FROM node:22-bookworm-slim

WORKDIR /app

RUN npm install -g pnpm@10.15.1

COPY --from=build /app /app

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["sh", "-c", "CI=true pnpm --filter @workspace/db exec drizzle-kit push --config ./drizzle.config.ts && node artifacts/api-server/dist/index.mjs"]
