#!/usr/bin/env node
/**
 * Fony - Daily Briefing Generator
 * Fetches weather, calendar, news directly (no /day dependency)
 */

const { execSync } = require('child_process');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const FINN_INDEX = path.join(process.env.HOME, 'Documents/Code/finn/index.html');
const REMINDERS_FILE = path.join(__dirname, '..', 'data', 'reminders.json');

function fetch(url, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, {
      timeout: timeoutMs,
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
    setTimeout(() => { req.destroy(); reject(new Error('timeout')); }, timeoutMs);
  });
}

async function getWeather() {
  try {
    // Brookswood, Langley, BC coordinates
    const lat = '49.0520';
    const lon = '-122.6340';
    const city = 'Brookswood';

    // Open-Meteo - free, no API key, reliable
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&temperature_unit=celsius&timezone=auto&forecast_days=1`;
    
    // Retry logic: try twice with longer timeout
    let data;
    try {
      data = JSON.parse(await fetch(url, 10000));
    } catch (firstErr) {
      console.error('Weather fetch failed (attempt 1):', firstErr.message);
      // Retry once
      data = JSON.parse(await fetch(url, 10000));
    }

    const temp = Math.round(data.current.temperature_2m);
    const high = Math.round(data.daily.temperature_2m_max[0]);
    const low = Math.round(data.daily.temperature_2m_min[0]);
    const rain = data.daily.precipitation_probability_max[0];

    const codes = { 0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast',
      45: 'Foggy', 48: 'Foggy', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
      61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 71: 'Light snow', 73: 'Snow', 75: 'Heavy snow',
      80: 'Rain showers', 81: 'Rain showers', 82: 'Heavy rain showers',
      95: 'Thunderstorm', 96: 'Thunderstorm with hail' };
    const condition = codes[data.current.weather_code] || 'Unknown';

    return `${city}. Currently ${temp} degrees, ${condition.toLowerCase()}. High of ${high}, low of ${low}. ${rain}% chance of precipitation.`;
  } catch {
    return 'Weather unavailable';
  }
}

async function getCalendar() {
  try {
    const out = execSync('icalBuddy -n -nc -iep "title,datetime" -b "" eventsToday+2 2>/dev/null | head -5', {
      encoding: 'utf8', timeout: 5000
    });
    // Clean up for speech - just first 3 events, remove duplicates
    const events = out.trim()
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.match(/^\s+$/))
      .slice(0, 3); // Max 3 events
    
    // Remove exact duplicates
    const unique = [...new Set(events)];
    
    return unique.length > 0 ? unique.join(', ') : 'Nothing scheduled';
  } catch {
    return 'Nothing scheduled';
  }
}

async function getReminders() {
  try {
    const out = execSync('reminders show-lists 2>/dev/null | head -5', {
      encoding: 'utf8', timeout: 5000
    });
    return out.trim() || 'No active reminders';
  } catch {
    return 'No active reminders';
  }
}

const STOCKS = {
  AAPL: 'Apple', NVDA: 'Nvidia', TSLA: 'Tesla', MSFT: 'Microsoft', GOOGL: 'Google'
};

async function getStocks() {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 6=Sat
  
  // Weekends: Markets closed, check crypto instead
  if (day === 0 || day === 6) {
    try {
      // CoinGecko free API - no key needed
      const url = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true';
      const data = JSON.parse(await fetch(url, 8000));
      const btcChange = data.bitcoin.usd_24h_change || 0;
      const pct = Math.abs(btcChange).toFixed(1);
      const dir = btcChange >= 0 ? 'up' : 'down';
      return `Bitcoin ${dir} ${pct} percent in 24 hours.`;
    } catch {
      return 'Markets closed this weekend.';
    }
  }
  
  // Weekdays: S&P 500
  try {
    const url = 'https://query2.finance.yahoo.com/v8/finance/chart/%5EGSPC?interval=1d&range=1d';
    const data = JSON.parse(await fetch(url, 8000));
    const meta = data.chart.result[0].meta;
    const prev = meta.chartPreviousClose;
    const price = meta.regularMarketPrice;
    const pct = ((price - prev) / prev * 100).toFixed(1);
    
    // If change is 0 (market just opened or pre-market), say "flat"
    if (Math.abs(pct) < 0.1) {
      return 'S and P flat today.';
    }
    
    const dir = pct >= 0 ? 'up' : 'down';
    return `S and P ${dir} ${Math.abs(pct)} percent.`;
  } catch {
    return 'Markets steady.';
  }
}

function parseFinnHtml(html) {
  const result = { items: [], total: '', debt: '' };

  // Extract portfolio section (between <h2>Portfolio</h2> and next <h2>)
  const portfolioMatch = html.match(/<h2>Portfolio<\/h2>([\s\S]*?)(?=<h2>)/);
  if (!portfolioMatch) return result;
  const portfolioBlock = portfolioMatch[1];

  // Match all rows with <div class="s"> inside
  const itemRegex = /<tr><td><div class="s">([^<]+)<\/div>[\s\S]*?<\/td><td[^>]*>([^<]+)<\/td><\/tr>/g;
  let m;
  while ((m = itemRegex.exec(portfolioBlock)) !== null) {
    const name = m[1].trim();
    if (name === 'Daily budget') continue;
    // Parse dollar amount from cell text like "$23.19 CAD" or "$24.82 USD"
    const cellText = m[2].trim();
    const amountMatch = cellText.match(/\$([\d,]+(?:\.\d{1,2})?)\s*(CAD|USD)?/);
    if (!amountMatch) continue;
    const val = parseFloat(amountMatch[1].replace(/,/g, ''));
    if (isNaN(val)) continue;
    result.items.push({ name, amount: val, currency: amountMatch[2] || '' });
  }

  // Portfolio total row
  const totalMatch = portfolioBlock.match(/<tr class="t"><td>Total<\/td><td>~?\$([\d,]+(?:\.\d{1,2})?)\s*(USD|CAD)?<\/td><\/tr>/);
  if (totalMatch) {
    const val = parseFloat(totalMatch[1].replace(/,/g, ''));
    const cur = totalMatch[2] || 'USD';
    if (!isNaN(val)) result.total = `$${Math.round(val).toLocaleString()} ${cur}`;
  }

  // Debt total row (in debt section)
  const debtMatch = html.match(/<h2>Debt<\/h2>\s*<div class="card">[\s\S]*?<tr class="t"><td>Total<\/td><td[^>]*>\$([\d,]+(?:\.\d{1,2})?)<\/td><\/tr>/);
  if (debtMatch) {
    const val = parseFloat(debtMatch[1].replace(/,/g, ''));
    if (!isNaN(val)) result.debt = `$${val.toLocaleString()}`;
  }

  return result;
}

async function getPortfolio() {
  try {
    const html = fs.readFileSync(FINN_INDEX, 'utf8');
    const data = parseFinnHtml(html);
    if (data.items.length === 0 && !data.total) return '';

    // Build natural speech: itemize accounts, then total, then debt
    const parts = [];
    for (const item of data.items) {
      const cur = item.currency ? ` ${item.currency}` : '';
      parts.push(`${item.name}, $${item.amount.toFixed(2)}${cur}`);
    }

    let text = parts.join('. ');
    if (data.total) text += `. Total, ${data.total}`;
    if (data.debt) text += `. Debt, ${data.debt}`;
    text += '.';

    return text;
  } catch {
    return '';
  }
}

async function getActionItems() {
  try {
    const data = JSON.parse(fs.readFileSync(REMINDERS_FILE, 'utf8'));
    const today = new Date().toISOString().split('T')[0];
    const active = data.filter(r => r.date <= today);
    if (active.length === 0) return '';

    // Clean up oneshot reminders after reading
    const remaining = data.filter(r => !(r.date <= today && r.oneshot));
    if (remaining.length !== data.length) {
      fs.writeFileSync(REMINDERS_FILE, JSON.stringify(remaining, null, 2) + '\n');
    }

    return active.map(r => r.text).join('. ');
  } catch {
    return '';
  }
}

async function getNews() {
  try {
    const out = execSync('/Users/joshua/.local/bin/youtube-news 2>/dev/null', {
      encoding: 'utf8', timeout: 15000,
      env: { ...process.env, PATH: process.env.PATH + ':/usr/local/bin:/opt/homebrew/bin' }
    });
    return out.trim();
  } catch {
    return '';
  }
}

/**
 * Build the briefing from all sources in parallel
 */
async function getBriefing() {
  const hour = new Date().getHours();
  let greeting;
  if (hour < 12) greeting = 'Good morning';
  else if (hour < 17) greeting = 'Good afternoon';
  else greeting = 'Good evening';

  const date = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  // Fetch all sources in parallel
  const [weather, calendar, reminders, news, stocks, portfolio, actionItems] = await Promise.all([
    getWeather(),
    getCalendar(),
    getReminders(),
    getNews(),
    getStocks(),
    getPortfolio(),
    getActionItems()
  ]);

  // Format news for speech - extract just the headline titles (2 max, no numbering)
  let newsText = '';
  if (news) {
    const lines = news.split('\n');
    const headlines = lines
      .filter(line => /^\d+\.\s/.test(line.trim()))
      .map(line => line.replace(/^\d+\.\s*/, '').trim())
      .slice(0, 2);  // Only 2 headlines
    if (headlines.length > 0) {
      newsText = headlines.join('. '); // Just periods between, no numbering
    }
  }

  let briefing = `${greeting} Joshua. ${date}.\n\n`;
  briefing += `Weather. ${weather}\n\n`;
  briefing += `Calendar. ${calendar}\n\n`;
  // Skip reminders if none
  if (reminders && !reminders.includes('No active')) {
    briefing += `Reminders. ${reminders}\n\n`;
  }
  if (stocks) {
    briefing += `Markets. ${stocks}\n\n`;
  }
  if (portfolio) {
    briefing += `Finances. ${portfolio}\n\n`;
  }
  if (newsText) {
    briefing += `Headlines.\n${newsText}\n\n`;
  }
  if (actionItems) {
    briefing += `Action items. ${actionItems}\n\n`;
  }
  briefing += `That's your briefing.`;

  return briefing;
}

module.exports = { getBriefing, parseFinnHtml };

// Run standalone
if (require.main === module) {
  getBriefing().then(b => console.log(b));
}
