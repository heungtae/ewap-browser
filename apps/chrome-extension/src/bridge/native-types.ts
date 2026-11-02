export interface NativePort {
  postMessage(value: unknown): void;
  disconnect(): void;
  onMessage: { addListener(callback: (value: unknown) => void): void };
  onDisconnect: { addListener(callback: () => void): void };
}
export interface Pairing {
  installationId: string;
  profileId: string;
  extensionId: string;
  secret: string;
}
export interface NativeIdentity {
  connectionId: string;
  connectionEpoch: number;
}
export interface NativeSender {
  request(payload: { kind: string }): Promise<unknown>;
}
