# Vault SSH Key Signing Application

A professional web application for signing SSH public keys using HashiCorp Vault. This application provides a clean web interface to interact with your Vault server's SSH secrets engine, allowing you to easily sign SSH keys and manage certificates.

## Features

- **Clean Web Interface**: Modern, responsive design with real-time validation
- **Multiple Input Methods**: Paste SSH keys directly or upload `.pub` files
- **Real-time Validation**: Automatic SSH key format validation with detailed feedback
- **Vault Integration**: Seamless integration with HashiCorp Vault SSH secrets engine
- **Security**: Built-in rate limiting, input validation, and secure headers
- **Certificate Management**: Download signed certificates with usage instructions
- **Health Monitoring**: Real-time Vault connectivity status and system health checks
- **Comprehensive Scripts**: Automated setup, version checking, and connectivity testing

## Prerequisites

- **Node.js**: Version 16.0.0 or higher
- **npm**: Version 8.0.0 or higher
- **HashiCorp Vault**: Running with SSH secrets engine configured
- **SSH Role**: Configured Vault role for signing client certificates

## Installation

### Quick Start

1. **Download the application files** to a directory called `vault-ssh-signer`:
   ```bash
   mkdir vault-ssh-signer
   cd vault-ssh-signer
   # Copy all application files to this directory
   ```

2. **Make scripts executable**:
   ```bash
   chmod +x start.sh scripts/*.sh
   ```

3. **Create configuration file**:
   ```bash
   cp .env.example .env
   ```

4. **Update configuration** in `.env` file with your Vault settings:
   ```env
   VAULT_ADDR=http://48.220.48.33:8200
   VAULT_TOKEN=hvs.RDKyi9gf2IpYn92lUWEabWcq
   SSH_SECRETS_PATH=ssh-client-signer
   SSH_ROLE_NAME=admin-role
   DEFAULT_SSH_USER=azureuser
   PORT=3000
   ```

5. **Start the application**:
   ```bash
   ./start.sh
   ```

The startup script will automatically:
- Check system requirements and versions
- Test Vault connectivity
- Install dependencies
- Start the application

### Manual Installation

If you prefer to install manually:

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Test connectivity**:
   ```bash
   ./scripts/test-connectivity.sh
   ```

3. **Start the application**:
   ```bash
   npm start
   ```

## Configuration

### Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `VAULT_ADDR` | Vault server URL | `http://48.220.48.33:8200` |
| `VAULT_TOKEN` | Vault authentication token | `hvs.RDKyi9gf2IpYn92lUWEabWcq` |
| `VAULT_NAMESPACE` | Vault namespace (if using Vault Enterprise) | `admin` or empty |
| `SSH_SECRETS_PATH` | SSH secrets engine mount path | `ssh-client-signer` |
| `SSH_ROLE_NAME` | SSH role name for signing | `admin-role` |
| `DEFAULT_SSH_USER` | Default username for certificates | `azureuser` |
| `CERTIFICATE_TTL` | Certificate validity period | `30m` |
| `PORT` | Application port | `3000` |

### Vault Configuration

Your Vault SSH role must be configured with the appropriate extensions. Example configuration:

```bash
vault write ssh-client-signer/roles/admin-role \
  allow_user_certificates=true \
  allowed_users="*" \
  allowed_extensions="permit-pty,permit-agent-forwarding,permit-port-forwarding" \
  default_extensions='{"permit-pty":""}' \
  key_type="ca" \
  default_user="azureuser" \
  ttl="30m"
```

## Usage

### Accessing the Application

Once started, access the application at:
```
http://localhost:3000
```

### Signing SSH Keys

1. **Check System Status**: The header shows real-time Vault connectivity status
2. **Choose Input Method**: Either paste your SSH public key or upload a `.pub` file
3. **Validate Key**: The application automatically validates SSH key format
4. **Optional Username**: Specify a target username (defaults to `azureuser`)
5. **Sign Key**: Click "Sign SSH Key" to submit to Vault
6. **Download Certificate**: Use the provided certificate for SSH authentication

### Using Signed Certificates

