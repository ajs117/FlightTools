/**
 * Format a duration in hours and minutes
 */
export const formatDuration = (hours: number, minutes: number): string => {
  return `${hours}h ${minutes}m`;
};

/**
 * Parse a duration string (e.g., '2h 30m') into hours and minutes
 */
export const parseDuration = (duration: string): { hours: number; minutes: number } => {
  const [hours, minutes] = duration.split('h ').map(part => 
    parseInt(part.replace('m', ''))
  );
  return { hours, minutes };
};

interface AirportTimezone {
  timezone: string;
  offset: {
    gmt: number;
    dst: number;
  };
}

/**
 * Calculate duration between departure and arrival times, accounting for timezones
 */
export const calculateDuration = (
  depTime: string, 
  arrTime: string, 
  depTimezone: AirportTimezone | null, 
  arrTimezone: AirportTimezone | null
): string => {
  if (!depTimezone || !arrTimezone) {
    return 'Unknown duration';
  }

  const depDate = new Date(depTime);
  const arrDate = new Date(arrTime);

  // Convert to UTC considering timezone offsets
  const depUTC = new Date(depDate.getTime() - (depTimezone.offset.dst * 3600000));
  const arrUTC = new Date(arrDate.getTime() - (arrTimezone.offset.dst * 3600000));

  const durationMs = arrUTC.getTime() - depUTC.getTime();
  const hours = Math.floor(durationMs / (1000 * 60 * 60));
  const minutes = Math.round((durationMs % (1000 * 60 * 60)) / (1000 * 60));

  return formatDuration(hours, minutes);
};

/**
 * Convert a date to UTC based on airport timezone
 */
export const convertToUTC = (date: Date, timezone: AirportTimezone): Date => {
  return new Date(date.getTime() - ((timezone.offset.gmt + timezone.offset.dst) * 3600000));
};

/**
 * Format a date with an option to include UTC time
 */
export const formatDateTime = (date: Date, includeUTC = false): string => {
  const localString = date.toLocaleString();
  return includeUTC ? `${localString} ${includeUTC ? '(' + date.toUTCString() + ')' : ''}` : localString;
};

/**
 * Get the current time in a specific airport's timezone
 */
export const getCurrentTimeInTimezone = (timezone: AirportTimezone): Date => {
  const now = new Date();
  // Adjust for timezone offset
  return new Date(now.getTime() + ((timezone.offset.gmt + timezone.offset.dst) * 3600000));
}; 