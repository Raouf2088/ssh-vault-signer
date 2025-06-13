/**
 * Vault SSH Key Signer - Frontend JavaScript
 * Handles the user interface and API interactions
 */

document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    const vaultAddrElem = document.getElementById('vaultAddr');
    const sshPathElem = document.getElementById('sshPath');
    const sshRoleElem = document.getElementById('sshRole');
    const pasteBtn = document.getElementById('pasteBtn');
    const uploadBtn = document.getElementById('uploadBtn');
    const pasteMethod = document.getElementById('pasteMethod');
    const uploadMethod = document.getElementById('uploadMethod');
    const publicKeyInput = document.getElementById('publicKey');
    const fileUploadArea = document.getElementById('fileUploadArea');
    const sshKeyFileInput = document.getElementById('sshKeyFile');
    const fileInfo = document.getElementById('fileInfo');
    const fileName = document.getElementById('fileName');
    const removeFile = document.getElementById('removeFile');
    const keyValidation = document.getElementById('keyValidation');
    const validationIcon = document.getElementById('validationIcon');
    const validationText = document.getElementById('validationText');
    const submitBtn = document.getElementById('submitBtn');
    const sshForm = document.getElementById('sshForm');
    const loadingOverlay = document.getElementById('loadingOverlay');
    const resultsCard = document.getElementById('resultsCard');
    const certificateInfo = document.getElementById('certificateInfo');
    const signedCertificate = document.getElementById('signedCertificate');
    const usageInstructions = document.getElementById('usageInstructions');
    const copyCertBtn = document.getElementById('copyCertBtn');
    const downloadCertBtn = document.getElementById('downloadCertBtn');
    const errorAlert = document.getElementById('errorAlert');
    const successAlert = document.getElementById('successAlert');
    const errorMessage = document.getElementById('errorMessage');
    const successMessage = document.getElementById('successMessage');
    const closeError = document.getElementById('closeError');
    const closeSuccess = document.getElementById('closeSuccess');
    
    // State management
    let currentMethod = 'paste';
    let sshKeyValidated = false;
    let uploadedFile = null;
    
    // ===============================================================
    // Health Check and System Status
    // ===============================================================
    
    /**
     * Check the health of the system and Vault connection
     */
    async function checkHealth() {
        try {
            statusDot.classList.remove('connected', 'error');
            statusText.textContent = 'Checking connection...';
            
            const response = await fetch('/api/ssh/health');
            const data = await response.json();
            
            if (response.ok && data.status === 'success') {
                // Update status indicator
                statusDot.classList.add('connected');
                statusText.textContent = 'Connected to Vault';
                
                // Update health card
                vaultAddrElem.textContent = data.data.vault_addr;
                sshPathElem.textContent = data.data.ssh_secrets_path;
                sshRoleElem.textContent = data.data.ssh_role_name;
                
                return true;
            } else {
                throw new Error(data.message || 'Failed to connect to Vault');
            }
        } catch (error) {
            console.error('Health check failed:', error);
            
            // Update status indicator
            statusDot.classList.add('error');
            statusText.textContent = 'Vault connection error';
            
            // Show error
            showError('Could not connect to Vault server. Please check your configuration and try again.');
            
            return false;
        }
    }
    
    // Perform initial health check
    checkHealth();
    
    // ===============================================================
    // Input Method Switching
    // ===============================================================
    
    /**
     * Switch between input methods (paste/upload)
     */
    function switchMethod(method) {
        currentMethod = method;
        
        // Update button states
        pasteBtn.classList.toggle('active', method === 'paste');
        uploadBtn.classList.toggle('active', method === 'upload');
        
        // Show/hide appropriate method
        pasteMethod.classList.toggle('hidden', method !== 'paste');
        uploadMethod.classList.toggle('hidden', method !== 'upload');
        
        // Reset validation state
        validateAndUpdateUI();
    }
    
    // Method button event listeners
    pasteBtn.addEventListener('click', () => switchMethod('paste'));
    uploadBtn.addEventListener('click', () => switchMethod('upload'));
    
    // ===============================================================
    // File Upload Handling
    // ===============================================================
    
    /**
     * Handle file selection
     */
    function handleFileSelect(files) {
        if (!files || files.length === 0) return;
        
        const file = files[0];
        
        // Check file size
        if (file.size > 50 * 1024) { // 50KB max
            showError('File is too large. Maximum allowed size is 50KB.');
            return;
        }
        
        // Validate file type
        if (!file.name.endsWith('.pub') && file.name.includes('.')) {
            showError('Only SSH public key files (.pub) are allowed.');
            return;
        }
        
        // Store file
        uploadedFile = file;
        
        // Update UI
        uploadMethod.classList.add('file-selected');
        fileInfo.classList.remove('hidden');
        fileName.textContent = file.name;
        
        // Read file for validation
        const reader = new FileReader();
        reader.onload = (e) => {
            const fileContent = e.target.result;
            validateSSHKey(fileContent);
        };
        reader.readAsText(file);
    }
    
    // File input change event
    sshKeyFileInput.addEventListener('change', (e) => {
        handleFileSelect(e.target.files);
    });
    
    // File drop area events
    fileUploadArea.addEventListener('click', () => {
        sshKeyFileInput.click();
    });
    
    fileUploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        fileUploadArea.classList.add('dragover');
    });
    
    fileUploadArea.addEventListener('dragleave', () => {
        fileUploadArea.classList.remove('dragover');
    });
    
    fileUploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        fileUploadArea.classList.remove('dragover');
        handleFileSelect(e.dataTransfer.files);
    });
    
    // Remove file button
    removeFile.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent triggering fileUploadArea click
        uploadedFile = null;
        sshKeyFileInput.value = '';
        fileInfo.classList.add('hidden');
        uploadMethod.classList.remove('file-selected');
        sshKeyValidated = false;
        validateAndUpdateUI();
    });
    
    // ===============================================================
    // SSH Key Validation
    // ===============================================================
    
    /**
     * Validate SSH public key format
     */
    function validateSSHKey(key) {
        // Empty check
        if (!key || key.trim() === '') {
            keyValidation.className = 'key-validation';
            validationIcon.innerHTML = '';
            validationText.textContent = 'Enter an SSH public key to validate';
            sshKeyValidated = false;
            validateAndUpdateUI();
            return;
        }
        
        key = key.trim();
        
        // Basic format check
        const parts = key.split(/\s+/);
        
        if (parts.length < 2) {
            showInvalidKey('Invalid SSH key format. Expected format: <key-type> <key-data> [comment]');
            return;
        }
        
        const keyType = parts[0];
        const keyData = parts[1];
        
        // Known key types
        const validKeyTypes = [
            'ssh-rsa',
            'ssh-dss',
            'ssh-ed25519',
            'ecdsa-sha2-nistp256',
            'ecdsa-sha2-nistp384',
            'ecdsa-sha2-nistp521'
        ];
        
        if (!validKeyTypes.includes(keyType)) {
            showInvalidKey(`Unknown key type: ${keyType}. Supported types: ${validKeyTypes.join(', ')}`);
            return;
        }
        
        // Check if key data is base64
        const base64Regex = /^[A-Za-z0-9+/]+={0,2}$/;
        if (!base64Regex.test(keyData)) {
            showInvalidKey('Key data is not valid base64 format');
            return;
        }
        
        // Show valid key
        keyValidation.className = 'key-validation valid';
        validationIcon.innerHTML = '<i class="fas fa-check-circle"></i>';
        validationText.textContent = `Valid ${keyType} key${parts.length > 2 ? ' (' + parts.slice(2).join(' ') + ')' : ''}`;
        sshKeyValidated = true;
        validateAndUpdateUI();
    }
    
    function showInvalidKey(message) {
        keyValidation.className = 'key-validation invalid';
        validationIcon.innerHTML = '<i class="fas fa-exclamation-circle"></i>';
        validationText.textContent = message;
        sshKeyValidated = false;
        validateAndUpdateUI();
    }
    
    // Listen for changes to public key input
    publicKeyInput.addEventListener('input', () => {
        validateSSHKey(publicKeyInput.value);
    });
    
    // ===============================================================
    // Form Submission and API Interaction
    // ===============================================================
    
    /**
     * Update UI based on validation state
     */
    function validateAndUpdateUI() {
        // Enable/disable submit button
        submitBtn.disabled = !sshKeyValidated;
        
        // Clear previous results
        resultsCard.classList.add('hidden');
    }
    
    /**
     * Handle form submission
     */
    sshForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Show loading overlay
        loadingOverlay.classList.remove('hidden');
        
        try {
            // Create form data
            const formData = new FormData();
            
            // Add username if specified
            const username = document.getElementById('username').value.trim();
            if (username) {
                formData.append('username', username);
            }
            
            // Add SSH key based on method
            if (currentMethod === 'paste') {
                formData.append('publicKey', publicKeyInput.value.trim());
            } else {
                if (uploadedFile) {
                    formData.append('sshKeyFile', uploadedFile);
                } else {
                    showError('No file selected');
                    loadingOverlay.classList.add('hidden');
                    return;
                }
            }
            
            // Submit to API
            const response = await fetch('/api/ssh/sign', {
                method: 'POST',
                body: formData
            });
            
            const data = await response.json();
            
            if (response.ok && data.status === 'success') {
                // Process successful response
                displayResults(data.data);
                showSuccess('SSH key signed successfully');
            } else {
                // Handle error response
                throw new Error(data.message || 'Failed to sign SSH key');
            }
        } catch (error) {
            console.error('Signing error:', error);
            showError(error.message || 'An unexpected error occurred while signing your SSH key');
        } finally {
            // Hide loading overlay
            loadingOverlay.classList.add('hidden');
        }
    });
    
    /**
     * Display signing results
     */
    function displayResults(data) {
        // Show results card
        resultsCard.classList.remove('hidden');
        
        // Scroll to results
        resultsCard.scrollIntoView({ behavior: 'smooth' });
        
        // Set signed certificate
        signedCertificate.value = data.signed_key;
        
        // Build certificate info
        certificateInfo.innerHTML = `
            <h4>Certificate Details</h4>
            <div class="health-item">
                <label>Serial Number:</label>
                <span>${data.serial_number}</span>
            </div>
            <div class="health-item">
                <label>User:</label>
                <span>${data.username}</span>
            </div>
            <div class="health-item">
                <label>Key Type:</label>
                <span>${data.key_type}</span>
            </div>
            <div class="health-item">
                <label>Validity:</label>
                <span>${data.ttl}</span>
            </div>
        `;
        
        // Build usage instructions
        usageInstructions.innerHTML = `
            <h4>How to Use Your Signed Certificate</h4>
            <p>To use this signed certificate, follow these steps:</p>
            
            <ol>
                <li>Save the certificate to a file:
                    <pre>${data.instructions.save_certificate}</pre>
                </li>
                <li>Connect to your target host:
                    <pre>${data.instructions.use_certificate}</pre>
                </li>
            </ol>
            
            <p><strong>Note:</strong> The certificate is valid for ${data.ttl}. After this period, you'll need to sign a new certificate.</p>
        `;
    }
    
    // ===============================================================
    // Certificate Actions
    // ===============================================================
    
    /**
     * Copy certificate to clipboard
     */
    copyCertBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(signedCertificate.value)
            .then(() => {
                showSuccess('Certificate copied to clipboard');
            })
            .catch(() => {
                showError('Failed to copy certificate');
            });
    });
    
    /**
     * Download certificate as a file
     */
    downloadCertBtn.addEventListener('click', () => {
        const username = document.getElementById('username').value.trim() || 'azureuser';
        const fileName = `${username}-cert.pub`;
        
        const blob = new Blob([signedCertificate.value], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        
        // Clean up
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
    });
    
    // ===============================================================
    // Alert Handling
    // ===============================================================
    
    /**
     * Show error alert
     */
    function showError(message) {
        errorMessage.textContent = message;
        errorAlert.classList.remove('hidden');
        
        // Auto-hide after 10 seconds
        setTimeout(() => {
            errorAlert.classList.add('hidden');
        }, 10000);
    }
    
    /**
     * Show success alert
     */
    function showSuccess(message) {
        successMessage.textContent = message;
        successAlert.classList.remove('hidden');
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
            successAlert.classList.add('hidden');
        }, 5000);
    }
    
    // Alert close buttons
    closeError.addEventListener('click', () => {
        errorAlert.classList.add('hidden');
    });
    
    closeSuccess.addEventListener('click', () => {
        successAlert.classList.add('hidden');
    });
    
    // ===============================================================
    // Initialization
    // ===============================================================
    
    // Perform periodic health checks
    setInterval(checkHealth, 60000); // Check every minute
});