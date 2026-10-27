FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json server.mjs ./
COPY lib ./lib
COPY public ./public
COPY database ./database
USER node
EXPOSE 3000
CMD ["node", "server.mjs"]
