# [[Digital Wall DevOps Pipeline]] - CI-CD Implementation

## Overview & Core Concepts

The **Digital Wall DevOps Pipeline** orchestrates continuous integration, deployment, and monitoring across all [[Digital Wall]] components, ensuring reliable delivery from development to production. This document covers advanced CI/CD patterns, infrastructure automation, and production deployment strategies.

### Pipeline Architecture Components
- **[[Multi-Environment Strategy]]**: Development, staging, and production environments
- **[[Container Orchestration]]**: Docker-based deployments with Kubernetes
- **[[Automated Testing]]**: Comprehensive test automation across all components
- **[[Security Integration]]**: Security scanning and compliance validation
- **[[Monitoring & Observability]]**: Real-time system monitoring and alerting

## Technical Deep Dive

### GitHub Actions Workflow Configuration

```yaml
# .github/workflows/digital-wall-ci-cd.yml - Main CI/CD pipeline
name: Digital Wall CI/CD Pipeline

on:
  push:
    branches: [main, develop]
    paths-ignore:
      - 'docs/**'
      - '*.md'
  pull_request:
    branches: [main]
  workflow_dispatch:
    inputs:
      environment:
        description: 'Deployment environment'
        required: true
        default: 'staging'
        type: choice
        options:
          - staging
          - production

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: digitalwall
  NODE_VERSION: '18'
  PYTHON_VERSION: '3.11'

jobs:
  detect-changes:
    runs-on: ubuntu-latest
    outputs:
      frontend: ${{ steps.changes.outputs.frontend }}
      backend: ${{ steps.changes.outputs.backend }}
      mobile: ${{ steps.changes.outputs.mobile }}
      infrastructure: ${{ steps.changes.outputs.infrastructure }}
    steps:
      - uses: actions/checkout@v4
      - uses: dorny/paths-filter@v2
        id: changes
        with:
          filters: |
            frontend:
              - 'frontend/**'
              - 'shared/**'
            backend:
              - 'backend/**'
              - 'shared/**'
            mobile:
              - 'mobile/**'
              - 'shared/**'
            infrastructure:
              - 'infrastructure/**'
              - 'k8s/**'
              - 'docker/**'

  # Frontend Pipeline
  frontend-ci:
    needs: detect-changes
    if: needs.detect-changes.outputs.frontend == 'true'
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: ./frontend

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
          cache-dependency-path: frontend/package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: Type checking
        run: npm run type-check

      - name: Lint code
        run: npm run lint

      - name: Run unit tests
        run: npm run test:unit -- --coverage

      - name: Upload coverage reports
        uses: codecov/codecov-action@v3
        with:
          files: ./frontend/coverage/lcov.info
          flags: frontend

      - name: Build application
        run: npm run build
        env:
          NODE_ENV: production
          NEXT_PUBLIC_API_URL: ${{ secrets.API_URL }}
          NEXT_PUBLIC_SENTRY_DSN: ${{ secrets.SENTRY_DSN }}

      - name: Build Docker image
        run: |
          docker build -t ${{ env.REGISTRY }}/${{ github.repository_owner }}/${{ env.IMAGE_NAME }}-frontend:${{ github.sha }} .
          docker build -t ${{ env.REGISTRY }}/${{ github.repository_owner }}/${{ env.IMAGE_NAME }}-frontend:latest .

      - name: Run security scan
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: ${{ env.REGISTRY }}/${{ github.repository_owner }}/${{ env.IMAGE_NAME }}-frontend:${{ github.sha }}
          format: 'sarif'
          output: 'trivy-results.sarif'

      - name: Upload security scan results
        uses: github/codeql-action/upload-sarif@v2
        if: always()
        with:
          sarif_file: 'trivy-results.sarif'

  # Backend Pipeline
  backend-ci:
    needs: detect-changes
    if: needs.detect-changes.outputs.backend == 'true'
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: ./backend

    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: test_digitalwall
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432

      redis:
        image: redis:7
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 6379:6379

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Python
        uses: actions/setup-python@v4
        with:
          python-version: ${{ env.PYTHON_VERSION }}

      - name: Install Poetry
        uses: snok/install-poetry@v1
        with:
          virtualenvs-create: true
          virtualenvs-in-project: true

      - name: Load cached dependencies
        uses: actions/cache@v3
        with:
          path: backend/.venv
          key: venv-${{ runner.os }}-${{ env.PYTHON_VERSION }}-${{ hashFiles('backend/poetry.lock') }}

      - name: Install dependencies
        run: poetry install --with dev

      - name: Code formatting check
        run: poetry run black --check .

      - name: Import sorting check
        run: poetry run isort --check-only .

      - name: Type checking
        run: poetry run mypy .

      - name: Security scan
        run: poetry run bandit -r app/

      - name: Run tests
        run: poetry run pytest --cov=app --cov-report=xml
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test_digitalwall
          REDIS_URL: redis://localhost:6379/0
          ANTHROPIC_API_KEY: test-key

      - name: Upload coverage reports
        uses: codecov/codecov-action@v3
        with:
          files: ./backend/coverage.xml
          flags: backend

      - name: Build Docker image
        run: |
          docker build -t ${{ env.REGISTRY }}/${{ github.repository_owner }}/${{ env.IMAGE_NAME }}-backend:${{ github.sha }} .
          docker build -t ${{ env.REGISTRY }}/${{ github.repository_owner }}/${{ env.IMAGE_NAME }}-backend:latest .

  # Mobile Pipeline
  mobile-ci:
    needs: detect-changes
    if: needs.detect-changes.outputs.mobile == 'true'
    runs-on: macos-latest
    defaults:
      run:
        working-directory: ./mobile

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
          cache-dependency-path: mobile/package-lock.json

      - name: Setup Java
        uses: actions/setup-java@v3
        with:
          distribution: 'temurin'
          java-version: '11'

      - name: Setup Xcode
        uses: maxim-lobanov/setup-xcode@v1
        with:
          xcode-version: latest-stable

      - name: Install dependencies
        run: npm ci

      - name: Install CocoaPods dependencies
        run: cd ios && pod install

      - name: Type checking
        run: npm run type-check

      - name: Lint code
        run: npm run lint

      - name: Run unit tests
        run: npm run test

      - name: Build iOS (Debug)
        run: |
          npx react-native bundle --platform ios --dev false --entry-file index.js --bundle-output ios/main.jsbundle
          cd ios && xcodebuild -workspace DigitalWall.xcworkspace -scheme DigitalWall -configuration Debug -destination 'platform=iOS Simulator,name=iPhone 14' build

      - name: Build Android (Debug)
        run: |
          cd android && ./gradlew assembleDebug

  # Integration Tests
  integration-tests:
    needs: [frontend-ci, backend-ci]
    if: always() && (needs.frontend-ci.result == 'success' || needs.frontend-ci.result == 'skipped') && (needs.backend-ci.result == 'success' || needs.backend-ci.result == 'skipped')
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: test_digitalwall
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432

      redis:
        image: redis:7
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 6379:6379

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}

      - name: Setup Python
        uses: actions/setup-python@v4
        with:
          python-version: ${{ env.PYTHON_VERSION }}

      - name: Start backend services
        run: |
          cd backend
          poetry install --with dev
          poetry run uvicorn app.main:app --host 0.0.0.0 --port 8000 &
          sleep 10
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test_digitalwall
          REDIS_URL: redis://localhost:6379/0

      - name: Start frontend
        run: |
          cd frontend
          npm ci
          npm run build
          npm run start &
          sleep 15
        env:
          NEXT_PUBLIC_API_URL: http://backend:8000

      - name: Run E2E tests
        run: |
          cd e2e-tests
          npm ci
          npm run test:headless
        env:
          BASE_URL: http://localhost:3000
          API_URL: http://backend:8000

  # Deploy to Staging
  deploy-staging:
    needs: [frontend-ci, backend-ci, integration-tests]
    if: github.ref == 'refs/heads/develop' && (needs.frontend-ci.result == 'success' || needs.frontend-ci.result == 'skipped') && (needs.backend-ci.result == 'success' || needs.backend-ci.result == 'skipped') && needs.integration-tests.result == 'success'
    runs-on: ubuntu-latest
    environment: staging

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Configure kubectl
        uses: azure/setup-kubectl@v3
        with:
          version: 'latest'

      - name: Setup Helm
        uses: azure/setup-helm@v3
        with:
          version: 'latest'

      - name: Configure Kubernetes context
        run: |
          echo "${{ secrets.KUBECONFIG_STAGING }}" | base64 -d > kubeconfig
          export KUBECONFIG=kubeconfig

      - name: Deploy to staging
        run: |
          helm upgrade --install digital-wall-staging ./k8s/helm/digital-wall \
            --namespace staging \
            --create-namespace \
            --set image.tag=${{ github.sha }} \
            --set environment=staging \
            --set database.host=${{ secrets.STAGING_DB_HOST }} \
            --set redis.host=${{ secrets.STAGING_REDIS_HOST }} \
            --wait

      - name: Run smoke tests
        run: |
          cd smoke-tests
          npm ci
          npm run test:staging
        env:
          STAGING_URL: ${{ secrets.STAGING_URL }}

  # Deploy to Production
  deploy-production:
    needs: [frontend-ci, backend-ci, integration-tests]
    if: github.ref == 'refs/heads/main' && (needs.frontend-ci.result == 'success' || needs.frontend-ci.result == 'skipped') && (needs.backend-ci.result == 'success' || needs.backend-ci.result == 'skipped') && needs.integration-tests.result == 'success'
    runs-on: ubuntu-latest
    environment: production

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Configure kubectl
        uses: azure/setup-kubectl@v3
        with:
          version: 'latest'

      - name: Setup Helm
        uses: azure/setup-helm@v3
        with:
          version: 'latest'

      - name: Configure Kubernetes context
        run: |
          echo "${{ secrets.KUBECONFIG_PRODUCTION }}" | base64 -d > kubeconfig
          export KUBECONFIG=kubeconfig

      - name: Blue-Green Deployment
        run: |
          # Deploy to green environment
          helm upgrade --install digital-wall-green ./k8s/helm/digital-wall \
            --namespace production \
            --set image.tag=${{ github.sha }} \
            --set environment=production \
            --set service.selector.version=green \
            --wait

          # Run production smoke tests
          cd smoke-tests
          npm ci
          npm run test:production:green

          # Switch traffic to green
          kubectl patch service digital-wall-service -n production -p '{"spec":{"selector":{"version":"green"}}}'

          # Wait and verify
          sleep 60
          npm run test:production:verify

          # Cleanup old blue deployment
          helm uninstall digital-wall-blue -n production || true

          # Rename green to blue for next deployment
          kubectl patch deployment digital-wall-green -n production -p '{"metadata":{"name":"digital-wall-blue"}}'

        env:
          PRODUCTION_URL: ${{ secrets.PRODUCTION_URL }}
```

