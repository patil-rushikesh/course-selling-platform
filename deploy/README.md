# Docker and Kubernetes deployment

Run these commands from the project root. These manifests have not been applied
to a live cluster. You need a running Docker daemon, `kubectl`, a Kubernetes
context, a registry you can push to, and a default StorageClass supporting PVCs.

## 1. Build and publish

Replace the registry/repository and tag with your own. Use a new immutable tag
for each release; do not reuse `latest`.

```sh
export APP_IMAGE=ghcr.io/YOUR_ACCOUNT/course-platform:2026-10-09-2
export FRONTEND_IMAGE=ghcr.io/YOUR_ACCOUNT/course-frontend:2026-10-09-2
docker login ghcr.io
docker buildx build --platform linux/amd64,linux/arm64 --tag "$APP_IMAGE" --push .
docker buildx build --platform linux/amd64,linux/arm64 --tag "$FRONTEND_IMAGE" --push frontend
```

If your registry is private, configure an `imagePullSecret` and reference it
in the backend and frontend Deployments before deploying.

## 2. Select the cluster and create secrets

```sh
kubectl config get-contexts
export KUBE_CONTEXT=YOUR_CLUSTER_CONTEXT
kubectl --context "$KUBE_CONTEXT" apply -f deploy/k8s/namespace.yaml
cp deploy/secrets.example.env deploy/secrets.local.env
```

Edit the ignored `deploy/secrets.local.env`. Generate independent secrets with
`openssl rand -hex 32`. `POSTGRES_PASSWORD` and the password inside `DATABASE_URL`
must match. The default URL uses the internal Service hostname `postgres`.
Keep this file private; do not commit it. For a managed PostgreSQL service,
use its URL and omit the bundled database StatefulSet steps from the script.

```sh
kubectl --context "$KUBE_CONTEXT" -n course-platform create secret generic course-platform-secrets \
  --from-env-file=deploy/secrets.local.env --dry-run=client -o yaml \
  | kubectl --context "$KUBE_CONTEXT" apply -f -
```

Rotating `POSTGRES_PASSWORD` in a Secret does not change the password inside an
already initialized PostgreSQL volume. Coordinate database credential rotation
before replacing the Secret.

## 3. Manage the three containers together

`deploy/k8s/kustomization.yaml` is the common Kubernetes configuration. It manages
one backend Deployment, one PostgreSQL StatefulSet, and one frontend Deployment
in the `course-platform` namespace, with their Services and shared ConfigMap.
Each workload has one replica and one container. There is no migration Job or
init container. Cluster system components and an optional ingress controller
are separate infrastructure, not application containers.

To inspect or apply the shared configuration with the default local image tags:

```sh
kubectl kustomize deploy/k8s
kubectl --context "$KUBE_CONTEXT" apply -k deploy/k8s
```

For the image references exported in step 1, use the deployment script:


```sh
KUBE_CONTEXT="$KUBE_CONTEXT" APP_IMAGE="$APP_IMAGE" FRONTEND_IMAGE="$FRONTEND_IMAGE" ./scripts/deploy-k8s.sh
kubectl --context "$KUBE_CONTEXT" -n course-platform get pods,pvc,services
kubectl --context "$KUBE_CONTEXT" -n course-platform logs deployment/course-platform
kubectl --context "$KUBE_CONTEXT" -n course-platform logs deployment/course-frontend
```

The script checks for the Secret and applies a temporary image overlay to the
common Kustomize configuration. It also removes the obsolete migration Job if
you previously deployed the old version. It does not delete database storage.

The backend waits for PostgreSQL, then runs `prisma migrate deploy` inside its
own container before starting the API. A migration failure stops startup and
keeps the pod unready; inspect the backend logs to diagnose it. Migration CLI
output is included in those logs. Pending migrations are checked on each restart.

The frontend has its own image from `frontend/` and runs Nginx as UID 101 on port
8080. Its `BACKEND_ORIGIN` points to the backend Service. The backend runs as UID
1000 with a read-only filesystem and a writable temporary volume for Prisma.
The database has a 10 GiB PVC and is not exposed outside the cluster.

