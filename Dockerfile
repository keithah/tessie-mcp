FROM node:20-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY . .
RUN npm run build:shttp

FROM node:20-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8081

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY --from=build /app/.smithery/shttp /app/.smithery/shttp
RUN chown -R node:node /app
USER node

EXPOSE 8081

CMD ["node", ".smithery/shttp/index.cjs"]