### Infrastructure as Code

```yaml
# k8s/helm/digital-wall/values.yaml - Kubernetes configuration
global:
  imageRegistry: ghcr.io
  imageTag: latest
  environment: production

frontend:
  replicaCount: 3
  image:
    repository: digitalwall-frontend
    tag: ""
    pullPolicy: IfNotPresent

  service:
    type: ClusterIP
    port: 3000

  ingress:
    enabled: true
    className: nginx
    annotations:
      cert-manager.io/cluster-issuer: "letsencrypt-prod"
      nginx.ingress.kubernetes.io/rate-limit: "100"
      nginx.ingress.kubernetes.io/ssl-redirect: "true"
    hosts:
      - host: digitalwall.app
        paths:
          - path: /
            pathType: Prefix
    tls:
      - secretName: digitalwall-tls
        hosts:
          - digitalwall.app

  resources:
    limits:
      cpu: 500m
      memory: 512Mi
    requests:
      cpu: 250m
      memory: 256Mi

  autoscaling:
    enabled: true
    minReplicas: 3
    maxReplicas: 10
    targetCPUUtilizationPercentage: 70
    targetMemoryUtilizationPercentage: 80

backend:
  replicaCount: 2
  image:
    repository: digitalwall-backend
    tag: ""
    pullPolicy: IfNotPresent

  service:
    type: ClusterIP
    port: 8000

  env:
    DATABASE_URL:
      secretKeyRef:
        name: digitalwall-secrets
        key: database-url
    REDIS_URL:
      secretKeyRef:
        name: digitalwall-secrets
        key: redis-url
    ANTHROPIC_API_KEY:
      secretKeyRef:
        name: digitalwall-secrets
        key: anthropic-api-key
    CLOUDFLARE_R2_ACCESS_KEY:
      secretKeyRef:
        name: digitalwall-secrets
        key: r2-access-key
    CLOUDFLARE_R2_SECRET_KEY:
      secretKeyRef:
        name: digitalwall-secrets
        key: r2-secret-key

  resources:
    limits:
      cpu: 1000m
      memory: 1Gi
    requests:
      cpu: 500m
      memory: 512Mi

  autoscaling:
    enabled: true
    minReplicas: 2
    maxReplicas: 8
    targetCPUUtilizationPercentage: 70

  healthCheck:
    enabled: true
    livenessProbe:
      httpGet:
        path: /health
        port: 8000
      initialDelaySeconds: 30
      periodSeconds: 10
    readinessProbe:
      httpGet:
        path: /ready
        port: 8000
      initialDelaySeconds: 5
      periodSeconds: 5

postgresql:
  enabled: false  # Use external managed database

redis:
  enabled: false  # Use external managed Redis

monitoring:
  enabled: true
  prometheus:
    enabled: true
  grafana:
    enabled: true
    adminPassword: ""

  serviceMonitor:
    enabled: true
    interval: 30s
    scrapeTimeout: 10s

logging:
  enabled: true
  fluentd:
    enabled: true
  elasticsearch:
    enabled: true

security:
  networkPolicies:
    enabled: true
  podSecurityPolicies:
    enabled: true
  rbac:
    create: true
```

