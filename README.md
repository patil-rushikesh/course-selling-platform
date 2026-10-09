# Course Studio

A course platform with a separate React student/instructor frontend, an Express API,
Prisma 7, and PostgreSQL. All enrollment is free; no payment provider is used.
The legacy `price` field remains metadata and never triggers a charge.

Students can register, sign in, search courses, enroll, read lessons, follow
video links, track completion, and manage profiles/passwords. Instructors can
create courses, publish/unpublish them, manage ordered lessons, and view course
and enrollment counts. Admin registration requires an invitation key.

## Local development

Use Node.js 22.12+ or 24+ and pnpm 12.10.1. With Corepack installed, enable it
with `corepack enable`. Create a PostgreSQL database first.

```sh
cp .env.example .env
# Edit DATABASE_URL and replace the JWT secrets and ADMIN_SIGNUP_KEY.
pnpm install --frozen-lockfile
pnpm db:deploy
pnpm dev
```

In a second terminal, start the React frontend:

```sh
pnpm --dir frontend install --frozen-lockfile
pnpm --dir frontend dev
```

Open http://localhost:5173. The Vite development server proxies `/api` to the
backend at port 3000. Choose **Create a new account**, then **Instructor /
admin**, and enter your `ADMIN_SIGNUP_KEY` to create an instructor. Use a student
account to enroll and learn. Keep the invitation key private; every account
created with it can manage its own courses. There is no global super-admin role.

The browser keeps its session in sessionStorage (per tab). Password changes and
sign-out revoke all of the account's issued tokens. Tokens expire after seven
days. Registration/sign-in/password-change endpoints have an IP rate limit of
50 requests per 15 minutes. The limiter is per process; use a shared store and
edge rate limits before running multiple replicas.

`pnpm build` generates Prisma Client; `pnpm start` starts the API server.
The backend no longer serves HTML or frontend assets.
`pnpm --dir frontend build` produces the React production bundle. Production
requires distinct user/admin JWT secrets and an admin invitation key, each at
least 32 characters. Startup rejects the example placeholder secrets.

## Docker Compose

Start Docker Desktop/the Docker daemon first. In `.env`, use independent random
JWT secrets, an admin invitation key, and a URL-safe `POSTGRES_PASSWORD` (for
example, generate each with `openssl rand -hex 32`). Compose constructs its own
internal `DATABASE_URL` using this password.

```sh
docker compose up --build -d --remove-orphans
docker compose logs -f backend frontend
```

Open http://localhost:3000. The `frontend` container runs Nginx on port 8080 and
proxies `/api` to the internal `backend:3000` backend. Only the frontend port is
published; no browser CORS configuration or public API URL is required.
The frontend contains no database or JWT secrets. PostgreSQL is private to the Compose network and its
data lives in a named volume. The backend waits for PostgreSQL, applies pending migrations inside its own
container, and starts the API only after they succeed. There are exactly three
services: `backend`, `database`, and `frontend`. `--remove-orphans` removes the
old `app`/`migrate` containers from earlier versions while preserving volumes.
After pulling new code:

```sh
docker compose build
docker compose up -d --remove-orphans backend frontend
```

Stop with `docker compose down`; this preserves the database volume. Do not add
`--volumes` unless you intend to delete the database. Compose binds the web port
to loopback and disables HTTPS enforcement for local use.

## Kubernetes

See [deployment commands](deploy/README.md) for image publishing, Secret creation,
migration ordering, rollout, TLS ingress, backups, and rollback instructions.
The manifests include a single PostgreSQL StatefulSet with a persistent volume,
one database StatefulSet and separate non-root API and frontend Deployments/Services, with
an optional TLS Ingress. `/api` and `/health` route to the backend; `/` routes to
the React frontend.
They are a single-instance starting point, not a highly available database.

## API

Base path: `/api/v1`. Authenticated requests use `Authorization: Bearer <token>`.
Raw tokens remain accepted for compatibility. Responses preserve `_id` aliases
alongside UUID `id` fields. JSON errors have a `message` property.

| Method | Path | Access / purpose |
| --- | --- | --- |
| POST | `/user/signup`, `/user/signin` | Student registration/sign-in |
| POST | `/admin/signup` | Register instructor; requires `X-Admin-Signup-Key` |
| POST | `/admin/signin` | Instructor sign-in |
| GET | `/user/me`, `/admin/me` | Own profile; never returns password hashes |
| PATCH | `/user/me`, `/admin/me` | Update `firstName` and/or `lastName` |
| PATCH | `/user/me/password`, `/admin/me/password` | `currentPassword`, `newPassword`; revokes sessions |
| POST | `/user/logout`, `/admin/logout` | Revoke all own sessions |
| GET | `/course` | Public paginated course search |
| GET | `/course/preview` | Legacy public published-course list |
| GET | `/course/:id` | Public published-course details |
| POST | `/course/purchase` | Student free enrollment; body: `{ "courseId": "UUID" }` |
| GET | `/user/purchases` | Own enrolled courses |
| GET | `/user/courses/:id/lessons` | Enrolled student lesson content and completion |
| GET | `/user/courses/:id/progress` | Enrolled student's total/completed/percent |
| PUT | `/user/courses/:id/lessons/:lessonId/progress` | `{ "completed": true }` or `false` |
| POST | `/admin/course` | Create own course |
| GET | `/admin/course/view-all` | List own courses, including drafts |
| PUT | `/admin/course/:id` | Update own course fields, including `published` |
| DELETE | `/admin/course/:id` | Delete own course with no enrollments |
| GET | `/admin/dashboard` | Own course/enrollment counts |
| GET, POST | `/admin/course/:id/lessons` | List/create own course lessons |
| PATCH, DELETE | `/admin/course/:id/lessons/:lessonId` | Edit/delete own course lesson |

