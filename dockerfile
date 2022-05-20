FROM node:18-alpine3.14
RUN apk add --update git
WORKDIR /usr/app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
RUN npm run tsc
WORKDIR /usr/app/dist
CMD npm run register-global-commands ; node bot.js