Both Deployments use `Recreate` to avoid extra app replicas during updates.
Expect brief downtime during a rollout. Keep one replica per workload for this
three-container setup. All resources use the shared
`app.kubernetes.io/part-of=course-platform` label:

```sh
kubectl --context "$KUBE_CONTEXT" -n course-platform get pods,services,pvc
kubectl --context "$KUBE_CONTEXT" -n course-platform logs -f deployment/course-platform -c backend
kubectl --context "$KUBE_CONTEXT" -n course-platform logs -f deployment/course-frontend
```

## 4. Local access or public HTTPS

For a temporary local check without ingress:

```sh
kubectl --context "$KUBE_CONTEXT" -n course-platform set env deployment/course-platform HTTPS_ONLY=false TRUST_PROXY_HOPS=1
kubectl --context "$KUBE_CONTEXT" -n course-platform rollout status deployment/course-platform
kubectl --context "$KUBE_CONTEXT" -n course-platform port-forward service/course-frontend 3000:80
```

Open http://localhost:3000. Before public deployment, restore `HTTPS_ONLY=true`
and the correct trusted-proxy count (the deployment script reapplies these
values from the ConfigMap).

For public access, provision an ingress controller, point your domain's DNS to
its load balancer, and create a valid TLS Secret in `course-platform` (or configure
your certificate manager). Edit `deploy/k8s/ingress.example.yaml` with your domain,
ingress class, and TLS Secret name, then:

```sh
kubectl --context "$KUBE_CONTEXT" -n course-platform set env deployment/course-platform HTTPS_ONLY=true TRUST_PROXY_HOPS=1
kubectl --context "$KUBE_CONTEXT" apply -f deploy/k8s/ingress.example.yaml
```

Adjust proxy trust to the exact number of ingress/load-balancer hops. The ingress sends `/api` and `/health` directly to the API and `/` to the
frontend. This keeps one trusted ingress hop for API requests. Configure
HTTPS redirects in your ingress controller. Verify `/health/ready` through the
public domain and create an instructor account using your invitation key.

## Operations

Before an upgrade, take a database backup. For the bundled database:

```sh
kubectl --context "$KUBE_CONTEXT" -n course-platform exec postgres-0 -- \
  pg_dump -U course -d course_selling -Fc > course_selling.dump
```

Store backups securely off-cluster and test restoration into a separate database.
A persistent volume is not a backup. The single database replica is not highly
available; use managed PostgreSQL or an operator for production HA/backups.

Application-only rollback (requires a schema compatible with the previous image):

```sh
kubectl --context "$KUBE_CONTEXT" -n course-platform rollout undo deployment/course-platform
kubectl --context "$KUBE_CONTEXT" -n course-platform rollout undo deployment/course-frontend
kubectl --context "$KUBE_CONTEXT" -n course-platform rollout status deployment/course-platform
```

Database migrations are not automatically reversed. Review SQL changes and plan
backups/recovery before upgrades. Add monitoring, resource alerts, and shared
rate-limit storage before scaling beyond one application replica. The configured Recreate strategy does not create surge replicas.

## Local Kubernetes with kind (optional)

If you prefer a local test cluster and have Docker and kind installed:

```sh
kind create cluster --name course-platform
export KUBE_CONTEXT=kind-course-platform
export APP_IMAGE=course-platform:local
export FRONTEND_IMAGE=course-frontend:local
docker build -t "$APP_IMAGE" .
docker build -t "$FRONTEND_IMAGE" frontend
kind load docker-image "$APP_IMAGE" "$FRONTEND_IMAGE" --name course-platform
```

Continue with steps 2–4. The image pull policy permits the loaded local image.
Stop with `kind delete cluster --name course-platform` only when you intend to
remove the local cluster and its database storage.

These changes are for testing the commands of merge conflicts.
I am Developer B testing creating changes without taking a pull from main
This is for testing the commands.
I am Developer A trying the create a branch and raising a PR to main Branch
