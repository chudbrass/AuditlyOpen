import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { LookupFunction } from "node:net";

export const EGRESS_BLOCKED_MESSAGE = "Blocked request to a non-global network address";
const DNS_TIMEOUT_MS = 5_000;

export function allowsPrivateNetwork(): boolean {
  return process.env.AUDITLY_ALLOW_PRIVATE_NETWORK === "true";
}

function ipv4Number(address: string): number | null {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return (((parts[0] * 256 + parts[1]) * 256 + parts[2]) * 256 + parts[3]) >>> 0;
}

function inV4Cidr(value: number, base: string, prefix: number): boolean {
  const baseValue = ipv4Number(base)!;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (value & mask) === (baseValue & mask);
}

const NON_GLOBAL_V4: Array<[string, number]> = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
];

function expandIpv6(address: string): bigint | null {
  const normalized = address.toLowerCase().split("%")[0];
  const mapped = normalized.match(/^(?:0*:){5}ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (mapped) {
    const v4 = ipv4Number(mapped);
    return v4 === null ? null : (BigInt(0xffff) << BigInt(32)) | BigInt(v4);
  }
  if (normalized.includes(".")) return null;
  const halves = normalized.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) return null;
  const groups = [...left, ...Array(missing).fill("0"), ...right];
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  return groups.reduce((value, group) => (value << BigInt(16)) | BigInt(`0x${group}`), BigInt(0));
}

export function isGlobalAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const value = ipv4Number(address);
    return value !== null && !NON_GLOBAL_V4.some(([base, prefix]) => inV4Cidr(value, base, prefix));
  }
  if (family !== 6) return false;
  const value = expandIpv6(address);
  if (value === null) return false;
  const mappedPrefix = BigInt(0xffff) << BigInt(32);
  if ((value >> BigInt(32)) === BigInt(0xffff)) return isGlobalAddress(`${Number((value >> BigInt(24)) & BigInt(255))}.${Number((value >> BigInt(16)) & BigInt(255))}.${Number((value >> BigInt(8)) & BigInt(255))}.${Number(value & BigInt(255))}`);
  // Only globally routable unicast is accepted. Exclude documentation space explicitly.
  const globalUnicast = (value >> BigInt(125)) === BigInt(1); // 2000::/3
  const documentation = (value >> BigInt(96)) === BigInt(0x20010db8);
  return globalUnicast && !documentation && value !== mappedPrefix;
}

export interface VettedAddress { address: string; family: 4 | 6 }
export type AddressResolver = (hostname: string) => Promise<Array<{ address: string; family: number }>>;

/**
 * Pins a connection to an address that has already passed the egress checks above.
 * Node may request either one address or an array (`all: true`); Undici 7 uses the
 * array form. Returning the single-address callback shape for an array request makes
 * Node try to connect to `undefined` and fail with "Invalid IP address: undefined".
 */
export function createPinnedLookup(vetted: VettedAddress): LookupFunction {
  return (_hostname, options, callback) => {
    const record = { address: vetted.address, family: vetted.family };
    if (options.all) {
      callback(null, [record]);
      return;
    }
    callback(null, record.address, record.family);
  };
}

const systemResolver: AddressResolver = (hostname) => lookup(hostname, { all: true, verbatim: true });

export async function resolveVettedAddress(hostname: string, resolver: AddressResolver = systemResolver): Promise<VettedAddress> {
  const literalFamily = isIP(hostname);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const resolution = literalFamily ? [{ address: hostname, family: literalFamily }] : await Promise.race([
    resolver(hostname),
    new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`DNS lookup for ${hostname} timed out`)), DNS_TIMEOUT_MS); }),
  ]).finally(() => clearTimeout(timer));
  if (resolution.length === 0) throw new Error(`DNS lookup for ${hostname} returned no addresses`);
  if (!allowsPrivateNetwork() && resolution.some(({ address }) => !isGlobalAddress(address))) throw new Error(EGRESS_BLOCKED_MESSAGE);
  const selected = resolution.find(({ family }) => family === 4) ?? resolution[0];
  if (selected.family !== 4 && selected.family !== 6) throw new Error("DNS returned an unsupported address family");
  return { address: selected.address, family: selected.family };
}

export function assertHttpUrl(rawUrl: string): URL {
  const url = new URL(rawUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Blocked unsafe request URL");
  if (url.username || url.password) throw new Error("Blocked URL containing credentials");
  return url;
}
