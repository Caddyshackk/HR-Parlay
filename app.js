// Main App Logic
class HRParlayApp {
    constructor() {
        this.currentParlay = [];
        this.savedParlays = this.loadParlays();
        this.games = [];
        this.init();
    }

    async init() {
        console.log('App initializing...');
        this.setupEventListeners();
        this.updateDate();
        this.setupDatePicker();
        
        // Load games immediately - don't wait for date picker
        console.log('Loading initial games...');
        await this.loadGames();
        
        this.renderHistory();
        console.log('App initialized successfully');
    }

    setupEventListeners() {
        // Tab navigation
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
        });

        // Parlay actions
        document.getElementById('saveParlayBtn').addEventListener('click', () => this.saveParlay());
        document.getElementById('clearParlayBtn').addEventListener('click', () => this.clearParlay());

        // Date picker
        document.getElementById('datePicker').addEventListener('change', (e) => this.loadGamesForDate(e.target.value));
        document.getElementById('todayBtn').addEventListener('click', () => this.loadTodayGames());
    }

    setupDatePicker() {
        const datePicker = document.getElementById('datePicker');
        if (!datePicker) {
            console.error('Date picker element not found!');
            return;
        }
        
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];
        
        console.log('Setting date picker to:', todayStr);
        datePicker.value = todayStr;
        
        // Set reasonable date range
        const minDate = new Date(today);
        minDate.setMonth(today.getMonth() - 1); // 1 month ago
        
        const maxDate = new Date(today);
        maxDate.setMonth(today.getMonth() + 6); // 6 months ahead
        
        datePicker.min = minDate.toISOString().split('T')[0];
        datePicker.max = maxDate.toISOString().split('T')[0];
        
        console.log('Date picker initialized:', {
            value: datePicker.value,
            min: datePicker.min,
            max: datePicker.max
        });
    }

    async loadTodayGames() {
        const datePicker = document.getElementById('datePicker');
        const today = new Date().toISOString().split('T')[0];
        datePicker.value = today;
        
        // Use smart finder to get next available games
        await this.loadGames();
    }

    async loadGamesForDate(dateStr) {
        const loading = document.getElementById('loading');
        const container = document.getElementById('gamesContainer');
        
        loading.style.display = 'block';
        container.innerHTML = '';

        try {
            this.games = await mlbApi.getGamesForDate(dateStr);
            
            if (this.games.length === 0) {
                // No games on this date - offer to find next games
                container.innerHTML = `
                    <div class="empty-state">
                        <p>⚾ No games on this date</p>
                        <p class="hint">Try a different date or click "Today" to find the next available games</p>
                        <button onclick="app.loadTodayGames()" class="btn-primary" style="margin-top: 1rem;">
                            Find Next Games
                        </button>
                    </div>
                `;
            } else {
                // Update header with game date
                const gameDate = new Date(dateStr + 'T12:00:00'); // Add time to avoid timezone issues
                const dateLabel = gameDate.toLocaleDateString('en-US', { 
                    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
                });
                
                const dateHeader = document.createElement('div');
                dateHeader.style.cssText = 'background: var(--card-bg); padding: 1rem; border-radius: 8px; margin-bottom: 1rem; text-align: center; font-weight: 600;';
                dateHeader.innerHTML = `📅 <span style="color: var(--accent);">${dateLabel}</span> • ${this.games.length} game${this.games.length !== 1 ? 's' : ''}`;
                container.appendChild(dateHeader);
                
                this.games.forEach(game => this.renderGame(game));
            }
        } catch (error) {
            container.innerHTML = `
                <div class="empty-state">
                    <p>❌ Error loading games</p>
                    <p class="hint">${error.message}</p>
                </div>
            `;
        } finally {
            loading.style.display = 'none';
        }
    }

    switchTab(tabName) {
        // Update active tab button
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        // Update active content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`${tabName}-tab`).classList.add('active');
    }

    updateDate() {
        const today = new Date();
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        document.getElementById('currentDate').textContent = today.toLocaleDateString('en-US', options);
    }

    async loadGames() {
        const loading = document.getElementById('loading');
        const container = document.getElementById('gamesContainer');
        
        console.log('loadGames() called');
        loading.style.display = 'block';
        container.innerHTML = '';

        try {
            console.log('Fetching games from API...');
            
            // Add a timeout promise
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Request timed out after 10 seconds')), 10000)
            );
            
            const gamesPromise = mlbApi.getTodaysGames();
            
            // Race between the actual fetch and the timeout
            this.games = await Promise.race([gamesPromise, timeoutPromise]);
            
            console.log(`Received ${this.games.length} games`);
            
            if (this.games.length === 0) {
                console.log('No games found');
                container.innerHTML = `
                    <div class="empty-state">
                        <p>⚾ No games found in next 14 days</p>
                        <p class="hint">MLB season runs April-October. Check back during the season!</p>
                    </div>
                `;
            } else {
                // Update header with game date
                const gameDate = new Date(this.games[0].gameDate);
                const isToday = gameDate.toDateString() === new Date().toDateString();
                const dateLabel = isToday ? 'Today' : gameDate.toLocaleDateString('en-US', { 
                    weekday: 'long', month: 'short', day: 'numeric' 
                });
                
                console.log(`Showing games for: ${dateLabel}`);
                
                // Add date indicator above games
                const dateHeader = document.createElement('div');
                dateHeader.style.cssText = 'background: var(--card-bg); padding: 1rem; border-radius: 8px; margin-bottom: 1rem; text-align: center; font-weight: 600;';
                dateHeader.innerHTML = `📅 Showing games for: <span style="color: var(--accent);">${dateLabel}</span>`;
                container.appendChild(dateHeader);
                
                this.games.forEach(game => this.renderGame(game));
            }
        } catch (error) {
            console.error('Error in loadGames:', error);
            container.innerHTML = `
                <div class="empty-state">
                    <p>❌ Error loading games</p>
                    <p class="hint">${error.message}</p>
                    <p style="font-size: 0.8rem; margin-top: 1rem; color: var(--text-muted);">
                        This might be a network issue or the MLB API is unavailable.
                    </p>
                </div>
            `;
        } finally {
            loading.style.display = 'none';
            console.log('loadGames() completed');
        }
    }

    renderGame(game) {
        const container = document.getElementById('gamesContainer');
        const homeTeam = game.teams.home.team.abbreviation;
        const awayTeam = game.teams.away.team.abbreviation;
        
        const parkInfo = getParkFactor(homeTeam);
        const parkClass = getParkClass(parkInfo.factor);
        const parkLabel = getParkLabel(parkInfo.factor);
        const hrBoost = getHRBoostPercentage(parkInfo.factor);

        const gameCard = document.createElement('div');
        gameCard.className = 'game-card';
        
        // Get probable pitchers
        const awayPitcher = game.teams.away.probablePitcher;
        const homePitcher = game.teams.home.probablePitcher;
        
        // Build pitcher matchup section
        let pitcherMatchupHTML = '';
        if (awayPitcher && homePitcher) {
            const awayPitcherHR9 = awayPitcher.stats && awayPitcher.stats[0] ? awayPitcher.stats[0].homeRunsPer9 : 1.2;
            const homePitcherHR9 = homePitcher.stats && homePitcher.stats[0] ? homePitcher.stats[0].homeRunsPer9 : 1.2;
            
            const awayPitcherERA = awayPitcher.stats && awayPitcher.stats[0] ? awayPitcher.stats[0].era : 4.0;
            const homePitcherERA = homePitcher.stats && homePitcher.stats[0] ? homePitcher.stats[0].era : 4.0;
            
            const awayHand = awayPitcher.pitchHand ? awayPitcher.pitchHand.code : 'R';
            const homeHand = homePitcher.pitchHand ? homePitcher.pitchHand.code : 'R';
            
            // Determine pitcher quality based on HR/9
            const awayHR9Quality = awayPitcherHR9 >= 1.8 ? '🎯 Gives up HRs' : awayPitcherHR9 >= 1.4 ? '📈 Hittable' : awayPitcherHR9 <= 1.0 ? '🔒 Stingy' : '⚖️ Average';
            const homeHR9Quality = homePitcherHR9 >= 1.8 ? '🎯 Gives up HRs' : homePitcherHR9 >= 1.4 ? '📈 Hittable' : homePitcherHR9 <= 1.0 ? '🔒 Stingy' : '⚖️ Average';
            
            // Determine ERA quality and color
            const awayERAClass = awayPitcherERA >= 4.5 ? 'era-bad' : awayPitcherERA <= 3.5 ? 'era-good' : 'era-average';
            const homeERAClass = homePitcherERA >= 4.5 ? 'era-bad' : homePitcherERA <= 3.5 ? 'era-good' : 'era-average';
            
            const awayHR9Class = awayPitcherHR9 >= 1.5 ? 'hr9-bad' : awayPitcherHR9 <= 1.0 ? 'hr9-good' : 'hr9-average';
            const homeHR9Class = homePitcherHR9 >= 1.5 ? 'hr9-bad' : homePitcherHR9 <= 1.0 ? 'hr9-good' : 'hr9-average';
            
            // Overall matchup quality for background
            const awayQualityClass = (awayPitcherHR9 >= 1.5 || awayPitcherERA >= 4.5) ? 'pitcher-favorable' : 
                                     (awayPitcherHR9 <= 1.0 && awayPitcherERA <= 3.5) ? 'pitcher-tough' : 'pitcher-average';
            const homeQualityClass = (homePitcherHR9 >= 1.5 || homePitcherERA >= 4.5) ? 'pitcher-favorable' : 
                                     (homePitcherHR9 <= 1.0 && homePitcherERA <= 3.5) ? 'pitcher-tough' : 'pitcher-average';
            
            pitcherMatchupHTML = `
                <div class="game-pitcher-matchup">
                    <div class="matchup-title">⚾ Starting Pitchers</div>
                    
                    <div class="pitcher-row ${awayQualityClass}">
                        <div class="pitcher-info-section">
                            <div class="pitcher-name-large">
                                <span class="pitcher-name">${awayPitcher.fullName}</span>
                                <span class="pitcher-hand-badge ${awayHand === 'L' ? 'hand-left' : 'hand-right'}">${awayHand}HP</span>
                            </div>
                            <div class="pitcher-team-label">${game.teams.away.team.name}</div>
                        </div>
                        
                        <div class="pitcher-stats-grid">
                            <div class="stat-box">
                                <span class="stat-label">ERA</span>
                                <span class="stat-value ${awayERAClass}">${awayPitcherERA.toFixed(2)}</span>
                            </div>
                            <div class="stat-box">
                                <span class="stat-label">HR/9</span>
                                <span class="stat-value ${awayHR9Class}">${awayPitcherHR9.toFixed(2)}</span>
                            </div>
                            <div class="stat-box quality-badge">
                                ${awayHR9Quality}
                            </div>
                        </div>
                        
                        <div class="platoon-info">
                            ${awayHand === 'L' ? '💡 Right-handed batters get advantage' : '💡 Left-handed batters get advantage'}
                        </div>
                    </div>
                    
                    <div class="vs-divider">VS</div>
                    
                    <div class="pitcher-row ${homeQualityClass}">
                        <div class="pitcher-info-section">
                            <div class="pitcher-name-large">
                                <span class="pitcher-name">${homePitcher.fullName}</span>
                                <span class="pitcher-hand-badge ${homeHand === 'L' ? 'hand-left' : 'hand-right'}">${homeHand}HP</span>
                            </div>
                            <div class="pitcher-team-label">${game.teams.home.team.name}</div>
                        </div>
                        
                        <div class="pitcher-stats-grid">
                            <div class="stat-box">
                                <span class="stat-label">ERA</span>
                                <span class="stat-value ${homeERAClass}">${homePitcherERA.toFixed(2)}</span>
                            </div>
                            <div class="stat-box">
                                <span class="stat-label">HR/9</span>
                                <span class="stat-value ${homeHR9Class}">${homePitcherHR9.toFixed(2)}</span>
                            </div>
                            <div class="stat-box quality-badge">
                                ${homeHR9Quality}
                            </div>
                        </div>
                        
                        <div class="platoon-info">
                            ${homeHand === 'L' ? '💡 Right-handed batters get advantage' : '💡 Left-handed batters get advantage'}
                        </div>
                    </div>
                </div>
            `;
        }
        
        gameCard.innerHTML = `
            <div class="game-header">
                <div class="matchup">
                    ${game.teams.away.team.name} @ ${game.teams.home.team.name}
                </div>
                <div class="park-factor">
                    <span class="park-badge ${parkClass}">${parkInfo.factor}</span>
                </div>
            </div>
            <div class="park-info" style="padding: 0.75rem 1rem; background: rgba(0,0,0,0.2); font-size: 0.85rem;">
                <div style="color: var(--text); font-weight: 600; margin-bottom: 0.25rem;">
                    📍 ${parkInfo.name}
                </div>
                <div style="color: var(--text-muted); display: flex; justify-content: space-between; flex-wrap: wrap;">
                    <span>${parkLabel}</span>
                    <span style="color: ${parkInfo.factor > 100 ? 'var(--success)' : parkInfo.factor < 100 ? '#2196f3' : 'var(--text-muted)'}; font-weight: 600;">${hrBoost}</span>
                </div>
                ${parkInfo.notes ? `<div style="margin-top: 0.25rem; font-size: 0.75rem; color: var(--text-muted);">💡 ${parkInfo.notes}</div>` : ''}
            </div>
            ${pitcherMatchupHTML}
            <div class="players-list" id="players-${game.gamePk}">
                <div style="text-align: center; padding: 1rem; color: var(--text-muted);">
                    <div class="spinner" style="width: 30px; height: 30px; margin: 0 auto;"></div>
                </div>
            </div>
        `;

        container.appendChild(gameCard);

        // Load players for both teams
        setTimeout(() => {
            this.loadPlayersForGame(game, parkInfo.factor);
        }, 100);
    }

    loadPlayersForGame(game, parkFactor) {
        const container = document.getElementById(`players-${game.gamePk}`);
        const homeTeam = game.teams.home.team.abbreviation;
        const awayTeam = game.teams.away.team.abbreviation;

        // Get probable pitchers
        const awayPitcher = game.teams.away.probablePitcher;
        const homePitcher = game.teams.home.probablePitcher;

        // Get top hitters from both teams with pitcher matchup
        const homePlayers = mlbApi.getMockTopHitters(homeTeam, awayPitcher);
        const awayPlayers = mlbApi.getMockTopHitters(awayTeam, homePitcher);

        // Combine and sort by recommendation
        const allPlayers = [
            ...homePlayers.map(p => ({ ...p, team: homeTeam, teamName: game.teams.home.team.name })),
            ...awayPlayers.map(p => ({ ...p, team: awayTeam, teamName: game.teams.away.team.name }))
        ];

        // Calculate recommendations with pitcher matchup and sort
        const playersWithRecs = allPlayers.map(player => {
            const rec = calculateRecommendation(
                parkFactor, 
                player.seasonHRs, 
                player.last7HRs,
                player.pitcher
            );
            return { ...player, recommendation: rec, parkFactor };
        }).filter(p => p.recommendation) // Only show players with recommendations
          .sort((a, b) => {
              // Sort by score (highest first)
              return b.recommendation.score - a.recommendation.score;
          });

        if (playersWithRecs.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: var(--text-muted);">No strong picks for this game</p>';
            return;
        }

        container.innerHTML = '';
        playersWithRecs.forEach(player => {
            this.renderPlayer(player, container, game);
        });
    }

    renderPlayer(player, container, game) {
        const isSelected = this.currentParlay.some(p => p.id === player.id);
        const rec = player.recommendation;
        
        // Determine card tier class
        let cardTierClass = '';
        if (rec.class === 'elite') cardTierClass = 'elite-pick';
        else if (rec.class === 'top-pick') cardTierClass = 'top-pick';
        
        // Build pitcher matchup HTML with color-coded quality
        let pitcherHTML = '';
        if (player.pitcher) {
            const pitcher = player.pitcher;
            const hr9Class = pitcher.hr9 >= 1.5 ? 'bad' : (pitcher.hr9 <= 1.0 ? 'good' : '');
            const eraClass = pitcher.era >= 4.5 ? 'bad' : (pitcher.era <= 3.5 ? 'good' : '');
            
            // Determine overall matchup quality
            let matchupQuality = 'average';
            let matchupLabel = '⚖️ AVERAGE MATCHUP';
            let matchupClass = 'matchup-average';
            
            // Calculate quality score
            let qualityScore = 0;
            if (pitcher.hr9 >= 1.8) qualityScore += 3;
            else if (pitcher.hr9 >= 1.4) qualityScore += 2;
            else if (pitcher.hr9 >= 1.1) qualityScore += 1;
            
            if (pitcher.era >= 4.8) qualityScore += 3;
            else if (pitcher.era >= 4.2) qualityScore += 2;
            else if (pitcher.era >= 3.8) qualityScore += 1;
            
            if (pitcher.vsHandAdvantage) qualityScore += 2;
            
            // Set matchup quality based on score
            if (qualityScore >= 6) {
                matchupQuality = 'great';
                matchupLabel = '🎯 GREAT MATCHUP!';
                matchupClass = 'matchup-great';
            } else if (qualityScore >= 4) {
                matchupQuality = 'good';
                matchupLabel = '✓ GOOD MATCHUP';
                matchupClass = 'matchup-good';
            } else if (qualityScore <= 1) {
                matchupQuality = 'tough';
                matchupLabel = '⚠️ TOUGH MATCHUP';
                matchupClass = 'matchup-tough';
            }
            
            // Build description
            let description = '';
            if (pitcher.hr9 >= 1.5 && pitcher.era >= 4.5) {
                description = 'Allows lots of home runs & runs';
            } else if (pitcher.hr9 >= 1.5) {
                description = `Allows ${pitcher.hr9.toFixed(1)} HRs per 9 innings`;
            } else if (pitcher.era >= 4.5) {
                description = 'Struggles with run prevention';
            } else if (pitcher.hr9 <= 0.9 && pitcher.era <= 3.5) {
                description = 'Elite pitcher - tough to homer against';
            } else if (pitcher.hr9 <= 1.0) {
                description = 'Rarely gives up home runs';
            } else {
                description = 'Average pitcher stats';
            }
            
            pitcherHTML = `
                <div class="pitcher-matchup ${matchupClass}">
                    <div class="pitcher-matchup-header">
                        ${matchupLabel}
                    </div>
                    <div class="pitcher-name">
                        vs ${pitcher.name} (${pitcher.hand}HP)
                        ${pitcher.vsHandAdvantage ? '<span class="platoon-badge">⚔️ Platoon Edge</span>' : ''}
                    </div>
                    <div class="pitcher-stats">
                        <div class="pitcher-stat">
                            <span class="pitcher-stat-label">ERA</span>
                            <span class="pitcher-stat-value ${eraClass}">${pitcher.era.toFixed(2)}</span>
                        </div>
                        <div class="pitcher-stat">
                            <span class="pitcher-stat-label">HR/9</span>
                            <span class="pitcher-stat-value ${hr9Class}">${pitcher.hr9.toFixed(2)}</span>
                        </div>
                    </div>
                    <div class="pitcher-description">
                        ${description}
                    </div>
                </div>
            `;
        }
        
        // Build bonus tags HTML
        let bonusHTML = '';
        if (rec.bonuses && rec.bonuses.length > 0) {
            const tags = rec.bonuses.map(bonus => 
                `<span class="bonus-tag ${bonus.type}">${bonus.icon} ${bonus.text}</span>`
            ).join('');
            bonusHTML = `<div class="bonus-tags">${tags}</div>`;
        }
        
        const playerCard = document.createElement('div');
        playerCard.className = `player-card ${cardTierClass} ${isSelected ? 'selected' : ''}`;
        playerCard.innerHTML = `
            <div class="player-info">
                <div class="player-name">${player.name}</div>
                <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.5rem;">
                    ${player.teamName} • ${player.hand === 'S' ? 'Switch' : player.hand === 'L' ? 'LHB' : 'RHB'}
                </div>
                <div class="player-stats">
                    <div class="stat-item">
                        <span class="stat-label">Season HRs</span>
                        <span class="stat-value">${player.seasonHRs}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Last 7 Days</span>
                        <span class="stat-value">${player.last7HRs} HR</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">AVG</span>
                        <span class="stat-value">${player.avg}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Park</span>
                        <span class="stat-value">${player.parkFactor}</span>
                    </div>
                </div>
                ${pitcherHTML}
                ${bonusHTML}
                <div class="score-breakdown" style="margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid var(--border);">
                    <div style="font-weight: 600; margin-bottom: 0.5rem; color: var(--text); display: flex; justify-content: space-between;">
                        <span>Confidence Score</span>
                        <span style="color: var(--accent);">${rec.score}/17</span>
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.5rem; font-size: 0.75rem;">
                        <div>
                            <div style="color: var(--text-muted);">Park</div>
                            <div style="color: var(--text); font-weight: 600;">${rec.breakdown.park}</div>
                        </div>
                        <div>
                            <div style="color: var(--text-muted);">Power</div>
                            <div style="color: var(--text); font-weight: 600;">${rec.breakdown.power}</div>
                        </div>
                        <div>
                            <div style="color: var(--text-muted);">Form</div>
                            <div style="color: var(--text); font-weight: 600;">${rec.breakdown.form}</div>
                        </div>
                        <div>
                            <div style="color: var(--text-muted);">Matchup</div>
                            <div style="color: var(--text); font-weight: 600;">${rec.breakdown.matchup}</div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="recommendation ${rec.class}">
                ${rec.label}
            </div>
        `;

        playerCard.addEventListener('click', () => {
            this.togglePlayer({
                ...player,
                game: `${game.teams.away.team.name} @ ${game.teams.home.team.name}`,
                gameDate: game.gameDate
            });
        });

        container.appendChild(playerCard);
    }

    togglePlayer(player) {
        const index = this.currentParlay.findIndex(p => p.id === player.id);
        
        if (index > -1) {
            this.currentParlay.splice(index, 1);
        } else {
            this.currentParlay.push(player);
        }

        this.updateParlayDisplay();
        this.loadGames(); // Refresh to update selected states
    }

    updateParlayDisplay() {
        const parlayList = document.getElementById('parlayList');
        const parlayCount = document.getElementById('parlayCount');
        const totalPicks = document.getElementById('totalPicks');
        const avgParkFactor = document.getElementById('avgParkFactor');
        const saveBtn = document.getElementById('saveParlayBtn');

        parlayCount.textContent = this.currentParlay.length;
        totalPicks.textContent = this.currentParlay.length;

        if (this.currentParlay.length === 0) {
            parlayList.innerHTML = `
                <div class="empty-state">
                    <p>🎯 No picks yet!</p>
                    <p class="hint">Tap players from "Today's Picks" to build your parlay</p>
                </div>
            `;
            avgParkFactor.textContent = '-';
            saveBtn.disabled = true;
        } else {
            const avgFactor = Math.round(
                this.currentParlay.reduce((sum, p) => sum + p.parkFactor, 0) / this.currentParlay.length
            );
            avgParkFactor.textContent = avgFactor;
            saveBtn.disabled = false;

            parlayList.innerHTML = '';
            this.currentParlay.forEach(player => {
                const item = document.createElement('div');
                item.className = 'parlay-item';
                item.innerHTML = `
                    <div class="parlay-item-info">
                        <div class="parlay-player">${player.name}</div>
                        <div class="parlay-game">${player.game}</div>
                        <div style="margin-top: 0.25rem; font-size: 0.8rem; color: var(--text-muted);">
                            ${player.seasonHRs} HRs this season | Park: ${player.parkFactor}
                        </div>
                    </div>
                    <button class="remove-btn" data-id="${player.id}">Remove</button>
                `;

                item.querySelector('.remove-btn').addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.togglePlayer(player);
                });

                parlayList.appendChild(item);
            });
        }
    }

    saveParlay() {
        if (this.currentParlay.length === 0) return;

        const parlay = {
            id: Date.now(),
            date: new Date().toISOString(),
            picks: [...this.currentParlay],
            avgParkFactor: Math.round(
                this.currentParlay.reduce((sum, p) => sum + p.parkFactor, 0) / this.currentParlay.length
            )
        };

        this.savedParlays.unshift(parlay);
        this.storeParlays();
        
        // Clear current parlay
        this.currentParlay = [];
        this.updateParlayDisplay();
        
        // Show confirmation and switch to history
        alert(`✅ Parlay saved with ${parlay.picks.length} picks!`);
        this.switchTab('history');
        this.renderHistory();
    }

    clearParlay() {
        if (this.currentParlay.length === 0) return;
        
        if (confirm('Clear all picks from your parlay?')) {
            this.currentParlay = [];
            this.updateParlayDisplay();
            this.loadGames();
        }
    }

    renderHistory() {
        const container = document.getElementById('historyContainer');

        if (this.savedParlays.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <p>📊 No saved parlays yet</p>
                    <p class="hint">Your saved parlays will appear here</p>
                </div>
            `;
            return;
        }

        container.innerHTML = '';
        this.savedParlays.forEach(parlay => {
            const card = document.createElement('div');
            card.className = 'history-card';
            
            const date = new Date(parlay.date);
            const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

            card.innerHTML = `
                <div class="history-header">
                    <div class="history-date">📅 ${dateStr}</div>
                    <div style="font-size: 0.9rem;">
                        ${parlay.picks.length} picks | Park: ${parlay.avgParkFactor}
                    </div>
                </div>
                <div class="history-picks">
                    ${parlay.picks.map(p => `
                        <div class="history-pick">
                            ⚾ <strong>${p.name}</strong> (${p.teamName}) - ${p.seasonHRs} HRs
                        </div>
                    `).join('')}
                </div>
            `;

            container.appendChild(card);
        });
    }

    loadParlays() {
        const stored = localStorage.getItem('hrParlays');
        return stored ? JSON.parse(stored) : [];
    }

    storeParlays() {
        localStorage.setItem('hrParlays', JSON.stringify(this.savedParlays));
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new HRParlayApp();
});
