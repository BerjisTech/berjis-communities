# Build stage
FROM node:20-alpine AS build
WORKDIR /workspace
COPY clients/angular-auth ./clients/angular-auth
WORKDIR /workspace/communities/frontend
COPY communities/frontend/package.json ./package.json
COPY communities/frontend/yarn.lock ./yarn.lock
RUN corepack enable \
 && if [ -f yarn.lock ]; then yarn install --immutable; else yarn install; fi \
 && ln -s /workspace/communities/frontend/node_modules /workspace/node_modules
COPY communities/frontend/ .
RUN yarn build

# Runtime stage
FROM nginx:1.27-alpine
COPY --from=build /workspace/communities/frontend/dist/communities/browser /usr/share/nginx/html
COPY communities/frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
