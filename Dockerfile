# NOTE: This is a super tiny node image 'FROM scratch'.
# If you have trouble, consider Docker.slim

# Node 16 was chosen only because it's the current LTS
FROM node:16-slim as builder

WORKDIR /app

COPY ./package*.json ./

# This operation is cached and will only run if
# any of ./package*.json copied above have changed
RUN npm ci --only=production

# A new image, for deployment
FROM astefanutti/scratch-node:16 as deployable

# Copies node_modules from builder, essentially
COPY --from=builder /app /

# Copy project source code from local dir
COPY ./ ./

# Run the node server
# (note: using ENTRYPOINT rather than CMD because
# this is 'FROM scratch' and has no PATH)
ENTRYPOINT [ "node", "server.js" ]
