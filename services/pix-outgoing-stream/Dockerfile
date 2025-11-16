FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm install --production=false
COPY tsconfig.json vitest.config.ts .
COPY src ./src
COPY tests ./tests
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=base /app/package*.json ./
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/dist ./dist
COPY .env.example ./
CMD ["node", "dist/server.js"]
