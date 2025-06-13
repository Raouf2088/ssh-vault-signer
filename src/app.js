/**
 * Vault SSH Key Signing Application
 * Main application file
 */

// Load environment variables
require('dotenv').config();

// Import dependencies
const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

// Import routes
const sshRoutes = require('./routes/ssh');

// Create Express application
const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
    },
  },
}));

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests from this IP, please try again after 15 minutes'
});

// Apply rate limiter to all requests
app.use(apiLimiter);

// Enable CORS
app.use(cors());

// Logger
app.use(morgan('dev'));

// Parse JSON and URL-encoded bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

// Mount routes
app.use('/api/ssh', sshRoutes);

// Root route redirects to index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    status: 'error',
    message: 'An internal server error occurred',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Vault server: ${process.env.VAULT_ADDR}`);
  console.log(`SSH secrets path: ${process.env.SSH_SECRETS_PATH}`);
  console.log(`SSH role name: ${process.env.SSH_ROLE_NAME}`);
  console.log(`Access the application at: http://localhost:${PORT}`);
});

// Export app for testing
module.exports = app;