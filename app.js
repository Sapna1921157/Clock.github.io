'use strict';

/* ═══════════════════════════════════════════════════════════════
   Clock Studio — app.js
   Vanilla JS, zero dependencies. Features:
   - Analog clock (smooth sub-second hands via rAF)
   - Digital time with 12H/24H toggle
   - Date display, timezone selector
   - Binary BCD clock (togglable)
   - Info strip: week number, moon phase, sunrise/sunset
   - Day/year progress bars
   - World clocks strip (4 cities, clock tab)
   - World tab: 9-city grid with pure-CSS mini analog clocks
   - Theme switcher (Dark / Light / Neon)
   - Alarm with snooze (+10 min)
   - Stopwatch with lap times
   - Countdown timer with SVG ring + presets
   - Pomodoro focus timer with stats & streaks
   - Tick sound toggle
   - Fullscreen toggle
   - Keyboard shortcuts
   ═══════════════════════════════════════════════════════════════ */

// ─────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────

/** SVG ring circumference for r = 95 */
const RING_CIRCUMFERENCE = 2 * Math.PI * 95;

/** 9 cities shown in the World tab grid */
const WORLD_CITIES = [
  { label: 'New York',    tz: 'America/New_York',   flag: '🇺🇸' },
  { label: 'London',      tz: 'Europe/London',       flag: '🇬🇧' },
  { label: 'Paris',       tz: 'Europe/Paris',        flag: '🇫🇷' },
  { label: 'Dubai',       tz: 'Asia/Dubai',          flag: '🇦🇪' },
  { label: 'Mumbai',      tz: 'Asia/Kolkata',        flag: '🇮🇳' },
  { label: 'Singapore',   tz: 'Asia/Singapore',      flag: '🇸🇬' },
  { label: 'Tokyo',       tz: 'Asia/Tokyo',          flag: '🇯🇵' },
  { label: 'Sydney',      tz: 'Australia/Sydney',    flag: '🇦🇺' },
  { label: 'Los Angeles', tz: 'America/Los_Angeles', flag: '🇺🇸' },
];

/** 4 cities shown in the strip on the Clock tab */
const STRIP_CITIES = [
  { label: 'New York', tz: 'America/New_York'  },
  { label: 'London',   tz: 'Europe/London'     },
  { label: 'Tokyo',    tz: 'Asia/Tokyo'        },
  { label: 'Sydney',   tz: 'Australia/Sydney'  },
];

/** Pomodoro mode durations in milliseconds */
const POMO_DURATIONS = {
  work:  25 * 60 * 1000,
  short:  5 * 60 * 1000,
  long:  15 * 60 * 1000,
};

/** Days and months for manual date formatting */
const DAYS   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ─────────────────────────────────────
// HELPERS
// ─────────────────────────────────────

/** Shorthand getElementById */
const $ = id => document.getElementById(id);

/**
 * Zero-pad a number to 2 digits.
 * @param {number} n
 * @returns {string}
 */
const pad = n => String(Math.floor(n)).padStart(2, '0');

/**
 * Clamp a value between lo and hi.
 * @param {number} v
 * @param {number} lo
 * @param {number} hi
 * @returns {number}
 */
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Get current time components in a given IANA timezone (or local if tz is empty).
 * @param {string} tz  IANA timezone string, e.g. "Asia/Tokyo". Empty string = local.
 * @returns {{ h: number, m: number, s: number, ms: number, date: Date }}
 */
function getTimeInZone(tz) {
  const now = new Date();
  if (!tz) {
    return {
      h:  now.getHours(),
      m:  now.getMinutes(),
      s:  now.getSeconds(),
      ms: now.getMilliseconds(),
      date: now,
    };
  }
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour:     'numeric',
      minute:   'numeric',
      second:   'numeric',
      hour12:   false,
    }).formatToParts(now);

    const get = type => {
      const p = parts.find(x => x.type === type);
      return p ? parseInt(p.value, 10) : 0;
    };

    let h = get('hour');
    if (h === 24) h = 0; // Intl quirk: midnight can return 24

    return { h, m: get('minute'), s: get('second'), ms: now.getMilliseconds(), date: now };
  } catch (_) {
    // Fallback to local on any Intl error
    return {
      h:  now.getHours(),
      m:  now.getMinutes(),
      s:  now.getSeconds(),
      ms: now.getMilliseconds(),
      date: now,
    };
  }
}

/**
 * Format h/m/s as a display string, respecting 12/24h mode.
 * @param {number} h
 * @param {number} m
 * @param {number} s
 * @param {boolean} use24h
 * @returns {string}
 */
