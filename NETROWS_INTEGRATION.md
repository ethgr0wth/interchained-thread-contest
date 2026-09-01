# NetRows API Integration — Developer Reference

> Dev-to-dev documentation for the X.com (Twitter) data integration used by the Interchained Thread Contest platform.
> NetRows is used in place of the official Twitter/X API because it is significantly cheaper per call.

---

## 1. Overview

The platform pulls real X.com thread data (tweets, author profiles, engagement metrics, replies) from NetRows. To conserve credits, **the API is only hit during admin approval** of a submission — not on initial user submission.

| Property | Value |
|----------|-------|
| Base URL | `https://api.netrows.com/v1` |
| Auth | Bearer token in `Authorization` header |
| Content-Type | `application/json` |
| Secret name | `NETROWS_API_KEY` (environment variable) |
| HTTP client | `httpx.AsyncClient` (async, 30s timeout) |

### Credit-saving flow

```
User submits URL  ──►  extract_basic_info()   (no API call, regex only)
                          │
                          ▼
                   Entry saved as "pending" with placeholder data
                          │
Admin clicks Approve ──►  sync_thread_from_netrows()  (real API calls here)
                          │
                          ▼
                   Entry enriched with real tweet/author/reply data
```

---

## 2. Authentication

Every request uses the same header block. The key is read once at module load from the environment.

```python
import os

NETROWS_API_KEY = os.environ.get("NETROWS_API_KEY")
NETROWS_BASE_URL = "https://api.netrows.com/v1"

headers = {
    "Authorization": f"Bearer {NETROWS_API_KEY}",
    "Content-Type": "application/json"
}
```

> **Never** hardcode the key or log its value. It is injected via Replit Secrets / VPS environment.

---

## 3. Endpoints

The integration uses **three** GET endpoints. All parameters are passed as query strings (no request body).

| # | Endpoint | Query Param | Purpose |
|---|----------|-------------|---------|
| 1 | `GET /x/users/info` | `username` | Author profile (name, avatar, handle) |
| 2 | `GET /x/users/tweets` | `username` | Recent tweets for a user (used to locate the target tweet) |
| 3 | `GET /x/tweets/replies` | `id` | Replies to a specific tweet |

> **Important:** NetRows has **no direct tweet-by-ID lookup endpoint**. To fetch a specific tweet, you fetch the user's recent tweets and match by `id` or `conversationId`. If the tweet is too old to appear in the recent list, it cannot be synced.

---

### 3.1 `GET /x/users/info`

Fetch an author's profile.

**Request**

```
GET https://api.netrows.com/v1/x/users/info?username=interchained
Authorization: Bearer <NETROWS_API_KEY>
Content-Type: application/json
```

**Response (200)**

```json
{
  "status": "success",
  "data": {
    "userName": "interchained",
    "name": "Interchained",
    "profilePicture": "https://pbs.twimg.com/profile_images/123/abc_normal.jpg",
    "profileImageUrl": "https://pbs.twimg.com/profile_images/123/abc_normal.jpg",
    "followers": 12000,
    "following": 300
  }
}
```

**Field notes**

- Success is gated on `data.status == "success"`.
- Avatar is read with fallback priority: `profilePicture` → `profileImageUrl` → `profile_image_url_https`.
- The `_normal` suffix in avatar URLs is replaced with `_400x400` to get a higher-resolution image.

---

### 3.2 `GET /x/users/tweets`

Fetch a user's recent tweets. This is how a specific tweet is located.

**Request**

```
GET https://api.netrows.com/v1/x/users/tweets?username=interchained
Authorization: Bearer <NETROWS_API_KEY>
Content-Type: application/json
```

**Response (200)**

```json
{
  "status": "success",
  "data": {
    "tweets": [
      {
        "id": "1790000000000000000",
        "conversationId": "1790000000000000000",
        "text": "1/ Here is why Interchained matters...",
        "createdAt": "Wed May 21 18:00:00 +0000 2026",
        "likeCount": 540,
        "retweetCount": 120,
        "replyCount": 64
      },
      {
        "id": "1790000000000000001",
        "conversationId": "1790000000000000000",
        "text": "2/ The architecture is built on...",
        "createdAt": "Wed May 21 18:02:00 +0000 2026",
        "likeCount": 210,
        "retweetCount": 33,
        "replyCount": 12
      }
    ]
  }
}
```

**Matching logic**

```python
target_tweet = None
thread_tweets = []

for t in tweet_list:
    # Exact match on the requested tweet id
    if str(t.get("id", "")) == str(tweet_id):
        target_tweet = t
        break
    # Otherwise collect tweets sharing the same conversation (thread)
    if str(t.get("conversationId", "")) == str(tweet_id):
        thread_tweets.append(t)

if not target_tweet and not thread_tweets:
    # Tweet too old / deleted / not in recent list -> cannot sync
    return None
```

**Per-tweet field mapping**

| NetRows field | Internal `Tweet` field |
|---------------|------------------------|
| `id` | `id` |
| `text` | `text` |
| `createdAt` | `created_at` |
| `likeCount` | `likes` |
| `retweetCount` | `retweets` |
| `replyCount` | `replies` |

