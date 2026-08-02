const safe = new Set(["wake", "flash", "honk", "start_climate", "stop_climate", "start_charging", "stop_charging", "set_charge_limit", "set_charging_amps"]);
const allowed = new Set([...safe, "lock", "unlock", "activate_front_trunk", "actuate_trunk", "close_windows", "vent_windows", "enable_sentry", "disable_sentry", "enable_valet", "disable_valet", "set_speed_limit", "enable_speed_limit", "disable_speed_limit", "clear_speed_limit_pin", "set_temperature", "start_max_defrost", "stop_max_defrost", "set_cabin_overheat_protection", "set_cop_temp", "schedule_software_update", "cancel_software_update"]);
export function commandPath(operation: string, confirm?: boolean): string {
  if (!allowed.has(operation)) throw new Error("Unsupported command operation");
  if (!safe.has(operation) && confirm !== true) throw new Error("This command requires confirm: true");
  return `/command/${operation}`;
}
