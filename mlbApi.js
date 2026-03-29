// MLB Stats API Integration - Enhanced Version
// Free API: https://statsapi.mlb.com/

class MLBApi {
    constructor() {
        this.baseUrl = 'https://statsapi.mlb.com/api/v1';
        this.scheduleUrl = 'https://statsapi.mlb.com/api/v1/schedule';
    }

    // Get games for a specific date (used by date picker)
    async getGamesForDate(dateStr) {
        try {
            console.log(`Fetching games for ${dateStr}...`);
            const url = `${this.scheduleUrl}?sportId=1&date=${dateStr}&hydrate=team,linescore,probablePitcher(stats(type=season))`;
            const response = await fetch(url);
            const data = await response.json();
            
            if (data.dates && data.dates.length > 0 && data.dates[0].games.length > 0) {
                console.log(`Found ${data.dates[0].games.length} games on ${dateStr}`);
                return data.dates[0].games;
            }
            
            console.log(`No games found on ${dateStr}`);
            return [];
        } catch (error) {
            console.error(`Error fetching games for ${dateStr}:`, error);
            return [];
        }
    }

    // Get today's games OR next available games
    async getTodaysGames() {
        try {
            // Try to find games in the next 14 days
            const games = await this.findNextGames(14);
            
            if (games && games.length > 0) {
                return games;
            }
            
            // If no games in next 14 days, use demo data
            console.log('No games found in next 14 days, using demo data');
            return this.getMockGames();
        } catch (error) {
            console.error('Error fetching games:', error);
            return this.getMockGames();
        }
    }

    // Find next available game day within X days
    async findNextGames(daysToCheck = 14) {
        for (let i = 0; i < daysToCheck; i++) {
            const checkDate = new Date();
            checkDate.setDate(checkDate.getDate() + i);
            const dateStr = checkDate.toISOString().split('T')[0];
            
            console.log(`Checking for games on ${dateStr}...`);
            
            try {
                const url = `${this.scheduleUrl}?sportId=1&date=${dateStr}&hydrate=team,linescore,probablePitcher(stats(type=season))`;
                const response = await fetch(url);
                const data = await response.json();
                
                if (data.dates && data.dates.length > 0 && data.dates[0].games.length > 0) {
                    console.log(`Found ${data.dates[0].games.length} games on ${dateStr}`);
                    return data.dates[0].games;
                }
            } catch (error) {
                console.error(`Error checking ${dateStr}:`, error);
            }
        }
        
        return null;
    }

    // Mock data for testing/demo purposes
    getMockGames() {
        return [
            {
                gamePk: 1,
                gameDate: new Date().toISOString(),
                teams: {
                    away: {
                        team: { id: 109, name: 'Arizona Diamondbacks', abbreviation: 'ARI' },
                        score: 0,
                        probablePitcher: { fullName: 'Tommy Jones', stats: [{ homeRunsPer9: 1.8, era: 4.85 }], pitchHand: { code: 'R' } }
                    },
                    home: {
                        team: { id: 113, name: 'Cincinnati Reds', abbreviation: 'CIN' },
                        score: 0,
                        probablePitcher: { fullName: 'Cody Abbott', stats: [{ homeRunsPer9: 2.1, era: 5.12 }], pitchHand: { code: 'L' } }
                    }
                },
                venue: { name: 'Great American Ball Park' },
                status: { detailedState: 'Preview' }
            },
            {
                gamePk: 2,
                gameDate: new Date().toISOString(),
                teams: {
                    away: {
                        team: { id: 137, name: 'San Francisco Giants', abbreviation: 'SF' },
                        score: 0,
                        probablePitcher: { fullName: 'Gerrit Cole', stats: [{ homeRunsPer9: 0.9, era: 3.15 }], pitchHand: { code: 'R' } }
                    },
                    home: {
                        team: { id: 147, name: 'New York Yankees', abbreviation: 'NYY' },
                        score: 0,
                        probablePitcher: { fullName: 'Kyle Harrison', stats: [{ homeRunsPer9: 1.6, era: 4.25 }], pitchHand: { code: 'L' } }
                    }
                },
                venue: { name: 'Yankee Stadium' },
                status: { detailedState: 'Preview' }
            },
            {
                gamePk: 3,
                gameDate: new Date().toISOString(),
                teams: {
                    away: {
                        team: { id: 110, name: 'Baltimore Orioles', abbreviation: 'BAL' },
                        score: 0,
                        probablePitcher: { fullName: 'Dean Kremer', stats: [{ homeRunsPer9: 1.3, era: 4.10 }], pitchHand: { code: 'R' } }
                    },
                    home: {
                        team: { id: 108, name: 'Los Angeles Angels', abbreviation: 'LAA' },
                        score: 0,
                        probablePitcher: { fullName: 'Patrick Sandoval', stats: [{ homeRunsPer9: 1.4, era: 3.95 }], pitchHand: { code: 'L' } }
                    }
                },
                venue: { name: 'Angel Stadium' },
                status: { detailedState: 'Preview' }
            }
        ];
    }

