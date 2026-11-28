// Each page load owns one MessagePort. No application objects cross this boundary.
export function createRpcPeer(
  port: MessagePort,
  handle: (method: string, args: unknown) => unknown | Promise<unknown>,
  onNotify: (event: string, value: unknown) => void = () => {},
  onClose: () => void = () => {},
) {
  let sequence = 0;
  let closed = false;
  const pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  const send = (message: unknown) => {
    if (closed) throw new Error("HTML view connection is closed.");
    port.postMessage(message);
  };
  const close = () => {
    if (closed) return;
    port.postMessage({ type: "close" });
    closed = true;
    port.removeEventListener("message", receive);
    port.removeEventListener("messageerror", close);
    port.close();
    for (const request of pending.values())
      request.reject(new Error("HTML view connection is closed."));
    pending.clear();
    onClose();
  };
  const receive = (event: MessageEvent) => {
    const data = event.data;
    if (closed || !data || typeof data !== "object") return;
    if (data.type === "close") {
      close();
      return;
    }
    if (data.type === "response" && Number.isSafeInteger(data.id)) {
      const request = pending.get(data.id);
      if (!request) return;
      pending.delete(data.id);
      if (typeof data.error === "string") request.reject(new Error(data.error));
      else request.resolve(data.value);
    } else if (data.type === "notify" && typeof data.event === "string") {
      onNotify(data.event, data.value);
    } else if (
      data.type === "request" &&
      Number.isSafeInteger(data.id) &&
      typeof data.method === "string"
    ) {
      void Promise.resolve()
        .then(() => {
          if (closed) throw new Error("HTML view connection is closed.");
          return handle(data.method, data.args);
        })
        .then(
          (value) => {
            if (!closed) send({ type: "response", id: data.id, value });
          },
          (error: unknown) => {
            if (!closed)
              send({
                type: "response",
                id: data.id,
                error: error instanceof Error ? error.message : String(error),
              });
          },
        );
    }
  };
  port.addEventListener("message", receive);
  port.addEventListener("messageerror", close);
  port.start();
  return {
    request<T>(method: string, args?: unknown): Promise<T> {
      return new Promise((resolve, reject) => {
        const id = ++sequence;
        try {
          send({ type: "request", id, method, args });
          pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
        } catch (error) {
          reject(error);
        }
      });
    },
    notify(event: string, value: unknown) {
      send({ type: "notify", event, value });
    },
    close,
  };
}
