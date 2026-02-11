# ⚾ HR Parlay Builder - MLB Home Run Parlay Generator

A mobile-first Progressive Web App for generating MLB home run parlays based on park factors and player performance.

## Features

✅ **Real-time MLB Games** - Fetches today's games from the free MLB Stats API  
✅ **Park Factor Analysis** - Uses 2025 Baseball Savant park factors (100 = average)  
✅ **Smart Recommendations** - Calculates pick strength based on:
- Park factor (hitter's vs pitcher's parks)
- Season home run total
- Recent performance (last 7 days)

✅ **Interactive Parlay Builder** - Tap to add/remove players  
✅ **History Tracking** - Save and review past parlays  
✅ **Offline Support** - Works without internet after first load  
✅ **Installable** - Add to home screen on iOS/Android  

## How It Works

### Park Factors (2025)
Based on Baseball Savant data where 100 = league average:

**Top Hitter's Parks:**
- Great American Ball Park (CIN): 118 🔥
- Coors Field (COL): 115 🔥
- loanDepot Park (MIA): 112 🔥
- Citizens Bank Park (PHI): 111 🔥
- Yankee Stadium (NYY): 110 🔥

**Top Pitcher's Parks:**
- Oracle Park (SF): 76 ❄️
- Oakland Coliseum (OAK): 87 ❄️
- Chase Field (ARI): 88 ❄️
- Kauffman Stadium (KC): 89 ❄️

### Recommendation System

**⭐ STRONG** (8+ points)
- Great park factor (110+)
- High season HRs (25+)
- Hot recent form (3+ HRs last 7 days)

**✓ GOOD** (5-7 points)
- Good park factor (105+)
- Solid season total (15+)
- Some recent production (2+ HRs)

**💎 VALUE** (3-4 points)
- Decent park factor (100+)
- Moderate power (8+ HRs)
- Recent homer (1+)

## Deployment Options

### Option 1: GitHub Pages (Recommended - Free!)

1. Create a GitHub account if you don't have one
2. Create a new repository (e.g., "hr-parlay-app")
3. Upload all files to the repository
4. Go to Settings → Pages
5. Select "main" branch as source
6. Your app will be live at: `https://yourusername.github.io/hr-parlay-app`

### Option 2: Netlify (Also Free!)

1. Create a Netlify account
2. Drag and drop the entire folder
3. Your app is live instantly with a custom URL
4. Optional: Set up a custom domain

### Option 3: Vercel (Free!)

1. Create a Vercel account
2. Import your GitHub repo
3. Deploy with one click

### Option 4: Your Own Server

Upload all files to any web server. The app is just static HTML/CSS/JS - no backend required!

## Installation on Phone

### iOS (Safari)
1. Open the app URL in Safari
2. Tap the Share button
3. Tap "Add to Home Screen"
4. Tap "Add"

### Android (Chrome)
1. Open the app URL in Chrome
2. Tap the menu (three dots)
3. Tap "Add to Home Screen"
4. Tap "Add"

## Local Development

Want to test locally?

```bash
# Option 1: Python (if you have it)
python -m http.server 8000

# Option 2: Node.js
npx http-server

# Then open: http://localhost:8000
```

## File Structure

```
homerun-parlay-app/
├── index.html          # Main HTML structure
├── styles.css          # Mobile-first styling
├── app.js              # Main app logic
├── mlbApi.js           # MLB Stats API integration
├── parkFactors.js      # 2025 park factors data
├── manifest.json       # PWA manifest
├── service-worker.js   # Offline support
└── README.md           # This file
```

## Data Sources

- **MLB Games**: Free MLB Stats API (statsapi.mlb.com)
- **Park Factors**: Baseball Savant 2025 data
- **Player Stats**: Currently using mock data for demo (can be connected to real API)

## Customization Ideas

### Connect Real Player Data
The `mlbApi.js` file has methods ready to connect to the real MLB API:
```javascript
async getPlayerStats(playerId, season)
async getTeamRoster(teamId)
```

### Add More Features
- Weather integration
- Pitcher matchup analysis
- Historical park factor trends
- Betting odds integration
- Push notifications for game time

### Update Park Factors
Edit `parkFactors.js` to update the factors based on new data:
```javascript
const PARK_FACTORS = {
    'CIN': { name: 'Great American Ball Park', factor: 118, home: 'Cincinnati Reds' },
    // ... update values here
};
```

## Browser Support

✅ iOS Safari 11+  
✅ Android Chrome 60+  
✅ Desktop Chrome, Firefox, Safari, Edge  

## Privacy

- All data stored locally in browser localStorage
- No user tracking or analytics
- No personal information collected
- API calls only to MLB's public API

## Future Enhancements

- [ ] Real-time player stats from MLB API
- [ ] Weather integration
- [ ] Pitcher vs. batter matchups
- [ ] Export parlays to image
- [ ] Share to social media
- [ ] Dark/light theme toggle
- [ ] Multiple sport support

## License

Free to use and modify. Built for fun! ⚾

## Support

Questions? Issues? Create an issue on GitHub or reach out!

---

**Disclaimer**: This app is for entertainment purposes only. Please gamble responsibly.
 
