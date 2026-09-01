# Interchained Thread Contest

A FastAPI and Redis application for running public X.com thread competitions with submissions, moderation, public voting, judge scoring, and a live leaderboard.

## Features

- Public thread submissions and voting
- Admin approval workflow
- Multiple authenticated judges with averaged scoring
- Weighted leaderboard: 70% judge score and 30% public score
- Campaign and prize management
- Optional NetRows integration for X.com data

## Requirements

- Python 3.11+
- Redis

## Setup

```bash
git clone <repository-url>
cd interchained-thread-contest
python -m pip install -r requirements.txt
redis-server --daemonize yes
python run.py
```

The application listens on port `5000` by default.

## Configuration

Copy `.env.example` into your preferred environment configuration and set the required values through your hosting provider's secret manager.

| Variable | Required | Description |
| --- | --- | --- |
| `REDIS_URL` | No | Redis connection URL; defaults to `redis://localhost:6379` |
| `NETROWS_API_KEY` | For live X.com sync | NetRows API key |
| `PORT` | No | Web server port; defaults to `5000` |

Do not commit local Redis database snapshots or credentials.

## Create the First Administrator

No default credentials are shipped. With Redis running, create a super admin:

```bash
python scripts/create_admin.py \
  --username your-admin-name \
  --password 'use-a-strong-unique-password' \
  --super-admin
```

Additional judges can be created through the admin interface or the same CLI without `--super-admin`.

## NetRows

See [NETROWS_INTEGRATION.md](NETROWS_INTEGRATION.md) for endpoint details, payloads, and implementation examples.

## License

MIT — see [LICENSE](LICENSE).