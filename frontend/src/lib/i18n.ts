import { AR } from './i18n-ar'

export type Locale = 'en' | 'ar'

const STORAGE_KEY = 'aster.locale'

let current: Locale = 'en'
const cache = new Map<string, string>()

export function normalizeLocale(value?: string | null): Locale {
  return value && value.toLowerCase().startsWith('ar') ? 'ar' : 'en'
}

/** Locale stored on this device, falling back to Arabic. */
export function storedLocale(): Locale {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (saved) return normalizeLocale(saved)
  } catch {
    // localStorage can be unavailable in locked-down webviews
  }
  // Aster ships in Arabic; the language switcher remembers any other choice.
  return 'ar'
}

export function hasStoredLocale(): boolean {
  try {
    return Boolean(window.localStorage.getItem(STORAGE_KEY))
  } catch {
    return false
  }
}

export function getLocale(): Locale {
  return current
}

export function directionFor(locale: Locale) {
  return locale === 'ar' ? 'rtl' : 'ltr'
}

/** Applies the locale to the document and the runtime translator. */
export function applyLocale(locale: Locale, persist = true) {
  current = locale
  cache.clear()
  document.documentElement.lang = locale
  document.documentElement.dir = directionFor(locale)
  document.documentElement.dataset.locale = locale
  if (persist) {
    try {
      window.localStorage.setItem(STORAGE_KEY, locale)
    } catch {
      // ignore storage failures
    }
  }
}

export function initialLocale(): Locale {
  const locale = storedLocale()
  applyLocale(locale, false)
  return locale
}

