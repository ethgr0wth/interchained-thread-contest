const { useState, useEffect, useCallback } = React;

const API_BASE = '';
let authToken = localStorage.getItem('authToken') || null;

// Toast notification system
let toastContainer = null;
function showToast(message, type = 'success') {
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.style.cssText = 'position: fixed; top: 80px; right: 20px; z-index: 9999; display: flex; flex-direction: column; gap: 10px;';
        document.body.appendChild(toastContainer);
    }
    const toast = document.createElement('div');
    const bgColor = type === 'success' ? 'rgba(34, 197, 94, 0.9)' : type === 'error' ? 'rgba(239, 68, 68, 0.9)' : 'rgba(59, 130, 246, 0.9)';
    toast.style.cssText = `background: ${bgColor}; color: white; padding: 12px 20px; border-radius: 12px; font-size: 14px; font-weight: 500; box-shadow: 0 10px 40px rgba(0,0,0,0.3); backdrop-filter: blur(10px); animation: slideIn 0.3s ease-out;`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease-in forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Check if thread is new (within 24 hours)
function isNewThread(createdAt) {
    if (!createdAt) return false;
    const created = new Date(createdAt);
    const now = new Date();
    const hoursDiff = (now - created) / (1000 * 60 * 60);
    return hoursDiff < 24;
}

// Skeleton loader component
function SkeletonCard({ count = 1 }) {
    return React.createElement(React.Fragment, null,
        Array.from({ length: count }).map((_, i) =>
            React.createElement('div', { key: i, className: 'glass rounded-2xl p-6' },
                React.createElement('div', { className: 'flex items-start gap-4' },
                    React.createElement('div', { className: 'w-14 h-14 skeleton rounded-xl' }),
                    React.createElement('div', { className: 'flex-1' },
                        React.createElement('div', { className: 'flex items-center gap-3 mb-3' },
                            React.createElement('div', { className: 'w-12 h-12 skeleton rounded-full' }),
                            React.createElement('div', null,
                                React.createElement('div', { className: 'w-32 h-4 skeleton mb-2' }),
                                React.createElement('div', { className: 'w-20 h-3 skeleton' })
                            )
                        ),
                        React.createElement('div', { className: 'w-full h-16 skeleton mb-4' }),
                        React.createElement('div', { className: 'flex gap-4' },
                            React.createElement('div', { className: 'w-16 h-4 skeleton' }),
                            React.createElement('div', { className: 'w-16 h-4 skeleton' }),
                            React.createElement('div', { className: 'w-16 h-4 skeleton' })
                        )
                    )
                )
            )
        )
    );
}

function SkeletonLeaderCard() {
    return React.createElement('div', { className: 'glass rounded-2xl p-5' },
        React.createElement('div', { className: 'flex items-center gap-3 mb-4' },
            React.createElement('div', { className: 'w-10 h-10 skeleton rounded-xl' }),
            React.createElement('div', { className: 'w-10 h-10 skeleton rounded-full' }),
            React.createElement('div', { className: 'flex-1' },
                React.createElement('div', { className: 'w-24 h-4 skeleton mb-2' }),
                React.createElement('div', { className: 'w-16 h-3 skeleton' })
            )
        ),
        React.createElement('div', { className: 'w-full h-12 skeleton mb-4' }),
        React.createElement('div', { className: 'flex justify-between' },
            React.createElement('div', { className: 'w-20 h-3 skeleton' }),
            React.createElement('div', { className: 'w-16 h-4 skeleton' })
        )
    );
}

async function api(endpoint, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
    }
    const res = await fetch(`${API_BASE}/api${endpoint}`, {
        headers,
        ...options
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Request failed' }));
        throw new Error(err.detail || 'Request failed');
    }
    return res.json();
}

function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
}

function XIcon({ className = 'w-6 h-6' }) {
    return React.createElement('span', { className: `font-black ${className}` }, '𝕏');
}

