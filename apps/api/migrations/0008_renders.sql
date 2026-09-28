CREATE TABLE `renders` (
	`id` text PRIMARY KEY NOT NULL,
	`episode_id` text NOT NULL,
	`plan_version` integer NOT NULL,
	`render_version` integer NOT NULL,
	`format` text NOT NULL,
	`vendor_render_id` text,
	`bucket` text,
	`out_key` text NOT NULL,
	`duration_ms` integer NOT NULL,
	`state` text NOT NULL,
	`reason` text,
	`cost_micro_usd` integer,
	`started_at` text NOT NULL,
	`finished_at` text,
	FOREIGN KEY (`episode_id`) REFERENCES `episodes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `renders_episode_version_format_idx` ON `renders` (`episode_id`,`render_version`,`format`);