    // Mock top HR hitters for demo with enhanced pitcher data
    // Fetch real team hitters from MLB Stats API (free, no key)
    async getRealTeamHitters(teamId, teamAbbr, opposingPitcher) {
        if (!this._cache) this._cache = {};
        const cacheKey = `hitters_${teamId}`;
        const cached = this._cache[cacheKey];
        if (cached && Date.now() - cached.time < 10 * 60 * 1000) {
            return this.applyPitcherMatchup(cached.data, opposingPitcher);
        }

        // Try two endpoint formats
        const season = 2025;
        const endpoints = [
            `${this.baseUrl}/teams/${teamId}/stats?stats=season&group=hitting&season=${season}`,
            `${this.baseUrl}/stats?stats=season&group=hitting&season=${season}&sportId=1&teamId=${teamId}&limit=30`
        ];

        for (const url of endpoints) {
            try {
                const res = await fetch(url);
                if (!res.ok) continue;
                const data = await res.json();
                const splits = data?.stats?.[0]?.splits || [];

                const hitters = splits
                    .filter(s => (s.stat?.atBats || 0) >= 50 && s.player?.fullName)
                    .sort((a, b) => (b.stat?.homeRuns || 0) - (a.stat?.homeRuns || 0))
                    .slice(0, 8)
                    .map(s => ({
                        id: s.player.id,
                        name: s.player.fullName,
                        seasonHRs: s.stat.homeRuns || 0,
                        doubles: s.stat.doubles || 0,
                        triples: s.stat.triples || 0,
                        xbh: (s.stat.doubles || 0) + (s.stat.triples || 0) + (s.stat.homeRuns || 0),
                        last7HRs: 0,
                        avg: s.stat.avg ? s.stat.avg.replace(/^0/, '') : '.000',
                        hand: s.player.batSide?.code || 'R',
                        atBats: s.stat.atBats || 0,
                        gamesPlayed: s.stat.gamesPlayed || 0,
                        obp: s.stat.obp ? s.stat.obp.replace(/^0/, '') : null,
                        slg: s.stat.slg ? s.stat.slg.replace(/^0/, '') : null,
                        ops: s.stat.ops ? s.stat.ops.replace(/^0/, '') : null,
                    }));

                if (hitters.length > 0) {
                    this._cache[cacheKey] = { data: hitters, time: Date.now() };
                    return this.applyPitcherMatchup(hitters, opposingPitcher);
                }
            } catch (err) {
                continue;
            }
        }

        // Both endpoints failed — fall back to mock
        console.warn(`Using mock hitters for ${teamAbbr} (API unavailable or offseason)`);
        return this.getMockTopHitters(teamAbbr, opposingPitcher);
    }

    applyPitcherMatchup(hitters, opposingPitcher) {
        if (!opposingPitcher) return hitters;
        return hitters.map(h => ({
            ...h,
            pitcher: {
                name: opposingPitcher.fullName,
                hr9: opposingPitcher.stats?.[0]?.homeRunsPer9 || 1.2,
                era: opposingPitcher.stats?.[0]?.era || 4.00,
                hand: opposingPitcher.pitchHand?.code || 'R',
                vsHandAdvantage: this.hasHandednessAdvantage(h.hand, opposingPitcher.pitchHand?.code || 'R')
            }
        }));
    }

