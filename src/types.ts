export interface TessieVehicleSummary {
  vin: string;
  display_name?: string;
  state?: string;
  vehicle_state?: {
    vehicle_name?: string;
    state?: string;
    timestamp?: number;
  };
  last_state?: {
    state?: string;
    timestamp?: number;
    vehicle_state?: {
      vehicle_name?: string;
    };
  };
  last_seen?: string;
}

export interface TessieVehicleState {
  display_name?: string;
  vehicle_state?: {
    vehicle_name?: string;
    locked?: boolean;
    sentry_mode?: boolean;
    odometer?: number;
  };
  charge_state?: {
    battery_level?: number;
    charging_state?: string;
    est_battery_range?: number;
    time_to_full_charge?: number;
  };
  climate_state?: {
    inside_temp?: number;
    outside_temp?: number;
    is_climate_on?: boolean;
  };
  drive_state?: {
    latitude?: number;
    longitude?: number;
    shift_state?: string;
    speed?: number;
  };
  battery_level?: number;
  battery_range?: number;
  charging_state?: string;
  latitude?: number;
  longitude?: number;
  inside_temp?: number;
  outside_temp?: number;
  is_climate_on?: boolean;
  timestamp?: number;
}

export interface TessieBatteryState {
  battery_level?: number;
  battery_level_percent?: number;
  est_battery_range?: number;
  range?: number;
  charging_state?: string;
  time_to_full_charge?: number;
}

export interface TessieDrive {
  id?: number | string;
  import_id?: string;
  started_at?: number | string;
  ended_at?: number | string;
  start_date?: number | string;
  end_date?: number | string;
  starting_location?: string;
  ending_location?: string;
  start_address?: string;
  end_address?: string;
  odometer_distance?: number;
  distance_miles?: number;
  distance?: number;
  energy_used?: number;
  average_speed?: number;
  tag?: string | null;
}
