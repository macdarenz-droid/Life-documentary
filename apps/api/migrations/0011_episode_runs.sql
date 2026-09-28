CREATE TABLE `episode_runs` (
	`documentary_id` text NOT NULL,
	`week_start` text NOT NULL,
	`episode_id` text,
	`started_at` text NOT NULL,
	`understood_at` text,
	`planned_at` text,
	`narrated_at` text,
	`render_started_at` text,
	`delivered_at` text,
	`due_at` text NOT NULL,
	`outcome` text,
	`originals_asked` integer,
	`originals_received` integer,
	PRIMARY KEY(`documentary_id`, `week_start`)
);