    getMockTopHitters(teamAbbr, opposingPitcher) {
        // 2025 season reference stats — all 30 teams (fallback only when API unavailable)
        const hitters = {
            'ARI': [
                { id: 4,   name: 'Corbin Carroll',        seasonHRs: 22, last7HRs: 1, avg: '.254', hand: 'L' },
                { id: 6,   name: 'Christian Walker',       seasonHRs: 33, last7HRs: 4, avg: '.251', hand: 'R' },
                { id: 5,   name: 'Ketel Marte',            seasonHRs: 26, last7HRs: 2, avg: '.280', hand: 'S' }
            ],
            'ATL': [
                { id: 20,  name: 'Ronald Acuna Jr.',       seasonHRs: 29, last7HRs: 2, avg: '.295', hand: 'R' },
                { id: 21,  name: 'Marcell Ozuna',          seasonHRs: 35, last7HRs: 3, avg: '.262', hand: 'R' },
                { id: 22,  name: 'Matt Olson',             seasonHRs: 38, last7HRs: 2, avg: '.241', hand: 'L' }
            ],
            'BAL': [
                { id: 13,  name: 'Gunnar Henderson',       seasonHRs: 37, last7HRs: 2, avg: '.281', hand: 'L' },
                { id: 14,  name: 'Adley Rutschman',        seasonHRs: 19, last7HRs: 1, avg: '.250', hand: 'S' },
                { id: 15,  name: 'Ryan Mountcastle',       seasonHRs: 23, last7HRs: 1, avg: '.261', hand: 'R' }
            ],
            'BOS': [
                { id: 30,  name: 'Rafael Devers',          seasonHRs: 32, last7HRs: 2, avg: '.271', hand: 'L' },
                { id: 31,  name: 'Triston Casas',          seasonHRs: 21, last7HRs: 1, avg: '.242', hand: 'L' },
                { id: 32,  name: 'Wilyer Abreu',           seasonHRs: 16, last7HRs: 1, avg: '.255', hand: 'R' }
            ],
            'CHC': [
                { id: 40,  name: 'Ian Happ',               seasonHRs: 22, last7HRs: 1, avg: '.248', hand: 'S' },
                { id: 41,  name: 'Seiya Suzuki',           seasonHRs: 21, last7HRs: 2, avg: '.268', hand: 'R' },
                { id: 42,  name: 'Nico Hoerner',           seasonHRs: 8,  last7HRs: 0, avg: '.277', hand: 'R' }
            ],
            'CWS': [
                { id: 50,  name: 'Andrew Vaughn',          seasonHRs: 18, last7HRs: 1, avg: '.249', hand: 'R' },
                { id: 51,  name: 'Gavin Sheets',           seasonHRs: 14, last7HRs: 1, avg: '.237', hand: 'L' },
                { id: 52,  name: 'Miguel Vargas',          seasonHRs: 11, last7HRs: 0, avg: '.241', hand: 'R' }
            ],
            'CIN': [
                { id: 1,   name: 'Elly De La Cruz',        seasonHRs: 25, last7HRs: 3, avg: '.265', hand: 'S' },
                { id: 3,   name: 'Spencer Steer',          seasonHRs: 20, last7HRs: 2, avg: '.248', hand: 'R' },
                { id: 2,   name: 'Tyler Stephenson',       seasonHRs: 19, last7HRs: 1, avg: '.272', hand: 'R' }
            ],
            'CLE': [
                { id: 60,  name: 'Jose Ramirez',           seasonHRs: 33, last7HRs: 3, avg: '.282', hand: 'S' },
                { id: 61,  name: 'Josh Naylor',            seasonHRs: 24, last7HRs: 2, avg: '.258', hand: 'L' },
                { id: 62,  name: 'David Fry',              seasonHRs: 17, last7HRs: 1, avg: '.241', hand: 'S' }
            ],
            'COL': [
                { id: 70,  name: 'Kris Bryant',            seasonHRs: 14, last7HRs: 1, avg: '.245', hand: 'R' },
                { id: 71,  name: 'Ezequiel Tovar',         seasonHRs: 20, last7HRs: 1, avg: '.253', hand: 'R' },
                { id: 72,  name: 'Ryan McMahon',           seasonHRs: 18, last7HRs: 1, avg: '.238', hand: 'L' }
            ],
            'DET': [
                { id: 80,  name: 'Riley Greene',           seasonHRs: 24, last7HRs: 2, avg: '.261', hand: 'L' },
                { id: 81,  name: 'Spencer Torkelson',      seasonHRs: 22, last7HRs: 1, avg: '.238', hand: 'R' },
                { id: 82,  name: 'Kerry Carpenter',        seasonHRs: 19, last7HRs: 2, avg: '.255', hand: 'L' }
            ],
            'HOU': [
                { id: 90,  name: 'Yordan Alvarez',         seasonHRs: 39, last7HRs: 3, avg: '.305', hand: 'L' },
                { id: 91,  name: 'Alex Bregman',           seasonHRs: 22, last7HRs: 1, avg: '.262', hand: 'R' },
                { id: 92,  name: 'Kyle Tucker',            seasonHRs: 29, last7HRs: 2, avg: '.278', hand: 'L' }
            ],
            'KC':  [
                { id: 100, name: 'Salvador Perez',         seasonHRs: 21, last7HRs: 1, avg: '.254', hand: 'R' },
                { id: 101, name: 'Vinnie Pasquantino',     seasonHRs: 19, last7HRs: 1, avg: '.267', hand: 'L' },
                { id: 102, name: 'Bobby Witt Jr.',         seasonHRs: 28, last7HRs: 2, avg: '.295', hand: 'R' }
            ],
            'LAA': [
                { id: 16,  name: 'Taylor Ward',            seasonHRs: 25, last7HRs: 2, avg: '.246', hand: 'R' },
                { id: 17,  name: 'Logan O\'Hoppe',         seasonHRs: 20, last7HRs: 1, avg: '.244', hand: 'R' },
                { id: 18,  name: 'Mike Trout',             seasonHRs: 10, last7HRs: 1, avg: '.269', hand: 'R' }
            ],
            'LAD': [
                { id: 110, name: 'Shohei Ohtani',          seasonHRs: 44, last7HRs: 4, avg: '.310', hand: 'L' },
                { id: 111, name: 'Freddie Freeman',        seasonHRs: 26, last7HRs: 2, avg: '.298', hand: 'L' },
                { id: 112, name: 'Teoscar Hernandez',      seasonHRs: 33, last7HRs: 3, avg: '.272', hand: 'R' }
            ],
            'MIA': [
                { id: 120, name: 'Jake Burger',            seasonHRs: 28, last7HRs: 2, avg: '.243', hand: 'R' },
                { id: 121, name: 'Jesus Sanchez',          seasonHRs: 20, last7HRs: 1, avg: '.255', hand: 'R' },
                { id: 122, name: 'Nick Fortes',            seasonHRs: 14, last7HRs: 1, avg: '.238', hand: 'R' }
            ],
            'MIL': [
                { id: 130, name: 'William Contreras',      seasonHRs: 22, last7HRs: 2, avg: '.268', hand: 'R' },
                { id: 131, name: 'Christian Yelich',       seasonHRs: 19, last7HRs: 1, avg: '.274', hand: 'L' },
                { id: 132, name: 'Sal Frelick',            seasonHRs: 10, last7HRs: 0, avg: '.271', hand: 'L' }
            ],
            'MIN': [
                { id: 140, name: 'Carlos Correa',          seasonHRs: 20, last7HRs: 1, avg: '.262', hand: 'R' },
                { id: 141, name: 'Byron Buxton',           seasonHRs: 26, last7HRs: 2, avg: '.254', hand: 'R' },
                { id: 142, name: 'Ryan Jeffers',           seasonHRs: 24, last7HRs: 2, avg: '.246', hand: 'R' }
            ],
            'NYM': [
                { id: 150, name: 'Pete Alonso',            seasonHRs: 34, last7HRs: 3, avg: '.257', hand: 'R' },
                { id: 151, name: 'Francisco Lindor',       seasonHRs: 26, last7HRs: 2, avg: '.275', hand: 'S' },
                { id: 152, name: 'Brandon Nimmo',          seasonHRs: 17, last7HRs: 1, avg: '.258', hand: 'L' }
            ],
            'NYY': [
                { id: 7,   name: 'Aaron Judge',            seasonHRs: 58, last7HRs: 4, avg: '.322', hand: 'R' },
                { id: 8,   name: 'Giancarlo Stanton',      seasonHRs: 27, last7HRs: 2, avg: '.245', hand: 'R' },
                { id: 9,   name: 'Jazz Chisholm Jr.',      seasonHRs: 24, last7HRs: 2, avg: '.256', hand: 'L' }
            ],
            'OAK': [
                { id: 160, name: 'Brent Rooker',           seasonHRs: 30, last7HRs: 2, avg: '.253', hand: 'R' },
                { id: 161, name: 'Lawrence Butler',        seasonHRs: 22, last7HRs: 2, avg: '.241', hand: 'L' },
                { id: 162, name: 'JJ Bleday',              seasonHRs: 16, last7HRs: 1, avg: '.238', hand: 'L' }
            ],
            'PHI': [
                { id: 170, name: 'Bryce Harper',           seasonHRs: 30, last7HRs: 2, avg: '.291', hand: 'L' },
                { id: 171, name: 'Kyle Schwarber',         seasonHRs: 38, last7HRs: 3, avg: '.248', hand: 'L' },
                { id: 172, name: 'Trea Turner',            seasonHRs: 21, last7HRs: 2, avg: '.277', hand: 'R' }
            ],
            'PIT': [
                { id: 180, name: 'Oneil Cruz',             seasonHRs: 21, last7HRs: 2, avg: '.252', hand: 'L' },
                { id: 181, name: 'Henry Davis',            seasonHRs: 16, last7HRs: 1, avg: '.238', hand: 'R' },
                { id: 182, name: 'Bryan Reynolds',         seasonHRs: 21, last7HRs: 1, avg: '.262', hand: 'S' }
            ],
            'SD':  [
                { id: 190, name: 'Manny Machado',          seasonHRs: 26, last7HRs: 2, avg: '.268', hand: 'R' },
                { id: 191, name: 'Fernando Tatis Jr.',     seasonHRs: 31, last7HRs: 3, avg: '.278', hand: 'R' },
                { id: 192, name: 'Jurickson Profar',       seasonHRs: 24, last7HRs: 2, avg: '.280', hand: 'S' }
            ],
            'SEA': [
                { id: 200, name: 'Cal Raleigh',            seasonHRs: 38, last7HRs: 3, avg: '.231', hand: 'S' },
                { id: 201, name: 'Julio Rodriguez',        seasonHRs: 28, last7HRs: 2, avg: '.272', hand: 'R' },
                { id: 202, name: 'Ty France',              seasonHRs: 14, last7HRs: 1, avg: '.255', hand: 'R' }
            ],
            'SF':  [
                { id: 10,  name: 'Matt Chapman',           seasonHRs: 24, last7HRs: 2, avg: '.247', hand: 'R' },
                { id: 11,  name: 'Heliot Ramos',           seasonHRs: 22, last7HRs: 1, avg: '.269', hand: 'R' },
                { id: 12,  name: 'Tyler Fitzgerald',       seasonHRs: 15, last7HRs: 1, avg: '.229', hand: 'R' }
            ],
            'STL': [
                { id: 210, name: 'Nolan Arenado',          seasonHRs: 27, last7HRs: 2, avg: '.265', hand: 'R' },
                { id: 211, name: 'Paul Goldschmidt',       seasonHRs: 22, last7HRs: 1, avg: '.260', hand: 'R' },
                { id: 212, name: 'Lars Nootbaar',          seasonHRs: 17, last7HRs: 1, avg: '.258', hand: 'L' }
            ],
            'TB':  [
                { id: 220, name: 'Yandy Diaz',             seasonHRs: 12, last7HRs: 1, avg: '.271', hand: 'R' },
                { id: 221, name: 'Harold Ramirez',         seasonHRs: 14, last7HRs: 1, avg: '.258', hand: 'R' },
                { id: 222, name: 'Josh Lowe',              seasonHRs: 16, last7HRs: 1, avg: '.247', hand: 'L' }
            ],
            'TEX': [
                { id: 230, name: 'Corey Seager',           seasonHRs: 27, last7HRs: 2, avg: '.279', hand: 'L' },
                { id: 231, name: 'Marcus Semien',          seasonHRs: 23, last7HRs: 1, avg: '.256', hand: 'R' },
                { id: 232, name: 'Jonah Heim',             seasonHRs: 18, last7HRs: 1, avg: '.244', hand: 'S' }
            ],
            'TOR': [
                { id: 240, name: 'Vladimir Guerrero Jr.',  seasonHRs: 26, last7HRs: 2, avg: '.274', hand: 'R' },
                { id: 241, name: 'George Springer',        seasonHRs: 22, last7HRs: 2, avg: '.249', hand: 'R' },
                { id: 242, name: 'Daulton Varsho',         seasonHRs: 18, last7HRs: 1, avg: '.244', hand: 'L' }
            ],
            'WSH': [
                { id: 250, name: 'CJ Abrams',              seasonHRs: 18, last7HRs: 1, avg: '.265', hand: 'L' },
                { id: 251, name: 'Joey Meneses',           seasonHRs: 19, last7HRs: 1, avg: '.261', hand: 'R' },
                { id: 252, name: 'Lane Thomas',            seasonHRs: 21, last7HRs: 2, avg: '.252', hand: 'R' }
            ]
        };

        const teamHitters = hitters[teamAbbr] || hitters['NYY']; // NYY as ultimate fallback (never empty)

        return this.applyPitcherMatchup(teamHitters, opposingPitcher);
    }

