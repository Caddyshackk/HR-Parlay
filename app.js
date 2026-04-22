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
        this.weatherCache = {}; // parkAbbr → { weather, impact }
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
        // Build best picks when switching to that tab
        if (tabName === 'best') this.buildBestPicksTab();
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
                const cached = this.weatherCache[homeAbbr];
                const tempStr = cached?.weather ? `${cached.weather.tempF}°` : '';
                const windStr = cached?.weather ? `${cached.weather.windMph}mph` : '';
                const wIcon   = cached?.weather ? weatherApi.weatherIcon(cached.weather.weatherCode) : '';
                chipMetaHTML = `
                    <div class="chip-meta">
                        <span class="chip-time">${timeStr}</span>
                        <span class="park-badge ${parkClass}" style="font-size:0.6rem;padding:0.1rem 0.3rem;">${parkInfo.factor}</span>
                        ${tempStr ? `<span class="chip-weather">${wIcon}${tempStr}</span>` : ''}
                    </div>`;
            }

            const hasPick = this.currentParlay.some(p =>
                p.game && (p.game.includes(game.teams.home.team.abbreviation) || p.game.includes(game.teams.home.team.name))
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
                <div class="pitcher-matchup-section">
                    <div class="section-label">⚾ Starting Pitchers</div>

                    <div class="pitcher-card ${awayQualityClass}">
                        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.4rem;">
                            <div>
                                <span class="pitcher-name">${awayPitcher.fullName}</span>
                                <span class="hand-badge ${awayHand === 'L' ? 'hand-left' : 'hand-right'}">${awayHand}HP</span>
                            </div>
                            <div class="pitcher-quality ${awayQualityClass === 'pitcher-favorable' ? 'quality-great' : awayQualityClass === 'pitcher-tough' ? 'quality-tough' : 'quality-average'}">${awayHR9Quality}</div>
                        </div>
                        <div class="pitcher-team" style="margin-bottom:0.4rem;">${game.teams.away.team.name}</div>
                        <div style="display:flex;gap:1.5rem;">
                            <div class="pitcher-stat-item">
                                <div class="pitcher-stat-label">ERA</div>
                                <div class="pitcher-stat-value">${awayPitcherERA.toFixed(2)}</div>
                            </div>
                            <div class="pitcher-stat-item">
                                <div class="pitcher-stat-label">HR/9</div>
                                <div class="pitcher-stat-value">${awayPitcherHR9.toFixed(2)}</div>
                            </div>
                        </div>
                        <div class="platoon-info">${awayHand === 'L' ? '💡 Righty batters have better matchup' : '💡 Lefty batters have better matchup'}</div>
                    </div>

                    <div class="pitcher-vs">VS</div>

                    <div class="pitcher-card ${homeQualityClass}">
                        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.4rem;">
                            <div>
                                <span class="pitcher-name">${homePitcher.fullName}</span>
                                <span class="hand-badge ${homeHand === 'L' ? 'hand-left' : 'hand-right'}">${homeHand}HP</span>
                            </div>
                            <div class="pitcher-quality ${homeQualityClass === 'pitcher-favorable' ? 'quality-great' : homeQualityClass === 'pitcher-tough' ? 'quality-tough' : 'quality-average'}">${homeHR9Quality}</div>
                        </div>
                        <div class="pitcher-team" style="margin-bottom:0.4rem;">${game.teams.home.team.name}</div>
                        <div style="display:flex;gap:1.5rem;">
                            <div class="pitcher-stat-item">
                                <div class="pitcher-stat-label">ERA</div>
                                <div class="pitcher-stat-value">${homePitcherERA.toFixed(2)}</div>
                            </div>
                            <div class="pitcher-stat-item">
                                <div class="pitcher-stat-label">HR/9</div>
                                <div class="pitcher-stat-value">${homePitcherHR9.toFixed(2)}</div>
                            </div>
                        </div>
                        <div class="platoon-info">${homeHand === 'L' ? '💡 Righty batters have better matchup' : '💡 Lefty batters have better matchup'}</div>
                    </div>
                </div>
            `;
        }
        
        gameCard.innerHTML = `
            <div class="game-header">
                <div class="game-teams">${game.teams.away.team.abbreviation} <span style="color:var(--text-muted);font-weight:400;">@</span> ${game.teams.home.team.abbreviation}<div class="game-time" style="font-size:0.72rem;color:var(--text-muted);font-weight:400;">${game.teams.away.team.name} @ ${game.teams.home.team.name}</div></div>
                <div class="park-factor">
                    <span class="park-badge ${parkClass}">${parkInfo.factor}</span>
                </div>
            </div>
            <div class="park-info">
                <div class="park-name-row">
                    <span>📍 ${parkInfo.name}</span>
                    <span class="park-badge ${parkClass}">${parkLabel}</span>
                    <span class="park-boost ${parkInfo.factor > 100 ? 'positive' : parkInfo.factor < 100 ? 'negative' : ''}">${hrBoost}</span>
                </div>
                ${parkInfo.notes ? `<div style="margin-top:0.3rem;font-size:0.68rem;color:var(--text-muted);">💡 ${parkInfo.notes}</div>` : ''}
            </div>
            <div id="weather-${game.gamePk}" class="weather-panel weather-loading">
                <span class="weather-spinner">🌡️</span> Loading weather...
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

        // Fetch weather async and inject into card
        this.loadGameWeather(game, homeTeam);

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
        const homeName = game.teams.home.team.name;
        const awayName = game.teams.away.team.name;
        const awayPitcher = game.teams.away.probablePitcher;
        const homePitcher = game.teams.home.probablePitcher;

        container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:1rem;">Loading players...</p>';

        const [homePlayers, awayPlayers] = await Promise.all([
            mlbApi.getRealTeamHitters(homeTeamId, homeTeam, awayPitcher),
            mlbApi.getRealTeamHitters(awayTeamId, awayTeam, homePitcher)
        ]);

        const weatherData = this.weatherCache[homeTeam] || null;
        const weatherScore = weatherData?.impact?.score ?? 0;

        const processPlayers = (players, team, teamName) =>
            players.map(p => ({ ...p, team, teamName }))
                .map(player => {
                    const rec = calculateRecommendationWithWeather(
                        parkFactor, player.seasonHRs, player.last7HRs,
                        player.pitcher, weatherScore, player.gamesPlayed || 0
                    );
                    return { ...player, recommendation: rec, parkFactor };
                })
                .filter(p => p.recommendation)
                .sort((a, b) => b.recommendation.score - a.recommendation.score);

        const homeWithRecs = processPlayers(homePlayers, homeTeam, homeName);
        const awayWithRecs = processPlayers(awayPlayers, awayTeam, awayName);

        if (homeWithRecs.length === 0 && awayWithRecs.length === 0) {
            container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:1rem;">No picks available</p>';
            return;
        }

        const gpk = game.gamePk;

        // Build team tab UI
        container.innerHTML = `
            <div class="team-tabs-nav">
                <button class="team-tab-btn active" onclick="app.switchTeamTab(event, ${gpk}, 'away')">${awayTeam} Batters</button>
                <button class="team-tab-btn" onclick="app.switchTeamTab(event, ${gpk}, 'home')">${homeTeam} Batters</button>
            </div>
            <div class="team-players-pane active" id="team-pane-${gpk}-away"></div>
            <div class="team-players-pane" id="team-pane-${gpk}-home"></div>
        `;

        // Render away team
        const awayPane = document.getElementById(`team-pane-${gpk}-away`);
        const awayWrap = document.createElement('div');
        awayWrap.className = 'players-list';
        awayWithRecs.forEach(p => this.renderPlayer(p, awayWrap, game));
        awayPane.appendChild(awayWrap);

        // Render home team
        const homePane = document.getElementById(`team-pane-${gpk}-home`);
        const homeWrap = document.createElement('div');
        homeWrap.className = 'players-list';
        homeWithRecs.forEach(p => this.renderPlayer(p, homeWrap, game));
        homePane.appendChild(homeWrap);
    }

    switchTeamTab(event, gamePk, team) {
        event.stopPropagation();
        const nav = event.target.closest('.team-tabs-nav');
        nav.querySelectorAll('.team-tab-btn').forEach(b => b.classList.remove('active'));
        event.target.classList.add('active');
        document.getElementById(`team-pane-${gamePk}-away`).classList.toggle('active', team === 'away');
        document.getElementById(`team-pane-${gamePk}-home`).classList.toggle('active', team === 'home');
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
            <div class="player-info" style="flex:1;">
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
                            <span class="stat-value">${player.displayHRs ?? player.seasonHRs}${player.earlySeasonProjected ? '<span style="font-size:0.6rem;color:var(--text-muted);margin-left:2px;" title="Projected pace">~</span>' : ''}</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">HR Pace</span>
                            <span class="stat-value">${player.gamesPlayed > 0 ? (player.seasonHRs / player.gamesPlayed).toFixed(2) : '—'}</span>
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
                    <div class="score-breakdown">
                        <div style="font-weight: 600; margin-bottom: 0.5rem; color: var(--text); display: flex; justify-content: space-between;">
                            <span>Confidence Score</span>
                            <span style="color: var(--accent);">${rec.score}/17</span>
                        </div>
                        <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 0.5rem; font-size: 0.75rem;">
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
                        <div>
                            <div style="color: var(--text-muted);">Weather</div>
                            <div style="color: var(--text); font-weight: 600;">${rec.breakdown.weather ?? 0}</div>
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
            <div class="card-bottom">
                <div class="recommendation ${rec.class}">
                    ${rec.label}
                </div>
                <div class="card-add-buttons">
                    <button class="add-bet-btn add-hr-btn ${this.currentParlay.some(p => p.id === player.id && p.betType === 'HR') ? 'btn-added' : ''}"
                        onclick="app.addBet(event, ${player.id}, 'HR', '${game.teams.away.team.name} @ ${game.teams.home.team.name}', '${game.gameDate}')">
                        ${this.currentParlay.some(p => p.id === player.id && p.betType === 'HR') ? '✓ HR' : '⚾ HR'}
                    </button>
                    <button class="add-bet-btn add-xbh-btn ${this.currentParlay.some(p => p.id === player.id && p.betType === 'XBH') ? 'btn-added' : ''}"
                        onclick="app.addBet(event, ${player.id}, 'XBH', '${game.teams.away.team.name} @ ${game.teams.home.team.name}', '${game.gameDate}')">
                        ${this.currentParlay.some(p => p.id === player.id && p.betType === 'XBH') ? '✓ XBH' : '📊 XBH'}
                    </button>
                </div>
            </div>
        `;

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
            const statsEl   = document.getElementById(`adv-stats-${cardId}`);
            const loadingEl = document.getElementById(`adv-loading-${cardId}`);

            if (statsEl.dataset.loaded !== 'true') {
                // Look up full player object from mlbApi cache
                let cachedPlayer = null;
                if (mlbApi._cache) {
                    for (const key of Object.keys(mlbApi._cache)) {
                        if (!key.startsWith('hitters_')) continue;
                        const found = mlbApi._cache[key].data?.find(p => p.id === playerId);
                        if (found) { cachedPlayer = found; break; }
                    }
                }

                const xbhHTML = cachedPlayer ? this.buildXBHStatsHTML(cachedPlayer) : '';

                mlbApi.getAdvancedStats(playerId).then(stats => {
                    loadingEl.style.display = 'none';
                    statsEl.style.display = '';
                    statsEl.innerHTML = xbhHTML + this.buildAdvancedStatsHTML(stats);
                    statsEl.dataset.loaded = 'true';
                }).catch(() => {
                    loadingEl.style.display = 'none';
                    statsEl.style.display = '';
                    statsEl.innerHTML = xbhHTML + '<div class="adv-unavailable"><div class="adv-unavailable-sub">Statcast data unavailable</div></div>';
                    statsEl.dataset.loaded = 'true';
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

    buildXBHStatsHTML(player) {
        const hrs  = player.displayHRs ?? player.seasonHRs ?? 0;
        const xbh  = player.xbh ?? 0;
        const dbl  = player.doubles ?? 0;
        const trp  = player.triples ?? 0;
        const gp   = player.gamesPlayed || 0;
        const ab   = player.atBats || 0;

        const xbhPerGame = gp > 0 ? (xbh / gp).toFixed(2) : '—';
        const hrPct  = ab > 0 ? ((hrs / ab) * 100).toFixed(1) : '—';
        const xbhPct = ab > 0 ? ((xbh / ab) * 100).toFixed(1) : '—';

        const xbhClass = xbh >= 40 ? 'adv-great' : xbh >= 25 ? 'adv-good' : 'adv-avg';
        const hrClass  = hrs >= 20 ? 'adv-great' : hrs >= 10 ? 'adv-good' : 'adv-avg';

        return `
            <div class="adv-section-label">💥 Extra Base Hits</div>
            <div class="adv-grid">
                <div class="adv-stat">
                    <div class="adv-val ${xbhClass}">${xbh}</div>
                    <div class="adv-lbl">Total XBH</div>
                </div>
                <div class="adv-stat">
                    <div class="adv-val ${hrClass}">${hrs}</div>
                    <div class="adv-lbl">Home Runs</div>
                </div>
                <div class="adv-stat">
                    <div class="adv-val">${dbl}</div>
                    <div class="adv-lbl">Doubles</div>
                </div>
                <div class="adv-stat">
                    <div class="adv-val">${trp}</div>
                    <div class="adv-lbl">Triples</div>
                </div>
                <div class="adv-stat">
                    <div class="adv-val">${xbhPerGame}</div>
                    <div class="adv-lbl">XBH/Game</div>
                </div>
                <div class="adv-stat">
                    <div class="adv-val">${xbhPct}%</div>
                    <div class="adv-lbl">XBH Rate</div>
                </div>
            </div>
            <div class="adv-pa-note">XBH = HR + 2B + 3B · ${gp} games played · ${ab} at bats</div>
        `;
    }

    async loadGameWeather(game, parkAbbr) {
        const el = document.getElementById(`weather-${game.gamePk}`);
        if (!el) return;

        try {
            const weather = await weatherApi.getParkWeather(parkAbbr);
            if (!weather) {
                el.className = 'weather-panel weather-unavailable';
                el.innerHTML = '🌡️ Weather unavailable';
                return;
            }
            const impact = weatherApi.calcWeatherImpact(weather, parkAbbr);

            // Cache so loadPlayersForGame can use it
            this.weatherCache[parkAbbr] = { weather, impact };

            el.className = `weather-panel weather-impact-${impact.score >= 2 ? 'great' : impact.score >= 1 ? 'good' : impact.score <= -2 ? 'bad' : impact.score <= -1 ? 'poor' : 'neutral'}`;
            el.innerHTML = this.buildWeatherHTML(weather, impact, parkAbbr);

            // Re-render strip chips to show temp
            if (this.games) this.renderGameStrip(this.games);

            // Re-render players now that we have weather
            this.loadPlayersForGame(game, getParkFactor(parkAbbr)?.factor || 100);
        } catch (e) {
            if (el) { el.className = 'weather-panel weather-unavailable'; el.innerHTML = '🌡️ Weather unavailable'; }
        }
    }

    buildWeatherHTML(weather, impact, parkAbbr) {
        const icon = weatherApi.weatherIcon(weather.weatherCode);
        const windDirLabel = this.windDirLabel(weather.windDir);
        const impactColor = impact.score >= 2 ? 'var(--neon-green)' : impact.score >= 1 ? '#a8d8a8' : impact.score <= -2 ? '#c8743a' : impact.score <= -1 ? '#e8a050' : 'var(--text-muted)';

        const detailsHTML = impact.details.map(d => `
            <span class="weather-detail ${d.positive === true ? 'detail-pos' : d.positive === false ? 'detail-neg' : 'detail-neu'}">
                ${d.icon} ${d.text}
            </span>`).join('');

        return `
            <div class="weather-top">
                <div class="weather-conditions">
                    <span class="weather-icon-big">${icon}</span>
                    <div class="weather-nums">
                        <span class="weather-temp">${weather.tempF}°F</span>
                        <span class="weather-humidity">💧 ${weather.humidity}%</span>
                    </div>
                    <div class="weather-wind">
                        <span class="weather-wind-speed">💨 ${weather.windMph} mph</span>
                        <span class="weather-wind-dir">${windDirLabel}</span>
                    </div>
                </div>
                <div class="weather-impact-badge" style="color:${impactColor}">
                    ${impact.label}
                </div>
            </div>
            <div class="weather-details">${detailsHTML}</div>
        `;
    }

    windDirLabel(deg) {
        const dirs = ['N','NE','E','SE','S','SW','W','NW'];
        return dirs[Math.round(deg / 45) % 8];
    }

    async buildBestPicksTab() {
        const container = document.getElementById('bestPicksContainer');
        if (!container) return;

        if (!this.games || this.games.length === 0) {
            container.innerHTML = `<div class="empty-state"><p>⭐ No games loaded yet</p><p class="hint">Load today's picks first</p></div>`;
            return;
        }

        container.innerHTML = `<div class="best-picks-loading"><span>⭐</span> Gathering best picks across all games...</div>`;

        const allPicks = [];

        for (const game of this.games) {
            try {
                const homeAbbr = game.teams.home.team.abbreviation;
                const awayAbbr = game.teams.away.team.abbreviation;
                const homeTeamId = game.teams.home.team.id;
                const awayTeamId = game.teams.away.team.id;
                const awayPitcher = game.teams.away.probablePitcher;
                const homePitcher = game.teams.home.probablePitcher;
                const parkInfo = getParkFactor(homeAbbr);
                const weatherData = this.weatherCache[homeAbbr] || null;
                const weatherScore = weatherData?.impact?.score ?? 0;

                const [homePlayers, awayPlayers] = await Promise.all([
                    mlbApi.getRealTeamHitters(homeTeamId, homeAbbr, awayPitcher),
                    mlbApi.getRealTeamHitters(awayTeamId, awayAbbr, homePitcher)
                ]);

                const players = [
                    ...homePlayers.map(p => ({ ...p, team: homeAbbr, teamName: game.teams.home.team.name })),
                    ...awayPlayers.map(p => ({ ...p, team: awayAbbr, teamName: game.teams.away.team.name }))
                ];

                players.forEach(player => {
                    const rec = calculateRecommendationWithWeather(
                        parkInfo.factor, player.seasonHRs, player.last7HRs,
                        player.pitcher, weatherScore, player.gamesPlayed || 0
                    );
                    if (rec) {
                        // Data quality: how confident are we in this player's stats?
                        const dataQuality = player.atBats >= 80 ? 'high'
                            : player.atBats >= 30 ? 'medium' : 'low';

                        allPicks.push({
                            ...player,
                            recommendation: rec,
                            parkFactor: parkInfo.factor,
                            parkName: parkInfo.name,
                            weatherImpact: weatherData?.impact || null,
                            gameLabel: `${awayAbbr} @ ${homeAbbr}`,
                            dataQuality
                        });
                    }
                });
            } catch (e) { continue; }
        }

        allPicks.sort((a, b) => b.recommendation.score - a.recommendation.score);

        if (allPicks.length === 0) {
            container.innerHTML = `<div class="empty-state"><p>⭐ No picks found today</p></div>`;
            return;
        }

        // Store for filtering — reset filters on fresh load
        this._allBestPicks = allPicks;
        this._bpFilters = { minScore: 0, parkOnly: false, qualityOnly: false, team: 'all' };
        this.renderBestPicksList(container, allPicks);
    }

    renderBestPicksList(container, allPicks) {
        const f = this._bpFilters || { minScore: 0, parkOnly: false, qualityOnly: false, team: 'all' };
        const teams = [...new Set(allPicks.map(p => p.team))].sort();

        // Apply all filters
        let filtered = allPicks.filter(p => {
            if (f.team !== 'all' && p.team !== f.team) return false;
            if (f.minScore > 0 && (p.recommendation?.score || 0) < f.minScore) return false;
            if (f.parkOnly && p.parkFactor <= 100) return false;
            if (f.qualityOnly && p.dataQuality !== 'high') return false;
            return true;
        });

        const shown = filtered.slice(0, 30);
        const activeFilters = [f.parkOnly, f.qualityOnly, f.minScore > 0, f.team !== 'all'].filter(Boolean).length;

        container.innerHTML = `
            <div class="bp-header-row">
                <span class="best-picks-title">⭐ Top Picks Today</span>
                <span class="best-picks-sub">${shown.length} of ${allPicks.length} players</span>
            </div>

            <div class="bp-filters-bar">
                <!-- Confidence threshold -->
                <div class="bp-filter-group">
                    <span class="bp-filter-label">Min Score</span>
                    <div class="bp-chip-group">
                        ${[0, 10, 12, 14].map(v => `
                            <button class="bp-chip ${f.minScore === v ? 'active' : ''}"
                                onclick="app.setBpFilter('minScore', ${v})">
                                ${v === 0 ? 'Any' : `${v}+`}
                            </button>`).join('')}
                    </div>
                </div>

                <!-- Park factor -->
                <div class="bp-filter-group">
                    <button class="bp-toggle ${f.parkOnly ? 'active' : ''}"
                        onclick="app.setBpFilter('parkOnly', ${!f.parkOnly})">
                        🏟 Hitter Parks Only
                    </button>
                </div>

                <!-- Data quality -->
                <div class="bp-filter-group">
                    <button class="bp-toggle ${f.qualityOnly ? 'active' : ''}"
                        onclick="app.setBpFilter('qualityOnly', ${!f.qualityOnly})">
                        ✅ High Confidence Only
                    </button>
                </div>

                <!-- Team filter -->
                <div class="bp-filter-group">
                    <select class="team-filter-select" onchange="app.setBpFilter('team', this.value)">
                        <option value="all">All Teams</option>
                        ${teams.map(t => `<option value="${t}" ${t === f.team ? 'selected' : ''}>${t}</option>`).join('')}
                    </select>
                </div>

                ${activeFilters > 0 ? `
                    <button class="bp-clear-btn" onclick="app.clearBpFilters()">
                        ✕ Clear (${activeFilters})
                    </button>` : ''}
            </div>

            <div class="data-quality-note">
                <span class="dq-dot dq-high"></span> 80+ ABs
                <span class="dq-dot dq-medium" style="margin-left:0.5rem;"></span> 30–79 ABs
                <span class="dq-dot dq-low" style="margin-left:0.5rem;"></span> &lt;30 ABs (estimated)
            </div>

            ${shown.length === 0
                ? `<div class="empty-state" style="padding:1.5rem;"><p>No picks match these filters</p><p class="hint">Try loosening the criteria above</p></div>`
                : shown.map((player, idx) => this.renderBestPickRow(player, idx)).join('')
            }
        `;
    }

    setBpFilter(key, value) {
        if (!this._bpFilters) this._bpFilters = { minScore: 0, parkOnly: false, qualityOnly: false, team: 'all' };
        this._bpFilters[key] = value;
        const container = document.getElementById('bestPicksContainer');
        if (container && this._allBestPicks) this.renderBestPicksList(container, this._allBestPicks);
    }

    clearBpFilters() {
        this._bpFilters = { minScore: 0, parkOnly: false, qualityOnly: false, team: 'all' };
        const container = document.getElementById('bestPicksContainer');
        if (container && this._allBestPicks) this.renderBestPicksList(container, this._allBestPicks);
    }

    filterBestPicks(team) {
        this.setBpFilter('team', team);
    }

    renderBestPickRow(player, idx) {
        const rec = player.recommendation;
        const isSelected = this.currentParlay.some(p => p.id === player.id);
        const tierClass = rec.class === 'elite' ? 'best-row-elite' : rec.class === 'top-pick' ? 'best-row-top' : 'best-row-good';
        const matchupLabel = player.pitcher
            ? `vs ${player.pitcher.name.split(' ').pop()} (${player.pitcher.hand}HP)`
            : '';
        const weatherStr = player.weatherImpact && player.weatherImpact.score !== 0
            ? `<span class="best-weather ${player.weatherImpact.score > 0 ? 'best-weather-pos' : 'best-weather-neg'}">${player.weatherImpact.score > 0 ? '⚡' : '⚠️'} ${player.weatherImpact.label.replace(/^[^ ]+ /, '')}</span>`
            : '';

        return `<div class="best-pick-row ${tierClass} ${isSelected ? 'best-row-selected' : ''}"
                     onclick="app.quickAddFromBest(${JSON.stringify(player.id)}, '${player.gameLabel}')">
            <div class="best-rank">${idx + 1}</div>
            <div class="best-info">
                <div class="best-name">
                    ${player.name}
                    <span class="dq-dot dq-${player.dataQuality || 'low'}" title="${player.dataQuality === 'high' ? 'Strong data (80+ ABs)' : player.dataQuality === 'medium' ? 'Limited sample (30-79 ABs)' : 'Early season estimate (<30 ABs)'}"></span>
                </div>
                <div class="best-meta">
                    <span class="best-team">${player.teamName}</span>
                    <span class="best-game">${player.gameLabel}</span>
                    ${matchupLabel ? `<span class="best-matchup">${matchupLabel}</span>` : ''}
                </div>
                <div class="best-stats-row">
                    <span class="best-stat"><span class="best-stat-lbl">HRs</span> ${player.displayHRs ?? player.seasonHRs}</span>
                    <span class="best-stat"><span class="best-stat-lbl">L7</span> ${player.last7HRs}</span>
                    <span class="best-stat"><span class="best-stat-lbl">AVG</span> ${player.avg}</span>
                    <span class="best-stat"><span class="best-stat-lbl">Park</span> ${player.parkFactor}</span>
                </div>
                ${weatherStr}
            </div>
            <div class="best-score-col">
                <div class="best-score">${rec.score}</div>
                <div class="best-score-lbl">/ 17</div>
                <div class="best-rec-badge ${rec.class}">${isSelected ? '✓ Added' : rec.label}</div>
            </div>
        </div>`;
    }

    quickAddFromBest(playerId, gameLabel) {
        // Find player from cached game data and toggle
        for (const game of this.games || []) {
            const allCached = [
                ...(mlbApi._cache?.[`hitters_${game.teams.home.team.id}`]?.data || []),
                ...(mlbApi._cache?.[`hitters_${game.teams.away.team.id}`]?.data || [])
            ];
            const player = allCached.find(p => p.id === playerId);
            if (player) {
                this.togglePlayer({
                    ...player,
                    game: gameLabel,
                    gameDate: game.gameDate,
                    teamName: player.teamName || '',
                    parkFactor: getParkFactor(game.teams.home.team.abbreviation)?.factor || 100,
                    recommendation: player.recommendation
                });
                // Re-render best picks to update selected state
                this.buildBestPicksTab();
                return;
            }
        }
    }

    addBet(event, playerId, betType, gameLabel, gameDate) {
        event.stopPropagation();

        // Find player from cached data
        let foundPlayer = null;
        for (const game of this.games || []) {
            const homeCache = mlbApi._cache?.[`hitters_${game.teams.home.team.id}`]?.data || [];
            const awayCache = mlbApi._cache?.[`hitters_${game.teams.away.team.id}`]?.data || [];
            foundPlayer = [...homeCache, ...awayCache].find(p => p.id === playerId);
            if (foundPlayer) break;
        }
        if (!foundPlayer) return;

        // Check if this exact player+betType combo already exists
        const existingIndex = this.currentParlay.findIndex(p => p.id === playerId && p.betType === betType);
        if (existingIndex > -1) {
            // Remove it
            this.currentParlay.splice(existingIndex, 1);
        } else {
            // Add with bet type
            this.currentParlay.push({
                ...foundPlayer,
                betType,
                game: gameLabel,
                gameDate,
            });
        }

        this.updateParlayDisplay();
        if (this.games && this.games.length > 0) {
            this.renderGameStrip(this.games);
            this.selectGame(this.activeGamePk || this.games[0].gamePk);
        }
    }

    togglePlayer(player) {
        // Legacy method — used by best picks tab
        const betType = player.betType || 'HR';
        const index = this.currentParlay.findIndex(p => p.id === player.id && p.betType === betType);
        if (index > -1) {
            this.currentParlay.splice(index, 1);
        } else {
            this.currentParlay.push({ ...player, betType });
        }
        this.updateParlayDisplay();
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
                        <div class="parlay-player">
                            ${player.name}
                            <span class="bet-type-badge bet-type-${(player.betType || 'HR').toLowerCase()}">${player.betType || 'HR'}</span>
                        </div>
                        <div class="parlay-game">${player.game}</div>
                        <div style="margin-top: 0.25rem; font-size: 0.8rem; color: var(--text-muted);">
                            ${player.displayHRs ?? player.seasonHRs} HRs · XBH: ${player.xbh || '—'} | Park: ${player.parkFactor}
                        </div>
                    </div>
                    <button class="remove-btn" data-id="${player.id}-${player.betType || 'HR'}">Remove</button>
                `;

                item.querySelector('.remove-btn').addEventListener('click', (e) => {
                    e.stopPropagation();
                    const betType = player.betType || 'HR';
                    const idx = this.currentParlay.findIndex(p => p.id === player.id && p.betType === betType);
                    if (idx > -1) this.currentParlay.splice(idx, 1);
                    this.updateParlayDisplay();
                    if (this.games?.length > 0) {
                        this.renderGameStrip(this.games);
                        this.selectGame(this.activeGamePk || this.games[0].gamePk);
                    }
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

// Weather-aware wrapper for calculateRecommendation
// Recommendation wrapper — preserves original scoring range, adds weather + relative form
// Original parkFactors.js: park(0-4) + power(0-4) + form(0-4) + matchup(0-5) = 0-17
// Our additions: replace form with relative pace, add weather nudge
const _originalCalcRec = typeof calculateRecommendation === 'function' ? calculateRecommendation : null;
function calculateRecommendationWithWeather(parkFactor, seasonHRs, last7HRs, pitcher, weatherScore = 0, gamesPlayed = 0) {
    const rec = _originalCalcRec
        ? _originalCalcRec(parkFactor, seasonHRs, last7HRs, pitcher)
        : { score: 0, label: 'N/A', class: '', breakdown: {}, bonuses: [] };

    if (!rec) return rec;

    const breakdown = rec.breakdown || {};

    // ── Park: keep original score (0-4) — don't suppress it ──────────────────
    const parkAdj = breakdown.park || 0;

    // ── Power: keep full weight (0-4) ────────────────────────────────────────
    const powerAdj = breakdown.power || 0;

    // ── Form: season HR pace vs league average ────────────────────────────────
    // League average is ~0.14 HR/game (≈23 HRs over 162 games)
    // This is always available and meaningful regardless of API lag
    let formAdj = 0;
    const gp = Math.max(gamesPlayed || 1, 1);
    const hrPace = seasonHRs / gp; // HRs per game this season

    if      (hrPace >= 0.30) formAdj = 4;  // Elite: 49+ HR pace
    else if (hrPace >= 0.22) formAdj = 3;  // Great: 36+ HR pace
    else if (hrPace >= 0.15) formAdj = 2;  // Good:  24+ HR pace
    else if (hrPace >= 0.09) formAdj = 1;  // Average: 15+ HR pace
    else                     formAdj = 0;  // Below average

    // ── Matchup: keep original score (0-5), no artificial boost or cap ───────
    // The original already differentiates weak/average/tough pitchers well
    const matchupAdj = breakdown.matchup || 0;

    // ── Weather: minor nudge only (-1 / 0 / +1) ──────────────────────────────
    const weatherAdj = weatherScore >= 2 ? 1 : weatherScore <= -2 ? -1 : 0;

    // Total: park(0-4) + power(0-4) + form(0-4) + matchup(0-5) + weather(-1/0/+1) = 0-18, clamp 17
    const newScore = Math.min(17, Math.max(0,
        parkAdj + powerAdj + formAdj + matchupAdj + weatherAdj
    ));

    const formLabel = formAdj >= 4 ? '🔥 Elite HR pace'
                    : formAdj >= 3 ? '📈 Great HR pace'
                    : formAdj >= 2 ? '✅ Good HR pace'
                    : formAdj >= 1 ? 'Average pace'
                    : '📉 Below average pace';

    const weatherBonus = weatherAdj >= 1 ? [{ icon: '⚡', text: 'Favorable weather', type: 'good' }]
                       : weatherAdj <= -1 ? [{ icon: '⚠️', text: 'Weather hurts power', type: 'bad' }]
                       : [];
    const formBonus = formAdj >= 3
        ? [{ icon: formAdj >= 4 ? '🔥' : '📈', text: formLabel, type: 'good' }]
        : formAdj === 0
        ? [{ icon: '📉', text: 'Below average pace', type: 'bad' }]
        : [];

    return {
        ...rec,
        score: newScore,
        bonuses: [...(rec.bonuses || []), ...weatherBonus, ...formBonus],
        breakdown: {
            park:    parkAdj,
            power:   powerAdj,
            form:    formAdj,
            matchup: matchupAdj,
            weather: weatherAdj
        }
    };
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new HRParlayApp();
});
