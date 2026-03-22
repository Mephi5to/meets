FROM node:20-alpine AS builder
WORKDIR /app

ARG VITE_SIGNALING_URL
ARG VITE_FORCE_RELAY=true
ENV VITE_SIGNALING_URL=$VITE_SIGNALING_URL
ENV VITE_FORCE_RELAY=$VITE_FORCE_RELAY

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production: nginx serves static files and proxies /api + /hub → backend
FROM nginx:alpine AS production
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