function Navbar({ currentPage, setCurrentPage, isAdmin }) {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    
    return React.createElement('nav', { className: 'fixed top-0 left-0 right-0 z-50 glass border-b border-white/5' },
        React.createElement('div', { className: 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8' },
            React.createElement('div', { className: 'flex items-center justify-between h-16' },
                React.createElement('div', { className: 'flex items-center gap-3 cursor-pointer', onClick: () => setCurrentPage('home') },
                    React.createElement('div', { className: 'flex items-center gap-2' },
                        React.createElement('img', { 
                            src: '/static/logo.png', 
                            alt: 'Interchained', 
                            className: 'w-10 h-10 rounded-full object-contain'
                        }),
                        React.createElement('span', { className: 'text-xl font-black' },
                            React.createElement('span', { className: 'title-gradient' }, 'INTERCHAINED')
                        )
                    )
                ),
                React.createElement('div', { className: 'hidden md:flex items-center gap-1' },
                    ['home', 'leaderboard', 'submit'].map(page =>
                        React.createElement('button', {
                            key: page,
                            onClick: () => setCurrentPage(page),
                            className: `px-4 py-2 rounded-lg text-sm font-medium transition-all ${currentPage === page ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'}`
                        }, page.charAt(0).toUpperCase() + page.slice(1))
                    ),
                    React.createElement('button', {
                        onClick: () => setCurrentPage('admin'),
                        className: `ml-4 px-4 py-2 rounded-lg text-sm font-medium transition-all ${currentPage === 'admin' ? 'bg-itc-gold text-black' : 'text-gray-400 hover:text-white border border-white/10 hover:border-white/20'}`
                    }, isAdmin ? 'Admin Panel' : 'Admin')
                ),
                React.createElement('button', {
                    className: 'md:hidden p-2 rounded-lg hover:bg-white/10 transition-all',
                    onClick: () => setMobileMenuOpen(!mobileMenuOpen)
                },
                    React.createElement('div', { className: 'w-6 h-5 flex flex-col justify-between' },
                        React.createElement('span', { className: `block h-0.5 bg-white transition-all ${mobileMenuOpen ? 'rotate-45 translate-y-2' : ''}` }),
                        React.createElement('span', { className: `block h-0.5 bg-white transition-all ${mobileMenuOpen ? 'opacity-0' : ''}` }),
                        React.createElement('span', { className: `block h-0.5 bg-white transition-all ${mobileMenuOpen ? '-rotate-45 -translate-y-2' : ''}` })
                    )
                )
            )
        ),
        mobileMenuOpen && React.createElement('div', { className: 'md:hidden glass border-t border-white/5' },
            React.createElement('div', { className: 'px-4 py-3 space-y-2' },
                ['home', 'leaderboard', 'submit', 'admin'].map(page =>
                    React.createElement('button', {
                        key: page,
                        onClick: () => { setCurrentPage(page); setMobileMenuOpen(false); },
                        className: `block w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-all ${currentPage === page ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'}`
                    }, page.charAt(0).toUpperCase() + page.slice(1))
                )
            )
        )
    );
}

function TrophyCard({ place, prize, isMain = false }) {
    const trophyEmojis = { 1: '🏆', 2: '🥈', 3: '🥉' };
    const trophyClasses = { 1: 'trophy-gold text-4xl sm:text-6xl', 2: 'trophy-silver text-3xl sm:text-5xl', 3: 'trophy-bronze text-3xl sm:text-5xl' };
    
    return React.createElement('div', { 
        className: `trophy-card p-3 sm:p-5 ${isMain ? 'glow-gold z-10' : ''}`
    },
        React.createElement('div', { className: 'mb-2 sm:mb-3' },
            React.createElement('span', { className: trophyClasses[place] || 'text-4xl' }, trophyEmojis[place] || '🏅')
        ),
        React.createElement('div', { className: 'text-xs sm:text-base text-gray-400 mb-1' }, 
            place === 1 ? '1st' : place === 2 ? '2nd' : place === 3 ? '3rd' : `${place}th`
        ),
        prize.usdt > 0 && React.createElement('div', { className: 'text-base sm:text-xl font-bold text-green-400' }, `${prize.usdt} USDT`),
        prize.itc > 0 && React.createElement('div', { className: `text-sm sm:text-lg font-bold text-itc-gold` }, `${prize.itc.toLocaleString()} $ITC`)
    );
}

function CountdownTimer({ endDate }) {
    const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
    const [expired, setExpired] = useState(false);
    
    useEffect(() => {
        const calculateTime = () => {
            const end = new Date(endDate);
            const now = new Date();
            const diff = end - now;
            
            if (diff <= 0) {
                setExpired(true);
                return;
            }
            
            setTimeLeft({
                days: Math.floor(diff / (1000 * 60 * 60 * 24)),
                hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
                minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
                seconds: Math.floor((diff % (1000 * 60)) / 1000)
            });
        };
        
        calculateTime();
        const interval = setInterval(calculateTime, 1000);
        return () => clearInterval(interval);
    }, [endDate]);
    
    if (!endDate) return null;
    const end = new Date(endDate);
    if (isNaN(end.getTime())) return null;
    
    const TimeBox = ({ value, label }) => React.createElement('div', { className: 'glass rounded-xl p-3 sm:p-4 text-center min-w-[60px] sm:min-w-[80px]' },
        React.createElement('div', { className: 'text-xl sm:text-3xl font-black text-white' }, String(value).padStart(2, '0')),
        React.createElement('div', { className: 'text-xs text-gray-400 uppercase' }, label)
    );
    
    return React.createElement('div', { className: 'w-full max-w-4xl mx-auto px-4 py-8' },
        React.createElement('div', { className: 'text-center mb-4' },
            React.createElement('h3', { className: 'text-lg sm:text-xl font-bold text-white' }, 
                expired ? 'Contest Ended!' : 'Time Remaining'
            ),
            expired && React.createElement('p', { className: 'text-gray-400 text-sm' }, 'Winners will be announced soon!')
        ),
        !expired && React.createElement('div', { className: 'flex justify-center gap-2 sm:gap-4' },
            React.createElement(TimeBox, { value: timeLeft.days, label: 'Days' }),
            React.createElement(TimeBox, { value: timeLeft.hours, label: 'Hours' }),
            React.createElement(TimeBox, { value: timeLeft.minutes, label: 'Mins' }),
            React.createElement(TimeBox, { value: timeLeft.seconds, label: 'Secs' })
        )
    );
}

function TopLeaders({ setCurrentPage }) {
    const [topThreads, setTopThreads] = useState([]);
    const [loading, setLoading] = useState(true);
    
    useEffect(() => {
        const fetchTop = async () => {
            try {
                const data = await api('/leaderboard?limit=3');
                setTopThreads(data.leaderboard || []);
            } catch (e) {
                console.error(e);
            }
            setLoading(false);
        };
        fetchTop();
    }, []);
    
    if (topThreads.length === 0 && !loading) return null;
    
    return React.createElement('div', { className: 'w-full max-w-6xl mx-auto px-4 py-8' },
        React.createElement('div', { className: 'text-center mb-8' },
            React.createElement('h2', { className: 'text-2xl sm:text-3xl font-black text-white mb-2' }, 
                'Current Leaders'
            ),
            React.createElement('p', { className: 'text-gray-400' }, 'Top performing threads in the competition')
        ),
        loading ? React.createElement('div', { className: 'grid grid-cols-1 md:grid-cols-3 gap-4' },
            React.createElement(SkeletonLeaderCard),
            React.createElement(SkeletonLeaderCard),
            React.createElement(SkeletonLeaderCard)
        ) : React.createElement('div', { className: 'grid grid-cols-1 md:grid-cols-3 gap-4' },
            topThreads.map(({ rank, thread }) => 
                React.createElement('div', { 
                    key: thread.id,
                    className: `glass rounded-2xl p-5 transition-all hover:scale-[1.02] cursor-pointer border ${rank === 1 ? 'border-yellow-500/50 shadow-lg shadow-yellow-500/20' : rank === 2 ? 'border-gray-400/30' : 'border-orange-600/30'}`,
                    onClick: () => window.location.href = `/thread/${thread.slug || thread.id}`
                },
                    React.createElement('div', { className: 'flex items-center gap-3 mb-4' },
                        React.createElement('div', { 
                            className: `w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold ${rank === 1 ? 'bg-gradient-to-br from-yellow-400 to-yellow-600 text-black' : rank === 2 ? 'bg-gradient-to-br from-gray-300 to-gray-500 text-black' : 'bg-gradient-to-br from-orange-400 to-orange-600 text-black'}`
                        }, rank),
                        React.createElement('img', {
                            src: thread.author_avatar,
                            alt: thread.author_name,
                            className: 'w-10 h-10 rounded-full bg-gray-700'
                        }),
                        React.createElement('div', { className: 'flex-1 min-w-0' },
                            React.createElement('div', { className: 'font-semibold text-white text-sm truncate' }, thread.author_name),
                            React.createElement('div', { className: 'text-xs text-gray-400' }, `@${thread.author_username}`)
                        )
                    ),
                    thread.tweets && thread.tweets[0] && React.createElement('p', { 
                        className: 'text-gray-300 text-sm line-clamp-3 mb-4 whitespace-pre-wrap' 
                    }, thread.tweets[0].text?.slice(0, 120) + (thread.tweets[0].text?.length > 120 ? '...' : '')),
                    React.createElement('div', { className: 'flex justify-between items-center text-xs' },
                        React.createElement('div', { className: 'flex gap-3 text-gray-400' },
                            React.createElement('span', null, `❤️ ${thread.total_engagement?.toLocaleString() || 0}`),
                            React.createElement('span', null, `⭐ ${thread.public_average?.toFixed(1) || '0.0'}`)
                        ),
                        React.createElement('span', { className: 'text-itc-gold font-bold' }, 
                            `Score: ${thread.combined_score?.toFixed(1) || '0.0'}`
                        )
                    )
                )
            )
        ),
        React.createElement('div', { className: 'text-center mt-6' },
            React.createElement('button', {
                onClick: () => setCurrentPage('leaderboard'),
                className: 'px-6 py-3 glass glass-hover rounded-xl font-semibold text-sm transition-all border border-white/20'
            }, 'View Full Leaderboard →')
        )
    );
}

function HeroSection({ stats, campaign, setCurrentPage }) {
    const topPrizes = campaign?.prizes?.slice(0, 3) || [];
    const bottomPrizes = campaign?.prizes?.slice(3, 5) || [];
    
    return React.createElement('div', { className: 'relative flex flex-col items-center justify-start overflow-hidden pt-20 pb-8 px-3' },
        React.createElement('div', { className: 'relative z-10 max-w-6xl mx-auto px-4 text-center' },
            React.createElement('div', { className: 'inline-flex items-center gap-2 glass px-4 py-2 rounded-full mb-6' },
                React.createElement('span', { className: 'w-2 h-2 bg-green-500 rounded-full animate-pulse' }),
                React.createElement('span', { className: 'text-sm text-gray-300' }, 'Contest Active'),
                React.createElement(XIcon, { className: 'ml-2 text-white' })
            ),
            React.createElement('h1', { className: 'text-2xl sm:text-4xl md:text-6xl font-black mb-1 leading-tight tracking-tight' },
                React.createElement('span', { className: 'title-gradient' }, 'INTERCHAINED'),
                React.createElement('span', { className: 'text-white/80 text-base sm:text-2xl ml-2' }, 'announces')
            ),
            React.createElement('h2', { className: 'text-2xl sm:text-4xl md:text-6xl font-black mb-4 sm:mb-6 text-white' },
                'THREAD CONTEST'
            ),
            React.createElement('p', { className: 'text-sm sm:text-lg text-gray-400 mb-6 max-w-2xl mx-auto flex items-center justify-center gap-1 sm:gap-2' },
                'Share your best viral ',
                React.createElement(XIcon, { className: 'text-white text-sm sm:text-base' }),
                ' threads and win crypto prizes!'
            ),
            React.createElement('div', { className: 'grid grid-cols-3 gap-2 sm:gap-4 mb-4 sm:mb-6 w-full max-w-xl' },
                topPrizes.length >= 3 && [
                    React.createElement('div', { key: 2, className: 'order-1' },
                        React.createElement(TrophyCard, { place: 2, prize: topPrizes[1] })
                    ),
                    React.createElement('div', { key: 1, className: 'order-0' },
                        React.createElement(TrophyCard, { place: 1, prize: topPrizes[0], isMain: true })
                    ),
                    React.createElement('div', { key: 3, className: 'order-2' },
                        React.createElement(TrophyCard, { place: 3, prize: topPrizes[2] })
                    )
                ]
            ),
            bottomPrizes.length > 0 && React.createElement('div', { className: 'grid grid-cols-2 gap-2 sm:gap-4 w-full max-w-md mb-6' },
                bottomPrizes.map((prize, i) =>
                    React.createElement('div', { key: i, className: 'flex items-center justify-center gap-2 glass px-3 py-2 sm:px-5 sm:py-3 rounded-lg sm:rounded-xl' },
                        React.createElement('span', { className: 'text-lg sm:text-2xl font-black text-gray-300' }, `${i + 4}th`),
                        React.createElement('span', { className: 'text-sm sm:text-lg font-bold text-itc-gold' }, `${prize.itc.toLocaleString()} $ITC`)
                    )
                )
            ),
            React.createElement('div', { className: 'flex flex-wrap justify-center gap-2 sm:gap-4 mb-6' },
                React.createElement('button', {
                    onClick: () => setCurrentPage('submit'),
                    className: 'group relative px-4 sm:px-8 py-3 sm:py-4 bg-gradient-to-r from-itc-gold to-yellow-600 rounded-xl font-bold text-sm sm:text-lg text-black transition-all active:scale-95 shadow-lg shadow-itc-gold/30'
                }, 
                    React.createElement('span', { className: 'flex items-center gap-1 sm:gap-2' },
                        'Submit ',
                        React.createElement(XIcon, { className: 'text-black text-sm sm:text-base' }),
                        ' Thread'
                    )
                ),
                React.createElement('button', {
                    onClick: () => setCurrentPage('leaderboard'),
                    className: 'px-4 sm:px-8 py-3 sm:py-4 glass glass-hover rounded-xl font-semibold text-sm sm:text-lg transition-all border border-white/20'
                }, 'Leaderboard')
            ),
            React.createElement('div', { className: 'grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 w-full max-w-3xl' },
                [
                    { label: 'USDT Prize', value: `$${campaign?.usdt_prize_pool || 0}`, icon: '💵' },
                    { label: 'ITC Prizes', value: `${(campaign?.itc_prize_pool || 0).toLocaleString()} $ITC`, icon: '⛓' },
                    { label: 'Entries', value: stats?.total_threads || 0, icon: '📝' },
                    { label: 'Votes', value: stats?.total_votes || 0, icon: '🗳️' }
                ].map((stat, i) =>
                    React.createElement('div', { key: i, className: 'glass rounded-xl p-4 text-center' },
                        React.createElement('div', { className: 'text-2xl mb-2' }, stat.icon),
                        React.createElement('div', { className: 'text-xl font-bold text-white' }, stat.value),
                        React.createElement('div', { className: 'text-sm text-gray-400' }, stat.label)
                    )
                )
            )
        )
    );
}

function ThreadCard({ thread, rank, onVote, showVoting = true }) {
    const [voting, setVoting] = useState(false);
    const [hoverRating, setHoverRating] = useState(0);
    const [hasVoted, setHasVoted] = useState(false);

    const handleVote = async (rating) => {
        if (hasVoted || voting) return;
        setVoting(true);
        try {
            await onVote(thread.id, rating);
            setHasVoted(true);
        } catch (e) {
            if (e.message.includes('already voted')) {
                setHasVoted(true);
            }
        }
        setVoting(false);
    };

    return React.createElement('div', { className: 'tweet-card glass rounded-2xl p-6 transition-all hover:bg-white/5' },
        React.createElement('div', { className: 'flex items-start gap-4' },
            rank && React.createElement('div', {
                className: `w-14 h-14 rounded-xl flex items-center justify-center text-xl font-bold text-white flex-shrink-0 ${rank === 1 ? 'rank-1' : rank === 2 ? 'rank-2' : rank === 3 ? 'rank-3' : 'bg-gray-700'}`
            }, rank <= 3 ? ['🥇', '🥈', '🥉'][rank - 1] : `#${rank}`),
            React.createElement('div', { className: 'flex-1 min-w-0' },
                React.createElement('div', { className: 'flex items-center gap-3 mb-3' },
                    React.createElement('img', {
                        src: thread.author_avatar,
                        alt: thread.author_name,
                        className: 'w-12 h-12 rounded-full bg-gray-700'
                    }),
                    React.createElement('div', null,
                        React.createElement('div', { className: 'font-semibold text-white flex items-center gap-2' }, 
                            thread.author_name,
                            React.createElement(XIcon, { className: 'text-gray-400 text-sm' }),
                            isNewThread(thread.created_at) && React.createElement('span', { 
                                className: 'px-2 py-0.5 text-[10px] font-bold bg-green-500 text-black rounded-full animate-pulse'
                            }, 'NEW')
                        ),
                        React.createElement('div', { className: 'text-sm text-gray-400' }, `@${thread.author_username}`)
                    )
                ),
                thread.tweets && thread.tweets.length > 0 && React.createElement('div', { className: 'space-y-3 mb-4' },
                    thread.tweets.slice(0, 2).map((tweet, i) =>
                        React.createElement('p', { 
                            key: i, 
                            className: 'text-gray-300 text-sm leading-relaxed whitespace-pre-wrap',
                            style: { whiteSpace: 'pre-wrap' }
                        },
                            i === 0 ? tweet.text : `${i + 1}/ ${tweet.text.substring(0, 100)}...`
                        )
                    ),
                    thread.tweets.length > 2 && React.createElement('p', { className: 'text-x-blue text-sm' },
                        `+ ${thread.tweets.length - 2} more tweets in thread`
                    )
                ),
                React.createElement('div', { className: 'flex flex-wrap items-center gap-4 text-sm' },
                    React.createElement('div', { className: 'flex items-center gap-1 text-gray-400' },
                        React.createElement('span', null, '❤️'),
                        React.createElement('span', null, formatNumber(thread.total_engagement))
                    ),
                    React.createElement('div', { className: 'flex items-center gap-1' },
                        React.createElement('span', { className: 'text-itc-gold' }, '⭐'),
                        React.createElement('span', { className: 'text-white font-semibold' }, thread.judge_average?.toFixed(1) || '0.0'),
                        React.createElement('span', { className: 'text-gray-500' }, 'judge')
                    ),
                    React.createElement('div', { className: 'flex items-center gap-1' },
                        React.createElement('span', { className: 'text-purple-400' }, '🗳️'),
                        React.createElement('span', { className: 'text-white' }, thread.public_votes || 0),
                        React.createElement('span', { className: 'text-gray-500' }, 'votes')
                    ),
                    React.createElement('div', { className: 'flex items-center gap-1 px-2 py-1 bg-gradient-to-r from-itc-gold/20 to-yellow-600/20 rounded-lg border border-itc-gold/30' },
                        React.createElement('span', { className: 'text-itc-gold font-bold' }, thread.combined_score?.toFixed(1) || '0.0'),
                        React.createElement('span', { className: 'text-gray-500 text-xs' }, 'score')
                    )
                ),
                showVoting && !hasVoted && React.createElement('div', { className: 'mt-4 flex items-center gap-2' },
                    React.createElement('span', { className: 'text-sm text-gray-400' }, 'Rate:'),
                    [1, 2, 3, 4, 5].map(star =>
                        React.createElement('button', {
                            key: star,
                            onClick: () => handleVote(star),
                            onMouseEnter: () => setHoverRating(star),
                            onMouseLeave: () => setHoverRating(0),
                            disabled: voting,
                            className: `text-2xl transition-all voting-star ${(hoverRating >= star) ? 'text-itc-gold scale-110' : 'text-gray-600'}`
                        }, '★')
                    )
                ),
                hasVoted && React.createElement('div', { className: 'mt-4 text-sm text-green-400' }, '✓ Thanks for voting!')
            )
        ),
        React.createElement('a', {
            href: `/thread/${thread.slug || thread.id}`,
            target: '_blank',
            className: 'mt-4 block text-center py-2 glass rounded-lg text-sm text-x-blue hover:bg-white/5 transition-all'
        }, 'View Full Thread →')
    );
}

function Leaderboard({ setCurrentPage }) {
    const [leaderboard, setLeaderboard] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadLeaderboard();
        const interval = setInterval(loadLeaderboard, 10000);
        return () => clearInterval(interval);
    }, []);

    const loadLeaderboard = async () => {
        try {
            const data = await api('/leaderboard');
            setLeaderboard(data.leaderboard || []);
        } catch (e) {
            console.error(e);
        }
        setLoading(false);
    };

    const handleVote = async (threadId, rating) => {
        await api('/votes', {
            method: 'POST',
            body: JSON.stringify({ thread_id: threadId, vote: rating })
        });
        loadLeaderboard();
    };

    return React.createElement('div', { className: 'min-h-screen pt-24 pb-16 px-4' },
        React.createElement('div', { className: 'max-w-4xl mx-auto' },
            React.createElement('div', { className: 'text-center mb-12' },
                React.createElement('h1', { className: 'text-4xl font-black mb-4' },
                    React.createElement('span', { className: 'title-gradient' }, 'LEADERBOARD')
                ),
                React.createElement('p', { className: 'text-gray-400 flex items-center justify-center gap-2' }, 
                    'Live rankings • Vote for your favorite ',
                    React.createElement(XIcon, { className: 'text-white' }),
                    ' threads!'
                )
            ),
            React.createElement('div', { className: 'glass rounded-xl p-4 mb-8' },
                React.createElement('h3', { className: 'text-sm font-bold text-itc-gold mb-3 uppercase tracking-wider' }, 'How Scoring Works'),
                React.createElement('div', { className: 'grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-gray-300' },
                    React.createElement('div', { className: 'flex items-start gap-2' },
                        React.createElement('span', { className: 'text-yellow-400 text-base' }, '\u2B50'),
                        React.createElement('div', null,
                            React.createElement('span', { className: 'font-semibold text-white block' }, 'Public Votes (30%)'),
                            'Rate threads 1-5 stars. Your vote is anonymous and counts toward the final score.'
                        )
                    ),
                    React.createElement('div', { className: 'flex items-start gap-2' },
                        React.createElement('span', { className: 'text-blue-400 text-base' }, '\uD83C\uDFC6'),
                        React.createElement('div', null,
                            React.createElement('span', { className: 'font-semibold text-white block' }, 'Judge Score (70%)'),
                            'Expert judges rate threads 0-100 based on quality, engagement, and creativity.'
                        )
                    ),
                    React.createElement('div', { className: 'flex items-start gap-2' },
                        React.createElement('span', { className: 'text-green-400 text-base' }, '\uD83D\uDCCA'),
                        React.createElement('div', null,
                            React.createElement('span', { className: 'font-semibold text-white block' }, 'Combined Score'),
                            'Final score = (Judge \u00D7 70%) + (Public \u00D7 30%). Before judges score, public votes count 100%.'
                        )
                    )
                )
            ),
            loading ? React.createElement('div', { className: 'space-y-4' },
                React.createElement(SkeletonCard, { count: 5 })
            ) : leaderboard.length === 0 ? React.createElement('div', { className: 'text-center py-20 glass rounded-2xl' },
                React.createElement('div', { className: 'text-6xl mb-4' }, '📝'),
                React.createElement('h3', { className: 'text-xl font-semibold text-white mb-2' }, 'No Entries Yet'),
                React.createElement('p', { className: 'text-gray-400 mb-6' }, 'Be the first to submit a viral thread!'),
                React.createElement('button', {
                    onClick: () => setCurrentPage('submit'),
                    className: 'px-6 py-3 bg-gradient-to-r from-itc-gold to-yellow-600 rounded-xl font-semibold text-black'
                }, 'Submit Thread')
            ) : React.createElement('div', { className: 'space-y-4' },
                leaderboard.map(({ rank, thread }) =>
                    React.createElement(ThreadCard, { key: thread.id, thread, rank, onVote: handleVote })
                )
            )
        )
    );
}

