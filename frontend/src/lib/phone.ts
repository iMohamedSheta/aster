import { getLocale, translate } from './i18n'

/**
 * Phone handling for the clinic.
 *
 * Numbers are stored in a compact international form (`+201012345678`) so a
 * record keeps dialling correctly when a patient moves between clinics. The
 * country is inferred from the clinic profile — country first, then the
 * location, then the time zone, then the billing currency — and falls back to
 * Egypt, which is the workspace default.
 */

export interface Country {
  iso: string
  name: string
  ar?: string
  dial: string
  /** National trunk prefix, removed while typing a local number. */
  trunk?: string
  example?: string
}

function country(
  iso: string, name: string, dial: string, ar?: string, trunk?: string, example?: string,
): Country {
  return { iso, name, dial, ar, trunk, example }
}

/** Countries offered by the picker. MENA first, then the rest alphabetically. */
export const COUNTRIES: Country[] = [
  country('EG', 'Egypt', '+20', 'مصر', '0', '10 1234 5678'),
  country('SA', 'Saudi Arabia', '+966', 'السعودية', '0', '50 123 4567'),
  country('AE', 'United Arab Emirates', '+971', 'الإمارات العربية المتحدة', '0', '50 123 4567'),
  country('QA', 'Qatar', '+974', 'قطر', undefined, '3312 3456'),
  country('KW', 'Kuwait', '+965', 'الكويت', undefined, '9123 4567'),
  country('BH', 'Bahrain', '+973', 'البحرين', undefined, '3612 3456'),
  country('OM', 'Oman', '+968', 'عُمان', undefined, '9123 4567'),
  country('JO', 'Jordan', '+962', 'الأردن', '0', '7 9012 3456'),
  country('LB', 'Lebanon', '+961', 'لبنان', '0', '71 123 456'),
  country('IQ', 'Iraq', '+964', 'العراق', '0', '790 123 4567'),
  country('PS', 'Palestine', '+970', 'فلسطين', '0', '59 123 4567'),
  country('SY', 'Syria', '+963', 'سوريا', '0', '944 567 890'),
  country('YE', 'Yemen', '+967', 'اليمن', '0', '712 345 678'),
  country('SD', 'Sudan', '+249', 'السودان', '0', '91 234 5678'),
  country('LY', 'Libya', '+218', 'ليبيا', '0', '91 234 5678'),
  country('TN', 'Tunisia', '+216', 'تونس', undefined, '20 123 456'),
  country('DZ', 'Algeria', '+213', 'الجزائر', '0', '551 234 567'),
  country('MA', 'Morocco', '+212', 'المغرب', '0', '612 345 678'),
  country('MR', 'Mauritania', '+222', 'موريتانيا', undefined, '22 12 34 56'),
  country('SO', 'Somalia', '+252', 'الصومال', undefined, '61 234 5678'),
  country('DJ', 'Djibouti', '+253', 'جيبوتي', undefined, '77 12 34 56'),
  country('KM', 'Comoros', '+269', 'جزر القمر', undefined, '321 23 45'),
  country('TR', 'Türkiye', '+90', 'تركيا', '0', '532 123 4567'),
  country('IR', 'Iran', '+98', 'إيران', '0', '912 345 6789'),
  country('PK', 'Pakistan', '+92', 'باكستان', '0', '300 1234567'),
  country('IN', 'India', '+91', 'الهند', '0', '98765 43210'),
  country('BD', 'Bangladesh', '+880', 'بنغلاديش', '0', '1712 345678'),
  country('ID', 'Indonesia', '+62', 'إندونيسيا', '0', '812 3456 7890'),
  country('MY', 'Malaysia', '+60', 'ماليزيا', '0', '12 345 6789'),
  country('PH', 'Philippines', '+63', 'الفلبين', '0', '917 123 4567'),
  country('CN', 'China', '+86', 'الصين', '0', '138 0013 8000'),
  country('JP', 'Japan', '+81', 'اليابان', '0', '90 1234 5678'),
  country('KR', 'South Korea', '+82', 'كوريا الجنوبية', '0', '10 1234 5678'),
  country('SG', 'Singapore', '+65', 'سنغافورة', undefined, '8123 4567'),
  country('TH', 'Thailand', '+66', 'تايلاند', '0', '81 234 5678'),
  country('VN', 'Vietnam', '+84', 'فيتنام', '0', '91 234 56 78'),
  country('AF', 'Afghanistan', '+93', 'أفغانستان', '0', '70 123 4567'),
  country('AZ', 'Azerbaijan', '+994', 'أذربيجان', '0', '50 123 45 67'),
  country('KZ', 'Kazakhstan', '+7', 'كازاخستان', '8', '701 234 5678'),
  country('UZ', 'Uzbekistan', '+998', 'أوزبكستان', '8', '90 123 45 67'),
  country('GE', 'Georgia', '+995', 'جورجيا', undefined, '555 12 34 56'),
  country('AM', 'Armenia', '+374', 'أرمينيا', '0', '77 123456'),
  country('IL', 'Israel', '+972', 'إسرائيل', '0', '50 123 4567'),
  country('HK', 'Hong Kong', '+852', 'هونغ كونغ', undefined, '9123 4567'),
  country('TW', 'Taiwan', '+886', 'تايوان', '0', '912 345 678'),
  country('LK', 'Sri Lanka', '+94', 'سريلانكا', '0', '71 234 5678'),
  country('NP', 'Nepal', '+977', 'نيبال', '0', '98 1234 5678'),
  country('MM', 'Myanmar', '+95', 'ميانمار', '0', '9 212 3456'),
  country('KH', 'Cambodia', '+855', 'كمبوديا', '0', '12 345 678'),
  country('LA', 'Laos', '+856', 'لاوس', '0', '20 51 234 567'),
  country('MN', 'Mongolia', '+976', 'منغوليا', '0', '88 123 4567'),
  country('MV', 'Maldives', '+960', 'المالديف', undefined, '771 2345'),
  country('BN', 'Brunei', '+673', 'بروناي', undefined, '712 3456'),
  country('US', 'United States', '+1', 'الولايات المتحدة', undefined, '415 555 0000'),
  country('CA', 'Canada', '+1', 'كندا', undefined, '604 555 0100'),
  country('MX', 'Mexico', '+52', 'المكسيك', undefined, '55 1234 5678'),
  country('BR', 'Brazil', '+55', 'البرازيل', '0', '11 91234 5678'),
  country('AR', 'Argentina', '+54', 'الأرجنتين', '0', '11 2345 6789'),
  country('CL', 'Chile', '+56', 'تشيلي', undefined, '9 6123 4567'),
  country('CO', 'Colombia', '+57', 'كولومبيا', '0', '301 234 5678'),
  country('PE', 'Peru', '+51', 'بيرو', '0', '912 345 678'),
  country('GB', 'United Kingdom', '+44', 'المملكة المتحدة', '0', '7911 123456'),
  country('IE', 'Ireland', '+353', 'أيرلندا', '0', '85 123 4567'),
  country('FR', 'France', '+33', 'فرنسا', '0', '6 12 34 56 78'),
  country('DE', 'Germany', '+49', 'ألمانيا', '0', '1512 3456789'),
  country('ES', 'Spain', '+34', 'إسبانيا', undefined, '612 345 678'),
  country('IT', 'Italy', '+39', 'إيطاليا', undefined, '312 345 6789'),
  country('PT', 'Portugal', '+351', 'البرتغال', undefined, '912 345 678'),
  country('NL', 'Netherlands', '+31', 'هولندا', '0', '6 1234 5678'),
  country('BE', 'Belgium', '+32', 'بلجيكا', '0', '470 12 34 56'),
  country('CH', 'Switzerland', '+41', 'سويسرا', '0', '78 123 45 67'),
  country('AT', 'Austria', '+43', 'النمسا', '0', '664 1234567'),
  country('SE', 'Sweden', '+46', 'السويد', '0', '70 123 45 67'),
  country('NO', 'Norway', '+47', 'النرويج', undefined, '412 34 567'),
  country('DK', 'Denmark', '+45', 'الدنمارك', undefined, '20 12 34 56'),
  country('FI', 'Finland', '+358', 'فنلندا', '0', '40 123 4567'),
  country('PL', 'Poland', '+48', 'بولندا', undefined, '512 345 678'),
  country('CZ', 'Czechia', '+420', 'التشيك', undefined, '601 234 567'),
  country('GR', 'Greece', '+30', 'اليونان', undefined, '691 234 5678'),
  country('RU', 'Russia', '+7', 'روسيا', '8', '912 345 67 89'),
  country('UA', 'Ukraine', '+380', 'أوكرانيا', '0', '50 123 4567'),
  country('RO', 'Romania', '+40', 'رومانيا', '0', '712 345 678'),
  country('HU', 'Hungary', '+36', 'هنغاريا', '06', '20 123 4567'),
  country('BG', 'Bulgaria', '+359', 'بلغاريا', '0', '88 123 4567'),
  country('HR', 'Croatia', '+385', 'كرواتيا', '0', '91 234 5678'),
  country('RS', 'Serbia', '+381', 'صربيا', '0', '61 234 5678'),
  country('SI', 'Slovenia', '+386', 'سلوفينيا', '0', '31 234 567'),
  country('SK', 'Slovakia', '+421', 'سلوفاكيا', '0', '901 234 567'),
  country('LT', 'Lithuania', '+370', 'ليتوانيا', '0', '612 34567'),
  country('LV', 'Latvia', '+371', 'لاتفيا', undefined, '21 234 567'),
  country('EE', 'Estonia', '+372', 'إستونيا', undefined, '5123 4567'),
  country('IS', 'Iceland', '+354', 'آيسلندا', undefined, '612 3456'),
  country('LU', 'Luxembourg', '+352', 'لوكسمبورغ', undefined, '621 123 456'),
  country('MT', 'Malta', '+356', 'مالطا', undefined, '7912 3456'),
  country('CY', 'Cyprus', '+357', 'قبرص', undefined, '96 123 456'),
  country('AU', 'Australia', '+61', 'أستراليا', '0', '412 345 678'),
  country('NZ', 'New Zealand', '+64', 'نيوزيلندا', '0', '21 123 4567'),
  country('ZA', 'South Africa', '+27', 'جنوب أفريقيا', '0', '82 123 4567'),
  country('NG', 'Nigeria', '+234', 'نيجيريا', '0', '802 123 4567'),
  country('KE', 'Kenya', '+254', 'كينيا', '0', '712 345678'),
  country('GH', 'Ghana', '+233', 'غانا', '0', '24 123 4567'),
  country('ET', 'Ethiopia', '+251', 'إثيوبيا', '0', '91 234 5678'),
  country('TZ', 'Tanzania', '+255', 'تنزانيا', '0', '712 345 678'),
  country('UG', 'Uganda', '+256', 'أوغندا', '0', '712 345678'),
  country('SN', 'Senegal', '+221', 'السنغال', undefined, '77 123 45 67'),
  country('CI', 'Côte d’Ivoire', '+225', 'ساحل العاج', undefined, '07 12 34 56 78'),
  country('CM', 'Cameroon', '+237', 'الكاميرون', undefined, '6 71 23 45 67'),
  country('AO', 'Angola', '+244', 'أنغولا', undefined, '923 123 456'),
  country('ZW', 'Zimbabwe', '+263', 'زيمبابوي', '0', '71 234 5678'),
  country('MU', 'Mauritius', '+230', 'موريشيوس', undefined, '5712 3456'),
]

