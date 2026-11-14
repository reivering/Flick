FROM node:24-bookworm-slim

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force \
    && mkdir -p /app/data && chown node:node /app/data
COPY --chown=node:node server.js ./
COPY --chown=node:node public ./public

ENV NODE_ENV=production PORT=3000 FLICK_DATA_DIR=/app/data
USER node
EXPOSE 3000
CMD ["node", "server.js"]
