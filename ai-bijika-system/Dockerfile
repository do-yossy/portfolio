FROM node:22-slim
WORKDIR /app
COPY . .
RUN mkdir -p data
ENV PORT=3300
ENV NODE_OPTIONS="--experimental-sqlite"
EXPOSE 3300
CMD ["node", "server.js"]
