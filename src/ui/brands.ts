/**
 * Service logos for the row glyphs, so Spotify reads as Spotify at a glance.
 *
 * The marks are bundled from Simple Icons (CC0 paths; the trademarks stay
 * with their owners) and drawn in the row's state colour, never the brand's:
 * Spotify green would read as "paid" and Netflix red as "late". Nothing is
 * fetched at runtime, so no one learns which subscriptions you pay for.
 * Brands that asked Simple Icons to drop their mark (OpenAI, Amazon, Canva,
 * LinkedIn) get their initial instead.
 */

import {
  siAirtel,
  siApple,
  siApplemusic,
  siAppletv,
  siClaude,
  siCloudflare,
  siCursor,
  siDigitalocean,
  siDuolingo,
  siFigma,
  siGithub,
  siGodaddy,
  siGoogle,
  siGooglegemini,
  siGoogleplay,
  siHostinger,
  siIcloud,
  siJio,
  siNamecheap,
  siNetflix,
  siNotion,
  siPerplexity,
  siSpotify,
  siSwiggy,
  siUber,
  siVercel,
  siX,
  siYoutube,
  siYoutubemusic,
  siZoho,
  siZomato,
} from 'simple-icons';
import type { Obligation } from '../core/types';

export interface Brand {
  name: string;
  /** A 24×24 SVG path, or null to show the initial. */
  path: string | null;
  letter: string;
}

interface Rule {
  name: string;
  icon?: { path: string };
  letter?: string;
  /** Matched against the title as whole words. */
  words: RegExp;
  /** Matched against the payment link's host, and its subdomains. */
  hosts?: string[];
}

// Order matters: the more specific name first (YouTube Music before YouTube).
const RULES: Rule[] = [
  { name: 'Spotify', icon: siSpotify, words: /\bspotify\b/, hosts: ['spotify.com'] },
  { name: 'Claude', icon: siClaude, words: /\b(claude|anthropic)\b/, hosts: ['claude.ai', 'claude.com', 'anthropic.com'] },
  { name: 'ChatGPT', letter: 'G', words: /\b(chat ?gpt|openai)\b/, hosts: ['chatgpt.com', 'openai.com'] },
  { name: 'Perplexity', icon: siPerplexity, words: /\bperplexity\b/, hosts: ['perplexity.ai'] },
  { name: 'Cursor', icon: siCursor, words: /\bcursor\b/, hosts: ['cursor.com', 'cursor.sh'] },
  { name: 'Gemini', icon: siGooglegemini, words: /\b(gemini|google ai)\b/, hosts: ['gemini.google.com'] },
  { name: 'Google One', icon: siGoogle, words: /\bgoogle one\b/, hosts: ['one.google.com'] },
  { name: 'Google Play', icon: siGoogleplay, words: /\bgoogle play\b/, hosts: ['play.google.com'] },
  { name: 'Netflix', icon: siNetflix, words: /\bnetflix\b/, hosts: ['netflix.com'] },
  { name: 'YouTube Music', icon: siYoutubemusic, words: /\byoutube music\b/, hosts: ['music.youtube.com'] },
  { name: 'YouTube', icon: siYoutube, words: /\byoutube\b/, hosts: ['youtube.com'] },
  { name: 'Hotstar', letter: 'H', words: /\b(hotstar|jiohotstar)\b/, hosts: ['hotstar.com'] },
  { name: 'Prime', letter: 'P', words: /\b(amazon prime|prime video)\b/, hosts: ['primevideo.com'] },
  { name: 'Apple Music', icon: siApplemusic, words: /\bapple music\b/, hosts: ['music.apple.com'] },
  { name: 'Apple TV', icon: siAppletv, words: /\bapple tv\b/, hosts: ['tv.apple.com'] },
  { name: 'iCloud', icon: siIcloud, words: /\bicloud\b/, hosts: ['icloud.com'] },
  { name: 'Apple', icon: siApple, words: /\bapple\b/, hosts: ['apple.com'] },
  { name: 'Jio', icon: siJio, words: /\bjio\b/, hosts: ['jio.com'] },
  { name: 'Airtel', icon: siAirtel, words: /\bairtel\b/, hosts: ['airtel.in'] },
  { name: 'Vi', letter: 'Vi', words: /^vi\b|\bvodafone idea\b/, hosts: ['myvi.in'] },
  { name: 'GitHub', icon: siGithub, words: /\b(github|copilot)\b/, hosts: ['github.com'] },
  { name: 'Vercel', icon: siVercel, words: /\bvercel\b/, hosts: ['vercel.com'] },
  { name: 'Cloudflare', icon: siCloudflare, words: /\bcloudflare\b/, hosts: ['cloudflare.com'] },
  { name: 'DigitalOcean', icon: siDigitalocean, words: /\bdigital ?ocean\b/, hosts: ['digitalocean.com'] },
  { name: 'Hostinger', icon: siHostinger, words: /\bhostinger\b/, hosts: ['hostinger.in', 'hostinger.com'] },
  { name: 'GoDaddy', icon: siGodaddy, words: /\bgodaddy\b/, hosts: ['godaddy.com'] },
  { name: 'Namecheap', icon: siNamecheap, words: /\bnamecheap\b/, hosts: ['namecheap.com'] },
  { name: 'Zoho', icon: siZoho, words: /\bzoho\b/, hosts: ['zoho.com', 'zoho.in'] },
  { name: 'Notion', icon: siNotion, words: /\bnotion\b/, hosts: ['notion.so', 'notion.com'] },
  { name: 'Figma', icon: siFigma, words: /\bfigma\b/, hosts: ['figma.com'] },
  { name: 'Canva', letter: 'C', words: /\bcanva\b/, hosts: ['canva.com'] },
  { name: 'LinkedIn', letter: 'in', words: /\blinkedin\b/, hosts: ['linkedin.com'] },
  { name: 'Duolingo', icon: siDuolingo, words: /\bduolingo\b/, hosts: ['duolingo.com'] },
  { name: 'X', icon: siX, words: /\b(x premium|twitter)\b/, hosts: ['x.com', 'twitter.com'] },
  { name: 'Swiggy', icon: siSwiggy, words: /\bswiggy\b/, hosts: ['swiggy.com'] },
  { name: 'Zomato', icon: siZomato, words: /\bzomato\b/, hosts: ['zomato.com'] },
  { name: 'Uber', icon: siUber, words: /\buber\b/, hosts: ['uber.com'] },
];

function hostOf(url?: string): string {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

const cache = new Map<string, Brand | null>();

/** The service an obligation is for, by its name first and its link second. */
export function brandFor(ob: Pick<Obligation, 'title' | 'url'>): Brand | null {
  const key = `${ob.title}\n${ob.url ?? ''}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const title = ob.title.toLowerCase();
  const host = hostOf(ob.url);
  const rule =
    RULES.find((r) => r.words.test(title)) ??
    (host ? RULES.find((r) => r.hosts?.some((h) => host === h || host.endsWith(`.${h}`))) : undefined);
  const brand = rule ? { name: rule.name, path: rule.icon?.path ?? null, letter: rule.letter ?? rule.name[0] } : null;
  cache.set(key, brand);
  return brand;
}
