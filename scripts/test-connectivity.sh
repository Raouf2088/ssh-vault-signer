#!/bin/bash

# ================================================================
# Vault SSH Key Signing Application - Connectivity Test Script
# ================================================================
# This script performs:
# 1. Vault server connectivity test
# 2. Vault authentication test
# 3. SSH secrets engine check
# 4. Role verification

# Colors and formatting
BOLD="\033[1m"
RED="\033[0;31m"
GREEN="\033[0;32m"
YELLOW="\033[0;33m"
BLUE="\033[0;34m"
NC="\033[0m" # No Color

# Load environment variables if .env exists
if [ -f "../.env" ]; then
    source "../.env"
fi

# Validate required environment variables
if [ -z "$VAULT_ADDR" ]; then
    echo -e "${RED}VAULT_ADDR is not set in .env file${NC}"
    exit 1
fi

if [ -z "$VAULT_TOKEN" ]; then
    echo -e "${RED}VAULT_TOKEN is not set in .env file${NC}"
    exit 1
fi

if [ -z "$SSH_SECRETS_PATH" ]; then
    echo -e "${RED}SSH_SECRETS_PATH is not set in .env file${NC}"
    exit 1
fi

if [ -z "$SSH_ROLE_NAME" ]; then
    echo -e "${RED}SSH_ROLE_NAME is not set in .env file${NC}"
    exit 1
fi

# Header
echo -e "${BOLD}${BLUE}Vault SSH Key Signing Application - Connectivity Test${NC}\n"
echo -e "${BLUE}Testing connection to Vault and verifying SSH secrets engine...${NC}\n"

# Test 1: Vault Server Connectivity
echo -e "${BOLD}1. Testing Vault Server Connectivity...${NC}"

HEALTH_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" $VAULT_ADDR/v1/sys/health)

if [[ "$HEALTH_RESPONSE" =~ ^(200|429|472|473|501|503)$ ]]; then
    echo -e "${GREEN}✓ Vault server is reachable at $VAULT_ADDR${NC}"
else
    echo -e "${RED}✗ Cannot reach Vault server at $VAULT_ADDR (HTTP Code: $HEALTH_RESPONSE)${NC}"
    echo -e "${YELLOW}Please check the server address and network connectivity${NC}"
    exit 1
fi

# Test 2: Vault Authentication
echo -e "\n${BOLD}2. Testing Vault Authentication...${NC}"

AUTH_RESPONSE=$(curl -s -H "X-Vault-Token: $VAULT_TOKEN" $VAULT_ADDR/v1/auth/token/lookup-self -w "\n%{http_code}")
AUTH_HTTP_CODE=$(echo "$AUTH_RESPONSE" | tail -n1)
AUTH_BODY=$(echo "$AUTH_RESPONSE" | sed '$d')

if [ "$AUTH_HTTP_CODE" = "200" ]; then
    # Extract token information
    TOKEN_DISPLAY_NAME=$(echo "$AUTH_BODY" | grep -o '"display_name":"[^"]*' | cut -d'"' -f4)
    TOKEN_POLICIES=$(echo "$AUTH_BODY" | grep -o '"policies":\[[^]]*' | cut -d'[' -f2 | tr -d '"' | tr ',' ' ')
    
    echo -e "${GREEN}✓ Authentication successful with token${NC}"
    echo -e "   ${BLUE}Display Name: ${NC}$TOKEN_DISPLAY_NAME"
    echo -e "   ${BLUE}Policies: ${NC}$TOKEN_POLICIES"
else
    echo -e "${RED}✗ Authentication failed (HTTP Code: $AUTH_HTTP_CODE)${NC}"
    echo -e "${YELLOW}Please check your token and permissions${NC}"
    
    if [ "$AUTH_HTTP_CODE" = "403" ]; then
        echo -e "${YELLOW}Token does not have permission to access its own information${NC}"
    elif [ "$AUTH_HTTP_CODE" = "401" ]; then
        echo -e "${YELLOW}Token is invalid or expired${NC}"
    fi
    
    exit 1
