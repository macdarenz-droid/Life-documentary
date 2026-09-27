CREATE TABLE `episode_plans` (
	`episode_id` text NOT NULL,
	`version` integer NOT NULL,
	`plan` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`episode_id`) REFERENCES `episodes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `episode_plans_episode_version_idx` ON `episode_plans` (`episode_id`,`version`);