    // Determine handedness advantage
    hasHandednessAdvantage(batterHand, pitcherHand) {
        // Opposite hands = advantage
        if (batterHand === 'S') return true; // Switch hitters have advantage
        if (batterHand === 'L' && pitcherHand === 'R') return true;
        if (batterHand === 'R' && pitcherHand === 'L') return true;
        return false;
    }

    // Fetch detailed pitcher stats from MLB Stats API (free, no key)
    // ── ADVANCED / STATCAST STATS ──────────────────────────────────────────────

    // Fetch Baseball Savant leaderboard via Worker proxy — cached 1 hour
    async getSavantLeaderboard(year = 2025) {
        if (!this._cache) this._cache = {};
        const cacheKey = `savant_${year}`;
        const cached = this._cache[cacheKey];
        if (cached && Date.now() - cached.time < 60 * 60 * 1000) return cached.data;

        // Requires WORKER_URL to be set (same as oddsApi / bdlApi)
        const workerUrl = (typeof oddsApi !== 'undefined' && oddsApi.workerUrl)
            ? oddsApi.workerUrl
            : null;

        if (!workerUrl || workerUrl.includes('YOUR-SUBDOMAIN')) return null;

        try {
            const res = await fetch(`${workerUrl}/savant?year=${year}`);
            if (!res.ok) return null;
            const data = await res.json();
            if (!Array.isArray(data)) return null;
            this._cache[cacheKey] = { data, time: Date.now() };
            return data;
        } catch (e) {
            console.warn('Savant fetch failed:', e.message);
            return null;
        }
    }

