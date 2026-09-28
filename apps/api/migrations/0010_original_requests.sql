CREATE TABLE `original_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`episode_id` text NOT NULL,
	`documentary_id` text NOT NULL,
	`moment_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`state` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`episode_id`) REFERENCES `episodes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `original_requests_episode_asset_idx` ON `original_requests` (`episode_id`,`asset_id`);--> statement-breakpoint
CREATE INDEX `original_requests_asset_idx` ON `original_requests` (`asset_id`);