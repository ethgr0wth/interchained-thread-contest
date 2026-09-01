#!/usr/bin/env python3
"""
Backfill script to fix entries with broken usernames ('i', 'I', etc.)
Fetches real usernames from NetRows API using the tweet ID.

Usage:
    python scripts/backfill_usernames.py --dry-run    # Preview what would be fixed
    python scripts/backfill_usernames.py              # Actually fix entries

Requirements:
    - REDIS_URL environment variable (defaults to redis://localhost:6379)
    - NETROWS_API_KEY environment variable (required for fetching real data)
"""

import os
import sys
import json
import asyncio
import argparse
import redis
import httpx

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")
NETROWS_API_KEY = os.environ.get("NETROWS_API_KEY")
NETROWS_BASE_URL = "https://api.netrows.com/v1"

def is_broken_username(username: str) -> bool:
    """Check if username is a broken redirect path."""
    if not username:
        return False
    return username.lower() in ('i', 'intent', 'share')

def get_redis_client():
    return redis.from_url(REDIS_URL, decode_responses=True)

async def fetch_tweet_author(tweet_id: str) -> dict:
    """Fetch tweet data from NetRows to get the real author."""
    if not NETROWS_API_KEY:
        return None
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            headers = {
                "Authorization": f"Bearer {NETROWS_API_KEY}",
                "Content-Type": "application/json"
            }
            
            response = await client.get(
                f"{NETROWS_BASE_URL}/x/tweets/replies?id={tweet_id}",
                headers=headers
            )
            
            print(f"  NetRows /tweets/replies returned {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                print(f"  Response keys: {list(data.keys())}")
                
                tweet_data = data.get("data", {}) or data
                parent = tweet_data.get("parent", {}) or tweet_data.get("tweet", {})
                author = parent.get("author", {}) or tweet_data.get("author", {})
                
                if not author:
                    tweets = data.get("tweets", [])
                    if tweets:
                        author = tweets[0].get("author", {})
                
                username = author.get("username") or author.get("screen_name") or author.get("userName")
                if username:
                    return {
                        "username": username,
                        "name": author.get("name", ""),
                        "avatar": (author.get("profile_image_url_https") or author.get("profilePicture") or "").replace("_normal", "_400x400")
                    }
                else:
                    print(f"  No username found in response. Data sample: {str(data)[:500]}")
            
            return None
    except Exception as e:
        print(f"  Error fetching from NetRows: {e}")
        return None

def find_broken_entries(r, debug=False):
    """Find all thread entries with broken usernames."""
    broken = []
    
    all_threads = r.hgetall("threads")
    for thread_id, data in all_threads.items():
        if not data:
            continue
        
        try:
            thread = json.loads(data)
            username = thread.get("author_username", "")
            if debug:
                print(f"  Found: {thread_id} -> @{username}")
            if is_broken_username(username):
                broken.append({
                    "thread_id": thread_id,
                    "tweet_id": thread.get("main_tweet_id"),
                    "current_username": username,
                    "thread_url": thread.get("thread_url"),
                    "data": thread
                })
        except json.JSONDecodeError:
            continue
    
    return broken

def get_all_entries(r, debug=False):
    """Get all thread entries."""
    entries = []
    
    all_threads = r.hgetall("threads")
    for thread_id, data in all_threads.items():
        if not data:
            continue
        
        try:
            thread = json.loads(data)
            username = thread.get("author_username", "")
            if debug:
                print(f"  Found: {thread_id} -> @{username}")
            entries.append({
                "thread_id": thread_id,
                "tweet_id": thread.get("main_tweet_id"),
                "current_username": username,
                "thread_url": thread.get("thread_url"),
                "data": thread
            })
        except json.JSONDecodeError:
            continue
    
    return entries

def delete_entry(r, thread_id: str, thread_data: dict = None) -> bool:
    """Delete a thread entry and all associated data."""
    r.hdel("threads", thread_id)
    r.zrem("threads:by_score", thread_id)
    r.zrem("threads:by_date", thread_id)
    r.delete(f"votes:{thread_id}")
    
    if thread_data and thread_data.get("slug"):
        r.hdel("slugs", thread_data["slug"])
    
    return True

async def try_sync_entry(r, entry: dict, dry_run: bool = False) -> str:
    """Try to sync an entry. Returns 'ok', 'deleted', or 'failed'."""
    tweet_id = entry["tweet_id"]
    username = entry["current_username"]
    
    print(f"\nChecking thread {entry['thread_id']}")
    print(f"  Username: @{username}, Tweet: {tweet_id}")
    
    if is_broken_username(username):
        print("  Username is broken - would need fixing first")
        if dry_run:
            print("  [DRY RUN] Would DELETE this entry")
        else:
            delete_entry(r, entry["thread_id"], entry["data"])
            print("  DELETED (broken username)")
        return "deleted"
    
    author_data = await fetch_tweet_author(tweet_id)
    
    if not author_data or not author_data.get("username"):
        print("  Tweet not found in NetRows")
        if dry_run:
            print("  [DRY RUN] Would DELETE this entry")
        else:
            delete_entry(r, entry["thread_id"], entry["data"])
            print("  DELETED (tweet not found)")
        return "deleted"
    
    print(f"  OK - tweet exists, author: @{author_data['username']}")
    return "ok"

async def fix_entry(r, entry: dict, dry_run: bool = False, delete_unfixable: bool = False) -> str:
    """Fix a single broken entry. Returns 'fixed', 'deleted', or 'failed'."""
    tweet_id = entry["tweet_id"]
    
    print(f"\nProcessing thread {entry['thread_id']} (tweet: {tweet_id})")
    print(f"  Current username: @{entry['current_username']}")
    print(f"  URL: {entry['thread_url']}")
    
    author_data = await fetch_tweet_author(tweet_id)
    
    if not author_data or not author_data.get("username"):
        print("  Could not fetch real username from NetRows")
        if delete_unfixable:
            if dry_run:
                print("  [DRY RUN] Would DELETE this entry")
            else:
                delete_entry(r, entry["thread_id"], entry["data"])
                print("  DELETED entry (unfixable)")
            return "deleted"
        return "failed"
    
    new_username = author_data["username"]
    print(f"  Found real username: @{new_username}")
    
    if dry_run:
        print("  [DRY RUN] Would update entry")
        return "fixed"
    
    thread = entry["data"]
    thread["author_username"] = new_username
    if author_data.get("name"):
        thread["author_name"] = author_data["name"]
    if author_data.get("avatar"):
        thread["author_avatar"] = author_data["avatar"]
    
    r.hset("threads", entry["thread_id"], json.dumps(thread))
    print(f"  Updated successfully!")
    return "fixed"

async def main():
    parser = argparse.ArgumentParser(description="Backfill broken usernames in thread entries")
    parser.add_argument("--dry-run", action="store_true", help="Preview changes without applying them")
    parser.add_argument("--debug", action="store_true", help="Show all usernames found")
    parser.add_argument("--delete-unfixable", action="store_true", help="Delete entries that cannot be fixed")
    parser.add_argument("--cleanup-all", action="store_true", help="Scan ALL entries and delete any that can't be synced")
    parser.add_argument("--manual", action="store_true", help="Prompt for manual username entry")
    parser.add_argument("--set-username", nargs=2, metavar=('THREAD_ID', 'USERNAME'), help="Set username for specific thread")
    args = parser.parse_args()
    
    if not NETROWS_API_KEY:
        print("WARNING: NETROWS_API_KEY not set. Cannot fetch real usernames.")
        print("Set the environment variable and try again.")
        sys.exit(1)
    
    print(f"Connecting to Redis at {REDIS_URL}")
    r = get_redis_client()
    
    try:
        r.ping()
    except redis.ConnectionError:
        print("ERROR: Could not connect to Redis")
        sys.exit(1)
    
    if args.cleanup_all:
        print("=== CLEANUP ALL MODE ===")
        print("Scanning ALL entries and deleting any that can't be synced...")
        if args.dry_run:
            print("(DRY RUN - no changes will be made)\n")
        
        entries = get_all_entries(r, debug=args.debug)
        print(f"Found {len(entries)} total entries\n")
        
        ok = 0
        deleted = 0
        
        for entry in entries:
            result = await try_sync_entry(r, entry, dry_run=args.dry_run)
            if result == "ok":
                ok += 1
            elif result == "deleted":
                deleted += 1
            await asyncio.sleep(0.5)
        
        print(f"\n=== Summary ===")
        print(f"OK (kept): {ok}")
        print(f"Deleted: {deleted}")
        
        if args.dry_run and deleted > 0:
            print("\nRun without --dry-run to apply deletions.")
        return
    
    print("Scanning for entries with broken usernames...")
    if args.debug:
        print("DEBUG: Listing all entries...")
    broken = find_broken_entries(r, debug=args.debug)
    
    if not broken:
        print("\nNo entries with broken usernames found!")
        return
    
    print(f"\nFound {len(broken)} entries with broken usernames:")
    for entry in broken:
        print(f"  - Thread {entry['thread_id']}: @{entry['current_username']} (tweet: {entry['tweet_id']})")
    
    if args.dry_run:
        print("\n=== DRY RUN MODE ===")
    
    if args.delete_unfixable:
        print("=== DELETE UNFIXABLE MODE ===")
    
    fixed = 0
    deleted = 0
    failed = 0
    
    for entry in broken:
        result = await fix_entry(r, entry, dry_run=args.dry_run, delete_unfixable=args.delete_unfixable)
        if result == "fixed":
            fixed += 1
        elif result == "deleted":
            deleted += 1
        else:
            failed += 1
        await asyncio.sleep(0.5)
    
    print(f"\n=== Summary ===")
    print(f"Fixed: {fixed}")
    print(f"Deleted: {deleted}")
    print(f"Failed: {failed}")
    
    if args.dry_run and (fixed > 0 or deleted > 0):
        print("\nRun without --dry-run to apply changes.")

if __name__ == "__main__":
    asyncio.run(main())
