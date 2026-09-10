FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY frontend/package*.json frontend/
COPY backend/package*.json backend/
RUN npm ci
COPY . .
RUN npm run build -w frontend

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/frontend/.next/standalone ./
COPY --from=build /app/frontend/.next/static ./frontend/.next/static
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD wget -q -O - http://localhost:3000/ || exit 1
CMD ["node", "frontend/server.js"]
