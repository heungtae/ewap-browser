import { createServer as createTcpServer } from "node:net";

export const reservePort = () =>
  new Promise((resolvePort, reject) => {
    const server = createTcpServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close();
      if (!address || typeof address === "string") reject(new Error("no port"));
      else resolvePort(address.port);
    });
  });

export const sleep = (milliseconds) =>
  new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

export const cdp = async (webSocketUrl, method, params = {}) => {
  const socket = new WebSocket(webSocketUrl);
  return new Promise((resolveResult, reject) => {
    socket.addEventListener("open", () =>
      socket.send(JSON.stringify({ id: 1, method, params })),
    );
    socket.addEventListener("message", (event) => {
      const result = JSON.parse(event.data);
      if (result.id !== 1) return;
      socket.close();
      if (result.error) reject(new Error(result.error.message));
      else resolveResult(result.result);
    });
    socket.addEventListener("error", () =>
      reject(new Error("CDP connection failed")),
    );
  });
};

export const waitFor = async (value, timeoutMs, message) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await value();
    if (result) return result;
    await sleep(100);
  }
  throw new Error(message);
};

export const evaluate = async (target, expression) => {
  const response = await cdp(target.webSocketDebuggerUrl, "Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  return response.result?.value;
};
