FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY frontend/package*.json frontend/
COPY backend/package*.json backend/
RUN npm ci
COPY . .
RUN npm run build -w backend

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/backend/package.json ./backend/package.json
COPY --from=build /app/backend/drizzle ./backend/drizzle
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD wget -q -O - http://localhost:4000/ready || exit 1
CMD ["sh", "-c", "node backend/dist/db/migrate.js && node backend/dist/server.js"]
