# syntax=docker/dockerfile:1
# ============================================================================
# Imagen del frontend, con dos destinos:
#   --target development -> servidor de Vite con recarga en caliente
#   --target production   -> build estático servido por Nginx
# ============================================================================

# --- Desarrollo -------------------------------------------------------------
FROM node:20.17-alpine AS development

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 5173
CMD ["npm", "run", "dev"]


# --- Build ------------------------------------------------------------------
FROM node:20.17-alpine AS build

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .

# Vite congela estas variables dentro del bundle en tiempo de build, no de
# ejecución: por eso llegan como argumentos y no como variables de entorno del
# contenedor final.
ARG VITE_API_BASE_URL
ARG VITE_GOOGLE_MAPS_API_KEY
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_GOOGLE_MAPS_API_KEY=$VITE_GOOGLE_MAPS_API_KEY

RUN npm run build


# --- Producción -------------------------------------------------------------
FROM nginx:1.27-alpine AS production

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q --spider http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
