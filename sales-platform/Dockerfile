FROM node:22-slim
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY . .
RUN mkdir -p data
ENV PORT=3100
ENV NODE_OPTIONS="--experimental-sqlite"
EXPOSE 3100
CMD ["node", "server.js"]
