// Main App Logic
class HRParlayApp {
    constructor() {
        this.currentParlay = [];
        this.savedParlays = this.loadParlays();
        this.games = [];
        this.init();
    }

    async init() {
        this.setupEventListeners();
        this.updateDate();
        await this.loadGames();
        this.renderHistory();
    }

    setupEventListeners() {
        // Tab navigation
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
        });

        // Parlay actions
        document.getElementById('saveParlayBtn').addEventListener('click', () => this.saveParlay());
        document.getElementById('clearParlayBtn').addEventListener('click', () => this.clearParlay());
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
        
        loading.style.display = 'block';
        container.innerHTML = '';

        try {
            this.games = await mlbApi.getTodaysGames();
            
            if (this.games.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <p>⚾ No games today</p>
                        <p class="hint">Check back during the season!</p>
                    </div>
                `;
            } else {
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

    renderGame(game) {
        const container = document.getElementById('gamesContainer');
        const homeTeam = game.teams.home.team.abbreviation;
        const awayTeam = game.teams.away.team.abbreviation;
        
        const parkInfo = getParkFactor(homeTeam);
        const parkClass = getParkClass(parkInfo.factor);
        const parkLabel = getParkLabel(parkInfo.factor);

        const gameCard = document.createElement('div');
        gameCard.className = 'game-card';
        gameCard.innerHTML = `
            <div class="game-header">
                <div class="matchup">
                    ${game.teams.away.team.name} @ ${game.teams.home.team.name}
                </div>
                <div class="park-factor">
                    <span class="park-badge ${parkClass}">${parkInfo.factor}</span>
                </div>
            </div>
            <div class="park-info" style="padding: 0.5rem 1rem; background: rgba(0,0,0,0.2); font-size: 0.85rem; color: var(--text-muted);">
                📍 ${parkInfo.name} ${parkLabel}
            </div>
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

        // Get top hitters from both teams
        const homePlayers = mlbApi.getMockTopHitters(homeTeam);
        const awayPlayers = mlbApi.getMockTopHitters(awayTeam);

        // Combine and sort by recommendation
        const allPlayers = [
            ...homePlayers.map(p => ({ ...p, team: homeTeam, teamName: game.teams.home.team.name })),
            ...awayPlayers.map(p => ({ ...p, team: awayTeam, teamName: game.teams.away.team.name }))
        ];

        // Calculate recommendations and sort
        const playersWithRecs = allPlayers.map(player => {
            const rec = calculateRecommendation(parkFactor, player.seasonHRs, player.last7HRs);
            return { ...player, recommendation: rec, parkFactor };
        }).filter(p => p.recommendation) // Only show players with recommendations
          .sort((a, b) => {
              const order = { strong: 0, good: 1, value: 2 };
              return order[a.recommendation.class] - order[b.recommendation.class];
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
        
        const playerCard = document.createElement('div');
        playerCard.className = `player-card ${isSelected ? 'selected' : ''}`;
        playerCard.innerHTML = `
            <div class="player-info">
                <div class="player-name">${player.name}</div>
                <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.5rem;">
                    ${player.teamName}
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
            </div>
            <div class="recommendation ${player.recommendation.class}">
                ${player.recommendation.label}
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
