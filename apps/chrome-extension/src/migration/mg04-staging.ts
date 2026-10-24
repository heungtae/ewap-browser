import { LocalStaging, type FrozenSource } from "./local-staging.js";
import {
  convertMg04,
  type HistorySnapshot,
  type HistoryConversion,
} from "./mg04-convert.js";
export class Mg04Staging extends LocalStaging<
  HistorySnapshot,
  HistoryConversion
> {
  constructor(db: IDBDatabase, sessionSource: FrozenSource) {
    super(db, sessionSource, {
      unit: "MG04",
      schema: "wca.mg04-stage/v1",
      sourceKeys: ["chat_session_v1"],
      convert: convertMg04,
    });
  }
}
