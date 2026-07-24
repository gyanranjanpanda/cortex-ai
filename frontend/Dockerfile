FROM node:20-alpine AS builder

WORKDIR /app

# Copy package.json from frontend/ folder
COPY frontend/package*.json ./
RUN npm ci

# Copy all source files from frontend/ folder
COPY frontend/ ./

# Bake production environment variables at build time
ENV VITE_SERVER_URL=https://cortex-ai-production-b653.up.railway.app
ENV VITE_FIREBASE_API_KEY=AIzaSyD5CDYsJnDgY48ZPbTaqI5wFjoZXhIz8WA

RUN npm run build

# Production: serve with nginx (Railway-compatible, handles $PORT correctly)
FROM nginx:alpine

# Remove default nginx config
RUN rm -f /etc/nginx/conf.d/default.conf

# Create templates directory and write a template nginx config that uses $PORT
RUN mkdir -p /etc/nginx/templates && \
    printf 'server {\n  listen ${PORT};\n  root /usr/share/nginx/html;\n  index index.html;\n  location / {\n    try_files $uri $uri/ /index.html;\n  }\n}\n' > /etc/nginx/templates/default.conf.template

COPY --from=builder /app/dist /usr/share/nginx/html

# EXPOSE is optional but good practice
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
