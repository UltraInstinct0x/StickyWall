# Claude Development Best Practices
 
## Docker Development Rules

### 1. NEVER JUST RESTART - ALWAYS REBUILD
When code changes don't take effect, Docker containers are using cached/old builds:

```bash
# WRONG - just restarting (uses old cached build)
docker restart container-name

# RIGHT - rebuild and restart
docker compose down
docker compose build --no-cache backend
docker compose up -d backend

# OR rebuild everything
docker compose down
docker compose build --no-cache  
docker compose up -d
```

### 2. Volume Mounts vs Container Rebuilds
- **Volume mounts**: Only work for interpreted languages (Python, JS) and only for mounted directories
- **Container rebuilds**: Required when:
  - Dependencies change (requirements.txt, package.json)
  - Docker configuration changes  
  - Code outside volume mounts changes
  - Any doubt about what's cached

### 3. Debug Docker Issues
```bash
# Check what's actually running
docker ps

# Check if volumes are mounted correctly
docker inspect container-name | grep Mounts -A 20

# Check logs for actual errors
docker logs container-name --tail 50

# Get into container to debug
docker exec -it container-name bash
```

### 4. Development Container Management
```bash
# Clean slate when things get weird
docker compose down
docker system prune -f
docker compose build --no-cache
docker compose up -d

# Check what's actually in the container
docker exec container-name ls -la /app/

# Verify code changes are in container
docker exec container-name cat /app/path/to/changed/file.py
```

### 5. Network and URL Issues
- **Container-to-container**: Use service names (e.g., `http://backend:8000`)
- **Host-to-container**: Use localhost or container IP
- **External-to-container**: Use ngrok or exposed ports
- **Always check**: Which network context you're in

### 6. FastAPI/Python Specific
```bash
# Rebuild Python container when dependencies or code changes
docker compose build --no-cache backend
docker compose up -d backend

# Check if Python code is actually updated
docker exec backend-container cat /app/path/to/file.py

# Python imports can be cached - restart Python process
docker compose restart backend
```

### 7. Next.js/Frontend Specific  
```bash
# Rebuild when package.json changes
docker compose build --no-cache frontend
docker compose up -d frontend

# Check if Next.js is in dev mode (hot reload)
docker logs frontend-container | grep "Ready in"

# Clear Next.js cache if needed
docker exec frontend-container rm -rf .next
docker compose restart frontend
```

## Debugging Workflow

1. **Code change not working?**
   - First: Check if files are volume mounted
   - Second: Rebuild container with `--no-cache`
   - Third: Verify changes are in container

2. **API not responding?**
   - Check container logs
   - Test container-to-container communication
   - Verify network configuration
   - Check if service is actually running

3. **Database issues?**
   - Check if database container is running
   - Verify connection strings
   - Check database logs
   - Test database connectivity from app container

## Common Mistakes

❌ **DON'T**: `docker restart` and expect code changes to work  
✅ **DO**: `docker compose build --no-cache && docker compose up -d`

❌ **DON'T**: Assume volume mounts work for everything  
✅ **DO**: Rebuild containers when in doubt

❌ **DON'T**: Debug in production mode when you need hot reload  
✅ **DO**: Use development mode with proper volume mounts

❌ **DON'T**: Use localhost URLs between containers  
✅ **DO**: Use container service names for internal communication

## Emergency Commands

When everything is broken:
```bash
# Nuclear option - clean everything
docker compose down
docker system prune -af --volumes
docker compose build --no-cache
docker compose up -d

# Check what's actually running
docker ps
docker compose logs
```