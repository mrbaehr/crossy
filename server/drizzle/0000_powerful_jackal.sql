CREATE TABLE `cell` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`puzzle_id` integer NOT NULL,
	`row` integer NOT NULL,
	`col` integer NOT NULL,
	`letter` text,
	`is_block` integer DEFAULT false NOT NULL,
	`rebus` text,
	`is_circled` integer DEFAULT false NOT NULL,
	`is_shaded` integer DEFAULT false NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`puzzle_id`) REFERENCES `puzzle`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `cell_puzzle_idx` ON `cell` (`puzzle_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `cell_puzzle_rc` ON `cell` (`puzzle_id`,`row`,`col`);--> statement-breakpoint
CREATE TABLE `clue_bank` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`answer` text NOT NULL,
	`clue_text` text NOT NULL,
	`source_puzzle_id` integer,
	`author_user_id` integer,
	`author_kind` text DEFAULT 'user' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`source_puzzle_id`) REFERENCES `puzzle`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`author_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `clue_bank_answer_idx` ON `clue_bank` (`answer`);--> statement-breakpoint
CREATE TABLE `clue_draft` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entry_id` integer NOT NULL,
	`text` text NOT NULL,
	`author_user_id` integer,
	`author_kind` text DEFAULT 'user' NOT NULL,
	`is_chosen` integer DEFAULT false NOT NULL,
	`both_approved` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`entry_id`) REFERENCES `entry`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `clue_draft_entry_idx` ON `clue_draft` (`entry_id`);--> statement-breakpoint
CREATE TABLE `entry` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`puzzle_id` integer NOT NULL,
	`direction` text NOT NULL,
	`number` integer NOT NULL,
	`cells` text NOT NULL,
	`is_theme` integer DEFAULT false NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`puzzle_id`) REFERENCES `puzzle`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `entry_puzzle_idx` ON `entry` (`puzzle_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `entry_puzzle_dir_num` ON `entry` (`puzzle_id`,`direction`,`number`);--> statement-breakpoint
CREATE TABLE `membership` (
	`user_id` integer NOT NULL,
	`puzzle_id` integer NOT NULL,
	`role` text DEFAULT 'collaborator' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`user_id`, `puzzle_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`puzzle_id`) REFERENCES `puzzle`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `note` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`puzzle_id` integer,
	`entry_id` integer,
	`author_user_id` integer,
	`body` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`puzzle_id`) REFERENCES `puzzle`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`entry_id`) REFERENCES `entry`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `note_puzzle_idx` ON `note` (`puzzle_id`);--> statement-breakpoint
CREATE INDEX `note_entry_idx` ON `note` (`entry_id`);--> statement-breakpoint
CREATE TABLE `puzzle` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`symmetry_enabled` integer DEFAULT true NOT NULL,
	`status` text DEFAULT 'idea' NOT NULL,
	`last_edited_by` integer,
	`last_edited_at` integer DEFAULT (unixepoch()) NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`last_edited_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `snapshot` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`puzzle_id` integer NOT NULL,
	`name` text NOT NULL,
	`parent_snapshot_id` integer,
	`state` text NOT NULL,
	`created_by_user_id` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`puzzle_id`) REFERENCES `puzzle`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `snapshot_puzzle_idx` ON `snapshot` (`puzzle_id`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`full_name` text,
	`last_name` text,
	`address` text,
	`email` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_username_unique` ON `user` (`username`);