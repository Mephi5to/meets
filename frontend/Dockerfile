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
# Also does SNI-based multiplexing on 443 so TURN subdomain traffic
# reaches coturn directly — making TURNS indistinguishable from HTTPS.
FROM nginx:alpine AS production
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf
RUN rm -f /etc/nginx/conf.d/default.conf
EXPOSE 80 443
CMD ["nginx", "-g", "daemon off;"]
