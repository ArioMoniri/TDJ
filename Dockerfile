# Alternative deploy target (AWS App Runner / ECS / any container host). One image, one command.
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.18.0 --activate
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile
COPY . .
ENV NEXT_OUTPUT=standalone
RUN pnpm --filter @tdj/web build
FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production PORT=3000 TDJ_DATA_ROOT=/app
COPY --from=base /app/apps/web/.next/standalone ./
COPY --from=base /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=base /app/apps/web/public ./apps/web/public
COPY --from=base /app/data ./data
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
