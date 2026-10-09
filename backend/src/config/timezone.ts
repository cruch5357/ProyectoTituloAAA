import * as timezoneConfig from '../../config/app-timezone.cjs';

export const DEFAULT_APP_TIMEZONE: string = timezoneConfig.DEFAULT_APP_TIMEZONE;
export const getAppTimezone: (value?: string) => string =
  timezoneConfig.getAppTimezone;
