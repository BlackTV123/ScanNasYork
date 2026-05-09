/**
 * ScanNasYork API Server
 * Express.js with middleware stack, CORS, rate limiting.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const logger = require('../utils/logger');
const stockRoutes = require('./routes/stocks');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// Middleware
// ============================================

// CORS
app.use(cors({
  origin: [
    `http://localhost:${PORT}`,
    'http://127.0.0.1:' + PORT,
  ],
  methods: ['GET'],
  optionsSuccessStatus: 200,
}));

// Rate limiting
app.use('/api/', rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please try again later' },
}));

// JSON parsing
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    if (req.path.startsWith('/api/')) {
      logger.info(`${req.method} ${req.path}`, {
        status: res.statusCode,
        duration: `${Date.now() - start}ms`,
        ip: req.ip,
      });
    }
  });
  next();
});

// ============================================
// Static Files (Frontend)
// ============================================
app.use(express.static(path.join(__dirname, '..', '..', 'frontend')));

// ============================================
// API Routes
// ============================================
app.use('/api/v1/stocks', stockRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// ============================================
// SPA Fallback — serve index.html for unmatched routes
// ============================================
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ success: false, error: 'Endpoint not found' });
  }
  res.sendFile(path.join(__dirname, '..', '..', 'frontend', 'index.html'));
});

// ============================================
// Error Handler
// ============================================
app.use((err, req, res, _next) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// ============================================
// Start — sync Sequelize then listen
// ============================================
const { sequelize } = require('../models');

(async () => {
  try {
    await sequelize.authenticate();
    logger.info('Database connection established');
    await sequelize.sync(); // Creates tables if they don't exist
    logger.info('Models synchronized');
  } catch (err) {
    logger.error('Database connection failed', { error: err.message });
    logger.warn('Server starting without database — API calls will fail');
  }

  app.listen(PORT, () => {
    logger.info(`ScanNasYork API server running on port ${PORT}`);
    logger.info(`Frontend: http://localhost:${PORT}`);
    logger.info(`API Base: http://localhost:${PORT}/api/v1`);
  });
})();

module.exports = app;