function formatTimeStr(h, m, s, use24h) {
  if (use24h) {
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12  = h % 12 || 12;
  return `${pad(h12)}:${pad(m)}:${pad(s)} ${ampm}`;
}

/**
 * Convert elapsed milliseconds into stopwatch HTML.
 * Returns "HH:MM:SS<span class='frac'>.cs</span>"
 * @param {number} ms  Elapsed milliseconds
 * @returns {string}   HTML string
 */
function formatStopwatchMs(ms) {
  const totalSec = Math.floor(ms / 1000);
  const cs       = Math.floor((ms % 1000) / 10);
  const secs     = totalSec % 60;
  const mins     = Math.floor(totalSec / 60) % 60;
  const hrs      = Math.floor(totalSec / 3600);
  return `${pad(hrs)}:${pad(mins)}:${pad(secs)}<span class="frac">.${pad(cs)}</span>`;
}

/**
 * Format milliseconds as HH:MM:SS plain string (used in timer display).
 * @param {number} ms
 * @returns {string}
 */
function formatTimerMs(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const s     = total % 60;
  const m     = Math.floor(total / 60) % 60;
  const h     = Math.floor(total / 3600);
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/**
 * Format milliseconds as MM:SS for Pomodoro display.
 * @param {number} ms
 * @returns {string}
 */
function formatPomoTime(ms) {
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${pad(m)}:${pad(s)}`;
}

/**
 * Get timezone abbreviation using Intl.
 * @param {string} tz  IANA timezone
 * @returns {string}
 */
function getTZAbbr(tz) {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'short',
    }).formatToParts(new Date()).find(p => p.type === 'timeZoneName')?.value || '';
  } catch (_) {
    return '';
  }
}

/**
 * Get ISO week number for a given Date.
 * @param {Date} date
 * @returns {number}
 */
function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

/**
 * Compute moon phase from synodic cycle.
 * Reference new moon: 6 Jan 2000 18:14 UTC.
 * @param {Date} date
 * @returns {{ emoji: string, name: string }}
 */
function getMoonPhase(date) {
  const knownNew = new Date('2000-01-06T18:14:00Z').getTime();
  const synodicMs = 29.530588853 * 24 * 60 * 60 * 1000;
  const elapsed = ((date.getTime() - knownNew) % synodicMs + synodicMs) % synodicMs;
  const fraction = elapsed / synodicMs;

  if (fraction < 0.025 || fraction >= 0.975) return { emoji: '🌑', name: 'New Moon' };
  if (fraction < 0.25)                        return { emoji: '🌒', name: 'Waxing Crescent' };
  if (fraction < 0.275)                       return { emoji: '🌓', name: 'First Quarter' };
  if (fraction < 0.5)                         return { emoji: '🌔', name: 'Waxing Gibbous' };
  if (fraction < 0.525)                       return { emoji: '🌕', name: 'Full Moon' };
  if (fraction < 0.75)                        return { emoji: '🌖', name: 'Waning Gibbous' };
  if (fraction < 0.775)                       return { emoji: '🌗', name: 'Last Quarter' };
  return { emoji: '🌘', name: 'Waning Crescent' };
}

/**
 * Calculate sunrise and sunset times (local) using the standard algorithm.
 * @param {number} lat   Latitude in degrees
 * @param {number} lon   Longitude in degrees
 * @param {Date}   date  Date to compute for
 * @returns {{ sunrise: string|null, sunset: string|null }}  "HH:MM" strings or null
 */
function calcSunTimes(lat, lon, date) {
  const rad = Math.PI / 180;
  const N = Math.round((date - new Date(date.getFullYear(), 0, 1)) / 86400000) + 1;
  const lonHour = lon / 15;

  function calc(isRise) {
    const t = N + ((isRise ? 6 : 18) - lonHour) / 24;
    const M = (0.9856 * t - 3.289 + 360) % 360;
    let L = (M + 1.916 * Math.sin(M * rad) + 0.020 * Math.sin(2 * M * rad) + 282.634 + 360) % 360;
    let RA = (Math.atan(0.91764 * Math.tan(L * rad)) / rad + 360) % 360;
    RA = (RA + (Math.floor(L / 90) * 90) - (Math.floor(RA / 90) * 90)) / 15;
    const sinD = 0.39782 * Math.sin(L * rad);
    const cosD = Math.cos(Math.asin(sinD));
    const cosH = (Math.cos(90.833 * rad) - sinD * Math.sin(lat * rad)) / (cosD * Math.cos(lat * rad));
    if (cosH > 1 || cosH < -1) return null;
    const H = isRise ? (360 - Math.acos(cosH) / rad) / 15 : Math.acos(cosH) / rad / 15;
    let UT = ((H + RA - 0.06571 * t - 6.622) % 24 + 24) % 24;
    UT -= lonHour;
    UT = (UT % 24 + 24) % 24;
    const offset = -date.getTimezoneOffset() / 60;
    const local = (UT + offset + 24) % 24;
    return `${pad(Math.floor(local))}:${pad(Math.round((local % 1) * 60))}`;
  }

  return { sunrise: calc(true), sunset: calc(false) };
}

/**
 * Get today's date as a YYYY-MM-DD string.
 * @returns {string}
 */
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Get yesterday's date as a YYYY-MM-DD string.
 * @returns {string}
 */
function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ─────────────────────────────────────
// STATE
// ─────────────────────────────────────

const state = {
  theme:      localStorage.getItem('capp_theme') || 'dark',
  use24h:     localStorage.getItem('capp_24h') === 'true',
  timezone:   localStorage.getItem('capp_tz') || '',
  alarmTime:  localStorage.getItem('capp_alarm') || null,
  alarmFired: false,
  activeTab:  'clock',

  binaryMode:  false,
  tickEnabled: false,
  lastTickSec: -1,

  lat: null,
  lon: null,

  // Stopwatch
  sw: {
    running:   false,
    startTime: 0,      // performance.now() when last started
    elapsed:   0,      // accumulated ms before current segment
    laps:      [],     // array of total-elapsed ms at each lap
    rafId:     null,
  },

  // Countdown timer
  timer: {
    running:   false,
    totalMs:   0,
    remaining: 0,
    startTime: 0,
    rafId:     null,
    activePreset: null,
  },

  // Pomodoro
  pomo: {
    mode:           'work',
    running:        false,
    totalMs:        25 * 60 * 1000,
    remaining:      25 * 60 * 1000,
    startTime:      0,
    rafId:          null,
    sessionsDone:   0,   // within current cycle of 4
    autoStart:      false,
    todaySessions:  parseInt(localStorage.getItem('pomo_today') || '0'),
    todayDate:      localStorage.getItem('pomo_date') || '',
    todayMins:      parseInt(localStorage.getItem('pomo_mins') || '0'),
    streak:         parseInt(localStorage.getItem('pomo_streak') || '0'),
    lastDate:       localStorage.getItem('pomo_last') || '',
  },

  // Audio
  audio: {
    ctx:          null,
    beatInterval: null,
  },

  // World grid hand references for fast rAF updates
  worldHandRefs: [], // [{ hrEl, mnEl, scEl, timeEl, tz }]
};

// ─────────────────────────────────────
// DOM REFS
// ─────────────────────────────────────

const dom = {
  // Clock tab
  hr:             $('hr'),
  mn:             $('mn'),
  sc:             $('sc'),
  analogClock:    $('analogClock'),
  digitalTime:    $('digitalTime'),
  dateDisplay:    $('dateDisplay'),
  worldClocks:    $('worldClocks'),
  binaryClock:    $('binaryClock'),
  binaryToggle:   $('binaryToggle'),
  tickToggle:     $('tickToggle'),
  fullscreenBtn:  $('fullscreenBtn'),
  weekNum:        $('weekNum'),
  moonPhase:      $('moonPhase'),
  sunriseTime:    $('sunriseTime'),
  sunsetTime:     $('sunsetTime'),
  dayBar:         $('dayBar'),
  dayPct:         $('dayPct'),
  yearBar:        $('yearBar'),
  yearPct:        $('yearPct'),
  // Controls
  tzSelect:       $('tzSelect'),
  formatToggle:   $('formatToggle'),
  alarmInput:     $('alarmInput'),
  setAlarm:       $('setAlarm'),
  clearAlarm:     $('clearAlarm'),
  alarmStatus:    $('alarmStatus'),
  alarmSnooze:    $('alarmSnooze'),
  // Stopwatch
  swDisplay:      $('swDisplay'),
  swStartStop:    $('swStartStop'),
  swLap:          $('swLap'),
  swReset:        $('swReset'),
  lapHeader:      $('lapHeader'),
  lapList:        $('lapList'),
  // Timer
  ringFill:       $('ringFill'),
  timerDisplay:   $('timerDisplay'),
  timerInputs:    $('timerInputs'),
  timerH:         $('timerH'),
  timerM:         $('timerM'),
  timerS:         $('timerS'),
  timerStartStop: $('timerStartStop'),
  timerReset:     $('timerReset'),
  presetRow:      $('presetRow'),
  // World tab
  worldGrid:      $('worldGrid'),
  worldDateDisplay: $('worldDateDisplay'),
  // Focus / Pomodoro tab
  pomoRing:         $('pomoRing'),
  pomoDisplay:      $('pomoDisplay'),
  pomoModeLabel:    $('pomoModeLabel'),
  pomoSessions:     $('pomoSessions'),
  pomoStartStop:    $('pomoStartStop'),
  pomoReset:        $('pomoReset'),
  pomoSkip:         $('pomoSkip'),
  pomoAutoStart:    $('pomoAutoStart'),
  pomoTodaySessions: $('pomoTodaySessions'),
  pomoTodayMins:    $('pomoTodayMins'),
  pomoStreak:       $('pomoStreak'),
  // Modals
  alarmModal:       $('alarmModal'),
  alarmDismiss:     $('alarmDismiss'),
  timerModal:       $('timerModal'),
  timerDismiss:     $('timerDismiss'),
};

// ─────────────────────────────────────
// THEME
// ─────────────────────────────────────

/**
 * Apply a named theme ('dark' | 'light' | 'neon').
 * Updates body class, theme button states, and localStorage.
 * @param {string} theme
 */
function applyTheme(theme) {
  state.theme = theme;
  document.body.className = `theme-${theme}`;
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === theme);
  });
  localStorage.setItem('capp_theme', theme);
  // Re-spawn particles so alpha range matches the new theme
  if (typeof spawnParticles === 'function') spawnParticles();
}

/**
 * Cycle themes: dark → light → neon → dark …
 */
function cycleTheme() {
  const order = ['dark', 'light', 'neon'];
  const idx   = order.indexOf(state.theme);
  applyTheme(order[(idx + 1) % order.length]);
}

// ─────────────────────────────────────
// TABS
// ─────────────────────────────────────

/**
 * Switch the visible tab panel.
 * @param {string} tab  'clock' | 'world' | 'stopwatch' | 'timer' | 'focus'
 */
function switchTab(tab) {
  state.activeTab = tab;

  document.querySelectorAll('.tab-btn').forEach(btn => {
    const isActive = btn.dataset.tab === tab;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', String(isActive));
  });

  document.querySelectorAll('.tab-panel').forEach(panel => {
    const isActive = panel.id === `tab-${tab}`;
    panel.classList.toggle('active', isActive);
    if (isActive) {
      panel.removeAttribute('hidden');
    } else {
      panel.setAttribute('hidden', '');
    }
  });
}

// ─────────────────────────────────────
// CLOCK — continuous rAF loop
// ─────────────────────────────────────

/**
 * Main clock update — called every animation frame.
 * Rotates hands with sub-second smoothness, updates digital time,
 * date string, checks alarm, updates world clocks, binary clock,
 * progress bars, and info strip once per second.
 */
function updateClock() {
  const { h, m, s, ms, date } = getTimeInZone(state.timezone);

  // Smooth hand angles
  const secDeg = (s + ms / 1000) * 6;
  const minDeg = (m + (s + ms / 1000) / 60) * 6;
  const hrDeg  = ((h % 12) + m / 60 + s / 3600) * 30;

  dom.hr.style.transform = `rotateZ(${hrDeg}deg)`;
  dom.mn.style.transform = `rotateZ(${minDeg}deg)`;
  dom.sc.style.transform = `rotateZ(${secDeg}deg)`;

  // Digital time
  dom.digitalTime.textContent = formatTimeStr(h, m, s, state.use24h);

  // Date display
  if (state.timezone) {
    dom.dateDisplay.textContent = new Intl.DateTimeFormat('en-US', {
      timeZone: state.timezone,
      weekday:  'long',
      year:     'numeric',
      month:    'short',
      day:      'numeric',
    }).format(date);
  } else {
    dom.dateDisplay.textContent =
      `${DAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  }

  // World date display (world tab header)
  dom.worldDateDisplay.textContent = dom.dateDisplay.textContent;

  // Binary clock — update every frame when visible
  if (state.binaryMode) {
    updateBinaryClock(h, m, s);
  }

  // Once-per-second updates
  if (s !== state.lastTickSec) {
    state.lastTickSec = s;

    // Progress bars (cheap, so always update)
    updateProgressBars(date);

    // Week number
    dom.weekNum.textContent = `W${getWeekNumber(date)}`;

    // Moon phase (cheap calculation)
    const moon = getMoonPhase(date);
    dom.moonPhase.textContent = moon.emoji;
    dom.moonPhase.title = moon.name;

    // Tick sound
    if (state.tickEnabled) {
      playTick();
    }

    // Alarm check (fire only once per set)
    if (state.alarmTime && !state.alarmFired) {
      const [ah, am] = state.alarmTime.split(':').map(Number);
      if (h === ah && m === am && s < 3) {
        state.alarmFired = true;
        triggerAlarm();
      }
    }

    // Check if date changed — reset pomo daily stats if needed
    const today = todayStr();
    if (state.pomo.todayDate !== today && state.pomo.todayDate !== '') {
      // New day detected mid-session — reset today stats
      state.pomo.todaySessions = 0;
      state.pomo.todayMins     = 0;
      state.pomo.todayDate     = today;
      savePomoDailyStats();
      updatePomoStats();
    }
  }

  // Strip clocks on Clock tab
  if (state.activeTab === 'clock') {
    updateWorldStrip();
  }

  // World grid mini clocks on World tab
  if (state.activeTab === 'world') {
    updateWorldGrid();
  }

  requestAnimationFrame(updateClock);
}

// ─────────────────────────────────────
// PROGRESS BARS
// ─────────────────────────────────────

/**
 * Compute and render Day % and Year % progress bars.
 * @param {Date} date
 */
function updateProgressBars(date) {
  // Day progress: minutes elapsed / 1440
  const dayMinutes = date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
  const dayPct     = (dayMinutes / 1440) * 100;
  dom.dayBar.style.width   = `${dayPct.toFixed(1)}%`;
  dom.dayPct.textContent   = `${Math.floor(dayPct)}%`;

  // Year progress: day of year / total days in year
  const startOfYear   = new Date(date.getFullYear(), 0, 1);
  const dayOfYear     = Math.floor((date - startOfYear) / 86400000) + 1;
  const isLeap        = (y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0)(date.getFullYear());
  const daysInYear    = isLeap ? 366 : 365;
  const yearPct       = (dayOfYear / daysInYear) * 100;
  dom.yearBar.style.width  = `${yearPct.toFixed(2)}%`;
  dom.yearPct.textContent  = `${Math.floor(yearPct)}%`;
}

// ─────────────────────────────────────
// SUN & MOON (called rarely)
// ─────────────────────────────────────

/**
 * Update moon phase display and, if geolocation is available, sunrise/sunset.
 * @param {Date} date
 */
function updateSunMoon(date) {
  // Moon
  const moon = getMoonPhase(date);
  dom.moonPhase.textContent = moon.emoji;
  dom.moonPhase.title       = moon.name;

  // Sun times
  if (state.lat !== null && state.lon !== null) {
    const sun = calcSunTimes(state.lat, state.lon, date);
    dom.sunriseTime.textContent = sun.sunrise || '--:--';
    dom.sunsetTime.textContent  = sun.sunset  || '--:--';
  } else {
    dom.sunriseTime.textContent = '--:--';
    dom.sunsetTime.textContent  = '--:--';
  }
}

/**
 * Request geolocation. On success, compute and show sun times.
 * On failure, fall back to New York coords for a useful default.
 */
function initGeolocation() {
  if (!navigator.geolocation) {
    state.lat = 40.7;
    state.lon = -74.0;
    updateSunMoon(new Date());
    return;
  }
  navigator.geolocation.getCurrentPosition(
    pos => {
      state.lat = pos.coords.latitude;
      state.lon = pos.coords.longitude;
      updateSunMoon(new Date());
    },
    () => {
      // Permission denied or unavailable — use New York
      state.lat = 40.7;
      state.lon = -74.0;
      updateSunMoon(new Date());
    },
    { timeout: 5000 }
  );
}

// ─────────────────────────────────────
// WORLD CLOCKS STRIP (Clock tab)
// ─────────────────────────────────────

/**
 * Build the 4 city text cards in #worldClocks.
 * Called once at init.
 */
function buildWorldStrip() {
  dom.worldClocks.innerHTML = '';
  STRIP_CITIES.forEach(city => {
    const card = document.createElement('div');
    card.className = 'world-city';

    const name = document.createElement('span');
    name.className = 'city-name';
    name.textContent = city.label;

    const time = document.createElement('span');
    time.className = 'city-time';
    time.dataset.tz = city.tz;
    time.textContent = '--:--';

    card.appendChild(name);
    card.appendChild(time);
    dom.worldClocks.appendChild(card);
  });
}

/**
 * Update text times in the strip (called each rAF when clock tab is active).
 */
function updateWorldStrip() {
  const spans = dom.worldClocks.querySelectorAll('.city-time[data-tz]');
  spans.forEach(span => {
    const { h, m, s } = getTimeInZone(span.dataset.tz);
    span.textContent = formatTimeStr(h, m, s, state.use24h);
  });
}

// ─────────────────────────────────────
// WORLD GRID (World tab — 9 cities)
// ─────────────────────────────────────

/**
 * Build 9 city cards in #worldGrid, each with a mini pure-CSS analog clock.
 * Stores hand element refs in state.worldHandRefs for fast updates.
 * Called once at init.
 */
function buildWorldGrid() {
  dom.worldGrid.innerHTML = '';
  state.worldHandRefs = [];

  WORLD_CITIES.forEach(city => {
    // Card wrapper
    const card = document.createElement('div');
    card.className = 'world-card';

    // Flag
    const flag = document.createElement('span');
    flag.className = 'wc-flag';
    flag.textContent = city.flag;

    // City name
    const cityLabel = document.createElement('span');
    cityLabel.className = 'wc-city';
    cityLabel.textContent = city.label;

    // Mini clock face
    const clockEl = document.createElement('div');
    clockEl.className = 'wc-clock';

    // 12 hour marks
    for (let i = 0; i < 12; i++) {
      const mark = document.createElement('div');
      mark.className = 'wc-mark';
      mark.style.transform = `translateX(-50%) rotateZ(${i * 30}deg)`;
      clockEl.appendChild(mark);
    }

    // Hour hand
    const hrEl = document.createElement('div');
    hrEl.className = 'wc-hand wc-hr';

    // Minute hand
    const mnEl = document.createElement('div');
    mnEl.className = 'wc-hand wc-mn';

    // Second hand
    const scEl = document.createElement('div');
    scEl.className = 'wc-hand wc-sc';

    // Center dot
    const dot = document.createElement('div');
    dot.className = 'wc-dot';

    clockEl.appendChild(hrEl);
    clockEl.appendChild(mnEl);
    clockEl.appendChild(scEl);
    clockEl.appendChild(dot);

    // Digital time label
    const timeEl = document.createElement('span');
    timeEl.className = 'wc-time';
    timeEl.textContent = '--:--:--';

    // Timezone abbreviation
    const tzEl = document.createElement('span');
    tzEl.className = 'wc-tz';
    tzEl.textContent = getTZAbbr(city.tz);

    // Assemble card
    card.appendChild(flag);
    card.appendChild(cityLabel);
    card.appendChild(clockEl);
    card.appendChild(timeEl);
    card.appendChild(tzEl);
    dom.worldGrid.appendChild(card);

    // Store refs for fast rAF updates
    state.worldHandRefs.push({ hrEl, mnEl, scEl, timeEl, tz: city.tz });
  });
}

/**
 * Update all 9 mini clock hands and digital times.
 * Called each rAF when the world tab is active.
 */
function updateWorldGrid() {
  state.worldHandRefs.forEach(ref => {
    const { h, m, s, ms } = getTimeInZone(ref.tz);

    const secDeg = (s + ms / 1000) * 6;
    const minDeg = (m + (s + ms / 1000) / 60) * 6;
    const hrDeg  = ((h % 12) + m / 60 + s / 3600) * 30;

    // The CSS has: bottom:50%; left:50%; transform-origin: bottom center;
    // So we prefix with translateX(-50%) to centre the hand horizontally.
    ref.hrEl.style.transform = `translateX(-50%) rotateZ(${hrDeg}deg)`;
    ref.mnEl.style.transform = `translateX(-50%) rotateZ(${minDeg}deg)`;
    ref.scEl.style.transform = `translateX(-50%) rotateZ(${secDeg}deg)`;

    ref.timeEl.textContent = formatTimeStr(h, m, s, state.use24h);
  });
}

// ─────────────────────────────────────
// BINARY CLOCK
// ─────────────────────────────────────

/**
 * Build 6 BCD columns (H₁ H₂ M₁ M₂ S₁ S₂) inside #binaryClock.
 * Each column has a label, 4 LED dots (8,4,2,1 top-to-bottom),
 * and a decimal digit label.
 * Called once at init.
 */
function buildBinaryClock() {
  dom.binaryClock.innerHTML = '';
  const colLabels = ['H\u2081', 'H\u2082', 'M\u2081', 'M\u2082', 'S\u2081', 'S\u2082'];
  const bitValues = [8, 4, 2, 1];

  colLabels.forEach((label, colIdx) => {
    const col = document.createElement('div');
    col.className = 'bc-col';

    const lbl = document.createElement('span');
    lbl.className = 'bc-label';
    lbl.textContent = label;
    col.appendChild(lbl);

    bitValues.forEach(bitVal => {
      const dot = document.createElement('div');
      dot.className = 'bc-dot';
      dot.dataset.col = colIdx;
      dot.dataset.val = bitVal;
      col.appendChild(dot);
    });

    const val = document.createElement('span');
    val.className = 'bc-val';
    val.dataset.col = colIdx;
    val.textContent = '0';
    col.appendChild(val);

    dom.binaryClock.appendChild(col);
  });
}

/**
 * Update binary clock LED dots and digit labels.
 * @param {number} h  Hours (0-23)
 * @param {number} m  Minutes (0-59)
 * @param {number} s  Seconds (0-59)
 */
function updateBinaryClock(h, m, s) {
  // BCD digits: H₁ H₂ M₁ M₂ S₁ S₂
  const digits = [
    Math.floor(h / 10), h % 10,
    Math.floor(m / 10), m % 10,
    Math.floor(s / 10), s % 10,
  ];

  // Update each dot
  dom.binaryClock.querySelectorAll('.bc-dot').forEach(dot => {
    const col    = parseInt(dot.dataset.col, 10);
    const bitVal = parseInt(dot.dataset.val, 10);
    dot.classList.toggle('on', !!(digits[col] & bitVal));
  });

  // Update digit labels
  dom.binaryClock.querySelectorAll('.bc-val').forEach(val => {
    const col = parseInt(val.dataset.col, 10);
    val.textContent = String(digits[col]);
  });
}

/**
 * Toggle between analog and binary clock display.
 */
function toggleBinaryMode() {
  state.binaryMode = !state.binaryMode;
  dom.analogClock.classList.toggle('hidden', state.binaryMode);
  dom.binaryClock.classList.toggle('hidden', !state.binaryMode);
  dom.binaryToggle.textContent = state.binaryMode ? 'Analog' : 'Binary';
}

// ─────────────────────────────────────
// TICK SOUND
// ─────────────────────────────────────

/**
 * Toggle tick sound on/off.
 */
function toggleTick() {
  state.tickEnabled = !state.tickEnabled;
  dom.tickToggle.textContent = state.tickEnabled ? 'Tick: On' : 'Tick: Off';
}

/**
 * Play a short quiet click sound via Web Audio.
 * Creates a fresh AudioContext each time (compatible with browser autoplay policy).
 */
function playTick() {
  try {
    const ctx  = new (window.AudioContext || window.webkitAudioContext)();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 800;
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.02);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.02);
    osc.onended = () => ctx.close();
  } catch (_) {
    // AudioContext unavailable — silent fail
  }
}

