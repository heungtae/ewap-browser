// Controlled remote-CDP adapter; production uses ChromeDebuggerTransport.
export class RemoteTransport {
  constructor(url) {
    this.url = url;
    this.pending = new Map();
    this.events = new Set();
    this.detaches = new Set();
    this.next = 0;
    this.attachments = 0;
    this.detachments = 0;
    this.commands = [];
  }
  async attach() {
    this.socket = new WebSocket(this.url);
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.attachments++;
    this.socket.addEventListener("message", (event) => {
      const data = JSON.parse(String(event.data));
      if (data.id) {
        const pending = this.pending.get(data.id);
        this.pending.delete(data.id);
        if (data.error) pending?.reject(new Error("CDP_COMMAND_FAILED"));
        else pending?.resolve(data.result);
      } else
        for (const listener of this.events) listener(data.method, data.params);
    });
    this.socket.addEventListener("close", () => {
      for (const p of this.pending.values()) p.reject(new Error("CDP_CLOSED"));
      this.pending.clear();
      for (const listener of this.detaches) listener();
    });
  }
  async detach() {
    const socket = this.socket;
    await new Promise((resolve) => {
      socket.addEventListener("close", resolve, { once: true });
      socket.close();
    });
    this.detachments++;
  }
  send(_tab, method, params) {
    this.commands.push(method);
    const id = ++this.next;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  listen(_tab, listener) {
    this.events.add(listener);
    return () => this.events.delete(listener);
  }
  onDetach(_tab, listener) {
    this.detaches.add(listener);
    return () => this.detaches.delete(listener);
  }
}
