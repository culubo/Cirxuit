/**
 * The editable numeric values of each electrical model, shared by the
 * inspector (Simulate) and the builder sidebar (Build PCB).
 */
import type { ElectricalModel } from "../model/board-model";

/** A single editable numeric field derived from a part's electrical model. */
export interface NumericFieldDesc {
  key: string;            // "ohms", "vf", "beta", "volts", "runOhms", "stallOhms"
  label: string;
  value: number;
  /** Build a new model with this field replaced by `v`. */
  withValue: (v: number) => ElectricalModel;
}

/** Return the editable numeric fields for a model (excludes the pot wiper slider). */
export function numericFields(model: ElectricalModel): NumericFieldDesc[] {
  switch (model.type) {
    case "resistor":
      return [{ key: "ohms", label: "ohms", value: model.ohms, withValue: (v) => ({ ...model, ohms: v }) }];
    case "led":
      return [{ key: "vf", label: "vf (V)", value: model.vf, withValue: (v) => ({ ...model, vf: v }) }];
    case "diode":
      return [{ key: "vf", label: "vf (V)", value: model.vf, withValue: (v) => ({ ...model, vf: v }) }];
    case "npn":
      return [{ key: "beta", label: "beta", value: model.beta, withValue: (v) => ({ ...model, beta: v }) }];
    case "vsource":
      return [{ key: "volts", label: "volts (V)", value: model.volts, withValue: (v) => ({ ...model, volts: v }) }];
    case "servo":
      return [
        { key: "runOhms", label: "run Ω", value: model.runOhms, withValue: (v) => ({ ...model, runOhms: v }) },
        { key: "stallOhms", label: "stall Ω", value: model.stallOhms, withValue: (v) => ({ ...model, stallOhms: v }) },
      ];
    case "potentiometer":
    case "capacitor":
    case "mcu":
      return [];
    default: {
      const _exhaustive: never = model;
      return _exhaustive;
    }
  }
}