// ─────────────────────────────────────
// FULLSCREEN
// ─────────────────────────────────────

/**
 * Toggle fullscreen mode and update button text.
 */
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
    dom.fullscreenBtn.textContent = '\u2715'; // ✕
  } else {
    document.exitFullscreen();
    dom.fullscreenBtn.innerHTML = '&#9014;'; // ⛶
  }
}

// ─────────────────────────────────────
// ALARM
// ─────────────────────────────────────

/**
 * Show the alarm modal, play beep, focus dismiss button.
 */
function triggerAlarm() {
  dom.alarmModal.classList.remove('hidden');
  dom.alarmDismiss.focus();
  playBeep();
}

/**
 * Create an AudioContext and beep every 800 ms at 880 Hz with decay.
 */
function playBeep() {
  try {
    state.audio.ctx = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = state.audio.ctx;

    const beep = () => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.5, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.6);
    };

    beep();
    state.audio.beatInterval = setInterval(beep, 800);
  } catch (_) {
    // AudioContext not available — silent fail
  }
}

/** Stop the beep interval and close the AudioContext. */
function stopBeep() {
  if (state.audio.beatInterval) {
    clearInterval(state.audio.beatInterval);
    state.audio.beatInterval = null;
  }
  if (state.audio.ctx) {
    state.audio.ctx.close();
    state.audio.ctx = null;
  }
}

