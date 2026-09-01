from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
import uuid

class ThreadSubmission(BaseModel):
    thread_url: str
    usdt_bsc_wallet: str
    itc_wallet: str
    telegram: Optional[str] = None
    submitted_at: Optional[str] = None
    id: Optional[str] = None

class Tweet(BaseModel):
    id: str
    text: str
    author_username: str
    author_name: str
    author_avatar: str
    created_at: str
    likes: int = 0
    retweets: int = 0
    replies: int = 0
    media_urls: List[str] = []

class Reply(BaseModel):
    id: str
    text: str
    author_username: str
    author_name: str
    author_avatar: str
    created_at: str
    likes: int = 0
    retweets: int = 0

class Thread(BaseModel):
    id: str
    slug: Optional[str] = None
    submission: ThreadSubmission
    tweets: List[Tweet] = []
    replies: List[Reply] = []
    main_tweet_id: str
    author_username: str
    author_name: str
    author_avatar: str
    created_at: str
    total_engagement: int = 0
    judge_scores: dict = {}
    judge_average: float = 0.0
    public_votes: int = 0
    public_score: float = 0.0
    combined_score: float = 0.0
    status: str = "pending"

class JudgeScore(BaseModel):
    thread_id: str
    judge_id: str
    score: int = Field(..., ge=0, le=100)
    comment: Optional[str] = None
    scored_at: Optional[str] = None

class PublicVote(BaseModel):
    thread_id: str
    vote: int = Field(..., ge=1, le=5)
    voter_ip: Optional[str] = None
    voted_at: Optional[str] = None

class CampaignSettings(BaseModel):
    id: str = "current"
    name: str = "Viral Thread Campaign"
    description: str = ""
    start_date: str
    end_date: str
    is_active: bool = True
    prizes: List[dict] = []
    usdt_prize_pool: float = 0.0
    itc_prize_pool: float = 0.0
    goals: str = ""
    rules: str = ""
    created_by: str = ""
    created_at: Optional[str] = None

class Judge(BaseModel):
    id: str
    username: str
    password_hash: str
    is_super_admin: bool = False
    created_at: Optional[str] = None
