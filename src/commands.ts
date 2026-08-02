import { z } from "zod";
import type { QueryPayload } from "./tessie-types.js";

const paramsSchema = z.object({
  charge_limit_percent: z.number().min(0).max(100).optional(),
  charging_amps: z.number().positive().optional(),
  cabin_temp_c: z.number().min(15).max(28).optional(),
  cop_temp: z.number().int().min(1).max(3).optional(),
  speed_limit_mph: z.number().positive().optional(),
  speed_limit_pin: z.string().optional(),
  cabin_overheat_on: z.boolean().optional(),
  fan_only: z.boolean().optional(),
  wait_for_completion: z.boolean().optional(),
}).strict();
type Params = z.infer<typeof paramsSchema>;
type ParamName = keyof Params;
type Spec = { path?: string; safe?: boolean; required?: ParamName };

const specs = {
  wake: { safe: true }, flash: { safe: true }, honk: { safe: true },
  lock: {}, unlock: {}, start_climate: { safe: true }, stop_climate: { safe: true },
  start_charging: { safe: true }, stop_charging: { safe: true },
  set_charge_limit: { safe: true, required: "charge_limit_percent" },
  set_charging_amps: { safe: true, required: "charging_amps" },
  set_temperature: { safe: true, path: "set_temperatures", required: "cabin_temp_c" },
  start_max_defrost: { safe: true }, stop_max_defrost: { safe: true },
  set_cabin_overheat_protection: { required: "cabin_overheat_on" }, set_cop_temp: { required: "cop_temp" },
  activate_front_trunk: {}, actuate_trunk: { path: "activate_rear_trunk" },
  open_tonneau: {}, close_tonneau: {}, close_windows: {}, vent_windows: {},
  enable_sentry: {}, disable_sentry: {}, enable_valet: {}, disable_valet: {},
  set_speed_limit: { required: "speed_limit_mph" }, enable_speed_limit: { required: "speed_limit_pin" },
  disable_speed_limit: { required: "speed_limit_pin" }, clear_speed_limit_pin: { required: "speed_limit_pin" },
  schedule_software_update: {}, cancel_software_update: {},
} as const satisfies Record<string, Spec>;

export const operations = Object.keys(specs) as [keyof typeof specs, ...(keyof typeof specs)[]];
export const operationSchema = z.enum(operations);

const payloadKeys: Record<ParamName, string> = {
  charge_limit_percent: "percent", charging_amps: "amps", cabin_temp_c: "temperature", cop_temp: "cop_temp",
  speed_limit_mph: "mph", speed_limit_pin: "pin", cabin_overheat_on: "on", fan_only: "fan_only", wait_for_completion: "wait_for_completion",
};

export function buildCommand(operation: string, input: unknown, confirm?: boolean) {
  const name = operationSchema.parse(operation);
  const spec: Spec = specs[name];
  if (!spec.safe && confirm !== true) throw new Error("This command requires confirm: true");
  const params = paramsSchema.parse(input ?? {});
  if (spec.required === "speed_limit_pin" && !params.speed_limit_pin?.trim()) throw new Error(`${name} requires a non-empty speed_limit_pin`);
  if (spec.required && spec.required !== "speed_limit_pin" && params[spec.required] === undefined) throw new Error(`${name} requires ${spec.required}`);
  const body: QueryPayload = {};
  for (const key of Object.keys(payloadKeys) as ParamName[]) {
    const value = params[key];
    if (value !== undefined) body[payloadKeys[key]] = value;
  }
  return { path: `/command/${spec.path ?? name}`, body, requiresConfirmation: !spec.safe, redactions: ["speed_limit_pin"] as const };
}
