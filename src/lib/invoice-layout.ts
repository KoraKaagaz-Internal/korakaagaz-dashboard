// Fitting the client block on the fixed-size invoice template (pure).
import { stateLabel, stateName } from "./gst";

const NAME_BOX = 280; // px, width of the "Billed to" column

/**
 * Client name size: 37px when it fits, shrinking to fit one line down to 20px; longer names wrap
 * onto two 22px lines, which take the same height as one 37px line so nothing below moves.
 * Width is estimated at 0.6em per character (Inter 500, mixed case).
 */
export function fitClientName(name: string): { size: number; wrap: boolean } {
  const fit = Math.floor(NAME_BOX / (0.6 * Math.max(1, name.length)));
  if (fit >= 37) return { size: 37, wrap: false };
  if (fit >= 20) return { size: fit, wrap: false };
  return { size: 18, wrap: true };
}

/** Address, then city/PIN/state only where the address doesn't already say them, then GSTIN. */
export function clientAddressLines(client: { address: string; city: string; pin: string; state_code: string; country: string; gstin: string }): string[] {
  const addr = client.address.trim();
  const has = (s: string) => !!s && addr.toLowerCase().includes(s.toLowerCase());
  const abroad = client.country && client.country !== "India";
  const state = abroad ? "" : stateName(client.state_code);
  const cityPin = [has(client.city) ? "" : client.city, has(client.pin) ? "" : client.pin].filter(Boolean).join(" ");
  const region = abroad ? (has(client.country) ? "" : client.country) : state ? (has(state) ? `State code ${client.state_code}` : stateLabel(client.state_code)) : "";
  return [addr, [cityPin, region].filter(Boolean).join(" · "), client.gstin ? `GSTIN: ${client.gstin}` : ""].filter(Boolean);
}