function SubmitForm({ setCurrentPage }) {
    const [form, setForm] = useState({
        thread_url: '',
        usdt_bsc_wallet: '',
        itc_wallet: '',
        telegram: ''
    });
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState(null);
    const [validationErrors, setValidationErrors] = useState({});

    const validateBscWallet = (address) => {
        if (!address) return false;
        return /^0x[a-fA-F0-9]{40}$/.test(address);
    };

    const validateItcWallet = (address) => {
        if (!address) return false;
        return /^itc1q[a-z0-9]{38,}$/.test(address.toLowerCase());
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setValidationErrors({});

        const errors = {};
        if (!validateBscWallet(form.usdt_bsc_wallet)) {
            errors.usdt_bsc_wallet = 'Invalid BSC address. Must start with 0x and be 42 characters.';
        }
        if (!validateItcWallet(form.itc_wallet)) {
            errors.itc_wallet = 'Invalid ITC address. Must start with itc1q (Bech32 format).';
        }
        
        if (Object.keys(errors).length > 0) {
            setValidationErrors(errors);
            setLoading(false);
            return;
        }

        try {
            await api('/threads/submit', {
                method: 'POST',
                body: JSON.stringify(form)
            });
            setSuccess(true);
        } catch (e) {
            setError(e.message);
        }
        setLoading(false);
    };

    if (success) {
        return React.createElement('div', { className: 'min-h-screen flex items-center justify-center px-4' },
            React.createElement('div', { className: 'glass rounded-2xl p-8 max-w-md w-full text-center' },
                React.createElement('div', { className: 'text-6xl mb-4' }, '🎉'),
                React.createElement('h2', { className: 'text-2xl font-bold text-white mb-4' }, 'Thread Submitted!'),
                React.createElement('p', { className: 'text-gray-400 mb-6' }, 'Your entry is now in the contest. Check the leaderboard to see your ranking!'),
                React.createElement('button', {
                    onClick: () => setCurrentPage('leaderboard'),
                    className: 'w-full py-3 bg-gradient-to-r from-itc-gold to-yellow-600 rounded-xl font-semibold text-black'
                }, 'View Leaderboard')
            )
        );
    }

    return React.createElement('div', { className: 'min-h-screen pt-24 pb-16 px-4' },
        React.createElement('div', { className: 'max-w-xl mx-auto' },
            React.createElement('div', { className: 'text-center mb-8' },
                React.createElement('h1', { className: 'text-4xl font-black mb-4' },
                    React.createElement('span', { className: 'title-gradient' }, 'SUBMIT YOUR THREAD')
                ),
                React.createElement('p', { className: 'text-gray-400 flex items-center justify-center gap-2' }, 
                    'Share your viral ',
                    React.createElement(XIcon, { className: 'text-white' }),
                    ' thread and compete for prizes'
                )
            ),
            React.createElement('form', { onSubmit: handleSubmit, className: 'glass rounded-2xl p-8 space-y-6' },
                error && React.createElement('div', { className: 'p-4 bg-red-500/20 border border-red-500/30 rounded-xl text-red-400' }, error),
                React.createElement('div', null,
                    React.createElement('label', { className: 'block text-sm font-medium text-gray-300 mb-2 flex items-center gap-2' }, 
                        React.createElement(XIcon, { className: 'text-white' }),
                        ' Thread URL *'
                    ),
                    React.createElement('input', {
                        type: 'url',
                        required: true,
                        placeholder: 'https://x.com/username/status/...',
                        value: form.thread_url,
                        onChange: (e) => setForm({ ...form, thread_url: e.target.value }),
                        className: 'w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-itc-gold transition-colors'
                    })
                ),
                React.createElement('div', null,
                    React.createElement('label', { className: 'block text-sm font-medium text-gray-300 mb-2' }, 'USDT BSC Wallet Address *'),
                    React.createElement('input', {
                        type: 'text',
                        required: true,
                        placeholder: '0x1234...abcd (42 characters)',
                        value: form.usdt_bsc_wallet,
                        onChange: (e) => { setForm({ ...form, usdt_bsc_wallet: e.target.value }); setValidationErrors({...validationErrors, usdt_bsc_wallet: null}); },
                        className: `w-full px-4 py-3 bg-white/5 border rounded-xl text-white placeholder-gray-500 focus:outline-none transition-colors ${validationErrors.usdt_bsc_wallet ? 'border-red-500' : 'border-white/10 focus:border-itc-gold'}`
                    }),
                    validationErrors.usdt_bsc_wallet ? 
                        React.createElement('p', { className: 'mt-1 text-xs text-red-400' }, validationErrors.usdt_bsc_wallet) :
                        React.createElement('p', { className: 'mt-1 text-xs text-gray-500' }, 'BEP-20 (BSC) wallet starting with 0x')
                ),
                React.createElement('div', null,
                    React.createElement('label', { className: 'block text-sm font-medium text-gray-300 mb-2' }, '$ITC Wallet Address *'),
                    React.createElement('input', {
                        type: 'text',
                        required: true,
                        placeholder: 'itc1q...',
                        value: form.itc_wallet,
                        onChange: (e) => { setForm({ ...form, itc_wallet: e.target.value }); setValidationErrors({...validationErrors, itc_wallet: null}); },
                        className: `w-full px-4 py-3 bg-white/5 border rounded-xl text-white placeholder-gray-500 focus:outline-none transition-colors ${validationErrors.itc_wallet ? 'border-red-500' : 'border-white/10 focus:border-itc-gold'}`
                    }),
                    validationErrors.itc_wallet ? 
                        React.createElement('p', { className: 'mt-1 text-xs text-red-400' }, validationErrors.itc_wallet) :
                        React.createElement('p', { className: 'mt-1 text-xs text-gray-500' }, 'ITC Bech32 wallet starting with itc1q')
                ),
                React.createElement('div', null,
                    React.createElement('label', { className: 'block text-sm font-medium text-gray-300 mb-2' }, 'Telegram Username (Optional)'),
                    React.createElement('input', {
                        type: 'text',
                        placeholder: '@username',
                        value: form.telegram,
                        onChange: (e) => setForm({ ...form, telegram: e.target.value }),
                        className: 'w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-itc-gold transition-colors'
                    })
                ),
                React.createElement('button', {
                    type: 'submit',
                    disabled: loading,
                    className: 'w-full py-4 bg-gradient-to-r from-itc-gold to-yellow-600 rounded-xl font-bold text-lg text-black transition-all hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-itc-gold/30'
                }, loading ? 'Submitting...' : 'Submit Entry')
            )
        )
    );
}

