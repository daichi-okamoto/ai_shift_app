介護シフト作成アプリ 要件定義

1. 目的 / 背景
* 介護施設（入所型）におけるシフト作成業務を効率化。
* 希望シフト提出や夜勤制約などを踏まえ、月/週/日単位、15分刻みで柔軟にシフト作成可能にする。
* AI（OpenAI API）による自動編成を導入し、公平性（夜勤や週末の偏り）をポイント制で可視化。

2. 対象範囲
* 対象：入所型介護施設（ユニットケアを含む）
* 粒度：事業所 > ユニット（例：1AB, 1CD, 2AB, 2CD, 2EF）

3. ユーザーロール & 権限
ロール	権限
管理者	全ユーザー・全シフトの閲覧/編集、事業所/ユニット作成、監査ログ管理
チームリーダー	担当ユニットのシフト作成、メンバー管理、AI編成実行、公開承認
一般ユーザー	自ユニットのシフト閲覧、希望提出、休暇申請
4. 業務要件
4.1 ユーザー/チーム管理
* ユニット作成・編集（管理者）
* ユニット所属管理（管理者/リーダー）
* ユーザー属性：雇用区分（正社員/パート/アルバイト）、夜勤可否、契約時間
4.2 シフト種別と制約
* シフト種類：早番 / 日勤 / 遅番 / 夜勤 / 休み
* 夜勤：16:30〜翌9:30（休憩90分、夜勤明け翌日は必ず休み）
* 最低配置：ユニットごとに1日4人（早/日/遅/夜勤 各1名）
* 任意時間（半日勤務など）も15分刻みで作成可能
4.3 希望シフト / 休暇
* 自動通知で提出依頼
* 締切後も変更可
* 代行入力不可
* 休暇申請は承認不要（自動反映）
4.4 作成方法
* 手動作成：ドラッグ&ドロップで割当
* AI作成：希望・制約を踏まえ自動ドラフト生成（OpenAI API）
* 公平性ポイントを算出し、夜勤や週末の偏りを可視化
4.5 出力 / 通知
* シフト公開/下書き管理
* Excel出力対応（インポート/エクスポート）
* Web/モバイル閲覧、通知（メール/アプリ内）

5. 非機能要件
* 端末対応：PC / タブレット / モバイル
* UI/UX：直感的操作（ドラッグ&ドロップ、カレンダーUI）
* セキュリティ：RBAC認証、SSL暗号化
* 可用性：高稼働率、障害時ログ保存

6. 技術要件
* バックエンド：Laravel 11
* フロントエンド：React + Tailwind CSS
* DB：MySQL
* AI連携：OpenAI API
* 出力形式：Excel / CSV / PDF

7. データモデル（概略）
* users：氏名、雇用区分、夜勤可否、契約時間
* teams（ユニット）：名称、所属メンバー
* shifts：日付、開始/終了、種別
* assignments：shift_id, user_id, 状態（下書き/確定）
* availability_requests：希望/休暇申請
* fairness_points：ユーザーごとの夜勤/週末偏りポイント

8. 次アクション
1. 画面遷移図・ワイヤーフレーム作成（ユニット/月間グリッド・日内15分編集・AIドラフト適用）
2. ER図ドラフト化（organizations/units/memberships/shifts/assignments/availability/fairness_points など）
3. Excel入出力フォーマット定義

9. 画面遷移図（ドラフト）
* ログイン画面 → 認証（管理者/リーダー/一般）
* ダッシュボード
    * 未提出希望、未充足シフト警告、公平ポイント状況
* 事業所/ユニット管理（管理者）
    * ユニット作成/編集、メンバー管理
* 希望提出画面（ユーザー）
    * カレンダー入力、提出状況
* シフト編集画面（リーダー/管理者）
    * 月/週/日ビュー切替
    * ドラッグ&ドロップ割当（15分刻み編集）
    * AIドラフト生成→修正
    * 公平ポイント表示
* 公開/通知画面
    * 下書き→承認→公開
    * Excel/CSV/PDF出力、Google/iCal連携
