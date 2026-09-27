CREATE TABLE `uploads` (
	`asset_id` text NOT NULL,
	`purpose` text NOT NULL,
	`documentary_id` text NOT NULL,
	`upload_id` text NOT NULL,
	`key` text NOT NULL,
	`bytes` integer NOT NULL,
	`part_count` integer NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`asset_id`, `purpose`),
	FOREIGN KEY (`documentary_id`) REFERENCES `documentaries`(`id`) ON UPDATE no action ON DELETE cascade
);