/**
 * Play a double-beep "done" sound (used by pomodoro completion).
 */
function playDoneBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.25].forEach(delay => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 660;
      gain.gain.setValueAtTime(0.4, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.4);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.45);
    });
    setTimeout(() => ctx.close(), 1200);
  } catch (_) {}
}

/**
 * Read the time input, persist the alarm, and update UI.
 */
function setAlarmAction() {
  const val = dom.alarmInput.value;
  if (!val) return;

  state.alarmTime  = val;
  state.alarmFired = false;
  localStorage.setItem('capp_alarm', val);

  dom.alarmStatus.textContent  = `Set for ${val}`;
  dom.alarmStatus.className    = 'status-text alarm-active';
  dom.clearAlarm.style.display = '';
}

/** Clear the alarm completely. */
function clearAlarmAction() {
  state.alarmTime  = null;
  state.alarmFired = false;
  localStorage.removeItem('capp_alarm');

  dom.alarmInput.value         = '';
  dom.alarmStatus.textContent  = '';
  dom.alarmStatus.className    = 'status-text';
  dom.clearAlarm.style.display = 'none';
}

/**
 * Snooze the alarm: re-arm it for +10 minutes from now.
 */
function snoozeAlarm() {
  stopBeep();
  dom.alarmModal.classList.add('hidden');

  const now    = new Date();
  now.setMinutes(now.getMinutes() + 10);
  const hh     = pad(now.getHours());
  const mm     = pad(now.getMinutes());
  const newVal = `${hh}:${mm}`;

  state.alarmTime  = newVal;
  state.alarmFired = false;
  localStorage.setItem('capp_alarm', newVal);

  dom.alarmInput.value         = newVal;
  dom.alarmStatus.textContent  = `Snoozed until ${newVal}`;
  dom.alarmStatus.className    = 'status-text alarm-active';
  dom.clearAlarm.style.display = '';
}

