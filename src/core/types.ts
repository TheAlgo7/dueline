/**
 * Dueline's data model.
 *
 * One idea carries the whole app: an obligation is money that has to leave you
 * by a date, through some route, unless something is already handling it.
 * Credit-card bills, the maid, Netflix, rent and a one-off loan repayment are
 * all the same object with different settings.
 *
 * An Obligation is the template ("Parking, ₹1,500, monthly on the 1st").
 * Its dates are computed, never stored. An OccurrenceDoc exists only once
 * something happens to one cycle (paid, skipped, bill amount entered, moved),
 * keyed by the obligation id plus the cycle's original due date, so writing it
 * twice is harmless and editing the template never rewrites history.
 *
 * Money is integer paise. Dates are calendar days ('YYYY-MM-DD') in the
 * person's own timezone; only timestamps (createdAt, notification fire times)
 * are UTC milliseconds.
 */

export type Paise = number;
/** A calendar day, 'YYYY-MM-DD'. */
export type ISODate = string;

/** How a payment that needs you is made. */
export type Method = 'upi' | 'card' | 'bank' | 'cash' | 'web';
/** Does this need you, or is something already paying it? */
export type Handling = 'manual' | 'auto';
/** What the AutoPay runs on, for display only. */
export type AutoVia = 'card' | 'upi' | 'bank' | 'wallet' | 'other';

export type Freq = 'once' | 'days' | 'weeks' | 'months' | 'years';

export interface Recurrence {
  freq: Freq;
  /** Every N units. 1 = every month, 28 with 'days' = a 28-day recharge. */
  interval: number;
  /** The first due date. Nothing exists before it. */
  start: ISODate;
  /** Monthly only: always the last day of the month. */
  eom?: boolean;
  /** Last possible due date, inclusive. */
  until?: ISODate | null;
  /** Total number of cycles, for EMIs and instalments. */
  count?: number | null;
}

export type Category =
  | 'card'
  | 'rent'
  | 'mobile'
  | 'internet'
  | 'electricity'
  | 'utility'
  | 'subscription'
  | 'emi'
  | 'insurance'
  | 'person'
  | 'tax'
  | 'other';

export interface Obligation {
  id: string;
  title: string;
  category: Category;
  amountType: 'fixed' | 'variable';
  /** The fixed amount, or for a variable bill the usual amount as an estimate. */
  amount: Paise | null;
  handling: Handling;
  /** Route when it needs you. Ignored while handling is 'auto'. */
  method: Method;
  autoVia?: AutoVia | null;
  /** Card or account label, e.g. "HDFC Regalia ••4821". Never a full number. */
  account?: string;
  payeeId?: string | null;
  /** UPI ID to pay, when method is 'upi'. */
  upi?: string;
  /** Name shown to the UPI app. */
  payTo?: string;
  /** Payment or management page. */
  url?: string;
  recurrence: Recurrence;
  /** Remind this many days before the due date. 0 = on the day. */
  remind: number[];
  note?: string;
  /** False = stopped tracking. History stays, nothing new is due. */
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export type OccStatus = 'paid' | 'skipped' | 'autopaid' | 'failed';

export interface OccurrenceDoc {
  /** `${obligationId}_${YYYYMMDD of the original due date}` */
  id: string;
  obligationId: string;
  /** Original due date. Part of the id, never changes. */
  due: ISODate;
  /** Rescheduled due date for this one cycle. */
  moveTo?: ISODate | null;
  /** This cycle's bill amount (variable bills). */
  amount?: Paise | null;
  status?: OccStatus | null;
  paidOn?: ISODate | null;
  paidAmount?: Paise | null;
  /** UTR or any reference. */
  ref?: string;
  /** How it was actually paid, free text ("GPay", "Cash"). */
  via?: string;
  note?: string;
  /** No reminders before this day. */
  snoozeUntil?: ISODate | null;
  /**
   * Snapshot of the title when it was settled, so history keeps the old name
   * after a rename. Stopping an obligation keeps its cycles; deleting it
   * removes them (deleteObligation), which is what delete should mean.
   */
  title?: string;
  updatedAt: number;
}

export interface Payee {
  id: string;
  name: string;
  upi?: string;
  phone?: string;
  url?: string;
  note?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Profile {
  name?: string;
  /** IANA timezone, e.g. 'Asia/Kolkata'. */
  tz: string;
  /** Local hour reminders go out. */
  remindHour: number;
  /** A second nudge in the evening when something due today is still unpaid. */
  evening: boolean;
  eveningHour: number;
  /** After an AutoPay date passes: ask whether it went through, or assume it did. */
  autopayCheck: 'ask' | 'assume';
  /** Day of the month salary lands, for "due before payday". */
  payday?: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface Device {
  id: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  label?: string;
  createdAt: number;
  lastSeenAt: number;
}

/**
 * Where one cycle stands, from the person's point of view.
 * - overdue / today / soon / upcoming: needs you, by how urgently
 * - auto: something else will pay it (today or later)
 * - confirm: an AutoPay date passed and we are asking if it went through
 * - paid / skipped / autopaid: done
 */
export type ItemState =
  | 'overdue'
  | 'today'
  | 'soon'
  | 'upcoming'
  | 'auto'
  | 'confirm'
  | 'paid'
  | 'skipped'
  | 'autopaid';

export interface Item {
  /** Occurrence id. */
  key: string;
  ob: Obligation;
  occ?: OccurrenceDoc;
  /** Effective due date (moved date if moved). */
  due: ISODate;
  originalDue: ISODate;
  /** Amount for this cycle, or the estimate for a variable bill. */
  amount: Paise | null;
  /** Variable bill whose amount for this cycle is not in yet. */
  estimate: boolean;
  state: ItemState;
  /** due minus today, in days. Negative means late. */
  daysLeft: number;
  /** 1-based cycle number, e.g. EMI 3 of 12. */
  cycle: number;
  /** AutoPay treated as paid without confirmation. */
  assumed?: boolean;
}

export const DEFAULT_PROFILE: Omit<Profile, 'createdAt' | 'updatedAt'> = {
  tz: 'Asia/Kolkata',
  remindHour: 9,
  evening: true,
  eveningHour: 20,
  autopayCheck: 'ask',
  payday: null,
};
