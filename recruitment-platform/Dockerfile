FROM node:22-slim

RUN apt-get update && apt-get install -y python3 python3-pip python3-venv && \
    pip3 install --break-system-packages playwright && \
    python3 -m playwright install chromium --with-deps && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
COPY server.js normalize.js db.js db-factory.js db-postgres.js seed.js migrate-to-postgres.js ./
COPY lib/ ./lib/
COPY public/ ./public/
COPY templates.js ./
COPY scripts/ ./scripts/

RUN mkdir -p data

EXPOSE 3000

ENV NODE_OPTIONS="--experimental-sqlite"
ENV PORT=3000

CMD ["node", "server.js"]