After signing, you'll receive:
- **Signed Certificate**: The actual SSH certificate from Vault
- **Usage Instructions**: Specific commands for your configuration
- **Download Option**: Save certificate as a `.pub` file

Example usage:
```bash
# Save certificate
echo "ssh-rsa-cert-v01@openssh.com ..." > ~/.ssh/id_vault-cert.pub

# Connect to target host
ssh -i ~/.ssh/id_vault -o CertificateFile=~/.ssh/id_vault-cert.pub azureuser@target-host
```

## File Structure

```
vault-ssh-signer/
├── package.json              # Node.js dependencies and scripts
├── start.sh                  # Comprehensive startup script
├── .env.example              # Environment configuration template
├── .env                      # Your environment configuration
├── README.md                 # This file
├── src/                      # Application source code
│   ├── app.js                # Main Express.js application
│   ├── routes/
│   │   └── ssh.js            # SSH signing API routes
│   ├── utils/
│   │   ├── vault.js          # Vault client configuration
│   │   └── validation.js     # SSH key validation utilities
│   └── middleware/
│       └── security.js       # Security middleware
├── public/                   # Frontend assets
│   ├── index.html            # Main web interface
│   ├── css/
│   │   └── style.css         # Application styles
│   └── js/
│       └── app.js            # Frontend JavaScript
└── scripts/                  # Utility scripts
    ├── check-versions.sh     # System requirements checker
    ├── test-connectivity.sh  # Vault connectivity tester
    └── setup.sh              # Initial setup script
```

## API Endpoints

### SSH Key Signing
- **POST** `/api/ssh/sign`
  - Sign an SSH public key
  - Accepts `publicKey` (text) or `sshKeyFile` (upload)
  - Optional `username` parameter

### Health and Status
- **GET** `/api/ssh/health`
  - Check Vault connectivity and system status
- **GET** `/api/ssh/ca-public-key`
  - Retrieve Vault SSH CA public key
- **GET** `/api/ssh/role-info`
  - Get SSH role configuration

## Security Features

- **Rate Limiting**: Prevents abuse with configurable request limits
- **Input Validation**: Comprehensive SSH key format validation
- **Security Headers**: Helmet.js for security header management
- **File Upload Security**: Restricted file types and size limits
- **CORS Protection**: Configurable cross-origin request handling

## Troubleshooting

### Common Issues

1. **Connection Refused**
   - Check `VAULT_ADDR` in `.env` file
   - Verify Vault server is running and accessible
   - Test with: `curl $VAULT_ADDR/v1/sys/health`

2. **Authentication Failed**
   - Verify `VAULT_TOKEN` is valid and not expired
   - Check token permissions with: `vault token lookup`

3. **Permission Denied**
   - Ensure token has proper policies attached
   - Verify SSH secrets engine is mounted at correct path
   - Check role configuration and permissions

4. **Extensions Error**
   - Update SSH role to include required extensions
   - See configuration example above

### Debug Mode

Run in development mode for detailed logging:
```bash
NODE_ENV=development npm start
```

### Manual Testing

Test Vault connectivity manually:
```bash
./scripts/test-connectivity.sh
```

Test API endpoints:
```bash
# Health check
curl http://localhost:3000/api/ssh/health

# Sign a key (with actual SSH public key)
curl -X POST -F 'publicKey=ssh-rsa AAAAB3...' http://localhost:3000/api/ssh/sign
```

## Development

### Running in Development Mode

```bash
npm run dev
```

Uses `nodemon` for automatic restarts on file changes.

### Project Structure Guidelines

- **src/**: All server-side code
- **public/**: Static frontend assets
- **scripts/**: Utility and setup scripts
- **Environment**: Use `.env` for configuration

## Support

For issues and questions:

1. Check the troubleshooting section above
2. Verify your Vault configuration matches the examples
3. Test connectivity with the provided scripts
4. Review application logs for detailed error messages

## License

MIT License - See LICENSE file for details.

---

**Note**: This application is designed to work with your existing HashiCorp Vault configuration. Ensure your Vault server is properly configured with SSH secrets engine and appropriate roles before using this application.