const BY_ISO = new Map(COUNTRIES.map((c) => [c.iso, c]))

export const DEFAULT_COUNTRY = BY_ISO.get('EG')!

/** A clinic or location profile, narrowed to the fields used for inference. */
export interface LocaleHint {
  country?: string | null
  timezone?: string | null
  currency?: string | null
}

const COUNTRY_ALIASES: Record<string, string> = {
  usa: 'US', 'u s a': 'US', 'united states of america': 'US', america: 'US',
  uk: 'GB', 'u k': 'GB', britain: 'GB', 'great britain': 'GB', england: 'GB',
  uae: 'AE', 'u a e': 'AE', emirates: 'AE',
  ksa: 'SA', saudi: 'SA',
  holland: 'NL', 'the netherlands': 'NL',
  'ivory coast': 'CI',
  'czech republic': 'CZ',
  korea: 'KR', 'republic of korea': 'KR',
  turkiye: 'TR',
  'viet nam': 'VN',
  'west bank': 'PS', gaza: 'PS',
  'russian federation': 'RU',
}

const TIMEZONE_COUNTRY: Record<string, string> = {
  'Africa/Cairo': 'EG', 'Africa/Alexandria': 'EG',
  'Africa/Casablanca': 'MA', 'Africa/Algiers': 'DZ', 'Africa/Tunis': 'TN',
  'Africa/Tripoli': 'LY', 'Africa/Khartoum': 'SD', 'Africa/Johannesburg': 'ZA',
  'Africa/Nairobi': 'KE', 'Africa/Lagos': 'NG', 'Africa/Accra': 'GH',
  'Africa/Addis_Ababa': 'ET', 'Africa/Dar_es_Salaam': 'TZ', 'Africa/Kampala': 'UG',
  'Africa/Dakar': 'SN', 'Africa/Abidjan': 'CI', 'Africa/Douala': 'CM',
  'Africa/Luanda': 'AO', 'Africa/Harare': 'ZW', 'Indian/Mauritius': 'MU',
  'Asia/Riyadh': 'SA', 'Asia/Dubai': 'AE', 'Asia/Qatar': 'QA', 'Asia/Kuwait': 'KW',
  'Asia/Bahrain': 'BH', 'Asia/Muscat': 'OM', 'Asia/Amman': 'JO', 'Asia/Beirut': 'LB',
  'Asia/Baghdad': 'IQ', 'Asia/Gaza': 'PS', 'Asia/Hebron': 'PS', 'Asia/Damascus': 'SY',
  'Asia/Aden': 'YE', 'Asia/Istanbul': 'TR', 'Asia/Tehran': 'IR',
  'Asia/Karachi': 'PK', 'Asia/Kolkata': 'IN', 'Asia/Dhaka': 'BD',
  'Asia/Jakarta': 'ID', 'Asia/Kuala_Lumpur': 'MY', 'Asia/Manila': 'PH',
  'Asia/Shanghai': 'CN', 'Asia/Tokyo': 'JP', 'Asia/Seoul': 'KR',
  'Asia/Singapore': 'SG', 'Asia/Bangkok': 'TH', 'Asia/Ho_Chi_Minh': 'VN',
  'Asia/Kabul': 'AF', 'Asia/Baku': 'AZ', 'Asia/Almaty': 'KZ', 'Asia/Tashkent': 'UZ',
  'Asia/Tbilisi': 'GE', 'Asia/Yerevan': 'AM', 'Asia/Jerusalem': 'IL',
  'Asia/Hong_Kong': 'HK', 'Asia/Taipei': 'TW', 'Asia/Colombo': 'LK',
  'Asia/Kathmandu': 'NP', 'Asia/Yangon': 'MM', 'Asia/Phnom_Penh': 'KH',
  'Asia/Vientiane': 'LA', 'Asia/Ulaanbaatar': 'MN', 'Asia/Male': 'MV',
  'Asia/Brunei': 'BN', 'Asia/Nicosia': 'CY',
  'Europe/London': 'GB', 'Europe/Dublin': 'IE', 'Europe/Paris': 'FR',
  'Europe/Berlin': 'DE', 'Europe/Madrid': 'ES', 'Europe/Rome': 'IT',
  'Europe/Lisbon': 'PT', 'Europe/Amsterdam': 'NL', 'Europe/Brussels': 'BE',
  'Europe/Zurich': 'CH', 'Europe/Vienna': 'AT', 'Europe/Stockholm': 'SE',
  'Europe/Oslo': 'NO', 'Europe/Copenhagen': 'DK', 'Europe/Helsinki': 'FI',
  'Europe/Warsaw': 'PL', 'Europe/Prague': 'CZ', 'Europe/Athens': 'GR',
  'Europe/Moscow': 'RU', 'Europe/Kyiv': 'UA', 'Europe/Kiev': 'UA',
  'Europe/Bucharest': 'RO', 'Europe/Budapest': 'HU', 'Europe/Sofia': 'BG',
  'Europe/Zagreb': 'HR', 'Europe/Belgrade': 'RS', 'Europe/Ljubljana': 'SI',
  'Europe/Bratislava': 'SK', 'Europe/Vilnius': 'LT', 'Europe/Riga': 'LV',
  'Europe/Tallinn': 'EE', 'Atlantic/Reykjavik': 'IS', 'Europe/Luxembourg': 'LU',
  'Europe/Malta': 'MT',
  'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US',
  'America/Los_Angeles': 'US', 'America/Toronto': 'CA', 'America/Vancouver': 'CA',
  'America/Mexico_City': 'MX', 'America/Sao_Paulo': 'BR',
  'America/Argentina/Buenos_Aires': 'AR', 'America/Santiago': 'CL',
  'America/Bogota': 'CO', 'America/Lima': 'PE',
  'Australia/Sydney': 'AU', 'Pacific/Auckland': 'NZ',
}

