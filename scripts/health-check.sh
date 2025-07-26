#!/bin/bash

# Production Health Check Script for Digital Wall MVP
# Comprehensive system health monitoring

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Service endpoints
BACKEND_URL="http://backend:8000"
FRONTEND_URL="http://localhost:3000"
REDIS_HOST="localhost"
REDIS_PORT="6379"
POSTGRES_HOST="localhost"
POSTGRES_PORT="5432"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Logging
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Health check results
HEALTH_STATUS="healthy"
FAILED_CHECKS=()

# Check service health
check_service_health() {
    local service_name="$1"
    local url="$2"
    local timeout="${3:-10}"
    
    log_info "Checking $service_name health..."
    
    if curl -f -s --connect-timeout "$timeout" "$url" > /dev/null; then
        log_success "$service_name is healthy"
        return 0
    else
        log_error "$service_name health check failed"
        HEALTH_STATUS="unhealthy"
        FAILED_CHECKS+=("$service_name")
        return 1
    fi
}

# Check database connectivity
check_postgres() {
    log_info "Checking PostgreSQL connectivity..."
    
    if command -v pg_isready &> /dev/null; then
        if pg_isready -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" > /dev/null 2>&1; then
            log_success "PostgreSQL is accessible"
            return 0
        fi
    fi
    
    # Fallback check using nc
    if command -v nc &> /dev/null; then
        if nc -z "$POSTGRES_HOST" "$POSTGRES_PORT" > /dev/null 2>&1; then
            log_success "PostgreSQL port is accessible"
            return 0
        fi
    fi
    
    log_error "PostgreSQL connectivity check failed"
    HEALTH_STATUS="unhealthy"
    FAILED_CHECKS+=("PostgreSQL")
    return 1
}

# Check Redis connectivity
check_redis() {
    log_info "Checking Redis connectivity..."
    
    if command -v redis-cli &> /dev/null; then
        if redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping | grep -q "PONG"; then
            log_success "Redis is accessible"
            return 0
        fi
    fi
    
    # Fallback check using nc
    if command -v nc &> /dev/null; then
        if nc -z "$REDIS_HOST" "$REDIS_PORT" > /dev/null 2>&1; then
            log_success "Redis port is accessible"
            return 0
        fi
    fi
    
    log_error "Redis connectivity check failed"
    HEALTH_STATUS="unhealthy"
    FAILED_CHECKS+=("Redis")
    return 1
}

# Check disk space
check_disk_space() {
    log_info "Checking disk space..."
    
    local usage
    usage=$(df / | awk 'NR==2 {print $5}' | sed 's/%//')
    
    if [ "$usage" -lt 80 ]; then
        log_success "Disk space is adequate (${usage}% used)"
    elif [ "$usage" -lt 90 ]; then
        log_warning "Disk space is getting low (${usage}% used)"
    else
        log_error "Disk space is critically low (${usage}% used)"
        HEALTH_STATUS="unhealthy"
        FAILED_CHECKS+=("Disk Space")
    fi
}

# Check memory usage
check_memory() {
    log_info "Checking memory usage..."
    
    if command -v free &> /dev/null; then
        local mem_usage
        mem_usage=$(free | grep Mem | awk '{printf "%.0f", $3/$2 * 100.0}')
        
        if [ "$mem_usage" -lt 80 ]; then
            log_success "Memory usage is normal (${mem_usage}%)"
        elif [ "$mem_usage" -lt 90 ]; then
            log_warning "Memory usage is high (${mem_usage}%)"
        else
            log_error "Memory usage is critically high (${mem_usage}%)"
            HEALTH_STATUS="degraded"
        fi
    else
        log_warning "Cannot check memory usage - 'free' command not available"
    fi
}

# Check CPU load
check_cpu_load() {
    log_info "Checking CPU load..."
    
    if command -v uptime &> /dev/null; then
        local load_avg
        load_avg=$(uptime | awk -F'load average:' '{print $2}' | awk '{print $1}' | tr -d ',')
        local cpu_cores
        cpu_cores=$(nproc 2>/dev/null || echo "1")
        
        # Calculate load percentage
        local load_percentage
        load_percentage=$(echo "$load_avg $cpu_cores" | awk '{printf "%.0f", $1/$2 * 100}')
        
        if [ "$load_percentage" -lt 70 ]; then
            log_success "CPU load is normal (${load_percentage}%)"
        elif [ "$load_percentage" -lt 90 ]; then
            log_warning "CPU load is high (${load_percentage}%)"
        else
            log_error "CPU load is critically high (${load_percentage}%)"
            HEALTH_STATUS="degraded"
        fi
    else
        log_warning "Cannot check CPU load - 'uptime' command not available"
    fi
}

