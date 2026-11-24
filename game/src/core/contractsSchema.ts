import { Ajv2020 } from "ajv/dist/2020";

import contracts from "../../../shared/contracts.schema.json";
import events from "../../../shared/events.schema.json";
import intent from "../../../shared/intent.schema.json";
import manifest from "../../../shared/manifest.schema.json";
import observation from "../../../shared/observation.schema.json";
import outcome from "../../../shared/outcome.schema.json";
import reaction from "../../../shared/reaction.schema.json";
import reward from "../../../shared/reward.schema.json";
import step from "../../../shared/step.schema.json";
import type * as types from "./contracts";

const ajv = new Ajv2020({ allErrors: true, allowUnionTypes: true }).addSchema(reaction);

/** One validator per contract. Compile order matters: a schema's $refs must be compiled first. */
export const contractValidators = {
  event: ajv.compile<types.KernelEvent>(events),
  observation: ajv.compile<types.Observation>(observation),
  step: ajv.compile<types.Step>(step),
  intent: ajv.compile<types.Intent>(intent),
  outcome: ajv.compile<types.Outcome>(outcome),
  reward: ajv.compile<types.Reward>(reward),
  manifest: ajv.compile<types.Manifest>(manifest),
  contracts: ajv.compile<types.Contracts>(contracts),
};