* 監査ログ画面（管理者）
    * 操作履歴、AI提案差分

10. ER図（ドラフト 概要）
* organizations（id, name）
* units（id, organization_id, name）
* users（id, name, role, employment_type, night_shift_flag, contract_hours）
* memberships（id, user_id, unit_id, role, display_order）
* shift_types（id, name, start_time, end_time, default_flag）
* shifts（id, unit_id, date, start_at, end_at, type_id）
* assignments（id, shift_id, user_id, status）
* availability_requests（id, user_id, unit_id, date, type, status）
* fairness_points（id, user_id, period, night_points, weekend_points, holiday_points, total）
* audit_logs（id, user_id, action, target, timestamp）

11. 公平ポイント初期ルール
* 夜勤 = 3pt
* 週末 = 1pt
* 祝日 = 1pt

勤務時刻・公平ポイント（確定）
* 早番: 07:00–15:45（休憩 60 分）
* 日勤: 08:30–17:15（休憩 60 分）
* 遅番: 11:45–20:30（休憩 60 分）
* 夜勤: 16:30–翌09:30（休憩 1.5h、明け翌日は休みを自動ブロック）
* 公平ポイント（初期配点）：夜勤=3pt、週末=1pt、祝日=1pt

画面遷移図（ドラフト）
flowchart LR
  A[ログイン/SSO] --> B[ダッシュボード]
  B --> C[ユニット管理]
  B --> D[希望提出（ユーザー）]
  B --> E[シフト編集: 月/週/日]
  E --> E1[日内15分エディタ]
  E --> E2[AIドラフト生成]
  E --> E3[チェック/警告表示]
  E --> F[公開/共有]
  B --> G[公平ポイント/集計]
  B --> H[エクスポート: Excel/CSV/PDF]
  B --> I[監査ログ]
  C --> E
  D --> E
  E2 --> E
  F --> J[通知: メール/カレンダー]

主要画面（ワイヤー要件）
* ダッシュボード：未充足枠、夜勤明け違反、提出率、ポイント偏り
* ユニット管理：並び順D&D、最低配置設定、勤務時刻設定
* 希望提出（ユーザー）：月カレンダー入力、締切/リマインド
* シフト編集：月/週グリッド + 日内15分ガント、D&D割当、フィルタ（雇用区分/夜勤可否）
* AIドラフト：制約確認→生成→差分適用→根拠表示
* 公開/共有：下書き/承認/公開、iCal/Google連携、Excel出力
* 公平ポイント：期間・個人別集計、補正ルール
* 監査ログ：操作履歴、ロールバック

