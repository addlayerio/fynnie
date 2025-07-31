FROM node:23.11.0-slim AS builder

WORKDIR /app

RUN apt-get update && apt-get upgrade -y && apt-get clean && rm -rf /var/lib/apt/lists/*

COPY package*.json . 

RUN npm install

COPY . .

RUN npm run build

FROM node:23.11.0-slim

WORKDIR /app

RUN apt-get update && apt-get upgrade -y && apt-get clean && rm -rf /var/lib/apt/lists/*

RUN apt-get update && apt-get install -y \
  git \
  sqlite3 \
  build-essential \
  python3 \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json .
RUN npm install --only=production
COPY --chown=node:node --from=builder /app/dist .
COPY --chown=node:node --from=builder /app/scripts .

RUN chmod +x ./entrypoint.sh

ENTRYPOINT ["./entrypoint.sh"]