// Weather API — Open-Meteo (free, no key needed)
// https://open-meteo.com — fetches current conditions by park coordinates
// Factors: wind direction/speed, temperature, humidity → HR impact score

class WeatherAPI {
    constructor() {
        this.cache = {};
        this.cacheTime = 20 * 60 * 1000; // 20-min cache
        this.baseUrl = 'https://api.open-meteo.com/v1/forecast';
    }

    // Fetch weather for a lat/lng
    async getWeather(lat, lng) {
        const key = `${lat.toFixed(2)}_${lng.toFixed(2)}`;
        if (this.cache[key] && Date.now() - this.cache[key].time < this.cacheTime) {
            return this.cache[key].data;
        }

        try {
            const url = `${this.baseUrl}?latitude=${lat}&longitude=${lng}` +
                `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,weather_code` +
                `&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto`;

            const res = await fetch(url);
            if (!res.ok) return null;

            const json = await res.json();
            const c = json.current;
            if (!c) return null;

            const data = {
                tempF:       Math.round(c.temperature_2m),
                humidity:    Math.round(c.relative_humidity_2m),
                windMph:     Math.round(c.wind_speed_10m),
                windDir:     Math.round(c.wind_direction_10m), // 0=N, 90=E, 180=S, 270=W
                weatherCode: c.weather_code,
            };

            this.cache[key] = { data, time: Date.now() };
            return data;
        } catch (e) {
            console.warn('Weather fetch failed:', e.message);
            return null;
        }
    }

    // Get weather for a park by abbreviation
    async getParkWeather(parkAbbr) {
        const park = PARK_COORDS[parkAbbr];
        if (!park) return null;
        const weather = await this.getWeather(park.lat, park.lng);
        if (!weather) return null;
        return { ...weather, park };
    }

    // Calculate how much weather boosts/hurts HR probability
    // Returns: { score: -3 to +3, label: string, details: [...] }
    calcWeatherImpact(weather, parkAbbr) {
        if (!weather) return { score: 0, label: 'Weather N/A', details: [] };

        const park = PARK_COORDS[parkAbbr] || {};
        const { tempF, humidity, windMph, windDir } = weather;
        let score = 0;
        const details = [];

        // ── Wind ──────────────────────────────────────────────────────────────────
        // Compare wind direction to outfield bearing to determine in/out
        const outfieldBearing = park.ofBearing ?? 0; // degrees toward CF from home plate
        const windAngle = Math.abs(((windDir - outfieldBearing) + 360) % 360);
        const normalizedAngle = windAngle > 180 ? 360 - windAngle : windAngle;
        // 0° = blowing straight out, 180° = blowing straight in
        const isOut   = normalizedAngle <= 60;
        const isIn    = normalizedAngle >= 120;

        if (windMph >= 5) {
            if (isOut) {
                const boost = windMph >= 20 ? 3 : windMph >= 12 ? 2 : 1;
                score += boost;
                details.push({ icon: '💨', text: `Wind out ${windMph}mph (+${boost})`, positive: true });
            } else if (isIn) {
                const drag = windMph >= 20 ? -3 : windMph >= 12 ? -2 : -1;
                score += drag;
                details.push({ icon: '🌬️', text: `Wind in ${windMph}mph (${drag})`, positive: false });
            } else {
                details.push({ icon: '💨', text: `Crosswind ${windMph}mph`, positive: null });
            }
        } else {
            details.push({ icon: '🍃', text: 'Calm winds', positive: null });
        }

        // ── Temperature ───────────────────────────────────────────────────────────
        if (tempF >= 85) {
            score += 1;
            details.push({ icon: '☀️', text: `${tempF}°F — ball carries in heat (+1)`, positive: true });
        } else if (tempF < 45) {
            score -= 2;
            details.push({ icon: '🥶', text: `${tempF}°F — cold suppresses carry (-2)`, positive: false });
        } else if (tempF < 55) {
            score -= 1;
            details.push({ icon: '🌡️', text: `${tempF}°F — cool air (-1)`, positive: false });
        } else {
            details.push({ icon: '🌡️', text: `${tempF}°F`, positive: null });
        }

        // ── Humidity ─────────────────────────────────────────────────────────────
        // Humid air is actually less dense (water vapor lighter than N₂/O₂) → slight carry boost
        // But extreme humidity feels uncomfortable and pitchers throw less spin
        if (humidity <= 35) {
            score += 1;
            details.push({ icon: '🏜️', text: `${humidity}% humidity — dry air, ball carries (+1)`, positive: true });
        } else if (humidity >= 85) {
            score -= 1;
            details.push({ icon: '💧', text: `${humidity}% humidity — dense/wet (-1)`, positive: false });
        } else {
            details.push({ icon: '💧', text: `${humidity}% humidity`, positive: null });
        }

        // Clamp to -4 / +4
        score = Math.max(-4, Math.min(4, score));

        const label = score >= 3 ? '⚡ Great HR conditions'
                    : score >= 1 ? '✅ Favorable conditions'
                    : score <= -3 ? '⛔ Tough HR conditions'
                    : score <= -1 ? '⚠️ Weather hurts power'
                    : '☁️ Neutral conditions';

        return { score, label, details };
    }

