CREATE TABLE `attendance` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`user_id` text NOT NULL,
	`student_id` text NOT NULL,
	`name` text NOT NULL,
	`group_name` text NOT NULL,
	`checked_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attendance_student` ON `attendance` (`session_id`,`student_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `attendance_account` ON `attendance` (`session_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`title` text NOT NULL,
	`group_name` text NOT NULL,
	`secret` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`closed` integer DEFAULT 0 NOT NULL
);
