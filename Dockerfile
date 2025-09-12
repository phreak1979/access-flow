# ---- build stage ----
FROM node:20-alpine AS build
WORKDIR /app

# optional: declare build-time args for PUBLIC_ vars (no secrets!)
ARG PUBLIC_API_URL
ENV PUBLIC_API_URL=$PUBLIC_API_URL

COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- production stage ----
FROM node:20-alpine AS prod
WORKDIR /app

# copy only what you need to run
COPY --from=build /app/build ./build
COPY --from=build /app/package*.json ./

# install only runtime deps for the built server
WORKDIR /app/build
RUN npm ci --omit=dev

EXPOSE 3000
ENV NODE_ENV=production
CMD ["node", "index.js"]
