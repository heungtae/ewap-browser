import { LocalStaging, type FrozenSource } from "./local-staging.js";
import {
  mg05Keys,
  convertMg05,
  type ExecutionSnapshot,
  type ExecutionConversion,
} from "./mg05-convert.js";
export class Mg05Staging extends LocalStaging<
  ExecutionSnapshot,
  ExecutionConversion
> {
  constructor(db: IDBDatabase, sessionSource: FrozenSource) {
    super(db, sessionSource, {
      unit: "MG05",
      schema: "wca.mg05-stage/v1",
      sourceKeys: mg05Keys,
      convert: convertMg05,
    });
  }
}
