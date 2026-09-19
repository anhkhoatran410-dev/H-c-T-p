FROM node:22-alpine
WORKDIR /app
COPY worker/package.json ./worker/package.json
COPY worker/ai-worker.js ./worker/ai-worker.js
COPY lib ./lib
COPY api ./api
COPY supabase ./supabase
CMD ["node","worker/ai-worker.js"]
