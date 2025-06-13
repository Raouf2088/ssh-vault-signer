#!/bin/bash

# ================================================================
# Vault SSH Key Signing Application - Startup Script
# ================================================================
# This script performs:
# 1. Version checking for Node.js and npm
# 2. Vault connectivity testing
# 3. Application environment validation
# 4. Setup and installation of dependencies
# 5. Application startup

# Text formatting
BOLD="\033[1m"
RED="\033[0;31m"
GREEN="\033[0;32m"
YELLOW="\033[0;33m"
BLUE="\033[0;34m"
NC="\033[0m" # No Color

# ================================================================
# Configuration
# ================================================================

# Minimum required versions
MIN_NODE_VERSION="16.0.0"
MIN_NPM_VERSION="8.0.0"

# Application directory
APP_DIR="$(dirname "$(readlink -f "$0")")"
ENV_FILE="$APP_DIR/.env"
ENV_EXAMPLE_FILE="$APP_DIR/.env.example"

# Load environment variables if .env exists
if [ -f "$ENV_FILE" ]; then
    source "$ENV_FILE"
fi

# ================================================================
# Helper Functions
# ================================================================

# Print section header
print_header() {
    echo -e "\n${BOLD}${BLUE}=== $1 ===${NC}\n"
}

# Print success message
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

# Print error message
print_error() {
    echo -e "${RED}✗ $1${NC}"
}

# Print warning message
print_warning() {
    echo -e "${YELLOW}! $1${NC}"
}

# Print info message
print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

# Compare semantic versions
# Returns 0 if $1 >= $2, 1 otherwise
version_gte() {
    [ "$(printf '%s\n' "$1" "$2" | sort -V | head -n1)" = "$2" ]
}

# ================================================================
# Version Checking
# ================================================================

check_versions() {
    print_header "Checking System Requirements"

    # Check if Node.js is installed
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed. Please install Node.js version $MIN_NODE_VERSION or higher."
        exit 1
    else
        NODE_VERSION=$(node -v | cut -d "v" -f 2)
        if version_gte "$NODE_VERSION" "$MIN_NODE_VERSION"; then
            print_success "Node.js version $NODE_VERSION (minimum required: $MIN_NODE_VERSION)"
        else
            print_error "Node.js version $NODE_VERSION is too old. Please upgrade to version $MIN_NODE_VERSION or higher."
            exit 1
        fi
    fi

    # Check if npm is installed
    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed. Please install npm version $MIN_NPM_VERSION or higher."
        exit 1
    else
        NPM_VERSION=$(npm -v)
        if version_gte "$NPM_VERSION" "$MIN_NPM_VERSION"; then
            print_success "npm version $NPM_VERSION (minimum required: $MIN_NPM_VERSION)"
        else
            print_error "npm version $NPM_VERSION is too old. Please upgrade to version $MIN_NPM_VERSION or higher."
            exit 1
        fi
    fi

    # Check optional dependencies
    if command -v curl &> /dev/null; then
        print_success "curl is installed"
    else
        print_warning "curl is not installed. It's recommended for API testing but not required."
    fi

    if command -v ssh-keygen &> /dev/null; then
        print_success "ssh-keygen is installed"
    else
        print_warning "ssh-keygen is not installed. It's useful for generating SSH keys but not required."
    fi
}

# ================================================================
# Environment Validation
# ================================================================

validate_environment() {
    print_header "Validating Environment"

    # Check if .env file exists
    if [ ! -f "$ENV_FILE" ]; then
        if [ -f "$ENV_EXAMPLE_FILE" ]; then
            print_warning ".env file not found. Creating from .env.example..."
            cp "$ENV_EXAMPLE_FILE" "$ENV_FILE"
            print_info "Please review the .env file and update the configuration as needed."
        else
            print_error ".env and .env.example files not found. Application configuration is missing."
            exit 1
        fi
    fi

    # Load environment variables
    source "$ENV_FILE"

    # Validate required environment variables
    if [ -z "$VAULT_ADDR" ]; then
        print_error "VAULT_ADDR is not set in .env file"
        exit 1
    else
        print_success "VAULT_ADDR: $VAULT_ADDR"
    fi

    if [ -z "$VAULT_TOKEN" ]; then
        print_error "VAULT_TOKEN is not set in .env file"
        exit 1
    else
        # Only show first few characters of token for security
        MASKED_TOKEN="${VAULT_TOKEN:0:4}...${VAULT_TOKEN: -4}"
        print_success "VAULT_TOKEN: $MASKED_TOKEN"
    fi

    if [ -z "$SSH_SECRETS_PATH" ]; then
        print_error "SSH_SECRETS_PATH is not set in .env file"
        exit 1
    else
        print_success "SSH_SECRETS_PATH: $SSH_SECRETS_PATH"
    fi

    if [ -z "$SSH_ROLE_NAME" ]; then
        print_error "SSH_ROLE_NAME is not set in .env file"
        exit 1
    else
        print_success "SSH_ROLE_NAME: $SSH_ROLE_NAME"
    fi
}

# ================================================================
# Vault Connectivity Testing
# ================================================================

