// MLB Park Factors (2025) - Based on Baseball Savant data
// 100 = league average, >100 = hitter friendly, <100 = pitcher friendly

const PARK_FACTORS = {
    // Team abbreviations to park factor mappings
    'ARI': { name: 'Chase Field', factor: 88, home: 'Arizona Diamondbacks', altitude: 'sea level', notes: 'Humidor dampens HR' },
    'ATL': { name: 'Truist Park', factor: 103, home: 'Atlanta Braves', altitude: 'sea level', notes: 'Slight hitter advantage' },
    'BAL': { name: 'Camden Yards', factor: 91, home: 'Baltimore Orioles', altitude: 'sea level', notes: 'LF wall moved back' },
    'BOS': { name: 'Fenway Park', factor: 106, home: 'Boston Red Sox', altitude: 'sea level', notes: 'Green Monster LF' },
    'CHC': { name: 'Wrigley Field', factor: 95, home: 'Chicago Cubs', altitude: 'sea level', notes: 'Wind dependent' },
    'CWS': { name: 'Guaranteed Rate Field', factor: 105, home: 'Chicago White Sox', altitude: 'sea level', notes: 'Favorable RF' },
    'CIN': { name: 'Great American Ball Park', factor: 118, home: 'Cincinnati Reds', altitude: 'sea level', notes: '🔥 TOP HR PARK' },
    'CLE': { name: 'Progressive Field', factor: 96, home: 'Cleveland Guardians', altitude: 'sea level', notes: 'Neutral park' },
    'COL': { name: 'Coors Field', factor: 115, home: 'Colorado Rockies', altitude: '5,200 ft', notes: '🔥 High altitude' },
    'DET': { name: 'Comerica Park', factor: 93, home: 'Detroit Tigers', altitude: 'sea level', notes: 'Deep CF' },
    'HOU': { name: 'Minute Maid Park', factor: 102, home: 'Houston Astros', altitude: 'sea level', notes: 'Short LF porch' },
    'KC': { name: 'Kauffman Stadium', factor: 89, home: 'Kansas City Royals', altitude: 'sea level', notes: 'Pitcher friendly' },
    'LAA': { name: 'Angel Stadium', factor: 104, home: 'Los Angeles Angels', altitude: 'sea level', notes: 'RF boost' },
    'LAD': { name: 'Dodger Stadium', factor: 94, home: 'Los Angeles Dodgers', altitude: 'sea level', notes: 'Marine layer' },
    'MIA': { name: 'loanDepot park', factor: 112, home: 'Miami Marlins', altitude: 'sea level', notes: '🔥 Elevated HR rate' },
    'MIL': { name: 'American Family Field', factor: 108, home: 'Milwaukee Brewers', altitude: 'sea level', notes: 'Retractable roof' },
    'MIN': { name: 'Target Field', factor: 101, home: 'Minnesota Twins', altitude: 'sea level', notes: 'Neutral' },
    'NYM': { name: 'Citi Field', factor: 93, home: 'New York Mets', altitude: 'sea level', notes: 'Deep dimensions' },
    'NYY': { name: 'Yankee Stadium', factor: 110, home: 'New York Yankees', altitude: 'sea level', notes: '🔥 Short RF porch' },
    'OAK': { name: 'Oakland Coliseum', factor: 87, home: 'Oakland Athletics', altitude: 'sea level', notes: '❄️ Foul territory' },
    'PHI': { name: 'Citizens Bank Park', factor: 111, home: 'Philadelphia Phillies', altitude: 'sea level', notes: '🔥 LHB paradise' },
    'PIT': { name: 'PNC Park', factor: 97, home: 'Pittsburgh Pirates', altitude: 'sea level', notes: 'Neutral park' },
    'SD': { name: 'Petco Park', factor: 92, home: 'San Diego Padres', altitude: 'sea level', notes: 'Marine layer' },
    'SF': { name: 'Oracle Park', factor: 76, home: 'San Francisco Giants', altitude: 'sea level', notes: '❄️ WORST HR PARK' },
    'SEA': { name: 'T-Mobile Park', factor: 90, home: 'Seattle Mariners', altitude: 'sea level', notes: 'Deep OF' },
    'STL': { name: 'Busch Stadium', factor: 98, home: 'St. Louis Cardinals', altitude: 'sea level', notes: 'Neutral' },
    'TB': { name: 'Steinbrenner Field', factor: 102, home: 'Tampa Bay Rays', altitude: 'sea level', notes: 'Minor league park' },
    'TEX': { name: 'Globe Life Field', factor: 107, home: 'Texas Rangers', altitude: 'sea level', notes: 'Retractable roof' },
    'TOR': { name: 'Rogers Centre', factor: 103, home: 'Toronto Blue Jays', altitude: 'sea level', notes: 'Retractable roof' },
    'WSH': { name: 'Nationals Park', factor: 99, home: 'Washington Nationals', altitude: 'sea level', notes: 'Neutral' }
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

// Calculate HR boost percentage
function getHRBoostPercentage(factor) {
    const boost = factor - 100;
    if (boost > 0) {
        return `+${boost}% HR boost`;
    } else if (boost < 0) {
        return `${boost}% HR penalty`;
    }
    return 'Average';
}

// Calculate recommendation strength based on park factor, player stats, and pitcher matchup
function calculateRecommendation(parkFactor, seasonHRs, last7HRs, pitcher = null) {
    let score = 0;
    let bonuses = [];
    let breakdown = {
        park: 0,
        power: 0,
        form: 0,
        matchup: 0
    };
    
    // Park factor contribution (0-5 points)
    if (parkFactor >= 115) {
        breakdown.park = 5;
        bonuses.push({ icon: '🔥', text: 'Elite Ballpark', type: 'elite' });
    } else if (parkFactor >= 110) {
        breakdown.park = 4;
        bonuses.push({ icon: '🏟️', text: 'Great Park', type: 'good' });
    } else if (parkFactor >= 105) {
        breakdown.park = 3;
        bonuses.push({ icon: '📈', text: 'Hitter Friendly', type: 'good' });
    } else if (parkFactor >= 100) {
        breakdown.park = 2;
    } else if (parkFactor >= 95) {
        breakdown.park = 1;
    }
    
    // Season home runs contribution (0-4 points)
    if (seasonHRs >= 35) {
        breakdown.power = 4;
        bonuses.push({ icon: '💣', text: 'Elite Power', type: 'elite' });
    } else if (seasonHRs >= 25) {
        breakdown.power = 3;
        bonuses.push({ icon: '💪', text: 'Power Threat', type: 'good' });
    } else if (seasonHRs >= 18) {
        breakdown.power = 2;
    } else if (seasonHRs >= 10) {
        breakdown.power = 1;
    }
    
    // Recent form contribution (0-4 points) - HEAVILY WEIGHTED
    if (last7HRs >= 4) {
        breakdown.form = 4;
        bonuses.push({ icon: '🔥', text: 'Red Hot!', type: 'elite' });
    } else if (last7HRs >= 3) {
        breakdown.form = 3;
        bonuses.push({ icon: '🌡️', text: 'Heating Up', type: 'good' });
    } else if (last7HRs >= 2) {
        breakdown.form = 2;
    } else if (last7HRs >= 1) {
        breakdown.form = 1;
    }
    
    // Pitcher matchup contribution (0-4 points)
    if (pitcher) {
        if (pitcher.hr9 >= 2.0) {
            breakdown.matchup = 4;
            bonuses.push({ icon: '🎯', text: 'HR Machine!', type: 'elite' });
        } else if (pitcher.hr9 >= 1.5) {
            breakdown.matchup = 3;
            bonuses.push({ icon: '🎁', text: 'HR Prone', type: 'good' });
        } else if (pitcher.hr9 >= 1.2) {
            breakdown.matchup = 2;
        } else if (pitcher.hr9 >= 1.0) {
            breakdown.matchup = 1;
        }
        
        // Platoon advantage
        if (pitcher.vsHandAdvantage) {
            breakdown.matchup += 1;
            bonuses.push({ icon: '⚔️', text: 'Platoon Edge', type: 'good' });
        }
    }
    
    score = breakdown.park + breakdown.power + breakdown.form + breakdown.matchup;
    
    // Return tiered recommendation with enhanced visuals
    if (score >= 12) {
        return { 
            class: 'elite', 
            label: '🚀 MUST PLAY', 
            score: score,
            breakdown: breakdown,
            bonuses: bonuses,
            tier: 1,
            confidence: 'ELITE'
        };
    }
    if (score >= 10) {
        return { 
            class: 'top-pick', 
            label: '🔥 TOP PICK', 
            score: score,
            breakdown: breakdown,
            bonuses: bonuses,
            tier: 2,
            confidence: 'Very High'
        };
    }
    if (score >= 7) {
        return { 
            class: 'strong', 
            label: '⭐ STRONG', 
            score: score,
            breakdown: breakdown,
            bonuses: bonuses,
            tier: 3,
            confidence: 'High'
        };
    }
    if (score >= 5) {
        return { 
            class: 'good', 
            label: '✓ GOOD', 
            score: score,
            breakdown: breakdown,
            bonuses: bonuses,
            tier: 4,
            confidence: 'Moderate'
        };
    }
    if (score >= 3) {
        return { 
            class: 'value', 
            label: '💎 VALUE', 
            score: score,
            breakdown: breakdown,
            bonuses: bonuses,
            tier: 5,
            confidence: 'Low'
        };
    }
    return null;
}
