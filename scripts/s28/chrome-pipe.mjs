// Browser-level CDP commands requiring the explicitly enabled debugging pipe.
export function pipeCommands(child) {
  let sequence = 0,
    buffer = "";
  const pending = new Map();
  child.stdio[4].setEncoding("utf8");
  child.stdio[4].on("data", (data) => {
    buffer += data;
    let end;
    while ((end = buffer.indexOf("\0")) >= 0) {
      const message = JSON.parse(buffer.slice(0, end));
      buffer = buffer.slice(end + 1);
      const waiter = pending.get(message.id);
      if (!waiter) continue;
      pending.delete(message.id);
      clearTimeout(waiter.timer);
      if (message.error) waiter.reject(new Error(message.error.message));
      else waiter.resolve(message.result);
    }
  });
  return (method, params) =>
    new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error("PIPE_TIMEOUT"));
      }, 5000);
      pending.set(id, { resolve, reject, timer });
      child.stdio[3].write(JSON.stringify({ id, method, params }) + "\0");
    });
}