---

### 3.3 `GET /x/tweets/replies`

Fetch replies to the main tweet.

**Request**

```
GET https://api.netrows.com/v1/x/tweets/replies?id=1790000000000000000
Authorization: Bearer <NETROWS_API_KEY>
Content-Type: application/json
```

**Response (200)**

```json
{
  "tweets": [
    {
      "id": "1790000000000000050",
      "text": "This is a great thread!",
      "createdAt": "Wed May 21 19:00:00 +0000 2026",
      "likeCount": 12,
      "retweetCount": 1,
      "author": {
        "userName": "fan_user",
        "name": "Fan User",
        "profilePicture": "https://pbs.twimg.com/profile_images/999/xyz_normal.jpg"
      }
    }
  ]
}
```

**Notes**

- Reply payload shape differs from the tweets endpoint: replies are under a top-level `tweets` key (no `data` wrapper), and author info is nested under `author`.
- Only the **first 10** replies are kept, then **reversed** to show oldest-first (chronological).
- Author avatar fallback: `author.profilePicture` → `author.avatar` → generated DiceBear avatar.

---

## 4. Comprehensive Code Example

This is the full, self-contained sync routine. It demonstrates all three endpoints, error handling, field mapping, and the data shape returned to the caller.

```python
import httpx
import os
from typing import Optional

NETROWS_API_KEY = os.environ.get("NETROWS_API_KEY")
NETROWS_BASE_URL = "https://api.netrows.com/v1"

# Usernames that are actually X.com redirect paths, not real handles.
BROKEN_USERNAMES = {"i", "intent", "share"}


async def sync_thread_from_netrows(tweet_id: str, username: str) -> Optional[dict]:
    """
    Pull a full thread (tweets + author + replies) from NetRows.

    Returns a dict ready to merge into a contest Thread, or None if the
    tweet cannot be synced (no key, bad username, tweet too old/deleted).
    """
    # ---- Guard clauses -------------------------------------------------
    if not NETROWS_API_KEY:
        print("NetRows API key not configured")
        return None

    if username.lower() in BROKEN_USERNAMES:
        print(f"Cannot sync: '{username}' is a redirect path, not a handle")
        return None

    headers = {
        "Authorization": f"Bearer {NETROWS_API_KEY}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:

            # ---- 1. Author profile (optional, non-fatal) --------------
            user_info = None
            user_response = await client.get(
                f"{NETROWS_BASE_URL}/x/users/info?username={username}",
                headers=headers,
            )
            if user_response.status_code == 200:
                user_data = user_response.json()
                if user_data.get("status") == "success":
                    user_info = user_data.get("data", {})

            # ---- 2. Recent tweets (required) --------------------------
            tweets_response = await client.get(
                f"{NETROWS_BASE_URL}/x/users/tweets?username={username}",
                headers=headers,
            )
            if tweets_response.status_code != 200:
                print(f"NetRows tweets API failed: {tweets_response.status_code}")
                return None

            tweets_data = tweets_response.json()
            if tweets_data.get("status") != "success":
                print(f"NetRows API error: {tweets_data.get('msg', 'Unknown error')}")
                return None

            tweet_list = tweets_data.get("data", {}).get("tweets", [])

            # ---- 3. Locate the target tweet / thread ------------------
            target_tweet = None
            thread_tweets = []
            for t in tweet_list:
                if str(t.get("id", "")) == str(tweet_id):
                    target_tweet = t
                    break
                if str(t.get("conversationId", "")) == str(tweet_id):
                    thread_tweets.append(t)

            if not target_tweet and not thread_tweets:
                print(f"Tweet {tweet_id} not found in {username}'s recent tweets.")
                return None

            tweets_to_parse = [target_tweet] if target_tweet else thread_tweets

            # ---- 4. Resolve author display fields ---------------------
            author_name = username.replace("_", " ").title()
            author_avatar = f"https://api.dicebear.com/7.x/avataaars/svg?seed={username}"

            if user_info:
                author_name = user_info.get("name", author_name)
                avatar_url = (
                    user_info.get("profilePicture", "")
                    or user_info.get("profileImageUrl", "")
                    or user_info.get("profile_image_url_https", "")
                )
                if avatar_url:
                    author_avatar = avatar_url.replace("_normal", "_400x400")

            # ---- 5. Parse tweets --------------------------------------
            parsed_tweets = []
            for td in tweets_to_parse:
                parsed_tweets.append({
                    "id": str(td.get("id", "")),
                    "text": td.get("text", ""),
                    "author_username": user_info.get("userName", username) if user_info else username,
                    "author_name": author_name,
                    "author_avatar": author_avatar,
                    "created_at": td.get("createdAt", ""),
                    "likes": td.get("likeCount", 0) or 0,
                    "retweets": td.get("retweetCount", 0) or 0,
                    "replies": td.get("replyCount", 0) or 0,
                    "media_urls": [],
                })

            if not parsed_tweets:
                return None

            total_engagement = sum(
                t["likes"] + t["retweets"] + t["replies"] for t in parsed_tweets
            )

            # ---- 6. Fetch replies (optional, non-fatal) ---------------
            parsed_replies = []
            try:
                replies_response = await client.get(
                    f"{NETROWS_BASE_URL}/x/tweets/replies?id={tweet_id}",
                    headers=headers,
                )
                if replies_response.status_code == 200:
                    reply_list = replies_response.json().get("tweets", [])
                    reply_list = list(reversed(reply_list[:10]))  # oldest first
                    for r in reply_list:
                        ru = r.get("author", {}) or {}
                        ravatar = (
                            ru.get("profilePicture", "")
                            or ru.get("avatar", "")
                            or f"https://api.dicebear.com/7.x/avataaars/svg?seed={r.get('author_username', 'user')}"
                        )
                        if ravatar and "_normal" in ravatar:
                            ravatar = ravatar.replace("_normal", "_400x400")
                        parsed_replies.append({
                            "id": str(r.get("id", "")),
                            "text": r.get("text", ""),
                            "author_username": ru.get("userName", "") or r.get("author_username", "user"),
                            "author_name": ru.get("name", "") or r.get("author_name", "User"),
                            "author_avatar": ravatar,
                            "created_at": r.get("createdAt", ""),
                            "likes": r.get("likeCount", 0) or 0,
                            "retweets": r.get("retweetCount", 0) or 0,
                        })
            except Exception as e:
                print(f"Error fetching replies: {e}")  # non-fatal

            # ---- 7. Return enriched payload ---------------------------
            return {
                "tweets": parsed_tweets,
                "replies": parsed_replies,
                "main_tweet_id": tweet_id,
                "author_username": parsed_tweets[0]["author_username"],
                "author_name": author_name,
                "author_avatar": author_avatar,
                "total_engagement": total_engagement,
            }

    except Exception as e:
        print(f"NetRows API error: {e}")
        import traceback
        traceback.print_exc()
        return None
```