    // Returns emoji icon for weather code
    weatherIcon(code) {
        if (code === 0)               return '☀️';
        if (code <= 3)                return '⛅';
        if (code <= 49)               return '🌫️';
        if (code <= 67)               return '🌧️';
        if (code <= 77)               return '❄️';
        if (code <= 82)               return '🌦️';
        if (code <= 99)               return '⛈️';
        return '🌡️';
    }
}

// ── Park coordinates + outfield bearing ──────────────────────────────────────
// ofBearing: compass degrees from home plate toward center field
// e.g. Yankee Stadium CF is roughly NE = ~45°
const PARK_COORDS = {
    'ARI': { lat: 33.4455, lng: -112.0667, ofBearing: 315, name: 'Chase Field' },
    'ATL': { lat: 33.8908, lng: -84.4678,  ofBearing: 30,  name: 'Truist Park' },
    'BAL': { lat: 39.2838, lng: -76.6218,  ofBearing: 90,  name: 'Camden Yards' },
    'BOS': { lat: 42.3467, lng: -71.0972,  ofBearing: 70,  name: 'Fenway Park' },
    'CHC': { lat: 41.9484, lng: -87.6553,  ofBearing: 355, name: 'Wrigley Field' },
    'CWS': { lat: 41.8299, lng: -87.6338,  ofBearing: 5,   name: 'Guaranteed Rate Field' },
    'CIN': { lat: 39.0979, lng: -84.5081,  ofBearing: 340, name: 'Great American Ball Park' },
    'CLE': { lat: 41.4962, lng: -81.6852,  ofBearing: 20,  name: 'Progressive Field' },
    'COL': { lat: 39.7560, lng: -104.9942, ofBearing: 15,  name: 'Coors Field' },
    'DET': { lat: 42.3390, lng: -83.0485,  ofBearing: 45,  name: 'Comerica Park' },
    'HOU': { lat: 29.7573, lng: -95.3555,  ofBearing: 10,  name: 'Minute Maid Park' },
    'KC':  { lat: 39.0517, lng: -94.4803,  ofBearing: 0,   name: 'Kauffman Stadium' },
    'LAA': { lat: 33.8003, lng: -117.8827, ofBearing: 330, name: 'Angel Stadium' },
    'LAD': { lat: 34.0739, lng: -118.2400, ofBearing: 320, name: 'Dodger Stadium' },
    'MIA': { lat: 25.7781, lng: -80.2197,  ofBearing: 350, name: 'loanDepot Park' },
    'MIL': { lat: 43.0280, lng: -87.9712,  ofBearing: 5,   name: 'American Family Field' },
    'MIN': { lat: 44.9817, lng: -93.2776,  ofBearing: 340, name: 'Target Field' },
    'NYM': { lat: 40.7571, lng: -73.8458,  ofBearing: 10,  name: 'Citi Field' },
    'NYY': { lat: 40.8296, lng: -73.9262,  ofBearing: 40,  name: 'Yankee Stadium' },
    'OAK': { lat: 37.7516, lng: -122.2005, ofBearing: 355, name: 'Oakland Coliseum' },
    'PHI': { lat: 39.9061, lng: -75.1665,  ofBearing: 5,   name: 'Citizens Bank Park' },
    'PIT': { lat: 40.4469, lng: -80.0057,  ofBearing: 330, name: 'PNC Park' },
    'SD':  { lat: 32.7076, lng: -117.1570, ofBearing: 310, name: 'Petco Park' },
    'SEA': { lat: 47.5914, lng: -122.3325, ofBearing: 330, name: 'T-Mobile Park' },
    'SF':  { lat: 37.7786, lng: -122.3893, ofBearing: 5,   name: 'Oracle Park' },
    'STL': { lat: 38.6226, lng: -90.1928,  ofBearing: 355, name: 'Busch Stadium' },
    'TB':  { lat: 27.7683, lng: -82.6534,  ofBearing: 350, name: 'Tropicana Field' },
    'TEX': { lat: 32.7512, lng: -97.0832,  ofBearing: 5,   name: 'Globe Life Field' },
    'TOR': { lat: 43.6414, lng: -79.3894,  ofBearing: 350, name: 'Rogers Centre' },
    'WSH': { lat: 38.8730, lng: -77.0074,  ofBearing: 0,   name: 'Nationals Park' },
};

const weatherApi = new WeatherAPI();
