CREATE TABLE `narration_clips` (
	`episode_id` text NOT NULL,
	`plan_version` integer NOT NULL,
	`index` integer NOT NULL,
	`kind` text NOT NULL,
	`scene_index` integer,
	`text` text NOT NULL,
	`voice_id` text NOT NULL,
	`key` text NOT NULL,
	`hash` text NOT NULL,
	`duration_ms` integer NOT NULL,
	`words` text NOT NULL,
	`kept` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`episode_id`) REFERENCES `episodes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `narration_clips_episode_version_index_idx` ON `narration_clips` (`episode_id`,`plan_version`,`index`);--> statement-breakpoint
CREATE INDEX `narration_clips_episode_hash_idx` ON `narration_clips` (`episode_id`,`hash`);