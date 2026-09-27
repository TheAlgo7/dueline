/**
 * The picture on a row, so a payment reads at a glance: Spotify's logo for
 * Spotify, a milk bottle for the milkman, a P for parking.
 *
 * Service logos are bundled from Simple Icons (CC0 paths; the trademarks stay
 * with their owners) and drawn in the row's state colour, never the brand's:
 * Spotify green would read as "paid" and Netflix red as "late". Nothing is
 * fetched at runtime, so no one learns which subscriptions you pay for.
 * Brands that asked Simple Icons to drop their mark (Amazon, Canva, LinkedIn)
 * get their initial instead. OpenAI's mark comes from Simple Icons 15.22.0,
 * the last release that shipped it, because ChatGPT is the one people look for.
 *
 * Everyday payments to people and local services (parking, the maid, milk,
 * tuition, the gas cylinder) get a matching icon from the words people
 * actually use for them, English and Hinglish. Anything else keeps its
 * category's icon.
 */

import {
  Building2,
  Car,
  CarFront,
  Carrot,
  ChefHat,
  Droplets,
  Dumbbell,
  Flame,
  Fuel,
  GraduationCap,
  HandCoins,
  HandHeart,
  House,
  Milk,
  Music,
  Newspaper,
  PawPrint,
  Pill,
  PlugZap,
  School,
  Scissors,
  Shield,
  Shirt,
  ShoppingBasket,
  Sparkles,
  Sprout,
  SquareParking,
  Stethoscope,
  TrainFront,
  Trash2,
  Tv,
  UtensilsCrossed,
  WashingMachine,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
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
import type { Obligation, Payee } from '../core/types';

/** OpenAI's mark, from simple-icons@15.22.0 (icons/openai.svg). */
const OPENAI_PATH =
  'M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z';

export interface Mark {
  name: string;
  /** A service logo: a 24×24 SVG path. */
  path: string | null;
  /** An everyday icon, drawn like the category icons. */
  Icon: LucideIcon | null;
  /** Shown when there is neither. */
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
  { name: 'ChatGPT', icon: { path: OPENAI_PATH }, words: /\b(chat ?gpt|openai)\b/, hosts: ['chatgpt.com', 'openai.com'] },
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

interface Everyday {
  name: string;
  Icon: LucideIcon;
  words: RegExp;
}

// Specific before general: "Iron Gym" is a gym, not ironing, and "Mom's
// medicine" is medicine. Words that also mean something on a card or tax
// bill ("fee", "return") are left out, because a match overrides the
// category's icon.
const EVERYDAY: Everyday[] = [
  { name: 'Parking', Icon: SquareParking, words: /\bparking\b/ },
  { name: 'Car wash', Icon: Car, words: /\bcar ?(wash|washing|clean|cleaning|cleaner|safai|safayi)\b/ },
  { name: 'Driver', Icon: CarFront, words: /\b(driver|chauffeur)\b/ },
  { name: 'Fuel', Icon: Fuel, words: /\b(petrol|diesel|fuel|cng)\b/ },
  { name: 'Charging', Icon: PlugZap, words: /\b(ev charging|charging|charger)\b/ },
  { name: 'Gym', Icon: Dumbbell, words: /\b(gym|fitness|workout|cult ?fit|crossfit|yoga|pilates|zumba|trainer)\b/ },
  { name: 'Cleaning', Icon: Sparkles, words: /\b(maid|bai|house ?help|cleaning|cleaner|safai|jhadu|pocha|kaamwali|kamwali)\b/ },
  { name: 'Cook', Icon: ChefHat, words: /\b(cook|chef|khana|maharaj)\b/ },
  { name: 'Tiffin', Icon: UtensilsCrossed, words: /\b(tiffin|dabba|mess|meals?)\b/ },
  { name: 'Milk', Icon: Milk, words: /\b(milk|doodh|dudh|dairy|milkman)\b/ },
  { name: 'Newspaper', Icon: Newspaper, words: /\b(newspaper|news ?paper|akhbar|paper ?wala)\b/ },
  { name: 'Groceries', Icon: ShoppingBasket, words: /\b(grocery|groceries|kirana|ration|blinkit|zepto|bigbasket)\b/ },
  { name: 'Vegetables', Icon: Carrot, words: /\b(sabzi|sabji|vegetables?|veggies|fruits?)\b/ },
  { name: 'Water', Icon: Droplets, words: /\b(water|bisleri|jal)\b/ },
  { name: 'Gas', Icon: Flame, words: /\b(gas|lpg|cylinder|png|indane)\b/ },
  { name: 'Laundry', Icon: WashingMachine, words: /\b(laundry|dhobi|dry ?clean|dry ?cleaning|washing)\b/ },
  { name: 'Ironing', Icon: Shirt, words: /\b(iron|ironing|istri|press ?wala)\b/ },
  { name: 'School', Icon: School, words: /\b(school|schooling)\b/ },
  { name: 'Tuition', Icon: GraduationCap, words: /\b(tuition|tution|tutor|coaching|classes|class|college|course)\b/ },
  { name: 'Music class', Icon: Music, words: /\b(music|guitar|piano|dance|singing|vocal)\b/ },
  { name: 'Salon', Icon: Scissors, words: /\b(salon|barber|haircut|parlou?r|spa)\b/ },
  { name: 'Medicine', Icon: Pill, words: /\b(medicines?|pharmacy|chemist|tablets?)\b/ },
  { name: 'Doctor', Icon: Stethoscope, words: /\b(doctor|clinic|physio|physiotherapy|therapy|therapist|dentist|hospital|checkup)\b/ },
  { name: 'Pet', Icon: PawPrint, words: /\b(pets?|dog|cat|vet|grooming|walker)\b/ },
  { name: 'Garden', Icon: Sprout, words: /\b(gardener|garden|mali|plants?)\b/ },
  { name: 'Society', Icon: Building2, words: /\b(maintenance|society|rwa|association)\b/ },
  { name: 'Guard', Icon: Shield, words: /\b(guard|chowkidar|watchman|gatekeeper)\b/ },
  { name: 'Garbage', Icon: Trash2, words: /\b(garbage|kachra|kooda|kuda|waste|trash)\b/ },
  { name: 'Repairs', Icon: Wrench, words: /\b(plumber|electrician|carpenter|repair|repairs|mechanic|ac service)\b/ },
  { name: 'TV', Icon: Tv, words: /\b(cable|dth|tata ?play|dish ?tv|d2h|set ?top)\b/ },
  { name: 'Metro', Icon: TrainFront, words: /\b(metro|bus pass|train pass)\b/ },
  { name: 'Rent', Icon: House, words: /\b(rent|kiraya|pg|hostel)\b/ },
  { name: 'Family', Icon: HandHeart, words: /\b(pocket money|allowance|mom|mum|mummy|maa|dad|papa|daddy|sister|brother|bhai|didi|donation|charity|temple|mandir|gurudwara|church|masjid|daan|zakat)\b/ },
  { name: 'Pay back', Icon: HandCoins, words: /\b(udhaar|udhar|borrowed|pay ?back|repay)\b/ },
];

const cache = new Map<string, Mark | null>();

/**
 * What a payment shows: its service's logo (by name, then by link), an
 * everyday icon (by name), or null for the category's own icon.
 */
export function markFor(ob: Pick<Obligation, 'title' | 'url'>): Mark | null {
  const key = `${ob.title}\n${ob.url ?? ''}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const title = ob.title.toLowerCase();
  const host = hostOf(ob.url);
  const rule =
    RULES.find((r) => r.words.test(title)) ??
    (host ? RULES.find((r) => r.hosts?.some((h) => host === h || host.endsWith(`.${h}`))) : undefined);
  const everyday = rule ? undefined : EVERYDAY.find((r) => r.words.test(title));
  const mark: Mark | null = rule
    ? { name: rule.name, path: rule.icon?.path ?? null, Icon: null, letter: rule.letter ?? rule.name[0] }
    : everyday
      ? { name: everyday.name, path: null, Icon: everyday.Icon, letter: '' }
      : null;
  cache.set(key, mark);
  return mark;
}

/** A payee's picture: what you pay them for, or failing that their name and note. */
export function payeeMark(p: Pick<Payee, 'id' | 'name' | 'note'>, obligations: readonly Obligation[]): Mark | null {
  const ob = obligations.find((o) => o.payeeId === p.id && o.active);
  return (ob && markFor(ob)) || markFor({ title: `${p.name} ${p.note ?? ''}` });
}
