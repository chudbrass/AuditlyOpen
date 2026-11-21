import http from "node:http";
import net from "node:net";
import { resolveVettedAddress, assertHttpUrl } from "./egressPolicy";

export interface EgressProxy { port: number; close(): Promise<void> }

export async function startEgressProxy(): Promise<EgressProxy> {
  const server = http.createServer(async (request, response) => {
    try {
      const target = assertHttpUrl(request.url ?? "");
      const vetted = await resolveVettedAddress(target.hostname);
      const headers: http.OutgoingHttpHeaders = { ...request.headers, host: target.host };
      delete headers["proxy-connection"];
      const upstream = http.request({
        hostname: vetted.address,
        family: vetted.family,
        port: Number(target.port || 80),
        method: request.method,
        path: `${target.pathname}${target.search}`,
        headers,
        agent: false,
      }, (upstreamResponse) => {
        response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
        upstreamResponse.pipe(response);
      });
      upstream.on("error", (error) => response.destroy(error));
      request.pipe(upstream);
    } catch (error) {
      response.writeHead(403, { "content-type": "text/plain" });
      response.end(error instanceof Error ? error.message : String(error));
    }
  });

  server.on("connect", async (request, client, head) => {
    client.on("error", () => client.destroy());
    try {
      const target = new URL(`https://${request.url}`);
      const vetted = await resolveVettedAddress(target.hostname);
      if (client.destroyed) return;
      const upstream = net.connect({ host: vetted.address, family: vetted.family, port: Number(target.port || 443) });
      client.once("close", () => upstream.destroy());
      upstream.once("connect", () => {
        client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        if (head.length) upstream.write(head);
        upstream.pipe(client);
        client.pipe(upstream);
      });
      upstream.on("error", () => client.destroy());
    } catch {
      client.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Failed to bind egress proxy");
  return { port: address.port, close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) };
}
