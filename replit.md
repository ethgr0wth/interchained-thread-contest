# Interchained Thread Contest

## Overview
A viral X.com (Twitter) threads competition platform for Interchained with crypto prize distribution (USDT and $ITC tokens). Features public voting, judge scoring, leaderboards, and admin campaign management.

## Architecture
- **Backend**: FastAPI (Python) with Redis-only database
- **Frontend**: React SPA with Aceternity-inspired UI and X.com branding
- **Database**: Redis for all data storage (sessions, threads, votes, judges)

## Key Features
1. **Thread Submission**: Users submit X.com thread URLs with wallet addresses (USDT BSC + ITC)
2. **Public Voting**: Anonymous 1-5 star voting system
3. **Judge Scoring**: Admin judges score threads 0-100
4. **Leaderboard**: Live-updating rankings combining judge (70%) and public (30%) scores
5. **Campaign Management**: Super admin controls prizes, dates, goals
6. **Thread Detail Pages**: Server-rendered thread detail pages with meta tags for sharing
7. **SEO-Friendly URLs**: Auto-generated slugs like `/thread/username-thread-title-abc123`

## Prize Structure (Default)
- 1st Place: 50 USDT
- 2nd Place: 2,000 $ITC
- 3rd Place: 1,500 $ITC
- 4th Place: 1,000 $ITC
- 5th Place: 500 $ITC

## Admin Access

No default admin accounts are created. Create the first super admin with the CLI before opening the application to users.

### Login Process
1. Go to the Admin page (click "Admin" in navbar)
2. Enter username and password
3. Judges can score threads
4. Super Admins can also manage campaign settings and create/delete judges

### Creating Admins via CLI Script
```bash
# Create a new judge
python scripts/create_admin.py --username judge1 --password mypassword123

# Create the first super admin
python scripts/create_admin.py --username your-admin-name --password 'use-a-strong-password' --super-admin

# List all judges
python scripts/create_admin.py --list

# Delete a judge
python scripts/create_admin.py --delete --username judge1
```

### Creating Judges via Admin UI
1. Login as Super Admin
2. Go to Admin Panel > Judges tab
3. Fill in username, password, and optionally check "Super Admin"
4. Click "Create Judge"

## Project Structure
```
├── backend/
│   ├── main.py          # FastAPI app with all routes
│   ├── models.py        # Pydantic models
│   ├── database.py      # Redis database operations
│   ├── twitter_scraper.py # Thread data fetching
│   └── config.py        # Configuration
├── static/
│   ├── index.html       # Main HTML with Tailwind/X.com styling
│   └── app.js           # React SPA application
├── scripts/
│   └── create_admin.py  # CLI for admin management
└── run.py               # Application entry point
```

## Scoring System
- Combined Score = (Judge Average × 0.7) + (Public Score × 0.3)
- Judge scores: 0-100
- Public votes: 1-5 stars (converted to 0-100 scale)

## Security Features
- bcrypt password hashing
- Redis-backed sessions with 24h expiration
- Authorization checks on all admin endpoints
- HTML sanitization for XSS protection

## X.com Data Integration (NetRows)
The app uses NetRows API to pull real X.com thread data - much cheaper than Twitter's official API.

### To Enable Real X.com Data:
1. Sign up at [netrows.com](https://www.netrows.com) (100 free credits)
2. Get your API key from the dashboard
3. Add `NETROWS_API_KEY` to your secrets
4. Restart the app

### What NetRows Provides:
- Real tweet content and threads
- Actual likes, retweets, reply counts
- Author profile pictures
- Full thread data (all tweets in a thread)

### Without API Key:
- Entries are created with placeholder data
- Username extracted from URL
- Avatar uses generated images
- Metrics show 0 until synced

### Wallet Address Formats:
- **BSC (USDT)**: EVM format starting with `0x` (42 characters)
- **ITC**: Bech32 format starting with `itc1q`