    // Get advanced stats for a single player by their MLB ID
    async getAdvancedStats(playerId, year = 2025) {
        if (!playerId) return null;
        const leaders = await this.getSavantLeaderboard(year);
        if (!leaders) return null;
        const match = leaders.find(p => String(p.player_id) === String(playerId));
        if (!match) return null;

        // Parse floats, round nicely
        const pct  = v => { const n = parseFloat(v); return isNaN(n) ? null : Math.round(n * 10) / 10; };
        const dec  = v => { const n = parseFloat(v); return isNaN(n) ? null : Math.round(n * 1000) / 1000; };
        const mph  = v => { const n = parseFloat(v); return isNaN(n) ? null : Math.round(n * 10) / 10; };

        return {
            xba:           dec(match.xba),
            xslg:          dec(match.xslg),
            barrelRate:    pct(match.barrel_rate),
            hardHitPct:    pct(match.hard_hit_pct),
            exitVelo:      mph(match.exit_velo),
            launchAngle:   pct(match.launch_angle),
            sweetSpotPct:  pct(match.sweet_spot_pct),
            kPct:          pct(match.k_pct),
            bbPct:         pct(match.bb_pct),
            ozSwingPct:    pct(match.oz_swing_pct),    // chase rate
            zSwingPct:     pct(match.z_swing_pct),     // in-zone contact aggression
            fStrikePct:    pct(match.f_strike_pct),    // first pitch strike %
            pa:            parseInt(match.pa) || null,
        };
    }