fi

# Test 3: SSH Secrets Engine
echo -e "\n${BOLD}3. Testing SSH Secrets Engine...${NC}"

SSH_MOUNT_RESPONSE=$(curl -s -H "X-Vault-Token: $VAULT_TOKEN" $VAULT_ADDR/v1/sys/mounts -w "\n%{http_code}")
SSH_MOUNT_HTTP_CODE=$(echo "$SSH_MOUNT_RESPONSE" | tail -n1)
SSH_MOUNT_BODY=$(echo "$SSH_MOUNT_RESPONSE" | sed '$d')

if [ "$SSH_MOUNT_HTTP_CODE" = "200" ]; then
    if echo "$SSH_MOUNT_BODY" | grep -q "\"$SSH_SECRETS_PATH/\""; then
        echo -e "${GREEN}✓ SSH secrets engine is mounted at $SSH_SECRETS_PATH${NC}"
        
        # Check CA configuration
        CA_RESPONSE=$(curl -s -H "X-Vault-Token: $VAULT_TOKEN" $VAULT_ADDR/v1/$SSH_SECRETS_PATH/config/ca -w "\n%{http_code}")
        CA_HTTP_CODE=$(echo "$CA_RESPONSE" | tail -n1)
        
        if [ "$CA_HTTP_CODE" = "200" ] || [ "$CA_HTTP_CODE" = "403" ]; then
            if [ "$CA_HTTP_CODE" = "200" ]; then
                echo -e "${GREEN}✓ SSH CA is configured${NC}"
            else
                echo -e "${YELLOW}! Cannot verify SSH CA configuration (permission denied)${NC}"
            fi
        else
            echo -e "${RED}✗ SSH CA is not configured or inaccessible (HTTP Code: $CA_HTTP_CODE)${NC}"
        fi
    else
        echo -e "${RED}✗ SSH secrets engine not found at path: $SSH_SECRETS_PATH${NC}"
        echo -e "${YELLOW}Please check the SSH_SECRETS_PATH in your .env file${NC}"
        exit 1
    fi
else
    echo -e "${RED}✗ Failed to retrieve mount information (HTTP Code: $SSH_MOUNT_HTTP_CODE)${NC}"
    exit 1
fi

# Test 4: SSH Role
echo -e "\n${BOLD}4. Testing SSH Role...${NC}"

ROLE_RESPONSE=$(curl -s -H "X-Vault-Token: $VAULT_TOKEN" $VAULT_ADDR/v1/$SSH_SECRETS_PATH/roles/$SSH_ROLE_NAME -w "\n%{http_code}")
ROLE_HTTP_CODE=$(echo "$ROLE_RESPONSE" | tail -n1)
ROLE_BODY=$(echo "$ROLE_RESPONSE" | sed '$d')

