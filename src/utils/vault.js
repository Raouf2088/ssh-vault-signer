/**
 * Vault Client Utility
 * Configures and exports HashiCorp Vault client
 */

const vault = require('node-vault');

// Configure Vault client
const vaultOptions = {
  apiVersion: 'v1',
  endpoint: process.env.VAULT_ADDR,
  token: process.env.VAULT_TOKEN
};

// Add namespace if specified
if (process.env.VAULT_NAMESPACE) {
  vaultOptions.namespace = process.env.VAULT_NAMESPACE;
}

// Create Vault client instance
const vaultClient = vault(vaultOptions);

// Test connection on startup
const testConnection = async () => {
  try {
    const health = await vaultClient.status();
    console.log('Vault connection successful');
    console.log(`Vault sealed: ${health.sealed}`);
    console.log(`Vault version: ${health.version}`);
    return true;
  } catch (error) {
    console.error('Vault connection failed:', error.message);
    return false;
  }
};

// Test connection when module is loaded
testConnection();

module.exports = {
  vaultClient,
  testConnection
};