const DEFAULT_APP_TIMEZONE = 'America/Santiago';

function getAppTimezone(value = process.env.APP_TIMEZONE ?? DEFAULT_APP_TIMEZONE) {
  try {
    if (typeof value !== 'string' || !value.trim()) throw new Error();
    return new Intl.DateTimeFormat('en', { timeZone: value }).resolvedOptions().timeZone;
  } catch {
    throw new Error('APP_TIMEZONE debe ser una zona horaria válida.');
  }
}

module.exports = { DEFAULT_APP_TIMEZONE, getAppTimezone };
