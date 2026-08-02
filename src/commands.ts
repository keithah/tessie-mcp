import { z } from "zod";
const safe = new Set(["wake", "flash", "honk", "start_climate", "stop_climate", "start_charging", "stop_charging", "set_charge_limit", "set_charging_amps", "set_temperature", "start_max_defrost", "stop_max_defrost", "set_cabin_overheat_protection", "set_cop_temp"]);
export const operations = ["wake", "flash", "honk", "lock", "unlock", "start_climate", "stop_climate", "start_charging", "stop_charging", "set_charge_limit", "set_charging_amps", "set_temperature", "start_max_defrost", "stop_max_defrost", "set_cabin_overheat_protection", "set_cop_temp", "activate_front_trunk", "actuate_trunk", "open_tonneau", "close_tonneau", "close_windows", "vent_windows", "enable_sentry", "disable_sentry", "enable_valet", "disable_valet", "set_speed_limit", "enable_speed_limit", "disable_speed_limit", "clear_speed_limit_pin", "schedule_software_update", "cancel_software_update"] as const;
export const operationSchema = z.enum(operations);
const paramsSchema = z.object({ charge_limit_percent: z.number().min(0).max(100).optional(), charging_amps: z.number().positive().optional(), cabin_temp_c: z.number().optional(), speed_limit_mph: z.number().positive().optional(), speed_limit_pin: z.string().optional(), cabin_overheat_on: z.boolean().optional(), fan_only: z.boolean().optional(), wait_for_completion: z.boolean().optional() }).strict();
export function buildCommand(operation: string, input: unknown, confirm?: boolean) {
  const parsedOperation = operationSchema.parse(operation); if (!safe.has(parsedOperation) && confirm !== true) throw new Error("This command requires confirm: true");
  const params = paramsSchema.parse(input ?? {}); const body: Record<string, unknown> = {};
  const map: Record<string, string> = { charge_limit_percent: "percent", charging_amps: "amps", cabin_temp_c: "temperature", speed_limit_mph: "mph", speed_limit_pin: "pin", cabin_overheat_on: "on", fan_only: "fan_only", wait_for_completion: "wait_for_completion" };
  for (const [key, value] of Object.entries(params)) if (value !== undefined) body[map[key]] = value;
  return { path: `/command/${parsedOperation}`, body, requiresConfirmation: !safe.has(parsedOperation), redactions: ["speed_limit_pin"] };
}
