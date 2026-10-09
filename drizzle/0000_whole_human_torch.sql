CREATE TABLE `companies` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`matrix_name` text,
	`slug` text NOT NULL,
	`sector` text NOT NULL,
	`sector_raw` text,
	`region` text NOT NULL,
	`stage` text,
	`status` text NOT NULL,
	`website` text,
	`linkedin_url` text,
	`hq` text,
	`employees` integer,
	`logo_url` text,
	`brand_tokens` text NOT NULL,
	`b_capital_fund` text,
	`b_capital_role` text NOT NULL,
	`b_capital_round` text,
	`estimated_ticket_size_usd` real,
	`estimated_ownership_pct` real,
	`estimate_confidence` text NOT NULL,
	`estimate_rationale` text NOT NULL,
	`latest_news` text NOT NULL,
	`sentiment` text NOT NULL,
	`sources` text NOT NULL,
	`screenshot_ref` text,
	`anon_resolution` text,
	`is_focus` integer DEFAULT false NOT NULL,
	`in_brand_matrix` integer DEFAULT true NOT NULL,
	`last_checked` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `companies_slug_uq` ON `companies` (`slug`);--> statement-breakpoint
CREATE INDEX `companies_sector_idx` ON `companies` (`sector`);--> statement-breakpoint
CREATE INDEX `companies_region_idx` ON `companies` (`region`);--> statement-breakpoint
CREATE INDEX `companies_role_idx` ON `companies` (`b_capital_role`);--> statement-breakpoint
CREATE TABLE `ingest_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`workflow_id` text,
	`workflow_name` text,
	`execution_id` text,
	`model` text,
	`companies_touched` integer DEFAULT 0 NOT NULL,
	`news_upserted` integer DEFAULT 0 NOT NULL,
	`sentiment_rows` integer DEFAULT 0 NOT NULL,
	`status` text NOT NULL,
	`errors` text NOT NULL,
	`raw_sample` text,
	`received_at` text NOT NULL,
	`finished_at` text
);
--> statement-breakpoint
CREATE TABLE `news_items` (
	`id` text PRIMARY KEY NOT NULL,
	`company_slug` text NOT NULL,
	`title` text NOT NULL,
	`url` text,
	`source` text,
	`kind` text DEFAULT 'news' NOT NULL,
	`published_at` text,
	`summary` text,
	`image_url` text,
	`sentiment_score` real,
	`ingest_run_id` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `news_company_idx` ON `news_items` (`company_slug`);--> statement-breakpoint
CREATE INDEX `news_published_idx` ON `news_items` (`published_at`);--> statement-breakpoint
CREATE TABLE `sector_rollups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`scope` text NOT NULL,
	`key` text NOT NULL,
	`company_count` integer NOT NULL,
	`avg_score` real NOT NULL,
	`label` text NOT NULL,
	`delta` real,
	`top_movers` text NOT NULL,
	`ingest_run_id` text,
	`computed_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rollup_scope_key_idx` ON `sector_rollups` (`scope`,`key`,`computed_at`);--> statement-breakpoint
CREATE TABLE `sentiment_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`company_slug` text NOT NULL,
	`score` real NOT NULL,
	`label` text NOT NULL,
	`evidence` text NOT NULL,
	`delta` real,
	`model` text,
	`workflow_id` text,
	`execution_id` text,
	`ingest_run_id` text,
	`recorded_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sent_hist_company_idx` ON `sentiment_history` (`company_slug`,`recorded_at`);