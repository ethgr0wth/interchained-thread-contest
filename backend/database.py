import redis
import json
from typing import Optional, List
from datetime import datetime
import uuid
import bcrypt as bcrypt_lib
from backend.config import REDIS_URL
from backend.models import Thread, ThreadSubmission, JudgeScore, PublicVote, CampaignSettings, Judge, Tweet

class RedisDB:
    def __init__(self):
        self.client: redis.Redis = redis.from_url(REDIS_URL, decode_responses=True)
        self._init_default_data()
    
    def _init_default_data(self):
        if not self.client.exists("campaign:current"):
            default_campaign = CampaignSettings(
                name="Interchained Thread Contest",
                description="Share your best viral X.com threads about crypto, Web3, and blockchain. Win real crypto prizes in USDT and $ITC tokens!",
                start_date=datetime.now().isoformat(),
                end_date="2026-03-01T00:00:00",
                is_active=True,
                prizes=[
                    {"place": 1, "usdt": 50, "itc": 0, "label": "1st Place"},
                    {"place": 2, "usdt": 0, "itc": 2000, "label": "2nd Place"},
                    {"place": 3, "usdt": 0, "itc": 1500, "label": "3rd Place"},
                    {"place": 4, "usdt": 0, "itc": 1000, "label": "4th Place"},
                    {"place": 5, "usdt": 0, "itc": 500, "label": "5th Place"}
                ],
                usdt_prize_pool=50,
                itc_prize_pool=5000,
                goals="Create engaging threads about Interchained, Web3, crypto, and blockchain technology!",
                rules="1. Submit original X.com threads only\\n2. Threads must be your own\\n3. Content must be related to crypto/Web3\\n4. No spam or inappropriate content\\n5. One submission per person per campaign"
            )
            self.save_campaign(default_campaign)
        
    def _hash_password(self, password: str) -> str:
        salt = bcrypt_lib.gensalt()
        hashed = bcrypt_lib.hashpw(password.encode('utf-8'), salt)
        return hashed.decode('utf-8')
    
    def _verify_password(self, password: str, hashed: str) -> bool:
        try:
            return bcrypt_lib.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))
        except:
            return False
    
    def create_judge(self, username: str, password: str, is_super_admin: bool = False) -> Judge:
        judge_id = str(uuid.uuid4())
        judge = Judge(
            id=judge_id,
            username=username,
            password_hash=self._hash_password(password),
            is_super_admin=is_super_admin,
            created_at=datetime.now().isoformat()
        )
        self.client.hset("judges", username, json.dumps(judge.model_dump()))
        return judge
    
    def get_judge(self, username: str) -> Optional[Judge]:
        data = self.client.hget("judges", username)
        if data:
            return Judge(**json.loads(str(data)))
        return None
    
    def get_all_judges(self) -> List[Judge]:
        judges = []
        all_data = self.client.hgetall("judges")
        for username, data in all_data.items():
            judges.append(Judge(**json.loads(str(data))))
        return judges
    
    def delete_judge(self, username: str) -> bool:
        return self.client.hdel("judges", username) > 0
    
    def authenticate_judge(self, username: str, password: str) -> Optional[Judge]:
        judge = self.get_judge(username)
        if judge and self._verify_password(password, judge.password_hash):
            return judge
        return None
    
    def save_session(self, token: str, session_data: dict, ttl: int = 86400) -> None:
        self.client.setex(f"session:{token}", ttl, json.dumps(session_data))
    
    def get_session(self, token: str) -> Optional[dict]:
        data = self.client.get(f"session:{token}")
        if data:
            return json.loads(str(data))
        return None
    
    def delete_session(self, token: str) -> None:
        self.client.delete(f"session:{token}")
    
    def save_thread(self, thread: Thread) -> Thread:
        self.client.hset("threads", thread.id, json.dumps(thread.model_dump()))
        self.client.zadd("threads:by_score", {thread.id: thread.combined_score})
        self.client.zadd("threads:by_date", {thread.id: datetime.fromisoformat(thread.created_at).timestamp()})
        return thread
    
    def get_thread(self, thread_id: str) -> Optional[Thread]:
        data = self.client.hget("threads", thread_id)
        if data:
            return Thread(**json.loads(str(data)))
        return None
    
    def get_thread_by_slug(self, slug: str) -> Optional[Thread]:
        """Look up thread by SEO-friendly slug."""
        thread_id = self.client.hget("slugs", slug)
        if thread_id:
            return self.get_thread(str(thread_id))
        return None
    
    def save_slug(self, slug: str, thread_id: str):
        """Save slug to thread ID mapping."""
        self.client.hset("slugs", slug, thread_id)
    
    def delete_thread(self, thread_id: str) -> bool:
        """Delete a thread and all associated data."""
        thread = self.get_thread(thread_id)
        if not thread:
            return False
        
        self.client.hdel("threads", thread_id)
        self.client.zrem("threads:by_score", thread_id)
        self.client.zrem("threads:by_date", thread_id)
        self.client.delete(f"votes:{thread_id}")
        
        if thread.slug:
            self.client.hdel("slugs", thread.slug)
        
        return True
    
    def get_all_threads(self, limit: int = 100) -> List[Thread]:
        thread_ids = self.client.zrevrange("threads:by_score", 0, limit - 1)
        threads = []
        for tid in thread_ids:
            thread = self.get_thread(str(tid))
            if thread:
                threads.append(thread)
        return threads
    
    def get_leaderboard(self, limit: int = 50) -> List[Thread]:
        return self.get_all_threads(limit)
    
    def add_judge_score(self, score: JudgeScore) -> Thread:
        thread = self.get_thread(score.thread_id)
        if not thread:
            raise ValueError("Thread not found")
        
        thread.judge_scores[score.judge_id] = {
            "score": score.score,
            "comment": score.comment,
            "scored_at": score.scored_at or datetime.now().isoformat()
        }
        
        scores = [s["score"] for s in thread.judge_scores.values()]
        thread.judge_average = sum(scores) / len(scores) if scores else 0
        thread.combined_score = (thread.judge_average * 0.7) + (thread.public_score * 0.3)
        
        return self.save_thread(thread)
    
    def add_public_vote(self, vote: PublicVote) -> Thread:
        thread = self.get_thread(vote.thread_id)
        if not thread:
            raise ValueError("Thread not found")
        
        vote_key = f"votes:{vote.thread_id}"
        vote_data = {
            "vote": vote.vote,
            "voter_ip": vote.voter_ip,
            "voted_at": vote.voted_at or datetime.now().isoformat()
        }
        self.client.rpush(vote_key, json.dumps(vote_data))
        
        all_votes_raw = self.client.lrange(vote_key, 0, -1)
        votes = [json.loads(str(v))["vote"] for v in all_votes_raw]
        
        thread.public_votes = len(votes)
        thread.public_score = (sum(votes) / len(votes)) * 20 if votes else 0
        if thread.judge_scores:
            thread.combined_score = (thread.judge_average * 0.7) + (thread.public_score * 0.3)
        else:
            thread.combined_score = thread.public_score
        
        return self.save_thread(thread)
    
    def has_voted(self, thread_id: str, voter_ip: str) -> bool:
        vote_key = f"votes:{thread_id}"
        all_votes_raw = self.client.lrange(vote_key, 0, -1)
        for v in all_votes_raw:
            vote_data = json.loads(str(v))
            if vote_data.get("voter_ip") == voter_ip:
                return True
        return False
    
    def save_campaign(self, campaign: CampaignSettings) -> CampaignSettings:
        campaign.created_at = campaign.created_at or datetime.now().isoformat()
        self.client.set("campaign:current", json.dumps(campaign.model_dump()))
        self.client.rpush("campaigns:history", json.dumps(campaign.model_dump()))
        return campaign
    
    def get_current_campaign(self) -> Optional[CampaignSettings]:
        data = self.client.get("campaign:current")
        if data:
            return CampaignSettings(**json.loads(str(data)))
        return None
    
    def get_stats(self) -> dict:
        total_threads = self.client.hlen("threads")
        total_votes = 0
        thread_ids = self.client.hkeys("threads")
        for tid in thread_ids:
            votes = self.client.llen(f"votes:{tid}")
            total_votes += votes
        
        return {
            "total_threads": total_threads,
            "total_votes": total_votes,
            "total_judges": self.client.hlen("judges")
        }

db = RedisDB()
