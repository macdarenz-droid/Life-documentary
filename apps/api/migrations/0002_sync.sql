CREATE TABLE `cast_members` (
	`id` text PRIMARY KEY NOT NULL,
	`documentary_id` text NOT NULL,
	`name` text NOT NULL,
	`relation` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`documentary_id`) REFERENCES `documentaries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `cast_members_documentary_idx` ON `cast_members` (`documentary_id`);--> statement-breakpoint
CREATE TABLE `change_log` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`documentary_id` text NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`documentary_id`) REFERENCES `documentaries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `change_log_documentary_seq_idx` ON `change_log` (`documentary_id`,`seq`);--> statement-breakpoint
CREATE TABLE `media_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`documentary_id` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`kind` text NOT NULL,
	`duration_ms` integer,
	`width` integer,
	`height` integer,
	`bytes` integer NOT NULL,
	`sha256` text NOT NULL,
	`cloud_key` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`documentary_id`) REFERENCES `documentaries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `media_assets_documentary_idx` ON `media_assets` (`documentary_id`);--> statement-breakpoint
CREATE TABLE `moments` (
	`id` text PRIMARY KEY NOT NULL,
	`documentary_id` text NOT NULL,
	`author_user_id` text NOT NULL,
	`captured_at` text NOT NULL,
	`time_zone` text NOT NULL,
	`kind` text NOT NULL,
	`question_id` text,
	`media_asset_id` text,
	`text` text,
	`mood` text,
	`place_name` text,
	`local_only` integer NOT NULL,
	`storyline_ids` text NOT NULL,
	`cast_ids` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`documentary_id`) REFERENCES `documentaries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `moments_documentary_idx` ON `moments` (`documentary_id`);--> statement-breakpoint
CREATE TABLE `questions` (
	`id` text PRIMARY KEY NOT NULL,
	`documentary_id` text NOT NULL,
	`template_id` text NOT NULL,
	`reason` text NOT NULL,
	`asked_on` text NOT NULL,
	`storyline_id` text,
	`text` text NOT NULL,
	`answered_by_moment_id` text,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`documentary_id`) REFERENCES `documentaries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `questions_documentary_idx` ON `questions` (`documentary_id`);--> statement-breakpoint
CREATE TABLE `storylines` (
	`id` text PRIMARY KEY NOT NULL,
	`documentary_id` text NOT NULL,
	`title` text NOT NULL,
	`opened_at` text NOT NULL,
	`closed_at` text,
	`summary` text,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`documentary_id`) REFERENCES `documentaries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `storylines_documentary_idx` ON `storylines` (`documentary_id`);