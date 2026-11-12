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
  /** 食事の明細。あるときは kcal・p・f・c はこの合計 */
  meals?: MealItem[];
}

export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface Nutr {
  kcal: number | null;
  p: number | null;
  f: number | null;
  c: number | null;
}

/** 食事の明細1品 */
export interface MealItem {
  id: string;
  slot: MealSlot;
  /** 'mext:<食品番号>'（食品成分表）または 'my:<id>'（マイ食品） */
  ref: string;
  name: string;
  /** base が100gあたりか、1食あたりか */
  per: '100g' | 'serving';
  /** per が 100g なら g、serving なら食数 */
  amount: number;
  base: Nutr;
  /** 「1パック」などと言った量（次回の重さを覚えるため） */
  count?: { n: number; unit: string } | null;
}

/** 食品表示や外食メニューの値を自分で入れた食品（1食あたり） */
export interface MyFood {
  id: string;
  name: string;
  /** 1食の説明（例「1個」「1パック」） */
  unit: string;
  kcal: number | null;
  p: number | null;
  f: number | null;
  c: number | null;
}

/** よく食べる組み合わせ（例「いつもの朝ごはん」） */
export interface MealMenu {
  id: string;
  name: string;
  items: Omit<MealItem, 'id' | 'slot'>[];
}

export interface Foodbook {
  myFoods: MyFood[];
  menus: MealMenu[];
  /** '<ref>|<単位>' → 1単位のg（'<ref>|' は前回の量） */
  portions: Record<string, number>;
  /** ref → 使った回数 */
  used: Record<string, number>;
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
  /** 計画で見込む1日の平均運動 kcal */
  exercisePerDay?: number;
  /** ゴールに合わせて1日の目標摂取を自動で更新するか */
  syncIntake?: boolean;
  /** ダイエットを始めたときの体重（ホームの進み具合バーの左端。無ければ startWeight） */
  initialWeight?: number | null;
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
  /** 基礎代謝（身長・生年が無いときの手入力） */
  bmrKcal?: number | null;
  /** 摂取の上限（イベント日） */
  upperKcal?: number | null;
  /** 維持カロリーの根拠メモ */
  maintenanceNote?: string;
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
  /** 運動・睡眠ページの見出しの下に出す目標の文 */
  pageSubs?: { move?: string; sleep?: string };
}

/** 参照表を出すページ */
export type RefPlace = 'notes' | 'meal' | 'move' | 'weight' | 'sleep' | 'judge' | 'setup';

/** 検査値・外食メニューなど、自由に作れる参照表 */
export interface RefTable {
  id: string;
  title: string;
  columns: string[];
  rows: string[][];
  note: string;
  /** どのページに出すか（無ければメモのページだけ） */
  place?: RefPlace;
}

export interface Backup {
  app: 'datum';
  version: 1;
  exportedAt: string;
  settings: Settings;
  days: DayRecord[];
  refs: RefTable[];
  foodbook?: Foodbook;
}
