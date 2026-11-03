const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const authRoutes = require('./routes/authRoutes');
const examRoutes = require('./routes/examRoutes');
const submissionRoutes = require('./routes/submissionRoutes');
const db = require('./config/db');

const app = express();

// -----------------------------------------------------------------------------
// 1. Security & Core Middleware
// -----------------------------------------------------------------------------
// Helmet for HTTP header security with CSP configured for frontend scripts
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

// CORS Configuration
const allowedOrigin = process.env.CLIENT_URL || '*';
app.use(
  cors({
    origin: allowedOrigin === '*' ? true : allowedOrigin,
    credentials: true,
  })
);

// Rate Limiting for API protection
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX || '300', 10), // Limit each IP to 300 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests from this IP address. Please try again later.',
  },
});
app.use('/api', limiter);

// Request body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// -----------------------------------------------------------------------------
// 2. Static File Serving (Frontend Delivery)
// -----------------------------------------------------------------------------
// Serves the vanilla frontend directly from public/ or root directory
const publicDir = path.join(__dirname, '../public');
const rootDir = path.join(__dirname, '..');

app.use(express.static(publicDir));
app.use(express.static(rootDir, { index: false }));

// -----------------------------------------------------------------------------
// 3. API Health Check Endpoint (For Render Zero-Downtime Deployment)
// -----------------------------------------------------------------------------
app.get('/health', async (req, res) => {
  let dbStatus = 'CONNECTED';
  try {
    await db.query('SELECT 1');
  } catch (err) {
    dbStatus = 'DISCONNECTED';
  }

  const statusCode = dbStatus === 'CONNECTED' ? 200 : 503;
  return res.status(statusCode).json({
    status: dbStatus === 'CONNECTED' ? 'HEALTHY' : 'DEGRADED',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    database: dbStatus,
    environment: process.env.NODE_ENV || 'development',
  });
});

app.get('/api/health', (req, res) => {
  res.redirect('/health');
});

// -----------------------------------------------------------------------------
// 4. API Endpoints
// -----------------------------------------------------------------------------
app.use('/api/auth', authRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/submissions', submissionRoutes);

// Fallback route for Single Page Application
app.get('/', (req, res) => {
  res.sendFile(path.join(rootDir, 'index.html'));
});

// -----------------------------------------------------------------------------
// 5. Global Error Handling
// -----------------------------------------------------------------------------
// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `API Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// Centralized error handler
app.use((err, req, res, next) => {
  console.error('[Unhandled Server Error]:', err);

  // Multer file upload errors
  if (err.name === 'MulterError') {
    return res.status(400).json({
      success: false,
      message: `File upload error: ${err.message}`,
    });
  }

  const statusCode = err.status || 500;
  return res.status(statusCode).json({
    success: false,
    message: err.message || 'An unexpected internal server error occurred.',
    error: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
});

module.exports = app;