const CURRENCY_COUNTRY: Record<string, string> = {
  EGP: 'EG', SAR: 'SA', AED: 'AE', QAR: 'QA', KWD: 'KW', BHD: 'BH', OMR: 'OM',
  JOD: 'JO', LBP: 'LB', IQD: 'IQ', ILS: 'PS', SYP: 'SY', YER: 'YE', SDG: 'SD',
  LYD: 'LY', TND: 'TN', DZD: 'DZ', MAD: 'MA', TRY: 'TR', IRR: 'IR', PKR: 'PK',
  INR: 'IN', BDT: 'BD', IDR: 'ID', MYR: 'MY', PHP: 'PH',
  CNY: 'CN', JPY: 'JP', KRW: 'KR', SGD: 'SG', THB: 'TH', VND: 'VN',
  USD: 'US', CAD: 'CA', MXN: 'MX', BRL: 'BR', ARS: 'AR', CLP: 'CL', COP: 'CO',
  PEN: 'PE', GBP: 'GB', RUB: 'RU', UAH: 'UA', PLN: 'PL',
  CZK: 'CZ', HUF: 'HU', RON: 'RO', BGN: 'BG', HRK: 'HR', RSD: 'RS', SEK: 'SE',
  NOK: 'NO', DKK: 'DK', CHF: 'CH', ISK: 'IS', AUD: 'AU', NZD: 'NZ', ZAR: 'ZA',
  NGN: 'NG', KES: 'KE', GHS: 'GH', ETB: 'ET', TZS: 'TZ', UGX: 'UG', MUR: 'MU',
}

