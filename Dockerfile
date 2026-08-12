# ---- build frontend ----
FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html ./
COPY tsconfig.json tsconfig.app.json tsconfig.node.json ./
COPY vite.config.ts ./
COPY public ./public
COPY src ./src
COPY server ./server

RUN npm run build

# ---- run API + static UI ----
FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
# Render sets PORT at runtime; 3001 is local default
ENV PORT=3001

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY server ./server

EXPOSE 3001
CMD ["npm", "start"]