function AdminPanel({ isAdmin, setIsAdmin, adminUser, setAdminUser }) {
    const [loginForm, setLoginForm] = useState({ username: '', password: '' });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [threads, setThreads] = useState([]);
    const [campaign, setCampaign] = useState(null);
    const [activeTab, setActiveTab] = useState('threads');
    const [statusFilter, setStatusFilter] = useState('pending');
    const [scoreForm, setScoreForm] = useState({});
    const [savingCampaign, setSavingCampaign] = useState(false);
    const [syncingThreads, setSyncingThreads] = useState({});
    const [judges, setJudges] = useState([]);
    const [newJudge, setNewJudge] = useState({ username: '', password: '', is_super_admin: false });

    useEffect(() => {
        if (isAdmin) {
            loadAdminData();
        }
    }, [isAdmin]);

    const loadAdminData = async () => {
        try {
            const [threadsData, campaignData] = await Promise.all([
                api(`/admin/threads?status=${statusFilter}`),
                api('/campaign')
            ]);
            setThreads(threadsData.threads || []);
            setCampaign(campaignData.campaign);
            
            if (adminUser?.is_super_admin) {
                try {
                    const judgesData = await api('/admin/judges');
                    setJudges(judgesData.judges || []);
                } catch (e) {}
            }
        } catch (e) {
            if (e.message.includes('authenticated') || e.message.includes('401')) {
                handleLogout();
            }
            console.error(e);
        }
    };

    useEffect(() => {
        if (isAdmin) loadAdminData();
    }, [statusFilter]);

    const handleApprove = async (threadId) => {
        setSyncingThreads(prev => ({ ...prev, [threadId]: true }));
        try {
            await api(`/admin/threads/${threadId}/approve`, { method: 'POST' });
            loadAdminData();
        } catch (e) {
            showToast('Error: ' + e.message, 'error');
        } finally {
            setSyncingThreads(prev => ({ ...prev, [threadId]: false }));
        }
    };

    const handleReject = async (threadId) => {
        if (!confirm('Reject this submission?')) return;
        try {
            await api(`/admin/threads/${threadId}/reject`, { method: 'POST' });
            loadAdminData();
        } catch (e) {
            showToast('Error: ' + e.message, 'error');
        }
    };

    const handleSync = async (threadId) => {
        try {
            await api(`/admin/threads/${threadId}/sync`, { method: 'POST' });
            loadAdminData();
            showToast('Thread data synced!', 'success');
        } catch (e) {
            loadAdminData();
            if (e.message.includes('auto-deleted')) {
                showToast('Entry deleted - tweet not found in recent tweets', 'success');
            } else {
                showToast('Sync failed: ' + e.message, 'error');
            }
        }
    };

    const handleDelete = async (threadId) => {
        if (!confirm('Are you sure you want to permanently delete this thread entry? This cannot be undone.')) return;
        try {
            await api(`/admin/threads/${threadId}`, { method: 'DELETE' });
            loadAdminData();
            showToast('Thread deleted', 'success');
        } catch (e) {
            showToast('Delete failed: ' + e.message, 'error');
        }
    };

    const handleCreateJudge = async () => {
        if (!newJudge.username || !newJudge.password) {
            showToast('Username and password are required', 'error');
            return;
        }
        try {
            await api('/admin/judges', {
                method: 'POST',
                body: JSON.stringify(newJudge)
            });
            setNewJudge({ username: '', password: '', is_super_admin: false });
            loadAdminData();
            showToast('Judge created successfully!', 'success');
        } catch (e) {
            showToast('Error: ' + e.message, 'error');
        }
    };

    const handleDeleteJudge = async (username) => {
        if (!confirm(`Delete judge "${username}"?`)) return;
        try {
            await api(`/admin/judges/${username}`, { method: 'DELETE' });
            loadAdminData();
        } catch (e) {
            showToast('Error: ' + e.message, 'error');
        }
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const data = await api('/admin/login', {
                method: 'POST',
                body: JSON.stringify(loginForm)
            });
            authToken = data.token;
            localStorage.setItem('authToken', data.token);
            setAdminUser(data.judge);
            setIsAdmin(true);
        } catch (e) {
            setError(e.message);
        }
        setLoading(false);
    };

    const handleLogout = () => {
        authToken = null;
        localStorage.removeItem('authToken');
        setIsAdmin(false);
        setAdminUser(null);
    };

    const handleScore = async (threadId) => {
        const score = scoreForm[threadId];
        if (!score || score < 0 || score > 100) {
            showToast('Please enter a score between 0 and 100', 'error');
            return;
        }

        try {
            await api('/admin/score', {
                method: 'POST',
                body: JSON.stringify({
                    thread_id: threadId,
                    judge_id: adminUser.id,
                    score: parseInt(score)
                })
            });
            loadAdminData();
            setScoreForm({ ...scoreForm, [threadId]: '' });
            showToast('Score submitted successfully!', 'success');
        } catch (e) {
            showToast(e.message, 'error');
        }
    };

    const handleCampaignUpdate = async (e) => {
        e.preventDefault();
        setSavingCampaign(true);
        try {
            await api('/admin/campaign', {
                method: 'POST',
                body: JSON.stringify(campaign)
            });
            showToast('Campaign updated successfully!', 'success');
        } catch (e) {
            showToast('Error: ' + e.message, 'error');
        }
        setSavingCampaign(false);
    };

    const updatePrize = (index, field, value) => {
        const newPrizes = [...campaign.prizes];
        newPrizes[index] = { ...newPrizes[index], [field]: field === 'label' ? value : parseFloat(value) || 0 };
        setCampaign({ ...campaign, prizes: newPrizes });
    };

    if (!isAdmin) {
        return React.createElement('div', { className: 'min-h-screen flex items-center justify-center px-4 pt-20' },
            React.createElement('div', { className: 'glass rounded-2xl p-8 max-w-md w-full' },
                React.createElement('div', { className: 'text-center mb-8' },
                    React.createElement('div', { className: 'text-4xl mb-4' }, '🔐'),
                    React.createElement('h2', { className: 'text-2xl font-bold text-white' }, 'Admin Login'),
                    React.createElement('p', { className: 'text-gray-400 mt-2' }, 'Access judge panel and campaign settings')
                ),
                React.createElement('form', { onSubmit: handleLogin, className: 'space-y-4' },
                    error && React.createElement('div', { className: 'p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-400 text-sm' }, error),
                    React.createElement('input', {
                        type: 'text',
                        placeholder: 'Username',
                        value: loginForm.username,
                        onChange: (e) => setLoginForm({ ...loginForm, username: e.target.value }),
                        className: 'w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-itc-gold'
                    }),
                    React.createElement('input', {
                        type: 'password',
                        placeholder: 'Password',
                        value: loginForm.password,
                        onChange: (e) => setLoginForm({ ...loginForm, password: e.target.value }),
                        className: 'w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-itc-gold'
                    }),
                    React.createElement('button', {
                        type: 'submit',
                        disabled: loading,
                        className: 'w-full py-3 bg-gradient-to-r from-itc-gold to-yellow-600 rounded-xl font-semibold text-black'
                    }, loading ? 'Logging in...' : 'Login'),
                )
            )
        );
    }

    return React.createElement('div', { className: 'min-h-screen pt-16 pb-8 px-3' },
        React.createElement('div', { className: 'max-w-4xl mx-auto' },
            React.createElement('div', { className: 'flex items-center justify-between mb-4 px-1' },
                React.createElement('div', null,
                    React.createElement('h1', { className: 'text-2xl font-bold text-white leading-tight' }, 'Admin Panel'),
                    React.createElement('p', { className: 'text-sm text-gray-400' },
                        `@${adminUser?.username}`,
                        adminUser?.is_super_admin && React.createElement('span', { className: 'ml-2 px-1.5 py-0.5 bg-itc-gold/20 text-itc-gold text-[10px] rounded-full uppercase tracking-wider' }, 'Super')
                    )
                ),
                React.createElement('button', {
                    onClick: handleLogout,
                    className: 'px-3 py-1.5 text-sm text-gray-400 hover:text-white border border-white/10 rounded-lg'
                }, 'Logout')
            ),
            React.createElement('div', { className: 'flex gap-1.5 mb-4 overflow-x-auto pb-1 no-scrollbar' },
                ['threads', 'campaign', adminUser?.is_super_admin ? 'judges' : null].filter(Boolean).map(tab =>
                    React.createElement('button', {
                        key: tab,
                        onClick: () => setActiveTab(tab),
                        className: `px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${activeTab === tab ? 'bg-itc-gold text-black' : 'text-gray-400 bg-white/5'}`
                    }, tab.charAt(0).toUpperCase() + tab.slice(1))
                )
            ),
            activeTab === 'threads' && React.createElement('div', { className: 'space-y-4' },
                React.createElement('div', { className: 'flex gap-2' },
                    ['pending', 'approved', 'rejected'].map(status =>
                        React.createElement('button', {
                            key: status,
                            onClick: () => setStatusFilter(status),
                            className: `px-3 py-1.5 rounded-lg text-xs font-bold uppercase ${statusFilter === status ? (status === 'pending' ? 'bg-yellow-500 text-black' : status === 'approved' ? 'bg-green-500 text-black' : 'bg-red-500 text-white') : 'bg-white/5 text-gray-400'}`
                        }, status)
                    )
                ),
                React.createElement('div', { className: 'glass rounded-xl p-4' },
                    React.createElement('h2', { className: 'text-lg font-bold text-white mb-4' }, 
                        statusFilter === 'pending' ? 'Pending Review' : statusFilter === 'approved' ? 'Approved Threads' : 'Rejected'
                    ),
                    threads.length === 0 ? React.createElement('p', { className: 'text-gray-400 text-center py-4 text-sm' }, `No ${statusFilter} threads`) :
                    React.createElement('div', { className: 'space-y-3' },
                        threads.map(thread => {
                            const isPending = thread.status === 'pending';
                            const hasTweets = thread.tweets && thread.tweets.length > 0;
                            return React.createElement('div', { key: thread.id, className: 'p-3 bg-white/5 rounded-lg border border-white/5' },
                                React.createElement('div', { className: 'flex items-start gap-3' },
                                    isPending ? 
                                        React.createElement('div', { className: 'w-10 h-10 rounded-full bg-yellow-500/20 border-2 border-yellow-500 flex items-center justify-center flex-shrink-0' },
                                            React.createElement('span', { className: 'text-yellow-500 text-lg' }, '?')
                                        ) :
                                        React.createElement('img', { src: thread.author_avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=default', className: 'w-10 h-10 rounded-full flex-shrink-0' }),
                                    React.createElement('div', { className: 'flex-1 min-w-0' },
                                        isPending ?
                                            React.createElement('div', null,
                                                React.createElement('div', { className: 'text-yellow-500 text-xs font-bold uppercase mb-1' }, 'Pending Review'),
                                                React.createElement('a', { 
                                                    href: thread.submission?.thread_url, 
                                                    target: '_blank',
                                                    className: 'text-x-blue text-sm hover:underline break-all'
                                                }, thread.submission?.thread_url),
                                                React.createElement('div', { className: 'text-[10px] text-gray-500 mt-2' },
                                                    `User: @${thread.author_username} | BSC: ${thread.submission?.usdt_bsc_wallet?.slice(0,10)}... | ITC: ${thread.submission?.itc_wallet?.slice(0,12)}...`
                                                )
                                            ) :
                                            React.createElement('div', null,
                                                React.createElement('div', { className: 'flex items-center gap-2' },
                                                    React.createElement('span', { className: 'font-semibold text-white text-sm' }, `@${thread.author_username}`),
                                                    React.createElement('a', { 
                                                        href: thread.submission?.thread_url, 
                                                        target: '_blank',
                                                        className: 'text-x-blue text-xs hover:underline'
                                                    }, 'View on X →')
                                                ),
                                                hasTweets && React.createElement('p', { className: 'text-gray-400 text-xs mt-0.5 line-clamp-2' },
                                                    thread.tweets[0]?.text
                                                ),
                                                React.createElement('div', { className: 'text-[10px] text-gray-500 mt-1' },
                                                    `Engagement: ${thread.total_engagement?.toLocaleString() || 0} | BSC: ${thread.submission?.usdt_bsc_wallet?.slice(0,8)}... | ITC: ${thread.submission?.itc_wallet?.slice(0,10)}...`
                                                )
                                            ),
                                        statusFilter === 'pending' && React.createElement('div', { className: 'mt-3 flex gap-2' },
                                            syncingThreads[thread.id] ? 
                                                React.createElement('div', { className: 'flex items-center gap-2 px-4 py-2 bg-yellow-500/20 border border-yellow-500 rounded-lg' },
                                                    React.createElement('div', { className: 'w-4 h-4 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin' }),
                                                    React.createElement('span', { className: 'text-xs font-bold text-yellow-400' }, 'Syncing from X.com...')
                                                ) :
                                                React.createElement('button', {
                                                    onClick: () => handleApprove(thread.id),
                                                    className: 'px-4 py-2 bg-green-500 rounded-lg text-xs font-bold text-black active:scale-95'
                                                }, 'APPROVE & SYNC'),
                                            !syncingThreads[thread.id] && React.createElement('button', {
                                                onClick: () => handleReject(thread.id),
                                                className: 'px-4 py-2 bg-red-500/20 border border-red-500 rounded-lg text-xs font-bold text-red-400 active:scale-95'
                                            }, 'REJECT'),
                                            !syncingThreads[thread.id] && React.createElement('button', {
                                                onClick: () => handleDelete(thread.id),
                                                className: 'px-4 py-2 bg-red-900/30 border border-red-800 rounded-lg text-xs font-bold text-red-500 active:scale-95'
                                            }, 'DELETE')
                                        ),
                                        statusFilter === 'approved' && React.createElement('div', { className: 'mt-3 flex flex-col gap-2' },
                                            React.createElement('div', { className: 'flex justify-between text-[10px] text-gray-500 uppercase' },
                                                React.createElement('span', null, `Judge: ${thread.judge_average?.toFixed(1) || '0.0'}`),
                                                React.createElement('span', null, `Combined: ${thread.combined_score?.toFixed(1) || '0.0'}`)
                                            ),
                                            React.createElement('div', { className: 'flex gap-2' },
                                                React.createElement('input', {
                                                    type: 'number',
                                                    min: '0',
                                                    max: '100',
                                                    placeholder: '0-100',
                                                    value: scoreForm[thread.id] || '',
                                                    onChange: (e) => setScoreForm({ ...scoreForm, [thread.id]: e.target.value }),
                                                    className: 'flex-1 min-w-0 px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm'
                                                }),
                                                React.createElement('button', {
                                                    onClick: () => handleScore(thread.id),
                                                    className: 'px-4 py-2 bg-itc-gold rounded-lg text-xs font-bold text-black'
                                                }, 'SCORE'),
                                                React.createElement('button', {
                                                    onClick: () => handleSync(thread.id),
                                                    className: 'px-3 py-2 bg-white/10 rounded-lg text-xs text-gray-300'
                                                }, 'SYNC'),
                                                React.createElement('button', {
                                                    onClick: () => handleDelete(thread.id),
                                                    className: 'px-3 py-2 bg-red-900/30 border border-red-800 rounded-lg text-xs text-red-500'
                                                }, 'DEL')
                                            )
                                        )
                                    )
                                )
                            );
                        })
                    )
                )
            ),
            activeTab === 'campaign' && adminUser?.is_super_admin && campaign && React.createElement('form', {
                onSubmit: handleCampaignUpdate,
                className: 'glass rounded-xl p-4 space-y-4'
            },
                React.createElement('h2', { className: 'text-lg font-bold text-white' }, 'Settings'),
                React.createElement('div', { className: 'grid grid-cols-1 gap-4' },
                    React.createElement('div', null,
                        React.createElement('label', { className: 'block text-xs font-medium text-gray-400 mb-1' }, 'Campaign Name'),
                        React.createElement('input', {
                            type: 'text',
                            value: campaign.name,
                            onChange: (e) => setCampaign({ ...campaign, name: e.target.value }),
                            className: 'w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm'
                        })
                    ),
                    React.createElement('div', null,
                        React.createElement('label', { className: 'block text-xs font-medium text-gray-400 mb-1' }, 'Status'),
                        React.createElement('select', {
                            value: campaign.is_active.toString(),
                            onChange: (e) => setCampaign({ ...campaign, is_active: e.target.value === 'true' }),
                            className: 'w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm'
                        },
                            React.createElement('option', { value: 'true' }, 'Active'),
                            React.createElement('option', { value: 'false' }, 'Inactive')
                        )
                    ),
                    React.createElement('div', null,
                        React.createElement('label', { className: 'block text-xs font-medium text-gray-400 mb-1' }, 'Start Date'),
                        React.createElement('input', {
                            type: 'datetime-local',
                            value: campaign.start_date ? campaign.start_date.slice(0, 16) : '',
                            onChange: (e) => setCampaign({ ...campaign, start_date: e.target.value ? new Date(e.target.value).toISOString() : '' }),
                            className: 'w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm'
                        })
                    ),
                    React.createElement('div', null,
                        React.createElement('label', { className: 'block text-xs font-medium text-gray-400 mb-1' }, 'End Date (Countdown Target)'),
                        React.createElement('input', {
                            type: 'datetime-local',
                            value: campaign.end_date ? campaign.end_date.slice(0, 16) : '',
                            onChange: (e) => setCampaign({ ...campaign, end_date: e.target.value ? new Date(e.target.value).toISOString() : '' }),
                            className: 'w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm'
                        })
                    )
                ),
                React.createElement('div', null,
                    React.createElement('label', { className: 'block text-xs font-medium text-gray-400 mb-1' }, 'Prize Distribution'),
                    React.createElement('div', { className: 'space-y-2' },
                        campaign.prizes?.map((prize, i) =>
                            React.createElement('div', { key: i, className: 'flex flex-col gap-1.5 p-2 bg-white/5 rounded-lg' },
                                React.createElement('div', { className: 'flex justify-between items-center' },
                                    React.createElement('span', { className: 'text-xs text-itc-gold font-bold' }, prize.label),
                                    React.createElement('input', {
                                        type: 'text',
                                        value: prize.label,
                                        onChange: (e) => updatePrize(i, 'label', e.target.value),
                                        className: 'hidden'
                                    })
                                ),
                                React.createElement('div', { className: 'flex gap-2' },
                                    React.createElement('div', { className: 'flex-1 flex items-center gap-1.5' },
                                        React.createElement('span', { className: 'text-[10px] text-gray-500' }, 'USDT:'),
                                        React.createElement('input', {
                                            type: 'number',
                                            value: prize.usdt,
                                            onChange: (e) => updatePrize(i, 'usdt', e.target.value),
                                            className: 'w-full px-2 py-1 bg-white/10 border border-white/10 rounded text-white text-xs'
                                        })
                                    ),
                                    React.createElement('div', { className: 'flex-1 flex items-center gap-1.5' },
                                        React.createElement('span', { className: 'text-[10px] text-gray-500' }, '$ITC:'),
                                        React.createElement('input', {
                                            type: 'number',
                                            value: prize.itc,
                                            onChange: (e) => updatePrize(i, 'itc', e.target.value),
                                            className: 'w-full px-2 py-1 bg-white/10 border border-white/10 rounded text-white text-xs'
                                        })
                                    )
                                )
                            )
                        )
                    )
                ),
                React.createElement('button', {
                    type: 'submit',
                    disabled: savingCampaign,
                    className: 'w-full py-2.5 bg-gradient-to-r from-itc-gold to-yellow-600 rounded-lg font-bold text-black text-sm active:scale-95 transition-transform'
                }, savingCampaign ? 'Saving...' : 'SAVE CHANGES')
            ),
            activeTab === 'judges' && adminUser?.is_super_admin && React.createElement('div', { className: 'space-y-4' },
                React.createElement('div', { className: 'glass rounded-xl p-4' },
                    React.createElement('h2', { className: 'text-lg font-bold text-white mb-3' }, 'Add Judge'),
                    React.createElement('div', { className: 'space-y-3' },
                        React.createElement('input', {
                            type: 'text',
                            placeholder: 'Username',
                            value: newJudge.username,
                            onChange: (e) => setNewJudge({ ...newJudge, username: e.target.value }),
                            className: 'w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm'
                        }),
                        React.createElement('input', {
                            type: 'password',
                            placeholder: 'Password',
                            value: newJudge.password,
                            onChange: (e) => setNewJudge({ ...newJudge, password: e.target.value }),
                            className: 'w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm'
                        }),
                        React.createElement('div', { className: 'flex items-center gap-2' },
                            React.createElement('input', {
                                type: 'checkbox',
                                id: 'superadmin',
                                checked: newJudge.is_super_admin,
                                onChange: (e) => setNewJudge({ ...newJudge, is_super_admin: e.target.checked }),
                                className: 'w-4 h-4 rounded'
                            }),
                            React.createElement('label', { htmlFor: 'superadmin', className: 'text-xs text-gray-300' }, 'Super Admin Privileges')
                        ),
                        React.createElement('button', {
                            onClick: handleCreateJudge,
                            className: 'w-full py-2 bg-itc-gold rounded-lg font-bold text-black text-sm active:scale-95'
                        }, 'CREATE JUDGE')
                    )
                ),
                React.createElement('div', { className: 'glass rounded-xl p-4' },
                    React.createElement('h2', { className: 'text-lg font-bold text-white mb-3' }, 'Manage Access'),
                    judges.length === 0 ? React.createElement('p', { className: 'text-gray-400 text-xs text-center py-2' }, 'No other judges') :
                    React.createElement('div', { className: 'space-y-2' },
                        judges.map(judge =>
                            React.createElement('div', { key: judge.id, className: 'flex items-center justify-between p-2.5 bg-white/5 rounded-lg border border-white/5' },
                                React.createElement('div', { className: 'flex flex-col' },
                                    React.createElement('span', { className: 'text-white text-sm font-medium' }, judge.username),
                                    judge.is_super_admin && React.createElement('span', { className: 'text-[9px] text-itc-gold uppercase font-bold' }, 'Super Admin')
                                ),
                                React.createElement('button', {
                                    onClick: () => handleDeleteJudge(judge.username),
                                    className: 'px-3 py-1 text-red-400 text-xs font-bold hover:bg-red-500/10 rounded'
                                }, 'REVOKE')
                            )
                        )
                    )
                )
            )
        )
    );
}

function App() {
    const [currentPage, setCurrentPage] = useState('home');
    const [stats, setStats] = useState(null);
    const [campaign, setCampaign] = useState(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [adminUser, setAdminUser] = useState(null);

    useEffect(() => {
        loadStats();
        checkExistingSession();
        handleHashChange();
        window.addEventListener('hashchange', handleHashChange);
        return () => window.removeEventListener('hashchange', handleHashChange);
    }, []);

    const checkExistingSession = async () => {
        if (authToken) {
            try {
                const data = await api('/admin/verify');
                if (data.valid) {
                    setIsAdmin(true);
                    setAdminUser({
                        id: data.session.judge_id,
                        username: data.session.username,
                        is_super_admin: data.session.is_super_admin
                    });
                }
            } catch (e) {
                localStorage.removeItem('authToken');
                authToken = null;
            }
        }
    };

    const handleHashChange = () => {
        const hash = window.location.hash.slice(1) || 'home';
        setCurrentPage(hash);
    };

    const loadStats = async () => {
        try {
            const data = await api('/stats');
            setStats(data.stats);
            setCampaign(data.campaign);
        } catch (e) {
            console.error(e);
        }
    };

    const navigate = (page) => {
        window.location.hash = page;
        setCurrentPage(page);
    };

    const Footer = () => React.createElement('footer', { className: 'mt-20 py-12 glass border-t border-white/5' },
        React.createElement('div', { className: 'max-w-6xl mx-auto px-4' },
            React.createElement('div', { className: 'flex flex-col md:flex-row justify-between items-center gap-6' },
                React.createElement('div', { className: 'flex items-center gap-3' },
                    React.createElement('img', { 
                        src: '/static/logo.png', 
                        alt: 'Interchained', 
                        className: 'w-10 h-10 rounded-full object-contain'
                    }),
                    React.createElement('span', { className: 'text-xl font-black title-gradient' }, 'INTERCHAINED')
                ),
                React.createElement('div', { className: 'flex items-center gap-4' },
                    React.createElement('a', { href: 'https://x.com/interchained', target: '_blank', className: 'text-gray-400 hover:text-white transition-colors' },
                        React.createElement(XIcon, { className: 'text-xl' })
                    ),
                    React.createElement('a', { href: 'https://t.me/interchained_itc', target: '_blank', className: 'text-gray-400 hover:text-white transition-colors text-xl' }, '✈️'),
                    React.createElement('a', { href: 'https://interchained.org', target: '_blank', className: 'text-gray-400 hover:text-white transition-colors text-sm' }, 'Website')
                ),
                React.createElement('div', { className: 'text-gray-500 text-sm' }, '© 2026 Interchained. All rights reserved.')
            )
        )
    );

    return React.createElement('div', { className: 'min-h-screen relative z-10 flex flex-col' },
        React.createElement(Navbar, { currentPage, setCurrentPage: navigate, isAdmin, setIsAdmin }),
        React.createElement('div', { className: 'flex-1' },
            currentPage === 'home' && React.createElement(React.Fragment, null,
                React.createElement(HeroSection, { stats, campaign, setCurrentPage: navigate }),
                React.createElement(CountdownTimer, { endDate: campaign?.end_date }),
                React.createElement(TopLeaders, { setCurrentPage: navigate })
            ),
            currentPage === 'leaderboard' && React.createElement(Leaderboard, { setCurrentPage: navigate }),
            currentPage === 'submit' && React.createElement(SubmitForm, { setCurrentPage: navigate }),
            currentPage === 'admin' && React.createElement(AdminPanel, { isAdmin, setIsAdmin, adminUser, setAdminUser })
        ),
        React.createElement(Footer)
    );
}

const container = document.getElementById('app');
const root = ReactDOM.createRoot(container);
root.render(React.createElement(App));