// ─────────────────────────────────────
// STOPWATCH
// ─────────────────────────────────────

/**
 * Return the total elapsed milliseconds including the current running segment.
 * @returns {number}
 */
function swCurrentElapsed() {
  if (!state.sw.running) return state.sw.elapsed;
  return state.sw.elapsed + (performance.now() - state.sw.startTime);
}

/** rAF callback: update the stopwatch display. */
function swTick() {
  dom.swDisplay.innerHTML = formatStopwatchMs(swCurrentElapsed());
  state.sw.rafId = requestAnimationFrame(swTick);
}

/** Toggle the stopwatch between running and paused. */
function swStartStop() {
  if (state.sw.running) {
    // Pause
    state.sw.elapsed += performance.now() - state.sw.startTime;
    state.sw.running  = false;
    cancelAnimationFrame(state.sw.rafId);
    state.sw.rafId = null;

    dom.swStartStop.textContent = 'Resume';
    dom.swStartStop.classList.remove('running');
  } else {
    // Start or resume
    state.sw.startTime = performance.now();
    state.sw.running   = true;

    dom.swStartStop.textContent = 'Pause';
    dom.swStartStop.classList.add('running');
    dom.swLap.disabled = false;

    state.sw.rafId = requestAnimationFrame(swTick);
  }
}

/** Record a lap split and prepend a row to the lap list. */
function swLap() {
  if (!state.sw.running) return;

  const total = swCurrentElapsed();
  const prev  = state.sw.laps.length
    ? state.sw.laps[state.sw.laps.length - 1]
    : 0;
  const split = total - prev;
  state.sw.laps.push(total);

  const lapNum = state.sw.laps.length;

  const row      = document.createElement('div');
  row.className  = 'lap-row';
  row.setAttribute('role', 'listitem');

  const numEl   = document.createElement('span');
  numEl.className = 'lap-num';
  numEl.textContent = `#${lapNum}`;

  const splitEl = document.createElement('span');
  splitEl.className = 'lap-split';
  splitEl.textContent = _msToHMS(split);

  const totalEl = document.createElement('span');
  totalEl.className = 'lap-total';
  totalEl.textContent = _msToHMS(total);

  row.appendChild(numEl);
  row.appendChild(splitEl);
  row.appendChild(totalEl);

  dom.lapList.prepend(row);
  dom.lapHeader.removeAttribute('hidden');
}

/** Reset the stopwatch to zero. */
function swReset() {
  cancelAnimationFrame(state.sw.rafId);
  state.sw.rafId     = null;
  state.sw.running   = false;
  state.sw.elapsed   = 0;
  state.sw.startTime = 0;
  state.sw.laps      = [];

  dom.swDisplay.innerHTML     = '00:00:00<span class="frac">.00</span>';
  dom.swStartStop.textContent = 'Start';
  dom.swStartStop.classList.remove('running');
  dom.swLap.disabled          = true;
  dom.lapList.innerHTML       = '';
  dom.lapHeader.setAttribute('hidden', '');
}

/**
 * Convert milliseconds to plain "HH:MM:SS.cs" string (for lap display).
 * @param {number} ms
 * @returns {string}
 * @private
 */
