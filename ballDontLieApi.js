// BallDontLie MLB API — proxied through Cloudflare Worker
// Set your worker URL below after deploying worker.js to Cloudflare

const WORKER_URL = 'https://hr-parlay-proxy.caddyshackkidd.workers.dev'; // ← replace this

class BallDontLieAPI {
    constructor() {
        this.workerUrl = WORKER_URL;
        this.cache = {};
        this.cacheTime = 60 * 1000;       // 1-min cache for live data
        this.statsCacheTime = 10 * 60 * 1000; // 10-min cache for season stats
    }

    isConfigured() {
        return this.workerUrl && !this.workerUrl.includes('YOUR-SUBDOMAIN');
    }

    async fetch(path) {
        if (!this.isConfigured()) return null;
        try {
            const res = await fetch(`${this.workerUrl}/bdl${path}`);
            if (!res.ok) return null;
            const json = await res.json();
            return json;
        } catch (e) {
            console.error('BDL proxy error:', e);
            return null;
        }
    }

    async getGamesForDate(dateStr) {
        const cacheKey = `bdl_games_${dateStr}`;
        if (this.isCached(cacheKey, this.cacheTime)) return this.cache[cacheKey].data;

        const json = await this.fetch(`/games?dates[]=${dateStr}&per_page=30`);
        if (!json) return null;

        const games = json.data || [];
        this.setCache(cacheKey, games);
        return games;
    }

    async getSeasonHRLeaders(season = 2025) {
        const cacheKey = `bdl_hr_leaders_${season}`;
        if (this.isCached(cacheKey, this.statsCacheTime)) return this.cache[cacheKey].data;

        const json = await this.fetch(`/stats?season=${season}&per_page=100`);
        if (!json) return null;

        const leaders = (json.data || [])
            .filter(s => (s.home_runs || 0) >= 3)
            .sort((a, b) => (b.home_runs || 0) - (a.home_runs || 0));

        this.setCache(cacheKey, leaders);
        return leaders;
    }

    async getTeamSeasonStats(teamId, season = 2025) {
        const cacheKey = `bdl_team_stats_${teamId}_${season}`;
        if (this.isCached(cacheKey, this.statsCacheTime)) return this.cache[cacheKey].data;

        const json = await this.fetch(`/stats?season=${season}&team_ids[]=${teamId}&per_page=50`);
        if (!json) return null;

        this.setCache(cacheKey, json.data || []);
        return json.data || [];
    }

    findLiveGame(bdlGames, homeTeamName, awayTeamName) {
        if (!bdlGames || bdlGames.length === 0) return null;
        const homeLast = homeTeamName.split(' ').pop().toLowerCase();
        const awayLast = awayTeamName.split(' ').pop().toLowerCase();
        return bdlGames.find(g => {
            const h = (g.home_team?.name || '').toLowerCase();
            const a = (g.visitor_team?.name || '').toLowerCase();
            return h.includes(homeLast) && a.includes(awayLast);
        }) || null;
    }

    formatGameStatus(bdlGame) {
        if (!bdlGame) return null;
        const status = bdlGame.status || '';
        const homeScore = bdlGame.home_team_score;
        const awayScore = bdlGame.visitor_team_score;

        if (status === 'Final' || status === 'F') {
            return { type: 'final', label: 'FINAL', score: `${awayScore} - ${homeScore}`, class: 'status-final' };
        }
        if (status.includes('In Progress') || /^\d+$/.test(status)) {
            const inning = bdlGame.inning || status;
            const half = bdlGame.inning_half === 'top' ? '▲' : '▼';
            return { type: 'live', label: `${half} ${inning}`, score: `${awayScore} - ${homeScore}`, class: 'status-live' };
        }

        const gameTime = bdlGame.time
            ? new Date(bdlGame.date + 'T' + bdlGame.time).toLocaleTimeString('en-US', {
                hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
              })
            : null;
        return { type: 'pregame', label: gameTime || 'Upcoming', class: 'status-pregame' };
    }

    enrichPlayerStats(mockPlayer, bdlStats) {
        if (!bdlStats) return mockPlayer;
        const match = bdlStats.find(s => {
            const bdlName = `${s.player?.first_name || ''} ${s.player?.last_name || ''}`.toLowerCase().trim();
            const mockName = (mockPlayer.name || '').toLowerCase().trim();
            return mockName.split(' ').pop() === bdlName.split(' ').pop();
        });
        if (!match) return mockPlayer;
        return {
            ...mockPlayer,
            seasonHRs: match.home_runs || mockPlayer.seasonHRs,
            avg: match.batting_average ? `.${String(Math.round(match.batting_average * 1000)).padStart(3, '0')}` : mockPlayer.avg,
            obp: match.on_base_percentage || null,
            slg: match.slugging_percentage || null,
            ops: match.on_base_plus_slugging || null,
            abs: match.at_bats || null,
            realStats: true,
            bdlPlayerId: match.player?.id
        };
    }

    isCached(key, maxAge) {
        return this.cache[key] && (Date.now() - this.cache[key].time < maxAge);
    }

    setCache(key, data) {
        this.cache[key] = { data, time: Date.now() };
    }
}

const bdlApi = new BallDontLieAPI();
