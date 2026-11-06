window.JomJalanAPI = (() => {
  const requestJSON = async (url, options = {}) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    let response;
    try {
      response = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
        ...options
      });
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) throw new Error(`API request failed (${response.status})`);
    return response.json();
  };

  async function getWeather(destination) {
    const query = new URLSearchParams({
      latitude: destination.lat,
      longitude: destination.lon,
      current: 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m',
      timezone: 'auto'
    });
    const data = await requestJSON(`https://api.open-meteo.com/v1/forecast?${query}`);
    const current = data.current;
    if (!current) throw new Error('Weather response has no current conditions.');
    return {
      temperature: current.temperature_2m,
      apparent: current.apparent_temperature,
      humidity: current.relative_humidity_2m,
      weatherCode: current.weather_code,
      wind: current.wind_speed_10m,
      time: current.time
    };
  }

  async function getFlightEstimate(destination) {
    if (destination.id === 'kualalumpur') {
      return {
        route: 'Local city break',
        duration: 'No flight needed',
        distanceKm: 0
      };
    }
    const km = greatCircleKm(101.6869, 3.139, destination.lon, destination.lat);
    const hours = km / 820 + 2.25;
    const minutes = Math.round(hours * 60 / 5) * 5;
    const h = Math.floor(minutes / 60), m = minutes % 60;
    return Promise.resolve({
      source: 'JomJalan Flight Schedule Mock API',
      route: `KUL → ${destination.airport}`,
      duration: `${h}h ${m === 60 ? '00' : String(m).padStart(2, '0')}m`,
      distanceKm: Math.round(km)
    });
  }

  async function getHotelRates(destination, style = 'standard') {
    const month = new Date().getMonth();
    const seasonalFactor = [
      0.96, 0.96, 1, 1.02, 1.04, 1.08,
      1.12, 1.1, 1.05, 1.02, 1, 1.04
    ][month];
    const styleFactor = { budget: 0.72, standard: 1, premium: 1.8 }[style] || 1;
    const perNight = Math.round(destination.hotel * seasonalFactor * styleFactor);
    return Promise.resolve({
      source: 'JomJalan Hotel Rates Mock API',
      perNight,
      currency: 'MYR',
      label: `${style[0].toUpperCase()}${style.slice(1)} stay estimate`
    });
  }

  async function getCityRoute(destination) {
    const [startLon, startLat, endLon, endLat] = destination.route;
    const data = await requestJSON(
      `https://router.project-osrm.org/route/v1/driving/${startLon},${startLat};${endLon},${endLat}?overview=false`
    );
    const route = data.routes && data.routes[0];
    if (!route) throw new Error('No route returned.');
    return {
      distance: (route.distance / 1000).toFixed(1),
      duration: `${Math.max(1, Math.round(route.duration / 60))} min`,
      source: 'OSRM'
    };
  }

  async function getCurrencyRate(base, quote) {
    if (base === quote) {
      return { rate: 1, date: 'same currency', source: 'Frankfurter' };
    }
    const data = await requestJSON(
      `https://api.frankfurter.dev/v2/rate/${encodeURIComponent(base.toLowerCase())}/${encodeURIComponent(quote.toLowerCase())}`
    );
    const rate = data.rate;
    if (!rate) throw new Error(`No ${quote} exchange rate found.`);
    return { rate, date: data.date, source: 'Frankfurter' };
  }

  async function getHolidays(destination, year) {
    const data = await requestJSON(
      `https://date.nager.at/api/v3/PublicHolidays/${year}/${destination.countryCode}`
    );
    return Array.isArray(data) ? data : [];
  }

  async function getNextHoliday(destination) {
    const today = new Date();
    const years = [today.getFullYear(), today.getFullYear() + 1];
    const calendars = await Promise.all(
      years.map(year => getHolidays(destination, year))
    );
    const holidays = calendars
      .flat()
      .filter(item => item.date >= today.toISOString().slice(0, 10))
      .sort((a, b) => a.date.localeCompare(b.date));
    return holidays[0] || null;
  }

  async function getHolidayOnDate(destination, date) {
    const year = Number(date.slice(0, 4));
    const holidays = await getHolidays(destination, year);
    const target = new Date(`${date}T00:00:00Z`).getTime();
    return holidays.find(
      item => Math.abs(
        new Date(`${item.date}T00:00:00Z`).getTime() - target
      ) <= 3 * 86400000
    ) || null;
  }

  function greatCircleKm(lon1, lat1, lon2, lat2) {
    const radians = value => value * Math.PI / 180;
    const dLat = radians(lat2 - lat1), dLon = radians(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos(radians(lat1))
      * Math.cos(radians(lat2))
      * Math.sin(dLon / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  return {
    getWeather,
    getFlightEstimate,
    getHotelRates,
    getCityRoute,
    getCurrencyRate,
    getHolidays,
    getNextHoliday,
    getHolidayOnDate
  };
})();