import { Ajv2020 } from "ajv/dist/2020";

import schema from "../../../shared/reaction.schema.json";
import type { Reaction, Step } from "./reaction";

const ajv = new Ajv2020({ allErrors: true });

export const isReaction = ajv.compile<Reaction>(schema);

/** A script as the validator leaves it: one or more reaction steps. */
export const isScript = ajv.compile<Step[]>({
  type: "array",
  minItems: 1,
  items: { $ref: `${schema.$id}#/$defs/Step` },
});
