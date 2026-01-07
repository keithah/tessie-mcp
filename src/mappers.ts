import { TessieBatteryState, TessieDrive, TessieVehicleState, TessieVehicleSummary } from "./types.ts";

export function toVehicleListItem(v: TessieVehicleSummary) {
  return {
    vin: v.vin,
    name:
      v.display_name ||
      v?.vehicle_state?.vehicle_name ||
      v?.last_state?.vehicle_state?.vehicle_name,
    status: v.state || v?.vehicle_state?.state || v?.last_state?.state,
    last_seen: v?.last_seen ?? v?.vehicle_state?.timestamp ?? v?.last_state?.timestamp,
  };
}

export function toStateSummary(vin: string, state: TessieVehicleState) {
  return {
    vin,
    vehicle: state?.vehicle_state?.vehicle_name ?? state?.display_name,
    locked: state?.vehicle_state?.locked,
    sentry_mode: state?.vehicle_state?.sentry_mode,
    odometer: state?.vehicle_state?.odometer,
    battery_level: state?.charge_state?.battery_level ?? state?.battery_level,
    charging_state: state?.charge_state?.charging_state ?? state?.charging_state,
    est_range_miles: state?.charge_state?.est_battery_range ?? state?.battery_range,
    location: {
      latitude: state?.drive_state?.latitude ?? state?.latitude,
      longitude: state?.drive_state?.longitude ?? state?.longitude,
      shift_state: state?.drive_state?.shift_state,
      speed: state?.drive_state?.speed,
    },
    climate: {
      inside_temp: state?.climate_state?.inside_temp ?? state?.inside_temp,
      outside_temp: state?.climate_state?.outside_temp ?? state?.outside_temp,
      climate_on: state?.climate_state?.is_climate_on ?? state?.is_climate_on,
    },
    timestamp: state?.timestamp,
  };
}

export function toBatterySummary(vin: string, battery: TessieBatteryState) {
  return {
    vin,
    level: battery?.battery_level ?? battery?.battery_level_percent,
    estimated_range: battery?.est_battery_range ?? battery?.range,
    charging_state: battery?.charging_state,
    time_to_full_charge: battery?.time_to_full_charge,
  };
}

export function toDriveSummary(drive: TessieDrive) {
  return {
    id: drive?.id ?? drive?.import_id,
    started_at: drive?.started_at ?? drive?.start_date,
    ended_at: drive?.ended_at ?? drive?.end_date,
    start: drive?.starting_location ?? drive?.start_address,
    end: drive?.ending_location ?? drive?.end_address,
    distance_miles:
      drive?.odometer_distance ?? drive?.distance_miles ?? drive?.distance,
    energy_used_kwh: drive?.energy_used,
    average_speed: drive?.average_speed,
    tag: drive?.tag,
  };
}
