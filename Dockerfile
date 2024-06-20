FROM node:16.20.2-slim

RUN apt-get update \
    && apt-get install -y openssl gconf-service libgbm-dev libasound2 libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgcc1 libgconf-2-4 libgdk-pixbuf2.0-0 libglib2.0-0 libgtk-3-0 libnspr4 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 ca-certificates fonts-liberation libappindicator1 libnss3 lsb-release xdg-utils wget git

WORKDIR /app

COPY package.json ./

RUN npm cache clean --force
RUN npm i 

RUN npm i whatsapp-web.js@github:pedroslopez/whatsapp-web.js#webpack-exodus

WORKDIR /app/node_modules/whatsapp-web.js
RUN npm i puppeteer@21.1.0

WORKDIR /app

RUN rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*

COPY . ./
RUN rm -rf .wwebjs_auth .wwebjs_cache

EXPOSE 8000

RUN LC_ALL=es_MX.utf8; TZ=":America/Merida"; echo "$(date) ver: $(uuidgen -r)" > /app/build-date.log

CMD npm start 