Search accepts `q`, `page` (default 1), `limit` (default 20, maximum 100),
`minPrice`, `maxPrice`, and `sort` (`title`, `price_asc`, `price_desc`). Price
filters apply to legacy metadata. Results include `pagination` with total and
totalPages. Sort ties are ordered by UUID for stable pagination.

A course has `title` (3+ characters), `description` (10+), `imageURL` (URL),
`price` (nonnegative, up to two decimal places), and optional `published`.
The UI creates drafts unless the publish checkbox is selected. The API retains
`published=true` by default for existing clients. Unpublishing removes courses
from discovery/new enrollment; existing students retain lesson access.

A lesson has `title` (3–200 characters), `content` (1–50,000 characters),
`position` (integer 0–10,000, unique within the course), and optional nullable
`videoURL` (HTTP/HTTPS). Lesson content is rendered as text, not executable HTML.
Video links point to externally hosted resources; there is no media upload.

Invalid input returns 400, invalid/missing authentication or enrollment returns
403, missing/other-owner records return 404, and duplicate signups, duplicate
lesson positions, or deletion of an enrolled course return 409. Duplicate
enrollment returns 400 for compatibility, including concurrent requests.

`GET /health/live` checks process health. `GET /health/ready` checks PostgreSQL.
Unknown routes return a JSON 404. Security headers, request body limits, and
auth rate limiting are enabled. TLS is terminated at ingress in Kubernetes;
configure `TRUST_PROXY_HOPS` to match your actual proxy topology.

## Database and tests

```sh
# After editing prisma/schema.prisma:
pnpm db:migrate --name describe_change
pnpm db:generate
# Inspect the database:
pnpm db:studio
```

Commit the schema, migration SQL, and pnpm lockfile. Deployment uses
`pnpm db:deploy`, never `migrate dev`. Install dev dependencies in the build and
backend image because Prisma CLI runs migrations during container startup. Generated client files are ignored.

Use a dedicated PostgreSQL test database:

```sh
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/course_selling_test pnpm db:deploy
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/course_selling_test pnpm test
```

Tests cover HTTP auth, admin registration, profiles, token revocation, search,
drafts, ownership, lesson CRUD, enrollment, progress, concurrency, foreign keys,
and health/API-only responses. Test records are deleted afterward. Without
`TEST_DATABASE_URL`, the integration test is skipped. GitHub Actions provisions
PostgreSQL, runs backend and frontend tests, and builds both containers.
Frontend development and container details are in [frontend/README.md](frontend/README.md).

The MongoDB-to-SQL migration does not copy existing MongoDB data. A separate
import with ObjectId-to-UUID mapping is required if old records must be kept.

## Remaining operational work

Live deployment needs a running Docker daemon, Kubernetes cluster, registry,
DNS, and TLS certificate. Email verification/password-reset email, payment
processing, uploaded video storage, and multi-instance rate-limit storage are
not implemented. Password changes require the current password.

At migration time, `pnpm audit` reported three advisories (two high, one moderate)
in Prisma tooling's transitive `deepmerge-ts` and `mysql2` dependencies. These
findings are not suppressed. Review and update the tooling before a public
production launch.

## Monitoring logs

The backend writes one JSON object per line to stdout for Docker/Kubernetes log
collection. Each record includes `timestamp`, `level`, `service`, and `event`.
HTTP logs include a generated `requestId` (also returned in `X-Request-ID`),
method, matched route template, status, and `durationMs`. Controller events share
that request ID. Authenticated actions include the internal account ID.

Events cover request completion/aborts, request failures, authentication denials,
rate limits, signups/signins, session revocation, profile/password changes,
course/lesson changes, enrollment, lesson progress, database readiness failures,
and startup/shutdown. Successful persistence is logged only after the write.
These are operational logs, not a durable transactional audit ledger.

Set `LOG_LEVEL` to `debug`, `info` (default), `warn`, `error`, `fatal`, or `silent`.
An invalid level falls back to `info`. Requests taking at least
`LOG_SLOW_REQUEST_MS` (default 1000) log at `warn`, as do 4xx responses and aborted
requests; 5xx responses log at `error`. Successful health checks are suppressed
unless `LOG_HEALTH_CHECKS=true`; failed health checks are always eligible to log.
Raw URLs/query strings, bodies, headers, passwords, tokens, emails, lesson
content, SQL parameters, and database URLs are not logged. Error records contain
only their type/code, because messages and stacks may contain sensitive values.

```sh
docker compose logs -f backend
kubectl --context "$KUBE_CONTEXT" -n course-platform logs -f deployment/course-platform
# With jq installed, select failed requests from Kubernetes logs:
kubectl --context "$KUBE_CONTEXT" -n course-platform logs deployment/course-platform \
  | jq -c 'select(.level == "error" or .level == "fatal")'
```

Configure your cluster log collector (for example, your existing Loki or cloud
logging agent) to parse the JSON. No external monitoring service is provisioned.
