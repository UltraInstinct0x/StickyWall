# Unix/Linux Commands Cheatsheet

## Process Management

### Finding Processes
```bash
# List all running processes
ps aux

# Find specific processes (e.g., node, python, etc.)
ps aux | grep node
ps aux | grep python
ps aux | grep ngrok

# Exclude the grep command itself from results
ps aux | grep -v grep | grep node

# Find processes using a specific port
lsof -i :3000
lsof -i :8000

# Show processes in a tree format
pstree
```

### Killing Processes
```bash
# Kill by process ID (PID)
kill 12345

# Force kill if process won't die
kill -9 12345

# Kill by process name
killall node
killall python3

# Kill processes using a specific port
lsof -ti:3000 | xargs kill
lsof -ti:3000 | xargs kill -9  # force kill
```

## File Operations

### Listing Files
```bash
# Basic listing
ls
ls -l      # Long format (permissions, size, date)
ls -la     # Include hidden files
ls -lh     # Human readable sizes
ls -lt     # Sort by modification time
ls -lS     # Sort by size

# List only directories
ls -d */
```

### Finding Files
```bash
# Find files by name
find . -name "*.js"
find . -name "*config*"
find . -type f -name "*.py"    # files only
find . -type d -name "*test*"  # directories only

# Find files modified in last 24 hours
find . -mtime -1

# Find large files (>100MB)
find . -size +100M
```

## Text Processing

### Searching in Files
```bash
# Search for text in files
grep "error" file.txt
grep -r "TODO" .              # Recursive search
grep -i "error" file.txt      # Case insensitive
grep -n "error" file.txt      # Show line numbers
grep -v "debug" file.txt      # Exclude lines with "debug"

# Multiple patterns
grep -E "(error|warning)" file.txt
```

### File Content
```bash
# View file content
cat file.txt           # Entire file
head file.txt          # First 10 lines
head -20 file.txt      # First 20 lines
tail file.txt          # Last 10 lines
tail -f file.txt       # Follow file (live updates)

# Page through large files
less file.txt
more file.txt
```

## Network & Ports

### Check Open Ports
```bash
# List all open ports
netstat -tuln
lsof -i

# Check specific port
lsof -i :3000
netstat -tuln | grep :3000

# Check what's using a port
sudo lsof -i :80
```

### Network Connections
```bash
# Show active connections
netstat -an
ss -tuln           # Modern alternative to netstat

# Test connection to a port
telnet localhost 3000
nc -zv localhost 3000
```

## System Information

### Disk Usage
```bash
# Disk space
df -h              # Disk space by filesystem
du -h              # Directory sizes
du -sh *           # Size of each item in current directory
du -sh ~/.* *      # Include hidden files

# Find largest directories
du -h | sort -hr | head -10
```

### Memory & CPU
```bash
# Memory usage
free -h
top                # Live process monitor
htop               # Better version of top (if installed)

# CPU info
nproc              # Number of CPU cores
lscpu              # Detailed CPU info
```

## File Permissions

### Understanding Permissions
```bash
# Read permissions (ls -l output)
# -rwxrwxrwx
# - = file type (- file, d directory, l link)
# rwx = owner permissions (read, write, execute)
# rwx = group permissions
# rwx = other permissions
```

### Changing Permissions
```bash
# Make file executable
chmod +x script.sh

# Set specific permissions
chmod 755 file.txt    # rwxr-xr-x
chmod 644 file.txt    # rw-r--r--

# Change ownership
chown user:group file.txt
```

## Environment & Variables

### Environment Variables
```bash
# Show all environment variables
env
printenv

# Show specific variable
echo $PATH
echo $HOME

# Set temporary variable
export MY_VAR="value"

# Show current shell
echo $SHELL
```

## Useful Combinations

### Development Workflow
```bash
# Kill all node processes
ps aux | grep node | grep -v grep | awk '{print $2}' | xargs kill

# Find and kill process on port 3000
lsof -ti:3000 | xargs kill -9

# Watch log file
tail -f logs/app.log

# Find recent error logs
find . -name "*.log" -mtime -1 | xargs grep -l "ERROR"

# Check if service is running
ps aux | grep -v grep | grep "service-name"
```

### File Operations
```bash
# Count lines in files
wc -l *.txt
find . -name "*.js" | xargs wc -l

# Find and replace in multiple files
grep -r "old_text" . | cut -d: -f1 | xargs sed -i 's/old_text/new_text/g'

# Backup before modifying
cp file.txt file.txt.backup
```

## Keyboard Shortcuts (Terminal)

```bash
Ctrl + C    # Kill current process
Ctrl + Z    # Suspend current process
Ctrl + L    # Clear screen
Ctrl + A    # Beginning of line
Ctrl + E    # End of line
Ctrl + R    # Search command history
Ctrl + D    # Exit/logout

# Command history
history     # Show command history
!123        # Run command number 123 from history
!!          # Run last command
!grep       # Run last command starting with "grep"
```

## Docker Process Management

```bash
# Find Docker processes
ps aux | grep docker
docker ps                    # Running containers
docker ps -a                 # All containers

# Kill Docker processes
docker stop container_name
docker kill container_name   # Force stop
docker rm container_name     # Remove container
```

## Quick Reference

### Most Common Patterns
```bash
# Find and kill a process
ps aux | grep process_name | grep -v grep
kill PID_NUMBER

# Check what's running on a port
lsof -i :PORT_NUMBER

# Find files and search in them
find . -name "*.extension" | xargs grep "search_term"

# Monitor logs
tail -f /path/to/logfile

# Disk usage of current directory
du -sh * | sort -hr
```

### When Things Go Wrong
```bash
# Process won't die
kill -9 PID

# Can't find what's using a port
sudo lsof -i :PORT
sudo netstat -tulpn | grep :PORT

# Permission denied
sudo command_here

# Command not found
which command_name
whereis command_name
```

Remember: You're not dumb for not knowing these! They're tools that developers accumulate over years of experience. Keep this cheatsheet handy and you'll internalize them quickly.