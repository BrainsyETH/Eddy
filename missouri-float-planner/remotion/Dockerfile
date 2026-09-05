# Prebuilt render image for the Eddy social pipeline: Node + Chrome Headless
# Shell + the Remotion deps and a prebuilt bundle, all baked in. Renders start
# from /app/remotion/build with no `npm ci`, no browser download, and no bundling — which
# turns a multi-minute cold start into seconds. Rebuilt by
# build-remotion-image.yml on changes under remotion/.
FROM node:22-bookworm-slim

# Chrome Headless Shell runtime libraries (Remotion's documented Linux deps),
# plus tools the render jobs shell out to that the -slim base omits:
#   curl + ca-certificates  -> Vercel Blob upload
#   ffmpeg                  -> full decode + frozen-frame validation (the
#                              Remotion binary omits freezedetect)
#   jq                      -> parse the Blob response
#   bc + gawk               -> audio/video gate arithmetic and parsing
RUN apt-get update && apt-get install -y --no-install-recommends \
      libnss3 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 libasound2 \
      libxkbcommon0 libgbm1 libxrandr2 libxfixes3 libxcomposite1 libxdamage1 \
      libpango-1.0-0 libcairo2 libcups2 fonts-liberation \
      curl ca-certificates jq bc gawk ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/remotion

# Remotion ships + manages its own Chrome Headless Shell; never let Puppeteer
# download a second browser.
ENV PUPPETEER_SKIP_DOWNLOAD=true

# Install deps first so the layer cache survives source-only changes.
COPY remotion/package*.json ./
RUN npm ci

# Bake the project source, the Chrome Headless Shell, and a prebuilt bundle.
# `remotion bundle` embeds ./public (fonts, eddy PNGs, audio) into ./build, so
# renders need neither --public-dir nor a checkout.
COPY remotion/ .
# Remotion deliberately imports the product's canonical shared social tokens
# rather than carrying a second copy. Preserve the repository-relative layout
# inside the image so those imports resolve during bundling.
COPY shared/ ../shared/
RUN npx remotion browser ensure
RUN npx remotion bundle src/index.ts --out-dir=build

# Renders run from the baked bundle, e.g.:
#   npx remotion render /app/remotion/build <composition-id> /tmp/out.mp4 --props=/tmp/props.json
