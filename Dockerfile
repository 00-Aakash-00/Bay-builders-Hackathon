# CustomerZero engine worker (InsForge Custom Compute)
FROM node:24-slim
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json next-env.d.ts ./
COPY worker ./worker
COPY src ./src
ENV WORKER_PORT=8080
ENV WORKER_HOST=0.0.0.0
EXPOSE 8080
CMD ["pnpm", "worker"]
