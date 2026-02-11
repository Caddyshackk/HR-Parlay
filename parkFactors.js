// MLB Park Factors (2025) - Based on Baseball Savant data
// 100 = league average, >100 = hitter friendly, <100 = pitcher friendly

const PARK_FACTORS = {
    // Team abbreviations to park factor mappings
    'ARI': { name: 'Chase Field', factor: 88, home: 'Arizona Diamondbacks' },
    'ATL': { name: 'Truist Park', factor: 103, home: 'Atlanta Braves' },
    'BAL': { name: 'Camden Yards', factor: 91, home: 'Baltimore Orioles' },
    'BOS': { name: 'Fenway Park', factor: 106, home: 'Boston Red Sox' },
    'CHC': { name: 'Wrigley Field', factor: 95, home: 'Chicago Cubs' },
    'CWS': { name: 'Guaranteed Rate Field', factor: 105, home: 'Chicago White Sox' },
    'CIN': { name: 'Great American Ball Park', factor: 118, home: 'Cincinnati Reds' },
    'CLE': { name: 'Progressive Field', factor: 96, home: 'Cleveland Guardians' },
    'COL': { name: 'Coors Field', factor: 115, home: 'Colorado Rockies' },
    'DET': { name: 'Comerica Park', factor: 93, home: 'Detroit Tigers' },
    'HOU': { name: 'Minute Maid Park', factor: 102, home: 'Houston Astros' },
    'KC': { name: 'Kauffman Stadium', factor: 89, home: 'Kansas City Royals' },
    'LAA': { name: 'Angel Stadium', factor: 104, home: 'Los Angeles Angels' },
    'LAD': { name: 'Dodger Stadium', factor: 94, home: 'Los Angeles Dodgers' },
    'MIA': { name: 'loanDepot park', factor: 112, home: 'Miami Marlins' },
    'MIL': { name: 'American Family Field', factor: 108, home: 'Milwaukee Brewers' },
    'MIN': { name: 'Target Field', factor: 101, home: 'Minnesota Twins' },
    'NYM': { name: 'Citi Field', factor: 93, home: 'New York Mets' },
    'NYY': { name: 'Yankee Stadium', factor: 110, home: 'New York Yankees' },
    'OAK': { name: 'Oakland Coliseum', factor: 87, home: 'Oakland Athletics' },
    'PHI': { name: 'Citizens Bank Park', factor: 111, home: 'Philadelphia Phillies' },
    'PIT': { name: 'PNC Park', factor: 97, home: 'Pittsburgh Pirates' },
    'SD': { name: 'Petco Park', factor: 92, home: 'San Diego Padres' },
    'SF': { name: 'Oracle Park', factor: 76, home: 'San Francisco Giants' },
    'SEA': { name: 'T-Mobile Park', factor: 90, home: 'Seattle Mariners' },
    'STL': { name: 'Busch Stadium', factor: 98, home: 'St. Louis Cardinals' },
    'TB': { name: 'Steinbrenner Field', factor: 102, home: 'Tampa Bay Rays' },
    'TEX': { name: 'Globe Life Field', factor: 107, home: 'Texas Rangers' },
    'TOR': { name: 'Rogers Centre', factor: 103, home: 'Toronto Blue Jays' },
    'WSH': { name: 'Nationals Park', factor: 99, home: 'Washington Nationals' }
};

// Helper function to get park factor by team abbreviation
function getParkFactor(teamAbbr) {
    return PARK_FACTORS[teamAbbr] || { name: 'Unknown Park', factor: 100, home: teamAbbr };
}

// Helper function to get park factor classification
function getParkClass(factor) {
    if (factor >= 108) return 'hot';
    if (factor <= 92) return 'cold';
    return 'neutral';
}

// Helper function to get park factor label
function getParkLabel(factor) {
    if (factor >= 108) return '🔥 Hitter\'s Park';
    if (factor <= 92) return '❄️ Pitcher\'s Park';
    return '⚖️ Neutral Park';
}

// Calculate recommendation strength based on park factor and player stats
function calculateRecommendation(parkFactor, seasonHRs, last7HRs) {
    let score = 0;
    
    // Park factor contribution (40%)
    if (parkFactor >= 110) score += 4;
    else if (parkFactor >= 105) score += 3;
    else if (parkFactor >= 100) score += 2;
    else if (parkFactor >= 95) score += 1;
    
    // Season home runs contribution (30%)
    if (seasonHRs >= 25) score += 3;
    else if (seasonHRs >= 15) score += 2;
    else if (seasonHRs >= 8) score += 1;
    
    // Recent form contribution (30%)
    if (last7HRs >= 3) score += 3;
    else if (last7HRs >= 2) score += 2;
    else if (last7HRs >= 1) score += 1;
    
    // Return recommendation
    if (score >= 8) return { class: 'strong', label: '⭐ STRONG' };
    if (score >= 5) return { class: 'good', label: '✓ GOOD' };
    if (score >= 3) return { class: 'value', label: '💎 VALUE' };
    return null;
}
