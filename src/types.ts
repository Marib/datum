/** 1日分の記録。未入力の項目は null。 */
export interface DayRecord {
  /** YYYY-MM-DD */
  date: string;
  /** 体重 kg */
  weight: number | null;
  /** 摂取 kcal */
  kcal: number | null;
  /** たんぱく質 g */
  p: number | null;
  /** 脂質 g */
  f: number | null;
  /** 炭水化物 g */
  c: number | null;
  /** 運動による消費 kcal */
  ex: number | null;
  /** 運動の内容 */
  exNote: string | null;
  /** 就寝 HH:MM（前日の夜） */
  bed: string | null;
  /** 起床 HH:MM（この日の朝） */
  wake: string | null;
  /** 夜中に起きた回数 */
  woke: number | null;
  note: string | null;
}

export type Sex = 'female' | 'male';

export interface Profile {
  /** 表示名（任意） */
  name: string;
  sex: Sex;
  /** 生年（年齢計算用） */
  birthYear: number | null;
  heightCm: number | null;
}

/** ゴールと、そこから逆算した計画。 */
export interface Goal {
  /** 計画を始めた日 YYYY-MM-DD */
  startDate: string;
  /** 開始時の体重 */
  startWeight: number;
  /** 目標体重 */
  targetWeight: number;
  /** 目標期日 YYYY-MM-DD */
  targetDate: string;
}

export interface Energy {
  /** 運動を除いた1日の消費（維持カロリー） */
  maintenanceKcal: number;
  /** 維持カロリーの根拠 */
  maintenanceSource: 'estimate' | 'measured' | 'manual';
  /** 摂取の安全下限 */
  floorKcal: number;
  /** 1日の目標摂取 */
  targetKcal: number;
  /** 体脂肪1kgあたりのエネルギー */
  kcalPerKg: number;
  proteinG: number;
  fatG: number;
  carbG: number;
}

export interface Medication {
  /** 周期的な服薬など、体重判定から外したい期間がある */
  enabled: boolean;
  label: string;
  /** 毎月 fromDay 日〜 toDay 日 */
  fromDay: number;
  toDay: number;
}

export interface Habits {
  /** 週あたり運動日数の目標 */
  exerciseDaysPerWeek: number;
  /** 目標睡眠（分） */
  sleepTargetMin: number;
  /** 目標就寝時刻 HH:MM */
  bedtime: string;
}

export interface Settings {
  profile: Profile;
  goal: Goal | null;
  energy: Energy;
  medication: Medication;
  habits: Habits;
  /** 体重の許容帯 ±kg */
  bandKg: number;
}

/** 検査値・外食メニューなど、自由に作れる参照表 */
export interface RefTable {
  id: string;
  title: string;
  columns: string[];
  rows: string[][];
  note: string;
}

export interface Backup {
  app: 'datum';
  version: 1;
  exportedAt: string;
  settings: Settings;
  days: DayRecord[];
  refs: RefTable[];
}
