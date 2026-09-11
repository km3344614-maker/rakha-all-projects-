FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
RUN chown -R 1001:1001 /app && chmod -R 777 /app
EXPOSE 3000
CMD ["npm", "start"]