### Production Monitoring Stack

```yaml
# k8s/monitoring/prometheus.yml - Prometheus configuration
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - "digital-wall-alerts.yml"

alerting:
  alertmanagers:
    - static_configs:
        - targets:
          - alertmanager:9093

scrape_configs:
  - job_name: 'kubernetes-pods'
    kubernetes_sd_configs:
      - role: pod
    relabel_configs:
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
        action: keep
        regex: true

  - job_name: 'digital-wall-frontend'
    static_configs:
      - targets: ['digital-wall-frontend:3000']
    metrics_path: '/_next/static/metrics'

  - job_name: 'digital-wall-backend'
    static_configs:
      - targets: ['digital-wall-backend:8000']
    metrics_path: '/metrics'

  - job_name: 'postgres-exporter'
    static_configs:
      - targets: ['postgres-exporter:9187']

  - job_name: 'redis-exporter'
    static_configs:
      - targets: ['redis-exporter:9121']
```

```yaml
# k8s/monitoring/digital-wall-alerts.yml - Alert rules
groups:
  - name: digital-wall-alerts
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.1
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: High error rate detected
          description: Error rate is {{ $value }} errors per second

      - alert: HighResponseTime
        expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 2
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: High response time detected
          description: 95th percentile response time is {{ $value }} seconds

      - alert: DatabaseConnectionsHigh
        expr: pg_stat_activity_count > 80
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: High database connections
          description: Database has {{ $value }} active connections

      - alert: RedisMemoryUsageHigh
        expr: redis_memory_used_bytes / redis_memory_max_bytes > 0.8
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: Redis memory usage high
          description: Redis memory usage is {{ $value | humanizePercentage }}

      - alert: PodCrashLooping
        expr: rate(kube_pod_container_status_restarts_total[15m]) * 60 * 15 > 0
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: Pod crash looping
          description: Pod {{ $labels.pod }} is crash looping

      - alert: NodeDiskSpaceWarning
        expr: (node_filesystem_avail_bytes / node_filesystem_size_bytes) < 0.1
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: Node disk space warning
          description: Node {{ $labels.instance }} disk space is below 10%
```

