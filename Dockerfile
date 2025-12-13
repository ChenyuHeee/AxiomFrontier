# Minimal production image
FROM node:20-slim AS base
WORKDIR /app

# Install deps separately for better caching
COPY package.json package-lock.json* tsconfig.json ./
RUN npm install --production=false

COPY src ./src
COPY README.md .
RUN npm run build

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/dist ./dist
COPY package.json .

EXPOSE 8787
CMD ["node", "dist/index.js"]