# Check Docker containers (if using Docker)
check_docker_containers() {
    if command -v docker &> /dev/null; then
        log_info "Checking Docker containers..."
        
        local unhealthy_containers
        unhealthy_containers=$(docker ps --filter "health=unhealthy" -q 2>/dev/null | wc -l)
        
        if [ "$unhealthy_containers" -eq 0 ]; then
            log_success "All Docker containers are healthy"
        else
            log_error "$unhealthy_containers Docker container(s) are unhealthy"
            HEALTH_STATUS="unhealthy"
            FAILED_CHECKS+=("Docker Containers")
        fi
    fi
}

# Check SSL certificates (if applicable)
check_ssl_certificates() {
    if [ -f "$PROJECT_ROOT/ssl/cert.pem" ]; then
        log_info "Checking SSL certificate validity..."
        
        local cert_expiry
        cert_expiry=$(openssl x509 -in "$PROJECT_ROOT/ssl/cert.pem" -noout -enddate 2>/dev/null | cut -d= -f2)
        
        if [ -n "$cert_expiry" ]; then
            local expiry_timestamp
            expiry_timestamp=$(date -d "$cert_expiry" +%s 2>/dev/null || echo "0")
            local current_timestamp
            current_timestamp=$(date +%s)
            local days_until_expiry
            days_until_expiry=$(( (expiry_timestamp - current_timestamp) / 86400 ))
            
            if [ "$days_until_expiry" -gt 30 ]; then
                log_success "SSL certificate is valid (expires in $days_until_expiry days)"
            elif [ "$days_until_expiry" -gt 7 ]; then
                log_warning "SSL certificate expires soon ($days_until_expiry days)"
            else
                log_error "SSL certificate expires very soon ($days_until_expiry days)"
                HEALTH_STATUS="degraded"
            fi
        fi
    fi
}

# API endpoint tests
test_api_endpoints() {
    log_info "Testing API endpoints..."
    
    # Test core endpoints
    local endpoints=(
        "/api/health:Health Check"
        "/api/walls:Walls API"
        "/docs:API Documentation"
    )
    
    for endpoint_info in "${endpoints[@]}"; do
        IFS=':' read -r endpoint description <<< "$endpoint_info"
        local url="${BACKEND_URL}${endpoint}"
        
        if curl -f -s --connect-timeout 5 "$url" > /dev/null; then
            log_success "$description endpoint is accessible"
        else
            log_warning "$description endpoint is not accessible"
        fi
    done
}

# Performance benchmarks
run_performance_checks() {
    log_info "Running basic performance checks..."
    
    # Test database response time
    if command -v psql &> /dev/null; then
        local db_response_time
        db_response_time=$( (time echo "SELECT 1;" | psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -d postgres -U postgres 2>/dev/null) 2>&1 | grep real | awk '{print $2}' | sed 's/[^0-9.]//g')
        
        if [ -n "$db_response_time" ]; then
            log_success "Database response time: ${db_response_time}s"
        fi
    fi
    
    # Test Redis response time
    if command -v redis-cli &> /dev/null; then
        local redis_response_time
        redis_response_time=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" --latency-history -i 1 2>/dev/null | head -1 | awk '{print $4}' 2>/dev/null || echo "N/A")
        
        if [ "$redis_response_time" != "N/A" ]; then
            log_success "Redis latency: ${redis_response_time}ms"
        fi
    fi
}

# Generate health report
generate_health_report() {
    echo
    echo "=================================================="
    echo "           DIGITAL WALL MVP HEALTH REPORT        "
    echo "=================================================="
    echo "Timestamp: $(date)"
    echo "Overall Status: $HEALTH_STATUS"
    echo
    
    if [ ${#FAILED_CHECKS[@]} -eq 0 ]; then
        echo "✅ All health checks passed"
    else
        echo "❌ Failed checks:"
        for check in "${FAILED_CHECKS[@]}"; do
            echo "   - $check"
        done
    fi
    
    echo "=================================================="
}

# Main health check execution
main() {
    echo "🏥 Starting Digital Wall MVP Health Check..."
    echo
    
    # Core service checks
    check_service_health "Backend API" "$BACKEND_URL/api/health"
    check_service_health "Frontend" "$FRONTEND_URL"
    
    # Infrastructure checks
    check_postgres
    check_redis
    
    # System resource checks
    check_disk_space
    check_memory
    check_cpu_load
    
    # Additional checks
    check_docker_containers
    check_ssl_certificates
    
    # API functionality tests
    test_api_endpoints
    
    # Performance benchmarks
    run_performance_checks
    
    # Generate final report
    generate_health_report
    
    # Exit with appropriate code
    case "$HEALTH_STATUS" in
        "healthy")
            exit 0
            ;;
        "degraded")
            exit 1
            ;;
        "unhealthy")
            exit 2
            ;;
        *)
            exit 3
            ;;
    esac
}

# Execute main function
main "$@"