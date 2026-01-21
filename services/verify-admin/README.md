# Lea Verify Admin Service

Moderator-only verification service for the Lea community labeler. This service provides APIs for administrators to verify researchers and organizations on Bluesky.

## Features

- **Researcher Verification**: Verify researchers by Bluesky handle with OpenAlex/ORCID integration
- **Organization Verification**: Verify venues, labs, and institutions
- **Bulk Verification**: CSV import for batch verification
- **Label Management**: Configure Bluesky labeler badges
- **Ozone Integration**: Sync with existing labeled accounts

## Development

### Prerequisites

- Node.js 20+
- Access to a PostgreSQL database (shared with main lea app)
- Bluesky labeler credentials
- (Optional) Ozone instance credentials

### Setup

1. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

2. Configure your `.env` file with:
   - `POSTGRES_URL` - Database connection string
   - `ADMIN_API_KEY` - Secure API key for authentication
   - `BLUESKY_LABELER_*` - Labeler account credentials
   - `OZONE_*` - Ozone service credentials (if using)

3. Install dependencies:
   ```bash
   npm install
   ```

4. Run in development:
   ```bash
   npm run dev
   ```

### API Endpoints

All endpoints require `X-API-Key` header with your admin API key.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/api/admin/stats` | Get verification statistics |
| POST | `/api/admin/quick-verify` | Verify a single researcher |
| POST | `/api/admin/quick-verify-org` | Verify an organization |
| POST | `/api/admin/bulk-verify` | Bulk verify from CSV data |
| GET | `/api/admin/openalex-search` | Search OpenAlex for authors |
| GET | `/api/admin/resolve-handle` | Resolve Bluesky handle to profile |
| GET | `/api/admin/labels` | List configured labels |
| POST | `/api/admin/labels` | Create a new label |
| PATCH | `/api/admin/labels/:id` | Update a label |
| DELETE | `/api/admin/labels/:id` | Delete a label |
| POST | `/api/admin/sync-from-ozone` | Import labeled accounts from Ozone |

## Deployment

### Docker

Build and run with Docker:

```bash
docker build -t verify-admin .
docker run -p 3001:3001 --env-file .env verify-admin
```

Or use docker-compose:

```bash
docker-compose up -d
```

### Railway

1. Connect your GitHub repository
2. Set the root directory to `services/verify-admin`
3. Configure environment variables in Railway dashboard
4. Railway will auto-detect the Dockerfile

### Vercel (Serverless)

This service is designed as a long-running Express server and is not directly compatible with Vercel's serverless functions. For Vercel deployment, consider:

1. Using Vercel's Edge Functions with modifications
2. Deploying to a separate service (Railway, Fly.io, etc.)

### Environment Variables

See `.env.example` for all required and optional environment variables.

**Required for production:**
- `POSTGRES_URL` - Database connection
- `ADMIN_API_KEY` - API authentication key
- `BLUESKY_LABELER_DID` - Labeler account DID
- `BLUESKY_LABELER_PASSWORD` - Labeler account app password

## Frontend Integration

The admin UI is located in the main lea app at `/app/admin/`. Configure the frontend to connect to this service:

```env
# In the main lea app's .env.local
NEXT_PUBLIC_VERIFY_ADMIN_URL=http://localhost:3001
```

For production, set this to your deployed service URL.

## Security

- All admin endpoints require API key authentication
- Rate limiting is applied to prevent abuse
- CORS is configured to only allow the frontend origin
- Helmet.js provides security headers

## Database

This service uses the same PostgreSQL database as the main lea app. Tables used:

- `verified_researchers` - Verified researcher records
- `verified_organizations` - Verified organization records
- `established_venues` - Known academic venues
- `audit_logs` - Verification action logs