    async getEnhancedPitcherStats(pitcherId) {
        if (!pitcherId) return null;

        const cacheKey = `pitcher_${pitcherId}`;
        if (this._cache && this._cache[cacheKey]) {
            const cached = this._cache[cacheKey];
            if (Date.now() - cached.time < 10 * 60 * 1000) return cached.data; // 10-min cache
        }

        try {
            // Fetch season stats + last 5 game logs
            const [seasonRes, logRes] = await Promise.all([
                fetch(`${this.baseUrl}/people/${pitcherId}/stats?stats=season&group=pitching&season=2025`),
                fetch(`${this.baseUrl}/people/${pitcherId}/stats?stats=gameLog&group=pitching&season=2025&limit=5`)
            ]);

            let seasonStats = null;
            let gameLogs = [];

            if (seasonRes.ok) {
                const sd = await seasonRes.json();
                const splits = sd.stats?.[0]?.splits;
                if (splits && splits.length > 0) {
                    seasonStats = splits[0].stat;
                }
            }

            if (logRes.ok) {
                const ld = await logRes.json();
                const splits = ld.stats?.[0]?.splits;
                if (splits) {
                    gameLogs = splits.slice(0, 5).map(s => ({
                        date: s.date,
                        homeRuns: s.stat?.homeRuns || 0,
                        inningsPitched: parseFloat(s.stat?.inningsPitched || '0'),
                        strikeOuts: s.stat?.strikeOuts || 0,
                        earnedRuns: s.stat?.earnedRuns || 0,
                        opponent: s.opponent?.name || ''
                    }));
                }
            }

            const enhanced = {
                seasonStats: seasonStats ? {
                    era: parseFloat(seasonStats.era || '0'),
                    homeRunsPer9: parseFloat(seasonStats.homeRunsPer9 || '0'),
                    whip: parseFloat(seasonStats.whip || '0'),
                    strikeoutsPer9: parseFloat(seasonStats.strikeoutsPer9 || '0'),
                    walksPer9: parseFloat(seasonStats.walksPer9 || '0'),
                    strikeouts: seasonStats.strikeOuts || 0,
                    inningsPitched: parseFloat(seasonStats.inningsPitched || '0'),
                    homeRuns: seasonStats.homeRuns || 0,
                    wins: seasonStats.wins || 0,
                    losses: seasonStats.losses || 0
                } : null,
                gameLogs,
                // HR trend: total HRs in last 5 starts
                recentHRs: gameLogs.reduce((sum, g) => sum + g.homeRuns, 0),
                avgHRPerStart: gameLogs.length > 0
                    ? (gameLogs.reduce((sum, g) => sum + g.homeRuns, 0) / gameLogs.length).toFixed(1)
                    : null
            };

            if (!this._cache) this._cache = {};
            this._cache[cacheKey] = { data: enhanced, time: Date.now() };
            return enhanced;
        } catch (error) {
            console.error(`Error fetching enhanced pitcher stats for ${pitcherId}:`, error);
            return null;
        }
    }

    // Get pitcher ID from probable pitcher object (it's in the game schedule data)
    getPitcherId(probablePitcher) {
        return probablePitcher?.id || null;
    }
}

// Create global instance
const mlbApi = new MLBApi();
