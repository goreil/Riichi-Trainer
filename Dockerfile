# Stage 1: build the Create-React-App static bundle.
# node:16 ships OpenSSL 1.1.1, so react-scripts 3.4.4 / webpack 4 builds
# without the --openssl-legacy-provider workaround needed on newer Node.
FROM node:16-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: serve the static bundle.
FROM nginx:alpine
COPY deploy/nginx-spa.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/build /usr/share/nginx/html