/** Placeholder patterns for strings assembled at runtime. */
const patterns: [RegExp, string][] = [
  [/^(\d+) appointments? still to come · (\d+) (?:person|people) in the clinic right now\.$/, '$1 مواعيد قادمة · $2 في العيادة الآن.'],
  [/^(\d+) completed · (\d+) waiting$/, '$1 مكتمل · $2 في الانتظار'],
  [/^(\d+) booked$/, '$1 محجوز'],
  [/^(\d+) new patients? this month$/, '$1 مريض جديد هذا الشهر'],
  [/^(\d+) invoices? needing attention$/, '$1 فواتير بحاجة إلى متابعة'],
  [/^Longest wait (.+)$/, 'أطول انتظار $1'],
  [/^Waiting (.+)$/, 'بانتظار $1'],
  [/^Started (.+)$/, 'بدأت $1'],
  [/^(\d+) day(?:s)? in view$/, '$1 يوم في النطاق'],
  [/^0 appointments · 0 still expected$/, 'لا مواعيد · لا شيء بانتظار الحضور'],
  [/^1 appointment · (\d+) still expected$/, 'موعد واحد · $1 بانتظار الحضور'],
  [/^2 appointments · (\d+) still expected$/, 'موعدان · $1 بانتظار الحضور'],
  [/^(1[1-9]|[2-9]\d|\d{3,}) (?:appointment|appointments) · (\d+) still expected$/, '$1 موعدًا · $2 بانتظار الحضور'],
  [/^(\d+) (?:appointment|appointments) · (\d+) still expected$/, '$1 مواعيد · $2 بانتظار الحضور'],
  [/^(1[1-9]|[2-9]\d|\d{3,}) (?:appointment|appointments)$/, '$1 موعدًا'],
  [/^(3|4|5|6|7|8|9|10) (?:appointment|appointments)$/, '$1 مواعيد'],
  [/^2 (?:appointment|appointments)$/, 'موعدان'],
  [/^1 appointment$/, 'موعد واحد'],
  [/^(\d+) (?:appointment|appointments)$/, '$1 مواعيد'],
  [/^(\d+) of (\d+) prescriptions$/, '$1 من $2 وصفة'],
  [/^(\d+) of (\d+) invoices$/, '$1 من $2 فاتورة'],
  [/^(\d+) of (\d+) patients$/, '$1 من $2 مريض'],
  [/^(\d+) of (\d+) visits$/, '$1 من $2 زيارة'],
  [/^(\d+) of (\d+) people$/, '$1 من $2 شخص'],
  [/^(\d+) of (\d+) services$/, '$1 من $2 خدمة'],
  [/^(\d+) of (\d+) items$/, '$1 من $2 عنصر'],
  [/^(\d+) medication(?:s)?$/, '$1 دواء'],
  [/^(\d+) item(?:s)?$/, '$1 عنصر'],
  [/^(\d+) (?:patient|patients)$/, '$1 مريض'],
  [/^(\d+) (?:invoice|invoices)$/, '$1 فاتورة'],
  [/^(\d+) (?:visit|visits)$/, '$1 زيارة'],
  [/^(\d+) (?:service|services)$/, '$1 خدمة'],
  [/^Filtered to (\d+) (?:service|services)$/, 'تمت التصفية إلى $1 خدمة'],
  [/^(\d+) services in the catalogue$/, '$1 خدمة في دليل الخدمات'],
  [/^(\d+) (?:staff|staff members)$/, '$1 عضو فريق'],
  [/^(\d+) (?:conflict|conflicts)$/, '$1 تعارض'],
  [/^(\d+) (?:device|devices)$/, '$1 جهاز'],
  [/^(\d+) (?:change|changes)$/, '$1 تغيير'],
  [/^(\d+) (?:minute|minutes) ago$/, 'منذ $1 دقيقة'],
  [/^(\d+) (?:hour|hours) ago$/, 'منذ $1 ساعة'],
  [/^(\d+) (?:day|days) ago$/, 'منذ $1 يوم'],
  [/^(\d+) out of stock · (.+) on hand$/, '$1 نفدت من المخزون · $2 متاح'],
  [/^(.+) expenses recorded$/, '$1 مصروفات مسجلة'],
  [/^(\d+)y$/, '$1 سنة'],
  [/^Incorrect password\. 1 attempt left before a short lock$/, 'كلمة المرور غير صحيحة. تبقّت محاولة واحدة قبل القفل المؤقت.'],
  [/^Incorrect password\. (\d+) attempts left before a short lock$/, 'كلمة المرور غير صحيحة. المحاولات المتبقية قبل القفل المؤقت: $1.'],
  [/^Incorrect username or password\. 1 attempt left before a short lock$/, 'اسم المستخدم أو كلمة المرور غير صحيحة. تبقّت محاولة واحدة قبل القفل المؤقت.'],
  [/^Incorrect username or password\. (\d+) attempts left before a short lock$/, 'اسم المستخدم أو كلمة المرور غير صحيحة. المحاولات المتبقية قبل القفل المؤقت: $1.'],
  [/^Too many failed attempts\. Try again in (\d+) seconds$/i, 'محاولات فاشلة كثيرة. أعد المحاولة بعد $1 ثانية.'],
  [/^Last recorded (.+)$/, 'آخر تسجيل $1'],
  [/^Recorded (.+)$/, 'سُجّل $1'],
  [/^Seen (.+)$/, 'شوهد $1'],
  [/^Paired (.+)$/, 'اقترن $1'],
  [/^Unit \((.+)\)$/, 'الوحدة ($1)'],
  [/^Amount \((.+)\)$/, 'المبلغ ($1)'],
  [/^Applied before tax\. Subtotal (.+)\.$/, 'يُطبّق قبل الضريبة. المجموع الفرعي $1.'],
  [/^(.+) · balance (.+)$/, '$1 · الرصيد $2'],
  [/^Prescription · (.+)$/, 'وصفة طبية · $1'],
  [/^Issued (.+) by (.+)$/, 'صدرت $1 بواسطة $2'],
  [/^Issued (.+)$/, 'صدرت $1'],
  [/^(\d+) days?$/, '$1 أيام'],
  [/^Edit (.+)$/, 'تعديل $1'],
  [/^Use colour (.+)$/, 'استخدام اللون $1'],
  [/^(.+) can be selected for appointments and visits\.$/, 'يمكن اختيار $1 للمواعيد والزيارات.'],
  [/^Book (.+) at (.+)$/, 'حجز $1 الساعة $2'],
  [/^(\d+) appointments? this week · (\d+) still expected$/, '$1 مواعيد هذا الأسبوع · $2 ما زال متوقعًا'],
  [/^(\d+) invoices? awaiting payment$/, '$1 فواتير بانتظار الدفع'],
  [/^(\d+)% of billed value collected$/, 'حُصّل $1% من القيمة المفوترة'],
  [/^(\d+) clinical records?$/, '$1 سجلات سريرية'],
  [/^(\d+) issued · (\d+) active · (\d+) this month\. Every prescription is printable and stays attached to the patient record\.$/, '$1 صادرة · $2 نشطة · $3 هذا الشهر. كل وصفة قابلة للطباعة وتبقى مرتبطة بسجل المريض.'],
  [/^(\d+)% of (.+) invoiced$/, '$1% من $2 المفوترة'],
  [/^(\d+)% collection rate$/, '$1% معدل التحصيل'],
  [/^(\d+)% still to collect$/, '$1% ما زال للتحصيل'],
  [/^(\d+) of (\d+) procedures complete$/, '$1 من $2 إجراءات مكتملة'],
  [/^(.+) completed$/, '$1 مكتمل'],
  [/^(-?\d+)% margin on collections$/, '$1% هامش على التحصيل'],
  [/^(\d+) days in view$/, '$1 أيام في النطاق'],
  [/^(\d+) visits in the period$/, '$1 زيارات في الفترة'],
  [/^Peak (.+) · (.+)$/, 'الذروة $1 · $2'],
  [/^(\d+) appointments? booked in this period$/, '$1 مواعيد محجوزة في هذه الفترة'],
  [/^(\d+) cases?$/, '$1 حالات'],
  [/^(\d+) new$/, '$1 جديد'],
  [/^(\d+) visits? on this device · (\d+) drafts? waiting to be signed$/, '$1 زيارات على هذا الجهاز · $2 مسودات بانتظار التوقيع'],
  [/^Signed (.+)$/, 'وُقّعت $1'],
  [/^Updated (.+)$/, 'حُدّثت $1'],
  [/^(\d+) on the register in total$/, '$1 في السجل الإجمالي'],
  [/^You are working as (.+)$/, 'أنت تعمل باسم $1'],
  [/^seen (.+)$/, 'شوهد $1'],
  [/^License (.+)$/, 'الترخيص $1'],
  [/^Version (.+) is available$/, 'الإصدار $1 متاح'],
  [/^Now running version (.+)$/, 'يعمل الآن بالإصدار $1'],
  [/^Version (.+)$/, 'الإصدار $1'],
  [/^(\d+) salary lines added\.$/, 'أُضيف $1 بند رواتب.'],
  [/^Serving this clinic on port (\d+)(?: · (.+))?$/, 'تخدم هذه العيادة على المنفذ $1'],
  [/^(.+) will be removed from the active register\. Clinical and financial history is retained\.$/, '$1 سيُزال من السجل النشط. يبقى التاريخ السريري والمالي محفوظًا.'],
  [/^(.+) will be removed from the active register\. Their visits, prescriptions and invoices remain in the database for audit and reporting\.$/, '$1 سيُزال من السجل النشط. تبقى زياراته ووصفاته وفواتيره في قاعدة البيانات للتدقيق والتقارير.'],
  [/^(.+) will lose access immediately\. It keeps records already downloaded, and must pair again to sync\.$/, '$1 سيفقد الوصول فورًا. يحتفظ بالسجلات المنزّلة مسبقًا، وعليه الاقتران مجددًا للمزامنة.'],
]

/**
 * Translates one rendered string. Only exact UI phrases and a small set of
 * runtime-composed phrases are translated; patient data passes through.
 */
export function translate(text: string): string {
  if (current !== 'ar' || !text) return text
  const lead = text.match(/^\s*/)?.[0] ?? ''
  const trail = text.match(/\s*$/)?.[0] ?? ''
  const core = text.trim().replace(/\s+/g, ' ')
  if (!core || !/[A-Za-z]/.test(core)) return text
  const hit = cache.get(core) ?? AR[core]
  if (hit) {
    if (!cache.has(core)) cache.set(core, hit)
    return lead + hit + trail
  }
  for (const [re, replacement] of patterns) {
    if (re.test(core)) {
      const out = core.replace(re, replacement)
      cache.set(core, out)
      return lead + out + trail
    }
  }
  return text
}

export function localeTag() {
  return current === 'ar' ? 'ar-u-nu-latn' : undefined
}

/** Arabic UI labels shared by helpers outside React components. */
export function isRTL() {
  return current === 'ar'
}