/** Shared dialling codes have one country that represents them. */
const DIAL_OWNER: Record<string, string> = {
  '+1': 'US', '+7': 'RU', '+44': 'GB', '+212': 'MA', '+61': 'AU',
}

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u064b-\u0652\u0670]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, ' ')
    .trim()
}

/** Finds a country from a name, Arabic name, ISO code or dialling code. */
export function findCountry(value?: string | null): Country | null {
  const raw = (value ?? '').trim()
  if (!raw) return null
  if (raw.length === 2) {
    const hit = BY_ISO.get(raw.toUpperCase())
    if (hit) return hit
  }
  if (/^\+\d+$/.test(raw)) {
    const hit = COUNTRIES.find((c) => c.dial === raw)
    if (hit) return hit
  }
  const key = normalizeText(raw)
  const alias = COUNTRY_ALIASES[key]
  if (alias) return BY_ISO.get(alias) ?? null
  return COUNTRIES.find((c) => normalizeText(c.name) === key || (c.ar ? normalizeText(c.ar) === key : false)) ?? null
}

export function countryFromTimezone(timezone?: string | null): Country | null {
  const key = (timezone ?? '').trim()
  if (!key) return null
  const iso = TIMEZONE_COUNTRY[key]
  return iso ? BY_ISO.get(iso) ?? null : null
}

