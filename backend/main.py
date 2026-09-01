from fastapi import FastAPI, HTTPException, Request, Query, Depends, Header
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import uuid
from datetime import datetime
from typing import Optional
import os
import secrets
import html

from backend.models import ThreadSubmission, JudgeScore, PublicVote, CampaignSettings
from backend.database import db
from backend.twitter_scraper import extract_basic_info, sync_thread_from_netrows, extract_thread_id, extract_username
from backend.models import Thread

app = FastAPI(title="Viral Threads Campaign", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SESSION_TTL = 86400

def create_session(judge_id: str, username: str, is_super_admin: bool) -> str:
    token = secrets.token_urlsafe(32)
    session_data = {
        "judge_id": judge_id,
        "username": username,
        "is_super_admin": is_super_admin,
        "created_at": datetime.now().isoformat()
    }
    db.save_session(token, session_data, SESSION_TTL)
    return token

def verify_admin_token(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization.replace("Bearer ", "")
    session = db.get_session(token)
    if not session:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    return session

def verify_super_admin(authorization: Optional[str] = Header(None)):
    session = verify_admin_token(authorization)
    if not session.get("is_super_admin"):
        raise HTTPException(status_code=403, detail="Super admin access required")
    return session

def sanitize_html(text: str) -> str:
    return html.escape(text)

@app.get("/api/health")
async def health():
    return {"status": "ok", "timestamp": datetime.now().isoformat()}

@app.post("/api/threads/submit")
async def submit_thread(submission: ThreadSubmission):
    """Submit thread for review. No API calls - just extracts info from URL."""
    try:
        thread_data = await extract_basic_info(submission.thread_url)
        
        thread = Thread(
            id=str(uuid.uuid4()),
            submission=submission,
            tweets=thread_data["tweets"],
            main_tweet_id=thread_data["main_tweet_id"],
            author_username=thread_data["author_username"],
            author_name=thread_data["author_name"],
            author_avatar=thread_data["author_avatar"],
            created_at=datetime.now().isoformat(),
            total_engagement=0,
            status="pending"
        )
        
        saved_thread = db.save_thread(thread)
        return {"success": True, "thread": saved_thread.model_dump(), "message": "Submitted for review"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/threads")
async def get_threads(limit: int = Query(default=50, le=100)):
    threads = db.get_all_threads(limit)
    return {"threads": [t.model_dump() for t in threads]}

@app.get("/api/threads/{thread_id}")
async def get_thread(thread_id: str):
    thread = db.get_thread(thread_id)
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    return {"thread": thread.model_dump()}

@app.get("/api/leaderboard")
async def get_leaderboard(limit: int = Query(default=50, le=100)):
    """Get approved threads only for public leaderboard."""
    all_threads = db.get_leaderboard(limit * 2)
    approved_threads = [t for t in all_threads if t.status == "approved"][:limit]
    leaderboard = []
    for i, thread in enumerate(approved_threads):
        leaderboard.append({
            "rank": i + 1,
            "thread": thread.model_dump()
        })
    return {"leaderboard": leaderboard}

@app.post("/api/votes")
async def submit_vote(vote: PublicVote, request: Request):
    client_ip = request.client.host if request.client else "anonymous"
    
    if db.has_voted(vote.thread_id, client_ip):
        raise HTTPException(status_code=400, detail="You have already voted on this thread")
    
    vote.voter_ip = client_ip
    vote.voted_at = datetime.now().isoformat()
    
    try:
        thread = db.add_public_vote(vote)
        return {"success": True, "thread": thread.model_dump()}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@app.get("/api/campaign")
async def get_campaign():
    campaign = db.get_current_campaign()
    return {"campaign": campaign.model_dump() if campaign else None}

@app.get("/api/stats")
async def get_stats():
    stats = db.get_stats()
    campaign = db.get_current_campaign()
    return {
        "stats": stats,
        "campaign": campaign.model_dump() if campaign else None
    }

@app.post("/api/admin/login")
async def admin_login(data: dict):
    username = data.get("username")
    password = data.get("password")
    
    judge = db.authenticate_judge(username, password)
    if not judge:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    token = create_session(judge.id, judge.username, judge.is_super_admin)
    
    return {
        "success": True,
        "token": token,
        "judge": {
            "id": judge.id,
            "username": judge.username,
            "is_super_admin": judge.is_super_admin
        }
    }

@app.post("/api/admin/logout")
async def admin_logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.startswith("Bearer "):
        token = authorization.replace("Bearer ", "")
        db.delete_session(token)
    return {"success": True}

@app.post("/api/admin/score")
async def submit_judge_score(score: JudgeScore, session: dict = Depends(verify_admin_token)):
    try:
        score.judge_id = session["judge_id"]
        score.scored_at = datetime.now().isoformat()
        thread = db.add_judge_score(score)
        return {"success": True, "thread": thread.model_dump()}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@app.post("/api/admin/campaign")
async def update_campaign(campaign: CampaignSettings, session: dict = Depends(verify_super_admin)):
    campaign.created_by = session["username"]
    saved = db.save_campaign(campaign)
    return {"success": True, "campaign": saved.model_dump()}

@app.get("/api/admin/threads")
async def get_admin_threads(status: Optional[str] = None, session: dict = Depends(verify_admin_token)):
    """Get all threads for admin review. Filter by status: pending, approved, rejected."""
    threads = db.get_all_threads(100)
    if status:
        threads = [t for t in threads if t.status == status]
    return {"threads": [t.model_dump() for t in threads]}

@app.post("/api/admin/threads/{thread_id}/approve")
async def approve_thread(thread_id: str, session: dict = Depends(verify_admin_token)):
    """Approve a pending thread and sync real data from NetRows."""
    thread = db.get_thread(thread_id)
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    
    if thread.status == "approved":
        return {"success": True, "message": "Already approved", "thread": thread.model_dump()}
    
    real_data = await sync_thread_from_netrows(thread.main_tweet_id, thread.author_username)
    
    if real_data:
        thread.tweets = real_data["tweets"]
        thread.replies = real_data.get("replies", [])
        thread.author_username = real_data.get("author_username", thread.author_username)
        thread.author_name = real_data["author_name"]
        thread.author_avatar = real_data["author_avatar"]
        thread.total_engagement = real_data["total_engagement"]
        thread.slug = real_data.get("slug")
        if thread.slug:
            db.save_slug(thread.slug, thread.id)
    
    thread.status = "approved"
    saved_thread = db.save_thread(thread)
    
    return {"success": True, "thread": saved_thread.model_dump(), "synced": real_data is not None}

@app.post("/api/admin/threads/{thread_id}/reject")
async def reject_thread(thread_id: str, session: dict = Depends(verify_admin_token)):
    """Reject a thread submission."""
    thread = db.get_thread(thread_id)
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    
    thread.status = "rejected"
    saved_thread = db.save_thread(thread)
    
    return {"success": True, "thread": saved_thread.model_dump()}

@app.delete("/api/admin/threads/{thread_id}")
async def delete_thread_endpoint(thread_id: str, session: dict = Depends(verify_admin_token)):
    """Delete a thread entry."""
    thread = db.get_thread(thread_id)
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    
    db.delete_thread(thread_id)
    return {"success": True, "message": "Thread deleted"}

@app.post("/api/admin/threads/{thread_id}/sync")
async def sync_thread(thread_id: str, session: dict = Depends(verify_admin_token)):
    """Manually sync/refresh thread data from NetRows (uses credits)."""
    thread = db.get_thread(thread_id)
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    
    if thread.author_username.lower() in ('i', 'intent', 'share'):
        raise HTTPException(status_code=400, detail="Cannot sync: Invalid username. This entry was submitted with an x.com/i/status/... URL. Please delete and resubmit with the correct URL format.")
    
    real_data = await sync_thread_from_netrows(thread.main_tweet_id, thread.author_username)
    
    if not real_data:
        # Auto-delete entries that can't be synced (tweet too old or deleted)
        db.delete_thread(thread_id)
        raise HTTPException(status_code=410, detail="Tweet not found in user's recent tweets. Entry has been auto-deleted.")
    
    thread.tweets = real_data["tweets"]
    thread.author_username = real_data.get("author_username", thread.author_username)
    thread.author_name = real_data["author_name"]
    thread.author_avatar = real_data["author_avatar"]
    thread.total_engagement = real_data["total_engagement"]
    saved_thread = db.save_thread(thread)
    
    return {"success": True, "thread": saved_thread.model_dump()}

@app.get("/api/admin/verify")
async def verify_session(session: dict = Depends(verify_admin_token)):
    return {"valid": True, "session": session}

@app.get("/api/admin/judges")
async def get_judges(session: dict = Depends(verify_super_admin)):
    judges = db.get_all_judges()
    return {"judges": [{"id": j.id, "username": j.username, "is_super_admin": j.is_super_admin, "created_at": j.created_at} for j in judges]}

@app.post("/api/admin/judges")
async def create_judge(data: dict, session: dict = Depends(verify_super_admin)):
    username = data.get("username")
    password = data.get("password")
    is_super_admin = data.get("is_super_admin", False)
    
    if not username or not password:
        raise HTTPException(status_code=400, detail="Username and password are required")
    
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    
    existing = db.get_judge(username)
    if existing:
        raise HTTPException(status_code=400, detail=f"Judge '{username}' already exists")
    
    judge = db.create_judge(username, password, is_super_admin)
    return {
        "success": True,
        "judge": {
            "id": judge.id,
            "username": judge.username,
            "is_super_admin": judge.is_super_admin,
            "created_at": judge.created_at
        }
    }

@app.delete("/api/admin/judges/{username}")
async def delete_judge(username: str, session: dict = Depends(verify_super_admin)):
    if username == session["username"]:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    
    if db.delete_judge(username):
        return {"success": True, "message": f"Judge '{username}' deleted"}
    raise HTTPException(status_code=404, detail=f"Judge '{username}' not found")

app.mount("/static", StaticFiles(directory="static"), name="static")

def generate_thread_html(thread):
    author_name = sanitize_html(thread.author_name) if thread.author_name else thread.author_username
    author_username = sanitize_html(thread.author_username)
    
    tweets_html = ""
    if thread.tweets:
        for i, tweet in enumerate(thread.tweets):
            tweet_obj = tweet if isinstance(tweet, dict) else tweet
            tweet_text_raw = tweet_obj.get('text', '') if isinstance(tweet_obj, dict) else getattr(tweet_obj, 'text', '')
            tweet_text = sanitize_html(tweet_text_raw)
            tweet_text_formatted = tweet_text.replace('\n', '<br>')
            likes = tweet_obj.get('likes', 0) if isinstance(tweet_obj, dict) else getattr(tweet_obj, 'likes', 0)
            retweets = tweet_obj.get('retweets', 0) if isinstance(tweet_obj, dict) else getattr(tweet_obj, 'retweets', 0)
            replies = tweet_obj.get('replies', 0) if isinstance(tweet_obj, dict) else getattr(tweet_obj, 'replies', 0)
            tweets_html += f"""
            <div class="tweet-item" style="margin-bottom: 20px; padding: 15px; background: #1a1a24; border-radius: 12px; border-left: 3px solid #6366f1;">
                <p style="color: #e5e5e5; line-height: 1.8; white-space: pre-wrap;">{tweet_text_formatted}</p>
                <div style="margin-top: 10px; color: #6b7280; font-size: 14px;">
                    <span>❤️ {likes:,}</span>
                    <span style="margin-left: 15px;">🔁 {retweets:,}</span>
                    <span style="margin-left: 15px;">💬 {replies:,}</span>
                </div>
            </div>
            """
    else:
        tweets_html = '<p style="color: #6b7280;">Thread content pending sync...</p>'
    
    first_tweet = thread.tweets[0] if thread.tweets else None
    if first_tweet:
        first_text = first_tweet.get('text', '')[:150] if isinstance(first_tweet, dict) else getattr(first_tweet, 'text', '')[:150]
        first_tweet_text = sanitize_html(first_text)
    else:
        first_tweet_text = "View this viral thread"
    
    # Build replies HTML
    replies_html = ""
    if hasattr(thread, 'replies') and thread.replies:
        replies_html = f'<div class="replies-section" style="margin-bottom: 30px;"><h2 style="margin-bottom: 20px; color: #9ca3af;">💬 Replies ({len(thread.replies)})</h2>'
        for reply in thread.replies:
            reply_obj = reply if isinstance(reply, dict) else reply
            reply_text = reply_obj.get('text', '') if isinstance(reply_obj, dict) else getattr(reply_obj, 'text', '')
            reply_text = sanitize_html(reply_text).replace('\n', '<br>')
            reply_username = reply_obj.get('author_username', '') if isinstance(reply_obj, dict) else getattr(reply_obj, 'author_username', '')
            reply_name = reply_obj.get('author_name', '') if isinstance(reply_obj, dict) else getattr(reply_obj, 'author_name', '')
            reply_avatar = reply_obj.get('author_avatar', '') if isinstance(reply_obj, dict) else getattr(reply_obj, 'author_avatar', '')
            reply_likes = reply_obj.get('likes', 0) if isinstance(reply_obj, dict) else getattr(reply_obj, 'likes', 0)
            if not reply_avatar:
                reply_avatar = f"https://api.dicebear.com/7.x/avataaars/svg?seed={reply_username}"
            replies_html += f"""
            <div style="margin-bottom: 15px; padding: 12px; background: #1a1a24; border-radius: 10px; border-left: 2px solid #4b5563;">
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                    <img src="{reply_avatar}" alt="{reply_name}" style="width: 32px; height: 32px; border-radius: 50%;">
                    <div>
                        <span style="color: white; font-weight: 500; font-size: 14px;">{sanitize_html(reply_name)}</span>
                        <span style="color: #6b7280; font-size: 12px; margin-left: 5px;">@{sanitize_html(reply_username)}</span>
                    </div>
                </div>
                <p style="color: #d1d5db; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">{reply_text}</p>
                <div style="margin-top: 8px; color: #6b7280; font-size: 12px;">
                    <span>❤️ {reply_likes}</span>
                </div>
            </div>
            """
        replies_html += '</div>'
    
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{author_name}'s Viral Thread | Viral Threads Campaign</title>
    <meta name="description" content="View @{author_username}'s viral Twitter thread with {thread.total_engagement:,} total engagement. Score: {thread.combined_score:.1f}">
    <meta name="keywords" content="viral thread, twitter, {author_username}, crypto, campaign">
    <meta property="og:title" content="{author_name}'s Viral Thread">
    <meta property="og:description" content="{first_tweet_text}...">
    <meta property="og:image" content="{thread.author_avatar}">
    <meta property="og:type" content="article">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="{author_name}'s Viral Thread">
    <meta name="twitter:description" content="{first_tweet_text}...">
    <link rel="canonical" href="/thread/{thread.id}">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        body {{ font-family: 'Inter', sans-serif; background: linear-gradient(135deg, #0a0a0f, #13131a); color: white; margin: 0; padding: 20px; min-height: 100vh; }}
        .container {{ max-width: 700px; margin: 0 auto; }}
        .header {{ display: flex; align-items: center; gap: 15px; margin-bottom: 30px; padding: 20px; background: rgba(255,255,255,0.03); border-radius: 16px; }}
        .avatar {{ width: 64px; height: 64px; border-radius: 50%; }}
        .author-info h1 {{ margin: 0; font-size: 24px; }}
        .author-info p {{ margin: 5px 0 0; color: #6b7280; }}
        .stats {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 30px; }}
        .stat {{ text-align: center; padding: 20px; background: rgba(255,255,255,0.03); border-radius: 12px; }}
        .stat-value {{ font-size: 24px; font-weight: bold; color: #6366f1; }}
        .stat-label {{ font-size: 14px; color: #6b7280; margin-top: 5px; }}
        .thread-content {{ margin-bottom: 30px; }}
        .back-link {{ display: inline-block; padding: 12px 24px; background: linear-gradient(135deg, #6366f1, #a855f7); border-radius: 12px; color: white; text-decoration: none; font-weight: 600; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <img src="{thread.author_avatar}" alt="{author_name}" class="avatar">
            <div class="author-info">
                <h1>{author_name}</h1>
                <p>@{author_username}</p>
            </div>
        </div>
        <div class="stats">
            <div class="stat">
                <div class="stat-value">{thread.combined_score:.1f}</div>
                <div class="stat-label">Combined Score</div>
            </div>
            <div class="stat">
                <div class="stat-value">{thread.judge_average:.1f}</div>
                <div class="stat-label">Judge Score</div>
            </div>
            <div class="stat">
                <div class="stat-value">{thread.public_votes}</div>
                <div class="stat-label">Public Votes</div>
            </div>
        </div>
        <div class="thread-content">
            <h2 style="margin-bottom: 20px;">Full Thread ({len(thread.tweets)} tweets)</h2>
            {tweets_html}
        </div>
        {replies_html}
        <div style="display: flex; gap: 12px; margin-bottom: 30px;">
            <button id="copyBtn" onclick="copyLink(this)" style="padding: 12px 24px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 12px; color: white; font-weight: 600; cursor: pointer; transition: all 0.2s;">
                📋 Copy Link
            </button>
            <a id="shareLink" style="padding: 12px 24px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 12px; color: white; font-weight: 600; text-decoration: none; transition: all 0.2s; cursor: pointer;">
                𝕏 Share on X
            </a>
        </div>
        <a href="/#leaderboard" class="back-link">← Back to Leaderboard</a>
    </div>
    <script>
        function copyLink(btn) {{
            navigator.clipboard.writeText(window.location.href);
            btn.textContent = '✓ Copied!';
            setTimeout(() => btn.textContent = '📋 Copy Link', 2000);
        }}
        document.getElementById('shareLink').href = 'https://twitter.com/intent/tweet?text=Check out this viral thread!&url=' + encodeURIComponent(window.location.href);
    </script>
    <script type="application/ld+json">
    {{
        "@context": "https://schema.org",
        "@type": "Article",
        "headline": "{author_name}'s Viral Thread",
        "author": {{
            "@type": "Person",
            "name": "{author_name}",
            "url": "https://twitter.com/{author_username}"
        }},
        "datePublished": "{thread.created_at}",
        "description": "{first_tweet_text}"
    }}
    </script>
</body>
</html>"""

@app.get("/thread/{slug_or_id}", response_class=HTMLResponse)
async def serve_thread_detail(slug_or_id: str):
    thread = db.get_thread_by_slug(slug_or_id)
    if not thread:
        thread = db.get_thread(slug_or_id)
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    if thread.slug and slug_or_id != thread.slug:
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url=f"/thread/{thread.slug}", status_code=301)
    return generate_thread_html(thread)

@app.get("/", response_class=HTMLResponse)
async def serve_app():
    return open("static/index.html").read()

@app.get("/{path:path}", response_class=HTMLResponse)
async def serve_spa(path: str):
    if path.startswith("api/") or path.startswith("thread/"):
        raise HTTPException(status_code=404)
    try:
        return open("static/index.html").read()
    except:
        raise HTTPException(status_code=404)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000)