---

## 5. Lightweight user-only fetch

When you only need the profile (no tweets/replies), use the standalone helper:

```python
async def fetch_netrows_user(username: str) -> Optional[dict]:
    """Fetch only the author profile from NetRows."""
    if not NETROWS_API_KEY:
        return None
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            headers = {
                "Authorization": f"Bearer {NETROWS_API_KEY}",
                "Content-Type": "application/json",
            }
            response = await client.get(
                f"{NETROWS_BASE_URL}/x/users/info?username={username}",
                headers=headers,
            )
            if response.status_code != 200:
                return None
            data = response.json()
            if data.get("status") == "success":
                return data.get("data")
            return None
    except Exception as e:
        print(f"NetRows user API error: {e}")
        return None
```

---

## 6. URL parsing (no API cost)

Before any API call, the tweet ID and username are extracted from the submitted URL with regex. This validates the URL and lets the platform store a pending entry for free.

```python
import re
from typing import Optional


async def extract_thread_id(url: str) -> Optional[str]:
    patterns = [
        r'twitter\.com/\w+/status/(\d+)',
        r'x\.com/\w+/status/(\d+)',
        r'status/(\d+)',
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None


async def extract_username(url: str) -> Optional[str]:
    patterns = [
        r'twitter\.com/(\w+)/status/',
        r'x\.com/(\w+)/status/',
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            username = match.group(1)
            # Reject redirect paths, not real handles
            if username.lower() in ('i', 'intent', 'share'):
                return None
            return username
    return None
```

**Rejected URL forms** (these are redirect paths, not author handles):

- `x.com/i/status/123...`
- `x.com/intent/status/123...`
- `x.com/share/status/123...`

**Accepted form:** `https://x.com/username/status/1234567890`

---

## 7. Response status conventions

| Endpoint | Success check | Data location |
|----------|---------------|---------------|
| `/x/users/info` | `json["status"] == "success"` | `json["data"]` (object) |
| `/x/users/tweets` | `json["status"] == "success"` | `json["data"]["tweets"]` (array) |
| `/x/tweets/replies` | HTTP 200 | `json["tweets"]` (array, no `data` wrapper) |

> Note the inconsistency: the replies endpoint does **not** wrap its result in `data`, nor does it return a `status` field. Treat HTTP 200 + presence of `tweets` as success.

---

## 8. Failure modes & handling

| Condition | Behavior |
|-----------|----------|
| No `NETROWS_API_KEY` | Returns `None`, logs warning. Entry keeps placeholder data. |
| Username is `i` / `intent` / `share` | Returns `None` early — invalid handle from redirect URL. |
| `/x/users/tweets` non-200 | Returns `None`, logs status code. |
| `status != "success"` | Returns `None`, logs `msg`. |
| Tweet not in recent list | Returns `None` — tweet too old or deleted. |
| `/x/users/info` fails | Non-fatal — falls back to derived name + DiceBear avatar. |
| `/x/tweets/replies` fails | Non-fatal — thread synced without replies. |

**Key design principle:** the tweets endpoint is the only hard requirement. Author info and replies degrade gracefully so a thread can still be approved with partial data.