export function countryFromCurrency(currency?: string | null): Country | null {
  const key = (currency ?? '').trim().toUpperCase()
  if (!key) return null
  const iso = CURRENCY_COUNTRY[key]
  return iso ? BY_ISO.get(iso) ?? null : null
}

/**
 * The country a new patient's phone most likely belongs to:
 * clinic country → location country → clinic time zone → location time zone →
 * clinic currency → Egypt.
 */
export function resolveDefaultCountry(
  clinic?: LocaleHint | null,
  location?: LocaleHint | null,
): Country {
  return findCountry(clinic?.country)
    ?? findCountry(location?.country)
    ?? countryFromTimezone(clinic?.timezone)
    ?? countryFromTimezone(location?.timezone)
    ?? countryFromCurrency(clinic?.currency)
    ?? DEFAULT_COUNTRY
}

export function countryName(c: Country) {
  return getLocale() === 'ar' && c.ar ? c.ar : c.name
}

export function digitsOnly(value?: string | null) {
  return (value ?? '').replace(/\D+/g, '')
}

function stripTrunk(national: string, c: Country) {
  if (!c.trunk || national.length <= c.trunk.length) return national
  return national.startsWith(c.trunk) ? national.slice(c.trunk.length) : national
}

/** Digits typed for a country, with its trunk prefix removed. */
export function normalizeNational(value: string, c: Country) {
  return stripTrunk(digitsOnly(value), c)
}

function pickDialCountry(digits: string, fallback: Country): Country | null {
  const matches = COUNTRIES.filter((c) => digits.startsWith(c.dial.slice(1)))
  if (matches.length === 0) return null
  const fallbackMatch = matches.find((c) => c.iso === fallback.iso)
  if (fallbackMatch) return fallbackMatch
  const longest = Math.max(...matches.map((c) => c.dial.length))
  const top = matches.filter((c) => c.dial.length === longest)
  return top.find((c) => c.iso === DIAL_OWNER[top[0].dial]) ?? top[0]
}

