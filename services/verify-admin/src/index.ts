import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config, validateConfig } from './config.js';

// Import routes
import adminRouter from './routes/admin.js';

// Validate configuration
validateConfig();

const app = express();

// Trust proxy (required for Railway/Vercel/etc.)
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());

// CORS - allow frontend and admin UI origins
const allowedOrigins = [
  config.frontendUrl,
  'http://localhost:3000',
  'http://localhost:3001',
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.some(allowed => origin.startsWith(allowed.replace(/\/$/, '')))) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes - Admin only (moderator verification)
app.use('/api/admin', adminRouter);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
const PORT = config.port;
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════╗
║                                                       ║
║   Lea Verification Service (Admin Only)               ║
║   Running on http://localhost:${PORT}                    ║
║                                                       ║
║   Endpoints:                                          ║
║   - /api/admin/*  Admin verification endpoints        ║
║                                                       ║
╚═══════════════════════════════════════════════════════╝
  `);
});

export default app;
