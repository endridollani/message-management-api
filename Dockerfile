FROM node:22-alpine AS deps

WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
ENV CI=true

RUN corepack enable && corepack prepare pnpm@11.1.1 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build

COPY . .
RUN pnpm run build && pnpm prune --prod

FROM node:22-alpine AS runtime-base

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist

USER node

FROM runtime-base AS api
EXPOSE 3000
CMD ["node", "dist/apps/api/apps/api/src/main.js"]

FROM runtime-base AS outbox-publisher
EXPOSE 3001
CMD ["node", "dist/apps/outbox-publisher/apps/outbox-publisher/src/main.js"]

FROM runtime-base AS search-indexer
EXPOSE 3002
CMD ["node", "dist/apps/search-indexer/apps/search-indexer/src/main.js"]

FROM runtime-base AS cli
ENTRYPOINT ["node", "dist/apps/cli/apps/cli/src/main.js"]