export interface ParsedPhone {
  country: Country
  national: string
  /** True when the value carried an explicit +country code (or 00 prefix). */
  international: boolean
}

/**
 * Splits a stored or pasted number into its country and national digits.
 * Local numbers are interpreted with `fallback` and their trunk zero removed.
 */
export function parsePhone(value?: string | null, fallback: Country = DEFAULT_COUNTRY): ParsedPhone {
  const raw = (value ?? '').trim()
  if (!raw) return { country: fallback, national: '', international: false }

  const plus = raw.startsWith('+')
  const doubleZero = !plus && raw.startsWith('00')
  if (plus || doubleZero) {
    let digits = digitsOnly(raw)
    if (doubleZero) digits = digits.slice(2)
    const match = pickDialCountry(digits, fallback)
    if (match) {
      let national = digits.slice(match.dial.length - 1)
      // A pasted +20 010… number still carries the national trunk zero.
      // Only the common "0" trunk is stripped; Russia's 8 and Hungary's 06
      // can legitimately start an international number.
      if (match.trunk === '0' && national.startsWith('0')) national = national.slice(1)
      return {
        country: match,
        national,
        international: true,
      }
    }
  }

  return {
    country: fallback,
    national: stripTrunk(digitsOnly(raw), fallback),
    international: false,
  }
}

/** Compact storage form, e.g. +201012345678. */
export function canonicalPhone(value?: string | null, fallback: Country = DEFAULT_COUNTRY) {
  const parsed = parsePhone(value, fallback)
  return parsed.national ? `${parsed.country.dial}${parsed.national}` : ''
}

const GROUP_PATTERNS: Record<string, Record<number, number[]>> = {
  EG: { 10: [2, 4, 4], 9: [1, 4, 4], 8: [1, 3, 4] },
  SA: { 9: [2, 3, 4], 10: [2, 4, 4] },
  AE: { 9: [2, 3, 4] },
  US: { 10: [3, 3, 4] },
  CA: { 10: [3, 3, 4] },
  GB: { 10: [4, 3, 3] },
  DE: { 11: [4, 7] },
  FR: { 9: [1, 2, 2, 2, 2] },
}

function applyGroups(digits: string, pattern: number[]) {
  let index = 0
  return pattern
    .map((size) => {
      const part = digits.slice(index, index + size)
      index += size
      return part
    })
    .filter(Boolean)
    .join(' ')
}

/** Groups national digits for display, without the country code. */
export function formatNational(countryValue: Country, national: string) {
  const digits = digitsOnly(national)
  if (!digits) return ''
  const pattern = GROUP_PATTERNS[countryValue.iso]?.[digits.length]
  if (pattern) return applyGroups(digits, pattern)
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

/** A readable phone number; local legacy values are left untouched. */
export function displayPhone(value?: string | null, fallback: Country = DEFAULT_COUNTRY) {
  const raw = (value ?? '').trim()
  if (!raw) return ''
  const parsed = parsePhone(raw, fallback)
  if (!parsed.national || !parsed.international) return raw
  return `${parsed.country.dial} ${formatNational(parsed.country, parsed.national)}`
}

/** A `tel:` link that always includes the country code. */
export function telHref(value?: string | null, fallback: Country = DEFAULT_COUNTRY) {
  const parsed = parsePhone(value, fallback)
  if (!parsed.national) return ''
  return `tel:+${digitsOnly(`${parsed.country.dial}${parsed.national}`)}`
}

/** A wa.me link, with an optional prefilled message. */
export function whatsappHref(
  value?: string | null,
  fallback: Country = DEFAULT_COUNTRY,
  message?: string,
) {
  const parsed = parsePhone(value, fallback)
  if (parsed.national.length < 6) return ''
  const number = digitsOnly(`${parsed.country.dial}${parsed.national}`)
  return `https://wa.me/${number}${message ? `?text=${encodeURIComponent(message)}` : ''}`
}

export function whatsappGreeting(firstName?: string, clinicName?: string) {
  const name = (firstName ?? '').trim()
  const clinic = (clinicName ?? '').trim()
  if (getLocale() === 'ar') {
    return `مرحبًا${name ? ` ${name}` : ''}، معك${clinic ? ` ${clinic}` : ' العيادة'}.`
  }
  return `Hello${name ? ` ${name}` : ''}, this is ${clinic || 'the clinic'}.`
}

/** Small hint under the phone field explaining where the default came from. */
export function phoneDefaultHint(c: Country) {
  return `${translate('Suggested from clinic settings')} · ${countryName(c)} ${c.dial}`
}
