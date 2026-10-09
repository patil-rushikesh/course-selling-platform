# Course Studio frontend

Standalone React + Vite frontend with a simple navy, white, and gray interface.
It preserves course search, enrollment, student lessons/progress, instructor
course/lesson management, profiles, and password changes. No payments are used.

## Development

Start the backend separately on port 3000, then from the repository root:

```sh
pnpm --dir frontend install --frozen-lockfile
pnpm --dir frontend dev
```

Open http://localhost:5173. Vite proxies `/api` to `http://127.0.0.1:3000`.
To use a different local backend, set `API_PROXY_TARGET` when starting Vite:

```sh
API_PROXY_TARGET=http://127.0.0.1:3035 pnpm --dir frontend dev
```

The frontend has an independent package manifest, lockfile, and pnpm workspace
boundary. Backend installs/builds do not install React or Vite.

```sh
pnpm --dir frontend test
pnpm --dir frontend build
pnpm --dir frontend preview
```

The preview server runs at http://localhost:4173 and uses the same development
API proxy. It is for local verification, not production hosting.

## Container

The multi-stage Dockerfile compiles React with Node and serves only the static
bundle with unprivileged Nginx on port 8080. Nginx proxies `/api` and `/health`
to `BACKEND_ORIGIN` at runtime. The default is `http://backend:3000` for Compose.
`/healthz` checks frontend availability; API readiness is `/health/ready`.

```sh
# From the repository root; starts both frontend and backend containers:
docker compose up --build -d --remove-orphans
```

Open http://localhost:3000. The backend and PostgreSQL remain internal to the
Compose network. See [deployment instructions](../deploy/README.md) for separate
Kubernetes images, Deployments, Services, and ingress routing.

Do not put JWT signing secrets or database credentials in frontend environment
variables. The browser sends the session token as a Bearer header, stores it
per tab in sessionStorage, and clears it on sign-out. The backend owns all
validation, authorization, database access, and structured application logs.
