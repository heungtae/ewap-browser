type Port = {
  onMessage: { addListener(listener: (message: unknown) => void): void };
  onDisconnect: { addListener(listener: () => void): void };
  disconnect(): void;
};

/** Reconnect after worker suspension and recover events without resending work. */
export const connectPanel = (dependencies: {
  connect(): Port;
  receive(message: unknown): void;
  recover(): void;
}) => {
  let stopped = false;
  let port: Port | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const retry = (): void => {
    if (!stopped && timer === undefined)
      timer = setTimeout(() => {
        timer = undefined;
        connect();
      }, 250);
  };
  const connect = (): void => {
    if (stopped) return;
    try {
      const connected = dependencies.connect();
      port = connected;
      connected.onMessage.addListener(dependencies.receive);
      connected.onDisconnect.addListener(() => {
        if (port !== connected) return;
        port = undefined;
        retry();
      });
      dependencies.recover();
    } catch {
      retry();
    }
  };
  connect();
  return () => {
    stopped = true;
    clearTimeout(timer);
    port?.disconnect();
  };
};
