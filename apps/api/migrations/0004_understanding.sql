CREATE TABLE `cost_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`episode_id` text NOT NULL,
	`step` text NOT NULL,
	`provider` text NOT NULL,
	`unit` text NOT NULL,
	`units` integer NOT NULL,
	`micro_usd` integer NOT NULL,
	`at` text NOT NULL,
	FOREIGN KEY (`episode_id`) REFERENCES `episodes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cost_ledger_episode_step_unit_idx` ON `cost_ledger` (`episode_id`,`step`,`unit`);--> statement-breakpoint
CREATE TABLE `derived` (
	`id` text PRIMARY KEY NOT NULL,
	`documentary_id` text NOT NULL,
	`moment_id` text NOT NULL,
	`transcript` text,
	`caption` text,
	`language` text NOT NULL,
	`provider` text NOT NULL,
	`model_version` text NOT NULL,
	`produced_at` text NOT NULL,
	FOREIGN KEY (`documentary_id`) REFERENCES `documentaries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`moment_id`) REFERENCES `moments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `derived_moment_provider_idx` ON `derived` (`moment_id`,`provider`);--> statement-breakpoint
CREATE TABLE `episodes` (
	`id` text PRIMARY KEY NOT NULL,
	`documentary_id` text NOT NULL,
	`number` integer NOT NULL,
	`week_start` text NOT NULL,
	`week_end` text NOT NULL,
	`state` text NOT NULL,
	`plan_version` integer NOT NULL,
	`render_version` integer NOT NULL,
	`mp4_key` text,
	`poster_key` text,
	`duration_ms` integer,
	`cost_cents` integer NOT NULL,
	`summary` text,
	`delivered_at` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`documentary_id`) REFERENCES `documentaries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `episodes_documentary_week_idx` ON `episodes` (`documentary_id`,`week_start`);