## Integration Examples

### Complete DevOps Architecture

```mermaid
graph TD
    A[Developer Push] --> B[GitHub Actions]
    B --> C[Detect Changes]
    C --> D[Parallel Builds]

    subgraph "Build Pipeline"
        E[Frontend CI]
        F[Backend CI]
        G[Mobile CI]
    end

    D --> E
    D --> F
    D --> G

    E --> H[Integration Tests]
    F --> H
    G --> H

    H --> I{Branch Check}
    I -->|develop| J[Deploy Staging]
    I -->|main| K[Deploy Production]

    subgraph "Infrastructure"
        L[Kubernetes Cluster]
        M[Helm Charts]
        N[Service Mesh]
    end

    J --> L
    K --> L
    L --> M
    L --> N

    subgraph "Monitoring"
        O[Prometheus]
        P[Grafana]
        Q[AlertManager]
    end

    L --> O
    O --> P
    O --> Q
```

### Integration with [[Digital Wall]] Components

- **[[FastAPI Async Architecture]]**: Backend deployment and scaling patterns
- **[[Next.js 14 PWA Patterns]]**: Frontend build optimization and deployment
- **[[Cloudflare R2 Storage]]**: Infrastructure integration and CDN management
- **[[Content Processing Pipeline]]**: Background service deployment and monitoring

## References & Further Reading

### CI/CD and DevOps
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [Helm Charts](https://helm.sh/docs/)

### Monitoring and Observability
- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)

### Related [[Vault]] Concepts
- [[DevOps]] - DevOps practices and methodologies
- [[Kubernetes]] - Container orchestration platform
- [[Monitoring]] - System monitoring and alerting
- [[Infrastructure as Code]] - Automated infrastructure management
- [[CI/CD Pipelines]] - Continuous integration and deployment

#digital-wall #research #devops #ci-cd #kubernetes #monitoring
