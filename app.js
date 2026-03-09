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
        // Load odds in background (non-blocking)
        this.allOdds = null;
        this.bdlGames = null;
        this.loadOddsAndLiveData();

        // Load games immediately
        console.log('Loading initial games...');
        await this.loadGames();

        this.renderHistory();

        // Start live score auto-refresh every 60s
        this.startLiveRefresh();

        console.log('App initialized successfully');
    }

    setupEventListeners() {
        // Tab navigation
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchMainTab(e.target.dataset.tab));
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
        loading.style.display = 'block';
        document.getElementById('gameStrip').innerHTML = '';
        document.getElementById('gameDetail').innerHTML = '';
        document.getElementById('gameStripWrapper').style.display = 'none';

        try {
            this.games = await mlbApi.getGamesForDate(dateStr);
            if (this.games.length === 0) {
                document.getElementById('gameDetail').innerHTML = `
                    <div class="empty-state">
                        <p>⚾ No games on this date</p>
                        <p class="hint">Try a different date or click "Today" to find the next available games</p>
                        <button onclick="app.loadTodayGames()" class="btn-primary" style="margin-top: 1rem;">Find Next Games</button>
                    </div>`;
            } else {
                this.renderGameStrip(this.games);
                this.selectGame(this.games[0].gamePk);
            }
        } catch (error) {
            document.getElementById('gameDetail').innerHTML = `
                <div class="empty-state"><p>❌ Error loading games</p><p class="hint">${error.message}</p></div>`;
        } finally {
            loading.style.display = 'none';
        }
    }

    switchMainTab(tabName) {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.getElementById(`${tabName}-tab`).classList.add('active');
        // Strip only shows on the picks tab
        const strip = document.getElementById('gameStripWrapper');
        if (strip) strip.style.display = tabName === 'picks' ? '' : 'none';
    }

    updateDate() {
        const today = new Date();
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        document.getElementById('currentDate').textContent = today.toLocaleDateString('en-US', options);
    }

    async loadGames() {
        const loading = document.getElementById('loading');
        loading.style.display = 'block';
        document.getElementById('gameStrip').innerHTML = '';
        document.getElementById('gameDetail').innerHTML = '';
        document.getElementById('gameStripWrapper').style.display = 'none';

        console.log('loadGames() called');

        try {
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Request timed out after 10 seconds')), 10000)
            );
            this.games = await Promise.race([mlbApi.getTodaysGames(), timeoutPromise]);

            console.log(`Received ${this.games.length} games`);

            if (this.games.length === 0) {
                document.getElementById('gameDetail').innerHTML = `
                    <div class="empty-state">
                        <p>⚾ No games found in next 14 days</p>
                        <p class="hint">MLB season runs April-October. Check back during the season!</p>
                    </div>`;
            } else {
                this.renderGameStrip(this.games);
                this.selectGame(this.games[0].gamePk);
            }
        } catch (error) {
            console.error('Error in loadGames:', error);
            document.getElementById('gameDetail').innerHTML = `
                <div class="empty-state">
                    <p>❌ Error loading games</p>
                    <p class="hint">${error.message}</p>
                </div>`;
        } finally {
            loading.style.display = 'none';
            console.log('loadGames() completed');
        }
    }

    // Render the horizontal game chip strip
    renderGameStrip(games) {
        const strip = document.getElementById('gameStrip');
        const wrapper = document.getElementById('gameStripWrapper');
        strip.innerHTML = '';

        games.forEach((game, idx) => {
            const homeAbbr = game.teams.home.team.abbreviation;
            const awayAbbr = game.teams.away.team.abbreviation;
            const parkInfo = getParkFactor(homeAbbr);
            const parkClass = getParkClass(parkInfo.factor);

            // Format game time
            let timeStr = '';
            if (game.gameDate) {
                const d = new Date(game.gameDate);
                timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
            }

            // Live score from BDL if available
            const bdlGame = this.bdlGames && typeof bdlApi !== 'undefined'
                ? bdlApi.findLiveGame(this.bdlGames, game.teams.home.team.name, game.teams.away.team.name)
                : null;
            const liveStatus = bdlGame ? bdlApi.formatGameStatus(bdlGame) : null;

            let chipMetaHTML = '';
            if (liveStatus?.type === 'live') {
                chipMetaHTML = `
                    <div class="chip-live">
                        <span class="chip-live-dot"></span>
                        <span class="chip-live-score">${liveStatus.score}</span>
                        <span class="chip-live-inning">${liveStatus.label}</span>
                    </div>`;
            } else if (liveStatus?.type === 'final') {
                chipMetaHTML = `<div class="chip-final">F · ${liveStatus.score}</div>`;
            } else {
                chipMetaHTML = `
                    <div class="chip-meta">
                        <span class="chip-time">${timeStr}</span>
                        <span class="park-badge ${parkClass}" style="font-size:0.6rem;padding:0.1rem 0.3rem;">${parkInfo.factor}</span>
                    </div>`;
            }

            const hasPick = this.currentParlay.some(p =>
                p.game && p.game.includes(game.teams.home.team.name)
            );

            const chip = document.createElement('button');
            chip.className = `game-chip${idx === 0 ? ' active' : ''}${liveStatus?.type === 'live' ? ' chip-is-live' : ''}`;
            chip.id = `chip-${game.gamePk}`;
            chip.innerHTML = `
                <div class="chip-matchup">
                    <span class="chip-away">${awayAbbr}</span>
                    <span class="chip-at">@</span>
                    <span class="chip-home">${homeAbbr}</span>
                    ${hasPick ? '<span class="chip-pick-dot"></span>' : ''}
                </div>
                ${chipMetaHTML}
            `;
            chip.addEventListener('click', () => this.selectGame(game.gamePk));
            strip.appendChild(chip);
        });

        // Hide fades on initial load
        const fl = document.querySelector('.strip-fade-left');
        const fr = document.querySelector('.strip-fade-right');
        if (fl) fl.style.opacity = '0';
        if (fr) fr.style.opacity = '0';

        this.updateStripArrows();
        strip.addEventListener('scroll', () => this.updateStripArrows(), { passive: true });
        wrapper.style.display = '';
    }

    updateStripArrows() {
    const strip = document.getElementById('gameStrip');
    const prevBtn = document.getElementById('stripPrev');
    const nextBtn = document.getElementById('stripNext');
    const fadeLeft = document.querySelector('.strip-fade-left');
    const fadeRight = document.querySelector('.strip-fade-right');
    if (!strip) return;

    const atStart = strip.scrollLeft <= 10;
    const atEnd = strip.scrollLeft >= strip.scrollWidth - strip.clientWidth - 10;

    if (prevBtn) {
        prevBtn.style.opacity = atStart ? '0' : '1';
        prevBtn.style.pointerEvents = atStart ? 'none' : 'auto';
    }
    if (nextBtn) {
        nextBtn.style.opacity = atEnd ? '0' : '1';
        nextBtn.style.pointerEvents = atEnd ? 'none' : 'auto';
    }
    if (fadeLeft) fadeLeft.style.opacity = atStart ? '0' : '1';
    if (fadeRight) fadeRight.style.opacity = atEnd ? '0' : '1';
}

    scrollStrip(dir) {
        const strip = document.getElementById('gameStrip');
        if (strip) strip.scrollBy({ left: dir * 220, behavior: 'smooth' });
    }

    // Select a game — update active chip, render detail panel
    selectGame(gamePk) {
        this.activeGamePk = gamePk;
        const game = this.games.find(g => g.gamePk === gamePk);
        if (!game) return;

        // Update chip active state
        document.querySelectorAll('.game-chip').forEach(c => {
            c.classList.toggle('active', c.id === `chip-${gamePk}`);
        });

        // Render full game detail
        const detail = document.getElementById('gameDetail');
        detail.innerHTML = '';
        this.renderGame(game, detail);
    }


    renderGame(game, container = null) {
        if (!container) container = document.getElementById('gameDetail');
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
                            ${awayHand === 'L' ? '💡 Righty batters have better matchup' : '💡 Lefty batters have better matchup'}
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
                            ${homeHand === 'L' ? '💡 Righty batters have better matchup' : '💡 Lefty batters have better matchup'}
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
            <div id="pitcher-trends-${game.gamePk}"></div>
            ${this.buildOddsPanel(game)}
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

        // Load enhanced pitcher stats (trend + extra stats)
        this.loadEnhancedPitcherStats(game).then(enhanced => {
            const trendsEl = document.getElementById(`pitcher-trends-${game.gamePk}`);
            if (!trendsEl) return;
            const awayTrend = this.buildPitcherTrendHTML(enhanced.away);
            const homeTrend = this.buildPitcherTrendHTML(enhanced.home);
            if (awayTrend || homeTrend) {
                trendsEl.innerHTML = `<div class="pitcher-trends-container">
                    ${game.teams.away.probablePitcher ? `
                        <div class="pitcher-trend-block">
                            <div class="trend-pitcher-name">${game.teams.away.probablePitcher.fullName}</div>
                            ${awayTrend || '<div class="trend-na">No trend data</div>'}
                        </div>` : ''}
                    ${game.teams.home.probablePitcher ? `
                        <div class="pitcher-trend-block">
                            <div class="trend-pitcher-name">${game.teams.home.probablePitcher.fullName}</div>
                            ${homeTrend || '<div class="trend-na">No trend data</div>'}
                        </div>` : ''}
                </div>`;
            }
        }).catch(() => {});
    }

    async loadPlayersForGame(game, parkFactor) {
        const container = document.getElementById(`players-${game.gamePk}`);
        const homeTeam = game.teams.home.team.abbreviation;
        const awayTeam = game.teams.away.team.abbreviation;
        const homeTeamId = game.teams.home.team.id;
        const awayTeamId = game.teams.away.team.id;

        // Get probable pitchers
        const awayPitcher = game.teams.away.probablePitcher;
        const homePitcher = game.teams.home.probablePitcher;

        // Show loading state
        container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:1rem;">Loading players...</p>';

        // Fetch real hitters from MLB Stats API
        const [homePlayers, awayPlayers] = await Promise.all([
            mlbApi.getRealTeamHitters(homeTeamId, homeTeam, awayPitcher),
            mlbApi.getRealTeamHitters(awayTeamId, awayTeam, homePitcher)
        ]);

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
                        ${pitcher.vsHandAdvantage ? '<span class="platoon-badge">⚡ Better Matchup</span>' : ''}
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
        const cardId = `card-${player.id}-${game.gamePk}`;
        playerCard.innerHTML = `
            <div class="player-info">
                <div class="player-name">${player.name}</div>
                <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.5rem;">
                    ${player.teamName} • ${player.hand === 'S' ? 'Switch' : player.hand === 'L' ? 'LHB' : 'RHB'}
                </div>

                <!-- Tabs -->
                <div class="stat-tabs" id="tabs-${cardId}">
                    <button class="stat-tab active" data-tab="overview" onclick="app.switchPlayerTab(this, '${cardId}', 'overview')">Overview</button>
                    <button class="stat-tab" data-tab="advanced" onclick="app.switchPlayerTab(this, '${cardId}', 'advanced', ${player.id})">Advanced ⚡</button>
                </div>

                <!-- Overview Tab -->
                <div class="tab-pane active" id="tab-overview-${cardId}">
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
                        ${player.xbh != null ? `
                        <div class="stat-item">
                            <span class="stat-label">XBH</span>
                            <span class="stat-value">${player.xbh}</span>
                        </div>` : ''}
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

                <!-- Advanced Tab -->
                <div class="tab-pane" id="tab-advanced-${cardId}" style="display:none;">
                    <div class="advanced-loading" id="adv-loading-${cardId}">
                        <span class="adv-spinner">⚡</span> Loading Statcast data...
                    </div>
                    <div class="advanced-stats" id="adv-stats-${cardId}" style="display:none;"></div>
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

    switchPlayerTab(btn, cardId, tab, playerId = null) {
        btn.closest('.player-card') && (event => event && event.stopPropagation())(window.event);

        // Toggle tab buttons
        const tabsEl = document.getElementById(`tabs-${cardId}`);
        tabsEl.querySelectorAll('.stat-tab').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });

        // Toggle pane visibility
        document.getElementById(`tab-overview-${cardId}`).style.display = tab === 'overview' ? '' : 'none';
        const advPane = document.getElementById(`tab-advanced-${cardId}`);
        advPane.style.display = tab === 'advanced' ? '' : 'none';

        // Lazy load advanced stats on first open
        if (tab === 'advanced' && playerId) {
            const statsEl  = document.getElementById(`adv-stats-${cardId}`);
            const loadingEl = document.getElementById(`adv-loading-${cardId}`);

            // Only fetch if not already loaded
            if (statsEl.dataset.loaded !== 'true') {
                mlbApi.getAdvancedStats(playerId).then(stats => {
                    loadingEl.style.display = 'none';
                    statsEl.style.display = '';
                    statsEl.innerHTML = this.buildAdvancedStatsHTML(stats);
                    statsEl.dataset.loaded = 'true';
                }).catch(() => {
                    loadingEl.innerHTML = '<span style="color:var(--text-muted);font-size:0.8rem;">Advanced stats unavailable</span>';
                });
            }
        }
    }

    buildAdvancedStatsHTML(stats) {
        if (!stats) {
            return `<div class="adv-unavailable">
                <div class="adv-unavailable-icon">📊</div>
                <div>Statcast data unavailable</div>
                <div class="adv-unavailable-sub">Player may not meet minimum PA threshold or data is loading</div>
            </div>`;
        }

        const fmt = (v, suffix = '') => v != null ? `${v}${suffix}` : '<span class="adv-na">—</span>';
        const fmtDec = (v) => v != null ? v.toFixed(3).replace(/^0/, '') : '<span class="adv-na">—</span>';

        // Color coding helpers
        const barrelClass  = stats.barrelRate  >= 10 ? 'adv-great' : stats.barrelRate  >= 7  ? 'adv-good' : stats.barrelRate  != null ? 'adv-avg' : '';
        const hardHitClass = stats.hardHitPct  >= 45 ? 'adv-great' : stats.hardHitPct  >= 38 ? 'adv-good' : stats.hardHitPct  != null ? 'adv-avg' : '';
        const exitVeloClass= stats.exitVelo    >= 92 ? 'adv-great' : stats.exitVelo    >= 89 ? 'adv-good' : stats.exitVelo    != null ? 'adv-avg' : '';
        const kClass       = stats.kPct        <= 18 ? 'adv-great' : stats.kPct        <= 23 ? 'adv-good' : stats.kPct        != null ? 'adv-bad'  : '';
        const bbClass      = stats.bbPct       >= 10 ? 'adv-great' : stats.bbPct       >= 7  ? 'adv-good' : stats.bbPct       != null ? 'adv-avg' : '';
        const chaseClass   = stats.ozSwingPct  <= 28 ? 'adv-great' : stats.ozSwingPct  <= 34 ? 'adv-good' : stats.ozSwingPct  != null ? 'adv-bad'  : '';

        return `
            <div class="adv-section-label">⚡ Statcast Power</div>
            <div class="adv-grid">
                <div class="adv-stat">
                    <div class="adv-val ${barrelClass}">${fmt(stats.barrelRate, '%')}</div>
                    <div class="adv-lbl">Barrel %</div>
                </div>
                <div class="adv-stat">
                    <div class="adv-val ${hardHitClass}">${fmt(stats.hardHitPct, '%')}</div>
                    <div class="adv-lbl">Hard Hit %</div>
                </div>
                <div class="adv-stat">
                    <div class="adv-val ${exitVeloClass}">${fmt(stats.exitVelo)}</div>
                    <div class="adv-lbl">Avg Exit Velo</div>
                </div>
                <div class="adv-stat">
                    <div class="adv-val">${fmt(stats.launchAngle, '°')}</div>
                    <div class="adv-lbl">Launch Angle</div>
                </div>
                <div class="adv-stat">
                    <div class="adv-val">${fmt(stats.sweetSpotPct, '%')}</div>
                    <div class="adv-lbl">Sweet Spot %</div>
                </div>
            </div>

            <div class="adv-section-label" style="margin-top:0.75rem;">📋 Expected & Discipline</div>
            <div class="adv-grid">
                <div class="adv-stat">
                    <div class="adv-val">${fmtDec(stats.xba)}</div>
                    <div class="adv-lbl">xBA</div>
                </div>
                <div class="adv-stat">
                    <div class="adv-val">${fmtDec(stats.xslg)}</div>
                    <div class="adv-lbl">xSLG</div>
                </div>
                <div class="adv-stat">
                    <div class="adv-val ${kClass}">${fmt(stats.kPct, '%')}</div>
                    <div class="adv-lbl">K %</div>
                </div>
                <div class="adv-stat">
                    <div class="adv-val ${bbClass}">${fmt(stats.bbPct, '%')}</div>
                    <div class="adv-lbl">BB %</div>
                </div>
                <div class="adv-stat">
                    <div class="adv-val ${chaseClass}">${fmt(stats.ozSwingPct, '%')}</div>
                    <div class="adv-lbl">Chase %</div>
                </div>
                <div class="adv-stat">
                    <div class="adv-val">${fmt(stats.zSwingPct, '%')}</div>
                    <div class="adv-lbl">Zone Swing %</div>
                </div>
            </div>

            <div class="adv-pa-note">Based on ${stats.pa || '?'} plate appearances · via Baseball Savant</div>
        `;
    }

    togglePlayer(player) {
        const index = this.currentParlay.findIndex(p => p.id === player.id);
        if (index > -1) {
            this.currentParlay.splice(index, 1);
        } else {
            this.currentParlay.push(player);
        }
        this.updateParlayDisplay();
        // Re-render strip to update pick dots, then re-select active game
        if (this.games && this.games.length > 0) {
            this.renderGameStrip(this.games);
            this.selectGame(this.activeGamePk || this.games[0].gamePk);
        }
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
        this.switchMainTab('history');
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

    // ─── SETTINGS ────────────────────────────────────────────────────────────────

    // ─── ODDS & LIVE DATA ─────────────────────────────────────────────────────────

    async loadOddsAndLiveData() {
        const today = new Date().toISOString().split('T')[0];
        const promises = [];

        // Only call APIs if worker is configured
        const workerReady = typeof oddsApi !== 'undefined' && oddsApi.isConfigured();
        const bdlReady    = typeof bdlApi  !== 'undefined' && bdlApi.isConfigured();

        const [odds, live] = await Promise.allSettled([
            workerReady ? oddsApi.getMLBGameOdds()      : Promise.resolve(null),
            bdlReady    ? bdlApi.getGamesForDate(today) : Promise.resolve(null),
        ]);
        this.allOdds  = odds.status  === 'fulfilled' ? odds.value  : null;
        this.bdlGames = live.status  === 'fulfilled' ? live.value  : null;
    }

    startLiveRefresh() {
        setInterval(async () => {
            await this.loadOddsAndLiveData();
            this.refreshGameOddsPanels();
        }, 60 * 1000);
    }

    refreshGameOddsPanels() {
        if (!this.games) return;
        this.games.forEach(game => {
            const panel = document.getElementById(`odds-panel-${game.gamePk}`);
            if (panel) {
                const newHTML = document.createElement('div');
                newHTML.innerHTML = this.buildOddsPanel(game);
                panel.replaceWith(newHTML.firstElementChild);
            }
        });
    }

    buildOddsPanel(game) {
        const homeTeam = game.teams.home.team.name;
        const awayTeam = game.teams.away.team.name;
        const homeAbbr = game.teams.home.team.abbreviation;
        const awayAbbr = game.teams.away.team.abbreviation;

        // Live score from BallDontLie
        const bdlGame = this.bdlGames ? bdlApi.findLiveGame(this.bdlGames, homeTeam, awayTeam) : null;
        const liveStatus = bdlGame ? bdlApi.formatGameStatus(bdlGame) : null;

        // Odds - real or estimated
        const gameOddsObj = this.allOdds ? oddsApi.findGameOdds(this.allOdds, homeTeam, awayTeam) : null;
        let oddsData = null;

        if (gameOddsObj) {
            oddsData = oddsApi.extractAllBookOdds(gameOddsObj);
        }
        if (!oddsData) {
            const homePitcherERA = game.teams.home.probablePitcher?.stats?.[0]?.era;
            const awayPitcherERA = game.teams.away.probablePitcher?.stats?.[0]?.era;
            const parkFactor = getParkFactor(homeAbbr)?.factor || 100;
            oddsData = oddsApi.estimateOdds(homeTeam, awayTeam, parkFactor, homePitcherERA, awayPitcherERA);
        }

        // Live score badge
        let liveHTML = '';
        if (liveStatus?.type === 'live') {
            liveHTML = `<div class="live-badge"><span class="live-dot"></span><span class="live-inning">${liveStatus.label}</span><span class="live-score">${liveStatus.score}</span></div>`;
        } else if (liveStatus?.type === 'final') {
            liveHTML = `<div class="final-badge">FINAL · ${liveStatus.score}</div>`;
        }

        // Per-book rows (real data only)
        let bookRowsHTML = '';
        if (!oddsData.estimated && oddsData.allBooks?.length > 0) {
            const rows = oddsData.allBooks.map(book => {
                const isBestHome = book.homeML === oddsData.homeML && book.name === oddsData.bestHomeBook;
                const isBestAway = book.awayML === oddsData.bestAwayML && book.name === oddsData.bestAwayBook;
                return `<div class="book-row">
                    <span class="book-name">${book.name}</span>
                    <span class="book-ml ${isBestAway ? 'book-best' : ''} ${oddsApi.getMLClass(book.awayML)}">
                        ${oddsApi.formatML(book.awayML)}${isBestAway ? ' ★' : ''}
                    </span>
                    <span class="book-divider">|</span>
                    <span class="book-ml ${isBestHome ? 'book-best' : ''} ${oddsApi.getMLClass(book.homeML)}">
                        ${isBestHome ? '★ ' : ''}${oddsApi.formatML(book.homeML)}
                    </span>
                </div>`;
            }).join('');

            bookRowsHTML = `<div class="book-rows-container">
                <div class="book-rows-header">
                    <span class="book-name-col"></span>
                    <span class="book-team-label">${awayAbbr}</span>
                    <span class="book-divider">|</span>
                    <span class="book-team-label">${homeAbbr}</span>
                </div>
                ${rows}
                <div class="odds-disclaimer">
                    ⚠️ Odds are for reference only and subject to change. Always verify current lines at your sportsbook before placing any wager.
                </div>
            </div>`;
        }

        const setupBtn = '';

        const totalStr = oddsData.totalLine != null ? `O/U ${oddsData.totalLine}` : '';
        const sourceLabel = oddsData.estimated
            ? '<span class="estimated-tag">estimated</span>'
            : `<span class="book-tag">${oddsData.bookCount} books</span>`;

        return `<div class="odds-panel" id="odds-panel-${game.gamePk}">
            <div class="odds-panel-header">
                <span class="odds-title">💰 Best Available Odds ${sourceLabel}</span>
                ${totalStr ? `<span class="odds-total-pill">${totalStr}</span>` : ''}
                ${liveHTML}
            </div>
            ${oddsData.estimated ? `
                <div class="odds-estimated-row">
                    <div class="odds-est-cell">
                        <div class="odds-team-lbl">${awayAbbr}</div>
                        <div class="odds-ml-big ${oddsApi.getMLClass(oddsData.awayML)}">${oddsApi.formatML(oddsData.awayML)}</div>
                        <div class="odds-book-lbl">estimated</div>
                    </div>
                    <div class="odds-est-sep">vs</div>
                    <div class="odds-est-cell">
                        <div class="odds-team-lbl">${homeAbbr}</div>
                        <div class="odds-ml-big ${oddsApi.getMLClass(oddsData.homeML)}">${oddsApi.formatML(oddsData.homeML)}</div>
                        <div class="odds-book-lbl">estimated</div>
                    </div>
                </div>
                ${setupBtn}
            ` : bookRowsHTML}
        </div>`;
    }

    // ─── ENHANCED PITCHER STATS ───────────────────────────────────────────────────

    async loadEnhancedPitcherStats(game) {
        const homePitcher = game.teams.home.probablePitcher;
        const awayPitcher = game.teams.away.probablePitcher;
        const [homeEnhanced, awayEnhanced] = await Promise.allSettled([
            homePitcher?.id ? mlbApi.getEnhancedPitcherStats(homePitcher.id) : Promise.resolve(null),
            awayPitcher?.id ? mlbApi.getEnhancedPitcherStats(awayPitcher.id) : Promise.resolve(null)
        ]);
        return {
            home: homeEnhanced.status === 'fulfilled' ? homeEnhanced.value : null,
            away: awayEnhanced.status === 'fulfilled' ? awayEnhanced.value : null
        };
    }

    buildPitcherTrendHTML(enhancedStats) {
        if (!enhancedStats?.gameLogs?.length) return '';
        const logs = enhancedStats.gameLogs;
        const dots = logs.map(g => {
            const cls = g.homeRuns >= 2 ? 'dot-bad' : g.homeRuns === 1 ? 'dot-avg' : 'dot-good';
            const opp = g.opponent ? g.opponent.split(' ').pop() : '';
            return `<span class="trend-dot ${cls}" title="vs ${opp}: ${g.homeRuns} HR allowed">${g.homeRuns}</span>`;
        }).join('');
        const season = enhancedStats.seasonStats;
        const extraStats = season ? `
            <span class="trend-stat">WHIP <strong>${season.whip.toFixed(2)}</strong></span>
            <span class="trend-stat">K/9 <strong>${season.strikeoutsPer9.toFixed(1)}</strong></span>
            <span class="trend-stat">BB/9 <strong>${season.walksPer9.toFixed(1)}</strong></span>
        ` : '';
        return `<div class="pitcher-trend">
            <div class="trend-row">
                <span class="trend-label">Last ${logs.length} starts:</span>
                <div class="trend-dots">${dots}</div>
            </div>
            ${extraStats ? `<div class="trend-extra">${extraStats}</div>` : ''}
        </div>`;
    }

    // ─── STORAGE ──────────────────────────────────────────────────────────────────

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
