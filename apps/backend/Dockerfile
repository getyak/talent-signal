FROM node:24-bookworm-slim

RUN npm install --global pnpm@11.18.0

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json

RUN pnpm install --frozen-lockfile --ignore-scripts --filter @talent-signal/backend...

COPY packages/contracts packages/contracts
COPY apps/backend apps/backend
COPY evals/candidate-momentum-v1.json evals/candidate-momentum-v1.json

RUN pnpm --filter @talent-signal/backend build

ENV NODE_ENV=development
EXPOSE 4317

CMD ["node", "apps/backend/dist/server.js"]
