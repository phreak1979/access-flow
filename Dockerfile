# ---- build stage ----
FROM node:18 AS build
WORKDIR /app

# copy package manifests and install deps
COPY package*.json ./
RUN npm ci

# copy source and build
COPY . .
RUN npm run build

# ---- production stage ----
FROM node:18-slim AS prod
WORKDIR /app

# copy only built output and runtime files
COPY --from=build /app/build ./build
COPY --from=build /app/package*.json ./

# install only production dependencies
RUN npm ci --omit=dev

EXPOSE 3000
CMD ["node", "build/index.js"]
