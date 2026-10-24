import {
  LocalStaging,
  type FrozenSource,
  type StagedSnapshot,
} from "./local-staging.js";
import { sourceKeys, type Snapshot, type Conversion } from "./mg03-types.js";
import { convertMg03 } from "./mg03-convert.js";
export type Mg03Source = FrozenSource;
export type StagedMg03 = StagedSnapshot<Snapshot, Conversion>;
export class Mg03Staging extends LocalStaging<Snapshot, Conversion> {
  constructor(db: IDBDatabase, source: Mg03Source) {
    super(db, source, {
      unit: "MG03",
      schema: "wca.mg03-stage/v1",
      sourceKeys,
      convert: convertMg03,
    });
  }
}