function _msToHMS(ms) {
  const totalSec = Math.floor(ms / 1000);
  const cs       = Math.floor((ms % 1000) / 10);
  const s        = totalSec % 60;
  const m        = Math.floor(totalSec / 60) % 60;
  const h        = Math.floor(totalSec / 3600);
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(cs)}`;
}

// ─────────────────────────────────────
// TIMER
// ─────────────────────────────────────

/**
 * Set the SVG ring fill (timer) based on a 0–1 fraction.
 * @param {number} fraction  1 = full, 0 = empty
 */
function setRingProgress(fraction) {
  const offset = RING_CIRCUMFERENCE * (1 - clamp(fraction, 0, 1));
  dom.ringFill.style.strokeDashoffset = offset;
}

/** rAF callback: update timer display and ring. */
function timerTick() {
  const elapsed   = performance.now() - state.timer.startTime;
  const remaining = state.timer.remaining - elapsed;

  if (remaining <= 0) {
    state.timer.running   = false;
    state.timer.remaining = 0;
    dom.timerDisplay.textContent   = '00:00:00';
    dom.timerStartStop.textContent = 'Start';
    dom.timerStartStop.classList.remove('running');
    setRingProgress(0);
    cancelAnimationFrame(state.timer.rafId);
    state.timer.rafId = null;
    dom.timerModal.classList.remove('hidden');
    dom.timerDismiss.focus();
    playBeep();
    return;
  }

  dom.timerDisplay.textContent = formatTimerMs(remaining);
  setRingProgress(remaining / state.timer.totalMs);
  state.timer.rafId = requestAnimationFrame(timerTick);
}

/**
 * Three-state toggle for the timer start/stop button:
 *  1. Running → pause
 *  2. Paused with time remaining → resume
 *  3. Not started (remaining = 0) → fresh start from inputs
 */
function timerStartStop() {
  if (state.timer.running) {
    // PAUSE
    const elapsed = performance.now() - state.timer.startTime;
    state.timer.remaining -= elapsed;
    state.timer.running    = false;
    cancelAnimationFrame(state.timer.rafId);
    state.timer.rafId = null;

    dom.timerStartStop.textContent = 'Resume';
    dom.timerStartStop.classList.remove('running');

  } else if (state.timer.remaining > 0) {
    // RESUME
    state.timer.startTime = performance.now();
    state.timer.running   = true;

    dom.timerStartStop.textContent = 'Pause';
    dom.timerStartStop.classList.add('running');

    state.timer.rafId = requestAnimationFrame(timerTick);

  } else {
    // FRESH START from inputs
    const h = parseInt(dom.timerH.value, 10) || 0;
    const m = parseInt(dom.timerM.value, 10) || 0;
    const s = parseInt(dom.timerS.value, 10) || 0;
    const totalMs = (h * 3600 + m * 60 + s) * 1000;

    if (totalMs <= 0) return;

    state.timer.totalMs   = totalMs;
    state.timer.remaining = totalMs;
    state.timer.startTime = performance.now();
    state.timer.running   = true;

    dom.timerInputs.style.display  = 'none';
    dom.timerDisplay.textContent   = formatTimerMs(totalMs);
    dom.timerStartStop.textContent = 'Pause';
    dom.timerStartStop.classList.add('running');

    setRingProgress(1);
    state.timer.rafId = requestAnimationFrame(timerTick);
  }
}

/** Reset the timer to blank state. */
function timerReset() {
  cancelAnimationFrame(state.timer.rafId);
  state.timer.rafId     = null;
  state.timer.running   = false;
  state.timer.totalMs   = 0;
  state.timer.remaining = 0;
  state.timer.startTime = 0;

  dom.timerDisplay.textContent   = '00:00:00';
  dom.timerStartStop.textContent = 'Start';
  dom.timerStartStop.classList.remove('running');

  dom.timerH.value = '0';
  dom.timerM.value = '0';
  dom.timerS.value = '0';
  dom.timerInputs.style.display = '';

  setRingProgress(1);

  // Deactivate preset highlight
  highlightPreset(null);
}

/**
 * Activate a preset button: fill inputs and highlight the button.
 * @param {number|null} secs  Seconds, or null to clear
 */
function highlightPreset(secs) {
  state.timer.activePreset = secs;
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.classList.toggle('active', secs !== null && parseInt(btn.dataset.secs, 10) === secs);
  });
}

// ─────────────────────────────────────
// FORMAT TOGGLE
// ─────────────────────────────────────

/** Toggle between 12-hour and 24-hour format, persist choice. */
function toggleFormat() {
  state.use24h = !state.use24h;
  localStorage.setItem('capp_24h', String(state.use24h));
  dom.formatToggle.textContent = state.use24h ? '24H' : '12H';
}

// ─────────────────────────────────────
// POMODORO
// ─────────────────────────────────────

/**
 * Set the Pomodoro SVG ring (pomoRing) fill based on 0–1 fraction.
 * @param {number} fraction
 */
function setPomoRingProgress(fraction) {
  const offset = RING_CIRCUMFERENCE * (1 - clamp(fraction, 0, 1));
  dom.pomoRing.style.strokeDashoffset = offset;
}

/**
 * Switch Pomodoro mode (work / short / long).
 * Stops any running session, resets to new duration.
 * @param {string} mode  'work' | 'short' | 'long'
 */
function pomoSetMode(mode) {
  // Stop running timer
  if (state.pomo.running) {
    cancelAnimationFrame(state.pomo.rafId);
    state.pomo.rafId    = null;
    state.pomo.running  = false;
    dom.pomoStartStop.textContent = 'Start';
    dom.pomoStartStop.classList.remove('running');
  }

  state.pomo.mode      = mode;
  state.pomo.totalMs   = POMO_DURATIONS[mode];
  state.pomo.remaining = POMO_DURATIONS[mode];
  state.pomo.startTime = 0;

  // Update mode label
  const modeNames = { work: 'WORK', short: 'SHORT BREAK', long: 'LONG BREAK' };
  dom.pomoModeLabel.textContent = modeNames[mode];

  // Update mode button highlight
  document.querySelectorAll('.pomo-mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });

  // Update display
  dom.pomoDisplay.textContent = formatPomoTime(state.pomo.remaining);

  // Full ring
  setPomoRingProgress(1);
}

/** rAF callback for Pomodoro countdown. */
function pomoTick() {
  const elapsed   = performance.now() - state.pomo.startTime;
  const remaining = state.pomo.remaining - elapsed;

  if (remaining <= 0) {
    // Session complete
    cancelAnimationFrame(state.pomo.rafId);
    state.pomo.rafId    = null;
    state.pomo.running  = false;
    state.pomo.remaining = 0;

    dom.pomoDisplay.textContent   = formatPomoTime(0);
    dom.pomoStartStop.textContent = 'Start';
    dom.pomoStartStop.classList.remove('running');
    setPomoRingProgress(0);

    handlePomoSessionComplete();
    return;
  }

  dom.pomoDisplay.textContent = formatPomoTime(remaining);
  setPomoRingProgress(remaining / state.pomo.totalMs);
  state.pomo.rafId = requestAnimationFrame(pomoTick);
}

/**
 * Handle logic when a Pomodoro session completes.
 * Updates stats, session dots, streak, auto-advances mode.
 */
function handlePomoSessionComplete() {
  playDoneBeep();

  const today = todayStr();
  const isWork = state.pomo.mode === 'work';

  if (isWork) {
    // Increment sessions in this cycle
    state.pomo.sessionsDone = (state.pomo.sessionsDone + 1);

    // Daily stats
    if (state.pomo.todayDate !== today) {
      // New day
      state.pomo.todaySessions = 0;
      state.pomo.todayMins     = 0;
      state.pomo.todayDate     = today;
    }
    state.pomo.todaySessions += 1;
    state.pomo.todayMins     += 25;

    // Streak logic
    if (state.pomo.lastDate !== today) {
      if (state.pomo.lastDate === yesterdayStr()) {
        state.pomo.streak += 1;
      } else {
        state.pomo.streak = 1;
      }
      state.pomo.lastDate = today;
    }

    savePomoDailyStats();
    updatePomoStats();
    updatePomoDots();
  }

  // Auto-advance mode
  let nextMode;
  if (isWork) {
    // After 4 work sessions, suggest long break; otherwise short break
    nextMode = (state.pomo.sessionsDone % 4 === 0) ? 'long' : 'short';
  } else {
    // After any break, back to work
    nextMode = 'work';
  }

  if (state.pomo.autoStart) {
    setTimeout(() => {
      pomoSetMode(nextMode);
      pomoStartStopAction();
    }, 1500);
  } else {
    pomoSetMode(nextMode);
  }
}

/** Toggle Pomodoro running/paused. */
function pomoStartStopAction() {
  if (state.pomo.running) {
    // Pause
    const elapsed = performance.now() - state.pomo.startTime;
    state.pomo.remaining -= elapsed;
    state.pomo.running    = false;
    cancelAnimationFrame(state.pomo.rafId);
    state.pomo.rafId = null;

    dom.pomoStartStop.textContent = 'Resume';
    dom.pomoStartStop.classList.remove('running');

  } else {
    // Start or resume
    state.pomo.startTime = performance.now();
    state.pomo.running   = true;

    dom.pomoStartStop.textContent = 'Pause';
    dom.pomoStartStop.classList.add('running');

    state.pomo.rafId = requestAnimationFrame(pomoTick);
  }
}

/** Reset the Pomodoro to the current mode's full duration. */
function pomoResetAction() {
  cancelAnimationFrame(state.pomo.rafId);
  state.pomo.rafId     = null;
  state.pomo.running   = false;
  state.pomo.remaining = state.pomo.totalMs;
  state.pomo.startTime = 0;

  dom.pomoDisplay.textContent   = formatPomoTime(state.pomo.remaining);
  dom.pomoStartStop.textContent = 'Start';
  dom.pomoStartStop.classList.remove('running');
  setPomoRingProgress(1);
}

/**
 * Skip the current session — advance to next mode without counting it as complete.
 */
function pomoSkipAction() {
  cancelAnimationFrame(state.pomo.rafId);
  state.pomo.rafId    = null;
  state.pomo.running  = false;
  dom.pomoStartStop.textContent = 'Start';
  dom.pomoStartStop.classList.remove('running');

  // Advance mode without recording completion
  const isWork = state.pomo.mode === 'work';
  const nextMode = isWork ? 'short' : 'work';
  pomoSetMode(nextMode);
}

/**
 * Update the 4 Pomodoro session dot indicators.
 * Dots 0..(sessionsDone%4)-1 get .done class.
 */
function updatePomoDots() {
  const dots = dom.pomoSessions.querySelectorAll('.pomo-dot');
  const filled = state.pomo.sessionsDone % 4;
  // If sessionsDone > 0 and divisible by 4, show all 4 filled momentarily
  const showAll = state.pomo.sessionsDone > 0 && filled === 0;
  dots.forEach((dot, idx) => {
    dot.classList.toggle('done', showAll || idx < filled);
  });
}

/** Persist Pomodoro daily stats to localStorage. */
function savePomoDailyStats() {
  localStorage.setItem('pomo_today',  String(state.pomo.todaySessions));
  localStorage.setItem('pomo_date',   state.pomo.todayDate);
  localStorage.setItem('pomo_mins',   String(state.pomo.todayMins));
  localStorage.setItem('pomo_streak', String(state.pomo.streak));
  localStorage.setItem('pomo_last',   state.pomo.lastDate);
}

/** Render Pomodoro stats into the stat cards. */
function updatePomoStats() {
  dom.pomoTodaySessions.textContent = String(state.pomo.todaySessions);
  dom.pomoTodayMins.textContent     = String(state.pomo.todayMins);
  dom.pomoStreak.textContent        = String(state.pomo.streak);
}

// ─────────────────────────────────────
// KEYBOARD SHORTCUTS
// ─────────────────────────────────────

/**
 * Global keydown handler. Skipped when focus is on an input / select / textarea.
 * @param {KeyboardEvent} e
 */
function handleKeydown(e) {
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

  switch (e.key) {
    case ' ':
    case 'Spacebar':
      e.preventDefault();
      if (state.activeTab === 'stopwatch') {
        swStartStop();
      } else if (state.activeTab === 'timer') {
        timerStartStop();
      } else if (state.activeTab === 'focus') {
        pomoStartStopAction();
      }
      break;

    case 'l':
    case 'L':
      if (state.activeTab === 'stopwatch') swLap();
      break;

    case 'r':
    case 'R':
      if (state.activeTab === 'stopwatch') {
        swReset();
      } else if (state.activeTab === 'timer') {
        timerReset();
      } else if (state.activeTab === 'focus') {
        pomoResetAction();
      }
      break;

    case 's':
    case 'S':
      if (state.activeTab === 'focus') pomoSkipAction();
      break;

    case 'f':
    case 'F':
      toggleFormat();
      break;

    case 't':
    case 'T':
      cycleTheme();
      break;

    case 'Escape':
      // Dismiss any open modal
      if (!dom.alarmModal.classList.contains('hidden')) {
        dom.alarmModal.classList.add('hidden');
        stopBeep();
      }
      if (!dom.timerModal.classList.contains('hidden')) {
        dom.timerModal.classList.add('hidden');
        stopBeep();
      }
      break;
  }
}

// ─────────────────────────────────────
// EVENT LISTENERS
// ─────────────────────────────────────

function attachEventListeners() {
  // Tab nav
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Theme buttons
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', () => applyTheme(btn.dataset.theme));
  });

  // Timezone select
  dom.tzSelect.addEventListener('change', e => {
    state.timezone = e.target.value;
    localStorage.setItem('capp_tz', state.timezone);
    state.alarmFired = false; // re-arm alarm for new zone
    updateSunMoon(new Date()); // recalc sun times (lat/lon unchanged)
  });

  // Format toggle
  dom.formatToggle.addEventListener('click', toggleFormat);

  // Alarm
  dom.setAlarm.addEventListener('click', setAlarmAction);
  dom.clearAlarm.addEventListener('click', clearAlarmAction);

  dom.alarmDismiss.addEventListener('click', () => {
    dom.alarmModal.classList.add('hidden');
    stopBeep();
    clearAlarmAction();
  });

  dom.alarmSnooze.addEventListener('click', snoozeAlarm);

  // Timer modal dismiss
  dom.timerDismiss.addEventListener('click', () => {
    dom.timerModal.classList.add('hidden');
    stopBeep();
  });

  // Stopwatch
  dom.swStartStop.addEventListener('click', swStartStop);
  dom.swLap.addEventListener('click', swLap);
  dom.swReset.addEventListener('click', swReset);

  // Timer
  dom.timerStartStop.addEventListener('click', timerStartStop);
  dom.timerReset.addEventListener('click', timerReset);

  // Timer presets
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (state.timer.running) return; // ignore if timer is already running

      const secs = parseInt(btn.dataset.secs, 10);
      const h    = Math.floor(secs / 3600);
      const m    = Math.floor((secs % 3600) / 60);
      const s    = secs % 60;

      dom.timerH.value = String(h);
      dom.timerM.value = String(m);
      dom.timerS.value = String(s);

      highlightPreset(secs);
      timerReset(); // reset display, keep inputs
      // After timerReset, set inputs again (timerReset clears them)
      dom.timerH.value = String(h);
      dom.timerM.value = String(m);
      dom.timerS.value = String(s);
      highlightPreset(secs);
    });
  });

  // View controls
  dom.binaryToggle.addEventListener('click', toggleBinaryMode);
  dom.tickToggle.addEventListener('click', toggleTick);
  dom.fullscreenBtn.addEventListener('click', toggleFullscreen);

  // Fullscreen change event — sync button icon
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) {
      dom.fullscreenBtn.innerHTML = '&#9014;';
    }
  });

  // Pomodoro mode buttons
  document.querySelectorAll('.pomo-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => pomoSetMode(btn.dataset.mode));
  });

  // Pomodoro action buttons
  dom.pomoStartStop.addEventListener('click', pomoStartStopAction);
  dom.pomoReset.addEventListener('click', pomoResetAction);
  dom.pomoSkip.addEventListener('click', pomoSkipAction);

  // Pomodoro auto-start toggle
  dom.pomoAutoStart.addEventListener('change', e => {
    state.pomo.autoStart = e.target.checked;
  });

  // Click outside modal to dismiss
  [dom.alarmModal, dom.timerModal].forEach(modal => {
    modal.addEventListener('click', e => {
      if (e.target === modal) {
        modal.classList.add('hidden');
        stopBeep();
        if (modal === dom.alarmModal) clearAlarmAction();
      }
    });
  });

  // Keyboard
  document.addEventListener('keydown', handleKeydown);
}

// ─────────────────────────────────────
// INIT
// ─────────────────────────────────────

/**
 * Bootstrap the entire app.
 */
function init() {
  // Reset pomo daily stats if new day
  const today = todayStr();
  if (state.pomo.todayDate !== today && state.pomo.todayDate !== '') {
    state.pomo.todaySessions = 0;
    state.pomo.todayMins     = 0;
    state.pomo.todayDate     = today;
    savePomoDailyStats();
  }
  if (state.pomo.todayDate === '') {
    state.pomo.todayDate = today;
  }

  // Apply saved theme
  applyTheme(state.theme);

  // Restore timezone select
  if (state.timezone) {
    dom.tzSelect.value = state.timezone;
  }

  // Restore format toggle label
  dom.formatToggle.textContent = state.use24h ? '24H' : '12H';

  // Restore alarm if one was saved
  if (state.alarmTime) {
    dom.alarmInput.value         = state.alarmTime;
    dom.alarmStatus.textContent  = `Set for ${state.alarmTime}`;
    dom.alarmStatus.className    = 'status-text alarm-active';
    dom.clearAlarm.style.display = '';
  }

  // Set up timer SVG ring
  dom.ringFill.style.strokeDasharray  = RING_CIRCUMFERENCE;
  dom.ringFill.style.strokeDashoffset = RING_CIRCUMFERENCE;
  setRingProgress(1);

  // Set up pomodoro SVG ring
  dom.pomoRing.style.strokeDasharray  = RING_CIRCUMFERENCE;
  dom.pomoRing.style.strokeDashoffset = RING_CIRCUMFERENCE;
  setPomoRingProgress(1);

  // Restore pomodoro auto-start checkbox
  dom.pomoAutoStart.checked = state.pomo.autoStart;

  // Build world strip (clock tab 4 cities)
  buildWorldStrip();

  // Build world grid (world tab 9 cities)
  buildWorldGrid();

  // Build binary clock columns
  buildBinaryClock();

  // Request geolocation for sunrise/sunset
  initGeolocation();

  // Update pomodoro stats UI
  updatePomoStats();
  updatePomoDots();

  // Initialize pomodoro mode label
  const modeNames = { work: 'WORK', short: 'SHORT BREAK', long: 'LONG BREAK' };
  dom.pomoModeLabel.textContent = modeNames[state.pomo.mode];

  // Wire all event listeners
  attachEventListeners();

  // Kick off the main clock rAF loop
  requestAnimationFrame(updateClock);
}

// ═══════════════════════════════════════════════════════
//  BACKGROUND PARTICLE SYSTEM
// ═══════════════════════════════════════════════════════

const bgCanvas = document.getElementById('bgCanvas');
const bgCtx    = bgCanvas.getContext('2d');
let   bgParticles = [];

/** Resize canvas to fill the viewport */
function resizeBgCanvas() {
  bgCanvas.width  = window.innerWidth;
  bgCanvas.height = window.innerHeight;
}

/** Spawn a fresh set of particles */
function spawnParticles() {
  const area  = bgCanvas.width * bgCanvas.height;
  const count = Math.min(90, Math.floor(area / 11000));
  const { min, max } = particleAlphaRange();
  bgParticles = Array.from({ length: count }, () => ({
    x:        Math.random() * bgCanvas.width,
    y:        Math.random() * bgCanvas.height,
    r:        Math.random() * 1.4 + 0.4,
    vx:       (Math.random() - 0.5) * 0.22,
    vy:       -(Math.random() * 0.28 + 0.06),
    alpha:    Math.random() * (max - min) + min,
    alphaDir: (Math.random() > 0.5 ? 1 : -1) * 0.0025,
    alphaMin: min,
    alphaMax: max,
  }));
}

/** Return [r,g,b] for the current theme */
function particleColor() {
  if (state.theme === 'neon')  return [0,   255, 136];
  if (state.theme === 'light') return [139,  52, 234];   // vivid violet
  return [180, 180, 255];
}

/** Higher base alpha for light theme so particles are visible on pale bg */
function particleAlphaRange() {
  return state.theme === 'light'
    ? { min: 0.25, max: 0.65 }
    : { min: 0.08, max: 0.55 };
}

/** Main particle draw loop — runs on its own rAF */
function drawParticles() {
  bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
  const [r, g, b] = particleColor();

  bgParticles.forEach(p => {
    // Move
    p.x += p.vx;
    p.y += p.vy;

    // Fade in/out within each particle's personal range
    p.alpha += p.alphaDir;
    if (p.alpha > p.alphaMax || p.alpha < p.alphaMin) p.alphaDir *= -1;

    // Wrap horizontally, respawn from bottom when off top
    if (p.x < 0) p.x = bgCanvas.width;
    if (p.x > bgCanvas.width) p.x = 0;
    if (p.y < -4) {
      p.y = bgCanvas.height + 4;
      p.x = Math.random() * bgCanvas.width;
    }

    bgCtx.beginPath();
    bgCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    bgCtx.fillStyle = `rgba(${r},${g},${b},${p.alpha.toFixed(3)})`;
    bgCtx.fill();
  });

  requestAnimationFrame(drawParticles);
}

// Kick off particles
resizeBgCanvas();
spawnParticles();
drawParticles();

window.addEventListener('resize', () => {
  resizeBgCanvas();
  spawnParticles();
});

init();
