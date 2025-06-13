/**
 * SSH Routes
 * Handles SSH key signing and related operations
 */

const express = require('express');
const multer = require('multer');
const { vaultClient } = require('../utils/vault');
const { validateSSHPublicKey } = require('../utils/validation');

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024, // 50KB - SSH keys are typically much smaller
    files: 1
  },
  fileFilter: (req, file, cb) => {
    // Only allow .pub files or files without extension
    if (file.originalname.endsWith('.pub') || !file.originalname.includes('.')) {
      cb(null, true);
    } else {
      cb(new Error('Only SSH public key files (.pub) are allowed'));
    }
  }
});

/**
 * POST /api/ssh/sign
 * Sign an SSH public key
 */
router.post('/sign', upload.single('sshKeyFile'), async (req, res) => {
  try {
    let publicKey;
    let username = req.body.username || process.env.DEFAULT_SSH_USER || 'azureuser';

    // Get public key from request body or uploaded file
    if (req.file) {
      publicKey = req.file.buffer.toString('utf8').trim();
    } else if (req.body.publicKey) {
      publicKey = req.body.publicKey.trim();
    } else {
      return res.status(400).json({
        status: 'error',
        message: 'No SSH public key provided. Please provide either publicKey in the request body or upload a file.'
      });
    }

    // Validate the SSH public key
    const validation = validateSSHPublicKey(publicKey);
    if (!validation.isValid) {
      return res.status(400).json({
        status: 'error',
        message: `Invalid SSH public key: ${validation.error}`
      });
    }

    // Prepare signing request
    const signingPath = `${process.env.SSH_SECRETS_PATH}/sign/${process.env.SSH_ROLE_NAME}`;
    const signingRequest = {
      public_key: publicKey,
      valid_principals: username,
      ttl: process.env.CERTIFICATE_TTL || '30m'
    };

    // Sign the key with Vault
    const signedResult = await vaultClient.write(signingPath, signingRequest);

    if (!signedResult || !signedResult.data || !signedResult.data.signed_key) {
      throw new Error('Vault did not return a signed certificate');
    }

    // Return successful response
    res.json({
      status: 'success',
      data: {
        signed_key: signedResult.data.signed_key,
        serial_number: signedResult.data.serial_number,
        username: username,
        ttl: process.env.CERTIFICATE_TTL || '30m',
        key_type: validation.keyType,
        instructions: {
          save_certificate: `echo "${signedResult.data.signed_key}" > ~/.ssh/id_vault-cert.pub`,
          use_certificate: `ssh -i ~/.ssh/id_vault -o CertificateFile=~/.ssh/id_vault-cert.pub ${username}@<target-host>`
        }
      }
    });

  } catch (error) {
    console.error('SSH signing error:', error);
    
    // Handle specific Vault errors
    if (error.message && error.message.includes('permission denied')) {
      return res.status(403).json({
        status: 'error',
        message: 'Permission denied. Check your Vault token and role permissions.'
      });
    }

    if (error.message && error.message.includes('extensions')) {
      return res.status(400).json({
        status: 'error',
        message: 'SSH role configuration error. Check that allowed_extensions includes required extensions.'
      });
    }

    res.status(500).json({
      status: 'error',
      message: 'Failed to sign SSH key: ' + (error.message || 'Unknown error')
    });
  }
});

/**
 * GET /api/ssh/ca-public-key
 * Get the Vault SSH CA public key
 */
router.get('/ca-public-key', async (req, res) => {
  try {
    const caPath = `${process.env.SSH_SECRETS_PATH}/public_key`;
    const caResult = await vaultClient.read(caPath);

    if (!caResult || !caResult.data) {
      throw new Error('Failed to retrieve CA public key');
    }

    res.json({
      status: 'success',
      data: {
        ca_public_key: caResult.data.public_key || caResult.data
      }
    });

  } catch (error) {
    console.error('CA public key error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve CA public key: ' + (error.message || 'Unknown error')
    });
  }
});

/**
 * GET /api/ssh/role-info
 * Get information about the SSH role
 */
router.get('/role-info', async (req, res) => {
  try {
    const rolePath = `${process.env.SSH_SECRETS_PATH}/roles/${process.env.SSH_ROLE_NAME}`;
    const roleResult = await vaultClient.read(rolePath);

    if (!roleResult || !roleResult.data) {
      throw new Error('Failed to retrieve role information');
    }

    res.json({
      status: 'success',
      data: roleResult.data
    });

  } catch (error) {
    console.error('Role info error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve role information: ' + (error.message || 'Unknown error')
    });
  }
});

/**
 * GET /api/ssh/health
 * Check Vault connectivity and SSH secrets engine health
 */
router.get('/health', async (req, res) => {
  try {
    // Test Vault connectivity
    const sealStatus = await vaultClient.status();
    
    // Test SSH secrets engine
    const rolePath = `${process.env.SSH_SECRETS_PATH}/roles/${process.env.SSH_ROLE_NAME}`;
    await vaultClient.read(rolePath);

    res.json({
      status: 'success',
      data: {
        vault_addr: process.env.VAULT_ADDR,
        vault_sealed: sealStatus.sealed,
        ssh_secrets_path: process.env.SSH_SECRETS_PATH,
        ssh_role_name: process.env.SSH_ROLE_NAME,
        healthy: true
      }
    });

  } catch (error) {
    console.error('Health check error:', error);
    res.status(503).json({
      status: 'error',
      message: 'Service unhealthy: ' + (error.message || 'Unknown error'),
      data: {
        vault_addr: process.env.VAULT_ADDR,
        ssh_secrets_path: process.env.SSH_SECRETS_PATH,
        ssh_role_name: process.env.SSH_ROLE_NAME,
        healthy: false
      }
    });
  }
});

module.exports = router;