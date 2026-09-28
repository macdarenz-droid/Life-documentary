CREATE TABLE `recut_narration` (
	`episode_id` text NOT NULL,
	`plan_version` integer NOT NULL,
	`characters` integer NOT NULL,
	FOREIGN KEY (`episode_id`) REFERENCES `episodes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recut_narration_episode_version_idx` ON `recut_narration` (`episode_id`,`plan_version`);--> statement-breakpoint
ALTER TABLE `episodes` ADD `recut_state` text;--> statement-breakpoint
ALTER TABLE `episodes` ADD `recut_run` text;