ER 図（ドラフト）
erDiagram
  ORGANIZATIONS ||--o{ UNITS : has
  UNITS ||--o{ MEMBERSHIPS : has
  USERS ||--o{ MEMBERSHIPS : belongs
  UNITS ||--o{ SHIFT_TEMPLATES : has
  UNITS ||--o{ SHIFTS : has
  SHIFTS ||--o{ ASSIGNMENTS : has
  USERS ||--o{ ASSIGNMENTS : holds
  USERS ||--o{ AVAILABILITIES : submits
  UNITS ||--o{ COVERAGE_REQUIREMENTS : defines
  USERS ||--o{ FAIRNESS_POINTS : accumulates

  ORGANIZATIONS {
    int id PK
    string name
  }
  UNITS {
    int id PK
    int organization_id FK
    string name
    int display_order
  }
  USERS {
    int id PK
    string name
    enum employment_type  // fulltime/parttime/temporary
    bool can_night_shift
    int contract_minutes_per_week
    string email
  }
  MEMBERSHIPS {
    int id PK
    int unit_id FK
    int user_id FK
    enum role // admin/leader/member
    int display_order
  }
  SHIFT_TEMPLATES {
    int id PK
    int unit_id FK
    string name
    json pattern // day-of-week -> slots
  }
  SHIFTS {
    int id PK
    int unit_id FK
    date work_date
    time start_at
    time end_at
    enum type // early/day/late/night/off/custom
  }
  ASSIGNMENTS {
    int id PK
    int shift_id FK
    int user_id FK
    enum status // draft/final
    text note
  }
  AVAILABILITIES {
    int id PK
    int user_id FK
    int unit_id FK
    date work_date
    enum kind // wish/unavailable/vacation
    time start_at
    time end_at
    text reason
  }
  COVERAGE_REQUIREMENTS {
    int id PK
    int unit_id FK
    time start_at
    time end_at
    int required_count
    enum type // early/day/late/night
  }
  FAIRNESS_POINTS {
    int id PK
    int user_id FK
    date period_start
    date period_end
    int night_points
    int weekend_points
    int holiday_points
    int total_points
  }

テーブル定義（初版・抜粋）
* unit_settings（ユニット別の勤務時刻・最低配置）
    * unit_id FK
    * early_start/end, day_start/end, late_start/end, night_start/end (time)
    * night_break_minutes (int) = 90
    * min_early (int)=1, min_day (int)=1, min_late (int)=1, min_night (int)=1
    * rest_rule_after_night (bool)=true
* fairness_rules（事業所共通の配点）
    * organization_id FK
    * night_point=3, weekend_point=1, holiday_point=1
    * weighting_json（将来用）

次アクション
1. Excel 出力テンプレのサンプルをご提供ください（既存帳票に合わせます）
2. 画面ワイヤーフレーム（低忠実度）を順次作成
3. ER 図の正規化・命名最終化（enumの定義域、外部キー制約）
4. アラート/検証ルールの一覧化（夜勤明け休み、重複、日/週上限 等）

画面ワイヤーフレーム（低忠実度）
1) ダッシュボード
* ヘッダー：事業所・ユニット切替、期間切替（月/週/日）
* カード：
    * 未提出希望（人数/提出率、催促ボタン）
    * 未充足シフト（早/日/遅/夜ごとの不足数、ジャンプリンク）
    * 違反/警告（夜勤明け休み違反、重複、時間超過）
    * 公平ポイント偏り（上位/下位5名、期間フィルタ）
2) ユニット管理
* リスト：ユニット名、メンバー数、表示順 D&D
* 設定：勤務時刻（早/日/遅/夜 既定）、夜勤休憩90分、日勤系休憩60分、最低配置（早1/日1/遅1/夜1）
* メンバー：雇用区分・夜勤可否・契約時間、並び順 D&D
3) 希望提出（ユーザー）
* 月カレンダー：セルクリック→希望/不可/休暇の入力（時間は15分刻み）
* 右ペイン：既存シフト、コメント、提出状況
* 上部：提出/再提出、締切、自動リマインド設定
4) シフト編集（月/週/日）
* 左：メンバーリスト（雇用区分色、夜勤可否アイコン、ポイント）
* 中央：
    * 月：ユニット×日グリッド（早/日/遅/夜枠）
    * 週：日別×枠の充足バー
    * 日内15分：タイムライン（任意勤務の調整、中抜けも可）
* 右：枠情報（必要数、割当、エラー/警告、メモ）
* 「AIドラフト生成」：制約確認→生成→差分適用（採否メモ保存）
5) 公開/共有
* 下書き→承認→公開のステップバー
* 変更通知：メール/アプリ、iCal/Google 連携
* Excel/CSV/PDF 出力：帳票テンプレ選択、期間/ユニット指定
6) 監査ログ
* だれが/いつ/何を変更、AIプロンプト/提案/採否

処理フロー（AI編成）
sequenceDiagram
  participant L as リーダー
  participant API as Laravel API
  participant OPT as Optimizer(ILP/Heuristics)
  participant GPT as OpenAI

  L->>API: 期間/ユニット/制約でドラフト要求
  API->>OPT: ハード制約満たす初期割当を生成
  OPT-->>API: 初期割当 & 未充足/競合
  API->>GPT: 説明生成/改善提案（自然言語→構造）
  GPT-->>API: 説明/提案（JSON）
  API-->>L: 下書き案 + 差分/根拠/警告
  L->>API: 部分修正→確定→公開

Laravel 11 マイグレーション（ドラフト）
命名・型は MySQL 8.x 前提。enum は将来拡張を見据え string + チェックでも可。
// 2025_09_17_000001_create_organizations_table.php
Schema::create('organizations', function (Blueprint $table) {
    $table->id();
    $table->string('name');
    $table->timestamps();
});

// 2025_09_17_000002_create_units_table.php
Schema::create('units', function (Blueprint $table) {
    $table->id();
    $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
    $table->string('name');
    $table->unsignedInteger('display_order')->default(0);
    $table->timestamps();
});

// 2025_09_17_000003_create_users_table.php
Schema::create('users', function (Blueprint $table) {
    $table->id();
    $table->string('name');
    $table->string('email')->unique();
    $table->enum('role', ['admin','leader','member'])->default('member');
    $table->enum('employment_type', ['fulltime','parttime','temporary'])->default('fulltime');
    $table->boolean('can_night_shift')->default(true);
    $table->unsignedInteger('contract_minutes_per_week')->nullable();
    $table->string('password');
    $table->rememberToken();
    $table->timestamps();
});

// 2025_09_17_000004_create_memberships_table.php
Schema::create('memberships', function (Blueprint $table) {
    $table->id();
    $table->foreignId('unit_id')->constrained()->cascadeOnDelete();
    $table->foreignId('user_id')->constrained()->cascadeOnDelete();
    $table->enum('role', ['admin','leader','member'])->default('member');
    $table->unsignedInteger('display_order')->default(0);
    $table->timestamps();
    $table->unique(['unit_id','user_id']);
});

// 2025_09_17_000005_create_unit_settings_table.php
Schema::create('unit_settings', function (Blueprint $table) {
    $table->id();
    $table->foreignId('unit_id')->constrained()->cascadeOnDelete();
    $table->time('early_start')->default('07:00:00');
    $table->time('early_end')->default('15:45:00');
    $table->time('day_start')->default('08:30:00');
    $table->time('day_end')->default('17:15:00');
    $table->time('late_start')->default('11:45:00');
    $table->time('late_end')->default('20:30:00');
    $table->time('night_start')->default('16:30:00');
    $table->time('night_end')->default('09:30:00');
    $table->unsignedSmallInteger('daytime_break_minutes')->default(60); // ★ 60分
    $table->unsignedSmallInteger('night_break_minutes')->default(90);
    $table->unsignedTinyInteger('min_early')->default(1);
    $table->unsignedTinyInteger('min_day')->default(1);
    $table->unsignedTinyInteger('min_late')->default(1);
    $table->unsignedTinyInteger('min_night')->default(1);
    $table->boolean('rest_rule_after_night')->default(true);
    $table->timestamps();
});

// 2025_09_17_000006_create_shift_types_table.php
Schema::create('shift_types', function (Blueprint $table) {
    $table->id();
    $table->string('name'); // early/day/late/night/off/custom
    $table->boolean('is_default')->default(false);
    $table->timestamps();
});

// 2025_09_17_000007_create_shifts_table.php
Schema::create('shifts', function (Blueprint $table) {
    $table->id();
    $table->foreignId('unit_id')->constrained()->cascadeOnDelete();
    $table->date('work_date');
    $table->time('start_at');
    $table->time('end_at');
    $table->foreignId('type_id')->nullable()->constrained('shift_types')->nullOnDelete();
    $table->boolean('is_published')->default(false);
    $table->timestamps();
    $table->index(['unit_id','work_date']);
});

// 2025_09_17_000008_create_assignments_table.php
Schema::create('assignments', function (Blueprint $table) {
    $table->id();
    $table->foreignId('shift_id')->constrained()->cascadeOnDelete();
    $table->foreignId('user_id')->constrained()->cascadeOnDelete();
    $table->enum('status', ['draft','final'])->default('draft');
    $table->text('note')->nullable();
    $table->timestamps();
    $table->unique(['shift_id','user_id']);
});

// 2025_09_17_000009_create_availabilities_table.php
Schema::create('availabilities', function (Blueprint $table) {
    $table->id();
    $table->foreignId('user_id')->constrained()->cascadeOnDelete();
    $table->foreignId('unit_id')->constrained()->cascadeOnDelete();
    $table->date('work_date');
    $table->enum('kind', ['wish','unavailable','vacation']);
    $table->time('start_at')->nullable();
    $table->time('end_at')->nullable();
    $table->text('reason')->nullable();
    $table->timestamps();
    $table->index(['unit_id','work_date']);
});

// 2025_09_17_000010_create_coverage_requirements_table.php
Schema::create('coverage_requirements', function (Blueprint $table) {
    $table->id();
    $table->foreignId('unit_id')->constrained()->cascadeOnDelete();
    $table->time('start_at');
    $table->time('end_at');
    $table->unsignedTinyInteger('required_count');
    $table->enum('type', ['early','day','late','night']);
    $table->timestamps();
});

// 2025_09_17_000011_create_fairness_rules_table.php
Schema::create('fairness_rules', function (Blueprint $table) {
    $table->id();
    $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
    $table->unsignedTinyInteger('night_point')->default(3);
    $table->unsignedTinyInteger('weekend_point')->default(1);
    $table->unsignedTinyInteger('holiday_point')->default(1);
    $table->json('weighting')->nullable();
    $table->timestamps();
});

// 2025_09_17_000012_create_fairness_points_table.php
Schema::create('fairness_points', function (Blueprint $table) {
    $table->id();
    $table->foreignId('user_id')->constrained()->cascadeOnDelete();
    $table->date('period_start');
    $table->date('period_end');
    $table->integer('night_points')->default(0);
    $table->integer('weekend_points')->default(0);
    $table->integer('holiday_points')->default(0);
    $table->integer('total_points')->default(0);
    $table->timestamps();
    $table->unique(['user_id','period_start','period_end']);
});

// 2025_09_17_000013_create_audit_logs_table.php
Schema::create('audit_logs', function (Blueprint $table) {
    $table->id();
    $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
    $table->string('action');
    $table->string('target_type');
    $table->unsignedBigInteger('target_id');
    $table->json('meta')->nullable();
    $table->timestamps();
    $table->index(['target_type','target_id']);
});
モデル関係（抜粋）
* Organization hasMany Unit
* Unit hasMany Shift, hasMany Membership, hasOne UnitSetting
* User hasMany Membership, hasMany Assignment, hasMany Availability
* Shift belongsTo Unit, hasMany Assignment
* Assignment belongsTo Shift & User

検証・アラート（詳細）
* 最低配置：各日で早/日/遅/夜の割当が最低1名
* 夜勤明け休み：夜勤担当者の翌日は自動休み（割当禁止）
* 重複：同一ユーザーの時間帯重複検出（15分スロットで検査）
* 時間上限：日/週の実働合計が契約時間や就業規則を超えない
* 休憩：日勤系は 60 分、夜勤は 90 分を実働から控除（レポート計算）

公平ポイント集計（ロジック）
* 期間：月次（1日〜末日）を基本、週次オプション
* 加点条件：
    * 夜勤：+night_point（例 3）
    * 週末（土日）：+weekend_point（例 1）
    * 祝日（JPカレンダー）：+holiday_point（例 1）
* 集計式：total = night_points + weekend_points + holiday_points
* レポート：個人・ユニット・事業所で比較、偏りが大きい場合は AI が調整提案

次アクション（更新）
1. Excel 出力テンプレの共有（既存帳票があれば最優先で合わせます）
2. 低忠実度ワイヤーの画面別詳細（コンポーネント構成、D&D挙動）
3. マイグレーション命名/enumの最終確認 → 実装着手
4. 祝日カレンダー（JP）の取り込み方式決定（固定テーブル or API）
