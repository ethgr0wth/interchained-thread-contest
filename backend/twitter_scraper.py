import httpx
import re
import os
import unicodedata
from typing import Optional
from backend.models import Tweet, Reply

NETROWS_API_KEY = os.environ.get("NETROWS_API_KEY")
NETROWS_BASE_URL = "https://api.netrows.com/v1"

def generate_slug(username: str, tweet_text: str, tweet_id: str) -> str:
    """Generate SEO-friendly slug from username and tweet content."""
    text = tweet_text.lower().strip()
    text = unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode('ascii')
    text = re.sub(r'https?://\S+', '', text)
    text = re.sub(r'@\w+', '', text)
    text = re.sub(r'#\w+', '', text)
    text = re.sub(r'[^\w\s-]', '', text)
    text = re.sub(r'\s+', '-', text.strip())
    text = re.sub(r'-+', '-', text)
    words = text.split('-')[:6]
    text_part = '-'.join(words)
    if text_part:
        slug = f"{username.lower()}-{text_part}"
    else:
        slug = f"{username.lower()}-thread"
    slug = slug[:80]
    slug = f"{slug}-{tweet_id[-6:]}"
    return slug

async def extract_thread_id(url: str) -> Optional[str]:
    patterns = [
        r'twitter\.com/\w+/status/(\d+)',
        r'x\.com/\w+/status/(\d+)',
        r'status/(\d+)'
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None

async def extract_username(url: str) -> Optional[str]:
    patterns = [
        r'twitter\.com/(\w+)/status/',
        r'x\.com/(\w+)/status/'
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            username = match.group(1)
            # Skip 'i', 'intent', 'share' - these are X.com redirect paths, not usernames
            if username.lower() in ('i', 'intent', 'share'):
                return None
            return username
    return None

async def extract_basic_info(thread_url: str) -> dict:
    """Extract basic info from URL without API call. Used on initial submission."""
    tweet_id = await extract_thread_id(thread_url)
    username = await extract_username(thread_url)
    
    if not tweet_id or not username:
        raise ValueError("Invalid X.com thread URL. Use the full format with username: https://x.com/username/status/1234567890 (not x.com/i/status/...)")
    
    return {
        "tweets": [],
        "main_tweet_id": tweet_id,
        "author_username": username,
        "author_name": "",
        "author_avatar": "",
        "total_engagement": 0,
        "thread_url": thread_url
    }

BROKEN_USERNAMES = {'i', 'intent', 'share'}

async def sync_thread_from_netrows(tweet_id: str, username: str) -> Optional[dict]:
    """
    Sync real thread data from NetRows API.
    Called only during admin approval to save credits.
    Uses correct NetRows endpoints: /v1/x/users/info and /v1/x/users/tweets
    """
    if not NETROWS_API_KEY:
        print("NetRows API key not configured")
        return None
    
    if username.lower() in BROKEN_USERNAMES:
        print(f"Cannot sync: username '{username}' is invalid (from x.com/i/status/... URL)")
        return None
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            headers = {
                "Authorization": f"Bearer {NETROWS_API_KEY}",
                "Content-Type": "application/json"
            }
            
            user_info = None
            user_response = await client.get(
                f"{NETROWS_BASE_URL}/x/users/info?username={username}",
                headers=headers
            )
            
            if user_response.status_code == 200:
                user_data = user_response.json()
                if user_data.get("status") == "success":
                    user_info = user_data.get("data", {})
            
            tweets_response = await client.get(
                f"{NETROWS_BASE_URL}/x/users/tweets?username={username}",
                headers=headers
            )
            
            if tweets_response.status_code != 200:
                print(f"NetRows tweets API failed: {tweets_response.status_code}")
                return None
            
            tweets_data = tweets_response.json()
            
            if tweets_data.get("status") != "success":
                print(f"NetRows API error: {tweets_data.get('msg', 'Unknown error')}")
                return None
            
            data_obj = tweets_data.get("data", {})
            tweet_list = data_obj.get("tweets", [])
            
            target_tweet = None
            thread_tweets = []
            
            for t in tweet_list:
                if str(t.get("id", "")) == str(tweet_id):
                    target_tweet = t
                    break
                conv_id = str(t.get("conversationId", ""))
                if conv_id == str(tweet_id):
                    thread_tweets.append(t)
            
            if not target_tweet and not thread_tweets:
                print(f"Tweet {tweet_id} not found in {username}'s recent tweets. The tweet may be too old or deleted.")
                return None
            
            tweets_to_parse = [target_tweet] if target_tweet else thread_tweets
            
            author_name = username.replace("_", " ").title()
            author_avatar = f"https://api.dicebear.com/7.x/avataaars/svg?seed={username}"
            
            if user_info:
                author_name = user_info.get("name", author_name)
                avatar_url = user_info.get("profilePicture", "") or user_info.get("profileImageUrl", "") or user_info.get("profile_image_url_https", "")
                if avatar_url:
                    author_avatar = avatar_url.replace("_normal", "_400x400")
            
            parsed_tweets = []
            for tweet_data in tweets_to_parse:
                tweet = Tweet(
                    id=str(tweet_data.get("id", "")),
                    text=tweet_data.get("text", ""),
                    author_username=user_info.get("userName", username) if user_info else username,
                    author_name=author_name,
                    author_avatar=author_avatar,
                    created_at=tweet_data.get("createdAt", ""),
                    likes=tweet_data.get("likeCount", 0) or 0,
                    retweets=tweet_data.get("retweetCount", 0) or 0,
                    replies=tweet_data.get("replyCount", 0) or 0,
                    media_urls=[]
                )
                parsed_tweets.append(tweet)
            
            if not parsed_tweets:
                return None
            
            total_engagement = sum(t.likes + t.retweets + t.replies for t in parsed_tweets)
            
            # Fetch replies to the main tweet
            parsed_replies = []
            try:
                replies_response = await client.get(
                    f"{NETROWS_BASE_URL}/x/tweets/replies?id={tweet_id}",
                    headers=headers
                )
                if replies_response.status_code == 200:
                    replies_data = replies_response.json()
                    reply_list = replies_data.get("tweets", [])
                    # Reverse to show oldest replies first (chronological order)
                    reply_list = list(reversed(reply_list[:10]))
                    for r in reply_list:
                        reply_user = r.get("author", {}) or {}
                        reply_avatar = reply_user.get("profilePicture", "") or reply_user.get("avatar", "") or f"https://api.dicebear.com/7.x/avataaars/svg?seed={r.get('author_username', 'user')}"
                        if reply_avatar and "_normal" in reply_avatar:
                            reply_avatar = reply_avatar.replace("_normal", "_400x400")
                        reply = Reply(
                            id=str(r.get("id", "")),
                            text=r.get("text", ""),
                            author_username=reply_user.get("userName", "") or r.get("author_username", "user"),
                            author_name=reply_user.get("name", "") or r.get("author_name", "User"),
                            author_avatar=reply_avatar,
                            created_at=r.get("createdAt", ""),
                            likes=r.get("likeCount", 0) or 0,
                            retweets=r.get("retweetCount", 0) or 0
                        )
                        parsed_replies.append(reply)
            except Exception as e:
                print(f"Error fetching replies: {e}")
            
            first_tweet_text = parsed_tweets[0].text if parsed_tweets else ""
            slug = generate_slug(parsed_tweets[0].author_username, first_tweet_text, tweet_id)
            
            return {
                "tweets": [t.model_dump() for t in parsed_tweets],
                "replies": [r.model_dump() for r in parsed_replies],
                "main_tweet_id": tweet_id,
                "author_username": parsed_tweets[0].author_username,
                "author_name": author_name,
                "author_avatar": author_avatar,
                "total_engagement": total_engagement,
                "slug": slug
            }
            
    except Exception as e:
        print(f"NetRows API error: {e}")
        import traceback
        traceback.print_exc()
        return None

async def fetch_netrows_user(username: str) -> Optional[dict]:
    """Fetch user profile from NetRows."""
    if not NETROWS_API_KEY:
        return None
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            headers = {
                "Authorization": f"Bearer {NETROWS_API_KEY}",
                "Content-Type": "application/json"
            }
            
            response = await client.get(
                f"{NETROWS_BASE_URL}/x/users/info?username={username}",
                headers=headers
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