test_vault_connectivity() {
    print_header "Testing Vault Connectivity"

    # Check if curl is available for connectivity testing
    if ! command -v curl &> /dev/null; then
        print_warning "curl is not installed. Skipping Vault connectivity tests."
        return
    fi

    # Test Vault server reachability
    print_info "Testing connection to Vault server at $VAULT_ADDR..."
    if curl -s -o /dev/null -w "%{http_code}" "$VAULT_ADDR/v1/sys/health" | grep -q -e "200" -e "429" -e "472" -e "473" -e "501" -e "503"; then
        print_success "Vault server is reachable"
    else
        print_error "Cannot reach Vault server at $VAULT_ADDR"
        print_warning "Application will continue, but functionality may be limited without Vault connectivity"
    fi

    # Test Vault authentication
    print_info "Testing Vault authentication with provided token..."
    AUTH_RESPONSE=$(curl -s -H "X-Vault-Token: $VAULT_TOKEN" "$VAULT_ADDR/v1/auth/token/lookup-self" -w "\n%{http_code}")
    HTTP_CODE=$(echo "$AUTH_RESPONSE" | tail -n1)
    
    if [ "$HTTP_CODE" = "200" ]; then
        print_success "Vault authentication successful"
    else
        print_error "Vault authentication failed. Check your token."
        print_warning "Application will continue, but SSH key signing will not work without valid authentication"
    fi

    # Test SSH secrets engine
    print_info "Testing SSH secrets engine..."
    SSH_PATH_RESPONSE=$(curl -s -H "X-Vault-Token: $VAULT_TOKEN" "$VAULT_ADDR/v1/$SSH_SECRETS_PATH/config/ca" -w "\n%{http_code}")
    SSH_PATH_HTTP_CODE=$(echo "$SSH_PATH_RESPONSE" | tail -n1)
    
    if [ "$SSH_PATH_HTTP_CODE" = "200" ] || [ "$SSH_PATH_HTTP_CODE" = "403" ]; then
        # 403 is acceptable here - it means the engine exists but our token may not have permission to read the CA
        print_success "SSH secrets engine is available at path: $SSH_SECRETS_PATH"
    else
        print_error "SSH secrets engine not found at path: $SSH_SECRETS_PATH"
        print_warning "Application will continue, but SSH key signing will not work without a valid SSH secrets engine"
    fi

    # Test SSH role
    print_info "Testing SSH role..."
    ROLE_RESPONSE=$(curl -s -H "X-Vault-Token: $VAULT_TOKEN" "$VAULT_ADDR/v1/$SSH_SECRETS_PATH/roles/$SSH_ROLE_NAME" -w "\n%{http_code}")
    ROLE_HTTP_CODE=$(echo "$ROLE_RESPONSE" | tail -n1)
    
    if [ "$ROLE_HTTP_CODE" = "200" ] || [ "$ROLE_HTTP_CODE" = "403" ]; then
        # 403 is acceptable here - it means the role exists but our token may not have permission to read it
        print_success "SSH role is available: $SSH_ROLE_NAME"
    else
        print_error "SSH role not found: $SSH_ROLE_NAME"
        print_warning "Application will continue, but SSH key signing will not work without a valid SSH role"
    fi
}

# ================================================================
# Dependencies Installation
# ================================================================

install_dependencies() {
    print_header "Installing Dependencies"

    # Check if node_modules directory exists
    if [ -d "$APP_DIR/node_modules" ]; then
        # Check if package.json exists and is newer than node_modules
        if [ -f "$APP_DIR/package.json" ] && [ "$APP_DIR/package.json" -nt "$APP_DIR/node_modules" ]; then
            print_info "package.json has changed. Updating dependencies..."
            cd "$APP_DIR" && npm install
            print_success "Dependencies updated successfully"
        else
            print_success "Dependencies already installed"
        fi
    else
        # Install dependencies
        print_info "Installing dependencies..."
        cd "$APP_DIR" && npm install
        
        if [ $? -eq 0 ]; then
            print_success "Dependencies installed successfully"
        else
            print_error "Failed to install dependencies"
            exit 1
        fi
    fi
}

# ================================================================
# Start Application
# ================================================================

start_application() {
    print_header "Starting Application"

    # Check if application is already running
    if [ -f "$APP_DIR/app.pid" ]; then
        PID=$(cat "$APP_DIR/app.pid")
        if ps -p "$PID" > /dev/null; then
            print_warning "Application is already running with PID $PID"
            print_info "To restart, first stop the application with: kill $PID"
            exit 0
        else
            print_warning "Stale PID file found. Removing..."
            rm "$APP_DIR/app.pid"
        fi
    fi

    # Start the application
    print_info "Starting Vault SSH Key Signing Application..."
    
    # Determine application port
    PORT=${PORT:-3000}
    
    cd "$APP_DIR" && node src/app.js &
    APP_PID=$!
    echo $APP_PID > "$APP_DIR/app.pid"
    
    # Wait for application to start
    sleep 2
    
    if ps -p "$APP_PID" > /dev/null; then
        print_success "Application started successfully with PID $APP_PID"
        print_info "Access the application at: http://localhost:$PORT"
    else
        print_error "Failed to start application"
        exit 1
    fi
}

# ================================================================
# Main Execution
# ================================================================

# Display banner
echo -e "${BOLD}${BLUE}"
echo "  _   __            ____     _____ _____ __  __   _____ _                      "
echo " | | / /__ _  __ __/ / /_   / ___// ___// / / /  / ___/(_)___ _____  ___  _____"
echo " | |/ // _ \\ |/ // _ \\ \`/   \\__ \\ \\__ \\/ /_/ /   \\__ \\/ / __ \`/ __ \\/ _ \\/ ___/"
echo " |___/ \\___/___//_/\\_\\\_\\  ___/ /___/ / __  /   ___/ / / /_/ / / / /  __/ /    "
echo "                         /____//____//_/ /_/   /____/_/\\__, /_/ /_/\\___/_/     "
echo "                                                      /____/                    "
echo -e "${NC}"

echo -e "${BOLD}Vault SSH Key Signing Application${NC} - Version 1.0.0"
echo -e "Starting application with full system validation...\n"

# Execute steps
check_versions
validate_environment
test_vault_connectivity
install_dependencies
start_application

exit 0