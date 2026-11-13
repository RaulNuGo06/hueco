# 1. Compilar
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

# 2. Lo que se ejecuta: el JavaScript compilado, las dependencias de producción y las migraciones
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/dist dist
COPY --from=build /app/drizzle drizzle
USER node
EXPOSE 3000
# Aplica las migraciones que falten y arranca
CMD ["node", "dist/main.js"]
