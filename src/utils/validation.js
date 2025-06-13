/**
 * SSH Key Validation Utility
 * Validates SSH public key format and extracts key information
 */

/**
 * Validate SSH public key format
 * @param {string} publicKey - The SSH public key to validate
 * @returns {object} - Validation result with isValid, keyType, and error
 */
function validateSSHPublicKey(publicKey) {
  // Remove any leading/trailing whitespace
  publicKey = publicKey.trim();

  // Check if key is empty
  if (!publicKey) {
    return {
      isValid: false,
      error: 'SSH public key is empty'
    };
  }

  // SSH public key format: <key-type> <key-data> [comment]
  const parts = publicKey.split(/\s+/);
  
  if (parts.length < 2) {
    return {
      isValid: false,
      error: 'SSH public key must contain at least key type and key data'
    };
  }

  const keyType = parts[0];
  const keyData = parts[1];
  const comment = parts.slice(2).join(' ');

  // Supported SSH key types
  const supportedKeyTypes = [
    'ssh-rsa',
    'ssh-dss',
    'ssh-ed25519',
    'ecdsa-sha2-nistp256',
    'ecdsa-sha2-nistp384',
    'ecdsa-sha2-nistp521',
    'sk-ssh-ed25519@openssh.com',
    'sk-ecdsa-sha2-nistp256@openssh.com'
  ];

  // Check if key type is supported
  if (!supportedKeyTypes.includes(keyType)) {
    return {
      isValid: false,
      error: `Unsupported key type: ${keyType}. Supported types: ${supportedKeyTypes.join(', ')}`
    };
  }

  // Check if key data is base64
  const base64Regex = /^[A-Za-z0-9+/]+={0,2}$/;
  if (!base64Regex.test(keyData)) {
    return {
      isValid: false,
      error: 'SSH key data is not valid base64'
    };
  }

  // Check minimum key data length (rough estimate)
  if (keyData.length < 50) {
    return {
      isValid: false,
      error: 'SSH key data appears to be too short'
    };
  }

  // Validate specific key types
  try {
    switch (keyType) {
      case 'ssh-rsa':
        validateRSAKey(keyData);
        break;
      case 'ssh-ed25519':
        validateEd25519Key(keyData);
        break;
      case 'ecdsa-sha2-nistp256':
      case 'ecdsa-sha2-nistp384':
      case 'ecdsa-sha2-nistp521':
        validateECDSAKey(keyData);
        break;
      // For other types, we rely on the basic checks above
    }
  } catch (error) {
    return {
      isValid: false,
      error: error.message
    };
  }

  return {
    isValid: true,
    keyType: keyType,
    keyData: keyData,
    comment: comment,
    fingerprint: generateFingerprint(keyType, keyData)
  };
}

/**
 * Validate RSA key specific requirements
 * @param {string} keyData - Base64 encoded key data
 */
function validateRSAKey(keyData) {
  // RSA keys should be at least 1024 bits (though 2048+ is recommended)
  // This is a rough check based on key data length
  if (keyData.length < 200) {
    throw new Error('RSA key appears to be too short (minimum 1024 bits recommended)');
  }
}

/**
 * Validate Ed25519 key specific requirements
 * @param {string} keyData - Base64 encoded key data
 */
function validateEd25519Key(keyData) {
  // Ed25519 keys have a fixed length of 32 bytes (44 characters in base64)
  // Plus some overhead for the key type encoding
  if (keyData.length < 60 || keyData.length > 80) {
    throw new Error('Ed25519 key data length is outside expected range');
  }
}

/**
 * Validate ECDSA key specific requirements
 * @param {string} keyData - Base64 encoded key data
 */
function validateECDSAKey(keyData) {
  // ECDSA keys vary in length based on curve
  if (keyData.length < 80) {
    throw new Error('ECDSA key appears to be too short');
  }
}

/**
 * Generate a simple fingerprint for the SSH key
 * @param {string} keyType - SSH key type
 * @param {string} keyData - Base64 encoded key data
 * @returns {string} - SHA256 fingerprint
 */
function generateFingerprint(keyType, keyData) {
  const crypto = require('crypto');
  const hash = crypto.createHash('sha256');
  hash.update(`${keyType} ${keyData}`);
  const fingerprint = hash.digest('base64').replace(/=+$/, '');
  return `SHA256:${fingerprint}`;
}

/**
 * Extract key information for display
 * @param {string} publicKey - The SSH public key
 * @returns {object} - Key information
 */
function getKeyInfo(publicKey) {
  const validation = validateSSHPublicKey(publicKey);
  
  if (!validation.isValid) {
    return validation;
  }

  return {
    isValid: true,
    keyType: validation.keyType,
    comment: validation.comment,
    fingerprint: validation.fingerprint,
    keyLength: validation.keyData.length,
    hasComment: validation.comment && validation.comment.length > 0
  };
}

module.exports = {
  validateSSHPublicKey,
  getKeyInfo
};