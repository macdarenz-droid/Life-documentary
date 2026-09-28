CREATE TABLE `episode_edits` (
	`id` text PRIMARY KEY NOT NULL,
	`episode_id` text NOT NULL,
	`seq` integer NOT NULL,
	`applied_to_version` integer NOT NULL,
	`result_version` integer NOT NULL,
	`change` text NOT NULL,
	`local_day` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`episode_id`) REFERENCES `episodes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `episode_edits_episode_seq_idx` ON `episode_edits` (`episode_id`,`seq`);--> statement-breakpoint
CREATE INDEX `episode_edits_episode_day_idx` ON `episode_edits` (`episode_id`,`local_day`);