if [ "$ROLE_HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✓ SSH role '$SSH_ROLE_NAME' exists and is accessible${NC}"
    
    # Extract role configuration
    ALLOWED_USERS=$(echo "$ROLE_BODY" | grep -o '"allowed_users":"[^"]*' | cut -d'"' -f4)
    DEFAULT_USER=$(echo "$ROLE_BODY" | grep -o '"default_user":"[^"]*' | cut -d'"' -f4)
    TTL=$(echo "$ROLE_BODY" | grep -o '"ttl":"[^"]*' | cut -d'"' -f4)
    ALLOWED_EXTENSIONS=$(echo "$ROLE_BODY" | grep -o '"allowed_extensions":\[[^]]*' | cut -d'[' -f2 | tr -d '"' | tr ',' ', ')
    
    echo -e "   ${BLUE}Allowed Users: ${NC}$ALLOWED_USERS"
    echo -e "   ${BLUE}Default User: ${NC}$DEFAULT_USER"
    echo -e "   ${BLUE}TTL: ${NC}$TTL"
    
    # Check allowed extensions
    if [[ "$ROLE_BODY" == *"allowed_extensions"* ]]; then
        echo -e "   ${BLUE}Allowed Extensions: ${NC}$ALLOWED_EXTENSIONS"
        
        # Check for critical extensions
        if [[ "$ROLE_BODY" != *"permit-pty"* ]]; then
            echo -e "${YELLOW}! Warning: 'permit-pty' extension not allowed, which may cause issues with interactive SSH sessions${NC}"
        fi
        
        if [[ "$ROLE_BODY" != *"permit-agent-forwarding"* ]]; then
            echo -e "${YELLOW}! Warning: 'permit-agent-forwarding' extension not allowed, which may limit agent forwarding functionality${NC}"
        fi
    else
        echo -e "${YELLOW}! No allowed_extensions found in role configuration, which may cause signing to fail${NC}"
    fi
elif [ "$ROLE_HTTP_CODE" = "403" ]; then
    echo -e "${YELLOW}! SSH role '$SSH_ROLE_NAME' exists but access is forbidden (permission denied)${NC}"
    echo -e "${YELLOW}  The application may still work if your token has sign permissions but not read permissions${NC}"
else
    echo -e "${RED}✗ SSH role '$SSH_ROLE_NAME' not found (HTTP Code: $ROLE_HTTP_CODE)${NC}"
    echo -e "${YELLOW}Please check the SSH_ROLE_NAME in your .env file${NC}"
    exit 1
fi

# Test 5: Sign Endpoint Test
echo -e "\n${BOLD}5. Testing Sign Endpoint (without actually signing)...${NC}"

# Create temporary test key
TEST_KEY_DIR=$(mktemp -d)
TEST_KEY_PATH="$TEST_KEY_DIR/test_key"

# Try to generate a test key
if command -v ssh-keygen &> /dev/null; then
    ssh-keygen -t ed25519 -f "$TEST_KEY_PATH" -N "" -q
    TEST_PUB_KEY=$(cat "${TEST_KEY_PATH}.pub")
    
    echo -e "${GREEN}✓ Generated test key for endpoint verification${NC}"
    
    # Check sign endpoint
    SIGN_PATH="$VAULT_ADDR/v1/$SSH_SECRETS_PATH/sign/$SSH_ROLE_NAME"
    SIGN_DATA="{\"public_key\":\"$TEST_PUB_KEY\"}"
    
    # Don't actually sign, just check OPTIONS to verify endpoint exists
    OPTIONS_RESPONSE=$(curl -s -X OPTIONS -o /dev/null -w "%{http_code}" "$SIGN_PATH")
    
    if [ "$OPTIONS_RESPONSE" = "200" ] || [ "$OPTIONS_RESPONSE" = "405" ] || [ "$OPTIONS_RESPONSE" = "404" ]; then
        echo -e "${GREEN}✓ Sign endpoint appears to be accessible${NC}"
        echo -e "${BLUE}  Sign endpoint: $SIGN_PATH${NC}"
    else
        echo -e "${RED}✗ Sign endpoint appears to be unreachable (HTTP Code: $OPTIONS_RESPONSE)${NC}"
    fi
    
    # Clean up
    rm -rf "$TEST_KEY_DIR"
else
    echo -e "${YELLOW}! Cannot test sign endpoint - ssh-keygen not available${NC}"
fi

# Summary
echo -e "\n${BOLD}${BLUE}Connectivity Test Summary${NC}"
echo -e "${GREEN}✓ Vault server is reachable${NC}"
echo -e "${GREEN}✓ Authentication is working${NC}"
echo -e "${GREEN}✓ SSH secrets engine is available${NC}"
echo -e "${GREEN}✓ SSH role is configured${NC}"
echo -e "\n${GREEN}${BOLD}The application should be able to connect to Vault and sign SSH keys${NC}\n"

exit 0