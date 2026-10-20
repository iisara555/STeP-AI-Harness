FROM node:24-bookworm-slim AS build
WORKDIR /build
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm install --prefix /tools --no-package-lock --ignore-scripts=false esbuild@0.25.12
COPY gateway/receipt gateway/receipt
COPY desktop/electron desktop/electron
COPY desktop/src desktop/src
COPY src/modules/providers/usage.js src/modules/providers/usage.js
RUN /tools/node_modules/.bin/esbuild gateway/receipt/run.ts --bundle --platform=node --format=esm --target=node24 --outfile=/build/server.mjs
FROM node:24-bookworm-slim
ENV NODE_ENV=production PORT=8080
WORKDIR /app
COPY --from=build /build/server.mjs /app/server.mjs
USER node
EXPOSE 8080
CMD ["node", "server.mjs"]
