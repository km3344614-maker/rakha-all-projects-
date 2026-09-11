FROM nikolaik/python-nodejs:python3.10-nodejs18

WORKDIR /app

# Copy full source first so the client build has real src/
COPY . .

# Install deps without running postinstall build twice
RUN npm install --ignore-scripts \
 && cd client && npm install \
 && npm run build \
 && cd /app

# Optional Discord bot deps
RUN if [ -f bot/requirements.txt ]; then pip install --no-cache-dir -r bot/requirements.txt; fi

RUN chmod +x start-all.sh
RUN chown -R pn:pn /app

USER pn

EXPOSE 5050

CMD ["./start-all.sh"]
