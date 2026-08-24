FROM node:22-bookworm-slim AS build

WORKDIR /app

RUN npm install -g pnpm@10.15.1

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.json tsconfig.base.json ./
COPY lib ./lib
COPY scripts ./scripts
COPY artifacts ./artifacts

ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}
ENV BASE_PATH=/
ENV PORT=8080
ENV NODE_ENV=production

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @workspace/frontend run build

FROM nginx:1.27-alpine

RUN apk add --no-cache gettext

COPY artifacts/frontend/nginx.conf.template /etc/nginx/default.conf.template
COPY artifacts/frontend/start-nginx.sh /start-nginx.sh
RUN chmod +x /start-nginx.sh
COPY --from=build /app/artifacts/frontend/dist/public /usr/share/nginx/html

EXPOSE 8080

CMD ["/start-nginx.sh"]
