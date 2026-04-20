// Odds API Integration — proxied through Cloudflare Worker
// Set your worker URL below after deploying worker.js to Cloudflare

const WORKER_URL = 'https://hr-parlay-proxy.caddyshackkidd.workers.dev'; // ← replace this

class OddsAPI {
    constructor() {
        this.workerUrl = WORKER_URL;
        this.cache = {};
        this.cacheTime = 5 * 60 * 1000; // 5-min cache
        this.remainingRequests = localStorage.getItem('oddsApiRemaining') || '?';

        this.bookNames = {
            fanduel:        'FanDuel',
            draftkings:     'DraftKings',
            betmgm:         'BetMGM',
            caesars:        'Caesars',
            pointsbetus:    'PointsBet',
            betrivers:      'BetRivers',
            unibet_us:      'Unibet',
            wynnbet:        'WynnBet',
            bovada:         'Bovada',
            betus:          'BetUS',
            superbook:      'SuperBook',
            betonlineag:    'BetOnline',
            mybookieag:     'MyBookie',
        };
    }

    isConfigured() {
        return this.workerUrl && !this.workerUrl.includes('YOUR-SUBDOMAIN');
    }

    async getMLBGameOdds() {
        if (!this.isConfigured()) return null;

        const cacheKey = 'mlb_odds_h2h';
        if (this.isCached(cacheKey)) return this.cache[cacheKey].data;

        try {
            const response = await fetch(`${this.workerUrl}/odds`);

            if (!response.ok) {
                console.warn('Odds proxy error:', response.status);
                return null;
            }

            const remaining = response.headers.get('x-requests-remaining');
            if (remaining) {
                this.remainingRequests = remaining;
                localStorage.setItem('oddsApiRemaining', remaining);
            }

            const data = await response.json();
            this.setCache(cacheKey, data);
            return data;
        } catch (error) {
            console.error('Odds API fetch error:', error);
            return null;
        }
    }

    findGameOdds(allOdds, homeTeamName, awayTeamName) {
        if (!allOdds || allOdds.length === 0) return null;
        const homeLast = homeTeamName.split(' ').pop().toLowerCase();
        const awayLast = awayTeamName.split(' ').pop().toLowerCase();
        return allOdds.find(game => {
            const h = (game.home_team || '').toLowerCase();
            const a = (game.away_team || '').toLowerCase();
            return h.includes(homeLast) && a.includes(awayLast);
        }) || null;
    }

    extractAllBookOdds(game) {
        if (!game?.bookmakers?.length) return null;

        const homeTeam = game.home_team;
        const awayTeam = game.away_team;

        let bestHomeML = null, bestAwayML = null, bestHomeBook = '', bestAwayBook = '';
        let totalLine = null;
        const allBooks = [];

        game.bookmakers.forEach(bm => {
            let homeML = null, awayML = null;

            bm.markets?.forEach(market => {
                if (market.key === 'h2h') {
                    market.outcomes?.forEach(o => {
                        if (o.name === homeTeam) homeML = o.price;
                        if (o.name === awayTeam) awayML = o.price;
                    });
                }
                if (market.key === 'totals' && totalLine === null) {
                    const over = market.outcomes?.find(o => o.name === 'Over');
                    if (over) totalLine = over.point;
                }
            });

            if (homeML !== null || awayML !== null) {
                const displayName = this.bookNames[bm.key] || bm.title;
                allBooks.push({ key: bm.key, name: displayName, homeML, awayML });

                if (homeML !== null && (bestHomeML === null || homeML > bestHomeML)) {
                    bestHomeML = homeML;
                    bestHomeBook = displayName;
                }
                if (awayML !== null && (bestAwayML === null || awayML > bestAwayML)) {
                    bestAwayML = awayML;
                    bestAwayBook = displayName;
                }
            }
        });

        allBooks.sort((a, b) => (b.homeML || -999) - (a.homeML || -999));

        return {
            homeML: bestHomeML,
            awayML: bestAwayML,
            bestHomeBook,
            bestAwayBook,
            totalLine,
            allBooks,
            bookCount: allBooks.length
        };
    }

    estimateOdds(homeTeam, awayTeam, parkFactor, homePitcherERA, awayPitcherERA) {
        const homeERA = typeof homePitcherERA === 'number' ? homePitcherERA : 4.2;
        const awayERA = typeof awayPitcherERA === 'number' ? awayPitcherERA : 4.2;

        const pitcherAdj = (awayERA - homeERA) * 8;
        const parkAdj = (parkFactor - 100) * 0.3;

        let homeML = Math.round((-120 + pitcherAdj + parkAdj) / 5) * 5;
        homeML = Math.max(-250, Math.min(130, homeML));

        let awayML = homeML < 0
            ? Math.round((-homeML * 0.85) / 5) * 5
            : Math.round((-homeML * 1.15) / 5) * 5;
        awayML = Math.max(-200, Math.min(200, awayML));

        const estimatedTotal = 8.5 + (parkFactor - 100) * 0.018;
        const totalLine = Math.round(estimatedTotal * 2) / 2;

        return {
            homeML, awayML,
            bestHomeBook: 'Est.', bestAwayBook: 'Est.',
            totalLine, allBooks: [], bookCount: 0, estimated: true
        };
    }

    formatML(ml) {
        if (ml === null || ml === undefined) return 'N/A';
        return ml > 0 ? `+${ml}` : `${ml}`;
    }

    getMLClass(ml) {
        if (ml === null || ml === undefined) return '';
        return ml <= -140 ? 'heavy-fav' : ml < 0 ? 'favorite' : ml <= 120 ? 'slight-dog' : 'underdog';
    }

    isCached(key) {
        return this.cache[key] && (Date.now() - this.cache[key].time < this.cacheTime);
    }

    setCache(key, data) {
        this.cache[key] = { data, time: Date.now() };
    }
}

const oddsApi = new OddsAPI();
