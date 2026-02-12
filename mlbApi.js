// MLB Stats API Integration - Enhanced Version
// Free API: https://statsapi.mlb.com/

class MLBApi {
    constructor() {
        this.baseUrl = 'https://statsapi.mlb.com/api/v1';
        this.scheduleUrl = 'https://statsapi.mlb.com/api/v1/schedule';
    }

    // Get today's games
    async getTodaysGames() {
        // FORCE MOCK DATA FOR DEMO/TESTING (comment out to use real API during season)
        console.log('Using mock game data for demo');
        return this.getMockGames();
        
        /* Uncomment this section when MLB season starts:
        try {
            const today = new Date().toISOString().split('T')[0];
            const url = `${this.scheduleUrl}?sportId=1&date=${today}&hydrate=team,linescore,probablePitcher(stats(type=season))`;
            
            const response = await fetch(url);
            const data = await response.json();
            
            if (data.dates && data.dates.length > 0) {
                return data.dates[0].games;
            }
            
            // Return mock data if no games found (off-season, etc.)
            return this.getMockGames();
        } catch (error) {
            console.error('Error fetching games:', error);
            return this.getMockGames();
        }
        */
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
    getMockTopHitters(teamAbbr, opposingPitcher) {
        const hitters = {
            'CIN': [
                { id: 1, name: 'Elly De La Cruz', seasonHRs: 25, last7HRs: 3, avg: '.265', hand: 'S' },
                { id: 2, name: 'Tyler Stephenson', seasonHRs: 19, last7HRs: 1, avg: '.272', hand: 'R' },
                { id: 3, name: 'Spencer Steer', seasonHRs: 20, last7HRs: 2, avg: '.248', hand: 'R' }
            ],
            'ARI': [
                { id: 4, name: 'Lourdes Gurriel Jr.', seasonHRs: 18, last7HRs: 2, avg: '.261', hand: 'R' },
                { id: 5, name: 'Corbin Carroll', seasonHRs: 22, last7HRs: 1, avg: '.254', hand: 'L' },
                { id: 6, name: 'Christian Walker', seasonHRs: 33, last7HRs: 4, avg: '.251', hand: 'R' }
            ],
            'NYY': [
                { id: 7, name: 'Aaron Judge', seasonHRs: 58, last7HRs: 4, avg: '.322', hand: 'R' },
                { id: 8, name: 'Juan Soto', seasonHRs: 41, last7HRs: 3, avg: '.288', hand: 'L' },
                { id: 9, name: 'Anthony Rizzo', seasonHRs: 19, last7HRs: 1, avg: '.243', hand: 'L' }
            ],
            'SF': [
                { id: 10, name: 'Heliot Ramos', seasonHRs: 22, last7HRs: 1, avg: '.269', hand: 'R' },
                { id: 11, name: 'Matt Chapman', seasonHRs: 24, last7HRs: 2, avg: '.247', hand: 'R' },
                { id: 12, name: 'Tyler Fitzgerald', seasonHRs: 15, last7HRs: 1, avg: '.229', hand: 'R' }
            ],
            'BAL': [
                { id: 13, name: 'Gunnar Henderson', seasonHRs: 37, last7HRs: 2, avg: '.281', hand: 'L' },
                { id: 14, name: 'Adley Rutschman', seasonHRs: 19, last7HRs: 1, avg: '.250', hand: 'S' },
                { id: 15, name: 'Ryan Mountcastle', seasonHRs: 13, last7HRs: 0, avg: '.271', hand: 'R' }
            ],
            'LAA': [
                { id: 16, name: 'Taylor Ward', seasonHRs: 25, last7HRs: 2, avg: '.246', hand: 'R' },
                { id: 17, name: 'Logan O\'Hoppe', seasonHRs: 20, last7HRs: 1, avg: '.244', hand: 'R' },
                { id: 18, name: 'Nolan Schanuel', seasonHRs: 13, last7HRs: 1, avg: '.255', hand: 'L' }
            ]
        };

        const teamHitters = hitters[teamAbbr] || [
            { id: 99, name: 'Player 1', seasonHRs: 15, last7HRs: 1, avg: '.250', hand: 'R' },
            { id: 100, name: 'Player 2', seasonHRs: 12, last7HRs: 0, avg: '.245', hand: 'L' },
            { id: 101, name: 'Player 3', seasonHRs: 18, last7HRs: 2, avg: '.268', hand: 'R' }
        ];

        // Add pitcher matchup data
        if (opposingPitcher) {
            return teamHitters.map(hitter => ({
                ...hitter,
                pitcher: {
                    name: opposingPitcher.fullName,
                    hr9: opposingPitcher.stats && opposingPitcher.stats[0] ? opposingPitcher.stats[0].homeRunsPer9 : 1.2,
                    era: opposingPitcher.stats && opposingPitcher.stats[0] ? opposingPitcher.stats[0].era : 4.00,
                    hand: opposingPitcher.pitchHand ? opposingPitcher.pitchHand.code : 'R',
                    vsHandAdvantage: this.hasHandednessAdvantage(hitter.hand, opposingPitcher.pitchHand ? opposingPitcher.pitchHand.code : 'R')
                }
            }));
        }

        return teamHitters;
    }

    // Determine handedness advantage
    hasHandednessAdvantage(batterHand, pitcherHand) {
        // Opposite hands = advantage
        if (batterHand === 'S') return true; // Switch hitters have advantage
        if (batterHand === 'L' && pitcherHand === 'R') return true;
        if (batterHand === 'R' && pitcherHand === 'L') return true;
        return false;
    }
}

// Create global instance
const mlbApi = new MLBApi();
