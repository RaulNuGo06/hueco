# Imagen de la demo pública: la web y la API en un solo servicio (la API sirve la web en el mismo origen).
# Para desarrollo y la CI de siempre está docker compose, con la web en nginx.
#   docker build -t hueco .
#   docker run -p 3000:3000 -e DATABASE_URL=postgres://... -e COOKIE_SEGURA=false hueco

# 1. Compilar la web
FROM node:24-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ .
RUN npm run build

# 2. Compilar la API
FROM node:24-alpine AS api
WORKDIR /app
COPY api/package.json api/package-lock.json ./
RUN npm ci
COPY api/ .
RUN npm run build && npm prune --omit=dev

# 3. Lo que se ejecuta: la API compilada, sus migraciones y la web
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV CARPETA_WEB=/app/web
COPY --from=api /app/package.json ./
COPY --from=api /app/node_modules node_modules
COPY --from=api /app/dist dist
COPY --from=api /app/drizzle drizzle
COPY --from=web /web/dist web
USER node
EXPOSE 3000
# Aplica las migraciones que falten y arranca
CMD ["node", "dist/main.js"]
