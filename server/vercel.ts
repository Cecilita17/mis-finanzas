import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";

type VercelRequest = IncomingMessage & { body?: unknown };
export function asVercel(handler: (request: Request) => Promise<Response>) {
  return async (incoming: VercelRequest, outgoing: ServerResponse) => {
    const headers = new Headers();
    for (const [name, value] of Object.entries(incoming.headers)) {
      if (value !== undefined)
        headers.set(name, Array.isArray(value) ? value.join(", ") : value);
    }
    const method = incoming.method ?? "GET";
    const base = "https://" + (headers.get("host") || "localhost");
    let body: BodyInit | undefined;
    if (method !== "GET" && method !== "HEAD") {
      const parsed = incoming.body;
      const contentType = headers.get("content-type") ?? "";
      if (parsed !== undefined) {
        if (Buffer.isBuffer(parsed)) body = new Uint8Array(parsed);
        else if (typeof parsed === "string") body = parsed;
        else if (
          contentType.includes("application/x-www-form-urlencoded") &&
          parsed &&
          typeof parsed === "object"
        )
          body = new URLSearchParams(parsed as Record<string, string>);
        else body = JSON.stringify(parsed);
      } else {
        const chunks: Buffer[] = [];
        for await (const part of incoming)
          chunks.push(Buffer.isBuffer(part) ? part : Buffer.from(part));
        body = new Uint8Array(Buffer.concat(chunks));
      }
    }
    try {
      const response = await handler(
        new Request(new URL(incoming.url ?? "/", base), {
          method,
          headers,
          body,
        }),
      );
      outgoing.statusCode = response.status;
      response.headers.forEach((value, name) =>
        outgoing.setHeader(name, value),
      );
      if (response.body)
        Readable.fromWeb(
          response.body as import("node:stream/web").ReadableStream,
        ).pipe(outgoing);
      else outgoing.end();
    } catch {
      outgoing.statusCode = 500;
      outgoing.setHeader("Content-Type", "application/json");
      outgoing.end(
        JSON.stringify({ message: "No se pudo procesar la solicitud." }),
      );
    }
  };
}
