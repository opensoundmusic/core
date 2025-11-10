FROM node:18-bookworm

RUN apt-get update && apt-get install -y \
    python3 \
    python3-venv \
    python3-distutils \
    ffmpeg \
    chromium \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    xdg-utils \
    wget \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_ARGS="--no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage --disable-gpu --disable-software-rasterizer --single-process"

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 1212
EXPOSE 1214
EXPOSE 8080

CMD ["node", "server.mjs"]
