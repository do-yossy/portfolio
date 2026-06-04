FROM node:22-slim
WORKDIR /app
COPY package.json ./
# 依存ゼロ（標準ライブラリのみ）。将来 pg を使う場合はここで npm install。
COPY . .
RUN mkdir -p data
ENV PORT=3100
EXPOSE 3100
CMD ["node", "server.js"]
