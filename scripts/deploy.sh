#!/bin/bash

# Production Deployment Script for Digital Wall MVP
# Usage: ./deploy.sh [environment] [action]
# Example: ./deploy.sh production deploy

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Default values
ENVIRONMENT=${1:-production}
ACTION=${2:-deploy}
COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.prod"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."

    if ! command -v docker &> /dev/null; then
        log_error "Docker is required but not installed"
        exit 1
    fi

    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose is required but not installed"
        exit 1
    fi

    if [[ ! -f "$PROJECT_ROOT/$ENV_FILE" ]]; then
        log_error "Environment file $ENV_FILE not found"
        log_info "Copy .env.example to $ENV_FILE and configure it"
        exit 1
    fi

    log_success "Prerequisites check passed"
}

# Deploy services
deploy_services() {
    log_info "Deploying services..."

    cd "$PROJECT_ROOT"

    # Create necessary directories
    mkdir -p logs/{nginx,backend,frontend}
    mkdir -p uploads
    mkdir -p ssl

    # Start services
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d

    log_success "Services deployed"
}

# Health check
health_check() {
    log_info "Performing health checks..."

    # Check backend health
    max_attempts=30
    attempt=1

    while [[ $attempt -le $max_attempts ]]; do
        if curl -f -s http://backend:8000/api/health > /dev/null; then
            log_success "Backend health check passed"
            break
        fi

        if [[ $attempt -eq $max_attempts ]]; then
            log_error "Backend health check failed after $max_attempts attempts"
            exit 1
        fi

        log_info "Attempt $attempt/$max_attempts: Waiting for backend..."
        sleep 10
        ((attempt++))
    done

    # Check frontend
    if curl -f -s http://localhost:3000 > /dev/null; then
        log_success "Frontend health check passed"
    else
        log_error "Frontend health check failed"
        exit 1
    fi
}

# Main execution
main() {
    log_info "Digital Wall MVP Deployment Script"
    log_info "Environment: $ENVIRONMENT"
    log_info "Action: $ACTION"

    case "$ACTION" in
        "deploy")
            check_prerequisites
            deploy_services
            health_check
            log_success "Deployment completed successfully!"
            log_info "Frontend: http://localhost:3000"
            log_info "Backend API: http://backend:8000"
            log_info "API Docs: http://backend:8000/docs"
            ;;
        "start")
            deploy_services
            ;;
        "stop")
            docker-compose -f "$COMPOSE_FILE" down
            ;;
        "health")
            health_check
            ;;
        *)
            log_error "Unknown action: $ACTION"
            echo "Available actions: deploy, start, stop, health"
            exit 1
            ;;
    esac
}

# Execute main function
main "$@"
