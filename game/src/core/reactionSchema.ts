import { Ajv2020 } from "ajv/dist/2020";

import schema from "../../../shared/reaction.schema.json";
import type { Reaction } from "./reaction";

const ajv = new Ajv2020({ allErrors: true });

export const isReaction = ajv.compile<Reaction>(schema);
