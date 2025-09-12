FROM node:18 AS build

WORKDIR /app

COPY package.json /app
COPY package-lock.json /app
COPY build /app/build
RUN npm install
EXPOSE 3000
# RUN node build/index.js
CMD ["node", "build/index.js"]
